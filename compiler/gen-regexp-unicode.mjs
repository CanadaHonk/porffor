// generates the unicode table section of compiler/builtins/regexp.ts from node's own ICU
// usage: node compiler/gen-regexp-unicode.mjs <output.ts>, then splice into regexp.ts

const MAX = 0x110000;

const varint = (arr, n) => { // 7-bit groups, little end first, high bit = continue
  while (n > 127) { arr.push((n & 127) | 128); n >>>= 7; }
  arr.push(n);
};
const zigzag = n => n < 0 ? (-n * 2 - 1) : n * 2;

const normalize = ranges => { // sort + merge adjacent/overlapping
  ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of ranges) {
    if (out.length && s <= out[out.length - 1][1] + 1) out[out.length - 1][1] = Math.max(e, out[out.length - 1][1]);
    else out.push([s, e]);
  }
  return out;
};

const xorRangesSimple = (a, b) => { // symmetric difference (one-off, bitset is fine)
  const bits = new Uint8Array(MAX);
  for (const [s, e] of a) for (let i = s; i <= e; i++) bits[i] ^= 1;
  for (const [s, e] of b) for (let i = s; i <= e; i++) bits[i] ^= 1;
  const out = [];
  let start = -1;
  for (let i = 0; i < MAX; i++) {
    if (bits[i] && start === -1) start = i;
    if (!bits[i] && start !== -1) { out.push([start, i - 1]); start = -1; }
  }
  if (start !== -1) out.push([start, MAX - 1]);
  return out;
};

// scan a \p property via node's regex engine

const scanProp = expr => {
  const re = new RegExp(`\\p{${expr}}`, 'gu');
  const reSingle = new RegExp(`\\p{${expr}}`, 'u');
  const ranges = [];
  let rs = -1, rePrev = -2;
  const push = cp => {
    if (cp === rePrev + 1) { rePrev = cp; return; }
    if (rs !== -1) ranges.push([rs, rePrev]);
    rs = cp; rePrev = cp;
  };

  const CHUNK = 0x8000;
  for (let base = 0; base < MAX; base += CHUNK) {
    const end = Math.min(base + CHUNK, MAX);
    // surrogate cps tested individually to avoid pair-merging artifacts in the chunk string
    for (let cp = Math.max(base, 0xD800); cp < Math.min(end, 0xE000); cp++) {
      if (reSingle.test(String.fromCodePoint(cp))) push(cp);
    }
    let str = '';
    for (let cp = base; cp < end; cp++) {
      if (cp >= 0xD800 && cp <= 0xDFFF) continue;
      str += String.fromCodePoint(cp);
    }
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(str))) push(str.codePointAt(m.index));
  }
  if (rs !== -1) ranges.push([rs, rePrev]);
  return normalize(ranges);
};

const GC = ['Lu','Ll','Lt','Lm','Lo','Mn','Mc','Me','Nd','Nl','No','Pc','Pd','Ps','Pe','Pi','Pf','Po','Sm','Sc','Sk','So','Zs','Zl','Zp','Cc','Cf','Co','Cs','Cn'];
console.error('scanning general categories...');
const gcOf = new Uint8Array(MAX).fill(GC.indexOf('Cn'));
for (let i = 0; i < GC.length; i++) {
  if (GC[i] === 'Cn') continue;
  for (const [s, e] of scanProp(`General_Category=${GC[i]}`)) gcOf.fill(i, s, e + 1);
}

// blob is run count, then varint length + gc index per run
const gcBytes = [];
{
  const runs = [];
  let runStart = 0;
  for (let i = 1; i <= MAX; i++) {
    if (i === MAX || gcOf[i] !== gcOf[runStart]) { runs.push([i - runStart, gcOf[runStart]]); runStart = i; }
  }
  varint(gcBytes, runs.length);
  for (const [len, gc] of runs) { varint(gcBytes, len); gcBytes.push(gc); }
  console.error(`gc: ${runs.length} runs, ${gcBytes.length} bytes`);
}

const gcMaskRanges = mask => {
  const out = [];
  let start = -1;
  for (let i = 0; i < MAX; i++) {
    const inSet = (mask & (1 << gcOf[i])) !== 0;
    if (inSet && start === -1) start = i;
    if (!inSet && start !== -1) { out.push([start, i - 1]); start = -1; }
  }
  if (start !== -1) out.push([start, MAX - 1]);
  return out;
};

const maskOf = names => names.reduce((m, n) => m | (1 << GC.indexOf(n)), 0);
const M = {
  L: maskOf(['Lu','Ll','Lt','Lm','Lo']),
  LC: maskOf(['Lu','Ll','Lt']),
  M: maskOf(['Mn','Mc','Me']),
  N: maskOf(['Nd','Nl','No']),
  P: maskOf(['Pc','Pd','Ps','Pe','Pi','Pf','Po']),
  S: maskOf(['Sm','Sc','Sk','So']),
  Z: maskOf(['Zs','Zl','Zp']),
  C: maskOf(['Cc','Cf','Co','Cs','Cn']),
};

// [canonical name, base gc mask (xor-encoded against), aliases...]
const BINPROPS = [
  ['ASCII', 0],
  ['ASCII_Hex_Digit', 0, 'AHex'],
  ['Alphabetic', M.L | maskOf(['Nl']), 'Alpha'],
  ['Any', 0],
  ['Assigned', 0x3fffffff ^ (1 << GC.indexOf('Cn'))],
  ['Bidi_Control', 0, 'Bidi_C'],
  ['Bidi_Mirrored', 0, 'Bidi_M'],
  ['Case_Ignorable', maskOf(['Mn','Me','Cf','Lm','Sk']), 'CI'],
  ['Cased', M.LC],
  ['Changes_When_Casefolded', maskOf(['Lu','Lt']), 'CWCF'],
  ['Changes_When_Casemapped', M.LC, 'CWCM'],
  ['Changes_When_Lowercased', maskOf(['Lu']), 'CWL'],
  ['Changes_When_NFKC_Casefolded', maskOf(['Lu','Lt']), 'CWKCF'],
  ['Changes_When_Titlecased', maskOf(['Ll']), 'CWT'],
  ['Changes_When_Uppercased', maskOf(['Ll']), 'CWU'],
  ['Dash', 0],
  ['Default_Ignorable_Code_Point', 0, 'DI'],
  ['Deprecated', 0, 'Dep'],
  ['Diacritic', maskOf(['Lm','Sk']), 'Dia'],
  ['Emoji', 0],
  ['Emoji_Component', 0, 'EComp'],
  ['Emoji_Modifier', 0, 'EMod'],
  ['Emoji_Modifier_Base', 0, 'EBase'],
  ['Emoji_Presentation', 0, 'EPres'],
  ['Extended_Pictographic', 0, 'ExtPict'],
  ['Extender', 0, 'Ext'],
  ['Grapheme_Base', 0x3fffffff ^ maskOf(['Cc','Cf','Co','Cs','Cn','Zl','Zp','Mn','Me']), 'Gr_Base'],
  ['Grapheme_Extend', maskOf(['Mn','Me']), 'Gr_Ext'],
  ['Hex_Digit', 0, 'Hex'],
  ['IDS_Binary_Operator', 0, 'IDSB'],
  ['IDS_Trinary_Operator', 0, 'IDST'],
  ['ID_Continue', M.L | maskOf(['Nl','Mn','Mc','Nd','Pc']), 'IDC'],
  ['ID_Start', M.L | maskOf(['Nl']), 'IDS'],
  ['Ideographic', 0, 'Ideo'],
  ['Join_Control', 0, 'Join_C'],
  ['Logical_Order_Exception', 0, 'LOE'],
  ['Lowercase', maskOf(['Ll']), 'Lower'],
  ['Math', maskOf(['Sm'])],
  ['Noncharacter_Code_Point', 0, 'NChar'],
  ['Pattern_Syntax', 0, 'Pat_Syn'],
  ['Pattern_White_Space', 0, 'Pat_WS'],
  ['Quotation_Mark', 0, 'QMark'],
  ['Radical', 0],
  ['Regional_Indicator', 0, 'RI'],
  ['Sentence_Terminal', 0, 'STerm'],
  ['Soft_Dotted', 0, 'SD'],
  ['Terminal_Punctuation', 0, 'Term'],
  ['Unified_Ideograph', 0, 'UIdeo'],
  ['Uppercase', maskOf(['Lu']), 'Upper'],
  ['Variation_Selector', 0, 'VS'],
  ['White_Space', 0, 'space', 'WSpace'],
  ['XID_Continue', M.L | maskOf(['Nl','Mn','Mc','Nd','Pc']), 'XIDC'],
  ['XID_Start', M.L | maskOf(['Nl']), 'XIDS'],
];

console.error('scanning binary properties...');
const propBytes = [];
const propOffsets = [];
for (const [name, baseMask] of BINPROPS) {
  propOffsets.push(propBytes.length);
  let ranges;
  if (name === 'Any') ranges = [[0, MAX - 1]];
  else if (name === 'ASCII') ranges = [[0, 0x7F]];
  else if (name === 'Assigned') ranges = xorRangesSimple(gcMaskRanges(1 << GC.indexOf('Cn')), [[0, MAX - 1]]);
  else ranges = scanProp(name);

  const xr = baseMask ? xorRangesSimple(ranges, gcMaskRanges(baseMask)) : ranges;
  varint(propBytes, baseMask);
  varint(propBytes, xr.length);
  let last = 0;
  for (const [s, e] of xr) { varint(propBytes, s - last); varint(propBytes, e - s); last = e + 1; }
  console.error(`  ${name}: ${xr.length} xor-ranges`);
}
propOffsets.push(propBytes.length);
console.error(`binary props total: ${propBytes.length} bytes`);

const cpLower = cp => { const s = String.fromCodePoint(cp).toLowerCase(); return [...s].length === 1 ? s.codePointAt(0) : cp; };
const cpUpper = cp => { const s = String.fromCodePoint(cp).toUpperCase(); return [...s].length === 1 ? s.codePointAt(0) : cp; };

console.error('building iu fold classes...');
const foldRep = new Map(); // cp -> canonical rep (min of ui-equivalence class)
{
  const seen = new Set();
  for (let cp = 0; cp < MAX; cp++) {
    if (seen.has(cp)) continue;
    if (cpLower(cp) === cp && cpUpper(cp) === cp) continue;

    const cls = new Set([cp]);
    const queue = [cp];
    while (queue.length) {
      const c = queue.pop();
      for (const n of [cpLower(c), cpUpper(c)]) {
        if (!cls.has(n)) { cls.add(n); queue.push(n); }
      }
    }

    // partition the closure by node's actual ui equivalence (closure can over-join)
    const members = [...cls].sort((a, b) => a - b);
    const groups = [];
    for (const c of members) {
      let placed = false;
      for (const g of groups) {
        if (new RegExp(`^\\u{${g[0].toString(16)}}$`, 'iu').test(String.fromCodePoint(c))) { g.push(c); placed = true; break; }
      }
      if (!placed) groups.push([c]);
    }
    for (const g of groups) {
      for (const c of g) { seen.add(c); if (g.length > 1 && c !== g[0]) foldRep.set(c, g[0]); }
    }
  }
  console.error(`iu fold: ${foldRep.size} mapped cps`);
}

// non-u canonicalize (spec 22.2.2.9): toUpperCase, single-unit results only, no ascii <- non-ascii
const canonNonU = new Map();
for (let ch = 0; ch < 0x10000; ch++) {
  const u = String.fromCharCode(ch).toUpperCase();
  if (u.length !== 1) continue;
  const cu = u.charCodeAt(0);
  if (ch >= 128 && cu < 128) continue;
  if (cu !== ch) canonNonU.set(ch, cu);
}
console.error(`non-u canon: ${canonNonU.size} mapped units`);

// map encoded as varint runs of (gap from last start, count*2 + stride-1, zigzag delta)
const encodeMap = map => {
  const keys = [...map.keys()].sort((a, b) => a - b);
  const runs = [];
  for (const cp of keys) {
    const delta = map.get(cp) - cp;
    const last = runs[runs.length - 1];
    if (last && delta === last.delta) {
      if (last.count === 1) {
        const stride = cp - last.start;
        if (stride === 1 || stride === 2) { last.stride = stride; last.count = 2; continue; }
      } else if (cp === last.start + last.count * last.stride) { last.count++; continue; }
    }
    runs.push({ start: cp, count: 1, stride: 1, delta });
  }
  const bytes = [];
  varint(bytes, runs.length);
  let lastStart = 0;
  for (const r of runs) {
    varint(bytes, r.start - lastStart);
    varint(bytes, r.count * 2 + (r.stride - 1));
    varint(bytes, zigzag(r.delta));
    lastStart = r.start;
  }
  return { bytes, runs: runs.length };
};

const foldEnc = encodeMap(foldRep);
const canonEnc = encodeMap(canonNonU);
console.error(`iu fold: ${foldEnc.runs} runs, ${foldEnc.bytes.length} bytes; non-u canon: ${canonEnc.runs} runs, ${canonEnc.bytes.length} bytes`);

// property name directory: "name=code" entries joined by ';', code b<idx> = binary prop, g<hex> = gc mask

const GC_LONG = {
  Lu: 'Uppercase_Letter', Ll: 'Lowercase_Letter', Lt: 'Titlecase_Letter', Lm: 'Modifier_Letter', Lo: 'Other_Letter',
  Mn: 'Nonspacing_Mark', Mc: 'Spacing_Mark', Me: 'Enclosing_Mark',
  Nd: 'Decimal_Number', Nl: 'Letter_Number', No: 'Other_Number',
  Pc: 'Connector_Punctuation', Pd: 'Dash_Punctuation', Ps: 'Open_Punctuation', Pe: 'Close_Punctuation',
  Pi: 'Initial_Punctuation', Pf: 'Final_Punctuation', Po: 'Other_Punctuation',
  Sm: 'Math_Symbol', Sc: 'Currency_Symbol', Sk: 'Modifier_Symbol', So: 'Other_Symbol',
  Zs: 'Space_Separator', Zl: 'Line_Separator', Zp: 'Paragraph_Separator',
  Cc: 'Control', Cf: 'Format', Co: 'Private_Use', Cs: 'Surrogate', Cn: 'Unassigned',
};
const dirEntries = [];
for (let i = 0; i < GC.length; i++) {
  dirEntries.push([GC[i], 'g' + (1 << i).toString(16)]);
  dirEntries.push([GC_LONG[GC[i]], 'g' + (1 << i).toString(16)]);
}
dirEntries.push(['L', 'g' + M.L.toString(16)], ['Letter', 'g' + M.L.toString(16)],
  ['LC', 'g' + M.LC.toString(16)], ['Cased_Letter', 'g' + M.LC.toString(16)],
  ['M', 'g' + M.M.toString(16)], ['Mark', 'g' + M.M.toString(16)], ['Combining_Mark', 'g' + M.M.toString(16)],
  ['N', 'g' + M.N.toString(16)], ['Number', 'g' + M.N.toString(16)],
  ['P', 'g' + M.P.toString(16)], ['Punctuation', 'g' + M.P.toString(16)], ['punct', 'g' + M.P.toString(16)],
  ['S', 'g' + M.S.toString(16)], ['Symbol', 'g' + M.S.toString(16)],
  ['Z', 'g' + M.Z.toString(16)], ['Separator', 'g' + M.Z.toString(16)],
  ['C', 'g' + M.C.toString(16)], ['Other', 'g' + M.C.toString(16)],
  ['cntrl', 'g' + (1 << GC.indexOf('Cc')).toString(16)],
  ['digit', 'g' + (1 << GC.indexOf('Nd')).toString(16)]);
for (let i = 0; i < BINPROPS.length; i++) {
  const [name, _base, ...aliases] = BINPROPS[i];
  dirEntries.push([name, 'b' + i]);
  for (const a of aliases) dirEntries.push([a, 'b' + i]);
}
const dirStr = dirEntries.map(([n, c]) => `${n}=${c}`).join(';');
console.error(`directory: ${dirEntries.length} names, ${dirStr.length} bytes`);

const escStr = bytes => {
  let out = '';
  for (const b of bytes) {
    if (b === 0x27 || b === 0x5c) out += '\\' + String.fromCharCode(b);
    else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
    else out += '\\x' + b.toString(16).padStart(2, '0');
  }
  return out;
};

const wrap = s => `'${s}'`; // single literal: builtins can't concat-fold, keep it one segment

const propOffsetsBytes = [];
for (const o of propOffsets) varint(propOffsetsBytes, o);

const out = `// autogenerated by gen-unicode.js from node's unicode support (${process.version}) - do not edit
// compact tables consumed by the code above; data as funcs since builtins only export funcs

export const __Porffor_regex_ucdGc = (): bytestring => ${wrap(escStr(gcBytes))};

export const __Porffor_regex_ucdProps = (): bytestring => ${wrap(escStr(propBytes))};

export const __Porffor_regex_ucdPropOffsets = (): bytestring => ${wrap(escStr(propOffsetsBytes))};

export const __Porffor_regex_ucdDir = (): bytestring => ${wrap(dirStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'"))};

export const __Porffor_regex_ucdFold = (): bytestring => ${wrap(escStr(foldEnc.bytes))};

export const __Porffor_regex_ucdCanon = (): bytestring => ${wrap(escStr(canonEnc.bytes))};
`;

const total = gcBytes.length + propBytes.length + propOffsetsBytes.length + dirStr.length + foldEnc.bytes.length + canonEnc.bytes.length;
console.error(`total data: ${total} bytes (${(total / 1024).toFixed(1)}KB)`);

import fs from 'node:fs';
fs.writeFileSync(process.argv[2] ?? 'regexp_data.ts', out);
console.error(`wrote ${process.argv[2] ?? 'regexp_data.ts'}`);
