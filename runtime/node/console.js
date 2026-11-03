// node's Console: util.format output written to streams
import process from './process.js';
import { formatWithOptions } from './internal/inspect.js';

const noop = () => {};

const shouldColorize = stream => {
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== '0';
  return !!stream?.isTTY && (typeof stream.getColorDepth === 'function' ? stream.getColorDepth() > 2 : true);
};

export function Console(options, ...rest) {
  if (!new.target) return new Console(options, ...rest);
  if (!options || typeof options.write === 'function') options = { stdout: options, stderr: rest[0], ignoreErrors: rest[1] };
  init(this, options);
  this._stdout = options.stdout;
  this._stderr = options.stderr ?? options.stdout;
}

const init = (console, { ignoreErrors = true, colorMode = 'auto', inspectOptions }) => {
  // methods work detached, like node's
  for (const key of Object.keys(Console.prototype)) console[key] = Console.prototype[key].bind(console);
  console._ignoreErrors = ignoreErrors;
  console._colorMode = colorMode;
  console._inspectOptions = inspectOptions;
};

const write = (console, stream, args) => {
  const colors = console._colorMode === 'auto' ? shouldColorize(stream) : console._colorMode;
  const string = formatWithOptions({ colors, ...console._inspectOptions }, ...args) + '\n';
  if (!console._ignoreErrors) return stream.write(string);

  // swallow write errors, sync or async
  const guard = stream.listenerCount?.('error') === 0;
  if (guard) stream.once('error', noop);
  try {
    stream.write(string);
  } catch {}
  if (guard) stream.removeListener('error', noop);
};

Console.prototype.log = function (...args) {
  write(this, this._stdout, args);
};

Console.prototype.warn = function (...args) {
  write(this, this._stderr, args);
};

// devtools async stack tagging: the task just runs
Console.prototype.createTask = function (name) {
  return { run: fn => fn() };
};

Console.prototype.info = Console.prototype.log;
Console.prototype.debug = Console.prototype.log;
Console.prototype.error = Console.prototype.warn;

// node's console, on the process's stdio
const console = Object.create(Console.prototype);
init(console, {});
Object.defineProperties(console, {
  _stdout: { get: () => process.stdout, configurable: true },
  _stderr: { get: () => process.stderr, configurable: true }
});
console.Console = Console;

export default console;
