// native helpers shared by the node builtins
Porffor.c`
#include <errno.h>
#include <fcntl.h>
#include <sys/resource.h>
#include <sys/utsname.h>

// TYPES.string, TYPES.bytestring, TYPES.array
#define PORF_NODE_STRING 67
#define PORF_NODE_BYTESTRING 195
#define PORF_NODE_ARRAY 72

extern char **environ;

// utf-8 length of a js string
static size_t porf_node_utf8_len(jsval v) {
  const u32 ptr = porf_jv_ptr(v), n = *(u32*)(MEM + ptr);
  const u8 *b = (const u8*)(MEM + ptr + 4);
  size_t len = n;
  if (porf_jv_type(v) == PORF_NODE_BYTESTRING) {
    u32 i = 0;
    for (; i + 8 <= n; i += 8) {
      u64 x;
      memcpy(&x, b + i, 8);
      len += (size_t)__builtin_popcountll(x & 0x8080808080808080ull);
    }
    for (; i < n; i++) len += b[i] >> 7;
    return len;
  }
  const u16 *w = (const u16*)b;
  for (u32 i = 0; i < n; i++) {
    // runs of ascii, four units at a time
    for (u64 x; i + 4 <= n && (memcpy(&x, w + i, 8), (x & 0xff80ff80ff80ff80ull) == 0);) i += 4;
    if (i >= n) break;
    const u32 c = w[i];
    if (c < 0x80) continue;
    if (c < 0x800) len += 1;
      else if (c < 0xdc00 && c >= 0xd800 && i + 1 < n && (w[i + 1] & 0xfc00) == 0xdc00) { len += 2; i++; }
      else len += 2;
  }
  return len;
}

// js string as utf-8 into out, whole characters while they fit, *read gets the code units used
static size_t porf_node_utf8_into(jsval v, u8 *out, size_t cap, u32 *read) {
  const u32 ptr = porf_jv_ptr(v), n = *(u32*)(MEM + ptr);
  const u8 *b = (const u8*)(MEM + ptr + 4);
  const u16 *w = porf_jv_type(v) == PORF_NODE_BYTESTRING ? NULL : (const u16*)b;
  size_t p = 0;
  u32 i = 0;
  for (; i < n; i++) {
    // runs of ascii copy straight across, a word at a time
    if (w) {
      for (u64 x; i + 4 <= n && p + 4 <= cap && (memcpy(&x, w + i, 8), (x & 0xff80ff80ff80ff80ull) == 0); i += 4, p += 4) {
        out[p] = (u8)x; out[p + 1] = (u8)(x >> 16); out[p + 2] = (u8)(x >> 32); out[p + 3] = (u8)(x >> 48);
      }
    } else {
      for (u64 x; i + 8 <= n && p + 8 <= cap && (memcpy(&x, b + i, 8), (x & 0x8080808080808080ull) == 0); i += 8, p += 8) memcpy(out + p, &x, 8);
    }
    if (i >= n) break;
    u32 c = w ? w[i] : b[i];
    if (c < 0x80) {
      if (p == cap) break;
      out[p++] = c;
      continue;
    }
    u32 units = 1;
    if (w && c >= 0xd800 && c < 0xdc00 && i + 1 < n && (w[i + 1] & 0xfc00) == 0xdc00) {
      c = 0x10000 + ((c - 0xd800) << 10) + (w[i + 1] - 0xdc00);
      units = 2;
    } else if (w && c >= 0xd800 && c < 0xe000) c = 0xfffd;
    const size_t size = c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (p + size > cap) break;
    if (size == 2) { out[p++] = 0xc0 | c >> 6; out[p++] = 0x80 | (c & 0x3f); }
      else if (size == 3) { out[p++] = 0xe0 | c >> 12; out[p++] = 0x80 | (c >> 6 & 0x3f); out[p++] = 0x80 | (c & 0x3f); }
      else { out[p++] = 0xf0 | c >> 18; out[p++] = 0x80 | (c >> 12 & 0x3f); out[p++] = 0x80 | (c >> 6 & 0x3f); out[p++] = 0x80 | (c & 0x3f); }
    i += units - 1;
  }
  if (read) *read = i;
  return p;
}

// js string -> malloc'd nul-terminated utf-8
static char *porf_node_bytes(jsval v, size_t *len) {
  const size_t cap = porf_node_utf8_len(v);
  char *out = malloc(cap + 1);
  out[porf_node_utf8_into(v, (u8*)out, cap, NULL)] = 0;
  if (len) *len = cap;
  return out;
}

// js string -> malloc'd bytes, one per code unit (latin1)
static char *porf_node_latin1(jsval v, size_t *len) {
  const u32 ptr = porf_jv_ptr(v), n = *(u32*)(MEM + ptr);
  char *out = malloc(n + 1);
  if (porf_jv_type(v) == PORF_NODE_BYTESTRING) memcpy(out, MEM + ptr + 4, n);
    else for (u32 i = 0; i < n; i++) out[i] = ((const u16*)(MEM + ptr + 4))[i];
  *len = n;
  return out;
}

// typed array data
static char *porf_node_u8(jsval v) {
  return (char*)(MEM + *(u32*)(MEM + porf_jv_ptr(v) + 4) + 4);
}

// next code point of utf-8, invalid sequences become U+FFFD
static u32 porf_node_utf8_next(const u8 *s, size_t len, size_t *i) {
  const u8 b = s[(*i)++];
  if (b < 0x80) return b;
  const i32 n = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc2 ? 1 : 0;
  if (n == 0 || b > 0xf4) return 0xfffd;

  const u8 lo = b == 0xe0 ? 0xa0 : b == 0xf0 ? 0x90 : 0x80;
  const u8 hi = b == 0xed ? 0x9f : b == 0xf4 ? 0x8f : 0xbf;
  u32 c = b & (0x3f >> n);
  for (i32 k = 0; k < n; k++) {
    if (*i >= len || s[*i] < (k == 0 ? lo : 0x80) || s[*i] > (k == 0 ? hi : 0xbf)) return 0xfffd;
    c = c << 6 | (s[(*i)++] & 0x3f);
  }
  return c;
}

static jsval porf_node_wide(u32 units, u16 **data) {
  const u32 out = porf_alloc(4 + units * 2, PORF_NODE_STRING);
  *(u32*)(MEM + out) = units;
  *data = (u16*)(MEM + out + 4);
  return porf_box((f64)out, PORF_NODE_STRING);
}

// utf-8 bytes -> js string, a bytestring when ascii
static jsval porf_node_str(const char *buf, size_t len) {
  const u8 *s = (const u8*)buf;
  size_t units = 0;
  i32 ascii = 1;
  for (size_t i = 0; i < len;) {
    if (s[i] >= 0x80) ascii = 0;
    units += porf_node_utf8_next(s, len, &i) > 0xffff ? 2 : 1;
  }
  if (ascii) return porf_bstr_of(buf, (u32)len);

  u16 *d;
  const jsval out = porf_node_wide((u32)units, &d);
  for (size_t i = 0; i < len;) {
    u32 c = porf_node_utf8_next(s, len, &i);
    if (c > 0xffff) {
      c -= 0x10000;
      *d++ = 0xd800 | c >> 10;
      *d++ = 0xdc00 | (c & 0x3ff);
    } else *d++ = c;
  }
  return out;
}

// nul-terminated utf-8 -> js string
static jsval porf_node_cstr(const char *s) {
  return porf_node_str(s, strlen(s));
}

// utf-16le bytes -> js string
static jsval porf_node_utf16le(const char *buf, size_t len) {
  u16 *d;
  const jsval out = porf_node_wide((u32)(len / 2), &d);
  memcpy(d, buf, len & ~(size_t)1);
  return out;
}

// all of a stream -> malloc'd bytes
static char *porf_node_slurp(FILE *f, size_t *len) {
  size_t cap = 65536, n = 0, got;
  char *buf = malloc(cap);
  while ((got = fread(buf + n, 1, cap - n, f)) > 0) {
    n += got;
    if (n == cap) buf = realloc(buf, cap *= 2);
  }
  *len = n;
  return buf;
}

static i32 porf_node_rm(const char *path, i32 recursive) {
  struct stat st;
  if (lstat(path, &st) != 0) return errno;
  if (!S_ISDIR(st.st_mode)) return unlink(path) != 0 ? errno : 0;
  if (!recursive) return EISDIR;

  DIR *dir = opendir(path);
  if (!dir) return errno;
  struct dirent *e;
  i32 err = 0;
  while (!err && (e = readdir(dir))) {
    if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
    char *child = malloc(strlen(path) + strlen(e->d_name) + 2);
    sprintf(child, "%s/%s", path, e->d_name);
    err = porf_node_rm(child, 1);
    free(child);
  }
  closedir(dir);
  return err ? err : rmdir(path) != 0 ? errno : 0;
}

// in the order of signalNames (internal/bytes.js)
static const i32 porf_node_signals[] = {
  SIGHUP, SIGINT, SIGQUIT, SIGILL, SIGTRAP, SIGABRT, SIGBUS, SIGFPE, SIGKILL, SIGUSR1, SIGSEGV, SIGUSR2, SIGPIPE, SIGALRM, SIGTERM,
  SIGCHLD, SIGCONT, SIGSTOP, SIGTSTP, SIGTTIN, SIGTTOU, SIGURG, SIGXCPU, SIGXFSZ, SIGVTALRM, SIGPROF, SIGWINCH, SIGIO, SIGSYS
};

// errno -> libuv's name and message
typedef struct { i32 err; const char *name, *message; } porf_node_error;
static const porf_node_error porf_node_errors[] = {
  { EPERM, "EPERM", "operation not permitted" },
  { ENOENT, "ENOENT", "no such file or directory" },
  { ESRCH, "ESRCH", "no such process" },
  { EINTR, "EINTR", "interrupted system call" },
  { EIO, "EIO", "i/o error" },
  { ENXIO, "ENXIO", "no such device or address" },
  { E2BIG, "E2BIG", "argument list too long" },
  { ENOEXEC, "ENOEXEC", "exec format error" },
  { EBADF, "EBADF", "bad file descriptor" },
  { ENOMEM, "ENOMEM", "not enough memory" },
  { EACCES, "EACCES", "permission denied" },
  { EFAULT, "EFAULT", "bad address in system call argument" },
  { EBUSY, "EBUSY", "resource busy or locked" },
  { EEXIST, "EEXIST", "file already exists" },
  { EXDEV, "EXDEV", "cross-device link not permitted" },
  { ENODEV, "ENODEV", "no such device" },
  { ENOTDIR, "ENOTDIR", "not a directory" },
  { EISDIR, "EISDIR", "illegal operation on a directory" },
  { EINVAL, "EINVAL", "invalid argument" },
  { ENFILE, "ENFILE", "file table overflow" },
  { EMFILE, "EMFILE", "too many open files" },
  { ENOTTY, "ENOTTY", "inappropriate ioctl for device" },
  { ETXTBSY, "ETXTBSY", "text file is busy" },
  { EFBIG, "EFBIG", "file too large" },
  { ENOSPC, "ENOSPC", "no space left on device" },
  { ESPIPE, "ESPIPE", "invalid seek" },
  { EROFS, "EROFS", "read-only file system" },
  { EMLINK, "EMLINK", "too many links" },
  { EPIPE, "EPIPE", "broken pipe" },
  { ERANGE, "ERANGE", "result too large" },
  { EAGAIN, "EAGAIN", "resource temporarily unavailable" },
  { EALREADY, "EALREADY", "connection already in progress" },
  { ENOTSOCK, "ENOTSOCK", "socket operation on non-socket" },
  { EDESTADDRREQ, "EDESTADDRREQ", "destination address required" },
  { EMSGSIZE, "EMSGSIZE", "message too long" },
  { EPROTOTYPE, "EPROTOTYPE", "protocol wrong type for socket" },
  { ENOPROTOOPT, "ENOPROTOOPT", "protocol not available" },
  { EPROTONOSUPPORT, "EPROTONOSUPPORT", "protocol not supported" },
  { ESOCKTNOSUPPORT, "ESOCKTNOSUPPORT", "socket type not supported" },
  { ENOTSUP, "ENOTSUP", "operation not supported on socket" },
  { EAFNOSUPPORT, "EAFNOSUPPORT", "address family not supported" },
  { EADDRINUSE, "EADDRINUSE", "address already in use" },
  { EADDRNOTAVAIL, "EADDRNOTAVAIL", "address not available" },
  { ENETDOWN, "ENETDOWN", "network is down" },
  { ENETUNREACH, "ENETUNREACH", "network is unreachable" },
  { ECONNABORTED, "ECONNABORTED", "software caused connection abort" },
  { ECONNRESET, "ECONNRESET", "connection reset by peer" },
  { ENOBUFS, "ENOBUFS", "no buffer space available" },
  { EISCONN, "EISCONN", "socket is already connected" },
  { ENOTCONN, "ENOTCONN", "socket is not connected" },
  { ESHUTDOWN, "ESHUTDOWN", "cannot send after transport endpoint shutdown" },
  { ETIMEDOUT, "ETIMEDOUT", "connection timed out" },
  { ECONNREFUSED, "ECONNREFUSED", "connection refused" },
  { ELOOP, "ELOOP", "too many symbolic links encountered" },
  { ENAMETOOLONG, "ENAMETOOLONG", "name too long" },
  { EHOSTDOWN, "EHOSTDOWN", "host is down" },
  { EHOSTUNREACH, "EHOSTUNREACH", "host is unreachable" },
  { ENOTEMPTY, "ENOTEMPTY", "directory not empty" },
  { ENOSYS, "ENOSYS", "function not implemented" },
  { EOVERFLOW, "EOVERFLOW", "value too large for defined data type" },
  { ECANCELED, "ECANCELED", "operation canceled" },
  { EILSEQ, "EILSEQ", "illegal byte sequence" },
  { ENODATA, "ENODATA", "no data available" },
  { EPROTO, "EPROTO", "protocol error" }
};

static const porf_node_error *porf_node_errinfo(i32 err) {
  static const porf_node_error unknown = { 0, "UNKNOWN", "unknown error" };
  for (u32 i = 0; i < sizeof(porf_node_errors) / sizeof(porf_node_errors[0]); i++) {
    if (porf_node_errors[i].err == err) return &porf_node_errors[i];
  }
  return &unknown;
}
`;
