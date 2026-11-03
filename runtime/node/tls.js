// tls over any socket: openssl drives memory bios, ciphertext goes through the wrapped socket
import './c-helpers.js';
import { Buffer } from './buffer.js';
import process from './process.js';
import * as net from './net.js';
import { X509Certificate, constants } from './crypto.js';
import { clearTimeout } from './timers.js';
import { nextTick } from './internal/loop.js';
import { adoptBytes } from './internal/bytes.js';
import { isIP } from './internal/ip.js';
import { codedError, errSocketClosed } from './internal/errors.js';

Porffor.link`static openssl`;

Porffor.c`
#include <openssl/ssl.h>
#include <openssl/err.h>

typedef struct {
  SSL *ssl;
  BIO *rbio, *wbio;
  // a server's alpn protocols, in wire format
  unsigned char *alpn;
  unsigned int alpn_len;
} porf_tls;

static char porf_tls_message[256], porf_tls_reason[128];
static X509_STORE *porf_tls_roots;
static char porf_tls_record[16384];

// the first error queued, or the first of the ssl layer (below it are provider details); empties the queue
static inline void porf_tls_take_error(void) {
  unsigned long e, first = 0, ssl = 0;
  while ((e = ERR_get_error())) {
    if (!first) first = e;
    if (!ssl && ERR_GET_LIB(e) == ERR_LIB_SSL) ssl = e;
  }
  if (ssl) first = ssl;
  const char *reason = first ? ERR_reason_error_string(first) : NULL;
  if (first) ERR_error_string_n(first, porf_tls_message, sizeof(porf_tls_message));
    else snprintf(porf_tls_message, sizeof(porf_tls_message), "TLS error");
  snprintf(porf_tls_reason, sizeof(porf_tls_reason), "%s", reason ? reason : "");
}

static inline i32 porf_tls_alpn_select(SSL *ssl, const unsigned char **out, unsigned char *outlen, const unsigned char *in, unsigned int inlen, void *arg) {
  porf_tls *t = SSL_get_app_data(ssl);
  if (!t->alpn) return SSL_TLSEXT_ERR_NOACK;
  return SSL_select_next_proto((unsigned char**)out, outlen, t->alpn, t->alpn_len, in, inlen) == OPENSSL_NPN_NEGOTIATED ? SSL_TLSEXT_ERR_OK : SSL_TLSEXT_ERR_ALERT_FATAL;
}

// verification errors are read once the handshake is done
static inline i32 porf_tls_verify(i32 ok, X509_STORE_CTX *ctx) {
  return 1;
}
`;

// node's names for openssl's verify errors
const verifyCodes = {
  2: 'UNABLE_TO_GET_ISSUER_CERT', 3: 'UNABLE_TO_GET_CRL', 4: 'UNABLE_TO_DECRYPT_CERT_SIGNATURE', 5: 'UNABLE_TO_DECRYPT_CRL_SIGNATURE',
  6: 'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY', 7: 'CERT_SIGNATURE_FAILURE', 8: 'CRL_SIGNATURE_FAILURE', 9: 'CERT_NOT_YET_VALID', 10: 'CERT_HAS_EXPIRED',
  11: 'CRL_NOT_YET_VALID', 12: 'CRL_HAS_EXPIRED', 13: 'ERROR_IN_CERT_NOT_BEFORE_FIELD', 14: 'ERROR_IN_CERT_NOT_AFTER_FIELD', 15: 'ERROR_IN_CRL_LAST_UPDATE_FIELD',
  16: 'ERROR_IN_CRL_NEXT_UPDATE_FIELD', 17: 'OUT_OF_MEM', 18: 'DEPTH_ZERO_SELF_SIGNED_CERT', 19: 'SELF_SIGNED_CERT_IN_CHAIN',
  20: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 21: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 22: 'CERT_CHAIN_TOO_LONG', 23: 'CERT_REVOKED', 24: 'INVALID_CA',
  25: 'PATH_LENGTH_EXCEEDED', 26: 'INVALID_PURPOSE', 27: 'CERT_UNTRUSTED', 28: 'CERT_REJECTED'
};

// the last openssl error, with node's ERR_SSL_<REASON> code
const sslError = () => {
  let message, reason;
  Porffor.c`message = porf_bstr_of(porf_tls_message, strlen(porf_tls_message));
reason = porf_bstr_of(porf_tls_reason, strlen(porf_tls_reason));`;
  const err = new Error(message);
  if (reason) err.code = `ERR_SSL_${reason.toUpperCase().replaceAll(' ', '_')}`;
  return err;
};

const toBuffer = (p, n) => Object.setPrototypeOf(adoptBytes(p, n), Buffer.prototype);

const pemOf = x => typeof x === 'string' ? Buffer.from(x) : x;

const versions = { TLSv1: 0x301, 'TLSv1.1': 0x302, 'TLSv1.2': 0x303, 'TLSv1.3': 0x304 };

const versionOf = (version, which) => {
  if (!versions[version]) throw codedError(TypeError, 'ERR_TLS_INVALID_PROTOCOL_VERSION', `${JSON.stringify(version)} is not a valid ${which} TLS protocol version`);
  return versions[version];
};

const ctxNew = () => {
  let ctx = 0;
  Porffor.c`{
  SSL_CTX *c = SSL_CTX_new(TLS_method());
  SSL_CTX_set_mode(c, SSL_MODE_RELEASE_BUFFERS);
  SSL_CTX_set_alpn_select_cb(c, porf_tls_alpn_select, NULL);
  SSL_CTX_set_session_id_context(c, (const unsigned char*)"porffor", 7);
  ctx = (f64)(u64)c;
}`;
  return ctx;
};

const ctxVersions = (ctx, server, min, max, secureOptions) => {
  Porffor.c`{
  SSL_CTX *c = (SSL_CTX*)(u64)porf_jv_val(ctx);
  SSL_CTX_set_min_proto_version(c, (i32)porf_jv_val(min));
  SSL_CTX_set_max_proto_version(c, (i32)porf_jv_val(max));
  SSL_CTX_set_options(c, SSL_OP_NO_COMPRESSION | (u64)porf_jv_val(secureOptions) | (porf_jv_val(server) ? SSL_OP_CIPHER_SERVER_PREFERENCE : 0));
}`;
};

// openssl's default paths (SSL_CERT_FILE, SSL_CERT_DIR) plus NODE_EXTRA_CA_CERTS, shared by contexts without their own ca
const ctxUseRoots = ctx => {
  Porffor.c`{
  if (!porf_tls_roots) {
    porf_tls_roots = X509_STORE_new();
    X509_STORE_set_default_paths(porf_tls_roots);
    // the build host's cert file may not be here: the usual system bundles instead
    if (!getenv(X509_get_default_cert_file_env()) && access(X509_get_default_cert_file(), R_OK) != 0) {
      const char *bundles[] = { "/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt" };
      for (i32 i = 0; i < 3 && X509_STORE_load_file(porf_tls_roots, bundles[i]) != 1; i++);
    }
    const char *extra = getenv("NODE_EXTRA_CA_CERTS");
    if (extra) X509_STORE_load_file(porf_tls_roots, extra);
    ERR_clear_error();
  }
  X509_STORE_up_ref(porf_tls_roots);
  SSL_CTX_set_cert_store((SSL_CTX*)(u64)porf_jv_val(ctx), porf_tls_roots);
}`;
};

// which: 0 trusted cas, 1 the certificate then its chain, 2 the private key, 3 the cipher list, 4 tls 1.3 cipher suites
const ctxSet = (ctx, which, value, passphrase) => {
  let ok = 1;
  Porffor.c`{
  SSL_CTX *c = (SSL_CTX*)(u64)porf_jv_val(ctx);
  const i32 w = (i32)porf_jv_val(which);
  if (w >= 3) {
    char *s = porf_node_bytes(value, NULL);
    ok = w == 3 ? SSL_CTX_set_cipher_list(c, s) : SSL_CTX_set_ciphersuites(c, s);
    free(s);
  } else {
    BIO *b = BIO_new_mem_buf(porf_node_u8(value), (i32)*(u32*)(MEM + porf_jv_ptr(value)));
    X509 *cert;
    if (w == 0) {
      while ((cert = PEM_read_bio_X509_AUX(b, NULL, NULL, NULL))) {
        X509_STORE_add_cert(SSL_CTX_get_cert_store(c), cert);
        SSL_CTX_add_client_CA(c, cert);
        X509_free(cert);
      }
      ERR_clear_error();
    } else if (w == 1) {
      cert = PEM_read_bio_X509_AUX(b, NULL, NULL, NULL);
      ok = cert && SSL_CTX_use_certificate(c, cert) == 1;
      X509_free(cert);
      while (ok && (cert = PEM_read_bio_X509(b, NULL, NULL, NULL))) SSL_CTX_add0_chain_cert(c, cert);
      if (ok) ERR_clear_error();
    } else {
      char *pass = porf_jv_type(passphrase) == 0 ? NULL : porf_node_bytes(passphrase, NULL);
      EVP_PKEY *k = PEM_read_bio_PrivateKey(b, NULL, NULL, pass ? pass : (char*)"");
      ok = k && SSL_CTX_use_PrivateKey(c, k) == 1;
      EVP_PKEY_free(k);
      free(pass);
    }
    BIO_free(b);
  }
  if (ok != 1) porf_tls_take_error();
}`;
  if (ok !== 1) throw sslError();
};

const ctxFree = ctx => {
  Porffor.c`SSL_CTX_free((SSL_CTX*)(u64)porf_jv_val(ctx));`;
};

// a tls context's or uWebSockets https app's SSL_CTX set up for the options
export const _configureContext = (ctx, options, server) => {
  ctxVersions(ctx, server ? 1 : 0, versionOf(options.minVersion ?? 'TLSv1.2', 'minimum'), versionOf(options.maxVersion ?? 'TLSv1.3', 'maximum'), options.secureOptions ?? 0);
  if (options.ca) for (const ca of [].concat(options.ca)) ctxSet(ctx, 0, pemOf(ca));
    else ctxUseRoots(ctx);
  for (const cert of options.cert ? [].concat(options.cert) : []) ctxSet(ctx, 1, pemOf(cert));
  for (const key of options.key ? [].concat(options.key) : []) ctxSet(ctx, 2, pemOf(key.pem ?? key), key.passphrase ?? options.passphrase);
  const list = (options.ciphers ?? constants.defaultCipherList).split(':');
  ctxSet(ctx, 3, list.filter(x => !x.startsWith('TLS_')).join(':'));
  if (list.some(x => x.startsWith('TLS_'))) ctxSet(ctx, 4, list.filter(x => x.startsWith('TLS_')).join(':'));
};

const contextOf = (options, server) => {
  const ctx = ctxNew();
  try {
    _configureContext(ctx, options, server);
  } catch (err) {
    ctxFree(ctx);
    throw err;
  }
  return ctx;
};

// [ length-prefixed ] protocol names, the wire format
const alpnWire = protocols => Buffer.concat(protocols.map(x => Buffer.concat([ Buffer.from([ Buffer.byteLength(x) ]), Buffer.from(x) ])));

// a connection over a context (which it keeps a reference to); clients send servername and alpn, servers select from their alpn
const connNew = (ctx, server, requestCert, rejectUnauthorized, servername, alpn) => {
  let conn = 0;
  Porffor.c`{
  porf_tls *t = calloc(1, sizeof(porf_tls));
  t->ssl = SSL_new((SSL_CTX*)(u64)porf_jv_val(ctx));
  SSL_set_app_data(t->ssl, t);
  t->rbio = BIO_new(BIO_s_mem());
  t->wbio = BIO_new(BIO_s_mem());
  SSL_set_bio(t->ssl, t->rbio, t->wbio);
  // clients always verify, servers only when asked to
  const i32 mode = !porf_jv_val(server) ? SSL_VERIFY_PEER : porf_jv_val(requestCert) ? SSL_VERIFY_PEER | (porf_jv_val(rejectUnauthorized) ? SSL_VERIFY_FAIL_IF_NO_PEER_CERT : 0) : SSL_VERIFY_NONE;
  SSL_set_verify(t->ssl, mode, porf_tls_verify);
  if (porf_jv_val(server)) SSL_set_accept_state(t->ssl);
    else SSL_set_connect_state(t->ssl);
  if (porf_jv_type(servername) != 0) {
    char *s = porf_node_bytes(servername, NULL);
    SSL_set_tlsext_host_name(t->ssl, s);
    free(s);
  }
  if (porf_jv_type(alpn) != 0) {
    const u32 len = *(u32*)(MEM + porf_jv_ptr(alpn));
    if (porf_jv_val(server)) {
      t->alpn = memcpy(malloc(len), porf_node_u8(alpn), len);
      t->alpn_len = len;
    } else SSL_set_alpn_protos(t->ssl, (const unsigned char*)porf_node_u8(alpn), len);
  }
  conn = (f64)(u64)t;
}`;
  return conn;
};

const connFree = conn => {
  Porffor.c`{
  porf_tls *t = (porf_tls*)(u64)porf_jv_val(conn);
  SSL_free(t->ssl);
  free(t->alpn);
  free(t);
}`;
};

const connFeed = (conn, data) => {
  Porffor.c`BIO_write(((porf_tls*)(u64)porf_jv_val(conn))->rbio, porf_node_u8(data), (i32)*(u32*)(MEM + porf_jv_ptr(data)));`;
};

// 1 done, 0 needs more data, -1 failed
const connHandshake = conn => {
  let status = 0;
  Porffor.c`{
  SSL *ssl = ((porf_tls*)(u64)porf_jv_val(conn))->ssl;
  ERR_clear_error();
  const i32 r = SSL_do_handshake(ssl);
  if (r == 1) status = 1;
  else {
    const i32 e = SSL_get_error(ssl, r);
    if (e != SSL_ERROR_WANT_READ && e != SSL_ERROR_WANT_WRITE) {
      status = -1;
      porf_tls_take_error();
    }
  }
}`;
  return status;
};

// a record of plaintext, else 0 for more later, 1 when the peer closed, -1 failed
const connRead = conn => {
  let p = 0, n = 0, status = 0;
  Porffor.c`{
  SSL *ssl = ((porf_tls*)(u64)porf_jv_val(conn))->ssl;
  ERR_clear_error();
  const i32 r = SSL_read(ssl, porf_tls_record, sizeof(porf_tls_record));
  if (r > 0) {
    p = (f64)(u64)memcpy(malloc(r), porf_tls_record, r);
    n = r;
  } else {
    const i32 e = SSL_get_error(ssl, r);
    if (e == SSL_ERROR_ZERO_RETURN) status = 1;
    else if (e != SSL_ERROR_WANT_READ && e != SSL_ERROR_WANT_WRITE) {
      status = -1;
      porf_tls_take_error();
    }
  }
}`;
  return n > 0 ? toBuffer(p, n) : status;
};

const connWrite = (conn, data) => {
  let ok = 1;
  Porffor.c`{
  const u32 len = *(u32*)(MEM + porf_jv_ptr(data));
  ERR_clear_error();
  if (len > 0 && SSL_write(((porf_tls*)(u64)porf_jv_val(conn))->ssl, porf_node_u8(data), (i32)len) <= 0) {
    ok = 0;
    porf_tls_take_error();
  }
}`;
  return ok === 1;
};

// the ciphertext waiting to go out, null when none
const connTake = conn => {
  let p = 0, n = 0;
  Porffor.c`{
  BIO *b = ((porf_tls*)(u64)porf_jv_val(conn))->wbio;
  const size_t len = BIO_ctrl_pending(b);
  if (len > 0) {
    char *out = malloc(len);
    BIO_read(b, out, (i32)len);
    p = (f64)(u64)out;
    n = len;
  }
}`;
  return n > 0 ? toBuffer(p, n) : null;
};

const connShutdown = conn => {
  Porffor.c`{
  SSL *ssl = ((porf_tls*)(u64)porf_jv_val(conn))->ssl;
  if (SSL_is_init_finished(ssl)) SSL_shutdown(ssl);
  ERR_clear_error();
}`;
};

// the verify error code, 0 when verified: a peer without a certificate isn't
const connVerify = conn => {
  let code = 0;
  Porffor.c`{
  SSL *ssl = ((porf_tls*)(u64)porf_jv_val(conn))->ssl;
  X509 *peer = SSL_get1_peer_certificate(ssl);
  code = peer ? SSL_get_verify_result(ssl) : X509_V_ERR_UNABLE_TO_GET_ISSUER_CERT;
  X509_free(peer);
}`;
  return code;
};

const verifyError = code => {
  if (code === 0) return null;
  let message;
  Porffor.c`{
  const char *m = X509_verify_cert_error_string((long)porf_jv_val(code));
  message = porf_bstr_of(m, strlen(m));
}`;
  return codedError(Error, verifyCodes[code] ?? 'UNSPECIFIED', message);
};

// 0 alpn, 1 protocol, 2 cipher name, 3 cipher standard name, 4 cipher version; null when none
const connInfo = (conn, which) => {
  let out = null;
  Porffor.c`{
  SSL *ssl = ((porf_tls*)(u64)porf_jv_val(conn))->ssl;
  const SSL_CIPHER *c = SSL_get_current_cipher(ssl);
  const char *s = NULL;
  const unsigned char *alpn;
  unsigned int len = 0;
  switch ((i32)porf_jv_val(which)) {
    case 0:
      SSL_get0_alpn_selected(ssl, &alpn, &len);
      if (len) out = porf_bstr_of((const char*)alpn, len);
      break;
    case 1: s = SSL_get_version(ssl); break;
    case 2: s = c ? SSL_CIPHER_get_name(c) : NULL; break;
    case 3: s = c ? SSL_CIPHER_standard_name(c) : NULL; break;
    case 4: s = c ? SSL_CIPHER_get_version(c) : NULL; break;
  }
  if (s) out = porf_bstr_of(s, strlen(s));
}`;
  return out;
};

// the peer's certificate as der, null when it sent none
const connPeerCert = conn => {
  let p = 0, n = 0;
  Porffor.c`{
  X509 *peer = SSL_get1_peer_certificate(((porf_tls*)(u64)porf_jv_val(conn))->ssl);
  unsigned char *der = NULL;
  const i32 len = peer ? i2d_X509(peer, &der) : 0;
  if (len > 0) {
    p = (f64)(u64)memcpy(malloc(len), der, len);
    n = len;
  }
  OPENSSL_free(der);
  X509_free(peer);
}`;
  return n > 0 ? toBuffer(p, n) : null;
};

// a name's "key=value" lines as node's object of them, repeated keys as arrays
const nameObject = text => {
  const out = { __proto__: null };
  for (const line of text.split('\n')) {
    const eq = line.indexOf('=');
    const key = line.slice(0, eq), value = line.slice(eq + 1);
    out[key] = out[key] === undefined ? value : [].concat(out[key], value);
  }
  return out;
};

const peerCertificate = der => {
  const cert = new X509Certificate(der);
  return {
    subject: nameObject(cert.subject), issuer: nameObject(cert.issuer), subjectaltname: cert.subjectAltName, valid_from: cert.validFrom, valid_to: cert.validTo,
    fingerprint: cert.fingerprint, fingerprint256: cert.fingerprint256, fingerprint512: cert.fingerprint512, serialNumber: cert.serialNumber, raw: cert.raw
  };
};

// the default identity check, by the peer certificate's names
const checkIdentity = (hostname, der) => {
  const cert = new X509Certificate(der), ip = isIP(hostname);
  if (ip ? cert.checkIP(hostname) : cert.checkHost(hostname)) return undefined;
  const reason = ip ? `IP: ${hostname} is not in the cert's list: ${cert.subjectAltName ?? ''}` : `Host: ${hostname}. is not in the cert's altnames: ${cert.subjectAltName}`;
  const err = codedError(Error, 'ERR_TLS_CERT_ALTNAME_INVALID', `Hostname/IP does not match certificate's altnames: ${reason}`);
  err.reason = reason;
  err.host = hostname;
  return err;
};

export function TLSSocket(socket, options) {
  if (!(this instanceof TLSSocket)) return new TLSSocket(socket, options);
  options = { ...options };
  net.Socket.call(this, { allowHalfOpen: socket?.allowHalfOpen ?? options.allowHalfOpen });
  const server = !!options.isServer;
  this.encrypted = true;
  this.authorized = false;
  this.authorizationError = null;
  this.alpnProtocol = null;
  this.servername = server ? null : options.servername ?? null;
  this.secureConnecting = true;
  this.server = options.server ?? null;
  this._tlsOptions = options;
  this._secureEstablished = false;
  this._pendingWrite = null;

  const ctx = options.context ?? contextOf(options, server);
  this._conn = connNew(ctx, server ? 1 : 0, options.requestCert ? 1 : 0, options.rejectUnauthorized ? 1 : 0, server ? undefined : options.servername || undefined,
    options.ALPNProtocols ? alpnWire(options.ALPNProtocols) : undefined);
  if (!options.context) ctxFree(ctx);
  // node's server sockets always have an error listener, so their errors never go uncaught
  if (server) this.on('error', () => {});

  const parent = this._parent = socket ?? new net.Socket();
  this.connecting = parent.connecting;
  parent.on('data', data => this._onCipher(data));
  parent.on('end', () => this._onCipherEnd());
  parent.on('error', err => this._onError(err));
  parent.on('close', () => this.destroy());
  parent.once('connect', () => {
    this.connecting = false;
    this.emit('connect');
    this._cycle();
  });
  if (parent.isPaused()) parent.resume();
}
Object.setPrototypeOf(TLSSocket.prototype, net.Socket.prototype);
Object.setPrototypeOf(TLSSocket, net.Socket);

const T = TLSSocket.prototype;

// runs openssl as far as it goes: the handshake, then plaintext in and ciphertext out
T._cycle = function () {
  if (!this._conn) return;
  if (!this._secureEstablished) {
    const status = connHandshake(this._conn);
    // alerts go out before the error
    this._flushCipher();
    if (status < 0) return this._onError(sslError());
    if (status === 0) return;
    this._secureEstablished = true;
    this.secureConnecting = false;
    this.alpnProtocol = connInfo(this._conn, 0) ?? false;
    if (this._tlsOptions.isServer) onServerSecure(this);
      else onClientSecure(this);
    if (!this._conn) return;
    const pending = this._pendingWrite;
    this._pendingWrite = null;
    if (pending) this._write(...pending);
  }
  this._readPlain();
};

T._onError = function (err) {
  if (this.destroyed) return;
  // a server's handshake failures go to the server, not the socket
  if (this._tlsOptions.isServer && !this._secureEstablished) {
    this.destroy();
    this.server.emit('tlsClientError', err, this);
  } else this.destroy(err);
};

T._flushCipher = function (callback) {
  const data = this._conn ? connTake(this._conn) : null;
  if (data && !this._parent.destroyed && !this._parent.writableEnded) return this._parent.write(data, callback);
  if (callback) callback();
  return true;
};

T._onCipher = function (data) {
  if (!this._conn) return;
  this._unrefTimer();
  connFeed(this._conn, data);
  this._cycle();
};

// a push per record, until the reader has enough
T._readPlain = function () {
  while (this._conn) {
    const data = connRead(this._conn);
    this._flushCipher();
    if (data === 0) return;
    if (data === 1) {
      this.push(null);
      return this.read(0);
    }
    if (data === -1) return this._onError(sslError());
    this._bytesRead += data.length;
    if (!this.push(data)) return this._parent.pause();
  }
};

// a connection ending before the handshake is an error, a server's goes to its 'tlsClientError'
T._onCipherEnd = function () {
  if (this._secureEstablished) {
    this.push(null);
    return this.read(0);
  }
  if (this._tlsOptions.isServer) return this._onError(codedError(Error, 'ECONNRESET', 'socket hang up'));
  const err = codedError(Error, 'ECONNRESET', 'Client network socket disconnected before secure TLS connection was established');
  err.host = this._tlsOptions.host;
  err.port = this._tlsOptions.port;
  this.destroy(err);
};

T._read = function () {
  if (!this._conn) return;
  this._parent.resume();
  if (this._secureEstablished) this._readPlain();
};

// writes before the handshake wait for it
T._write = function (chunk, encoding, callback) {
  if (!this._secureEstablished) {
    this._pendingWrite = [ chunk, encoding, callback ];
    return;
  }
  if (!this._conn) return callback(errSocketClosed());
  const data = typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk;
  this._unrefTimer();
  this._bytesWritten += data.length;
  if (!connWrite(this._conn, data)) return callback(sslError());
  this._flushCipher(err => callback(err ?? null));
};

T._writev = function (chunks, callback) {
  this._write(Buffer.concat(chunks.map(x => typeof x.chunk === 'string' ? Buffer.from(x.chunk, x.encoding) : x.chunk)), 'buffer', callback);
};

T._final = function (callback) {
  if (!this._secureEstablished) return this.once('secure', () => this._final(callback));
  connShutdown(this._conn);
  this._flushCipher();
  this._parent.end();
  callback();
};

T._destroy = function (err, callback) {
  this._pendingWrite?.[2](errSocketClosed());
  this._pendingWrite = null;
  clearTimeout(this._timer);
  if (this._conn) connFree(this._conn);
  this._conn = 0;
  callback(err);
  this._parent.destroy();
  nextTick(() => this.emit('close', !!err));
};

T.getPeerCertificate = function () {
  if (!this._conn) return null;
  const der = connPeerCert(this._conn);
  return der ? peerCertificate(der) : {};
};

T.getProtocol = function () {
  return this._conn ? connInfo(this._conn, 1) : null;
};

T.getCipher = function () {
  if (!this._conn) return undefined;
  return { name: connInfo(this._conn, 2), standardName: connInfo(this._conn, 3), version: connInfo(this._conn, 4) };
};

for (const name of [ 'setNoDelay', 'setKeepAlive', 'ref', 'unref' ]) {
  T[name] = function (...args) {
    this._parent[name](...args);
    return this;
  };
}

T.address = function () {
  return this._parent.address();
};

for (const name of [ 'remoteAddress', 'remoteFamily', 'remotePort', 'localAddress', 'localPort', 'localFamily' ]) {
  Object.defineProperty(T, name, { get() { return this._parent[name]; }, configurable: true });
}

function onClientSecure(socket) {
  const options = socket._tlsOptions;
  let err = verifyError(connVerify(socket._conn));
  if (!err) {
    const hostname = options.servername || options.host || 'localhost';
    err = options.checkServerIdentity ? options.checkServerIdentity(hostname, socket.getPeerCertificate()) : checkIdentity(hostname, connPeerCert(socket._conn));
  }
  if (err) {
    socket.authorizationError = err.code || err.message;
    if (options.rejectUnauthorized) return socket.destroy(err);
  } else socket.authorized = true;
  socket.emit('secure');
  socket.emit('secureConnect');
}

function onServerSecure(socket) {
  socket.setTimeout(0, onHandshakeTimeout);
  if (socket._tlsOptions.requestCert) {
    const err = verifyError(connVerify(socket._conn));
    if (err) {
      socket.authorizationError = err.code;
      if (socket._tlsOptions.rejectUnauthorized) return socket.destroy();
    } else socket.authorized = true;
  }
  socket.emit('secure');
  socket.server.emit('secureConnection', socket);
}

function onHandshakeTimeout() {
  this._onError(codedError(Error, 'ERR_TLS_HANDSHAKE_TIMEOUT', 'TLS handshake timeout'));
}

// (options[, callback]) or (port[, host][, options][, callback])
export const connect = (...args) => {
  const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
  let options = typeof args[0] === 'object' ? { ...args[0] } : { port: args[0], ...(typeof args[1] === 'string' ? { host: args[1], ...args[2] } : args[1]) };
  options = { rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0', ...options, isServer: false };
  options.rejectUnauthorized = options.rejectUnauthorized !== false;
  const socket = options.socket ?? net.connect(options.path ? { path: options.path } : { ...options, host: options.host ?? 'localhost' });
  const tlsSocket = new TLSSocket(socket, options);
  if (callback) tlsSocket.once('secureConnect', callback);
  if (options.timeout) tlsSocket.setTimeout(options.timeout);
  if (!tlsSocket.connecting) tlsSocket._cycle();
  return tlsSocket;
};

function tlsConnectionListener(rawSocket) {
  const socket = new TLSSocket(rawSocket, {
    isServer: true, server: this, context: this._context, requestCert: this.requestCert, rejectUnauthorized: this.rejectUnauthorized, ALPNProtocols: this.ALPNProtocols
  });
  socket.setTimeout(this._handshakeTimeout, onHandshakeTimeout);
}

export function Server(options, listener) {
  if (!(this instanceof Server)) return new Server(options, listener);
  if (typeof options === 'function') {
    listener = options;
    options = {};
  }
  options ??= {};
  net.Server.call(this, options, tlsConnectionListener);
  this._options = options;
  this._context = contextOf(options, true);
  this._handshakeTimeout = options.handshakeTimeout ?? 120000;
  this.requestCert = options.requestCert === true;
  this.rejectUnauthorized = options.rejectUnauthorized !== false;
  this.ALPNProtocols = options.ALPNProtocols;
  if (listener) this.on('secureConnection', listener);
}
Object.setPrototypeOf(Server.prototype, net.Server.prototype);
Object.setPrototypeOf(Server, net.Server);

// the context goes when the server closes, a new one if it listens again
Server.prototype.listen = function (...args) {
  this._context ||= contextOf(this._options, true);
  return net.Server.prototype.listen.apply(this, args);
};

Server.prototype.close = function (callback) {
  if (this._context) ctxFree(this._context);
  this._context = 0;
  return net.Server.prototype.close.call(this, callback);
};

export const createServer = (options, listener) => new Server(options, listener);

export const checkServerIdentity = (hostname, cert) => checkIdentity(hostname, cert.raw);

export const DEFAULT_MIN_VERSION = 'TLSv1.2', DEFAULT_MAX_VERSION = 'TLSv1.3';

export default { TLSSocket, Server, connect, createServer, checkServerIdentity, DEFAULT_MIN_VERSION, DEFAULT_MAX_VERSION };
