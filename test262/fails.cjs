const fs = require('fs');
const all = [];
const tree = x => {
  for (const y of fs.readdirSync(x)) {
    if (y.endsWith('.js')) {
      all.push((x + '/' + y).slice(21));
    } else {
      try {
        tree(x + '/' + y);
      } catch {}
    }
  }
};
tree('test262/test262/test');

const { passes } = require('./results.json');
const fails = all.filter(x => !passes.includes(x));
{
  const dirs = Object.groupBy(fails, x => x.split('/').slice(0, 2).join('/'));
  const top = Object.keys(dirs).sort((a, b) => dirs[b].length - dirs[a].length);
  console.log(top.slice(0, 40).map(x => `${x}: ${dirs[x].length} (${((dirs[x].length / all.length) * 100).toFixed(2)}%)`).join('\n'));
}
console.log()
{
  const dirs = Object.groupBy(fails, x => x.split('/').slice(0, 3).join('/'));
  const top = Object.keys(dirs).sort((a, b) => dirs[b].length - dirs[a].length);
  console.log(top.slice(0, 40).map(x => `${x}: ${dirs[x].length} (${((dirs[x].length / all.length) * 100).toFixed(2)}%)`).join('\n'));
}
console.log()
{
  const dirs = Object.groupBy(fails, x => x.split('/').slice(0, 4).join('/'));
  const top = Object.keys(dirs).sort((a, b) => dirs[b].length - dirs[a].length);
  console.log(top.slice(0, 40).map(x => `${x}: ${dirs[x].length} (${((dirs[x].length / all.length) * 100).toFixed(2)}%)`).join('\n'));
}