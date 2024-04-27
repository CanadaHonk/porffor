export const codifyString = str => {
  let out = [];
  for (let i = 0; i < str.length; i++) {
    out.push(str.charCodeAt(i));
  }

  return out;
};

// export const encodeString = str => [
//   str.length,
//   ...codifyString(str)
// ];
export const encodeString = str => unsignedLEB128(str.length).concat(codifyString(str));

// export const encodeVector = data => [
//   ...unsignedLEB128(data.length),
//   ...data.flat()
// ];
// export const encodeVector = data => {
//   const out = data.flat();
//   out.unshift.apply(out, unsignedLEB128(data.length));
//   return out;
// };
export const encodeVector = data => unsignedLEB128(data.length).concat(data.flat());

export const encodeLocal = (count, type) => [
  ...unsignedLEB128(count),
  type
];

// todo: this only works with integers within 32 bit range
export const signedLEB128 = n => {
  if (typeof n === 'bigint') return big_signedLEB128(n);

  n |= 0;

  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 63) return [ n ];
  if (n >= -64 && n <= 0) return [ 128 + n ];

  const buffer = [];

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
  if (typeof n === 'bigint') return big_unsignedLEB128(n);

  n |= 0;

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

export const big_signedLEB128 = n => {
  // just input for small numbers (for perf as common)
  if (n >= 0n && n <= 63n) return [ Number(n) ];
  if (n >= -64n && n <= 0n) return [ 128 + Number(n) ];

  const buffer = [];

  while (true) {
    let byte = Number(n & 0x7fn);
    n >>= 7n;

    if ((n === 0n && (byte & 0x40) === 0) || (n === -1n && (byte & 0x40) !== 0)) {
      buffer.push(byte);
      break;
    } else {
      byte |= 0x80n;
    }

    buffer.push(byte);
  }

  return buffer;
};

export const big_unsignedLEB128 = n => {
  // just input for small numbers (for perf as common)
  if (n >= 0n && n <= 127n) return [ n ];

  const buffer = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>>= 7n;
    if (n !== 0n) {
      byte |= 0x80;
    }
    buffer.push(byte);
  } while (n !== 0n);
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

// todo: check this with large unsigned values
export const read_unsignedLEB128 = _input => {
  const input = [..._input];
  let result = 0, shift = 0;

  while (true) {
    const byte = input.shift();
    result |= (byte & 0x7f) << shift;

    shift += 7;

    if ((0x80 & byte) === 0) {
      return result;
    }
  }
};

// ieee 754 binary64
export const ieee754_binary64 = value => [...new Uint8Array(new Float64Array([ value ]).buffer)];
export const read_ieee754_binary64 = buffer => new Float64Array(new Uint8Array(buffer).buffer)[0];