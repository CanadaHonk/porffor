import cluster from 'node:cluster';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';
import { generateProgram } from './generator.js';

const workerDataPath = '/tmp/fuzzWorkerData.json';

if (cluster.isPrimary) {
  const veryStart = performance.now();

  // Parse CLI arguments
  let threads = parseInt(process.argv.find(x => x.startsWith('--threads='))?.split('=')?.[1]);
  if (Number.isNaN(threads)) {
    threads = Math.max(1, os.cpus().length - 1);
    console.log(`Using ${threads} threads (detected ${os.cpus().length} CPUs)`);
  }

  const duration = parseFloat(process.argv.find(x => x.startsWith('--duration='))?.split('=')?.[1]) || 60; // seconds
  const maxStatements = parseInt(process.argv.find(x => x.startsWith('--max-statements='))?.split('=')?.[1]) || 20;
  const maxFunctions = parseInt(process.argv.find(x => x.startsWith('--max-functions='))?.split('=')?.[1]) || 4;
  const verbose = process.argv.includes('--verbose');
  const saveFailures = process.argv.includes('--save-failures');
  const plainResults = process.argv.includes('--plain-results');

  console.log(`Starting fuzzer for ${duration}s with ${threads} threads`);
  console.log(`Max statements: ${maxStatements}, Max functions: ${maxFunctions}`);

  const table = (...arr) => {
    let out = '';
    const total = arr[0];
    for (let i = 0; i < arr.length; i++) {
      let icon = [ '🧪', '🤠', '❌', '💀', '🏗️', '💥', '⏰', '📝' ][i];
      let iconDesc = [ 'total', 'pass', 'fail', 'runtime error', 'wasm compile error', 'compile error', 'timeout', 'todo' ][i];

      let data = arr[i];
      if (i > 0) data = ((data / total) * 100).toPrecision(2) + '%';
      let str = `${plainResults ? iconDesc : icon} ${data}`;
      if (i !== arr.length - 1) str += plainResults ? ' | ' : '\u001b[90m | \u001b[0m';
      out += str;
    }
    return out;
  };

  // Stats tracking - same order as test262
  let totalTests = 0;
  let passes = 0;
  let fails = 0;
  let runtimeErrors = 0;
  let wasmErrors = 0;
  let compileErrors = 0;
  let timeouts = 0;
  let todos = 0;

  const errorCounts = new Map();
  const failureFiles = [];

  const startTime = performance.now();
  const endTime = startTime + (duration * 1000);

  // Worker data
  const workerData = {
    maxStatements,
    maxFunctions,
    verbose,
    saveFailures,
    endTime
  };
  fs.writeFileSync(workerDataPath, JSON.stringify(workerData));

  // Stats display
  let lastUpdate = 0;
  const updateInterval = 100;
  let spinner = ['-', '\\', '|', '/'], spin = 0;

  const updateStats = () => {
    const now = performance.now();
    if (now - lastUpdate < updateInterval) return;
    lastUpdate = now;

    const elapsed = (now - startTime) / 1000;
    const remaining = Math.max(0, (endTime - now) / 1000);
    const rate = totalTests / elapsed;

    const tab = ` \u001b[90m${spinner[spin++ % 4]}\u001b[0m  ` +
      table(totalTests, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts, todos);

    process.stdout.write(`\r\u001b[K${tab} | ${rate.toFixed(0)}/s | ${remaining.toFixed(1)}s left`);
  };

  // Spawn workers with timeout handling like test262
  const workers = [];

  const spawn = (index) => {
    const worker = cluster.fork();
    workers[index] = worker;

    let timeout;
    const enqueue = () => {
      if (performance.now() >= endTime) {
        worker.kill();
        return;
      }

      if (timeout) clearTimeout(timeout);

      worker.send(null);
      timeout = setTimeout(() => {
        worker.kill();

        totalTests++;
        timeouts++;
        errorCounts.set('timeout', (errorCounts.get('timeout') || 0) + 1);

        if (saveFailures) {
          const timestamp = Date.now();
          const filename = `fuzz/failure_${timestamp}_timeout.js`;
          fs.writeFileSync(filename, 'timeout');
          failureFiles.push(filename);
        }

        updateStats();
        spawn(index); // Respawn worker
      }, 1000);
    };

    worker.on('message', msg => {
      if (msg === null) {
        enqueue();
        return;
      }

      if (timeout) clearTimeout(timeout);

      totalTests++;

      // result encoding: pass=0, todo=1, wasmError=2, compileError=3, fail=4, timeout=5, runtimeError=6
      const result = msg.result;

      if (msg.error) {
        const error = `${msg.error.name}: ${msg.error.message}`
          .replace(/\([0-9]+:[0-9]+\)/, '')
          .replace(/@\+[0-9]+/, '');

        const count = errorCounts.get(error) || 0;
        errorCounts.set(error, count + 1);

        if (count === 0) {
          const resultNames = ['PASS', 'TODO', 'WASM_ERROR', 'COMPILE_ERROR', 'FAIL', 'TIMEOUT', 'RUNTIME_ERROR'];
          console.log('\n---');
          console.log(`\x1b[4mNEW ${resultNames[result]}: ${error}\x1b[0m`);
          console.log(msg.code);
          console.log('---\n');
        }
      }

      if (result === 0) {
        passes++;
      } else if (result === 1) {
        todos++;
      } else if (result === 2) {
        wasmErrors++;
      } else if (result === 3) {
        compileErrors++;
      } else if (result === 4) {
        fails++;
      } else if (result === 6) {
        runtimeErrors++;
      }

      if (msg.code && (result !== 0 || verbose)) {
        if (saveFailures && result !== 0) {
          const timestamp = Date.now();
          const resultNames = ['pass', 'todo', 'wasmError', 'compileError', 'fail', 'timeout', 'runtimeError'];
          const filename = `fuzz/failure_${timestamp}_${resultNames[result]}.js`;
          fs.writeFileSync(filename, msg.code);
          failureFiles.push(filename);
        }

        if (verbose && result !== 0) {
          const resultNames = ['PASS', 'TODO', 'WASM_ERROR', 'COMPILE_ERROR', 'FAIL', 'TIMEOUT', 'RUNTIME_ERROR'];
          console.log('---');
          console.log(`\n[${resultNames[result]}] ${msg.error?.message || 'Unknown error'}`);
          console.log(msg.code);
          console.log('---');
        }
      }

      updateStats();
      enqueue();
    });
  };

  for (let i = 0; i < threads; i++) {
    spawn(i);
  }

  // Handle cleanup
  const cleanup = () => {
    workers.forEach(worker => worker.kill());

    console.log('\u001b[2F\u001b[0J\u001b[1m\u001b[4mfuzzing complete\u001b[0m');

    console.log(table(totalTests, passes, fails, runtimeErrors, wasmErrors, compileErrors, timeouts, todos) + '\n\n');

    if (errorCounts.size > 0) {
      const sortedErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      sortedErrors.forEach(([error, count]) => {
        console.log(`\u001b[90m${((count / totalTests) * 100).toPrecision(2).padStart(6, ' ')}%\u001b[0m \u001b[1m${error}\u001b[0m`);
      });
    }

    if (failureFiles.length > 0) {
      console.log(`\nFailure files saved: ${failureFiles.length}`);
      failureFiles.slice(0, 5).forEach(file => console.log(`  ${file}`));
      if (failureFiles.length > 5) console.log(`  ... and ${failureFiles.length - 5} more`);
    }

    const elapsed = (performance.now() - startTime) / 1000;
    console.log(`\n\u001b[90mtook ${elapsed.toFixed(1)}s (${(totalTests / elapsed).toFixed(0)} tests/s)\u001b[0m`);

    process.exit(0);
  };

  // Auto-stop after duration
  if (duration !== Infinity) setTimeout(cleanup, duration * 1000);

  // Handle Ctrl+C
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
} else {
  // Worker process
  let { maxStatements, maxFunctions, verbose, saveFailures, endTime } = JSON.parse(fs.readFileSync(workerDataPath, 'utf8'));
  endTime ??= Infinity;
  const compile = (await import('../compiler/wrap.js')).default;

  process.on('message', () => {
    if (performance.now() >= endTime) {
      process.exit(0);
    }

    const code = generateProgram({ maxStatements, maxFunctions });

    let result = 0; // pass
    let error = null;
    let stage = 0;

    try {
      const out = compile(code, false);

      try {
        out.exports.main();
        stage = 2;
        result = 0; // pass
      } catch (runtimeError) {
        stage = 1;
        error = runtimeError;
        result = 6; // runtime error
      }
    } catch (compileError) {
      stage = 0;
      error = compileError;

      // Classify compile errors same as test262
      if (compileError.name === 'CompileError') {
        result = 2; // wasm compile error
      } else {
        result = 3; // compile error
      }
    }

    process.send({
      result,
      error: error ? { name: error.name, message: error.message } : null,
      // code: verbose || saveFailures ? code : null
      code
    });
  });

  process.send(null);
}
