import compile from '../compiler/wrap.js';
import parse from '../compiler/parse.js';

import repl from 'node:repl';
import fs from 'node:fs';

const rev = fs.readFileSync('.git/refs/heads/main', 'utf8').trim();

// process.argv.push('-O0'); // disable opts

globalThis.valtype = 'i32';

const valtypeOpt = process.argv.find(x => x.startsWith('-valtype='));
if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

console.log(`welcome to porffor rev ${rev.slice(0, 7)}`);
console.log(`info: using opt ${process.argv.find(x => x.startsWith('-O')) ?? '-O3'} and valtype ${valtype}`);
console.log();

let prev = '';
const run = async (source, _context, _filename, callback) => {
  let toRun = prev + source.trim();
  if (source.includes(' = ')) toRun += ';' + source.split('=')[0].trim().split(' ').pop();

  const flags = [];

  const ast = parse(toRun, []);
  const lastType = ast.body[ast.body.length - 1].type;
  if (lastType === 'ExpressionStatement' || lastType === 'VariableDeclaration') flags.push('return');

  const { exports, wasm } = await compile(toRun, flags);
  fs.writeFileSync('out.wasm', Buffer.from(wasm));

  if (source.includes(' = ')) prev += source + '\n';

  const ret = exports.main();
  callback(null, ret);
};

repl.start({ prompt: '> ', eval: run });