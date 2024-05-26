import { execSync } from 'node:child_process';
import fs from 'node:fs';

const rev = fs.readFileSync('.git/refs/heads/main', 'utf8').trim().slice(0, 9);

const packageJson = fs.readFileSync('package.json', 'utf8');
const version = JSON.parse(packageJson).version;
fs.writeFileSync('package.json', packageJson.replace(`"${version}"`, `"${version}-${rev}"`));

execSync(`npm publish`, { stdio: 'inherit' });

fs.writeFileSync('package.json', packageJson);