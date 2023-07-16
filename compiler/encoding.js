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
  // todo: this only works with integers within 32 bit range

  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 63) return [ n ];
  if (n >= -64 && n <= 0) return [ 128 + n ];

  const buffer = [];
  n |= 0;

  while (true) {
    let byte = n & 0x7f;
    n >>= 7;

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

export const read_signedLEB128 = _input => {
  const input = [..._input];
  let result = 0, shift = 0;

  while (true) {
    const byte = input.shift();
    result |= (byte & 0x7f) << shift;

    shift += 7;

    if ((0x80 & byte) === 0) {
      if (shift < 32 && (byte & 0x40) !== 0) {
        return result | (-1 << shift);
      }

      return result;
    }
  }
};

// ieee 754 binary64

// from https://github.com/feross/ieee754
// BSD 3-Clause. Copyright 2008 Fair Oaks Labs, Inc. (https://github.com/feross/ieee754/blob/master/LICENSE)
export const ieee754_binary64 = value => {
  let isLE = true, mLen = 52, nBytes = 8, offset = 0;
  let buffer = new Array(nBytes).fill(0);

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

export const read_ieee754_binary64 = buffer => {
  let isLE = true, mLen = 52, nBytes = 8, offset = 0;

  let e, m
  const eLen = (nBytes * 8) - mLen - 1
  const eMax = (1 << eLen) - 1
  const eBias = eMax >> 1
  let nBits = -7
  let i = isLE ? (nBytes - 1) : 0
  const d = isLE ? -1 : 1
  let s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  while (nBits > 0) {
    e = (e * 256) + buffer[offset + i]
    i += d
    nBits -= 8
  }

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  while (nBits > 0) {
    m = (m * 256) + buffer[offset + i]
    i += d
    nBits -= 8
  }

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
};