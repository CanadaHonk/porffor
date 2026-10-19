// general widely used ecma262/spec functions
import type {} from './porffor.d.ts';

// https://tc39.es/ecma262/#sec-samevaluezero: === but NaN equals NaN
export const __ecma262_SameValueZero = (x: any, y: any): boolean => {
  if (x === y) return true;
  // NaN !== NaN, but SameValueZero(NaN, NaN) should be true
  if (Porffor.type(x) == Porffor.TYPES.number && Number.isNaN(x) && Number.isNaN(y)) return true;
  return false;
};

// 7.1.1 ToPrimitive (input [, preferredType])
// https://tc39.es/ecma262/#sec-toprimitive
export const __ecma262_ToPrimitive = (input: any, hint: bytestring): any => {
  if (!Porffor.object.isObject(input)) return input;

  const exoticToPrim: any = input[Symbol.toPrimitive];
  if (exoticToPrim != null) {
    if (Porffor.type(exoticToPrim) != Porffor.TYPES.function) throw new TypeError('Symbol.toPrimitive is not a function');
    const result: any = Porffor.callThis(exoticToPrim, input, hint);
    if (Porffor.object.isObject(result)) throw new TypeError('Cannot convert an object to primitive');
    return result;
  }

  // primitive wrappers cannot be passed as a dynamic receiver losslessly, call their methods directly
  if (Porffor.fastOr(
    Porffor.type(input) == Porffor.TYPES.numberobject,
    Porffor.type(input) == Porffor.TYPES.booleanobject,
    Porffor.type(input) == Porffor.TYPES.stringobject
  )) {
    let value: any = hint == 'string' ? input.toString?.() : input.valueOf?.();
    if (value != null && !Porffor.object.isObjectOrNull(value)) return value;

    value = hint == 'string' ? input.valueOf?.() : input.toString?.();
    if (value != null && !Porffor.object.isObjectOrNull(value)) return value;

    throw new TypeError('Cannot convert an object to primitive');
  }

  const first: any = hint == 'string' ? input.toString : input.valueOf;
  if (Porffor.type(first) == Porffor.TYPES.function) {
    const value: any = Porffor.callThis(first, input);
    if (!Porffor.object.isObject(value)) return value;
  }

  const second: any = hint == 'string' ? input.valueOf : input.toString;
  if (Porffor.type(second) == Porffor.TYPES.function) {
    const value: any = Porffor.callThis(second, input);
    if (!Porffor.object.isObject(value)) return value;
  }

  throw new TypeError('Cannot convert an object to primitive');
};

export const __ecma262_ToPrimitive_Number = (input: any): any => __ecma262_ToPrimitive(input, 'number');

export const __ecma262_ToPrimitive_String = (input: any): any => __ecma262_ToPrimitive(input, 'string');

// 7.1.4.1.1 StringToNumber (str)
// https://tc39.es/ecma262/#sec-stringtonumber
export const __ecma262_StringToNumber = (str: string|bytestring): number => {
  str = str.trim();
  if (str.length == 0) return 0;

  let n: f64 = 0;
  Porffor.c`n = porf_str_to_num(str, 1);`;
  return n;
};

// 7.1.4 ToNumber (argument)
// https://tc39.es/ecma262/#sec-tonumber
export const __ecma262_ToNumber = (argument: unknown): number => {
  // 1. If argument is a Number, return argument.
  if (Porffor.type(argument) == Porffor.TYPES.number) return argument;

  // 2. If argument is either a Symbol or a BigInt, throw a TypeError exception.
  if (Porffor.fastOr(
    Porffor.type(argument) == Porffor.TYPES.symbol,
    Porffor.type(argument) == Porffor.TYPES.bigint)) throw new TypeError('Cannot convert Symbol or BigInt to a number');

  // 3. If argument is undefined, return NaN.
  if (Porffor.type(argument) == Porffor.TYPES.undefined) return NaN;

  // 4. If argument is either null or false, return +0𝔽.
  if (Porffor.fastOr(
    argument === null,
    argument === false
  )) return 0;

  // 5. If argument is true, return 1𝔽.
  if (argument === true) return 1;

  // 6. If argument is a String, return StringToNumber(argument).
  if ((Porffor.type(argument) | 0b10000000) == Porffor.TYPES.bytestring)
    return __ecma262_StringToNumber(argument);

  // 7. Assert: argument is an Object.
  // 8. Let primValue be ? ToPrimitive(argument, number).
  const primValue: any = __ecma262_ToPrimitive_Number(argument);

  // 9. Assert: primValue is not an Object.
  // 10. Return ? ToNumber(primValue).
  return __ecma262_ToNumber(primValue);
};


// 7.1.3 ToNumeric (value)
// https://tc39.es/ecma262/#sec-tonumeric
export const __ecma262_ToNumeric = (value: unknown): number => {
  // 1. Let primValue be ? ToPrimitive(value, number).
  // only run ToPrimitive if pure object for perf
  let primValue: any = value;
  if (Porffor.type(value) == Porffor.TYPES.object && Porffor.IR.ptr(value) != 0)
    primValue = __ecma262_ToPrimitive_Number(value);

  // 2. If primValue is a BigInt, return primValue.
  if (Porffor.comptime.flag`hasType.bigint`) {
    if (Porffor.type(primValue) == Porffor.TYPES.bigint) return primValue;
  }

  // 3. Return ? ToNumber(primValue).
  return __ecma262_ToNumber(primValue);
};

// 7.2.13 IsLessThan: -1/0/1, or 2 when undefined (NaN)
export const __Porffor_compare = (x: any, y: any): i32 => {
  if (Porffor.object.isObject(x)) x = __ecma262_ToPrimitive_Number(x);
  if (Porffor.object.isObject(y)) y = __ecma262_ToPrimitive_Number(y);

  const sx: boolean = (Porffor.type(x) | 0b10000000) == Porffor.TYPES.bytestring;
  const sy: boolean = (Porffor.type(y) | 0b10000000) == Porffor.TYPES.bytestring;
  if (sx && sy) {
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  }

  if (Porffor.type(x) == Porffor.TYPES.bigint && sy) {
    y = __Porffor_bigint_fromStringOrUndefined(y);
    if (y === undefined) return 2;
  } else if (sx && Porffor.type(y) == Porffor.TYPES.bigint) {
    x = __Porffor_bigint_fromStringOrUndefined(x);
    if (x === undefined) return 2;
  }

  // ToNumeric, left first (ToNumber throws for Symbols)
  if (Porffor.type(x) != Porffor.TYPES.bigint) x = __ecma262_ToNumber(x);
  if (Porffor.type(y) != Porffor.TYPES.bigint) y = __ecma262_ToNumber(y);

  const bx: boolean = Porffor.type(x) == Porffor.TYPES.bigint;
  if (bx == (Porffor.type(y) == Porffor.TYPES.bigint)) {
    if (x < y) return -1;
    if (x > y) return 1;
    if (x == y) return 0;
    return 2;
  }

  // BigInt vs Number: compare against floor(n) exactly
  const big: any = bx ? x : y;
  const n: number = bx ? y : x;
  if (Number.isNaN(n)) return 2;
  let c: i32 = 0;
  if (n == Infinity) c = -1;
  else if (n == -Infinity) c = 1;
  else {
    const f: number = Math.floor(n);
    const fb: any = __Porffor_bigint_fromNumber(f);
    if (big < fb) c = -1;
    else if (big > fb) c = 1;
    else if (f != n) c = -1;
  }
  return bx ? c : -c;
};

// 7.2.14 IsLooselyEqual
export const __Porffor_looseEq = (x: any, y: any): i32 => {
  const nx: boolean = Porffor.fastOr(Porffor.type(x) == Porffor.TYPES.undefined, x === null);
  const ny: boolean = Porffor.fastOr(Porffor.type(y) == Porffor.TYPES.undefined, y === null);
  if (Porffor.fastOr(nx, ny)) return nx && ny ? 1 : 0;

  if (Porffor.type(x) == Porffor.TYPES.boolean) return __Porffor_looseEq(x ? 1 : 0, y);
  if (Porffor.type(y) == Porffor.TYPES.boolean) return __Porffor_looseEq(x, y ? 1 : 0);

  // Dates default to the string hint
  const ox: boolean = Porffor.object.isObject(x), oy: boolean = Porffor.object.isObject(y);
  if (ox && oy) return x === y ? 1 : 0;
  if (ox) return __Porffor_looseEq(Porffor.type(x) == Porffor.TYPES.date ? __ecma262_ToPrimitive_String(x) : __ecma262_ToPrimitive_Number(x), y);
  if (oy) return __Porffor_looseEq(x, Porffor.type(y) == Porffor.TYPES.date ? __ecma262_ToPrimitive_String(y) : __ecma262_ToPrimitive_Number(y));

  const tx: i32 = Porffor.type(x), ty: i32 = Porffor.type(y);
  const sx: boolean = (tx | 0b10000000) == Porffor.TYPES.bytestring;
  const sy: boolean = (ty | 0b10000000) == Porffor.TYPES.bytestring;
  if (Porffor.fastOr(tx == ty, sx && sy)) return x === y ? 1 : 0;

  if (sx) {
    if (ty == Porffor.TYPES.number) return __ecma262_StringToNumber(x) === y ? 1 : 0;
    if (ty == Porffor.TYPES.bigint) {
      const n: any = __Porffor_bigint_fromStringOrUndefined(x);
      return n !== undefined && n === y ? 1 : 0;
    }
    return 0;
  }
  if (sy) return __Porffor_looseEq(y, x);

  if (tx == Porffor.TYPES.number && ty == Porffor.TYPES.bigint) return __Porffor_looseEq(y, x);
  if (tx == Porffor.TYPES.bigint && ty == Porffor.TYPES.number) {
    const n: number = y;
    if (Porffor.fastOr(!Number.isFinite(n), !Number.isInteger(n))) return 0;
    return x === __Porffor_bigint_fromNumber(n) ? 1 : 0;
  }

  return 0;
};

// 7.1.5 ToIntegerOrInfinity (argument)
// https://tc39.es/ecma262/#sec-tointegerorinfinity
export const __ecma262_ToIntegerOrInfinity = (argument: unknown): number => {
  // 1. Let number be ? ToNumber(argument).
  let number: number = __ecma262_ToNumber(argument);

  // 2. If number is one of NaN, +0𝔽, or -0𝔽, return 0.
  if (Number.isNaN(number)) return 0;

  // 3. If number is +∞𝔽, return +∞.
  // 4. If number is -∞𝔽, return -∞.
  if (!Number.isFinite(number)) return number;

  // 5. Return truncate(ℝ(number)).
  number = Math.trunc(number);

  // return 0 for -0
  if (number == 0) return 0;
  return number;
};

// 7.1.22 ToIndex (value)
export const __ecma262_ToIndex = (value: unknown): number => {
  // 1. Let integer be ? ToIntegerOrInfinity(value).
  const integer: number = __ecma262_ToIntegerOrInfinity(value);

  // 2. If integer is not in the inclusive interval from 0 to 2**53 - 1, throw a RangeError exception.
  if (Porffor.fastOr(
    integer < 0,
    integer > 9007199254740991
  )) throw new RangeError('Invalid index');

  // 3. Return integer.
  return integer;
};

// 7.1.18 ToObject (argument)
// https://tc39.es/ecma262/#sec-toobject
export const __ecma262_ToObject = (argument: any): any => {
  if (argument == null) throw new TypeError('Cannot convert undefined or null to object');
  const t: i32 = Porffor.type(argument);
  if (Porffor.fastOr(
    t == Porffor.TYPES.number,
    t == Porffor.TYPES.boolean,
    (t | 0b10000000) == Porffor.TYPES.bytestring
  )) return Object(argument);
  return argument;
};

// 7.1.20 ToLength (argument)
// https://tc39.es/ecma262/#sec-tolength
export const __ecma262_ToLength = (argument: unknown): number => {
  // 1. Let len be ? ToIntegerOrInfinity(argument).
  const len: number = __ecma262_ToIntegerOrInfinity(argument);

  // 2. If len ≤ 0, return +0𝔽.
  if (len <= 0) return 0;

  // 3. Return 𝔽(min(len, 2**53 - 1)).
  if (len > 9007199254740991) return 9007199254740991;
  return len;
};

// 7.1.17 ToString (argument)
// https://tc39.es/ecma262/#sec-tostring
export const __ecma262_ToString = (argument: unknown): any => {
  // 1. If argument is a String, return argument.
  if ((Porffor.type(argument) | 0b10000000) == Porffor.TYPES.bytestring)
    return argument;

  // 2. If argument is a Symbol, throw a TypeError exception.
  if (Porffor.type(argument) == Porffor.TYPES.symbol) throw new TypeError('Cannot convert a Symbol value to a string');

  // 3. If argument is undefined, return "undefined".
  if (Porffor.type(argument) == Porffor.TYPES.undefined) return 'undefined';

  // 4. If argument is null, return "null".
  if (argument === null) return 'null';

  if (Porffor.type(argument) == Porffor.TYPES.boolean) {
    // 5. If argument is true, return "true".
    if (argument == true) return 'true';

    // 6. If argument is false, return "false".
    return 'false';
  }

  // 7. If argument is a Number, return Number::toString(argument, 10).
  if (Porffor.type(argument) == Porffor.TYPES.number) return Porffor.callThis(__Number_prototype_toString, argument, 10);

  // 8. If argument is a BigInt, return BigInt::toString(argument, 10).
  if (Porffor.comptime.flag`hasType.bigint`) {
    if (Porffor.type(argument) == Porffor.TYPES.bigint) return __Porffor_bigint_toString(argument, 10);
  }

  // hack: StringObject -> String
  if (Porffor.type(argument) == Porffor.TYPES.stringobject) {
    return argument as string;
  }

  // 9. Assert: argument is an Object.
  // 10. Let primValue be ? ToPrimitive(argument, string).
  const primValue: any = __ecma262_ToPrimitive_String(argument);

  // 11. Assert: primValue is not an Object.
  // 12. Return ? ToString(primValue).
  return __ecma262_ToString(primValue);
};

// 7.1.19 ToPropertyKey (argument)
// https://tc39.es/ecma262/#sec-topropertykey
export const __ecma262_ToPropertyKey = (argument: any): any => {
  // 1. Let key be ? ToPrimitive(argument, string).
  // only run ToPrimitive if pure object for perf
  let key: any = argument;
  if (Porffor.type(argument) == Porffor.TYPES.object && Porffor.IR.ptr(argument) != 0)
    key = __ecma262_ToPrimitive_String(argument);

  // 2. If key is a Symbol, then
  if (Porffor.type(key) == Porffor.TYPES.symbol) {
    // a. Return key.
    return key;
  }

  // 3. Return ! ToString(key).
  return __ecma262_ToString(key);
};

export const __ecma262_IsConstructor = (argument: any): boolean => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(argument) == Porffor.TYPES.proxy) return __ecma262_IsConstructor(__Porffor_proxy_target(argument));
  }
  if (Porffor.type(argument) != Porffor.TYPES.function) return false;
  return (__Porffor_funcLut_flags(argument) & 0b10) == 2;
};
