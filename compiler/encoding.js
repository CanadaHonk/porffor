export const codifyString = str => {
  let out = [];
  for (let i = 0; i < str.length; i++) {
    out.push(str.charCodeAt(i));
  }

  return out;
};

export const encodeString = str => [
  str.length,
  ...codifyString(str)
];

export const encodeVector = data => [
  ...unsignedLEB128(data.length),
  ...data.flat()
];

export const encodeLocal = (count, type) => [
  ...unsignedLEB128(count),
  type
];

export const signedLEB128 = n => {
  const buffer = [];
  const isNegative = n < 0;
  const bitCount = Math.ceil(Math.log2(Math.abs(n))) + 1;

  while (true) {
    let byte = n & 0x7f;
    n >>= 7;

    if (isNegative) {
      n = n | -(1 << (bitCount - 8));
    }

    if ((n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0)) {
      buffer.push(byte);
      break;
    } else {
      byte |= 0x80;
    }

    buffer.push(byte);
  }

  return buffer;
};

export const unsignedLEB128 = n => {
  const buffer = [];
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) {
      byte |= 0x80;
    }
    buffer.push(byte);
  } while (n !== 0);
  return buffer;
};