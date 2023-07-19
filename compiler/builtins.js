import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";
import { number, i32x4 } from "./embedding.js";
import { signedLEB128 } from "./encoding.js";

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
    name: 'assert',
    import: 'a',
    params: 1,
    returns: 0
  },
  {
    name: 'time',
    import: 't',
    params: 0,
    returns: 1
  }
];

for (let i = 0; i < importedFuncs.length; i++) {
  const f = importedFuncs[i];
  importedFuncs[f.name] = i;
}

const char = c => number(c.charCodeAt(0));

// todo: somehow diff between these (undefined != null) while remaining falsey in wasm as a number value
export const UNDEFINED = 0;
export const NULL = 0;

export const BuiltinVars = function() {
  this.undefined = number(UNDEFINED);
  this.undefined.type = 'undefined';

  this.null = number(NULL);
  this.null.type = 'object';

  this.NaN = number(NaN);
  this.NaN.floatOnly = true;

  this.Infinity = number(Infinity);
  this.Infinity.floatOnly = true;

  this.__Number_NaN = number(NaN);
  this.__Number_NaN.floatOnly = true;

  this.__Number_POSITIVE_INFINITY = number(Infinity);
  this.__Number_POSITIVE_INFINITY.floatOnly = true;

  this.__Number_NEGATIVE_INFINITY = number(-Infinity);
  this.__Number_NEGATIVE_INFINITY.floatOnly = true;

  switch (valtype) {
    case 'i32':
      this.__Number_MAX_VALUE = number(2147483647);
      this.__Number_MIN_VALUE = number(-2147483648);

      this.__Number_MAX_SAFE_INTEGER = this.__Number_MAX_VALUE;
      this.__Number_MIN_SAFE_INTEGER = this.__Number_MIN_VALUE;

      break;

    case 'i64':
      // todo: we use 32 bit limits here as we cannot encode 64 bit integers yet
      this.__Number_MAX_VALUE = number(2147483647);
      this.__Number_MIN_VALUE = number(-2147483648);

      this.__Number_MAX_SAFE_INTEGER = this.__Number_MAX_VALUE;
      this.__Number_MIN_SAFE_INTEGER = this.__Number_MIN_VALUE;

      break;

    case 'f64':
      this.__Number_MAX_VALUE = number(1.7976931348623157e+308);
      this.__Number_MIN_VALUE = number(5e-324);

      this.__Number_MAX_SAFE_INTEGER = number(9007199254740991);
      this.__Number_MIN_SAFE_INTEGER = number(-9007199254740991);

      this.__Number_EPSILON = number(2.220446049250313e-16);

      // https://github.com/rwaldron/proposal-math-extensions/issues/10
      this.__Math_RAD_PER_DEG = number(Math.PI / 180);
      this.__Math_DEG_PER_RAD = number(180 / Math.PI);

      break;
  }

  // stubs just so that parent objects exist
  this.Math = number(1);
};

export const BuiltinFuncs = function() {
  this['f64_%'] = {
    params: [ valtypeBinary, valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [ // x - truncf(x / y) * y
      [ Opcodes.local_get, 0 ], // x

      [ Opcodes.local_get, 0 ], // x
      [ Opcodes.local_get, 1 ], // y

      [ Opcodes.f64_div ],
      [ Opcodes.f64_trunc ],

      [ Opcodes.local_get, 1 ], // y
      [ Opcodes.f64_mul ],

      [ Opcodes.f64_sub ]
    ]
  };

  // add bitwise ops by converting operands to i32 first
  for (const [ char, op ] of [ ['&', Opcodes.i32_and], ['|', Opcodes.i32_or], ['^', Opcodes.i32_xor], ['<<', Opcodes.i32_shl], ['>>', Opcodes.i32_shr_s] ]) {
    this[`f64_${char}`] = {
      params: [ valtypeBinary, valtypeBinary ],
      locals: [],
      returns: [ valtypeBinary ],
      wasm: [
        [ Opcodes.local_get, 0 ],
        Opcodes.i32_to,

        [ Opcodes.local_get, 1 ],
        Opcodes.i32_to,

        [ op ],
        Opcodes.i32_from
      ]
    };
  }


  // just echo given for now, for type constructors
  this.Number = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ]
    ]
  };

  // todo: return false for NaN
  this.Boolean = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: 'boolean',
    wasm: [
      [ Opcodes.local_get, 0 ],
      ...(valtype === 'f64' ? [
        ...number(0),
        [ Opcodes.f64_ne ]
      ] : [
        ...Opcodes.eqz,
        [ Opcodes.i32_eqz ]
      ]),
      Opcodes.i32_from
    ]
  };

  // just return given (default 0) for (new) Object() as we somewhat supports object just not constructor
  this.Object = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: 'object',
    wasm: [
      [ Opcodes.local_get, 0 ]
    ]
  };


  this.__console_log = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.call, importedFuncs.print ],
      ...char('\n'),
      [ Opcodes.call, importedFuncs.printChar ]
    ]
  };

  // todo: add more console funcs


  this.isNaN = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: 'boolean',
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
    returnType: 'boolean',
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
    returnType: 'boolean',
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
    returnType: 'boolean',
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_trunc ],
      [ Opcodes.f64_ne ],
      [ Opcodes.if, Blocktype.void ],
      ...number(0),
      [ Opcodes.return ],
      [ Opcodes.end ],
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_abs ],
      ...number(9007199254740991),
      [ Opcodes.f64_le ],
      Opcodes.i32_from
    ]
  };


  this.__Math_sqrt = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_sqrt ]
    ]
  };

  this.__Math_abs = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_abs ]
    ]
  };

  this.__Math_sign = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      ...number(1),
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_copysign ]
    ]
  };

  this.__Math_floor = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_floor ]
    ]
  };

  this.__Math_ceil = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_ceil ]
    ]
  };

  this.__Math_round = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_nearest ]
    ]
  };

  this.__Math_trunc = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.f64_trunc ]
    ]
  };

  // todo: does not follow spec with +-Infinity and values >2**32
  this.__Math_clz32 = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_trunc_sat_f64_u,
      [ Opcodes.i32_clz ],
      Opcodes.i32_from
    ]
  };

  this.__Math_fround = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
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
    wasm: [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_trunc_sat_f64_s,
      [ Opcodes.local_get, 1 ],
      Opcodes.i32_trunc_sat_f64_s,
      [ Opcodes.i32_mul ],
      Opcodes.i32_from
    ]
  };

  // this is an implementation of xorshift128+ (in wasm bytecode)
  // fun fact: v8, SM, JSC also use this (you will need this fun fact to maintain your sanity reading this code)
  const prngSeed0 = Math.floor(Math.random() * (2 ** 30)), prngSeed1 = Math.floor(Math.random() * (2 ** 30));

  this.__Math_random = {
    floatOnly: true,
    params: [],
    locals: [ Valtype.i64, Valtype.i64 ],
    localNames: [ 's1', 's0' ],
    globals: [ Valtype.i64, Valtype.i64 ],
    globalNames: [ 'state0', 'state1' ],
    globalInits: [ prngSeed0, prngSeed1 ],
    returns: [ Valtype.f64 ],
    wasm: [
      // setup: s1 = state0, s0 = state1, state0 = s0
      [ Opcodes.global_get, 0 ], // state0
      [ Opcodes.local_set, 0 ], // s1
      [ Opcodes.global_get, 1 ], // state1
      [ Opcodes.local_tee, 1, ], // s0
      [ Opcodes.global_set, 0 ], // state0

      // s1 ^= s1 << 23
      [ Opcodes.local_get, 0 ], // s1
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

      // you thought it was over? now we need the result as a f64 between 0-1 :)

      // mantissa = (state1 + s0) & ((1 << 53) - 1)
      [ Opcodes.global_get, 1 ], // state1
      [ Opcodes.local_get, 1 ], // s0
      [ Opcodes.i64_add ],

      [ Opcodes.i64_const, ...signedLEB128((1 << 53) - 1) ],
      [ Opcodes.i64_and ],

      // double(mantissa)
      [ Opcodes.f64_convert_i64_u ],

      // / (1 << 53)
      ...number(1 << 53),
      [ Opcodes.f64_div ]
    ]
  };

  this.__Math_radians = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      ...number(Math.PI / 180),
      [ Opcodes.f64_mul ]
    ]
  };

  this.__Math_degrees = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      ...number(180 / Math.PI),
      [ Opcodes.f64_mul ]
    ]
  };

  this.__Math_clamp = {
    floatOnly: true,
    params: [ valtypeBinary, valtypeBinary, valtypeBinary ],
    locals: [],
    localNames: [ 'x', 'lower', 'upper' ],
    returns: [ valtypeBinary ],
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
    returnType: 'boolean',
    wasm: [
      [ Opcodes.local_get, 0 ],
      ...number(0),
      [ Opcodes.f64_le ],
      Opcodes.i32_from
    ]
  };


  this.__performance_now = {
    params: [],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.call, importedFuncs.time ]
    ]
  };


  this.__SIMD_i32x4_load = {
    params: [ Valtype.i32 ],
    locals: [],
    returns: [ Valtype.v128 ],
    memory: true,
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.v128_load, 0, 0 ]
    ]
  };

  this.__SIMD_i32x4_splat = {
    params: [ Valtype.i32 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.i32x4_splat ],
    ]
  };

  this.__SIMD_i16x8_create = {
    params: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      ...i32x4(0, 0, 0, 0),
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.i16x8_replace_lane, 0 ],
      [ Opcodes.local_get, 1 ],
      [ ...Opcodes.i16x8_replace_lane, 1 ],
      [ Opcodes.local_get, 2 ],
      [ ...Opcodes.i16x8_replace_lane, 2 ],
      [ Opcodes.local_get, 3 ],
      [ ...Opcodes.i16x8_replace_lane, 3 ],
      [ Opcodes.local_get, 4 ],
      [ ...Opcodes.i16x8_replace_lane, 4 ],
      [ Opcodes.local_get, 5 ],
      [ ...Opcodes.i16x8_replace_lane, 5 ],
      [ Opcodes.local_get, 6 ],
      [ ...Opcodes.i16x8_replace_lane, 6 ],
      [ Opcodes.local_get, 7 ],
      [ ...Opcodes.i16x8_replace_lane, 7 ],
    ]
  };

  this.__SIMD_i32x4_dot_i16x8 = {
    params: [ Valtype.v128, Valtype.v128 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 1 ],
      [ ...Opcodes.i32x4_dot_i16x8_s ]
    ]
  };

  this.__SIMD_i32x4_create = {
    params: [ Valtype.i32, Valtype.i32, Valtype.i32, Valtype.i32 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      ...i32x4(0, 0, 0, 0),
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.i32x4_replace_lane, 0 ],
      [ Opcodes.local_get, 1 ],
      [ ...Opcodes.i32x4_replace_lane, 1 ],
      [ Opcodes.local_get, 2 ],
      [ ...Opcodes.i32x4_replace_lane, 2 ],
      [ Opcodes.local_get, 3 ],
      [ ...Opcodes.i32x4_replace_lane, 3 ],
    ]
  };

  this.__SIMD_i32x4_add = {
    params: [ Valtype.v128, Valtype.v128 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 1 ],
      [ ...Opcodes.i32x4_add ]
    ]
  };

  this.__SIMD_i32x4_sub = {
    params: [ Valtype.v128, Valtype.v128 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 1 ],
      [ ...Opcodes.i32x4_sub ]
    ]
  };

  this.__SIMD_i32x4_mul = {
    params: [ Valtype.v128, Valtype.v128 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.local_get, 1 ],
      [ ...Opcodes.i32x4_mul ]
    ]
  };

  this.__SIMD_i32x4_get0 = {
    params: [ Valtype.v128 ],
    locals: [],
    returns: [ Valtype.i32 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.i32x4_extract_lane, 0 ],
    ],
  },

  this.__SIMD_i32x4_get1 = {
    params: [ Valtype.v128 ],
    locals: [],
    returns: [ Valtype.i32 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.i32x4_extract_lane, 1 ],
    ],
  };

  this.__SIMD_i32x4_get2 = {
    params: [ Valtype.v128 ],
    locals: [],
    returns: [ Valtype.i32 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.i32x4_extract_lane, 2 ],
    ],
  };

  this.__SIMD_i32x4_get3 = {
    params: [ Valtype.v128 ],
    locals: [],
    returns: [ Valtype.i32 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.i32x4_extract_lane, 3 ],
    ],
  };

  this.__SIMD_i32x4_shuffle_000c = {
    params: [ Valtype.v128 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      ...i32x4(0, 0, 0, 0),
      [ ...Opcodes.i8x16_shuffle, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 8, 9, 10, 11 ], // i32x4 (a, b, c, d) -> i32x4 (0, 0, 0, c)
    ]
  };

  this.__SIMD_i32x4_shuffle_00ab = {
    params: [ Valtype.v128 ],
    locals: [],
    returns: [ Valtype.v128 ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      ...i32x4(0, 0, 0, 0),
      [ ...Opcodes.i8x16_shuffle, 16, 16, 16, 16, 16, 16, 16, 16, 0, 1, 2, 3, 4, 5, 6, 7 ], // i32x4 (a, b, c, d) -> i32x4 (0, 0, a, b)
    ]
  };
};