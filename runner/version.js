import { readFileSync } from 'node:fs';

export let version = 'unknown';
export let rev = 'unknown';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
version = packageJson.version.split('-')[0];
rev = packageJson.version.split('-')[1];

if (!rev) rev = readFileSync(new URL('../.git/refs/heads/main', import.meta.url), 'utf8').trim().slice(0, 9);

export default `${version}-${rev}`;