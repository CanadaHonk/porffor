// test262 runner using the selfhosted compiler (selfhosted/porf) instead of the
// node-hosted compiler. single process: the compiler runs as a child process per
// test, so N async slots (compile -> exec pipelines) replace cluster workers.
// classification mirrors index.js so results are comparable; divergence against
// the node-hosted baseline (results.json) is reported at the end.
import { execSync, execFile, execFileSync, spawnSync, spawn as spawnProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { log } from '../compiler/log.js';
import readTest262, { readOne } from './read.js';

const __dirname = import.meta.dirname;
const test262Path = join(__dirname, 'test262');
// --parse-only: only parse each test (porf -parse-only, no codegen/exec); pass =
// parse outcome matches the test's expectation. results kept in separate files,
// compared against the node-hosted parse baseline (parse-results.json)
const parseOnly = process.argv.includes('--parse-only');
const resultsPath = join(__dirname, parseOnly ? 'selfhost-parse-results.json' : 'selfhost-results.json');
const prevResultsPath = join(__dirname, parseOnly ? 'selfhost-parse-results.prev.json' : 'selfhost-results.prev.json');
const nodeResultsPath = join(__dirname, parseOnly ? 'parse-results.json' : 'results.json');
const diffPath = join(__dirname, parseOnly ? 'selfhost-parse-diff.json' : 'selfhost-diff.json');
const execTimeout = 10000;

const stackSoftLimit = () => {
  try {
    const soft = execSync('ulimit -s', { encoding: 'utf8' }).trim();
    return soft === 'unlimited' ? Infinity : parseInt(soft);
  } catch {
    return 0;
  }
};

// raise the stack soft limit to 64MB (matching porf native's -Wl,-stack_size) once
// here so tcc -run children inherit it; node cannot setrlimit so re-exec under sh
if (process.platform === 'darwin' && !process.env.PORFFOR_TEST262_ULIMIT && stackSoftLimit() < 65520) {
  const { status, error } = spawnSync('/bin/sh', [ '-c', 'ulimit -s 65520 2>/dev/null; export PORFFOR_TEST262_ULIMIT=1; exec "$0" "$@"', process.execPath, ...process.argv.slice(1) ], { stdio: 'inherit' });
  if (!error) process.exit(status ?? 0);
}

const argValue = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);

// --diff: interactive delta tui over the latest result jsons; runs no tests
if (process.argv.includes('--diff')) {
  await (await import('./delta.js')).default();
  process.exit(0);
}

const selfhostBin = argValue('binary') ?? process.env.PORFFOR_SELFHOST_BIN ?? join(__dirname, '..', 'selfhosted', 'porf');
try {
  execFileSync(selfhostBin, [ '--version' ], { stdio: 'ignore', timeout: 10000 });
} catch {
  console.error(`selfhosted compiler not runnable: ${selfhostBin}`);
  console.error('build it with ./selfhost compile, or pass --binary=/path/to/porf');
  process.exit(1);
}

// a stale binary silently misattributes compiler changes - warn loudly
try {
  const bundleTime = fs.statSync(join(__dirname, '..', 'selfhosted', 'bundle.js')).mtimeMs;
  if (fs.statSync(selfhostBin).mtimeMs < bundleTime)
    log.warning('test262', `${selfhostBin} is older than selfhosted/bundle.js - results may not reflect current compiler`);
} catch {}

const resolveTccPath = tcc => {
  execFileSync(tcc, [ '-v' ], { stdio: 'ignore' });

  // resolve a bare name to an absolute path once: leaving it to each
  // per-test spawn costs a PATH search every exec (~1ms/test)
  if (!tcc.includes('/') && !tcc.includes('\\')) {
    try {
      tcc = execSync(`command -v ${tcc}`, { encoding: 'utf8' }).trim() || tcc;
    } catch {}
  }

  return tcc;
};

const tccArgs = [ '-w', '-lm', '-run' ];

const veryStart = performance.now();

let whatTests = process.argv.slice(2).find(x => x[0] !== '-') ?? '';
if (whatTests.endsWith('/')) whatTests = whatTests.slice(0, -1);
if (whatTests.endsWith('.js')) process.argv.push('--log-errors');

const logErrors = process.argv.includes('--log-errors');
const trackErrors = process.argv.includes('--errors');
const profile = process.argv.includes('--profile');
const dontWriteResults = process.argv.includes('--dont-write-results');
const expectedPasses = argValue('expect-passes');

let threads = parseInt(argValue('threads'));
if (Number.isNaN(threads)) try {
  threads = parseInt(fs.readFileSync(join(__dirname, '.threads'), 'utf8'));
} catch {
  threads = Math.min(12, os.cpus().length) - 4;
  log.warning('test262', `no --threads=n arg or .threads file found, using ${threads} as cautious default (min(12, threads) - 4)`);
}
if (logErrors) threads = 1;

const readJson = path => fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
const lastResults = readJson(resultsPath);
const nodeResults = readJson(nodeResultsPath);

process.stdout.write('[90mreading tests...[0m');

// schedule last run's timeouts first; drop any that no longer exist
const timeoutsFirst = (lastResults.timeouts ?? []).filter(x => fs.existsSync(join(test262Path, 'test', x)));
let tests = await readTest262(test262Path, whatTests, timeoutsFirst).catch(() => []);

// --skip-timeouts: do not run last run's timeouts, just report them as timeouts again
let skippedTimeouts = [];
if (process.argv.includes('--skip-timeouts') && lastResults.timeouts) {
  const lastTimeoutSet = new Set(lastResults.timeouts);
  skippedTimeouts = tests.filter(x => lastTimeoutSet.has(x));
  tests = tests.filter(x => !lastTimeoutSet.has(x));
}

if (tests.length === 0 && skippedTimeouts.length === 0) {
  console.error(`\rno tests found matching ${whatTests}`);
  process.exit(1);
}

// preludes come straight from the upstream test262 harness, plus our host globals
const preludes = { '#host': fs.readFileSync(join(__dirname, 'harness.js'), 'utf8') };
const harnessPath = join(test262Path, 'harness');
const loadHarness = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      loadHarness(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    const relPath = fullPath.slice(harnessPath.length + 1).replaceAll('\\', '/');
    if (preludes[relPath] !== undefined) continue;
    preludes[relPath] = fs.readFileSync(fullPath, 'utf8') + '\n';
  }
};

if (fs.existsSync(harnessPath)) loadHarness(harnessPath);

// fast harness: strip expensive formatting from upstream assert.js failure
// messages, exactly as index.js does (message text only; semantics untouched).
// harness/ self-tests get the pristine preludes
const pristineHarness = process.argv.includes('--pristine-harness');
let fastPreludes = preludes;
if (!pristineHarness) {
  const r = (s, old, neu) => s.split(old).length === 2 ? s.replace(old, neu) : s;
  let a = preludes['assert.js'];

  a = r(a, `return typeof JSON !== "undefined" ? JSON.stringify(value) : '"' + value + '"';`,
    `return '"' + value + '"';`);

  a = r(a, `function formatSimpleValue(value) {
  var basic = formatIdentityFreeValue(value);
  if (basic) return basic;
  try {
    return String(value);
  } catch (err) {
    if (err.name === 'TypeError') {
      return Object.prototype.toString.call(value);
    }
    throw err;
  }
}`, `function formatSimpleValue(value) {
  var basic = formatIdentityFreeValue(value);
  if (basic) return basic;
  if (typeof value === 'symbol') return 'Symbol()';
  if (typeof value === 'function') return '[function]';
  return '[object]';
}`);

  a = r(a, `throw new Test262Error(message + ' (_isSameValue operation threw) ' + error);`,
    `throw new Test262Error(message + ' (_isSameValue operation threw)');`);

  a = r(a, `    } else if (thrown.constructor !== expectedErrorConstructor) {
      expectedName = expectedErrorConstructor.name;
      actualName = thrown.constructor.name;
      if (expectedName === actualName) {
        message += 'Expected a ' + expectedName + ' but got a different error constructor with the same name';
      } else {
        message += 'Expected a ' + expectedName + ' but got a ' + actualName;
      }
      throw new Test262Error(message);
    }`, `    } else if (thrown.constructor !== expectedErrorConstructor) {
      message += 'Expected error constructor did not match';
      throw new Test262Error(message);
    }`);
  a = r(a, `  message += 'Expected a ' + expectedErrorConstructor.name + ' to be thrown but no exception was thrown at all';`,
    `  message += 'Expected an error to be thrown but no exception was thrown at all';`);

  a = r(a, `compareArray.format = function (arrayLike) {
  return "[" + Array.prototype.map.call(arrayLike, String).join(", ") + "]";
};`, `compareArray.format = function (arrayLike) {
  var s = "[";
  for (var i = 0; i < arrayLike.length; i++) s += (i ? ", " : "") + formatSimpleValue(arrayLike[i]);
  return s + "]";
};`);

  fastPreludes = { ...preludes, 'assert.js': a };
}

// run tests via tcc -run, preferring the tcc server (one resident process that
// compiles+runs in-memory) exactly like index.js
let tcc = process.env.PORFFOR_TEST262_TCC ?? process.env.TCC ?? 'tcc';
let hasTcc = true;
try {
  tcc = resolveTccPath(tcc);
} catch {
  hasTcc = false;
}
const cc = (process.env.CC ?? 'cc').split(' ');

// porf native links with a 64MB main stack on darwin; match it for tcc -run.
// normally a no-op thanks to the ulimit re-exec above
let stackWrap = (bin, args) => [ bin, args ];
if (process.platform === 'darwin' && stackSoftLimit() < 65520)
  stackWrap = (bin, args) => [ '/bin/sh', [ '-c', 'ulimit -s 65520 2>/dev/null; exec "$0" "$@"', bin, ...args ] ];

let tccServer = null;
let tccServerPath = null;
let tccServerSock = null;
const shutdownTccServer = () => {
  if (!tccServer) return;
  const server = tccServer;
  tccServer = null;
  try {
    execFileSync(tccServerPath, [ '--run-client', tccServerSock, '--shutdown' ], { stdio: 'ignore', timeout: 1000 });
  } catch {
    try {
      server.kill('SIGKILL');
    } catch {}
  }
  try {
    server.stderr?.destroy();
    server.unref();
  } catch {}
  try {
    fs.rmSync(tccServerSock, { force: true });
  } catch {}
};

const startTccServer = async () => {
  if (parseOnly) return;
  if (process.argv.includes('--no-tcc-server') || process.env.PORFFOR_TEST262_TCC_SERVER === '0') return;

  const localTcc = join(os.homedir(), 'tcc', 'tcc');
  const candidates = process.env.PORFFOR_TEST262_TCC || process.env.TCC ?
    [ process.env.PORFFOR_TEST262_TCC ?? process.env.TCC ] :
    [ 'tcc', ...(fs.existsSync(localTcc) ? [ localTcc ] : []) ];

  for (const candidate of candidates) {
    try {
      tccServerPath = resolveTccPath(candidate);
    } catch {
      continue;
    }

    tccServerSock = join(os.tmpdir(), `porffor-t262self-tcc-${process.pid}.sock`);
    tccServer = spawnProcess(tccServerPath, [ '--run-server', tccServerSock, `--timeout-ms=${execTimeout}` ], { stdio: [ 'ignore', 'ignore', 'ignore' ] });
    tccServer.unref();

    const ready = await new Promise(res => {
      let done = false;
      const finish = x => {
        if (done) return;
        done = true;
        clearInterval(interval);
        clearTimeout(timeout);
        tccServer.off('exit', onExit);
        res(x);
      };
      const onExit = () => finish(false);
      const interval = setInterval(() => {
        if (fs.existsSync(tccServerSock)) finish(true);
      }, 10);
      const timeout = setTimeout(() => finish(false), 2000);
      tccServer.once('exit', onExit);
    });

    if (ready) break;

    try {
      tccServer.kill('SIGKILL');
    } catch {}
    tccServer = null;
  }

  if (!tccServer) return;

  process.once('exit', shutdownTccServer);
  process.once('SIGINT', () => {
    shutdownTccServer();
    process.exit(130);
  });
};

await startTccServer();

// per-slot tcc server client: one socket, one in-flight request at a time
const makeTccClient = () => {
  let socket = null, buf = Buffer.alloc(0), wait = null;

  const reset = err => {
    const w = wait;
    wait = null;
    buf = Buffer.alloc(0);
    socket = null;
    if (w) w.reject(err);
  };

  const pump = () => {
    if (!wait || buf.length < wait.len) return;
    const w = wait;
    const out = buf.subarray(0, w.len);
    buf = buf.subarray(w.len);
    wait = null;
    w.resolve(out);
  };

  const connect = () => new Promise((res, rej) => {
    if (socket && !socket.destroyed) return res(socket);

    const s = net.createConnection(tccServerSock);
    let pending = true;
    s.once('connect', () => {
      pending = false;
      socket = s;
      res(s);
    });
    s.once('error', err => {
      if (pending) {
        pending = false;
        rej(err);
      } else {
        reset(err);
      }
    });
    s.once('close', () => reset(new Error('tcc server closed')));
    s.on('data', data => {
      buf = Buffer.concat([ buf, data ]);
      pump();
    });
  });

  const read = len => new Promise((resolve, reject) => {
    wait = { len, resolve, reject };
    pump();
  });

  const pack = args => {
    const bufs = [];
    const head = Buffer.alloc(8);
    head.writeUInt32LE(0x31535154, 0);
    head.writeUInt32LE(args.length, 4);
    bufs.push(head);
    for (const arg of args) {
      const data = Buffer.from(arg);
      const len = Buffer.alloc(4);
      len.writeUInt32LE(data.length, 0);
      bufs.push(len, data);
    }
    return Buffer.concat(bufs);
  };

  return async args => {
    try {
      const s = await connect();
      s.write(pack(args));
      const head = await read(16);
      if (head.readUInt32LE(0) !== 0x31535254) throw new Error('bad tcc server response');
      const status = head.readInt32LE(4);
      const outLen = head.readUInt32LE(8);
      const errLen = head.readUInt32LE(12);
      const stdout = outLen ? (await read(outLen)).toString() : '';
      const stderr = errLen ? (await read(errLen)).toString() : '';
      if (status === -2) return { stdout, stderr, status: null, signal: 'SIGKILL', timedOut: true };
      return { stdout, stderr, status };
    } catch (e) {
      return { stdout: '', stderr: e.message, status: 1, nativeCompileError: true };
    }
  };
};

// async child exec: other slots' children run while this one waits
const execAsync = (bin, args, timeout = execTimeout) => new Promise(res => {
  execFile(bin, args, {
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 16 * 1024 * 1024
  }, (e, stdout, stderr) => {
    if (!e) return res({ stdout, stderr: '', status: 0 });
    res({
      stdout: e.stdout ?? stdout ?? '',
      stderr: e.stderr ?? stderr ?? '',
      status: e.status ?? null,
      signal: e.signal,
      timedOut: e.killed === true && e.signal === 'SIGKILL'
    });
  });
});

const uncaughtRe = /^Uncaught ([A-Za-z_$][0-9A-Za-z_$]*)(?:: ?(.*))?$/m;

// result: 0 pass, 2 nativeError, 3 compileError, 4 fail, 5 timeout, 6 runtimeError
// (same numbering as index.js; 1/todo is unused there too)
const runTest = async (file, slot) => {
  const test = await readOne(test262Path, file, file.startsWith('harness/') ? preludes : fastPreludes);
  if (!test) return { result: 3 };

  fs.writeFileSync(slot.js, parseOnly
    ? (test.flags.onlyStrict && !test.flags.raw ? '"use strict";\n' : '') + test.body
    : test.contents);

  // compile js -> c via the selfhosted compiler. -d so uncaught throws in the
  // compiled test print "Uncaught <Type>: <message>" (how runtime errors are
  // classified), -quiet to suppress stage timing logs
  let t = profile ? performance.now() : 0;
  const comp = await execAsync(selfhostBin, [ 'c', slot.js, slot.c, '-d', '-quiet', ...(parseOnly ? [ '-parse-only' ] : []), test.flags.module ? '-module' : '-no-module' ]);
  if (profile) slot.compileMs += performance.now() - t;

  if (parseOnly) {
    if (comp.timedOut) return { result: 5, error: { name: 'Error', message: `parse timed out after ${execTimeout}ms` } };

    const ok = comp.status === 0;
    const uncaught = ok ? null : comp.stderr.match(uncaughtRe);
    const isSyntax = uncaught?.[1] === 'SyntaxError';
    const err = ok ? undefined : { name: uncaught?.[1] ?? 'CompilerCrash', message: uncaught?.[2] ?? (comp.signal ? `killed by ${comp.signal}` : `exited with code ${comp.status}`), stack: comp.stderr.trim() };

    const expectFail = test.negative && test.negative.phase === 'parse';
    if (expectFail) return { result: !ok && isSyntax ? 0 : 4, error: err };
    if (ok) return { result: 0 };
    return { result: isSyntax ? 4 : 3, error: err };
  }

  let stage = 0, error, log = '';

  if (comp.timedOut) return { result: 5, error: { name: 'Error', message: `compiler timed out after ${execTimeout}ms` } };

  if (comp.status !== 0) {
    // the selfhosted compiler rejected (or crashed on) the test: stage 0.
    // an Uncaught line is the compiler's own JS-level throw (SyntaxError etc);
    // anything else (signal/exit) is a compiler crash
    const uncaught = comp.stderr.match(uncaughtRe);
    error = uncaught ? { name: uncaught[1], message: uncaught[2] ?? '', stack: comp.stderr.trim() }
      : { name: 'CompilerCrash', message: comp.signal ? `killed by ${comp.signal}` : `exited with code ${comp.status}`, stack: comp.stderr.trim() };
  } else {
    // exec the C via tcc server / tcc -run / cc + temp binary
    let res;
    t = profile ? performance.now() : 0;
    if (tccServer) {
      res = await slot.tccExec([ ...tccArgs, slot.c ]);
    } else if (hasTcc) {
      res = await execAsync(...stackWrap(tcc, [ ...tccArgs, slot.c ]));
    } else {
      const comp2 = await execAsync(cc[0], [ ...cc.slice(1), ...(cc.some(x => x.startsWith('-O')) ? [] : [ '-O0' ]), ...(process.platform === 'darwin' ? [ '-Wl,-stack_size,0x4000000' ] : []), '-w', '-xc', slot.c, '-o', slot.bin, '-lm' ]);
      res = comp2.status !== 0 ? { ...comp2, stdout: '', nativeCompileError: !comp2.timedOut } : await execAsync(slot.bin, []);
    }
    if (profile) slot.execMs += performance.now() - t;
    if (res.status !== 0 && !res.timedOut && res.nativeCompileError === undefined)
      res.nativeCompileError = /^[^\n]*:\d+: error:|^tcc: error:/m.test(res.stderr);

    log = res.stdout ?? '';

    if (res.timedOut) {
      stage = 1;
      error = { name: 'Error', message: `script execution timed out after ${execTimeout}ms`, code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' };
    } else if (res.status === 0) {
      stage = 2;
    } else {
      const uncaught = res.stderr.match(uncaughtRe);
      if (uncaught) {
        stage = 1;
        error = { name: uncaught[1], message: uncaught[2] ?? '', stack: res.stderr.trim() };
      } else if (res.nativeCompileError) {
        // the C compiler rejected the generated C: stage 0 + CompileError -> native compile error
        error = { name: 'CompileError', message: res.stderr.trim().split('\n')[0] ?? '', stack: res.stderr.trim() };
      } else {
        stage = 1;
        error = { name: 'RuntimeError', message: res.signal ? `killed by ${res.signal}` : `exited with code ${res.status}`, stack: res.stderr.trim() };
      }
    }
  }

  if (log.includes('Test262:AsyncTestFailure')) {
    stage = 1;
    error = { name: 'Error', message: 'Test262 AsyncTestFailure' };
  }

  let pass = stage === 2;

  // todo: parse vs runtime expected (same as index.js)
  const negative = test.negative;
  if (negative) {
    if (negative.type) pass = error?.name === negative.type;
      else pass = !pass;
  }

  let result = 0;
  if (!pass) {
    if (stage === 0) {
      result = error?.name === 'CompileError' ? 2 : 3;
    } else if (stage === 1) {
      if (error?.name === 'Test262Error') result = 4;
        else if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') result = 5;
        else result = 6;
    } else {
      result = 4;
    }
  }

  return { result, error };
};

const runIconTable = [ '🤠', '📝', '🏗️', '💥', '❌', '⏰', '💀' ];
const files = [ [], , [], [], [], [], [] ]; // per-result file lists (1/todo unused)
let total = 0;
const counts = [ 0, 0, 0, 0, 0, 0, 0 ];
const errors = new Map();

const record = (file, { result, error }) => {
  total++;
  counts[result]++;
  files[result].push(file);

  if (trackErrors && result !== 0 && error) {
    const errorStr = `${error.name}: ${error.message}`;
    errors.set(errorStr, (errors.get(errorStr) ?? 0) + 1);
  }

  if (logErrors) {
    const e = result !== 0 && error ? (error.stack || `${error.name}: ${error.message}`) : '';
    console.log(`[${result === 0 ? '92' : '91'}m${runIconTable[result]} ${file}[0m${e ? `\n${e}` : ''}`);
  }
};

const totalTests = tests.length;
let lastDraw = 0;
const draw = final => {
  if (logErrors) return;
  const now = performance.now();
  if (!final && now - lastDraw < 100) return;
  lastDraw = now;
  const percent = ((total / totalTests) * 100).toFixed(1);
  process.stdout.write(`\r${' '.repeat(110)}\r[1m${percent}%[0m [90m|[0m 🧪 ${total} [90m|[0m 🤠 ${counts[0]} [90m|[0m ❌ ${counts[4]} [90m|[0m 💀 ${counts[6]} [90m|[0m 🏗️ ${counts[2]} [90m|[0m 💥 ${counts[3]} [90m|[0m ⏰ ${counts[5]}`);
};

process.stdout.write(`\r${' '.repeat(60)}\r[90mrunning ${totalTests} tests, ${threads} slots${tccServer ? ', tcc server' : ''}, ${selfhostBin}[0m\n`);

let next = 0;
const runSlot = async id => {
  const slot = {
    js: join(os.tmpdir(), `porffor-t262self-${process.pid}-${id}.js`),
    c: join(os.tmpdir(), `porffor-t262self-${process.pid}-${id}.c`),
    bin: join(os.tmpdir(), `porffor-t262self-${process.pid}-${id}`),
    tccExec: tccServer ? makeTccClient() : null,
    compileMs: 0,
    execMs: 0
  };

  while (next < totalTests) {
    const file = tests[next++];
    record(file, await runTest(file, slot));
    draw();
  }

  for (const x of [ slot.js, slot.c, slot.bin ]) try {
    fs.rmSync(x, { force: true });
  } catch {}

  return slot;
};

const slots = await Promise.all(Array.from({ length: Math.max(1, Math.min(threads, totalTests)) }, (_, i) => runSlot(i)));

for (const file of skippedTimeouts) {
  total++;
  counts[5]++;
  files[5].push(file);
}

draw(true);
shutdownTccServer();

const [ passes, , nativeErrors, compileErrors, fails, timeouts, runtimeErrors ] = counts;
const percent = parseFloat(((passes / total) * 100).toFixed(2));

const lastTotal = [ 'passes', 'fails', 'runtimeErrors', 'nativeErrors', 'compileErrors', 'timeouts' ].reduce((acc, x) => acc + (lastResults[x]?.length ?? 0), 0);
const lastPercent = lastTotal === 0 ? null : parseFloat((((lastResults.passes?.length ?? 0) / lastTotal) * 100).toFixed(2));
const percentChange = lastPercent == null ? 0 : parseFloat((percent - lastPercent).toFixed(2));

console.log(`\n\n[1mselfhost ${whatTests || 'test262'}: ${passes}/${total} passed - ${percent.toFixed(2)}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''}[0m`);
console.log(`  🤠 ${passes} [90m|[0m ❌ ${fails} [90m|[0m 💀 ${runtimeErrors} [90m|[0m 🏗️ ${nativeErrors} [90m|[0m 💥 ${compileErrors} [90m|[0m ⏰ ${timeouts}`);

const printList = (title, list, cap = 50) => {
  if (list.length === 0) return;
  console.log(`\n[4m${title}[0m (${list.length})`);
  for (const x of list.slice(0, cap)) console.log(x);
  if (list.length > cap) console.log(`[90m... and ${list.length - cap} more[0m`);
};

// diff against the previous selfhosted run
if (lastResults.passes) {
  const lastPassSet = new Set(lastResults.passes);
  const passSet = new Set(files[0]);
  const testSet = new Set(tests);
  printList('new passes (vs last selfhost run)', files[0].filter(x => !lastPassSet.has(x)));
  printList('new fails (vs last selfhost run)', lastResults.passes.filter(x => testSet.has(x) && !passSet.has(x)));
}

// divergence against the node-hosted baseline: same test, different outcome.
// this is the interesting part - selfhosted compiler bugs show up here
if (nodeResults.passes) {
  const cats = [ [ 'passes', 0 ], [ 'nativeErrors', 2 ], [ 'compileErrors', 3 ], [ 'fails', 4 ], [ 'timeouts', 5 ], [ 'runtimeErrors', 6 ] ];
  const nodeCat = new Map();
  for (const [ k, v ] of cats) for (const x of nodeResults[k] ?? []) nodeCat.set(x, v);

  const catName = [ 'pass', 'todo', 'nativeError', 'compileError', 'fail', 'timeout', 'runtimeError' ];
  const divergence = [];
  for (const [ , v ] of cats) {
    for (const x of files[v]) {
      const nv = nodeCat.get(x);
      if (nv !== undefined && nv !== v) divergence.push({ file: x, node: catName[nv], selfhost: catName[v] });
    }
  }

  const worse = divergence.filter(x => x.node === 'pass');
  const better = divergence.filter(x => x.selfhost === 'pass');
  const other = divergence.length - worse.length - better.length;
  console.log(`\n[1mvs node-hosted baseline:[0m ${divergence.length === 0 ? 'no divergence 🎉' : `${divergence.length} tests differ (${worse.length} worse, ${better.length} better, ${other} other)`}`);
  printList('selfhost worse (node passes, selfhost does not)', worse.map(x => `${x.file} [90m(${x.selfhost})[0m`));
  printList('selfhost better (selfhost passes, node does not)', better.map(x => `${x.file} [90m(node: ${x.node})[0m`), 20);

  fs.writeFileSync(diffPath, JSON.stringify({ divergence, generatedAt: new Date().toISOString() }));
  if (divergence.length > 0) console.log(`[90mfull divergence list: ${diffPath}[0m`);
}

if ((whatTests === '' || process.argv.includes('--write-results')) && !dontWriteResults) {
  // keep the previous run for `--diff` run-over-run comparison
  if (fs.existsSync(resultsPath)) fs.copyFileSync(resultsPath, prevResultsPath);
  fs.writeFileSync(resultsPath, JSON.stringify({
    passes: files[0],
    fails: files[4],
    runtimeErrors: files[6],
    compileErrors: files[3],
    nativeErrors: files[2],
    timeouts: files[5],
    total
  }));
}

if (trackErrors) {
  console.log();
  for (const x of [ ...errors.keys() ].sort((a, b) => errors.get(a) - errors.get(b))) {
    console.log(`${errors.get(x).toString().padStart(4, ' ')} ${x}`);
  }
}

if (profile) {
  const compileMs = slots.reduce((acc, x) => acc + x.compileMs, 0);
  const execMs = slots.reduce((acc, x) => acc + x.execMs, 0);
  console.log(`\n[4mprofile[0m\ncompile (selfhosted porf): ${(compileMs / 1000).toFixed(1)}s total, ${(compileMs / totalTests).toFixed(1)}ms/test\nexec (tcc compile+run): ${(execMs / 1000).toFixed(1)}s total, ${(execMs / totalTests).toFixed(1)}ms/test`);
}

const took = performance.now() - veryStart;
console.log(`[90mtook ${took > 60000 ? `${Math.floor(took / 60000)}m ` : ''}${(took / 1000 % 60) | 0}s[0m`);

if (expectedPasses !== undefined && passes !== +expectedPasses) {
  console.error(`expected ${expectedPasses} passes, got ${passes}`);
  process.exit(1);
}

// slot sockets and the (already shut down) tcc server child would otherwise
// keep the event loop alive
process.exit(0);
