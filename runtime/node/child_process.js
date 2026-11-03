import './c-helpers.js';
import process, { executable, entryFile } from './process.js';
import { EventEmitter } from './events.js';
import { Buffer } from './buffer.js';
import { resolve } from './path.js';
import { isURL, fileURLObjectToPath } from './internal/file-url.js';
import { adoptBytes, adoptString, errnoError, signalName, signalNumber, cStrings, freeStrings } from './internal/bytes.js';
import { nextTick } from './internal/loop.js';
import { setTimeout, clearTimeout } from './timers.js';
import { pipeSocket } from './net.js';
import { setupChannel } from './internal/ipc.js';
import { errInvalidArgValue, errUnknownSignal, abortError } from './internal/errors.js';
import { validateString } from './internal/validators.js';
import * as uv from './internal/uv.js';

// a signal name or number -> its number
const toSignal = signal => {
  const number = typeof signal === 'number' ? signal : signalNumber(String(signal).toUpperCase());
  if (number <= 0 || signalName(number) === null) throw errUnknownSignal(signal);
  return number;
};

// (file, [args], [options]) -> { file, args (argv0 first), envPairs, ...options }
const normalizeSpawnArguments = (file, args, options) => {
  validateString(file, 'file');
  if (args != null && !Array.isArray(args)) {
    options = args;
    args = [];
  }
  args = (args ?? []).map(x => `${x}`);
  options = { ...options };
  if (isURL(options.cwd)) options.cwd = fileURLObjectToPath(options.cwd);
    else if (options.cwd != null) options.cwd = `${options.cwd}`;

  if (options.shell) {
    const command = [ file, ...args ].join(' ');
    file = typeof options.shell === 'string' ? options.shell : '/bin/sh';
    args = [ '-c', command ];
  }
  args.unshift(typeof options.argv0 === 'string' ? options.argv0 : file);

  const env = options.env || process.env, envPairs = [];
  for (const key of Object.keys(env)) if (env[key] !== undefined) envPairs.push(`${key}=${env[key]}`);

  return { ...options, args, envPairs, file };
};

// a node style respawn of this program's own script runs this binary
const execTarget = (file, args, cwd) => {
  const script = file === process.execPath ? args.findIndex((x, i) => i > 0 && x[0] !== '-') : -1;
  if (script === -1 || resolve(cwd ?? '', args[script]) !== entryFile) return { path: file, argv: args };
  const argv = args.slice();
  argv[script] = entryFile;
  return { path: executable(), argv };
};

// stdio entries -> modes: -1 pipe, -2 ignore, -3 ipc, -4 a stream's own handle, else that fd
const stdioModes = (stdio = 'pipe', sync) => {
  if (typeof stdio === 'string') stdio = [ stdio, stdio, stdio ];
  stdio = stdio.slice();
  while (stdio.length < 3) stdio.push(undefined);

  let ipc = -1;
  const modes = stdio.map((x, i) => {
    x ??= i < 3 ? 'pipe' : 'ignore';
    if (x === 'ignore') return -2;
    if (x === 'pipe') return -1;
    if (x === 'ipc') {
      ipc = i;
      return -3;
    }
    if (x === 'inherit') return i;
    if (typeof x === 'number') return x;
    if (typeof x.fd === 'number') return x.fd;
    if (x._handle) return -4;
    if (sync && i === 0 && (typeof x === 'string' || ArrayBuffer.isView(x))) {
      stdio[0] = { input: x };
      return -1;
    }
    throw errInvalidArgValue('stdio', x);
  });
  return { stdio, modes, ipc };
};

// outN/errN are -1 when not captured, killError is ETIMEDOUT after the timeout or ENOBUFS past maxBuffer
const nativeSpawn = (path, argv, envp, cwd, input, inputBytes, inputLen, inMode, outMode, errMode, timeout, maxBuffer, killSignal) => {
  let status = 0, termSignal = 0, pid = 0, spawnError = 0, outP = 0, outN = -1, errP = 0, errN = -1, killError = 0;
  Porffor.c`{
  char **av = (char**)(u64)porf_jv_val(argv), **ev = (char**)(u64)porf_jv_val(envp);
  char *file = porf_node_bytes(path, NULL), *dir = porf_node_bytes(cwd, NULL);
  size_t inLen = (size_t)porf_jv_val(inputLen);
  char *in = porf_jv_val(inputBytes) ? NULL : porf_node_bytes(input, &inLen);
  const char *inData = in ? in : porf_node_u8(input);

  // temp files, not pipes: a chatty child can't deadlock our stdin writes
  const int wantOut = porf_jv_val(outMode) < 0 && porf_jv_val(outMode) != -2, wantErr = porf_jv_val(errMode) < 0 && porf_jv_val(errMode) != -2;
  FILE *out = wantOut ? tmpfile() : NULL, *err = wantErr ? tmpfile() : NULL;
  if ((wantOut && !out) || (wantErr && !err)) spawnError = errno;
  if (out) fcntl(fileno(out), F_SETFD, FD_CLOEXEC);
  if (err) fcntl(fileno(err), F_SETFD, FD_CLOEXEC);
  int fds[2], errPipe[2];
  pipe(fds);
  // exec failures come back through a close-on-exec pipe
  pipe(errPipe);
  fcntl(errPipe[1], F_SETFD, FD_CLOEXEC);

  // pending output goes first, and isn't copied into the child
  fflush(stdout);
  fflush(stderr);
  const pid_t child = spawnError ? -1 : fork();
  if (child == 0) {
    signal(SIGPIPE, SIG_DFL);
    close(errPipe[0]);
    if (porf_jv_val(inMode) == -2) freopen("/dev/null", "r", stdin);
      else if (porf_jv_val(inMode) < 0) dup2(fds[0], 0);
      else if (porf_jv_val(inMode) != 0) dup2((i32)porf_jv_val(inMode), 0);
    close(fds[0]);
    close(fds[1]);
    if (out) dup2(fileno(out), 1);
      else if (porf_jv_val(outMode) == -2) freopen("/dev/null", "w", stdout);
      else if (porf_jv_val(outMode) != 1) dup2((i32)porf_jv_val(outMode), 1);
    if (err) dup2(fileno(err), 2);
      else if (porf_jv_val(errMode) == -2) freopen("/dev/null", "w", stderr);
      else if (porf_jv_val(errMode) != 2) dup2((i32)porf_jv_val(errMode), 2);
    environ = ev;
    if (!*dir || chdir(dir) == 0) execvp(file, av);
    const int e = errno;
    write(errPipe[1], &e, sizeof(e));
    _exit(127);
  }

  close(fds[0]);
  close(errPipe[1]);
  // a loop's SIGCHLD handler (libuv) can interrupt the blocking calls
  int e = 0;
  ssize_t got;
  if (child < 0 && !spawnError) spawnError = errno;
  else if (child > 0) {
    while ((got = read(errPipe[0], &e, sizeof(e))) < 0 && errno == EINTR);
    if (got == sizeof(e)) spawnError = e;
  }
  close(errPipe[0]);

  for (size_t off = 0; !spawnError && off < inLen;) {
    const ssize_t w = write(fds[1], inData + off, inLen - off);
    if (w < 0 && errno == EINTR) continue;
    if (w <= 0) break;
    off += w;
  }
  close(fds[1]);

  int ws = 0;
  pid_t waited = -1;
  if (child > 0 && porf_jv_val(timeout) > 0) {
    struct timespec start, now, nap = { 0, 1000000 };
    clock_gettime(CLOCK_MONOTONIC, &start);
    while ((waited = waitpid(child, &ws, WNOHANG)) == 0) {
      clock_gettime(CLOCK_MONOTONIC, &now);
      if ((now.tv_sec - start.tv_sec) * 1e3 + (now.tv_nsec - start.tv_nsec) / 1e6 >= porf_jv_val(timeout)) {
        kill(child, (i32)porf_jv_val(killSignal));
        killError = ETIMEDOUT;
        waited = -1;
        break;
      }
      nanosleep(&nap, NULL);
    }
  }
  if (child > 0 && waited != child) while ((waited = waitpid(child, &ws, 0)) < 0 && errno == EINTR);
  if (child > 0 && waited == child) {
    pid = child;
    if (WIFEXITED(ws)) status = WEXITSTATUS(ws);
      else termSignal = WTERMSIG(ws);
  }
  if (out) {
    size_t len;
    rewind(out);
    outP = (f64)(u64)porf_node_slurp(out, &len);
    outN = len;
    fclose(out);
  }
  if (err) {
    size_t len;
    rewind(err);
    errP = (f64)(u64)porf_node_slurp(err, &len);
    errN = len;
    fclose(err);
  }
  // unlike node, a child past maxBuffer runs to the end: killing it early would mean polling
  if (!killError && (outN > porf_jv_val(maxBuffer) || errN > porf_jv_val(maxBuffer))) killError = ENOBUFS;

  free(file);
  free(dir);
  free(in);
}`;
  freeStrings(argv);
  freeStrings(envp);
  return { status, signal: termSignal, pid, spawnError, outP, outN, errP, errN, killError };
};

const output = (p, n, encoding) => {
  if (n === -1) return null;
  if (encoding != null && /^utf-?8$/i.test(encoding)) return adoptString(p, n);
  const buf = Object.setPrototypeOf(adoptBytes(p, n), Buffer.prototype);
  return encoding == null || encoding === 'buffer' ? buf : buf.toString(encoding);
};

const spawnError = (syscall, file, code, errno, spawnargs) => Object.assign(new Error(`${syscall} ${file} ${code}`), { errno, code, syscall: `${syscall} ${file}`, path: file, spawnargs });

export const spawnSync = (file, args, options) => {
  options = normalizeSpawnArguments(file, args, options);
  const { stdio, modes } = stdioModes(options.stdio, true);

  let input = options.input ?? stdio[0]?.input ?? '';
  if (typeof input === 'string' && options.encoding && options.encoding !== 'buffer') input = Buffer.from(input, options.encoding);
  const inputBytes = typeof input === 'string' ? 0 : 1;

  const { path, argv } = execTarget(options.file, options.args, options.cwd);
  const res = nativeSpawn(
    path, cStrings(argv), cStrings(options.envPairs), options.cwd ?? '',
    inputBytes ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : input, inputBytes, inputBytes ? input.byteLength : 0,
    options.input !== undefined ? -1 : modes[0], modes[1], modes[2],
    options.timeout ?? 0, options.maxBuffer ?? 1024 * 1024, toSignal(options.killSignal ?? 'SIGTERM')
  );

  const stdout = output(res.outP, res.outN, options.encoding), stderr = output(res.errP, res.errN, options.encoding);
  const result = {
    pid: res.pid,
    output: [ null, stdout, stderr ],
    stdout,
    stderr,
    status: res.pid && !res.signal ? res.status : null,
    signal: res.signal ? signalName(res.signal) : null
  };
  if (res.spawnError || res.killError) {
    const { code, errno } = errnoError(res.spawnError || res.killError, '');
    result.error = spawnError('spawnSync', options.file, code, errno, options.args.slice(1));
  }
  return result;
};

const commandFailed = (command, stderr) => new Error(`Command failed: ${command}${stderr?.length ? '\n' + stderr : ''}`);

// stderr is captured but, like node, also shown when stdio isn't given
const checkResult = (result, options, command) => {
  if (options?.stdio === undefined && result.stderr?.length) process.stderr.write(result.stderr);
  const { status, signal, output, pid, stdout, stderr } = result;
  if (result.error) throw Object.assign(result.error, { status, signal, output, pid, stdout, stderr });
  if (status !== 0) throw Object.assign(commandFailed(command, stderr), { status, signal, output, pid, stdout, stderr });
  return stdout;
};

export const execFileSync = (file, args, options) => {
  if (args != null && !Array.isArray(args)) {
    options = args;
    args = [];
  }
  return checkResult(spawnSync(file, args, options), options, [ file, ...(args ?? []) ].join(' '));
};

export const execSync = (command, options) => checkResult(spawnSync(command, { ...options, shell: options?.shell ?? true }), options, command);

export class ChildProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = undefined;
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.connected = false;
    this.spawnfile = null;
    this.spawnargs = [];
    this.stdin = null;
    this.stdout = null;
    this.stderr = null;
    this.stdio = [ null, null, null ];
    this._handle = 0;
    this._closesNeeded = 1;
    this._closesGot = 0;
  }

  _maybeClose() {
    if (++this._closesGot === this._closesNeeded) this.emit('close', this.exitCode, this.signalCode);
  }

  _closeWith(emitter, event) {
    this._closesNeeded++;
    emitter.once(event, () => this._maybeClose());
  }

  spawn(options) {
    const { stdio, modes, ipc } = stdioModes(options.stdio);
    const file = options.file, args = options.args ?? [ file ];
    this.spawnfile = file;
    this.spawnargs = args;

    const sockets = modes.map((mode, fd) => mode === -1 ? pipeSocket(fd === 0 ? { readable: false } : fd < 3 ? { writable: false } : {}) : null);
    const channelHandle = ipc === -1 ? 0 : uv.pipeNew(0, 1);
    const handles = modes.map((mode, fd) => mode === -1 ? sockets[fd]._handle : mode === -3 ? channelHandle : mode === -4 ? stdio[fd]._handle : 0);
    const envPairs = options.envPairs ?? [];
    if (ipc !== -1) envPairs.push(`NODE_CHANNEL_FD=${ipc}`, `NODE_CHANNEL_SERIALIZATION_MODE=${options.serialization ?? 'json'}`);

    this._handle = uv.processNew(uv.register((kind, status, data, signal) => {
      if (kind !== uv.EXIT) return;
      this.exitCode = signal ? null : status;
      this.signalCode = signal ? signalName(signal) : null;
      uv.close(this._handle);
      this._handle = 0;
      if (this.stdin) this.stdin.destroy();
      this.emit('exit', this.exitCode, this.signalCode);
      // output nobody reads still drains, so the streams end and 'close' comes
      nextTick(() => {
        for (const stream of this.stdio) if (stream?.readable && stream !== this.stdin && stream.listenerCount('data') === 0 && stream.listenerCount('readable') === 0) stream.resume();
      });
      this._maybeClose();
    }));

    const { path, argv: execArgs } = execTarget(file, args, options.cwd);
    const argv = cStrings(execArgs), envp = cStrings(envPairs);
    const { err, pid } = uv.spawn(this._handle, path, argv, envp, options.cwd ?? '', modes, handles, options.detached ? 1 : 0, options.uid ?? -1, options.gid ?? -1);
    freeStrings(argv);
    freeStrings(envp);

    this.stdio = sockets;
    [ this.stdin, this.stdout, this.stderr ] = sockets;

    if (err) {
      uv.close(this._handle);
      this._handle = 0;
      if (channelHandle) uv.close(channelHandle);
      for (const socket of sockets) {
        if (!socket) continue;
        this._closeWith(socket, 'close');
        socket.push(null);
        socket.destroy();
      }
      this.exitCode = err;
      const code = uv.errName(err);
      nextTick(() => {
        this.emit('error', spawnError('spawn', file, code, err, args.slice(1)));
        this._maybeClose();
      });
      return err;
    }

    this.pid = pid;
    // a stream given as this child's stdio is the child's to read now
    modes.forEach((mode, fd) => {
      const stream = stdio[fd];
      if (mode !== -4 || !stream.readable) return;
      stream.pause();
      uv.readStop(stream._handle);
      stream._reading = false;
      stream._readableState.reading = false;
    });
    sockets.forEach((socket, fd) => {
      if (!socket) return;
      if (fd > 0) this._closeWith(socket, 'close');
      if (fd !== 0) socket._attach(socket._handle, true);
    });
    if (channelHandle) {
      this._closeWith(this, 'disconnect');
      setupChannel(this, channelHandle, options.serialization);
    }
    nextTick(() => this.emit('spawn'));
    return 0;
  }

  kill(signal = 'SIGTERM') {
    const signum = signal === 0 ? 0 : toSignal(signal);
    if (!this._handle) return false;
    const err = uv.processKill(this._handle, signum);
    if (err === 0) {
      this.killed = true;
      return true;
    }
    if (uv.errName(err) !== 'ESRCH') this.emit('error', uv.uvException(err, 'kill'));
    return false;
  }

  ref() {
    if (this._handle) uv.ref(this._handle);
  }

  unref() {
    if (this._handle) uv.unref(this._handle);
  }
}

export const spawn = (file, args, options) => {
  options = normalizeSpawnArguments(file, args, options);
  const killSignal = toSignal(options.killSignal ?? 'SIGTERM');
  const child = new ChildProcess();
  child.spawn(options);

  if (options.timeout > 0) {
    const timer = setTimeout(() => child.kill(killSignal), options.timeout);
    child.once('exit', () => clearTimeout(timer));
    child.once('error', () => clearTimeout(timer));
  }
  const signal = options.signal;
  if (signal) {
    const abort = () => {
      if (child.kill(killSignal)) child.emit('error', abortError(signal.reason));
    };
    if (signal.aborted) nextTick(abort);
    else {
      signal.addEventListener('abort', abort, { once: true });
      child.once('exit', () => signal.removeEventListener('abort', abort));
    }
  }
  return child;
};

export const fork = (modulePath, args, options) => {
  if (isURL(modulePath)) modulePath = fileURLObjectToPath(modulePath);
  if (args != null && !Array.isArray(args)) {
    options = args;
    args = [];
  }
  options = { ...options, shell: false };
  const stdio = options.stdio ?? (options.silent ? 'pipe' : 'inherit');
  options.stdio = typeof stdio === 'string' ? [ stdio, stdio, stdio, 'ipc' ] : stdio;
  return spawn(options.execPath || process.execPath, [ ...(options.execArgv || process.execArgv), modulePath, ...(args ?? []) ], options);
};

export const execFile = (file, args, options, callback) => {
  if (typeof args === 'function') {
    callback = args;
    args = [];
  } else if (args != null && !Array.isArray(args)) {
    callback = options;
    options = args;
    args = [];
  }
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = { encoding: 'utf8', ...options };
  const child = spawn(file, args, options);
  const command = options._command ?? [ file, ...(args ?? []) ].join(' ');

  // with an encoding the streams give strings
  const encoding = Buffer.isEncoding(options.encoding) && options.encoding !== 'buffer' ? options.encoding : null;
  const stdout = [], stderr = [];
  for (const [ stream, chunks ] of [ [ child.stdout, stdout ], [ child.stderr, stderr ] ]) {
    if (!stream) continue;
    if (encoding) stream.setEncoding(encoding);
    stream.on('data', chunk => chunks.push(chunk));
  }

  let error = null, exited = false;
  const finish = (code, signal) => {
    if (exited) return;
    exited = true;
    const out = encoding ? stdout.join('') : Buffer.concat(stdout), err = encoding ? stderr.join('') : Buffer.concat(stderr);
    if (!callback) return;
    if (!error && (code !== 0 || signal !== null)) error = Object.assign(commandFailed(command, err), { code, killed: child.killed, signal });
    if (error) error.cmd = command;
    callback(error, out, err);
  };
  child.on('error', err => {
    error = err;
    child.stdout?.destroy();
    child.stderr?.destroy();
    finish(null, null);
  });
  child.on('close', finish);
  return child;
};

export const exec = (command, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  return execFile(command, [], { ...options, shell: typeof options?.shell === 'string' ? options.shell : true, _command: command }, callback);
};

// resolves { stdout, stderr }, the child as the promise's .child
const promisifyExec = fn => (...args) => {
  const { promise, resolve, reject } = Promise.withResolvers();
  promise.child = fn(...args, (err, stdout, stderr) => err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr }));
  return promise;
};
const customPromisify = Symbol.for('nodejs.util.promisify.custom');
Object.defineProperty(exec, customPromisify, { value: /*@__PURE__*/ promisifyExec(exec) });
Object.defineProperty(execFile, customPromisify, { value: /*@__PURE__*/ promisifyExec(execFile) });

export default { spawnSync, execFileSync, execSync, spawn, execFile, exec, fork, ChildProcess };
