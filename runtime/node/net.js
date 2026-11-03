import { EventEmitter } from './events.js';
import { Buffer } from './buffer.js';
import { Duplex } from './stream.js';
import { lookup as dnsLookup, ADDRCONFIG } from './dns.js';
import { nextTick } from './internal/loop.js';
import { setTimeout as startTimeout, clearTimeout } from './timers.js';
import {
  errSocketClosed, errServerNotRunning, errServerAlreadyListen, errMissingArgs, errInvalidIpAddress, errInvalidArgType, errOutOfRange, validatePort,
  errSocketClosedBeforeConnection
} from './internal/errors.js';
import { validateNumber, validateInteger, validateString, validateFunction } from './internal/validators.js';
import { isIP, isIPv4, isIPv6 } from './internal/ip.js';
import * as uv from './internal/uv.js';

export { isIP, isIPv4, isIPv6 };

// a uv handle whose events go to owner._onuv while it is owner's current (or closing) handle
const openHandle = (owner, pipe) => {
  let handle = 0;
  const id = uv.register((kind, status, data) => {
    if (handle === owner._handle || (kind === uv.CLOSE && handle === owner._closingHandle)) owner._onuv(kind, status, data);
  });
  handle = pipe ? uv.pipeNew(id, 0) : uv.tcpNew(id);
  return handle;
};

// node's ExceptionWithHostPort
const connectException = (err, address, port) => uv.uvException(err, 'connect', address, port > 0 ? port : 0);

// a socket over a fresh pipe handle, for child process stdio
export const pipeSocket = options => {
  const socket = new Socket(options);
  socket._handle = openHandle(socket, true);
  socket._pipe = true;
  return socket;
};

export function Socket(options) {
  if (!(this instanceof Socket)) return new Socket(options);
  if (typeof options === 'number') options = { fd: options };
  options = { ...options };
  this.connecting = false;
  this._handle = null;
  this._pipe = false;
  this._host = null;
  // a tls socket's underlying socket, whose activity also keeps it from timing out
  this._parent = null;
  this._hadError = false;
  this._reading = false;
  this._writeCallbacks = [];
  this._shutdownCallback = null;
  this._closingHandle = 0;
  this._closeCallback = null;
  this._timer = null;
  this._connectAttempt = null;
  this._pendingData = null;
  // set while idle (an http agent's free socket): anything read then calls it instead
  this._idleGuard = null;
  this._peername = null;
  this._sockname = null;
  this._bytesRead = 0;
  this._bytesWritten = 0;
  this._tos = -1;
  this.timeout = undefined;
  this.server = null;
  this._server = null;

  Duplex.call(this, { ...options, allowHalfOpen: !!options.allowHalfOpen, emitClose: false, autoDestroy: true, decodeStrings: false });

  this._noDelay = !!options.noDelay;
  this._keepAlive = !!options.keepAlive;
  this._keepAliveDelay = options.keepAliveInitialDelay > 0 ? ~~(options.keepAliveInitialDelay / 1000) : 0;

  if (options.fd !== undefined) {
    const pipe = uv.guessHandle(options.fd) !== 'TCP';
    this._pipe = pipe;
    this._handle = openHandle(this, pipe);
    const err = pipe ? uv.pipeOpen(this._handle, options.fd) : uv.tcpOpen(this._handle, options.fd);
    if (err) throw uv.uvException(err, 'open');
    if (options.readable !== false) this.read(0);
  }
}
Object.setPrototypeOf(Socket.prototype, Duplex.prototype);
Object.setPrototypeOf(Socket, Duplex);

const S = Socket.prototype;

// starts reading an already connected handle
S._attach = function (handle, pipe) {
  this._handle = handle;
  this._pipe = pipe;
  this.read(0);
};

S._onuv = function (kind, status, data) {
  if (kind === uv.READ && this._idleGuard) this._idleGuard();
  else if (kind === uv.READ) {
    this._unrefTimer();
    if (status > 0) {
      this._bytesRead += status;
      if (!this.push(Object.setPrototypeOf(data, Buffer.prototype))) {
        this._reading = false;
        uv.readStop(this._handle);
      }
    } else if (status === uv.EOF) {
      this._reading = false;
      uv.readStop(this._handle);
      this.push(null);
      this.read(0);
    } else this.destroy(uv.uvException(status, 'read'));
  } else if (kind === uv.WRITE) {
    this._unrefTimer();
    this._writeCallbacks.shift()(status < 0 ? uv.uvException(status, 'write') : null);
  } else if (kind === uv.SHUTDOWN) {
    const callback = this._shutdownCallback;
    this._shutdownCallback = null;
    callback();
  } else if (kind === uv.CONNECT) this._afterConnect(status);
  else if (kind === uv.CLOSE) this._closeCallback?.();
};

S._unrefTimer = function () {
  for (let s = this; s != null; s = s._parent) s._timer?.refresh();
};

export const _normalizeArgs = args => {
  if (args.length === 0) return [ {}, null ];
  const first = args[0];
  if (typeof first === 'function') return [ {}, first ];
  let options = {};
  if (typeof first === 'object' && first !== null) options = first;
    else if (typeof first === 'string' && !(Number(first) >= 0)) options.path = first;
    else {
      options.port = first;
      if (args.length > 1 && typeof args[1] === 'string') options.host = args[1];
    }
  const callback = args[args.length - 1];
  return [ options, typeof callback === 'function' ? callback : null ];
};

S.connect = function (...args) {
  const [ options, callback ] = Array.isArray(args[0]) && args[0].normalized ? args[0] : _normalizeArgs(args);
  if (callback !== null) this.once('connect', callback);
  if (this._parent?.connecting) return this;
  if (options.port === undefined && options.path == null) throw errMissingArgs([ 'options', 'port', 'path' ]);
  if (this.destroyed) {
    this._handle = null;
    this._peername = this._sockname = null;
    this._bytesRead = this._bytesWritten = 0;
    this._undestroy();
  }

  this._unrefTimer();
  this.connecting = true;
  if (options.path) {
    validateString(options.path, 'options.path');
    this._pipe = true;
    this._host = options.path;
    this._handle = openHandle(this, true);
    uv.pipeConnect(this._handle, options.path);
  } else lookupAndConnect(this, options);
  return this;
};

const lookupAndConnect = (socket, options) => {
  const host = options.host || 'localhost';
  const { localAddress, localPort } = options;
  validateString(host, 'options.host');
  if (localAddress && !isIP(localAddress)) throw errInvalidIpAddress(localAddress);
  if (typeof options.port !== 'number' && typeof options.port !== 'string') throw errInvalidArgType('options.port', [ 'number', 'string' ], options.port);
  const port = validatePort(options.port);

  const literal = isIP(host);
  if (literal) {
    nextTick(() => {
      if (socket.connecting) connectAll(socket, [ { address: host, family: literal } ], port, localAddress, localPort);
    });
    return;
  }

  socket._host = host;
  const family = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : options.family | 0;
  const lookup = options.lookup || dnsLookup;
  lookup(host, { family, hints: options.hints || (family ? 0 : ADDRCONFIG), all: true }, (err, addresses) => {
    if (!socket.connecting) return;
    if (err) {
      socket.emit('lookup', err, undefined, undefined, host);
      return nextTick(() => socket.destroy(err));
    }
    for (const { address, family } of addresses) socket.emit('lookup', null, address, family, host);
    const first = addresses[0];
    if (!isIP(first?.address)) return nextTick(() => socket.destroy(errInvalidIpAddress(first?.address)));
    // alternating families from the first address's, like node's autoSelectFamily
    const own = addresses.filter(x => x.family === first.family), other = addresses.filter(x => x.family !== first.family);
    const ordered = [];
    for (let i = 0; i < own.length || i < other.length; i++) {
      if (i < own.length) ordered.push(own[i]);
      if (i < other.length) ordered.push(other[i]);
    }
    socket._unrefTimer();
    connectAll(socket, ordered, port, localAddress, localPort);
  });
};

// one address at a time, moving on when one fails or takes too long
const connectAll = (socket, addresses, port, localAddress, localPort) => {
  const errors = [];
  const next = () => {
    const attempt = socket._connectAttempt;
    clearTimeout(attempt?.timer);
    if (errors.length === addresses.length) {
      socket._connectAttempt = null;
      if (errors.length === 1) return socket.destroy(errors[0]);
      const err = new AggregateError(errors);
      err.code = errors[0].code;
      return socket.destroy(err);
    }
    if (attempt) {
      uv.close(socket._handle);
      socket._handle = null;
    }
    const { address, family } = addresses[errors.length];
    socket._handle = openHandle(socket, false);
    socket._connectAttempt = { address, port, next, errors, timer: null };
    let err = 0;
    if (localAddress || localPort) err = uv.tcpBind(socket._handle, localAddress || (family === 4 ? '0.0.0.0' : '::'), localPort ?? 0, 0);
    if (err) {
      errors.push(uv.uvException(err, 'bind', localAddress, localPort));
      return next();
    }
    err = uv.tcpConnect(socket._handle, address, port);
    if (err) {
      errors.push(connectException(err, address, port));
      return next();
    }
    if (errors.length < addresses.length - 1) {
      socket._connectAttempt.timer = startTimeout(() => {
        errors.push(connectException(uv.ETIMEDOUT, address, port));
        if (socket.connecting) next();
      }, 2500);
    }
  };
  next();
};

S._afterConnect = function (status) {
  if (this.destroyed) return;
  const attempt = this._connectAttempt;
  if (status < 0) {
    if (this._pipe) {
      this.connecting = false;
      return this.destroy(uv.uvException(status, 'connect', this._host));
    }
    clearTimeout(attempt.timer);
    attempt.errors.push(connectException(status, attempt.address, attempt.port));
    return attempt.next();
  }
  if (attempt) clearTimeout(attempt.timer);
  this._connectAttempt = null;
  this.connecting = false;
  this._sockname = null;
  this._unrefTimer();
  if (!this._pipe) {
    if (this._noDelay) uv.setNoDelay(this._handle, 1);
    if (this._keepAlive) uv.setKeepAlive(this._handle, 1, this._keepAliveDelay);
    if (this._tos !== -1) uv.setTypeOfService(this._handle, this._tos);
  }
  this.emit('connect');
  this.emit('ready');
  if (!this.isPaused()) this.read(0);
};

S._startReading = function () {
  if (this._reading || !this._handle || this.connecting) return;
  this._reading = true;
  const err = uv.readStart(this._handle);
  if (err) this.destroy(uv.uvException(err, 'read'));
};

S._read = function () {
  if (this.connecting || !this._handle) this.once('connect', () => this._startReading());
    else this._startReading();
};

const writeBytes = (socket, bytes, callback) => {
  if (!socket._handle) return callback(errSocketClosed());
  socket._unrefTimer();
  const status = uv.write(socket._handle, bytes, 0, bytes.length);
  socket._bytesWritten += bytes.length;
  if (status === 0) callback(null);
    else if (status === 1) socket._writeCallbacks.push(callback);
    else callback(uv.uvException(status, 'write'));
};

// writes while connecting wait for the connection, counted in bytesWritten meanwhile
const writeWhenConnected = (socket, bytes, callback) => {
  if (!socket.connecting) return writeBytes(socket, bytes, callback);
  socket._pendingData = bytes;
  const onClose = () => callback(errSocketClosedBeforeConnection());
  socket.once('connect', () => {
    socket.off('close', onClose);
    socket._pendingData = null;
    writeBytes(socket, bytes, callback);
  });
  socket.once('close', onClose);
};

const toBytes = (chunk, encoding) => typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk;

S._write = function (chunk, encoding, callback) {
  writeWhenConnected(this, toBytes(chunk, encoding), callback);
};

S._writev = function (chunks, callback) {
  writeWhenConnected(this, Buffer.concat(chunks.map(x => toBytes(x.chunk, x.encoding))), callback);
};

S._final = function (callback) {
  if (this.connecting) return this.once('connect', () => this._final(callback));
  if (!this._handle) return callback();
  const err = uv.shutdown(this._handle);
  if (err) return callback(uv.errName(err) === 'ENOTCONN' ? null : uv.uvException(err, 'shutdown'));
  this._shutdownCallback = callback;
};

S._destroy = function (err, callback) {
  this.connecting = false;
  for (let s = this; s != null; s = s._parent) {
    clearTimeout(s._timer);
    s._timer = null;
  }
  clearTimeout(this._connectAttempt?.timer);
  this._connectAttempt = null;
  for (const pending of this._writeCallbacks) pending(err ?? errSocketClosed());
  this._writeCallbacks = [];

  const closed = () => this.emit('close', !!err);
  if (this._handle) {
    if (this._reading) uv.readStop(this._handle);
    this._reading = false;
    this._closeCallback = closed;
    this._closingHandle = this._handle;
    uv.close(this._handle);
    this._handle = null;
    this._sockname = null;
  } else nextTick(closed);
  callback(err);

  const server = this._server;
  if (server) {
    server._connections--;
    server._emitCloseIfDrained();
  }
};

S.destroySoon = function () {
  if (this.writable) this.end();
  if (this.writableFinished) this.destroy();
    else this.once('finish', this.destroy);
};

S.setTimeout = function (ms, callback) {
  if (this.destroyed) return this;
  validateNumber(ms, 'msecs');
  if (ms < 0 || !Number.isFinite(ms)) throw errOutOfRange('msecs', 'a non-negative finite number', ms);
  if (callback !== undefined) validateFunction(callback, 'callback');
  this.timeout = ms;
  clearTimeout(this._timer);
  this._timer = null;
  if (ms === 0) {
    if (callback) this.removeListener('timeout', callback);
    return this;
  }
  this._timer = startTimeout(() => this.emit('timeout'), ms);
  this._timer.unref();
  if (callback) this.once('timeout', callback);
  return this;
};

S.setNoDelay = function (enable = true) {
  enable = !!enable;
  if (this._handle && !this._pipe && enable !== this._noDelay) uv.setNoDelay(this._handle, enable ? 1 : 0);
  this._noDelay = enable;
  return this;
};

S.setKeepAlive = function (enable, initialDelay) {
  enable = !!enable;
  const delay = ~~(initialDelay / 1000);
  if (this._handle && !this._pipe) uv.setKeepAlive(this._handle, enable ? 1 : 0, delay);
  this._keepAlive = enable;
  this._keepAliveDelay = delay;
  return this;
};

S.setTypeOfService = function (tos) {
  validateInteger(tos, 'tos', 0, 255);
  this._tos = tos;
  if (this._handle && !this._pipe && !this.connecting) {
    const err = uv.setTypeOfService(this._handle, tos);
    if (err) throw uv.uvException(err, 'setTypeOfService');
  }
  return this;
};

S.address = function () {
  if (!this._handle) return {};
  if (this._pipe) return this._host ?? '';
  return uv.address(this._handle, 0) ?? {};
};

S.ref = function () {
  if (this._handle) uv.ref(this._handle);
    else this.once('connect', this.ref);
  return this;
};

S.unref = function () {
  if (this._handle) uv.unref(this._handle);
    else this.once('connect', this.unref);
  return this;
};

// both ends are kept once read, so they outlive the connection
const peer = socket => {
  if (!socket._handle || socket.connecting || socket._pipe) return socket._peername;
  return socket._peername ??= uv.address(socket._handle, 1);
};
const local = socket => {
  if (!socket._handle || socket._pipe) return socket._sockname;
  return socket._sockname ??= uv.address(socket._handle, 0);
};

const socketGetters = {
  remoteAddress() { return peer(this)?.address; },
  remoteFamily() { return peer(this)?.family; },
  remotePort() { return peer(this)?.port; },
  localAddress() { return local(this)?.address; },
  localFamily() { return local(this)?.family; },
  localPort() { return local(this)?.port; },
  bytesWritten() {
    let bytes = this._bytesWritten + (this._pendingData?.length ?? 0);
    for (const x of this.writableBuffer ?? []) bytes += typeof x.chunk === 'string' ? Buffer.byteLength(x.chunk, x.encoding) : x.chunk.length;
    return bytes;
  },
  pending() { return !this._handle || this.connecting; },
  readyState() {
    if (this.connecting) return 'opening';
    if (this.readable && this.writable) return 'open';
    if (this.readable) return 'readOnly';
    if (this.writable) return 'writeOnly';
    return 'closed';
  }
};
for (const name of Object.keys(socketGetters)) Object.defineProperty(S, name, { get: socketGetters[name], configurable: true });
// tls counts its own
Object.defineProperty(S, 'bytesRead', {
  get() { return this._bytesRead; },
  set(value) { this._bytesRead = value; },
  configurable: true
});

export const connect = (...args) => {
  const normalized = _normalizeArgs(args);
  normalized.normalized = true;
  const socket = new Socket(normalized[0]);
  if (normalized[0].timeout) socket.setTimeout(normalized[0].timeout);
  return socket.connect(normalized);
};
export const createConnection = connect;

export function Server(options, listener) {
  if (!(this instanceof Server)) return new Server(options, listener);
  EventEmitter.call(this);
  if (typeof options === 'function') {
    listener = options;
    options = {};
  }
  options ??= {};
  if (typeof listener === 'function') this.on('connection', listener);
  this._handle = null;
  this._pipe = false;
  this._pipeName = undefined;
  this._connections = 0;
  this._listeningId = 1;
  this._unref = false;
  this.allowHalfOpen = options.allowHalfOpen || false;
  this.noDelay = !!options.noDelay;
  this.keepAlive = !!options.keepAlive;
  this.keepAliveInitialDelay = options.keepAliveInitialDelay > 0 ? ~~(options.keepAliveInitialDelay / 1000) : 0;
  this.highWaterMark = options.highWaterMark;
}
Object.setPrototypeOf(Server.prototype, EventEmitter.prototype);
Object.setPrototypeOf(Server, EventEmitter);

const V = Server.prototype;

V._onuv = function (kind, status) {
  if (kind !== uv.CONNECTION) return;
  if (status < 0) return this.emit('error', uv.uvException(status, 'accept'));
  const socket = new Socket({ allowHalfOpen: this.allowHalfOpen, readableHighWaterMark: this.highWaterMark, writableHighWaterMark: this.highWaterMark });
  const handle = openHandle(socket, this._pipe);
  socket._handle = handle;
  socket._pipe = this._pipe;
  if (uv.accept(this._handle, handle)) return socket.destroy();
  if (this.noDelay) socket.setNoDelay(true);
  if (this.keepAlive) socket.setKeepAlive(true, this.keepAliveInitialDelay * 1000);
  this._connections++;
  socket.server = this;
  socket._server = this;
  socket._attach(handle, this._pipe);
  this.emit('connection', socket);
};

V.listen = function (...args) {
  const [ options, callback ] = _normalizeArgs(args);
  if (this._handle) throw errServerAlreadyListen();
  if (callback !== null) this.once('listening', callback);
  const backlog = options.backlog || (typeof args[1] === 'number' ? args[1] : typeof args[2] === 'number' ? args[2] : 511);
  this._listeningId++;

  if (options.path !== undefined && options.port === undefined) {
    validateString(options.path, 'options.path');
    this._pipe = true;
    this._pipeName = options.path;
    this._handle = openHandle(this, true);
    const err = uv.pipeBind(this._handle, options.path);
    this._afterListen(err || uv.listen(this._handle, backlog), options.path, -1);
    return this;
  }

  const port = validatePort(options.port ?? 0, 'options.port');
  if (!options.host) {
    this._setupListenHandle(null, port, backlog);
    return this;
  }
  const listeningId = this._listeningId;
  dnsLookup(options.host, (err, ip) => {
    if (listeningId !== this._listeningId) return;
    if (err) this.emit('error', err);
      else this._setupListenHandle(ip, port, backlog);
  });
  return this;
};

// without an address: the unspecified ipv6 address, falling back to ipv4
V._setupListenHandle = function (address, port, backlog) {
  this._handle = openHandle(this, false);
  let err = uv.tcpBind(this._handle, address ?? '::', port, 0);
  if (err && address === null) {
    uv.close(this._handle);
    this._handle = openHandle(this, false);
    err = uv.tcpBind(this._handle, address = '0.0.0.0', port, 0);
  }
  this._afterListen(err || uv.listen(this._handle, backlog), address ?? '::', port);
};

V._afterListen = function (err, address, port) {
  if (err) {
    uv.close(this._handle);
    this._handle = null;
    const error = uv.uvExceptionWithHostPort(err, 'listen', address, port);
    nextTick(() => this.emit('error', error));
    return;
  }
  if (this._unref) uv.unref(this._handle);
  nextTick(() => {
    if (this._handle) this.emit('listening');
  });
};

V.ref = function () {
  this._unref = false;
  if (this._handle) uv.ref(this._handle);
  return this;
};

V.unref = function () {
  this._unref = true;
  if (this._handle) uv.unref(this._handle);
  return this;
};

V.getConnections = function (callback) {
  nextTick(callback, null, this._connections);
  return this;
};

V.address = function () {
  if (this._handle && !this._pipe) return uv.address(this._handle, 0);
  return this._pipeName ?? null;
};

V.close = function (callback) {
  this._listeningId++;
  if (typeof callback === 'function') {
    if (!this._handle) this.once('close', () => callback(errServerNotRunning()));
      else this.once('close', callback);
  }
  if (this._handle) {
    uv.close(this._handle);
    this._handle = null;
  }
  this._emitCloseIfDrained();
  return this;
};

V._emitCloseIfDrained = function () {
  if (this._handle || this._connections > 0) return;
  nextTick(() => this.emit('close'));
};

Object.defineProperty(V, 'listening', {
  get() { return !!this._handle; },
  configurable: true
});

export const createServer = (options, listener) => new Server(options, listener);

export default { Socket, Server, connect, createConnection, createServer, isIP, isIPv4, isIPv6 };
