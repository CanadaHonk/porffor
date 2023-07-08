import { Opcodes, Valtype } from "./wasmSpec.js";
import { number, i32x4 } from "./embedding.js";
// import parse from "./parse.js";

export const importedFuncs = { print: 0, printChar: 1, assert: 2 };

const char = c => number(c.charCodeAt(0));

export const UNDEFINED = 0;
export const NULL = 0;

export const BuiltinVars = function() {
  this.undefined = number(UNDEFINED);
  this.null = number(NULL);

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

      break;
  }
};

export const BuiltinFuncs = function() {
  this['f64_%'] = {
    params: [ valtypeBinary, valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [ // x - (x // y) * y
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

  this['f64_&'] = {
    params: [ valtypeBinary, valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_to,

      [ Opcodes.local_get, 1 ],
      Opcodes.i32_to,

      [ Opcodes.i32_and ],
      Opcodes.i32_from
    ]
  };

  this['f64_|'] = {
    params: [ valtypeBinary, valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_to,

      [ Opcodes.local_get, 1 ],
      Opcodes.i32_to,

      [ Opcodes.i32_or ],
      Opcodes.i32_from
    ]
  };

  this['f64_^'] = {
    params: [ valtypeBinary, valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      Opcodes.i32_to,

      [ Opcodes.local_get, 1 ],
      Opcodes.i32_to,

      [ Opcodes.i32_xor ],
      Opcodes.i32_from
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

  this.isNaN = {
    floatOnly: true,
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
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

  this.__Math_sqrt = {
    params: [ valtypeBinary ],
    locals: [],
    returns: [ valtypeBinary ],
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ ...Opcodes.sqrt ]
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

/* for (const x in builtins) {
  if (x.wasm) continue;
  // builtins[x] = parse(x, []);
} */