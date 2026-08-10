
import { TYPES, TYPE_NAMES } from './types.js';
import { K, T } from './ir.js';
import { ieee754_binary64 } from './encoding.js';

import process from 'node:process';
globalThis.process = process;

import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
globalThis.precompileCompilerPath = __dirname;
globalThis.precompile = true;

const argv = process.argv.slice();
const timing = {};
let defaultPrefs = null;

const compile = async (file, _funcs) => {
  let source = fs.readFileSync(file, 'utf8');
  let first = source.slice(0, source.indexOf('\n'));

  if (first.startsWith('export default')) {
    source = await (await import('file://' + file)).default({ TYPES, TYPE_NAMES });
    first = source.slice(0, source.indexOf('\n'));
  }

  let args = ['--module', '--fast-length', '--parse-types', '--opt-types', '--no-closures', '--never-fallback-builtin-proto', '--no-ic'];
  if (!defaultPrefs) {
    process.argv = argv.concat(args);
    globalThis.argvChanged?.();
    defaultPrefs = globalThis.Prefs;
  }
  if (first.startsWith('// @porf')) args = args.concat(first.slice('// @porf '.length).split(' '));
  process.argv = argv.concat(args);
  globalThis.argvChanged?.();

  globalThis.file = file;
  const porfCompile = (await import(`./index.js?_=${Date.now()}`)).default;

  const { funcs, data, times } = porfCompile(source);
  const funcsByIndex = new Map();
  for (const f of funcs) if (f) funcsByIndex.set(f.index, f);

  timing.parse = (timing.parse ?? 0) + (times[1] - times[0]);
  timing.codegen = (timing.codegen ?? 0) + (times[2] - times[1]);

  const remapCallTargets = (node, owner) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.length === 6 && node[0] === K.Call && typeof node[3] === 'number') {
        const target = funcsByIndex.get(node[3]);
        if (!target?.name) throw new Error(`${owner}: missing precompiled call target ${node[3]}`);
        node[3] = target.name;
      }
      for (const x of node) remapCallTargets(x, owner);
      return;
    }

    for (const x of Object.values(node)) remapCallTargets(x, owner);
  };

  const collectDataRefs = (node, refs) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.length === 6 && node[0] === K.DataRef) refs.add(node[3]);
      for (const x of node) collectDataRefs(x, refs);
      return;
    }

    for (const x of Object.values(node)) collectDataRefs(x, refs);
  };
  const collectFuncDataRefs = (node, refs) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (
        node.length === 6 &&
        node[0] === K.Box &&
        Array.isArray(node[3]) && node[3][0] === K.DataRef &&
        Array.isArray(node[4]) && node[4][0] === K.Const && node[4][3] === TYPES.function
      ) {
        const id = node[3][3];
        const bytes = data[id];
        const idx = bytes?.[0] | (bytes?.[1] << 8) | (bytes?.[2] << 16) | (bytes?.[3] << 24);
        const env = bytes?.[4] | (bytes?.[5] << 8) | (bytes?.[6] << 16) | (bytes?.[7] << 24);
        const target = funcsByIndex.get(idx);
        if (!target?.name || env !== 0) throw new Error(`invalid precompiled function ref data ${id}`);
        refs[id] = target.name;
      }
      for (const x of node) collectFuncDataRefs(x, refs);
      return;
    }

    for (const x of Object.values(node)) collectFuncDataRefs(x, refs);
  };
  const collectFuncIndexRefs = (node, refs) => {
    if (!Array.isArray(node)) return;
    for (let i = 0; i < node.length; i++) {
      const stmt = node[i];
      if (
        Array.isArray(stmt) &&
        stmt.length === 6 &&
        stmt[0] === K.Assign &&
        Array.isArray(stmt[3]) && stmt[3][0] === K.Local &&
        Array.isArray(stmt[4]) && stmt[4][0] === K.Alloc &&
        stmt[4][4] === TYPES.function &&
        Array.isArray(stmt[4][3]) && stmt[4][3][0] === K.Const && stmt[4][3][3] === 8
      ) {
        const localName = stmt[3][3];
        const next = node[i + 1];
        const value = next?.[5]?.[2];
        if (
          Array.isArray(next) &&
          next.length === 6 &&
          next[0] === K.Store &&
          next[3] === 'u32' &&
          Array.isArray(next[4]) && next[4][0] === K.Local && next[4][3] === localName &&
          Array.isArray(next[5]) && next[5][0] === 0 &&
          Array.isArray(value) && value[0] === K.Const && value[1] === T.u32
        ) {
          const target = funcsByIndex.get(value[3]);
          if (!target?.name) throw new Error(`invalid precompiled function index ${value[3]}`);
          refs[value[3]] = target.name;
        }
      }

      collectFuncIndexRefs(stmt, refs);
    }
  };
  const collectGlobalRefs = (node, refs) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      if (node.length === 6 && node[0] === K.Global) refs.add(node[3]);
      for (const x of node) collectGlobalRefs(x, refs);
      return;
    }

    for (const x of Object.values(node)) collectGlobalRefs(x, refs);
  };

  const exports = funcs.filter(x => x && x.export && x.name !== '#main');
  const main = funcs.find(x => x?.name === '#main');
  const globalInits = Object.create(null);
  for (const stmt of main?.body ?? []) {
    if (Array.isArray(stmt) && stmt[0] === K.Assign && Array.isArray(stmt[3]) && stmt[3][0] === K.Global) {
      globalInits[stmt[3][3]] = stmt;
    }
  }
  for (const x of exports) {
    if (x.name === '_eval') x.name = 'eval';
    if (Object.keys(globalInits).length !== 0) {
      const globalRefs = new Set();
      collectGlobalRefs(x.body, globalRefs);
      for (const name of globalRefs) {
        if (globalInits[name]) (x.globalInits ??= Object.create(null))[name] = globalInits[name];
      }
    }
    remapCallTargets(x.body, x.name);
    if (x.globalInits) for (const name in x.globalInits) remapCallTargets(x.globalInits[name], x.name);

    // keep referenced data segments with the body so DataRef ids remap into the user compile's arena
    const dataRefs = new Set();
    collectDataRefs(x.body, dataRefs);
    if (x.globalInits) for (const name in x.globalInits) collectDataRefs(x.globalInits[name], dataRefs);
    if (dataRefs.size !== 0) {
      x.data = {};
      for (const i of dataRefs) {
        if (!data[i]) throw new Error(`${x.name}: missing data segment ${i}`);
        x.data[i] = data[i];
      }
    }
    const funcData = {};
    collectFuncDataRefs(x.body, funcData);
    if (x.globalInits) for (const name in x.globalInits) collectFuncDataRefs(x.globalInits[name], funcData);
    if (Object.keys(funcData).length !== 0) x.funcData = funcData;
    const funcRefs = {};
    collectFuncIndexRefs(x.body, funcRefs);
    if (x.globalInits) for (const name in x.globalInits) collectFuncIndexRefs(x.globalInits[name], funcRefs);
    if (Object.keys(funcRefs).length !== 0) x.funcRefs = funcRefs;
  }
  _funcs.push(...exports);
};

// IR to token stream: tags are non-base36 chars so they can't collide with bare integer tokens, unflatten is
// the build-time roundtrip mirror (the runtime one is emitted into builtins_precompiled.js)
const F64_HEX = v => ieee754_binary64(v).map(x => x.toString(16).padStart(2, '0')).join('');
const fromF64Hex = hex => {
  const b = new Uint8Array(8);
  for (let i = 0; i < 8; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new Float64Array(b.buffer)[0];
};

const newIntern = () => {
  const strings = [];
  const ids = new Map();
  return {
    strings,
    intern: v => {
      let id = ids.get(v);
      if (id == null) { id = strings.length; ids.set(v, id); strings.push(v); }
      return id;
    }
  };
};

const flatten = (value, out, intern) => {
  if (value === null) { out.push('_'); return; }
  if (value === undefined) { out.push('U'); return; }
  if (value === true) { out.push('T'); return; }
  if (value === false) { out.push('F'); return; }
  const t = typeof value;
  if (t === 'string') { out.push('@' + intern(value).toString(36)); return; }
  if (t === 'bigint') { out.push('B' + intern(value.toString()).toString(36)); return; }
  if (t === 'number') {
    if (Number.isInteger(value) && Number.isSafeInteger(value) && !Object.is(value, -0)) out.push(value.toString(36));
    else out.push('D' + F64_HEX(value));
    return;
  }
  if (Array.isArray(value)) {
    out.push('A' + value.length.toString(36));
    for (const x of value) flatten(x, out, intern);
    return;
  }
  const keys = Object.keys(value);
  out.push('O' + keys.length.toString(36));
  for (const k of keys) { out.push('@' + intern(k).toString(36)); flatten(value[k], out, intern); }
};

const unflatten = (cur, strings) => {
  const tok = cur.tokens[cur.i++];
  const tag = tok[0];
  if (tag === '_') return null;
  if (tag === 'U') return undefined;
  if (tag === 'T') return true;
  if (tag === 'F') return false;
  if (tag === '@') return strings[parseInt(tok.slice(1), 36)];
  if (tag === 'B') return BigInt(strings[parseInt(tok.slice(1), 36)]);
  if (tag === 'D') return fromF64Hex(tok.slice(1));
  if (tag === 'A') {
    const len = parseInt(tok.slice(1), 36);
    const a = new Array(len);
    for (let j = 0; j < len; j++) a[j] = unflatten(cur, strings);
    return a;
  }
  if (tag === 'O') {
    const len = parseInt(tok.slice(1), 36);
    const o = {};
    for (let j = 0; j < len; j++) { const k = unflatten(cur, strings); o[k] = unflatten(cur, strings); }
    return o;
  }
  return parseInt(tok, 36);
};

// huffman-code the token streams
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$_';

const buildHuffman = streams => {
  const freqs = new Map();
  for (const s of streams) for (const tok of s) freqs.set(tok, (freqs.get(tok) ?? 0) + 1);
  if (freqs.size === 0) freqs.set('', 1);

  const nodes = [...freqs.entries()].map(([ token, freq ], id) => ({ token, freq, id }));
  const queue = nodes.slice();
  while (queue.length > 1) {
    queue.sort((a, b) => a.freq - b.freq);
    const left = queue.shift(), right = queue.shift();
    queue.push({ freq: left.freq + right.freq, left, right });
  }
  const codes = new Map();
  const walk = (node, code) => {
    if (node.token != null) { codes.set(node.token, code || '0'); return node.id; }
    return [ walk(node.left, code + '0'), walk(node.right, code + '1') ];
  };
  const tree = walk(queue[0], '');
  return { tree, codes, tokens: nodes.map(x => x.token) };
};

const huffEncode = (stream, codes) => {
  let bits = '';
  for (const tok of stream) bits += codes.get(tok);
  let out = '';
  for (let i = 0; i < bits.length; i += 6) out += ALPHABET[parseInt(bits.slice(i, i + 6).padEnd(6, '0'), 2)];
  return `${bits.length.toString(36)}:${out}`;
};

const huffDecode = (data, tree, tokens) => {
  const out = [];
  let node = tree;
  const split = data.indexOf(':');
  const bits = parseInt(data.slice(0, split), 36);
  data = data.slice(split + 1);
  for (let i = 0; i < bits; i++) {
    const value = ALPHABET.indexOf(data[(i / 6) | 0]);
    node = node[(value >> (5 - (i % 6))) & 1];
    if (typeof node === 'number') { out.push(tokens[node]); node = tree; }
  }
  return out;
};

// runtime decoder source emitted into builtins_precompiled.js.
const runtimeDecoderSource = `
const strings = __PORFFOR_STRINGS__;
const huffTree = __PORFFOR_TREE__;
const huffTokens = __PORFFOR_TOKENS__;

const huffValue = c => c >= 97 ? c - 71 : c >= 65 && c <= 90 ? c - 65 : c >= 48 && c <= 57 ? c + 4 : c === 36 ? 62 : 63;
const huffDecode = data => {
  const out = [];
  let node = 0;
  const split = data.indexOf(':');
  const bits = parseInt(data.slice(0, split), 36);
  const start = split + 1;
  for (let i = 0; i < bits; i++) {
    const value = huffValue(data.charCodeAt(start + ((i / 6) | 0)));
    node = huffTree[node][(value >> (5 - (i % 6))) & 1];
    if (node < 0) { out.push(huffTokens[-node - 1]); node = 0; }
  }
  return out;
};

const f64Bytes = new Uint8Array(8);
const f64View = new Float64Array(f64Bytes.buffer);
const fromF64Hex = hex => {
  for (let i = 0; i < 8; i++) f64Bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return f64View[0];
};

// reconstruct one IR value from a token cursor { tokens, i }. (Phase 4 will thread the dynamic
// h.* helpers - builtin inclusion, lazy typeswitch gating, comptime, data remap - through here.)
const unflatten = cur => {
  const tok = cur.tokens[cur.i++];
  const tag = tok[0];
  if (tag === '_') return null;
  if (tag === 'U') return undefined;
  if (tag === 'T') return true;
  if (tag === 'F') return false;
  if (tag === '@') return strings[parseInt(tok.slice(1), 36)];
  if (tag === 'B') return BigInt(strings[parseInt(tok.slice(1), 36)]);
  if (tag === 'D') return fromF64Hex(tok.slice(1));
  if (tag === 'A') {
    const len = parseInt(tok.slice(1), 36);
    const a = new Array(len);
    for (let j = 0; j < len; j++) a[j] = unflatten(cur);
    return a;
  }
  if (tag === 'O') {
    const len = parseInt(tok.slice(1), 36);
    const o = {};
    for (let j = 0; j < len; j++) { const k = unflatten(cur); o[k] = unflatten(cur); }
    return o;
  }
  return parseInt(tok, 36);
};

// IR node kinds the dynamic walk cares about (mirrors ir.js K.*).
const K_Const = ${K.Const}, K_DataRef = ${K.DataRef}, K_Global = ${K.Global}, K_TypeSwitch = ${K.TypeSwitch}, K_Call = ${K.Call}, K_Alloc = ${K.Alloc}, K_Store = ${K.Store}, K_ThrowNew = ${K.ThrowNew};
const T_u32 = ${T.u32};

// is \`v\` an IR node array (defensive: length-6, numeric kind/type/fx)? a value-array such as a
// case tuple or a list of type ids fails this, and the per-kind guards below disambiguate the
// rare collision (e.g. a 6-long type-id list whose [0] equals a kind number).
const isNode = v => Array.isArray(v) && v.length === 6 && typeof v[0] === 'number' && typeof v[1] === 'number' && typeof v[2] === 'number';
const isComptimeFlag = v => v && typeof v === 'object' && !Array.isArray(v) && v.__porfComptimeFlag;
const resolveComptimeFlag = (h, kind, value) => kind === 'hasFunc' ? h.hasFunc(value) : h.usesAnyType([ value ]);

// the dynamic resolution pass walks the reconstructed IR tree, threading the codegen helpers \`h\`:
//   - live Call to a builtin       -> h.includeBuiltin(name)   (so it gets compiled + emitted)
//   - DataRef / Alloc / Global     -> h.remap* / h.global      (rebind to the user compile's arena)
//   - TypeSwitch case              -> deferred to h.onFinalize, gated on h.usesAnyType(typeIds)
//     when usedTypes is final, so a dead case's subtree is never walked (its builtins/strings are
//     never included -> never emitted), while a type first used by a later builtin still activates.
const walk = (node, h) => {
  if (isComptimeFlag(node)) return node;
  if (!isNode(node)) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const x = node[i];
        if (isComptimeFlag(x)) {
          h.onFinalize(() => {
            const pos = node.indexOf(x);
            if (pos === -1) return;
            const [ kind, value, thenBranch, elseBranch ] = x.__porfComptimeFlag;
            const selected = resolveComptimeFlag(h, kind, value) ? thenBranch : elseBranch;
            node.splice(pos, 1, ...selected);
            for (let j = pos; j < pos + selected.length; j++) walk(node[j], h);
          });
        } else node[i] = walk(x, h);
      }
    }
    return node;
  }

  const kind = node[0];
  if (kind === K_TypeSwitch && Array.isArray(node[4]) && node[4].every(c => Array.isArray(c))) {
    walk(node[3], h); // subject is always live
    for (const c of node[4]) {
      const typeIds = c[0];
      let walkedCase = false;
      h.onFinalize(() => {
        if (walkedCase || !h.usesAnyType(typeIds)) return;
        walkedCase = true;
        for (let j = 1; j < c.length; j++) walk(c[j], h);
      });
    }
    walk(node[5], h); // default
    return node;
  }

  if (kind === K_Call && typeof node[3] === 'string' && h.hasBuiltin(node[3])) h.includeBuiltin(node[3]);
  // a throwable error type is usable: its accessors/toString must survive type gating
  else if (kind === K_ThrowNew) h.typeUsed(node[3]);
  else if (kind === K_DataRef) node[3] = h.remapData(node[3]);
  else if (kind === K_Alloc && Array.isArray(node[5])) node[5][0] = h.remapAllocSite(node[5][0]);
  else if (
    kind === K_Store &&
    node[3] === 'u32' &&
    Array.isArray(node[5]) && node[5][0] === 0 &&
    Array.isArray(node[5][2]) && node[5][2][0] === K_Const && node[5][2][1] === T_u32
  ) {
    node[5][2][3] = h.remapFuncIndex(node[5][2][3]);
  }
  else if (kind === K_Global && typeof node[3] === 'string') h.global(node[3], node[1]);

  walk(node[3], h);
  walk(node[4], h);
  walk(node[5], h);
  return node;
};

const decodeIR = (h, data) => walk(unflatten({ tokens: huffDecode(data), i: 0 }), h);
`;

const precompile = async () => {
  const dir = join(__dirname, 'builtins');
  const t = performance.now();

  const funcs = [];
  let fileCount = 0;
  for (const file of fs.readdirSync(dir).toSorted()) {
    if (file.endsWith('.d.ts')) continue;
    fileCount++;
    globalThis.precompile = file;
    const ft = performance.now();
    try {
      await compile(join(dir, file), funcs);
    } catch (e) {
      console.log(`\r${' '.repeat(80)}\r${' '.repeat(12)}${file}\r`);
      throw e;
    }
    process.stdout.write(`\r${' '.repeat(80)}\r[2m${`[${(performance.now() - ft).toFixed(2)}ms]`.padEnd(12)}[0m[92m${file}[0m\r`);
  }

  const total = performance.now() - t;
  console.log(`\r${' '.repeat(80)}\r[2m${`[${total.toFixed(2)}ms]`.padEnd(12)}[0m[92mcompiled ${funcs.length} funcs from ${fileCount} files[0m [90m(${['parse', 'codegen'].map(x => `${x}: ${((timing[x] / total) * 100).toFixed(0)}%`).join(', ')})[0m`);

  const { strings, intern } = newIntern();
  const streamOf = body => { const out = []; flatten(body, out, intern); return out; };

  const streams = [];
  for (const x of funcs) {
    x._bodyStream = streamOf(x.body);
    streams.push(x._bodyStream);
    if (x.globalInits) {
      x._globalInitStreams = {};
      for (const g in x.globalInits) {
        const s = streamOf(x.globalInits[g]);
        x._globalInitStreams[g] = s;
        streams.push(s);
      }
    }

    // metadata record: everything except body/globalInits
    const params = x.params.map(p => [ p.name, p.type ]);
    const locals = Object.entries(x.locals).filter(([ n ]) => !x.params.some(p => p.name === n));
    const localNames = locals.map(([ n ]) => n);
    const localTypes = locals.map(([ , l ]) => l.type);
    const localMeta = locals.flatMap(([ , l ], i) => l.metadata?.type != null ? [ i, l.metadata.type ] : []);
    const returnTypes = [ ...(x.returnTypes ?? []) ].filter(t => ![ TYPES.undefined, TYPES.number, TYPES.boolean, TYPES.function ].includes(t));

    const meta = { params, retType: x.retType };
    if (x.returnType != null) meta.returnType = x.returnType;
    if (returnTypes.length) meta.returnTypes = returnTypes;
    meta.jsLength = x.jsLength;
    if (localNames.length) { meta.localNames = localNames; meta.localTypes = localTypes; }
    if (localMeta.length) meta.localMetadata = localMeta;
    if (x.data && Object.keys(x.data).length) meta.data = x.data;
    if (x.funcData && Object.keys(x.funcData).length) meta.funcData = x.funcData;
    if (x.funcRefs && Object.keys(x.funcRefs).length) meta.funcRefs = x.funcRefs;
    if (x.constr) meta.constr = 1;
    if (x.closureAware) meta.closureAware = 1;
    if (x.selfAware) meta.selfAware = 1;
    if (x.hasRestArgument) meta.hasRestArgument = 1;
    if (x.usesArguments) meta.usesArguments = 1;
    x._metaValue = meta;
    x._metaStream = streamOf(meta);
    streams.push(x._metaStream);
  }

  const { tree, codes, tokens } = buildHuffman(streams);

  // per-func roundtrip self-check: encode -> decode must reproduce the body
  const eq = (a, b) => {
    if (a === b) return true;
    if (typeof a === 'bigint' || typeof b === 'bigint') return a === b;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every(k => eq(a[k], b[k]));
    }
    return Object.is(a, b);
  };
  for (const x of funcs) {
    const rebuilt = unflatten({ tokens: huffDecode(huffEncode(x._bodyStream, codes), tree, tokens), i: 0 }, strings);
    if (!eq(x.body, rebuilt)) throw new Error(`precompile roundtrip failed for ${x.name}`);
    const rebuiltMeta = unflatten({ tokens: huffDecode(huffEncode(x._metaStream, codes), tree, tokens), i: 0 }, strings);
    if (!eq(x._metaValue, rebuiltMeta)) throw new Error(`precompile meta roundtrip failed for ${x.name}`);
  }

  // one record per builtin: name \x01 body \x01 meta [\x01 global \x01 init ...]
  const records = funcs.map(x => [
    x.name,
    huffEncode(x._bodyStream, codes),
    huffEncode(x._metaStream, codes),
    ...(x._globalInitStreams
      ? Object.keys(x._globalInitStreams).flatMap(g => [ g, huffEncode(x._globalInitStreams[g], codes) ])
      : [])
  ].join('\x01'));

  const flatTree = [];
  const flattenTree = node => {
    if (typeof node === 'number') return -node - 1;
    const id = flatTree.length;
    flatTree.push(null);
    flatTree[id] = [ flattenTree(node[0]), flattenTree(node[1]) ];
    return id;
  };
  flattenTree(tree);

  const decoder = runtimeDecoderSource
    .replace('__PORFFOR_STRINGS__', JSON.stringify(strings))
    .replace('__PORFFOR_TREE__', JSON.stringify(flatTree))
    .replace('__PORFFOR_TOKENS__', JSON.stringify(tokens));

  return `// autogenerated by compiler/precompile.js - do not edit
const defaultPrefs = ${JSON.stringify(defaultPrefs)};
${decoder}
// b(data) lazily decodes a compressed IR body the first time it is read.
const b = data => {
  const out = h => decodeIR(h, data);
  out.precompiled = true;
  return out;
};

// one \\x02-separated record per builtin: name \\x01 body \\x01 meta [\\x01 global \\x01 init ...].
// entries are registered as replace-on-first-read accessors, so a compile only decodes the
// builtins it actually touches and the table stays one flat string instead of generated code
const funcsTable = ${JSON.stringify(records.join('\x02'))};
const entryOf = parts => {
  const entry = unflatten({ tokens: huffDecode(parts[2]), i: 0 });
  entry.body = b(parts[1]);
  for (let i = 3; i < parts.length; i += 2) (entry.globalInits ??= {})[parts[i]] = b(parts[i + 1]);
  return entry;
};

export const BuiltinFuncs = x => {
  for (const rec of funcsTable.split('\\x02')) {
    const parts = rec.split('\\x01');
    const name = parts[0];
    if (name in x) { x[name] = entryOf(parts); continue; } // assignment: comptime wrappers merge via their setter
    const materialize = v => Object.defineProperty(x, name, { value: v, writable: true, enumerable: true, configurable: true });
    Object.defineProperty(x, name, {
      configurable: true,
      enumerable: true,
      get() { const entry = entryOf(parts); materialize(entry); return entry; },
      set: materialize
    });
  }
}`;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  fs.writeFileSync(join(__dirname, 'builtins_precompiled.js'), await precompile());
}

export { newIntern, flatten, unflatten, buildHuffman, huffEncode, huffDecode };
