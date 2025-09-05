import fs from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';

export default async (test262Path, filter, preludes, first = []) => {
  if (filter.startsWith('test/')) filter = filter.slice(5);
  const testPath = join(test262Path, 'test');

  const alwaysPrelude = preludes['assert.js'] + preludes['sta.js'];

  const tests = [];
  const scan = async x => {
    const dir = await fs.readdir(x);

    const promises = [];
    for (const file of dir) {
      if (file.endsWith('.js')) {
        if (file.includes('_FIXTURE')) continue;
        promises.push(read(join(x, file)));
        continue;
      }

      promises.push(scan(join(x, file)).catch(() => {}));
      continue;
    }

    await Promise.all(promises);
  };

  const done = {};
  const read = async file => {
    if (done[file]) return;
    done[file] = true;

    let contents = await fs.readFile(file, 'utf8');

    const flags = {};
    let flagsRaw = contents.match(/^flags: \[(.*)\]$/m)?.[1];
    if (!flagsRaw && contents.includes('flags:')) {
      // check for md style list as fallback
      flagsRaw = contents.match(/^flags:\n(  - .*\s*\n)+/m);
      if (flagsRaw) flagsRaw = flagsRaw[0].replaceAll('\n  - ',',').slice(7, -1);
    }
    if (flagsRaw) {
      for (const x of flagsRaw.split(',')) {
        flags[x.trim()] = true;
      }
    }

    const includes = (contents.match(/^includes: \[(.*)\]$/m)?.[1] ?? '').split(',');

    if (!flags.raw) {
      contents = (flags.onlyStrict ? '"use strict";\n' : '') +
        (flags.async ? preludes['doneprintHandle.js'] : '') +
        (includes.reduce((acc, x) => acc + (preludes[x.trim()] ?? ''), '')) +
        alwaysPrelude + contents;
    }

    let negative = contents.match(/^negative:\s*\n\s*phase:\s*(.*)\s*\n\s*type:\s*(.*)\s*$/m);
    if (negative) negative = {
      phase: negative[1],
      type: negative[2]
    };
    if (flags.negative && !negative) negative = true;

    tests.push({
      file: file.replace(testPath + '/', ''),
      contents,
      flags,
      negative
    });
  };

  if (filter) {
    if (filter.endsWith('.js')) await read(join(testPath, filter));
      else await scan(join(testPath, filter));
  } else {
    let wait = [];
    for (const x of first) wait.push(read(join(testPath, x)));
    await Promise.all(wait);
    await scan(testPath);
  }

  return tests;
};