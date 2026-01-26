import * as PrecompiledBuiltins from './builtins_precompiled.js';
import { PageSize, Blocktype, Opcodes, Valtype } from './wasmSpec.js';
import { TYPES, TYPE_NAMES } from './types.js';
import { number, unsignedLEB128 } from './encoding.js';
import './prefs.js';

export let importedFuncs;
export const setImports = (v = null) => {
  if (v == null) {
    v = Object.create(null);
    v.length = 0;
  }

  importedFuncs = v;
};
setImports();

/**
 * Create an import function for the Porffor world to use.
 *
 * @param {string} name - Name of the import
 * @param {number} params - Number of parameters
 * @param {number} results - Number of results
 * @param {function} js - Native (your world) function to call as import implementation
 * @param {string} c - C source code to compile as import implementation
 */
export const createImport = (name, params, returns, js = null, c = null) => {
  if (!globalThis.valtypeBinary) {
    globalThis.valtype ??= Prefs.valtype ?? 'f64';
    globalThis.valtypeBinary = Valtype[valtype];
  }

  if (typeof params === 'number') params = new Array(params).fill(valtypeBinary);
  if (typeof returns === 'number') returns = new Array(returns).fill(valtypeBinary);

  if (name in importedFuncs) {
    // overwrite existing import
    const existing = importedFuncs[name];
    const call = +existing;
    const replacement = new Number(call);
    replacement.name = name;
    replacement.import = existing.import;
    replacement.params = params;
    replacement.returns = returns;
    replacement.js = js;
    replacement.c = c;

    importedFuncs[name] = replacement;
    return;
  }

  const call = importedFuncs.length;
  const ident = String.fromCharCode(97 + importedFuncs.length);

  const obj = importedFuncs[name] = importedFuncs[call] = new Number(call);
  obj.name = name;
  obj.import = ident;
  obj.params = params;
  obj.returns = returns;
  obj.js = js;
  obj.c = c;

  importedFuncs.length = call + 1;
};

export const UNDEFINED = 0;
export const NULL = 0;

export const BuiltinVars = ({ builtinFuncs }) => {
  const _ = Object.create(null);
  _.undefined = () => [ number(UNDEFINED) ];
  _.undefined.type = TYPES.undefined;

  _.null = () => [ number(NULL) ];
  _.null.type = TYPES.object;

  _.NaN = () => [ number(NaN) ];
  _.Infinity = () => [ number(Infinity) ];

  for (const x in TYPES) {
   _['__Porffor_TYPES_' + x] = () => [ number(TYPES[x]) ];
  }

  _.__performance_timeOrigin = [
    [ Opcodes.call, importedFuncs.timeOrigin ]
  ];
  _.__performance_timeOrigin.usesImports = true;

  _.__Uint8Array_BYTES_PER_ELEMENT = () => [ number(1) ];
  _.__Int8Array_BYTES_PER_ELEMENT = () => [ number(1) ];
  _.__Uint8ClampedArray_BYTES_PER_ELEMENT = () => [ number(1) ];
  _.__Uint16Array_BYTES_PER_ELEMENT = () => [ number(2) ];
  _.__Int16Array_BYTES_PER_ELEMENT = () => [ number(2) ];
  _.__Uint32Array_BYTES_PER_ELEMENT = () => [ number(4) ];
  _.__Int32Array_BYTES_PER_ELEMENT = () => [ number(4) ];
  _.__Float32Array_BYTES_PER_ELEMENT = () => [ number(4) ];
  _.__Float64Array_BYTES_PER_ELEMENT = () => [ number(8) ];
  _.__BigInt64Array_BYTES_PER_ELEMENT = () => [ number(8) ];
  _.__BigUint64Array_BYTES_PER_ELEMENT = () => [ number(8) ];

  // well-known symbols
  for (const x of [
    'asyncIterator', 'hasInstance',
    'isConcatSpreadable', 'iterator',
    'match', 'matchAll', 'replace',
    'search', 'species', 'split',
    'toPrimitive', 'toStringTag', 'unscopables',
    'dispose', 'asyncDispose'
  ]) {
   _[`__Symbol_${x}`] = (scope, { glbl, builtin, makeString }) => [
      [ Opcodes.block, Valtype.f64 ],
        ...glbl(Opcodes.global_get, `#wellknown_${x}`, Valtype.f64),
        Opcodes.i32_to_u,
        [ Opcodes.if, Blocktype.void ],
          ...glbl(Opcodes.global_get, `#wellknown_${x}`, Valtype.f64),
          [ Opcodes.br, 1 ],
        [ Opcodes.end ],

        ...makeString(scope, `Symbol.${x}`),
        number(TYPES.bytestring, Valtype.i32),
        [ Opcodes.call, builtin('Symbol') ],
        ...glbl(Opcodes.global_set, `#wellknown_${x}`, Valtype.f64),
        ...glbl(Opcodes.global_get, `#wellknown_${x}`, Valtype.f64),
      [ Opcodes.end ]
    ];
   _[`__Symbol_${x}`].type = TYPES.symbol;
  }

  // builtin objects
  const makePrefix = name => (name.startsWith('__') ? '' : '__') + name + '_';

  const done = new Set();
  const object = (name, props) => {
    done.add(name);
    const prefix = name === 'globalThis' ? '' : makePrefix(name);

    // already a func
    const existingFunc = builtinFuncs[name];

    builtinFuncs['#get_' + name] = {
      params: [],
      locals: [ Valtype.i32 ],
      returns: [ Valtype.i32 ],
      returnType: TYPES.object,
      wasm: (scope, { allocPage, makeString, generate, getNodeType, builtin, funcRef, glbl }) => {
        if (globalThis.precompile) return [ [ 'get object', name ] ];

        // todo/perf: precompute bytes here instead of calling real funcs if we really care about perf later

        let ptr;
        if (existingFunc) {
          ptr = funcRef(name)[0][1];
        } else {
          ptr = allocPage(scope, `builtin object: ${name}`);
        }

        const getPtr = glbl(Opcodes.global_get, `getptr_${name}`, Valtype.i32)[0];
        const out = [
          // check if already made/cached
          getPtr,
          [ Opcodes.if, Blocktype.void ],
            getPtr,
            [ Opcodes.return ],
          [ Opcodes.end ],

          // set cache & ptr for use
          number(ptr, Valtype.i32),
          [ Opcodes.local_tee, 0 ],
          glbl(Opcodes.global_set, `getptr_${name}`, Valtype.i32)[0],

          [ Opcodes.local_get, 0 ],
          Opcodes.i32_from_u,
          number(existingFunc ? TYPES.function : TYPES.object, Valtype.i32),
          [ Opcodes.call, builtin('__Porffor_object_underlying') ],
          [ Opcodes.drop ],
          [ Opcodes.local_set, 0 ]
        ];

        for (const x in props) {
          let value = {
            type: 'Identifier',
            name: prefix + x
          };

          if (x === '__proto__') {
            out.push(
              [ Opcodes.local_get, 0 ],
              number(TYPES.object, Valtype.i32),

              ...generate(scope, value),
              Opcodes.i32_to_u,
              ...getNodeType(scope, value),

              [ Opcodes.call, builtin('__Porffor_object_setPrototype') ]
            );
            continue;
          }

          let add = true;
          if (existingFunc && (x === 'prototype' || x === 'constructor')) add = false;

          let flags = 0b0000;
          const d = props[x];
          if (d.configurable) flags |= 0b0010;
          if (d.enumerable) flags |= 0b0100;
          if (d.writable) flags |= 0b1000;

          out.push(
            [ Opcodes.local_get, 0 ],
            number(TYPES.object, Valtype.i32),

            ...makeString(scope, x),
            Opcodes.i32_to_u,
            number(TYPES.bytestring, Valtype.i32),

            ...generate(scope, value),
            ...getNodeType(scope, value),

            number(flags, Valtype.i32),
            number(TYPES.number, Valtype.i32),

            [ Opcodes.call, builtin(add ? '__Porffor_object_fastAdd' : '__Porffor_object_define') ]
          );
        }

        // return ptr
        out.push(getPtr);
        return out;
      }
    };

   _[name] = (scope, { builtin }) => [
      [ Opcodes.call, builtin('#get_' + name) ],
      Opcodes.i32_from_u
    ];
   _[name].type = existingFunc ? TYPES.function : TYPES.object;

    for (const x in props) {
      const d = props[x];
      const k = prefix + x;

      if ('value' in d && !(k in builtinFuncs) && !(k in _)) {
        if (Array.isArray(d.value) || typeof d.value === 'function') {
         _[k] = d.value;
          continue;
        }

        if (typeof d.value === 'number') {
         _[k] = [ number(d.value) ];
         _[k].type = TYPES.number;
          continue;
        }

        if (typeof d.value === 'string') {
         _[k] = (scope, { makeString }) => makeString(scope, d.value);
         _[k].type = TYPES.bytestring;
          continue;
        }

        if (d.value === null) {
         _[k] = _.null;
          continue;
        }

        throw new Error(`unsupported value type (${typeof d.value})`);
      }
    }
  };

  const props = (base, vals) => {
    const out = {};

    if (Array.isArray(vals)) {
      // array of keys with no value
      for (const x of vals) {
        out[x] = {
          ...base
        };
      }
    } else for (const x in vals) {
      // object of key values
      out[x] = {
        ...base,
        value: vals[x]
      };
    }

    return out;
  };

  const builtinFuncKeys = Object.keys(builtinFuncs);
  const autoFuncKeys = name => {
    const prefix = makePrefix(name);
    return builtinFuncKeys.filter(x => x.startsWith(prefix)).map(x => x.slice(prefix.length)).filter(x => !x.startsWith('prototype_'));
  };
  const autoFuncs = name => ({
    ...props({
      writable: true,
      enumerable: false,
      configurable: true
    }, autoFuncKeys(name)),
    ...(_[`__${name}_prototype`] ? {
      prototype: {
        writable: false,
        enumerable: false,
        configurable: false
      }
    } : {})
  });

  object('Math', {
    ...props({
      writable: false,
      enumerable: false,
      configurable: false
    }, {
      E: Math.E,
      LN10: Math.LN10,
      LN2: Math.LN2,
      LOG10E: Math.LOG10E,
      LOG2E: Math.LOG2E,
      PI: Math.PI,
      SQRT1_2: Math.SQRT1_2,
      SQRT2: Math.SQRT2,

      // https://github.com/rwaldron/proposal-math-extensions/issues/10
      RAD_PER_DEG: Math.PI / 180,
      DEG_PER_RAD: 180 / Math.PI
    }),

    ...autoFuncs('Math')
  });

  // automatically generate objects for prototypes
  for (const x of builtinFuncKeys.reduce((acc, x) => {
    const ind = x.indexOf('_prototype_');
    if (ind === -1) return acc;

    acc.add(x.slice(0, ind + 10));
    return acc;
  }, new Set())) {
    const props = autoFuncs(x);

    // special case: Object.prototype.__proto__ = null
    if (x === '__Object_prototype') {
      Object.defineProperty(props, '__proto__', { value: { value: null, configurable: true }, enumerable: true });
    }

    // special case: Function.prototype.length = 0
    // special case: Function.prototype.name = ''
    if (x === '__Function_prototype') {
      props.length = { value: 0, configurable: true };
      props.name = { value: '', configurable: true };
    }

    // special case: Array.prototype.length = 0
    // Per spec, Array.prototype is an Array exotic object with length = 0
    if (x === '__Array_prototype') {
      props.length = { value: 0, writable: true, configurable: false };
    }

    // add constructor for constructors
    const name = x.slice(2, x.indexOf('_', 2));
    if (builtinFuncs[name]?.constr) {
      const value = (scope, { funcRef }) => funcRef(name);
      value.type = TYPES.function;

      props.constructor = {
        value,
        writable: true,
        enumerable: false,
        configurable: true
      };
    }

    object(x, props);
  }


  object('Number', {
    ...props({
      writable: false,
      enumerable: false,
      configurable: false
    }, {
      NaN: NaN,
      POSITIVE_INFINITY: Infinity,
      NEGATIVE_INFINITY: -Infinity,
      MAX_VALUE: valtype === 'i32' ? 2147483647 : 1.7976931348623157e+308,
      MIN_VALUE: valtype === 'i32' ? -2147483648 : 5e-324,
      MAX_SAFE_INTEGER: valtype === 'i32' ? 2147483647 : 9007199254740991,
      MIN_SAFE_INTEGER: valtype === 'i32' ? -2147483648 : -9007199254740991,
      EPSILON: 2.220446049250313e-16
    }),

    ...autoFuncs('Number')
  });

  // these technically not spec compliant as it should be classes or non-enumerable but eh
  object('navigator', {
    ...props({
      writable: false,
      enumerable: true,
      configurable: false
    }, {
      userAgent: `Porffor/${globalThis.version}`
    })
  });

  for (const x of [
    'console',
    'crypto',
    'performance',
  ]) {
    object(x, props({
      writable: true,
      enumerable: true,
      configurable: true
    }, autoFuncKeys(x).slice(0, 12)));
  }

  for (const x of [ 'Array', 'ArrayBuffer', 'Atomics', 'Date', 'Error', 'JSON', 'Object', 'Promise', 'Reflect', 'String', 'Symbol', 'Uint8Array', 'Int8Array', 'Uint8ClampedArray', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'SharedArrayBuffer', 'BigInt', 'Boolean', 'DataView', 'AggregateError', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'EvalError', 'URIError', 'Function', 'Map', 'RegExp', 'Set', 'WeakMap', 'WeakRef', 'WeakSet' ]) {
    object(x, autoFuncs(x));
  }

  const enumerableGlobals = [ 'atob', 'btoa', 'performance', 'crypto', 'navigator' ];
  object('globalThis', {
    // 19.1 Value Properties of the Global Object
    // https://tc39.es/ecma262/#sec-value-properties-of-the-global-object
    // 19.1.1 globalThis
    globalThis: {
      writable: true,
      enumerable: false,
      configurable: true
    },

    // 19.1.2 Infinity
    // 19.1.3 NaN
    // 19.1.4 undefined
    ...props({
      writable: false,
      enumerable: false,
      configurable: false
    }, [ 'Infinity', 'NaN', 'undefined' ]),

    // 19.2 Function Properties of the Global Object
    // https://tc39.es/ecma262/#sec-function-properties-of-the-global-object
    // 19.3 Constructor Properties of the Global Object
    // https://tc39.es/ecma262/#sec-constructor-properties-of-the-global-object
    ...props({
      writable: true,
      enumerable: false,
      configurable: true
    }, builtinFuncKeys.filter(x => !x.startsWith('__') && !enumerableGlobals.includes(x) && !x.startsWith('f64') && !x.startsWith('i32'))),

    ...props({
      writable: true,
      enumerable: true,
      configurable: true
    }, enumerableGlobals)
  });

  if (Prefs.logMissingObjects) for (const x of Object.keys(builtinFuncs).concat(Object.keys(_))) {
    if (!x.startsWith('__')) continue;
    const name = x.split('_').slice(2, -1).join('_');

    let t = globalThis;
    for (const x of name.split('_')) {
      t = t[x];
      if (!t) break;
    }
    if (!t) continue;

    if (!done.has(name) && !done.has('__' + name)) {
      console.log(name, !!builtinFuncs[name]);
      done.add(name);
    }
  }

  return _;
};

export const BuiltinFuncs = () => {
  const _ = Object.create(null);
  _.isNaN = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_ne ],
      Opcodes.i32_from
    ]
  };
  _.__Number_isNaN = _.isNaN;

  _.isFinite = {
    params: [ valtypeBinary ],
    locals: [ valtypeBinary ],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_sub ],
      [ Opcodes.local_tee, 1 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.f64_eq ],
      Opcodes.i32_from
    ]
  };
  _.__Number_isFinite = _.isFinite;

  // todo: should be false for +-Infinity
  _.__Number_isInteger = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_trunc ],
      [ Opcodes.f64_eq ],
      Opcodes.i32_from
    ]
  };

  _.__Number_isSafeInteger = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_trunc ],
      [ Opcodes.f64_ne ],
      [ Opcodes.if, Blocktype.void ],
      number(0),
      [ Opcodes.return ],
      [ Opcodes.end ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_abs ],
      number(9007199254740991),
      [ Opcodes.f64_le ],
      Opcodes.i32_from
    ]
  };


  for (const [ name, op, prefix = [ [ Opcodes.local_get, 0 ] ] ] of [
    [ 'sqrt', Opcodes.f64_sqrt ],
    [ 'abs', Opcodes.f64_abs ],
    [ 'sign', Opcodes.f64_copysign, [ number(1), [ Opcodes.local_get, 0 ] ] ],
    [ 'floor', Opcodes.f64_floor ],
    [ 'ceil', Opcodes.f64_ceil ],
    [ 'round', Opcodes.f64_nearest ],
    [ 'trunc', Opcodes.f64_trunc ]
  ]) {
   _[`__Math_${name}`] = {
      params: [ Valtype.f64 ],
      locals: [],
      returns: [ Valtype.f64 ],
      returnType: TYPES.number,
      wasm: () => [
        ...prefix,
        [ op ]
      ]
    };
  }

  // todo: does not follow spec with +-Infinity and values >2**32
  _.__Math_clz32 = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_to_u,
      [ Opcodes.i32_clz ],
      Opcodes.i32_from
    ]
  };

  _.__Math_fround = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f32_demote_f64 ],
      [ Opcodes.f64_promote_f32 ]
    ]
  };

  // todo: this does not overflow correctly
  _.__Math_imul = {
    params: [ valtypeBinary, valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_to,
      [ Opcodes.local_get, 1 ],
      Opcodes.i32_to,
      [ Opcodes.i32_mul ],
      Opcodes.i32_from
    ]
  };

  const prngSeed0 = (Math.random() * (2 ** 30)) | 0, prngSeed1 = (Math.random() * (2 ** 30)) | 0;
  const prng = {
    localNames: ['s1', 's0'],
    ...({
      'xorshift32+': {
        globalInits: { state0: prngSeed0 },
        locals: [ Valtype.i32 ],
        returns: Valtype.i32,
        wasm: (scope, { glbl }) => [
          // setup: s1 = state0
          ...glbl(Opcodes.global_get, 'state0', Valtype.i32), // state0
          [ Opcodes.local_tee, 0 ], // s1

          // s1 ^= s1 << 13
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i32_const, 13 ],
          [ Opcodes.i32_shl ], // <<
          [ Opcodes.i32_xor ], // ^
          [ Opcodes.local_tee, 0 ], // s1

          // s1 ^= s1 >> 17
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i32_const, 17 ],
          [ Opcodes.i32_shr_s ], // >>
          [ Opcodes.i32_xor ], // ^
          [ Opcodes.local_tee, 0 ], // s1

          // s1 ^= s1 << 5
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i32_const, 5 ],
          [ Opcodes.i32_shl ], // <<
          [ Opcodes.i32_xor ], // ^
          [ Opcodes.local_tee, 0 ], // s1

          // state0 = s1
          ...glbl(Opcodes.global_set, 'state0', Valtype.i32),

          // s1
          [ Opcodes.local_get, 0 ],
        ],
      },

      'xorshift64+': {
        globalInits: { state0: prngSeed0 },
        locals: [ Valtype.i64 ],
        returns: Valtype.i64,
        wasm: (scope, { glbl }) => [
          // setup: s1 = state0
          ...glbl(Opcodes.global_get, 'state0', Valtype.i64), // state0
          [ Opcodes.local_tee, 0 ], // s1

          // s1 ^= s1 >> 12
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i64_const, 12 ],
          [ Opcodes.i64_shr_s ], // >>
          [ Opcodes.i64_xor ], // ^
          [ Opcodes.local_tee, 0 ], // s1

          // s1 ^= s1 << 25
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i64_const, 25 ],
          [ Opcodes.i64_shl ], // <<
          [ Opcodes.i64_xor ], // ^
          [ Opcodes.local_tee, 0 ], // s1

          // s1 ^= s1 >> 27
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i64_const, 27 ],
          [ Opcodes.i64_shr_s ], // >>
          [ Opcodes.i64_xor ], // ^
          [ Opcodes.local_tee, 0 ], // s1

          // state0 = s1
          ...glbl(Opcodes.global_set, 'state0', Valtype.i64),

          // s1
          [ Opcodes.local_get, 0 ],
        ],
      },

      'xorshift128+': {
        globalInits: { state0: prngSeed0, state1: prngSeed1 },
        locals: [ Valtype.i64, Valtype.i64 ],
        returns: Valtype.i64,
        wasm: (scope, { glbl }) => [
          // setup: s1 = state0, s0 = state1, state0 = s0
          ...glbl(Opcodes.global_get, 'state0', Valtype.i64), // state0
          [ Opcodes.local_tee, 0 ], // s1
          ...glbl(Opcodes.global_get, 'state1', Valtype.i64), // state1
          [ Opcodes.local_tee, 1, ], // s0
          ...glbl(Opcodes.global_set, 'state0', Valtype.i64), // state0

          // s1 ^= s1 << 23
          // [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i64_const, 23 ],
          [ Opcodes.i64_shl ], // <<
          [ Opcodes.i64_xor ], // ^
          [ Opcodes.local_set, 0 ], // s1

          // state1 = s1 ^ s0 ^ (s1 >> 17) ^ (s0 >> 26)
          // s1 ^ s0
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.local_get, 1 ], // s0
          [ Opcodes.i64_xor ], // ^

          // ^ (s1 >> 17)
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i64_const, 17 ],
          [ Opcodes.i64_shr_u ], // >>
          [ Opcodes.i64_xor ], // ^

          // ^ (s0 >> 26)
          [ Opcodes.local_get, 1 ], // s0
          [ Opcodes.i64_const, 26 ],
          [ Opcodes.i64_shr_u ], // >>
          [ Opcodes.i64_xor ], // ^

          // state1 =
          ...glbl(Opcodes.global_set, 'state1', Valtype.i64),

          // state1 + s0
          ...glbl(Opcodes.global_get, 'state1', Valtype.i64), // state1
          [ Opcodes.local_get, 1 ], // s0
          [ Opcodes.i64_add ]
        ]
      },

      'xoroshiro128+': {
        globalInits: { state0: prngSeed0, state1: prngSeed1 },
        locals: [ Valtype.i64, Valtype.i64, Valtype.i64 ],
        returns: Valtype.i64,
        wasm: (scope, { glbl }) => [
          // setup: s1 = state1, s0 = state0
          ...glbl(Opcodes.global_get, 'state1', Valtype.i64), // state0
          [ Opcodes.local_tee, 0 ], // s1
          ...glbl(Opcodes.global_get, 'state0', Valtype.i64), // state1
          [ Opcodes.local_tee, 1, ], // s0

          // result = s0 + s1
          [ Opcodes.i64_add ],
          [ Opcodes.local_set, 2 ], // result

          // s1 ^= s0
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.local_get, 1 ], // s0
          [ Opcodes.i64_xor ],
          [ Opcodes.local_set, 0 ], // s1

          // state0 = rotl(s0, 24) ^ s1 ^ (s1 << 16)

          // rotl(s0, 24) ^ s1
          [ Opcodes.local_get, 1 ], // s0
          number(24, Valtype.i64),
          [ Opcodes.i64_rotl ],
          [ Opcodes.local_get, 0 ], // s1
          [ Opcodes.i64_xor ],

          // ^ (s1 << 16)
          [ Opcodes.local_get, 0 ], // s1
          number(16, Valtype.i64),
          [ Opcodes.i64_shl ],
          [ Opcodes.i64_xor ],

          // state0 =
          ...glbl(Opcodes.global_set, 'state0', Valtype.i64), // state0

          // state1 = rotl(s1, 37)
          [ Opcodes.local_get, 0 ], // s1
          number(37, Valtype.i64),
          [ Opcodes.i64_rotl ],
          ...glbl(Opcodes.global_set, 'state1', Valtype.i64), // state1

          // result
          [ Opcodes.local_get, 2 ],
        ]
      },

      'xoshiro128+': {
        globalInits: { state0: prngSeed0, state1: prngSeed1, state2: (prngSeed0 * 17) | 0, state3: (prngSeed1 * 31) | 0 },
        locals: [ Valtype.i32, Valtype.i32 ],
        returns: Valtype.i32,
        wasm: (scope, { glbl }) => [
          // result = state0 + state3
          ...glbl(Opcodes.global_get, 'state0', Valtype.i32), // state0
          ...glbl(Opcodes.global_get, 'state3', Valtype.i32), // state0
          [ Opcodes.i32_add ],
          [ Opcodes.local_set, 0 ], // result

          // t = state1 << 9
          ...glbl(Opcodes.global_get, 'state1', Valtype.i32), // state1
          number(9, Valtype.i32),
          [ Opcodes.i32_shl ],
          [ Opcodes.local_set, 1 ], // t

          // state2 ^= state0
          ...glbl(Opcodes.global_get, 'state2', Valtype.i32), // state2
          ...glbl(Opcodes.global_get, 'state0', Valtype.i32), // state0
          [ Opcodes.i32_xor ],
          ...glbl(Opcodes.global_set, 'state2', Valtype.i32), // state2

          // state3 ^= state1
          ...glbl(Opcodes.global_get, 'state3', Valtype.i32), // state3
          ...glbl(Opcodes.global_get, 'state1', Valtype.i32), // state1
          [ Opcodes.i32_xor ],
          ...glbl(Opcodes.global_set, 'state3', Valtype.i32), // state3

          // state1 ^= state2
          ...glbl(Opcodes.global_get, 'state1', Valtype.i32), // state1
          ...glbl(Opcodes.global_get, 'state2', Valtype.i32), // state2
          [ Opcodes.i32_xor ],
          ...glbl(Opcodes.global_set, 'state1', Valtype.i32), // state1

          // state0 ^= state3
          ...glbl(Opcodes.global_get, 'state0', Valtype.i32), // state2
          ...glbl(Opcodes.global_get, 'state3', Valtype.i32), // state0
          [ Opcodes.i32_xor ],
          ...glbl(Opcodes.global_set, 'state0', Valtype.i32), // state2

          // state2 ^= t
          ...glbl(Opcodes.global_get, 'state2', Valtype.i32), // state2
          [ Opcodes.local_get, 1 ], // t
          [ Opcodes.i32_xor ],
          ...glbl(Opcodes.global_set, 'state2', Valtype.i32), // state2

          // state3 = rotl(state3, 11)
          ...glbl(Opcodes.global_get, 'state3', Valtype.i32), // state3
          number(11, Valtype.i32),
          [ Opcodes.i32_rotl ],
          ...glbl(Opcodes.global_set, 'state3', Valtype.i32), // state3

          // result
          [ Opcodes.local_get, 0 ],
        ]
      }
    })[Prefs.prng ?? 'xorshift128+']
  }

  if (!prng) throw new Error(`unknown prng algo: ${Prefs.prng}`);

  _.__Math_random = {
    ...prng,
    params: [],
    returns: [ Valtype.f64 ],
    returnType: TYPES.number,
    wasm: (scope, utils) => [
      ...prng.wasm(scope, utils),
      ...(prng.returns === Valtype.i64 ? [
        number((1 << 53) - 1, Valtype.i64),
        [ Opcodes.i64_and ],

        // double(mantissa)
        [ Opcodes.f64_convert_i64_u ],

        // / (1 << 53)
        number(1 << 53),
        [ Opcodes.f64_div ]
      ] : [
        number((1 << 21) - 1, Valtype.i32),
        [ Opcodes.i32_and ],

        // double(mantissa)
        [ Opcodes.f64_convert_i32_u ],

        // / (1 << 21)
        number(1 << 21),
        [ Opcodes.f64_div ]
      ])
    ]
  };

  _.__Porffor_randomByte = {
    ...prng,
    params: [],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, utils) => [
      ...prng.wasm(scope, utils),
      ...(prng.returns === Valtype.i64 ? [
        // the lowest bits of the output generated by xorshift128+ have low quality
        number(56, Valtype.i64),
        [ Opcodes.i64_shr_u ],

        [ Opcodes.i32_wrap_i64 ],
      ] : []),

      number(0xff, Valtype.i32),
      [ Opcodes.i32_and ],
    ]
  };

  _.__Math_radians = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      number(Math.PI / 180),
      [ Opcodes.f64_mul ]
    ]
  };

  _.__Math_degrees = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      number(180 / Math.PI),
      [ Opcodes.f64_mul ]
    ]
  };

  _.__Math_clamp = {
    params: [ valtypeBinary, valtypeBinary, valtypeBinary ],
    locals: [],
    localNames: [ 'x', 'lower', 'upper' ],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.f64_max ],
      [ Opcodes.local_get, 2 ],
      [ Opcodes.f64_min ]
    ]
  };

  _.__Math_scale = {
    params: [ valtypeBinary, valtypeBinary, valtypeBinary, valtypeBinary, valtypeBinary ],
    locals: [],
    localNames: [ 'x', 'inLow', 'inHigh', 'outLow', 'outHigh' ],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      // (x − inLow) * (outHigh − outLow) / (inHigh - inLow) + outLow
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.f64_sub ],

      [ Opcodes.local_get, 4 ],
      [ Opcodes.local_get, 3 ],
      [ Opcodes.f64_sub ],

      [ Opcodes.f64_mul ],

      [ Opcodes.local_get, 2 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.f64_sub ],

      [ Opcodes.f64_div ],

      [ Opcodes.local_get, 3 ],
      [ Opcodes.f64_add ]
    ]
  };

  // todo: fix for -0
  _.__Math_signbit = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: () => [
      [ Opcodes.local_get, 0 ],
      number(0),
      [ Opcodes.f64_le ],
      Opcodes.i32_from
    ]
  };


  _.__performance_now = {
    params: [],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.call, importedFuncs.time ]
    ]
  };
  _.__performance_now.usesImports = true;


  _.__Porffor_typeName = {
    params: [ Valtype.i32 ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.bytestring,
    wasm: (scope, { typeSwitch, makeString }) => {
      const bc = {};
      for (const x in TYPE_NAMES) {
        bc[x] = () => makeString(scope, TYPE_NAMES[x]);
      }

      return typeSwitch(scope, [ [ Opcodes.local_get, 0 ] ], bc);
    }
  };

  _.__Porffor_clone = {
    params: [ Valtype.i32, Valtype.i32 ],
    locals: [],
    returns: [],
    returnType: TYPES.undefined,
    wasm: () => [
      [ Opcodes.local_get, 1 ],
      [ Opcodes.local_get, 0 ],
      number(pageSize, Valtype.i32),
      [ ...Opcodes.memory_copy, 0x00, 0x00 ],
    ]
  };

  _.__Porffor_malloc = {
    defaultParam: () => ({ type: 'Literal', value: pageSize }),
    params: [ Valtype.i32 ],
    locals: [],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, { builtin, glbl }) => [
      // if currentPtr + bytesToAllocate >= endPtr
      ...glbl(Opcodes.global_get, 'currentPtr', Valtype.i32),
      [ Opcodes.local_get, 0 ],
      [ Opcodes.i32_add ],
      ...glbl(Opcodes.global_get, 'endPtr', Valtype.i32),
      [ Opcodes.i32_ge_s ],
      [ Opcodes.if, Valtype.i32 ],
        // currentPtr = newly allocated pages + bytesToAllocate
        number(Prefs.allocatorChunks ?? 16, Valtype.i32),
        [ Opcodes.memory_grow, 0 ],
        number(PageSize, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.local_get, 0 ],
        [ Opcodes.i32_add ],
        ...glbl(Opcodes.global_set, 'currentPtr', Valtype.i32),
        ...glbl(Opcodes.global_get, 'currentPtr', Valtype.i32),

        // endPtr = currentPtr + limit - bytesToAllocate
        number((Prefs.allocatorChunks ?? 16) * PageSize, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_get, 0 ],
        [ Opcodes.i32_sub ],
        ...glbl(Opcodes.global_set, 'endPtr', Valtype.i32),

        // return currentPtr - bytesToAllocate
        ...glbl(Opcodes.global_get, 'currentPtr', Valtype.i32),
        [ Opcodes.local_get, 0 ],
        [ Opcodes.i32_sub ],
      [ Opcodes.else ],
        // return currentPtr
        ...glbl(Opcodes.global_get, 'currentPtr', Valtype.i32),

        // currentPtr = currentPtr + bytesToAllocate
        ...glbl(Opcodes.global_get, 'currentPtr', Valtype.i32),
        [ Opcodes.local_get, 0 ],
        [ Opcodes.i32_add ],
        ...glbl(Opcodes.global_set, 'currentPtr', Valtype.i32),
      [ Opcodes.end ]
    ]
  };

  _.__Porffor_bytestringToString = {
    params: [ Valtype.i32 ],
    locals: [ Valtype.i32, Valtype.i32, Valtype.i32 ],
    localNames: [ 'src', 'len', 'counter', 'dst' ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.string,
    wasm: (scope, { builtin }) => [
      // len = src.length
      [ Opcodes.local_get, 0 ],
      [ Opcodes.i32_load, 0, 0 ],
      [ Opcodes.local_tee, 1 ],

      // dst = malloc(6 + len * 2)
      number(2, Valtype.i32),
      [ Opcodes.i32_mul ],
      number(6, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.call, builtin('__Porffor_malloc') ],
      [ Opcodes.local_tee, 3 ],

      // dst.length = len
      [ Opcodes.local_get, 1 ],
      [ Opcodes.i32_store, 0, 0 ],

      [ Opcodes.loop, Blocktype.void ],

      // base for store later
      [ Opcodes.local_get, 2 ],
      [ Opcodes.i32_const, 2 ],
      [ Opcodes.i32_mul ],
      [ Opcodes.local_get, 3 ],
      [ Opcodes.i32_add ],

      // load char from src
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 2 ],
      [ Opcodes.i32_add ],
      [ Opcodes.i32_load8_u, 0, 4 ],

      // store char to dst
      [ Opcodes.i32_store16, 0, 4 ],

      // counter++
      [ Opcodes.local_get, 2 ],
      [ Opcodes.i32_const, 1 ],
      [ Opcodes.i32_add ],
      [ Opcodes.local_tee, 2 ],

      // loop if counter < len
      [ Opcodes.local_get, 1 ],
      [ Opcodes.i32_lt_s ],
      [ Opcodes.br_if, 0 ],
      [ Opcodes.end ],

      // return dst
      [ Opcodes.local_get, 3 ]
    ]
  };

  _.__Porffor_funcLut_length = {
    params: [ Valtype.i32 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, { allocLargePage, funcs }) => [
      [ Opcodes.local_get, 0 ],
      [ null, () => [
        number(funcs.bytesPerFuncLut(), Valtype.i32)
      ] ],
      [ Opcodes.i32_mul ],
      [ Opcodes.i32_load16_u, 0, ...unsignedLEB128(allocLargePage(scope, '#func lut')) ]
    ],
    table: true
  };

  _.__Porffor_funcLut_flags = {
    params: [ Valtype.i32 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, { allocLargePage, funcs }) => [
      [ Opcodes.local_get, 0 ],
      [ null, () => [
        number(funcs.bytesPerFuncLut(), Valtype.i32)
      ] ],
      [ Opcodes.i32_mul ],
      number(2, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(allocLargePage(scope, '#func lut')) ]
    ],
    table: true
  };

  _.__Porffor_funcLut_name = {
    params: [ Valtype.i32 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.bytestring,
    wasm: (scope, { allocLargePage, funcs }) => [
      [ Opcodes.local_get, 0 ],
      [ null, () => [
        number(funcs.bytesPerFuncLut(), Valtype.i32)
      ] ],
      [ Opcodes.i32_mul ],
      number(3, Valtype.i32),
      [ Opcodes.i32_add ],
      number(allocLargePage(scope, '#func lut'), Valtype.i32),
      [ Opcodes.i32_add ]
    ],
    table: true
  };

  _.__Porffor_number_getExponent = {
    params: [ Valtype.f64 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: () => [
      // extract exponent bits from f64 with bit manipulation
      [ Opcodes.local_get, 0 ],
      [ Opcodes.i64_reinterpret_f64 ],
      number(52, Valtype.i64),
      [ Opcodes.i64_shr_u ],
      number(0x7FF, Valtype.i64),
      [ Opcodes.i64_and ],
      [ Opcodes.i32_wrap_i64 ],
      number(1023, Valtype.i32),
      [ Opcodes.i32_sub ]
    ]
  };

  _.__Porffor_bigint_fromU64 = {
    params: [ Valtype.i64 ],
    locals: [ Valtype.i32, Valtype.i32, Valtype.i32 ],
    localNames: [ 'x', 'hi', 'lo', 'ptr' ],
    returns: [ Valtype.f64 ],
    returnType: TYPES.bigint,
    wasm: (scope, { builtin }) => [
      // x is u64 so abs(x) = x
      [ Opcodes.local_get, 0 ],
      number(32, Valtype.i64),
      [ Opcodes.i64_shr_u ],
      [ Opcodes.i32_wrap_i64 ],
      [ Opcodes.local_tee, 1 ],

      [ Opcodes.local_get, 0 ],
      [ Opcodes.i32_wrap_i64 ],
      [ Opcodes.local_set, 2 ],

      // if abs(x) < 0x8000000000000, return x as bigint
      number(0x8000000000000 / (2 ** 32), Valtype.i32),
      [ Opcodes.i32_lt_u ],
      [ Opcodes.if, Blocktype.void ],
        [ Opcodes.local_get, 0 ],
        [ Opcodes.f64_convert_i64_u ],
        [ Opcodes.return ],
      [ Opcodes.end ],

      number(16, Valtype.i32),
      [ Opcodes.call, builtin('__Porffor_malloc') ],
      [ Opcodes.local_tee, 3 ],

      // sign is already 0
      // digit count = 2
      number(2, Valtype.i32),
      [ Opcodes.i32_store16, 0, 2 ],

      // hi and lo as digits
      [ Opcodes.local_get, 3 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.i32_store, 0, 4 ],

      [ Opcodes.local_get, 3 ],
      [ Opcodes.local_get, 2 ],
      [ Opcodes.i32_store, 0, 8 ],

      [ Opcodes.local_get, 3 ],
      Opcodes.i32_from_u,
      number(0x8000000000000, Valtype.f64),
      [ Opcodes.f64_add ]
    ]
  };

  _.__Porffor_bigint_fromS64 = {
    params: [ Valtype.i64 ],
    locals: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i64 ],
    localNames: [ 'x', 'hi', 'lo', 'ptr', 'abs' ],
    returns: [ Valtype.f64 ],
    returnType: TYPES.bigint,
    wasm: (scope, { builtin }) => [
      // abs = abs(x) = ((x >> 63) ^ x) - (x >> 63)
      [ Opcodes.local_get, 0 ],
      [ Opcodes.i64_const, 63 ],
      [ Opcodes.i64_shr_s ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.i64_xor ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.i64_const, 63 ],
      [ Opcodes.i64_shr_s ],
      [ Opcodes.i64_sub ],
      [ Opcodes.local_tee, 4 ],

      number(32, Valtype.i64),
      [ Opcodes.i64_shr_u ],
      [ Opcodes.i32_wrap_i64 ],
      [ Opcodes.local_tee, 1 ],

      [ Opcodes.local_get, 4 ],
      [ Opcodes.i32_wrap_i64 ],
      [ Opcodes.local_set, 2 ],

      // if hi < (0x8000000000000 / 2**32), return (hi * 2**32) + lo as bigint
      number(0x8000000000000 / (2 ** 32), Valtype.i32),
      [ Opcodes.i32_lt_u ],
      [ Opcodes.if, Blocktype.void ],
        [ Opcodes.local_get, 0 ],
        [ Opcodes.f64_convert_i64_s ],
        [ Opcodes.return ],
      [ Opcodes.end ],

      number(16, Valtype.i32),
      [ Opcodes.call, builtin('__Porffor_malloc') ],
      [ Opcodes.local_tee, 3 ],

      // sign = x != abs
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 4 ],
      [ Opcodes.i64_ne ],
      [ Opcodes.i32_store8, 0, 0 ],

      // digit count = 2
      [ Opcodes.local_get, 3 ],
      number(2, Valtype.i32),
      [ Opcodes.i32_store16, 0, 2 ],

      // hi and lo as digits
      [ Opcodes.local_get, 3 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.i32_store, 0, 4 ],

      [ Opcodes.local_get, 3 ],
      [ Opcodes.local_get, 2 ],
      [ Opcodes.i32_store, 0, 8 ],

      [ Opcodes.local_get, 3 ],
      Opcodes.i32_from_u,
      number(0x8000000000000, Valtype.f64),
      [ Opcodes.f64_add ]
    ]
  };

  _.__Porffor_bigint_toI64 = {
    params: [ Valtype.f64 ],
    locals: [ Valtype.i32, Valtype.i32 ],
    localNames: [ 'x', 'ptr', 'digits' ],
    returns: [ Valtype.i64 ],
    returnType: TYPES.bigint,
    wasm: () => [
      // if abs(x) < 0x8000000000000, return x as u64
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_abs ],
      number(0x8000000000000, Valtype.f64),
      [ Opcodes.f64_lt ],
      [ Opcodes.if, Blocktype.void ],
        [ Opcodes.local_get, 0 ],
        Opcodes.i64_trunc_sat_f64_s,
        [ Opcodes.return ],
      [ Opcodes.end ],

      [ Opcodes.local_get, 0 ],
      number(0x8000000000000, Valtype.f64),
      [ Opcodes.f64_sub ],
      Opcodes.i32_to_u,
      [ Opcodes.local_tee, 1 ],

      // if sign == 1, * -1, else * 1
      [ Opcodes.i32_load8_u, 0, 0 ],
      [ Opcodes.if, Valtype.i64 ],
        number(-1, Valtype.i64),
      [ Opcodes.else ],
        number(1, Valtype.i64),
      [ Opcodes.end ],

      // move ptr to final 2 digits
      [ Opcodes.local_get, 1 ],
      [ Opcodes.i32_load16_u, 0, 2 ],
      [ Opcodes.local_tee, 2 ],
      [ Opcodes.i32_const, 2 ],
      [ Opcodes.i32_gt_u ],
      [ Opcodes.if, Blocktype.void ],
        [ Opcodes.local_get, 2 ],
        [ Opcodes.i32_const, 2 ],
        [ Opcodes.i32_sub ],
        [ Opcodes.i32_const, 4 ],
        [ Opcodes.i32_mul ],
        [ Opcodes.local_get, 1 ],
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, 1 ],
      [ Opcodes.end ],

      [ Opcodes.local_get, 1 ],
      [ Opcodes.i32_load, 0, 4 ],
      [ Opcodes.i64_extend_i32_u ],
      [ Opcodes.i64_const, 128, 128, 128, 128, 16 ], // todo: fix >2**32 for regular seb 128 encoding
      [ Opcodes.i64_mul ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.i32_load, 0, 8 ],
      [ Opcodes.i64_extend_i32_u ],
      [ Opcodes.i64_add ],
      [ Opcodes.i64_mul ] // * sign earlier
    ]
  };

  _.__Porffor_memorySize = {
    params: [],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: () => [
      [ Opcodes.memory_size, 0 ],
      number(PageSize, Valtype.i32),
      [ Opcodes.i32_mul ]
    ]
  };

  // allow non-comptime redefinition later in precompiled
  const comptime = (name, returnType, comptime, jsLength = 0) => {
    let v = {
      returnType,
      comptime,
      jsLength,
      params: [],
      locals: [],
      returns: []
    };

    Object.defineProperty(_, name, {
      get() {
        return v;
      },
      set(x) {
        // v = { ...x, comptime, returnType };
        x.comptime = comptime;
        x.returnType = returnType;
        v = x;
      }
    });
  };

  comptime('__Array_of', TYPES.array, (scope, decl, { generate }) => generate(scope, {
    type: 'ArrayExpression',
    elements: decl.arguments
  }));

  comptime('__Porffor_fastOr', TYPES.boolean, (scope, decl, { generate }) => {
    const out = [];

    for (let i = 0; i < decl.arguments.length; i++) {
      out.push(
        ...generate(scope, decl.arguments[i]),
        Opcodes.i32_to_u,
        ...(i > 0 ? [ [ Opcodes.i32_or ] ] : [])
      );
    }

    out.push(Opcodes.i32_from_u);
    return out;
  });

  comptime('__Porffor_fastAnd', TYPES.boolean, (scope, decl, { generate }) => {
    const out = [];

    for (let i = 0; i < decl.arguments.length; i++) {
      out.push(
        ...generate(scope, decl.arguments[i]),
        Opcodes.i32_to_u,
        ...(i > 0 ? [ [ Opcodes.i32_and ] ] : [])
      );
    }

    out.push(Opcodes.i32_from_u);
    return out;
  });

  comptime('__Math_max', TYPES.number, (scope, decl, { generate }) => {
    const out = [
      number(-Infinity)
    ];

    for (let i = 0; i < decl.arguments.length; i++) {
      out.push(
        ...generate(scope, decl.arguments[i]),
        [ Opcodes.f64_max ]
      );
    }

    return out;
  }, 2);

  comptime('__Math_min', TYPES.number, (scope, decl, { generate }) => {
    const out = [
      number(Infinity)
    ];

    for (let i = 0; i < decl.arguments.length; i++) {
      out.push(
        ...generate(scope, decl.arguments[i]),
        [ Opcodes.f64_min ]
      );
    }

    return out;
  }, 2);

  comptime('__Porffor_printStatic', TYPES.undefined, (scope, decl, { printStaticStr }) => {
    const str = decl.arguments[0].value;
    const out = printStaticStr(scope, str);
    out.push(number(UNDEFINED));
    return out;
  });

  comptime('__Porffor_type', TYPES.number, (scope, decl, { getNodeType }) => [
    ...getNodeType(scope, decl.arguments[0]),
    Opcodes.i32_from_u
  ]);

  comptime('__Porffor_compileType', TYPES.bytestring, (scope, decl, { makeString, knownType, getNodeType }) =>
    makeString(scope, TYPE_NAMES[knownType(scope, getNodeType(scope, decl.arguments[0]))] ?? 'unknown')
  );

  // Porffor.call(func, argArray, this, newTarget)
  comptime('__Porffor_call', undefined, (scope, decl, { generate, getNodeType }) => generate(scope, {
    type: 'CallExpression',
    callee: decl.arguments[0],
    arguments: [ {
      type: 'SpreadElement',
      argument: decl.arguments[1],
    } ],
    _thisWasm: decl.arguments[2].value === null ? null : [
      ...generate(scope, decl.arguments[2]),
      ...getNodeType(scope, decl.arguments[2])
    ],
    _newTargetWasm: decl.arguments[3].value === null ? null : [
      ...generate(scope, decl.arguments[3]),
      ...getNodeType(scope, decl.arguments[3])
    ],
    _new: decl.arguments[3].value !== null,
    _forceCreateThis: true
  }));

  // compile-time aware console.log to optimize fast paths
  // todo: this breaks console.group, etc - disable this if those are used but edge case for now
  comptime('__console_log', TYPES.undefined, (scope, decl, { generate, getNodeType, knownTypeWithGuess, printStaticStr }) => {
    const slow = () => {
      decl._noComptime = true;
      return generate(scope, decl);
    };
    const fast = (name, before = '', after = '\n') => {
      return [
        ...(before ? printStaticStr(scope, before) : []),
        ...(!name ? [ number(UNDEFINED) ] : generate(scope, {
          ...decl,
          callee: {
            type: 'Identifier',
            name
          }
        })),
        ...printStaticStr(scope, after)
      ];
    };

    if (decl.arguments.length === 0) return fast();
    if (decl.arguments.length !== 1) return slow();

    generate(scope, decl.arguments[0]); // generate first to get accurate type
    const type = knownTypeWithGuess(scope, getNodeType(scope, decl.arguments[0]));

    // if we know the type skip the entire print logic, use type's func directly
    if (type === TYPES.string || type === TYPES.bytestring) {
      return fast('__Porffor_printString');
    } else if (type === TYPES.number) {
      return fast('print', '\x1b[33m', '\x1b[0m\n');
    }

    // one arg, skip most of console to avoid rest arg etc
    return fast('__Porffor_consolePrint');
  });

  PrecompiledBuiltins.BuiltinFuncs(_);
  return _;
};