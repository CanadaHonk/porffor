import { TYPE_NAMES } from '../compiler/types.js';
import compile from '../compiler/wrap.js';
import version from './version.js';

import util from 'node:util';

let repl;
try {
  // try importing node:repl
  repl = await import('node:repl');

  // check it is not just a mock with REPLServer prototype
  if (repl.REPLServer.prototype.defineCommand == null)
    throw 'mock node:repl detected';
} catch {
  // it failed, import the polyfill
  repl = (await import('node-repl-polyfill')).default;
}

globalThis.valtype = 'f64';

const valtypeOpt = process.argv.find(x => x.startsWith('--valtype='));
if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

let host = globalThis?.navigator?.userAgent;
if (typeof process !== 'undefined' && process.argv0 === 'node') host = 'Node/' + process.versions.node;
host ??= 'Unknown';

if (host.startsWith('Node')) host = '\x1B[92m' + host;
if (host.startsWith('Deno')) host = '\x1B[97m' + host;
if (host.startsWith('Bun')) host = '\x1B[93m' + host;

console.log(`Welcome to \x1B[1m\x1B[35mPorffor\x1B[0m \x1B[90m(${version})\x1B[0m running on \x1B[1m${host.replace('/', ' \x1B[0m\x1B[90m(')})\x1B[0m`);
console.log(`\x1B[90musing opt ${process.argv.find(x => x.startsWith('-O')) ?? '-O1'}, parser ${parser}, valtype ${valtype}\x1B[0m`);
console.log();

let lastMemory, lastPages;
const PageSize = 65536;
const memoryToString = mem => {
  let out = '';
  const pages = lastPages.length;
  const wasmPages = mem.buffer.byteLength / PageSize;

  out += `\x1B[1mallocated ${mem.buffer.byteLength / 1024}KB\x1B[0m for ${pages} thing${pages === 1 ? '' : 's'} using ${wasmPages} Wasm page${wasmPages === 1 ? '' : 's'}\n\n`;

  const buf = new Uint8Array(mem.buffer);

  let longestType = 0, longestName = 0;
  for (const x of lastPages) {
    const [ type, name ] = x.split(': ');
    if (type.length > longestType) longestType = type.length;
    if (name.length > longestName) longestName = name.length;
  }

  out += `\x1B[0m\x1B[1m  name${' '.repeat(longestName - 4)} \x1B[0m\x1B[90m│\x1B[0m\x1B[1m type${' '.repeat(longestType - 4)} \x1B[0m\x1B[90m│\x1B[0m\x1B[1m memory\x1B[0m\n`; // ─
  for (let i = 0; i < pages; i++) {
    const [ type, name ] = lastPages[i].split(': ');
    // out += `\x1B[36m${lastPages[i].replace(':', '\x1B[90m:\x1B[34m')}\x1B[90m${' '.repeat(longestName - lastPages[i].length)} | \x1B[0m`;
    out += `  \x1B[34m${name}${' '.repeat(longestName - name.length)} \x1B[90m│\x1B[0m \x1B[36m${type}${' '.repeat(longestType - type.length)} \x1B[90m│\x1B[0m `;

    for (let j = 0; j < 40; j++) {
      const val = buf[i * pageSize + j];
      // if (val === 0) out += '\x1B[2m';
      if (val === 0) out += '\x1B[90m';
      out += val.toString(16).padStart(2, '0');
      if (val === 0) out += '\x1B[0m';
      out += ' ';
    }
    out += '\n';
  }

  return out;
};

let prev = '';
const run = async (source, _context, _filename, callback, run = true) => {
  // hack: print "secret" before latest code ran to only enable printing for new code

  let toRun = (prev ? (prev + `;\nprint(-0x1337);\n`) : '') + source.trim();

  let shouldPrint = !prev;
  const { exports, pages } = await compile(toRun, [], {}, str => {
    if (shouldPrint) process.stdout.write(str);
    if (str === '-4919') shouldPrint = true;
  });

  if (run && exports.$) {
    lastMemory = exports.$;
    lastPages = [...pages.keys()];
  }

  let ret = run ? exports.main() : undefined;
  let value, type;
  if (ret?.type != null) {
    value = ret.value;
    type = ret.type;
    ret = ret.js;
  }

  console.log(util.inspect(ret, false, 2, true), (value != null ? `\x1B[34m\x1B[3m(value: ${value}, type: ${TYPE_NAMES[type]})\x1B[0m` : ''));

  // callback(null, ret);

  prev = prev + ';\n' + source.trim();

  callback();
};

const replServer = repl.start({ prompt: '> ', eval: run });

replServer.setupHistory('.repl_history', () => {});

replServer.defineCommand('memory', {
  help: 'Log Wasm memory',
  action() {
    this.clearBufferedCommand();
    console.log(memoryToString(lastMemory));
    this.displayPrompt();
  }
});
replServer.defineCommand('asm', {
  help: 'Log Wasm decompiled bytecode',
  async action() {
    this.clearBufferedCommand();

    try {
      process.argv.push('--opt-funcs');
      await run('', null, null, () => {}, false);
      process.argv.pop();
    } catch { }

    this.displayPrompt();
  }
});
replServer.defineCommand('js', {
  help: 'Log JS being actually ran',
  async action() {
    this.clearBufferedCommand();
    console.log(prev);
    this.displayPrompt();
  }
});