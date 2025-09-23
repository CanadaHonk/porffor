#!/usr/bin/env node
import { execSync } from 'node:child_process';

const times = parseInt(process.argv[2]);
const cmd = process.argv[3];

const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');

let spinner = ['-', '\\', '|', '/'], spin = 0;
const clear = `\r${' '.repeat(32)}\r`;

let data = [];

// warmup
for (let i = 0; i < times; i++) {
  process.stdout.write(clear + spinner[spin++ % spinner.length] + ' warming up... ' + (i + 1));
  execSync(cmd, { stdio: 'pipe' })
}

for (let i = 0; i < times; i++) {
  process.stdout.write(clear + spinner[spin++ % spinner.length] + ' running... ' + (i + 1));
  data.push(parseFloat(noAnsi(execSync(cmd, { stdio: 'pipe' }).toString().trim())));
  await new Promise(res => setTimeout(res, 100));
}

console.log(clear + (data.reduce((acc, x) => acc + x, 0) / data.length).toFixed(0));