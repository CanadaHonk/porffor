import process from './process.js';
import { Buffer } from './buffer.js';
import { DOMException } from './internal/domexception.js';
import { errNotBuildingSnapshot } from './internal/errors.js';

// porffor has one heap, measured by the process' resident size
const heapSizeLimit = 4 * 1024 ** 3;

export const getHeapStatistics = () => {
  const rss = process.memoryUsage.rss();
  return {
    total_heap_size: rss, total_heap_size_executable: 0, total_physical_size: rss, total_available_size: heapSizeLimit - rss, used_heap_size: rss,
    heap_size_limit: heapSizeLimit, malloced_memory: 0, peak_malloced_memory: 0, does_zap_garbage: 0, number_of_native_contexts: 1,
    number_of_detached_contexts: 0, total_global_handles_size: 0, used_global_handles_size: 0, external_memory: 0
  };
};

const cloneError = message => new DOMException(message, 'DataCloneError');

// objects that don't clone: ports (unless transferred) and markAsUncloneable's
export const uncloneable = new WeakSet();

const views = [ Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView ];
const errors = [ Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError ];

// structured clones as json: values json can't hold are tagged, repeat objects refer back, transferred ports go by index
export const encodeClone = (value, refs = new Map(), ports = []) => {
  if (value === undefined) return { $: 'u' };
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0) ? value : { $: 'n', v: Object.is(value, -0) ? '-0' : String(value) };
  if (typeof value === 'bigint') return { $: 'b', v: String(value) };
  if (typeof value === 'function' || typeof value === 'symbol') throw cloneError(`${String(value)} could not be cloned.`);
  if (value === null || typeof value !== 'object') return value;
  if (ports.includes(value)) return { $: 'p', v: ports.indexOf(value) };
  if (uncloneable.has(value)) throw cloneError('An object could not be cloned.');
  if (refs.has(value)) return { $: 'ref', v: refs.get(value) };
  refs.set(value, refs.size);

  const inner = x => encodeClone(x, refs, ports);
  if (Array.isArray(value)) return { $: 'a', v: value.map(inner) };
  if (value instanceof Date) return { $: 'd', v: inner(value.getTime()) };
  if (value instanceof RegExp) return { $: 'r', v: value.source, f: value.flags };
  if (value instanceof Map) return { $: 'm', v: [ ...value ].map(([ k, v ]) => [ inner(k), inner(v) ]) };
  if (value instanceof Set) return { $: 's', v: [ ...value ].map(inner) };
  // a SharedArrayBuffer crosses as a copy: processes share no memory
  if (value instanceof ArrayBuffer || value instanceof SharedArrayBuffer) return { $: 't', c: value.constructor.name, v: Buffer.from(value).toString('base64') };
  if (ArrayBuffer.isView(value)) return { $: 't', c: value instanceof Buffer ? 'Buffer' : value.constructor.name, v: Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64') };
  if (value instanceof Error) return { $: 'e', n: value.name, m: value.message, s: value.stack, c: 'cause' in value ? inner(value.cause) : undefined };

  const out = {};
  for (const key of Object.keys(value)) Object.defineProperty(out, key, { value: inner(value[key]), writable: true, enumerable: true, configurable: true });
  return { $: 'o', v: out };
};

// buffers: Buffers stay Buffers (child_process, v8), else they come back as Uint8Arrays (worker_threads)
export const decodeClone = (x, refs = [], ports = [], buffers = false) => {
  if (x === null || typeof x !== 'object') return x;
  const inner = v => decodeClone(v, refs, ports, buffers);
  let out;
  switch (x.$) {
    case 'u': return undefined;
    case 'n': return Number(x.v);
    case 'b': return BigInt(x.v);
    case 'ref': return refs[x.v];
    case 'p': return ports[x.v];
    case 'a':
      refs.push(out = []);
      for (const v of x.v) out.push(inner(v));
      return out;
    case 'o':
      refs.push(out = {});
      for (const key of Object.keys(x.v)) Object.defineProperty(out, key, { value: inner(x.v[key]), writable: true, enumerable: true, configurable: true });
      return out;
    case 'm':
      refs.push(out = new Map());
      for (const [ k, v ] of x.v) out.set(inner(k), inner(v));
      return out;
    case 's':
      refs.push(out = new Set());
      for (const v of x.v) out.add(inner(v));
      return out;
    case 'd':
      out = new Date(inner(x.v));
      break;
    case 'r':
      out = new RegExp(x.v, x.f);
      break;
    case 't': {
      const bytes = Buffer.from(x.v, 'base64');
      if (x.c === 'Buffer' && buffers) {
        out = bytes;
        break;
      }
      const buffer = x.c === 'SharedArrayBuffer' ? new SharedArrayBuffer(bytes.length) : new ArrayBuffer(bytes.length);
      new Uint8Array(buffer).set(bytes);
      out = x.c === 'ArrayBuffer' || x.c === 'SharedArrayBuffer' ? buffer : x.c === 'Buffer' ? new Uint8Array(buffer) : new (views.find(C => C.name === x.c))(buffer);
      break;
    }
    case 'e': {
      const Ctor = errors.find(C => C.name === x.n);
      refs.push(out = new (Ctor ?? Error)(x.m));
      if (!Ctor) out.name = x.n;
      Object.defineProperty(out, 'stack', { value: x.s, writable: true, configurable: true });
      if (x.c !== undefined) out.cause = inner(x.c);
      return out;
    }
  }
  refs.push(out);
  return out;
};

// structured clone bytes, though not v8's wire format: only porffor reads them back
export const serialize = value => Buffer.from(JSON.stringify(encodeClone(value)));
export const deserialize = buffer => decodeClone(JSON.parse(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength).toString()), [], [], true);

const notBuilding = () => {
  throw errNotBuildingSnapshot();
};

export const startupSnapshot = {
  isBuildingSnapshot: () => false,
  addSerializeCallback: notBuilding,
  addDeserializeCallback: notBuilding,
  setDeserializeMainFunction: notBuilding
};

export default { getHeapStatistics, serialize, deserialize, startupSnapshot };
