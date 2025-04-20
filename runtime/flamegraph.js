#!/usr/bin/env node
import { Opcodes, Valtype } from '../compiler/wasmSpec.js';
import { number } from '../compiler/encoding.js';
import { importedFuncs } from '../compiler/builtins.js';
import compile, { createImport } from '../compiler/wrap.js';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import url from 'node:url';

const file = process.argv.slice(2).find(x => x[0] !== '-');
if (!file) {
  console.error('Usage: node flamegraph.js <file.js>');
  process.exit(1);
}
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
  if (runningIdx >= running.length) {
    // Resize running buffer if needed
    const newRunning = new Uint32Array(running.length * 2);
    newRunning.set(running);
    running = newRunning;
  }
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
const { exports } = compile(source, undefined, {}, () => {});

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

// --- HTML Generation ---
function generateHtml(flameData, chartData) {
    const flameJson = JSON.stringify(flameData);
    const chartJson = JSON.stringify(chartData);

return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Porffor Profile: ${path.basename(file)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/d3-flame-graph@4.1.3/dist/d3-flamegraph.css">
    <style>
        @import url(https://fonts.bunny.net/css?family=jetbrains-mono:400,600,800);

        :root {
            font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
            --header-primary: #ffffff;
            --header-secondary: #b9bbbe;
            --text-normal: #ffffff;
            --text-muted: #d0d4d8;
            --accent-dark: #3e2066;
            --accent: #8545cf;
            --accent-light: #9c60e0;
            --background-primary: #100420;
            --background-secondary: #200840;
        }
        html, body {
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--font-family);
            margin: 16px;
            background-color: var(--background-primary);
            color: var(--text-muted);
        }
        h2 {
            color: var(--header-primary);
            font-weight: 800;
            margin: 0;
            margin-bottom: 16px;
            font-size: 24px;
        }
        h2 > span {
            color: var(--text-muted);
            float: right;
            font-weight: normal;
        }
        #flamegraph-container, #barchart-container {
            border: 2px solid var(--accent);
            margin-bottom: 32px;
            background-color: var(--background-secondary);
            padding: 16px;
            border-radius: 0;
        }
        #flamegraph-details {
          margin-top: 10px;
          font-size: 14px;
          color: var(--text-muted);
          min-height: 2em;
        }
        .chart-title {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 15px;
            color: var(--header-primary);
            border-bottom: 1px solid var(--accent);
            padding-bottom: 8px;
            margin-top: 0;
        }
        .bar-row { display: flex; align-items: center; font-size: 14px; white-space: nowrap; height: 24px; }
        .bar-label { width: 320px; overflow: hidden; text-overflow: ellipsis; padding-right: 10px; color: var(--text-muted); font-weight: 600;}
        .bar-rect-bg { flex-grow: 1; background-color: var(--background-secondary); border: 1px solid var(--accent-dark); height: 100%; position: relative; min-width: 100px; border-radius: 0; }
        .bar-rect { background-color: var(--accent); height: 100%; position: absolute; left: 0; top: 0; border-radius: 0; display: flex; align-items: center; }
        .bar-value { color: var(--header-primary); font-size: 14px; position: relative; left: 6px; }
        .bar-stats-inline { position: absolute; right: 8px; top: 0; height: 100%; display: flex; align-items: center; font-size: 12px; color: var(--header-secondary); }
        #flamegraph-chart {
             width: 100%;
             background-color: var(--background-secondary);
             min-height: 400px;
        }
        .d3-flame-graph rect {
            stroke: var(--background-primary);
            stroke-width: 0.5;
            fill-opacity: .9;
        }
        .d3-flame-graph rect:hover {
            stroke: var(--accent-light);
            stroke-width: 1;
            fill-opacity: 1;
        }
        .d3-flame-graph-label {
            user-select: none;
            /* white-space: unset; */
            /* text-overflow: unset; */
            overflow: hidden;
            font-size: 12px;
            font-family: inherit;
            /* padding: 0 0 0; */
            color: black;
            /* overflow-wrap: break-word; */
            line-height: 1.5;
        }
        .d3-flame-graph .depth-0 .d3-flame-graph-label {
            font-size: 16px;
        }
    </style>
</head>
<body>
    <h2>${path.basename(file)} <span>${totalDuration.toFixed(2)}ms | ${samplesFunc.length} samples</span></h2>

    <div id="flamegraph-container" style="position: relative;">
        <div id="flamegraph-chart"></div>
        <div id="flamegraph-details"></div>
    </div>

    <div id="barchart-container">
        <div id="barchart"></div>
    </div>

    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/d3-flame-graph@4.1.3/dist/d3-flamegraph.min.js"></script>
    <script>
        const flameData = ${flameJson};
        const chartData = ${chartJson};
        const totalValue = flameData.value;

        const flamegraphContainer = document.getElementById('flamegraph-chart');
        const detailsElement = document.getElementById('flamegraph-details');
        const graphWidth = flamegraphContainer.clientWidth || 960;
        const graphHeight = flamegraphContainer.clientHeight || 400;

        const chartDataByName = chartData.reduce((acc, d) => {
            acc[d.name] = d;
            return acc;
        }, {});

        var flameChart = flamegraph()
            .width(graphWidth)
            .height(graphHeight)
            .cellHeight(18)
            .transitionDuration(0)
            .minFrameSize(1)
            .sort(true)
            .selfValue(true)
            .setDetailsElement(detailsElement)
            .setColorHue('warm')
            // Add a color mapper to dim internal functions
            .setColorMapper(function(d, originalColor) {
              if (d.data.internal) {
                return 'var(--accent-light)';
              }
              return originalColor; // Return original color if not internal or parsing failed
            })
            .label(function(d) {
                if (d.data.name === 'root') return '';

                return \`\${d.data.name}: \${d.value.toFixed(2)}ms (\${(d.value / (chartDataByName[d.data.name]?.avg ?? d.value)).toFixed(2)}x avg)\`;
             });

        if (flameData && flameData.children && flameData.children.length > 0) {
             d3.select("#flamegraph-chart")
                .datum(flameData)
                .call(flameChart);
        } else {
             flamegraphContainer.textContent = 'No profiling data captured for flame graph.';
        }

        window.addEventListener('resize', () => {
             d3.select("#flamegraph-chart").selectAll(":scope > *").remove();

             // Update width and height on resize
             const newWidth = flamegraphContainer.clientWidth || 960;
             const newHeight = flamegraphContainer.clientHeight || 400;
             flameChart.width(newWidth).height(newHeight);

             d3.select("#flamegraph-chart")
               .datum(flameData)
               .call(flameChart);
        });

        const barChartContainer = document.getElementById('barchart');
        const maxTotalTime = chartData.length > 0 ? Math.max(...chartData.map(d => d.total)) : 1;

        chartData.forEach(d => {
            const row = document.createElement('div');
            row.className = 'bar-row';
            const label = document.createElement('div');
            label.className = 'bar-label';
            label.textContent = d.name;
            label.title = d.name;
            // Add style if internal flag (propagated via barChartData) is true
            if (d.internal) {
              label.style.color = 'var(--accent-light)';
            }

            const barBg = document.createElement('div');
            barBg.className = 'bar-rect-bg';
            const bar = document.createElement('div');
            bar.className = 'bar-rect';
            const barWidthPercent = (d.total / maxTotalTime) * 100;
            bar.style.width = barWidthPercent.toFixed(1) + '%';
            const value = document.createElement('span');
            value.className = 'bar-value';
            value.textContent = d.total.toFixed(2) + 'ms';
            bar.appendChild(value);
            const statsText = \`avg: \${d.avg.toFixed(2)}ms | min: \${d.min.toFixed(2)}ms | max: \${d.max.toFixed(2)}ms | count: \${d.count}\`;
            const statsInline = document.createElement('div');
            statsInline.className = 'bar-stats-inline';
            statsInline.textContent = statsText;
            barBg.appendChild(bar);
            barBg.appendChild(statsInline);
            row.appendChild(label);
            row.appendChild(barBg);
            barChartContainer.appendChild(row);
        });

         if (chartData.length === 0) {
            barChartContainer.textContent = 'No profiling data captured for bar chart.';
        }
    </script>
</body>
</html>
`;
}

// --- HTTP Server (remains the same) ---
const html = generateHtml(d3FlameGraphData, barChartData);

const port = 8080;
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    } else if (req.url === '/favicon.ico') {
        res.writeHead(204, { 'Content-Type': 'image/x-icon' }); // No content for favicon
        res.end();
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(port, () => {
    console.log(`\nProfile report available at: http://localhost:${port}`);
    console.log('Press Ctrl+C to stop the server.');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Error: Port ${port} is already in use. Please stop the other process or choose a different port.`);
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});