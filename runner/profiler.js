#!/usr/bin/env node

import compile from '../compiler/wrap.js';
import fs from 'node:fs';

globalThis.profiler = true;

const file = process.argv.slice(2).find(x => x[0] !== '-');
let source = fs.readFileSync(file, 'utf8');

let profileId = 0;
source = source.replace(/^[^\n}]*;$/mg, _ => `profile(${profileId++});${_}profile(${profileId++});`);

// console.log(source);

let tmp = {};

const percents = process.argv.includes('-%');

try {
  const { exports } = await compile(source, process.argv.includes('--module') ? [ 'module' ] : [], {
    z: n => {
      if (n % 2) tmp[n] = (tmp[n] ?? 0) + (performance.now() - tmp[n - 1]);
        else tmp[n] = performance.now();
    }
  });

  const start = performance.now();

  exports.main();

  const total = performance.now() - start;

  console.log('\n\ntotal: ' + total + '\n\n' + source.split('\n').map(x => {
    let time = 0;
    if (x.startsWith('profile')) {
      const id = parseInt(x.slice(8, x.indexOf(')')));
      time = tmp[id + 1];
    }

    let color = [ 0, 0, 0 ];
    if (time) {
      const relativeTime = Math.sqrt(time / total);
      if (percents) time = relativeTime;

      color = [ (relativeTime * 250) | 0, (Math.sin(relativeTime * Math.PI) * 50) | 0, 0 ];
    }

    const ansiColor = `2;${color[0]};${color[1]};${color[2]}m`;

    if (percents) return `\x1b[48;${ansiColor}\x1b[97m${time ? ((time * 100).toFixed(0).padStart(4, ' ') + '%') : '     '}\x1b[0m\x1b[38;${ansiColor}▌\x1b[0m ${x.replace(/profile\([0-9]+\);/g, '')}`;

    let digits = 2;
    if (time >= 100) digits = 1;
    if (time >= 1000) digits = 0;

    return `\x1b[48;${ansiColor}\x1b[97m${time ? time.toFixed(digits).padStart(6, ' ') : '      '}\x1b[0m\x1b[38;${ansiColor}▌\x1b[0m ${x.replace(/profile\([0-9]+\);/g, '')}`;
  }).join('\n'));
} catch (e) {
  console.error(e);
}