import { Opcodes, Valtype } from './wasmSpec.js';

export const number = (n, valtype = valtypeBinary) => {
  if (valtype === Valtype.f64) return [ Opcodes.f64_const, n ];

  return [
    valtype === Valtype.i32 ? Opcodes.i32_const : Opcodes.i64_const,
    n
  ];
};

export const codifyString = str => {
  let out = [];
  for (let i = 0; i < str.length; i++) {
    out.push(str.charCodeAt(i));
  }

  return out;
};

export const encodeString = str => unsignedLEB128(str.length).concat(codifyString(str));
export const encodeVector = data => unsignedLEB128(data.length).concat(data.flat());

// todo: this only works with integers within 32 bit range
export const signedLEB128 = n => {
  if (n === Infinity) return signedLEB128(2147483647);
  if (n === -Infinity) return signedLEB128(-2147483648);

  n |= 0;

  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 63) return [ n ];
  if (n >= -64 && n <= 0) return [ 128 + n ];
  if (n >= 0 && n <= 8191) return [ 128 + (n % 128), Math.floor(n / 128) ];

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
  if (n === Infinity) return unsignedLEB128(4294967295);
  if (n === -Infinity) return unsignedLEB128(0);

  n |= 0;

  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 127) return [ n ];
  if (n >= 0 && n <= 16383) return [ 128 + (n % 128), Math.floor(n / 128) ];

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

export const unsignedLEB128_length = n => {
  if (n === Infinity) return unsignedLEB128_length(4294967295);
  if (n === -Infinity) return unsignedLEB128_length(0);

  if (n < 0) n = n >>> 0;
  if (n <= 127) return 1;
  if (n <= 16383) return 2;
  if (n <= 2097151) return 3;
  if (n <= 268435455) return 4;
  if (n <= 34359738367) return 5;

  let length = 0;
  do {
    length++;
    n >>>= 7;
  } while (n > 0);
  return length;
};

export const signedLEB128_length = n => {
  if (n === Infinity) return signedLEB128_length(2147483647);
  if (n === -Infinity) return signedLEB128_length(-2147483648);

  if (n >= -64 && n <= 63) return 1;
  if (n >= -8192 && n <= 8191) return 2;
  if (n >= -1048576 && n <= 1048575) return 3;
  if (n >= -134217728 && n <= 134217727) return 4;

  let length = 0;
  while (true) {
    let byte = n & 0x7f;
    n >>= 7;

    if ((n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0)) {
      length++;
      break;
    } else {
      length++;
    }
  }

  return length;
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
      byte |= 0x80;
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

export const read_signedLEB128 = input => {
  let result = 0, shift = 0;

  let i = 0;
  while (true) {
    const byte = input[i++];
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
export const read_unsignedLEB128 = input => {
  let result = 0, shift = 0;

  let i = 0;
  while (true) {
    const byte = input[i++];
    result |= (byte & 0x7f) << shift;
    shift += 7;

    if ((0x80 & byte) === 0) {
      return result;
    }
  }
};

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

export const read_ieee754_binary64 = buffer => new Float64Array(new Uint8Array(buffer).buffer)[0];


// into funcs append to a given existing buffer instead of creating our own for perf
export const signedLEB128_into = (n, buffer) => {
  if (n === Infinity) return signedLEB128_into(2147483647, buffer);
  if (n === -Infinity) return signedLEB128_into(-2147483648, buffer);

  n |= 0;

  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 63) return buffer.push(n);
  if (n >= -64 && n <= 0) return buffer.push(128 + n);
  if (n >= 0 && n <= 8191) return buffer.push(128 + (n % 128), Math.floor(n / 128));

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
};

export const unsignedLEB128_into = (n, buffer) => {
  if (n === Infinity) return unsignedLEB128_into(4294967295, buffer);
  if (n === -Infinity) return unsignedLEB128_into(0, buffer);

  n |= 0;

  // just input for small numbers (for perf as common)
  if (n >= 0 && n <= 127) return buffer.push(n);
  if (n >= 0 && n <= 16383) return buffer.push(128 + (n % 128), Math.floor(n / 128));

  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) {
      byte |= 0x80;
    }
    buffer.push(byte);
  } while (n !== 0);
};

export const ieee754_binary64_into = (value, buffer) => {
  const data = new Uint8Array(new Float64Array([ value ]).buffer);
  for (let i = 0; i < 8; i++) buffer.push(data[i]);
};