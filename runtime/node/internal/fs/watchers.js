// fs.watch and fs.watchFile, both polling stat on a timer
import { EventEmitter } from '../../events.js';
import { basename, join, resolve } from '../../path.js';
import { setInterval, clearInterval } from '../../timers.js';
import { nextTick } from '../loop.js';
import { validateFunction } from '../validators.js';
import * as binding from './binding.js';
import { Stats, getOptions, getValidatedPath } from './utils.js';

// what changes when an entry is modified
const statKey = stats => `${stats.ino} ${stats.mode} ${stats.size} ${stats.mtimeMs} ${stats.ctimeMs}`;

// stats by path relative to the watched one, with what is under it when it is a directory
const snapshot = (path, recursive) => {
  const stats = binding.tryStat(path);
  if (stats === undefined) return null;
  const out = new Map([ [ '', stats ] ]);
  const walk = (dir, prefix) => {
    let names;
    try {
      [ names ] = binding.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const child = binding.tryStat(join(dir, name), true);
      if (child === undefined) continue;
      out.set(prefix + name, child);
      if (recursive && child.isDirectory()) walk(join(dir, name), `${prefix}${name}/`);
    }
  };
  if (stats.isDirectory()) walk(path, '');
  return out;
};

class FSWatcher extends EventEmitter {
  #timer;

  constructor(path, persistent, recursive) {
    super();
    let prev = snapshot(path, recursive);
    if (prev === null) throw Object.assign(binding.uvException(2, 'watch', path), { filename: path });
    const isDir = prev.get('').isDirectory();
    const name = rel => isDir ? rel : basename(path);
    this.#timer = setInterval(() => {
      const curr = snapshot(path, recursive);
      if (curr === null) {
        this.emit('change', 'rename', name(''));
        if (!isDir) return this.close();
        prev = new Map();
        return;
      }
      const changes = [];
      for (const [ rel, stats ] of curr) {
        if (rel === '' && isDir) continue;
        const old = prev.get(rel);
        if (!old || old.ino !== stats.ino) changes.push([ 'rename', rel ]);
          else if (!stats.isDirectory() && statKey(old) !== statKey(stats)) changes.push([ 'change', rel ]);
      }
      for (const rel of prev.keys()) if (!curr.has(rel)) changes.push([ 'rename', rel ]);
      prev = curr;
      // a listener may close the watcher
      for (const [ type, rel ] of changes) if (this.#timer !== null) this.emit('change', type, name(rel));
    }, 50);
    if (!persistent) this.#timer.unref();
  }

  close() {
    if (this.#timer === null) return;
    clearInterval(this.#timer);
    this.#timer = null;
    nextTick(() => this.emit('close'));
  }

  ref() {
    this.#timer?.ref();
    return this;
  }

  unref() {
    this.#timer?.unref();
    return this;
  }
}

export function watch(filename, options, listener) {
  if (typeof options === 'function') listener = options;
  options = getOptions(options);
  const watcher = new FSWatcher(String(getValidatedPath(filename)), options.persistent ?? true, !!options.recursive);
  if (listener) watcher.on('change', listener);
  options.signal?.addEventListener('abort', () => watcher.close(), { once: true });
  return watcher;
}

const zero = new Stats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

// emits (curr, prev) when stat changes between polls
class StatWatcher extends EventEmitter {
  #timer;

  constructor(path, interval, persistent) {
    super();
    let prev = binding.tryStat(path) ?? zero;
    // a missing file reports once, all zero
    if (prev === zero) nextTick(() => this.emit('change', zero, zero));
    this.#timer = setInterval(() => {
      const curr = binding.tryStat(path) ?? zero;
      if (statKey(curr) !== statKey(prev)) this.emit('change', curr, prev);
      prev = curr;
    }, interval);
    if (!persistent) this.#timer.unref();
  }

  stop() {
    clearInterval(this.#timer);
    nextTick(() => this.emit('stop'));
  }

  ref() {
    this.#timer.ref();
    return this;
  }

  unref() {
    this.#timer.unref();
    return this;
  }
}

const statWatchers = new Map();

export function watchFile(filename, options, listener) {
  const path = resolve(String(getValidatedPath(filename)));
  if (typeof options === 'function') {
    listener = options;
    options = undefined;
  }
  validateFunction(listener, 'listener');
  let watcher = statWatchers.get(path);
  if (watcher === undefined) {
    watcher = new StatWatcher(path, options?.interval ?? 5007, options?.persistent ?? true);
    statWatchers.set(path, watcher);
  }
  watcher.on('change', listener);
  return watcher;
}

export function unwatchFile(filename, listener) {
  const path = resolve(String(getValidatedPath(filename)));
  const watcher = statWatchers.get(path);
  if (watcher === undefined) return;
  if (typeof listener === 'function') watcher.removeListener('change', listener);
    else watcher.removeAllListeners('change');
  if (watcher.listenerCount('change') === 0) {
    watcher.stop();
    statWatchers.delete(path);
  }
}
