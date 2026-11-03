import { encodeUtf8, decodeUtf8 } from './internal/bytes.js';
import { errInvalidUri } from './internal/errors.js';

const hexValue = b => b >= 48 && b <= 57 ? b - 48 : (b | 32) >= 97 && (b | 32) <= 102 ? (b | 32) - 87 : -1;

// percent-decodes the valid escapes as utf-8, leaving the rest as they are
export const percentDecode = s => {
  const bytes = encodeUtf8(s);
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const hi = bytes[i] === 37 && i + 2 < bytes.length ? hexValue(bytes[i + 1]) : -1;
    const lo = hi === -1 ? -1 : hexValue(bytes[i + 2]);
    if (lo === -1) {
      out[n++] = bytes[i];
    } else {
      out[n++] = hi * 16 + lo;
      i += 2;
    }
  }
  return decodeUtf8(out, 0, n);
};

export const unescape = s => {
  try {
    return decodeURIComponent(s);
  } catch {
    return percentDecode(s);
  }
};

// ! ' ( ) * - . _ ~ and alphanumerics stay
export const escape = str => {
  try {
    return encodeURIComponent(`${str}`);
  } catch {
    throw errInvalidUri();
  }
};

const stringifyPrimitive = v => {
  if (typeof v === 'string') return v;
  if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'bigint' || typeof v === 'boolean') return `${v}`;
  return '';
};

export const stringify = (obj, sep, eq, options) => {
  if (obj === null || typeof obj !== 'object') return '';
  const encode = options?.encodeURIComponent ?? escape;
  const pairs = [];
  for (const key of Object.keys(obj)) {
    const prefix = encode(stringifyPrimitive(key)) + (eq || '=');
    for (const value of Array.isArray(obj[key]) ? obj[key] : [ obj[key] ]) pairs.push(prefix + encode(stringifyPrimitive(value)));
  }
  return pairs.join(sep || '&');
};

const decodeComponent = (s, decode, custom) => {
  s = s.replaceAll('+', custom ? '%20' : ' ');
  if (!custom && !s.includes('%')) return s;
  try {
    return decode(s);
  } catch {
    return unescape(s);
  }
};

export const parse = (qs, sep, eq, options) => {
  const obj = { __proto__: null };
  if (typeof qs !== 'string' || qs.length === 0) return obj;
  const decode = options?.decodeURIComponent ?? unescape;
  const custom = decode !== unescape;
  const maxKeys = options?.maxKeys ?? 1000;

  eq = eq ? `${eq}` : '=';
  let pairs = qs.split(sep ? `${sep}` : '&');
  if (maxKeys > 0) pairs = pairs.slice(0, maxKeys);
  for (const pair of pairs) {
    if (pair === '') continue;
    const i = pair.indexOf(eq);
    const key = decodeComponent(i === -1 ? pair : pair.slice(0, i), decode, custom);
    const value = i === -1 ? '' : decodeComponent(pair.slice(i + eq.length), decode, custom);
    if (obj[key] === undefined) obj[key] = value;
      else if (Array.isArray(obj[key])) obj[key].push(value);
      else obj[key] = [ obj[key], value ];
  }
  return obj;
};

export default { unescape, escape, stringify, parse };
