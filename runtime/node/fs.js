import { Buffer } from './buffer.js';
import { nextTick } from './internal/loop.js';
import { dirname, isAbsolute, join, resolve, sep } from './path.js';
import { abortError, errInvalidArgType, errInvalidReturnValue, systemError } from './internal/errors.js';
import { validateFunction } from './internal/validators.js';
import * as binding from './internal/fs/binding.js';
import { constants, Dirent, Stats, getOptions, getValidatedPath } from './internal/fs/utils.js';
import { ReadStream, WriteStream } from './internal/fs/streams.js';
import { watch, watchFile, unwatchFile } from './internal/fs/watchers.js';

export { constants, Stats, ReadStream, WriteStream, watch, watchFile, unwatchFile };

const { S_IFDIR, S_IFLNK } = constants;

const callback = cb => {
  validateFunction(cb, 'cb');
  return cb;
};

const rethrow = err => {
  if (err) throw err;
};

const customArgs = Symbol.for('nodejs.util.promisify.customArgs');

export function access(path, mode, cb) {
  if (typeof mode === 'function') {
    cb = mode;
    mode = undefined;
  }
  binding.access(path, mode, callback(cb));
}

export const accessSync = (path, mode) => binding.access(path, mode);

export function exists(path, cb) {
  validateFunction(cb, 'cb');
  try {
    binding.access(path, 0, err => cb(!err));
  } catch {
    cb(false);
  }
}
Object.defineProperty(exists, Symbol.for('nodejs.util.promisify.custom'), { value: path => new Promise(resolve => exists(path, resolve)) });

export const existsSync = path => {
  try {
    path = getValidatedPath(path);
  } catch {
    return false;
  }
  return binding.exists(path);
};

export function readFile(path, options, cb) {
  cb = callback(cb || options);
  options = getOptions(options);
  const { encoding, signal } = options;
  if (signal?.aborted) return nextTick(cb, abortError(signal.reason));
  binding.readFile(path, options.flag, false, (err, buffer) => {
    if (err) return cb(err);
    if (signal?.aborted) return cb(abortError(signal.reason));
    cb(null, encoding ? buffer.toString(encoding) : buffer);
  });
}

export const readFileSync = (path, options) => {
  options = getOptions(options);
  const { encoding } = options;
  if (encoding === 'utf8' || encoding === 'utf-8') return binding.readFile(path, options.flag, true);
  const buffer = binding.readFile(path, options.flag, false);
  return encoding ? buffer.toString(encoding) : buffer;
};

const fileData = (data, encoding) => {
  if (ArrayBuffer.isView(data)) return data;
  if (typeof data !== 'string') throw errInvalidArgType('data', [ 'string', 'Buffer', 'TypedArray', 'DataView' ], data);
  return Buffer.from(data, encoding ?? 'utf8');
};

export function writeFile(path, data, options, cb) {
  cb = callback(cb || options);
  options = getOptions(options);
  const { signal } = options;
  if (signal?.aborted) return nextTick(cb, abortError(signal.reason));
  binding.writeFile(path, fileData(data, options.encoding), options.flag || 'w', options.mode, err => cb(err ?? (signal?.aborted ? abortError(signal.reason) : null)));
}

export const writeFileSync = (path, data, options) => {
  options = getOptions(options);
  binding.writeFile(path, fileData(data, options.encoding), options.flag || 'w', options.mode);
};

const appendOptions = options => {
  options = getOptions(options);
  return { ...options, flag: options.flag || 'a' };
};

export function appendFile(path, data, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  writeFile(path, data, appendOptions(options), cb);
}

export const appendFileSync = (path, data, options) => writeFileSync(path, data, appendOptions(options));

export function close(fd, cb = rethrow) {
  binding.close(fd, callback(cb));
}

export const closeSync = fd => binding.close(fd);

export function open(path, flags, mode, cb) {
  if (typeof flags === 'function') {
    cb = flags;
    flags = undefined;
  } else if (typeof mode === 'function') {
    cb = mode;
    mode = undefined;
  }
  binding.open(path, flags, mode, callback(cb));
}

export const openSync = (path, flags, mode) => binding.open(path, flags, mode);

// (fd, cb), (fd, options, cb), (fd, buffer, cb), (fd, buffer, options, cb) or every argument
export function read(fd, buffer, offset, length, position, cb) {
  if (typeof buffer === 'function') {
    cb = buffer;
    buffer = {};
  } else if (typeof offset === 'function') {
    cb = offset;
    offset = undefined;
  } else if (typeof length === 'function') {
    cb = length;
    ({ offset, length, position } = offset ?? {});
  }
  if (!ArrayBuffer.isView(buffer)) ({ buffer = Buffer.alloc(16384), offset, length, position } = buffer ?? {});
  cb = callback(cb);
  binding.read(fd, buffer, offset, length, position, (err, bytesRead) => cb(err, bytesRead ?? 0, buffer));
}
Object.defineProperty(read, customArgs, { value: [ 'bytesRead', 'buffer' ] });

export const readSync = (fd, buffer, offset, length, position) => {
  if (offset !== null && typeof offset === 'object') ({ offset, length, position } = offset);
  return binding.read(fd, buffer, offset, length, position);
};

// buffers take (offset, length, position) or options, strings (position, encoding)
const writeArgs = (data, a, b, c) => typeof data === 'string' ? [ undefined, typeof b === 'string' ? b : 'utf8', typeof a === 'number' ? a : null ]
  : a !== null && typeof a === 'object' ? [ a.offset, a.length, a.position ] : [ a, b, c ];

export function write(fd, data, ...args) {
  const cb = callback(args.pop());
  binding.write(fd, data, ...writeArgs(data, ...args), (err, written) => cb(err, written ?? 0, data));
}
Object.defineProperty(write, customArgs, { value: [ 'bytesWritten', 'buffer' ] });

export const writeSync = (fd, data, a, b, c) => binding.write(fd, data, ...writeArgs(data, a, b, c));

export function writev(fd, buffers, position, cb) {
  if (typeof position === 'function') {
    cb = position;
    position = null;
  }
  cb = callback(cb);
  binding.write(fd, Buffer.concat(buffers), undefined, undefined, position, (err, written) => cb(err, written ?? 0, buffers));
}
Object.defineProperty(writev, customArgs, { value: [ 'bytesWritten', 'buffer' ] });

export function rename(oldPath, newPath, cb) {
  binding.rename(oldPath, newPath, callback(cb));
}

export const renameSync = (oldPath, newPath) => binding.rename(oldPath, newPath);

export function rmdir(path, options, cb) {
  binding.rmdir(path, callback(cb ?? options));
}

export const rmdirSync = path => binding.rmdir(path);

export function rm(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  binding.rm(path, options?.recursive, options?.force, callback(cb));
}

export const rmSync = (path, options) => binding.rm(path, options?.recursive, options?.force);

export function fsync(fd, cb) {
  binding.fsync(fd, callback(cb));
}

export const fsyncSync = fd => binding.fsync(fd);

// fsync also flushes metadata, so it covers fdatasync
export const fdatasync = fsync, fdatasyncSync = fsyncSync;

// a mode, or options with mode and recursive
const mkdirArgs = options => options !== null && typeof options === 'object' ? [ options.mode, !!options.recursive ] : [ options, false ];

export function mkdir(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  binding.mkdir(path, ...mkdirArgs(options), callback(cb));
}

export const mkdirSync = (path, options) => binding.mkdir(path, ...mkdirArgs(options));

const dirents = (path, [ names, types ]) => names.map((name, i) => new Dirent(name, types[i], path));

// recursive listings go breadth first, into symlinks to directories too
const addEntries = (dir, prefix, [ names, types ], withFileTypes, out, queue) => {
  for (let i = 0; i < names.length; i++) {
    const name = names[i], type = types[i];
    out.push(withFileTypes ? new Dirent(name, type, dir) : prefix + name);
    if (type === S_IFDIR || (type === S_IFLNK && binding.tryStat(join(dir, name))?.isDirectory())) queue.push([ join(dir, name), prefix + name + sep ]);
  }
};

const readdirRecursive = (path, options, cb) => {
  const out = [], queue = [ [ path, '' ] ];
  let i = 0;
  const readNext = () => {
    const [ dir, prefix ] = queue[i++];
    binding.readdir(dir, options.encoding, (err, entries) => {
      if (err) return cb(err);
      addEntries(dir, prefix, entries, options.withFileTypes, out, queue);
      if (i < queue.length) readNext();
        else cb(null, out);
    });
  };
  readNext();
};

export function readdir(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  cb = callback(cb);
  options = getOptions(options);
  path = getValidatedPath(path);
  if (options.recursive) return readdirRecursive(path, options, cb);
  binding.readdir(path, options.encoding, (err, entries) => err ? cb(err) : cb(null, options.withFileTypes ? dirents(path, entries) : entries[0]));
}

export const readdirSync = (path, options) => {
  options = getOptions(options);
  path = getValidatedPath(path);
  if (!options.recursive) {
    const entries = binding.readdir(path, options.encoding);
    return options.withFileTypes ? dirents(path, entries) : entries[0];
  }
  const out = [], queue = [ [ path, '' ] ];
  for (let i = 0; i < queue.length; i++) {
    const [ dir, prefix ] = queue[i];
    addEntries(dir, prefix, binding.readdir(dir, options.encoding), options.withFileTypes, out, queue);
  }
  return out;
};

export function stat(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  binding.stat(path, options, callback(cb));
}

export function lstat(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  binding.lstat(path, options, callback(cb));
}

export function fstat(fd, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  binding.fstat(fd, options, callback(cb));
}

export const statSync = (path, options) => binding.stat(path, options);

export const lstatSync = (path, options) => binding.lstat(path, options);

export const fstatSync = (fd, options) => binding.fstat(fd, options);

export function readlink(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  binding.readlink(path, getOptions(options).encoding, callback(cb));
}

export const readlinkSync = (path, options) => binding.readlink(path, getOptions(options).encoding);

export function symlink(target, path, type, cb) {
  binding.symlink(target, path, callback(typeof type === 'function' ? type : cb));
}

export const symlinkSync = (target, path) => binding.symlink(target, path);

export function link(existingPath, newPath, cb) {
  binding.link(existingPath, newPath, callback(cb));
}

export const linkSync = (existingPath, newPath) => binding.link(existingPath, newPath);

export function unlink(path, cb) {
  binding.unlink(path, callback(cb));
}

export const unlinkSync = path => binding.unlink(path);

export function chmod(path, mode, cb) {
  binding.chmod(path, mode, callback(cb));
}

export const chmodSync = (path, mode) => binding.chmod(path, mode);

export function chown(path, uid, gid, cb) {
  binding.chown(path, uid, gid, callback(cb));
}

export const chownSync = (path, uid, gid) => binding.chown(path, uid, gid);

export function lchown(path, uid, gid, cb) {
  binding.lchown(path, uid, gid, callback(cb));
}

export const lchownSync = (path, uid, gid) => binding.lchown(path, uid, gid);

export function fchown(fd, uid, gid, cb) {
  binding.fchown(fd, uid, gid, callback(cb));
}

export const fchownSync = (fd, uid, gid) => binding.fchown(fd, uid, gid);

export function utimes(path, atime, mtime, cb) {
  binding.utimes(path, atime, mtime, callback(cb));
}

export const utimesSync = (path, atime, mtime) => binding.utimes(path, atime, mtime);

export function futimes(fd, atime, mtime, cb) {
  binding.futimes(fd, atime, mtime, callback(cb));
}

export const futimesSync = (fd, atime, mtime) => binding.futimes(fd, atime, mtime);

export function copyFile(src, dest, mode, cb) {
  if (typeof mode === 'function') {
    cb = mode;
    mode = undefined;
  }
  binding.copyFile(src, dest, mode, callback(cb));
}

export const copyFileSync = (src, dest, mode) => binding.copyFile(src, dest, mode);

export function mkdtemp(prefix, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  binding.mkdtemp(prefix, getOptions(options).encoding, callback(cb));
}

export const mkdtempSync = (prefix, options) => binding.mkdtemp(prefix, getOptions(options).encoding);

const encodePath = (path, encoding) => encoding === 'buffer' ? Buffer.from(path)
  : encoding == null || encoding === 'utf8' || encoding === 'utf-8' ? path : Buffer.from(path).toString(encoding);

// resolves symlinks a component at a time, keeping the case of the rest unlike realpath(3)
export function realpathSync(path, options) {
  path = getValidatedPath(path);
  let parts = resolve(typeof path === 'string' ? path : Buffer.from(path).toString()).split('/'), real = '', links = 0;
  const known = new Set();
  for (let i = 1; i < parts.length; i++) {
    const next = `${real}/${parts[i]}`;
    const target = known.has(next) ? undefined : binding.linkTarget(next);
    if (target === undefined) {
      known.add(next);
      real = next;
      continue;
    }
    // past 40 links it is likely a cycle, which stat reports as ELOOP
    if (++links > 40) binding.stat(next);
    parts = resolve(real || '/', target, ...parts.slice(i + 1)).split('/');
    real = '';
    i = 0;
  }
  return encodePath(real || '/', getOptions(options).encoding);
}

realpathSync.native = (path, options) => binding.realpath(path, getOptions(options).encoding);

export function realpath(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  cb = callback(cb);
  let result;
  try {
    result = realpathSync(path, options);
  } catch (err) {
    return nextTick(cb, err);
  }
  nextTick(cb, null, result);
}

realpath.native = (path, options, cb) => {
  binding.realpath(path, getOptions(options).encoding, callback(cb ?? options));
};

const EEXIST = 17, ENOTDIR = 20, EISDIR = 21, EINVAL = 22;
const cpError = (code, prefix, errno, message, path) => systemError(code, prefix, { code: errno === EEXIST ? 'EEXIST' : errno === ENOTDIR ? 'ENOTDIR' : errno === EISDIR ? 'EISDIR' : 'EINVAL', message, path, syscall: 'cp', errno });

// cpSync's walk, which fs/promises.cp runs too
const copy = (src, dest, options, top) => {
  if (options.filter) {
    const keep = options.filter(src, dest);
    if (keep instanceof Promise) throw errInvalidReturnValue('boolean', 'filter', keep);
    if (!keep) return;
  }
  const statFn = options.dereference ? statSync : lstatSync;
  const srcStat = statFn(src), destStat = statFn(dest, { throwIfNoEntry: false });
  const isDir = srcStat.isDirectory();
  if (destStat) {
    if (destStat.ino === srcStat.ino && destStat.dev === srcStat.dev) throw cpError('ERR_FS_CP_EINVAL', 'Invalid src or dest', EINVAL, 'src and dest cannot be the same', dest);
    if (isDir && !destStat.isDirectory()) throw cpError('ERR_FS_CP_DIR_TO_NON_DIR', 'Cannot overwrite non-directory with directory', EISDIR, `cannot overwrite non-directory ${dest} with directory ${src}`, dest);
    if (!isDir && destStat.isDirectory()) throw cpError('ERR_FS_CP_NON_DIR_TO_DIR', 'Cannot overwrite directory with non-directory', ENOTDIR, `cannot overwrite directory ${dest} with non-directory ${src}`, dest);
  }
  if (isDir && !options.recursive) throw cpError('ERR_FS_EISDIR', 'Path is a directory', EISDIR, `${src} is a directory (not copied)`, src);
  if (top) {
    if (isDir && `${resolve(dest)}/`.startsWith(`${resolve(src)}/`)) throw cpError('ERR_FS_CP_EINVAL', 'Invalid src or dest', EINVAL, `cannot copy ${src} to a subdirectory of self ${dest}`, dest);
    if (!destStat) mkdirSync(dirname(dest), { recursive: true });
  }

  if (isDir) {
    if (!destStat) mkdirSync(dest);
      else if (options.errorOnExist && !options.force) throw cpError('ERR_FS_CP_EEXIST', 'Target already exists', EEXIST, `${dest} already exists`, dest);
    for (const name of readdirSync(src)) copy(join(src, name), join(dest, name), options, false);
    if (!destStat) chmodSync(dest, srcStat.mode & 0o7777);
  } else if (srcStat.isSymbolicLink()) {
    let target = readlinkSync(src);
    if (!options.verbatimSymlinks && !isAbsolute(target)) target = resolve(realpathSync(dirname(src)), target);
    if (destStat) unlinkSync(dest);
    return symlinkSync(target, dest);
  } else if (srcStat.isFile() || srcStat.isCharacterDevice() || srcStat.isBlockDevice()) {
    if (destStat) {
      if (!options.force) {
        if (options.errorOnExist) throw cpError('ERR_FS_CP_EEXIST', 'Target already exists', EEXIST, `${dest} already exists`, dest);
        return;
      }
      unlinkSync(dest);
    }
    copyFileSync(src, dest, options.mode);
    chmodSync(dest, srcStat.mode & 0o7777);
  } else {
    throw cpError('ERR_FS_CP_UNKNOWN', 'Cannot copy an unknown file type', EINVAL, `cannot copy an unknown file type: ${dest}`, dest);
  }
  if (options.preserveTimestamps) utimesSync(dest, srcStat.atime, srcStat.mtime);
};

export const cpSync = (src, dest, options) => copy(getValidatedPath(src, 'src'), getValidatedPath(dest, 'dest'), { force: true, ...options }, true);

export function cp(src, dest, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  callback(cb);
  try {
    cpSync(src, dest, options);
  } catch (err) {
    return nextTick(cb, err);
  }
  nextTick(cb, null);
}

export function opendir(path, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  callback(cb);
  path = getValidatedPath(path);
  binding.readdir(path, getOptions(options).encoding, (err, entries) => err ? cb(err) : cb(null, new Dir(path, dirents(path, entries))));
}

export const opendirSync = (path, options) => {
  path = getValidatedPath(path);
  return new Dir(path, dirents(path, binding.readdir(path, getOptions(options).encoding)));
};

export function createReadStream(path, options) {
  return new ReadStream(path, options);
}

export function createWriteStream(path, options) {
  return new WriteStream(path, options);
}

const promise = run => new Promise((resolve, reject) => run((err, value) => err ? reject(err) : resolve(value)));
const promisify = fn => (...args) => promise(cb => fn(...args, cb));

class FileHandle {
  constructor(fd) {
    this.fd = fd;
  }

  close() {
    const fd = this.fd;
    this.fd = -1;
    return fd === -1 ? Promise.resolve() : promise(cb => binding.close(fd, cb));
  }

  // (buffer, offset, length, position), (buffer, options) or (options)
  async read(buffer, offset, length, position) {
    if (!ArrayBuffer.isView(buffer)) ({ buffer = Buffer.alloc(16384), offset, length, position } = buffer ?? {});
      else if (offset !== null && typeof offset === 'object') ({ offset, length, position } = offset);
    const bytesRead = await promise(cb => binding.read(this.fd, buffer, offset, length, position, cb));
    return { bytesRead, buffer };
  }

  async write(data, a, b, c) {
    const bytesWritten = await promise(cb => binding.write(this.fd, data, ...writeArgs(data, a, b, c), cb));
    return { bytesWritten, buffer: data };
  }

  stat(options) {
    return promise(cb => binding.fstat(this.fd, options, cb));
  }

  sync() {
    return promise(cb => binding.fsync(this.fd, cb));
  }

  readFile(options) {
    return promises.readFile(this, options);
  }

  writeFile(data, options) {
    return promises.writeFile(this, data, options);
  }

  appendFile(data, options) {
    return promises.writeFile(this, data, options);
  }

  [Symbol.asyncDispose]() {
    return this.close();
  }
}

// a whole directory read up front
class Dir {
  #entries;
  #index = 0;

  constructor(path, entries) {
    this.path = path;
    this.#entries = entries;
  }

  readSync() {
    return this.#index < this.#entries.length ? this.#entries[this.#index++] : null;
  }

  async read() {
    return this.readSync();
  }

  closeSync() {
    this.#entries = [];
  }

  async close() {
    this.closeSync();
  }

  async *entries() {
    let entry;
    while ((entry = this.readSync()) !== null) yield entry;
  }
}
Dir.prototype[Symbol.asyncIterator] = Dir.prototype.entries;

const fdOf = path => path instanceof FileHandle ? path.fd : path;

// iterables are written once collected
const writeFilePromise = async (path, data, options) => {
  if (typeof data !== 'string' && !ArrayBuffer.isView(data) && (data?.[Symbol.asyncIterator] || data?.[Symbol.iterator])) {
    const encoding = getOptions(options).encoding ?? 'utf8', chunks = [];
    for await (const chunk of data) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk);
    data = Buffer.concat(chunks);
  }
  return promise(cb => writeFile(fdOf(path), data, options, cb));
};

export const promises = {
  access: promisify(access),
  appendFile: (path, data, options) => writeFilePromise(path, data, appendOptions(options)),
  chmod: promisify(chmod),
  chown: promisify(chown),
  constants,
  copyFile: promisify(copyFile),
  cp: async (src, dest, options) => cpSync(src, dest, options),
  lstat: promisify(lstat),
  mkdir: promisify(mkdir),
  mkdtemp: (prefix, options) => promise(cb => binding.mkdtemp(prefix, getOptions(options).encoding, cb)),
  open: async (path, flags, mode) => new FileHandle(await promise(cb => binding.open(path, flags, mode, cb))),
  opendir: promisify(opendir),
  readFile: (path, options) => promise(cb => readFile(fdOf(path), options, cb)),
  readdir: promisify(readdir),
  readlink: promisify(readlink),
  realpath: (path, options) => promise(cb => binding.realpath(path, getOptions(options).encoding, cb)),
  rename: promisify(rename),
  rm: promisify(rm),
  rmdir: promisify(rmdir),
  stat: promisify(stat),
  link: promisify(link),
  symlink: (target, path) => promise(cb => binding.symlink(target, path, cb)),
  unlink: promisify(unlink),
  utimes: promisify(utimes),
  writeFile: writeFilePromise
};

export default {
  access, accessSync, appendFile, appendFileSync, chmod, chmodSync, chown, chownSync, close, closeSync, constants, copyFile, copyFileSync, cp, cpSync,
  createReadStream, createWriteStream, exists, existsSync, fchown, fchownSync, fdatasync, fdatasyncSync, fstat, fstatSync, fsync, fsyncSync, futimes, futimesSync,
  lchown, lchownSync, link, linkSync, lstat, lstatSync, mkdir, mkdirSync, mkdtemp, mkdtempSync, open, openSync, opendir, opendirSync, promises, read, readFile, readFileSync,
  readSync, readdir, readdirSync, readlink, readlinkSync, realpath, realpathSync, rename, renameSync, rm, rmSync, rmdir, rmdirSync, stat,
  statSync, symlink, symlinkSync, unlink, unlinkSync, unwatchFile, utimes, utimesSync, watch, watchFile, write, writeFile, writeFileSync, writeSync,
  writev, Stats, ReadStream, WriteStream, FileReadStream: ReadStream, FileWriteStream: WriteStream
};
