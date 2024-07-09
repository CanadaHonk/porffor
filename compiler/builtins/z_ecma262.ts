// general widely used ecma262/spec functions
import type {} from './porffor.d.ts';

// 7.1.4 ToNumber (argument)
// https://tc39.es/ecma262/#sec-tonumber
export const __ecma262_ToNumber = (argument: unknown): number => {
  const t: i32 = Porffor.rawType(argument);

  // 1. If argument is a Number, return argument.
  if (t == Porffor.TYPES.number) return argument;

  // 2. If argument is either a Symbol or a BigInt, throw a TypeError exception.
  if (Porffor.fastOr(
    t == Porffor.TYPES.symbol,
    t == Porffor.TYPES.bigint)) throw new TypeError('Cannot convert Symbol or BigInt to a number');

  // 3. If argument is undefined, return NaN.
  if (Porffor.fastOr(
    t == Porffor.TYPES.undefined,
    t == Porffor.TYPES.empty)) return NaN;

  // 4. If argument is either null or false, return +0𝔽.
  if (Porffor.fastOr(
    argument === null,
    argument === false
  )) return 0;

  // 5. If argument is true, return 1𝔽.
  if (argument === true) return 1;

  // 6. If argument is a String, return StringToNumber(argument).
  if (Porffor.fastOr(
    t == Porffor.TYPES.string,
    t == Porffor.TYPES.bytestring)) return __ecma262_StringToNumber(argument);

  // 7. Assert: argument is an Object.
  // 8. Let primValue be ? ToPrimitive(argument, number).
  // 9. Assert: primValue is not an Object.
  // 10. Return ? ToNumber(primValue).

  // // todo: I doubt this is spec-compliant
  // return __ecma262_ToNumber(argument.valueOf());

  return NaN;
};


// 7.1.3 ToNumeric (value)
// https://tc39.es/ecma262/#sec-tonumeric
export const __ecma262_ToNumeric = (value: unknown): number => {
  // 1. Let primValue be ? ToPrimitive(value, number).
  // we do not have ToPrimitive

  // 2. If primValue is a BigInt, return primValue.
  // todo: do this when we have bigints

  // 3. Return ? ToNumber(primValue).
  return __ecma262_ToNumber(value);
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
  const type: i32 = Porffor.rawType(argument);

  // 1. If argument is a String, return argument.
  if (Porffor.fastOr(
    type == Porffor.TYPES.string,
    type == Porffor.TYPES.bytestring)) return argument;

  // 2. If argument is a Symbol, throw a TypeError exception.
  if (type == Porffor.TYPES.symbol) throw new TypeError('Cannot convert a Symbol value to a string');

  let out: bytestring = Porffor.allocate();

  // 3. If argument is undefined, return "undefined".
  if (Porffor.fastOr(
    type == Porffor.TYPES.undefined,
    type == Porffor.TYPES.empty)) return out = 'undefined';

  // 4. If argument is null, return "null".
  if (Porffor.fastAnd(
    type == Porffor.TYPES.object,
    argument == 0)) return out = 'null';

  if (type == Porffor.TYPES.boolean) {
    // 5. If argument is true, return "true".
    if (argument == true) return out = 'true';

    // 6. If argument is false, return "false".
    return out = 'false';
  }

  // 7. If argument is a Number, return Number::toString(argument, 10).
  // 8. If argument is a BigInt, return BigInt::toString(argument, 10).
  // 9. Assert: argument is an Object.
  // 10. Let primValue be ? ToPrimitive(argument, string).
  // 11. Assert: primValue is not an Object.
  // 12. Return ? ToString(primValue).
  return argument.toString();
};

// 7.1.19 ToPropertyKey (argument)
// https://tc39.es/ecma262/#sec-topropertykey
export const __ecma262_ToPropertyKey = (argument: any): any => {
  // 1. Let key be ? ToPrimitive(argument, string).
  // argument = key

  // 2. If key is a Symbol, then
  if (Porffor.rawType(argument) == Porffor.TYPES.symbol) {
    // a. Return key.
    return argument;
  }

  // 3. Return ! ToString(key).
  return __ecma262_ToString(argument);
};