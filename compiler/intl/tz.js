import { tzData } from './temporal-data.js';

export default String.raw`
const T$fmod = (x, d) => {
  const r = x % d;
  return r < 0 ? r + d : r + 0;
};
const T$isLeapYear = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const T$daysInMonth = (y, m) => {
  if (m === 2) return T$isLeapYear(y) ? 29 : 28;
  if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
  return 31;
};
// d may be outside the month
const T$epochDays = (y, m, d) => {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
};
const T$epochDaysToDate = z => {
  z += 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (m <= 2 ? 1 : 0) + 0, month: m, day: d };
};
const T$asciiLower = s => {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += (c >= 65 && c <= 90) ? String.fromCharCode(c + 32) : s[i];
  }
  return out;
};
const T$B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// posix sign: positive means west of utc
const T$posixOffset = (s, st) => {
  let sign = 1;
  if (s[st.i] === '+') st.i++;
  else if (s[st.i] === '-') {
    sign = -1;
    st.i++;
  }
  let parts = [ 0, 0, 0 ], k = 0, cur = '';
  while (st.i < s.length) {
    const c = s[st.i];
    if (c >= '0' && c <= '9') cur += c;
    else if (c === ':') {
      parts[k++] = Number(cur);
      cur = '';
    } else break;
    st.i++;
  }
  parts[k] = Number(cur);
  return sign * (parts[0] * 3600 + parts[1] * 60 + parts[2]);
};
const T$posixName = (s, st) => {
  if (s[st.i] === '<') {
    st.i = s.indexOf('>', st.i) + 1;
    return;
  }
  while (st.i < s.length && ((s[st.i] >= 'A' && s[st.i] <= 'Z') || (s[st.i] >= 'a' && s[st.i] <= 'z'))) st.i++;
};
const T$posixDate = (s, st) => {
  let r;
  if (s[st.i] === 'M') {
    st.i++;
    const p = [];
    let cur = '';
    while (st.i < s.length && s[st.i] !== ',' && s[st.i] !== '/') {
      if (s[st.i] === '.') {
        p.push(Number(cur));
        cur = '';
      } else cur += s[st.i];
      st.i++;
    }
    p.push(Number(cur));
    r = { type: 0, m: p[0], w: p[1], d: p[2] };
  } else if (s[st.i] === 'J') {
    st.i++;
    let cur = '';
    while (st.i < s.length && s[st.i] >= '0' && s[st.i] <= '9') cur += s[st.i++];
    r = { type: 1, n: Number(cur) };
  } else {
    let cur = '';
    while (st.i < s.length && s[st.i] >= '0' && s[st.i] <= '9') cur += s[st.i++];
    r = { type: 2, n: Number(cur) };
  }
  r.time = 7200;
  if (s[st.i] === '/') {
    st.i++;
    // time may be negative or exceed 24h; the sign here is not inverted
    r.time = T$posixOffset(s, st);
  }
  return r;
};
const T$posixParse = s => {
  if (s === '') return null;
  const st = { i: 0 };
  T$posixName(s, st);
  const std = 0 - T$posixOffset(s, st);
  if (st.i >= s.length) return { std, dst: undefined };
  T$posixName(s, st);
  let dst = std + 3600;
  if (st.i < s.length && s[st.i] !== ',') dst = 0 - T$posixOffset(s, st);
  if (s[st.i] !== ',') return { std, dst: undefined };
  st.i++;
  const start = T$posixDate(s, st);
  st.i++;
  const end = T$posixDate(s, st);
  return { std, dst, start, end };
};
const T$posixDay = (y, r) => {
  if (r.type === 0) {
    const first = T$epochDays(y, r.m, 1);
    const dowFirst = T$fmod(first + 4, 7); // 0 = sunday
    let day = first + T$fmod(r.d - dowFirst, 7) + (r.w - 1) * 7;
    if (r.w === 5) {
      const dim = T$daysInMonth(y, r.m);
      while (day - first >= dim) day -= 7;
    }
    return day;
  }
  if (r.type === 1) {
    // 1..365, feb 29 never counted
    let n = r.n;
    if (T$isLeapYear(y) && n >= 60) n++;
    return T$epochDays(y, 1, 1) + n - 1;
  }
  return T$epochDays(y, 1, 1) + r.n;
};
const T$posixYear = (rule, y) => {
  const s = T$posixDay(y, rule.start) * 86400 + rule.start.time - rule.std;
  const e = T$posixDay(y, rule.end) * 86400 + rule.end.time - rule.dst;
  return [ s, e ];
};
const T$posixOffsetAt = (rule, sec) => {
  if (rule.dst === undefined) return rule.std;
  const y = T$epochDaysToDate(Math.floor((sec + rule.std) / 86400)).year;
  const t = T$posixYear(rule, y);
  if (t[0] < t[1]) return sec >= t[0] && sec < t[1] ? rule.dst : rule.std;
  return sec >= t[1] && sec < t[0] ? rule.std : rule.dst;
};
const T$posixTransition = (rule, sec, dir) => {
  if (rule.dst === undefined) return null;
  const y = T$epochDaysToDate(Math.floor(sec / 86400)).year;
  let best = null;
  for (let k = -1; k <= 1; k++) {
    const t = T$posixYear(rule, y + k);
    for (let j = 0; j < 2; j++) {
      const v = t[j];
      if (dir > 0 ? v > sec && (best === null || v < best) : v < sec && (best === null || v > best)) best = v;
    }
  }
  return best;
};

let T$TZ_INDEX = null, T$TZ_CACHE = null, T$TZ_PARTS = null;
const T$tzIndex = () => {
  if (T$TZ_INDEX !== null) return T$TZ_INDEX;
  const idx = new Map();
  const entries = T$TZ_NAMES.split(';');
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const colon = e.indexOf(':');
    const data = Number(e.slice(0, colon));
    const ids = e.slice(colon + 1).split(',');
    for (let j = 0; j < ids.length; j++) idx.set(T$asciiLower(ids[j]), { id: ids[j], cls: 'c' + i, data });
  }
  const utc = T$TZ_UTC.split(',');
  for (let j = 0; j < utc.length; j++) idx.set(T$asciiLower(utc[j]), { id: utc[j], cls: 'UTC', data: -1 });
  T$TZ_INDEX = idx;
  T$TZ_CACHE = new Map();
  T$TZ_PARTS = T$TZ_DATA.split(';');
  return idx;
};
const T$tzLookup = lower => {
  const r = T$tzIndex().get(lower);
  return r === undefined ? undefined : r.id;
};
const T$tzPrimary = id => {
  const r = T$tzIndex().get(T$asciiLower(id));
  return r === undefined ? id : r.cls;
};
const T$tzZone = tz => {
  const r = T$tzIndex().get(T$asciiLower(tz));
  if (r.data < 0) return null;
  let z = T$TZ_CACHE.get(r.data);
  if (z !== undefined) return z;
  let p = 0;
  const s = T$TZ_PARTS[r.data];
  const read = () => {
    let v = 0, mul = 1;
    for (;;) {
      const d = T$B64.indexOf(s[p++]);
      v += (d & 31) * mul;
      mul *= 32;
      if (d < 32) break;
    }
    return v % 2 === 0 ? v / 2 : -(v + 1) / 2;
  };
  const nOffs = read();
  const offsTable = [];
  for (let i = 0; i < nOffs; i++) offsTable.push(read());
  const n = read();
  const trans = [], offs = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const v = read();
    let d;
    if (v % 2 === 0) d = v / 2 * 60;
    else d = v > 0 ? (v - 1) / 2 : (v + 1) / 2;
    t += d;
    trans.push(t);
    offs.push(offsTable[T$B64.indexOf(s[p++])]);
  }
  z = { trans, offs, initial: offsTable[0], rule: T$posixParse(s.slice(s.indexOf('|') + 1)) };
  T$TZ_CACHE.set(r.data, z);
  return z;
};
const T$tzOffsetSec = (z, sec) => {
  const tr = z.trans, n = tr.length;
  if (n === 0 || sec >= tr[n - 1]) {
    if (z.rule !== null) return T$posixOffsetAt(z.rule, sec);
    return n === 0 ? z.initial : z.offs[n - 1];
  }
  if (sec < tr[0]) return z.initial;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tr[mid] <= sec) lo = mid;
    else hi = mid - 1;
  }
  return z.offs[lo];
};

${tzData}
`;
