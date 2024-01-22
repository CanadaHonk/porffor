import fs from 'node:fs';

let rev = 'unknown';
try {
  rev = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version.split('-')[1].slice(0, 7);
} catch {
  rev = fs.readFileSync(new URL('../.git/refs/heads/main', import.meta.url), 'utf8').trim().slice(0, 7);
}

export default rev;