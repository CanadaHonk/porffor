import { Buffer } from './buffer.js';
import { normalizeEncoding } from './internal/bytes.js';
import { errInvalidArgType, errUnknownEncoding } from './internal/errors.js';

// lastChar holds an incomplete character, lastTotal bytes long with lastNeed of them still to come
export function StringDecoder(encoding) {
  this.encoding = normalizeEncoding(encoding);
  if (this.encoding === undefined) throw errUnknownEncoding(encoding);
  this.lastChar = Buffer.alloc(4);
  this.lastNeed = 0;
  this.lastTotal = 0;
}

StringDecoder.prototype.write = function (buf) {
  if (typeof buf === 'string') return buf;
  if (!ArrayBuffer.isView(buf)) throw errInvalidArgType('buf', 'an instance of Buffer, TypedArray, or DataView', buf);
  let data = buf instanceof Buffer ? buf : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  const encoding = this.encoding;
  if (encoding !== 'utf8' && encoding !== 'utf16le' && encoding !== 'base64' && encoding !== 'base64url') return data.toString(encoding);

  let prepend = '';
  if (this.lastNeed > 0) {
    let found = Math.min(data.length, this.lastNeed), complete = found === this.lastNeed;
    // a non-continuation byte ends the incomplete utf-8 character early
    if (encoding === 'utf8') {
      for (let i = 0; i < found; i++) {
        if ((data[i] & 0xc0) !== 0x80) {
          found = i;
          complete = true;
          break;
        }
      }
    }

    const buffered = this.lastTotal - this.lastNeed;
    this.lastChar.set(data.subarray(0, found), buffered);
    data = data.subarray(found);
    if (!complete) {
      this.lastNeed -= found;
      return '';
    }
    prepend = this.lastChar.toString(encoding, 0, buffered + found);
    this.lastNeed = 0;
    this.lastTotal = 0;
    if (data.length === 0) return prepend;
  }

  let n = data.length;
  if (encoding === 'utf8') {
    // find where the last character starts and whether it is cut off
    let i = n - 1;
    while (i > 0 && i > n - 4 && (data[i] & 0xc0) === 0x80) i--;
    const lead = data[i];
    const total = lead >= 0xf0 && lead < 0xf8 ? 4 : lead >= 0xe0 && lead < 0xf0 ? 3 : lead >= 0xc0 && lead < 0xe0 ? 2 : 0;
    if (total > n - i) {
      this.lastTotal = total;
      this.lastNeed = total - (n - i);
    }
  } else if (encoding === 'utf16le') {
    if (n % 2 === 1) {
      this.lastTotal = 2;
      this.lastNeed = 1;
    } else if ((data[n - 1] & 0xfc) === 0xd8) {
      // a lead surrogate waits for its trail
      this.lastTotal = 4;
      this.lastNeed = 2;
    }
  } else if (n % 3 > 0) {
    this.lastTotal = 3;
    this.lastNeed = 3 - n % 3;
  }

  const buffered = this.lastTotal - this.lastNeed;
  if (buffered > 0) {
    n -= buffered;
    this.lastChar.set(data.subarray(n), 0);
  }
  return prepend + data.toString(encoding, 0, n);
};

StringDecoder.prototype.end = function (buf) {
  let out = buf === undefined ? '' : this.write(buf);
  let buffered = this.lastTotal - this.lastNeed;
  // a lone trailing utf-16 byte is dropped
  if (this.encoding === 'utf16le' && buffered % 2 === 1) buffered--;
  if (buffered > 0) out += this.lastChar.toString(this.encoding, 0, buffered);
  this.lastNeed = 0;
  this.lastTotal = 0;
  return out;
};

export default { StringDecoder };
