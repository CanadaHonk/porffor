// fetch api classes: Headers, Request, Response, FormData
import { decodeUtf8, decodeLatin1, encodeUtf8, encodeLatin1, concatBytes } from './bytes.js';
import { Blob, File, blobBytes } from './blob.js';
import { AbortController } from './event_target.js';
import { URL, URLSearchParams } from '../url.js';
import { ReadableStream } from './webstreams/readablestream.js';

Porffor.c`#include <sys/random.h>`;

// names are tokens: letters, digits and these
const tokenPunctuation = "!#$%&'*+-.^_`|~";
const headerName = name => {
  name = `${name}`;
  let valid = name.length > 0;
  for (let i = 0; valid && i < name.length; i++) {
    const c = name.charCodeAt(i);
    valid = (c >= 97 && c <= 122) || c === 45 || (c >= 65 && c <= 90) || (c >= 48 && c <= 57) || tokenPunctuation.includes(name[i]);
  }
  if (!valid) throw new TypeError(`"${name}" is an invalid header name.`);
  return name.toLowerCase();
};

// http whitespace is trimmed, and values can't hold nul, cr, lf or wide chars
const httpSpace = c => c === 9 || c === 10 || c === 13 || c === 32;
const headerValue = value => {
  value = `${value}`;
  let start = 0, end = value.length;
  while (start < end && httpSpace(value.charCodeAt(start))) start++;
  while (end > start && httpSpace(value.charCodeAt(end - 1))) end--;
  if (start > 0 || end < value.length) value = value.slice(start, end);
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0 || c === 10 || c === 13 || c > 255) throw new TypeError(`"${value}" is an invalid header value.`);
  }
  return value;
};

export class Headers {
  constructor(init = undefined) {
    // [ name, value, ... ] with lowercased names, a request's raw "name\0value\0" headers split on first use
    this._list = [];
    this._raw = null;
    if (init instanceof Headers) this._list = [ ...init._entries() ];
      else if (init != null && typeof init[Symbol.iterator] === 'function') for (const [ name, value ] of init) this.append(name, value);
      else if (init != null) for (const key of Object.keys(init)) this.append(key, init[key]);
  }

  _entries() {
    if (this._raw !== null) {
      // uWebSockets lowercases the names
      const list = this._raw.split('\0');
      list.pop();
      this._list = list;
      this._raw = null;
    }
    return this._list;
  }

  append(name, value) {
    this._entries().push(headerName(name), headerValue(value));
  }

  delete(name) {
    const key = headerName(name), list = this._entries();
    for (let i = 0; i < list.length;) {
      if (list[i] === key) list.splice(i, 2);
        else i += 2;
    }
  }

  get(name) {
    const key = headerName(name), list = this._entries();
    let out = null;
    for (let i = 0; i < list.length; i += 2) {
      if (list[i] === key) out = out === null ? list[i + 1] : out + (key === 'cookie' ? '; ' : ', ') + list[i + 1];
    }
    return out;
  }

  has(name) {
    return this._has(headerName(name));
  }

  _has(key) {
    const list = this._entries();
    for (let i = 0; i < list.length; i += 2) if (list[i] === key) return true;
    return false;
  }

  set(name, value) {
    const key = headerName(name), list = this._entries();
    value = headerValue(value);
    let found = false;
    for (let i = 0; i < list.length;) {
      if (list[i] !== key) i += 2;
      else if (found) list.splice(i, 2);
      else {
        list[i + 1] = value;
        found = true;
        i += 2;
      }
    }
    if (!found) list.push(key, value);
  }

  // sorted by name, values combined (set-cookie kept apart)
  _combined() {
    const list = this._entries(), out = [];
    for (let i = 0; i < list.length; i += 2) {
      const name = list[i];
      let j = name === 'set-cookie' ? out.length : 0;
      while (j < out.length && out[j][0] !== name) j++;
      if (j === out.length) out.push([ name, list[i + 1] ]);
        else out[j][1] += (name === 'cookie' ? '; ' : ', ') + list[i + 1];
    }
    return out.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  }

  entries() {
    return this._combined().values();
  }

  keys() {
    return this._combined().map(x => x[0]).values();
  }

  values() {
    return this._combined().map(x => x[1]).values();
  }

  forEach(callback, thisArg) {
    for (const [ name, value ] of this._combined()) callback.call(thisArg, value, name, this);
  }
}
Headers.prototype[Symbol.iterator] = Headers.prototype.entries;

// a request's headers as they came off the wire
const rawHeaders = raw => {
  const headers = Object.create(Headers.prototype);
  headers._list = null;
  headers._raw = raw;
  return headers;
};

const formValue = (value, filename) => {
  if (!(value instanceof Blob)) return `${value}`;
  if (value instanceof File && filename === undefined) return value;
  return new File([ value ], filename ?? (value instanceof File ? value.name : 'blob'), { type: value.type });
};

export class FormData {
  #entries = [];

  append(name, value, filename) {
    this.#entries.push([ `${name}`, formValue(value, filename) ]);
  }

  delete(name) {
    this.#entries = this.#entries.filter(x => x[0] !== `${name}`);
  }

  get(name) {
    return this.#entries.find(x => x[0] === `${name}`)?.[1] ?? null;
  }

  getAll(name) {
    return this.#entries.filter(x => x[0] === `${name}`).map(x => x[1]);
  }

  has(name) {
    return this.#entries.some(x => x[0] === `${name}`);
  }

  set(name, value, filename) {
    name = `${name}`;
    const i = this.#entries.findIndex(x => x[0] === name);
    if (i === -1) return this.append(name, value, filename);
    this.#entries[i] = [ name, formValue(value, filename) ];
    this.#entries = this.#entries.filter((x, j) => j <= i || x[0] !== name);
  }

  entries() {
    return this.#entries.map(x => [ x[0], x[1] ]).values();
  }

  keys() {
    return this.#entries.map(x => x[0]).values();
  }

  values() {
    return this.#entries.map(x => x[1]).values();
  }

  forEach(callback, thisArg) {
    for (const [ name, value ] of this.#entries) callback.call(thisArg, value, name, this);
  }
}
FormData.prototype[Symbol.iterator] = FormData.prototype.entries;

const escapeFormName = s => s.replace(/\r\n|\r|\n/g, '\r\n').replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22');

// multipart/form-data, as undici writes it, with an unguessable boundary
const serializeFormData = form => {
  let hi = 0, lo = 0, failed = 0;
  Porffor.c`{ u32 r[2]; failed = getentropy(r, sizeof r); hi = r[0]; lo = r[1]; }`;
  if (failed) throw new Error('getentropy failed');
  const boundary = `----formdata-porffor-${hi.toString(16).padStart(8, '0')}${lo.toString(16).padStart(8, '0')}`;
  const parts = [];
  for (const [ name, value ] of form) {
    if (typeof value === 'string') {
      parts.push(encodeUtf8(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeFormName(name)}"\r\n\r\n${value.replace(/\r(?!\n)|(?<!\r)\n/g, '\r\n')}\r\n`));
    } else {
      parts.push(encodeUtf8(`--${boundary}\r\nContent-Disposition: form-data; name="${escapeFormName(name)}"; filename="${escapeFormName(value.name)}"\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`), blobBytes(value), encodeUtf8('\r\n'));
    }
  }
  parts.push(encodeUtf8(`--${boundary}--\r\n`));
  return [ concatBytes(parts), `multipart/form-data; boundary=${boundary}` ];
};

const parseMultipart = (bytes, boundary) => {
  const form = new FormData();
  const text = decodeLatin1(bytes, 0, bytes.length);
  for (const part of text.split(`--${boundary}`).slice(1)) {
    if (part.startsWith('--')) break;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const head = part.slice(2, headerEnd);
    const content = encodeLatin1(part.slice(headerEnd + 4, part.endsWith('\r\n') ? -2 : undefined));
    const name = /name="([^"]*)"/.exec(head)?.[1] ?? '';
    const filename = /filename="([^"]*)"/.exec(head)?.[1];
    if (filename === undefined) form.append(name, decodeUtf8(content, 0, content.length));
      else form.append(name, new File([ content ], decodeUtf8(encodeLatin1(filename), 0, filename.length), { type: /content-type:\s*([^\r\n]*)/i.exec(head)?.[1] ?? '' }));
  }
  return form;
};

// bodies are kept as a string, bytes or a stream; [ body, default content-type ]
const extractBody = body => {
  if (body == null) return [ null, null ];
  if (body instanceof ReadableStream || body instanceof Uint8Array) return [ body, null ];
  if (typeof body === 'string') return [ body, 'text/plain;charset=UTF-8' ];
  if (ArrayBuffer.isView(body)) return [ new Uint8Array(body.buffer, body.byteOffset, body.byteLength), null ];
  if (body instanceof ArrayBuffer) return [ new Uint8Array(body), null ];
  if (body instanceof Blob) return [ blobBytes(body), body.type || null ];
  if (body instanceof URLSearchParams) return [ body.toString(), 'application/x-www-form-urlencoded;charset=UTF-8' ];
  if (body instanceof FormData) return serializeFormData(body);
  return [ String(body), 'text/plain;charset=UTF-8' ];
};

const bodyText = body => body === null ? '' : typeof body === 'string' ? body : decodeUtf8(body, 0, body.length);
const bodyBytes = body => body === null ? new Uint8Array(0) : typeof body === 'string' ? encodeUtf8(body) : body;

// the whole body once, a stream read to its end first
// a fetched body read whole skips the web stream
const readSource = source => new Promise((resolve, reject) => {
  const chunks = [];
  source.on('data', chunk => chunks.push(chunk));
  source.on('end', () => resolve(concatBytes(chunks)));
  source.on('error', cause => reject(new TypeError('terminated', { cause })));
  source.on('close', () => reject(new TypeError('terminated')));
});

const readBody = async target => {
  if (target.bodyUsed) throw new TypeError('Body is unusable: Body has already been read');
  target.bodyUsed = true;
  if (target._source) return readSource(target._source);
  if (!(target._body instanceof ReadableStream)) return target._body;
  const chunks = [];
  for await (const chunk of target._body) chunks.push(chunk);
  return concatBytes(chunks);
};

const bodyMethods = {
  // a stream body is teed, others are immutable so both share them
  clone() {
    if (this.bodyUsed) throw new TypeError('Body has already been consumed.');
    if (this._source) streamBody(this);
    const copy = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    if (this._body instanceof ReadableStream) [ this._body, copy._body ] = this._body.tee();
    if (this._headers) copy._headers = new Headers(this._headers);
    return copy;
  },
  text() {
    return readBody(this).then(bodyText);
  },
  json() {
    return readBody(this).then(body => JSON.parse(bodyText(body)));
  },
  arrayBuffer() {
    return readBody(this).then(body => new Uint8Array(bodyBytes(body)).buffer);
  },
  bytes() {
    return readBody(this).then(body => new Uint8Array(bodyBytes(body)));
  },
  blob() {
    return readBody(this).then(body => new Blob([ bodyBytes(body) ], { type: this.headers.get('content-type') ?? '' }));
  },
  formData() {
    const type = this.headers.get('content-type') ?? '';
    const boundary = /^multipart\/form-data;.*boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
    return readBody(this).then(body => {
      if (boundary) return parseMultipart(bodyBytes(body), boundary[1] ?? boundary[2]);
      if (!/^application\/x-www-form-urlencoded/i.test(type)) throw new TypeError('Could not parse content as FormData.');
      const form = new FormData();
      for (const [ name, value ] of new URLSearchParams(bodyText(body))) form.append(name, value);
      return form;
    });
  }
};

export class Request {
  constructor(input, init = {}) {
    if (input instanceof Request) {
      this._url = input._url;
      this._method = input._method;
      this.headers = new Headers(init.headers ?? input.headers);
      this._body = init.body !== undefined ? extractBody(init.body)[0] : input._body;
      this._signal = init.signal ?? input._signal;
      this._redirect = init.redirect ?? input._redirect;
    } else {
      this._url = String(input instanceof URL ? input.href : input);
      this._method = 'GET';
      this.headers = new Headers(init.headers);
      const [ body, type ] = extractBody(init.body);
      this._body = body;
      if (type !== null && !this.headers._has('content-type')) this.headers._entries().push('content-type', type);
      this._signal = init.signal;
      this._redirect = init.redirect ?? 'follow';
    }
    if (init.method !== undefined) this._method = String(init.method).toUpperCase();
    if (this._body !== null && (this.method === 'GET' || this.method === 'HEAD')) throw new TypeError('Request with GET/HEAD method cannot have body');
    this.bodyUsed = false;
  }

  // getters, so a subclass can override them
  get url() {
    return this._url;
  }

  get method() {
    return this._method;
  }

  get redirect() {
    return this._redirect;
  }

  // a stream of a kept body, made when first read as one
  get body() {
    return streamBody(this);
  }

  get signal() {
    return this._signal ??= new AbortController().signal;
  }
}
Object.assign(Request.prototype, bodyMethods);

// a server request: url absolute, headers raw until read
export const incomingRequest = (method, url, raw, body) => {
  const request = Object.create(Request.prototype);
  request._method = method;
  request._url = url;
  request._raw = raw;
  request._headers = null;
  request._body = body;
  request._signal = undefined;
  request._redirect = 'follow';
  request.bodyUsed = false;
  return request;
};

Object.defineProperty(Request.prototype, 'headers', {
  get() { return this._headers ??= rawHeaders(this._raw); },
  set(value) { this._headers = value; },
  configurable: true
});

// a fetched body stays a node stream until something needs the web stream
const streamBody = target => {
  if (target._source) {
    target._body = target._toWeb(target._source);
    target._source = null;
  }
  if (target._body === null || target._body instanceof ReadableStream) return target._body;
  const bytes = bodyBytes(target._body);
  return target._body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    }
  });
};

export class Response {
  constructor(body = null, init = {}) {
    const status = init.status ?? 200;
    if (!(status >= 200 && status <= 599)) throw new RangeError(`init["status"] must be in the range of 200 to 599, inclusive.`);
    this.status = status;
    this.statusText = init.statusText ?? '';
    const [ value, type ] = extractBody(body);
    this._body = value;
    // without init headers only the body's content type is kept until headers are read
    this._headers = init.headers === undefined ? null : new Headers(init.headers);
    this._contentType = type;
    if (type !== null && this._headers !== null && !this._headers._has('content-type')) this._headers._entries().push('content-type', type);
    this.bodyUsed = false;
    this.redirected = false;
    this.type = 'default';
    this.url = '';
  }

  get headers() {
    if (this._headers === null) {
      this._headers = new Headers();
      if (this._contentType !== null) this._headers._entries().push('content-type', this._contentType);
    }
    return this._headers;
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  get body() {
    return streamBody(this);
  }

  static json(data, init = {}) {
    const response = new Response(JSON.stringify(data), init);
    if (!new Headers(init.headers).has('content-type')) response.headers.set('content-type', 'application/json');
    return response;
  }
}
Object.assign(Response.prototype, bodyMethods);
