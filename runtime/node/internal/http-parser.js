// incremental http/1.x response parser: status line and headers, then a content-length, chunked or close-delimited body
import { Buffer } from '../buffer.js';
import { decodeLatin1 } from './bytes.js';

// onHeaders results
export const SKIP_BODY = 1, STOP = 2;

const HEADERS = 0, BODY_LENGTH = 1, CHUNK_SIZE = 2, CHUNK_DATA = 3, CHUNK_END = 4, TRAILERS = 5, BODY_EOF = 6, STOPPED = 7;

export const METHODS = [
  'ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LINK', 'LOCK', 'M-SEARCH', 'MERGE', 'MKACTIVITY', 'MKCALENDAR',
  'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH', 'POST', 'PROPFIND', 'PROPPATCH', 'PURGE', 'PUT', 'QUERY', 'REBIND', 'REPORT', 'SEARCH',
  'SOURCE', 'SUBSCRIBE', 'TRACE', 'UNBIND', 'UNLINK', 'UNLOCK', 'UNSUBSCRIBE'
];

export const isToken = s => {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || c === 33 || (c >= 35 && c <= 39) || c === 42 || c === 43 || c === 45 || c === 46 || c === 94 || c === 95 || c === 96 || c === 124 || c === 126)) return false;
  }
  return true;
};

// field-value: tab, visible ascii and obs-text
export const isFieldValue = s => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c < 32 && c !== 9) || c === 127 || c > 255) return false;
  }
  return true;
};

const isOws = c => c === 32 || c === 9;

const parseError = (code, reason) => {
  const err = new Error(`Parse Error: ${reason}`);
  err.code = code;
  err.reason = reason;
  return err;
};

// first \r\n\r\n at or after from, -1 if none
const findHeadersEnd = (buf, from, len) => {
  for (let i = from; i + 3 < len; i++) {
    if (buf[i + 3] !== 10) {
      if (buf[i + 3] !== 13) i += 3;
      continue;
    }
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13) return i;
  }
  return -1;
};

const findLineEnd = (buf, from, len) => {
  for (let i = from; i + 1 < len; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i;
  }
  return -1;
};

export class HTTPParser {
  constructor(maxHeaderSize) {
    this.maxHeaderSize = maxHeaderSize;
    this.state = HEADERS;
    this.pending = null;
    this.remaining = 0;
    this.onHeaders = null;
    this.onBody = null;
    this.onComplete = null;
  }

  // returns a parse error, else null
  execute(chunk) {
    if (this.pending !== null) {
      chunk = Buffer.concat([ this.pending, chunk ]);
      this.pending = null;
    }
    return this.run(chunk);
  }

  // the peer closed: ends a close-delimited body
  finish() {
    if (this.state === BODY_EOF) {
      this.complete();
      return null;
    }
    if (this.state !== HEADERS || (this.pending !== null && this.pending.length > 0)) return parseError('HPE_INVALID_EOF_STATE', 'Invalid EOF state');
    return null;
  }

  // bytes after a stopped (upgraded) message
  takeRemaining() {
    const rest = this.pending ?? Buffer.alloc(0);
    this.pending = null;
    return rest;
  }

  run(buf) {
    const len = buf.length;
    let pos = 0;
    while (pos < len) {
      if (this.state === STOPPED) {
        this.pending = buf.subarray(pos);
        return null;
      }

      const state = this.state;
      if (state === HEADERS) {
        // stray line breaks between messages
        while (pos < len && (buf[pos] === 13 || buf[pos] === 10)) pos++;
        if (pos === len) return null;
        const end = findHeadersEnd(buf, pos, len);
        if (end === -1 || end - pos > this.maxHeaderSize) {
          if (len - pos > this.maxHeaderSize) return parseError('HPE_HEADER_OVERFLOW', 'Header overflow');
          this.pending = buf.subarray(pos);
          return null;
        }
        const err = this.headers(decodeLatin1(buf, pos, end));
        if (err) return err;
        pos = end + 4;
      } else if (state === BODY_LENGTH || state === CHUNK_DATA) {
        const n = this.remaining < len - pos ? this.remaining : len - pos;
        this.onBody(buf.subarray(pos, pos + n));
        pos += n;
        this.remaining -= n;
        if (this.remaining === 0) {
          if (state === CHUNK_DATA) this.state = CHUNK_END;
            else this.complete();
        }
      } else if (state === CHUNK_SIZE) {
        // a chunk size line, then up to 16KiB of chunk extensions
        const end = findLineEnd(buf, pos, len);
        if ((end === -1 ? len : end) - pos > 16384 + 16) return parseError('HPE_CHUNK_EXTENSIONS_OVERFLOW', 'Chunk extensions overflow');
        if (end === -1) {
          this.pending = buf.subarray(pos);
          return null;
        }
        let size = 0, digits = 0, i = pos;
        for (; i < end; i++) {
          const c = buf[i] | 32;
          const digit = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : -1;
          if (digit === -1) break;
          size = size * 16 + digit;
          digits++;
        }
        // only chunk extensions may follow the size
        while (i < end && isOws(buf[i])) i++;
        if (digits === 0 || digits > 16 || (i < end && buf[i] !== 59)) return parseError('HPE_INVALID_CHUNK_SIZE', 'Invalid character in chunk size');
        pos = end + 2;
        if (size === 0) this.state = TRAILERS;
        else {
          this.remaining = size;
          this.state = CHUNK_DATA;
        }
      } else if (state === CHUNK_END) {
        if (len - pos < 2) {
          this.pending = buf.subarray(pos);
          return null;
        }
        if (buf[pos] !== 13 || buf[pos + 1] !== 10) return parseError('HPE_STRICT', 'Expected CRLF after chunk');
        pos += 2;
        this.state = CHUNK_SIZE;
      } else if (state === TRAILERS) {
        if (len - pos < 2) {
          this.pending = buf.subarray(pos);
          return null;
        }
        if (buf[pos] === 13 && buf[pos + 1] === 10) {
          pos += 2;
          this.complete();
          continue;
        }
        // trailers are skipped
        const end = findHeadersEnd(buf, pos, len);
        if (end === -1) {
          if (len - pos > this.maxHeaderSize) return parseError('HPE_HEADER_OVERFLOW', 'Header overflow');
          this.pending = buf.subarray(pos);
          return null;
        }
        pos = end + 4;
        this.complete();
      } else if (state === BODY_EOF) {
        this.onBody(buf.subarray(pos));
        pos = len;
      }
    }
    return null;
  }

  complete() {
    this.state = HEADERS;
    this.onComplete();
  }

  headers(text) {
    const lines = text.split('\r\n');
    const first = lines[0];
    const info = { statusCode: 0, statusMessage: null, versionMajor: 1, versionMinor: 1, rawHeaders: [], keepAlive: false, upgrade: false };

    const version = first.slice(0, 8);
    const code = first.slice(9, 12);
    if (first.length < 12 || (first.length > 12 && first[12] !== ' ') || !(code >= '100' && code <= '999') || code.length !== 3) return parseError('HPE_INVALID_STATUS', 'Invalid response status');
    info.statusCode = +code;
    info.statusMessage = first.slice(13);
    if (version.length !== 8 || !version.startsWith('HTTP/') || version[6] !== '.' || !(version[5] >= '0' && version[5] <= '9') || !(version[7] >= '0' && version[7] <= '9')) return parseError('HPE_INVALID_VERSION', 'Invalid HTTP version');
    info.versionMajor = +version[5];
    info.versionMinor = +version[7];

    let contentLength = -1, chunked = false, transferEncoding = false, connectionClose = false, connectionKeepAlive = false;
    const raw = info.rawHeaders;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const colon = line.indexOf(':');
      if (colon <= 0 || isOws(line.charCodeAt(0)) || line.includes('\r')) return parseError('HPE_INVALID_HEADER_TOKEN', 'Invalid header value char');
      const name = line.slice(0, colon);
      if (!isToken(name)) return parseError('HPE_INVALID_HEADER_TOKEN', 'Invalid header token');

      let start = colon + 1, end = line.length;
      while (start < end && isOws(line.charCodeAt(start))) start++;
      while (end > start && isOws(line.charCodeAt(end - 1))) end--;
      const value = line.slice(start, end);
      if (!isFieldValue(value)) return parseError('HPE_INVALID_HEADER_TOKEN', 'Invalid header value char');
      raw.push(name, value);

      // framing headers, by length first to skip lowercasing the rest
      const n = name.length;
      if (n !== 14 && n !== 17 && n !== 10 && n !== 7) continue;
      const lower = name.toLowerCase();
      if (lower === 'content-length') {
        if (!/^\d+$/.test(value)) return parseError('HPE_INVALID_CONTENT_LENGTH', 'Invalid character in Content-Length');
        if ((contentLength !== -1 && contentLength !== +value) || transferEncoding) return parseError('HPE_UNEXPECTED_CONTENT_LENGTH', 'Unexpected Content-Length');
        contentLength = +value;
      } else if (lower === 'transfer-encoding') {
        if (contentLength !== -1) return parseError('HPE_INVALID_TRANSFER_ENCODING', 'Transfer-Encoding can\'t be present with Content-Length');
        for (const coding of value.toLowerCase().split(',')) chunked = coding.trim() === 'chunked';
        transferEncoding = true;
      } else if (lower === 'connection') {
        for (const token of value.toLowerCase().split(',')) {
          const t = token.trim();
          if (t === 'close') connectionClose = true;
            else if (t === 'keep-alive') connectionKeepAlive = true;
        }
      }
    }

    const http11 = info.versionMajor > 1 || (info.versionMajor === 1 && info.versionMinor >= 1);
    const status = info.statusCode;
    // a response delimited by closing can't keep the connection (decided before HEAD skips the body)
    const needsEof = !chunked && contentLength === -1 && status >= 200 && status !== 204 && status !== 304;
    info.keepAlive = !needsEof && (http11 ? !connectionClose : connectionKeepAlive);
    info.upgrade = status === 101;

    const action = this.onHeaders(info);
    if (action === STOP) this.state = STOPPED;
    else if (action === SKIP_BODY || status < 200 || status === 204 || status === 304) this.complete();
    else if (chunked) this.state = CHUNK_SIZE;
    else if (contentLength > 0) {
      this.remaining = contentLength;
      this.state = BODY_LENGTH;
    } else if (contentLength === 0) this.complete();
    else this.state = BODY_EOF;
    return null;
  }
}
