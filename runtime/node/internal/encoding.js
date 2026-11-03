// node's TextEncoder and TextDecoder: utf-8, utf-16le and windows-1252
import '../c-helpers.js';
import { StringDecoder } from '../string_decoder.js';
import { encodeUtf8, decodeUtf8, decodeLatin1, isUtf8Bytes, concatBytes } from './bytes.js';
import { errEncodingInvalidEncodedData, errEncodingNotSupported, errInvalidArgType } from './errors.js';

const labels = {
  'utf-8': [ 'unicode-1-1-utf-8', 'unicode11utf8', 'unicode20utf8', 'utf8', 'utf-8', 'x-unicode20utf8' ],
  'utf-16le': [ 'csunicode', 'iso-10646-ucs-2', 'ucs-2', 'unicode', 'unicodefeff', 'utf-16le', 'utf-16' ],
  'windows-1252': [ 'ansi_x3.4-1968', 'ascii', 'cp1252', 'cp819', 'csisolatin1', 'ibm819', 'iso-8859-1', 'iso-ir-100', 'iso8859-1', 'iso88591', 'iso_8859-1', 'iso_8859-1:1987', 'l1', 'latin1', 'us-ascii', 'windows-1252', 'x-cp1252' ]
};
const encodings = new Map();
for (const name in labels) for (const label of labels[name]) encodings.set(label, name);

// windows-1252 differs from latin1 in 0x80-0x9f
const cp1252 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178
];

const parseInput = input => {
  if (input instanceof ArrayBuffer || input instanceof SharedArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw errInvalidArgType('input', [ 'ArrayBuffer', 'ArrayBufferView' ], input);
};

// bytes at the end that start a utf-8 sequence more data could finish
const unfinishedUtf8 = bytes => {
  const len = bytes.length;
  let pos = 0;
  while (pos < 2 && pos < len && (bytes[len - pos - 1] & 0xc0) === 0x80) pos++;
  if (pos === len) return 0;
  const lead = bytes[len - pos - 1];
  if (lead < 0xc2 || lead > 0xf4) return 0;
  if (pos === 0) return 1;
  if (lead < 0xe0 || (lead < 0xf0 && pos >= 2)) return 0;
  const lower = lead === 0xf0 ? 0x90 : lead === 0xe0 ? 0xa0 : 0x80;
  const upper = lead === 0xf4 ? 0x8f : lead === 0xed ? 0x9f : 0xbf;
  const next = bytes[len - pos];
  return next >= lower && next <= upper ? pos + 1 : 0;
};

export class TextEncoder {
  get encoding() {
    return 'utf-8';
  }

  encode(input = '') {
    return encodeUtf8(`${input}`);
  }

  // whole characters that fit, as utf-8
  encodeInto(src, dest) {
    let units = 0, bytes = 0;
    const cap = dest.length;
    Porffor.c`{
  u32 used;
  bytes = porf_node_utf8_into(src, (u8*)porf_node_u8(dest), (size_t)porf_jv_val(cap), &used);
  units = used;
}`;
    return { read: units, written: bytes };
  }
}

export class TextDecoder {
  #encoding;
  #fatal;
  #ignoreBOM;
  #bomSeen = false;
  #pending = null;
  #utf16;

  constructor(encoding = 'utf-8', options = undefined) {
    encoding = `${encoding}`;
    this.#encoding = encodings.get(encoding) ?? encodings.get(encoding.trim().toLowerCase());
    if (this.#encoding === undefined) throw errEncodingNotSupported(encoding);
    this.#fatal = !!options?.fatal;
    this.#ignoreBOM = !!options?.ignoreBOM;
    if (this.#encoding === 'utf-16le') this.#utf16 = new StringDecoder('utf-16le');
  }

  get encoding() {
    return this.#encoding;
  }

  get fatal() {
    return this.#fatal;
  }

  get ignoreBOM() {
    return this.#ignoreBOM;
  }

  decode(input = new Uint8Array(0), options = undefined) {
    let bytes = parseInput(input);
    const stream = !!options?.stream;
    let out;
    if (this.#encoding === 'windows-1252') {
      out = decodeLatin1(bytes, 0, bytes.length).replace(/[\x80-\x9f]/g, c => String.fromCharCode(cp1252[c.charCodeAt(0) - 0x80]));
    } else if (this.#encoding === 'utf-16le') {
      out = stream ? this.#utf16.write(bytes) : this.#utf16.end(bytes);
      if (this.#fatal && !out.isWellFormed()) throw errEncodingInvalidEncodedData('utf-16le');
      out = out.toWellFormed();
    } else {
      if (this.#pending !== null) {
        bytes = concatBytes([ this.#pending, bytes ]);
        this.#pending = null;
      }
      if (stream) {
        const tail = unfinishedUtf8(bytes);
        if (tail > 0) {
          this.#pending = bytes.slice(bytes.length - tail);
          bytes = bytes.subarray(0, bytes.length - tail);
        }
      }
      if (this.#fatal && !isUtf8Bytes(bytes, bytes.length)) {
        this.#pending = null;
        throw errEncodingInvalidEncodedData('utf-8');
      }
      out = decodeUtf8(bytes, 0, bytes.length);
    }

    // a byte order mark only counts at the start of the stream
    const atStart = !this.#bomSeen;
    this.#bomSeen = stream && (this.#bomSeen || out.length > 0);
    if (!this.#ignoreBOM && atStart && out[0] === '\ufeff') out = out.slice(1);
    return out;
  }
}
