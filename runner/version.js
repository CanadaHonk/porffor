import { readFileSync } from 'node:fs';

let rev = 'unknown';
try {
  rev = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version.split('-')[1].slice(0, 7);
} catch {
  rev = readFileSync(new URL('../.git/refs/heads/main', import.meta.url), 'utf8').trim().slice(0, 7);
}

export default rev;