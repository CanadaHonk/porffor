import './c-helpers.js';
import { EventEmitter } from './events.js';
import { Buffer } from './buffer.js';
import { onBeforeExit, onExit, nextTick, setUncaughtHandler, run, activeResources } from './internal/loop.js';
import { errUnhandledRejection } from './internal/errors.js';
import { parseFileMode } from './internal/validators.js';
import { writeFd, adoptBytes, errnoError, signalNumber, cStrings } from './internal/bytes.js';
import { getcwd, setCwd, platform } from './internal/host.js';

Porffor.c`
#include <sys/ioctl.h>
`;

// [ columns, rows ] of a tty
export const windowSize = fd => {
  let columns = 0, rows = 0;
  Porffor.c`{
  struct winsize w;
  if (ioctl((i32)porf_jv_val(fd), TIOCGWINSZ, &w) == 0) {
    columns = w.ws_col;
    rows = w.ws_row;
  }
}`;
  return [ columns, rows ];
};

// argv and environ entries, undefined past their end
const argAt = i => {
  let out;
  Porffor.c`out = porf_argv[(i32)porf_jv_val(i)] ? porf_node_cstr(porf_argv[(i32)porf_jv_val(i)]) : JV_UNDEFINED;`;
  return out;
};

const envAt = i => {
  let out;
  Porffor.c`out = environ[(i32)porf_jv_val(i)] ? porf_node_cstr(environ[(i32)porf_jv_val(i)]) : JV_UNDEFINED;`;
  return out;
};

const nativeArch = () => {
  let arm64 = 0;
  Porffor.c`
#ifdef __aarch64__
  arm64 = 1;
#endif
`;
  return arm64 ? 'arm64' : 'x64';
};

// 0 pid, 1 ppid, 2 uid, 3 gid, 4 euid
const nativeId = which => {
  let out = 0;
  Porffor.c`
switch ((i32)porf_jv_val(which)) {
  case 0: out = getpid(); break;
  case 1: out = getppid(); break;
  case 2: out = getuid(); break;
  case 3: out = getgid(); break;
  case 4: out = geteuid(); break;
}
`;
  return out;
};

// like node, kept until chdir
let cachedCwd = '';
const cwd = () => cachedCwd ||= getcwd();

const changeDir = dir => {
  let err = 0;
  Porffor.c`{
  char *p = porf_node_bytes(dir, NULL);
  if (chdir(p) != 0) err = errno;
  free(p);
}`;
  return err;
};

export const isTTY = fd => {
  let out = 0;
  Porffor.c`out = isatty((i32)porf_jv_val(fd));`;
  return out !== 0;
};

const monotonic = () => {
  let s = 0, ns = 0;
  Porffor.c`{
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  s = ts.tv_sec;
  ns = ts.tv_nsec;
}`;
  return [ s, ns ];
};

const maxRss = () => {
  let out = 0;
  Porffor.c`{
  struct rusage u;
  getrusage(RUSAGE_SELF, &u);
#ifdef __APPLE__
  out = u.ru_maxrss;
#else
  out = u.ru_maxrss * 1024.0;
#endif
}`;
  return out;
};

const nativeUmask = mask => {
  let out = 0;
  Porffor.c`out = umask((mode_t)porf_jv_val(mask));`;
  return out;
};

const nativeKill = (pid, sig) => {
  let err = 0;
  Porffor.c`if (kill((pid_t)porf_jv_val(pid), (i32)porf_jv_val(sig)) != 0) err = errno;`;
  return err;
};

const nativeExit = code => {
  Porffor.c`
fflush(stdout);
fflush(stderr);
exit((i32)porf_jv_val(code));
`;
};

const readStdin = () => {
  let p = 0, n = 0;
  Porffor.c`{
  size_t len;
  p = (f64)(u64)porf_node_slurp(stdin, &len);
  n = len;
}`;
  return Object.setPrototypeOf(adoptBytes(p, n), Buffer.prototype);
};

// 1 set, 0 unset in the real environment (getenv, TZ)
const nativeSetEnv = (key, value, set) => {
  Porffor.c`{
  char *k = porf_node_bytes(key, NULL);
  if (porf_jv_val(set)) {
    char *v = porf_node_bytes(value, NULL);
    setenv(k, v, 1);
    free(v);
  } else unsetenv(k);
  free(k);
}`;
};

// this binary's own path, the fallback execPath and what self respawns exec
export const executable = () => {
  let out;
  Porffor.c`{
  char path[4096], real[4096];
#ifdef __APPLE__
  extern int _NSGetExecutablePath(char*, u32*);
  u32 size = sizeof(path);
  _NSGetExecutablePath(path, &size);
#else
  const ssize_t n = readlink("/proc/self/exe", path, sizeof(path) - 1);
  path[n < 0 ? 0 : n] = 0;
#endif
  out = porf_node_cstr(realpath(path, real) ? real : path);
}`;
  return out;
};

// like node: writes to a closed pipe fail with EPIPE instead of killing, and stdout is line buffered
const stdioInit = () => {
  Porffor.c`signal(SIGPIPE, SIG_IGN);
setvbuf(stdout, NULL, _IOLBF, 0);`;
};
stdioInit();

export const entryFile = __porffor_entry_file;
const execPath = executable();

// node's argv: [ execPath, ...execArgv, script, ...args ], without a script for eval and stdin programs
const rawArgv = [];
for (let i = 0, arg; (arg = argAt(i)) !== undefined; i++) rawArgv.push(arg);
const scriptAt = rawArgv.indexOf(entryFile, 1);
const execArgv = scriptAt > 0 ? rawArgv.slice(1, rawArgv[scriptAt - 1] === '--' ? scriptAt - 1 : scriptAt) : [];
const argv = [ execPath, ...rawArgv.slice(scriptAt > 0 ? scriptAt + 1 : 1) ];
if (!/\/\[(eval|stdin)\]$/.test(entryFile)) argv.splice(1, 0, entryFile);

const env = {};
for (let i = 0, entry; (entry = envAt(i)) !== undefined; i++) {
  const eq = entry.indexOf('=');
  if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1);
}

// process.env takes strings only, and writes through to the environment
const envTraps = {
  set: (target, key, value) => {
    if (typeof key === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
    target[key] = String(value);
    nativeSetEnv(key, target[key], 1);
    return true;
  },
  has: (target, key) => typeof key === 'string' && Object.hasOwn(target, key),
  deleteProperty: (target, key) => {
    delete target[key];
    nativeSetEnv(key, '', 0);
    return true;
  }
};

const writable = fd => {
  const stream = new EventEmitter();
  stream.fd = fd;
  stream.writable = true;
  stream.isTTY = isTTY(fd);
  if (stream.isTTY) {
    [ stream.columns, stream.rows ] = windowSize(fd);
    stream.columns ||= Number(env.COLUMNS) || 80;
    stream.rows ||= Number(env.LINES) || 24;
  }
  stream.write = (chunk, encoding, callback) => {
    if (typeof encoding === 'function') callback = encoding;
      else if (typeof chunk === 'string' && encoding != null && !/^utf-?8$/i.test(encoding)) chunk = Buffer.from(chunk, encoding);
    writeFd(fd, chunk);
    if (callback) nextTick(callback, null);
    return true;
  };
  stream.end = (chunk, encoding, callback) => {
    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = null;
    }
    if (chunk != null) stream.write(chunk, encoding);
    nextTick(() => {
      stream.emit('finish');
      if (callback) callback();
    });
    return stream;
  };
  stream.hasColors = () => stream.isTTY;
  stream.getColorDepth = () => stream.isTTY ? 8 : 1;
  return stream;
};

// stdin as a file (internal/stdin streams ttys, pipes and sockets): read whole once someone listens
const stdin = new EventEmitter();
stdin.fd = 0;
stdin.isTTY = isTTY(0);
stdin.encoding = null;
stdin.setEncoding = encoding => {
  stdin.encoding = encoding;
  return stdin;
};
stdin.resume = stdin.pause = stdin.ref = stdin.unref = stdin.setRawMode = () => stdin;
const stdinData = () => {
  const data = readStdin();
  return stdin.encoding ? data.toString(stdin.encoding) : data;
};
stdin.on('newListener', name => {
  if (stdin.reading || (name !== 'data' && name !== 'end' && name !== 'readable')) return;
  stdin.reading = true;
  nextTick(() => {
    const data = stdinData();
    if (data.length > 0) stdin.emit('data', data);
    stdin.emit('end');
    stdin.emit('close');
  });
});
stdin[Symbol.asyncIterator] = async function* () {
  const data = stdinData();
  if (data.length > 0) yield data;
};

const hrtime = time => {
  const [ s, ns ] = monotonic();
  if (time === undefined) return [ s, ns ];
  return ns >= time[1] ? [ s - time[0], ns - time[1] ] : [ s - time[0] - 1, ns - time[1] + 1e9 ];
};
hrtime.bigint = () => {
  const [ s, ns ] = monotonic();
  return BigInt(s) * 1000000000n + BigInt(ns);
};

const memoryUsage = () => ({ rss: maxRss(), heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 });
memoryUsage.rss = maxRss;

const emitExit = () => {
  if (process._exiting) return;
  process._exiting = true;
  process.emit('exit', Number(process.exitCode ?? 0));
};

function Process() {
  EventEmitter.call(this);
}
Object.defineProperty(Process, 'name', { value: 'process' });
Object.setPrototypeOf(Process.prototype, EventEmitter.prototype);

const process = Object.assign(new Process(), {
  argv,
  argv0: rawArgv[0],
  execArgv,
  execPath,
  env: new Proxy(env, envTraps),
  pid: nativeId(0),
  ppid: nativeId(1),
  platform,
  arch: nativeArch(),
  title: 'node',
  version: 'v26.12.0',
  versions: { node: '26.12.0', v8: '0.0.0', uv: '1.53.0', zlib: '1.3.1', modules: '144', napi: '10', openssl: '4.0.3' },
  release: { name: 'node' },
  config: { target_defaults: {}, variables: {} },
  features: {
    inspector: false, debug: false, uv: true, ipv6: true, openssl_is_boringssl: false, dtls: false, quic: false,
    tls_alpn: true, tls_sni: true, tls_ocsp: true, tls: true, cached_builtins: true, require_module: true, typescript: false
  },
  exitCode: undefined,
  _exiting: false,
  noDeprecation: execArgv.includes('--no-deprecation'),
  sourceMapsEnabled: execArgv.includes('--enable-source-maps'),
  stdin,
  stdout: writable(1),
  stderr: writable(2),
  hrtime,
  memoryUsage,
  cwd,
  // replaces this process, only returning by throwing
  execve: (file, args = [], env = process.env) => {
    const argv = cStrings(args), envp = cStrings(Object.entries(env).map(([ k, v ]) => `${k}=${v}`));
    let err = 0;
    Porffor.c`{
  char *path = porf_node_bytes(file, NULL);
  fflush(stdout);
  fflush(stderr);
  execve(path, (char**)(u64)porf_jv_val(argv), (char**)(u64)porf_jv_val(envp));
  err = errno;
  free(path);
}`;
    throw errnoError(err, 'execve', file);
  },
  chdir: directory => {
    const err = changeDir(directory);
    cachedCwd = '';
    if (err) throw errnoError(err, 'chdir', cwd(), directory);
  },
  nextTick,
  getuid: () => nativeId(2),
  getgid: () => nativeId(3),
  geteuid: () => nativeId(4),
  umask: mask => {
    if (mask !== undefined) return nativeUmask(parseFileMode(mask, 'mask'));
    const old = nativeUmask(0);
    nativeUmask(old);
    return old;
  },
  kill: (pid, signal = 'SIGTERM') => {
    const err = nativeKill(pid, typeof signal === 'number' ? signal : signalNumber(signal));
    if (!err) return true;
    const e = errnoError(err, 'kill');
    e.message = `kill ${e.code}`;
    throw e;
  },
  emitWarning: (warning, type, code) => {
    let detail;
    if (type !== null && typeof type === 'object') ({ type, code, detail } = type);
    if (typeof warning === 'string') {
      warning = new Error(warning);
      warning.name = typeof type === 'string' ? type : 'Warning';
      if (typeof code === 'string') warning.code = code;
      if (typeof detail === 'string') warning.detail = detail;
    }
    if (warning.name === 'DeprecationWarning' && process.noDeprecation) return;
    nextTick(() => process.emit('warning', warning));
  },
  exit: code => {
    if (code !== undefined) process.exitCode = code;
    emitExit();
    process.reallyExit(Number(process.exitCode ?? 0));
  },
  reallyExit: nativeExit,
  setSourceMapsEnabled: enabled => {
    process.sourceMapsEnabled = enabled;
  },
  getActiveResourcesInfo: activeResources,
  _rawDebug: (...args) => writeFd(2, args.join(' ') + '\n')
});
setCwd(() => process.cwd());

// node's default 'warning' listener, unless --no-warnings
let traceHintShown = false;
if (!execArgv.includes('--no-warnings') && env.NODE_NO_WARNINGS !== '1') process.on('warning', warning => {
  let message = `(node:${process.pid}) ${warning.code ? `[${warning.code}] ` : ''}${warning}`;
  if (typeof warning.detail === 'string') message += `\n${warning.detail}`;
  if (!traceHintShown) {
    message += `\n(Use \`node --trace-${warning.name === 'DeprecationWarning' ? 'deprecation' : 'warnings'} ...\` to show where the warning was created)`;
    traceHintShown = true;
  }
  process.stderr.write(message + '\n');
});

// what node does with an error nothing handled: show it, then exit (1) through 'exit'
const fatal = (err, code = 1) => {
  let shown;
  try {
    shown = err instanceof Error && typeof err.stack === 'string' ? err.stack : String(err);
  } catch {
    shown = Object.prototype.toString.call(err);
  }
  writeFd(2, `${shown}\n\nNode.js ${process.version}\n`);
  process.exitCode = code;
  emitExit();
  process.reallyExit(Number(process.exitCode));
};

const triggerUncaught = (err, origin) => {
  try {
    process.emit('uncaughtExceptionMonitor', err, origin);
    if (!process.emit('uncaughtException', err, origin)) fatal(err);
  } catch (thrown) {
    fatal(thrown, 7);
  }
};

setUncaughtHandler(err => {
  triggerUncaught(err, 'uncaughtException');
  return true;
});

// a throw nothing caught outside any callback (top-level code): that code is abandoned, the loop runs on
__Porffor_setFatalHook(err => {
  triggerUncaught(err, 'uncaughtException');
  run();
  process.reallyExit(Number(process.exitCode ?? 0));
});

__Porffor_promise_setRejectionHook((reason, promise) => {
  if (!process.emit('unhandledRejection', reason, promise)) triggerUncaught(reason instanceof Error ? reason : errUnhandledRejection(String(reason)), 'unhandledRejection');
});

onBeforeExit(() => {
  if (!process._exiting) process.emit('beforeExit', Number(process.exitCode ?? 0));
});

onExit(() => {
  emitExit();
  if (process.exitCode) process.reallyExit(Number(process.exitCode));
});

export default process;
