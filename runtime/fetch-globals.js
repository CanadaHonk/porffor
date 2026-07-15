const crypto = {};

class Headers {
  constructor(init = undefined) {
    if (init == null) {
      this._entries = Porffor.array.new(0);
      return;
    }

    if (Porffor.type(init.entries) == Porffor.TYPES.function) {
      this._entries = Porffor.array.new(8);
      for (const entry of init.entries()) {
        this.append(entry[0], entry[1]);
      }
      return;
    }

    if (Array.isArray(init)) {
      this._entries = Porffor.array.new(init.length * 2);
      for (const entry of init) {
        if (!entry || entry.length < 2) continue;
        this.append(entry[0], entry[1]);
      }
      return;
    }

    this._entries = Porffor.array.new(8);
    for (const key in init) {
      this.append(key, init[key]);
    }
  }

  append(name, value) {
    const normalizedName = (Porffor.type(name) | 0b10000000) == Porffor.TYPES.bytestring ? name : String(name);
    Porffor.array.fastPush(this._entries, normalizedName.toLowerCase());

    const stringValue = (Porffor.type(value) | 0b10000000) == Porffor.TYPES.bytestring ? value : String(value);
    Porffor.array.fastPush(this._entries, stringValue);
  }

  delete(name) {
    const normalized = ((Porffor.type(name) | 0b10000000) == Porffor.TYPES.bytestring ? name : String(name)).toLowerCase();
    const next = Porffor.array.new(this._entries.length);
    for (let i = 0; i < this._entries.length; i += 2) {
      if (this._entries[i] == normalized) continue;
      Porffor.array.fastPush(next, this._entries[i]);
      Porffor.array.fastPush(next, this._entries[i + 1]);
    }

    this._entries = next;
  }

  entries() {
    const out = Porffor.array.new(this._entries.length / 2);
    for (let i = 0; i < this._entries.length; i += 2) {
      const entry = Porffor.array.new(2);
      entry[0] = this._entries[i];
      entry[1] = this._entries[i + 1];
      Porffor.array.fastPush(out, entry);
    }

    return out;
  }

  forEach(callback, thisArg = undefined) {
    for (let i = 0; i < this._entries.length; i += 2) {
      callback.call(thisArg, this._entries[i + 1], this._entries[i], this);
    }
  }

  get(name) {
    const normalized = ((Porffor.type(name) | 0b10000000) == Porffor.TYPES.bytestring ? name : String(name)).toLowerCase();
    for (let i = 0; i < this._entries.length; i += 2) {
      if (this._entries[i] == normalized) return this._entries[i + 1];
    }

    return null;
  }

  has(name) {
    return this.get(name) != null;
  }

  keys() {
    const out = Porffor.array.new(this._entries.length / 2);
    for (let i = 0; i < this._entries.length; i += 2) {
      Porffor.array.fastPush(out, this._entries[i]);
    }
    return out;
  }

  set(name, value) {
    this.delete(name);
    this.append(name, value);
  }

  values() {
    const out = Porffor.array.new(this._entries.length / 2);
    for (let i = 1; i < this._entries.length; i += 2) Porffor.array.fastPush(out, this._entries[i]);
    return out;
  }
}

function setTimeout(callback, delay = 0, ...args) {
  let id = 0;
  Porffor.c`id = (i32)porf_native_fetch_set_timer(callback, args, delay, 0);`;
  return id;
}

function clearTimeout(timer) {
  Porffor.c`porf_native_fetch_clear_timer(timer);`;
}

function setInterval(callback, delay = 0, ...args) {
  let id = 0;
  Porffor.c`id = (i32)porf_native_fetch_set_timer(callback, args, delay, 1);`;
  return id;
}

function clearInterval(timer) {
  clearTimeout(timer);
}

class Blob {
  constructor(parts = []) {
    this._text = '';
    for (const part of parts) {
      this._text += (Porffor.type(part) | 0b10000000) == Porffor.TYPES.bytestring ? part : String(part);
    }
  }

  text() {
    return this._text;
  }
}

class TextEncoder {
  get encoding() {
    return 'utf-8';
  }

  encode(input = '') {
    const text = (Porffor.type(input) | 0b10000000) == Porffor.TYPES.bytestring ? input : String(input);
    let length = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      length += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    }

    const out = new Uint8Array(length);
    let offset = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) {
        out[offset++] = code;
      } else if (code < 0x800) {
        out[offset++] = 0xc0 | code >> 6;
        out[offset++] = 0x80 | code & 0x3f;
      } else {
        out[offset++] = 0xe0 | code >> 12;
        out[offset++] = 0x80 | code >> 6 & 0x3f;
        out[offset++] = 0x80 | code & 0x3f;
      }
    }

    return out;
  }

  encodeInto(source, destination) {
    const bytes = this.encode(source);
    const length = Math.min(bytes.length, destination.length);
    for (let i = 0; i < length; i++) destination[i] = bytes[i];
    return { read: String(source).length, written: length };
  }
}

class TextDecoder {
  constructor(label = 'utf-8') {
    this.encoding = String(label).toLowerCase();
  }

  decode(input = undefined) {
    if (input == null) return '';

    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input.buffer ?? input);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      const a = bytes[i];
      if (a < 0x80) {
        out += String.fromCharCode(a);
      } else if (a < 0xe0) {
        out += String.fromCharCode((a & 0x1f) << 6 | bytes[++i] & 0x3f);
      } else {
        const b = bytes[++i];
        const c = bytes[++i];
        out += String.fromCharCode((a & 0x0f) << 12 | (b & 0x3f) << 6 | c & 0x3f);
      }
    }

    return out;
  }
}

class URL {
  constructor(input) {
    this.href = '';
    this.origin = '';

    const rawInput = input != null && Porffor.type(input) == Porffor.TYPES.object ? input.href ?? input : input;
    const raw = (Porffor.type(rawInput) | 0b10000000) == Porffor.TYPES.bytestring ? rawInput : String(rawInput);
    const schemeIndex = raw.indexOf('://');
    const originStart = schemeIndex == -1 ? 0 : schemeIndex + 3;
    const pathIndex = raw.indexOf('/', originStart);
    const queryIndex = raw.indexOf('?', pathIndex == -1 ? originStart : pathIndex);

    if (schemeIndex !== -1) {
      const originEnd = pathIndex == -1 ? (queryIndex == -1 ? raw.length : queryIndex) : pathIndex;
      this.origin = raw.slice(0, originEnd);
    }

    if (pathIndex == -1) {
      this._pathname = '/';
      this.search = queryIndex == -1 ? '' : raw.slice(queryIndex);
    } else {
      const pathnameEnd = queryIndex == -1 ? raw.length : queryIndex;
      this._pathname = raw.slice(pathIndex, pathnameEnd) || '/';
      this.search = queryIndex == -1 ? '' : raw.slice(queryIndex);
    }

    if (this.origin == '' && raw.startsWith('/')) {
      this.href = `${this._pathname}${this.search}`;
      return;
    }

    this._sync();
  }

  get pathname() {
    return this._pathname;
  }

  set pathname(value) {
    this._pathname = value || '/';
    this._sync();
  }

  _sync() {
    this.href = `${this.origin}${this._pathname}${this.search}`;
  }

  toString() {
    return this.href;
  }
}

class Request {
  constructor(input, init = undefined) {
    let url = input;
    let method = 'GET';
    let headers = undefined;
    let body = '';

    if (input != null && Porffor.type(input) == Porffor.TYPES.object) {
      const inputUrl = input.url;
      if (inputUrl != null) {
        url = inputUrl;

        const inputMethod = input.method;
        if (inputMethod != null) method = inputMethod;

        const inputHeaders = input.headers;
        if (inputHeaders != null) headers = inputHeaders;

        const inputBody = input.body;
        if (inputBody != null) body = inputBody;
      } else {
        const inputHref = input.href;
        if (inputHref != null) url = inputHref;
      }
    }

    if (init != null) {
      const initMethod = init.method;
      if (initMethod != null) method = initMethod;

      const initHeaders = init.headers;
      if (initHeaders != null) headers = initHeaders;

      const initBody = init.body;
      if (initBody != null) body = initBody;
    }

    this.url = (Porffor.type(url) | 0b10000000) == Porffor.TYPES.bytestring ? url : String(url);
    this.method = ((Porffor.type(method) | 0b10000000) == Porffor.TYPES.bytestring ? method : String(method)).toUpperCase();
    this.headers = new Headers(headers);
    this.body = body;
  }

  arrayBuffer() {
    const body = this.body ?? '';
    const text = (Porffor.type(body) | 0b10000000) == Porffor.TYPES.bytestring ? body : String(body);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes.buffer;
  }

  blob() {
    return new Blob([this.body ?? '']);
  }

  clone() {
    return new Request(this);
  }

  json() {
    const body = this.body ?? '';
    return JSON.parse((Porffor.type(body) | 0b10000000) == Porffor.TYPES.bytestring ? body : String(body));
  }

  text() {
    const body = this.body ?? '';
    return (Porffor.type(body) | 0b10000000) == Porffor.TYPES.bytestring ? body : String(body);
  }
}

class Response {
  constructor(body = null, init = undefined) {
    this.body = body;
    this.status = Number(init?.status ?? 200);
    this.headers = new Headers(init?.headers);
  }

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  arrayBuffer() {
    const text = this.text();
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes.buffer;
  }

  blob() {
    return new Blob([this.text()]);
  }

  clone() {
    return new Response(this.body, this);
  }

  json() {
    if ((Porffor.type(this.body) | 0b10000000) == Porffor.TYPES.bytestring) return JSON.parse(this.body);
    return this.body;
  }

  text() {
    if (this.body == null) return '';
    return (Porffor.type(this.body) | 0b10000000) == Porffor.TYPES.bytestring ? this.body : String(this.body);
  }
}
