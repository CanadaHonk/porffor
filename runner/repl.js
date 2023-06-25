import compile from '../compiler/index.js';
import parse from '../compiler/parse.js';

import repl from 'node:repl';
import fs from 'node:fs';

const rev = fs.readFileSync('.git/refs/heads/main', 'utf8').trim();

process.argv.push('-O0'); // disable opts

console.log(`welcome to porffor rev ${rev.slice(0, 7)}`);
console.log();

let prev = '';
const run = async (source, _context, _filename, callback) => {
  let toRun = prev + source.trim();
  if (source.includes('=')) toRun += ';' + source.split('=')[0].trim().split(' ').pop();

  const flags = [];

  const ast = parse(toRun, []);
  const lastType = ast.body[ast.body.length - 1].type;
  if (lastType === 'ExpressionStatement' || lastType === 'VariableDeclaration') flags.push('return');

  const wasm = compile(toRun, flags);
  fs.writeFileSync('out.wasm', Buffer.from(wasm));

  if (source.includes('=')) prev += source + '\n';

  const print = str => process.stdout.write(str);

  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => print(Number(i).toString()),
      c: i => print(String.fromCharCode(Number(i)))
    }
  });

  const ret = instance.exports.m();
  callback(null, ret);
};

repl.start({ prompt: '> ', eval: run });