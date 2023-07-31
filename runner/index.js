#!/usr/bin/env node

import compile from '../compiler/wrap.js';
import fs from 'node:fs';

const file = process.argv.slice(2).find(x => x[0] !== '-');
if (!file) {
  // run repl if no file given
  await import('./repl.js');

  // do nothing for the rest of this file
  await new Promise(() => {});
}

const source = fs.readFileSync(file, 'utf8');

let cache = '';
const print = str => {
  cache += str;

  if (str === '\n') {
    process.stdout.write(cache);
    cache = '';
  }
};

try {
  const { exports } = await compile(source, process.argv.includes('--module') ? [ 'module' ] : [], {}, print);

  exports.main();
  if (cache) process.stdout.write(cache);
} catch (e) {
  console.error(`${e.constructor.name}: ${e.message}`);
}