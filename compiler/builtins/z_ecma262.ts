// general widely used ecma262/spec functions
import type {} from './porffor.d.ts';

// 7.1.5 ToIntegerOrInfinity (argument)
// https://tc39.es/ecma262/#sec-tointegerorinfinity
export const __ecma262_ToIntegerOrInfinity = (argument: unknown): number => {
  // 1. Let number be ? ToNumber(argument).
  let number: number = Number(argument);

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

// todo: support non-bytestring properly
// 7.1.17 ToString (argument)
// https://tc39.es/ecma262/#sec-tostring
export const __ecma262_ToString = (argument: unknown): bytestring => {
  let out: bytestring = Porffor.allocate();
  const type: i32 = Porffor.rawType(argument);

  // 1. If argument is a String, return argument.
  if (Porffor.fastOr(
    type == Porffor.TYPES.string,
    type == Porffor.TYPES.bytestring)) return argument;

  // 2. If argument is a Symbol, throw a TypeError exception.
  if (type == Porffor.TYPES.symbol) throw new TypeError('Cannot convert a Symbol value to a string');

  // 3. If argument is undefined, return "undefined".
  if (type == Porffor.TYPES.undefined) return out = 'undefined';

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