import { Blocktype, Opcodes, Valtype, ValtypeSize } from "./wasmSpec.js";
import { number, i32x4 } from "./embedding.js";
import Prefs from './prefs.js';
import * as GeneratedBuiltins from './generated_builtins.js';

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
    name: 'profile1',
    import: 'y',
    params: 1,
    returns: 0
  },
  {
    name: 'profile2',
    import: 'z',
    params: 1,
    returns: 0
  }
];

for (let i = 0; i < importedFuncs.length; i++) {
  const f = importedFuncs[i];
  importedFuncs[f.name] = i;
}

const char = c => number(c.charCodeAt(0));

const printStaticStr = str => {
  const out = [];

  for (let i = 0; i < str.length; i++) {
    out.push(
      // ...number(str.charCodeAt(i)),
      ...number(str.charCodeAt(i), Valtype.i32),
      Opcodes.i32_from_u,
      [ Opcodes.call, importedFuncs.printChar ]
    );
  }

  return out;
};

// todo: somehow diff between these (undefined != null) while remaining falsey in wasm as a number value
export const UNDEFINED = 0;
export const NULL = 0;

export const BuiltinVars = function(TYPES) {
  this.undefined = number(UNDEFINED);
  this.undefined.type = TYPES.undefined;

  this.null = number(NULL);
  this.null.type = TYPES.object;

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

      this.__Math_E = number(Math.E);
      this.__Math_LN10 = number(Math.LN10);
      this.__Math_LN2 = number(Math.LN2);
      this.__Math_LOG10E = number(Math.LOG10E);
      this.__Math_LOG2E = number(Math.LOG2E);
      this.__Math_PI = number(Math.PI);
      this.__Math_SQRT1_2 = number(Math.SQRT1_2);
      this.__Math_SQRT2 = number(Math.SQRT2);

      // https://github.com/rwaldron/proposal-math-extensions/issues/10
      this.__Math_RAD_PER_DEG = number(Math.PI / 180);
      this.__Math_DEG_PER_RAD = number(180 / Math.PI);

      break;
  }

  // stubs just so that parent objects exist
  this.Math = number(1);

  // wintercg(tm)
  this.__navigator_userAgent = (scope, { makeString }) => makeString(scope, `Porffor/0.2.0`, false, '__navigator_userAgent');
  this.__navigator_userAgent.type = Prefs.bytestring ? TYPES._bytestring : TYPES.string;

  for (const x in TYPES) {
    this['__Porffor_TYPES_' + x] = number(TYPES[x]);
  }
};

export const BuiltinFuncs = function(TYPES) {
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
  for (const [ char, op ] of [ ['&', Opcodes.i32_and], ['|', Opcodes.i32_or], ['^', Opcodes.i32_xor], ['<<', Opcodes.i32_shl], ['>>', Opcodes.i32_shr_s], ['>>>', Opcodes.i32_shr_u] ]) {
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

  // just return given (default 0) for (new) Object() as we somewhat supports object just not constructor
  this.Object = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    returnType: TYPES.object,
    wasm: [
      [ Opcodes.local_get, 0 ]
    ]
  };


  this.__console_log = {
    params: [ valtypeBinary, Valtype.i32 ],
    typedParams: true,
    locals: [ Valtype.i32, Valtype.i32 ],
    returns: [],
    wasm: (scope, { typeSwitch }) => [
      ...typeSwitch(scope, [ [ Opcodes.local_get, 1 ] ], {
        [TYPES.number]: [
          [ Opcodes.local_get, 0 ],
          [ Opcodes.call, importedFuncs.print ],
        ],
        [TYPES.boolean]: [
          [ Opcodes.local_get, 0 ],
          Opcodes.i32_to_u,
          [ Opcodes.if, Blocktype.void ],
          ...printStaticStr('true'),
          [ Opcodes.else ],
          ...printStaticStr('false'),
          [ Opcodes.end ]
        ],
        [TYPES.string]: [
          // simply print a string :))
          // cache input pointer as i32
          [ Opcodes.local_get, 0 ],
          Opcodes.i32_to_u,
          [ Opcodes.local_tee, 2 ],

          // make end pointer
          [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
          ...number(ValtypeSize.i16, Valtype.i32),
          [ Opcodes.i32_mul ],

          [ Opcodes.local_get, 2 ],
          [ Opcodes.i32_add ],
          [ Opcodes.local_set, 3 ],

          [ Opcodes.loop, Blocktype.void ],

          // print current char
          [ Opcodes.local_get, 2 ],
          [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],
          Opcodes.i32_from_u,
          [ Opcodes.call, importedFuncs.printChar ],

          // increment pointer by sizeof i16
          [ Opcodes.local_get, 2 ],
          ...number(ValtypeSize.i16, Valtype.i32),
          [ Opcodes.i32_add ],
          [ Opcodes.local_tee, 2 ],

          // if pointer != end pointer, loop
          [ Opcodes.local_get, 3 ],
          [ Opcodes.i32_ne ],
          [ Opcodes.br_if, 0 ],

          [ Opcodes.end ]
        ],
        [TYPES._bytestring]: [
          // simply print a (byte)string :))
          // cache input pointer as i32
          [ Opcodes.local_get, 0 ],
          Opcodes.i32_to_u,
          [ Opcodes.local_tee, 2 ],

          // make end pointer
          [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
          [ Opcodes.local_get, 2 ],
          [ Opcodes.i32_add ],
          [ Opcodes.local_set, 3 ],

          [ Opcodes.loop, Blocktype.void ],

          // print current char
          [ Opcodes.local_get, 2 ],
          [ Opcodes.i32_load8_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],
          Opcodes.i32_from_u,
          [ Opcodes.call, importedFuncs.printChar ],

          // increment pointer
          [ Opcodes.local_get, 2 ],
          [ Opcodes.i32_const, 1 ],
          [ Opcodes.i32_add ],
          [ Opcodes.local_tee, 2 ],

          // if pointer != end pointer, loop
          [ Opcodes.local_get, 3 ],
          [ Opcodes.i32_ne ],
          [ Opcodes.br_if, 0 ],

          [ Opcodes.end ]
        ],
        [TYPES._array]: [
          ...printStaticStr('[ '),

          // cache input pointer as i32
          [ Opcodes.local_get, 0 ],
          Opcodes.i32_to_u,
          [ Opcodes.local_tee, 2 ],

          // make end pointer
          [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
          ...number(ValtypeSize[valtype], Valtype.i32),
          [ Opcodes.i32_mul ],

          [ Opcodes.local_get, 2 ],
          [ Opcodes.i32_add ],
          [ Opcodes.local_set, 3 ],

          [ Opcodes.loop, Blocktype.void ],

          // print current char
          [ Opcodes.local_get, 2 ],
          [ Opcodes.load, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],
          [ Opcodes.call, importedFuncs.print ],

          // increment pointer by sizeof valtype
          [ Opcodes.local_get, 2 ],
          ...number(ValtypeSize[valtype], Valtype.i32),
          [ Opcodes.i32_add ],
          [ Opcodes.local_tee, 2 ],

          // if pointer != end pointer, print separator and loop
          [ Opcodes.local_get, 3 ],
          [ Opcodes.i32_ne ],
          [ Opcodes.if, Blocktype.void ],
          ...printStaticStr(', '),
          [ Opcodes.br, 1 ],
          [ Opcodes.end ],

          [ Opcodes.end ],

          ...printStaticStr(' ]'),
        ],
        [TYPES.undefined]: [
          ...printStaticStr('undefined')
        ],
        [TYPES.function]: [
          ...printStaticStr('function () {}')
        ],
        [TYPES.object]: [
          [ Opcodes.local_get, 0 ],
          Opcodes.i32_to_u,
          [ Opcodes.if, Blocktype.void ],
          ...printStaticStr('{}'),
          [ Opcodes.else ],
          ...printStaticStr('null'),
          [ Opcodes.end ]
        ],
        default: [
          [ Opcodes.local_get, 0 ],
          [ Opcodes.call, importedFuncs.print ],
        ]
      }, Blocktype.void),

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
  // const prngSeed0 = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER), prngSeed1 = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const prngSeed0 = (Math.random() * (2 ** 30)) | 0, prngSeed1 = (Math.random() * (2 ** 30)) | 0;

  const prng = ({
    'lcg32_glibc': {
      globals: [ Valtype.i32 ],
      locals: [],
      returns: Valtype.i32,
      wasm: [
        // seed = (MULTIPLIER * seed + INCREMENT) % MODULUS
        // MULTIPLIER * state0
        [ Opcodes.global_get, 0 ],
        ...number(1103515245, Valtype.i32),
        [ Opcodes.i32_mul ],

        // + INCREMENT
        ...number(12345, Valtype.i32),
        [ Opcodes.i32_add ],

        // % MODULUS
        ...number(2 ** 31, Valtype.i32),
        [ Opcodes.i32_rem_s ],

        // state0 =
        [ Opcodes.global_set, 0 ],

        // state0
        [ Opcodes.global_get, 0 ],
      ],
    },
    'lcg32_minstd': {
      globals: [ Valtype.i32 ],
      locals: [],
      returns: Valtype.i32,
      wasm: [
        // seed = (MULTIPLIER * seed + INCREMENT) % MODULUS
        // MULTIPLIER * state0
        [ Opcodes.global_get, 0 ],
        ...number(48271, Valtype.i32),
        [ Opcodes.i32_mul ],

        // % MODULUS
        ...number((2 ** 31) - 1, Valtype.i32),
        [ Opcodes.i32_rem_s ],

        // state0 =
        [ Opcodes.global_set, 0 ],

        // state0
        [ Opcodes.global_get, 0 ],
      ],
    },
    'lcg64_musl': 0, // todo

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

        // // s1 * 0x2545F4914F6CDD1D
        // [ Opcodes.local_get, 0 ],
        // [ Opcodes.i64_const, 0x9d, 0xba, 0xb3, 0xfb, 0x94, 0x92, 0xfd, 0xa2, 0x25 ],
        // [ Opcodes.i64_mul ]

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
        ...number(24, Valtype.i64),
        [ Opcodes.i64_rotl ],
        [ Opcodes.local_get, 0 ], // s1
        [ Opcodes.i64_xor ],

        // ^ (s1 << 16)
        [ Opcodes.local_get, 0 ], // s1
        ...number(16, Valtype.i64),
        [ Opcodes.i64_shl ],
        [ Opcodes.i64_xor ],

        // state0 =
        [ Opcodes.global_set, 0 ], // state0

        // state1 = rotl(s1, 37)
        [ Opcodes.local_get, 0 ], // s1
        ...number(37, Valtype.i64),
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
        ...number(9, Valtype.i32),
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
        ...number(11, Valtype.i32),
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
      // ...number(1),
      // [ Opcodes.f64_sub ],

      ...(prng.returns === Valtype.i64 ? [
        ...number((1 << 53) - 1, Valtype.i64),
        [ Opcodes.i64_and ],

        // double(mantissa)
        [ Opcodes.f64_convert_i64_u ],

        // / (1 << 53)
        ...number(1 << 53),
        [ Opcodes.f64_div ]
      ] : [
        ...number((1 << 21) - 1, Valtype.i32),
        [ Opcodes.i32_and ],

        // double(mantissa)
        [ Opcodes.f64_convert_i32_u ],

        // / (1 << 21)
        ...number(1 << 21),
        [ Opcodes.f64_div ]
      ])
    ]
  };

  // this.__Porffor_randomInt = {
  //   params: [],
  //   locals: prng.locals,
  //   localNames: [ 's1', 's0' ],
  //   globals: prng.globals,
  //   globalNames: [ 'state0', 'state1' ],
  //   globalInits: [ prngSeed0, prngSeed1 ],
  //   returns: [ Valtype.i32 ],
  //   wasm: [
  //     ...prng.wasm,

  //     ...(prng.returns === Valtype.i64 ? [
  //       // the lowest bits of the output generated by xorshift128+ have low quality
  //       ...number(56, Valtype.i64),
  //       [ Opcodes.i64_shr_u ],

  //       [ Opcodes.i32_wrap_i64 ],
  //     ] : []),
  //   ]
  // };

  this.__Porffor_randomByte = {
    params: [],
    locals: prng.locals,
    localNames: [ 's1', 's0' ],
    globals: prng.globals,
    globalNames: [ 'state0', 'state1' ],
    globalInits: [ prngSeed0, prngSeed1 ],
    returns: [ Valtype.i32 ],
    wasm: [
      ...prng.wasm,

      ...(prng.returns === Valtype.i64 ? [
        // the lowest bits of the output generated by xorshift128+ have low quality
        ...number(56, Valtype.i64),
        [ Opcodes.i64_shr_u ],

        [ Opcodes.i32_wrap_i64 ],
      ] : []),

      ...number(0xff, Valtype.i32),
      [ Opcodes.i32_and ],
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
    returnType: TYPES.boolean,
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


  this.__Porffor_type = {
    params: [ valtypeBinary, Valtype.i32 ],
    typedParams: true,
    locals: [ Valtype.i32, Valtype.i32 ],
    returns: [ valtypeBinary ],
    returnType: Prefs.bytestring ? TYPES._bytestring : TYPES.string,
    wasm: (scope, { TYPE_NAMES, typeSwitch, makeString }) => {
      const bc = {};
      for (const x in TYPE_NAMES) {
        bc[x] = makeString(scope, TYPE_NAMES[x], false, '#Porffor_type_result');
      }

      return typeSwitch(scope, [ [ Opcodes.local_get, 1 ] ], bc);
    }
  };

  this.__Porffor_rawType = {
    params: [ valtypeBinary, Valtype.i32 ],
    typedParams: true,
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 1 ],
      Opcodes.i32_from_u
    ]
  };

  const localIsOneOf = (getter, arr, valtype = valtypeBinary) => {
    const out = [];

    for (let i = 0; i < arr.length; i++) {
      out.push(...getter, ...number(arr[i], valtype), valtype === Valtype.f64 ? [ Opcodes.f64_eq ] : [ Opcodes.i32_eq ]);
      if (i !== 0) out.push([ Opcodes.i32_or ]);
    }

    return out;
  };

  const generated = new GeneratedBuiltins.BuiltinFuncs();
  for (const x in generated) {
    this[x] = generated[x];
  }
};