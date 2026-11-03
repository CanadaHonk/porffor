// workers are child processes of process.execPath talking over ipc, so SharedArrayBuffer and Atomics stay per worker
import './c-helpers.js';
import process, { entryFile } from './process.js';
import { EventEmitter } from './events.js';
import { resolve } from './path.js';
import { isURL, fileURLObjectToPath } from './internal/file-url.js';
import { spawn } from './child_process.js';
import { setImmediate } from './timers.js';
import { refLoop } from './internal/loop.js';
import { MessageEvent } from './internal/event_target.js';
import { setupChannel } from './internal/ipc.js';
import { encodeClone, decodeClone, uncloneable } from './v8.js';
import { errWorkerUnserializableError } from './internal/errors.js';
import * as uv from './internal/uv.js';

export const SHARE_ENV = Symbol.for('nodejs.worker_threads.SHARE_ENV');

export const markAsUncloneable = object => {
  if (object !== null && typeof object === 'object') uncloneable.add(object);
};

const transferList = transfer => Array.isArray(transfer) ? transfer : transfer?.transfer ?? [];
const transferPorts = transfer => transferList(transfer).filter(x => x instanceof MessagePort);
// transferred buffers went over as copies, so the originals detach after sending
const detachBuffers = transfer => {
  for (const x of transferList(transfer)) if (x instanceof ArrayBuffer) x.transfer();
};

class MessagePort extends EventEmitter {
  constructor() {
    super();
    // the entangled MessagePort here, or a remote { post, close } in another process
    this._peer = null;
    // once moved to another process, where messages go instead
    this._forward = null;
    this._queue = [];
    this._started = false;
    this._closed = false;
    this._ref = true;
    this._holding = false;
    this._scheduled = false;
    uncloneable.add(this);
    // like node: a first 'message' listener refs and starts the port, removing the last one unrefs it
    this.on('newListener', name => {
      if (name !== 'message' || this.listenerCount('message') > 0) return;
      this._ref = true;
      this.start();
      this._hold();
    });
    this.on('removeListener', name => {
      if (name === 'message' && this.listenerCount('message') === 0) this.unref();
    });
  }

  // keeps the process alive while started, open and ref'd
  _hold() {
    const holding = this._started && !this._closed && this._ref;
    if (holding !== this._holding) refLoop(holding ? 1 : -1);
    this._holding = holding;
  }

  _enqueue(value) {
    if (this._forward) return this._forward.post(value);
    if (this._closed) return;
    this._queue.push(value);
    this._schedule();
  }

  _schedule() {
    if (!this._started || this._scheduled || this._queue.length === 0) return;
    this._scheduled = true;
    setImmediate(() => {
      while (this._started && this._queue.length > 0) this.emit('message', this._queue.shift());
      this._scheduled = false;
    });
  }

  _send(value, ports) {
    if (this._peer instanceof MessagePort) this._peer._enqueue(decodeClone(encodeClone(value, new Map(), ports), [], ports));
      else if (this._peer) this._peer.post(value, ports);
  }

  postMessage(value, transfer) {
    if (this._closed) return;
    this._send(value, transferPorts(transfer));
    detachBuffers(transfer);
  }

  start() {
    if (this._started || this._closed) return;
    this._started = true;
    this._hold();
    this._schedule();
  }

  _peerClosed() {
    if (this._closed) return;
    this._closed = true;
    this._hold();
    setImmediate(() => this.emit('close'));
  }

  close() {
    const peer = this._peer;
    this._peer = null;
    if (peer instanceof MessagePort) peer._peerClosed();
      else if (peer) peer.close();
    this._peerClosed();
  }

  ref() {
    this._ref = true;
    this._hold();
    return this;
  }

  unref() {
    this._ref = false;
    this._hold();
    return this;
  }

  set onmessage(listener) {
    if (this._onmessage) this.off('message', this._onmessage);
    this._onmessage = data => listener.call(this, new MessageEvent('message', { data }));
    this.on('message', this._onmessage);
  }
}

export class MessageChannel {
  constructor() {
    this.port1 = new MessagePort();
    this.port2 = new MessagePort();
    this.port1._peer = this.port2;
    this.port2._peer = this.port1;
  }
}

// messages between processes: values serialized with relay ids for their ports
let nextPortId = 0;
const linkChannel = target => {
  const relays = new Map();
  const send = (cmd, id, data, ports = []) => {
    if (!target.connected) return;
    target.send({
      cmd,
      id,
      v: encodeClone(data, new Map(), ports),
      ports: ports.map(port => {
        const portId = `${process.pid}:${++nextPortId}`;
        port._forward = remote(portId);
        relays.set(portId, port);
        return portId;
      })
    });
  };
  const remote = id => ({ post: (value, ports) => send('NODE_WORKER_PORT', id, value, ports), close: () => send('NODE_WORKER_PORT_CLOSE', id, undefined, []) });
  const value = message => decodeClone(message.v, [], message.ports.map(id => {
    const port = new MessagePort();
    port._peer = remote(id);
    relays.set(id, port);
    return port;
  }));
  // a relay's messages came from its far end: they go to its peer, else they're for it
  target.on('internalMessage', message => {
    const port = relays.get(message.id);
    if (message.cmd === 'NODE_WORKER_PORT' && port) {
      if (port._forward) port._send(value(message), []);
        else port._enqueue(value(message));
    } else if (message.cmd === 'NODE_WORKER_PORT_CLOSE' && port) {
      relays.delete(message.id);
      if (port._forward) port.close();
        else port._peerClosed();
    }
  });
  return { send: (cmd, data, ports = []) => send(cmd, undefined, data, ports), value };
};

let nextThreadId = 0;
const running = new Set();
process.on('exit', () => {
  for (const worker of running) worker._child.kill('SIGKILL');
});

export class Worker extends EventEmitter {
  constructor(filename, options = {}) {
    super();
    if (isURL(filename)) filename = fileURLObjectToPath(filename);
    // a worker reruns this binary, which only has its own program's code
    if (options.eval || resolve(filename) !== entryFile) throw new Error(`porffor: workers can only run this program's own file (${entryFile}), not ${options.eval ? 'eval code' : filename}`);

    this.threadId = ++nextThreadId;
    this._exitCode = null;
    this._error = undefined;
    this._terminated = false;
    const env = options.env === SHARE_ENV || options.env === undefined ? process.env : options.env;
    const child = this._child = spawn(process.execPath, [ ...(options.execArgv ?? process.execArgv), entryFile, ...(options.argv ?? []).map(String) ], {
      stdio: [ options.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe', 'ipc' ],
      env: { ...env, PORFFOR_WORKER: '1' }
    });
    running.add(this);

    this.stdin = child.stdin;
    this.stdout = child.stdout;
    this.stderr = child.stderr;
    if (!options.stdout) child.stdout.on('data', chunk => process.stdout.write(chunk));
    if (!options.stderr) child.stderr.on('data', chunk => process.stderr.write(chunk));

    // the setup is the channel's first line, read by the worker before anything else
    const link = this._link = linkChannel(child);
    link.send('NODE_WORKER_INIT', { threadId: this.threadId, workerData: options.workerData }, transferPorts(options.transferList));

    child.on('spawn', () => this.emit('online'));
    child.on('error', err => {
      this._error = err;
    });
    child.on('internalMessage', message => {
      if (message.cmd === 'NODE_WORKER_MSG') this.emit('message', link.value(message));
        else if (message.cmd === 'NODE_WORKER_ERROR') this._error = link.value(message);
    });
    child.on('close', code => {
      running.delete(this);
      this._exitCode = this._terminated ? 1 : code ?? 1;
      this.threadId = -1;
      if (this._error !== undefined) this.emit('error', this._error);
      this.emit('exit', this._exitCode);
    });
  }

  postMessage(value, transfer) {
    if (this._exitCode !== null) return;
    this._link.send('NODE_WORKER_MSG', value, transferPorts(transfer));
    detachBuffers(transfer);
  }

  terminate(callback) {
    const done = new Promise(resolve => {
      if (this._exitCode !== null) return resolve(undefined);
      this.once('exit', resolve);
    });
    if (typeof callback === 'function') done.then(code => callback(null, code));
    if (this._exitCode === null && !this._terminated) {
      this._terminated = true;
      this._child.kill('SIGKILL');
    }
    return done;
  }

  // the process, its channel and its output all count
  ref() {
    this._child.ref();
    this._child.channel?.ref();
    for (const stream of this._child.stdio) stream?.ref();
  }

  unref() {
    this._child.unref();
    this._child.channel?.unref();
    for (const stream of this._child.stdio) stream?.unref();
  }
}

export let isMainThread = true, parentPort = null, workerData = null, threadId = 0;

// the first line on the parent's channel: the rest is for the channel itself
const readLine = fd => {
  let line;
  Porffor.c`{
  size_t cap = 4096;
  char *buf = malloc(cap);
  ssize_t n = 0, end = -1;
  const struct timespec nap = { 0, 1000000 };
  fcntl((i32)porf_jv_val(fd), F_SETFL, fcntl((i32)porf_jv_val(fd), F_GETFL) & ~O_NONBLOCK);
  while (end < 0) {
    n = recv((i32)porf_jv_val(fd), buf, cap, MSG_PEEK);
    if (n <= 0) break;
    for (ssize_t i = 0; i < n; i++) if (buf[i] == '\n') { end = i; break; }
    if (end < 0 && (size_t)n == cap) buf = realloc(buf, cap *= 2);
      else if (end < 0) nanosleep(&nap, NULL);
  }
  if (end >= 0) {
    recv((i32)porf_jv_val(fd), buf, end + 1, 0);
    line = porf_node_str(buf, end);
  } else line = porf_node_str("{}", 2);
  free(buf);
}`;
  return line;
};

// in a worker: the parent's channel, whose first line is this worker's setup
if (process.env.PORFFOR_WORKER) {
  const fd = +process.env.NODE_CHANNEL_FD;
  delete process.env.PORFFOR_WORKER;
  delete process.env.NODE_CHANNEL_FD;
  delete process.env.NODE_CHANNEL_SERIALIZATION_MODE;

  const parent = new EventEmitter();
  const link = linkChannel(parent);
  const setup = link.value(JSON.parse(readLine(fd)));
  isMainThread = false;
  threadId = setup.threadId;
  workerData = setup.workerData ?? null;

  const handle = uv.pipeNew(0, 1);
  uv.pipeOpen(handle, fd);
  uv.unref(handle);
  const channel = setupChannel(parent, handle, 'json');

  parentPort = new MessagePort();
  parentPort._peer = { post: (value, ports) => link.send('NODE_WORKER_MSG', value, ports), close: () => {} };
  parentPort.on('newListener', name => {
    if (name === 'message') channel.refCounted();
  });
  parentPort.on('removeListener', name => {
    if (name === 'message') channel.unrefCounted();
  });
  parent.on('internalMessage', message => {
    if (message.cmd === 'NODE_WORKER_MSG') parentPort._enqueue(link.value(message));
  });
  parent.on('disconnect', () => process.exit(1));

  // errors nothing here handles end the worker, as its 'error' in the parent
  process.on('uncaughtException', err => {
    if (process.listenerCount('uncaughtException') > 1) return;
    try {
      link.send('NODE_WORKER_ERROR', err);
    } catch {
      link.send('NODE_WORKER_ERROR', errWorkerUnserializableError());
    }
    channel.ref();
    parent.disconnect();
    process.exit(1);
  });
}

export default { isMainThread, parentPort, workerData, threadId, SHARE_ENV, Worker, MessageChannel, markAsUncloneable };
