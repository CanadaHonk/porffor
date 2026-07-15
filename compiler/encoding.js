// ieee 754 binary64
const ieee754Buffer = new Float64Array(1);
const ieee754Cache = {};
export const ieee754_binary64 = value => {
  if (value === 0) {
    if (1 / value === -Infinity) return [ 0, 0, 0, 0, 0, 0, 0, 128 ]; // -0
    return [ 0, 0, 0, 0, 0, 0, 0, 0 ]; // +0
  }

  if (ieee754Cache[value]) return ieee754Cache[value].slice();

  ieee754Buffer[0] = value;
  return ieee754Cache[value] = [...new Uint8Array(ieee754Buffer.buffer)];
};
