#!/usr/bin/env node
import { Opcodes, Valtype } from '../compiler/wasmSpec.js';
import { number } from '../compiler/encoding.js';
import { importedFuncs } from '../compiler/builtins.js';
import compile from '../compiler/wrap.js';
import fs from 'node:fs';

const file = process.argv.slice(2).find(x => x[0] !== '-');
let source = fs.readFileSync(file, 'utf8');

const samplesFunc = [];
const samplesStart = [];
const samplesEnd = [];

const termWidth = process.stdout.columns || 80;
const termHeight = process.stdout.rows || 24;

let start, end;
const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');
const controls = {
};

const controlInfo = Object.keys(controls).reduce((acc, x, i) => acc + `\x1B[45m\x1B[97m${x}\x1b[105m\x1b[37m ${controls[x]}  `, '');
const plainControlInfo = noAnsi(controlInfo);

const spinner = ['-', '\\', '|', '/'];
let spin = 0;

const onExit = () => {
  process.stdout.write('\x1b[1;1H\x1b[J');
};
// process.on('exit', onExit);
// process.on('SIGINT', onExit);

let lastRenderTime = 0;
const render = () => {
  const renderStart = performance.now();
  process.stdout.write('\x1b[?2026h\x1b[1;1H\x1b[J\x1b[?25l');

  let text = ' ';
  if (!end) {
    text += `${spinner[spin++ % 4]} `;
  } else {
    text += '  ';
  }

  const now = performance.now();
  const realEnd = end ?? now;
  const total = realEnd - start;
  const _total = total;
  text += `${total.toFixed(0)}ms`;

  const samples = samplesFunc.length;
  text += `${' '.repeat(12 - text.length)}┃ samples: ${samples}`;
  text += `${' '.repeat(32 - text.length)}┃ render: ${lastRenderTime.toFixed(2)}ms`;

  if (end != null || Prefs.live) {
    const btHeight = 20;
    const fgBottom = termHeight - btHeight - 10;

    let lastEnds = [];
    let timelineEnd = total;

    const xScale = x => 1 + (((x - start) / timelineEnd) * (termWidth - 2));
    const draw = (func, start, end, running = false) => {
      let depth = lastEnds.length;
      lastEnds.push(end);

      let color = '103';
      if (func.internal) color = '105';

      start = xScale(start) | 0;

      end = xScale(end) | 0;
      if (end >= termWidth) end = termWidth - 1;

      const width = end - start;
      if (start >= termWidth || width === 0) return;

      let text = func.name;
      if (text.length > width) text = width < 5 ? ' '.repeat(width) : (text.slice(0, width - 1) + '…');
      if (text.length < width) text += ' '.repeat(width - text.length);

      let y = fgBottom - depth;
      process.stdout.write(`\x1b[${1 + y};${1 + start}H\x1b[51m\x1b[30m\x1b[${color}m${text}`);
    };

    const funcTotalTaken = new Map(), funcMeta = new Map();
    for (let i = 0; i < samples; i++) {
      const func = funcLookup.get(samplesFunc[i]);
      const start = samplesStart[i];
      const end = samplesEnd[i] ?? now;

      //     DD
      //   BBCCEE
      // AAAAAAAA FFFF
      while (start > lastEnds.at(-1)) lastEnds.pop();

      draw(func, start, end);

      if (end == now) continue;
      const taken = end - start;
      funcTotalTaken.set(func.index, (funcTotalTaken.get(func.index) ?? 0) + taken);

      if (!funcMeta.has(func.index)) funcMeta.set(func.index, [0, Infinity, -Infinity]);
      const meta = funcMeta.get(func.index);
      meta[0]++;

      if (meta[1] > taken) meta[1] = taken;
      if (taken > meta[2]) meta[2] = taken;
    }

    process.stdout.write(`\x1b[${termHeight - btHeight};1H\x1b[0m\x1b[90m${'▁'.repeat(termWidth)}\n`);

    (() => {
      const perTime = 18;
      let text = '  ' + 'name';
      text += `${' '.repeat(40 - text.length)}┃ total`;
      text += `${' '.repeat(40 + 5 + perTime - text.length)}┃ min`;
      text += `${' '.repeat(40 + 5 + (perTime * 2) - text.length)}┃ avg`;
      text += `${' '.repeat(40 + 5 + (perTime * 3) - text.length)}┃ max`;
      text += `${' '.repeat(40 + 5 + (perTime * 4) - text.length)}┃ count`;
      process.stdout.write(`\x1b[0m\x1b[2m${text.replaceAll('┃', '\x1b[0m\x1b[90m┃\x1b[0m\x1b[2m')}${' '.repeat(termWidth - text.length)}\x1b[0m`);
    })();

    const topTakenFuncs = [...funcTotalTaken.keys()].sort((a, b) => funcTotalTaken.get(b) - funcTotalTaken.get(a));
    for (let i = 0; i < btHeight - 2; i++) {
      const func = funcLookup.get(topTakenFuncs[i]);
      if (!func) continue;

      const total = funcTotalTaken.get(func.index);
      const [ count, min, max ] = funcMeta.get(func.index);
      const avg = total / count;

      const perTime = 18;
      let text = '  \x1b[1m' + func.name + '\x1b[22m';
      text += `${' '.repeat(49 - text.length)}┃ ${total.toFixed(2)}ms`;
      text += `${' '.repeat(49 + perTime - text.length)}${((total / _total) * 100).toFixed(0)}%`;
      text += `${' '.repeat(49 + 5 + perTime - text.length)}┃ ${min.toFixed(2)}ms`;
      text += `${' '.repeat(49 + 5 + (perTime * 2) - text.length)}┃ ${avg.toFixed(2)}ms`;
      text += `${' '.repeat(49 + 5 + (perTime * 3) - text.length)}┃ ${max.toFixed(2)}ms`;
      text += `${' '.repeat(49 + 5 + (perTime * 4) - text.length)}┃ ${count}`;
      process.stdout.write(`\x1b[${termHeight - btHeight + 2 + i};1H\x1b[0m${text.replaceAll('┃', '\x1b[90m┃\x1b[0m').replaceAll('ms', '\x1b[2mms\x1b[22m').replaceAll('%', '\x1b[2m%\x1b[22m')}${' '.repeat(termWidth - noAnsi(text).length)}`);
    }
  }

  process.stdout.write(`\x1b[${termHeight};1H\x1b[107m\x1b[30m${text}${' '.repeat(termWidth - plainControlInfo.length - noAnsi(text).length - 1)}${controlInfo} \x1b[0m\x1b[?2026l`);
  lastRenderTime = performance.now() - renderStart;
};

// importedFuncs[importedFuncs.profile2].params = [ Valtype.i32, Valtype.f64 ];

Prefs.treeshakeWasmImports = false;
let funcLookup = new Map();
globalThis.compileCallback = ({ funcs }) => {
  for (const x of funcs) {
    funcLookup.set(x.index, x);

    const w = x.wasm;
    for (let i = 0; i < w.length; i++) {
      if (w[i][0] === Opcodes.call) {
        const f = w[i][1];
        if (f < importedFuncs.length) continue;

        let local;
        if (x.locals['#profile_tmp']) {
          local = x.locals['#profile_tmp'].idx;
        } else {
          local = x.localInd++;
          x.locals['#profile_tmp'] = { idx: local, type: Valtype.f64 };
        }

        w.splice(i + 1, 0, number(f, Valtype.i32), [ Opcodes.call, importedFuncs.profile2 ]);
        w.splice(i, 0, number(f, Valtype.i32), [ Opcodes.call, importedFuncs.profile1 ]);
        i += 4;
      }
    }
  }
};

let last = 0;
let running = new Uint32Array(1024), runningIdx = 0;
const { exports } = compile(source, undefined, {
  y: f => { // pre-call
    samplesStart.push(performance.now());
    running[runningIdx++] = samplesFunc.push(f) - 1;
  },
  z: f => { // post-call
    const now = performance.now();
    samplesEnd[running[--runningIdx]] = now;

    if (now > last) {
      last = now + 500;
      render();
    }
  }
}, () => {});

start = performance.now();
render();

exports.main();
end = performance.now();

render();