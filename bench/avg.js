#!/usr/bin/env node
import { execSync } from 'node:child_process';

const times = parseInt(process.argv[2]);
const cmd = process.argv[3];

const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');

let data = [];
for (let i = 0; i < times; i++) {
  data.push(parseFloat(noAnsi(execSync(cmd, { stdio: 'pipe' }).toString().trim())));

  await new Promise(res => setTimeout(res, 100));
}

console.log((data.reduce((acc, x) => acc + x, 0) / data.length).toFixed(0));