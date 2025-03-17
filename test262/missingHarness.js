import Test262Stream from 'test262-stream';
import fs from 'node:fs';

const harness = fs.readFileSync('test262/harness.js', 'utf8');
const harnessFiles = fs.readdirSync('test262/test262/harness');

const missing = new Map();
for (const file of harnessFiles) {
  if (!harness.includes(`/// ${file}`)) missing.set(file, []);
}

const tests = new Test262Stream('test262/test262', {
  paths: [ 'test/' ],
  omitRuntime: true
});

for await (const test of tests) {
  for (const x of test.attrs.includes) {
    if (missing.has(x)) missing.get(x).push(test.file);
  }
}

for (const [file, tests] of [...missing.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${file}: ${tests.length}`);
}
