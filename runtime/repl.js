import fs from 'node:fs';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import compile from '../compiler/index.js';

// one dir for the session: native units cache by entry path
const tmp = fs.mkdtempSync('/tmp/porffor-repl-');

const runNativeSource = (source, output, module = Prefs.module) => {
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
  }
};

Prefs.optUnused = false;
Prefs.O = 1;
Prefs.p = true;
Prefs.module = true;
Prefs.repl = true;

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

let prev = '';

const run = source => {
  source = source.trim();
  if (!source) return;

  const current = source.startsWith('{') && source.endsWith('}') ? '(' + source + ')' : source;
  const toRun = prev ? `(() => { Porffor.c\`porf_repl_output_enabled = 0;\`; })();
${prev};
(() => { Porffor.c\`porf_repl_output_enabled = 1;\`; })();
${current}` : current;
  let out = '';
  try {
    runNativeSource(toRun, x => { out += x; });
    if (out) process.stdout.write(out.endsWith('\n') ? out : out + '\n');
    prev = prev ? prev + ';\n' + current : current;
  } catch (e) {
    if (out) process.stdout.write(out);
    if (e?.status == null) console.log('Uncaught', e.stack ? e.stack : e);
  }
};

// readline over node:repl so the selfhosted binary has it too, history newest first like node's
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ', historySize: 1000 });
rl.history = fs.existsSync('.repl_history') ? fs.readFileSync('.repl_history', 'utf8').split('\n').filter(Boolean) : [];
rl.on('line', line => {
  if (line.trim() === '.exit') return rl.close();
  run(line);
  fs.writeFileSync('.repl_history', rl.history.join('\n'));
  rl.prompt();
});
rl.prompt();

await new Promise(resolve => rl.on('close', resolve));
fs.rmSync(tmp, { recursive: true, force: true });
