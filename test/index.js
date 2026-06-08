import { describe, test } from 'node:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const porf = process.platform === 'win32' ? join(repoRoot, 'porf.cmd') : join(repoRoot, 'porf');

const testsDir = join(__dirname, 'tests');
const useWasm = process.argv.includes('--wasm');

async function* walkDir(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkDir(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

const spawnAsync = (cmd, args, opts) => new Promise((resolve, reject) => {
  const proc = spawn(cmd, args, { encoding: 'utf8', ...opts });
  let stdout = '', stderr = '';
  proc.stdout.on('data', d => stdout += d);
  proc.stderr.on('data', d => stderr += d);
  proc.on('close', status => resolve({ status, stdout, stderr }));
  proc.on('error', reject);
});

describe('tests', { concurrency: true }, async () => {
  for await (const testFile of walkDir(testsDir)) {
    const relPath = relative(testsDir, testFile);

    test(relPath, async () => {
      if (useWasm) {
        const run = await spawnAsync(porf, [testFile], { cwd: repoRoot });
        if (run.status !== 0) {
          throw new Error(`test failed (exit ${run.status}):\n${(run.stderr || run.stdout || '').trim()}`);
        }
      } else {
        const tmpDir = await mkdtemp(join(tmpdir(), 'porf-test-'));
        const binPath = join(tmpDir, process.platform === 'win32' ? 'out.exe' : 'out');

        try {
          const compile = await spawnAsync(porf, ['native', testFile, binPath], { cwd: repoRoot });
          if (compile.status !== 0) {
            throw new Error(`compilation failed:\n${(compile.stderr || compile.stdout || '').trim()}`);
          }

          const run = await spawnAsync(binPath, []);
          if (run.status !== 0) {
            throw new Error(`test failed (exit ${run.status}):\n${(run.stderr || run.stdout || '').trim()}`);
          }
        } finally {
          await rm(tmpDir, { recursive: true, force: true });
        }
      }
    });
  }
});
