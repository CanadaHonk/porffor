#!/usr/bin/env node
import { Opcodes, Valtype } from '../compiler/wasmSpec.js';
import { number } from '../compiler/encoding.js';
import { importedFuncs } from '../compiler/builtins.js';
import compile, { createImport } from '../compiler/wrap.js';
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv.slice(2).find(x => x[0] !== '-');

let host = globalThis?.navigator?.userAgent;
if (typeof process !== 'undefined' && process.argv0 === 'node') host = 'Node/' + process.versions.node;
host ??= 'Unknown';

const title = process.argv.slice(process.argv.indexOf(file) + 1).find(x => x[0] !== '-') ?? path.basename(file);

let source = fs.readFileSync(file, 'utf8');

const samplesFunc = []; // Stores function index for each sample
const samplesStart = []; // Stores start timestamp for each sample
const samplesEnd = []; // Stores end timestamp for each sample (filled in profile2)
let funcLookup = new Map(); // Maps function index to { index, name, internal, ... }
let start, end; // Overall start and end time of execution

// --- Performance Tuning ---
const minSampleDurationMs = 0.01; // Ignore samples shorter than this for flame graph hierarchy

// --- Spinner Globals ---
const spinner = ['-', '\\', '|', '/'];
let spinIdx = 0;
let lastProgressUpdate = 0;
const progressUpdateIntervalMs = 500; // Update every 500ms

// Stack tracking for flamegraph construction
let running = new Uint32Array(1024); // Stores indices into samplesFunc/Start/End arrays
let runningIdx = 0;

// --- Profiling Hooks ---
createImport('profile1', [ Valtype.i32 ], 0, f => { // pre-call
  const now = performance.now();
  samplesStart.push(now);
  // Store the *index* of the just pushed start time/func id
  // This index corresponds to the entry in samplesFunc/Start/End
  const sampleIndex = samplesFunc.push(f) - 1;
  samplesEnd.push(null); // Placeholder for end time
  running[runningIdx++] = sampleIndex;
});

createImport('profile2', 0, 0, () => { // post-call
  const now = performance.now();
  if (runningIdx > 0) {
    const sampleIndex = running[--runningIdx];
    // Only set end time if it hasn't been set (handles potential async overlaps?)
    if (samplesEnd[sampleIndex] === null) {
        samplesEnd[sampleIndex] = now;
    }
  }

  // Check if it's time to update progress spinner
  if (now - lastProgressUpdate > progressUpdateIntervalMs) {
      lastProgressUpdate = now;
      const sampleCount = samplesFunc.length;
      const currentSpinner = spinner[spinIdx++ % spinner.length];
      const termWidth = process.stdout.columns || 80;
      const output = `\r${currentSpinner} Running... Samples: ${sampleCount}`;
      // Write progress, ensuring the rest of the line is cleared
      process.stdout.write(output + ' '.repeat(Math.max(0, termWidth - output.length - 1)));
  }
});

// --- Compilation ---
Prefs.treeshakeWasmImports = false; // Keep profile imports
globalThis.compileCallback = ({ funcs }) => {
  funcLookup = new Map(); // Reset map
  for (const x of funcs) {
    funcLookup.set(x.index, x);

    // Inject profiling calls around existing calls
    const w = x.wasm;
    for (let i = 0; i < w.length; i++) {
      if (w[i][0] === Opcodes.call) {
        const f = w[i][1];
        // Don't profile calls to imported funcs (like profile1/2 itself)
        if (f < importedFuncs.length) continue;

        // Inject profile2 *after* the call
        w.splice(i + 1, 0, [ Opcodes.call, importedFuncs.profile2 ]);
        // Inject function index push and profile1 *before* the call
        w.splice(i, 0, number(f, Valtype.i32), [ Opcodes.call, importedFuncs.profile1 ]);
        i += 3; // Skip the 3 instructions we just added
      }
    }
  }
};

console.log('Compiling...');
const { exports } = compile(source, undefined, () => {});

// --- Execution with Progress Spinner ---

console.log('Starting execution...');
// Initial placeholder message
const initialMsg = "Running... (waiting for first samples)";
const termWidthInitial = process.stdout.columns || 80;
process.stdout.write('\r' + initialMsg + ' '.repeat(Math.max(0, termWidthInitial - initialMsg.length -1)));

start = performance.now();

try {
    exports.main();
} finally {
    // Clear the spinner line
    const termWidthFinal = process.stdout.columns || 80;
    process.stdout.write('\r' + ' '.repeat(termWidthFinal) + '\r');
}

end = performance.now();
console.log(`Execution finished in ${(end - start).toFixed(2)}ms`);

// --- Data Processing ---

const totalDuration = end - start;
// const processedSamples = []; // Remove: We'll create a filtered list directly
const filteredSamples = []; // Samples that meet the duration threshold for the flame graph
const funcStats = new Map(); // { index -> { total: 0, count: 0, min: Infinity, max: -Infinity, name: '', internal: false }}

// Process raw samples: Calculate stats for all, filter for flame graph
console.log(`Processing ${samplesFunc.length} raw samples...`);
let samplesBelowThreshold = 0;
for (let i = 0; i < samplesFunc.length; i++) {
    const funcIndex = samplesFunc[i];
    const func = funcLookup.get(funcIndex);
    const funcName = func ? func.name : `unknown_${funcIndex}`;
    const isInternal = func ? !!func.internal : false; // Read internal flag
    const startTime = samplesStart[i];
    const endTime = samplesEnd[i] === null ? end : samplesEnd[i]; // Cap duration
    const duration = endTime - startTime;

    if (duration < 0) continue; // Skip potentially erroneous samples

    // --- Update function stats (always do this) ---
    if (!funcStats.has(funcIndex)) {
        funcStats.set(funcIndex, { total: 0, count: 0, min: Infinity, max: -Infinity, name: funcName, internal: isInternal }); // Store internal flag
    }
    const stats = funcStats.get(funcIndex);
    stats.total += duration;
    stats.count++;
    if (duration < stats.min) stats.min = duration;
    if (duration > stats.max) stats.max = duration;

    // --- Filter samples for flame graph hierarchy ---
    if (duration >= minSampleDurationMs) {
        filteredSamples.push({
            // Only store data needed for buildHierarchy
            name: funcName,
            start: startTime - start, // Relative to overall start
            end: endTime - start,     // Relative to overall start
            duration: duration,
            internal: isInternal // Store internal flag for flamegraph nodes
        });
    } else {
        samplesBelowThreshold++;
    }
}
console.log(`Filtered out ${samplesBelowThreshold} samples shorter than ${minSampleDurationMs}ms.`);
console.log(`Building hierarchy from ${filteredSamples.length} samples...`);

// --- d3-flame-graph Data Generation ---
// Requires a hierarchical structure: { name: 'root', value: total, children: [...] }
// where value represents the total time (inclusive of children)
function buildHierarchy(samples) {
    if (!samples || samples.length === 0) {
        return { name: path.basename(file), value: 0, children: [], internal: false }; // Root is not internal
    }

    // Sort primarily by start time, secondarily by end time descending (parents first)
    samples.sort((a, b) => a.start - b.start || b.end - a.end);

    const root = { name: path.basename(file), value: 0, children: [], internal: false }; // Root is not internal
    root.startTime = 0;
    root.endTime = totalDuration;
    const stack = [{ node: root, startTime: root.startTime, endTime: root.endTime }]; // Consistent structure

    for (const sample of samples) {
        // Pass internal flag from filteredSample to newNode
        const newNode = { name: sample.name, value: sample.duration, children: [], internal: sample.internal };
        const sampleStartTime = sample.start;
        const sampleEndTime = sample.end;

        // Pop stack until parent is found
        // Parent must start before or at the same time, and end after or at the same time
        // Accessing .startTime and .endTime on stack elements is correct here
        while (stack.length > 1 && (stack[stack.length - 1].startTime > sampleStartTime || stack[stack.length - 1].endTime < sampleEndTime)) {
            stack.pop();
        }

        const parent = stack[stack.length - 1];
        parent.node.children.push(newNode); // Correctly access children via parent.node

        // Add node to stack with its *graph node* reference and end time
        stack.push({ node: newNode, startTime: sampleStartTime, endTime: sampleEndTime });
    }

    // d3-flamegraph expects `value` to be inclusive time, but we provide durations.
    // The library handles the aggregation based on children, so we just pass the duration.
    // Let's ensure root value is the total duration if samples don't cover it
    // root.value = Math.max(root.value, samples.reduce((sum, s) => sum + s.duration, 0)); // Remove: Not needed with selfValue(true)

    return root;
}

const d3FlameGraphData = buildHierarchy(filteredSamples);

// --- Bar Chart Data Generation (remains the same) ---
const barChartData = Array.from(funcStats.values())
    .map(stats => ({
        name: stats.name,
        total: stats.total,
        min: stats.min === Infinity ? 0 : stats.min,
        max: stats.max === -Infinity ? 0 : stats.max,
        avg: stats.count > 0 ? stats.total / stats.count : 0,
        count: stats.count,
        internal: stats.internal // Include internal flag from funcStats
    }))
    .sort((a, b) => b.total - a.total) // Sort by total time descending
    .slice(0, 50); // Limit to top 50 functions

console.log('uploading...');
const { id } = await (await fetch('https://profile.porffor.dev', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    flame: d3FlameGraphData,
    chart: barChartData,
    title,
    subtitle: `Porffor ${globalThis.version} on ${host.replace('/', ' ')} | ${new Date().toISOString().slice(0, -8).replace('T', ' ')}\n${totalDuration.toFixed(2)}ms | ${samplesFunc.length} samples`
  })
})).json();
console.log(`https://profile.porffor.dev/${id}`);
process.exit(0);