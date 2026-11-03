// fs syscalls: each validates its arguments then runs inline without a callback, else on the threadpool calling cb(err, value)
import '../../c-helpers.js';
import { Buffer } from '../../buffer.js';
import { queueWork } from '../loop.js';
import { setImmediate } from '../../timers.js';
import { adoptBytes, adoptString, errnoError } from '../bytes.js';
import { errOutOfRange, systemError } from '../errors.js';
import { parseFileMode, validateBuffer, validateInteger } from '../validators.js';
import { getValidatedFd, getValidatedPath, statsFrom, stringToFlags, toUnixTimestamp } from './utils.js';

Porffor.c`
#include <dirent.h>

enum {
  PORF_FS_OPEN = 1, PORF_FS_CLOSE, PORF_FS_READ, PORF_FS_WRITE, PORF_FS_STAT, PORF_FS_LSTAT, PORF_FS_FSTAT, PORF_FS_READFILE, PORF_FS_WRITEFILE,
  PORF_FS_UNLINK, PORF_FS_RMDIR, PORF_FS_RM, PORF_FS_RENAME, PORF_FS_SYMLINK, PORF_FS_LINK, PORF_FS_READLINK, PORF_FS_REALPATH, PORF_FS_CHMOD,
  PORF_FS_CHOWN, PORF_FS_FCHOWN, PORF_FS_LCHOWN, PORF_FS_ACCESS, PORF_FS_MKDIR, PORF_FS_MKDIRP, PORF_FS_MKDTEMP, PORF_FS_READDIR, PORF_FS_FSYNC,
  PORF_FS_COPYFILE, PORF_FS_UTIMES, PORF_FS_FUTIMES
};

typedef struct {
  i32 kind, fd, flags, mode, err;
  char *path, *path2;
  u8 *buf;
  i64 len, pos, result;
  f64 atime, mtime;
  char *data;
  size_t data_len;
  i64 stat[18];
} porf_fs_op;

static void porf_fs_stat_out(const struct stat *st, i64 *o) {
  o[0] = st->st_dev; o[1] = st->st_mode; o[2] = st->st_nlink; o[3] = st->st_uid; o[4] = st->st_gid; o[5] = st->st_rdev;
  o[6] = st->st_blksize; o[7] = st->st_ino; o[8] = st->st_size; o[9] = st->st_blocks;
#ifdef __APPLE__
  o[10] = st->st_atimespec.tv_sec; o[11] = st->st_atimespec.tv_nsec;
  o[12] = st->st_mtimespec.tv_sec; o[13] = st->st_mtimespec.tv_nsec;
  o[14] = st->st_ctimespec.tv_sec; o[15] = st->st_ctimespec.tv_nsec;
  o[16] = st->st_birthtimespec.tv_sec; o[17] = st->st_birthtimespec.tv_nsec;
#else
  o[10] = st->st_atim.tv_sec; o[11] = st->st_atim.tv_nsec;
  o[12] = st->st_mtim.tv_sec; o[13] = st->st_mtim.tv_nsec;
  o[14] = st->st_ctim.tv_sec; o[15] = st->st_ctim.tv_nsec;
  o[16] = st->st_ctim.tv_sec; o[17] = st->st_ctim.tv_nsec;
#endif
}

static i64 porf_fs_write_all(i32 fd, const u8 *buf, size_t len) {
  size_t done = 0;
  while (done < len) {
    const ssize_t n = write(fd, buf + done, len - done);
    if (n < 0) {
      if (errno == EINTR) continue;
      return -1;
    }
    done += n;
  }
  return (i64)done;
}

static i32 porf_fs_copy(const char *from, const char *to, i32 excl) {
  const i32 in = open(from, O_RDONLY | O_CLOEXEC);
  if (in < 0) return errno;
  struct stat st, dst;
  i32 err = 0, out = -1;
  if (fstat(in, &st) != 0) err = errno;
    else if (S_ISDIR(st.st_mode)) err = EISDIR;
    else if ((out = open(to, O_WRONLY | O_CREAT | O_CLOEXEC | (excl ? O_EXCL : 0), st.st_mode & 07777)) < 0) err = errno;
    else if (fstat(out, &dst) != 0) err = errno;
    else if (dst.st_dev == st.st_dev && dst.st_ino == st.st_ino) goto done;
    else if (ftruncate(out, 0) != 0 || fchmod(out, st.st_mode & 07777) != 0) err = errno;
  if (!err) {
    char buf[65536];
    for (;;) {
      const ssize_t n = read(in, buf, sizeof(buf));
      if (n == 0) break;
      if (n < 0 || porf_fs_write_all(out, (u8*)buf, n) < 0) {
        err = errno;
        break;
      }
    }
  }
done:
  close(in);
  if (out >= 0 && close(out) != 0 && !err) err = errno;
  return err;
}

// the first directory made goes in data, none when it all existed
static i32 porf_fs_mkdirp(porf_fs_op *o) {
  char *path = o->path;
  struct stat st;
  if (stat(path, &st) == 0) return S_ISDIR(st.st_mode) ? 0 : EEXIST;
  if (!*path) return ENOENT;
  for (char *p = path + 1;; p++) {
    if (*p != '/' && *p) continue;
    const char c = *p;
    *p = 0;
    if (mkdir(path, (mode_t)o->mode) == 0) {
      if (!o->data) {
        o->data_len = strlen(path);
        memcpy(o->data = malloc(o->data_len), path, o->data_len);
      }
    } else if (errno != EEXIST) {
      *p = c;
      return errno == ENOENT && stat(path, &st) == 0 && !S_ISDIR(st.st_mode) ? ENOTDIR : errno;
    } else if (stat(path, &st) == 0 && !S_ISDIR(st.st_mode)) {
      *p = c;
      return c ? ENOTDIR : EEXIST;
    }
    *p = c;
    if (!c) return 0;
  }
}

// entries as <u8 type><name>\\0, type being the S_IF* bits >> 12
static i32 porf_fs_readdir(porf_fs_op *o) {
  DIR *d = opendir(o->path);
  if (!d) return errno;
  size_t cap = 1024, len = 0;
  char *out = malloc(cap);
  struct dirent *e;
  for (;;) {
    errno = 0;
    if (!(e = readdir(d))) break;
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
    u8 type = e->d_type;
    struct stat st;
    if (type == DT_UNKNOWN && fstatat(dirfd(d), e->d_name, &st, AT_SYMLINK_NOFOLLOW) == 0) type = (st.st_mode & S_IFMT) >> 12;
    const size_t n = strlen(e->d_name);
    if (len + n + 2 > cap) out = realloc(out, cap = (cap + n + 2) * 2);
    out[len] = type;
    memcpy(out + len + 1, e->d_name, n + 1);
    len += n + 2;
  }
  const i32 err = errno;
  closedir(d);
  o->data = out;
  o->data_len = len;
  return err;
}

static void porf_fs_time(f64 t, struct timespec *ts) {
  const f64 s = floor(t);
  ts->tv_sec = (time_t)s;
  ts->tv_nsec = (long)((t - s) * 1e9);
}

static void porf_fs_run(void *arg) {
  porf_fs_op *o = arg;
  i64 r = 0;
  i32 err = 0;
  struct stat st;
  switch (o->kind) {
    case PORF_FS_OPEN: r = open(o->path, o->flags | O_CLOEXEC, (mode_t)o->mode); break;
    case PORF_FS_CLOSE: r = close(o->fd); break;
    case PORF_FS_READ:
      do r = o->pos >= 0 ? pread(o->fd, o->buf, o->len, o->pos) : read(o->fd, o->buf, o->len);
      while (r < 0 && errno == EINTR);
      break;
    case PORF_FS_WRITE:
      do r = o->pos >= 0 ? pwrite(o->fd, o->buf, o->len, o->pos) : write(o->fd, o->buf, o->len);
      while (r < 0 && errno == EINTR);
      break;
    case PORF_FS_STAT: case PORF_FS_LSTAT: case PORF_FS_FSTAT:
      r = o->kind == PORF_FS_FSTAT ? fstat(o->fd, &st) : o->kind == PORF_FS_LSTAT ? lstat(o->path, &st) : stat(o->path, &st);
      if (r == 0) porf_fs_stat_out(&st, o->stat);
      break;
    // mode becomes 1 once the file is open
    case PORF_FS_READFILE: {
      const i32 fd = o->path ? open(o->path, o->flags | O_CLOEXEC) : dup(o->fd);
      FILE *f = fd < 0 ? NULL : fdopen(fd, "rb");
      o->mode = f != NULL;
      if (!f) r = -1;
        else if (fstat(fd, &st) == 0 && (S_ISDIR(st.st_mode) || (S_ISREG(st.st_mode) && st.st_size > 2147483647))) {
          fclose(f);
          r = -1;
          errno = S_ISDIR(st.st_mode) ? EISDIR : EFBIG;
        } else {
          o->data = porf_node_slurp(f, &o->data_len);
          if (ferror(f)) r = -1;
          const i32 e = errno;
          fclose(f);
          errno = e;
        }
      break;
    }
    case PORF_FS_WRITEFILE: {
      const i32 fd = o->path ? open(o->path, o->flags | O_CLOEXEC, (mode_t)o->mode) : o->fd;
      o->mode = fd >= 0;
      if (fd < 0) {
        r = -1;
        break;
      }
      r = porf_fs_write_all(fd, o->buf, o->len);
      if (o->path) {
        const i32 e = errno;
        if (close(fd) != 0 && r >= 0) r = -1;
          else errno = e;
      }
      break;
    }
    case PORF_FS_UNLINK: r = unlink(o->path); break;
    case PORF_FS_RMDIR: r = rmdir(o->path); break;
    case PORF_FS_RM: err = porf_node_rm(o->path, o->flags); break;
    case PORF_FS_RENAME: r = rename(o->path, o->path2); break;
    case PORF_FS_SYMLINK: r = symlink(o->path, o->path2); break;
    case PORF_FS_LINK: r = link(o->path, o->path2); break;
    case PORF_FS_READLINK: {
      char buf[4096];
      const ssize_t n = readlink(o->path, buf, sizeof(buf));
      if (n < 0) r = -1;
        else memcpy(o->data = malloc(o->data_len = n), buf, n);
      break;
    }
    case PORF_FS_REALPATH:
      o->data = realpath(o->path, NULL);
      if (o->data) o->data_len = strlen(o->data);
        else r = -1;
      break;
    case PORF_FS_CHMOD: r = chmod(o->path, (mode_t)o->mode); break;
    case PORF_FS_CHOWN: r = chown(o->path, (uid_t)o->flags, (gid_t)o->mode); break;
    case PORF_FS_FCHOWN: r = fchown(o->fd, (uid_t)o->flags, (gid_t)o->mode); break;
    case PORF_FS_LCHOWN: r = lchown(o->path, (uid_t)o->flags, (gid_t)o->mode); break;
    case PORF_FS_ACCESS: r = access(o->path, o->mode); break;
    case PORF_FS_MKDIR: r = mkdir(o->path, (mode_t)o->mode); break;
    case PORF_FS_MKDIRP: err = porf_fs_mkdirp(o); break;
    case PORF_FS_MKDTEMP:
      if (mkdtemp(o->path)) memcpy(o->data = malloc(o->data_len = strlen(o->path)), o->path, o->data_len);
        else r = -1;
      break;
    case PORF_FS_READDIR: err = porf_fs_readdir(o); break;
    case PORF_FS_FSYNC: r = fsync(o->fd); break;
    case PORF_FS_COPYFILE: err = porf_fs_copy(o->path, o->path2, o->flags & 1); break;
    case PORF_FS_UTIMES: case PORF_FS_FUTIMES: {
      struct timespec ts[2];
      porf_fs_time(o->atime, &ts[0]);
      porf_fs_time(o->mtime, &ts[1]);
      r = o->kind == PORF_FS_FUTIMES ? futimens(o->fd, ts) : utimensat(AT_FDCWD, o->path, ts, 0);
      break;
    }
  }
  o->result = err ? -1 : r;
  o->err = err ? err : r < 0 ? errno : 0;
}

// a path arg: utf-8 of a string, the bytes of a buffer
static char *porf_fs_path(jsval v, f64 len) {
  if (porf_jv_type(v) == PORF_NODE_STRING || porf_jv_type(v) == PORF_NODE_BYTESTRING) return porf_node_bytes(v, NULL);
  char *out = malloc((size_t)len + 1);
  memcpy(out, porf_node_u8(v), (size_t)len);
  out[(size_t)len] = 0;
  return out;
}
`;

const OPEN = 1, CLOSE = 2, READ = 3, WRITE = 4, STAT = 5, LSTAT = 6, FSTAT = 7, READFILE = 8, WRITEFILE = 9, UNLINK = 10, RMDIR = 11, RM = 12,
  RENAME = 13, SYMLINK = 14, LINK = 15, READLINK = 16, REALPATH = 17, CHMOD = 18, CHOWN = 19, FCHOWN = 20, LCHOWN = 21, ACCESS = 22, MKDIR = 23,
  MKDIRP = 24, MKDTEMP = 25, READDIR = 26, FSYNC = 27, COPYFILE = 28, UTIMES = 29, FUTIMES = 30;

const ENOENT = 2, ENOTDIR = 20, EISDIR = 21, EINVAL = 22;

const pathLength = path => path instanceof Uint8Array ? path.byteLength : 0;

const newOp = (kind, path, path2, fd = -1, flags = 0, mode = 0) => {
  let op = 0;
  const len = pathLength(path), len2 = pathLength(path2);
  Porffor.c`{
  porf_fs_op *o = calloc(1, sizeof(porf_fs_op));
  o->kind = (i32)porf_jv_val(kind);
  o->fd = (i32)porf_jv_val(fd);
  o->flags = (i32)(i64)porf_jv_val(flags);
  o->mode = (i32)(i64)porf_jv_val(mode);
  o->pos = -1;
  if (porf_jv_type(path) != 0 && porf_jv_type(path) != 7) o->path = porf_fs_path(path, porf_jv_val(len));
  if (porf_jv_type(path2) != 0 && porf_jv_type(path2) != 7) o->path2 = porf_fs_path(path2, porf_jv_val(len2));
  op = (f64)(u64)o;
}`;
  return op;
};

const setBuffer = (op, view, pos) => {
  const len = view.byteLength;
  Porffor.c`{
  porf_fs_op *o = (porf_fs_op*)(u64)porf_jv_val(op);
  o->buf = (u8*)porf_node_u8(view);
  o->len = (i64)porf_jv_val(len);
  o->pos = (i64)porf_jv_val(pos);
}`;
  return op;
};

const setTimes = (op, atime, mtime) => {
  Porffor.c`{
  porf_fs_op *o = (porf_fs_op*)(u64)porf_jv_val(op);
  o->atime = porf_jv_val(atime);
  o->mtime = porf_jv_val(mtime);
}`;
  return op;
};

const execute = op => {
  Porffor.c`porf_fs_run((porf_fs_op*)(u64)porf_jv_val(op));`;
};

const runPointer = () => {
  let p = 0;
  Porffor.c`p = (f64)(u64)&porf_fs_run;`;
  return p;
};

const opError = op => {
  let err = 0;
  Porffor.c`err = ((porf_fs_op*)(u64)porf_jv_val(op))->err;`;
  return err;
};

const opResult = op => {
  let out = 0;
  Porffor.c`out = (f64)((porf_fs_op*)(u64)porf_jv_val(op))->result;`;
  return out;
};

const opOpened = op => {
  let out = 0;
  Porffor.c`out = ((porf_fs_op*)(u64)porf_jv_val(op))->mode;`;
  return out === 1;
};

// the op's output as [ pointer, length ], which the op stops owning
const takeData = op => {
  let p = 0, n = 0;
  Porffor.c`{
  porf_fs_op *o = (porf_fs_op*)(u64)porf_jv_val(op);
  p = (f64)(u64)o->data;
  n = (f64)o->data_len;
  o->data = NULL;
}`;
  return [ p, n ];
};

const opBytes = op => {
  const [ p, n ] = takeData(op);
  return Object.setPrototypeOf(adoptBytes(p, n), Buffer.prototype);
};

const opString = op => {
  const [ p, n ] = takeData(op);
  return adoptString(p, n);
};

const opHasData = op => {
  let out = 0;
  Porffor.c`out = ((porf_fs_op*)(u64)porf_jv_val(op))->data != NULL;`;
  return out === 1;
};

const opStats = (op, bigint) => {
  let out;
  if (bigint) {
    out = new BigInt64Array(18);
    Porffor.c`memcpy(porf_node_u8(out), ((porf_fs_op*)(u64)porf_jv_val(op))->stat, sizeof(i64) * 18);`;
  } else {
    out = new Float64Array(18);
    Porffor.c`{
  porf_fs_op *o = (porf_fs_op*)(u64)porf_jv_val(op);
  f64 *d = (f64*)porf_node_u8(out);
  for (i32 i = 0; i < 18; i++) d[i] = (f64)o->stat[i];
}`;
  }
  return statsFrom(out);
};

const free = op => {
  Porffor.c`{
  porf_fs_op *o = (porf_fs_op*)(u64)porf_jv_val(op);
  free(o->path);
  free(o->path2);
  free(o->data);
  free(o);
}`;
};

// output paths as strings, Buffers or in another encoding
const opPath = (op, encoding) => encoding == null || encoding === 'utf8' || encoding === 'utf-8' ? opString(op)
  : encoding === 'buffer' ? opBytes(op) : opBytes(op).toString(encoding);

const pathString = path => path instanceof Uint8Array ? Buffer.from(path).toString() : path;
export const uvException = (err, syscall, path, dest) => errnoError(err, syscall, pathString(path), pathString(dest));

// finish(op) gives the value, errors throw unless undone(err) says to ignore them
const settle = (op, syscall, path, dest, finish, undone) => {
  const err = opError(op);
  if (err === 0) return finish(op);
  if (undone !== undefined && undone(err)) return;
  // whole file ops fail opening or in the read or write after
  if (syscall === 'readFile' || syscall === 'writeFile') {
    if (!opOpened(op)) throw uvException(err, 'open', path);
    throw uvException(err, syscall === 'readFile' ? 'read' : 'write');
  }
  if (syscall === 'rm' && err === EISDIR) throw systemError('ERR_FS_EISDIR', 'Path is a directory', { code: 'EISDIR', message: 'is a directory', path, syscall, errno: err });
  throw uvException(err, syscall, path, dest);
};

const call = (op, cb, syscall, path, dest, finish, undone) => {
  if (cb === undefined) {
    execute(op);
    try {
      return settle(op, syscall, path, dest, finish, undone);
    } finally {
      free(op);
    }
  }

  const done = () => {
    let value, error = null;
    try {
      value = settle(op, syscall, path, dest, finish, undone);
    } catch (e) {
      error = e;
    }
    free(op);
    if (error) cb(error);
      else if (value === undefined) cb(null);
      else cb(null, value);
  };
  if (!queueWork(runPointer(), op, done)) {
    setImmediate(() => {
      execute(op);
      done();
    });
  }
};

const none = () => {};

// the op only points into view, so the callback keeps it alive
const holding = (cb, view) => cb && ((err, value) => cb(err, value, view));

const toBytes = view => view instanceof Uint8Array ? view : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

// length bytes of buffer from offset, by default the rest of it
const bufferRange = (buffer, offset, length) => {
  validateBuffer(buffer);
  offset ??= 0;
  length ??= buffer.byteLength - offset;
  if (offset < 0 || offset > buffer.byteLength) throw errOutOfRange('offset', `>= 0 && <= ${buffer.byteLength}`, offset);
  if (length < 0 || offset + length > buffer.byteLength) throw errOutOfRange('length', `>= 0 && <= ${buffer.byteLength - offset}`, length);
  return toBytes(buffer).subarray(offset, offset + length);
};

const position = pos => pos == null ? -1 : typeof pos === 'bigint' ? Number(pos) : pos;

// access and copyfile modes: 0 to 7
const smallMode = mode => {
  if (mode == null) return 0;
  validateInteger(mode, 'mode', 0, 7);
  return mode;
};

const validateOwner = (uid, gid) => {
  validateInteger(uid, 'uid', -1, 2 ** 32 - 1);
  validateInteger(gid, 'gid', -1, 2 ** 32 - 1);
};

export const access = (path, mode, cb) => {
  path = getValidatedPath(path);
  return call(newOp(ACCESS, path, undefined, -1, 0, smallMode(mode)), cb, 'access', path, undefined, none);
};

export const exists = path => {
  const op = newOp(ACCESS, path);
  execute(op);
  const err = opError(op);
  free(op);
  return err === 0;
};

export const open = (path, flags, mode, cb) => {
  path = getValidatedPath(path);
  return call(newOp(OPEN, path, undefined, -1, stringToFlags(flags), parseFileMode(mode, 'mode', 0o666)), cb, 'open', path, undefined, opResult);
};

export const close = (fd, cb) => call(newOp(CLOSE, undefined, undefined, getValidatedFd(fd)), cb, 'close', undefined, undefined, none);

// the bytes read into buffer from offset
export const read = (fd, buffer, offset, length, pos, cb) => {
  fd = getValidatedFd(fd);
  const view = bufferRange(buffer, offset, length);
  return call(setBuffer(newOp(READ, undefined, undefined, fd), view, position(pos)), holding(cb, view), 'read', undefined, undefined, opResult);
};

// a buffer or string, which takes an encoding for length, the bytes written
export const write = (fd, data, offset, length, pos, cb) => {
  fd = getValidatedFd(fd);
  const view = typeof data === 'string' ? Buffer.from(data, length ?? 'utf8') : bufferRange(data, offset, length);
  return call(setBuffer(newOp(WRITE, undefined, undefined, fd), view, position(pos)), holding(cb, view), 'write', undefined, undefined, opResult);
};

const statOp = (kind, syscall, path, fd, options, cb) => call(newOp(kind, path, undefined, fd), cb, syscall, path, undefined,
  op => opStats(op, options?.bigint), options?.throwIfNoEntry === false ? err => err === ENOENT || err === ENOTDIR : undefined);

export const stat = (path, options, cb) => statOp(STAT, 'stat', getValidatedPath(path), -1, options, cb);
export const lstat = (path, options, cb) => statOp(LSTAT, 'lstat', getValidatedPath(path), -1, options, cb);
export const fstat = (fd, options, cb) => statOp(FSTAT, 'fstat', undefined, getValidatedFd(fd), options, cb);

// undefined for any error
export const tryStat = (path, noFollow) => call(newOp(noFollow ? LSTAT : STAT, path), undefined, 'stat', path, undefined, op => opStats(op, false), () => true);

const fileOp = (kind, path, flags, mode) => typeof path === 'number' ? newOp(kind, undefined, undefined, getValidatedFd(path))
  : newOp(kind, path, undefined, -1, stringToFlags(flags), parseFileMode(mode, 'mode', 0o666));

// path is a string, Buffer or fd, utf8 reads a string
export const readFile = (path, flags, utf8, cb) => {
  if (typeof path !== 'number') path = getValidatedPath(path);
  return call(fileOp(READFILE, path, flags), cb, 'readFile', path, undefined, utf8 ? opString : opBytes);
};

export const writeFile = (path, data, flags, mode, cb) => {
  if (typeof path !== 'number') path = getValidatedPath(path);
  const view = toBytes(data);
  return call(setBuffer(fileOp(WRITEFILE, path, flags, mode), view, -1), holding(cb, view), 'writeFile', path, undefined, none);
};

export const unlink = (path, cb) => {
  path = getValidatedPath(path);
  return call(newOp(UNLINK, path), cb, 'unlink', path, undefined, none);
};

export const rmdir = (path, cb) => {
  path = getValidatedPath(path);
  return call(newOp(RMDIR, path), cb, 'rmdir', path, undefined, none);
};

export const rm = (path, recursive, force, cb) => {
  path = getValidatedPath(path);
  return call(newOp(RM, path, undefined, -1, recursive ? 1 : 0), cb, 'rm', path, undefined, none, force ? err => err === ENOENT : undefined);
};

export const rename = (from, to, cb) => {
  from = getValidatedPath(from, 'oldPath');
  to = getValidatedPath(to, 'newPath');
  return call(newOp(RENAME, from, to), cb, 'rename', from, to, none);
};

export const symlink = (target, path, cb) => {
  target = getValidatedPath(target, 'target');
  path = getValidatedPath(path);
  return call(newOp(SYMLINK, target, path), cb, 'symlink', target, path, none);
};

export const link = (from, to, cb) => {
  from = getValidatedPath(from, 'existingPath');
  to = getValidatedPath(to, 'newPath');
  return call(newOp(LINK, from, to), cb, 'link', from, to, none);
};

export const readlink = (path, encoding, cb) => {
  path = getValidatedPath(path);
  return call(newOp(READLINK, path), cb, 'readlink', path, undefined, op => opPath(op, encoding));
};

// a symlink's target, undefined for anything else
export const linkTarget = path => call(newOp(READLINK, path), undefined, 'readlink', path, undefined, opString, err => err === EINVAL);

export const realpath = (path, encoding, cb) => {
  path = getValidatedPath(path);
  return call(newOp(REALPATH, path), cb, 'realpath', path, undefined, op => opPath(op, encoding));
};

export const chmod = (path, mode, cb) => {
  path = getValidatedPath(path);
  return call(newOp(CHMOD, path, undefined, -1, 0, parseFileMode(mode, 'mode')), cb, 'chmod', path, undefined, none);
};

export const chown = (path, uid, gid, cb) => {
  path = getValidatedPath(path);
  validateOwner(uid, gid);
  return call(newOp(CHOWN, path, undefined, -1, uid, gid), cb, 'chown', path, undefined, none);
};

export const lchown = (path, uid, gid, cb) => {
  path = getValidatedPath(path);
  validateOwner(uid, gid);
  return call(newOp(LCHOWN, path, undefined, -1, uid, gid), cb, 'lchown', path, undefined, none);
};

export const fchown = (fd, uid, gid, cb) => {
  fd = getValidatedFd(fd);
  validateOwner(uid, gid);
  return call(newOp(FCHOWN, undefined, undefined, fd, uid, gid), cb, 'fchown', undefined, undefined, none);
};

// recursive gives the first directory made
export const mkdir = (path, mode, recursive, cb) => {
  path = getValidatedPath(path);
  return call(newOp(recursive ? MKDIRP : MKDIR, path, undefined, -1, 0, parseFileMode(mode, 'mode', 0o777)), cb, 'mkdir', path, undefined,
    op => recursive && opHasData(op) ? (typeof path === 'string' ? opString(op) : opBytes(op)) : undefined);
};

export const mkdtemp = (prefix, encoding, cb) => {
  prefix = getValidatedPath(prefix, 'prefix');
  const template = typeof prefix === 'string' ? prefix + 'XXXXXX' : Buffer.concat([ prefix, Buffer.from('XXXXXX') ]);
  return call(newOp(MKDTEMP, template), cb, 'mkdtemp', template, undefined, op => opPath(op, encoding));
};

// [ names, types ] with types as S_IF* bits
export const readdir = (path, encoding, cb) => {
  path = getValidatedPath(path);
  return call(newOp(READDIR, path), cb, 'scandir', path, undefined, op => {
    const data = opBytes(op), names = [], types = [];
    for (let i = 0; i < data.length;) {
      let end = i + 1;
      while (data[end] !== 0) end++;
      types.push(data[i] << 12);
      names.push(encoding === 'buffer' ? Buffer.from(data.subarray(i + 1, end)) : data.toString(encoding ?? 'utf8', i + 1, end));
      i = end + 1;
    }
    return [ names, types ];
  });
};

export const fsync = (fd, cb) => call(newOp(FSYNC, undefined, undefined, getValidatedFd(fd)), cb, 'fsync', undefined, undefined, none);

export const copyFile = (src, dest, mode, cb) => {
  src = getValidatedPath(src, 'src');
  dest = getValidatedPath(dest, 'dest');
  return call(newOp(COPYFILE, src, dest, -1, smallMode(mode)), cb, 'copyfile', src, dest, none);
};

export const utimes = (path, atime, mtime, cb) => {
  path = getValidatedPath(path);
  return call(setTimes(newOp(UTIMES, path), toUnixTimestamp(atime, 'atime'), toUnixTimestamp(mtime, 'mtime')), cb, 'utime', path, undefined, none);
};

export const futimes = (fd, atime, mtime, cb) => {
  fd = getValidatedFd(fd);
  return call(setTimes(newOp(FUTIMES, undefined, undefined, fd), toUnixTimestamp(atime, 'atime'), toUnixTimestamp(mtime, 'mtime')), cb, 'futime', undefined, undefined, none);
};
