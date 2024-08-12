import { TYPE_NAMES } from '../compiler/types.js';
import compile from '../compiler/wrap.js';

import util from 'node:util';

Options.optUnused = false;

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

globalThis.valtype = Options.valtype ?? 'f64';

const color = (txt, colors) => {
  if (!(process.stdout.isTTY ?? true)) {
    return txt;
  }
  if (!Array.isArray(colors)) {
    colors = [ colors ]; 
  }
  return colors.map(x => '\x1B[' + x + 'm').join('') + txt + '\x1B[0m';
};

let host = globalThis?.navigator?.userAgent;
if (typeof process !== 'undefined' && process.argv0 === 'node') host = 'Node/' + process.versions.node;
host ??= 'Unknown';

let hostColor = 1;
if (host.startsWith('Node')) hostColor = [1, 92];
if (host.startsWith('Deno')) hostColor = [1, 97];
if (host.startsWith('Bun')) hostColor = [1, 93];

let slashIndex = host.indexOf('/');
if (slashIndex < 0) slashIndex = host.length;

console.log(`Welcome to ${color('Porffor', [1, 35])} ${color('(' + globalThis.version + ')', 90)} running on ${color(host.substring(0, slashIndex), hostColor)}${slashIndex != host.length ? color(` (${host.substring(slashIndex + 1)})`, 90) : ''}`);
console.log(color(`using opt -O${Options.optLevel}, parser ${parser}, valtype ${valtype}`, 90));
console.log();

let lastMemory, lastPages;
const PageSize = 65536;
const memoryToString = mem => {
  let out = '';
  const wasmPages = mem.buffer.byteLength / PageSize;

  out += `${color(`allocated ${mem.buffer.byteLength / 1024}KiB`, 1)} (using ${wasmPages} Wasm page${wasmPages === 1 ? '' : 's'})\n\n`;

  const buf = new Uint8Array(mem.buffer);

  let longestType = 4, longestName = 4;
  for (const x of lastPages) {
    const [ type, name ] = x.split(': ');
    if (type.length > longestType) longestType = type.length;
    if (name.length > longestName) longestName = name.length;
  }

  out += `${color(`  name${' '.repeat(longestName - 4)} `, 1)}${color('|', 90)}${color(` type${' '.repeat(longestType - 4)} `, 1)}${color('|', 90)}${color(' memory', 1)}\n`; // ─
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
  if (source.startsWith('{') && source.endsWith('}')) source = '(' + source + ')';

  let toRun = (prev ? (prev + `;\nprint(-0x1337);\n`) : '') + source;

  let shouldPrint = !prev;
  const { exports, pages } = compile(toRun, Options.module ? [ 'module' ] : [], {}, str => {
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
  action() {
    this.clearBufferedCommand();

    let tempOptFuncs = Options.optFuncs;
    try {
      run('', null, null, () => {}, false);
    } catch { }
    Options.optFuncs = tempOptFuncs;

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