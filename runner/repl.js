import compile from '../compiler/wrap.js';
import rev from './version.js';

import repl from 'node:repl';

// process.argv.push('-O0'); // disable opts

globalThis.valtype = 'f64';

const valtypeOpt = process.argv.find(x => x.startsWith('-valtype='));
if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

console.log(`welcome to porffor rev ${rev.slice(0, 7)}`);
console.log(`info: using opt ${process.argv.find(x => x.startsWith('-O')) ?? '-O1'} and valtype ${valtype}`);
console.log();

let lastMemory, lastPages;
const PageSize = 65536;
const memoryToString = mem => {
  let out = '';
  const pages = lastPages.length;
  const wasmPages = mem.buffer.byteLength / PageSize;

  out += `\x1B[1mallocated ${mem.buffer.byteLength / 1024}KB\x1B[0m for ${pages} thing${pages === 1 ? '' : 's'} using ${wasmPages} Wasm page${wasmPages === 1 ? '' : 's'}\n`;

  const buf = new Uint8Array(mem.buffer);

  for (let i = 0; i < pages; i++) {
    out += `\x1B[36m${lastPages[i]}\x1B[2m | \x1B[0m`;

    for (let j = 0; j < 50; j++) {
      const val = buf[i * pageSize + j];
      if (val === 0) out += '\x1B[2m';
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

  let toRun = prev + `;\nprint(-0x1337);\n` + source.trim();

  let shouldPrint = false;
  const { exports, wasm, pages } = await compile(toRun, [], {}, str => {
    if (shouldPrint) process.stdout.write(str);
    if (str === '-4919') shouldPrint = true;
  });
  // fs.writeFileSync('out.wasm', Buffer.from(wasm));

  if (run && exports.$) {
    lastMemory = exports.$;
    lastPages = [...pages.keys()];
  }

  const ret = run ? exports.main() : undefined;
  callback(null, ret);

  prev = prev + ';\n' + source.trim();
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
      process.argv.push('-opt-funcs');
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