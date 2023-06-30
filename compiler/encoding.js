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
  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 63) return [ n ];
  if (n >= -64 && n <= 0) return [ 128 + n ];

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
  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 127) return [ n ];

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

// ieee 754 binary64
export const ieee754_binary64 = value => {
  let isLE = false, mLen = 11, nBytes = 8, offset = 0;
  let buffer = new Array(nBytes * 4).fill(0);

  // from https://github.com/feross/ieee754
  // BSD 3-Clause. Copyright 2008 Fair Oaks Labs, Inc. (https://github.com/feross/ieee754/blob/master/LICENSE)

  let e, m, c
  let eLen = (nBytes * 8) - mLen - 1
  const eMax = (1 << eLen) - 1
  const eBias = eMax >> 1
  const rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  let i = isLE ? 0 : (nBytes - 1)
  const d = isLE ? 1 : -1
  const s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  while (mLen >= 8) {
    buffer[offset + i] = m & 0xff
    i += d
    m /= 256
    mLen -= 8
  }

  e = (e << mLen) | m
  eLen += mLen
  while (eLen > 0) {
    buffer[offset + i] = e & 0xff
    i += d
    e /= 256
    eLen -= 8
  }

  buffer[offset + i - d] |= s * 128

  return buffer;
};