import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import process from 'node:process';

import Test262Stream from 'test262-stream';
import compile from '../compiler/wrap.js';

import { join } from 'node:path';
const __dirname = import.meta.dirname;
const __filename = join(__dirname, 'index.js');

let resultOnly = process.env.RESULT_ONLY;

if (isMainThread) {
  const veryStart = performance.now();

  const test262Path = 'test262/test262';
  let whatTests = process.argv.slice(2).find(x => x[0] !== '-') ?? '';
  if (!whatTests.startsWith('test/')) whatTests = 'test/' + whatTests;
  if (whatTests.endsWith('/')) whatTests = whatTests.slice(0, -1);

  const _tests = new Test262Stream(test262Path, {
    paths: [ whatTests ],
    omitRuntime: true
  });

  if (process.argv.includes('--open')) execSync(`code ${test262Path}/${whatTests}`);

  const lastResults = fs.existsSync('test262/results.json') ? JSON.parse(fs.readFileSync('test262/results.json', 'utf8')) : {};

  let lastCommitResults = execSync(`git log -200 --pretty=%B`).toString().split('\n').find(x => x.startsWith('test262: 1') || x.startsWith('test262: 2')).split('|').map(x => parseFloat(x.split('(')[0].trim().split(' ').pop().trim().replace('%', '')));
  if (lastCommitResults.length === 8) lastCommitResults = [ ...lastCommitResults.slice(0, 7), 0, lastCommitResults[7] ];

  if (!resultOnly) process.stdout.write('\u001b[90mreading tests...\u001b[0m');

  // const cachedTotal = 50012; // todo: not need manual updates
  // const tests = new Array(cachedTotal);
  // const _testsIter = _tests[Symbol.asyncIterator]();
  // let i = 0;
  // while (i < cachedTotal) {
  //   const test = (await _testsIter.next()).value;
  //   if (test.scenario === 'strict mode') continue;

  //   tests[i++] = test;
  //   if (!resultOnly) process.stdout.write(`\r${' '.repeat(50)}\rreading tests... (${i}/${cachedTotal})`);
  // }

  const tests = [];
  for await (const test of _tests) {
    if (test.scenario === 'strict mode') continue;
    tests.push(test);
  }

  const profile = process.argv.includes('--profile');
  const log = console.log;
  let currentTest;
  if (profile) {
    process.argv.push('--profile-compiler');

    console.log = msg => {
      if (msg[1] === '.' || msg[2] === ' ') {
        const n = Number(msg.split(' ').pop().slice(0, -2));
        profileStats[msg[0]] += n;

        perTestProfile[currentTest] ??= [ 0, 0, 0, 0, 0 ];
        perTestProfile[currentTest][0] += n;
        perTestProfile[currentTest][msg[0]] = n;
      }
    };
  }

  const perTestProfile = {};
  const profileStats = {
    1: 0, // parse
    2: 0, // codegen
    3: 0, // opt
    4: 0, // assemble
  };

  const trackErrors = process.argv.includes('--errors');
  const onlyTrackCompilerErrors = process.argv.includes('--compiler-errors-only');
  const logErrors = process.argv.includes('--log-errors');
  const debugAsserts = process.argv.includes('--debug-asserts');
  const subdirs = process.argv.includes('--subdirs');
  const dontWriteResults = process.argv.includes('--dont-write-results');
  const plainResults = process.argv.includes('--plain-results');

  const start = performance.now();

  const passFiles = [], wasmErrorFiles = [], compileErrorFiles = [], timeoutFiles = [];
  let dirs = new Map(), features = new Map(), errors = new Map(), pagesUsed = new Map();
  let total = 0, passes = 0, fails = 0, compileErrors = 0, wasmErrors = 0, runtimeErrors = 0, timeouts = 0, todos = 0;

  const preludes = fs.readFileSync('test262/harness.js', 'utf8').split('///').reduce((acc, x) => {
    const [ k, ...content ] = x.split('\n');
    acc[k.trim()] = content.join('\n').trim();
    return acc;
  }, {});

  let threads = parseInt(process.argv.find(x => x.startsWith('--threads='))?.split('=')?.[1] || os.cpus().length);
  if (logErrors) threads = 1;

  const allTests = whatTests === 'test' && threads > 1;
  if (!resultOnly && !allTests) console.log();

  let lastPercent = -1;

  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });

  const totalTests = tests.length;

  let queueBuf = new SharedArrayBuffer(4);
  let queue = new Uint32Array(queueBuf);
  const workerData = {
    argv: process.argv,
    preludes,
    tests,
    queue
  };
  for (let w = 0; w < threads; w++) {
    const worker = new Worker(__filename, {
      workerData
    });

    worker.on('message', int => {
      const result = int & 0b1111;
      const i = int >> 4;

      const file = tests[i].file.replaceAll('\\', '/').slice(5);

      // result: pass, todo, wasmError, compileError, fail, timeout, runtimeError
      total++;
      const pass = result === 0;

      if (pass) {
        passes++;
        if (!resultOnly) passFiles.push(file);
      } else if (result === 1) {
        todos++;
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
        const percent = ((total / tests.length) * 100) | 0;
        if (allTests) {
          if (percent > lastPercent) process.stdout.write(`\r${' '.repeat(200)}\r\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% |\u001b[0m \u001b[${pass ? '92' : (result === 4 ? '93' : '91')}m${file}\u001b[0m`);
          lastPercent = percent;
        } else {
          process.stdout.write(`\r${' '.repeat(100)}\r\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% |\u001b[0m \u001b[${pass ? '92' : (result === 4 ? '93' : '91')}m${file}\u001b[0m\n`);

          if (threads === 1 && tests[i + 1]) {
            const nextFile = tests[i + 1].file.replaceAll('\\', '/').slice(5);
            process.stdout.write(`\u001b[90m${percent.toFixed(0).padStart(4, ' ')}% | ${nextFile}\u001b[0m`);
          }
        }

        const dir = file.slice(0, file.indexOf('/'));
        if (!dirs.has(dir)) dirs.set(dir, [0, 0, 0, 0, 0, 0, 0, 0]);

        const o = dirs.get(dir);
        o[0] += 1;
        o[result + 1] += 1;
      }

      if (total === totalTests) resolve();
    });

    // if (!resultOnly) process.stdout.write(`\r${' '.repeat(100)}\r\u001b[90mspawned ${w + 1}/${threads} threads...`);
  }

  await promise;

  console.log = log;

  const todoTime = process.argv.find(x => x.startsWith('--todo-time='))?.split('=')[1] ?? 'runtime';

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

    if (todoTime === 'runtime' && !resultOnly) {
      // move todo and timeout to after runtime errors
      const spl = out.split(resultOnly ? ' | ' : '\u001b[90m | \u001b[0m');
      spl.splice(4, 0, spl.pop(), spl.pop());
      out = spl.join(resultOnly ? ' | ' : '\u001b[90m | \u001b[0m');
    }

    console.log(out);
  };

  const bar = (barWidth, ...arr) => {
    const total = arr[0];

    let out = '';
    for (let i = 1; i < arr.length; i++) {
      const color = [ '\u001b[42m', '\u001b[43m', '\u001b[101m', '\u001b[41m', '\u001b[46m' ][i - 1];

      const width = Math.ceil((arr[i] / total) * barWidth);

      const label = arr[i].toString();
      const showLabel = width > (label.length + 2);

      out += `${color}\u001b[97m${showLabel ? (' ' + label) : ''}${' '.repeat(width - (showLabel ? (label.length + 1) : 0))}\u001b[0m`;
    }

    console.log(out);
  };

  const percent = parseFloat(((passes / total) * 100).toFixed(2));
  const percentChange = parseFloat((percent - lastCommitResults[0]).toFixed(2));

  if (resultOnly) {
    process.stdout.write(`test262: ${percent.toFixed(2)}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''} | `);
    table(true, total, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts, todos);
    process.exit();
  }

  console.log('\n\n');

  const nextMinorPercent = parseFloat(((Math.floor(percent * 10) / 10) + 0.1).toFixed(1));
  const nextMajorPercent = Math.floor(percent) + 1;

  const togo = next => `${Math.floor((total * next / 100) - passes)} to go until ${next}%`;

  console.log(`\u001b[1m${whatTests}: ${passes}/${total} passed - ${percent.toFixed(2)}%${whatTests === 'test' && percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''}\u001b[0m \u001b[90m(${togo(nextMinorPercent)}, ${togo(nextMajorPercent)})\u001b[0m`);
  bar(140, total, passes, fails, runtimeErrors + (todoTime === 'runtime' ? todos : 0) + timeouts, compileErrors + (todoTime === 'compile' ? todos : 0) + wasmErrors, 0);
  process.stdout.write('  ');
  table(whatTests === 'test', total, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts, todos);

  console.log();

  if (whatTests === 'test') {
    for (const dir of dirs.keys()) {
      const results = dirs.get(dir);
      process.stdout.write(' '.repeat(6) + dir + ' '.repeat(14 - dir.length));

      const [ total, pass, todo, wasmError, compileError, fail, timeout, runtimeError ] = results;
      bar(120, total, pass, fail, runtimeError + (todoTime === 'runtime' ? todo : 0) + timeout, compileError + (todoTime === 'compile' ? todo : 0) + wasmError, 0);
      process.stdout.write(' '.repeat(6) + ' '.repeat(14 + 2));
      table(false, total, pass, fail, runtimeError, wasmError, compileError, timeout, todo);
      console.log();

      // if (subdirs) {
      //   for (const dir2 of results.keys()) {
      //     if (['total', 'pass', 'fail', 'runtimeError', 'compileError', 'todo', 'wasmError'].includes(dir2) || dir2.endsWith('.js')) continue;

      //     const results2 = results.get(dir2);
      //     process.stdout.write(' '.repeat(8) + dir2 + ' '.repeat(30 - dir2.length));
      //     bar(80, results2.total, results2.pass ?? 0, results2.fail ?? 0, (results2.runtimeError ?? 0) + (todoTime === 'runtime' ? (results2.todo ?? 0) : 0) + (results2.timeout ?? 0), (results2.compileError ?? 0) + (todoTime === 'compile' ? (results2.todo ?? 0) : 0) + (results2.wasmError ?? 0), 0);
      //     process.stdout.write(' '.repeat(8) + ' '.repeat(30 + 2));
      //     table(false, results2.total, results2.pass ?? 0, results2.fail ?? 0, results2.runtimeError ?? 0, results2.wasmError ?? 0, results2.compileError ?? 0, results2.timeout ?? 0, results2.todo ?? 0);
      //   }
      //   console.log();
      // }
    }

    if (lastResults.compileErrors) console.log(`\n\n\u001b[4mnew compile errors\u001b[0m\n${compileErrorFiles.filter(x => !lastResults.compileErrors.includes(x)).join('\n')}\n\n`);
    if (lastResults.wasmErrors) console.log(`\u001b[4mnew wasm errors\u001b[0m\n${wasmErrorFiles.filter(x => !lastResults.wasmErrors.includes(x)).join('\n')}\n\n`);

    if (lastResults.passes) console.log(`\u001b[4mnew passes\u001b[0m\n${passFiles.filter(x => !lastResults.passes.includes(x)).join('\n')}\n\n`);
    if (lastResults.passes) console.log(`\u001b[4mnew fails\u001b[0m\n${lastResults.passes.filter(x => !passFiles.includes(x)).join('\n')}`);

    if (!dontWriteResults) fs.writeFileSync('test262/results.json', JSON.stringify({ passes: passFiles, compileErrors: compileErrorFiles, wasmErrors: wasmErrorFiles, timeouts: timeoutFiles, total }));
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

    for (const x of [...errors.keys()].sort((a, b) => errors.get(a).length - errors.get(b).length)) {
      console.log(`${errors.get(x).length.toString().padStart(4, ' ')} ${x}`);
    }

    console.log();

    const errorsByClass = [...errors.keys()].reduce((acc, x) => {
      const k = x.slice(0, x.indexOf(':'));
      acc[k] = (acc[k] ?? []).concat(errors.get(x));
      return acc;
    }, {});

    for (const x of Object.keys(errorsByClass).sort((a, b) => errorsByClass[b].length - errorsByClass[a].length)) {
      console.log(`${errorsByClass[x].length.toString().padStart(4, ' ')} ${x}`);
    }
  }

  if (profile) {
    const longestTests = Object.keys(perTestProfile).sort((a, b) => perTestProfile[b][0] - perTestProfile[a][0])
      .slice(0, 40);

    const longestTestName = Math.max(...longestTests.map(x => x.length)) + 4;

    console.log('\n\x1b[4mlongest individual tests\x1b[0m');

    for (const x of longestTests) {
      const profile = perTestProfile[x].map(x => x.toFixed(2) + 'ms');
      console.log(`${x.replace('test/', '')}${' '.repeat(longestTestName - x.length)} \x1B[90m│\x1B[0m \x1B[1m${profile[0]} total\x1B[0m (parse: ${profile[1]}, codegen: ${profile[2]}, opt: ${profile[3]}, assemble: ${profile[4]})`);
    }

    console.log('\n\x1b[4mtime spent on compiler stages\x1b[0m');

    let n = 1;
    for (const x of [ 'parse', 'codegen', 'opt', 'assemble' ]) {
      console.log(`${x}: ${(profileStats[n++] / 1000).toFixed(2)}s`);
    }
  }

  if (allTests) {
    resultOnly = true;
    process.stdout.write(`\ntest262: ${percent.toFixed(2)}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange.toFixed(2)})` : ''} | `);
    table(true, total, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts, todos);
  }
} else {
  const { queue, tests, preludes, argv } = workerData;

  process.argv = argv;
  const trackErrors = process.argv.includes('--errors');
  const onlyTrackCompilerErrors = process.argv.includes('--compiler-errors-only');
  const logErrors = process.argv.includes('--log-errors');
  const debugAsserts = process.argv.includes('--debug-asserts');
  const subdirs = process.argv.includes('--subdirs');

  const timeout = ($func, timeout) => {
    // if (globalThis.Bun || globalThis.Deno) throw { code: 'ERR_SCRIPT_EXECUTION_TIMEOUT' };

    const script = new vm.Script('$func()');
    return script.runInNewContext({ $func }, { timeout });
  };

  const totalTests = tests.length;
  const alwaysPrelude = preludes['assert.js'] + '\n' + preludes['sta.js'] + '\n';
  while (true) {
    const i = Atomics.add(queue, 0, 1);
    if (i >= totalTests) break;

    const test = tests[i];

    let error, stage;
    let contents = test.contents, attrs = test.attrs;

    if (!attrs.flags.raw) {
      if (attrs.flags.async) attrs.includes.unshift('doneprintHandle.js');
      const prelude = attrs.includes.reduce((acc, x) => acc + (preludes[x] ?? '') + '\n', '') + alwaysPrelude;
      contents = prelude + contents;
    }

    contents = contents
      // error detail checks
      .replace(/assert\.notSameValue\(er?r?\.message\.indexOf\('.*?'\), -1\);/g, '')
      .replace(/if *\(\(er?r? *instanceof *(.*)Error\) *!==? *true\) *\{[\w\W]*?\}/g, '')
      .replace(/if *\((er?r?|reason)\.constructor *!==? *(.*)Error\) *\{[\w\W]*?\}/g, '')
      .replace(/assert\.sameValue\(\s*e instanceof RangeError,\s*true,[\w\W]+?\);/g, '')
      // replace old tests' custom checks with standard assert
      // .replace(/if \(([^ ]+) !== ([^ ]+)\) \{ *\n *throw new Test262Error\(['"](.*)\. Actual:.*\); *\n\} *\n/g, (_, one, two) => `assert.sameValue(${one}, ${two});\n`)
      // remove actual string concats from some error messages
      // .replace(/\. Actual: ' \+ .*\);/g, _ => `');`);

    if (debugAsserts) contents = contents
      .replace('function assert(mustBeTrue) {', 'function assert(mustBeTrue, msg) {')
      .replaceAll('function (actual, expected) {', 'function (actual, expected, msg) {')
      .replace('function (actual, unexpected) {', 'function (actual, unexpected, msg) {')
      .replaceAll('throw new Test262Error', 'if (typeof msg != "undefined") { console.log(msg); console.log(expected); console.log(actual); } throw new Test262Error');

    // fs.writeFileSync('r.js', contents);

    // currentTest = file;

    let log = '';

    let exports, exceptions;
    try {
      const out = compile(contents, attrs.flags.module ? [ 'module' ] : [], {
        p: i => { log += i.toString() },
        c: i => { log += String.fromCharCode(i); }
      });

      exceptions = out.exceptions;
      exports = out.exports;
    } catch (e) {
      stage = 0;
      error = e;
    }

    if (!error) try {
      timeout(exports.main, 3000);
      stage = 2;
    } catch (e) {
      if (e?.name === 'Test262Error' && debugAsserts && log) {
        const [ msg, expected, actual ] = log.split('\n');
        e.message += `: ${msg} | expected: ${expected} | actual: ${actual}`;
      }

      stage = 1;
      error = e;
    }

    if (log.includes('Test262:AsyncTestFailure')) {
      stage = 1;
      error = new Error('Test262 AsyncTestFailure');
    }

    const errorName = error?.name;

    let pass = stage === 2;

    // todo: parse vs runtime expected
    if (test.attrs.negative) {
      if (test.attrs.negative.type) pass = errorName === test.attrs.negative.type;
        else pass = !pass;
    }

    let out = 0;

    if (!pass) {
      if (errorName === 'TodoError') out = 1;
        else if (stage === 0) {
          out = errorName === 'CompileError' ? 2 : 3;
        }
        else if (stage === 1) {
          if (errorName === 'Test262Error') out = 4;
            else if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') out = 5;
            else out = 6;
        }
        else if (stage === 2) out = 4;
    }

    // if (!onlyTrackCompilerErrors || (stage === 0 && result.name !== 'TodoError' && result.constructor.name !== 'CompileError' && result.constructor.name !== 'SyntaxError')) {
    //   let errorStr = `${result.constructor.name}: ${result.message}`;
    //   errorStr += `${' '.repeat(160 - errorStr.length)}${result.stack.split('\n')[1]}`;

    //   if (!errors.has(errorStr)) errors.set(errorStr, []);
    //   errors.set(errorStr, errors.get(errorStr).concat(file));
    // }

    out += (i << 4);

    if (logErrors) {
      process.stdout.write(`\u001b[${pass ? '92' : '91'}m${test.file.replaceAll('\\', '/').slice(5)}\u001b[0m\n`);
      if (!pass && error) console.log(error?.stack ?? error);

      setTimeout(() => { parentPort.postMessage(out); }, 10);
    } else {
      parentPort.postMessage(out);
    }
  }
}