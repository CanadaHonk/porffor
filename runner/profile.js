#!/usr/bin/env node

import compile from '../compiler/wrap.js';
import fs from 'node:fs';

const file = process.argv.slice(2).find(x => x[0] !== '-');
let source = fs.readFileSync(file, 'utf8');

let profileId = 0;
source = source.replace(/^[^\n}]*;$/mg, _ => `profile1(Porffor.wasm.i32.const(${profileId}));${_}profile2(Porffor.wasm.i32.const(${profileId++}));`)

let tmp = new Array(profileId).fill(0);
let times = new Array(profileId).fill(0);
let samples = 0;

const percents = process.argv.includes('-%');

const spinner = ['-', '\\', '|', '/'];
let spin = 0;
let last = 0;

try {
  const { exports } = compile(source, process.argv.includes('--module') ? [ 'module' ] : [], {
    y: n => {
      tmp[n] = performance.now();
    },
    z: n => {
      const t = performance.now();
      times[n] += t - tmp[n];

      samples++;
      if (t > last) {
        process.stdout.write(`\r${spinner[spin++ % 4]} running: collected ${samples} samples...`);
        last = t + 100;
      }
    }
  });

  const start = performance.now();

  exports.main();

  const total = performance.now() - start;

  console.log(`\ntotal: ${total}ms\nsamples: ${samples}\n\n\n` + source.split('\n').map(x => {
    let time = 0;
    if (x.startsWith('profile')) {
      const id = parseInt(x.slice(32, x.indexOf(')')));
      time = times[id]
    }

    let color = [ 0, 0, 0 ];
    if (time) {
      let relativeTime = time / total;
      if (percents) time = relativeTime;

      relativeTime = Math.sqrt(relativeTime);
      color = [ (relativeTime * 250) | 0, (Math.sin(relativeTime * Math.PI) * 50) | 0, 0 ];
    }

    const ansiColor = `2;${color[0]};${color[1]};${color[2]}m`;

    const line = x.replace(/profile[0-9]\(Porffor.wasm.i32.const\([0-9]+\)\);/g, '');

    if (percents) return `\x1b[48;${ansiColor}\x1b[97m${time ? ((time * 100).toFixed(0).padStart(4, ' ') + '%') : '     '}\x1b[0m\x1b[38;${ansiColor}▌\x1b[0m ${line}`;

    let digits = 2;
    if (time >= 100) digits = 1;
    if (time >= 1000) digits = 0;

    return `\x1b[48;${ansiColor}\x1b[97m${time ? time.toFixed(digits).padStart(6, ' ') : '      '}\x1b[0m\x1b[38;${ansiColor}▌\x1b[0m ${line}`;
  }).join('\n'));
} catch (e) {
  console.error(e);
}