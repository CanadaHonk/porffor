import { execSync } from 'node:child_process';
import fs from 'node:fs';

const packageJson = fs.readFileSync('package.json', 'utf8');
const jsrJson = fs.readFileSync('jsr.json', 'utf8');
const packageVersion = JSON.parse(packageJson).version;

const majorminor = packageVersion.split('.').slice(0, 2).join('.');
const patch = parseInt(packageVersion.split('.')[2].split(/[^0-9\-]/)[0]) + 1;

// const rev = fs.readFileSync('.git/refs/heads/main', 'utf8').trim().slice(0, 9);
// const version = `${majorminor}.${patch}+${rev}`;
const version = `${majorminor}.${patch}`;

fs.writeFileSync('package.json', packageJson.replace(`"${packageVersion}"`, `"${version}"`));
fs.writeFileSync('jsr.json', jsrJson.replace(`"${packageVersion}"`, `"${version}"`));

fs.writeFileSync('runtime/index.js', fs.readFileSync('runtime/index.js', 'utf8')
  .replace(/globalThis\.version = '.*?';/, `globalThis.version = '${version}';`));

execSync(`git add package.json  jsr.json runtime/index.js`, { stdio: 'inherit' });
execSync(`git commit --amend -C HEAD --no-verify`, { stdio: 'inherit' });

execSync(`${process.env.NPM_BINARY ?? 'npm'} publish`, { stdio: 'inherit' });
execSync(`${process.env.NPM_BINARY ?? 'npm'} x jsr -- publish --token=${process.env.JSR_TOKEN} --allow-dirty`, { stdio: 'inherit' });
