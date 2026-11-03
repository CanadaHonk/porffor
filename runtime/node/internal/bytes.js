import '../c-helpers.js';

const copyFree = (view, p, n) => {
  Porffor.c`memcpy(porf_node_u8(view), (char*)(u64)porf_jv_val(p), (size_t)porf_jv_val(n)); free((void*)(u64)porf_jv_val(p));`;
};

// malloc'd bytes (from c) -> new Uint8Array, freeing them
export const adoptBytes = (p, n) => {
  const out = new Uint8Array(n);
  copyFree(out, p, n);
  return out;
};

// malloc'd utf-8 (from c) -> js string, freeing it
export const adoptString = (p, n) => {
  let out;
  Porffor.c`out = porf_node_str((char*)(u64)porf_jv_val(p), (size_t)porf_jv_val(n)); free((void*)(u64)porf_jv_val(p));`;
  return out;
};

export const encodeUtf8 = s => {
  let n = 0;
  Porffor.c`n = porf_node_utf8_len(s);`;
  const out = new Uint8Array(n);
  Porffor.c`porf_node_utf8_into(s, (u8*)porf_node_u8(out), (size_t)n, NULL);`;
  return out;
};

export const concatBytes = chunks => {
  let length = 0;
  for (const chunk of chunks) length += chunk.byteLength;
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
};

export const encodeLatin1 = s => {
  let p = 0, n = 0;
  Porffor.c`{
  size_t len;
  p = (f64)(u64)porf_node_latin1(s, &len);
  n = len;
}`;
  return adoptBytes(p, n);
};

export const utf8Length = s => {
  let n = 0;
  Porffor.c`n = porf_node_utf8_len(s);`;
  return n;
};

export const decodeUtf8 = (view, start, end) => {
  let out;
  Porffor.c`out = porf_node_str(porf_node_u8(view) + (size_t)porf_jv_val(start), (size_t)(porf_jv_val(end) - porf_jv_val(start)));`;
  return out;
};

// the utf-16 length utf-8 bytes decode to
export const utf8DecodedLength = (view, start, end) => {
  let out = 0;
  Porffor.c`{
  const u8 *s = (const u8*)porf_node_u8(view) + (size_t)porf_jv_val(start);
  const size_t n = (size_t)(porf_jv_val(end) - porf_jv_val(start));
  f64 units = 0;
  for (size_t i = 0; i < n;) units += porf_node_utf8_next(s, n, &i) > 0xffff ? 2 : 1;
  out = units;
}`;
  return out;
};

export const decodeLatin1 = (view, start, end) => {
  let out;
  Porffor.c`out = porf_bstr_of(porf_node_u8(view) + (size_t)porf_jv_val(start), (u32)(porf_jv_val(end) - porf_jv_val(start)));`;
  return out;
};

export const decodeAscii = (view, start, end) => {
  let out;
  Porffor.c`{
  const size_t n = (size_t)(porf_jv_val(end) - porf_jv_val(start));
  char *tmp = malloc(n + 1);
  const char *src = porf_node_u8(view) + (size_t)porf_jv_val(start);
  for (size_t i = 0; i < n; i++) tmp[i] = src[i] & 0x7f;
  out = porf_bstr_of(tmp, (u32)n);
  free(tmp);
}`;
  return out;
};

export const decodeUtf16le = (view, start, end) => {
  let out;
  Porffor.c`out = porf_node_utf16le(porf_node_u8(view) + (size_t)porf_jv_val(start), (size_t)(porf_jv_val(end) - porf_jv_val(start)));`;
  return out;
};

// node's normalizeEncoding: undefined when unknown
export const normalizeEncoding = enc => {
  if (enc == null || enc === 'utf8' || enc === 'utf-8') return 'utf8';
  if (typeof enc !== 'string') return;
  switch (enc.toLowerCase()) {
    case 'utf8': case 'utf-8': case '': return 'utf8';
    case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': return 'utf16le';
    case 'latin1': case 'binary': return 'latin1';
    case 'base64': return 'base64';
    case 'base64url': return 'base64url';
    case 'hex': return 'hex';
    case 'ascii': return 'ascii';
  }
};

export const isUtf8Bytes = (view, length) => {
  let out = 1;
  Porffor.c`{
  const u8 *s = (const u8*)porf_node_u8(view);
  const size_t n = (size_t)porf_jv_val(length);
  for (size_t i = 0; i < n;) {
    const u8 b = s[i];
    if (b < 0x80) {
      i++;
      continue;
    }
    if (porf_node_utf8_next(s, n, &i) == 0xfffd && !(i >= 3 && s[i - 3] == 0xef && s[i - 2] == 0xbf && s[i - 1] == 0xbd)) {
      out = 0;
      break;
    }
  }
}`;
  return out === 1;
};

const writeNative = (fd, data, bytes, len) => {
  let err = 0;
  Porffor.c`{
  size_t n = (size_t)porf_jv_val(len);
  char *s = porf_jv_val(bytes) ? NULL : porf_node_bytes(data, &n);
  const char *p = s ? s : porf_node_u8(data);
  const i32 f = (i32)porf_jv_val(fd);
  // stdio fds go through the FILE so writes stay ordered with console output
  FILE *file = f == 1 ? stdout : f == 2 ? stderr : NULL;
  if (file) {
    if (fwrite(p, 1, n, file) != n) err = errno;
    fflush(file);
  } else {
    for (size_t off = 0; off < n;) {
      const ssize_t w = write(f, p + off, n - off);
      if (w < 0) {
        err = errno;
        break;
      }
      off += w;
    }
  }
  free(s);
}`;
  return err;
};

// write a string (as utf-8) or byte view to an fd, returning errno
export const writeFd = (fd, data) => typeof data === 'string'
  ? writeNative(fd, data, 0, 0)
  : writeNative(fd, data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 1, data.byteLength);

// errno -> libuv's [ name, message ]
export const errnoName = err => {
  let code, message;
  Porffor.c`code = porf_node_cstr(porf_node_errinfo((i32)porf_jv_val(err))->name); message = porf_node_cstr(porf_node_errinfo((i32)porf_jv_val(err))->message);`;
  return [ code, message ];
};

// errno -> node-style system error
export const errnoError = (err, syscall, path, dest) => {
  const [ code, message ] = errnoName(err);
  const e = new Error(`${code}: ${message}, ${syscall}${path === undefined ? '' : ` '${path}'`}${dest === undefined ? '' : ` -> '${dest}'`}`);
  e.errno = -err;
  e.code = code;
  e.syscall = syscall;
  if (path !== undefined) e.path = path;
  if (dest !== undefined) e.dest = dest;
  return e;
};

export const signalNames = [
  'SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGKILL', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGALRM', 'SIGTERM',
  'SIGCHLD', 'SIGCONT', 'SIGSTOP', 'SIGTSTP', 'SIGTTIN', 'SIGTTOU', 'SIGURG', 'SIGXCPU', 'SIGXFSZ', 'SIGVTALRM', 'SIGPROF', 'SIGWINCH', 'SIGIO', 'SIGSYS'
];

export const signalNumber = name => {
  const i = signalNames.indexOf(name);
  if (i === -1) return -1;
  let out = 0;
  Porffor.c`out = porf_node_signals[(i32)porf_jv_val(i)];`;
  return out;
};

export const signalName = number => signalNames.find(name => signalNumber(name) === number) ?? null;

// a nul-terminated char* array of strings, for exec
export const cStrings = strings => {
  let arr = 0, i = 0, s;
  const count = strings.length;
  Porffor.c`arr = (f64)(u64)calloc((size_t)porf_jv_val(count) + 1, sizeof(char*));`;
  for (; i < count; i++) {
    s = String(strings[i]);
    Porffor.c`((char**)(u64)arr)[(i32)i] = porf_node_bytes(s, NULL);`;
  }
  return arr;
};

export const freeStrings = arr => {
  Porffor.c`{
  char **a = (char**)(u64)porf_jv_val(arr);
  for (char **x = a; *x; x++) free(*x);
  free(a);
}`;
};
