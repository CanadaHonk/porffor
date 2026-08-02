import cluster from 'node:cluster';
import { execSync, execFile, execFileSync, spawnSync, spawn as spawnProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { log } from '../compiler/log.js';
import readTest262, { readOne } from './read.js';

const __dirname = import.meta.dirname;

let resultOnly = process.env.RESULT_ONLY;

const workerDataPath = '/tmp/workerData.json';
// --parse-only: only parse each test (no codegen/exec), pass = parse outcome matches
// the test's expectation (negative phase: parse). results kept in separate files
const parseOnly = process.argv.includes('--parse-only');
const resultsPath = join(__dirname, parseOnly ? 'parse-results.json' : 'results.json');
const diffPath = join(__dirname, parseOnly ? 'parse-diff.json' : 'diff.json');
const changedSetPath = join(__dirname, parseOnly ? 'parse-changed-set.json' : 'changed-set.json');
const execTimeout = 10000;
const stackSoftLimit = () => {
  try {
    const soft = execSync('ulimit -s', { encoding: 'utf8' }).trim();
    return soft === 'unlimited' ? Infinity : parseInt(soft);
  } catch {
    return 0;
  }
};

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
const resolveTcc = () => resolveTccPath(process.env.PORFFOR_TEST262_TCC ?? process.env.TCC ?? 'tcc');

const tccArgs = [ '-w', '-lm', '-run' ];

if (cluster.isPrimary) {
  // raise the stack soft limit to 64MB (matching porf native's -Wl,-stack_size)
  // once here so workers and their tcc -run children inherit it, instead of
  // paying for a per-test sh wrapper; node cannot setrlimit so re-exec under sh
  if (process.platform === 'darwin' && !process.env.PORFFOR_TEST262_ULIMIT && stackSoftLimit() < 65520) {
    const { status, error } = spawnSync('/bin/sh', [ '-c', 'ulimit -s 65520 2>/dev/null; export PORFFOR_TEST262_ULIMIT=1; exec "$0" "$@"', process.execPath, ...process.argv.slice(1) ], { stdio: 'inherit' });
    if (!error) process.exit(status ?? 0);
  }

  const veryStart = performance.now();

  const test262Path = join(__dirname, 'test262');
  let whatTests = process.argv.slice(2).find(x => x[0] !== '-') ?? '';
  if (whatTests.endsWith('/')) whatTests = whatTests.slice(0, -1);
  const changedOnly = process.argv.includes('--changed');
  const filesArg = process.argv.find(x => x.startsWith('--files='));
  const readJson = path => fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
  const existingResults = readJson(resultsPath);
  const changedSet = changedOnly ? readJson(changedSetPath) : {};
  const files = filesArg ? JSON.parse(fs.readFileSync(filesArg.slice('--files='.length), 'utf8')) : (changedOnly ? (changedSet.files ?? []) : null);
  const skipArg = process.argv.find(x => x.startsWith('--skip='));
  const skipSpecs = skipArg ? skipArg.slice('--skip='.length).split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean) : [];
  const skipMatches = file => skipSpecs.some(x => file === x || (!x.endsWith('.js') && file.startsWith(x + '/')));
  if (changedOnly && files.length === 0) {
    console.error(`no changed tests found in ${changedSetPath}`);
    process.exit(1);
  }

  if (whatTests.endsWith('.js')) {
    // single test, automatically add debug args
    process.argv.push('--log-errors');
  }

  let threads = parseInt(process.argv.find(x => x.startsWith('--threads='))?.split('=')?.[1]);
  if (Number.isNaN(threads)) try {
    threads = parseInt(fs.readFileSync(join(__dirname, '.threads'), 'utf8'));
  } catch {
    threads = Math.min(12, os.cpus().length) - 4;
    log.warning('test262', `no --threads=n arg or .threads file found, using ${threads} as cautious default (min(12, threads) - 4)`);
    log.warning('test262', 'please specify via either method to make test262 runs potentially much faster! (ask for tuning advice)');
  }

  if (process.argv.includes('--open')) execSync(`cursor ${test262Path}/test/${whatTests}`);

  let minimal = process.argv.includes('--minimal');
  if (minimal) resultOnly = true;
  const lastResults = changedOnly ? (changedSet.results ?? {}) : existingResults;
  const compareResults = results => {
    const total = results.total ?? [ 'passes', 'fails', 'runtimeErrors', 'nativeErrors', 'compileErrors', 'timeouts' ].reduce((acc, x) => acc + (results[x]?.length ?? 0), 0);
    const passes = results.passes?.length ?? 0;
    return [
      total === 0 ? 0 : parseFloat(((passes / total) * 100).toFixed(2)),
      total,
      passes,
      results.fails?.length ?? 0,
      results.runtimeErrors?.length ?? 0,
      results.nativeErrors?.length ?? 0,
      results.compileErrors?.length ?? 0,
      results.timeouts?.length ?? 0
    ];
  };
  const compareGitResults = () => execSync(`git log -200 --pretty=%B`).toString().split('\n').find(x => x.startsWith('test262: 1') || x.startsWith('test262: 2') || x.startsWith('test262: 3') || x.startsWith('test262: 4') || x.startsWith('test262: 5') || x.startsWith('test262: 6')).split('|').map(x => parseFloat(x.split('(')[0].trim().split(' ').pop().trim().replace('%', '')));
  let compareBaseline = minimal ? [] : (process.argv.includes('--compare-git') ? compareGitResults() : compareResults(existingResults));

  if (!resultOnly && !process.argv.includes('--json-results')) process.stdout.write('\u001b[90mreading tests...\u001b[0m');

  // schedule last run's timeouts first; drop any that no longer exist
  const timeoutsFirst = (lastResults.timeouts ?? []).filter(x => fs.existsSync(join(test262Path, 'test', x)));
  let tests = await readTest262(test262Path, files ?? whatTests, timeoutsFirst).catch(() => []);

  // --skip-timeouts: do not run last run's timeouts, just report them as timeouts again
  let skippedTimeouts = [];
  if (process.argv.includes('--skip-timeouts') && lastResults.timeouts) {
    const lastTimeoutSet = new Set(lastResults.timeouts);
    skippedTimeouts = tests.filter(x => lastTimeoutSet.has(x));
    tests = tests.filter(x => !lastTimeoutSet.has(x));
  }
  const skippedReuse = skipSpecs.length > 0 ? tests.filter(skipMatches) : [];
  if (skippedReuse.length > 0) tests = tests.filter(x => !skipMatches(x));
  if (tests.length === 0 && skippedTimeouts.length === 0 && skippedReuse.length === 0) {
    console.error(`\rno tests found matching ${whatTests}`);
    process.exit(1);
  }
  if (!resultOnly && !process.argv.includes('--json-results')) process.stdout.write(`\r${' '.repeat(60)}\r\u001b[90mcaching tests to tmp...\u001b[0m`);

  fs.writeFileSync(workerDataPath, JSON.stringify(tests));

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
    if (process.env.PORFFOR_TEST262_TCC_SERVER) return;

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

      tccServerSock = join(os.tmpdir(), `porffor-test262-tcc-${process.pid}.sock`);
      let stderr = '';
      tccServer = spawnProcess(tccServerPath, [ '--run-server', tccServerSock, `--timeout-ms=${execTimeout}` ], { stdio: [ 'ignore', 'ignore', 'pipe' ] });
      tccServer.stderr.on('data', x => { if (stderr.length < 4096) stderr += x; });

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
        const timeout = setTimeout(() => finish(false), 1000);
        tccServer.once('exit', onExit);
      });

      if (ready) break;

      try {
        tccServer.kill('SIGKILL');
      } catch {}
      tccServer = null;
      if (process.argv.includes('--log-tcc-server') && stderr.trim()) console.error(stderr.trim());
    }

    if (!tccServer) return;

    process.env.PORFFOR_TEST262_TCC = tccServerPath;
    process.env.PORFFOR_TEST262_TCC_SERVER = tccServerSock;
    process.once('exit', shutdownTccServer);
    process.once('SIGINT', () => {
      shutdownTccServer();
      process.exit(130);
    });
  };

  await startTccServer();

  if (!resultOnly && !process.argv.includes('--json-results')) process.stdout.write(`\r${' '.repeat(60)}\r\u001b[90mstarting ${threads} runners${tccServer ? ' with tcc server' : ''}...\u001b[0m`);

  const profile = process.argv.includes('--profile');
  if (profile) process.argv.push('--profile-compiler');

  const perTestProfile = {};
  const profileStats = new Array(6).fill(0);

  const trackErrors = process.argv.includes('--errors');
  const onlyTrackCompilerErrors = process.argv.includes('--compiler-errors-only');
  const logErrors = process.argv.includes('--log-errors');
  const dontWriteResults = process.argv.includes('--dont-write-results');
  const plainResults = process.argv.includes('--plain-results');
  const jsonResults = process.argv.includes('--json-results');
  const stopOnTimeout = process.argv.includes('--stop-on-timeout');
  const jsonProgressEvery = parseInt(process.argv.find(x => x.startsWith('--json-progress='))?.split('=')?.[1] ?? '0');

  const runIconTable = plainResults ? [ 'pass:', 'todo:', 'native compile error:', 'compile error:', 'fail:', 'timeout:', 'runtime error:' ] : [ '🤠', '📝', '🏗️', '💥', '❌', '⏰', '💀' ];
  const table = (overall, ...arr) => {
    let out = '';
    for (let i = 0; i < arr.length; i++) {
      let icon = [ '🧪', '🤠', '❌', '💀', '🏗️', '💥', '⏰', '📝' ][i];
      let iconDesc = [ 'total', 'pass', 'fail', 'runtime error', 'native compile error', 'compile error', 'timeout', 'todo' ][i];
      // let color = resultOnly ? '' : ['', '\u001b[42m', '\u001b[43m', '\u001b[101m', '\u001b[41m', '\u001b[41m', '\u001b[101m', todoTime === 'runtime' ? '\u001b[101m' : '\u001b[41m'][i];
      // let color = resultOnly ? '' : ('\u001b[1m' + ['', '\u001b[32m', '\u001b[33m', '\u001b[91m', '\u001b[31m', '\u001b[31m', '\u001b[91m', todoTime === 'runtime' ? '\u001b[91m' : '\u001b[31m'][i]);

      let change = arr[i] - compareBaseline[i + 1];
      // let str = `${color}${icon} ${arr[i]}${resultOnly ? '' : '\u001b[0m'}${overall && change !== 0 ? ` (${change > 0 ? '+' : ''}${change})` : ''}`;
      let str = `${resultOnly ? '' : '\u001b[1m'}${plainResults ? iconDesc : icon} ${arr[i]}${resultOnly ? '' : '\u001b[0m'}${overall && change !== 0 ? ` (${change > 0 ? '+' : ''}${change})` : ''}`;

      if (i !== arr.length - 1) str += resultOnly ? ' | ' : '\u001b[90m | \u001b[0m';
      out += str;
    }

    return out;
  };

  const bar = (barWidth, ...arr) => {
    const total = arr[0];

    let out = '';
    for (let i = 1; i < arr.length; i++) {
      const color = [ '\u001b[42m', '\u001b[43m', '\u001b[101m', '\u001b[41m', '\u001b[46m' ][i - 1];

      const width = Math.round((arr[i] / total) * barWidth);

      const label = arr[i].toString();
      const showLabel = width > (label.length + 2);

      out += `${color}\u001b[97m${showLabel ? (' ' + label) : ''}${' '.repeat(width - (showLabel ? (label.length + 1) : 0))}\u001b[0m`;
    }

    return out;
  };

  let spinner = ['-', '\\', '|', '/'], spin = 0;

  const start = performance.now();

  const passFiles = [], failFiles = [], runtimeErrorFiles = [], nativeErrorFiles = [], compileErrorFiles = [], timeoutFiles = [];
  let dirs = new Map(), features = new Map(), errors = new Map(), pagesUsed = new Map();
  let total = 0, passes = 0, fails = 0, compileErrors = 0, nativeErrors = 0, runtimeErrors = 0, timeouts = 0;

  const lastPassSet = new Set(lastResults.passes ?? []);
  const lastFailSet = new Set(lastResults.fails ?? []);
  const lastRuntimeErrorSet = new Set(lastResults.runtimeErrors ?? []);
  const lastCompileErrorSet = new Set(lastResults.compileErrors ?? []);
  const lastNativeErrorSet = new Set(lastResults.nativeErrors ?? []);
  const lastTimeoutSet = new Set(lastResults.timeouts ?? []);
  const lastResultFor = file => {
    if (lastPassSet.has(file)) return 0;
    if (lastNativeErrorSet.has(file)) return 2;
    if (lastCompileErrorSet.has(file)) return 3;
    if (lastTimeoutSet.has(file)) return 5;
    if (lastRuntimeErrorSet.has(file)) return 6;
    return 4;
  };
  const recordDirResult = (file, result) => {
    const dir = file.slice(0, file.indexOf('/'));
    if (!dirs.has(dir)) dirs.set(dir, [0, 0, 0, 0, 0, 0, 0, 0]);

    const o = dirs.get(dir);
    o[0] += 1;
    o[result + 1] += 1;
  };
  const recordSkippedResult = (file, result) => {
    total++;
    recordDirResult(file, result);

    if (result === 0) {
      passes++;
      passFiles.push(file);
    } else if (result === 2) {
      nativeErrors++;
      nativeErrorFiles.push(file);
    } else if (result === 3) {
      compileErrors++;
      compileErrorFiles.push(file);
    } else if (result === 4) {
      fails++;
      failFiles.push(file);
    } else if (result === 5) {
      timeouts++;
      timeoutFiles.push(file);
    } else {
      runtimeErrors++;
      runtimeErrorFiles.push(file);
    }
  };

  if (logErrors) threads = 1;

  const allTests = whatTests === '' && threads > 1;
  if (!resultOnly && !jsonResults && !allTests) console.log();

  let lastPercent = 0;
  let lastJsonProgress = 0;

  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });

  const totalTests = tests.length;
  if (totalTests === 0) resolve();

  const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');
  const printList = (title, files) => {
    console.log(`\n\n\u001b[4m${title}\u001b[0m\n${files.join('\n')}\n`);
  };

  // tests are dispatched in blocks so workers can pipeline: codegen the next test
  // while the previous one executes. the credit window is refilled per result
  let queue = 0;
  let statsPending = 0;
  const blockSize = 8;
  const nextIndex = () => queue < totalTests ? queue++ : null;

  const workerStates = [];
  let tuiTimer = null;
  let stoppedOnTimeout = false;
  const stopForTimeout = file => {
    if (stoppedOnTimeout) return;
    stoppedOnTimeout = true;
    if (tuiTimer) clearInterval(tuiTimer);
    if (allTests && drawnLines !== 0) process.stdout.write(`\u001b[${drawnLines}F\u001b[0J`);
    console.error(`timeout: ${file}`);
    for (const id in cluster.workers) {
      try {
        cluster.workers[id]?.kill();
      } catch {}
    }
    shutdownTccServer();
    process.exit(1);
  };

  // per-bucket pass-ratio graph: one column per bucket of finished results;
  // half-blocks for 2x vertical res
  const graphW = Math.max(20, process.stdout.columns ?? 120);
  const graphRows = 8;
  const bucketSize = Math.max(1, Math.ceil(totalTests / graphW));
  const bucketTotals = [];
  const bucketCounts = [];

  const spawn = (slot = workerStates.length) => {
    const worker = cluster.fork();

    const inflight = [];
    const state = workerStates[slot] = { inflight, last: performance.now(), done: false };
    let flushed = false;

    const fill = () => {
      const batch = [];
      while (inflight.length + batch.length < blockSize) {
        const i = nextIndex();
        if (i === null) break;
        batch.push(i);
      }

      if (batch.length > 0) {
        inflight.push(...batch);
        worker.send(batch);
      } else if (inflight.length === 0 && !flushed) {
        flushed = true;
        state.done = true;
        if (trackErrors || profile) {
          if (profile) statsPending++;
          worker.send(null);
        } else {
          worker.kill();
        }
      }
    };

    worker.on('message', int => {
      state.last = performance.now();

      if (int == null) {
        fill();
        return;
      }

      if (typeof int !== 'number') {
        if (typeof int === 'string') {
          console.log(int);
          return;
        }

        if (trackErrors) {
          for (const x in int) {
            errors.set(x, (errors.get(x) ?? 0) + int[x]);
          }
        }

        if (profile && int.profileStats) {
          Object.assign(perTestProfile, int.perTestProfile);

          const ps = int.profileStats;
          for (let i = 0; i < ps.length; i++) profileStats[i] += ps[i];
          statsPending--;
        }

        if (total === totalTests && statsPending === 0) resolve();
        return;
      }

      const result = int & 0b1111;
      const i = int >> 4;
      const file = tests[i];

      const pos = inflight.indexOf(i);
      if (pos !== -1) inflight.splice(pos, 1);
      if (stopOnTimeout && result === 5) stopForTimeout(file);
      fill();

      // result: pass, todo, nativeError, compileError, fail, timeout, runtimeError
      total++;
      const pass = result === 0;

      if (allTests) {
        const bucket = Math.floor((total - 1) / bucketSize);
        bucketTotals[bucket] = (bucketTotals[bucket] ?? 0) + 1;
        const counts = bucketCounts[bucket] ??= [0, 0, 0, 0];
        if (pass) counts[0]++;
        else if (result === 4) counts[1]++;
        else if (result === 2 || result === 3) counts[3]++;
        else counts[2]++;
      }

      if (pass) {
        passes++;
        if (!resultOnly) passFiles.push(file);
      } else if (result === 2) {
        nativeErrors++;
        if (!resultOnly) nativeErrorFiles.push(file);
      } else if (result === 3) {
        compileErrors++;
        if (!resultOnly) compileErrorFiles.push(file);
      } else if (result === 4) {
        fails++;
        if (!resultOnly) failFiles.push(file);
      } else if (result === 5) {
        timeouts++;
        if (!resultOnly) timeoutFiles.push(file);
      } else {
        runtimeErrors++;
        if (!resultOnly) runtimeErrorFiles.push(file);
      }

      if (jsonResults && jsonProgressEvery > 0 && total - lastJsonProgress >= jsonProgressEvery) {
        console.log(JSON.stringify({
          progress: true,
          total,
          counts: { passes, fails, runtimeErrors, nativeErrors, compileErrors, timeouts }
        }));
        lastJsonProgress = total;
      }

      if (!resultOnly && !jsonResults && !logErrors) {
        const percent = ((total / tests.length) * 100);
        if (allTests) {
          if (percent > lastPercent) {
            redraw();
            lastPercent = percent + 0.1;
          }
        } else {
          process.stdout.write(`\r${' '.repeat(100)}\r\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% |\u001b[0m \u001b[${pass ? '92' : (result === 4 ? '93' : (result === 5 ? '90' : '91'))}m${runIconTable[result]} ${file}\u001b[0m\n`);

          if (threads === 1 && tests[i + 1]) {
            const nextFile = tests[i + 1];
            process.stdout.write(`\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% | ${nextFile}\u001b[0m`);
          }
        }

        recordDirResult(file, result);
      }

      if (total === totalTests && !trackErrors && !(profile && statsPending > 0)) resolve();
    });
  };

  // full-run tui: progress bar + counts + one status line per worker (current test,
  // in-flight count, seconds since its last result once it looks stalled)
  let drawnLines = 0;
  const redraw = () => {
    const percent = (total / totalTests) * 100;
    const cols = process.stdout.columns ?? 120;
    const now = performance.now();

    const tab = `  \u001b[1m${spinner[spin++ % 4]} ${percent.toFixed(1)}%\u001b[0m    ` +
      table(false, total, passes, fails, runtimeErrors, nativeErrors, compileErrors, timeouts);

    const graphFg = [32, 33, 91, 31];
    const graphBg = [42, 43, 101, 41];
    const graphCell = (upper, lower) => upper === lower
      ? `\u001b[${graphBg[upper]}m \u001b[0m`
      : `\u001b[${graphFg[upper]};${graphBg[lower]}m▀\u001b[0m`;
    const graphCategory = (counts, slot) => {
      const scale = graphRows * 2;
      const target = (slot + 0.5) / scale * counts.reduce((a, b) => a + b, 0);
      let acc = 0;
      for (let i = 0; i < counts.length; i++) {
        acc += counts[i];
        if (target < acc) return i;
      }
      return counts.length - 1;
    };

    let graph = '';
    for (let r = 0; r < graphRows; r++) {
      let line = '';
      for (let c = 0; c < graphW; c++) {
        const counts = bucketCounts[c];
        if (counts === undefined) { line += ' '; continue; }

        const lower = graphCategory(counts, (graphRows - 1 - r) * 2);
        const upper = graphCategory(counts, (graphRows - 1 - r) * 2 + 1);
        line += graphCell(upper, lower);
      }
      graph += line + '\n';
    }

    let workers = '';
    for (let i = 0; i < workerStates.length; i++) {
      const w = workerStates[i];
      if (!w || w.done) {
        workers += `\u001b[90mw${i} idle\u001b[0m\n`;
        continue;
      }

      let file = w.inflight.length > 0 ? tests[w.inflight[0]] : '...';
      if (file.length > cols - 24) file = '…' + file.slice(-(cols - 25));
      const age = (now - w.last) / 1000;
      const ageStr = age > 2 ? ` \u001b[${age > 8 ? '91' : '93'}m${age.toFixed(1)}s\u001b[0m` : '';
      workers += `\u001b[90mw${i}\u001b[0m ${file} \u001b[90m(${w.inflight.length})\u001b[0m${ageStr}\n`;
    }

    process.stdout.write(
      (drawnLines !== 0 ? `\u001b[${drawnLines}F\u001b[0J` : `\r${' '.repeat(100)}\r`) +
      bar([...noAnsi(tab)].length + 8, total, passes, fails, runtimeErrors + timeouts, compileErrors + nativeErrors, 0) +
      '\n' + tab + '\n\n' + graph + '\n' + workers
    );
    drawnLines = 4 + graphRows + workerStates.length;
  };

  tuiTimer = allTests && !resultOnly && !jsonResults && !logErrors
    ? setInterval(redraw, 500) : null;

  if (totalTests > 0) for (let w = 0; w < threads; w++) spawn();

  await promise;
  if (tuiTimer) clearInterval(tuiTimer);

  for (const file of skippedTimeouts) recordSkippedResult(file, 5);
  for (const file of skippedReuse) recordSkippedResult(file, lastResultFor(file));

  const percent = parseFloat(((passes / total) * 100).toFixed(2));
  const percentChange = parseFloat((percent - compareBaseline[0]).toFixed(2));

  if (minimal) process.exit();

  if (resultOnly) {
    process.stdout.write(`test262: ${percent.toFixed(2)}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''} | `);
    console.log(table(true, total, passes, fails, runtimeErrors, nativeErrors, compileErrors, timeouts));
    process.exit();
  }

  if (jsonResults) {
    console.log(JSON.stringify({
      total,
      passes: passFiles,
      fails: failFiles,
      runtimeErrors: runtimeErrorFiles,
      compileErrors: compileErrorFiles,
      nativeErrors: nativeErrorFiles,
      timeouts: timeoutFiles,
      counts: { passes, fails, runtimeErrors, nativeErrors, compileErrors, timeouts }
    }));
    process.exit();
  }

  if (allTests && drawnLines !== 0) process.stdout.write(`\u001b[${drawnLines}F\u001b[0J`);
    else if (!jsonResults) console.log();

  const nextMinorPercent = parseFloat(((Math.floor(percent * 10) / 10) + 0.1).toFixed(1));
  const nextMajorPercent = Math.floor(percent) + 1;

  const togo = next => `${Math.floor((total * next / 100) - passes)} to go until ${next}%`;

  console.log(`\u001b[1m${changedOnly ? 'changed' : (whatTests || 'test262')}: ${passes}/${total} passed - ${percent.toFixed(2)}%${whatTests === '' && !changedOnly && percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''}\u001b[0m \u001b[90m(${togo(nextMinorPercent)}, ${togo(nextMajorPercent)})\u001b[0m`);
  const tab = table(whatTests === '' && !changedOnly, total, passes, fails, runtimeErrors, nativeErrors, compileErrors, timeouts);
  console.log(bar([...noAnsi(tab)].length + 10, total, passes, fails, runtimeErrors + timeouts, compileErrors + nativeErrors, 0));
  process.stdout.write('  ');
  console.log(tab);

  console.log();

  if (whatTests === '' || changedOnly) {
    if (!changedOnly) for (const dir of dirs.keys()) {
      const results = dirs.get(dir);
      process.stdout.write(' '.repeat(6) + dir + ' '.repeat(14 - dir.length));

      const [ total, pass, todo, nativeError, compileError, fail, timeout, runtimeError ] = results;
      console.log(bar(120, total, pass, fail, runtimeError + timeout, compileError + nativeError, 0));
      process.stdout.write(' '.repeat(6) + ' '.repeat(14 + 2));
      console.log(table(false, total, pass, fail, runtimeError, nativeError, compileError, timeout, todo));
      console.log();
    }

    const scope = changedOnly ? new Set(files) : null;
    const inScope = arr => scope ? arr.filter(x => scope.has(x)) : arr;
    const lastPasses = inScope(lastResults.passes ?? []);
    const lastCompileErrors = inScope(lastResults.compileErrors ?? []);
    const lastNativeErrors = inScope(lastResults.nativeErrors ?? []);
    const lastTimeouts = inScope(lastResults.timeouts ?? []);

    const diff = {
      newCompileErrors: lastResults.compileErrors ? compileErrorFiles.filter(x => !lastCompileErrors.includes(x)) : [],
      newNativeErrors: lastResults.nativeErrors ? nativeErrorFiles.filter(x => !lastNativeErrors.includes(x)) : [],
      newPasses: lastResults.passes ? passFiles.filter(x => !lastPasses.includes(x)) : [],
      newFails: lastResults.passes ? lastPasses.filter(x => !passFiles.includes(x)) : [],
      newTimeouts: lastResults.timeouts ? timeoutFiles.filter(x => !lastTimeouts.includes(x)) : [],
      scope: changedOnly ? 'changed' : 'all',
      generatedAt: new Date().toISOString()
    };

    printList('new compile errors', diff.newCompileErrors);
    printList('new native compile errors', diff.newNativeErrors);
    printList('new passes', diff.newPasses);
    printList('new fails', diff.newFails);
    printList('new timeouts', diff.newTimeouts);

    fs.writeFileSync(diffPath, JSON.stringify(diff));

    if (!changedOnly) {
      const changedFiles = [ ...new Set([
        ...diff.newPasses,
        ...diff.newFails,
        ...diff.newCompileErrors,
        ...diff.newNativeErrors,
        ...diff.newTimeouts
      ]) ].sort();

      fs.writeFileSync(changedSetPath, JSON.stringify({
        files: changedFiles,
        results: {
          passes: passFiles.filter(x => changedFiles.includes(x)),
          fails: failFiles.filter(x => changedFiles.includes(x)),
          runtimeErrors: runtimeErrorFiles.filter(x => changedFiles.includes(x)),
          compileErrors: compileErrorFiles.filter(x => changedFiles.includes(x)),
          nativeErrors: nativeErrorFiles.filter(x => changedFiles.includes(x)),
          timeouts: timeoutFiles.filter(x => changedFiles.includes(x))
        },
        generatedAt: diff.generatedAt
      }));
    } else {
      fs.writeFileSync(changedSetPath, JSON.stringify({
        files,
        results: {
          passes: passFiles,
          fails: failFiles,
          runtimeErrors: runtimeErrorFiles,
          compileErrors: compileErrorFiles,
          nativeErrors: nativeErrorFiles,
          timeouts: timeoutFiles
        },
        generatedAt: changedSet.generatedAt,
        updatedAt: diff.generatedAt
      }));
    }

    if (!changedOnly && !dontWriteResults) fs.writeFileSync(resultsPath, JSON.stringify({ passes: passFiles, fails: failFiles, runtimeErrors: runtimeErrorFiles, compileErrors: compileErrorFiles, nativeErrors: nativeErrorFiles, timeouts: timeoutFiles, total }));
  }

  const timeStr = ms => {
    let s = ms / 1000;
    let out = '';
    if (s > 60) {
      out += `${Math.floor(s / 60)}m `;
      s = s % 60;
    }

    out += `${s | 0}s`;
    return out;
  };
  console.log(`\u001b[90mtook ${timeStr(performance.now() - start)}\u001b[0m`);

  if (trackErrors) {
    console.log('\n');

    for (const x of [...errors.keys()].sort((a, b) => errors.get(a) - errors.get(b))) {
      console.log(`${errors.get(x).toString().padStart(4, ' ')} ${x}`);
    }

    console.log();

    const errorsByClass = [...errors.keys()].reduce((acc, x) => {
      const k = x.slice(0, x.indexOf(':'));
      acc[k] = (acc[k] ?? 0) + errors.get(x);
      return acc;
    }, {});

    for (const x of Object.keys(errorsByClass).sort((a, b) => errorsByClass[b] - errorsByClass[a])) {
      console.log(`${errorsByClass[x].toString().padStart(4, ' ')} ${x}`);
    }
  }

  if (profile) {
    const longestTests = Object.keys(perTestProfile).sort((a, b) => perTestProfile[b] - perTestProfile[a])
      .slice(0, 10);

    const longestTestName = Math.max(...longestTests.map(x => x.length)) + 4;

    console.log('\n\n\x1b[4mlongest individual tests\x1b[0m');

    for (const x of longestTests) {
      // const profile = perTestProfile[x].map(x => x.toFixed(2) + 'ms');
      // console.log(`${x.replace('test/', '')}${' '.repeat(longestTestName - x.length)} \x1B[90m│\x1B[0m \x1B[1m${profile[0]} total\x1B[0m (parse: ${profile[1]}, codegen: ${profile[2]}, opt: ${profile[3]}, assemble: ${profile[4]})`);
      console.log(`${x}${' '.repeat(longestTestName - x.length)}\x1B[90m│\x1B[0m \x1B[1m${(perTestProfile[x] / 1000).toFixed(2)}s\x1B[0m`);
    }

    console.log('\n\x1b[4mtime spent on compiler stages\x1b[0m');

    let n = 0;
    const total = profileStats[n];
    for (const x of [ 'total', 'parse', 'codegen', 'render', 'cc compile', 'exec (tcc compile+run)' ]) {
      const y = profileStats[n++];
      console.log(`${x}\x1B[90m: \x1B[0m\x1B[1m${((y / total) * 100).toFixed(0)}%\x1B[0m (${(y / 1000 / threads).toFixed(2)}s)`);
    }
    console.log();
  }

  if (allTests && !changedOnly) {
    resultOnly = true;
    console.log(`\ntest262: ${percent.toFixed(2)}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''} | ` + table(true, total, passes, fails, runtimeErrors, nativeErrors, compileErrors, timeouts));
  }

  shutdownTccServer();
} else {
  const tests = JSON.parse(fs.readFileSync(workerDataPath, 'utf8'));
  const errors = {};

  const test262Path = join(__dirname, 'test262');

  // preludes come straight from the upstream test262 harness, plus our host globals.
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
  // messages. message TEXT only - comparison semantics, thrown error types and
  // control flow are untouched, so test results cannot change. harness/ self-
  // tests get the pristine preludes (some assert on message contents).
  // each replace is exact-match-once, falling back to pristine on upstream
  // changes. --pristine-harness opts out entirely
  const pristineHarness = process.argv.includes('--pristine-harness');
  let fastPreludes = preludes;
  if (!pristineHarness) {
    const r = (s, old, neu) => s.split(old).length === 2 ? s.replace(old, neu) : s;
    let a = preludes['assert.js'];

    // strings: plain quote wrap, no JSON machinery
    a = r(a, `return typeof JSON !== "undefined" ? JSON.stringify(value) : '"' + value + '"';`,
      `return '"' + value + '"';`);

    // objects/functions/symbols: static tags, no generic String()/Object.prototype.toString
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

    // no ToPrimitive of the caught error in the message
    a = r(a, `throw new Test262Error(message + ' (_isSameValue operation threw) ' + error);`,
      `throw new Test262Error(message + ' (_isSameValue operation threw)');`);

    // no constructor.name reads for message wording (the constructor CHECK is untouched)
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

    // no Array.prototype.map.call + String over elements
    a = r(a, `compareArray.format = function (arrayLike) {
  return "[" + Array.prototype.map.call(arrayLike, String).join(", ") + "]";
};`, `compareArray.format = function (arrayLike) {
  var s = "[";
  for (var i = 0; i < arrayLike.length; i++) s += (i ? ", " : "") + formatSimpleValue(arrayLike[i]);
  return s + "]";
};`);

    fastPreludes = { ...preludes, 'assert.js': a };
  }

  const parseOnly = process.argv.includes('--parse-only');
  const trackErrors = process.argv.includes('--errors');
  const onlyTrackCompilerErrors = process.argv.includes('--compiler-errors-only');
  const logErrors = process.argv.includes('--log-errors');
  const debugAsserts = process.argv.includes('--debug-asserts');
  const plainResults = process.argv.includes('--plain-results');
  const runIconTable = plainResults ? [ 'pass:', 'todo:', 'native compile error:', 'compile error:', 'fail:', 'timeout:', 'runtime error:' ] : [ '🤠', '📝', '🏗️', '💥', '❌', '⏰', '💀' ];

  await import('../compiler/prefs.js');
  const parse = (await import('../compiler/parse.js')).default;
  const codegen = (await import('../compiler/codegen.js')).default;
  const render = (await import('../compiler/render.js')).default;

  // use smaller page sizes internally (65536 / 4 = 16384), like compiler/index.js
  globalThis.pageSize = Prefs.pageSize ?? (65536 / 4);

  const profile = process.argv.includes('--profile');
  const perTestProfile = {};
  const profileStats = new Array(6).fill(0);

  // run tests via tcc -run: compiles and executes the C in-memory in a single
  // process, so no binary is ever written (writing + first-exec of a fresh
  // binary costs ~250ms on macOS). without tcc, fall back to CC + a temp binary
  let tcc = process.env.PORFFOR_TEST262_TCC ?? process.env.TCC ?? 'tcc';
  let hasTcc = true;
  try {
    tcc = resolveTcc();
  } catch {
    hasTcc = false;
  }
  const cc = (process.env.CC ?? 'cc').split(' ');
  const tmpBin = join(os.tmpdir(), `porffor-test262-${process.pid}`);

  // porf native links with a 64MB main stack on darwin (-Wl,-stack_size); match
  // it for tcc -run so deep recursion behaves like real binaries. normally the
  // limit is already raised (inherited from the primary's re-exec), making this
  // a no-op; fall back to a per-test sh wrapper (~2ms/test) if it is still low
  let stackWrap = (bin, args) => [ bin, args ];
  if (process.platform === 'darwin' && stackSoftLimit() < 65520)
    stackWrap = (bin, args) => [ '/bin/sh', [ '-c', 'ulimit -s 65520 2>/dev/null; exec "$0" "$@"', bin, ...args ] ];

  const tccServerSock = !process.argv.includes('--no-tcc-server') && process.env.PORFFOR_TEST262_TCC_SERVER !== '0' ?
    process.env.PORFFOR_TEST262_TCC_SERVER : null;

  // the C goes via a temp file, not stdin: pipe refills need the node event loop,
  // which the next test's (sync) codegen blocks - a file frees the child entirely
  const tmpC = join(os.tmpdir(), `porffor-test262-${process.pid}.c`);

  // async: the child runs while the worker codegens the next test
  const execAsync = (bin, args, input) => new Promise(res => {
    const child = execFile(bin, args, {
      encoding: 'utf8',
      timeout: execTimeout,
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

    if (input != null) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });

  let tccSocket = null;
  let tccSocketBuf = Buffer.alloc(0);
  let tccSocketWait = null;

  const resetTccSocket = err => {
    const wait = tccSocketWait;
    tccSocketWait = null;
    tccSocketBuf = Buffer.alloc(0);
    tccSocket = null;
    if (wait) wait.reject(err);
  };

  const pumpTccSocket = () => {
    if (!tccSocketWait || tccSocketBuf.length < tccSocketWait.len) return;
    const wait = tccSocketWait;
    const out = tccSocketBuf.subarray(0, wait.len);
    tccSocketBuf = tccSocketBuf.subarray(wait.len);
    tccSocketWait = null;
    wait.resolve(out);
  };

  const connectTccSocket = () => new Promise((res, rej) => {
    if (tccSocket && !tccSocket.destroyed) return res(tccSocket);

    const socket = net.createConnection(tccServerSock);
    let pending = true;
    socket.once('connect', () => {
      pending = false;
      tccSocket = socket;
      res(socket);
    });
    socket.once('error', err => {
      if (pending) {
        pending = false;
        rej(err);
      } else {
        resetTccSocket(err);
      }
    });
    socket.once('close', () => resetTccSocket(new Error('tcc server closed')));
    socket.on('data', data => {
      tccSocketBuf = Buffer.concat([ tccSocketBuf, data ]);
      pumpTccSocket();
    });
  });

  const readTccSocket = len => new Promise((resolve, reject) => {
    tccSocketWait = { len, resolve, reject };
    pumpTccSocket();
  });

  const packTccRequest = args => {
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

  const execTccServer = async args => {
    try {
      const socket = await connectTccSocket();
      socket.write(packTccRequest(args));
      const head = await readTccSocket(16);
      if (head.readUInt32LE(0) !== 0x31535254) throw new Error('bad tcc server response');
      const status = head.readInt32LE(4);
      const outLen = head.readUInt32LE(8);
      const errLen = head.readUInt32LE(12);
      const stdout = outLen ? (await readTccSocket(outLen)).toString() : '';
      const stderr = errLen ? (await readTccSocket(errLen)).toString() : '';
      if (status === -2) return { stdout, stderr, status: null, signal: 'SIGKILL', timedOut: true };
      return { stdout, stderr, status };
    } catch (e) {
      return { stdout: '', stderr: e.message, status: 1, nativeCompileError: true };
    }
  };

  const runNative = async c => {
    fs.writeFileSync(tmpC, c);

    if (hasTcc) {
      const t = performance.now();
      const args = [ ...tccArgs, tmpC ];
      const res = tccServerSock ? await execTccServer(args) : await execAsync(...stackWrap(tcc, args), null);
      res.execTime = performance.now() - t;
      if (res.status !== 0) res.nativeCompileError = /^[^\n]*:\d+: error:|^tcc: error:/m.test(res.stderr);
      return res;
    }

    let t = performance.now();
    const comp = await execAsync(cc[0], [ ...cc.slice(1), ...(cc.some(x => x.startsWith('-O')) ? [] : [ '-O0' ]), ...(process.platform === 'darwin' ? [ '-Wl,-stack_size,0x4000000' ] : []), '-w', '-xc', tmpC, '-o', tmpBin, '-lm' ], null);
    if (comp.status !== 0) return { ...comp, stdout: '', nativeCompileError: !comp.timedOut, compileTime: performance.now() - t };
    const compileTime = performance.now() - t;

    t = performance.now();
    const res = await execAsync(tmpBin, [], null);
    return { ...res, compileTime, execTime: performance.now() - t };
  };

  // synthesize an error-like object from a native run; a plain object so
  // .constructor.name matches the parsed error name like real error classes
  const mkError = (name, message, stack, code) => ({ name, message, stack: (stack || `${name}: ${message}`).replace(/:+\s*$/, ''), code, constructor: { name }, toString: () => `${name}: ${message}` });

  // pipeline: codegen the next test while the previous one executes in its child.
  // the primary dispatches blocks of indexes so there is always a next test ready
  const inbox = [];
  const execQueue = [];
  let compiling = false, execRunning = false, flushRequested = false;
  let onExecSpace = null;

  const maybeFlush = () => {
    if (!flushRequested || compiling || execRunning || inbox.length > 0 || execQueue.length > 0) return;
    if (trackErrors) process.send(errors);
    if (profile) process.send({ perTestProfile, profileStats });

    cluster.worker.kill();
  };

  const compileJob = async i => {
    const test = await readOne(test262Path, tests[i], tests[i].startsWith('harness/') ? preludes : fastPreludes);
    if (!test) return { i, file: tests[i], unreadable: true };

    if (parseOnly) {
      const src = (test.flags.onlyStrict && !test.flags.raw ? '"use strict";\n' : '') + test.body;
      let ok = true, errName;
      try {
        Prefs.module = !!test.flags.module;
        parse(src);
      } catch (e) {
        ok = false;
        errName = e?.name;
        if (logErrors) console.log(`${test.file}: ${e?.message}`);
      }

      const expectFail = test.negative && test.negative.phase === 'parse';
      let result;
      if (expectFail) result = !ok && errName === 'SyntaxError' ? 0 : 4;
        else if (ok) result = 0;
        else result = errName === 'SyntaxError' ? 4 : 3;

      if (trackErrors && result !== 0) {
        const errorStr = expectFail && ok ? 'ParseOnly: expected SyntaxError but parsed' : `ParseOnly ${errName}: parse failed`;
        errors[errorStr] = (errors[errorStr] ?? 0) + 1;
      }
      return { i, file: test.file, parseOnlyResult: result };
    }

    const job = { i, file: test.file, flags: test.flags, negative: test.negative, error: undefined, stage: 0, c: undefined, log: '' };

    job.addProfile = (id, dt) => {
      profileStats[0] += dt;
      profileStats[id] += dt;

      perTestProfile[job.file] = (perTestProfile[job.file] ?? 0) + dt;
    };

    let contents = test.contents;
    if (debugAsserts) contents = contents
      .replace('var assert = mustBeTrue => {', 'var assert = (mustBeTrue, msg) => {')
      .replaceAll('(actual, expected) => {', '(actual, expected, msg) => {')
      .replace('(actual, unexpected) => {', '(actual, unexpected, msg) => {')
      .replaceAll('throw new Test262Error', 'if (typeof expected !== \'undefined\') { Porffor.printString(msg ?? \'\'); Porffor.printStatic(\'\\n\'); Porffor.print(expected, false); Porffor.printStatic(\'\\n\'); Porffor.print(actual, false); Porffor.printStatic(\'\\n\'); } throw new Test262Error');

    // compile js -> c in-process
    try {
      Prefs.module = !!job.flags.module;

      let t = performance.now();
      const program = parse(contents);
      if (profile) job.addProfile(1, performance.now() - t);

      t = performance.now();
      const cg = codegen(program);
      if (profile) job.addProfile(2, performance.now() - t);

      t = performance.now();
      // render with -d so uncaught throws print "Uncaught <Type>: <message>"
      // to stderr, which is how runtime errors are classified below
      const out = render({ ...cg, prefs: { ...cg.prefs, d: true } });
      job.c = typeof out === 'string' ? out : out.c;
      if (profile) job.addProfile(3, performance.now() - t);
    } catch (e) {
      job.error = e;
    }

    return job;
  };

  const execJob = async job => {
    if (job.parseOnlyResult !== undefined) {
      process.send(job.parseOnlyResult + (job.i << 4));
      return;
    }

    if (job.unreadable) {
      // unreadable test file: report as compile error
      process.send(3 + (job.i << 4));
      return;
    }

    let { error, stage, negative, log } = job;

    if (!error) {
      const res = await runNative(job.c);
      log = res.stdout;

      if (profile) {
        if (res.compileTime) job.addProfile(4, res.compileTime);
        if (res.execTime) job.addProfile(5, res.execTime);
      }

      if (res.timedOut) {
        stage = 1;
        error = mkError('Error', `script execution timed out after ${execTimeout}ms`, res.stderr.trim(), 'ERR_SCRIPT_EXECUTION_TIMEOUT');
      } else if (res.status === 0) {
        stage = 2;
      } else {
        const uncaught = res.stderr.match(/^Uncaught ([A-Za-z_$][0-9A-Za-z_$]*)(?:: ?(.*))?$/m);
        if (uncaught) {
          stage = 1;
          error = mkError(uncaught[1], uncaught[2] ?? '', res.stderr.trim());
        } else if (res.nativeCompileError) {
          // the C compiler rejected the generated C:
          // stage 0 + CompileError -> native compile error
          error = mkError('CompileError', (res.stderr.trim().split('\n')[0] ?? ''), res.stderr.trim());
        } else {
          stage = 1;
          error = mkError('RuntimeError', res.signal ? `killed by ${res.signal}` : `exited with code ${res.status}`, res.stderr.trim());
        }
      }
    }

    if (error?.name === 'Test262Error' && debugAsserts && log) {
      const [ msg, expected, actual ] = log.split('\n');
      let spl = error.stack.split('\n');
      spl[0] += `: ${msg} | expected: ${expected} | actual: ${actual}`;
      error.stack = spl.join('\n');
    }

    if (log.includes('Test262:AsyncTestFailure')) {
      stage = 1;
      error = new Error('Test262 AsyncTestFailure');
    }

    let pass = stage === 2;

    // todo: parse vs runtime expected
    if (negative) {
      if (negative.type) pass = error?.name === negative.type;
        else pass = !pass;
    }

    let out = 0;
    if (!pass) {
      const errorName = error && error.name;
      if (stage === 0) {
        out = errorName === 'CompileError' ? 2 : 3;
      } else if (stage === 1) {
        if (errorName === 'Test262Error') out = 4;
          else if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') out = 5;
          else out = 6;
      } else {
        out = 4;
      }

      if (trackErrors && error && (!onlyTrackCompilerErrors || (stage === 0 && errorName !== 'CompileError' && errorName !== 'SyntaxError'))) {
        let errorStr = `${error.constructor.name}: ${error.message}`;
        errors[errorStr] = (errors[errorStr] ?? 0) + 1;
      }
    }

    out += (job.i << 4);

    if (logErrors) {
      let e = (!pass && error ? (error?.stack || error.toString()) : '');

      console.log(`\u001b[${pass ? '92' : '91'}m${runIconTable[out & 0b1111]} ${job.file}\u001b[0m${e ? `\n${e}` : ''}`);
    }

    process.send(out);
  };

  const pumpExec = async () => {
    if (execRunning) return;
    execRunning = true;
    while (execQueue.length > 0) {
      const job = execQueue.shift();
      if (onExecSpace) { const f = onExecSpace; onExecSpace = null; f(); }
      await execJob(job);
    }
    execRunning = false;
    maybeFlush();
  };

  const pumpCompile = async () => {
    if (compiling) return;
    compiling = true;
    while (inbox.length > 0) {
      // cap compile-ahead: each pending C is ~1MB
      if (execQueue.length >= 2) { await new Promise(r => (onExecSpace = r)); continue; }

      const job = await compileJob(inbox.shift());
      execQueue.push(job);
      pumpExec();

      // let the running child's io/exit callbacks land between codegens
      await new Promise(r => setImmediate(r));
    }
    compiling = false;
    maybeFlush();
  };

  process.on('message', block => {
    if (block === null) {
      flushRequested = true;
      maybeFlush();
      return;
    }

    inbox.push(...block);
    pumpCompile();
  });

  process.send(null);
}
