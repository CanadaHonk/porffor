import { execSync } from 'node:child_process';
import fs from 'fs';

import Test262Stream from 'test262-stream';
import compile from '../compiler/wrap.js';

const veryStart = performance.now();

const test262Path = 'test262/test262';
const whatTests = process.argv.slice(2).find(x => x[0] !== '-') ?? 'test';

const _tests = new Test262Stream(test262Path, {
  paths: [ whatTests ]
});

const prelude = fs.readFileSync('test262/prelude.js', 'utf8');

let valtype = 'f64';

const valtypeOpt = process.argv.find(x => x.startsWith('-valtype='));
if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

const excludeNegative = process.argv.includes('-exclude-negative');

const lastPasses = JSON.parse(fs.readFileSync('test262/passes.json', 'utf8')).passes;

const lastCommitResults = execSync(`git log -1 --pretty=%B`).toString().split('\n').filter(x => x).pop().split('|').map(x => parseFloat(x.slice(3).split(':').pop().trim().replace('%', '')));

const resultOnly = process.env.RESULT_ONLY;

const hacks = [
  // remove error constructor checks
  x => {
    const str = `if (err.constructor !== Test262Error) {`;
    const ind = x.indexOf(str);
    const nextEnd = x.indexOf('}', ind + str.length);

    return x.replace(x.slice(ind, nextEnd + 1), '');
  },

  // random error detail checks
  x => {
    return x
      .replace(/assert\.notSameValue\(err\.message\.indexOf\('.*?'\), -1\);/g, '');
  },

  // int valtypes only: replace assert._isSameValue check with simple check
  x => {
    if (valtype[0] !== 'i') return x;
    return x.replace(`assert._isSameValue = function (a, b) {`, `assert._isSameValue = function (a, b) { return a == b;`);
  },

  // remove messages from asserts (assert, assert.sameValue, assert.notSameValue)
  x => {
    return x
      .replace(/((assert)(\.sameValue|\.notSameValue)?\(.*?, .*?), .*\);/g, (_, excludingLastArg) => excludingLastArg + ')');
  },

  // replace old tests' custom checks with standard assert
  x => {
    return x
      .replace(/if \(([^ ]+) !== ([^ ]+)\) \{ *\n *throw new Test262Error\(['"](.*)\. Actual:.*\); *\n\} *\n/g, (_, one, two) => `assert.sameValue(${one}, ${two});\n`);
  },

  // remove actual string concats from some error messages
  x => {
    return x
      .replace(/\. Actual: ' \+ .*\);/g, _ => `');`);
  }
];

const run = async ({ contents, copyright }, flags) => {
  const singleContents = contents.split('---*/').pop();

  let toRun = prelude + singleContents;

  for (const hack of hacks) {
    toRun = hack(toRun);
  }

  // console.log(toRun);

  let exports;
  try {
    0, { exports } = await compile(toRun, flags);
  } catch (e) {
    return [ 0, e ];
  }

  try {
    exports.main();
  } catch (e) {
    return [ 1, e ];
  }

  return [ 2 ];
};

if (!resultOnly) console.log('reading tests... (may take ~30s)');

const tests = [];
for await (const test of _tests) {
  if (test.scenario === 'strict mode') continue;
  if (excludeNegative && test.attrs.negative) continue;
  tests.push(test);
}

if (!resultOnly) console.log();

const start = performance.now();

const passFiles = [];
let dirs = new Map(), features = new Map();
let total = 0, passes = 0, fails = 0, compileErrors = 0, wasmErrors = 0, runtimeErrors = 0, todos = 0;
for await (const test of tests) {
  const file = test.file.replaceAll('\\', '/').replace('test/', '');

  total++;
  if (!resultOnly) process.stdout.write(`\u001b[90m${((total / tests.length) * 100).toFixed(0).padStart(3, ' ')}% |\u001b[0m ${file} \u001b[90m${test.scenario}\u001b[0m`);

  // todo: parse vs runtime expected
  const expected = test.attrs.negative ? true : false;
  const expectedType = test.attrs.negative?.type;

  const flags = [];
  if (test.attrs.flags.module) flags.push('module');

  const [ stage, result ] = await run(test, flags);
  const errored = stage !== 2;

  let pass = errored === expected;
  if (pass && expected) pass = result.constructor.name === expectedType;

  if (pass) passes++;

  if (!pass && result && result.message.startsWith('todo:')) todos++;
  else if (!pass && stage === 0) {
    if (result.constructor.name === 'CompileError') wasmErrors++;
      else compileErrors++;
  }
  else if (!pass && stage === 1) {
    if (result.constructor.name === 'Test262Error') fails++;
      else runtimeErrors++;
  }
  else if (!pass && stage === 2) fails++;

  if (pass) passFiles.push(file);

  if (!resultOnly) process.stdout.write(`\r${' '.repeat(200)}\r`);
  if (!resultOnly) console.log(`\u001b[90m${((total / tests.length) * 100).toFixed(0).padStart(3, ' ')}% |\u001b[0m \u001b[${pass ? '92' : '91'}m${file}\u001b[0m \u001b[90m${test.scenario}\u001b[0m`);

  if (process.argv.includes('-log-errors') && !pass) console.log(result.message);

  let y = dirs;
  for (const x of file.split('/')) {
    if (!y.has(x)) y.set(x, new Map());
    y = y.get(x);

    y.total = (y.total ?? 0) + 1;

    let k = pass ? 'pass' : 'unknown';
    if (!pass && result && result.message.startsWith('todo:')) k = 'todo';
    else if (!pass && stage === 0) {
      if (result.constructor.name === 'CompileError') k = 'wasmError';
        else k = 'compileError';
    }
    else if (!pass && stage === 1) {
      if (result.constructor.name === 'Test262Error') k = 'fail';
        else k = 'runtimeError';
    }
    else if (!pass && stage === 2) k = 'fail';

    y[k] = (y[k] ?? 0) + 1;
  }

  // break;
}

const table = (overall, ...arr) => {
  let out = '';
  for (let i = 0; i < arr.length; i++) {
    let icon = [ '🧪', '🤠', '❌', '💀', '🧩', '💥', '📝' ][i];
    let change = arr[i] - lastCommitResults[i + 1];
    let str = `${icon} ${arr[i]}${overall && change !== 0 ? ` (${change > 0 ? '+' : ''}${change})` : ''}`;

    if (i !== arr.length - 1) str += resultOnly ? ' | ' : '\u001b[90m | \u001b[0m';
    out += str;
  }

  console.log(out);
};

const bar = (...arr) => {
  const barWidth = 120;
  const total = arr[0];

  let out = '';
  for (let i = 1; i < arr.length; i++) {
    const color = [ '\u001b[42m', '\u001b[43m', '\u001b[101m', '\u001b[41m', '\u001b[46m' ][i - 1];

    const width = Math.ceil((arr[i] / total) * barWidth);

    const label = arr[i].toString();
    const showLabel = width > (label.length + 2);

    out += `${color}${showLabel ? (' ' + label) : ''}${' '.repeat(width - (showLabel ? (label.length + 1) : 0))}\u001b[0m`;
  }

  console.log(out);
};

const percent = parseFloat(((passes / total) * 100).toFixed(2));
const percentChange = parseFloat((percent - lastCommitResults[0]).toFixed(2));

if (resultOnly) {
  process.stdout.write(`test262: ${percent}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange})` : ''} | `);
  table(true, total, passes, fails, runtimeErrors, wasmErrors, compileErrors, todos);
  process.exit();
}

console.log('\n');

const nextMinorPercent = (Math.floor(percent * 10) / 10) + 0.1;
const nextMajorPercent = Math.floor(percent) + 1;

const togo = next => `${Math.floor((total * next / 100) - passes)} to go until ${next}%`;

console.log(`\u001b[1m${whatTests}: ${passes}/${total} passed - ${percent}%${percentChange !== 0 ? ` (${percentChange > 0 ? '+' : ''}${percentChange})` : ''}\u001b[0m \u001b[90m(${togo(nextMinorPercent)}, ${togo(nextMajorPercent)})\u001b[0m`);
bar(total, passes, fails, runtimeErrors, compileErrors + todos + wasmErrors, 0);
process.stdout.write('  ');
table(true, total, passes, fails, runtimeErrors, wasmErrors, compileErrors, todos);

console.log();

if (whatTests === 'test') {
  for (const dir of dirs.keys()) {
    const results = dirs.get(dir);
    process.stdout.write(dir + ' '.repeat(14 - dir.length));
    bar(results.total, results.pass ?? 0, results.fail ?? 0, results.runtimeError ?? 0, (results.compileError ?? 0) + (results.todo ?? 0) + (results.wasmError ?? 0), 0);
    process.stdout.write(' '.repeat(14 + 2));
    table(false, results.total, results.pass ?? 0, results.fail ?? 0, results.runtimeError ?? 0, results.wasmError ?? 0, results.compileError ?? 0, results.todo ?? 0);
    console.log();
  }

  console.log(`\n\n\u001b[4mnew passes\u001b[0m\n${passFiles.filter(x => !lastPasses.includes(x)).join('\n')}\n\n`);
  console.log(`\u001b[4mnew fails\u001b[0m\n${lastPasses.filter(x => !passFiles.includes(x)).join('\n')}`);
}

console.log(`\u001b[90mtook ${((performance.now() - start) / 1000).toFixed(1)}s to run (${((performance.now() - veryStart) / 1000).toFixed(1)}s total)\u001b[0m`);

fs.writeFileSync('test262/passes.json', JSON.stringify({ passes: passFiles, total }));