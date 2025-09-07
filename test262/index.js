import cluster from 'node:cluster';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { join } from 'node:path';
import { log } from '../compiler/log.js';
import readTest262 from './read.js';

const __dirname = import.meta.dirname;

let resultOnly = process.env.RESULT_ONLY;

const workerDataPath = '/tmp/workerData.json';
if (cluster.isPrimary) {
  const veryStart = performance.now();

  const test262Path = join(__dirname, 'test262');
  let whatTests = process.argv.slice(2).find(x => x[0] !== '-') ?? '';
  if (whatTests.endsWith('/')) whatTests = whatTests.slice(0, -1);

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

  if (process.argv.includes('--open')) execSync(`zed ${test262Path}/test/${whatTests}`);

  let minimal = process.argv.includes('--minimal');
  if (minimal) resultOnly = true;
  const lastResults = fs.existsSync(join(__dirname, 'results.json')) ? JSON.parse(fs.readFileSync(join(__dirname, 'results.json'), 'utf8')) : {};

  let lastCommitResults = minimal ? [] : execSync(`git log -200 --pretty=%B`).toString().split('\n').find(x => x.startsWith('test262: 1') || x.startsWith('test262: 2') || x.startsWith('test262: 3') || x.startsWith('test262: 4') || x.startsWith('test262: 5') || x.startsWith('test262: 6')).split('|').map(x => parseFloat(x.split('(')[0].trim().split(' ').pop().trim().replace('%', '')));

  if (!resultOnly) process.stdout.write('\u001b[90mreading tests...\u001b[0m');

  const preludes = fs.readFileSync(join(__dirname, 'harness.js'), 'utf8').split('///').reduce((acc, x) => {
    const [ k, ...content ] = x.split('\n');
    acc[k.trim()] = content.join('\n').trim() + '\n';
    return acc;
  }, {});

  const tests = await readTest262(test262Path, whatTests, preludes, lastResults.timeouts);
  if (!resultOnly) process.stdout.write(`\r${' '.repeat(60)}\r\u001b[90mcaching tests to tmp...\u001b[0m`);

  fs.writeFileSync(workerDataPath, JSON.stringify(tests));
  if (!resultOnly) process.stdout.write(`\r${' '.repeat(60)}\r\u001b[90mstarting ${threads} runners...\u001b[0m`);

  const profile = process.argv.includes('--profile');
  if (profile) process.argv.push('--profile-compiler');

  const perTestProfile = {};
  const profileStats = new Array(7).fill(0);

  const trackErrors = process.argv.includes('--errors');
  const onlyTrackCompilerErrors = process.argv.includes('--compiler-errors-only');
  const logErrors = process.argv.includes('--log-errors');
  const dontWriteResults = process.argv.includes('--dont-write-results');
  const plainResults = process.argv.includes('--plain-results');

  const runIconTable = plainResults ? [ 'pass:', 'todo:', 'wasm compile error:', 'compile error:', 'fail:', 'timeout:', 'runtime error:' ] : [ '🤠', '📝', '🏗️', '💥', '❌', '⏰', '💀' ];
  const table = (overall, ...arr) => {
    let out = '';
    for (let i = 0; i < arr.length; i++) {
      let icon = [ '🧪', '🤠', '❌', '💀', '🏗️', '💥', '⏰', '📝' ][i];
      let iconDesc = [ 'total', 'pass', 'fail', 'runtime error', 'wasm compile error', 'compile error', 'timeout', 'todo' ][i];
      // let color = resultOnly ? '' : ['', '\u001b[42m', '\u001b[43m', '\u001b[101m', '\u001b[41m', '\u001b[41m', '\u001b[101m', todoTime === 'runtime' ? '\u001b[101m' : '\u001b[41m'][i];
      // let color = resultOnly ? '' : ('\u001b[1m' + ['', '\u001b[32m', '\u001b[33m', '\u001b[91m', '\u001b[31m', '\u001b[31m', '\u001b[91m', todoTime === 'runtime' ? '\u001b[91m' : '\u001b[31m'][i]);

      let change = arr[i] - lastCommitResults[i + 1];
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

  const passFiles = [], wasmErrorFiles = [], compileErrorFiles = [], timeoutFiles = [];
  let dirs = new Map(), features = new Map(), errors = new Map(), pagesUsed = new Map();
  let total = 0, passes = 0, fails = 0, compileErrors = 0, wasmErrors = 0, runtimeErrors = 0, timeouts = 0;

  if (logErrors) threads = 1;

  const allTests = whatTests === '' && threads > 1;
  if (!resultOnly && !allTests) console.log();

  let lastPercent = 0;

  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });

  const totalTests = tests.length;

  const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');

  let queue = 0;
  const spawn = () => {
    const worker = cluster.fork();

    let timeout;
    const enqueue = () => {
      if (timeout) clearTimeout(timeout);
      const i = queue;
      if (i >= totalTests) {
        if (trackErrors || profile) {
          worker.send(null);
        } else {
          worker.kill();
        }

        return;
      }

      worker.send(queue++);
      timeout = setTimeout(() => {
        worker.kill();

        total++;
        timeouts++;

        const file = tests[i].file;
        if (!resultOnly) timeoutFiles.push(file);

        if (total === totalTests) {
          if (!trackErrors) resolve();
        } else {
          spawn();
        }
      }, 15000);
    };

    worker.on('message', int => {
      if (int == null) {
        enqueue();
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

        if (profile) {
          Object.assign(perTestProfile, int.perTestProfile);

          const ps = int.profileStats;
          for (let i = 0; i < ps.length; i++) profileStats[i] += ps[i];
        }

        if (total === totalTests) resolve();
        return;
      }

      enqueue();

      const result = int & 0b1111;
      const i = int >> 4;

      const file = tests[i].file;

      // result: pass, todo, wasmError, compileError, fail, timeout, runtimeError
      total++;
      const pass = result === 0;

      if (pass) {
        passes++;
        if (!resultOnly) passFiles.push(file);
      } else if (result === 2) {
        wasmErrors++;
        if (!resultOnly) wasmErrorFiles.push(file);
      } else if (result === 3) {
        compileErrors++;
        if (!resultOnly) compileErrorFiles.push(file);
      } else if (result === 4) {
        fails++;
      } else if (result === 5) {
        timeouts++;
        if (!resultOnly) timeoutFiles.push(file);
      } else {
        runtimeErrors++;
      }

      if (!resultOnly && !logErrors) {
        const percent = ((total / tests.length) * 100);
        if (allTests) {
          // if (percent > lastPercent) process.stdout.write(`\r${' '.repeat(200)}\r\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% |\u001b[0m \u001b[${pass ? '92' : (result === 4 ? '93' : '91')}m${file}\u001b[0m`);
          if (percent > lastPercent) {
            const tab = `  \u001b[1m${spinner[spin++ % 4]} ${percent.toFixed(1)}%\u001b[0m    ` +
              table(false, total, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts);

            process.stdout.write(
              (lastPercent != 0 ? `\u001b[2F\u001b[0J` : `\r${' '.repeat(100)}\r`) +
              bar([...noAnsi(tab)].length + 8, total, passes, fails, runtimeErrors + timeouts, compileErrors + wasmErrors, 0) +
              '\n' + tab + '\n'
            );
            lastPercent = percent + 0.1;
          }
        } else {
          process.stdout.write(`\r${' '.repeat(100)}\r\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% |\u001b[0m \u001b[${pass ? '92' : (result === 4 ? '93' : (result === 5 ? '90' : '91'))}m${runIconTable[result]} ${file}\u001b[0m\n`);

          if (threads === 1 && tests[i + 1]) {
            const nextFile = tests[i + 1].file;
            process.stdout.write(`\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% | ${nextFile}\u001b[0m`);
          }
        }

        const dir = file.slice(0, file.indexOf('/'));
        if (!dirs.has(dir)) dirs.set(dir, [0, 0, 0, 0, 0, 0, 0, 0]);

        const o = dirs.get(dir);
        o[0] += 1;
        o[result + 1] += 1;
      }

      if (total === totalTests && !trackErrors) resolve();
    });
  };

  for (let w = 0; w < threads; w++) spawn();

  await promise;

  const percent = parseFloat(((passes / total) * 100).toFixed(2));
  const percentChange = parseFloat((percent - lastCommitResults[0]).toFixed(2));

  if (minimal) process.exit();

  if (resultOnly) {
    process.stdout.write(`test262: ${percent.toFixed(2)}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''} | `);
    console.log(table(true, total, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts));
    process.exit();
  }

  if (allTests) process.stdout.write('\u001b[2F\u001b[0J');
    else console.log();

  const nextMinorPercent = parseFloat(((Math.floor(percent * 10) / 10) + 0.1).toFixed(1));
  const nextMajorPercent = Math.floor(percent) + 1;

  const togo = next => `${Math.floor((total * next / 100) - passes)} to go until ${next}%`;

  console.log(`\u001b[1m${whatTests || 'test262'}: ${passes}/${total} passed - ${percent.toFixed(2)}%${whatTests === '' && percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''}\u001b[0m \u001b[90m(${togo(nextMinorPercent)}, ${togo(nextMajorPercent)})\u001b[0m`);
  const tab = table(whatTests === '', total, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts);
  console.log(bar([...noAnsi(tab)].length + 10, total, passes, fails, runtimeErrors + timeouts, compileErrors + wasmErrors, 0));
  process.stdout.write('  ');
  console.log(tab);

  console.log();

  if (whatTests === '') {
    for (const dir of dirs.keys()) {
      const results = dirs.get(dir);
      process.stdout.write(' '.repeat(6) + dir + ' '.repeat(14 - dir.length));

      const [ total, pass, todo, wasmError, compileError, fail, timeout, runtimeError ] = results;
      console.log(bar(120, total, pass, fail, runtimeError + timeout, compileError + wasmError, 0));
      process.stdout.write(' '.repeat(6) + ' '.repeat(14 + 2));
      console.log(table(false, total, pass, fail, runtimeError, wasmError, compileError, timeout, todo));
      console.log();
    }

    if (lastResults.compileErrors) console.log(`\n\n\u001b[4mnew compile errors\u001b[0m\n${compileErrorFiles.filter(x => !lastResults.compileErrors.includes(x)).join('\n')}\n\n`);
    if (lastResults.wasmErrors) console.log(`\u001b[4mnew wasm errors\u001b[0m\n${wasmErrorFiles.filter(x => !lastResults.wasmErrors.includes(x)).join('\n')}\n\n`);

    if (lastResults.passes) console.log(`\u001b[4mnew passes\u001b[0m\n${passFiles.filter(x => !lastResults.passes.includes(x)).join('\n')}\n\n`);
    if (lastResults.passes) console.log(`\u001b[4mnew fails\u001b[0m\n${lastResults.passes.filter(x => !passFiles.includes(x)).join('\n')}`);

    if (!dontWriteResults) fs.writeFileSync(join(__dirname, 'results.json'), JSON.stringify({ passes: passFiles, compileErrors: compileErrorFiles, wasmErrors: wasmErrorFiles, timeouts: timeoutFiles, total }));
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
    for (const x of [ 'total', 'parse', 'codegen', 'opt', 'assemble', 'instantiate', 'execute' ]) {
      const y = profileStats[n++];
      console.log(`${x}\x1B[90m: \x1B[0m\x1B[1m${((y / total) * 100).toFixed(0)}%\x1B[0m (${(y / 1000 / threads).toFixed(2)}s)`);
    }
    console.log();
  }

  if (allTests) {
    resultOnly = true;
    console.log(`\ntest262: ${percent.toFixed(2)}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''} | ` + table(true, total, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts));
  }
} else {
  const tests = JSON.parse(fs.readFileSync(workerDataPath, 'utf8'));
  const errors = {};

  const trackErrors = process.argv.includes('--errors');
  const onlyTrackCompilerErrors = process.argv.includes('--compiler-errors-only');
  const logErrors = process.argv.includes('--log-errors');
  const debugAsserts = process.argv.includes('--debug-asserts');
  const plainResults = process.argv.includes('--plain-results');
  const runIconTable = plainResults ? [ 'pass:', 'todo:', 'wasm compile error:', 'compile error:', 'fail:', 'timeout:', 'runtime error:' ] : [ '🤠', '📝', '🏗️', '💥', '❌', '⏰', '💀' ];

  const compile = (await import('../compiler/wrap.js')).default;

  // console.log = (...args) => parentPort.postMessage(args.join(' '));

  const profile = process.argv.includes('--profile');
  const perTestProfile = {};
  const profileStats = new Array(7).fill(0);

  process.on('message', i => {
    if (i === null) {
      if (trackErrors) process.send(errors);
      if (profile) process.send({ perTestProfile, profileStats });

      cluster.worker.kill();
      return;
    }

    const test = tests[i];
    let error, stage = 0;
    let contents = test.contents,
        flags = test.flags,
        negative = test.negative;

    if (profile) {
      globalThis.onProgress = (msg, t) => {
        let id = 0;
        if (msg === 'parsed') id = 1;
        if (msg === 'generated wasm') id = 2;
        if (msg === 'optimized') id = 3;
        if (msg === 'assembled') id = 4;
        if (msg === 'instantiated') id = 5;
        if (msg === 'executed') id = 6;

        profileStats[0] += t;
        profileStats[id] += t;

        perTestProfile[test.file] = (perTestProfile[test.file] ?? 0) + t;
      };
    }

    if (debugAsserts) contents = contents
      .replace('var assert = mustBeTrue => {', 'var assert = (mustBeTrue, msg) => {')
      .replaceAll('(actual, expected) => {', '(actual, expected, msg) => {')
      .replace('(actual, unexpected) => {', '(actual, unexpected, msg) => {')
      .replaceAll('throw new Test262Error', 'if (typeof expected !== \'undefined\') { Porffor.printString(msg ?? \'\'); Porffor.printStatic(\'\\n\'); Porffor.print(expected, false); Porffor.printStatic(\'\\n\'); Porffor.print(actual, false); Porffor.printStatic(\'\\n\'); } throw new Test262Error');

    let log = '';

    let exports;
    try {
      const out = compile(contents, !!flags.module, x => log += x);
      exports = out.exports;
    } catch (e) {
      error = e;
    }

    if (!error) try {
      if (profile) {
        const t = performance.now();
        exports.main();
        globalThis.onProgress('executed', performance.now() - t);
      } else {
        exports.main();
      }
      stage = 2;
    } catch (e) {
      if (e?.name === 'Test262Error' && debugAsserts && log) {
        const [ msg, expected, actual ] = log.split('\n');
        let spl = e.stack.split('\n');
        spl[0] += `: ${msg} | expected: ${expected} | actual: ${actual}`;
        e.stack = spl.join('\n');
      }

      stage = 1;
      error = e;
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

    out += (i << 4);

    if (logErrors) {
      let e = (!pass && error ? (error?.stack || error.toString()) : '');
      if (e.includes('throw porfToJSValue')) e = e.split('\n').at(-1);

      console.log(`\u001b[${pass ? '92' : '91'}m${runIconTable[out & 0b1111]} ${test.file}\u001b[0m${e ? `\n${e}` : ''}`);
    }

    process.send(out);
  });

  process.send(null);
}