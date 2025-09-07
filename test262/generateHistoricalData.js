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

  const results = new Array(8).fill(0); // %, total tests, passes, fails, runtime errors, wasm errors, compile errors, timeout errors
  for (let [ what, number ] of x.split('|').map(x => x.trim().split(' ').slice(0, 2))) {
    number = parseFloat(number);

    let i;
    switch (what) {
      case 'test262:':
        i = 0;
        break;
      case '🧪':
        i = 1;
        break;
      case '🤠':
        i = 2;
        break;
      case '❌':
        i = 3;
        break;
      case '📝':
      case '💀':
        i = 4;
        break;
      case '🧩':
      case '🏗️':
        i = 5;
        break;
      case '💥':
        i = 6;
        break;
      case '⏰':
        i = 7;
        break;
    }
    if (i != null) results[i] += number;
  }

  out.push({ results, time: parseInt(timestamp) * 1000, hash, title });
}

fs.writeFileSync('test262/history.json', JSON.stringify(out));