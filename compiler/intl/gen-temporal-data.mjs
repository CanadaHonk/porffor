// usage: node compiler/intl/gen-temporal-data.mjs [path to icu4x checkout]
// sources: system tz database, icu4x (chinese/dangi), node's icu (zone links, umalqura)
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DAY = 86400000;
const temporalPath = new URL('./temporal.js', import.meta.url).pathname;
const dataPath = new URL('./temporal-data.js', import.meta.url).pathname;

// truncate must agree with the posix rules the polyfill applies at runtime
const ctx = vm.createContext({});
vm.runInContext((await import(temporalPath)).default +
  ';globalThis.R = { parse: T$posixParse, off: T$posixOffsetAt, next: T$posixTransition };', ctx);
const R = ctx.R;

// qing rules 1900-1911, then china/korea
const icu4xFile = name => {
  const rel = 'components/calendar/src/cal/east_asian_traditional/' + name;
  if (process.argv[2]) return fs.readFileSync(process.argv[2] + '/' + rel, 'utf8');
  return execFileSync('curl', [ '-sSf', 'https://raw.' + 'githubusercontent.com/unicode-org/icu4x/main/' + rel ], { encoding: 'utf8' });
};
const parseYears = src => [ ...src.matchAll(/new\((\d+), \[([ls, ]+)\], (None|Some\((\d+)\)), gregorian\((\d+), (\d+), (\d+)\)\)/g) ].map(m => ({
  lens: m[2].split(',').map(x => x.trim() === 'l'), leap: m[4] ? +m[4] : 0,
  start: Math.floor(Date.UTC(+m[5], +m[6] - 1, +m[7]) / DAY)
}));
const encodeYears = rows => {
  let out = '';
  for (const r of rows) {
    let bits = 0;
    for (let m = 0; m < (r.leap ? 13 : 12); m++) if (r.lens[m]) bits |= 1 << m;
    const v = r.leap << 13 | bits;
    out += B64[v >> 12 & 63] + B64[v >> 6 & 63] + B64[v & 63];
  }
  return { start: rows[0].start, data: out };
};
const qing = parseYears(icu4xFile('qing_data.rs'));
const chinese = encodeYears([ ...qing, ...parseYears(icu4xFile('china_data.rs')) ]);
const dangi = encodeYears([ ...qing, ...parseYears(icu4xFile('korea_data.rs')) ]);

const umalqura = (() => {
  const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
  const starts = new Map();
  for (let t = Date.UTC(1882, 0, 1); ; t += DAY) {
    const p = f.formatToParts(new Date(t));
    const get = k => p.find(x => x.type === k).value;
    const y = parseInt(get('year')), m = +get('month');
    if (y > 1601) break;
    if (+get('day') === 1) starts.set(y * 100 + m, t / DAY);
  }
  let data = '';
  for (let y = 1300; y <= 1600; y++) {
    let bits = 0;
    for (let m = 1; m <= 12; m++) {
      const len = starts.get(m < 12 ? y * 100 + m + 1 : (y + 1) * 100 + 1) - starts.get(y * 100 + m);
      if (len === 30) bits |= 1 << (m - 1);
    }
    data += B64[bits >> 6 & 63] + B64[bits & 63];
  }
  return { start: starts.get(130001), data };
})();

const ZI = '/usr/share/zoneinfo/';
const parseTZif = path => {
  const b = fs.readFileSync(path);
  const hdr = off => ({ isutcnt: b.readUInt32BE(off + 20), isstdcnt: b.readUInt32BE(off + 24), leapcnt: b.readUInt32BE(off + 28), timecnt: b.readUInt32BE(off + 32), typecnt: b.readUInt32BE(off + 36), charcnt: b.readUInt32BE(off + 40) });
  let h = hdr(0);
  let off = 44 + h.timecnt * 5 + h.typecnt * 6 + h.charcnt + h.leapcnt * 8 + h.isstdcnt + h.isutcnt;
  // v2+ data block with 64-bit times
  h = hdr(off);
  off += 44;
  const times = [];
  for (let i = 0; i < h.timecnt; i++) times.push(Number(b.readBigInt64BE(off + i * 8)));
  off += h.timecnt * 8;
  const idx = [ ...b.subarray(off, off + h.timecnt) ];
  off += h.timecnt;
  const types = [];
  for (let i = 0; i < h.typecnt; i++) types.push(b.readInt32BE(off + i * 6));
  off += h.typecnt * 6 + h.charcnt + h.leapcnt * 12 + h.isstdcnt + h.isutcnt;
  return { transitions: times.map((t, i) => [ t, types[idx[i]] ]), initial: types[0], footer: b.toString('latin1', off).split('\n')[1] ?? '' };
};
// keep only the transitions the footer rule cannot reproduce
const truncate = (tr, footer) => {
  const rule = R.parse(footer);
  if (rule === null) return tr;
  let keep = tr.length;
  for (let k = tr.length; k >= 1; k--) {
    const last = tr[k - 1][0];
    let ok = R.off(rule, last) === tr[k - 1][1], t = last, j = k;
    while (ok) {
      const nt = R.next(rule, t, 1);
      if (nt === null || (j >= tr.length && nt > tr[tr.length - 1][0])) break;
      if (j >= tr.length || nt !== tr[j][0] || R.off(rule, nt) !== tr[j][1]) ok = false;
      t = nt;
      j++;
    }
    if (!ok || j < tr.length) break;
    keep = k;
  }
  return tr.slice(0, keep);
};
const varint = n => {
  let z = n < 0 ? -n * 2 - 1 : n * 2, out = '';
  do {
    let d = z % 32;
    z = Math.floor(z / 32);
    if (z > 0) d += 32;
    out += B64[d];
  } while (z > 0);
  return out;
};
const zones = [], links = new Map();
for (const l of fs.readFileSync(ZI + 'tzdata.zi', 'utf8').split('\n')) {
  const p = l.split(' ');
  if (p[0] === 'Z') zones.push(p[1]);
  else if (p[0] === 'L') links.set(p[2], p[1]);
}
const ids = [ ...zones, ...links.keys() ].filter(x => fs.existsSync(ZI + (links.get(x) ?? x))).sort();
const UTC_ALIASES = new Set([ 'Etc/UTC', 'Etc/GMT', 'GMT', 'UTC' ]);
const canon = z => {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: z }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};
const classes = new Map();
for (const id of ids) {
  const target = links.get(id) ?? id;
  const c = canon(id);
  const key = UTC_ALIASES.has(target) || UTC_ALIASES.has(id) || c === 'UTC' || c === 'Etc/UTC' || c === 'Etc/GMT' ? 'UTC' : (c ?? target);
  if (!classes.has(key)) classes.set(key, { ids: [], file: target });
  classes.get(key).ids.push(id);
}
const keys = [ ...classes.keys() ].filter(k => k !== 'UTC').sort();
const datas = [], names = [];
for (const k of keys) {
  const c = classes.get(k);
  const r = parseTZif(ZI + c.file);
  const tr = [];
  let cur = r.initial;
  for (const [ t, o ] of r.transitions) {
    if (o !== cur) {
      tr.push([ t, o ]);
      cur = o;
    }
  }
  const kept = truncate(tr, r.footer);
  const offs = [ ...new Set([ r.initial, ...kept.map(x => x[1]) ]) ];
  let s = varint(offs.length) + offs.map(varint).join('') + varint(kept.length);
  let prev = 0;
  for (const [ t, o ] of kept) {
    const d = t - prev;
    s += varint(d % 60 === 0 ? d / 60 * 2 : d * 2 + (d < 0 ? -1 : 1)) + B64[offs.indexOf(o)];
    prev = t;
  }
  s += '|' + r.footer;
  let i = datas.indexOf(s);
  if (i < 0) {
    i = datas.length;
    datas.push(s);
  }
  names.push(i + ':' + c.ids.join(','));
}

const out = `// generated by compiler/intl/gen-temporal-data.mjs
export const calendarData = \`const T$CHINESE_START = ${chinese.start}, T$CHINESE_DATA = '${chinese.data}';
const T$DANGI_START = ${dangi.start}, T$DANGI_DATA = '${dangi.data}';
const T$UQ_START = ${umalqura.start}, T$UQ_DATA = '${umalqura.data}';\`;

// tz database ${fs.readFileSync(ZI + 'tzdata.zi', 'utf8').match(/version (\S+)/)[1]}
export const tzData = \`const T$TZ_UTC = '${classes.get('UTC').ids.join(',')}';
const T$TZ_NAMES = '${names.join(';')}';
const T$TZ_DATA = '${datas.join(';')}';\`;
`;
fs.writeFileSync(dataPath, out);
console.log(`wrote ${out.length} chars of data to ${dataPath}`);
