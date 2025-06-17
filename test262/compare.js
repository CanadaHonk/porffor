import { $ } from 'bun';

const dir = process.argv[2];

let now = (await $`node test262/index.js ${dir}`).stdout.toString();
await $`git stash push compiler test262`;
let before = (await $`node test262/index.js ${dir}`).stdout.toString();
await $`git stash pop`;

const getResults = out => {
  const res = new Map();
  for (const x of out.split('\n')) {
    const [ emoji, file ] = x.trim().slice(22, -4).split(' ');
    if (!emoji || !file || emoji.length > 2 || !file.includes('/')) continue;

    res.set(file, emoji);
  }

  return res;
};

now = getResults(now);
before = getResults(before);

const files = [...now.keys()];
const diff = files.filter(x => now.get(x) !== before.get(x));

for (const x of diff) {
  console.log(x, before.get(x), '->', now.get(x));
}