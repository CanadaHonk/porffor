import { TYPE_NAMES } from '../compiler/types.js';
import compile from '../compiler/wrap.js';
import parse from '../compiler/parse.js';

import util from 'node:util';

Prefs.optUnused = false;

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

globalThis.valtype = Prefs.valtype ?? 'f64';

let host = globalThis?.navigator?.userAgent;
if (typeof process !== 'undefined' && process.argv0 === 'node') host = 'Node/' + process.versions.node;
host ??= 'Unknown';

if (host.startsWith('Node')) host = '\x1B[92m' + host;
if (host.startsWith('Deno')) host = '\x1B[97m' + host;
if (host.startsWith('Bun')) host = '\x1B[93m' + host;

console.log(`Welcome to \x1B[1m\x1B[35mPorffor\x1B[0m \x1B[2m(${globalThis.version})\x1B[0m running on \x1B[1m${host.replace('/', ' \x1B[0m\x1B[2m(')})\x1B[0m`);
// console.log(`\x1B[90musing opt ${process.argv.find(x => x.startsWith('-O')) ?? '-O1'}, parser ${parser}, valtype ${valtype}\x1B[0m`);
console.log();

let lastMemory, lastPages;
const memoryToString = mem => {
  let out = '';
  const wasmPages = mem.buffer.byteLength / 65536;

  out += `\x1B[1mallocated ${mem.buffer.byteLength / 1024}KiB\x1B[0m (using ${wasmPages} Wasm page${wasmPages === 1 ? '' : 's'})\n\n`;

  const buf = new Uint8Array(mem.buffer);

  let longestType = 4, longestName = 4;
  for (const x of lastPages) {
    const [ type, name ] = x.split(': ');
    if (type.length > longestType) longestType = type.length;
    if (name.length > longestName) longestName = name.length;
  }

  out += `\x1B[0m\x1B[1m  name${' '.repeat(longestName - 4)} \x1B[0m\x1B[90m│\x1B[0m\x1B[1m type${' '.repeat(longestType - 4)} \x1B[0m\x1B[90m│\x1B[0m\x1B[1m memory\x1B[0m\n`; // ─
  for (let i = 0; i < wasmPages; i++) {
    if (lastPages[i]) {
      const [ type, name ] = lastPages[i].split(': ');
      // out += `\x1B[36m${lastPages[i].replace(':', '\x1B[90m:\x1B[34m')}\x1B[90m${' '.repeat(longestName - lastPages[i].length)} | \x1B[0m`;
      out += `  \x1B[34m${name}${' '.repeat(longestName - name.length)} \x1B[90m│\x1B[0m \x1B[36m${type}${' '.repeat(longestType - type.length)} \x1B[90m│\x1B[0m `;
    } else {
      const type = '???';
      const name = '???';
      out += `  \x1B[34m${name}${' '.repeat(longestName - name.length)} \x1B[90m│\x1B[0m \x1B[36m${type}${' '.repeat(longestType - type.length)} \x1B[90m│\x1B[0m `;
    }

    let j = 0;
    if (i === 0) j = 16;
    const end = j + 40;
    for (; j < end; j++) {
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
const run = (source, _context, _filename, callback, run = true) => {
  // hack: print "secret" before latest code ran to only enable printing for new code

  source = source.trim();
  if (source.startsWith('{') && source.endsWith('}')) {
    const wrapped = '(' + source + ')';
    try {
      parse(wrapped);
      source = wrapped;
    } catch {}
  }

  let toRun = (prev ? (prev + `;\nprint(-0x1337);\n`) : '') + source;

  let shouldPrint = !prev;
  try {
    const { exports, pages } = compile(toRun, undefined, str => {
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

    prev = prev + ';\n' + source.trim();
  } catch (e) {
    console.log('Uncaught', e.stack ? e.stack : e);
  }

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
  help: 'Log Wasm disassembled bytecode',
  action() {
    this.clearBufferedCommand();

    try {
      Prefs.optFuncs = true;
      run('', null, null, () => {}, false);
      Prefs.optFuncs = false;
    } catch { }

    this.displayPrompt();
  }
});
replServer.defineCommand('js', {
  help: 'Log JS being actually ran',
  action() {
    this.clearBufferedCommand();
    console.log(prev);
    this.displayPrompt();
  }
});