#!/usr/bin/env node
// interactive delta tui over already-written test262 result jsons - runs no tests.
// usage: node test262/delta.js  (or: node test262/selfhost.js --diff)
// comparisons offered (tab to cycle, when the files exist):
//   selfhost-results.prev.json -> selfhost-results.json  (previous run -> latest)
//   results.json               -> selfhost-results.json  (node-hosted -> selfhosted)
import fs from 'node:fs';
import { join } from 'node:path';

const __dirname = import.meta.dirname;

const CATS = [ 'passes', 'fails', 'runtimeErrors', 'compileErrors', 'nativeErrors', 'timeouts' ];
const NAME = { passes: 'pass', fails: 'fail', runtimeErrors: 'runtime error', compileErrors: 'compile error', nativeErrors: 'native error', timeouts: 'timeout', missing: 'not in run' };
const ICON = { passes: '🤠', fails: '❌', runtimeErrors: '💀', compileErrors: '💥', nativeErrors: '🏗️', timeouts: '⏰', missing: '∅ ' };
const FG = { passes: 92, fails: 93, runtimeErrors: 91, compileErrors: 31, nativeErrors: 35, timeouts: 90, missing: 90 };
const BG = { passes: 42, fails: 43, runtimeErrors: 101, compileErrors: 41, nativeErrors: 45, timeouts: 100 };

const CLASSES = [ 'all', 'regressions', 'improvements', 'lateral', 'set changes' ];
const clsOf = (from, to) => to === 'passes' ? 'improvements'
  : from === 'passes' ? 'regressions'
  : (from === 'missing' || to === 'missing') ? 'set changes'
  : 'lateral';
const CLS_FG = { improvements: 92, regressions: 91, lateral: 93, 'set changes': 90 };

const load = p => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

const toMap = res => {
  const m = new Map();
  for (const c of CATS) for (const x of res[c] ?? []) m.set(x, c);
  return m;
};

const summarize = res => {
  const counts = {};
  let total = 0;
  for (const c of CATS) {
    counts[c] = res[c]?.length ?? 0;
    total += counts[c];
  }
  return { counts, total, percent: total === 0 ? 0 : (counts.passes / total) * 100 };
};

const diffPair = (a, b) => {
  const am = toMap(a), bm = toMap(b);
  const changes = [];
  const transitions = new Map();
  const dirDelta = new Map();
  let unchanged = 0;

  const bump = (file, from, to) => {
    if (from === to) {
      unchanged++;
      return;
    }
    changes.push({ file, from, to, cls: clsOf(from, to) });
    const k = `${from}>${to}`;
    transitions.set(k, (transitions.get(k) ?? 0) + 1);
    const dir = file.slice(0, file.indexOf('/'));
    const d = dirDelta.get(dir) ?? 0;
    dirDelta.set(dir, d + (to === 'passes' ? 1 : 0) - (from === 'passes' ? 1 : 0));
  };

  for (const [ file, from ] of am) bump(file, from, bm.get(file) ?? 'missing');
  for (const [ file, to ] of bm) if (!am.has(file)) bump(file, 'missing', to);

  return { changes, transitions, dirDelta, unchanged, aSum: summarize(a), bSum: summarize(b) };
};

const buildComparisons = () => {
  const latest = load(join(__dirname, 'selfhost-results.json'));
  const prev = load(join(__dirname, 'selfhost-results.prev.json'));
  const node = load(join(__dirname, 'results.json'));

  const out = [];
  if (prev && latest) out.push({ title: 'selfhost: previous run → latest', aLabel: 'previous', bLabel: 'latest', ...diffPair(prev, latest) });
  if (node && latest) out.push({ title: 'node-hosted → selfhosted (latest)', aLabel: 'node-hosted', bLabel: 'selfhosted', ...diffPair(node, latest) });
  return out;
};

// ---- rendering ----
const tty = process.stdout.isTTY && process.stdin.isTTY;
const esc = (code, s) => `[${code}m${s}[0m`;
const dim = s => esc(90, s);
const bold = s => esc(1, s);

// paths and labels are ascii; only our icons are double-width
const iconW = 2;
const catCell = c => `${ICON[c]} ${esc(FG[c], NAME[c])}`;
const catPad = 15; // width of NAME column after icon

const fmtDelta = (d, invert = false) => {
  if (d === 0) return dim('±0');
  const good = invert ? d < 0 : d > 0;
  return esc(good ? 92 : 91, `${d > 0 ? '+' : ''}${d}`);
};

const stackedBar = (sum, width) => {
  const order = [ 'passes', 'fails', 'runtimeErrors', 'timeouts', 'compileErrors', 'nativeErrors' ];
  let out = '';
  let used = 0;
  for (let i = 0; i < order.length; i++) {
    const c = order[i];
    let w = i === order.length - 1 ? width - used : Math.round((sum.counts[c] / sum.total) * width);
    if (w < 0) w = 0;
    used += w;
    const label = ` ${sum.counts[c]}`;
    out += `[${BG[c]};97m${w > label.length + 1 ? label + ' '.repeat(w - label.length) : ' '.repeat(w)}[0m`;
  }
  return out;
};

const overviewLines = (comp, width) => {
  const { aSum, bSum, changes, transitions, dirDelta, unchanged } = comp;
  const lines = [];

  lines.push(`${bold(comp.title)}`);
  lines.push('');

  const pctDelta = bSum.percent - aSum.percent;
  lines.push(`  ${comp.aLabel.padEnd(12)} ${bold(aSum.percent.toFixed(2) + '%')} ${dim(`(${aSum.counts.passes}/${aSum.total})`)}`);
  lines.push(`  ${stackedBar(aSum, Math.min(width - 4, 110))}`);
  lines.push(`  ${comp.bLabel.padEnd(12)} ${bold(bSum.percent.toFixed(2) + '%')} ${dim(`(${bSum.counts.passes}/${bSum.total})`)}  ${esc(pctDelta >= 0 ? 92 : 91, `${pctDelta >= 0 ? '+' : ''}${pctDelta.toFixed(2)}`)}`);
  lines.push(`  ${stackedBar(bSum, Math.min(width - 4, 110))}`);
  lines.push('');

  for (const c of CATS) {
    const d = bSum.counts[c] - aSum.counts[c];
    lines.push(`  ${catCell(c)}${' '.repeat(Math.max(1, catPad - NAME[c].length))}${String(aSum.counts[c]).padStart(6)} → ${String(bSum.counts[c]).padEnd(6)} ${fmtDelta(d, c !== 'passes')}`);
  }
  lines.push('');

  const im = changes.filter(x => x.cls === 'improvements').length;
  const re = changes.filter(x => x.cls === 'regressions').length;
  const la = changes.filter(x => x.cls === 'lateral').length;
  const se = changes.filter(x => x.cls === 'set changes').length;
  lines.push(`  ${bold(String(changes.length))} changed ${dim(`(${unchanged} unchanged)`)}: ${esc(92, im + ' improvements')}, ${esc(91, re + ' regressions')}, ${esc(93, la + ' lateral')}${se ? `, ${dim(se + ' set changes')}` : ''}`);
  lines.push('');

  const trans = [ ...transitions.entries() ].sort((x, y) => y[1] - x[1]).slice(0, 12);
  if (trans.length > 0) {
    lines.push(bold('  top transitions'));
    for (const [ k, n ] of trans) {
      const [ from, to ] = k.split('>');
      lines.push(`    ${catCell(from)}${' '.repeat(Math.max(1, catPad - NAME[from].length))}→ ${catCell(to)}${' '.repeat(Math.max(1, catPad - NAME[to].length))}${esc(CLS_FG[clsOf(from, to)], String(n).padStart(6))}`);
    }
    lines.push('');
  }

  const dirs = [ ...dirDelta.entries() ].filter(x => x[1] !== 0).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 8);
  if (dirs.length > 0) {
    lines.push(bold('  net passes by directory'));
    const max = Math.max(...dirs.map(x => Math.abs(x[1])));
    for (const [ dir, d ] of dirs) {
      const w = Math.max(1, Math.round((Math.abs(d) / max) * 30));
      lines.push(`    ${dir.padEnd(16)} ${esc(d > 0 ? 92 : 91, (d > 0 ? '+' : '') + String(d).padStart(5))} ${esc(d > 0 ? 42 : 41, ' '.repeat(w))}`);
    }
  }

  return lines;
};

// ---- change tree ----
const CLS_ORDER = { regressions: 0, lateral: 1, 'set changes': 2, improvements: 3 };

const buildTree = (list, sortByPath) => {
  const root = { name: '', path: '', dirs: new Map(), files: [] };
  for (const ch of list) {
    const parts = ch.file.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = node.dirs.get(parts[i]);
      if (!next) {
        next = { name: parts[i], dirs: new Map(), files: [] };
        node.dirs.set(parts[i], next);
      }
      node = next;
    }
    node.files.push(ch);
  }

  const finalize = (node, prefix) => {
    // collapse chains of single-child dirs into one node (a/b/c)
    while (node !== root && node.dirs.size === 1 && node.files.length === 0) {
      const [ only ] = node.dirs.values();
      node.name = `${node.name}/${only.name}`;
      node.dirs = only.dirs;
      node.files = only.files;
    }
    node.path = prefix ? `${prefix}/${node.name}` : node.name;
    node.stats = { improvements: 0, regressions: 0, lateral: 0, 'set changes': 0, total: 0 };
    for (const ch of node.files) {
      node.stats[ch.cls]++;
      node.stats.total++;
    }
    node.files.sort((a, b) => sortByPath
      ? a.file.localeCompare(b.file)
      : (CLS_ORDER[a.cls] - CLS_ORDER[b.cls]) || a.file.localeCompare(b.file));
    node.children = [ ...node.dirs.values() ].sort((a, b) => a.name.localeCompare(b.name));
    for (const c of node.children) {
      finalize(c, node.path);
      for (const k of Object.keys(node.stats)) node.stats[k] += c.stats[k];
    }
    return node;
  };

  return finalize(root, '');
};

const treeRows = (root, expanded) => {
  const out = [];
  const walk = (node, depth) => {
    for (const c of node.children) {
      const open = expanded.has(c.path);
      out.push({ type: 'dir', node: c, depth, open });
      if (open) walk(c, depth + 1);
    }
    for (const ch of node.files) out.push({ type: 'file', ch, depth });
  };
  walk(root, 0);
  return out;
};

const allDirPaths = (root, out = []) => {
  for (const c of root.children) {
    out.push(c.path);
    allDirPaths(c, out);
  }
  return out;
};

const statsCells = (st, E) => [
  st.regressions ? E(91, `${st.regressions}↓`) : '',
  st.improvements ? E(92, `${st.improvements}↑`) : '',
  st.lateral ? E(93, `${st.lateral}~`) : '',
  st['set changes'] ? E(90, `${st['set changes']}∅`) : ''
].filter(Boolean).join(' ');

const treeRow = (row, width, selected) => {
  // a selected row renders colorless then fully inverted (embedded resets would
  // otherwise break the highlight mid-row)
  const E = selected ? (code, s) => s : esc;
  const indent = '  '.repeat(row.depth);
  let out;
  if (row.type === 'dir') {
    const { node, open } = row;
    let name = node.name;
    if (indent.length + name.length > width - 24) name = '…' + name.slice(-(width - 25 - indent.length));
    out = `${indent}${E(96, open ? '▾' : '▸')} ${E(1, name)}${E(90, '/')}  ${E(90, String(node.stats.total))}  ${statsCells(node.stats, E)}`;
  } else {
    const { ch } = row;
    let name = ch.file.slice(ch.file.lastIndexOf('/') + 1);
    const tail = `${NAME[ch.from]} → ${NAME[ch.to]}`;
    if (indent.length + name.length > width - tail.length - 16) name = '…' + name.slice(-(width - tail.length - 17 - indent.length));
    out = `${indent}  ${ICON[ch.from]} ${E(CLS_FG[ch.cls], '→')} ${ICON[ch.to]} ${name}  ${E(90, tail)}`;
  }
  return selected ? `\x1b[7m${out}\x1b[0m` : out;
};

// ---- static (non-tty) mode ----
const staticMode = comps => {
  for (const comp of comps) {
    for (const l of overviewLines(comp, process.stdout.columns || 120)) console.log(l);
    console.log();
    const root = buildTree(comp.changes, false);
    for (const row of treeRows(root, new Set(allDirPaths(root)))) console.log(treeRow(row, 200, false));
    console.log();
  }
};

// ---- interactive tui ----
const tui = comps => new Promise(resolve => {
  let compIdx = 0;
  let view = 'overview'; // overview | list | detail
  let cursor = 0, scroll = 0;
  let filter = '', filterInput = null; // null = not editing
  let clsIdx = 0;
  let sortByPath = false;
  let detail = null;
  let expanded = null; // Set of open dir paths; null = use default for current tree

  const filtered = () => {
    const comp = comps[compIdx];
    let list = comp.changes;
    if (CLASSES[clsIdx] !== 'all') list = list.filter(x => x.cls === CLASSES[clsIdx]);
    if (filter) list = list.filter(x => x.file.includes(filter));
    return list;
  };

  const tree = () => {
    const root = buildTree(filtered(), sortByPath);
    if (expanded === null) {
      // default: everything open for small sets, else just the top level
      expanded = comps[compIdx].changes.length <= 40
        ? new Set(allDirPaths(root))
        : new Set(root.children.map(c => c.path));
    }
    return root;
  };

  const draw = () => {
    const rows = process.stdout.rows || 40;
    const cols = process.stdout.columns || 120;
    const lines = [];

    if (view === 'overview') {
      lines.push(...overviewLines(comps[compIdx], cols));
      lines.push('');
      lines.push(dim(`  [enter] browse changes   [tab] comparison (${compIdx + 1}/${comps.length})   [q] quit`));
    } else if (view === 'list') {
      const list = treeRows(tree(), expanded);
      if (cursor >= list.length) cursor = Math.max(0, list.length - 1);
      const viewport = rows - 4;
      if (cursor < scroll) scroll = cursor;
      if (cursor >= scroll + viewport) scroll = cursor - viewport + 1;

      const nChanges = filtered().length;
      lines.push(`${bold(comps[compIdx].title)}   ${dim(`${nChanges} changes`)}   ${esc(96, CLASSES[clsIdx])}${filter ? `   filter: ${esc(96, filter)}` : ''}${sortByPath ? dim('   sorted by path') : ''}`);
      lines.push('');
      for (let i = scroll; i < Math.min(list.length, scroll + viewport); i++) {
        lines.push(treeRow(list[i], cols, i === cursor));
      }
      while (lines.length < rows - 1) lines.push('');
      lines.push(filterInput !== null
        ? `  /${filterInput}▏ ${dim('[enter] apply  [esc] cancel')}`
        : dim(`  [↑↓ jk] move   [→ ←] open/close   [enter] toggle/view   [e E] expand/collapse all   [c] class   [/] filter   [s] sort   [tab] comparison   [esc] overview   [q] quit`));
    } else { // detail
      const ch = detail;
      lines.push(`${bold(ch.file)}`);
      lines.push(`${ICON[ch.from]} ${esc(FG[ch.from], NAME[ch.from])} ${esc(CLS_FG[ch.cls], '→')} ${ICON[ch.to]} ${esc(FG[ch.to], NAME[ch.to])}   ${esc(CLS_FG[ch.cls], ch.cls)}`);
      lines.push(dim('─'.repeat(Math.min(cols, 110))));
      let src;
      try {
        src = fs.readFileSync(join(__dirname, 'test262', 'test', ch.file), 'utf8');
      } catch {
        src = '(test source not found)';
      }
      const body = src.split('\n').slice(0, rows - 6);
      for (const l of body) lines.push('  ' + (l.length > cols - 4 ? l.slice(0, cols - 5) + '…' : l));
      while (lines.length < rows - 1) lines.push('');
      lines.push(dim('  [esc/enter] back   [q] quit'));
    }

    process.stdout.write('[H' + lines.slice(0, rows).map(l => l + '[K').join('\n') + '[0J');
  };

  const cleanup = () => {
    process.stdout.write('[?25h[?1049l');
    process.stdin.setRawMode(false);
    process.stdin.pause();
    resolve();
  };

  process.stdout.write('[?1049h[?25l');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.on('resize', draw);

  process.stdin.on('data', buf => {
    const s = buf.toString();

    if (filterInput !== null) {
      if (s === '') filterInput = null;
      else if (s === '\r' || s === '\n') {
        filter = filterInput;
        filterInput = null;
        cursor = scroll = 0;
        if (filter) expanded = new Set(allDirPaths(buildTree(filtered(), sortByPath)));
      } else if (s === '' || s === '\b') filterInput = filterInput.slice(0, -1);
      else if (s === '') return cleanup();
      else if (s >= ' ' && s.length === 1) filterInput += s;
      return draw();
    }

    if (s === 'q' || s === '') return cleanup();
    if (s === '\t') {
      compIdx = (compIdx + 1) % comps.length;
      cursor = scroll = 0;
      expanded = null;
      return draw();
    }

    if (view === 'overview') {
      if (s === '\r' || s === '\n' || s === '2') view = 'list';
    } else if (view === 'list') {
      const root = tree();
      const list = treeRows(root, expanded);
      const row = list[cursor];
      const viewport = (process.stdout.rows || 40) - 4;
      const parentIndex = () => {
        for (let i = cursor - 1; i >= 0; i--) {
          if (list[i].type === 'dir' && list[i].depth < row.depth) return i;
        }
        return cursor;
      };
      if (s === '[A' || s === 'k') cursor = Math.max(0, cursor - 1);
      else if (s === '[B' || s === 'j') cursor = Math.min(list.length - 1, cursor + 1);
      else if (s === '[5~') cursor = Math.max(0, cursor - viewport);
      else if (s === '[6~') cursor = Math.min(list.length - 1, cursor + viewport);
      else if (s === 'g') cursor = 0;
      else if (s === 'G') cursor = Math.max(0, list.length - 1);
      else if (s === '[C' || s === 'l') {
        if (row?.type === 'dir') expanded.add(row.node.path);
      } else if (s === '[D' || s === 'h') {
        if (row?.type === 'dir' && row.open) expanded.delete(row.node.path);
          else if (row) cursor = parentIndex();
      } else if (s === 'e') expanded = new Set(allDirPaths(root));
      else if (s === 'E') {
        expanded = new Set();
        cursor = scroll = 0;
      } else if (s === 'c') {
        clsIdx = (clsIdx + 1) % CLASSES.length;
        cursor = scroll = 0;
      } else if (s === 's') sortByPath = !sortByPath;
      else if (s === '/') filterInput = filter;
      else if (s === '\r' || s === '\n') {
        if (row?.type === 'dir') {
          if (row.open) expanded.delete(row.node.path);
            else expanded.add(row.node.path);
        } else if (row) {
          detail = row.ch;
          view = 'detail';
        }
      } else if (s === '' || s === '1') view = 'overview';
    } else if (view === 'detail') {
      if (s === '' || s === '\r' || s === '\n') view = 'list';
    }

    draw();
  });

  draw();
});

const main = async () => {
  const comps = buildComparisons();
  if (comps.length === 0) {
    console.error('no results to compare: need test262/selfhost-results.json plus selfhost-results.prev.json and/or results.json');
    process.exit(1);
  }

  if (!tty) return staticMode(comps);
  await tui(comps);
};

export default main;

if (process.argv[1] && process.argv[1].endsWith('delta.js')) await main();
