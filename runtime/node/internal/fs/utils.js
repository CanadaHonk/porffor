// fs constants, Stats, Dirent and argument handling
import '../../c-helpers.js';
import { fileURLObjectToPath, isURL } from '../file-url.js';
import { errInvalidArgType, errInvalidArgValue } from '../errors.js';
import { validateInt32 } from '../validators.js';

// open flags differ by platform, -1 when missing
const openFlags = () => {
  let oRdonly = 0, oWronly = 0, oRdwr = 0, oCreat = 0, oExcl = 0, oNoctty = 0, oTrunc = 0, oAppend = 0, oDirectory = 0, oNofollow = 0, oSync = 0,
    oDsync = 0, oNonblock = 0, oSymlink = -1, oNoatime = -1;
  Porffor.c`
  oRdonly = O_RDONLY; oWronly = O_WRONLY; oRdwr = O_RDWR; oCreat = O_CREAT; oExcl = O_EXCL; oNoctty = O_NOCTTY; oTrunc = O_TRUNC; oAppend = O_APPEND;
  oDirectory = O_DIRECTORY; oNofollow = O_NOFOLLOW; oSync = O_SYNC; oDsync = O_DSYNC; oNonblock = O_NONBLOCK;
#ifdef O_SYMLINK
  oSymlink = O_SYMLINK;
#endif
#ifdef O_NOATIME
  oNoatime = O_NOATIME;
#endif
`;
  const out = {
    O_RDONLY: oRdonly, O_WRONLY: oWronly, O_RDWR: oRdwr, O_CREAT: oCreat, O_EXCL: oExcl, O_NOCTTY: oNoctty, O_TRUNC: oTrunc, O_APPEND: oAppend,
    O_DIRECTORY: oDirectory, O_NOFOLLOW: oNofollow, O_SYNC: oSync, O_DSYNC: oDsync, O_NONBLOCK: oNonblock
  };
  if (oSymlink !== -1) out.O_SYMLINK = oSymlink;
  if (oNoatime !== -1) out.O_NOATIME = oNoatime;
  return out;
};

export const constants = {
  __proto__: null,
  ...openFlags(),
  UV_FS_SYMLINK_DIR: 1, UV_FS_SYMLINK_JUNCTION: 2,
  UV_DIRENT_UNKNOWN: 0, UV_DIRENT_FILE: 1, UV_DIRENT_DIR: 2, UV_DIRENT_LINK: 3, UV_DIRENT_FIFO: 4, UV_DIRENT_SOCKET: 5, UV_DIRENT_CHAR: 6, UV_DIRENT_BLOCK: 7,
  UV_FS_O_FILEMAP: 0, UV_FS_O_TEMPORARY: 0, UV_FS_O_SHORT_LIVED: 0, UV_FS_O_SEQUENTIAL: 0, UV_FS_O_RANDOM: 0,
  S_IFMT: 0o170000, S_IFREG: 0o100000, S_IFDIR: 0o040000, S_IFCHR: 0o020000, S_IFBLK: 0o060000, S_IFIFO: 0o010000, S_IFLNK: 0o120000, S_IFSOCK: 0o140000,
  S_IRWXU: 0o700, S_IRUSR: 0o400, S_IWUSR: 0o200, S_IXUSR: 0o100, S_IRWXG: 0o70, S_IRGRP: 0o40, S_IWGRP: 0o20, S_IXGRP: 0o10,
  S_IRWXO: 0o7, S_IROTH: 0o4, S_IWOTH: 0o2, S_IXOTH: 0o1,
  F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1,
  UV_FS_COPYFILE_EXCL: 1, COPYFILE_EXCL: 1, UV_FS_COPYFILE_FICLONE: 2, COPYFILE_FICLONE: 2, UV_FS_COPYFILE_FICLONE_FORCE: 4, COPYFILE_FICLONE_FORCE: 4
};

const { O_APPEND, O_CREAT, O_EXCL, O_RDONLY, O_RDWR, O_SYNC, O_TRUNC, O_WRONLY, S_IFMT, S_IFREG, S_IFDIR, S_IFLNK } = constants;

export function Stats(dev, mode, nlink, uid, gid, rdev, blksize, ino, size, blocks, atimeMs, mtimeMs, ctimeMs, birthtimeMs) {
  this.dev = dev;
  this.mode = mode;
  this.nlink = nlink;
  this.uid = uid;
  this.gid = gid;
  this.rdev = rdev;
  this.blksize = blksize;
  this.ino = ino;
  this.size = size;
  this.blocks = blocks;
  this.atimeMs = atimeMs;
  this.mtimeMs = mtimeMs;
  this.ctimeMs = ctimeMs;
  this.birthtimeMs = birthtimeMs;
}

const isType = type => function () {
  return (Number(this.mode) & S_IFMT) === type;
};
Stats.prototype.isFile = isType(S_IFREG);
Stats.prototype.isDirectory = isType(S_IFDIR);
Stats.prototype.isSymbolicLink = isType(S_IFLNK);
Stats.prototype.isFIFO = isType(constants.S_IFIFO);
Stats.prototype.isSocket = isType(constants.S_IFSOCK);
Stats.prototype.isCharacterDevice = isType(constants.S_IFCHR);
Stats.prototype.isBlockDevice = isType(constants.S_IFBLK);

// dates are made on first access
for (const name of [ 'atime', 'mtime', 'ctime', 'birthtime' ]) {
  const own = (stats, value) => Object.defineProperty(stats, name, { value, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(Stats.prototype, name, {
    get() {
      const value = new Date(Math.round(Number(this[name + 'Ms'])));
      own(this, value);
      return value;
    },
    set(value) {
      own(this, value);
    },
    enumerable: true,
    configurable: true
  });
}

// fields as stat gives them: dev, mode, nlink, uid, gid, rdev, blksize, ino, size, blocks, then seconds and nanoseconds of each time
export const statsFrom = f => {
  if (!(f instanceof BigInt64Array)) {
    return new Stats(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9],
      f[10] * 1000 + f[11] / 1e6, f[12] * 1000 + f[13] / 1e6, f[14] * 1000 + f[15] / 1e6, f[16] * 1000 + f[17] / 1e6);
  }
  const ns = i => f[i] * 1000000000n + f[i + 1];
  const stats = new Stats(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9], ns(10) / 1000000n, ns(12) / 1000000n, ns(14) / 1000000n, ns(16) / 1000000n);
  stats.atimeNs = ns(10);
  stats.mtimeNs = ns(12);
  stats.ctimeNs = ns(14);
  stats.birthtimeNs = ns(16);
  return stats;
};

const kType = Symbol('type');

// type is the S_IF* bits
export class Dirent {
  constructor(name, type, parentPath) {
    this.name = name;
    this.parentPath = parentPath;
    this[kType] = type;
  }

  isFile() { return this[kType] === S_IFREG; }
  isDirectory() { return this[kType] === S_IFDIR; }
  isSymbolicLink() { return this[kType] === S_IFLNK; }
}

export const stringToFlags = flags => {
  if (typeof flags === 'number') {
    validateInt32(flags, 'flags');
    return flags;
  }
  switch (flags) {
    case undefined: case null: case 'r': return O_RDONLY;
    case 'rs': case 'sr': return O_RDONLY | O_SYNC;
    case 'r+': return O_RDWR;
    case 'rs+': case 'sr+': return O_RDWR | O_SYNC;
    case 'w': return O_TRUNC | O_CREAT | O_WRONLY;
    case 'wx': case 'xw': return O_TRUNC | O_CREAT | O_WRONLY | O_EXCL;
    case 'w+': return O_TRUNC | O_CREAT | O_RDWR;
    case 'wx+': case 'xw+': return O_TRUNC | O_CREAT | O_RDWR | O_EXCL;
    case 'a': return O_APPEND | O_CREAT | O_WRONLY;
    case 'ax': case 'xa': return O_APPEND | O_CREAT | O_WRONLY | O_EXCL;
    case 'as': case 'sa': return O_APPEND | O_CREAT | O_WRONLY | O_SYNC;
    case 'a+': return O_APPEND | O_CREAT | O_RDWR;
    case 'ax+': case 'xa+': return O_APPEND | O_CREAT | O_RDWR | O_EXCL;
    case 'as+': case 'sa+': return O_APPEND | O_CREAT | O_RDWR | O_SYNC;
  }
  throw errInvalidArgValue('flags', flags);
};

// a Date or number as fractional unix seconds
export const toUnixTimestamp = (time, name = 'time') => {
  if (typeof time === 'string' && +time == time) return +time;
  if (Number.isFinite(time)) return time < 0 ? Date.now() / 1000 : time;
  if (time instanceof Date) return time.getTime() / 1000;
  throw errInvalidArgType(name, [ 'Date', 'Time in seconds' ], time);
};

// a string or Buffer path, from a file URL too, without null bytes
export const getValidatedPath = (path, name = 'path') => {
  if (typeof path === 'object' && isURL(path)) path = fileURLObjectToPath(path);
  if (typeof path !== 'string' && !(path instanceof Uint8Array)) throw errInvalidArgType(name, [ 'string', 'Buffer', 'URL' ], path);
  if (path.includes(typeof path === 'string' ? '\u0000' : 0)) throw errInvalidArgValue(name, path, 'must be a string, Uint8Array, or URL without null bytes');
  return path;
};

export const getValidatedFd = fd => {
  validateInt32(fd, 'fd', 0);
  return fd;
};

// options given as an encoding string, an object or nothing
export const getOptions = (options, defaults = {}) => {
  if (options == null || typeof options === 'function') return defaults;
  if (typeof options === 'string') return { ...defaults, encoding: options };
  if (typeof options !== 'object') throw errInvalidArgType('options', [ 'string', 'Object' ], options);
  return options;
};
