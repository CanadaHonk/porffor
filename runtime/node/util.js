import process from './process.js';
import * as types from './util/types.js';
import { deepEqual } from './internal/deep-equal.js';
import { TextEncoder, TextDecoder } from './internal/encoding.js';
import { inspect, format, formatWithOptions, stripVTControlCharacters } from './internal/inspect.js';
import { errnoName } from './internal/bytes.js';
import { errInvalidArgType, errInvalidArgValue, errOutOfRange, errParseArgsInvalidOptionValue, errParseArgsUnexpectedPositional, errParseArgsUnknownOption } from './internal/errors.js';
import { validateFunction, validateOneOf } from './internal/validators.js';

export { types, TextEncoder, TextDecoder, inspect, format, formatWithOptions, stripVTControlCharacters };

export const inherits = (ctor, superCtor) => {
  if (typeof ctor !== 'function') throw errInvalidArgType('ctor', 'Function', ctor);
  if (typeof superCtor !== 'function') throw errInvalidArgType('superCtor', 'Function', superCtor);
  Object.defineProperty(ctor, 'super_', { value: superCtor, writable: true, configurable: true });
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
};

const kCustomPromisified = Symbol.for('nodejs.util.promisify.custom');
const kCustomPromisifyArgs = Symbol.for('nodejs.util.promisify.customArgs');

export function promisify(original) {
  validateFunction(original, 'original');
  if (typeof original[kCustomPromisified] === 'function') return original[kCustomPromisified];

  // callbacks with several results resolve to an object of them, e.g. fs.read's { bytesRead, buffer }
  const names = original[kCustomPromisifyArgs];
  function fn(...args) {
    return new Promise((resolve, reject) => {
      original.call(this, ...args, (err, ...values) => {
        if (err) return reject(err);
        if (names === undefined || values.length < 2) return resolve(values[0]);
        const obj = {};
        for (let i = 0; i < names.length; i++) obj[names[i]] = values[i];
        resolve(obj);
      });
    });
  }
  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));
  Object.defineProperty(fn, kCustomPromisified, { value: fn, configurable: true });
  return Object.defineProperties(fn, Object.getOwnPropertyDescriptors(original));
}
promisify.custom = kCustomPromisified;

const codesWarned = new Set();
export function deprecate(fn, msg, code) {
  let warned = false;
  function deprecated(...args) {
    if (!warned && !process.noDeprecation) {
      warned = true;
      if (code === undefined || !codesWarned.has(code)) {
        codesWarned.add(code);
        process.emitWarning(msg, 'DeprecationWarning', code);
      }
    }
    if (new.target) return Reflect.construct(fn, args, new.target);
    return fn.apply(this, args);
  }
  Object.setPrototypeOf(deprecated, fn);
  if (fn.prototype) deprecated.prototype = fn.prototype;
  return deprecated;
}

let debugEnabled;
const testDebugEnabled = section => {
  if (debugEnabled === undefined) {
    // NODE_DEBUG is a comma separated list of sections, * as a wildcard
    const pattern = (process.env.NODE_DEBUG ?? '').replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replaceAll('*', '.*').replaceAll(',', '$|^');
    debugEnabled = pattern === '' ? null : new RegExp(`^${pattern}$`, 'i');
  }
  return debugEnabled?.test(section) ?? false;
};

// the section is looked up on first use, so NODE_DEBUG can still change before that
export const debuglog = (set, cb) => {
  const section = set.toUpperCase();
  let enabled, first = true;
  const logger = (...args) => {
    enabled ??= testDebugEnabled(section);
    if (first && typeof cb === 'function') {
      first = false;
      cb(logger);
    }
    if (enabled) process.stderr.write(`${section} ${process.pid}: ${format(...args)}\n`);
  };
  Object.defineProperty(logger, 'enabled', { get: () => enabled ??= testDebugEnabled(section), configurable: true, enumerable: true });
  return logger;
};

export const isDeepStrictEqual = (a, b) => deepEqual(a, b, true);

export const getSystemErrorName = err => {
  if (typeof err !== 'number') throw errInvalidArgType('err', 'number', err);
  if (err >= 0 || !Number.isSafeInteger(err)) throw errOutOfRange('err', 'a negative integer', err);
  return errnoName(-err)[0];
};

const shouldColorize = stream => {
  const force = process.env.FORCE_COLOR;
  if (force !== undefined) return force !== '0' && force !== 'false';
  if (!stream?.isTTY) return false;
  if (typeof stream.getColorDepth === 'function') return stream.getColorDepth() > 2;
  return process.env.NO_COLOR === undefined && process.env.NODE_DISABLE_COLORS === undefined && process.env.TERM !== 'dumb';
};

// nested styles reopen the outer one where they close, mid-text
const reopen = (text, close, open) => {
  const keepClose = close === '\x1b[22m';
  let out = '', last = 0;
  for (let i = text.indexOf(close); i !== -1; i = text.indexOf(close, i + close.length)) {
    if (i + close.length >= text.length) break;
    out += text.slice(last, i) + (keepClose ? close + open : open);
    last = i + close.length;
  }
  return out + text.slice(last);
};

export const styleText = (format, text, { validateStream = true, stream = process.stdout } = {}) => {
  const formats = Array.isArray(format) ? format : [ format ];
  for (const key of formats) {
    if (key !== 'none' && inspect.colors[key] == null) validateOneOf(key, 'format', Object.keys(inspect.colors));
  }
  if (validateStream && !shouldColorize(stream)) return text;
  for (let i = formats.length - 1; i >= 0; i--) {
    if (formats[i] === 'none') continue;
    const [ openCode, closeCode ] = inspect.colors[formats[i]];
    const open = `\x1b[${openCode}m`, close = `\x1b[${closeCode}m`;
    text = open + reopen(text, close, open) + close;
  }
  return text;
};

const getOwn = (obj, prop) => Object.hasOwn(obj, prop) ? obj[prop] : undefined;

// args -> [ { kind: option | positional | option-terminator, ... } ]
const argsToTokens = (args, options) => {
  const longOf = short => Object.keys(options).find(name => getOwn(options[name], 'short') === short) ?? short;
  const typeOf = name => Object.hasOwn(options, name) ? getOwn(options[name], 'type') : undefined;
  const tokens = [];
  let index = -1, groupCount = 0;
  const remaining = args.slice();
  while (remaining.length > 0) {
    const arg = remaining.shift();
    if (groupCount > 0) groupCount--;
      else index++;

    if (arg === '--') {
      tokens.push({ kind: 'option-terminator', index });
      for (const value of remaining) tokens.push({ kind: 'positional', index: ++index, value });
      break;
    }

    const short = arg.length >= 2 && arg[0] === '-' && arg[1] !== '-';
    if ((short && arg.length === 2) || (arg.startsWith('--') && arg.length > 2 && !arg.includes('=', 3))) {
      const name = short ? longOf(arg[1]) : arg.slice(2);
      let value, inlineValue;
      if (typeOf(name) === 'string' && remaining.length > 0) {
        value = remaining.shift();
        inlineValue = false;
      }
      tokens.push({ kind: 'option', name, rawName: arg, index, value, inlineValue });
      if (value != null) index++;
    } else if (short && typeOf(longOf(arg[1])) === 'string') {
      tokens.push({ kind: 'option', name: longOf(arg[1]), rawName: `-${arg[1]}`, index, value: arg.slice(2), inlineValue: true });
    } else if (short) {
      // -abc is -a -b -c, a string option takes the rest: -abfFILE is -a -b -fFILE
      const expanded = [];
      for (let i = 1; i < arg.length; i++) {
        if (typeOf(longOf(arg[i])) !== 'string' || i === arg.length - 1) {
          expanded.push(`-${arg[i]}`);
        } else {
          expanded.push(`-${arg.slice(i)}`);
          break;
        }
      }
      remaining.unshift(...expanded);
      groupCount = expanded.length;
    } else if (arg.startsWith('--') && arg.length > 2) {
      const equals = arg.indexOf('=');
      tokens.push({ kind: 'option', name: arg.slice(2, equals), rawName: arg.slice(0, equals), index, value: arg.slice(equals + 1), inlineValue: true });
    } else {
      tokens.push({ kind: 'positional', index, value: arg });
    }
  }
  return tokens;
};

const checkToken = (token, options, allowPositionals, allowNegative) => {
  let name = token.name;
  if (allowNegative && name.startsWith('no-') && !Object.hasOwn(options, name)) name = name.slice(3);
  const type = Object.hasOwn(options, name) ? getOwn(options[name], 'type') : undefined;
  if (type === undefined || (name !== token.name && type !== 'boolean')) throw errParseArgsUnknownOption(token.rawName, allowPositionals);

  const short = getOwn(options[name], 'short');
  const shortAndLong = `${short ? `-${short}, ` : ''}--${name}`;
  if (type === 'string' && typeof token.value !== 'string') throw errParseArgsInvalidOptionValue(`Option '${shortAndLong} <value>' argument missing`);
  if (type === 'boolean' && token.value != null) throw errParseArgsInvalidOptionValue(`Option '${shortAndLong}' does not take an argument`);
  if (!token.inlineValue && token.value?.length > 1 && token.value[0] === '-') {
    const example = token.rawName.startsWith('--') ? `'${token.rawName}=-XYZ'` : `'--${token.name}=-XYZ' or '${token.rawName}-XYZ'`;
    throw errParseArgsInvalidOptionValue(`Option '${token.rawName}' argument is ambiguous.
Did you forget to specify the option argument for '${token.rawName}'?
To specify an option argument starting with a dash use ${example}.`);
  }
};

export const parseArgs = (config = {}) => {
  const args = getOwn(config, 'args') ?? process.argv.slice(2);
  const strict = getOwn(config, 'strict') ?? true;
  const allowPositionals = getOwn(config, 'allowPositionals') ?? !strict;
  const allowNegative = getOwn(config, 'allowNegative') ?? false;
  const options = getOwn(config, 'options') ?? Object.create(null);
  for (const name in options) {
    const type = getOwn(options[name], 'type');
    if (type !== 'string' && type !== 'boolean') throw errInvalidArgType(`options.${name}.type`, "('string'|'boolean')", type);
    if (Object.hasOwn(options[name], 'short') && options[name].short.length !== 1) throw errInvalidArgValue(`options.${name}.short`, options[name].short, 'must be a single character');
  }

  const tokens = argsToTokens(args, options);
  const result = { values: Object.create(null), positionals: [] };
  if (getOwn(config, 'tokens')) result.tokens = tokens;
  for (const token of tokens) {
    if (token.kind === 'positional') {
      if (!allowPositionals) throw errParseArgsUnexpectedPositional(token.value);
      result.positionals.push(token.value);
    }
    if (token.kind !== 'option') continue;

    if (strict) checkToken(token, options, allowPositionals, allowNegative);
    let { name, value } = token;
    if (name === '__proto__') continue;
    if (allowNegative && name.startsWith('no-') && value === undefined) {
      name = name.slice(3);
      value = false;
    }
    value ??= true;
    if (Object.hasOwn(options, name) && getOwn(options[name], 'multiple')) (result.values[name] ??= []).push(value);
      else result.values[name] = value;
  }

  for (const name in options) {
    const defaultValue = getOwn(options[name], 'default');
    if (defaultValue !== undefined && result.values[name] === undefined && name !== '__proto__') result.values[name] = defaultValue;
  }
  return result;
};

export default {
  format, formatWithOptions, inspect, inherits, promisify, deprecate, debuglog, isDeepStrictEqual, getSystemErrorName,
  stripVTControlCharacters, styleText, parseArgs, types, TextEncoder, TextDecoder
};
