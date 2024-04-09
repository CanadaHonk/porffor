#!/usr/bin/env node

import compile from '../compiler/wrap.js';
import fs from 'node:fs';

import Byg from '../byg/index.js';

const file = process.argv.slice(2).find(x => x[0] !== '-');
let source = fs.readFileSync(file, 'utf8');

const originalLines = source.split('\n');

let funcs = {}, funcId = 0;
source = source.replace(/^\s*(function|const)\s*([a-zA-Z0-9]+)(\s*=\s*)?\([^)]*\)\s*(=>)?\s*\{$/gm, (x, _, n) => {
  const id = funcId++;
  funcs[funcId] = n;
  return `${x}profile(${100000 + id})`;
});

const lines = source.split('\n');
for (let i = 0; i < lines.length; i++) {
  // lines[line] = lines[line].replace(/^[^\n}]*;$/, _ => `profile(${line});${_}`);
  if (lines[i].trim().replace('}', '') !== '') lines[i] = `profile(${i});` + lines[i];
}
source = lines.join('\n');

const breakpoints = new Array(lines.length);

let paused = true;
const byg = Byg({
  lines: originalLines,
  pause: () => { paused = true; },
  breakpoint: (line, breakpoint) => {
    breakpoints[line] = breakpoint;
  }
});

// console.log(source);

let stepIn = false, stepOut = false;
const callStack = [];

let _paused;
let callStarts = [];
let lastLine;

let output = '';

try {
  const { exports } = await compile(source, process.argv.includes('--module') ? [ 'module' ] : [], {
    z: n => {
      if (n >= 100000) {
        // start of call
        callStack.push(funcs[n - 100000]);

        callStarts.push(lastLine);

        _paused = paused;
        if (!stepIn) paused = false;
          else paused = true;

        return;
      }

      if (callStarts[callStarts.length - 1] === n - 1) {
        // end of call

        callStarts.pop();
        callStack.pop();

        paused = _paused;
      }

      lastLine = n;

      if (breakpoints[n]) paused = true;

      if (paused) {
        stepIn = false; stepOut = false;

        switch (byg(
          paused,
          n,
          `\x1b[1mporffor debugger\x1b[22m: ${file}@${n + 1}    ${callStack.join('->')}`,
          [
            {
              x: termWidth - 1 - 40 - 6,
              // y: () => termHeight - 20 - 1 - 4,
              y: () => 4,
              width: 40,
              height: 20,
              title: 'console',
              content: output.split('\n')
            }
          ]
        )) {
          case 'resume': {
            paused = false;
            break;
          }

          case 'stepOver': {
            break;
          }

          case 'stepIn': {
            stepIn = true;
            // paused = false;
            break;
          }

          case 'stepOut': {
            stepOut = true;
            paused = false;
            break;
          }
        }
      }
    }
  }, s => output += s);

  exports.main();
} catch (e) {
  console.error(e);
}