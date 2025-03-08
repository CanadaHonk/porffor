import * as PrecompiledBuiltins from './builtins_precompiled.js';
import ObjectBuiltins from './builtins_objects.js';
import { PageSize, Blocktype, Opcodes, Valtype } from './wasmSpec.js';
import { TYPES, TYPE_NAMES } from './types.js';
import { number, unsignedLEB128 } from './encoding.js';
import './prefs.js';

export const importedFuncs = [
  {
    name: 'print',
    import: 'p',
    params: 1,
    returns: 0
  },
  {
    name: 'printChar',
    import: 'c',
    params: 1,
    returns: 0
  },
  {
    name: 'time',
    import: 't',
    params: 0,
    returns: 1
  },
  {
    name: 'timeOrigin',
    import: 'u',
    params: 0,
    returns: 1
  },
  {
    name: 'profile1',
    import: 'y',
    params: [ Valtype.i32 ],
    returns: 0
  },
  {
    name: 'profile2',
    import: 'z',
    params: [ Valtype.i32 ],
    returns: 0
  },
  {
    name: '__Porffor_readArgv',
    import: 'w',
    params: 2,
    returns: 1
  },
  {
    name: '__Porffor_readFile',
    import: 'q',
    params: 2,
    returns: 1
  }
];

for (let i = 0; i < importedFuncs.length; i++) {
  const f = importedFuncs[i];
  importedFuncs[f.name] = i;
}

export const UNDEFINED = 0;
export const NULL = 0;

export const BuiltinVars = function(ctx) {
  this.undefined = [ number(UNDEFINED) ];
  this.undefined.type = TYPES.undefined;

  this.null = [ number(NULL) ];
  this.null.type = TYPES.object;

  this.NaN = [ number(NaN) ];
  this.NaN.floatOnly = true;

  this.Infinity = [ number(Infinity) ];
  this.Infinity.floatOnly = true;

  for (const x in TYPES) {
    this['__Porffor_TYPES_' + x] = () => [ number(TYPES[x]) ];
  }

  this.__performance_timeOrigin = [
    [ Opcodes.call, importedFuncs.timeOrigin ]
  ];
  this.__performance_timeOrigin.usesImports = true;

  this.__Uint8Array_BYTES_PER_ELEMENT = [ number(1) ];
  this.__Int8Array_BYTES_PER_ELEMENT = [ number(1) ];
  this.__Uint8ClampedArray_BYTES_PER_ELEMENT = [ number(1) ];
  this.__Uint16Array_BYTES_PER_ELEMENT = [ number(2) ];
  this.__Int16Array_BYTES_PER_ELEMENT = [ number(2) ];
  this.__Uint32Array_BYTES_PER_ELEMENT = [ number(4) ];
  this.__Int32Array_BYTES_PER_ELEMENT = [ number(4) ];
  this.__Float32Array_BYTES_PER_ELEMENT = [ number(4) ];
  this.__Float64Array_BYTES_PER_ELEMENT = [ number(8) ];

  ObjectBuiltins.call(this, ctx, Prefs);
};

export const BuiltinFuncs = function() {
  this.isNaN = {
    floatOnly: true,
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
    floatOnly: true,
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
    floatOnly: true,
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
    floatOnly: true,
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
    floatOnly: true,
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
    floatOnly: true,
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
  const prng = ({
    'lcg32': {
      globals: [ Valtype.i32 ],
      locals: [],
      returns: Valtype.i32,
      wasm: [
        // use glibc/musl's constants
        // seed = (MULTIPLIER * seed + INCREMENT) % MODULUS
        [ Opcodes.global_get, 0 ],
        number(1103515245, Valtype.i32),
        [ Opcodes.i32_mul ],

        // + INCREMENT
        number(12345, Valtype.i32),
        [ Opcodes.i32_add ],

        // % MODULUS
        number(0x7fffffff, Valtype.i32),
        [ Opcodes.i32_and ],

        // state0 =
        [ Opcodes.global_set, 0 ],

        // state0
        [ Opcodes.global_get, 0 ],
      ],
    },

    'xorshift32+': {
      globals: [ Valtype.i32 ],
      locals: [ Valtype.i32 ],
      returns: Valtype.i32,
      wasm: [
        // setup: s1 = state0
        [ Opcodes.global_get, 0 ], // state0
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
        [ Opcodes.global_set, 0 ],

        // s1
        [ Opcodes.local_get, 0 ],
      ],
    },

    'xorshift64+': {
      globals: [ Valtype.i64 ],
      locals: [ Valtype.i64 ],
      returns: Valtype.i64,
      wasm: [
        // setup: s1 = state0
        [ Opcodes.global_get, 0 ], // state0
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
        [ Opcodes.global_set, 0 ],

        // s1
        [ Opcodes.local_get, 0 ],
      ],
    },

    'xorshift128+': {
      globals: [ Valtype.i64, Valtype.i64 ],
      locals: [ Valtype.i64, Valtype.i64 ],
      returns: Valtype.i64,
      wasm: [
        // setup: s1 = state0, s0 = state1, state0 = s0
        [ Opcodes.global_get, 0 ], // state0
        [ Opcodes.local_tee, 0 ], // s1
        [ Opcodes.global_get, 1 ], // state1
        [ Opcodes.local_tee, 1, ], // s0
        [ Opcodes.global_set, 0 ], // state0

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
        [ Opcodes.global_set, 1 ],

        // state1 + s0
        [ Opcodes.global_get, 1 ], // state1
        [ Opcodes.local_get, 1 ], // s0
        [ Opcodes.i64_add ]
      ]
    },

    'xoroshiro128+': {
      globals: [ Valtype.i64, Valtype.i64 ],
      locals: [ Valtype.i64, Valtype.i64, Valtype.i64 ],
      returns: Valtype.i64,
      wasm: [
        // setup: s1 = state1, s0 = state0
        [ Opcodes.global_get, 1 ], // state0
        [ Opcodes.local_tee, 0 ], // s1
        [ Opcodes.global_get, 0 ], // state1
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
        [ Opcodes.global_set, 0 ], // state0

        // state1 = rotl(s1, 37)
        [ Opcodes.local_get, 0 ], // s1
        number(37, Valtype.i64),
        [ Opcodes.i64_rotl ],
        [ Opcodes.global_set, 1 ], // state1

        // result
        [ Opcodes.local_get, 2 ],
      ]
    },

    'xoshiro128+': {
      globals: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32 ],
      locals: [ Valtype.i32, Valtype.i32 ],
      returns: Valtype.i32,
      wasm: [
        // result = state0 + state3
        [ Opcodes.global_get, 0 ], // state0
        [ Opcodes.global_get, 3 ], // state0
        [ Opcodes.i32_add ],
        [ Opcodes.local_set, 0 ], // result

        // t = state1 << 9
        [ Opcodes.global_get, 1 ], // state1
        number(9, Valtype.i32),
        [ Opcodes.i32_shl ],
        [ Opcodes.local_set, 1 ], // t

        // state2 ^= state0
        [ Opcodes.global_get, 2 ], // state2
        [ Opcodes.global_get, 0 ], // state0
        [ Opcodes.i32_xor ],
        [ Opcodes.global_set, 2 ], // state2

        // state3 ^= state1
        [ Opcodes.global_get, 3 ], // state3
        [ Opcodes.global_get, 1 ], // state1
        [ Opcodes.i32_xor ],
        [ Opcodes.global_set, 3 ], // state3

        // state1 ^= state2
        [ Opcodes.global_get, 1 ], // state1
        [ Opcodes.global_get, 2 ], // state2
        [ Opcodes.i32_xor ],
        [ Opcodes.global_set, 1 ], // state1

        // state0 ^= state3
        [ Opcodes.global_get, 0 ], // state2
        [ Opcodes.global_get, 3 ], // state0
        [ Opcodes.i32_xor ],
        [ Opcodes.global_set, 0 ], // state2

        // state2 ^= t
        [ Opcodes.global_get, 2 ], // state2
        [ Opcodes.local_get, 1 ], // t
        [ Opcodes.i32_xor ],
        [ Opcodes.global_set, 2 ], // state2

        // state3 = rotl(state3, 11)
        [ Opcodes.global_get, 3 ], // state3
        number(11, Valtype.i32),
        [ Opcodes.i32_rotl ],
        [ Opcodes.global_set, 3 ], // state3

        // result
        [ Opcodes.local_get, 0 ],
      ]
    }
  })[Prefs.prng ?? 'xorshift128+'];

  if (!prng) throw new Error(`unknown prng algo: ${Prefs.prng}`);

  this.__Math_random = {
    floatOnly: true,
    params: [],
    locals: prng.locals,
    localNames: [ 's1', 's0' ],
    globals: prng.globals,
    globalNames: [ 'state0', 'state1' ],
    globalInits: [ prngSeed0, prngSeed1 ],
    returns: [ Valtype.f64 ],
    returnType: TYPES.number,
    wasm: [
      ...prng.wasm,

      // you thought it was over? now we need the result as a f64 between 0-1 :)

      // should we >> 12 here?
      // it feels like it but it breaks values

      // | 0x3FF0000000000000
      // [ Opcodes.i64_const, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0xf8, 0x3f ],
      // [ Opcodes.i64_or ],

      // bit cast as f64
      // [ Opcodes.f64_reinterpret_i64 ],

      // - 1
      // number(1),
      // [ Opcodes.f64_sub ],

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
    params: [],
    locals: prng.locals,
    localNames: [ 's1', 's0' ],
    globals: prng.globals,
    globalNames: [ 'state0', 'state1' ],
    globalInits: [ prngSeed0, prngSeed1 ],
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: [
      ...prng.wasm,

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
    floatOnly: true,
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
    floatOnly: true,
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
    floatOnly: true,
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
    floatOnly: true,
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
    floatOnly: true,
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
      // dst
      [ Opcodes.local_get, 1 ],

      // src
      [ Opcodes.local_get, 0 ],

      // size = pageSize
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
      globals: [ Valtype.i32, Valtype.i32 ],
      globalNames: [ 'chunkPtr', 'chunkOffset' ],
      globalInits: [ 0, 100 * PageSize ],
      returns: [ Valtype.i32 ],
      returnType: TYPES.number,
      wasm: [
        // if chunkOffset >= chunks:
        [ Opcodes.global_get, 1 ],
        number(PageSize * (Prefs.allocatorChunks ?? 16), Valtype.i32),
        [ Opcodes.i32_ge_s ],
        [ Opcodes.if, Valtype.i32 ],
          // chunkOffset = 1 page
          number(pageSize, Valtype.i32),
          [ Opcodes.global_set, 1 ],

          // return chunkPtr = allocated
          number(Prefs.allocatorChunks ?? 16, Valtype.i32),
          [ Opcodes.memory_grow, 0 ],
          number(PageSize, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.global_set, 0 ],
          [ Opcodes.global_get, 0 ],
        [ Opcodes.else ],
          // return chunkPtr + chunkOffset
          [ Opcodes.global_get, 0 ],
          [ Opcodes.global_get, 1 ],
          [ Opcodes.i32_add ],

          // chunkOffset += 1 page
          number(pageSize, Valtype.i32),
          [ Opcodes.global_get, 1 ],
          [ Opcodes.i32_add ],
          [ Opcodes.global_set, 1 ],
        [ Opcodes.end ]
      ]
    }
  })[Prefs.allocator ?? 'chunk'];

  this.__Porffor_allocateBytes = {
    params: [ Valtype.i32 ],
    locals: [],
    globals: [ Valtype.i32, Valtype.i32 ],
    globalNames: [ 'currentPtr', 'bytesWritten' ],
    globalInits: [ 0, pageSize ], // init to pageSize so we always allocate on first call
    returns: [ Valtype.i32 ],
    returnType: TYPES.number,
    wasm: (scope, { builtin }) => [
      // if bytesWritten >= pageSize:
      [ Opcodes.global_get, 1 ],
      number(pageSize, Valtype.i32),
      [ Opcodes.i32_ge_s ],
      [ Opcodes.if, Valtype.i32 ],
        // bytesWritten = bytesToAllocate
        [ Opcodes.local_get, 0 ],
        [ Opcodes.global_set, 1 ],

        // return currentPtr = newly allocated page
        [ Opcodes.call, builtin('__Porffor_allocate') ],
        [ Opcodes.global_set, 0 ],
        [ Opcodes.global_get, 0 ],
      [ Opcodes.else ],
        // return currentPtr + bytesWritten
        [ Opcodes.global_get, 0 ],
        [ Opcodes.global_get, 1 ],
        [ Opcodes.i32_add ],

        // bytesWritten += bytesToAllocate
        [ Opcodes.local_get, 0 ],
        [ Opcodes.global_get, 1 ],
        [ Opcodes.i32_add ],
        [ Opcodes.global_set, 1 ],
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


  PrecompiledBuiltins.BuiltinFuncs.call(this);
};