import * as PrecompiledBuiltins from './builtins_precompiled.js';
import ObjectBuiltins from './builtins_objects.js';
import { PageSize, Blocktype, Opcodes, Valtype } from './wasmSpec.js';
import { TYPES, TYPE_NAMES } from './types.js';
import { number, unsignedLEB128 } from './encoding.js';
import './prefs.js';

export const importedFuncs = {};
Object.defineProperty(importedFuncs, 'length', { configurable: true, writable: true, value: 0 });

export const createImport = (name, params, returns, js = null, c = null) => {
  const lazy = () => {
    if (typeof params === 'function') params = params();
    if (typeof returns === 'function') returns = returns();
    if (typeof params === 'number') params = new Array(params).fill(valtypeBinary);
    if (typeof returns === 'number') returns = new Array(returns).fill(valtypeBinary);
  };

  if (name in importedFuncs) {
    // overwrite existing import
    const existing = importedFuncs[name];
    lazy();

    existing.params = params;
    existing.returns = returns;
    existing.js = js;
    existing.c = c;
    return;
  }

  const call = importedFuncs.length;
  const ident = String.fromCharCode(97 + importedFuncs.length);
  let obj;
  const get = () => {
    if (obj) return obj;
    lazy();

    obj = new Number(call);
    obj.name = name;
    obj.import = ident;
    obj.params = params;
    obj.returns = returns;
    obj.js = js;
    obj.c = c;
    return obj;
  };

  Object.defineProperty(importedFuncs, name, {
    get,
    configurable: true,
    enumerable: true
  });
  Object.defineProperty(importedFuncs, call, {
    get,
    configurable: true
  });
  importedFuncs.length = call + 1;
};

export const UNDEFINED = 0;
export const NULL = 0;

export const BuiltinVars = function(ctx) {
  this.undefined = () => [ number(UNDEFINED) ];
  this.undefined.type = TYPES.undefined;

  this.null = () => [ number(NULL) ];
  this.null.type = TYPES.object;

  this.NaN = () => [ number(NaN) ];
  this.Infinity = () => [ number(Infinity) ];

  for (const x in TYPES) {
    this['__Porffor_TYPES_' + x] = () => [ number(TYPES[x]) ];
  }

  this.__performance_timeOrigin = [
    [ Opcodes.call, importedFuncs.timeOrigin ]
  ];
  this.__performance_timeOrigin.usesImports = true;

  this.__Uint8Array_BYTES_PER_ELEMENT = () => [ number(1) ];
  this.__Int8Array_BYTES_PER_ELEMENT = () => [ number(1) ];
  this.__Uint8ClampedArray_BYTES_PER_ELEMENT = () => [ number(1) ];
  this.__Uint16Array_BYTES_PER_ELEMENT = () => [ number(2) ];
  this.__Int16Array_BYTES_PER_ELEMENT = () => [ number(2) ];
  this.__Uint32Array_BYTES_PER_ELEMENT = () => [ number(4) ];
  this.__Int32Array_BYTES_PER_ELEMENT = () => [ number(4) ];
  this.__Float32Array_BYTES_PER_ELEMENT = () => [ number(4) ];
  this.__Float64Array_BYTES_PER_ELEMENT = () => [ number(8) ];
  this.__BigInt64Array_BYTES_PER_ELEMENT = () => [ number(8) ];
  this.__BigUint64Array_BYTES_PER_ELEMENT = () => [ number(8) ];

  // well-known symbols
  for (const x of [
    'asyncIterator', 'hasInstance',
    'isConcatSpreadable', 'iterator',
    'match', 'matchAll', 'replace',
    'search', 'species', 'split',
    'toPrimitive', 'toStringTag', 'unscopables',
    'dispose', 'asyncDispose'
  ]) {
    this[`__Symbol_${x}`] = (scope, { glbl, builtin, makeString }) => [
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
    this[`__Symbol_${x}`].type = TYPES.symbol;
  }

  ObjectBuiltins.call(this, ctx, Prefs);
};

export const BuiltinFuncs = function() {
  this.isNaN = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_ne ],
      Opcodes.i32_from
    ]
  };
  this.__Number_isNaN = this.isNaN;

  this.isFinite = {
    params: [ valtypeBinary ],
    locals: [ valtypeBinary ],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_sub ],
      [ Opcodes.local_tee, 1 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.f64_eq ],
      Opcodes.i32_from
    ]
  };
  this.__Number_isFinite = this.isFinite;

  // todo: should be false for +-Infinity
  this.__Number_isInteger = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_trunc ],
      [ Opcodes.f64_eq ],
      Opcodes.i32_from
    ]
  };

  this.__Number_isSafeInteger = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: [
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
    this[`__Math_${name}`] = {
      params: [ Valtype.f64 ],
      locals: [],
      returns: [ Valtype.f64 ],
      returnType: TYPES.number,
      wasm: [
        ...prefix,
        [ op ]
      ]
    };
  }

  // todo: does not follow spec with +-Infinity and values >2**32
  this.__Math_clz32 = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_to_u,
      [ Opcodes.i32_clz ],
      Opcodes.i32_from
    ]
  };

  this.__Math_fround = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f32_demote_f64 ],
      [ Opcodes.f64_promote_f32 ]
    ]
  };

  // todo: this does not overflow correctly
  this.__Math_imul = {
    params: [ valtypeBinary, valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
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

  this.__Math_random = {
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

  this.__Porffor_randomByte = {
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

  this.__Math_radians = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
      [ Opcodes.local_get, 0 ],
      number(Math.PI / 180),
      [ Opcodes.f64_mul ]
    ]
  };

  this.__Math_degrees = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
      [ Opcodes.local_get, 0 ],
      number(180 / Math.PI),
      [ Opcodes.f64_mul ]
    ]
  };

  this.__Math_clamp = {
    params: [ valtypeBinary, valtypeBinary, valtypeBinary ],
    locals: [],
    localNames: [ 'x', 'lower', 'upper' ],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 1 ],
      [ Opcodes.f64_max ],
      [ Opcodes.local_get, 2 ],
      [ Opcodes.f64_min ]
    ]
  };

  this.__Math_scale = {
    params: [ valtypeBinary, valtypeBinary, valtypeBinary, valtypeBinary, valtypeBinary ],
    locals: [],
    localNames: [ 'x', 'inLow', 'inHigh', 'outLow', 'outHigh' ],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
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
  this.__Math_signbit = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.boolean,
    wasm: [
      [ Opcodes.local_get, 0 ],
      number(0),
      [ Opcodes.f64_le ],
      Opcodes.i32_from
    ]
  };


  this.__performance_now = {
    params: [],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.number,
    wasm: [
      [ Opcodes.call, importedFuncs.time ]
    ]
  };
  this.__performance_now.usesImports = true;


  this.__Porffor_typeName = {
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

  this.__Porffor_clone = {
    params: [ Valtype.i32, Valtype.i32 ],
    locals: [],
    returns: [],
    returnType: TYPES.undefined,
    wasm: [
      [ Opcodes.local_get, 1 ],
      [ Opcodes.local_get, 0 ],
      number(pageSize, Valtype.i32),
      [ ...Opcodes.memory_copy, 0x00, 0x00 ],
    ]
  };

  this.__Porffor_allocate = ({
    oneshot: {
      params: [],
      locals: [],
      returns: [ Valtype.i32 ],
      returnType: TYPES.number,
      wasm: [
        number(1, Valtype.i32),
        [ Opcodes.memory_grow, 0 ],
        number(PageSize, Valtype.i32),
        [ Opcodes.i32_mul ]
      ]
    },
    chunk: {
      params: [],
      locals: [],
      globalInits: { chunkPtr: 0, chunkOffset: 100 * PageSize },
      returns: [ Valtype.i32 ],
      returnType: TYPES.number,
      wasm: (scope, { glbl }) => [
        // if chunkOffset >= chunks:
        ...glbl(Opcodes.global_get, 'chunkOffset', Valtype.i32),
        number(PageSize * (Prefs.allocatorChunks ?? 16), Valtype.i32),
        [ Opcodes.i32_ge_s ],
        [ Opcodes.if, Valtype.i32 ],
          // chunkOffset = 1 page
          number(pageSize, Valtype.i32),
          ...glbl(Opcodes.global_set, 'chunkOffset', Valtype.i32),

          // return chunkPtr = allocated
          number(Prefs.allocatorChunks ?? 16, Valtype.i32),
          [ Opcodes.memory_grow, 0 ],
          number(PageSize, Valtype.i32),
          [ Opcodes.i32_mul ],
          ...glbl(Opcodes.global_set, 'chunkPtr', Valtype.i32),
          ...glbl(Opcodes.global_get, 'chunkPtr', Valtype.i32),
        [ Opcodes.else ],
          // return chunkPtr + chunkOffset
          ...glbl(Opcodes.global_get, 'chunkPtr', Valtype.i32),
          ...glbl(Opcodes.global_get, 'chunkOffset', Valtype.i32),
          [ Opcodes.i32_add ],

          // chunkOffset += 1 page
          number(pageSize, Valtype.i32),
          ...glbl(Opcodes.global_get, 'chunkOffset', Valtype.i32),
          [ Opcodes.i32_add ],
          ...glbl(Opcodes.global_set, 'chunkOffset', Valtype.i32),
        [ Opcodes.end ]
      ]
    }
  })[Prefs.allocator ?? 'chunk'];

  this.__Porffor_allocateBytes = {
    params: [ Valtype.i32 ],
    locals: [],
    globalInits: { currentPtr: 0, bytesWritten: pageSize }, // init to pageSize so we always allocate on first call
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, { builtin, glbl }) => [
      // if bytesWritten >= pageSize:
      ...glbl(Opcodes.global_get, 'bytesWritten', Valtype.i32),
      number(pageSize, Valtype.i32),
      [ Opcodes.i32_ge_s ],
      [ Opcodes.if, Valtype.i32 ],
        // bytesWritten = bytesToAllocate
        [ Opcodes.local_get, 0 ],
        ...glbl(Opcodes.global_set, 'bytesWritten', Valtype.i32),

        // return currentPtr = newly allocated page
        [ Opcodes.call, builtin('__Porffor_allocate') ],
        ...glbl(Opcodes.global_set, 'currentPtr', Valtype.i32),
        ...glbl(Opcodes.global_get, 'currentPtr', Valtype.i32),
      [ Opcodes.else ],
        // return currentPtr + bytesWritten
        ...glbl(Opcodes.global_get, 'currentPtr', Valtype.i32),
        ...glbl(Opcodes.global_get, 'bytesWritten', Valtype.i32),
        [ Opcodes.i32_add ],

        // bytesWritten += bytesToAllocate
        [ Opcodes.local_get, 0 ],
        ...glbl(Opcodes.global_get, 'bytesWritten', Valtype.i32),
        [ Opcodes.i32_add ],
        ...glbl(Opcodes.global_set, 'bytesWritten', Valtype.i32),
      [ Opcodes.end ]
    ]
  };

  this.__Porffor_bytestringToString = {
    params: [ Valtype.i32 ],
    locals: [ Valtype.i32, Valtype.i32, Valtype.i32 ],
    localNames: [ 'src', 'len', 'counter', 'dst' ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.string,
    wasm: (scope, { builtin }) => [
      // dst = allocate
      [ Opcodes.call, builtin('__Porffor_allocate') ],
      [ Opcodes.local_tee, 3 ],

      // dst.length = src.length
      [ Opcodes.local_get, 0 ],
      [ Opcodes.i32_load, 0, 0 ],
      [ Opcodes.local_tee, 1 ],
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

  this.__Porffor_funcLut_length = {
    params: [ Valtype.i32 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, { allocPage }) => [
      [ Opcodes.local_get, 0 ],
      number(48, Valtype.i32),
      [ Opcodes.i32_mul ],
      [ Opcodes.i32_load16_u, 0, ...unsignedLEB128(allocPage(scope, 'func lut')) ]
    ],
    table: true
  };

  this.__Porffor_funcLut_flags = {
    params: [ Valtype.i32 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, { allocPage }) => [
      [ Opcodes.local_get, 0 ],
      number(48, Valtype.i32),
      [ Opcodes.i32_mul ],
      number(2, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(allocPage(scope, 'func lut')) ]
    ],
    table: true
  };

  this.__Porffor_funcLut_name = {
    params: [ Valtype.i32 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.bytestring,
    wasm: (scope, { allocPage }) => [
      [ Opcodes.local_get, 0 ],
      number(48, Valtype.i32),
      [ Opcodes.i32_mul ],
      number(3, Valtype.i32),
      [ Opcodes.i32_add ],
      number(allocPage(scope, 'func lut'), Valtype.i32),
      [ Opcodes.i32_add ]
    ],
    table: true
  };

  this.__Porffor_number_getExponent = {
    params: [ Valtype.f64 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: [
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

  this.__Porffor_bigint_fromU64 = {
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
      [ Opcodes.call, builtin('__Porffor_allocateBytes') ],
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

  this.__Porffor_bigint_fromS64 = {
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
      [ Opcodes.call, builtin('__Porffor_allocateBytes') ],
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

  this.__Porffor_bigint_toI64 = {
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

  PrecompiledBuiltins.BuiltinFuncs.call(this);
};