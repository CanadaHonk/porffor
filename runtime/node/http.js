import { EventEmitter } from './events.js';
import { Buffer } from './buffer.js';
import { Stream, Readable, finished } from './stream.js';
import * as net from './net.js';
import { URL } from './url.js';
import { STATUS_CODES } from './internal/status.js';
import { nextTick } from './internal/loop.js';
import { setTimeout, clearTimeout, setInterval, clearInterval } from './timers.js';
import { HTTPParser, SKIP_BODY, STOP, METHODS, isToken, isFieldValue } from './internal/http-parser.js';
import { isIP } from './internal/ip.js';
import { uvException, uvExceptionWithHostPort } from './internal/uv.js';
import * as uws from './internal/uws.js';
import {
  errHttpHeadersSent, errHttpInvalidHeaderValue, errInvalidHttpToken, errInvalidChar, errHttpInvalidStatusCode, errInvalidProtocol, errStreamWriteAfterEnd,
  errStreamDestroyed, errStreamNullValues, errStreamAlreadyFinished, errInvalidArgType, errUnescapedCharacters, errHttpRequestTimeout, errOutOfRange,
  errMethodNotImplemented, abortError, errServerNotRunning, errServerAlreadyListen, validatePort
} from './internal/errors.js';
import { validateNumber } from './internal/validators.js';

export { METHODS, STATUS_CODES };

export const maxHeaderSize = 16384;

export const validateHeaderName = (name, label = 'Header name') => {
  if (typeof name !== 'string' || !isToken(name)) throw errInvalidHttpToken(label, name);
};

export const validateHeaderValue = (name, value) => {
  if (value === undefined) throw errHttpInvalidHeaderValue(value, name);
  if (!isFieldValue(`${value}`)) throw errInvalidChar('header content', name);
};

export const connResetException = message => {
  const err = new Error(message);
  err.code = 'ECONNRESET';
  return err;
};

const RE_CONN_CLOSE = /(?:^|\W)close(?:$|\W)/i;
const RE_TE_CHUNKED = /(?:^|\W)chunked(?:$|\W)/i;
const INVALID_PATH_REGEX = /[^!-ÿ]/;

// one formatted date per second
let dateCache = '', dateSecond = -1;
const utcDate = () => {
  const now = Date.now();
  const second = Math.floor(now / 1000);
  if (second !== dateSecond) {
    dateSecond = second;
    dateCache = new Date(now).toUTCString();
  }
  return dateCache;
};

// duplicates of these keep the first value
const singleValueHeaders = new Set([
  'age', 'authorization', 'content-length', 'content-type', 'etag', 'expires', 'from', 'host', 'if-modified-since',
  'if-unmodified-since', 'last-modified', 'location', 'max-forwards', 'proxy-authorization', 'referer', 'retry-after', 'server', 'user-agent'
]);

export function IncomingMessage(socket) {
  Readable.call(this, socket ? { highWaterMark: socket.readableHighWaterMark } : undefined);
  this._readableState.readingMore = true;
  this.socket = socket;
  this.httpVersionMajor = null;
  this.httpVersionMinor = null;
  this.httpVersion = null;
  this.complete = false;
  this._headers = null;
  this._rawHeaders = [];
  // uWebSockets requests: "name\0value\0..." until rawHeaders is read
  this._rawBlob = null;
  // trailers aren't parsed, a message has none
  this.trailers = {};
  this.rawTrailers = [];
  this.aborted = false;
  this.upgrade = null;
  this.url = '';
  this.method = null;
  this.statusCode = null;
  this.statusMessage = null;
  this._consuming = false;
  this._dumped = false;
}
Object.setPrototypeOf(IncomingMessage.prototype, Readable.prototype);
Object.setPrototypeOf(IncomingMessage, Readable);

const I = IncomingMessage.prototype;

Object.defineProperty(I, 'rawHeaders', {
  get() {
    if (this._rawBlob !== null) {
      this._rawHeaders = this._rawBlob.split('\0');
      this._rawHeaders.pop();
      this._rawBlob = null;
    }
    return this._rawHeaders;
  },
  configurable: true
});

// node's matchKnownFields: single value fields drop duplicates, set-cookie collects, cookie joins with '; ', the rest with ', '
Object.defineProperty(I, 'headers', {
  get() {
    if (this._headers) return this._headers;
    const raw = this.rawHeaders, headers = this._headers = {};
    for (let i = 0; i < raw.length; i += 2) {
      const field = raw[i].toLowerCase(), value = raw[i + 1];
      if (field === 'set-cookie') (headers[field] ??= []).push(value);
        else if (singleValueHeaders.has(field)) headers[field] ??= value;
        else if (typeof headers[field] === 'string') headers[field] += (field === 'cookie' ? '; ' : ', ') + value;
        else headers[field] = value;
    }
    return headers;
  },
  set(value) {
    this._headers = value;
  },
  configurable: true
});

const connection = {
  get() { return this.socket; },
  set(value) { this.socket = value; },
  configurable: true
};
Object.defineProperty(I, 'connection', connection);

I.setTimeout = function (ms, callback) {
  if (callback) this.on('timeout', callback);
  this.socket.setTimeout(ms);
  return this;
};

I._read = function () {
  if (!this._consuming) {
    this._readableState.readingMore = false;
    this._consuming = true;
  }
  if (this.socket?.readable) this.socket.resume();
};

I._destroy = function (err, callback) {
  if (!this.readableEnded || !this.complete) {
    this.aborted = true;
    this.emit('aborted');
  }
  // the error only surfaces if someone listens for it
  const done = e => nextTick(() => callback(this.listenerCount('error') === 0 ? undefined : e));
  if (this.socket && !this.socket.destroyed && this.aborted) {
    this.socket.destroy(err);
    const cleanup = finished(this.socket, e => {
      cleanup();
      done(e?.code === 'ERR_STREAM_PREMATURE_CLOSE' ? err : e || err);
    });
  } else done(err);
};

// discard an unread body so the connection can carry on
I._dump = function () {
  if (this._dumped) return;
  this._dumped = true;
  this.removeAllListeners('data');
  this.resume();
};

export function OutgoingMessage() {
  Stream.call(this);
  this.outputData = [];
  this.outputSize = 0;
  this.writable = true;
  this.destroyed = false;
  this._last = false;
  this.chunkedEncoding = false;
  this.shouldKeepAlive = true;
  this._defaultKeepAlive = true;
  this.useChunkedEncodingByDefault = true;
  this.sendDate = false;
  this._removedConnection = false;
  this._removedContLen = false;
  this._removedTE = false;
  this._contentLength = null;
  this._hasBody = true;
  this._needDrain = false;
  this.finished = false;
  this._finishEmitted = false;
  this._headerSent = false;
  this.socket = null;
  this._header = null;
  this._outHeaders = null;
  this._closed = false;
  this._keepAliveTimeout = 0;
}
Object.setPrototypeOf(OutgoingMessage.prototype, Stream.prototype);
Object.setPrototypeOf(OutgoingMessage, Stream);

const O = OutgoingMessage.prototype;

const outgoingGetters = {
  writableFinished() { return this._finishEmitted; },
  writableEnded() { return this.finished; },
  writableLength() { return this.outputSize + (this.socket ? this.socket.writableLength : 0); },
  writableHighWaterMark() { return this.socket ? this.socket.writableHighWaterMark : 16384; },
  writableNeedDrain() { return !this.destroyed && !this.finished && this._needDrain; },
  headersSent() { return !!this._header; }
};
for (const name of Object.keys(outgoingGetters)) Object.defineProperty(O, name, { get: outgoingGetters[name], configurable: true });

Object.defineProperty(O, 'connection', connection);

O.setTimeout = function (ms, callback) {
  if (callback) this.on('timeout', callback);
  if (this.socket) this.socket.setTimeout(ms);
    else this.once('socket', socket => socket.setTimeout(ms));
  return this;
};

O.cork = function () {
  this.socket?.cork();
};

O.uncork = function () {
  this.socket?.uncork();
};

O.destroy = function (err) {
  if (this.destroyed) return this;
  this.destroyed = true;
  if (this.socket) this.socket.destroy(err);
  else {
    this.once('socket', socket => socket.destroy(err));
    nextTick(() => {
      this._closed = true;
      this.emit('close');
    });
  }
  return this;
};

O.setHeader = function (name, value) {
  if (this._header) throw errHttpHeadersSent('set');
  validateHeaderName(name);
  validateHeaderValue(name, value);
  (this._outHeaders ??= Object.create(null))[name.toLowerCase()] = [ name, value ];
  return this;
};

O.appendHeader = function (name, value) {
  const existing = this.getHeader(name);
  if (existing === undefined) return this.setHeader(name, value);
  if (this._header) throw errHttpHeadersSent('append');
  validateHeaderName(name);
  validateHeaderValue(name, value);
  this._outHeaders[name.toLowerCase()][1] = [ ...[ existing ].flat(), ...[ value ].flat() ];
  return this;
};

O.getHeader = function (name) {
  return this._outHeaders?.[name.toLowerCase()]?.[1];
};

O.getHeaderNames = function () {
  return this._outHeaders !== null ? Object.keys(this._outHeaders) : [];
};

O.getHeaders = function () {
  const out = Object.create(null);
  for (const key of this.getHeaderNames()) out[key] = this._outHeaders[key][1];
  return out;
};

O.hasHeader = function (name) {
  return !!this._outHeaders?.[name.toLowerCase()];
};

O.removeHeader = function (name) {
  if (this._header) throw errHttpHeadersSent('remove');
  const key = name.toLowerCase();
  if (key === 'connection') this._removedConnection = true;
    else if (key === 'content-length') this._removedContLen = true;
    else if (key === 'transfer-encoding') this._removedTE = true;
    else if (key === 'date') this.sendDate = false;
  if (this._outHeaders !== null) delete this._outHeaders[key];
};

O._implicitHeader = function () {
  throw errMethodNotImplemented('_implicitHeader()');
};

O.flushHeaders = function () {
  if (!this._header) this._implicitHeader();
  this._send('');
};

// node's matchHeader: what the caller's own headers say about framing
const storeHeader = (msg, state, key, value, validate) => {
  if (validate) validateHeaderValue(key, value);
  state.header += key + ': ' + value + '\r\n';
  if (key.length < 4 || key.length > 17) return;
  const field = key.toLowerCase();
  if (field === 'connection') {
    state.connection = true;
    msg._removedConnection = false;
    if (RE_CONN_CLOSE.test(value)) msg._last = true;
      else msg.shouldKeepAlive = true;
  } else if (field === 'transfer-encoding') {
    state.te = true;
    msg._removedTE = false;
    if (RE_TE_CHUNKED.test(value)) msg.chunkedEncoding = true;
  } else if (field === 'content-length') {
    state.contLen = true;
    msg._contentLength = +value;
    msg._removedContLen = false;
  } else if (field === 'date' || field === 'expect') state[field] = true;
  else if (field === 'keep-alive') msg._defaultKeepAlive = false;
};

const processHeader = (msg, state, key, value, validate) => {
  if (validate) validateHeaderName(key);
  if (!Array.isArray(value)) storeHeader(msg, state, key, value, validate);
    else if (value.length > 1 && key.toLowerCase() === 'cookie') storeHeader(msg, state, key, value.join('; '), validate);
    else for (const v of value) storeHeader(msg, state, key, v, validate);
};

// fn(name, value, validate) per header, setHeader's own are already validated
const eachHeader = (headers, outHeaders, fn) => {
  if (headers === outHeaders) {
    for (const key in headers) fn(headers[key][0], headers[key][1], false);
  } else if (Array.isArray(headers)) {
    if (Array.isArray(headers[0])) for (const entry of headers) fn(entry[0], entry[1], true);
      else for (let i = 0; i < headers.length; i += 2) fn(headers[i], headers[i + 1], true);
  } else if (headers) {
    for (const key of Object.keys(headers)) fn(key, headers[key], true);
  }
};

// the header block: first line, the given headers, then the framing node adds by default
O._storeHeader = function (firstLine, headers) {
  const state = { connection: false, contLen: false, te: false, date: false, expect: false, header: firstLine };
  eachHeader(headers, this._outHeaders, (key, value, validate) => processHeader(this, state, key, value, validate));

  let header = state.header;
  if (this.sendDate && !state.date) header += 'Date: ' + utcDate() + '\r\n';

  // no body, so no zero chunk either: close instead
  if (this.chunkedEncoding && (this.statusCode === 204 || this.statusCode === 304)) {
    this.chunkedEncoding = false;
    this.shouldKeepAlive = false;
  }

  if (this._removedConnection) this._last = !this.shouldKeepAlive;
  else if (!state.connection) {
    if (this.shouldKeepAlive && (state.contLen || this.useChunkedEncodingByDefault || this.agent)) {
      header += 'Connection: keep-alive\r\n';
      if (this._keepAliveTimeout && this._defaultKeepAlive) header += `Keep-Alive: timeout=${Math.floor(this._keepAliveTimeout / 1000)}\r\n`;
    } else {
      this._last = true;
      header += 'Connection: close\r\n';
    }
  }

  if (!state.contLen && !state.te) {
    if (!this._hasBody) this.chunkedEncoding = false;
    else if (!this.useChunkedEncodingByDefault) this._last = true;
    else if (!this._removedContLen && typeof this._contentLength === 'number') header += 'Content-Length: ' + this._contentLength + '\r\n';
    else if (!this._removedTE) {
      header += 'Transfer-Encoding: chunked\r\n';
      this.chunkedEncoding = true;
    } else this._last = true;
  }

  this._header = header + '\r\n';
  this._headerSent = false;
  // the peer waits for these before the body
  if (state.expect) this._send('');
};

// raw bytes to the socket, queued until there is one
O._writeRaw = function (data, encoding, callback) {
  const socket = this.socket;
  if (socket?.destroyed) return false;
  if (socket && socket._httpMessage === this && socket.writable) {
    if (this.outputData.length > 0) this._flushOutput(socket);
    return socket.write(data, encoding, callback);
  }
  this.outputData.push({ data, encoding, callback });
  this.outputSize += data.length;
  return this.outputSize < this.writableHighWaterMark;
};

O._send = function (data, encoding, callback) {
  if (!this._headerSent && this._header !== null) {
    if (typeof data === 'string' && (encoding === 'utf8' || encoding === 'latin1' || !encoding)) data = this._header + data;
    else {
      this.outputData.unshift({ data: this._header, encoding: 'latin1', callback: null });
      this.outputSize += this._header.length;
    }
    this._headerSent = true;
  }
  return this._writeRaw(data, encoding, callback);
};

O._flushOutput = function (socket) {
  const data = this.outputData;
  if (data.length === 0) return true;
  this.outputData = [];
  this.outputSize = 0;
  socket.cork();
  let ret = true;
  for (const x of data) ret = socket.write(x.data, x.encoding, x.callback ?? undefined);
  socket.uncork();
  return ret;
};

O._flush = function () {
  const socket = this.socket;
  if (socket?.writable && this._flushOutput(socket) && this._needDrain && !this.finished) {
    this._needDrain = false;
    this.emit('drain');
  }
};

const byteLength = (chunk, encoding) => typeof chunk === 'string' ? Buffer.byteLength(chunk, encoding) : chunk.byteLength;

const writeChunk = (msg, chunk, encoding, callback, fromEnd) => {
  if (chunk === null) throw errStreamNullValues();
  if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) throw errInvalidArgType('chunk', [ 'string', 'Buffer', 'Uint8Array' ], chunk);
  if (msg.finished || msg.destroyed) {
    const err = msg.finished ? errStreamWriteAfterEnd() : errStreamDestroyed('write');
    const destroyed = msg.destroyed;
    nextTick(() => {
      callback?.(err);
      if (!destroyed) msg.emit('error', err);
    });
    return false;
  }

  if (!msg._header) {
    if (fromEnd) msg._contentLength = byteLength(chunk, encoding);
    msg._implicitHeader();
  }
  if (!msg._hasBody) {
    if (callback) nextTick(callback);
    return true;
  }

  // corked till the next tick so small writes go out together
  const socket = msg.socket;
  if (!fromEnd && socket && !socket.writableCorked) {
    socket.cork();
    nextTick(() => socket.uncork());
  }

  const length = byteLength(chunk, encoding);
  if (!msg.chunkedEncoding || length === 0) return msg._send(chunk, encoding, callback);
  msg._send(length.toString(16) + '\r\n', 'latin1', null);
  msg._send(chunk, encoding, null);
  return msg._send('\r\n', 'latin1', callback);
};

O.write = function (chunk, encoding, callback) {
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }
  const ret = writeChunk(this, chunk, encoding, callback, false);
  if (!ret) this._needDrain = true;
  return ret;
};

O.end = function (chunk, encoding, callback) {
  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }

  if (this.finished) {
    if (chunk) writeChunk(this, chunk, encoding, callback, true);
      else if (typeof callback === 'function') {
        if (this._finishEmitted) nextTick(callback, errStreamAlreadyFinished('end'));
          else this.once('finish', callback);
      }
    return this;
  }

  this.socket?.cork();
  if (chunk) writeChunk(this, chunk, encoding, null, true);
  else if (!this._header) {
    this._contentLength = 0;
    this._implicitHeader();
  }
  if (typeof callback === 'function') this.once('finish', callback);

  const finish = err => {
    if (err || this.socket?.errored || this.socket?._hadError) return;
    this._finishEmitted = true;
    this.emit('finish');
  };
  if (this._hasBody && this.chunkedEncoding) this._send('0\r\n\r\n', 'latin1', finish);
    else if (!this._headerSent || this.writableLength || chunk) this._send('', 'latin1', finish);
    else nextTick(finish);

  if (this.socket) {
    this.socket._writableState.corked = 1;
    this.socket.uncork();
  }
  this.finished = true;
  return this;
};

export function ServerResponse(req) {
  OutgoingMessage.call(this);
  if (req.method === 'HEAD') this._hasBody = false;
  this.req = req;
  this.sendDate = true;
  this._sent100 = false;
  this._expect_continue = false;
  if (req.httpVersionMajor < 1 || req.httpVersionMinor < 1) {
    this.useChunkedEncodingByDefault = RE_TE_CHUNKED.test(req.headers.te ?? '');
    this.shouldKeepAlive = false;
  }
}
Object.setPrototypeOf(ServerResponse.prototype, OutgoingMessage.prototype);
Object.setPrototypeOf(ServerResponse, OutgoingMessage);

const R = ServerResponse.prototype;
R.statusCode = 200;
R.statusMessage = undefined;

function onServerResponseClose() {
  const res = this._httpMessage;
  if (res) {
    res.destroyed = true;
    res._closed = true;
    res.emit('close');
  }
}

R.assignSocket = function (socket) {
  socket._httpMessage = this;
  socket.on('close', onServerResponseClose);
  this.socket = socket;
  this.emit('socket', socket);
  this._flush();
};

R.detachSocket = function (socket) {
  socket.removeListener('close', onServerResponseClose);
  socket._httpMessage = null;
  this.socket = null;
};

R.writeContinue = function (callback) {
  this._writeRaw('HTTP/1.1 100 Continue\r\n\r\n', 'ascii', callback);
  this._sent100 = true;
};

R._implicitHeader = function () {
  this.writeHead(this.statusCode);
};

R.writeHead = function (statusCode, reason, obj) {
  if (this._header) throw errHttpHeadersSent('write');
  const original = statusCode;
  statusCode |= 0;
  if (statusCode < 100 || statusCode > 999) throw errHttpInvalidStatusCode(original);
  if (typeof reason === 'string') this.statusMessage = reason;
  else {
    this.statusMessage ||= STATUS_CODES[statusCode] || 'unknown';
    obj ??= reason;
  }
  this.statusCode = statusCode;

  let headers = obj;
  if (this._outHeaders) {
    // flat [ name, value, ... ] pairs add up, an object's replace
    if (Array.isArray(obj)) {
      const merged = {};
      for (let i = 0; i < obj.length; i += 2) (merged[obj[i]] ??= []).push(obj[i + 1]);
      obj = merged;
    }
    for (const key of Object.keys(obj ?? {})) if (key) this.setHeader(key, obj[key]);
    headers = this._outHeaders;
  }

  if (!isFieldValue(String(this.statusMessage)) || /[\r\n]/.test(this.statusMessage)) throw errInvalidChar('statusMessage');
  if (statusCode === 204 || statusCode === 304 || statusCode < 200) this._hasBody = false;
  if (this._expect_continue && !this._sent100) this.shouldKeepAlive = false;

  this._storeHeader(`HTTP/1.1 ${statusCode} ${this.statusMessage}\r\n`, headers);
  return this;
};

export function Server(options, requestListener) {
  if (!(this instanceof Server)) return new Server(options, requestListener);
  if (typeof options === 'function') {
    requestListener = options;
    options = {};
  }
  EventEmitter.call(this);
  _storeHttpOptions(this, options ?? {}, requestListener);
}
Object.setPrototypeOf(Server.prototype, net.Server.prototype);
Object.setPrototypeOf(Server, net.Server);

// shared by http and https servers
export const _storeHttpOptions = (server, options, requestListener) => {
  if (requestListener) server.on('request', requestListener);
  server.IncomingMessage = options.IncomingMessage ?? IncomingMessage;
  server.ServerResponse = options.ServerResponse ?? ServerResponse;
  server.maxHeaderSize = options.maxHeaderSize ?? maxHeaderSize;
  server.requestTimeout = options.requestTimeout ?? 300000;
  server.headersTimeout = options.headersTimeout ?? Math.min(60000, server.requestTimeout);
  server.keepAliveTimeout = options.keepAliveTimeout ?? 5000;
  server.connectionsCheckingInterval = options.connectionsCheckingInterval ?? 30000;
  server.maxRequestsPerSocket = 0;
  server.noDelay = options.noDelay ?? true;
  server.requireHostHeader = options.requireHostHeader ?? true;
  server.httpAllowHalfOpen = false;
  server.timeout = 0;
  server._secure = false;
  server._app = -1;
  server._listen = null;
  server._closing = false;
  server._ref = true;
  server._sockets = new Set();
  // keep-alive connections waiting for their next request, oldest first
  server._idle = new Set();
  server._idleTimer = null;
  server._connectionsCheck = null;
};

const S = Server.prototype;

S.listen = function (...args) {
  const [ options, callback ] = net._normalizeArgs(args);
  if (this._listen) throw errServerAlreadyListen();
  if (callback !== null) this.once('listening', callback);
  const path = options.port === undefined ? options.path : undefined;
  const host = options.host ?? '';
  const port = path === undefined ? validatePort(options.port ?? 0, 'options.port') : 0;

  if (this._app === -1) this._app = uws.createApp(false, this);
    else uws.adopt(this._app, this);
  uws.maxHeaderSize(this.maxHeaderSize);
  const bound = uws.listen(this._app, host === '::' || host === '0.0.0.0' ? '' : host, port, path);
  if (bound < 0) {
    const err = path === undefined ? uvExceptionWithHostPort(bound, 'listen', host || '::', port) : uvException(bound, 'listen', path);
    nextTick(() => this.emit('error', err));
    return this;
  }
  this._listen = { host, port: bound, path };
  if (!this._ref) uws.ref(this._app, 0);
  if (this.headersTimeout > 0 || this.requestTimeout > 0) this._connectionsCheck = setInterval(checkConnections, this.connectionsCheckingInterval, this).unref();
  nextTick(() => {
    if (this._listen) this.emit('listening');
  });
  return this;
};

S.address = function () {
  if (!this._listen) return null;
  const { host, port, path } = this._listen;
  if (path !== undefined) return path;
  const address = host || '::';
  return { address, family: isIP(address) === 4 ? 'IPv4' : 'IPv6', port };
};

Object.defineProperty(S, 'listening', {
  get() { return !!this._listen; },
  configurable: true
});

S.setTimeout = function (ms, callback) {
  this.timeout = ms;
  if (callback) this.on('timeout', callback);
  return this;
};

// stops listening, the server closes once its last connection has
S.close = function (callback) {
  if (!this._listen) {
    if (typeof callback === 'function') this.once('close', () => callback(errServerNotRunning()));
    nextTick(() => this.emit('close'));
    return this;
  }
  if (typeof callback === 'function') this.once('close', callback);
  uws.close(this._app);
  this._listen = null;
  this._closing = true;
  clearInterval(this._connectionsCheck);
  this.closeIdleConnections();
  this._maybeClosed();
  return this;
};

S._maybeClosed = function () {
  if (!this._closing || this._sockets.size > 0) return;
  this._closing = false;
  uws.adopt(this._app, undefined);
  nextTick(() => this.emit('close'));
};

// idle connections end after what they still have to send
S.closeIdleConnections = function () {
  for (const socket of this._sockets) {
    if (!socket._httpMessage) socket.end();
  }
};

S.closeAllConnections = function () {
  for (const socket of this._sockets) socket.destroy();
};

S.getConnections = function (callback) {
  nextTick(callback, null, this._sockets.size);
  return this;
};

S.ref = function () {
  this._ref = true;
  if (this._listen) uws.ref(this._app, 1);
  return this;
};

S.unref = function () {
  this._ref = false;
  if (this._listen) uws.ref(this._app, 0);
  return this;
};

S._uwsConnection = function (conn) {
  const socket = new ServerSocket(this, conn);
  this._sockets.add(socket);
  if (this.timeout) socket.setTimeout(this.timeout);
  this.emit('connection', socket);
  return socket;
};

// requests and responses skip their constructors (express swaps their prototypes), uWebSockets state keyed by _slot
const REQ_STATE = {
  httpVersion: '1.1', httpVersionMajor: 1, httpVersionMinor: 1, complete: false, _rawHeaders: null, _rawBlob: null, aborted: false, upgrade: false,
  statusCode: null, statusMessage: null, _consuming: false, _dumped: false, _headers: null
};

const RES_STATE = {
  outputSize: 0, writable: true, destroyed: false, _last: false, chunkedEncoding: false, shouldKeepAlive: true,
  _defaultKeepAlive: true, useChunkedEncodingByDefault: true, sendDate: true, _removedConnection: false, _removedContLen: false,
  _removedTE: false, _contentLength: null, _hasBody: true, finished: false, _headerSent: false, _closed: false, _header: null,
  _outHeaders: null, _keepAliveTimeout: 0, _needDrain: false, statusCode: 200, statusMessage: undefined, _sent100: false, _expect_continue: false,
  _status: '', _list: null, _buffered: null, _bytesWritten: 0, _finishEmitted: false, _total: -1, _closeConnection: false, _requestDone: true, _responseDone: false
};

const HAS_BODY = 1, UPGRADE = 2, CLOSE_REQUESTED = 4, HTTP_1_0 = 8, NO_HOST = 16;

S._uwsRequest = function (socket, slot, method, url, raw, flags) {
  const hasBody = (flags & HAS_BODY) !== 0;
  this._idle.delete(socket);
  socket._requests++;
  socket._timer?.refresh();

  const req = this.IncomingMessage === IncomingMessage ? Object.create(I) : new this.IncomingMessage(socket);
  Object.assign(req, REQ_STATE);
  req.trailers = {};
  req.rawTrailers = [];
  req.socket = socket;
  req.method = method;
  req.url = url;
  req._rawBlob = raw;
  req._hasBody = hasBody;
  req.complete = !hasBody;
  if ((flags & HTTP_1_0) !== 0) {
    req.httpVersion = '1.0';
    req.httpVersionMinor = 0;
  }
  req._response = null;
  if (!hasBody && this.IncomingMessage !== IncomingMessage) req.push(null);

  if ((flags & UPGRADE) !== 0) {
    const event = method === 'CONNECT' ? 'connect' : 'upgrade';
    if (this.listenerCount(event) > 0) return upgrade(this, socket, slot, req, event);
    if (event === 'connect') {
      uws.release(slot);
      return socket.destroy();
    }
  }

  const res = this.ServerResponse === ServerResponse ? Object.create(R) : new this.ServerResponse(req);
  Object.assign(res, RES_STATE);
  res.outputData = [];
  res._server = this;
  res._slot = slot;
  res.socket = socket;
  res.req = req;
  req._response = res;
  if (method === 'HEAD') res._hasBody = false;
  if (hasBody) {
    res._requestDone = false;
    socket._requestAt = performance.now();
  }
  if ((flags & CLOSE_REQUESTED) !== 0 || (this.maxRequestsPerSocket > 0 && socket._requests >= this.maxRequestsPerSocket)) res.shouldKeepAlive = false;
  socket._httpMessage = res;
  uws.own(slot, res);

  if ((flags & (NO_HOST | HTTP_1_0)) === NO_HOST && this.requireHostHeader) {
    res.writeHead(400, [ 'Connection', 'close' ]);
    return res.end();
  }

  if (hasBody && /(?:^|\W)100-continue(?:$|\W)/i.test(req.headers.expect ?? '')) {
    if (this.listenerCount('checkContinue') > 0) return this.emit('checkContinue', req, res);
    res._expect_continue = true;
    res.writeContinue();
  }
  this.emit('request', req, res);
};

// the connection leaves uWebSockets for a net socket of its own (tls ones can't, their session is uSockets')
const upgrade = (server, socket, slot, req, event) => {
  const detached = uws.detach(slot);
  if (detached === null) {
    uws.release(slot);
    return socket.destroy();
  }
  server._sockets.delete(socket);
  socket._forget();
  const raw = new net.Socket({ fd: detached.fd, allowHalfOpen: true });
  raw.server = server;
  raw.parser = null;
  req.socket = raw;
  req.upgrade = true;
  server.emit(event, req, raw, Object.setPrototypeOf(detached.head, Buffer.prototype));
};

// keep-alive connections close keepAliveTimeout (and a second of slack) after their last response
const idleTimeout = server => {
  server._idleTimer = null;
  const now = performance.now();
  for (const socket of server._idle) {
    const left = socket._idleAt + server.keepAliveTimeout + 1000 - now;
    if (left > 0) {
      server._idleTimer = setTimeout(idleTimeout, left, server).unref();
      return;
    }
    server._idle.delete(socket);
    socket.destroy();
  }
};

// headersTimeout and requestTimeout for connections mid-request
const checkConnections = server => {
  const now = performance.now(), { headersTimeout, requestTimeout } = server;
  for (const socket of server._sockets) {
    const receiving = socket._httpMessage ? -1 : uws.receiving(socket._conn);
    if ((receiving >= 0 && ((headersTimeout > 0 && receiving > headersTimeout) || (requestTimeout > 0 && receiving > requestTimeout))) ||
      (requestTimeout > 0 && socket._requestAt > 0 && now - socket._requestAt > requestTimeout)) {
      socket._requestAt = 0;
      clientError(server, socket, errHttpRequestTimeout());
    }
  }
};

const errorResponse = status => `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`;

// uWebSockets' parser errors
const parseErrors = [
  null, [ 'HPE_INVALID_VERSION', 'Invalid HTTP version' ], [ 'HPE_HEADER_OVERFLOW', 'Header overflow' ], [ 'HPE_INVALID_HEADER_TOKEN', 'Invalid header token' ],
  [ 'HPE_UNEXPECTED_CONTENT_LENGTH', 'Duplicate Content-Length' ], [ 'HPE_INVALID_TRANSFER_ENCODING', 'Transfer-Encoding can\'t be present with Content-Length' ]
];

const clientError = (server, socket, err) => {
  if (typeof err === 'number') {
    const [ code, reason ] = parseErrors[err];
    err = new Error(`Parse Error: ${reason}`);
    err.code = code;
    err.reason = reason;
  }
  if (server.emit('clientError', err, socket)) return;
  if (!socket._httpMessage?._header) socket.write(errorResponse(err.code === 'HPE_HEADER_OVERFLOW' ? 431 : err.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? 408 : 400));
  socket.destroy();
};

function socketOnTimeout(socket) {
  const res = socket._httpMessage, req = res?.req;
  const reqTimeout = req && !req.complete && req.emit('timeout', socket);
  const resTimeout = res?.emit('timeout', socket);
  if (!reqTimeout && !resTimeout && !socket.server.emit('timeout', socket)) socket.destroy();
  socket.emit('timeout');
}

// a uWebSockets connection: what handlers see as req.socket and res.socket, and what 'connection' gives
class ServerSocket extends EventEmitter {
  constructor(server, conn) {
    super();
    this.server = server;
    this._conn = conn;
    this._httpMessage = null;
    this._remote = null;
    this._timer = null;
    this._requests = 0;
    this._requestAt = 0;
    this._idleAt = 0;
    this.destroyed = false;
    this.readable = true;
    this.writable = true;
    this.timeout = 0;
    this.bytesRead = 0;
    this.bytesWritten = 0;
    if (server._secure) this.encrypted = this._secureEstablished = true;
    uws.ownConn(conn, this);
  }

  _remoteInfo() {
    return this._remote ??= uws.remote(this._conn);
  }

  get remoteAddress() { return this._remoteInfo().address; }
  get remotePort() { return this._remoteInfo().port; }
  get remoteFamily() { return isIP(this._remoteInfo().address) === 6 ? 'IPv6' : 'IPv4'; }
  get localAddress() { return this.server._listen?.host || '::'; }
  get localPort() { return this.server._listen?.port; }
  get connecting() { return false; }
  get pending() { return false; }
  get readyState() { return this.destroyed ? 'closed' : 'open'; }
  get writableLength() { return 0; }
  get writableHighWaterMark() { return 16384; }

  address() {
    return { address: this.localAddress, family: isIP(this.localAddress) === 4 ? 'IPv4' : 'IPv6', port: this.localPort };
  }

  pause() {
    if (this._httpMessage) uws.pause(this._httpMessage._slot, 1);
    return this;
  }

  resume() {
    if (this._httpMessage) uws.pause(this._httpMessage._slot, 0);
    return this;
  }

  // raw bytes, past any response
  write(data, encoding, callback) {
    if (typeof encoding === 'function') callback = encoding;
    if (this.destroyed) return false;
    const chunk = toChunk(data, typeof encoding === 'string' ? encoding : null);
    this.bytesWritten += byteLength(chunk);
    uws.connWrite(this._conn, chunk);
    if (callback) nextTick(callback);
    return true;
  }

  end(data, encoding, callback) {
    if (typeof data === 'function') callback = data;
      else if (data != null) this.write(data, encoding);
    if (typeof encoding === 'function') callback = encoding;
    if (callback) this.once('close', callback);
    if (!this.destroyed) uws.connClose(this._conn, 1);
    return this;
  }

  destroy(err) {
    if (this.destroyed) return this;
    if (err && this.listenerCount('error') > 0) nextTick(() => this.emit('error', err));
    uws.connClose(this._conn, 0);
    return this;
  }

  setTimeout(ms, callback) {
    this.timeout = ms;
    if (callback) {
      if (ms === 0) this.removeListener('timeout', callback);
        else this.once('timeout', callback);
    }
    clearTimeout(this._timer);
    this._timer = ms > 0 ? setTimeout(socketOnTimeout, ms, this).unref() : null;
    return this;
  }

  // gone from uWebSockets, a request's response first
  _uwsClose() {
    this._forget();
    this.server._sockets.delete(this);
    nextTick(() => {
      this.emit('close', false);
      this.server._maybeClosed();
    });
  }

  _uwsClientError(err) {
    clientError(this.server, this, err);
  }

  _forget() {
    this.destroyed = true;
    this.readable = this.writable = false;
    clearTimeout(this._timer);
    this.server._idle.delete(this);
  }
}

const K = ServerSocket.prototype;
K.destroySoon = K.end;
for (const name of [ 'setNoDelay', 'setKeepAlive', 'ref', 'unref', 'cork', 'uncork' ]) K[name] = function () { return this; };

const setOwn = (obj, name, value) => Object.defineProperty(obj, name, { value, writable: true, enumerable: true, configurable: true });

// a request's readable side only exists once something uses it, client messages keep a plain property
Object.defineProperty(I, '_readableState', {
  get() {
    if (this._response === undefined) return undefined;
    const state = new Readable.ReadableState({}, this, false);
    state.readingMore = true;
    setOwn(this, '_readableState', state);
    if (!this._hasBody) this.push(null);
    return state;
  },
  set(value) { setOwn(this, '_readableState', value); },
  configurable: true
});

// uWebSockets versions of the response methods, installed on ServerResponse.prototype below
const U = {};

U._uwsData = function (chunk, last) {
  const req = this.req;
  if (chunk.length > 0 && !req.push(Object.setPrototypeOf(chunk, Buffer.prototype))) uws.pause(this._slot, 1);
  if (last) {
    this.socket._requestAt = 0;
    req.complete = true;
    req.push(null);
    this._requestDone = true;
    this._maybeRelease();
  }
};

// the connection closed (and closes the socket next)
U._uwsAborted = function () {
  this._requestDone = this._responseDone = true;
  this.socket._forget();
  const req = this.req;
  if (!req.complete || !this.finished) req.destroy(connResetException('aborted'));
  if (!this.finished) {
    this.destroyed = true;
    this._closed = true;
    this.emit('close');
  }
  this.socket._httpMessage = null;
  uws.release(this._slot);
};

U._uwsWritable = function () {
  if (this._needDrain) {
    this._needDrain = false;
    this.emit('drain');
  }
};

// the slot is reused once both sides are done with it, the connection waits for its next request
U._maybeRelease = function () {
  if (!this._requestDone || !this._responseDone) return;
  const socket = this.socket, server = this._server;
  socket._httpMessage = null;
  uws.release(this._slot);
  if (socket.destroyed || this._closeConnection || server.keepAliveTimeout <= 0) return;
  socket._idleAt = performance.now();
  server._idle.add(socket);
  server._idleTimer ??= setTimeout(idleTimeout, server.keepAliveTimeout + 1000, server).unref();
};

// keep what uWebSockets writes itself (framing and date) out of the header list
const own = new Set([ 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'date' ]);

U._storeHeader = function (firstLine, headers) {
  const list = [];
  eachHeader(headers, this._outHeaders, (name, value, validate) => {
    if (validate) {
      validateHeaderName(name);
      validateHeaderValue(name, value);
    }
    const key = name.toLowerCase();
    if (own.has(key)) {
      if (key === 'content-length') this._total = +value;
        else if (key === 'connection' && /(^|,)\s*close\s*(,|$)/i.test(value)) this._closeConnection = true;
      return;
    }
    if (Array.isArray(value)) for (const v of value) list.push(name, String(v));
      else list.push(name, String(value));
  });
  // a closing server answers what it still has and lets the connections go
  if (this._closeConnection || !this.shouldKeepAlive || !this._server._listen) {
    this._closeConnection = true;
    list.push('Connection', 'close');
  } else {
    list.push('Connection', 'keep-alive');
    if (this._server.keepAliveTimeout > 0) list.push('Keep-Alive', `timeout=${Math.floor(this._server.keepAliveTimeout / 1000)}`);
  }
  // http/1.0 has no chunked bodies: one of unknown length goes out whole at the end
  if (this.req.httpVersionMinor === 0 && this._total < 0) this._buffered = [];
  this._status = `${this.statusCode} ${this.statusMessage}`;
  this._list = list;
  this._header = firstLine;
};

const toChunk = (chunk, encoding) => typeof chunk === 'string' ? (encoding && encoding !== 'utf8' && encoding !== 'utf-8' ? Buffer.from(chunk, encoding) : chunk) : chunk;

U.flushHeaders = function () {
  // an aborted response's slot may already serve another request
  if (this.destroyed) return;
  if (!this._header) this._implicitHeader();
  if (this._headerSent || this._buffered !== null) return;
  this._headerSent = true;
  uws.writeHead(this._slot, this._status, this._list);
};

U.write = function (chunk, encoding, callback) {
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }
  if (this.finished) {
    const err = errStreamWriteAfterEnd();
    nextTick(() => {
      callback?.(err);
      this.emit('error', err);
    });
    return false;
  }
  if (this.destroyed) {
    const err = errStreamDestroyed('write');
    if (callback) nextTick(() => callback(err));
    return false;
  }
  if (!this._header) this._implicitHeader();
  if (callback) nextTick(callback);
  if (!this._hasBody || chunk == null || byteLength(chunk) === 0) return true;

  this._bytesWritten += byteLength(chunk);
  if (this._buffered !== null) {
    this._buffered.push(toChunk(chunk, encoding));
    return true;
  }
  this.flushHeaders();
  const ok = uws.write(this._slot, toChunk(chunk, encoding), this._total);
  if (!ok) this._needDrain = true;
  return ok;
};

U.end = function (chunk, encoding, callback) {
  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
    encoding = null;
  }
  if (this.finished) {
    if (callback) nextTick(callback);
    return this;
  }
  if (this.destroyed) return this;
  if (!this._header) this._implicitHeader();
  if (typeof callback === 'function') this.once('finish', callback);

  let body = this._hasBody && chunk != null ? toChunk(chunk, encoding) : '';
  if (this._buffered !== null) body = Buffer.concat([ ...this._buffered, body ].map(x => typeof x === 'string' ? Buffer.from(x) : x));
  this._bytesWritten += byteLength(body);
  this.finished = true;
  this._responseDone = true;
  if (this._headerSent) uws.finish(this._slot, body, this._total, this._closeConnection);
    else uws.end(this._slot, this._status, this._list, body, !this._hasBody, this._total, this._closeConnection);
  this._headerSent = true;
  this._maybeRelease();
  nextTick(() => {
    // drop an unread body like node's _dump, and end a bodiless request once anything listens for that
    const req = this.req;
    if (!req._consuming && (!req.complete || req.listenerCount('end') + req.listenerCount('close') > 0)) req._dump();
    this.emit('prefinish');
    this._finishEmitted = true;
    this.emit('finish');
    this.destroyed = true;
    this._closed = true;
    this.emit('close');
  });
  return this;
};

U.writeContinue = function (callback) {
  uws.writeContinue(this._slot);
  this._sent100 = true;
  if (callback) nextTick(callback);
};

U.destroy = function (err) {
  if (this.destroyed) return this;
  this.destroyed = true;
  this.socket.destroy(err);
  return this;
};

U.cork = U.uncork = function () {};

for (const name of [ '_uwsData', '_uwsAborted', '_uwsWritable', '_maybeRelease' ]) R[name] = U[name];
// responses made outside a server keep the net versions
for (const name of [ '_storeHeader', 'flushHeaders', 'write', 'end', 'writeContinue', 'destroy', 'cork', 'uncork' ]) {
  const net = R[name], uw = U[name];
  R[name] = function (a, b, c) { return this._slot === undefined ? net.call(this, a, b, c) : uw.call(this, a, b, c); };
}

export const createServer = (options, requestListener) => new Server(options, requestListener);

export function Agent(options) {
  if (!(this instanceof Agent)) return new Agent(options);
  EventEmitter.call(this);
  this.defaultPort = 80;
  this.protocol = 'http:';
  this.options = { __proto__: null, ...options };
  this.options.noDelay ??= true;
  this.options.path = null;
  this.requests = Object.create(null);
  this.sockets = Object.create(null);
  this.freeSockets = Object.create(null);
  this.keepAliveMsecs = this.options.keepAliveMsecs || 1000;
  this.keepAlive = this.options.keepAlive || false;
  this.maxSockets = this.options.maxSockets || Infinity;
  this.maxFreeSockets = this.options.maxFreeSockets || 256;
  this.totalSocketCount = 0;

  this.on('free', (socket, options) => {
    const name = this.getName(options);
    if (!socket.writable) return socket.destroy();

    const requests = this.requests[name];
    if (requests?.length) {
      setRequestSocket(this, requests.shift(), socket);
      if (requests.length === 0) delete this.requests[name];
      return;
    }

    const req = socket._httpMessage;
    const freeSockets = this.freeSockets[name] ?? [];
    if (!req?.shouldKeepAlive || !this.keepAlive || freeSockets.length >= this.maxFreeSockets || !this.keepSocketAlive(socket)) return socket.destroy();
    this.freeSockets[name] = freeSockets;
    socket._httpMessage = null;
    this.removeSocket(socket, options);
    socket.once('error', freeSocketErrorListener);
    // nothing may arrive on an idle connection: a server sending anything (or closing) retires it
    socket._idleGuard = () => socket.destroy();
    socket._startReading();
    freeSockets.push(socket);
  });
}
Object.setPrototypeOf(Agent.prototype, EventEmitter.prototype);
Object.setPrototypeOf(Agent, EventEmitter);

function freeSocketErrorListener() {
  this.destroy();
  this.emit('agentRemove');
}

const A = Agent.prototype;

A.createConnection = net.createConnection;

A.getName = function (options = {}) {
  let name = `${options.host || 'localhost'}:${options.port || ''}:${options.localAddress || ''}`;
  if (options.family === 4 || options.family === 6) name += `:${options.family}`;
  if (options.socketPath) name += `:${options.socketPath}`;
  return name;
};

// the tls servername: the Host header's name, else the host
const normalizeServerName = (options, req) => {
  if (options.servername || options.servername === '') return;
  let servername = options.host || '';
  const header = req.getHeader('host');
  if (header) servername = header.startsWith('[') ? header.slice(1, header.indexOf(']')) : header.split(':')[0];
  options.servername = net.isIP(servername) ? '' : servername;
};

A.addRequest = function (req, options) {
  options = { __proto__: null, ...options, ...this.options };
  if (options.socketPath) options.path = options.socketPath;
  normalizeServerName(options, req);
  const name = this.getName(options);
  this.sockets[name] ??= [];

  const freeSockets = this.freeSockets[name];
  let socket;
  if (freeSockets) {
    while (freeSockets.length && freeSockets[freeSockets.length - 1].destroyed) freeSockets.pop();
    socket = freeSockets.pop();
    if (!freeSockets.length) delete this.freeSockets[name];
  }

  if (socket) {
    this.reuseSocket(socket, req);
    setRequestSocket(this, req, socket);
    this.sockets[name].push(socket);
  } else if (this.sockets[name].length < this.maxSockets) {
    this.createSocket(req, options, (err, newSocket) => {
      if (err) req.onSocket(newSocket, err);
        else setRequestSocket(this, req, newSocket);
    });
  } else {
    req._agentOptions = options;
    (this.requests[name] ??= []).push(req);
  }
};

A.createSocket = function (req, options, callback) {
  options = { __proto__: null, ...options, ...this.options };
  if (options.socketPath) options.path = options.socketPath;
  normalizeServerName(options, req);
  const name = this.getName(options);
  options._agentKey = name;
  options.encoding = null;
  if (this.keepAlive) {
    options.keepAlive = this.keepAlive;
    options.keepAliveInitialDelay = this.keepAliveMsecs;
  }

  let called = false;
  const oncreate = (err, socket) => {
    if (called) return;
    called = true;
    if (err) return callback(err);
    (this.sockets[name] ??= []).push(socket);
    this.totalSocketCount++;
    installListeners(this, socket, options);
    callback(null, socket);
  };
  const socket = this.createConnection(options, oncreate);
  if (socket) oncreate(null, socket);
};

const installListeners = (agent, socket, options) => {
  const onFree = () => agent.emit('free', socket, options);
  const onClose = () => {
    agent.totalSocketCount--;
    agent.removeSocket(socket, options);
  };
  const onTimeout = () => {
    if (Object.values(agent.freeSockets).some(list => list.includes(socket))) socket.destroy();
  };
  const onRemove = () => {
    onClose();
    socket.removeListener('close', onClose);
    socket.removeListener('free', onFree);
    socket.removeListener('timeout', onTimeout);
    socket.removeListener('agentRemove', onRemove);
  };
  socket.on('free', onFree);
  socket.on('close', onClose);
  socket.on('timeout', onTimeout);
  socket.on('agentRemove', onRemove);
};

A.removeSocket = function (socket, options) {
  const name = this.getName(options);
  for (const sockets of socket.writable ? [ this.sockets ] : [ this.sockets, this.freeSockets ]) {
    const list = sockets[name];
    const i = list ? list.indexOf(socket) : -1;
    if (i === -1) continue;
    list.splice(i, 1);
    if (list.length === 0) delete sockets[name];
  }

  // a queued request takes the freed slot
  const req = this.requests[name]?.[0];
  if (req && (this.sockets[name]?.length ?? 0) < this.maxSockets) {
    this.createSocket(req, req._agentOptions, (err, newSocket) => {
      if (err) req.onSocket(newSocket, err);
        else newSocket.emit('free');
    });
  }
};

// the server's keep-alive hint, less a second, bounds how long a free socket waits
A.keepSocketAlive = function (socket) {
  socket.setKeepAlive(true, this.keepAliveMsecs);
  socket.unref();
  let timeout = this.options.timeout || 0;
  const seconds = /^timeout=(\d+)/.exec(socket._httpMessage?.res?.headers['keep-alive'] ?? '')?.[1];
  if (seconds) {
    const serverTimeout = seconds * 1000 - 1000;
    if (serverTimeout <= 0) return false;
    if (serverTimeout < timeout) timeout = serverTimeout;
  }
  if (socket.timeout !== timeout) socket.setTimeout(timeout);
  return true;
};

A.reuseSocket = function (socket, req) {
  socket._idleGuard = null;
  socket.removeListener('error', freeSocketErrorListener);
  req.reusedSocket = true;
  socket.ref();
};

A.destroy = function () {
  for (const sets of [ this.freeSockets, this.sockets ]) {
    for (const name of Object.keys(sets)) for (const socket of sets[name]) socket.destroy();
  }
};

const setRequestSocket = (agent, req, socket) => {
  req.onSocket(socket);
  if (req.timeout !== undefined && req.timeout !== (agent.options.timeout || 0)) socket.setTimeout(req.timeout);
};

export const globalAgent = new Agent({ keepAlive: true, timeout: 5000 });
Agent.globalAgent = globalAgent;

const urlToHttpOptions = url => {
  const options = {
    __proto__: null,
    ...url,
    protocol: url.protocol,
    hostname: url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: `${url.pathname || ''}${url.search || ''}`,
    href: url.href
  };
  if (url.port !== '') options.port = Number(url.port);
  if (url.username || url.password) options.auth = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
  return options;
};

export function ClientRequest(input, options, callback) {
  OutgoingMessage.call(this);
  const fromUrl = typeof input === 'string' || input instanceof URL;
  if (fromUrl) input = urlToHttpOptions(typeof input === 'string' ? new URL(input) : input);
  else {
    callback = options;
    options = input;
    input = null;
  }
  if (typeof options === 'function') {
    callback = options;
    options = { __proto__: null, ...input };
  } else options = { __proto__: null, ...input, ...options };

  let agent = options.agent;
  const defaultAgent = options._defaultAgent || Agent.globalAgent;
  if (agent === false) agent = new defaultAgent.constructor();
    else if (agent == null && typeof options.createConnection !== 'function') agent = defaultAgent;
  this.agent = agent;

  // the module's protocol, not the agent's: agent-base picks http/https from the stack, which compiled code lacks
  const protocol = options.protocol || defaultAgent.protocol;
  if (protocol !== defaultAgent.protocol) throw errInvalidProtocol(protocol, defaultAgent.protocol);

  const defaultPort = options.defaultPort || (this.agent?.protocol === protocol ? this.agent.defaultPort : defaultAgent.defaultPort);
  const port = options.port = options.port || defaultPort || 80;
  const host = options.host = options.hostname || options.host || 'localhost';
  this.socketPath = options.socketPath;
  if (options.timeout !== undefined) {
    validateNumber(options.timeout, 'timeout');
    this.timeout = options.timeout;
  }

  const signal = options.signal;
  if (signal) {
    delete options.signal;
    const onAbort = () => this.destroy(abortError(signal.reason));
    if (signal.aborted) onAbort();
    else {
      signal.addEventListener('abort', onAbort, { once: true });
      this.once('close', () => signal.removeEventListener('abort', onAbort));
    }
  }

  const method = options.method || 'GET';
  if (!isToken(method)) throw errInvalidHttpToken('Method', method);
  this.method = method.toUpperCase();
  this.path = options.path || '/';
  // a url's path names a CONNECT's target in authority-form
  if (this.method === 'CONNECT' && fromUrl) this.path = this.path.slice(1);
  if (callback) this.once('response', callback);

  this.useChunkedEncodingByDefault = !(this.method === 'GET' || this.method === 'HEAD' || this.method === 'DELETE' || this.method === 'OPTIONS' || this.method === 'TRACE' || this.method === 'CONNECT');
  this._ended = false;
  this.res = null;
  this.aborted = false;
  this.timeoutCb = null;
  this.upgradeOrConnect = false;
  this.parser = null;
  this.reusedSocket = false;
  this.host = host;
  this.protocol = protocol;
  if (this.agent) {
    this._last = !this.agent.keepAlive && !Number.isFinite(this.agent.maxSockets);
    this.shouldKeepAlive = !this._last;
  }

  const headers = options.headers;
  if (Array.isArray(headers)) this._storeHeader(`${this.method} ${this.path} HTTP/1.1\r\n`, headers);
  else {
    if (headers) for (const key of Object.keys(headers)) this.setHeader(key, headers[key]);
    if (host && !this.getHeader('host') && options.setHost !== false) {
      let hostHeader = host;
      if (net.isIPv6(hostHeader)) hostHeader = `[${hostHeader}]`;
      if (port && +port !== defaultPort) hostHeader += ':' + port;
      this.setHeader('Host', this.method === 'CONNECT' && options.path ? this.path : hostHeader);
    }
    if (options.auth && !this.getHeader('Authorization')) this.setHeader('Authorization', 'Basic ' + Buffer.from(options.auth).toString('base64'));
    if (this.getHeader('expect')) this._implicitHeader();
  }

  if (this.agent) this.agent.addRequest(this, options);
  else {
    this._last = true;
    this.shouldKeepAlive = false;
    const connectOptions = { ...options, path: options.socketPath };
    if (typeof options.createConnection === 'function') {
      let called = false;
      const oncreate = (err, socket) => {
        if (called) return;
        called = true;
        if (err) nextTick(() => this.emit('error', err));
          else this.onSocket(socket);
      };
      try {
        const socket = options.createConnection(connectOptions, oncreate);
        if (socket) oncreate(null, socket);
      } catch (err) {
        oncreate(err);
      }
    } else this.onSocket(net.createConnection(connectOptions));
  }
}
Object.setPrototypeOf(ClientRequest.prototype, OutgoingMessage.prototype);
Object.setPrototypeOf(ClientRequest, OutgoingMessage);

const C = ClientRequest.prototype;

Object.defineProperty(C, 'path', {
  get() { return this._path; },
  set(value) {
    const path = String(value);
    if (INVALID_PATH_REGEX.test(path)) throw errUnescapedCharacters('Request path');
    this._path = path;
  },
  configurable: true
});

C._implicitHeader = function () {
  if (this._header) throw errHttpHeadersSent('render');
  this._storeHeader(`${this.method} ${this.path} HTTP/1.1\r\n`, this._outHeaders);
};

C.abort = function () {
  if (this.aborted) return;
  this.aborted = true;
  nextTick(() => this.emit('abort'));
  this.destroy();
};

C.destroy = function (err) {
  if (this.destroyed) return this;
  this.destroyed = true;
  this.res?._dump();
  this._error = err;
  this.socket?.destroy(err);
  return this;
};

const emitErrorEvent = (req, err) => {
  if (req._hadErrorEvent) return;
  req._hadErrorEvent = true;
  req.emit('error', err);
};

C.onSocket = function (socket, err) {
  nextTick(() => onSocketNT(this, socket, err));
};

const onSocketNT = (req, socket, err) => {
  if (!req.destroyed && !err) {
    tickOnSocket(req, socket);
    req._flush();
    return;
  }
  req.destroyed = true;
  const destroy = error => {
    if (!req.aborted && !error) error = connResetException('socket hang up');
    if (error) emitErrorEvent(req, error);
    req._closed = true;
    req.emit('close');
  };
  // an unused socket goes back to the pool
  if (socket && !err && req.agent && !socket.destroyed) {
    socket._httpMessage = req;
    socket.emit('free');
  } else if (socket) {
    return finished(socket.destroy(err || req._error), er => destroy(er?.code === 'ERR_STREAM_PREMATURE_CLOSE' ? err : er || err));
  }
  destroy(err || req._error);
};

C.setTimeout = function (ms, callback) {
  if (this._ended) return this;
  validateNumber(ms, 'msecs');
  if (ms < 0 || !Number.isFinite(ms)) throw errOutOfRange('msecs', 'a non-negative finite number', ms);
  listenSocketTimeout(this);
  if (callback) this.once('timeout', callback);
  const set = socket => {
    if (socket.connecting) socket.once('connect', () => socket.setTimeout(ms));
      else socket.setTimeout(ms);
  };
  if (this.socket) set(this.socket);
    else this.once('socket', set);
  return this;
};

function emitRequestTimeout() {
  this._httpMessage?.emit('timeout');
}

const listenSocketTimeout = req => {
  if (req.timeoutCb) return;
  req.timeoutCb = emitRequestTimeout;
  if (req.socket) req.socket.once('timeout', emitRequestTimeout);
    else req.on('socket', socket => socket.once('timeout', emitRequestTimeout));
};

const freeParser = socket => {
  const parser = socket.parser;
  if (!parser) return;
  parser.onHeaders = parser.onBody = parser.onComplete = () => {};
  parser.incoming = null;
  socket.parser = null;
};

const tickOnSocket = (req, socket) => {
  const parser = new HTTPParser(maxHeaderSize);
  req.socket = socket;
  parser.incoming = null;
  req.parser = parser;
  socket.parser = parser;
  socket._httpMessage = req;

  parser.onHeaders = info => {
    const res = new IncomingMessage(socket);
    res.httpVersionMajor = info.versionMajor;
    res.httpVersionMinor = info.versionMinor;
    res.httpVersion = `${info.versionMajor}.${info.versionMinor}`;
    res.upgrade = info.upgrade;
    res._rawHeaders = info.rawHeaders;
    res.statusCode = info.statusCode;
    res.statusMessage = info.statusMessage;
    parser.incoming = res;
    return parserOnIncomingClient(socket, res, info.keepAlive);
  };

  parser.onBody = chunk => {
    const res = parser.incoming;
    if (res !== null && !res._dumped && !res._skipPendingData && !res.push(chunk)) socket.pause();
  };

  parser.onComplete = () => {
    const res = parser.incoming;
    if (res !== null && !res._skipPendingData) {
      res.complete = true;
      res.push(null);
    }
    if (socket.readable) socket.resume();
  };

  socket.on('error', socketErrorListener);
  socket.on('data', socketOnData);
  socket.on('end', socketOnEnd);
  socket.on('close', socketCloseListener);
  socket.on('drain', ondrain);
  if (req.timeout !== undefined || req.agent?.options?.timeout) listenSocketTimeout(req);
  req.emit('socket', socket);
};

const parserOnIncomingClient = (socket, res, keepAlive) => {
  const req = socket._httpMessage;
  if (req.res) {
    // a second response to one request
    socket.destroy();
    socket.parser.incoming = req.res;
    req.res._skipPendingData = true;
    return 0;
  }
  req.res = res;
  if (res.upgrade) return STOP;
  if (req.method === 'CONNECT') {
    res.upgrade = true;
    return STOP;
  }
  // informational responses come before the real one
  if (res.statusCode >= 100 && res.statusCode < 200) {
    req.res = null;
    if (res.statusCode === 100) req.emit('continue');
    return SKIP_BODY;
  }
  if (req.shouldKeepAlive && !keepAlive && !req.upgradeOrConnect) req.shouldKeepAlive = false;
  res.req = req;
  res.on('end', responseOnEnd);
  req.on('finish', requestOnFinish);
  socket.on('timeout', responseOnTimeout);
  if (req.aborted || !req.emit('response', res)) res._dump();
  if (req.method === 'HEAD') return SKIP_BODY;
  if (res.statusCode === 304) {
    res.complete = true;
    return SKIP_BODY;
  }
  return 0;
};

// whichever of the request's finish and the response's end comes last frees the socket, once
function requestOnFinish() {
  if (this.shouldKeepAlive && this._ended && !this.destroyed) responseKeepAlive(this);
}

function responseOnEnd() {
  const req = this.req;
  const socket = req.socket;
  if (socket) {
    if (req.timeoutCb) socket.removeListener('timeout', emitRequestTimeout);
    socket.removeListener('timeout', responseOnTimeout);
  }
  req._ended = true;
  if (!req.shouldKeepAlive) {
    if (socket.writable) socket.destroySoon();
  } else if (req.writableFinished && !this.aborted && !req.destroyed) responseKeepAlive(req);
}

function responseOnTimeout() {
  this._httpMessage?.res?.emit('timeout');
}

const responseKeepAlive = req => {
  const socket = req.socket;
  if (req.timeoutCb) {
    socket.setTimeout(0, req.timeoutCb);
    req.timeoutCb = null;
  }
  socket.removeListener('close', socketCloseListener);
  socket.removeListener('error', socketErrorListener);
  socket.removeListener('data', socketOnData);
  socket.removeListener('end', socketOnEnd);
  nextTick(() => {
    req._closed = true;
    req.emit('close');
    req.socket?.emit('free');
  });
  req.destroyed = true;
  if (req.res) req.res.socket = null;
};

function ondrain() {
  const msg = this._httpMessage;
  if (msg && !msg.finished && msg._needDrain) {
    msg._needDrain = false;
    msg.emit('drain');
  }
}

function socketOnData(chunk) {
  const socket = this;
  const req = socket._httpMessage;
  const parser = socket.parser;
  const err = parser.execute(chunk);
  if (err) {
    err.rawPacket = chunk;
    freeParser(socket);
    socket.removeListener('data', socketOnData);
    socket.removeListener('end', socketOnEnd);
    socket.destroy();
    socket._hadError = true;
    emitErrorEvent(req, err);
  } else if (parser.incoming?.upgrade) {
    const res = parser.incoming;
    req.res = res;
    const head = parser.takeRemaining();
    socket.removeListener('data', socketOnData);
    socket.removeListener('end', socketOnEnd);
    socket.removeListener('drain', ondrain);
    if (req.timeoutCb) socket.removeListener('timeout', req.timeoutCb);
    socket.removeListener('timeout', responseOnTimeout);
    freeParser(socket);
    const event = req.method === 'CONNECT' ? 'connect' : 'upgrade';
    if (req.listenerCount(event) > 0) {
      req.upgradeOrConnect = true;
      socket.emit('agentRemove');
      socket.removeListener('close', socketCloseListener);
      socket.removeListener('error', socketErrorListener);
      socket._httpMessage = null;
      socket.readableFlowing = null;
      req.emit(event, res, socket, head);
      req.destroyed = true;
      req._closed = true;
      req.emit('close');
    } else socket.destroy();
  } else if (parser.incoming?.complete && parser.incoming.statusCode >= 200) {
    socket.removeListener('data', socketOnData);
    socket.removeListener('end', socketOnEnd);
    socket.removeListener('drain', ondrain);
    freeParser(socket);
  }
}

const finishParser = socket => {
  socket.parser?.finish();
  freeParser(socket);
};

function socketOnEnd() {
  const req = this._httpMessage;
  if (!req.res && !this._hadError) {
    this._hadError = true;
    emitErrorEvent(req, connResetException('socket hang up'));
  }
  finishParser(this);
  this.destroy();
}

function socketErrorListener(err) {
  const req = this._httpMessage;
  if (req) {
    this._hadError = true;
    emitErrorEvent(req, err);
  }
  finishParser(this);
  this.removeListener('data', socketOnData);
  this.removeListener('end', socketOnEnd);
  this.destroy();
}

function socketCloseListener() {
  const req = this._httpMessage;
  const res = req.res;
  req.destroyed = true;
  if (res) {
    if (!res.complete) res.destroy(connResetException('aborted'));
  } else if (!this._hadError) {
    this._hadError = true;
    emitErrorEvent(req, connResetException('socket hang up'));
  }
  req._closed = true;
  req.emit('close');
  if (res && !res.aborted && res.readable) res.push(null);
  req.outputData.length = 0;
  finishParser(this);
}

export const request = (url, options, callback) => new ClientRequest(url, options, callback);

export const get = (url, options, callback) => {
  const req = request(url, options, callback);
  req.end();
  return req;
};

const http = {
  METHODS, STATUS_CODES, Agent, ClientRequest, IncomingMessage, OutgoingMessage, Server, ServerResponse,
  createServer, request, get, validateHeaderName, validateHeaderValue, maxHeaderSize
};
Object.defineProperty(http, 'globalAgent', {
  get() { return Agent.globalAgent; },
  set(value) { Agent.globalAgent = value; },
  enumerable: true,
  configurable: true
});
export default http;
