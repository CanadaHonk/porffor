import fs from 'node:fs/promises';
import { join } from 'node:path';

// scan only: return relative test file paths. workers read + prepare each test
// themselves via readOne, so the primary never holds test contents
export default async (test262Path, filter, first = []) => {
  if (Array.isArray(filter)) return filter;

  if (filter.startsWith('test/')) filter = filter.slice(5);
  const testPath = join(test262Path, 'test');

  const tests = [];
  const done = {};
  const add = file => {
    const rel = file.replace(testPath + '/', '');
    if (done[rel]) return;
    done[rel] = true;
    tests.push(rel);
  };

  const scan = async x => {
    const dir = await fs.readdir(x, { withFileTypes: true });

    const promises = [];
    for (const entry of dir) {
      const full = join(x, entry.name);
      if (entry.isDirectory()) {
        promises.push(scan(full).catch(() => {}));
        continue;
      }

      if (entry.name.endsWith('.js') && !entry.name.includes('_FIXTURE')) add(full);
    }

    await Promise.all(promises);
  };

  if (filter) {
    if (filter.endsWith('.js')) add(join(testPath, filter));
      else await scan(join(testPath, filter));
  } else {
    for (const x of first) add(join(testPath, x));
    await scan(testPath);
  }

  return tests;
};

export const readOne = async (test262Path, relFile, preludes) => {
  const testPath = join(test262Path, 'test');
  const alwaysPrelude = preludes['#host'] + preludes['assert.js'] + preludes['sta.js'];
  const file = join(testPath, relFile);

  let contents;
  try {
    contents = await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }

  const flags = {};
  let flagsRaw = contents.match(/^flags: \[(.*)\]$/m)?.[1];
  if (!flagsRaw && contents.includes('flags:')) {
    // check for md style list as fallback
    flagsRaw = contents.match(/^flags:\n(  - .*\s*\n)+/m);
    if (flagsRaw) flagsRaw = flagsRaw[0].replaceAll('\n  - ',',').slice(7, -1);
  }
  if (flagsRaw) {
    for (const x of flagsRaw.split(',')) flags[x.trim()] = true;
  }

  const includes = (contents.match(/^includes: \[(.*)\]$/m)?.[1] ?? '').split(',');

  let prefix = '';
  let body = contents;
  if (!flags.raw) {
    // spec order: assert.js/sta.js precede includes
    prefix = (flags.onlyStrict ? '"use strict";\n' : '') +
      alwaysPrelude +
      (flags.async ? preludes['doneprintHandle.js'] : '') +
      includes.reduce((acc, x) => acc + (preludes[x.trim()] ?? ''), '');
    contents = prefix + body;
  }

  let negative = contents.match(/^negative:\s*\n\s*phase:\s*(.*)\s*\n\s*type:\s*(.*)\s*$/m);
  if (negative) negative = { phase: negative[1], type: negative[2] };
  if (flags.negative && !negative) negative = true;

  return { file: relFile, contents, prefix, body, flags, negative };
};
