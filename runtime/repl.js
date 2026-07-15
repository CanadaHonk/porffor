import fs from 'node:fs';
import * as repl from 'node:repl';
import { execFileSync } from 'node:child_process';
import compile from '../compiler/index.js';

const runNativeSource = (source, output, module = Prefs.module) => {
  const tmp = fs.mkdtempSync('/tmp/porffor-run-');
  const inputFile = `${tmp}/input.js`;
  const outFile = `${tmp}/out`;
  const oldPrefs = { ...Prefs };
  const oldFile = globalThis.file;

  try {
    fs.writeFileSync(inputFile, source);
    globalThis.file = inputFile;
    Prefs.target = 'native';
    Prefs.o = outFile;
    Prefs.quiet = true;
    compile(source, module);
    try {
      const out = execFileSync(outFile, [], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ] });
      if (out) output(out);
    } catch (e) {
      if (e.stdout) output(e.stdout.toString());
      if (e.stderr) output(e.stderr.toString());
      throw e;
    }
  } finally {
    for (const key of Object.keys(Prefs)) delete Prefs[key];
    Object.assign(Prefs, oldPrefs);
    globalThis.file = oldFile;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

Prefs.optUnused = false;
Prefs.p = true;
Prefs.module = true;

let host = typeof navigator === 'object' ? navigator.userAgent : null;
if (typeof process !== 'undefined' && process.argv0 === 'node') host = 'Node/' + process.versions.node;
host ??= 'Unknown';

if (host.includes('/')) host = host.replace('/', ' \x1B[0m\x1B[2m(') + ')';
if (host.startsWith('Node')) host = '\x1B[92m' + host;
if (host.startsWith('Deno')) host = '\x1B[97m' + host;
if (host.startsWith('Bun')) host = '\x1B[93m' + host;
if (host.startsWith('Porffor')) host = '\x1B[38;2;156;96;224m' + host;

console.log(host.startsWith('\x1B[38;2;156;96;224mPorffor') ?
  `Welcome to \x1B[1m\x1B[38;2;156;96;224mPorffor\x1B[0m \x1B[2m${globalThis.version}\x1B[0m \x1B[1;38;2;245;240;255;48;2;124;58;237m SELF-HOSTED \x1B[0m` :
  `Welcome to \x1B[1m\x1B[38;2;156;96;224mPorffor\x1B[0m \x1B[2m${globalThis.version}\x1B[0m running on \x1B[1m${host}\x1B[0m`);
console.log();

const marker = '\x1Eporf-repl-marker\x1E';
let prev = '';

const run = (source, _context, _filename, callback) => {
  source = source.trim();
  if (!source) {
    callback();
    return;
  }

  const current = source.startsWith('{') && source.endsWith('}') ? '(' + source + ')' : source;
  const toRun = prev ? prev + `;\nconsole.log(${JSON.stringify(marker)});\n` + current : current;
  let out = '';
  const visibleOutput = () => {
    if (!prev) return out;
    const markerIndex = out.indexOf(marker);
    if (markerIndex === -1) return out;

    let visible = out.slice(markerIndex + marker.length);
    if (visible.startsWith('\r\n')) visible = visible.slice(2);
      else if (visible.startsWith('\n')) visible = visible.slice(1);
    return visible;
  };
  try {
    runNativeSource(toRun, x => { out += x; });
    const visible = visibleOutput();
    if (visible) process.stdout.write(visible);
    prev = prev ? prev + ';\n' + current : current;
  } catch (e) {
    const visible = visibleOutput();
    if (visible) process.stdout.write(visible);
    console.log('Uncaught', e.stack ? e.stack : e);
  }

  callback();
};

const replServer = repl.start({ prompt: '> ', eval: run });

replServer.setupHistory('.repl_history', () => {});

replServer._start?.();
