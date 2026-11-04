import process from './process.js';
import { resolve as resolvePath } from './path.js';
import querystring from './querystring.js';
import { encodeUtf8 } from './internal/bytes.js';
import { errInvalidArgType, errInvalidArgValue, errInvalidTuple, errInvalidUrl } from './internal/errors.js';
import { validateString } from './internal/validators.js';
import { isURL, fileURLObjectToPath } from './internal/file-url.js';
import './c-helpers.js';

// whatwg urls are ada's: a url keeps ada's normalised href and where its components start in it
Porffor.link`ada`;
Porffor.c`
#include <ada_c.h>

// a js string's utf-8 for ada: an ascii bytestring's own bytes, else a malloc'd copy in *owned
static const char *porf_ada_in(jsval v, size_t *len, char **owned) {
  *owned = NULL;
  if (porf_jv_type(v) == PORF_NODE_BYTESTRING) {
    const u8 *s = (const u8*)(MEM + porf_jv_ptr(v) + 4);
    *len = *(u32*)(MEM + porf_jv_ptr(v));
    u64 high = 0;
    size_t i = 0;
    for (; i + 8 <= *len; i += 8) {
      u64 w;
      memcpy(&w, s + i, 8);
      high |= w;
    }
    for (; i < *len; i++) high |= s[i];
    if (!(high & 0x8080808080808080ull)) return (const char*)s;
  }
  return *owned = porf_node_bytes(v, len);
}

// ada's href (input itself when unchanged) with components into comps, freeing the url; undefined when invalid
static jsval porf_ada_take(ada_url u, jsval comps, jsval input) {
  jsval href = JV_UNDEFINED;
  if (ada_is_valid(u)) {
    const ada_string s = ada_get_href(u);
    const ada_url_components *c = ada_get_components(u);
    u32 *out = (u32*)porf_node_u8(comps);
    href = porf_jv_type(input) == PORF_NODE_BYTESTRING && *(u32*)(MEM + porf_jv_ptr(input)) == s.length && memcmp(MEM + porf_jv_ptr(input) + 4, s.data, s.length) == 0 ? input : porf_bstr_of(s.data, (u32)s.length);
    out[0] = c->protocol_end; out[1] = c->username_end; out[2] = c->host_start; out[3] = c->host_end;
    out[4] = c->port; out[5] = c->pathname_start; out[6] = c->search_start; out[7] = c->hash_start;
    out[8] = ada_get_scheme_type(u);
  }
  ada_free(u);
  return href;
}
`;

const OMITTED = 0xffffffff, NOT_SPECIAL = 1, HTTP = 0, HTTPS = 2, FILE = 6;
const comps = new Uint32Array(9);

const adaParse = (input, base, hasBase) => {
  const out = comps;
  let href;
  Porffor.c`{
  size_t il, bl;
  char *io, *bo;
  const char *i = porf_ada_in(input, &il, &io), *b = porf_ada_in(base, &bl, &bo);
  href = porf_ada_take(porf_jv_val(hasBase) ? ada_parse_with_base(i, il, b, bl) : ada_parse(i, il), out, input);
  free(io);
  free(bo);
}`;
  return href;
};

const adaCanParse = (input, base, hasBase) => {
  let ok = 0;
  Porffor.c`{
  size_t il, bl;
  char *io, *bo;
  const char *i = porf_ada_in(input, &il, &io), *b = porf_ada_in(base, &bl, &bo);
  ok = porf_jv_val(hasBase) ? ada_can_parse_with_base(i, il, b, bl) : ada_can_parse(i, il);
  free(io);
  free(bo);
}`;
  return ok === 1;
};

// href with one component set like its URL setter, undefined for a rejected href
const adaSet = (href, which, value) => {
  const c = comps;
  let out;
  Porffor.c`{
  size_t hl, vl;
  char *ho, *vo;
  const char *h = porf_ada_in(href, &hl, &ho), *v = porf_ada_in(value, &vl, &vo);
  ada_url u = ada_parse(h, hl);
  int ok = 1;
  switch ((int)porf_jv_val(which)) {
    case 0: ok = ada_set_href(u, v, vl); break;
    case 1: ada_set_protocol(u, v, vl); break;
    case 2: ada_set_username(u, v, vl); break;
    case 3: ada_set_password(u, v, vl); break;
    case 4: ada_set_host(u, v, vl); break;
    case 5: ada_set_hostname(u, v, vl); break;
    case 6: if (vl) ada_set_port(u, v, vl); else ada_clear_port(u); break;
    case 7: ada_set_pathname(u, v, vl); break;
    case 8: if (vl) ada_set_search(u, v, vl); else ada_clear_search(u); break;
    case 9: if (vl) ada_set_hash(u, v, vl); else ada_clear_hash(u); break;
  }
  if (ok) out = porf_ada_take(u, c, value);
    else ada_free(u);
  free(ho);
  free(vo);
}`;
  return out;
};

const adaIdna = (domain, which) => {
  let out;
  Porffor.c`{
  size_t dl;
  char *dd;
  const char *d = porf_ada_in(domain, &dl, &dd);
  ada_owned_string s = porf_jv_val(which) ? ada_idna_to_unicode(d, dl) : ada_idna_to_ascii(d, dl);
  out = porf_node_str(s.data, s.length);
  ada_free_owned_string(s);
  free(dd);
}`;
  return out;
};

// application/x-www-form-urlencoded as a [ name, value, ... ] list and back
const parseParams = query => {
  let list;
  Porffor.c`{
  size_t ql;
  char *qo;
  const char *q = porf_ada_in(query, &ql, &qo);
  ada_url_search_params p = ada_parse_search_params(q, ql);
  ada_url_search_params_entries_iter it = ada_search_params_get_entries(p);
  const u32 a = porf_arr_new(0, 2 * (i32)ada_search_params_size(p));
  while (ada_search_params_entries_iter_has_next(it)) {
    const ada_string_pair e = ada_search_params_entries_iter_next(it);
    porf_arr_push(a, porf_node_str(e.key.data, e.key.length));
    porf_arr_push(a, porf_node_str(e.value.data, e.value.length));
  }
  ada_free_search_params_entries_iter(it);
  ada_free_search_params(p);
  free(qo);
  list = porf_box(a, PORF_NODE_ARRAY);
}`;
  return list;
};

const serializeParams = list => {
  let out;
  Porffor.c`{
  ada_url_search_params p = ada_parse_search_params("", 0);
  const u32 a = porf_jv_ptr(list), n = *(u32*)(MEM + a);
  for (u32 i = 0; i + 1 < n; i += 2) {
    size_t kl, vl;
    char *ko, *vo;
    const char *k = porf_ada_in(porf_unpack(*(jsbits*)(MEM + *(u32*)(MEM + a + 4) + i * 8)), &kl, &ko);
    const char *v = porf_ada_in(porf_unpack(*(jsbits*)(MEM + *(u32*)(MEM + a + 4) + (i + 1) * 8)), &vl, &vo);
    ada_search_params_append(p, k, kl, v, vl);
    free(ko);
    free(vo);
  }
  ada_owned_string s = ada_search_params_to_string(p);
  out = porf_bstr_of(s.data, (u32)s.length);
  ada_free_owned_string(s);
  ada_free_search_params(p);
}`;
  return out;
};

const toUSVString = value => `${value}`.toWellFormed();

const inspectCustom = Symbol.for('nodejs.util.inspect.custom');

let setSearchParamsList, setSearchParamsUrl;

export class URLSearchParams {
  #list = [];
  #url = null;

  static {
    setSearchParamsList = (obj, query) => {
      obj.#list = parseParams(query);
    };
    setSearchParamsUrl = (obj, url) => {
      obj.#url = url;
    };
  }

  constructor(init = undefined) {
    if (init === undefined) return;
    if (init === null || (typeof init !== 'object' && typeof init !== 'function')) {
      this.#list = parseParams(toUSVString(init));
    } else if (init[Symbol.iterator] != null) {
      for (const pair of init) {
        const entry = [ ...pair ];
        if (entry.length !== 2) throw errInvalidTuple('Each query pair', '[name, value]');
        this.#list.push(toUSVString(entry[0]), toUSVString(entry[1]));
      }
    } else {
      for (const key of Object.keys(init)) this.#list.push(toUSVString(key), toUSVString(init[key]));
    }
  }

  #update() {
    if (this.#url !== null) searchParamsUpdated(this.#url, serializeParams(this.#list));
  }

  get size() {
    return this.#list.length / 2;
  }

  append(name, value) {
    this.#list.push(toUSVString(name), toUSVString(value));
    this.#update();
  }

  delete(name, value = undefined) {
    const list = this.#list;
    name = toUSVString(name);
    if (value !== undefined) value = toUSVString(value);
    for (let i = list.length - 2; i >= 0; i -= 2) {
      if (list[i] === name && (value === undefined || list[i + 1] === value)) list.splice(i, 2);
    }
    this.#update();
  }

  get(name) {
    const list = this.#list;
    name = toUSVString(name);
    for (let i = 0; i < list.length; i += 2) {
      if (list[i] === name) return list[i + 1];
    }
    return null;
  }

  getAll(name) {
    const list = this.#list, values = [];
    name = toUSVString(name);
    for (let i = 0; i < list.length; i += 2) {
      if (list[i] === name) values.push(list[i + 1]);
    }
    return values;
  }

  has(name, value = undefined) {
    const list = this.#list;
    name = toUSVString(name);
    if (value !== undefined) value = toUSVString(value);
    for (let i = 0; i < list.length; i += 2) {
      if (list[i] === name && (value === undefined || list[i + 1] === value)) return true;
    }
    return false;
  }

  // the first pair of name gets the value, the others go
  set(name, value) {
    const list = this.#list;
    name = toUSVString(name);
    value = toUSVString(value);
    let found = false;
    for (let i = 0; i < list.length; i += 2) {
      if (list[i] !== name) continue;
      if (found) {
        list.splice(i, 2);
        i -= 2;
      } else {
        list[i + 1] = value;
        found = true;
      }
    }
    if (!found) list.push(name, value);
    this.#update();
  }

  // stable, by utf-16 code units
  sort() {
    const list = this.#list, pairs = [];
    for (let i = 0; i < list.length; i += 2) pairs.push([ list[i], list[i + 1] ]);
    pairs.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    this.#list = pairs.flat();
    this.#update();
  }

  *entries() {
    for (let i = 0; i < this.#list.length; i += 2) yield [ this.#list[i], this.#list[i + 1] ];
  }

  *keys() {
    for (let i = 0; i < this.#list.length; i += 2) yield this.#list[i];
  }

  *values() {
    for (let i = 0; i < this.#list.length; i += 2) yield this.#list[i + 1];
  }

  forEach(callback, thisArg = undefined) {
    for (let i = 0; i < this.#list.length; i += 2) callback.call(thisArg, this.#list[i + 1], this.#list[i], this);
  }

  toString() {
    return serializeParams(this.#list);
  }

  get [Symbol.toStringTag]() {
    return 'URLSearchParams';
  }

  [inspectCustom](depth, options, inspect) {
    const list = this.#list, output = [];
    for (let i = 0; i < list.length; i += 2) output.push(`${inspect(list[i], options)} => ${inspect(list[i + 1], options)}`);
    const name = this.constructor.name;
    if (output.length === 0) return `${name} {}`;
    return output.join(', ').length > options.breakLength ? `${name} {\n  ${output.join(',\n  ')} }` : `${name} { ${output.join(', ')} }`;
  }
}

URLSearchParams.prototype[Symbol.iterator] = URLSearchParams.prototype.entries;

// a url's state, from ada's last parse of it: its href and where the components start
const kContext = Symbol('context'), kSearchParams = Symbol('searchParams');
const context = href => ({
  href, protocolEnd: comps[0], usernameEnd: comps[1], hostStart: comps[2], hostEnd: comps[3], port: comps[4],
  pathnameStart: comps[5], searchStart: comps[6], hashStart: comps[7], schemeType: comps[8], origin: null
});
// the start of the host, past the @ that ends any credentials
const hostStart = c => c.href.charCodeAt(c.hostStart) === 0x40 ? c.hostStart + 1 : c.hostStart;
const isURLInstance = value => typeof value === 'object' && value !== null && kContext in value;
const searchParamsUpdated = (obj, query) => obj[kContext] = context(adaSet(obj[kContext].href, 8, query));

export class URL {
  constructor(input, base = undefined) {
    input = `${input}`;
    if (base !== undefined) base = `${base}`;
    const href = adaParse(input, base ?? '', base !== undefined);
    if (href === undefined) throw errInvalidUrl(input, base);
    this[kContext] = context(href);
    this[kSearchParams] = null;
  }

  static canParse(input, base = undefined) {
    return adaCanParse(`${input}`, base === undefined ? '' : `${base}`, base !== undefined);
  }

  static parse(input, base = undefined) {
    return URL.canParse(input, base) ? new URL(input, base) : null;
  }

  [inspectCustom](depth, options, inspect) {
    const obj = { __proto__: { constructor: URL } };
    for (const key of [ 'href', 'origin', 'protocol', 'username', 'password', 'host', 'hostname', 'port', 'pathname', 'search', 'searchParams', 'hash' ]) obj[key] = this[key];
    return `${this.constructor.name} ${inspect(obj, options)}`;
  }

  get [Symbol.toStringTag]() {
    return 'URL';
  }

  toString() {
    return this[kContext].href;
  }

  toJSON() {
    return this[kContext].href;
  }

  get href() {
    return this[kContext].href;
  }

  set href(value) {
    value = `${value}`;
    const href = adaSet(this[kContext].href, 0, value);
    if (href === undefined) throw errInvalidUrl(value);
    this[kContext] = context(href);
    if (this[kSearchParams] !== null) setSearchParamsList(this[kSearchParams], this.search);
  }

  // special (not file) schemes: scheme and host, blob: its http(s) path's origin, else opaque
  get origin() {
    const c = this[kContext];
    if (c.origin !== null) return c.origin;
    if (c.schemeType === FILE) return c.origin = 'null';
    if (c.schemeType !== NOT_SPECIAL) return c.origin = `${this.protocol}//${this.host}`;
    if (this.protocol === 'blob:') {
      const href = adaParse(this.pathname, '', false);
      if (href !== undefined && (comps[8] === HTTP || comps[8] === HTTPS)) return c.origin = new URL(href).origin;
    }
    return c.origin = 'null';
  }

  get protocol() {
    const c = this[kContext];
    return c.href.slice(0, c.protocolEnd);
  }

  set protocol(value) {
    this[kContext] = context(adaSet(this[kContext].href, 1, `${value}`));
  }

  get username() {
    const c = this[kContext];
    return c.protocolEnd + 2 < c.usernameEnd ? c.href.slice(c.protocolEnd + 2, c.usernameEnd) : '';
  }

  set username(value) {
    this[kContext] = context(adaSet(this[kContext].href, 2, `${value}`));
  }

  get password() {
    const c = this[kContext];
    return c.hostStart - c.usernameEnd > 0 ? c.href.slice(c.usernameEnd + 1, c.hostStart) : '';
  }

  set password(value) {
    this[kContext] = context(adaSet(this[kContext].href, 3, `${value}`));
  }

  get host() {
    const c = this[kContext], start = hostStart(c);
    return start === c.hostEnd ? '' : c.href.slice(start, c.pathnameStart);
  }

  set host(value) {
    this[kContext] = context(adaSet(this[kContext].href, 4, `${value}`));
  }

  get hostname() {
    const c = this[kContext];
    return c.href.slice(hostStart(c), c.hostEnd);
  }

  set hostname(value) {
    this[kContext] = context(adaSet(this[kContext].href, 5, `${value}`));
  }

  get port() {
    const port = this[kContext].port;
    return port === OMITTED ? '' : `${port}`;
  }

  set port(value) {
    this[kContext] = context(adaSet(this[kContext].href, 6, `${value}`));
  }

  get pathname() {
    const c = this[kContext];
    return c.href.slice(c.pathnameStart, c.searchStart !== OMITTED ? c.searchStart : c.hashStart !== OMITTED ? c.hashStart : c.href.length);
  }

  set pathname(value) {
    this[kContext] = context(adaSet(this[kContext].href, 7, `${value}`));
  }

  get search() {
    const c = this[kContext];
    if (c.searchStart === OMITTED) return '';
    const end = c.hashStart === OMITTED ? c.href.length : c.hashStart;
    return end - c.searchStart <= 1 ? '' : c.href.slice(c.searchStart, end);
  }

  set search(value) {
    this[kContext] = context(adaSet(this[kContext].href, 8, toUSVString(value)));
    if (this[kSearchParams] !== null) setSearchParamsList(this[kSearchParams], this.search);
  }

  get searchParams() {
    if (this[kSearchParams] === null) {
      this[kSearchParams] = new URLSearchParams(this.search);
      setSearchParamsUrl(this[kSearchParams], this);
    }
    return this[kSearchParams];
  }

  get hash() {
    const c = this[kContext];
    return c.hashStart === OMITTED || c.href.length - c.hashStart <= 1 ? '' : c.href.slice(c.hashStart);
  }

  set hash(value) {
    this[kContext] = context(adaSet(this[kContext].href, 9, `${value}`));
  }
}

const enumerable = { enumerable: true };
Object.defineProperties(URL.prototype, {
  toString: enumerable, href: enumerable, origin: enumerable, protocol: enumerable, username: enumerable, password: enumerable, host: enumerable,
  hostname: enumerable, port: enumerable, pathname: enumerable, search: enumerable, searchParams: enumerable, hash: enumerable, toJSON: enumerable
});

export const domainToASCII = domain => adaIdna(`${domain}`, 0);
export const domainToUnicode = domain => adaIdna(`${domain}`, 1);

export const fileURLToPath = path => {
  if (typeof path === 'string') path = new URL(path);
    else if (!isURL(path)) throw errInvalidArgType('path', [ 'string', 'URL' ], path);
  return fileURLObjectToPath(path);
};

// file paths percent-encode everything but these
const filePathSafe = new Int8Array(128);
for (const c of "!$&'()*+,-./0123456789:;=@ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz") filePathSafe[c.charCodeAt(0)] = 1;

export const pathToFileURL = filepath => {
  validateString(filepath, 'path');
  let resolved = resolvePath(filepath);
  if (filepath.endsWith('/') && !resolved.endsWith('/')) resolved += '/';
  let path = '';
  for (const byte of encodeUtf8(resolved.toWellFormed())) path += filePathSafe[byte] === 1 ? String.fromCharCode(byte) : `%${byte < 16 ? '0' : ''}${byte.toString(16).toUpperCase()}`;
  return new URL(`file://${path}`);
};

const hostlessProtocol = new Set([ 'javascript', 'javascript:' ]);
const slashedProtocol = new Set([ 'http', 'http:', 'https', 'https:', 'ftp', 'ftp:', 'gopher', 'gopher:', 'file', 'file:', 'ws', 'ws:', 'wss', 'wss:' ]);

export function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

const protocolPattern = /^[a-z0-9.+-]+:/i;
const portPattern = /:[0-9]*$/;
const hostPattern = /^\/\/[^@/]+@[^@/]+/;
const simplePathPattern = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/;
const hostnameMaxLen = 255;
const forbiddenHostChars = /[\0\t\n\r #%/:<>?@[\\\]^|]/;
const forbiddenHostCharsIpv6 = /[\0\t\n\r #%/<>?@\\^|]/;

let urlParseWarned = false;

export function parse(url, parseQueryString, slashesDenoteHost) {
  if (!urlParseWarned) {
    urlParseWarned = true;
    process.emitWarning('`url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.', 'DeprecationWarning', 'DEP0169');
  }
  if (url instanceof Url) return url;
  const urlObject = new Url();
  urlObject.parse(url, parseQueryString, slashesDenoteHost);
  return urlObject;
}

const isIpv6Hostname = hostname => hostname.charCodeAt(0) === 91 && hostname.charCodeAt(hostname.length - 1) === 93;

Url.prototype.parse = function parse(url, parseQueryString, slashesDenoteHost) {
  validateString(url, 'url');

  // trim whitespace, turn \ into / before the query or hash
  let rest = url.replace(/^[\x00-\x20\xa0\ufeff]+|[\x00-\x20\xa0\ufeff]+$/g, '');
  const split = rest.search(/[?#]/);
  const head = split === -1 ? rest : rest.slice(0, split);
  rest = head.replaceAll('\\', '/') + (split === -1 ? '' : rest.slice(split));
  const hasHash = rest.includes('#'), hasAt = head.includes('@');

  if (!slashesDenoteHost && !hasHash && !hasAt) {
    const simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        this.query = parseQueryString ? querystring.parse(this.search.slice(1)) : this.search.slice(1);
      } else if (parseQueryString) {
        this.search = null;
        this.query = { __proto__: null };
      }
      return this;
    }
  }

  let proto = protocolPattern.exec(rest);
  let lowerProto;
  if (proto) {
    proto = proto[0];
    lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.slice(proto.length);
  }

  let slashes;
  if (slashesDenoteHost || proto || hostPattern.test(rest)) {
    slashes = rest.charCodeAt(0) === 47 && rest.charCodeAt(1) === 47;
    if (slashes && !(proto && hostlessProtocol.has(lowerProto))) {
      rest = rest.slice(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol.has(lowerProto) && (slashes || (proto && !slashedProtocol.has(proto)))) {
    // the host ends at the first non-host char, the auth at the last @ before it
    let hostEnd = -1;
    let atSign = -1;
    let nonHost = -1;
    for (let i = 0; i < rest.length; ++i) {
      switch (rest.charCodeAt(i)) {
        case 9: case 10: case 13:
          rest = rest.slice(0, i) + rest.slice(i + 1);
          i -= 1;
          break;
        case 32: case 34: case 37: case 39: case 59: case 60: case 62: case 92: case 94: case 96: case 123: case 124: case 125:
          if (nonHost === -1) nonHost = i;
          break;
        case 35: case 47: case 63:
          if (nonHost === -1) nonHost = i;
          hostEnd = i;
          break;
        case 64:
          atSign = i;
          nonHost = -1;
          break;
      }
      if (hostEnd !== -1) break;
    }
    let start = 0;
    if (atSign !== -1) {
      this.auth = decodeURIComponent(rest.slice(0, atSign));
      start = atSign + 1;
    }
    if (nonHost === -1) {
      this.host = rest.slice(start);
      rest = '';
    } else {
      this.host = rest.slice(start, nonHost);
      rest = rest.slice(nonHost);
    }

    this.parseHost();
    if (typeof this.hostname !== 'string') this.hostname = '';
    const hostname = this.hostname;
    const ipv6Hostname = isIpv6Hostname(hostname);
    if (!ipv6Hostname) rest = getHostname(this, rest, hostname, url);

    if (this.hostname.length > hostnameMaxLen) this.hostname = '';
      else this.hostname = this.hostname.toLowerCase();

    if (this.hostname !== '') {
      if (ipv6Hostname) {
        if (forbiddenHostCharsIpv6.test(this.hostname)) throw errInvalidUrl(url);
      } else {
        this.hostname = adaIdna(this.hostname, 0);
        if (this.hostname === '' || forbiddenHostChars.test(this.hostname)) throw errInvalidUrl(url);
      }
    }

    this.host = (this.hostname || '') + (this.port ? ':' + this.port : '');
    if (ipv6Hostname) {
      this.hostname = this.hostname.slice(1, -1);
      if (rest[0] !== '/') rest = '/' + rest;
    }
  }

  if (!hostlessProtocol.has(lowerProto)) rest = autoEscapeStr(rest);

  let questionIdx = -1;
  let hashIdx = -1;
  for (let i = 0; i < rest.length; ++i) {
    const code = rest.charCodeAt(i);
    if (code === 35) {
      this.hash = rest.slice(i);
      hashIdx = i;
      break;
    } else if (code === 63 && questionIdx === -1) {
      questionIdx = i;
    }
  }

  if (questionIdx !== -1) {
    if (hashIdx === -1) {
      this.search = rest.slice(questionIdx);
      this.query = rest.slice(questionIdx + 1);
    } else {
      this.search = rest.slice(questionIdx, hashIdx);
      this.query = rest.slice(questionIdx + 1, hashIdx);
    }
    if (parseQueryString) this.query = querystring.parse(this.query);
  } else if (parseQueryString) {
    this.search = null;
    this.query = { __proto__: null };
  }

  const useQuestionIdx = questionIdx !== -1 && (hashIdx === -1 || questionIdx < hashIdx);
  const firstIdx = useQuestionIdx ? questionIdx : hashIdx;
  if (firstIdx === -1) {
    if (rest.length > 0) this.pathname = rest;
  } else if (firstIdx > 0) {
    this.pathname = rest.slice(0, firstIdx);
  }
  if (slashedProtocol.has(lowerProto) && this.hostname && !this.pathname) this.pathname = '/';

  if (this.pathname || this.search) this.path = (this.pathname || '') + (this.search || '');

  this.href = this.format();
  return this;
};

const getHostname = (self, rest, hostname, url) => {
  for (let i = 0; i < hostname.length; ++i) {
    const code = hostname.charCodeAt(i);
    if (code !== 47 && code !== 92 && code !== 35 && code !== 63 && code !== 58) continue;
    if (code === 58) throw errInvalidArgValue('url', url, 'Invalid port in url');
    self.hostname = hostname.slice(0, i);
    return `/${hostname.slice(i)}${rest}`;
  }
  return rest;
};

const escapedCodes = { 9: '%09', 10: '%0A', 13: '%0D', 32: '%20', 34: '%22', 39: '%27', 60: '%3C', 62: '%3E', 92: '%5C', 94: '%5E', 96: '%60', 123: '%7B', 124: '%7C', 125: '%7D' };

const autoEscapeStr = rest => {
  let escaped = '';
  let lastEscapedPos = 0;
  for (let i = 0; i < rest.length; ++i) {
    const escapedChar = escapedCodes[rest.charCodeAt(i)];
    if (!escapedChar) continue;
    if (i > lastEscapedPos) escaped += rest.slice(lastEscapedPos, i);
    escaped += escapedChar;
    lastEscapedPos = i + 1;
  }
  if (lastEscapedPos === 0) return rest;
  if (lastEscapedPos < rest.length) escaped += rest.slice(lastEscapedPos);
  return escaped;
};

export function format(urlObject, options) {
  if (typeof urlObject === 'string') return parse(urlObject).format();
  if (typeof urlObject !== 'object' || urlObject === null) throw errInvalidArgType('urlObject', [ 'Object', 'string' ], urlObject);
  if (!isURLInstance(urlObject)) return Url.prototype.format.call(urlObject);

  // a whatwg url, leaving out the parts the options turn off
  let href = urlObject.href;
  if (options?.fragment === false) href = adaSet(href, 9, '');
  if (options?.search === false) href = adaSet(href, 8, '');
  if (options?.auth === false) href = adaSet(adaSet(href, 2, ''), 3, '');
  return href;
}

Url.prototype.format = function format() {
  let auth = this.auth || '';
  if (auth) auth = `${encodeURIComponent(auth).replaceAll('%3A', ':')}@`;

  let protocol = this.protocol || '';
  if (protocol && protocol.charCodeAt(protocol.length - 1) !== 58) protocol += ':';

  let pathname = this.pathname || '';
  let hash = this.hash || '';
  let host = '';
  let query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.includes(':') && !isIpv6Hostname(this.hostname) ? '[' + this.hostname + ']' : this.hostname);
    if (this.port) host += ':' + this.port;
  }

  if (this.query !== null && typeof this.query === 'object') query = querystring.stringify(this.query);
  let search = this.search || (query && ('?' + query)) || '';

  if (pathname.includes('#') || pathname.includes('?')) pathname = pathname.replace(/[#?]/g, c => c === '#' ? '%23' : '%3F');

  if (this.slashes || slashedProtocol.has(protocol)) {
    if (this.slashes || host) {
      if (pathname && pathname.charCodeAt(0) !== 47) pathname = '/' + pathname;
      host = '//' + host;
    } else if (protocol.startsWith('file')) {
      host = '//';
    }
  }

  search = search.replaceAll('#', '%23');
  if (hash && hash.charCodeAt(0) !== 35) hash = '#' + hash;
  if (search && search.charCodeAt(0) !== 63) search = '?' + search;

  return protocol + host + pathname + search + hash;
};

export function resolve(source, relative) {
  return parse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function resolve(relative) {
  return this.resolveObject(parse(relative, false, true)).format();
};

Url.prototype.resolveObject = function resolveObject(relative) {
  if (typeof relative === 'string') {
    const rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  const result = new Url();
  Object.assign(result, this);
  result.hash = relative.hash;

  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // protocol-relative: everything but the protocol comes from relative
  if (relative.slashes && !relative.protocol) {
    for (const key of Object.keys(relative)) if (key !== 'protocol') result[key] = relative[key];
    if (slashedProtocol.has(result.protocol) && result.hostname && !result.pathname) result.path = result.pathname = '/';
    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    if (!slashedProtocol.has(relative.protocol)) {
      Object.assign(result, relative);
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !/^file:?$/.test(relative.protocol) && !hostlessProtocol.has(relative.protocol)) {
      const relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      relative.host ||= '';
      relative.hostname ||= '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    if (result.pathname || result.search) result.path = (result.pathname || '') + (result.search || '');
    result.slashes ||= relative.slashes;
    result.href = result.format();
    return result;
  }

  const isSourceAbs = result.pathname && result.pathname.charAt(0) === '/';
  const isRelAbs = relative.host || (relative.pathname && relative.pathname.charAt(0) === '/');
  let mustEndAbs = isRelAbs || isSourceAbs || (result.host && relative.pathname);
  const removeAllDots = mustEndAbs;
  let srcPath = (result.pathname && result.pathname.split('/')) || [];
  const relPath = (relative.pathname && relative.pathname.split('/')) || [];
  const noLeadingSlashes = result.protocol && !slashedProtocol.has(result.protocol);

  // urls without slashes keep their host as the first path segment
  if (noLeadingSlashes) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
        else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      result.auth = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
          else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs &&= relPath[0] === '' || srcPath[0] === '';
  }

  if (isRelAbs) {
    if (relative.host || relative.host === '') {
      if (result.host !== relative.host) result.auth = null;
      result.host = relative.host;
      result.port = relative.port;
    }
    if (relative.hostname || relative.hostname === '') {
      if (result.hostname !== relative.hostname) result.auth = null;
      result.hostname = relative.hostname;
    }
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
  } else if (relPath.length) {
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search !== null && relative.search !== undefined) {
    if (noLeadingSlashes) {
      result.hostname = result.host = srcPath.shift();
      const authInHost = result.host && result.host.indexOf('@') > 0 && result.host.split('@');
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    if (result.pathname !== null || result.search !== null) result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = result.search ? '/' + result.search : null;
    result.href = result.format();
    return result;
  }

  // resolve . and .., keeping a trailing slash
  let last = srcPath[srcPath.length - 1];
  const hasTrailingSlash = ((result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..')) || last === '';

  let up = 0;
  for (let i = srcPath.length - 1; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  if (!mustEndAbs && !removeAllDots) {
    while (up--) srcPath.unshift('..');
  }

  if (mustEndAbs && srcPath[0] !== '' && (!srcPath[0] || srcPath[0].charAt(0) !== '/')) srcPath.unshift('');
  if (hasTrailingSlash && srcPath.join('/').at(-1) !== '/') srcPath.push('');

  const isAbsolute = srcPath[0] === '' || (srcPath[0] && srcPath[0].charAt(0) === '/');

  if (noLeadingSlashes) {
    result.hostname = result.host = isAbsolute ? '' : srcPath.length ? srcPath.shift() : '';
    const authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs ||= result.host && srcPath.length;
  if (mustEndAbs && !isAbsolute) srcPath.unshift('');

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  if (result.pathname !== null || result.search !== null) result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
  result.auth = relative.auth || result.auth;
  result.slashes ||= relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function parseHost() {
  let host = this.host;
  let port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') this.port = port.slice(1);
    host = host.slice(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

export default { Url, parse, resolve, format, URL, URLSearchParams, domainToASCII, domainToUnicode, pathToFileURL, fileURLToPath };
