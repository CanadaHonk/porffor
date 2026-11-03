import { encodeUtf8, encodeLatin1, utf8Length, utf8DecodedLength, decodeUtf8, decodeLatin1, decodeAscii, decodeUtf16le, normalizeEncoding, isUtf8Bytes } from './internal/bytes.js';
import { errBufferOutOfBounds, errInvalidArgType, errInvalidArgValue, errOutOfRange, errStringTooLong, errUnknownEncoding } from './internal/errors.js';
import { validateInteger, validateNumber } from './internal/validators.js';
import { Blob } from './internal/blob.js';
import { DOMException } from './internal/domexception.js';

export const kMaxLength = 2 ** 53 - 1;
export const kStringMaxLength = 2 ** 29 - 24;
export const constants = Object.defineProperties({}, {
  MAX_LENGTH: { value: kMaxLength, writable: false, enumerable: true },
  MAX_STRING_LENGTH: { value: kStringMaxLength, writable: false, enumerable: true }
});

const validateOffset = (value, name, min = 0, max = kMaxLength) => validateInteger(value, name, min, max);

const isAnyArrayBuffer = value => value instanceof ArrayBuffer || value instanceof SharedArrayBuffer;
const bytesOf = view => view instanceof Uint8Array ? view : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

class FastBuffer extends Uint8Array {}

// node's lenient base64: either alphabet, junk skipped, padding optional, stops at the first =
const decodeBase64 = s => {
  const pad = s.indexOf('=');
  let clean = (pad === -1 ? s : s.slice(0, pad)).replace(/[^A-Za-z0-9+/\-_]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (clean.length % 4 === 1) clean = clean.slice(0, -1);
  return Uint8Array.fromBase64(clean, { lastChunkHandling: 'loose' });
};

// hex decoding stops at the first invalid pair
const decodeHex = s => {
  const bad = /[^0-9a-fA-F]/.exec(s);
  const n = bad ? bad.index : s.length;
  return Uint8Array.fromHex(s.slice(0, n - n % 2));
};

const encodeUtf16le = s => {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return out;
};

const base64ByteLength = (str, bytes) => {
  if (str.charCodeAt(bytes - 1) === 0x3D) bytes--;
  if (bytes > 1 && str.charCodeAt(bytes - 1) === 0x3D) bytes--;
  return (bytes * 3) >>> 2;
};

// encode: string -> bytes, unit: bytes per code unit when writing (utf16le never splits one)
const encodingOps = {
  utf8: { encoding: 'utf8', byteLength: utf8Length, encode: encodeUtf8, unit: 1 },
  utf16le: { encoding: 'utf16le', byteLength: s => s.length * 2, encode: encodeUtf16le, unit: 2 },
  latin1: { encoding: 'latin1', byteLength: s => s.length, encode: encodeLatin1, unit: 1 },
  ascii: { encoding: 'ascii', byteLength: s => s.length, encode: encodeLatin1, unit: 1 },
  base64: { encoding: 'base64', byteLength: s => base64ByteLength(s, s.length), encode: decodeBase64, unit: 1 },
  base64url: { encoding: 'base64url', byteLength: s => base64ByteLength(s, s.length), encode: decodeBase64, unit: 1 },
  hex: { encoding: 'hex', byteLength: s => s.length >>> 1, encode: decodeHex, unit: 1 }
};

const getEncodingOps = encoding => {
  encoding += '';
  return encoding === '' ? undefined : encodingOps[normalizeEncoding(encoding)];
};

// the length of the string bytes decode to
const decodedLength = (buf, encoding, start, end) => {
  const n = end - start;
  switch (encoding) {
    case 'utf8': return n > kStringMaxLength ? utf8DecodedLength(buf, start, end) : n;
    case 'utf16le': return n >>> 1;
    case 'hex': return n * 2;
    case 'base64': return Math.ceil(n / 3) * 4;
    case 'base64url': return Math.ceil(n * 4 / 3);
  }
  return n;
};

const slice = (buf, encoding, start, end) => {
  if (decodedLength(buf, encoding, start, end) > kStringMaxLength) throw errStringTooLong();
  switch (encoding) {
    case 'utf8': return decodeUtf8(buf, start, end);
    case 'latin1': return decodeLatin1(buf, start, end);
    case 'ascii': return decodeAscii(buf, start, end);
    case 'utf16le': return decodeUtf16le(buf, start, end - (end - start) % 2);
    case 'hex': return buf.subarray(start, end).toHex();
    case 'base64': return buf.subarray(start, end).toBase64();
    case 'base64url': return buf.subarray(start, end).toBase64({ alphabet: 'base64url', omitPadding: true });
  }
};

// writes whole characters only, returning the bytes written
const writeString = (buf, string, offset, length, ops) => {
  if (offset < 0 || offset > buf.byteLength) throw errBufferOutOfBounds('offset');
  if (length < 0 || length > buf.byteLength - offset) throw errBufferOutOfBounds('length');

  const bytes = ops.encode(string);
  let n = Math.min(bytes.length, length);
  if (ops.unit === 2) n -= n % 2;
    else if (ops.encoding === 'utf8' && n < bytes.length) while (n > 0 && (bytes[n] & 0xc0) === 0x80) n--;
  buf.set(bytes.subarray(0, n), offset);
  return n;
};

const toInteger = (n, defaultVal) => {
  n = +n;
  if (!Number.isNaN(n) && n >= Number.MIN_SAFE_INTEGER && n <= Number.MAX_SAFE_INTEGER) return n % 1 === 0 ? n : Math.floor(n);
  return defaultVal;
};

export function Buffer(arg, encodingOrOffset, length) {
  return typeof arg === 'number' ? Buffer.alloc(arg) : Buffer.from(arg, encodingOrOffset, length);
}

FastBuffer.prototype.constructor = Buffer;
Buffer.prototype = FastBuffer.prototype;
Object.setPrototypeOf(Buffer, Uint8Array);
Object.defineProperty(Buffer, Symbol.species, { enumerable: false, configurable: true, get() { return FastBuffer; } });

Buffer.poolSize = 64 * 1024;

const fromString = (string, encoding) => {
  let ops = encodingOps.utf8;
  if (encoding && encoding !== 'utf8' && typeof encoding === 'string') {
    ops = getEncodingOps(encoding);
    if (ops === undefined) throw errUnknownEncoding(encoding);
  }
  return Object.setPrototypeOf(ops.encode(string), Buffer.prototype);
};

const fromArrayBuffer = (obj, byteOffset, length) => {
  if (byteOffset === undefined) {
    byteOffset = 0;
  } else {
    byteOffset = +byteOffset;
    if (Number.isNaN(byteOffset)) byteOffset = 0;
  }

  const maxLength = obj.byteLength - byteOffset;
  if (maxLength < 0) throw errBufferOutOfBounds('offset');

  if (length !== undefined) {
    length = +length;
    if (length > 0) {
      if (length > maxLength) throw errBufferOutOfBounds('length');
    } else {
      length = 0;
    }
  }
  return new FastBuffer(obj, byteOffset, length);
};

const fromArrayLike = obj => obj.length <= 0 ? new FastBuffer() : new FastBuffer(obj);

const fromObject = obj => {
  if (obj.length !== undefined || isAnyArrayBuffer(obj.buffer)) {
    if (typeof obj.length !== 'number') return new FastBuffer();
    return fromArrayLike(obj);
  }
  if (obj.type === 'Buffer' && Array.isArray(obj.data)) return fromArrayLike(obj.data);
};

Buffer.from = function from(value, encodingOrOffset, length) {
  if (typeof value === 'string') return fromString(value, encodingOrOffset);

  if (typeof value === 'object' && value !== null) {
    if (isAnyArrayBuffer(value)) return fromArrayBuffer(value, encodingOrOffset, length);

    const valueOf = value.valueOf && value.valueOf();
    if (valueOf != null && valueOf !== value && (typeof valueOf === 'string' || typeof valueOf === 'object')) return from(valueOf, encodingOrOffset, length);

    const b = fromObject(value);
    if (b) return b;

    if (typeof value[Symbol.toPrimitive] === 'function') {
      const primitive = value[Symbol.toPrimitive]('string');
      if (typeof primitive === 'string') return fromString(primitive, encodingOrOffset);
    }
  }

  throw errInvalidArgType('first argument', [ 'string', 'Buffer', 'ArrayBuffer', 'Array', 'Array-like Object' ], value);
};

Buffer.alloc = function alloc(size, fill, encoding) {
  validateNumber(size, 'size', 0, kMaxLength);
  const buf = new FastBuffer(size);
  if (fill !== undefined && fill !== 0 && size > 0) return _fill(buf, fill, 0, buf.length, encoding);
  return buf;
};

Buffer.allocUnsafe = function allocUnsafe(size) {
  validateNumber(size, 'size', 0, kMaxLength);
  return new FastBuffer(size);
};
Buffer.allocUnsafeSlow = Buffer.allocUnsafe;

// deprecated, but packages still read its prototype when loading
export function SlowBuffer(size) {
  return Buffer.allocUnsafeSlow(size);
}
SlowBuffer.prototype = Buffer.prototype;

Buffer.isBuffer = function isBuffer(b) {
  return b instanceof Buffer;
};

const compareBytes = (a, aStart, aEnd, b, bStart, bEnd) => {
  const n = Math.min(aEnd - aStart, bEnd - bStart);
  for (let i = 0; i < n; i++) {
    if (a[aStart + i] !== b[bStart + i]) return a[aStart + i] < b[bStart + i] ? -1 : 1;
  }
  return aEnd - aStart > bEnd - bStart ? 1 : aEnd - aStart < bEnd - bStart ? -1 : 0;
};

Buffer.compare = function compare(buf1, buf2) {
  return compareBytes(buf1, 0, buf1.length, buf2, 0, buf2.length);
};

Buffer.isEncoding = function isEncoding(encoding) {
  return typeof encoding === 'string' && encoding.length !== 0 && normalizeEncoding(encoding) !== undefined;
};

Buffer.concat = function concat(list, length) {
  if (length === undefined) {
    length = 0;
    for (let i = 0; i < list.length; i++) length += list[i].byteLength;
  }

  const buffer = new FastBuffer(length);
  let pos = 0;
  for (let i = 0; i < list.length && pos < length; i++) {
    const buf = list[i];
    if (pos + buf.byteLength > length) {
      buffer.set(buf.subarray(0, length - pos), pos);
      break;
    }
    buffer.set(buf, pos);
    pos += buf.byteLength;
  }
  return buffer;
};

const byteLength = (string, encoding) => {
  if (typeof string !== 'string') {
    if (ArrayBuffer.isView(string) || isAnyArrayBuffer(string)) return string.byteLength;
    throw errInvalidArgType('string', [ 'string', 'Buffer', 'ArrayBuffer' ], string);
  }
  if (string.length === 0) return 0;
  return (getEncodingOps(encoding) ?? encodingOps.utf8).byteLength(string);
};
Buffer.byteLength = byteLength;

const proto = Buffer.prototype;

proto.copy = function copy(target, targetStart = 0, sourceStart = 0, sourceEnd = this.byteLength) {
  targetStart = toInteger(targetStart, 0);
  sourceStart = toInteger(sourceStart, 0);
  sourceEnd = toInteger(sourceEnd, 0);
  if (targetStart < 0) throw errOutOfRange('targetStart', '>= 0', targetStart);
  if (sourceStart < 0 || sourceStart > this.byteLength) throw errOutOfRange('sourceStart', `>= 0 && <= ${this.byteLength}`, sourceStart);
  if (sourceEnd < 0) throw errOutOfRange('sourceEnd', '>= 0', sourceEnd);
  if (targetStart >= target.byteLength || sourceStart >= sourceEnd) return 0;

  if (sourceEnd - sourceStart > target.byteLength - targetStart) sourceEnd = sourceStart + target.byteLength - targetStart;
  const nb = Math.min(sourceEnd - sourceStart, this.byteLength - sourceStart);
  if (nb <= 0) return 0;

  const source = bytesOf(this).subarray(sourceStart, sourceStart + nb);
  bytesOf(target).set(source.buffer === target.buffer ? source.slice() : source, targetStart);
  return nb;
};

proto.toString = function toString(encoding, start, end) {
  if (arguments.length === 0) return slice(this, 'utf8', 0, this.length);

  const bufferLength = this.length;
  if (start <= 0) start = 0;
    else if (start >= bufferLength) return '';
    else start = Math.trunc(start) || 0;

  if (end === undefined || end > bufferLength) end = bufferLength;
    else end = Math.trunc(end) || 0;

  if (end <= start) return '';
  if (encoding === undefined) return slice(this, 'utf8', start, end);

  const ops = getEncodingOps(encoding);
  if (ops === undefined) throw errUnknownEncoding(encoding);
  return slice(this, ops.encoding, start, end);
};

proto.equals = function equals(otherBuffer) {
  return this === otherBuffer || compareBytes(this, 0, this.length, otherBuffer, 0, otherBuffer.length) === 0;
};

let INSPECT_MAX_BYTES = 50;
proto[Symbol.for('nodejs.util.inspect.custom')] = function inspect() {
  let str = slice(this, 'hex', 0, Math.min(INSPECT_MAX_BYTES, this.length)).replace(/(.{2})(?!$)/g, '$1 ');
  const remaining = this.length - INSPECT_MAX_BYTES;
  if (remaining > 0) str += ` ... ${remaining} more byte${remaining > 1 ? 's' : ''}`;
  return `<${this.constructor.name} ${str}>`;
};

proto.compare = function compare(target, targetStart = 0, targetEnd = target.length, sourceStart = 0, sourceEnd = this.length) {
  if (sourceStart >= sourceEnd) return targetStart >= targetEnd ? 0 : -1;
  if (targetStart >= targetEnd) return 1;
  return compareBytes(this, sourceStart, Math.min(sourceEnd, this.length), target, targetStart, Math.min(targetEnd, target.length));
};

// node's IndexOfOffset: where a search of needleLength bytes starts, -1 for none
const indexOfOffset = (length, offset, needleLength, forward) => {
  if (offset < 0) {
    if (offset + length >= 0) return length + offset;
    return forward || needleLength === 0 ? 0 : -1;
  }
  if (offset + needleLength <= length) return offset;
  if (needleLength === 0) return length;
  return forward ? -1 : length - 1;
};

// step 2 keeps utf-16 searches on code unit boundaries
const searchBytes = (haystack, length, needle, offset, forward, step) => {
  const start = indexOfOffset(length, offset, needle.length, forward);
  if (needle.length === 0) return start;
  if (step === 2) {
    if (length < 2 || needle.length < 2) return -1;
    length -= length % 2;
    needle = needle.subarray(0, needle.length - needle.length % 2);
  }
  if (length === 0 || start <= -1 || needle.length > length || (forward && needle.length + start > length)) return -1;

  const matches = i => {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) return false;
    }
    return true;
  };
  if (forward) {
    for (let i = start + start % step; i <= length - needle.length; i += step) if (matches(i)) return i;
  } else {
    for (let i = Math.min(start, length - needle.length); i >= 0; i--) if (i % step === 0 && matches(i)) return i;
  }
  return -1;
};

const bidirectionalIndexOf = (buffer, val, byteOffset, encoding, dir) => {
  if (typeof byteOffset === 'string') {
    encoding = byteOffset;
    byteOffset = undefined;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000;
  }
  byteOffset = +byteOffset;
  if (Number.isNaN(byteOffset)) byteOffset = dir ? 0 : buffer.length;
  byteOffset = Math.trunc(byteOffset);

  const length = buffer.length;
  if (typeof val === 'number') return searchBytes(buffer, length, [ (val >>> 0) & 0xff ], byteOffset, dir, 1);

  const ops = encoding === undefined ? encodingOps.utf8 : getEncodingOps(encoding);
  if (typeof val === 'string') {
    if (ops === undefined) throw errUnknownEncoding(encoding);
    return searchBytes(buffer, length, ops.encode(val), byteOffset, dir, ops.unit);
  }
  if (val instanceof Uint8Array) return searchBytes(buffer, length, val, byteOffset, dir, ops?.unit ?? 1);

  throw errInvalidArgType('value', [ 'number', 'string', 'Buffer', 'Uint8Array' ], val);
};

proto.indexOf = function indexOf(val, offset, encoding) {
  return bidirectionalIndexOf(this, val, offset, encoding, true);
};

proto.lastIndexOf = function lastIndexOf(val, offset, encoding) {
  return bidirectionalIndexOf(this, val, offset, encoding, false);
};

proto.includes = function includes(val, offset, encoding) {
  return bidirectionalIndexOf(this, val, offset, encoding, true) !== -1;
};

const _fill = (buf, value, offset = 0, end = buf.length, encoding = undefined) => {
  if (typeof offset === 'string') {
    encoding = offset;
    offset = 0;
    end = buf.length;
  } else if (typeof end === 'string') {
    encoding = end;
    end = buf.length;
  }
  validateOffset(offset, 'offset');
  validateOffset(end, 'end', 0, buf.length);
  if (offset >= end) return buf;

  let bytes;
  if (typeof value === 'string') {
    const ops = encodingOps[normalizeEncoding(encoding)];
    if (ops === undefined) throw errUnknownEncoding(encoding);
    bytes = value.length === 0 ? [ 0 ] : ops.encode(value);
  } else {
    bytes = ArrayBuffer.isView(value) ? bytesOf(value) : [ value & 0xff ];
  }
  if (bytes.length === 0) throw errInvalidArgValue('value', value);
  if (bytes.length === 1) return Uint8Array.prototype.fill.call(buf, bytes[0], offset, end);
  for (let i = offset; i < end; i++) buf[i] = bytes[(i - offset) % bytes.length];
  return buf;
};

proto.fill = function fill(value, offset, end, encoding) {
  return _fill(this, value, offset, end, encoding);
};

proto.write = function write(string, offset, length, encoding) {
  const bufferLength = this.length;
  if (offset === undefined) return writeString(this, string, 0, bufferLength, encodingOps.utf8);

  if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = bufferLength;
    offset = 0;
  } else {
    validateOffset(offset, 'offset', 0, bufferLength);
    const remaining = bufferLength - offset;
    if (length === undefined) {
      length = remaining;
    } else if (typeof length === 'string') {
      encoding = length;
      length = remaining;
    } else {
      validateOffset(length, 'length', 0, bufferLength);
      if (length > remaining) length = remaining;
    }
  }

  if (!encoding) return writeString(this, string, offset, length, encodingOps.utf8);
  const ops = getEncodingOps(encoding);
  if (ops === undefined) throw errUnknownEncoding(encoding);
  return writeString(this, string, offset, length, ops);
};

proto.toJSON = function toJSON() {
  const data = new Array(this.length);
  for (let i = 0; i < this.length; ++i) data[i] = this[i];
  return { type: 'Buffer', data };
};

const adjustOffset = (offset, length) => {
  offset = Math.trunc(offset);
  if (offset === 0) return 0;
  if (offset < 0) {
    offset += length;
    return offset > 0 ? offset : 0;
  }
  if (offset < length) return offset;
  return Number.isNaN(offset) ? 0 : length;
};

proto.subarray = function subarray(start, end) {
  const srcLength = this.length;
  start = adjustOffset(start, srcLength);
  end = end !== undefined ? adjustOffset(end, srcLength) : srcLength;
  return new FastBuffer(this.buffer, this.byteOffset + start, end > start ? end - start : 0);
};

// unlike Uint8Array, a Buffer slice shares memory
proto.slice = function slice(start, end) {
  return this.subarray(start, end);
};

for (const [ name, encoding ] of [ [ 'ascii', 'ascii' ], [ 'base64', 'base64' ], [ 'base64url', 'base64url' ], [ 'latin1', 'latin1' ], [ 'hex', 'hex' ], [ 'ucs2', 'utf16le' ], [ 'utf8', 'utf8' ] ]) {
  proto[name + 'Slice'] = function (start = 0, end = this.length) {
    if (start > this.length || end > this.length) throw errBufferOutOfBounds();
    return end <= start ? '' : slice(this, encoding, start, end);
  };
  proto[name + 'Write'] = function (string, offset = 0, length) {
    offset = Number(offset);
    return writeString(this, string, offset, length === undefined ? this.byteLength - offset : Number(length), encodingOps[encoding]);
  };
}

const checkBounds = (buf, offset, size) => {
  validateNumber(offset, 'offset');
  if (!Number.isInteger(offset)) throw errOutOfRange('offset', 'an integer', offset);
  if (offset < 0 || offset + size > buf.length) {
    if (buf.length < size) throw errBufferOutOfBounds();
    throw errOutOfRange('offset', `>= 0 and <= ${buf.length - size}`, offset);
  }
};

const checkInt = (value, min, max, buf, offset, size) => {
  if (value > max || value < min) throw errOutOfRange('value', `>= ${min} and <= ${max}`, value);
  checkBounds(buf, offset, size);
};

const view = buf => new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// up to 6 byte integers, as node reads them
const readUInt = (buf, offset, size, little) => {
  checkBounds(buf, offset, size);
  let out = 0;
  for (let i = 0; i < size; i++) out += buf[offset + (little ? i : size - 1 - i)] * 2 ** (8 * i);
  return out;
};

const readInt = (buf, offset, size, little) => {
  const out = readUInt(buf, offset, size, little);
  return out >= 2 ** (size * 8 - 1) ? out - 2 ** (size * 8) : out;
};

const writeInt = (buf, value, offset, size, little, min, max) => {
  value = +value;
  checkInt(value, min, max, buf, offset, size);
  const hi = Math.floor(value * 2 ** -32);
  for (let i = 0; i < size; i++) buf[offset + (little ? i : size - 1 - i)] = i < 4 ? value >>> (8 * i) : hi >>> (8 * (i - 4));
  return offset + size;
};

const checkByteLength = byteLength => {
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > 6) throw errOutOfRange('byteLength', '>= 1 and <= 6', byteLength);
};

for (const [ suffix, little ] of [ [ 'LE', true ], [ 'BE', false ] ]) {
  proto['readUInt' + suffix] = function (offset, byteLength) {
    checkByteLength(byteLength);
    return readUInt(this, offset, byteLength, little);
  };
  proto['readInt' + suffix] = function (offset, byteLength) {
    checkByteLength(byteLength);
    return readInt(this, offset, byteLength, little);
  };
  proto['writeUInt' + suffix] = function (value, offset, byteLength) {
    checkByteLength(byteLength);
    return writeInt(this, value, offset, byteLength, little, 0, 2 ** (byteLength * 8) - 1);
  };
  proto['writeInt' + suffix] = function (value, offset, byteLength) {
    checkByteLength(byteLength);
    return writeInt(this, value, offset, byteLength, little, -(2 ** (byteLength * 8 - 1)), 2 ** (byteLength * 8 - 1) - 1);
  };

  for (const size of [ 2, 4 ]) {
    proto[`readUInt${size * 8}${suffix}`] = function (offset = 0) {
      return readUInt(this, offset, size, little);
    };
    proto[`readInt${size * 8}${suffix}`] = function (offset = 0) {
      return readInt(this, offset, size, little);
    };
    proto[`writeUInt${size * 8}${suffix}`] = function (value, offset = 0) {
      return writeInt(this, value, offset, size, little, 0, 2 ** (size * 8) - 1);
    };
    proto[`writeInt${size * 8}${suffix}`] = function (value, offset = 0) {
      return writeInt(this, value, offset, size, little, -(2 ** (size * 8 - 1)), 2 ** (size * 8 - 1) - 1);
    };
  }

  proto['readFloat' + suffix] = function (offset = 0) {
    checkBounds(this, offset, 4);
    return view(this).getFloat32(offset, little);
  };
  proto['readDouble' + suffix] = function (offset = 0) {
    checkBounds(this, offset, 8);
    return view(this).getFloat64(offset, little);
  };
  proto['writeFloat' + suffix] = function (value, offset = 0) {
    value = +value;
    checkBounds(this, offset, 4);
    view(this).setFloat32(offset, value, little);
    return offset + 4;
  };
  proto['writeDouble' + suffix] = function (value, offset = 0) {
    value = +value;
    checkBounds(this, offset, 8);
    view(this).setFloat64(offset, value, little);
    return offset + 8;
  };

  proto['readBigUInt64' + suffix] = function (offset = 0) {
    checkBounds(this, offset, 8);
    return view(this).getBigUint64(offset, little);
  };
  proto['readBigInt64' + suffix] = function (offset = 0) {
    checkBounds(this, offset, 8);
    return view(this).getBigInt64(offset, little);
  };
  proto['writeBigUInt64' + suffix] = function (value, offset = 0) {
    checkInt(value, 0n, 0xffffffffffffffffn, this, offset, 8);
    view(this).setBigUint64(offset, value, little);
    return offset + 8;
  };
  proto['writeBigInt64' + suffix] = function (value, offset = 0) {
    checkInt(value, -0x8000000000000000n, 0x7fffffffffffffffn, this, offset, 8);
    view(this).setBigInt64(offset, value, little);
    return offset + 8;
  };
}

proto.readUInt8 = function (offset = 0) {
  return readUInt(this, offset, 1, true);
};
proto.readInt8 = function (offset = 0) {
  return readInt(this, offset, 1, true);
};
proto.writeUInt8 = function (value, offset = 0) {
  return writeInt(this, value, offset, 1, true, 0, 0xff);
};
proto.writeInt8 = function (value, offset = 0) {
  return writeInt(this, value, offset, 1, true, -0x80, 0x7f);
};

// node's lowercase Uint aliases
for (const name of Object.getOwnPropertyNames(proto)) {
  if (name.includes('UInt')) proto[name.replace('UInt', 'Uint')] = proto[name];
}

export const btoa = input => {
  input = `${input}`;
  if (/[^\x00-\xff]/.test(input)) throw new DOMException('Invalid character', 'InvalidCharacterError');
  return encodeLatin1(input).toBase64();
};

// forgiving-base64 decode
export const atob = input => {
  let s = `${input}`.replace(/[\t\n\f\r ]/g, '');
  if (s.length % 4 === 0) s = s.replace(/={1,2}$/, '');
  if (s.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(s)) {
    throw new DOMException(/[^A-Za-z0-9+/=]/.test(s) ? 'Invalid character' : 'The string to be decoded is not correctly encoded.', 'InvalidCharacterError');
  }
  const bytes = Uint8Array.fromBase64(s, { lastChunkHandling: 'loose' });
  return decodeLatin1(bytes, 0, bytes.length);
};

export const isUtf8 = input => {
  const bytes = isAnyArrayBuffer(input) ? new Uint8Array(input) : bytesOf(input);
  return isUtf8Bytes(bytes, bytes.length);
};

export { Blob };

const buffer = { Buffer, SlowBuffer, isUtf8, kMaxLength, kStringMaxLength, btoa, atob, constants, Blob };
Object.defineProperty(buffer, 'INSPECT_MAX_BYTES', {
  enumerable: true,
  get: () => INSPECT_MAX_BYTES,
  set: value => {
    INSPECT_MAX_BYTES = value;
  }
});
export default buffer;
