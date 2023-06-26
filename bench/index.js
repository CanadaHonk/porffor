import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';

const bench = (cmd, name) => {
  execSync(`hyperfine -w 5 -r 16 --export-json tmp.json "${cmd}"`);

  const { results } = JSON.parse(readFileSync('tmp.json', 'utf8'));
  rmSync('tmp.json');

  const ms = results[0].mean * 1000;
  console.log(name, ' '.repeat(30 - name.length), ms.toFixed(2), `(${(results[0].min * 1000).toFixed(2)} - ${(results[0].max * 1000).toFixed(2)})`);
};

for (const file of readdirSync('bench')) {
  // if (!['fib_iter.js', 'prime_basic.js'].includes(file)) continue;
  if (!['prime_basic.js'].includes(file)) continue;

  bench(`node bench/${file}`, `node ${file}`);
  bench(`node runner/index.js bench/${file} -raw`, `porffor on node ${file}`);
  bench(`deno run -A bench/${file}`, `deno ${file}`);
  bench(`deno run -A runner/index.js bench/${file} -raw`, `porffor on deno ${file}`);
  // bench(`node C:\\Users\\jeffd\\.esvu\\engines\\engine262\\package\\bin\\engine262.js bench/${file}`, `engine262 ${file}`);
}