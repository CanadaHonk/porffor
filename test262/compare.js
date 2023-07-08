import { execSync } from 'node:child_process';
import fs from 'node:fs';

const [ commitsAgo ] = process.argv.slice(2);

const args = process.argv.slice(3);

console.log('running now...', `(node test262 test ${args.join(' ')})`);
execSync(`node test262 test ${args.join(' ')}`, { stdio: 'inherit' });
const passesNow = JSON.parse(fs.readFileSync('test262/passes.json', 'utf8'));

console.log(`going ${commitsAgo} commits ago...`);
execSync(`git checkout HEAD~${commitsAgo}`, { stdio: 'inherit' });

console.log('running previous...', `(node test262 test ${args.join(' ')})`);
execSync(`node test262 test ${args.join(' ')}`, { stdio: 'inherit' });
const passesPrev = JSON.parse(fs.readFileSync('test262/passes.json', 'utf8'));

console.log('returning to present...');
execSync(`git checkout main`);

console.clear();

console.log(`\n\n\u001b[4mnew passes\u001b[0m\n${passesNow.passes.filter(x => !passesPrev.passes.includes(x)).join('\n')}\n\n`);
console.log(`\u001b[4mnew fails\u001b[0m\n${passesPrev.passes.filter(x => !passesNow.passes.includes(x)).join('\n')}`);

console.log(`\n\n${commitsAgo} commits ago: ${passesPrev.passes.length}/${passesPrev.total} passed - ${((passesPrev.passes.length / passesPrev.total) * 100).toFixed(1)}%`);
console.log(`\u001b[1mnow: ${passesNow.passes.length}/${passesNow.total} passed - ${((passesNow.passes.length / passesNow.total) * 100).toFixed(1)}%\u001b[0m`);

console.log(`\n\u001b[90mwith args: ${args.join(' ')}\u001b[0m`);