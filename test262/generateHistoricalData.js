import { execSync } from 'node:child_process';
import fs from 'fs';

const log = execSync(`git log -9999 --pretty="%B%n%H %ct"`).toString().split('\n');
const out = [];

for (let i = 0; i < log.length; i++) {
  const x = log[i];
  if (!x.startsWith('test262: 1') && !x.startsWith('test262: 2') && !x.startsWith('test262: 3')) continue;

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

  out.push({ results, time: parseInt(timestamp) * 1000, hash, title });
}

fs.writeFileSync('test262/history.json', JSON.stringify(out));