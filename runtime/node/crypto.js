// node:crypto on openssl's EVP api
import './c-helpers.js';
import { Buffer } from './buffer.js';
import { Transform } from './stream.js';
import { DOMException } from './internal/domexception.js';
import { codedError, errInvalidArgType, errInvalidArgValue, errOutOfRange } from './internal/errors.js';
import { validateString, validateFunction, validateObject, validateInt32, validateUint32 } from './internal/validators.js';
import { nextTick } from './internal/loop.js';
import { adoptBytes } from './internal/bytes.js';

Porffor.link`static libcrypto`;

Porffor.c`
#include <ctype.h>
#include <sys/random.h>
#include <openssl/evp.h>
#include <openssl/err.h>
#include <openssl/rand.h>
#include <openssl/core_names.h>
#include <openssl/param_build.h>
#include <openssl/encoder.h>
#include <openssl/decoder.h>
#include <openssl/pem.h>
#include <openssl/x509v3.h>
#include <openssl/ec.h>

static inline u32 porf_crypto_len(jsval v) {
  return *(u32*)(MEM + porf_jv_ptr(v));
}

// a Uint8Array's bytes for openssl, which wants a pointer even for none
static inline const unsigned char *porf_crypto_in(jsval v) {
  static const unsigned char empty[1];
  return porf_jv_type(v) != 0 && porf_crypto_len(v) > 0 ? (const unsigned char*)porf_node_u8(v) : empty;
}

// legacy names and aliases (RSA-SHA256, sha256WithRSAEncryption) resolve through the old tables first
static inline EVP_MD *porf_crypto_md(jsval name) {
  char *s = porf_node_bytes(name, NULL);
  const EVP_MD *legacy = EVP_get_digestbyname(s);
  ERR_set_mark();
  EVP_MD *md = EVP_MD_fetch(NULL, legacy ? EVP_MD_get0_name(legacy) : s, NULL);
  ERR_pop_to_mark();
  free(s);
  return md;
}

static inline char *porf_crypto_bio_take(BIO *b, size_t *len) {
  char *data;
  *len = BIO_get_mem_data(b, &data);
  char *out = memcpy(malloc(*len ? *len : 1), data, *len);
  BIO_free(b);
  return out;
}

// key material: der, pkcs8 when private and spki when public
static inline EVP_PKEY *porf_crypto_key(jsval der, i32 priv) {
  const unsigned char *p = (const unsigned char*)porf_node_u8(der);
  return priv ? d2i_AutoPrivateKey(NULL, &p, porf_crypto_len(der)) : d2i_PUBKEY(NULL, &p, porf_crypto_len(der));
}

static inline char *porf_crypto_key_der(EVP_PKEY *k, i32 priv, size_t *len) {
  // ec private keys carry their public point, as node's do
  if (priv && EVP_PKEY_is_a(k, "EC")) EVP_PKEY_set_int_param(k, OSSL_PKEY_PARAM_EC_INCLUDE_PUBLIC, 1);
  BIO *b = BIO_new(BIO_s_mem());
  if ((priv ? i2d_PKCS8PrivateKey_bio(b, k, NULL, NULL, 0, NULL, NULL) : i2d_PUBKEY_bio(b, k)) <= 0) {
    BIO_free(b);
    return NULL;
  }
  return porf_crypto_bio_take(b, len);
}

// a key from built params as der, null when invalid
static inline char *porf_crypto_fromdata(const char *type, i32 priv, OSSL_PARAM_BLD *bld, size_t *len) {
  OSSL_PARAM *params = OSSL_PARAM_BLD_to_param(bld);
  EVP_PKEY_CTX *c = EVP_PKEY_CTX_new_from_name(NULL, type, NULL);
  EVP_PKEY *k = NULL;
  char *out = NULL;
  if (EVP_PKEY_fromdata_init(c) > 0 && EVP_PKEY_fromdata(c, &k, priv ? EVP_PKEY_KEYPAIR : EVP_PKEY_PUBLIC_KEY, params) > 0) {
    EVP_PKEY_CTX *check = EVP_PKEY_CTX_new_from_pkey(NULL, k, NULL);
    if ((priv ? EVP_PKEY_pairwise_check(check) : EVP_PKEY_public_check(check)) > 0) out = porf_crypto_key_der(k, priv, len);
    EVP_PKEY_CTX_free(check);
  }
  ERR_clear_error();
  EVP_PKEY_free(k);
  EVP_PKEY_CTX_free(c);
  OSSL_PARAM_free(params);
  OSSL_PARAM_BLD_free(bld);
  return out;
}

static inline i32 porf_crypto_passphrase_cb(char *buf, i32 size, i32 rwflag, void *u) {
  *(i32*)u = 1;
  return -1;
}

static inline void porf_crypto_md_each(const EVP_MD *m, const char *from, const char *to, void *arg) {
  const EVP_MD *legacy = from ? EVP_get_digestbyname(from) : NULL;
  ERR_set_mark();
  EVP_MD *md = legacy ? EVP_MD_fetch(NULL, EVP_MD_get0_name(legacy), NULL) : NULL;
  ERR_pop_to_mark();
  if (md) BIO_printf(arg, "%s\n", from);
  EVP_MD_free(md);
}

static inline void porf_crypto_cipher_each(const EVP_CIPHER *c, const char *from, const char *to, void *arg) {
  const EVP_CIPHER *legacy = from ? EVP_get_cipherbyname(from) : NULL;
  ERR_set_mark();
  EVP_CIPHER *cipher = legacy ? EVP_CIPHER_fetch(NULL, EVP_CIPHER_get0_name(legacy), NULL) : NULL;
  ERR_pop_to_mark();
  if (cipher) BIO_printf(arg, "%s\n", from);
  EVP_CIPHER_free(cipher);
}
`;

// the first error on openssl's queue with node's code, else a plain one; empties the queue
const osslError = message => {
  let reason, lib = '';
  Porffor.c`{
  const unsigned long e = ERR_get_error();
  if (e) {
    char buf[256];
    ERR_error_string_n(e, buf, sizeof(buf));
    message = porf_bstr_of(buf, strlen(buf));
    const char *r = ERR_reason_error_string(e);
    if (r) reason = porf_bstr_of(r, strlen(r));
    const char *l = "";
    switch (ERR_GET_LIB(e)) {
      case ERR_LIB_BN: l = "BN_"; break;
      case ERR_LIB_RSA: l = "RSA_"; break;
      case ERR_LIB_EVP: l = "EVP_"; break;
      case ERR_LIB_PEM: l = "PEM_"; break;
      case ERR_LIB_X509: l = "X509_"; break;
      case ERR_LIB_ASN1: l = "ASN1_"; break;
      case ERR_LIB_EC: l = "EC_"; break;
    }
    lib = porf_bstr_of(l, strlen(l));
  }
  ERR_clear_error();
}`;
  const err = new Error(message);
  if (reason !== undefined) err.code = `ERR_OSSL_${lib}${reason.toUpperCase().replaceAll(' ', '_')}`;
  return err;
};

const isBufferSource = x => ArrayBuffer.isView(x) || x instanceof ArrayBuffer;

// any buffer source as a Uint8Array over the same memory
const viewOf = x => x instanceof Uint8Array ? x : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : new Uint8Array(x);

const bytesOf = (value, name, encoding) => {
  if (typeof value === 'string') return Buffer.from(value, encoding);
  if (!isBufferSource(value)) throw errInvalidArgType(name, [ 'string', 'ArrayBuffer', 'Buffer', 'TypedArray', 'DataView' ], value);
  return viewOf(value);
};

const encode = (buf, encoding) => encoding && encoding !== 'buffer' ? buf.toString(encoding) : buf;

// malloc'd bytes from c -> Buffer, null for a null pointer
const take = (p, n) => p ? Object.setPrototypeOf(adoptBytes(p, n), Buffer.prototype) : null;

const toArrayBuffer = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

// stream state is only made on first stream use, as most hashes are only updated and digested
const lazyTransform = () => {
  class LazyTransform {
    constructor(options) {
      this._options = options;
    }
  }
  Object.setPrototypeOf(LazyTransform.prototype, Transform.prototype);
  for (const name of [ '_readableState', '_writableState' ]) {
    Object.defineProperty(LazyTransform.prototype, name, {
      get() {
        Transform.call(this, this._options);
        this._writableState.decodeStrings = false;
        return this[name];
      },
      set(value) {
        Object.defineProperty(this, name, { value, enumerable: true, configurable: true, writable: true });
      },
      configurable: true
    });
  }
  return LazyTransform;
};
const LazyTransform = /*@__PURE__*/ lazyTransform();

const tagged = (C, tag) => {
  Object.defineProperty(C.prototype, Symbol.toStringTag, { value: tag, configurable: true });
  return C;
};

// a digest context, 0 for an unknown digest
const hashNew = name => {
  let ctx = 0;
  Porffor.c`{
  EVP_MD *md = porf_crypto_md(name);
  if (md) {
    EVP_MD_CTX *c = EVP_MD_CTX_new();
    if (EVP_DigestInit_ex2(c, md, NULL)) ctx = (f64)(u64)c;
      else EVP_MD_CTX_free(c);
    EVP_MD_free(md);
  }
}`;
  return ctx;
};

const hashUpdate = (ctx, data) => {
  Porffor.c`EVP_DigestUpdate((EVP_MD_CTX*)(u64)porf_jv_val(ctx), porf_crypto_in(data), porf_crypto_len(data));`;
};

const hashCopy = ctx => {
  let out = 0;
  Porffor.c`out = (f64)(u64)EVP_MD_CTX_dup((EVP_MD_CTX*)(u64)porf_jv_val(ctx));`;
  return out;
};

// frees the context; xof length defaults to node's pre-openssl 3.4 sizes
const hashFinal = (ctx, length) => {
  let p = 0, n = 0;
  Porffor.c`{
  EVP_MD_CTX *c = (EVP_MD_CTX*)(u64)porf_jv_val(ctx);
  const EVP_MD *md = EVP_MD_CTX_get0_md(c);
  const i32 xof = (EVP_MD_get_flags(md) & EVP_MD_FLAG_XOF) != 0;
  unsigned int len = !xof ? EVP_MD_get_size(md) : porf_jv_type(length) != 0 ? (u32)porf_jv_val(length) : EVP_MD_is_a(md, "SHAKE-128") ? 16 : 32;
  unsigned char *out = malloc(len + 1);
  if (xof) EVP_DigestFinalXOF(c, out, len);
    else EVP_DigestFinal_ex(c, out, &len);
  p = (f64)(u64)out;
  n = len;
  EVP_MD_CTX_free(c);
}`;
  return take(p, n);
};

const errFinalized = () => codedError(Error, 'ERR_CRYPTO_HASH_FINALIZED', 'Digest already called');
const errUpdate = () => codedError(Error, 'ERR_CRYPTO_HASH_UPDATE_FAILED', 'Hash update failed');

export class Hash extends LazyTransform {
  #ctx;
  #length;
  #result = null;
  #finalized = false;

  constructor(algorithm, options, copyOf) {
    super(options);
    if (!copyOf) validateString(algorithm, 'algorithm');
    this.#ctx = copyOf ? hashCopy(copyOf.#ctx) : hashNew(algorithm);
    if (!this.#ctx) throw osslError('Digest method not supported');
    this.#length = options?.outputLength;
  }

  // frees the context: nothing may use it after
  #digest() {
    this.#finalized = true;
    return this.#result ??= hashFinal(this.#ctx, this.#length);
  }

  copy(options) {
    if (this.#finalized) throw errFinalized();
    return new Hash(undefined, options, this);
  }

  update(data, encoding) {
    if (this.#finalized) throw errFinalized();
    hashUpdate(this.#ctx, bytesOf(data, 'data', encoding));
    return this;
  }

  digest(encoding) {
    if (this.#finalized) throw errFinalized();
    return encode(this.#digest(), encoding);
  }

  _transform(chunk, encoding, callback) {
    if (this.#finalized) return callback(errUpdate());
    hashUpdate(this.#ctx, bytesOf(chunk, 'data', encoding));
    callback();
  }

  _flush(callback) {
    this.push(this.#digest());
    callback();
  }
}

export const createHash = (algorithm, options) => new Hash(algorithm, options);

export const hash = (algorithm, data, options = 'hex') => {
  validateString(algorithm, 'algorithm');
  const { outputEncoding = 'hex', outputLength } = typeof options === 'string' ? { outputEncoding: options } : options;
  const ctx = hashNew(algorithm);
  if (!ctx) throw osslError('Digest method not supported');
  hashUpdate(ctx, bytesOf(data, 'data'));
  return encode(hashFinal(ctx, outputLength), outputEncoding);
};

const macNew = (name, key) => {
  let ctx = 0;
  Porffor.c`{
  EVP_MD *md = porf_crypto_md(name);
  if (md) {
    EVP_MAC *mac = EVP_MAC_fetch(NULL, "HMAC", NULL);
    EVP_MAC_CTX *c = EVP_MAC_CTX_new(mac);
    OSSL_PARAM params[] = { OSSL_PARAM_construct_utf8_string(OSSL_MAC_PARAM_DIGEST, (char*)EVP_MD_get0_name(md), 0), OSSL_PARAM_construct_end() };
    if (EVP_MAC_init(c, porf_crypto_in(key), porf_crypto_len(key), params)) ctx = (f64)(u64)c;
      else EVP_MAC_CTX_free(c);
    EVP_MAC_free(mac);
    EVP_MD_free(md);
  }
}`;
  return ctx;
};

const macUpdate = (ctx, data) => {
  Porffor.c`EVP_MAC_update((EVP_MAC_CTX*)(u64)porf_jv_val(ctx), porf_crypto_in(data), porf_crypto_len(data));`;
};

// frees the context
const macFinal = ctx => {
  let p = 0, n = 0;
  Porffor.c`{
  EVP_MAC_CTX *c = (EVP_MAC_CTX*)(u64)porf_jv_val(ctx);
  size_t len = 0, size = EVP_MAC_CTX_get_mac_size(c);
  unsigned char *out = malloc(size + 1);
  EVP_MAC_final(c, out, &len, size);
  p = (f64)(u64)out;
  n = len;
  EVP_MAC_CTX_free(c);
}`;
  return take(p, n);
};

export class Hmac extends LazyTransform {
  #ctx;

  constructor(algorithm, key, options) {
    super(options);
    validateString(algorithm, 'hmac');
    this.#ctx = macNew(algorithm, secretBytes(key, options?.encoding));
    if (!this.#ctx) throw codedError(TypeError, 'ERR_CRYPTO_INVALID_DIGEST', `Invalid digest: ${algorithm}`);
  }

  // a finished mac (also by its stream flushing) digests to nothing
  #digest() {
    const ctx = this.#ctx;
    this.#ctx = 0;
    return ctx ? macFinal(ctx) : Buffer.alloc(0);
  }

  update(data, encoding) {
    if (!this.#ctx) throw errFinalized();
    macUpdate(this.#ctx, bytesOf(data, 'data', encoding));
    return this;
  }

  digest(encoding) {
    return encode(this.#digest(), encoding);
  }

  _transform(chunk, encoding, callback) {
    if (!this.#ctx) return callback(errUpdate());
    macUpdate(this.#ctx, bytesOf(chunk, 'data', encoding));
    callback();
  }

  _flush(callback) {
    this.push(this.#digest());
    callback();
  }
}

export const createHmac = (algorithm, key, options) => new Hmac(algorithm, key, options);

// 0 digests, 1 ciphers, 2 curves: sorted without case-insensitive duplicates
const nativeNames = kind => {
  let list;
  Porffor.c`{
  BIO *b = BIO_new(BIO_s_mem());
  if (porf_jv_val(kind) == 0) EVP_MD_do_all_sorted(porf_crypto_md_each, b);
    else if (porf_jv_val(kind) == 1) EVP_CIPHER_do_all_sorted(porf_crypto_cipher_each, b);
    else {
      const size_t n = EC_get_builtin_curves(NULL, 0);
      EC_builtin_curve *curves = malloc(n * sizeof(EC_builtin_curve));
      EC_get_builtin_curves(curves, n);
      for (size_t i = 0; i < n; i++) BIO_printf(b, "%s\n", OBJ_nid2sn(curves[i].nid));
      free(curves);
    }
  size_t len;
  char *s = porf_crypto_bio_take(b, &len);
  list = porf_bstr_of(s, len);
  free(s);
}`;
  const names = new Map();
  for (const name of list.split('\n').slice(0, -1)) names.set(name.toLowerCase(), kind === 1 ? name.toLowerCase() : name);
  return [ ...names.values() ].sort();
};

export const getHashes = () => nativeNames(0);

export const getFips = () => 0;
export const getCiphers = () => nativeNames(1);
export const getCurves = () => nativeNames(2);

const fillRandom = view => {
  Porffor.c`for (u32 at = 0, n = porf_crypto_len(view); at < n; at += 256) if (getentropy((unsigned char*)porf_crypto_in(view) + at, n - at < 256 ? n - at : 256)) abort();`;
  return view;
};

export const randomFillSync = (buf, offset = 0, size) => {
  if (!isBufferSource(buf)) throw errInvalidArgType('buf', [ 'ArrayBuffer', 'ArrayBufferView' ], buf);
  const bytes = viewOf(buf), element = buf.BYTES_PER_ELEMENT ?? 1;
  validateUint32(offset, 'offset');
  const start = offset * element, end = size === undefined ? bytes.length : start + size * element;
  if (start > bytes.length) throw errOutOfRange('offset', `>= 0 && <= ${bytes.length}`, start);
  if (end > bytes.length) throw errOutOfRange('size + offset', `<= ${bytes.length}`, end);
  fillRandom(bytes.subarray(start, end));
  return buf;
};

export const randomBytes = (size, callback) => {
  validateUint32(size, 'size');
  const buf = fillRandom(Buffer.alloc(size));
  if (callback === undefined) return buf;
  validateFunction(callback, 'callback');
  nextTick(callback, null, buf);
};

const RAND_MAX = 0xffffffffffff;

export const randomInt = (min, max, callback) => {
  if (max === undefined || typeof max === 'function') {
    callback = max;
    max = min;
    min = 0;
  }
  if (callback !== undefined) validateFunction(callback, 'callback');
  if (!Number.isSafeInteger(min)) throw errInvalidArgType('min', 'a safe integer', min);
  if (!Number.isSafeInteger(max)) throw errInvalidArgType('max', 'a safe integer', max);
  if (max <= min) throw errOutOfRange('max', `greater than the value of "min" (${min})`, max);
  const range = max - min;
  if (range > RAND_MAX) throw errOutOfRange('max - min', `<= ${RAND_MAX}`, range);
  // rejection sampling keeps every value equally likely
  const limit = RAND_MAX - RAND_MAX % range, b = Buffer.alloc(6);
  let x;
  do x = fillRandom(b).readUIntBE(0, 6);
  while (x >= limit);
  if (callback === undefined) return min + x % range;
  nextTick(callback, undefined, min + x % range);
};

export const randomUUID = () => {
  const b = fillRandom(new Uint8Array(16));
  b[6] = b[6] & 0x0f | 0x40;
  b[8] = b[8] & 0x3f | 0x80;
  let out = '';
  for (let i = 0; i < 16; i++) out += (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') + (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return out;
};

export const getRandomValues = array => {
  if (!ArrayBuffer.isView(array) || array instanceof DataView || array instanceof Float32Array || array instanceof Float64Array) {
    throw new DOMException('The data argument must be an integer-type TypedArray', 'TypeMismatchError');
  }
  if (array.byteLength > 65536) throw new DOMException('The requested length exceeds 65,536 bytes', 'QuotaExceededError');
  fillRandom(viewOf(array));
  return array;
};

export const timingSafeEqual = (buf1, buf2) => {
  if (!isBufferSource(buf1)) throw errInvalidArgType('buf1', [ 'ArrayBuffer', 'Buffer', 'TypedArray', 'DataView' ], buf1);
  if (!isBufferSource(buf2)) throw errInvalidArgType('buf2', [ 'ArrayBuffer', 'Buffer', 'TypedArray', 'DataView' ], buf2);
  if (buf1.byteLength !== buf2.byteLength) throw codedError(RangeError, 'ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH', 'Input buffers must have the same byte length');
  const a = viewOf(buf1), b = viewOf(buf2);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

export const pbkdf2Sync = (password, salt, iterations, keylen, digest) => {
  password = bytesOf(password, 'password');
  salt = bytesOf(salt, 'salt');
  validateInt32(iterations, 'iterations', 1);
  validateInt32(keylen, 'keylen', 0);
  validateString(digest, 'digest');
  let ok = 0;
  const out = Buffer.alloc(keylen);
  Porffor.c`{
  EVP_MD *md = porf_crypto_md(digest);
  ok = md && PKCS5_PBKDF2_HMAC((const char*)porf_crypto_in(password), (i32)porf_crypto_len(password), porf_crypto_in(salt), (i32)porf_crypto_len(salt),
    (i32)porf_jv_val(iterations), md, (i32)porf_jv_val(keylen), (unsigned char*)porf_crypto_in(out));
  EVP_MD_free(md);
}`;
  if (!ok) throw codedError(TypeError, 'ERR_CRYPTO_INVALID_DIGEST', `Invalid digest: ${digest}`);
  return out;
};

// [ der, private ] of a pem/der key or pem certificate, 0 when invalid, -1 when it needs a passphrase
const nativeDecode = (data, priv, passphrase) => {
  let status = 0, p = 0, n = 0;
  Porffor.c`{
  EVP_PKEY *k = NULL;
  i32 needed = 0;
  for (i32 attempt = 0; attempt < (porf_jv_val(priv) ? 1 : 2) && !k && !needed; attempt++) {
    const unsigned char *in = porf_crypto_in(data);
    size_t len = porf_crypto_len(data);
    OSSL_DECODER_CTX *d = OSSL_DECODER_CTX_new_for_pkey(&k, NULL, NULL, NULL, attempt == 0 ? EVP_PKEY_KEYPAIR : EVP_PKEY_PUBLIC_KEY, NULL, NULL);
    if (porf_jv_type(passphrase) != 0) OSSL_DECODER_CTX_set_passphrase(d, porf_crypto_in(passphrase), porf_crypto_len(passphrase));
      else OSSL_DECODER_CTX_set_pem_password_cb(d, porf_crypto_passphrase_cb, &needed);
    if (OSSL_DECODER_from_data(d, &in, &len) && k) status = attempt == 0 ? 1 : 2;
    OSSL_DECODER_CTX_free(d);
  }
  if (!k && !needed && !porf_jv_val(priv)) {
    BIO *b = BIO_new_mem_buf(porf_crypto_in(data), (i32)porf_crypto_len(data));
    X509 *cert = PEM_read_bio_X509(b, NULL, NULL, NULL);
    BIO_free(b);
    if (cert) {
      k = X509_get_pubkey(cert);
      status = 2;
      X509_free(cert);
    }
  }
  if (k) {
    size_t len = 0;
    p = (f64)(u64)porf_crypto_key_der(k, status == 1, &len);
    n = len;
    EVP_PKEY_free(k);
    ERR_clear_error();
  } else if (needed) status = -1;
}`;
  return status > 0 ? [ take(p, n), status === 1 ] : status;
};

const knownCipher = name => {
  let known = 0;
  Porffor.c`{
  char *c = porf_node_bytes(name, NULL);
  known = EVP_get_cipherbyname(c) != NULL;
  free(c);
}`;
  return known === 1;
};

const nativeEncode = (der, priv, pem, structure, cipher, passphrase) => {
  let p = 0, n = 0;
  Porffor.c`{
  EVP_PKEY *k = porf_crypto_key(der, (i32)porf_jv_val(priv));
  char *st = porf_node_bytes(structure, NULL), *c = porf_jv_type(cipher) == 0 ? NULL : porf_node_bytes(cipher, NULL);
  OSSL_ENCODER_CTX *e = OSSL_ENCODER_CTX_new_for_pkey(k, porf_jv_val(priv) ? EVP_PKEY_KEYPAIR : EVP_PKEY_PUBLIC_KEY, porf_jv_val(pem) ? "PEM" : "DER", st, NULL);
  if (c) {
    OSSL_ENCODER_CTX_set_cipher(e, c, NULL);
    OSSL_ENCODER_CTX_set_passphrase(e, porf_crypto_in(passphrase), porf_crypto_len(passphrase));
  }
  unsigned char *data = NULL;
  size_t len = 0;
  if (OSSL_ENCODER_CTX_get_num_encoders(e) > 0 && OSSL_ENCODER_to_data(e, &data, &len)) {
    p = (f64)(u64)memcpy(malloc(len), data, len);
    n = len;
  }
  OPENSSL_free(data);
  OSSL_ENCODER_CTX_free(e);
  EVP_PKEY_free(k);
  free(st);
  free(c);
}`;
  return take(p, n);
};

const nativePublicDer = der => {
  let p = 0, n = 0;
  Porffor.c`{
  EVP_PKEY *k = porf_crypto_key(der, 1);
  size_t len = 0;
  p = (f64)(u64)porf_crypto_key_der(k, 0, &len);
  n = len;
  EVP_PKEY_free(k);
}`;
  return take(p, n);
};

const nativeKeyInfo = (der, priv) => {
  let type, bits = 0, curve;
  Porffor.c`{
  EVP_PKEY *k = porf_crypto_key(der, (i32)porf_jv_val(priv));
  const char *t = EVP_PKEY_get0_type_name(k);
  type = porf_bstr_of(t, strlen(t));
  bits = EVP_PKEY_get_bits(k);
  char group[80];
  if (EVP_PKEY_get_utf8_string_param(k, OSSL_PKEY_PARAM_GROUP_NAME, group, sizeof(group), NULL)) curve = porf_bstr_of(group, strlen(group));
  ERR_clear_error();
  EVP_PKEY_free(k);
}`;
  return { type: type.toLowerCase(), bits, curve };
};

const kBn = 0, kOctets = 1, kRawPublic = 2, kRawPrivate = 3;

// a bignum (padded to pad bytes) or octet string param, or the raw public/private key; null when missing
const keyBytes = (handle, kind, param = '', pad = 0) => {
  let p = 0, n = 0;
  const der = handle.data, priv = handle.type === 'private' ? 1 : 0;
  Porffor.c`{
  EVP_PKEY *k = porf_crypto_key(der, (i32)porf_jv_val(priv));
  char *name = porf_node_bytes(param, NULL);
  const i32 w = (i32)porf_jv_val(kind);
  BIGNUM *bn = NULL;
  size_t len = 0;
  unsigned char *out = NULL;
  if (w == 0 && EVP_PKEY_get_bn_param(k, name, &bn)) {
    len = porf_jv_val(pad) > 0 ? (size_t)porf_jv_val(pad) : (size_t)BN_num_bytes(bn);
    out = malloc(len + 1);
    BN_bn2binpad(bn, out, (i32)len);
  } else if (w == 1 ? EVP_PKEY_get_octet_string_param(k, name, NULL, 0, &len) : w == 2 ? EVP_PKEY_get_raw_public_key(k, NULL, &len) : w == 3 && EVP_PKEY_get_raw_private_key(k, NULL, &len)) {
    out = malloc(len + 1);
    if (w == 1) EVP_PKEY_get_octet_string_param(k, name, out, len, &len);
      else if (w == 2) EVP_PKEY_get_raw_public_key(k, out, &len);
      else EVP_PKEY_get_raw_private_key(k, out, &len);
  }
  p = (f64)(u64)out;
  n = len;
  BN_free(bn);
  ERR_clear_error();
  EVP_PKEY_free(k);
  free(name);
}`;
  return take(p, n);
};

// an rsa key from its jwk components, private when d is given; der, null when invalid
const rsaKey = (n, e, d, p, q, dp, dq, qi) => {
  let out = 0, length = 0;
  Porffor.c`{
  const char *names[] = { "n", "e", "d", "rsa-factor1", "rsa-factor2", "rsa-exponent1", "rsa-exponent2", "rsa-coefficient1" };
  const jsval values[] = { n, e, d, p, q, dp, dq, qi };
  OSSL_PARAM_BLD *bld = OSSL_PARAM_BLD_new();
  BIGNUM *bns[8] = { 0 };
  for (i32 i = 0; i < 8; i++) if (porf_jv_type(values[i]) != 0) {
    bns[i] = BN_bin2bn(porf_crypto_in(values[i]), (i32)porf_crypto_len(values[i]), NULL);
    OSSL_PARAM_BLD_push_BN(bld, names[i], bns[i]);
  }
  size_t len = 0;
  out = (f64)(u64)porf_crypto_fromdata("RSA", porf_jv_type(d) != 0, bld, &len);
  length = len;
  for (i32 i = 0; i < 8; i++) BN_free(bns[i]);
}`;
  return take(out, length);
};

// an ec key from its uncompressed point, private when the scalar is given
const ecKey = (curve, point, scalar) => {
  let out = 0, length = 0;
  Porffor.c`{
  OSSL_PARAM_BLD *bld = OSSL_PARAM_BLD_new();
  char *group = porf_node_bytes(curve, NULL);
  BIGNUM *priv = porf_jv_type(scalar) != 0 ? BN_bin2bn(porf_crypto_in(scalar), (i32)porf_crypto_len(scalar), NULL) : NULL;
  OSSL_PARAM_BLD_push_utf8_string(bld, OSSL_PKEY_PARAM_GROUP_NAME, group, 0);
  OSSL_PARAM_BLD_push_octet_string(bld, OSSL_PKEY_PARAM_PUB_KEY, porf_crypto_in(point), porf_crypto_len(point));
  if (priv) OSSL_PARAM_BLD_push_BN(bld, OSSL_PKEY_PARAM_PRIV_KEY, priv);
  size_t len = 0;
  out = (f64)(u64)porf_crypto_fromdata("EC", priv != NULL, bld, &len);
  length = len;
  BN_free(priv);
  free(group);
}`;
  return take(out, length);
};

// an ed25519/x25519 (or 448) key from its raw bytes
const rawKey = (type, data, priv) => {
  let p = 0, n = 0;
  Porffor.c`{
  char *t = porf_node_bytes(type, NULL);
  EVP_PKEY *k = porf_jv_val(priv) ? EVP_PKEY_new_raw_private_key_ex(NULL, t, NULL, porf_crypto_in(data), porf_crypto_len(data))
    : EVP_PKEY_new_raw_public_key_ex(NULL, t, NULL, porf_crypto_in(data), porf_crypto_len(data));
  size_t len = 0;
  p = (f64)(u64)(k ? porf_crypto_key_der(k, (i32)porf_jv_val(priv), &len) : NULL);
  n = len;
  ERR_clear_error();
  EVP_PKEY_free(k);
  free(t);
}`;
  return take(p, n);
};

const keyInfo = handle => handle.info ??= nativeKeyInfo(handle.data, handle.type === 'private' ? 1 : 0);

const structures = { spki: 'SubjectPublicKeyInfo', pkcs8: 'PrivateKeyInfo', pkcs1: 'type-specific', sec1: 'type-specific' };

// a key object's handle: its type and data, the secret bytes or der of an asymmetric key
const keyObjects = new WeakMap();

export const KeyObject = /*@__PURE__*/ tagged(class KeyObject {
  constructor(type, handle) {
    if (type !== 'secret' && type !== 'public' && type !== 'private') throw errInvalidArgValue('type', type);
    throw errInvalidArgType('handle', 'object', handle);
  }

  get type() {
    return keyObjects.get(this).type;
  }

  get symmetricKeySize() {
    const handle = keyObjects.get(this);
    return handle.type === 'secret' ? handle.data.byteLength : undefined;
  }

  get asymmetricKeyType() {
    const handle = keyObjects.get(this);
    return handle.type === 'secret' ? undefined : keyInfo(handle).type;
  }

  get asymmetricKeyDetails() {
    const handle = keyObjects.get(this);
    if (handle.type === 'secret') return undefined;
    const { type, bits, curve } = keyInfo(handle);
    if (type === 'rsa' || type === 'rsa-pss') return { modulusLength: bits, publicExponent: BigInt(`0x${keyBytes(handle, kBn, 'e').toString('hex')}`) };
    if (type === 'ec') return { namedCurve: curve };
    return {};
  }

  equals(otherKeyObject) {
    const a = keyObjects.get(this), b = keyObjects.get(otherKeyObject);
    if (!b) throw errInvalidArgType('otherKeyObject', 'KeyObject', otherKeyObject);
    return a.type === b.type && Buffer.compare(a.data, b.data) === 0;
  }

  export(options) {
    const handle = keyObjects.get(this);
    if (options?.format === 'jwk') return exportJwk(handle);
    if (handle.type === 'secret') return Buffer.from(handle.data);
    validateObject(options, 'options');
    const { format, type, cipher, passphrase } = options;
    if (format !== 'pem' && format !== 'der') throw errInvalidArgValue('options.format', format);
    if (!(handle.type === 'public' ? [ 'spki', 'pkcs1' ] : [ 'pkcs8', 'pkcs1', 'sec1' ]).includes(type)) throw errInvalidArgValue('options.type', type);
    if (cipher != null && passphrase == null) throw errInvalidArgValue('options.passphrase', passphrase);
    if (cipher != null && !knownCipher(cipher)) throw codedError(Error, 'ERR_CRYPTO_UNKNOWN_CIPHER', 'Unknown cipher');
    const structure = cipher != null && type === 'pkcs8' ? 'EncryptedPrivateKeyInfo' : structures[type];
    const out = nativeEncode(handle.data, handle.type === 'private' ? 1 : 0, format === 'pem' ? 1 : 0, structure, cipher ?? undefined,
      passphrase === undefined ? undefined : bytesOf(passphrase, 'options.passphrase'));
    if (!out) throw osslError(`Failed to encode ${handle.type} key`);
    return format === 'pem' ? out.toString() : out;
  }
}, 'KeyObject');

const keyObject = (type, data) => {
  const out = Object.create(KeyObject.prototype);
  keyObjects.set(out, { type, data });
  return out;
};

const jwkCurves = { prime256v1: 'P-256', secp384r1: 'P-384', secp521r1: 'P-521', secp256k1: 'secp256k1' };
const okpCurves = { ed25519: 'Ed25519', ed448: 'Ed448', x25519: 'X25519', x448: 'X448' };
const b64u = buf => buf.toString('base64url');

const exportJwk = handle => {
  if (handle.type === 'secret') return { kty: 'oct', k: Buffer.from(handle.data).toString('base64url') };
  const { type, bits, curve } = keyInfo(handle), priv = handle.type === 'private';
  if (type === 'rsa') {
    const out = { kty: 'RSA', n: b64u(keyBytes(handle, kBn, 'n')), e: b64u(keyBytes(handle, kBn, 'e')) };
    if (priv) {
      out.d = b64u(keyBytes(handle, kBn, 'd'));
      out.p = b64u(keyBytes(handle, kBn, 'rsa-factor1'));
      out.q = b64u(keyBytes(handle, kBn, 'rsa-factor2'));
      out.dp = b64u(keyBytes(handle, kBn, 'rsa-exponent1'));
      out.dq = b64u(keyBytes(handle, kBn, 'rsa-exponent2'));
      out.qi = b64u(keyBytes(handle, kBn, 'rsa-coefficient1'));
    }
    return out;
  }
  if (type === 'ec') {
    if (!jwkCurves[curve]) throw codedError(Error, 'ERR_CRYPTO_JWK_UNSUPPORTED_CURVE', `Unsupported JWK EC curve: ${curve}.`);
    const size = (bits + 7) >> 3;
    const out = { kty: 'EC', x: b64u(keyBytes(handle, kBn, 'qx', size)), y: b64u(keyBytes(handle, kBn, 'qy', size)), crv: jwkCurves[curve] };
    if (priv) out.d = b64u(keyBytes(handle, kBn, 'priv', size));
    return out;
  }
  if (okpCurves[type]) {
    const out = { kty: 'OKP', crv: okpCurves[type], x: b64u(keyBytes(handle, kRawPublic)) };
    if (priv) out.d = b64u(keyBytes(handle, kRawPrivate));
    return out;
  }
  throw codedError(Error, 'ERR_CRYPTO_JWK_UNSUPPORTED_KEY_TYPE', 'Unsupported JWK Key Type.');
};

// a jwk coordinate is an integer: any big-endian length that fits the field
const coordinate = (b64, size) => {
  const bytes = Buffer.from(b64, 'base64url'), out = Buffer.alloc(size);
  let start = 0;
  while (start < bytes.length && bytes[start] === 0) start++;
  if (bytes.length - start > size) return null;
  out.set(bytes.subarray(start), size - (bytes.length - start));
  return out;
};

const importJwk = jwk => {
  const fromB64u = s => typeof s === 'string' ? Buffer.from(s, 'base64url') : undefined;
  const priv = jwk.d !== undefined;
  let der;
  if (jwk.kty === 'RSA') {
    der = rsaKey(fromB64u(jwk.n), fromB64u(jwk.e), ...(priv ? [ jwk.d, jwk.p, jwk.q, jwk.dp, jwk.dq, jwk.qi ].map(fromB64u) : []));
  } else if (jwk.kty === 'EC') {
    const curve = Object.keys(jwkCurves).find(x => jwkCurves[x] === jwk.crv);
    if (!curve) throw codedError(TypeError, 'ERR_CRYPTO_INVALID_CURVE', 'Invalid EC curve name');
    const size = { 'P-256': 32, 'P-384': 48, 'P-521': 66, secp256k1: 32 }[jwk.crv];
    const x = coordinate(jwk.x, size), y = coordinate(jwk.y, size);
    if (x && y) der = ecKey(curve, Buffer.concat([ Buffer.from([ 4 ]), x, y ]), fromB64u(jwk.d));
  } else if (jwk.kty === 'OKP') {
    const type = Object.keys(okpCurves).find(x => okpCurves[x] === jwk.crv);
    if (type) der = rawKey(type.toUpperCase(), fromB64u(priv ? jwk.d : jwk.x), priv ? 1 : 0);
  } else throw codedError(TypeError, 'ERR_CRYPTO_INVALID_JWK', 'Invalid JWK format');
  if (!der) throw codedError(TypeError, 'ERR_CRYPTO_INVALID_JWK', `Invalid JWK ${jwk.kty} key`);
  return { type: priv ? 'private' : 'public', data: der };
};

// the handle of a key argument: a KeyObject, pem or der data, or { key, format, passphrase, encoding }
const keyHandle = (key, priv) => {
  if (keyObjects.has(key)) return keyObjects.get(key);
  if (key !== null && typeof key === 'object' && !isBufferSource(key)) {
    if (keyObjects.has(key.key)) return keyObjects.get(key.key);
    if (key.format === 'jwk') {
      validateObject(key.key, 'key.key');
      return importJwk(key.key);
    }
    return decodeKey(bytesOf(key.key, 'key.key', key.encoding), priv, key.passphrase);
  }
  return decodeKey(bytesOf(key, 'key'), priv);
};

const decodeKey = (data, priv, passphrase) => {
  const result = nativeDecode(data, priv ? 1 : 0, passphrase === undefined ? undefined : bytesOf(passphrase, 'passphrase'));
  if (result === -1) throw codedError(TypeError, 'ERR_MISSING_PASSPHRASE', 'Passphrase required for encrypted key');
  if (!result) throw osslError(priv ? 'Failed to read private key' : 'Failed to read asymmetric key');
  return { type: result[1] ? 'private' : 'public', data: result[0] };
};

const privateHandle = key => {
  const handle = keyHandle(key, true);
  if (handle.type !== 'private') throw codedError(TypeError, 'ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE', `Invalid key object type ${handle.type}, expected private.`);
  return handle;
};

// secret key bytes from a KeyObject or buffer source
const secretBytes = (key, encoding) => {
  const handle = keyObjects.get(key);
  if (!handle) return bytesOf(key, 'key', encoding);
  if (handle.type !== 'secret') throw codedError(TypeError, 'ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE', `Invalid key object type ${handle.type}, expected secret.`);
  return handle.data;
};

export const createSecretKey = (key, encoding) => keyObject('secret', Buffer.from(bytesOf(key, 'key', encoding)));

export const createPublicKey = key => {
  const handle = keyHandle(key, false);
  return keyObject('public', handle.type === 'public' ? handle.data : nativePublicDer(handle.data));
};

export const createPrivateKey = key => keyObject('private', privateHandle(key).data);

const nativeKeygen = (type, bits, exponent, curve) => {
  let p = 0, n = 0;
  Porffor.c`{
  char *t = porf_node_bytes(type, NULL), *group = porf_jv_type(curve) == 0 ? NULL : porf_node_bytes(curve, NULL);
  size_t size = (size_t)porf_jv_val(bits);
  u64 e = (u64)porf_jv_val(exponent);
  OSSL_PARAM params[4];
  i32 i = 0;
  if (size > 0) {
    params[i++] = OSSL_PARAM_construct_size_t(OSSL_PKEY_PARAM_RSA_BITS, &size);
    params[i++] = OSSL_PARAM_construct_uint64(OSSL_PKEY_PARAM_RSA_E, &e);
  }
  if (group) params[i++] = OSSL_PARAM_construct_utf8_string(OSSL_PKEY_PARAM_GROUP_NAME, group, 0);
  params[i] = OSSL_PARAM_construct_end();
  EVP_PKEY_CTX *c = EVP_PKEY_CTX_new_from_name(NULL, t, NULL);
  EVP_PKEY *k = NULL;
  if (c && EVP_PKEY_keygen_init(c) > 0 && EVP_PKEY_CTX_set_params(c, params) > 0 && EVP_PKEY_generate(c, &k) > 0) {
    size_t len = 0;
    p = (f64)(u64)porf_crypto_key_der(k, 1, &len);
    n = len;
  }
  EVP_PKEY_free(k);
  EVP_PKEY_CTX_free(c);
  free(t);
  free(group);
}`;
  return take(p, n);
};

export const generateKeyPairSync = (type, options = {}) => {
  validateString(type, 'type');
  validateObject(options, 'options');
  let der;
  if (type === 'rsa') {
    validateUint32(options.modulusLength, 'options.modulusLength');
    der = nativeKeygen('RSA', options.modulusLength, options.publicExponent ?? 0x10001);
  } else if (type === 'ec') {
    validateString(options.namedCurve, 'options.namedCurve');
    der = nativeKeygen('EC', 0, 0, options.namedCurve);
    if (!der) throw codedError(TypeError, 'ERR_CRYPTO_INVALID_CURVE', 'Invalid EC curve name');
  } else if (okpCurves[type]) der = nativeKeygen(type.toUpperCase(), 0, 0);
    else throw errInvalidArgValue('type', type, 'must be a supported key type');
  if (!der) throw osslError('Key generation job failed');
  const publicKey = keyObject('public', nativePublicDer(der)), privateKey = keyObject('private', der);
  return {
    publicKey: options.publicKeyEncoding ? publicKey.export(options.publicKeyEncoding) : publicKey,
    privateKey: options.privateKeyEncoding ? privateKey.export(options.privateKeyEncoding) : privateKey
  };
};

const isDigest = name => {
  let ok = 0;
  Porffor.c`{
  EVP_MD *md = porf_crypto_md(name);
  ok = md != NULL;
  EVP_MD_free(md);
}`;
  return ok === 1;
};

const validateDigest = algorithm => {
  if (algorithm == null) return undefined;
  validateString(algorithm, 'algorithm');
  if (!isDigest(algorithm)) throw codedError(TypeError, 'ERR_CRYPTO_INVALID_DIGEST', `Invalid digest: ${algorithm}`);
  return algorithm;
};

// signs data, the signature or null; given a signature verifies it: 1 valid, 0 invalid, -1 failed
const nativeSignVerify = (der, priv, digest, data, signature, padding, saltLength) => {
  let p = 0, n = 0, result = -1;
  Porffor.c`{
  EVP_PKEY *k = porf_crypto_key(der, (i32)porf_jv_val(priv));
  EVP_MD *md = porf_jv_type(digest) == 0 ? NULL : porf_crypto_md(digest);
  EVP_MD_CTX *mc = EVP_MD_CTX_new();
  EVP_PKEY_CTX *c = NULL;
  const i32 sign = porf_jv_type(signature) == 0;
  const char *name = md ? EVP_MD_get0_name(md) : NULL;
  if ((porf_jv_type(digest) == 0 || md) && (sign ? EVP_DigestSignInit_ex(mc, &c, name, NULL, NULL, k, NULL) : EVP_DigestVerifyInit_ex(mc, &c, name, NULL, NULL, k, NULL)) > 0 &&
    (porf_jv_type(padding) == 0 || EVP_PKEY_CTX_set_rsa_padding(c, (i32)porf_jv_val(padding)) > 0) && (porf_jv_type(saltLength) == 0 || EVP_PKEY_CTX_set_rsa_pss_saltlen(c, (i32)porf_jv_val(saltLength)) > 0)) {
    size_t len = 0;
    if (!sign) result = EVP_DigestVerify(mc, porf_crypto_in(signature), porf_crypto_len(signature), porf_crypto_in(data), porf_crypto_len(data)) == 1;
      else if (EVP_DigestSign(mc, NULL, &len, porf_crypto_in(data), porf_crypto_len(data)) > 0) {
        unsigned char *out = malloc(len);
        if (EVP_DigestSign(mc, out, &len, porf_crypto_in(data), porf_crypto_len(data)) > 0) {
          p = (f64)(u64)out;
          n = len;
        } else free(out);
      }
  }
  EVP_MD_CTX_free(mc);
  EVP_MD_free(md);
  EVP_PKEY_free(k);
}`;
  return signature === undefined ? take(p, n) : result;
};

// der (ec)dsa signature <-> r || s of size bytes each, null when malformed
const convertP1363 = (sig, size, toP1363) => {
  let p = 0, n = 0;
  Porffor.c`{
  const unsigned char *in = porf_crypto_in(sig);
  const i32 w = (i32)porf_jv_val(size);
  if (porf_jv_val(toP1363)) {
    ECDSA_SIG *s = d2i_ECDSA_SIG(NULL, &in, porf_crypto_len(sig));
    if (s) {
      unsigned char *out = malloc(w * 2);
      BN_bn2binpad(ECDSA_SIG_get0_r(s), out, w);
      BN_bn2binpad(ECDSA_SIG_get0_s(s), out + w, w);
      p = (f64)(u64)out;
      n = w * 2;
      ECDSA_SIG_free(s);
    }
  } else if (porf_crypto_len(sig) == (u32)w * 2) {
    ECDSA_SIG *s = ECDSA_SIG_new();
    ECDSA_SIG_set0(s, BN_bin2bn(in, w, NULL), BN_bin2bn(in + w, w, NULL));
    unsigned char *der = NULL;
    const i32 len = i2d_ECDSA_SIG(s, &der);
    p = (f64)(u64)memcpy(malloc(len), der, len);
    n = len;
    OPENSSL_free(der);
    ECDSA_SIG_free(s);
  }
}`;
  return take(p, n);
};

// ieee-p1363 signatures are only for ec keys, as r and s padded to the curve's size
const p1363Size = (handle, options) => options?.dsaEncoding === 'ieee-p1363' && keyInfo(handle).type === 'ec' ? (keyInfo(handle).bits + 7) >> 3 : 0;

const signOptions = options => {
  if (options === null || typeof options !== 'object' || isBufferSource(options) || keyObjects.has(options)) return [];
  const { padding, saltLength } = options;
  // pss signing salts as much as fits by default
  return [ padding, saltLength ?? (padding === 6 ? -2 : undefined) ];
};

export const sign = (algorithm, data, key) => {
  algorithm = validateDigest(algorithm);
  data = bytesOf(data, 'data');
  const handle = privateHandle(key);
  const out = nativeSignVerify(handle.data, 1, algorithm, data, undefined, ...signOptions(key));
  if (!out) throw osslError('Operation failed');
  const size = p1363Size(handle, key);
  return size ? convertP1363(out, size, 1) : out;
};

export const verify = (algorithm, data, key, signature) => {
  algorithm = validateDigest(algorithm);
  data = bytesOf(data, 'data');
  signature = bytesOf(signature, 'signature');
  const handle = keyHandle(key, false), size = p1363Size(handle, key);
  if (size) {
    signature = convertP1363(signature, size, 0);
    if (!signature) return false;
  }
  const result = nativeSignVerify(handle.data, handle.type === 'private' ? 1 : 0, algorithm, data, signature, ...signOptions(key));
  if (result < 0) throw osslError('Operation failed');
  return result === 1;
};

// signs and verifies everything written to it in one go
export class Sign {
  #algorithm;
  #chunks = [];

  constructor(algorithm) {
    validateString(algorithm, 'algorithm');
    this.#algorithm = validateDigest(algorithm);
  }

  update(data, encoding) {
    this.#chunks.push(bytesOf(data, 'data', encoding));
    return this;
  }

  sign(privateKey, encoding) {
    return encode(sign(this.#algorithm, Buffer.concat(this.#chunks), privateKey), encoding);
  }

  verify(key, signature, encoding) {
    return verify(this.#algorithm, Buffer.concat(this.#chunks), key, bytesOf(signature, 'signature', encoding));
  }
}

export class Verify extends Sign {}

export const createSign = algorithm => new Sign(algorithm);
export const createVerify = algorithm => new Verify(algorithm);

// der of a pem or der certificate, null when invalid
const x509Parse = data => {
  let p = 0, n = 0;
  Porffor.c`{
  BIO *b = BIO_new_mem_buf(porf_crypto_in(data), (i32)porf_crypto_len(data));
  X509 *cert = PEM_read_bio_X509(b, NULL, NULL, NULL);
  BIO_free(b);
  if (!cert) {
    const unsigned char *in = porf_crypto_in(data);
    cert = d2i_X509(NULL, &in, porf_crypto_len(data));
  }
  if (cert) {
    unsigned char *der = NULL;
    const i32 len = i2d_X509(cert, &der);
    p = (f64)(u64)memcpy(malloc(len), der, len);
    n = len;
    OPENSSL_free(der);
    X509_free(cert);
  }
}`;
  return take(p, n);
};

// 0 subject, 1 issuer, 2 subjectAltName, 3/4 validFrom/To, 5-7 sha1/256/512 fingerprints, 8 serialNumber, 9 pem, 10 public key der, 11/12 iso validFrom/To
const x509Field = (der, which) => {
  let out, p = 0, n = 0;
  Porffor.c`{
  const unsigned char *in = porf_crypto_in(der);
  X509 *cert = d2i_X509(NULL, &in, porf_crypto_len(der));
  const i32 w = (i32)porf_jv_val(which);
  BIO *b = BIO_new(BIO_s_mem());
  i32 has = 1;
  if (w <= 1) {
    X509_NAME_print_ex(b, w == 0 ? X509_get_subject_name(cert) : X509_get_issuer_name(cert), 0,
      ASN1_STRFLGS_ESC_2253 | ASN1_STRFLGS_ESC_CTRL | ASN1_STRFLGS_UTF8_CONVERT | XN_FLAG_SEP_MULTILINE | XN_FLAG_FN_SN);
  } else if (w == 2) {
    const i32 index = X509_get_ext_by_NID(cert, NID_subject_alt_name, -1);
    if (index < 0 || !X509V3_EXT_print(b, X509_get_ext(cert, index), 0, 0)) has = 0;
  } else if (w <= 4) ASN1_TIME_print(b, w == 3 ? X509_get0_notBefore(cert) : X509_get0_notAfter(cert));
  else if (w <= 7) {
    unsigned char md[EVP_MAX_MD_SIZE];
    unsigned int len = 0;
    X509_digest(cert, w == 5 ? EVP_sha1() : w == 6 ? EVP_sha256() : EVP_sha512(), md, &len);
    for (unsigned int i = 0; i < len; i++) BIO_printf(b, i + 1 < len ? "%02X:" : "%02X", md[i]);
  } else if (w == 8) {
    BIGNUM *bn = ASN1_INTEGER_to_BN(X509_get0_serialNumber(cert), NULL);
    char *s = BN_bn2hex(bn);
    BIO_puts(b, s);
    OPENSSL_free(s);
    BN_free(bn);
  } else if (w == 9) PEM_write_bio_X509(b, cert);
  else if (w >= 11) {
    struct tm tm;
    ASN1_TIME_to_tm(w == 11 ? X509_get0_notBefore(cert) : X509_get0_notAfter(cert), &tm);
    BIO_printf(b, "%04d-%02d-%02dT%02d:%02d:%02dZ", tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);
  } else {
    size_t len = 0;
    p = (f64)(u64)porf_crypto_key_der(X509_get0_pubkey(cert), 0, &len);
    n = len;
  }
  size_t len;
  char *s = porf_crypto_bio_take(b, &len);
  if (has) out = porf_node_str(s, len);
  free(s);
  X509_free(cert);
  ERR_clear_error();
}`;
  return which === 10 ? take(p, n) : out;
};

// 0 ca, 1 checkHost, 2 checkEmail, 3 checkIP, 4 issued by other, 5 private key matches, 6 signed by key
const x509Check = (der, which, value, other, otherPriv) => {
  let result = 0, matched;
  Porffor.c`{
  const unsigned char *in = porf_crypto_in(der);
  X509 *cert = d2i_X509(NULL, &in, porf_crypto_len(der));
  const i32 w = (i32)porf_jv_val(which);
  if (w == 0) result = X509_check_ca(cert) == 1;
  else if (w <= 3) {
    char *v = porf_node_bytes(value, NULL), *peer = NULL;
    result = (w == 1 ? X509_check_host(cert, v, strlen(v), 0, &peer) : w == 2 ? X509_check_email(cert, v, strlen(v), 0) : X509_check_ip_asc(cert, v, 0)) == 1;
    if (peer) matched = porf_bstr_of(peer, strlen(peer));
    OPENSSL_free(peer);
    free(v);
  } else if (w == 4) {
    const unsigned char *o = porf_crypto_in(other);
    X509 *issuer = d2i_X509(NULL, &o, porf_crypto_len(other));
    result = X509_check_issued(issuer, cert) == X509_V_OK;
    X509_free(issuer);
  } else {
    EVP_PKEY *k = porf_crypto_key(other, (i32)porf_jv_val(otherPriv));
    result = w == 5 ? X509_check_private_key(cert, k) == 1 : X509_verify(cert, k) > 0;
    EVP_PKEY_free(k);
  }
  X509_free(cert);
  ERR_clear_error();
}`;
  return which === 1 ? matched : result === 1;
};

export class X509Certificate {
  #der;

  constructor(buffer) {
    this.#der = x509Parse(bytesOf(buffer, 'buffer'));
    if (!this.#der) throw osslError('Failed to parse certificate');
  }

  get subject() { return x509Field(this.#der, 0); }
  get issuer() { return x509Field(this.#der, 1); }
  get subjectAltName() { return x509Field(this.#der, 2); }
  get validFrom() { return x509Field(this.#der, 3); }
  get validTo() { return x509Field(this.#der, 4); }
  get validFromDate() { return new Date(x509Field(this.#der, 11)); }
  get validToDate() { return new Date(x509Field(this.#der, 12)); }
  get fingerprint() { return x509Field(this.#der, 5); }
  get fingerprint256() { return x509Field(this.#der, 6); }
  get fingerprint512() { return x509Field(this.#der, 7); }
  get serialNumber() { return x509Field(this.#der, 8); }
  get raw() { return Buffer.from(this.#der); }
  get publicKey() { return keyObject('public', x509Field(this.#der, 10)); }
  get ca() { return x509Check(this.#der, 0); }

  toString() { return x509Field(this.#der, 9); }
  toJSON() { return this.toString(); }

  checkHost(name) { return x509Check(this.#der, 1, name); }
  checkEmail(email) { return x509Check(this.#der, 2, email) ? email : undefined; }
  checkIP(ip) { return x509Check(this.#der, 3, ip) ? ip : undefined; }
  checkIssued(otherCert) { return x509Check(this.#der, 4, undefined, otherCert.#der); }
  checkPrivateKey(privateKey) { return x509Check(this.#der, 5, undefined, keyObjects.get(privateKey).data, 1); }
  verify(publicKey) { return x509Check(this.#der, 6, undefined, keyObjects.get(publicKey).data, 0); }
}

// web crypto: what jwt libraries use, digests and signatures

const canonical = (name, names) => {
  const out = names.find(x => x.toUpperCase() === `${name}`.toUpperCase());
  if (!out) throw new DOMException('Unrecognized algorithm name', 'NotSupportedError');
  return out;
};

const hashNames = [ 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512' ];
const nodeHash = name => canonical(name?.name ?? name, hashNames).replace('-', '').toLowerCase();

const normalize = algorithm => {
  if (typeof algorithm === 'string') algorithm = { name: algorithm };
  const out = { ...algorithm, name: canonical(algorithm.name, [ 'ECDSA', 'RSASSA-PKCS1-v1_5', 'RSA-PSS', 'HMAC', 'Ed25519' ]) };
  if (out.hash !== undefined) out.hash = { name: canonical(out.hash.name ?? out.hash, hashNames) };
  return out;
};

const curves = { 'P-256': 'prime256v1', 'P-384': 'secp384r1', 'P-521': 'secp521r1' };

// a crypto key's key object, algorithm, usages and extractability
const cryptoKeys = new WeakMap();

export const CryptoKey = /*@__PURE__*/ tagged(class CryptoKey {
  constructor() {
    throw new TypeError('Illegal constructor');
  }

  get type() { return cryptoKeys.get(this).key.type; }
  get extractable() { return cryptoKeys.get(this).extractable; }
  get algorithm() { return cryptoKeys.get(this).algorithm; }
  get usages() { return cryptoKeys.get(this).exposedUsages; }
}, 'CryptoKey');

const cryptoKey = (key, algorithm, usages, extractable) => {
  const out = Object.create(CryptoKey.prototype);
  cryptoKeys.set(out, { key, algorithm, usages: [ ...usages ], exposedUsages: [ ...usages ], extractable });
  return out;
};

const keyPair = (keys, algorithm, extractable, usages) => ({
  publicKey: cryptoKey(keys.publicKey, algorithm, usages.filter(x => x === 'verify'), true),
  privateKey: cryptoKey(keys.privateKey, algorithm, usages.filter(x => x === 'sign'), extractable)
});

// an rsa key's web crypto algorithm
const rsaAlgorithm = (name, key, hash) => {
  const { modulusLength, publicExponent } = key.asymmetricKeyDetails, e = publicExponent.toString(16);
  return { name, modulusLength, publicExponent: new Uint8Array(Buffer.from(e.length % 2 ? '0' + e : e, 'hex')), hash };
};

const signVerify = (algorithm, key, data, signature) => {
  const normalized = normalize(algorithm), { name, saltLength } = normalized, op = signature === undefined ? 'sign' : 'verify';
  const slot = cryptoKeys.get(key), keyObject = slot.key;
  if (!slot.usages.includes(op)) throw new DOMException(`Unable to use this key to ${op}`, 'InvalidAccessError');
  if (name !== slot.algorithm.name) throw new DOMException('Key algorithm mismatch', 'InvalidAccessError');
  data = viewOf(data);
  if (name === 'HMAC') {
    const mac = createHmac(nodeHash(slot.algorithm.hash), keyObject).update(data).digest();
    return op === 'sign' ? toArrayBuffer(mac) : signature.byteLength === mac.length && timingSafeEqual(signature, mac);
  }
  const digest = name === 'ECDSA' ? nodeHash(normalized.hash) : name === 'Ed25519' ? null : nodeHash(slot.algorithm.hash);
  const options = { key: keyObject, dsaEncoding: 'ieee-p1363', padding: name === 'RSA-PSS' ? 6 : name === 'RSASSA-PKCS1-v1_5' ? 1 : undefined, saltLength };
  if (op === 'sign') return toArrayBuffer(sign(digest, data, options));
  try {
    return verify(digest, data, options, viewOf(signature));
  } catch {
    return false;
  }
};

const importAsymmetric = (format, keyData, name, namedCurve) => {
  if (format === 'jwk') return keyData.d === undefined ? createPublicKey({ key: keyData, format }) : createPrivateKey({ key: keyData, format });
  const bytes = Buffer.from(viewOf(keyData));
  if (format === 'spki') return createPublicKey({ key: bytes, format: 'der' });
  if (format === 'pkcs8') return createPrivateKey({ key: bytes, format: 'der' });
  if (format !== 'raw' || name.startsWith('RSA')) throw new DOMException(`Unable to import ${name} key with format ${format}`, 'NotSupportedError');
  const der = name === 'ECDSA' ? ecKey(curves[namedCurve], bytes) : rawKey('ED25519', bytes, 0);
  if (!der) throw new DOMException('Invalid keyData', 'DataError');
  return keyObject('public', der);
};

const jwkAlg = algorithm => {
  const bits = algorithm.hash?.name.slice(4);
  return { HMAC: `HS${bits}`, 'RSASSA-PKCS1-v1_5': `RS${bits}`, 'RSA-PSS': `PS${bits}`, Ed25519: 'Ed25519' }[algorithm.name];
};

export const subtle = {
  async digest(algorithm, data) {
    return toArrayBuffer(createHash(nodeHash(algorithm)).update(viewOf(data)).digest());
  },

  async generateKey(algorithm, extractable, usages) {
    algorithm = normalize(algorithm);
    const { name, hash } = algorithm;
    if (name === 'HMAC') {
      const length = algorithm.length ?? (hash.name === 'SHA-384' || hash.name === 'SHA-512' ? 1024 : 512);
      return cryptoKey(createSecretKey(randomBytes(length >> 3)), { name, length, hash }, usages, extractable);
    }
    if (name === 'ECDSA') return keyPair(generateKeyPairSync('ec', { namedCurve: curves[algorithm.namedCurve] }), { name, namedCurve: algorithm.namedCurve }, extractable, usages);
    if (name === 'Ed25519') return keyPair(generateKeyPairSync('ed25519'), { name }, extractable, usages);
    const keys = generateKeyPairSync('rsa', { modulusLength: algorithm.modulusLength, publicExponent: algorithm.publicExponent.reduce((n, b) => n * 256 + b, 0) });
    return keyPair(keys, rsaAlgorithm(name, keys.publicKey, hash), extractable, usages);
  },

  async importKey(format, keyData, algorithm, extractable, usages) {
    const { name, hash, namedCurve } = normalize(algorithm);
    if (name === 'HMAC') {
      if (format !== 'raw' && format !== 'jwk') throw new DOMException(`Unable to import HMAC key with format ${format}`, 'NotSupportedError');
      const key = format === 'jwk' ? createSecretKey(keyData.k, 'base64url') : createSecretKey(viewOf(keyData));
      return cryptoKey(key, { name, length: key.symmetricKeySize * 8, hash }, usages, extractable);
    }
    let key;
    try {
      key = importAsymmetric(format, keyData, name, namedCurve);
    } catch (err) {
      throw err instanceof DOMException ? err : new DOMException(err.message, 'DataError');
    }
    const keyAlgorithm = name === 'ECDSA' ? { name, namedCurve } : name === 'Ed25519' ? { name } : rsaAlgorithm(name, key, hash);
    return cryptoKey(key, keyAlgorithm, usages.filter(x => x === (key.type === 'public' ? 'verify' : 'sign')), extractable);
  },

  async exportKey(format, key) {
    const { key: keyObject, algorithm, usages, extractable } = cryptoKeys.get(key);
    if (!extractable) throw new DOMException('key is not extractable', 'InvalidAccessError');
    if (format === 'jwk') {
      const out = { ...keyObject.export({ format: 'jwk' }), key_ops: [ ...usages ], ext: extractable };
      if (jwkAlg(algorithm)) out.alg = jwkAlg(algorithm);
      return out;
    }
    if (format === 'raw' && keyObject.type === 'secret') return toArrayBuffer(keyObject.export());
    if (format === 'raw' && keyObject.type === 'public') return toArrayBuffer(algorithm.name === 'ECDSA' ? keyBytes(keyObjects.get(keyObject), kOctets, 'pub') : keyBytes(keyObjects.get(keyObject), kRawPublic));
    if (format === 'spki' || format === 'pkcs8') return toArrayBuffer(keyObject.export({ format: 'der', type: format }));
    throw new DOMException(`Unable to export ${algorithm.name} key with format ${format}`, 'NotSupportedError');
  },

  async sign(algorithm, key, data) {
    return signVerify(algorithm, key, data);
  },

  async verify(algorithm, key, signature, data) {
    return signVerify(algorithm, key, data, viewOf(signature));
  }
};

export const webcrypto = { subtle, getRandomValues, randomUUID };

const opensslVersion = () => {
  let version = 0;
  Porffor.c`version = (f64)OPENSSL_VERSION_NUMBER;`;
  return version;
};

const defaultCipherList = 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA';

export const constants = {
  OPENSSL_VERSION_NUMBER: /*@__PURE__*/ opensslVersion(),
  SSL_OP_ALL: 2147485776, SSL_OP_CIPHER_SERVER_PREFERENCE: 4194304, SSL_OP_LEGACY_SERVER_CONNECT: 4, SSL_OP_NO_COMPRESSION: 131072,
  SSL_OP_NO_RENEGOTIATION: 1073741824, SSL_OP_NO_SSLv2: 0, SSL_OP_NO_SSLv3: 33554432, SSL_OP_NO_TICKET: 16384,
  SSL_OP_NO_TLSv1: 67108864, SSL_OP_NO_TLSv1_1: 268435456, SSL_OP_NO_TLSv1_2: 134217728, SSL_OP_NO_TLSv1_3: 536870912,
  RSA_PKCS1_PADDING: 1, RSA_NO_PADDING: 3, RSA_PKCS1_OAEP_PADDING: 4, RSA_PKCS1_PSS_PADDING: 6,
  RSA_PSS_SALTLEN_DIGEST: -1, RSA_PSS_SALTLEN_MAX_SIGN: -2, RSA_PSS_SALTLEN_AUTO: -2,
  TLS1_VERSION: 769, TLS1_1_VERSION: 770, TLS1_2_VERSION: 771, TLS1_3_VERSION: 772,
  POINT_CONVERSION_COMPRESSED: 2, POINT_CONVERSION_UNCOMPRESSED: 4, POINT_CONVERSION_HYBRID: 6,
  defaultCoreCipherList: defaultCipherList, defaultCipherList
};

export default {
  Hash, Hmac, KeyObject, Sign, Verify, X509Certificate, constants, createHash, createHmac, createPrivateKey, createPublicKey, createSecretKey,
  createSign, createVerify, generateKeyPairSync, getCiphers, getCurves, getFips, getHashes, getRandomValues, hash, pbkdf2Sync, pseudoRandomBytes: randomBytes,
  randomBytes, randomFillSync, randomInt, randomUUID, sign, subtle, timingSafeEqual, verify, webcrypto
};
