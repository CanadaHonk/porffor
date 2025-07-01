import { execSync } from 'node:child_process';
import fs from 'fs';

const log = execSync(`git log -9999 --pretty="%B%n%H %ct"`).toString().split('\n');
const out = [];

for (let i = 0; i < log.length; i++) {
  const x = log[i];
  if (!x.startsWith('test262: 1') && !x.startsWith('test262: 2') && !x.startsWith('test262: 3') && !x.startsWith('test262: 4') && !x.startsWith('test262: 5') && !x.startsWith('test262: 6')) continue;

  let title;
  let j = i;
  while (!title) {
    const y = log[--j];
    if (!y.includes(': ') || y.includes('also: ') || y.includes('Co-Authored-By')) continue;
    title = y;
  }

  j = i + 1;
  while (log[j].length !== 51 || log[j].split(' ').length !== 2) j++;
  let [ hash, timestamp ] = log[j].split(' ');

  let results = x.split('|').map(x => parseFloat(x.split('(')[0].trim().split(' ').pop().trim().replace('%', '')));
  if (results.length === 8) results = [ ...results.slice(0, 7), 0, results[7] ];

  // commit specific hacks due to bad history
  if (hash === '10deaeb214342e16ad2d01100a848f97dc3e6316') results[8] = 6116;

  out.push({ results, time: parseInt(timestamp) * 1000, hash, title });
}

fs.writeFileSync('test262/history.json', JSON.stringify(out));