import Test262Stream from 'test262-stream';
import fs from 'fs';

import compile from '../compiler/wrap.js';

const test262Path = 'test262/test262';
let whatTest = process.argv.slice(2).find(x => x[0] !== '-');
if (!whatTest) throw new Error('need to specify a test file as argument');

if (!whatTest.startsWith('test/')) whatTest = 'test/' + whatTest;

const _tests = new Test262Stream(test262Path, {
  paths: [ whatTest ]
});

const prelude = fs.readFileSync('test262/prelude.js', 'utf8');

let valtype = 'i32';

const valtypeOpt = process.argv.find(x => x.startsWith('-valtype='));
if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

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

let toLog;
const run = async ({ contents, copyright }, flags) => {
  const singleContents = contents.split('---*/').pop();

  // toLog = singleContents;

  let toRun = prelude + singleContents;

  for (const hack of hacks) {
    toRun = hack(toRun);
  }

  toLog = toRun;

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

const tests = [];
for await (const test of _tests) {
  if (test.scenario === 'strict mode') continue;
  tests.push(test);
}

const height = 40;
for await (const test of tests) {
  const file = test.file.replaceAll('\\', '/').replace('test/', '');

  const expected = test.attrs.negative ? true : false;
  const expectedType = test.attrs.negative?.type;

  const flags = [];
  if (test.attrs.flags.module) flags.push('module');

  const [ stage, result ] = await run(test, flags);
  const errored = stage !== 2;

  let pass = errored === expected;
  if (pass && expected) pass = result.constructor.name === expectedType;

  // console.clear();
  console.log(toLog);
  // console.log('\n'.repeat(height - toLog.split('\n').length));
  console.log('\n\n\n');
  console.log(`\u001b[${pass ? '92' : '91'}m${file}\u001b[0m \u001b[90m${test.scenario}\u001b[0m`);

  if (!pass) console.log(result);
}