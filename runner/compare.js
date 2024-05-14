import { execSync } from 'node:child_process';
import fs from 'node:fs';

const [ commitsAgo, file ] = process.argv.slice(2);
const source = fs.readFileSync(file, 'utf8');

const compileNow = (await import('../compiler/index.js')).default;
const wasmNow = compileNow(source).byteLength;

execSync(`git checkout HEAD~${commitsAgo}`);

let failed = false;

fs.writeFileSync('tmp.js', source);
try {
  execSync(`node runner/index.js tmp.js`);
} catch {
  failed = true;
} finally {
  fs.rmSync('tmp.js');
  execSync(`git checkout main`);
}

console.log();

if (failed) {
  console.log(`!! failed to compile then`);
  process.exit();
}

const wasmThen = Buffer.byteLength(fs.readFileSync('out.wasm'));

console.log(`now: ${wasmNow} bytes`);
console.log(`${commitsAgo} commit${commitsAgo > 1 ? 's' : ''} ago: ${wasmThen} bytes`);