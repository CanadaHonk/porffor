// general widely used ecma262/spec functions
import type {} from './porffor.d.ts';

export const __ecma262_ToPrimitive_Number = (input: any): any => {
  // todo: %Symbol.toPrimitive%

  let value: any = input.valueOf?.();
  if (value != null && !Porffor.object.isObjectOrNull(value)) return value;

  value = input.toString?.();
  if (value != null && !Porffor.object.isObjectOrNull(value)) return value;

  throw new TypeError('Cannot convert an object to primitive');
};

export const __ecma262_ToPrimitive_String = (input: any): any => {
  // todo: %Symbol.toPrimitive%

  let value: any = input.toString?.();
  if (value != null && !Porffor.object.isObjectOrNull(value)) return value;

  value = input.valueOf?.();
  if (value != null && !Porffor.object.isObjectOrNull(value)) return value;

  throw new TypeError('Cannot convert an object to primitive');
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
  if (Porffor.fastOr(
    Porffor.type(argument) == Porffor.TYPES.undefined,
    Porffor.type(argument) == Porffor.TYPES.empty)) return NaN;

  // 4. If argument is either null or false, return +0𝔽.
  if (Porffor.fastOr(
    argument === null,
    argument === false
  )) return 0;

  // 5. If argument is true, return 1𝔽.
  if (argument === true) return 1;

  // 6. If argument is a String, return StringToNumber(argument).
  if (Porffor.fastOr(
    Porffor.type(argument) == Porffor.TYPES.string,
    Porffor.type(argument) == Porffor.TYPES.bytestring)) return __ecma262_StringToNumber(argument);

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
  if (Porffor.type(value) == Porffor.TYPES.object && Porffor.wasm`local.get ${value}` != 0)
    primValue = __ecma262_ToPrimitive_Number(value);

  // 2. If primValue is a BigInt, return primValue.
  if (Porffor.comptime.flag`hasType.bigint`) {
    if (Porffor.type(primValue) == Porffor.TYPES.bigint) return primValue;
  }

  // 3. Return ? ToNumber(primValue).
  return __ecma262_ToNumber(primValue);
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

// 7.1.17 ToString (argument)
// https://tc39.es/ecma262/#sec-tostring
export const __ecma262_ToString = (argument: unknown): any => {
  // 1. If argument is a String, return argument.
  if (Porffor.fastOr(
    Porffor.type(argument) == Porffor.TYPES.string,
    Porffor.type(argument) == Porffor.TYPES.bytestring)) return argument;

  // 2. If argument is a Symbol, throw a TypeError exception.
  if (Porffor.type(argument) == Porffor.TYPES.symbol) throw new TypeError('Cannot convert a Symbol value to a string');

  // 3. If argument is undefined, return "undefined".
  if (Porffor.fastOr(
    Porffor.type(argument) == Porffor.TYPES.undefined,
    Porffor.type(argument) == Porffor.TYPES.empty)) return 'undefined';

  // 4. If argument is null, return "null".
  if (Porffor.fastAnd(
    Porffor.type(argument) == Porffor.TYPES.object,
    argument == 0)) return 'null';

  if (Porffor.type(argument) == Porffor.TYPES.boolean) {
    // 5. If argument is true, return "true".
    if (argument == true) return 'true';

    // 6. If argument is false, return "false".
    return 'false';
  }

  // 7. If argument is a Number, return Number::toString(argument, 10).
  if (Porffor.type(argument) == Porffor.TYPES.number) return __Number_prototype_toString(argument, 10);

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
  if (Porffor.type(argument) == Porffor.TYPES.object && Porffor.wasm`local.get ${argument}` != 0)
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
  if (Porffor.type(argument) != Porffor.TYPES.function) return false;
  return (__Porffor_funcLut_flags(argument) & 0b10) == 2;
};