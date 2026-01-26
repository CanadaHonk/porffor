import { execSync } from 'node:child_process';
import fs from 'node:fs';

const packageJson = fs.readFileSync('package.json', 'utf8');
const packageVersion = JSON.parse(packageJson).version;
const majorminor = packageVersion.split('.').slice(0, 2).join('.');
const patch = parseInt(packageVersion.split('.')[2].split(/[^0-9\-]/)[0]) + 1;
const version = `${majorminor}.${patch}`;

fs.writeFileSync('package.json', packageJson.replace(`"${packageVersion}"`, `"${version}"`));

const jsrJson = fs.readFileSync('jsr.json', 'utf8');
fs.writeFileSync('jsr.json', jsrJson.replace(`"${packageVersion}"`, `"${version}"`));

fs.writeFileSync(
  'runtime/index.js',
  fs.readFileSync('runtime/index.js', 'utf8')
    .replace(/globalThis\.version = '.*?';/, `globalThis.version = '${version}';`)
);

execSync('node test262/generateHistoricalData.js', { stdio: 'inherit' });