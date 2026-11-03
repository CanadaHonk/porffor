import { errPorfforDynamicCode } from './internal/errors.js';
import { validateObject } from './internal/validators.js';

// vm code is the source strings known at compile time, each a function run with a context's scope (see the linker's #vmcode)
const GLOBALS = new Set([
  'Object', 'Function', 'Array', 'Number', 'parseFloat', 'parseInt', 'Infinity', 'NaN', 'undefined', 'Boolean', 'String', 'Symbol',
  'Date', 'Promise', 'RegExp', 'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError',
  'URIError', 'globalThis', 'JSON', 'Math', 'Intl', 'ArrayBuffer', 'Atomics', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array',
  'Uint32Array', 'Int32Array', 'BigUint64Array', 'BigInt64Array', 'Uint8ClampedArray', 'Float32Array', 'Float64Array', 'Float16Array',
  'DataView', 'Map', 'BigInt', 'Set', 'Iterator', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'FinalizationRegistry', 'WeakRef',
  'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'unescape', 'eval', 'isFinite', 'isNaN', 'console',
  'Temporal', 'SuppressedError', 'DisposableStack', 'AsyncDisposableStack', 'SharedArrayBuffer', 'WebAssembly'
]);

const compile = code => {
  const compiled = __porffor_vm_code(code);
  if (compiled === undefined) throw errPorfforDynamicCode(`porffor: vm cannot compile code at runtime, only source strings known when the program is compiled can run (got ${JSON.stringify(code.length > 60 ? code.slice(0, 60) + '...' : code)})`);
  if (compiled instanceof SyntaxError) throw compiled;
  return compiled;
};

// free names resolve on the contextified object except js builtins, strict scopes throw on refused assignments
const scopeOf = (global, strict) => new Proxy(global, {
  has: (t, key) => typeof key === 'string' && (key in t || !GLOBALS.has(key)),
  get: (t, key) => {
    if (key === Symbol.unscopables) return undefined;
    if (!(key in t)) throw new ReferenceError(`${key} is not defined`);
    return t[key];
  },
  set: (t, key, value) => {
    if (strict && !(key in t)) throw new ReferenceError(`${key} is not defined`);
    const ok = Reflect.set(t, key, value);
    if (!ok && strict) throw new TypeError(`Cannot assign to read only property '${key}' of object`);
    return ok;
  }
});

const scopes = new WeakMap();
scopes.set(globalThis, [ scopeOf(globalThis, false), scopeOf(globalThis, true) ]);

export const createContext = (contextObject = {}) => {
  if (!scopes.has(contextObject)) scopes.set(contextObject, [ scopeOf(contextObject, false), scopeOf(contextObject, true) ]);
  return contextObject;
};

// this context's own global isn't a contextified object
export const isContext = object => {
  validateObject(object, 'object');
  return object !== globalThis && scopes.has(object);
};

const dynamicImport = specifier => Promise.reject(new Error(`import('${specifier}') in vm code is not supported`));

export class Script {
  #compiled;

  constructor(code) {
    this.#compiled = compile(`${code}`);
  }

  runInContext(contextifiedObject) {
    const scope = scopes.get(contextifiedObject);
    if (scope === undefined) throw new TypeError('The "contextifiedObject" argument must be an vm.Context');
    return this.#compiled.call(contextifiedObject, scope[this.#compiled.strict ? 1 : 0], contextifiedObject, dynamicImport);
  }

  runInThisContext() {
    return this.runInContext(globalThis);
  }

  runInNewContext(contextObject) {
    return this.runInContext(createContext(contextObject));
  }
}

export const runInThisContext = code => new Script(code).runInThisContext();

export const runInNewContext = (code, contextObject) => new Script(code).runInNewContext(contextObject);

export default { Script, createContext, isContext, runInNewContext, runInThisContext };
