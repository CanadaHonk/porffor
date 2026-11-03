// node's util.inspect and util.format
import * as types from '../util/types.js';
import { setInspect } from './errors.js';

const customInspect = Symbol.for('nodejs.util.inspect.custom');

const defaultOptions = {
  showHidden: false, depth: 2, colors: false, customInspect: true, maxArrayLength: 100, maxStringLength: 10000, breakLength: 80, compact: 3
};

const styles = Object.assign(Object.create(null), {
  special: 'cyan', number: 'yellow', bigint: 'yellow', boolean: 'yellow', undefined: 'grey', null: 'bold', string: 'green', symbol: 'green',
  date: 'magenta', regexp: 'red', module: 'underline'
});

const colors = Object.assign(Object.create(null), {
  reset: [ 0, 0 ], bold: [ 1, 22 ], dim: [ 2, 22 ], italic: [ 3, 23 ], underline: [ 4, 24 ], blink: [ 5, 25 ], inverse: [ 7, 27 ], hidden: [ 8, 28 ],
  strikethrough: [ 9, 29 ], doubleunderline: [ 21, 24 ], black: [ 30, 39 ], red: [ 31, 39 ], green: [ 32, 39 ], yellow: [ 33, 39 ], blue: [ 34, 39 ],
  magenta: [ 35, 39 ], cyan: [ 36, 39 ], white: [ 37, 39 ], bgBlack: [ 40, 49 ], bgRed: [ 41, 49 ], bgGreen: [ 42, 49 ], bgYellow: [ 43, 49 ],
  bgBlue: [ 44, 49 ], bgMagenta: [ 45, 49 ], bgCyan: [ 46, 49 ], bgWhite: [ 47, 49 ], framed: [ 51, 54 ], overlined: [ 53, 55 ], gray: [ 90, 39 ],
  redBright: [ 91, 39 ], greenBright: [ 92, 39 ], yellowBright: [ 93, 39 ], blueBright: [ 94, 39 ], magentaBright: [ 95, 39 ], cyanBright: [ 96, 39 ],
  whiteBright: [ 97, 39 ], bgGray: [ 100, 49 ], bgRedBright: [ 101, 49 ], bgGreenBright: [ 102, 49 ], bgYellowBright: [ 103, 49 ],
  bgBlueBright: [ 104, 49 ], bgMagentaBright: [ 105, 49 ], bgCyanBright: [ 106, 49 ], bgWhiteBright: [ 107, 49 ]
});
colors.grey = colors.blackBright = colors.gray;
colors.bgGrey = colors.bgBlackBright = colors.bgGray;
colors.faint = colors.dim;
colors.crossedout = colors.strikeThrough = colors.crossedOut = colors.strikethrough;
colors.conceal = colors.hidden;
colors.swapColors = colors.swapcolors = colors.inverse;
colors.doubleUnderline = colors.doubleunderline;

const stylizeNoColor = str => str;
const stylizeWithColor = (str, styleType) => {
  const color = colors[styles[styleType]];
  return color === undefined ? str : `\x1b[${color[0]}m${str}\x1b[${color[1]}m`;
};

const removeColors = str => str.replace(/\x1b\[\d\d?m/g, '');

const meta = [];
for (let i = 0; i < 160; i++) meta.push(i < 32 || i > 126 ? `\\x${i.toString(16).toUpperCase().padStart(2, '0')}` : '');
Object.assign(meta, { 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r', 39: "\\'", 92: '\\\\' });

// quotes the string like node: single quotes unless it contains them, then double quotes or backticks
const strEscape = str => {
  let quote = "'";
  if (str.includes("'")) {
    if (!str.includes('"')) quote = '"';
      else if (!str.includes('`') && !str.includes('${')) quote = '`';
  }
  let out = '', last = 0;
  for (let i = 0; i < str.length; i++) {
    const point = str.charCodeAt(i);
    if ((point === 39 && quote === "'") || point === 92 || point < 32 || (point > 126 && point < 160)) {
      out += str.slice(last, i) + meta[point];
      last = i + 1;
    } else if (point >= 0xd800 && point <= 0xdfff) {
      if (point <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          i++;
          continue;
        }
      }
      out += `${str.slice(last, i)}\\u${point.toString(16)}`;
      last = i + 1;
    }
  }
  return quote + out + str.slice(last) + quote;
};

const formatNumber = (fn, number) => fn(Object.is(number, -0) ? '-0' : `${number}`, 'number');

const formatPrimitive = (fn, value, ctx) => {
  switch (typeof value) {
    case 'string': {
      let trailer = '';
      if (value.length > ctx.maxStringLength) {
        const remaining = value.length - ctx.maxStringLength;
        value = value.slice(0, ctx.maxStringLength);
        trailer = `... ${remaining} more character${remaining > 1 ? 's' : ''}`;
      }
      // long strings break into one line per newline
      if (ctx.compact !== true && value.length > 16 && value.length > ctx.breakLength - ctx.indentationLvl - 4) {
        return value.split(/(?<=\n)/).map(line => fn(strEscape(line), 'string')).join(` +\n${' '.repeat(ctx.indentationLvl + 2)}`) + trailer;
      }
      return fn(strEscape(value), 'string') + trailer;
    }
    case 'number': return formatNumber(fn, value);
    case 'bigint': return fn(`${value}n`, 'bigint');
    case 'boolean': return fn(`${value}`, 'boolean');
    case 'undefined': return fn('undefined', 'undefined');
  }
  return fn(value.toString(), 'symbol');
};

const kObjectType = 0, kArrayType = 1, kArrayExtrasType = 2;

const getPrefix = (constructor, tag, fallback, size = '') => {
  if (constructor === null) return tag !== '' && fallback !== tag ? `[${fallback}${size}: null prototype] [${tag}] ` : `[${fallback}${size}: null prototype] `;
  return tag !== '' && constructor !== tag ? `${constructor}${size} [${tag}] ` : `${constructor}${size} `;
};

// the name of the first constructor up the prototype chain, null for null prototype objects
const getConstructorName = obj => {
  for (let proto = obj; proto !== null; proto = Object.getPrototypeOf(proto)) {
    if (Object.hasOwn(proto, 'constructor') && typeof proto.constructor === 'function' && proto.constructor.name !== '' && obj instanceof proto.constructor) return String(proto.constructor.name);
    if (Object.getPrototypeOf(proto) === null) return proto === obj ? null : 'Object';
  }
};

const getKeys = (value, showHidden) => {
  const symbols = Object.getOwnPropertySymbols(value);
  if (showHidden) return [ ...Object.getOwnPropertyNames(value), ...symbols ];
  return [ ...Object.keys(value), ...symbols.filter(key => Object.prototype.propertyIsEnumerable.call(value, key)) ];
};

const isIndex = key => /^(0|[1-9][0-9]*)$/.test(key) && +key < 2 ** 32 - 1;
const getOwnNonIndexProperties = (value, showHidden) => getKeys(value, showHidden).filter(key => typeof key === 'symbol' || !isIndex(key));

const getFunctionBase = (value, constructor, tag) => {
  let type = 'Function';
  if (types.isGeneratorFunction(value)) type = `Generator${type}`;
  if (types.isAsyncFunction(value)) type = `Async${type}`;
  let base = `[${type}${constructor === null ? ' (null prototype)' : ''}${value.name === '' ? ' (anonymous)' : `: ${value.name}`}]`;
  if (constructor !== type && constructor !== null) base += ` ${constructor}`;
  if (tag !== '' && constructor !== tag) base += ` [${tag}]`;
  return base;
};

const getBoxedBase = (value, ctx, keys, constructor, tag) => {
  const type = types.isNumberObject(value) ? 'Number' : types.isStringObject(value) ? 'String' : types.isBooleanObject(value) ? 'Boolean' : types.isBigIntObject(value) ? 'BigInt' : 'Symbol';
  if (type === 'String') keys.splice(0, value.length);
  let base = `[${type}`;
  if (type !== constructor) base += constructor === null ? ' (null prototype)' : ` (${constructor})`;
  base += `: ${formatPrimitive(stylizeNoColor, value.valueOf(), ctx)}]`;
  if (tag !== '' && tag !== constructor) base += ` [${tag}]`;
  if (keys.length !== 0 || ctx.stylize === stylizeNoColor) return base;
  return ctx.stylize(base, type.toLowerCase());
};

const formatError = (err, constructor, tag, ctx, keys) => {
  const name = err.name != null ? String(err.name) : 'Error';
  let stack = err.stack ? String(err.stack) : Error.prototype.toString.call(err);

  if (!ctx.showHidden && keys.length !== 0) {
    for (const key of [ 'name', 'message', 'stack' ]) {
      const index = keys.indexOf(key);
      if (index !== -1 && (typeof err[key] !== 'string' || stack.includes(err[key]))) keys.splice(index, 1);
    }
  }
  if ('cause' in err && !keys.includes('cause')) keys.push('cause');
  if (Array.isArray(err.errors) && !keys.includes('errors')) keys.push('errors');

  // the constructor or tag shows when the stack doesn't start with it
  if (constructor === null || (name.endsWith('Error') && stack.startsWith(name) && (stack.length === name.length || stack[name.length] === ':' || stack[name.length] === '\n'))) {
    const prefix = getPrefix(constructor, tag, 'Error').slice(0, -1);
    if (name !== prefix) stack = prefix.includes(name) ? `${prefix}${stack.slice(name.length)}` : `${prefix} [${name}]${stack.slice(name.length)}`;
  }

  // errors without a stack trace are wrapped in brackets
  let pos = (err.message && stack.indexOf(err.message)) || -1;
  if (pos !== -1) pos += err.message.length;
  if (stack.indexOf('\n    at', pos) === -1) stack = `[${stack}]`;
  if (ctx.indentationLvl !== 0) stack = stack.replaceAll('\n', `\n${' '.repeat(ctx.indentationLvl)}`);
  return stack;
};

const remainingText = remaining => `... ${remaining} more item${remaining > 1 ? 's' : ''}`;

const formatArray = (ctx, value, recurseTimes) => {
  const length = value.length, max = Math.min(Math.max(0, ctx.maxArrayLength), length);
  const output = [];
  let index = 0;
  // holes collapse into "<n empty items>"
  for (let i = 0; i < length && output.length < max; ) {
    if (!Object.hasOwn(value, i)) {
      let end = i + 1;
      while (end < length && !Object.hasOwn(value, end)) end++;
      output.push(ctx.stylize(`<${end - i} empty item${end - i > 1 ? 's' : ''}>`, 'undefined'));
      i = index = end;
      continue;
    }
    output.push(formatProperty(ctx, value, recurseTimes, i, kArrayType));
    index = ++i;
  }
  if (index < length) output.push(remainingText(length - index));
  return output;
};

const formatTypedArray = (ctx, value) => {
  const length = value.length, max = Math.min(Math.max(0, ctx.maxArrayLength), length);
  const output = [];
  for (let i = 0; i < max; i++) output.push(formatPrimitive(ctx.stylize, value[i], ctx));
  if (length > max) output.push(remainingText(length - max));
  return output;
};

const formatArrayBuffer = (ctx, value) => {
  const bytes = new Uint8Array(value);
  let str = Array.from(bytes.subarray(0, ctx.maxArrayLength), b => b.toString(16).padStart(2, '0')).join(' ');
  const remaining = bytes.length - ctx.maxArrayLength;
  if (remaining > 0) str += ` ... ${remaining} more byte${remaining > 1 ? 's' : ''}`;
  return [ `${ctx.stylize('[Uint8Contents]', 'special')}: <${str}>` ];
};

const formatEntries = (ctx, value, format) => {
  const max = Math.min(Math.max(0, ctx.maxArrayLength), value.size);
  const output = [];
  ctx.indentationLvl += 2;
  for (const entry of value) {
    if (output.length >= max) break;
    output.push(format(entry));
  }
  if (value.size > max) output.push(remainingText(value.size - max));
  ctx.indentationLvl -= 2;
  return output;
};

const formatSet = (ctx, value, recurseTimes) => formatEntries(ctx, value, v => formatValue(ctx, v, recurseTimes));
const formatMap = (ctx, value, recurseTimes) => formatEntries(ctx, value, ([ k, v ]) => `${formatValue(ctx, k, recurseTimes)} => ${formatValue(ctx, v, recurseTimes)}`);

const formatPromise = (ctx, value, recurseTimes) => {
  const state = __Porffor_promise_state(value);
  if (state === 0) return [ ctx.stylize('<pending>', 'special') ];
  ctx.indentationLvl += 2;
  const str = formatValue(ctx, __Porffor_promise_result(value), recurseTimes);
  ctx.indentationLvl -= 2;
  return [ state === 2 ? `${ctx.stylize('<rejected>', 'special')} ${str}` : str ];
};

const formatProperty = (ctx, value, recurseTimes, key, type, desc = Object.getOwnPropertyDescriptor(value, key) ?? { value: value[key], enumerable: false }) => {
  let str, extra = ' ';
  if (desc.value !== undefined) {
    const diff = ctx.compact !== true || type !== kObjectType ? 2 : 3;
    ctx.indentationLvl += diff;
    str = formatValue(ctx, desc.value, recurseTimes);
    if (diff === 3 && ctx.breakLength < removeColors(str).length) extra = `\n${' '.repeat(ctx.indentationLvl)}`;
    ctx.indentationLvl -= diff;
  } else if (desc.get !== undefined) {
    str = ctx.stylize(desc.set !== undefined ? '[Getter/Setter]' : '[Getter]', 'special');
  } else if (desc.set !== undefined) {
    str = ctx.stylize('[Setter]', 'special');
  } else {
    str = ctx.stylize('undefined', 'undefined');
  }
  if (type === kArrayType) return str;

  let name;
  if (typeof key === 'symbol') name = ctx.stylize(strEscape(key.toString()).slice(1, -1), 'symbol');
    else if (key === '__proto__') name = "['__proto__']";
    else if (desc.enumerable === false) name = `[${strEscape(key).slice(1, -1)}]`;
    else if (/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(key)) name = ctx.stylize(key, 'name');
    else name = ctx.stylize(strEscape(key), 'string');
  return `${name}:${extra}${str}`;
};

// arrays of many short entries print as aligned columns
const groupArrayElements = (ctx, output, value) => {
  let totalLength = 0, maxLength = 0, outputLength = output.length;
  if (ctx.maxArrayLength < output.length) outputLength--;
  const separatorSpace = 2, dataLen = [];
  for (let i = 0; i < outputLength; i++) {
    const len = ctx.colors ? removeColors(output[i]).length : output[i].length;
    dataLen.push(len);
    totalLength += len + separatorSpace;
    if (maxLength < len) maxLength = len;
  }
  const actualMax = maxLength + separatorSpace;
  if (actualMax * 3 + ctx.indentationLvl >= ctx.breakLength || (totalLength / actualMax <= 5 && maxLength > 6)) return output;

  const averageBias = Math.sqrt(actualMax - totalLength / output.length);
  const biasedMax = Math.max(actualMax - 3 - averageBias, 1);
  const columns = Math.min(
    Math.round(Math.sqrt(2.5 * biasedMax * outputLength) / biasedMax),
    Math.floor((ctx.breakLength - ctx.indentationLvl) / actualMax),
    ctx.compact * 4,
    15
  );
  if (columns <= 1) return output;

  const maxLineLength = [];
  for (let i = 0; i < columns; i++) {
    let lineLength = 0;
    for (let j = i; j < output.length; j += columns) {
      if (dataLen[j] > lineLength) lineLength = dataLen[j];
    }
    maxLineLength.push(lineLength + separatorSpace);
  }
  // numbers align right
  const padStart = value !== undefined && output.every((_, i) => typeof value[i] === 'number' || typeof value[i] === 'bigint');
  const grouped = [];
  for (let i = 0; i < outputLength; i += columns) {
    const max = Math.min(i + columns, outputLength);
    let str = '', j = i;
    for (; j < max - 1; j++) {
      const padding = maxLineLength[j - i] + output[j].length - dataLen[j];
      str += padStart ? `${output[j]}, `.padStart(padding, ' ') : `${output[j]}, `.padEnd(padding, ' ');
    }
    str += padStart ? output[j].padStart(maxLineLength[j - i] + output[j].length - dataLen[j] - separatorSpace, ' ') : output[j];
    grouped.push(str);
  }
  if (ctx.maxArrayLength < output.length) grouped.push(output[outputLength]);
  return grouped;
};

const isBelowBreakLength = (ctx, output, start, base) => {
  let totalLength = output.length + start;
  if (totalLength + output.length > ctx.breakLength) return false;
  for (const x of output) {
    totalLength += ctx.colors ? removeColors(x).length : x.length;
    if (totalLength > ctx.breakLength) return false;
  }
  return base === '' || !base.includes('\n');
};

const reduceToSingleString = (ctx, output, base, braces, extrasType, recurseTimes, value) => {
  if (ctx.compact !== true) {
    if (typeof ctx.compact === 'number' && ctx.compact >= 1) {
      const entries = output.length;
      if (extrasType === kArrayExtrasType && entries > 6) output = groupArrayElements(ctx, output, value);
      // the innermost `compact` levels fit on one line when they're short enough
      if (ctx.currentDepth - recurseTimes < ctx.compact && entries === output.length) {
        const start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
        if (isBelowBreakLength(ctx, output, start, base)) {
          const joined = output.join(', ');
          if (!joined.includes('\n')) return `${base ? `${base} ` : ''}${braces[0]} ${joined} ${braces[1]}`;
        }
      }
    }
    const indentation = `\n${' '.repeat(ctx.indentationLvl)}`;
    return `${base ? `${base} ` : ''}${braces[0]}${indentation}  ${output.join(`,${indentation}  `)}${indentation}${braces[1]}`;
  }
  if (isBelowBreakLength(ctx, output, 0, base)) return `${braces[0]}${base ? ` ${base}` : ''} ${output.join(', ')} ${braces[1]}`;
  const indentation = ' '.repeat(ctx.indentationLvl);
  const ln = base === '' && braces[0].length === 1 ? ' ' : `${base ? ` ${base}` : ''}\n${indentation}  `;
  return `${braces[0]}${ln}${output.join(`,\n${indentation}  `)} ${braces[1]}`;
};

const formatValue = (ctx, value, recurseTimes) => {
  if (typeof value !== 'object' && typeof value !== 'function') return formatPrimitive(ctx.stylize, value, ctx);
  if (value === null) return ctx.stylize('null', 'null');

  const context = value;
  if (Porffor.type(value) == Porffor.TYPES.proxy) {
    value = __Porffor_proxy_target(value);
    if (value === null) return ctx.stylize('<Revoked Proxy>', 'special');
  }

  if (ctx.customInspect) {
    const maybeCustom = value[customInspect];
    if (typeof maybeCustom === 'function' && maybeCustom !== inspect && !(value.constructor && value.constructor.prototype === value)) {
      const depth = ctx.depth === null ? null : ctx.depth - recurseTimes;
      const options = { ...ctx.userOptions, stylize: ctx.stylize };
      for (const key in defaultOptions) options[key] = ctx[key];
      const ret = maybeCustom.call(context, depth, options, inspect);
      if (ret !== context) {
        if (typeof ret !== 'string') return formatValue(ctx, ret, recurseTimes);
        return ret.replaceAll('\n', `\n${' '.repeat(ctx.indentationLvl)}`);
      }
    }
  }

  if (ctx.seen.includes(value)) {
    ctx.circular ??= new Map();
    if (!ctx.circular.has(value)) ctx.circular.set(value, ctx.circular.size + 1);
    return ctx.stylize(`[Circular *${ctx.circular.get(value)}]`, 'special');
  }
  return formatRaw(ctx, value, recurseTimes);
};

const formatRaw = (ctx, value, recurseTimes) => {
  const constructor = getConstructorName(value);
  let tag = value[Symbol.toStringTag];
  if (typeof tag !== 'string' || (tag !== '' && (ctx.showHidden ? Object.hasOwn(value, Symbol.toStringTag) : Object.prototype.propertyIsEnumerable.call(value, Symbol.toStringTag)))) tag = '';

  let keys, base = '', formatter = () => [], braces, extrasType = kObjectType;
  if (Array.isArray(value)) {
    const prefix = constructor !== 'Array' || tag !== '' ? getPrefix(constructor, tag, 'Array', `(${value.length})`) : '';
    keys = getOwnNonIndexProperties(value, ctx.showHidden);
    braces = [ `${prefix}[`, ']' ];
    if (value.length === 0 && keys.length === 0) return `${braces[0]}]`;
    extrasType = kArrayExtrasType;
    formatter = formatArray;
  } else if (types.isSet(value) || types.isMap(value)) {
    const prefix = getPrefix(constructor, tag, types.isSet(value) ? 'Set' : 'Map', `(${value.size})`);
    keys = getKeys(value, ctx.showHidden);
    formatter = types.isSet(value) ? formatSet : formatMap;
    if (value.size === 0 && keys.length === 0) return `${prefix}{}`;
    braces = [ `${prefix}{`, '}' ];
  } else if (types.isTypedArray(value)) {
    keys = getOwnNonIndexProperties(value, ctx.showHidden);
    braces = [ `${getPrefix(constructor, tag, constructor === null ? value[Symbol.toStringTag] : '', `(${value.length})`)}[`, ']' ];
    if (value.length === 0 && keys.length === 0) return `${braces[0]}]`;
    formatter = formatTypedArray;
    extrasType = kArrayExtrasType;
  } else {
    keys = getKeys(value, ctx.showHidden);
    braces = [ '{', '}' ];
    if (typeof value === 'function') {
      base = getFunctionBase(value, constructor, tag);
      if (keys.length === 0) return ctx.stylize(base, 'special');
    } else if (constructor === 'Object') {
      if (types.isArgumentsObject(value)) braces[0] = '[Arguments] [';
        else if (tag !== '') braces[0] = `${getPrefix(constructor, tag, 'Object')}{`;
      if (keys.length === 0) return `${braces[0]}}`;
    } else if (types.isRegExp(value) || types.isDate(value)) {
      const regexp = types.isRegExp(value);
      base = regexp ? RegExp.prototype.toString.call(value) : isNaN(value.getTime()) ? Date.prototype.toString.call(value) : Date.prototype.toISOString.call(value);
      const prefix = getPrefix(constructor, tag, regexp ? 'RegExp' : 'Date');
      if (prefix !== (regexp ? 'RegExp ' : 'Date ')) base = `${prefix}${base}`;
      if (keys.length === 0 || (regexp && recurseTimes > ctx.depth && ctx.depth !== null)) return ctx.stylize(base, regexp ? 'regexp' : 'date');
    } else if (types.isNativeError(value)) {
      base = formatError(value, constructor, tag, ctx, keys);
      if (keys.length === 0) return base;
    } else if (types.isAnyArrayBuffer(value)) {
      braces[0] = `${getPrefix(constructor, tag, types.isArrayBuffer(value) ? 'ArrayBuffer' : 'SharedArrayBuffer')}{`;
      formatter = formatArrayBuffer;
      keys.unshift('byteLength');
    } else if (types.isDataView(value)) {
      braces[0] = `${getPrefix(constructor, tag, 'DataView')}{`;
      keys.unshift('byteLength', 'byteOffset', 'buffer');
    } else if (types.isPromise(value)) {
      braces[0] = `${getPrefix(constructor, tag, 'Promise')}{`;
      formatter = formatPromise;
    } else if (types.isWeakSet(value) || types.isWeakMap(value)) {
      braces[0] = `${getPrefix(constructor, tag, types.isWeakSet(value) ? 'WeakSet' : 'WeakMap')}{`;
      formatter = () => [ ctx.stylize('<items unknown>', 'special') ];
    } else if (types.isBoxedPrimitive(value)) {
      base = getBoxedBase(value, ctx, keys, constructor, tag);
      if (keys.length === 0) return base;
    } else {
      if (keys.length === 0) return `${getPrefix(constructor, tag, 'Object')}{}`;
      braces[0] = `${getPrefix(constructor, tag, 'Object')}{`;
    }
  }

  if (recurseTimes > ctx.depth && ctx.depth !== null) {
    const name = getPrefix(constructor, tag, 'Object').slice(0, -1);
    return ctx.stylize(constructor !== null ? `[${name}]` : name, 'special');
  }
  recurseTimes++;
  ctx.seen.push(value);
  ctx.currentDepth = recurseTimes;
  const output = formatter(ctx, value, recurseTimes);
  for (const key of keys) output.push(formatProperty(ctx, value, recurseTimes, key, extrasType));

  const index = ctx.circular?.get(value);
  if (index !== undefined) {
    const reference = ctx.stylize(`<ref *${index}>`, 'special');
    if (ctx.compact !== true) base = base === '' ? reference : `${reference} ${base}`;
      else braces[0] = `${reference} ${braces[0]}`;
  }
  ctx.seen.pop();
  return reduceToSingleString(ctx, output, base, braces, extrasType, recurseTimes, value);
};

setInspect(inspect);

export function inspect(value, opts) {
  const ctx = { indentationLvl: 0, seen: [], currentDepth: 0, stylize: stylizeNoColor, ...inspect.defaultOptions };
  if (arguments.length > 2) {
    if (arguments[2] !== undefined) ctx.depth = arguments[2];
    if (arguments.length > 3 && arguments[3] !== undefined) ctx.colors = arguments[3];
  }
  if (typeof opts === 'boolean') {
    ctx.showHidden = opts;
  } else if (opts) {
    for (const key of Object.keys(opts)) {
      if (Object.hasOwn(defaultOptions, key) || key === 'stylize') ctx[key] = opts[key];
        else ctx.userOptions ??= opts;
    }
  }
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  if (ctx.maxArrayLength === null) ctx.maxArrayLength = Infinity;
  if (ctx.maxStringLength === null) ctx.maxStringLength = Infinity;
  return formatValue(ctx, value, 0);
}

let currentDefaults = { ...defaultOptions };
Object.defineProperty(inspect, 'defaultOptions', {
  get: () => currentDefaults,
  set: options => Object.assign(currentDefaults, options)
});
inspect.custom = customInspect;
inspect.colors = colors;
inspect.styles = styles;

// objects with their own or a user class's toString print through it in %s
const hasBuiltInToString = value => {
  if (Porffor.type(value) == Porffor.TYPES.proxy || typeof value.toString !== 'function' || Object.getPrototypeOf(value) === null) return true;
  let pointer = value;
  while (!Object.hasOwn(pointer, 'toString')) pointer = Object.getPrototypeOf(pointer);
  if (pointer === value) return false;
  const ctor = Object.getOwnPropertyDescriptor(pointer, 'constructor')?.value;
  return ctor === Object || ctor === Array || ctor === Error || ctor === Date || ctor === RegExp || ctor === Function || ctor === Number || ctor === Boolean || ctor === Symbol || ctor === BigInt;
};

const formatWithOptionsInternal = (inspectOptions, args) => {
  const first = args[0];
  let a = 0, str = '', join = '';
  if (typeof first === 'string') {
    if (args.length === 1) return first;
    let tempStr, lastPos = 0;
    for (let i = 0; i < first.length - 1; i++) {
      if (first.charCodeAt(i) !== 37) continue;
      const nextChar = first[++i];
      if (a + 1 !== args.length) {
        switch (nextChar) {
          case 's': {
            const arg = args[++a];
            if (typeof arg === 'number') tempStr = formatNumber(stylizeNoColor, arg);
              else if (typeof arg === 'bigint') tempStr = `${arg}n`;
              else if (typeof arg !== 'object' || arg === null || !hasBuiltInToString(arg)) tempStr = String(arg);
              else tempStr = inspect(arg, { ...inspectOptions, depth: 0, colors: false, compact: 3 });
            break;
          }
          case 'j':
            try {
              tempStr = JSON.stringify(args[++a]);
            } catch (err) {
              if (!err?.message?.includes('circular')) throw err;
              tempStr = '[Circular]';
            }
            break;
          case 'd': case 'i': case 'f': {
            const arg = args[++a];
            if (typeof arg === 'bigint' && nextChar !== 'f') tempStr = `${arg}n`;
              else if (typeof arg === 'symbol') tempStr = 'NaN';
              else tempStr = formatNumber(stylizeNoColor, nextChar === 'd' ? Number(arg) : nextChar === 'i' ? parseInt(arg) : parseFloat(arg));
            break;
          }
          case 'O':
            tempStr = inspect(args[++a], inspectOptions);
            break;
          case 'o':
            tempStr = inspect(args[++a], { ...inspectOptions, showHidden: true, depth: 4 });
            break;
          case 'c':
            a++;
            tempStr = '';
            break;
          case '%':
            str += first.slice(lastPos, i);
            lastPos = i + 1;
            continue;
          default:
            continue;
        }
        if (lastPos !== i - 1) str += first.slice(lastPos, i - 1);
        str += tempStr;
        lastPos = i + 1;
      } else if (nextChar === '%') {
        str += first.slice(lastPos, i);
        lastPos = i + 1;
      }
    }
    if (lastPos !== 0) {
      a++;
      join = ' ';
      if (lastPos < first.length) str += first.slice(lastPos);
    }
  }
  for (; a < args.length; a++) {
    str += join + (typeof args[a] !== 'string' ? inspect(args[a], inspectOptions) : args[a]);
    join = ' ';
  }
  return str;
};

export const formatWithOptions = (inspectOptions, ...args) => formatWithOptionsInternal(inspectOptions, args);
export const format = (...args) => formatWithOptionsInternal(undefined, args);

// ansi-regex: OSC sequences up to their terminator, then CSI and friends
const ansi = /(?:\u001B\][\s\S]*?(?:\u0007|\u001B\u005C|\u009C))|[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]/g;
export const stripVTControlCharacters = str => str.replace(ansi, '');
