import {
  T, K, FX, KNames,
  N_KIND, N_TYPE, N_FX, N_A, N_B, N_C,
  FN_ASYNC, FN_GENERATOR, FN_ASYNC_GENERATOR,
  CONVERT_RANGE_KNOWN, CONVERT_SIGNED
} from './ir.js';
import { TYPES, TYPE_NAMES } from './types.js';
import { ieee754_binary64 } from './encoding.js';

// C type per IR value type
const CT = [];
CT[T.none] = 'void';
CT[T.f64] = 'f64';
CT[T.i32] = 'i32';
CT[T.u32] = 'u32';
CT[T.i64] = 'i64';
CT[T.u64] = 'u64';
CT[T.jsval] = 'jsval';
CT[T.ptr] = 'u32';

// C precedence (higher binds tighter)
const P_COMMA = 1, P_TERNARY = 3, P_LOR = 4, P_LAND = 5, P_BOR = 6, P_BXOR = 7,
  P_BAND = 8, P_EQ = 9, P_REL = 10, P_SHIFT = 11, P_ADD = 12, P_MUL = 13,
  P_UNARY = 14, P_CAST = 15, P_POSTFIX = 16, P_PRIM = 17;

const BIN_PREC = {
  '*': P_MUL, '/': P_MUL, '%': P_MUL,
  '+': P_ADD, '-': P_ADD,
  '<<': P_SHIFT, '>>': P_SHIFT,
  '<': P_REL, '<=': P_REL, '>': P_REL, '>=': P_REL,
  '==': P_EQ, '!=': P_EQ,
  '&': P_BAND, '^': P_BXOR, '|': P_BOR,
  '&&': P_LAND, '||': P_LOR
};

const cReservedNames = new Set([
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double',
  'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long',
  'register', 'restrict', 'return', 'short', 'signed', 'sizeof', 'static', 'struct',
  'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
  'asm', 'typeof', 'main',
  'i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64', 'u64', 'f32', 'f64', 'jsval',
  'NULL', 'NAN', 'INFINITY',
  'stdin', 'stdout', 'stderr', 'FILE', 'EOF',
  'printf', 'fprintf', 'putchar', 'exit', 'abort', 'atexit', 'getenv',
  'calloc', 'malloc', 'realloc', 'free', 'memcpy', 'memmove', 'memset', 'strlen',
  'log', 'read', 'write', 'close', 'signal', 'time',
  // unistd / posix
  'fork', 'sleep', 'usleep', 'sync', '_exit', 'pipe', 'dup', 'dup2', 'pause',
  'alarm', 'getpid', 'getppid', 'open', 'link', 'unlink', 'access', 'kill', 'raise',
  // stdlib
  'random', 'srandom', 'rand', 'srand', 'system', 'abs', 'labs', 'div', 'ldiv',
  'qsort', 'bsearch', 'atoi', 'atol', 'atof', 'gets', 'remove', 'rename',
  // math (libm)
  'log2', 'log10', 'log1p', 'pow', 'sqrt', 'cbrt', 'exp', 'exp2', 'expm1',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'fabs', 'floor', 'ceil', 'round', 'trunc', 'fmod', 'hypot', 'remainder',
  'clock', 'times', 'gmtime', 'localtime',
  // string.h / strings.h (index is the big one: legacy strchr alias)
  'index', 'rindex', 'bcopy', 'bzero', 'bcmp', 'ffs', 'ffsl', 'ffsll', 'fls', 'flsl', 'flsll',
  'strcasecmp', 'strncasecmp', 'strcpy', 'strncpy', 'strcat', 'strncat', 'strcmp', 'strncmp',
  'strchr', 'strrchr', 'strstr', 'strtok', 'strdup', 'strndup', 'strerror', 'strspn', 'strcspn',
  'strpbrk', 'strcoll', 'strxfrm', 'strsep', 'stpcpy', 'stpncpy', 'strnlen', 'strlcpy', 'strlcat',
  'memchr', 'memcmp', 'memccpy', 'swab',
  // stdio
  'puts', 'fputs', 'fgets', 'fgetc', 'fputc', 'getc', 'putc', 'getchar', 'scanf', 'sscanf',
  'fscanf', 'snprintf', 'sprintf', 'vsnprintf', 'vsprintf', 'vprintf', 'vfprintf', 'fopen',
  'freopen', 'fclose', 'fread', 'fwrite', 'fseek', 'fseeko', 'ftell', 'ftello', 'rewind',
  'perror', 'tmpfile', 'tmpnam', 'setbuf', 'setvbuf', 'fflush', 'ungetc', 'feof', 'ferror',
  'clearerr', 'fileno', 'fdopen', 'popen', 'pclose',
  // setjmp / errno / predefined macros
  'setjmp', 'longjmp', '_setjmp', '_longjmp', 'sigsetjmp', 'siglongjmp', 'errno',
  'bool', 'true', 'false', 'unix', 'linux',
  // stdlib
  'strtol', 'strtoul', 'strtoll', 'strtoull', 'strtod', 'strtof', 'strtold', 'mblen', 'mbtowc',
  'wctomb', 'mbstowcs', 'wcstombs', 'realpath', 'mkstemp', 'mkdtemp', 'mktemp', 'setenv',
  'unsetenv', 'putenv', 'posix_memalign', 'aligned_alloc', 'arc4random', 'valloc', 'alloca',
  // math (libm) continued
  'acosh', 'asinh', 'atanh', 'erf', 'erfc', 'tgamma', 'lgamma', 'fmax', 'fmin', 'fma', 'fdim',
  'copysign', 'nearbyint', 'rint', 'lrint', 'llrint', 'lround', 'llround', 'frexp', 'ldexp',
  'modf', 'scalbn', 'scalbln', 'ilogb', 'logb', 'nan', 'nanf', 'nextafter', 'nexttoward',
  'remquo', 'j0', 'j1', 'jn', 'y0', 'y1', 'yn', 'gamma', 'drem', 'finite', 'significand',
  // signal
  'sigaction', 'sigaddset', 'sigdelset', 'sigemptyset', 'sigfillset', 'sigismember',
  'sigprocmask', 'sigsuspend', 'sigpending', 'sigwait', 'killpg', 'psignal',
  // unistd / posix continued
  'lseek', 'chdir', 'fchdir', 'getcwd', 'isatty', 'ttyname', 'execv', 'execve', 'execvp',
  'execl', 'execlp', 'execle', 'getuid', 'geteuid', 'getgid', 'getegid', 'setuid', 'setgid',
  'seteuid', 'setegid', 'getpgrp', 'setpgid', 'setsid', 'getsid', 'truncate', 'ftruncate',
  'rmdir', 'chown', 'fchown', 'lchown', 'readlink', 'symlink', 'nice', 'crypt', 'encrypt',
  'brk', 'sbrk', 'gethostname', 'sethostname', 'getlogin', 'fsync', 'fdatasync', 'pread',
  'pwrite', 'environ', 'getopt', 'optarg', 'optind', 'opterr', 'optopt', 'confstr', 'pathconf',
  'fpathconf', 'sysconf', 'chroot', 'vfork', 'daemon', 'setgroups', 'getgroups',
  // dirent
  'opendir', 'readdir', 'closedir', 'rewinddir', 'seekdir', 'telldir', 'scandir', 'alphasort',
  'dirfd', 'fdopendir',
  // sys/mman, sys/stat, sys/wait
  'mmap', 'munmap', 'mprotect', 'madvise', 'msync', 'mlock', 'munlock', 'mlockall',
  'munlockall', 'mincore', 'shm_open', 'shm_unlink',
  'stat', 'fstat', 'lstat', 'fstatat', 'chmod', 'fchmod', 'fchmodat', 'mkdir', 'mkdirat',
  'mkfifo', 'mknod', 'umask', 'futimens', 'utimensat',
  'wait', 'waitpid', 'wait3', 'wait4',
  // time.h continued
  'mktime', 'ctime', 'asctime', 'strftime', 'strptime', 'difftime', 'timegm', 'timelocal',
  'tzset', 'daylight', 'timezone', 'tzname', 'nanosleep', 'clock_gettime', 'clock_settime',
  'clock_getres', 'ctime_r', 'asctime_r', 'gmtime_r', 'localtime_r', 'gettimeofday'
]);

const sanitizeMemo = Object.create(null);
const sanitizeUsed = Object.create(null);
export const sanitize = str => {
  const memod = sanitizeMemo[str];
  if (memod != null) return memod;

  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const ok = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) || code === 95;
    if (ok) out += String.fromCharCode(code);
      else out += '_' + code.toString(16);
  }
  if (out.length === 0) out = 'anon';
  if (out[0] >= '0' && out[0] <= '9') out = '_' + out;
  // keep prefixing: one '_' can itself collide (exit -> _exit)
  while (cReservedNames.has(out) || sanitizeUsed[out]) out = '_' + out;
  sanitizeUsed[out] = true;
  return sanitizeMemo[str] = out;
};

// jsval encoding constants (must match runtime header below)
const JV_PATTERN = 0xFFF8000000000000n;
const jvConstBits = (typeId, payload) =>
  JV_PATTERN | (BigInt(typeId & 0xFF) << 43n) | BigInt(payload >>> 0);
const JV_ZERO_BITS = jvConstBits(TYPES.number, 0);

// lz4 block format, chained-hash lazy matching (~lz4hc ratio, ~25% smaller than greedy).
// used by --compress-data to shrink the static data image in the binary
const lz4Compress = src => {
  const n = src.length;
  const out = new Uint8Array(n + ((n / 255) | 0) + 16);
  const head = new Uint32Array(1 << 16);
  const prev = new Uint32Array(n);
  const read32 = i => src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24);
  let op = 0, anchor = 0, i = 0, ins = 0, mLen = 0, mPos = 0;
  const mflimit = n - 12;

  const emitSeq = (litLen, offset, mlen) => {
    out[op++] = (Math.min(litLen, 15) << 4) | (offset === 0 ? 0 : Math.min(mlen - 4, 15));
    if (litLen >= 15) {
      let rest = litLen - 15;
      while (rest >= 255) { out[op++] = 255; rest -= 255; }
      out[op++] = rest;
    }
    for (let k = 0; k < litLen; k++) out[op++] = src[anchor + k];
    if (offset === 0) return;
    out[op++] = offset & 0xff;
    out[op++] = offset >> 8;
    if (mlen - 4 >= 15) {
      let rest = mlen - 4 - 15;
      while (rest >= 255) { out[op++] = 255; rest -= 255; }
      out[op++] = rest;
    }
  };

  const insertTo = limit => {
    while (ins < limit) {
      const h = (Math.imul(read32(ins), 2654435761) >>> 16) & 0xffff;
      prev[ins] = head[h];
      head[h] = ins + 1;
      ins++;
    }
  };

  const findMatch = at => {
    const maxLen = n - 5 - at;
    const minPos = at > 0xffff ? at - 0xffff : 0;
    let cand = head[(Math.imul(read32(at), 2654435761) >>> 16) & 0xffff] - 1;
    let depth = 64;
    mLen = 3;
    while (cand >= minPos && depth > 0) {
      depth--;
      if (src[cand + mLen] === src[at + mLen]) {
        let len = 0;
        while (len < maxLen && src[cand + len] === src[at + len]) len++;
        if (len > mLen) { mLen = len; mPos = cand; }
      }
      cand = prev[cand] - 1;
    }
  };

  while (i <= mflimit) {
    insertTo(i);
    findMatch(i);
    if (mLen < 4) { i++; continue; }
    let len = mLen, pos = mPos;
    while (i + 1 <= mflimit) { // lazy: prefer a longer match starting one byte later
      insertTo(i + 1);
      findMatch(i + 1);
      if (mLen > len) { i++; len = mLen; pos = mPos; }
        else break;
    }
    emitSeq(i - anchor, i - pos, len);
    i += len;
    anchor = i;
  }
  emitSeq(n - anchor, 0, 0);
  return { out, len: op };
};

const LZ4_DECODE = `static void porf_lz4_decode(const u8* src, u32 slen, u8* dst) {
  const u8* send = src + slen;
  while (src < send) {
    u32 token = *src++;
    u32 len = token >> 4;
    if (len == 15) { u32 b; do { b = *src++; len += b; } while (b == 255); }
    memcpy(dst, src, len); dst += len; src += len;
    if (src >= send) break;
    u32 off = src[0] | ((u32)src[1] << 8); src += 2;
    len = (token & 15) + 4;
    if (len == 19) { u32 b; do { b = *src++; len += b; } while (b == 255); }
    const u8* m = dst - off;
    while (len--) *dst++ = *m++;
  }
}

`;

const f64Lit = value => {
  if (Number.isNaN(value)) return 'NAN';
  if (value === Infinity) return 'INFINITY';
  if (value === -Infinity) return '-INFINITY';
  if (value === 0) return 1 / value === -Infinity ? '-0.0' : '0.0';

  const str = value.toString();
  if (Number.isInteger(value) && !/[eE]/.test(str)) return str.includes('.') ? str : str + '.0';

  const bytes = ieee754_binary64(value);
  let hex = '';
  for (let i = 7; i >= 0; i--) hex += bytes[i].toString(16).padStart(2, '0');
  return `porf_bits_to_f64(0x${hex}ull)`;
};

export default ({ funcs, data = [], globals = [], entry = null, prefs = {}, usedTypes = null }) => {
  const out = [];
  const emit = s => out.push(s);
  const st = 'static ';

  const funcByName = new Map();
  for (const f of funcs) if (f) funcByName.set(f.name, f);
  const funcOf = ref => typeof ref === 'number' ? funcs[ref] : funcByName.get(ref);
  const fnSym = f => `p${f.index}_${sanitize(String(f.name))}`;
  const nativeFetchFuncSym = name => {
    const f = funcByName.get(name);
    if (!f) throw new Error(`missing native fetch function ${name}`);
    return fnSym(f);
  };

  // flags are derived here (only consumer), no stored func.flags. coroFlags = FN_* kind, fnFlags byte:
  // bits 0-2 coroutine kind, 3 callable (has return type), 4 constructor, 5 generator init suspension
  const nodeUsesCoro = node => {
    if (!Array.isArray(node)) return false;

    if (typeof node[0] === 'number' && KNames[node[0]] !== undefined && node.length === 6) {
      if (node[N_KIND] === K.Await || node[N_KIND] === K.Yield) return true;

      return nodeUsesCoro(node[N_A]) || nodeUsesCoro(node[N_B]) || nodeUsesCoro(node[N_C]);
    }

    return node.some(nodeUsesCoro);
  };

  const FN_CORO_INIT = 1 << 5;
  const coroKind = f => f?.async && f?.generator ? FN_ASYNC_GENERATOR : (f?.async ? FN_ASYNC : 0) | (f?.generator ? FN_GENERATOR : 0);
  const coroFlags = f => coroKind(f) | (f?.coroInit ? FN_CORO_INIT : 0);
  const isCoro = f => !!(f && (f.async || f.generator));
  const needsCoro = f => !!(f && (f.generator || (f.async && nodeUsesCoro(f.body))));
  const isSyncAsync = f => !!(f && f.async && !f.generator && !needsCoro(f));
  const fnFlags = f => f ? (coroFlags(f) | (f.returnType != null ? 1 << 3 : 0) | (f.constr ? 1 << 4 : 0)) : 0;
  const jsArg = n => n[N_TYPE] === T.jsval ? rx(n, P_COMMA) : `porf_box_num(${rx(n, P_COMMA)})`;
  const packArg = n => `porf_pack(${jsArg(n)})`;

  let usesMath = false;
  let usesCoro = false;
  let usesSyncAsync = false;
  const usesThreads = funcs.some(f => f?.name?.startsWith('__Porffor_threads_'));
  const gcEnabled = prefs.gc !== false;
  for (const f of funcs) {
    if (needsCoro(f) || nodeUsesCoro(f?.body)) usesCoro = true;
    if (isSyncAsync(f)) usesSyncAsync = true;
  }

  // static data segments are copied into the arena below the heap at init, DataRef(i) is a constant offset
  const dataOffsets = [];
  const fnNameSegs = [];
  const fnNameOff = [];
  {
    let off = 16; // 0 reserved (null), small pad
    for (let i = 0; i < data.length; i++) {
      dataOffsets.push(off);
      off += (data[i].length + 7) & ~7;
    }
    // Function.prototype.name strings after the data segments: #internal -> "", builtin
    // __ns_member -> member, empty names reuse offset 0 (0-length bytestring in the null region)
    for (const f of funcs) {
      if (!f) { fnNameOff.push(0); continue; }
      let name = f.jsName ?? f.name;
      if (name.startsWith('#')) name = '';
      if (name.startsWith('__')) name = name.split('_').pop();
      if (name.length === 0) { fnNameOff.push(0); continue; }
      const bytes = [ name.length & 0xff, (name.length >>> 8) & 0xff, (name.length >>> 16) & 0xff, (name.length >>> 24) & 0xff ];
      for (let k = 0; k < name.length; k++) bytes.push(name.charCodeAt(k) & 0xff);
      fnNameOff.push(off);
      fnNameSegs.push({ off, bytes });
      off += (bytes.length + 7) & ~7;
    }
    dataOffsets.staticEnd = off;
  }

  let depth = 1;
  const ind = () => '  '.repeat(depth);

  // break/continue lower to plain C when targeting the innermost breakable, else goto,
  // labels are only emitted when goto'd
  const loopStack = [];
  const breakStack = [];
  let activeTryDepth = 0;
  let usedLabels = new Set();

  const paren = (s, p, need) => p < need ? `(${s})` : s;

  const isNode = node => Array.isArray(node) && typeof node[0] === 'number' &&
    KNames[node[0]] !== undefined && node.length === 6;

  // a naked break here would bind to the enclosing C construct (loops/switches rebind it: don't descend)
  const hasNakedBreak = node => {
    if (!Array.isArray(node)) return false;
    if (isNode(node)) {
      const k = node[N_KIND];
      if (k === K.Break) return !node[N_A];
      if (k === K.Loop || k === K.Switch || k === K.TypeSwitch) return false;
      return hasNakedBreak(node[N_A]) || hasNakedBreak(node[N_B]) || hasNakedBreak(node[N_C]);
    }
    return node.some(hasNakedBreak);
  };

  const hasRawC = node => {
    if (!Array.isArray(node)) return false;
    if (isNode(node)) {
      if (node[N_KIND] === K.RawC) return true;
      return hasRawC(node[N_A]) || hasRawC(node[N_B]) || hasRawC(node[N_C]);
    }
    return node.some(hasRawC);
  };

  // code after these in a list is unreachable
  const TERMINATOR_KINDS = new Set([ K.Return, K.Throw, K.ThrowNew, K.Unreachable, K.Break, K.Continue ]);

  const renderExpr = node => {
    switch (node[N_KIND]) {
      case K.Const: {
        const t = node[N_TYPE], v = node[N_A];
        if (t === T.jsval) return [`porf_box_num(${f64Lit(v)})`, P_POSTFIX]; // number jsval = its f64 bits
        if (t === T.f64) return [f64Lit(v), v < 0 ? P_UNARY : P_PRIM];
        if (t === T.i64) return [`${v}ll`, v < 0 ? P_UNARY : P_PRIM];
        if (t === T.u64) return [`${v}ull`, P_PRIM];
        if (t === T.u32 || t === T.ptr) return [`${v >>> 0}u`, P_PRIM];
        return [String(v | 0), v < 0 ? P_UNARY : P_PRIM];
      }

      case K.JvConst:
        return [`porf_box((f64)${node[N_B] >>> 0}u, ${node[N_A]})`, P_POSTFIX];

      case K.DataRef:
        return [`${dataOffsets[node[N_A]]}u`, P_PRIM];

      case K.Local:
      case K.Global:
        return [sanitize(node[N_A]), P_PRIM];

      case K.Bin: {
        const op = node[N_A], t = node[N_B][N_TYPE] === T.none ? node[N_TYPE] : node[N_B][N_TYPE];
        // special spellings
        if (op === 'rotl' || op === 'rotr') {
          const fn = (t === T.i64 || t === T.u64) ? `porf_${op}64` : `porf_${op}32`;
          return [`${fn}(${rx(node[N_B], P_COMMA)}, ${rx(node[N_C], P_COMMA)})`, P_POSTFIX];
        }
        if (op === 'min' || op === 'max' || op === 'copysign') {
          usesMath = true;
          const fn = op === 'copysign' ? 'copysign' : `porf_f64_${op}`;
          return [`${fn}(${rx(node[N_B], P_COMMA)}, ${rx(node[N_C], P_COMMA)})`, P_POSTFIX];
        }
        if (op === '%' && t === T.f64) {
          usesMath = true;
          return [`fmod(${rx(node[N_B], P_COMMA)}, ${rx(node[N_C], P_COMMA)})`, P_POSTFIX];
        }
        if ((op === '==' || op === '!=') && (node[N_B][N_TYPE] === T.jsval || node[N_C][N_TYPE] === T.jsval)) {
          const eq = `porf_jv_eq(${rx(node[N_B], P_COMMA)}, ${rx(node[N_C], P_COMMA)})`;
          return [op === '==' ? eq : `!${eq}`, op === '==' ? P_POSTFIX : P_UNARY];
        }
        const prec = BIN_PREC[op];
        const ct = CT[node[N_B][N_TYPE]] ?? CT[node[N_TYPE]];
        let l = rx(node[N_B], prec);
        let r = rx(node[N_C], prec + 1);
        if (op === '<<' || op === '>>') {
          if (node[N_B][N_KIND] === K.Bin && BIN_PREC[node[N_B][N_A]] === P_ADD) l = `(${l})`;
          if (node[N_C][N_KIND] === K.Bin && BIN_PREC[node[N_C][N_A]] === P_ADD) r = `(${r})`;
        }
        // shifts: C UB on overshift; IR guarantees masked shift via codegen
        return [`${l} ${op} ${r}`, prec];
      }

      case K.Un: {
        const op = node[N_A], v = node[N_B];
        switch (op) {
          case 'neg': return [`-${rx(v, P_UNARY)}`, P_UNARY];
          case '!': return [`!${rx(v, P_UNARY)}`, P_UNARY];
          case '~': return [`~${rx(v, P_UNARY)}`, P_UNARY];
          case 'abs': usesMath = true; return [`fabs(${rx(v, P_COMMA)})`, P_POSTFIX];
          case 'floor': case 'ceil': case 'trunc': case 'sqrt':
            usesMath = true; return [`${op}(${rx(v, P_COMMA)})`, P_POSTFIX];
          case 'nearest': usesMath = true; return [`porf_nearest(${rx(v, P_COMMA)})`, P_POSTFIX];
          case 'clz': return [`porf_clz32(${rx(v, P_COMMA)})`, P_POSTFIX];
          case 'ctz': return [`porf_ctz32(${rx(v, P_COMMA)})`, P_POSTFIX];
          case 'popcnt': return [`__builtin_popcount(${rx(v, P_COMMA)})`, P_POSTFIX];
        }
        throw new Error(`render: unknown unary op ${op}`);
      }

      case K.Select:
        return [`${rx(node[N_A], P_LOR)} ? ${rx(node[N_B], P_TERNARY)} : ${rx(node[N_C], P_TERNARY)}`, P_TERNARY];

      case K.Convert: {
        const to = node[N_TYPE], from = node[N_A], v = node[N_B], flags = node[N_C];
        // f64 -> int without range knowledge: saturate (JS ToInt semantics live above this)
        if (from === T.f64 && (to === T.i32 || to === T.u32 || to === T.ptr) && !(flags & CONVERT_RANGE_KNOWN)) {
          return [`${to === T.i32 ? 'porf_f64_to_i32' : 'porf_f64_to_u32'}(${rx(v, P_COMMA)})`, P_POSTFIX];
        }
        if (to === T.f64 && (from === T.u32 || from === T.ptr) && !(flags & CONVERT_SIGNED)) {
          return [`(f64)${rx(v, P_CAST)}`, P_CAST];
        }
        return [`(${CT[to]})${rx(v, P_CAST)}`, P_CAST];
      }

      case K.Reinterpret:
        if (node[N_B] === 'bitsToF32') return [`porf_bits_to_f32(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];
        if (node[N_B] === 'f32ToBits') return [`porf_f32_to_bits(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];
        return [node[N_TYPE] === T.f64
          ? `porf_bits_to_f64(${rx(node[N_A], P_COMMA)})`
          : `porf_f64_to_bits(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];

      case K.Canon:
        return [`porf_canon(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];

      case K.Box: {
        const v = node[N_A], tExpr = node[N_B];
        const payload = v[N_TYPE] === T.jsval ? `(${rx(v, P_POSTFIX)}.val)` : rx(v, P_COMMA);
        if (tExpr[N_KIND] === K.Const) {
          const tid = tExpr[N_A];
          if (tid === TYPES.number) return [`porf_box_num(${payload})`, P_POSTFIX];
          return [`porf_box(${payload}, ${tid})`, P_POSTFIX];
        }
        return [`porf_box(${payload}, ${rx(tExpr, P_COMMA)})`, P_POSTFIX];
      }
      case K.JvType: return [`porf_jv_type(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];
      case K.JvNum: return [`(${rx(node[N_A], P_POSTFIX)}.val)`, P_POSTFIX];
      case K.JvPtr: return [`(u32)${rx(node[N_A], P_POSTFIX)}.val`, P_CAST];
      case K.JvBits: return [`porf_pack(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];
      case K.JvFromBits: return [`porf_unpack(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];
      case K.JvIsNum: return [`porf_jv_is_num(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];
      case K.Eq: return [`${node[N_A] ? 'porf_strict_eq' : 'porf_loose_eq'}(${jsArg(node[N_B])}, ${jsArg(node[N_C])})`, P_POSTFIX];
      case K.Add: return [`porf_add(${jsArg(node[N_A])}, ${jsArg(node[N_B])})`, P_POSTFIX];
      case K.Cmp: return [`porf_cmp(${jsArg(node[N_A])}, ${jsArg(node[N_B])})`, P_POSTFIX];
      case K.JvTruthy: return [`porf_truthy(${jsArg(node[N_A])})`, P_POSTFIX];
      case K.JvFalsy: return [`porf_falsy(${jsArg(node[N_A])})`, P_POSTFIX];
      case K.JvNullish: return [`porf_nullish(${jsArg(node[N_A])})`, P_POSTFIX];

      case K.Load: {
        const ctype = node[N_A];
        const [off, unaligned] = node[N_C];
        const addr = `MEM + ${rx(node[N_B], P_ADD)}${off ? ` + ${off}u` : ''}`;
        if (unaligned) {
          // signed unaligned: load unsigned width, cast (u8/i8 are always aligned)
          if (ctype === 'i16') return [`(int16_t)porf_load_un_u16(${addr})`, P_CAST];
          if (ctype === 'i32') return [`(i32)porf_load_un_u32(${addr})`, P_CAST];
          if (ctype === 'i64') return [`(i64)porf_load_un_u64(${addr})`, P_CAST];
          if (ctype === 'jsval') return [`porf_unpack(porf_load_un_u64(${addr}))`, P_POSTFIX];
          return [`porf_load_un_${ctype}(${addr})`, P_POSTFIX];
        }
        if (ctype === 'jsval') return [`porf_unpack(*(jsbits*)(${addr}))`, P_POSTFIX];
        return [`*(${ctype === 'i8' ? 'int8_t' : ctype === 'i16' ? 'int16_t' : ctype}*)(${addr})`, P_UNARY];
      }

      case K.Call: {
        const f = funcOf(node[N_A]);
        // direct call to a coroutine starts it instead of running the body: split args into the invocation shape
        if (f && isCoro(f)) {
          let callee = 'JV_UNDEFINED', env = '0', thisv = 'JV_UNDEFINED', newtv = 'JV_UNDEFINED';
          const rawArgv = Array.isArray(node[N_C]) ? node[N_C] : null;
          const argv = rawArgv ?? [];
          node[N_B].forEach((a, i) => {
            const s = rx(a, P_COMMA), pn = f.params[i]?.name;
            if (pn === '#callee') callee = s;
            else if (pn === '#env') env = s;
            else if (pn === '#this') thisv = s;
            else if (pn === '#newtarget') newtv = s;
            else if (!rawArgv) argv.push(a);
          });
          const argvArr = argv.length ? `(jsbits[]){ ${argv.map(a => packArg(a)).join(', ')} }` : '(jsbits[]){JV_UNDEFINED_BITS}';
          return [needsCoro(f)
            ? `porf_coro_start(${coroFlags(f)}u, ${f.index}u, ${callee}, ${env}, ${thisv}, ${newtv}, ${argv.length}, ${argvArr})`
            : `porf_async_call_sync(${f.index}u, ${callee}, ${env}, ${thisv}, ${newtv}, ${argv.length}, ${argvArr})`, P_POSTFIX];
        }
        const name = f ? fnSym(f) : sanitize(String(node[N_A]));
        const args = node[N_B].map(a => rx(a, P_COMMA)).join(', ');
        return [`${name}(${args})`, P_POSTFIX];
      }

      case K.CallDynamic: {
        const [args, newTarget, spreadArr] = node[N_C];
        const newt = newTarget ? rx(newTarget, P_COMMA) : 'JV_UNDEFINED';
        if (spreadArr) {
          return [`porf_call_dynamic_arr(${rx(node[N_A], P_COMMA)}, ${rx(node[N_B], P_COMMA)}, ${newt}, ${rx(spreadArr, P_COMMA)})`, P_POSTFIX];
        }
        const argv = args.length === 0 ? '(jsbits[]){JV_UNDEFINED_BITS}'
          : `(jsbits[]){ ${args.map(packArg).join(', ')} }`;
        return [`porf_call_dynamic(${rx(node[N_A], P_COMMA)}, ${rx(node[N_B], P_COMMA)}, ${newt}, ${args.length}, ${argv})`, P_POSTFIX];
      }

      case K.Await: return [`porf_await(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];
      case K.Yield: return [`porf_yield(${rx(node[N_A], P_COMMA)})`, P_POSTFIX];

      case K.Alloc: return [`porf_alloc(${rx(node[N_A], P_COMMA)}, ${node[N_B]}u)`, P_POSTFIX];

      case K.ArrGet: return [`porf_arr_get(${rx(node[N_A], P_COMMA)}, ${rx(node[N_B], P_COMMA)})`, P_POSTFIX];
      case K.LenGet: return [`*(i32*)(MEM + ${rx(node[N_A], P_ADD)})`, P_UNARY];

      default:
        throw new Error(`render: cannot render ${KNames[node[N_KIND]]} as expression`);
    }
  };

  const rx = (node, need) => {
    const [code, prec] = renderExpr(node);
    return paren(code, prec, need);
  };

  const renderStmts = stmts => {
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      renderStmt(s);
      if (s != null && isNode(s) && TERMINATOR_KINDS.has(s[N_KIND]) &&
          !stmts.slice(i + 1).some(hasRawC)) return;
    }
  };

  const renderStmt = node => {
    if (node == null) return;
    switch (node[N_KIND]) {
      case K.DeclLocal: {
        // locals hoist to function top, in-place DeclLocal becomes assignment
        const init = node[N_B];
        if (init) emit(`${ind()}${sanitize(node[N_A])} = ${rx(init, P_COMMA)};\n`);
        return;
      }

      case K.Assign:
        emit(`${ind()}${sanitize(node[N_A][N_A])} = ${rx(node[N_B], P_COMMA)};\n`);
        return;

      case K.Store: {
        const ctype = node[N_A];
        const [off, unaligned, value] = node[N_C];
        const addr = `MEM + ${rx(node[N_B], P_ADD)}${off ? ` + ${off}u` : ''}`;
        if (unaligned) {
          const un = { i16: 'u16', i32: 'u32', i64: 'u64', jsval: 'u64' }[ctype] ?? ctype;
          emit(`${ind()}porf_store_un_${un}(${addr}, ${ctype === 'jsval' ? packArg(value) : rx(value, P_COMMA)});\n`);
        } else if (ctype === 'jsval') emit(`${ind()}*(jsbits*)(${addr}) = ${packArg(value)};\n`);
          else emit(`${ind()}*(${ctype === 'i8' ? 'int8_t' : ctype === 'i16' ? 'int16_t' : ctype}*)(${addr}) = ${rx(value, P_COMMA)};\n`);
        return;
      }

      case K.MemCopy: {
        const [bytes, mayOverlap] = node[N_C];
        emit(`${ind()}${mayOverlap ? 'memmove' : 'memcpy'}(MEM + ${rx(node[N_A], P_ADD)}, MEM + ${rx(node[N_B], P_ADD)}, ${rx(bytes, P_COMMA)});\n`);
        return;
      }

      case K.MemFill:
        emit(`${ind()}memset(MEM + ${rx(node[N_A], P_ADD)}, ${rx(node[N_B], P_COMMA)}, ${rx(node[N_C], P_COMMA)});\n`);
        return;

      case K.If: {
        emit(`${ind()}if (${rx(node[N_A], P_COMMA)}) {\n`);
        depth++; renderStmts(node[N_B]); depth--;
        if (node[N_C] && node[N_C].length) {
          emit(`${ind()}} else {\n`);
          depth++; renderStmts(node[N_C]); depth--;
        }
        emit(`${ind()}}\n`);
        return;
      }

      case K.Loop: {
        const cond = node[N_A], update = node[N_B];
        const [stmts, label] = node[N_C];
        const updateC = update == null ? null
          : update[N_KIND] === K.Assign
            ? `${sanitize(update[N_A][N_A])} = ${rx(update[N_B], P_COMMA)}`
            : rx(update, P_COMMA);
        if (update) emit(`${ind()}for (; ${cond ? rx(cond, P_COMMA) : ''}; ${updateC}) {\n`);
          else if (cond) emit(`${ind()}while (${rx(cond, P_COMMA)}) {\n`);
        else emit(`${ind()}while (1) {\n`);
        loopStack.push(label);
        breakStack.push(label);
        depth++;
        renderStmts(stmts);
        if (label && usedLabels.has(label + '_c')) emit(`${ind()}${sanitize(label)}_c:;\n`);
        depth--;
        breakStack.pop();
        loopStack.pop();
        emit(`${ind()}}\n`);
        if (label && usedLabels.has(label + '_b')) emit(`${ind()}${sanitize(label)}_b:;\n`);
        return;
      }

      case K.Break:
        if (node[N_A] && node[N_A] !== breakStack[breakStack.length - 1]) {
          usedLabels.add(node[N_A] + '_b');
          emit(`${ind()}goto ${sanitize(node[N_A])}_b;\n`);
        } else emit(`${ind()}break;\n`);
        return;

      case K.Continue:
        if (node[N_A] && node[N_A] !== loopStack[loopStack.length - 1]) {
          usedLabels.add(node[N_A] + '_c');
          emit(`${ind()}goto ${sanitize(node[N_A])}_c;\n`);
        } else emit(`${ind()}continue;\n`);
        return;

      case K.Block: {
        if (node[N_A].length === 0 && !node[N_B]) return;
        emit(`${ind()}{\n`);
        depth++; renderStmts(node[N_A]); depth--;
        emit(`${ind()}}\n`);
        if (node[N_B] && usedLabels.has(node[N_B] + '_b')) emit(`${ind()}${sanitize(node[N_B])}_b:;\n`);
        return;
      }

      case K.Switch:
      case K.TypeSwitch: {
        const isType = node[N_KIND] === K.TypeSwitch;
        const subj = node[N_A];
        const kept = [];
        for (const [values, stmts, fallthrough] of node[N_B]) {
          const vals = isType && usedTypes ? values.filter(v => usedTypes.has(v)) : values;
          if (vals.length !== 0) kept.push([ vals, stmts, fallthrough ]);
        }
        const def = node[N_C] && node[N_C].length ? node[N_C] : null;

        // 0/1 surviving cases: if/else instead of switch. blocked by a naked break (must
        // bind to the switch) and re-evaluation hazards: dropping the subject needs it
        // effect-free, repeating it (multi-value condition) needs it trivial
        const subjTrivial = subj[N_KIND] === K.Local || subj[N_KIND] === K.Global || subj[N_KIND] === K.Const;
        if (kept.length <= 1 &&
            !hasNakedBreak(kept.length ? kept[0][1] : null) && !hasNakedBreak(def) &&
            (kept.length === 1
              ? kept[0][0].length === 1 || subjTrivial
              : (subj[N_FX] & (FX.call | FX.writeMem | FX.writeLocal)) === 0)) {
          if (kept.length === 0) {
            if (def) renderStmts(def);
            return;
          }
          const [ vals, stmts, fallthrough ] = kept[0];
          const subjS = () => isType && subj[N_TYPE] === T.jsval ? `porf_jv_type(${rx(subj, P_COMMA)})` : rx(subj, P_EQ + 1);
          emit(`${ind()}if (${vals.map(v => `${subjS()} == ${v}`).join(' || ')}) {\n`);
          depth++; renderStmts(stmts); depth--;
          if (def && !fallthrough) {
            emit(`${ind()}} else {\n`);
            depth++; renderStmts(def); depth--;
          }
          emit(`${ind()}}\n`);
          if (def && fallthrough) renderStmts(def);
          return;
        }

        const subjCode = isType && subj[N_TYPE] === T.jsval ? `porf_jv_type(${rx(subj, P_COMMA)})` : rx(subj, P_COMMA);
        emit(`${ind()}switch (${subjCode}) {\n`);
        breakStack.push(null);
        depth++;
        for (const [vals, stmts, fallthrough] of kept) {
          emit(ind());
          for (const v of vals) emit(`case ${v}: `);
          emit('{\n');
          depth++; renderStmts(stmts); depth--;
          emit(`${ind()}}\n`);
          if (!fallthrough) emit(`${ind()}break;\n`);
        }
        if (def) {
          emit(`${ind()}default:\n${ind()}{\n`);
          depth++; renderStmts(def); depth--;
          emit(`${ind()}}\n`);
        }
        depth--;
        breakStack.pop();
        emit(`${ind()}}\n`);
        return;
      }

      case K.Return:
        if (activeTryDepth !== 0) emit(`${ind()}porf_try_depth -= ${activeTryDepth};\n`);
        emit(node[N_A] ? `${ind()}return ${rx(node[N_A], P_COMMA)};\n` : `${ind()}return;\n`);
        return;

      case K.Unreachable:
        emit(`${ind()}porf_unreachable(${node[N_A] ? JSON.stringify(String(node[N_A])) : '0'});\n`);
        return;

      case K.Try: {
        emit(`${ind()}{\n`);
        depth++;
        emit(`${ind()}const i32 _try_idx = porf_try_depth++;\n`);
        emit(`${ind()}if (_setjmp(porf_try_stack[_try_idx]) == 0) {\n`);
        activeTryDepth++;
        depth++; renderStmts(node[N_A]);
        activeTryDepth--;
        emit(`${ind()}porf_try_depth = _try_idx;\n`);
        depth--;
        emit(`${ind()}} else {\n`);
        depth++;
        emit(`${ind()}porf_try_depth = _try_idx;\n`);
        emit(`${ind()}jsval ${sanitize(node[N_B])} = porf_exception;\n`);
        renderStmts(node[N_C]);
        depth--;
        emit(`${ind()}}\n`);
        depth--;
        emit(`${ind()}}\n`);
        return;
      }

      case K.Throw:
        emit(`${ind()}porf_throw(${rx(node[N_A], P_COMMA)});\n`);
        return;

      case K.ThrowNew:
        emit(`${ind()}porf_throw_new(${node[N_A]}, ${rx(node[N_B], P_COMMA)});\n`);
        return;

      case K.GcBarrier:
        emit(`${ind()}porf_gc_barrier(${rx(node[N_A], P_COMMA)}, ${rx(node[N_B], P_COMMA)});\n`);
        return;

      case K.ArrSet:
        emit(`${ind()}porf_arr_set(${rx(node[N_A], P_COMMA)}, ${rx(node[N_B], P_COMMA)}, ${jsArg(node[N_C])});\n`);
        return;

      case K.ArrLenSet:
        emit(`${ind()}porf_arr_set_len(${rx(node[N_A], P_COMMA)}, ${rx(node[N_B], P_COMMA)});\n`);
        return;

      case K.LenSet:
        emit(`${ind()}*(i32*)(MEM + ${rx(node[N_A], P_ADD)}) = ${rx(node[N_B], P_COMMA)};\n`);
        return;

      case K.RawC:
        emit(`${ind()}${node[N_A]}${node[N_B] ? ';' : ''}\n`);
        return;

      default: {
        if ((node[N_FX] & (FX.call | FX.writeMem | FX.writeLocal)) !== 0) {
          emit(`${ind()}${node[N_TYPE] !== T.none ? '(void)' : ''}${rx(node, P_COMMA)};\n`);
        }
        return;
      }
    }
  };

  const renderFunc = f => {
    const ret = CT[f.retType];
    const params = f.params.map(p => `${CT[p.type]} ${sanitize(p.name)}`).join(', ');
    emit(`${ret} ${fnSym(f)}(${params || 'void'}) {\n`);
    depth = 1;
    activeTryDepth = 0;
    loopStack.length = 0;
    usedLabels = new Set();
    if (needsCoro(f)) emit(`  porf_coro_prologue();\n`);
    // declare every function-scoped local at the top (params come from the signature),
    // f.locals has them all, DeclLocal nodes additionally carry in-place initialisers
    const declared = new Set();
    if (f.params) for (const p of f.params) declared.add(p.name);
    if (f.locals) for (const name in f.locals) {
      if (declared.has(name)) continue;
      declared.add(name);
      const t = f.locals[name].type;
      emit(`  ${CT[t]} ${sanitize(name)}${t === T.jsval ? ' = JV_UNDEFINED' : ' = 0'};\n`);
    }
    // catch DeclLocal-only locals missing from f.locals
    const hoistDecls = node => {
      if (!Array.isArray(node)) return;
      if (typeof node[0] === 'number' && KNames[node[0]] !== undefined && node.length === 6) {
        if (node[N_KIND] === K.DeclLocal && !declared.has(node[N_A])) {
          declared.add(node[N_A]);
          emit(`  ${CT[node[N_C]]} ${sanitize(node[N_A])}${node[N_C] === T.jsval ? ' = JV_UNDEFINED' : ' = 0'};\n`);
        }
        hoistDecls(node[N_A]); hoistDecls(node[N_B]); hoistDecls(node[N_C]);
        return;
      }
      for (const x of node) hoistDecls(x);
    };
    hoistDecls(f.body);
    renderStmts(f.body);
    emit(`}\n\n`);
  };

  const head = [];
  const toStr = funcs.find(x => x && x.name === '__ecma262_ToString' && x.body);
  head.push(RUNTIME_HEAD(dataOffsets.staticEnd, prefs, usesThreads, usesCoro, toStr ? fnSym(toStr) : null));
  if (usesCoro) head.push(CORO_RUNTIME(usesThreads));

  if (data.length > 0 || fnNameSegs.length > 0) {
    // static data is constant bytes at fixed offsets: one contiguous image (holes stay
    // zero) init'd by a single memcpy, emitted as string literals (~1 char per ascii byte)
    const imageBase = 16;
    const image = new Uint8Array(dataOffsets.staticEnd - imageBase);
    const writeBytes = (off, bytes) => {
      off -= imageBase;
      for (let k = 0; k < bytes.length; k++) image[off + k] = bytes[k];
    };
    const writeU32 = (off, v) => writeBytes(off, [ v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff ]);
    const writeU64 = (off, bits) => {
      off -= imageBase;
      for (let k = 0; k < 8; k++) image[off + k] = Number((bits >> BigInt(k * 8)) & 0xFFn);
    };

    for (const { off, bytes } of fnNameSegs) writeBytes(off, bytes);
    for (let i = 0; i < data.length; i++) {
      const seg = data[i];
      const off = dataOffsets[i];
      if (seg.staticArray) {
        const items = seg.staticArray;
        writeU32(off, items.length);
        writeU32(off + 4, off + 16);
        writeU32(off + 8, items.length);
        for (let j = 0; j < items.length; j++) {
          const it = items[j];
          const dst = off + 16 + j * 8;
          if (it.num !== undefined) {
            if (it.num === 0 && 1 / it.num === Infinity) writeU64(dst, JV_ZERO_BITS);
              else writeBytes(dst, ieee754_binary64(it.num));
          } else if (it.str !== undefined) {
            writeU64(dst, jvConstBits(TYPES.bytestring, dataOffsets[it.str]));
          } else {
            writeU64(dst, jvConstBits(it.jvType, it.payload));
          }
        }
        continue;
      }
      writeBytes(off, seg);
    }

    let blob = image, blobLen = image.length;
    let init = `static void porf_data_init(void) {\n  memcpy(MEM + ${imageBase}, porf_data, ${image.length}u);\n}\n\n`;
    if (prefs.compressData && image.length > 0) {
      const compressed = lz4Compress(image);
      if (compressed.len < image.length) {
        blob = compressed.out;
        blobLen = compressed.len;
        init = LZ4_DECODE + `static void porf_data_init(void) {\n  porf_lz4_decode(porf_data, ${blobLen}u, MEM + ${imageBase});\n}\n\n`;
      }
    }

    // printable ascii stays literal (except " \ ?, dodging trigraphs), the rest fixed-width
    // octal so a following digit can't extend the escape
    const esc = [];
    for (let b = 0; b < 256; b++) {
      esc.push(b >= 0x20 && b <= 0x7e && b !== 0x22 && b !== 0x3f && b !== 0x5c ?
        String.fromCharCode(b) : '\\' + b.toString(8).padStart(3, '0'));
    }

    const lines = [];
    let parts = [], len = 0;
    for (let i = 0; i < blobLen; i++) {
      const e = esc[blob[i]];
      parts.push(e);
      len += e.length;
      if (len >= 4000) {
        lines.push('"' + parts.join('') + '"');
        parts = [];
        len = 0;
      }
    }
    if (parts.length > 0 || lines.length === 0) lines.push('"' + parts.join('') + '"');

    head.push(`static const u8 porf_data[] =\n${lines.join('\n')};\n${init}`);
  } else {
    head.push('static void porf_data_init(void) {}\n\n');
  }

  // forward decls, tree-shaken (null) funcs get a trap wrapper instead
  for (const f of funcs) {
    if (!f) continue;
    const params = f.params.map(p => CT[p.type]).join(', ');
    head.push(`${CT[f.retType]} ${fnSym(f)}(${params || 'void'});\n`);
  }
  head.push(`${st}jsval porf_call_dynamic(jsval fn, jsval thisv, jsval newtv, i32 argc, jsbits* argv);\n`);
  head.push(`${st}jsval porf_call_dynamic_arr(jsval fn, jsval thisv, jsval newtv, jsval arr);\n`);
  if (usesSyncAsync) {
    head.push(`${st}jsval porf_async_call_sync(u32 idx, jsval callee, u32 env, jsval thisv, jsval newtv, i32 argc, jsbits* argv);\n`);
  }
  if (usesCoro) {
    // coroutine entry points called from user code / builtins above their definitions
    head.push(`${st}jsval porf_coro_start(u8 flags, u32 idx, jsval callee, u32 env, jsval thisv, jsval newtv, i32 argc, jsbits* argv);\n`);
    head.push(`${st}i32 __Porffor_coroutine_resume(jsval gen, jsval value, i32 mode);\n`);
    head.push(`${st}jsval __Porffor_coroutine_value(jsval gen);\n`);
  }

  // module globals (top-level JS bindings)
  for (const g of globals) head.push(`${st}${CT[g.type]} ${sanitize(g.name)}${g.type === T.jsval ? ` = {0.0, ${TYPES.undefined}}` : ''};\n`);
  head.push('\n');
  if (gcEnabled) {
    const markGlobalRootLines = [];
    const markGlobalRawLines = [];
    for (const g of globals) {
      const name = sanitize(g.name);
      if (g.type === T.jsval) markGlobalRootLines.push(`  porf_gc_mark_js(${name}.val, ${name}.type);`);
      else if (g.type === T.ptr || (g.type === T.i32 && /(?:underlyingStore|underlyingBuckets|__Porffor_regex_cache)$/.test(g.name))) {
        if (/underlyingStore$/.test(g.name)) {
          const buckets = sanitize(g.name.replace(/underlyingStore$/, 'underlyingBuckets'));
          const bucketsCap = sanitize(g.name.replace(/underlyingStore$/, 'underlyingBucketsCap'));
          markGlobalRawLines.push(`  porf_gc_mark_underlying_store((i32)${name});`);
          markGlobalRawLines.push(`  ${buckets} = 0;`);
          markGlobalRawLines.push(`  ${bucketsCap} = 0;`);
        }
        else if (/underlyingBuckets$/.test(g.name)) markGlobalRawLines.push(`  porf_gc_mark_raw((i32)${name});`);
        else if (/__Porffor_regex_cache$/.test(g.name)) markGlobalRawLines.push(`  porf_gc_mark_regex_cache((i32)${name});`);
        else if (/getptr_/.test(g.name)) {
          const builtinName = g.name.slice(g.name.lastIndexOf('getptr_') + 'getptr_'.length);
          markGlobalRootLines.push(`  if (${name} != 0) porf_gc_mark_js((f64)${name}, ${funcByName.has(builtinName) ? TYPES.function : TYPES.object});`);
        }
        else markGlobalRawLines.push(`  porf_gc_mark_raw((i32)${name});`);
      }
    }
    head.push(`static void porf_gc_mark_global_roots(void) {\n${markGlobalRootLines.join('\n') || '  (void)0;'}\n}\n\n`);
    head.push(`static void porf_gc_mark_global_raw_roots(void) {\n${markGlobalRawLines.join('\n') || '  (void)0;'}\n}\n\n`);
    head.push(usesCoro
      ? `static void porf_gc_mark_coro_roots(void) {\n  for (i32 i = 0; i < porf_coro_live_len; i++) {\n    porf_coro* c = porf_coro_live[i];\n    if (c) porf_coro_gc_mark_suspended(c, 0);\n  }\n  for (porf_coro* c = porf_coro_cur; c; c = c->parent) porf_coro_gc_mark_active(c);\n}\n\nstatic void porf_gc_mark_coro_handle(uintptr_t raw) {\n  porf_coro_gc_mark_handle((porf_coro_call*)raw);\n}\n\nstatic void porf_gc_finalize_body(i32 body, i32 type) {\n  if (type == ${TYPES.__porffor_generator} || type == ${TYPES.__porffor_asyncgenerator}) {\n    uintptr_t raw = *(uintptr_t*)(MEM + body);\n    *(uintptr_t*)(MEM + body) = 0;\n    porf_coro_call_free((porf_coro_call*)raw);\n  }\n}\n\n`
      : `static void porf_gc_mark_coro_roots(void) {}\nstatic void porf_gc_mark_coro_handle(uintptr_t raw) { (void)raw; }\nstatic void porf_gc_finalize_body(i32 body, i32 type) { (void)body; (void)type; }\n\n`);
    if (usesThreads) {
      head.push(`static void porf_gc_mark_thread_roots(void) {\n  pthread_mutex_lock(&porf_fiber_live_lock);\n  for (porf_fiber* f = porf_fiber_live; f != NULL; f = f->live_next) {\n    porf_gc_mark_js(f->fnv, f->fnt);\n    porf_gc_mark_js(f->argsv, f->argst);\n    porf_gc_mark_js(f->promv, f->promt);\n    porf_gc_mark_js(f->fiber_exception.val, f->fiber_exception.type);\n    if (f->fiber_try_stack && f->fiber_try_depth > 0) {\n      const i32 td = f->fiber_try_depth < f->fiber_try_cap ? f->fiber_try_depth : f->fiber_try_cap;\n      porf_gc_cons_scan_range((const u64*)f->fiber_try_stack, (const u64*)(f->fiber_try_stack + td));\n    }\n    if (f != porf_fiber_current && f->sp && f->c_stack_top) porf_gc_cons_scan_range((const u64*)f->sp, (const u64*)f->c_stack_top);\n  }\n  pthread_mutex_unlock(&porf_fiber_live_lock);\n}\n\n`);
    }
  }

  // per-function metadata tables, emitted before bodies so __Porffor_funcLut_* can read them.
  // porf_fnflags: bits 0-2 coroutine dispatch (masked off in porf_call_dynamic), bit 3 callable,
  // bit 4 constructor, funcLut.flags recovers legacy callable|constr<<1 via (flags >> 3) & 3
  head.push(`${st}const u8 porf_fnflags[] = { ${Array.from(funcs, fnFlags).join(', ') || '0'} };\n`);
  if (usesSyncAsync) head.push(`${st}const u8 porf_fnneeds_coro[] = { ${Array.from(funcs, f => needsCoro(f) ? 1 : 0).join(', ') || '0'} };\n`);
  head.push(`${st}const u16 porf_fnlen[] = { ${Array.from(funcs, f => f?.jsLength ?? 0).join(', ') || '0'} };\n`);
  head.push(`${st}const u32 porf_fnname[] = { ${fnNameOff.join(', ') || '0'} };\n`);
  head.push('\n');

  if (prefs.rawHead) head.push(prefs.rawHead + '\n');
  if (usesThreads) {
    const entryFunc = funcByName.get('__Porffor_threads_entry');
    const promiseRunOneFunc = funcByName.get('__Porffor_promise_runOne');
    if (!entryFunc) throw new Error('missing Porffor threads entry function');
    if (!promiseRunOneFunc) throw new Error('missing promise reaction runner for Porffor threads');
    const vals = [ 'fnv', 'argsv', 'promv' ];
    const types = [ 'fnt', 'argst', 'promt' ];
    const entryArgs = entryFunc.params.map((p, i) => {
      if (p.type === T.jsval) return `porf_box(task->${vals[i]}, task->${types[i]})`;
      if (p.type === T.f64) return `task->${vals[i]}`;
      if (p.type === T.i32 || p.type === T.u32 || p.type === T.ptr) return `task->${types[i]}`;
      return `(${CT[p.type]})task->${vals[i]}`;
    }).join(', ');
    head.push(THREAD_RUNTIME(fnSym(entryFunc), entryArgs, fnSym(promiseRunOneFunc), prefs, usesCoro));
  }

  for (const f of funcs) if (f) renderFunc(f);

  // dynamic call: one switch dispatcher, no per-function wrappers. fn values are records
  // [fnIdx u32][env u32] (payload = offset, nonzero = truthy), each case adapts the
  // uniform (env,thisv,newtv,argc,argv) ABI to the specialized call inline
  emit(`${st}jsval porf_invoke(u32 idx, jsval callee, u32 env, jsval thisv, jsval newtv, i32 argc, jsbits* argv) {\n`);
    emit('  (void)callee; (void)env; (void)thisv; (void)newtv; (void)argc; (void)argv;\n');
    emit('  switch (idx) {\n');
    for (let i = 0; i < funcs.length; i++) {
      const f = funcs[i];
      if (!f || (!f.indirect && !needsCoro(f) && !isSyncAsync(f))) continue;
      const pre = [];
      const args = [];
      let j = 0;
      for (const p of f.params) {
        if (p.name === '#env') { args.push('env'); continue; }
        if (p.name === '#this') { args.push('thisv'); continue; }
        if (p.name === '#newtarget') { args.push('newtv'); continue; }
        if (p.name === '#callee') { args.push('callee'); continue; }
        if (p.name === '#allargs') {
          pre.push('u32 _aa = porf_arr_new(argc, argc > 4 ? argc : 4);');
          pre.push('for (i32 _k = 0; _k < argc; _k++) porf_arr_set(_aa, (u32)_k, porf_unpack(argv[_k]));');
          args.push(`porf_box((f64)_aa, ${TYPES.array})`);
          continue;
        }
        if (p.name === '#rest') {
          // pack remaining argv into an array (twin helpers; die at step 3)
          pre.push(`u32 _rest = porf_arr_new(0, argc > ${j} ? argc - ${j} : 4);`);
          pre.push(`for (i32 _k = ${j}; _k < argc; _k++) (void)porf_arr_push(_rest, porf_unpack(argv[_k]));`);
          args.push(`porf_box((f64)_rest, ${TYPES.array})`);
          continue;
        }
        const src = `porf_unpack(argc > ${j} ? argv[${j}] : JV_UNDEFINED_BITS)`;
        if (p.type === T.f64) args.push(`(${src}).val`);
          else if (p.type === T.i64 || p.type === T.u64) args.push(`(i64)(${src}).val`);
          else if (p.type === T.i32 || p.type === T.u32 || p.type === T.ptr) args.push(`(i32)(${src}).val`);
          else args.push(src);
        j++;
      }
      const call = `${fnSym(f)}(${args.join(', ')})`;
      let ret;
      if (f.retType === T.none) ret = `${call}; return JV_UNDEFINED;`;
        else if (f.retType === T.f64) ret = `return porf_box_num(${call});`;
        else if (f.retType === T.i64 || f.retType === T.u64) ret = `return porf_box_num((f64)${call});`;
        else if (f.retType === T.i32 || f.retType === T.u32 || f.retType === T.ptr) ret = `return porf_box_num((f64)${call});`;
        else ret = `return ${call};`;
      emit(pre.length ? `    case ${i}: { ${pre.join(' ')} ${ret} }\n` : `    case ${i}: ${ret}\n`);
    }
    emit('  }\n');
    emit('  porf_unreachable("uncompiled function");\n  return JV_UNDEFINED;\n}\n');

    if (usesCoro || usesSyncAsync) {
      emit(`
${st}jsval porf_promise_settled(jsval value, i32 state) {
  const u32 p = porf_alloc(PORF_PROMISE_SIZE, ${TYPES.promise});
  *(jsbits*)(MEM + p + PORF_PROMISE_RESULT) = porf_pack(value);
  *(u32*)(MEM + p + PORF_PROMISE_FULFILL_HEAD) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_FULFILL_TAIL) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_REJECT_HEAD) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_REJECT_TAIL) = 0;
  *(jsbits*)(MEM + p + PORF_PROMISE_PAYLOAD) = JV_UNDEFINED_BITS;
  *(u8*)(MEM + p + PORF_PROMISE_STATE) = (u8)state;
  *(u8*)(MEM + p + PORF_PROMISE_FLAGS) = 0;
  *(u8*)(MEM + p + PORF_PROMISE_HANDLED) = 0;
  return porf_box((f64)p, ${TYPES.promise});
}

${st}jsval porf_promise_fulfilled(jsval value) {
  return porf_promise_settled(value, 1);
}

${st}jsval porf_promise_rejected(jsval value) {
  return porf_promise_settled(value, 2);
}
`);
    }

    if (usesSyncAsync) {
      emit(`
${st}jsval porf_async_call_sync(u32 idx, jsval callee, u32 env, jsval thisv, jsval newtv, i32 argc, jsbits* argv) {
  const i32 try_idx = porf_try_depth++;
  if (_setjmp(porf_try_stack[try_idx]) == 0) {
    const jsval result = porf_invoke(idx, callee, env, thisv, newtv, argc, argv);
    porf_try_depth = try_idx;
    return porf_promise_fulfilled(result);
  }

  porf_try_depth = try_idx;
  return porf_promise_rejected(porf_exception);
}
`);
    }

	    if (usesCoro) {
	      emit(`
	static u32 porf_arr_new_typed(i32 len, i32 cap, i32 type) {
	  if (cap < len) cap = len;
	  if (cap < 4) cap = 4;
	  const u32 a = porf_alloc(16 + ((u32)cap << 3), type);
	  PORF_ARR_LEN(a) = len; PORF_ARR_ENT(a) = a + 16; PORF_ARR_CAP(a) = cap;
	  memset(MEM + PORF_ARR_ENT(a), 0, (size_t)cap << 3);
	  return a;
	}

static void porf_coro_call_thunk(void* arg) {
  porf_coro_call* call = (porf_coro_call*)arg;
  call->result = porf_invoke(call->idx, call->callee, call->env, call->thisv, call->newtv, call->argc, call->argv);
}

static porf_coro_call* porf_coro_call_new(u32 idx, jsval callee, u32 env, jsval thisv, jsval newtv, i32 argc, jsbits* argv) {
  porf_coro_call* call = porf_coro_call_alloc();
  call->coro.live_idx = -1;
  call->idx = idx;
  call->callee = callee;
  call->env = env;
  call->thisv = thisv;
  call->newtv = newtv;
  call->argc = argc;
  call->argv = argc > 0 ? malloc((size_t)argc * sizeof(jsbits)) : 0;
  if (argc > 0 && !call->argv) abort();
  for (i32 i = 0; i < argc; i++) call->argv[i] = argv[i];
  call->result = JV_UNDEFINED;
  return call;
}

static i32 porf_coro_call_step(porf_coro_call* call, jsval value, i32 is_throw) {
  if (!call->started) {
    call->started = 1;
    return porf_coro_enter(&call->coro, porf_coro_call_thunk, call);
  }

  return is_throw ?
    porf_coro_resume_throw(&call->coro, value) :
    porf_coro_resume(&call->coro, value);
}

static void porf_promise_run_coro_reaction_coro(u32 reaction) {
  porf_coro_call* call = (porf_coro_call*)(uintptr_t)*(u64*)(MEM + reaction + PORF_REACTION_HANDLER);
  const jsval out_promise = porf_unpack(*(jsbits*)(MEM + reaction + PORF_REACTION_OUT_PROMISE));
  const jsval value = porf_unpack(*(jsbits*)(MEM + reaction + PORF_REACTION_VALUE));
  const i32 is_throw = (i32)*(u32*)(MEM + reaction + PORF_REACTION_PAYLOAD);

  const i32 try_idx = porf_try_depth++;
  if (_setjmp(porf_try_stack[try_idx]) == 0) {
    const i32 done = porf_coro_call_step(call, value, is_throw);
    porf_try_depth = try_idx;
    if (done) {
      const jsval result = call->result;
      porf_coro_call_free(call);
      porf_promise_settle_direct(out_promise, result, 1);
      return;
    }

    porf_promise_attach_coro(call->coro.channel, call, out_promise);
    return;
  }

  porf_try_depth = try_idx;
  porf_coro_set_current_stack_top(call->coro.caller_stack_top);
  porf_coro_cur = call->coro.parent;
  call->coro.state = 3;
  porf_coro_call_free(call);
  porf_promise_settle_direct(out_promise, porf_exception, 2);
}

	static jsval porf_coro_box(porf_coro_call* call, i32 type) {
	  const u32 p = porf_alloc((u32)sizeof(uintptr_t), type);
	  *(uintptr_t*)(MEM + p) = (uintptr_t)call;
	  call->box_body = p;
	  call->box_type = type;
	#if PORF_GC_ENABLED
	  porf_gc_set_kind((i32)p, (u32)type);
	#endif
	  return porf_box((f64)p, type);
	}

static porf_coro_call* porf_coro_unbox(jsval gen) {
  const i32 type = porf_jv_type(gen);
  if (type != ${TYPES.__porffor_generator} && type != ${TYPES.__porffor_asyncgenerator}) {
    porf_throw_new(${TYPES.typeerror}, 0);
  }
  return (porf_coro_call*)(uintptr_t)(*(uintptr_t*)(MEM + (u32)gen.val));
}

// TS-facing coroutine mechanism (generator.ts + for-of build the iterator protocol and
// the { value, done } result on top of these). mode: 0 = next, 1 = throw the value at the
// suspend point, 2 = return (force completion with the value). returns 1 once done.
	${st}i32 __Porffor_coroutine_resume(jsval gen, jsval value, i32 mode) {
	  porf_coro_call* call = porf_coro_unbox(gen);
	  if (mode == 2 || call->coro.state == 3) {
	    if (call->coro.state != 3) {
	      porf_coro_live_remove(&call->coro);
	      porf_coro_stack_free(&call->coro);
	    }
	    call->coro.state = 3;
	    call->result = value;
	    return 1;
  }

  // boundary for an exception escaping the coroutine body (uncaught inside, or
  // re-raised by a finally during a throw). without it the throw longjmps across
  // the coroutine's separate stack with no landing pad on the resumer side and
  // hits the top-level uncaught handler. mirrors the guard in porf_coro_start /
  // the promise-reaction resume, but re-raises on the caller's stack since the
  // sync .next/.throw/.return driver has no out-promise to settle.
  const i32 try_idx = porf_try_depth++;
  if (_setjmp(porf_try_stack[try_idx]) == 0) {
    const i32 done = porf_coro_call_step(call, value, mode == 1);
    porf_try_depth = try_idx;
    return done;
  }

  porf_try_depth = try_idx;
  porf_coro_set_current_stack_top(call->coro.caller_stack_top);
  porf_coro_cur = call->coro.parent;
  porf_coro_live_remove(&call->coro);
  porf_coro_stack_free(&call->coro);
  call->coro.state = 3;
  porf_throw(porf_exception);
}

// the value the coroutine just produced: its final return value once done, otherwise the
// most recently yielded value
${st}jsval __Porffor_coroutine_value(jsval gen) {
  porf_coro_call* call = porf_coro_unbox(gen);
  return call->coro.state == 3 ? call->result : call->coro.channel;
}

${st}jsval porf_coro_start(u8 flags, u32 idx, jsval callee, u32 env, jsval thisv, jsval newtv, i32 argc, jsbits* argv) {
	  porf_promise_run_coro_reaction_impl = porf_promise_run_coro_reaction_coro;
	  porf_coro_call* call = porf_coro_call_new(idx, callee, env, thisv, newtv, argc, argv);
	  const u8 kind = flags & 7u;

	  if (kind == ${FN_GENERATOR} || kind == ${FN_ASYNC_GENERATOR}) {
	    if (flags & ${FN_CORO_INIT}u) {
	      const i32 try_idx = porf_try_depth++;
	      if (_setjmp(porf_try_stack[try_idx]) == 0) {
	        (void)porf_coro_call_step(call, JV_UNDEFINED, 0);
	        porf_try_depth = try_idx;
	      } else {
	        porf_try_depth = try_idx;
	        porf_coro_set_current_stack_top(call->coro.caller_stack_top);
	        porf_coro_cur = call->coro.parent;
	        call->coro.state = 3;
	        porf_coro_call_free(call);
	        porf_throw(porf_exception);
	      }
	    }
	    return porf_coro_box(call, kind == ${FN_GENERATOR} ? ${TYPES.__porffor_generator} : ${TYPES.__porffor_asyncgenerator});
	  }

  const jsval out_promise = porf_promise_pending();
	  const i32 try_idx = porf_try_depth++;
	  if (_setjmp(porf_try_stack[try_idx]) == 0) {
	    const i32 done = porf_coro_call_step(call, call->coro.channel, 0);
	    porf_try_depth = try_idx;
	    if (done) {
	      jsval result = call->result;
	      porf_coro_call_free(call);
	      porf_promise_settle_direct(out_promise, result, 1);
	    } else {
	      porf_promise_attach_coro(call->coro.channel, call, out_promise);
	    }
	    return out_promise;
	  }

	  porf_try_depth = try_idx;
	  porf_coro_set_current_stack_top(call->coro.caller_stack_top);
	  porf_coro_cur = call->coro.parent;
	  call->coro.state = 3;
	  porf_coro_call_free(call);
	  porf_promise_settle_direct(out_promise, porf_exception, 2);
	  return out_promise;
	}
	`);
    }
    emit(`${st}jsval porf_call_dynamic(jsval fn, jsval thisv, jsval newtv, i32 argc, jsbits* argv) {
  if (porf_jv_type(fn) != ${TYPES.function}) porf_throw_new(${TYPES.typeerror}, 0);
  const u32 rec = (u32)fn.val;
  const u32 idx = *(u32*)(MEM + rec);
  const u32 env = *(u32*)(MEM + rec + 4);
  if (idx >= ${funcs.length}u) porf_unreachable("bad function index");
  const u8 flags = porf_fnflags[idx] & (7u | ${FN_CORO_INIT}u);
  const u8 kind = flags & 7u;
  if (!porf_jv_eq(newtv, JV_UNDEFINED) && kind != 0) porf_throw_new(${TYPES.typeerror}, 0);
  ${usesCoro || usesSyncAsync ? `if (kind != 0) {
    ${usesSyncAsync ? `if (kind == ${FN_ASYNC}u && !porf_fnneeds_coro[idx]) return porf_async_call_sync(idx, fn, env, thisv, newtv, argc, argv);` : ''}
    ${usesCoro ? 'return porf_coro_start(flags, idx, fn, env, thisv, newtv, argc, argv);' : 'porf_unreachable("bad coroutine dispatch");'}
  }` : ''}
  return porf_invoke(idx, fn, env, thisv, newtv, argc, argv);
}
// spread calls use array iteration semantics: holes become present undefined values.
${st}jsval porf_call_dynamic_arr(jsval fn, jsval thisv, jsval newtv, jsval arr) {
  const u32 a = (u32)arr.val;
  const i32 argc = PORF_ARR_LEN(a);
  jsbits* argv = (jsbits*)(MEM + PORF_ARR_ENT(a));
  for (i32 i = 0; i < argc; i++) {
    if (argv[i] == 0) {
      jsbits* dense = argc > 0 ? (jsbits*)malloc((size_t)argc * sizeof(jsbits)) : NULL;
      for (i32 j = 0; j < argc; j++) dense[j] = argv[j] == 0 ? JV_UNDEFINED_BITS : argv[j];
      const jsval out = porf_call_dynamic(fn, thisv, newtv, argc, dense);
      free(dense);
      return out;
    }
  }
  return porf_call_dynamic(fn, thisv, newtv, argc, argv);
}\n`);

  if (prefs.nativeFetch) {
    const main = funcByName.get(entry);
    if (!main) throw new Error('missing native fetch entry function');
    const promiseRunJobs = funcByName.get('__Porffor_promise_runJobs');
    const drainPromiseJobs = promiseRunJobs ? `(void)${fnSym(promiseRunJobs)}(${promiseRunJobs.params.length === 0 ? '' : 'JV_UNDEFINED, JV_UNDEFINED'});` : '(void)0;';

    emit(`
${prefs.eventLoop ? `void porf_native_fetch_timer_start(u32 id, i32 delay_ms, i32 repeat);
void porf_native_fetch_timer_clear(u32 id);` : ''}
void porf_native_fetch_response_complete(void* pending, f64 value, i32 type, i32 is_reject);

typedef struct {
  u32 id;
  jsval callback;
  jsval args;
  i32 callback_root;
  i32 args_root;
  i32 repeat;
  i32 active;
} porf_native_timer_record;

static porf_native_timer_record* porf_native_timers = NULL;
static u32 porf_native_timers_len = 0;
static u32 porf_native_timers_cap = 0;
static u32 porf_native_next_timer_id = 1;

static porf_native_timer_record* porf_native_find_timer(u32 id) {
  for (u32 i = 0; i < porf_native_timers_len; i++) {
    if (porf_native_timers[i].active && porf_native_timers[i].id == id) return porf_native_timers + i;
  }
  return NULL;
}

static void porf_native_release_timer(porf_native_timer_record* timer) {
  if (!timer || !timer->active) return;
  timer->active = 0;
  if (timer->callback_root >= 0) porf_gc_native_root_remove(timer->callback_root);
  if (timer->args_root >= 0) porf_gc_native_root_remove(timer->args_root);
  timer->callback_root = -1;
  timer->args_root = -1;
  timer->callback = JV_UNDEFINED;
  timer->args = JV_UNDEFINED;
}

static u32 porf_native_fetch_set_timer(jsval callback, jsval args, jsval delay_value, i32 repeat) {
  if (callback.type != ${TYPES.function}) porf_throw_new(${TYPES.typeerror}, 0);
  f64 delay_ms = delay_value.type == ${TYPES.number} ? delay_value.val : 0;
  if (delay_ms != delay_ms || delay_ms < 0) delay_ms = 0;
  if (delay_ms > 2147483647.0) delay_ms = 2147483647.0;

  if (porf_native_timers_len == porf_native_timers_cap) {
    const u32 new_cap = porf_native_timers_cap == 0 ? 16u : porf_native_timers_cap * 2u;
    porf_native_timer_record* grown = realloc(porf_native_timers, (size_t)new_cap * sizeof(*grown));
    if (!grown) abort();
    for (u32 i = porf_native_timers_cap; i < new_cap; i++) {
      grown[i].id = 0;
      grown[i].callback = JV_UNDEFINED;
      grown[i].args = JV_UNDEFINED;
      grown[i].callback_root = -1;
      grown[i].args_root = -1;
      grown[i].repeat = 0;
      grown[i].active = 0;
    }
    porf_native_timers = grown;
    porf_native_timers_cap = new_cap;
  }

  porf_native_timer_record* timer = NULL;
  for (u32 i = 0; i < porf_native_timers_len; i++) {
    if (!porf_native_timers[i].active) {
      timer = porf_native_timers + i;
      break;
    }
  }
  if (!timer) timer = porf_native_timers + porf_native_timers_len++;

  u32 id = porf_native_next_timer_id++;
  if (id == 0) id = porf_native_next_timer_id++;
  timer->id = id;
  timer->callback = callback;
  timer->args = args;
  timer->callback_root = porf_gc_native_root_add(callback.val, callback.type);
  timer->args_root = porf_gc_native_root_add(args.val, args.type);
  timer->repeat = repeat != 0;
  timer->active = 1;
${prefs.eventLoop ? '  porf_native_fetch_timer_start(id, (i32)delay_ms, timer->repeat ? (i32)delay_ms : 0);' : '  // event loop disabled (no --event-loop): timer never fires'}
  return id;
}

static void porf_native_fetch_clear_timer(jsval timer_value) {
  u32 id = timer_value.type == ${TYPES.number} ? (u32)timer_value.val : (u32)timer_value.val;
  porf_native_timer_record* timer = porf_native_find_timer(id);
  if (!timer) return;
  porf_native_release_timer(timer);
${prefs.eventLoop ? '  porf_native_fetch_timer_clear(id);' : ''}
}

void porf_native_fetch_fire_timer(u32 id) {
  porf_native_timer_record* timer = porf_native_find_timer(id);
  if (!timer) return;
  const jsval callback = timer->callback;
  const jsval args = timer->args;
  const i32 repeat = timer->repeat;
  if (!repeat) porf_native_release_timer(timer);
  (void)porf_call_dynamic_arr(callback, JV_UNDEFINED, JV_UNDEFINED, args);
  ${drainPromiseJobs}
}

static u32 porf_native_fetch_new_response_reaction(void* pending, i32 is_throw) {
  const u32 reaction = porf_alloc(PORF_REACTION_SIZE, 0);
  *(u64*)(MEM + reaction + PORF_REACTION_HANDLER) = (u64)(uintptr_t)pending;
  *(jsbits*)(MEM + reaction + PORF_REACTION_OUT_PROMISE) = JV_UNDEFINED_BITS;
  *(jsbits*)(MEM + reaction + PORF_REACTION_VALUE) = JV_UNDEFINED_BITS;
  *(u32*)(MEM + reaction + PORF_REACTION_NEXT) = 0;
  *(u32*)(MEM + reaction + PORF_REACTION_PAYLOAD) = (u32)is_throw;
  *(u8*)(MEM + reaction + PORF_REACTION_KIND) = 12;
  *(u8*)(MEM + reaction + PORF_REACTION_FLAGS) = 0;
  porf_gc_barrier(reaction, PORF_GC_KIND_PROMISE_REACTION);
  return reaction;
}

static void porf_native_fetch_append_response_reaction(u32 promise, u32 reaction, i32 reject) {
  const u32 head_off = reject ? PORF_PROMISE_REJECT_HEAD : PORF_PROMISE_FULFILL_HEAD;
  const u32 tail_off = reject ? PORF_PROMISE_REJECT_TAIL : PORF_PROMISE_FULFILL_TAIL;
  const u32 tail = *(u32*)(MEM + promise + tail_off);
  if (tail == 0) {
    *(u32*)(MEM + promise + head_off) = reaction;
  } else {
    *(u32*)(MEM + tail + PORF_REACTION_NEXT) = reaction;
    porf_gc_barrier(tail, PORF_GC_KIND_PROMISE_REACTION);
  }
  *(u32*)(MEM + promise + tail_off) = reaction;
  porf_gc_barrier(promise, ${TYPES.promise});
}

void porf_native_fetch_attach_response(jsval promise, void* pending, u32* fulfill_out, u32* reject_out) {
  const u32 p = (u32)promise.val;
  const u32 fulfill = porf_native_fetch_new_response_reaction(pending, 0);
  const u32 reject = porf_native_fetch_new_response_reaction(pending, 1);
  porf_native_fetch_append_response_reaction(p, fulfill, 0);
  porf_native_fetch_append_response_reaction(p, reject, 1);
  if (fulfill_out) *fulfill_out = fulfill;
  if (reject_out) *reject_out = reject;
}

void porf_native_fetch_cancel_response_reaction(u32 reaction) {
  if (reaction == 0) return;
  *(u64*)(MEM + reaction + PORF_REACTION_HANDLER) = 0;
}

static void porf_native_fetch_run_response_reaction_c(u32 reaction) {
  void* pending = (void*)(uintptr_t)*(u64*)(MEM + reaction + PORF_REACTION_HANDLER);
  const jsval value = porf_unpack(*(jsbits*)(MEM + reaction + PORF_REACTION_VALUE));
  const i32 is_throw = (i32)*(u32*)(MEM + reaction + PORF_REACTION_PAYLOAD);
  porf_native_fetch_response_complete(pending, value.val, value.type, is_throw);
}

int porf_native_fetch_is_pending_promise(jsval value) {
  return value.type == ${TYPES.promise} && *(u8*)(MEM + (u32)value.val + PORF_PROMISE_STATE) == 0;
}

int porf_native_fetch_promise_state(jsval value) {
  if (value.type != ${TYPES.promise}) return -1;
  return *(u8*)(MEM + (u32)value.val + PORF_PROMISE_STATE);
}

jsval porf_native_fetch_promise_result(jsval value) {
  return porf_unpack(*(jsbits*)(MEM + (u32)value.val + PORF_PROMISE_RESULT));
}

u32 porf_native_fetch_alloc(u32 bytes, u32 type) {
  return porf_alloc(bytes, type);
}

u32 porf_native_fetch_alloc_bytestring(const char* input, size_t len) {
  const u32 ptr = porf_bstr_new((u32)len);
  if (len > 0) memcpy(MEM + ptr + 4, input, len);
  return ptr;
}

void porf_native_fetch_runtime_init(void) {
#ifdef _WIN32
  fprintf(stderr, "Porffor native fetch server is not yet implemented on Windows\\n");
  exit(1);
#else
  signal(SIGPIPE, SIG_IGN);
  porf_init(0, NULL);
  porf_data_init();
  porf_native_fetch_run_response_reaction_impl = porf_native_fetch_run_response_reaction_c;
  ${gcEnabled ? 'volatile int porf_stack_anchor = 0;\n  porf_c_stack_top = (void*)&porf_stack_anchor;\n  ' : ''}${fnSym(main)}();
#endif
}

void porf_native_fetch_collect_normal(void) {
${gcEnabled ? `  if (porf_heap_base == 0) return;
  if (!porf_gc_should_collect_for(0)) return;
  porf_gc_collect_impl(0);` : '  (void)0;'}
}

void porf_native_fetch_collect_normal_from(void* stack_top) {
${gcEnabled ? `  if (porf_heap_base == 0) return;
  if (!porf_gc_should_collect_for(0)) return;
  void* prev_stack_top = porf_c_stack_top;
  porf_c_stack_top = stack_top;
  porf_gc_collect_impl(0);
  porf_c_stack_top = prev_stack_top;` : '  (void)stack_top;'}
}

int porf_native_fetch_should_collect(void) {
${gcEnabled ? '  return porf_heap_base != 0 && porf_gc_should_collect_for(0);' : '  return 0;'}
}

jsval porf_native_fetch_call_handler(f64 method_value, i32 method_type, f64 url_value, i32 url_type, f64 headers_value, i32 headers_type, f64 body_value, i32 body_type) {
  return ${nativeFetchFuncSym('__Porffor_fetch_native_handle')}(JV_UNDEFINED, JV_UNDEFINED, (jsval){method_value, method_type}, (jsval){url_value, url_type}, (jsval){headers_value, headers_type}, (jsval){body_value, body_type});
}

void porf_native_fetch_drain_microtasks(void) {
  ${drainPromiseJobs}
}

void porf_native_fetch_finalize_response(f64 response_value, i32 response_type, NativeFetchResponseParts* out) {
  NativeFetchResponseParts* prev = porf_native_fetch_response_parts_out;
  porf_native_fetch_response_parts_out = out;
  *out = (NativeFetchResponseParts){200, JV_UNDEFINED, JV_UNDEFINED};
  (void)${nativeFetchFuncSym('__porffor_native_fetch_response_finalize')}(JV_UNDEFINED, JV_UNDEFINED, (jsval){response_value, response_type});
  porf_native_fetch_response_parts_out = prev;
}

f64 porf_native_fetch_get_port(void) {
  return __porffor_native_fetch_port.val;
}

int porf_native_fetch_read_value(jsval value, const char** out_buf, size_t* out_len, char** out_owned) {
  if (!out_buf || !out_len || !out_owned) return -1;

  *out_buf = NULL;
  *out_len = 0;
  *out_owned = NULL;

  if (value.type == ${TYPES.bytestring}) {
    const u32 ptr = (u32)value.val;
    *out_buf = (const char*)(MEM + ptr + 4);
    *out_len = (size_t)*(u32*)(MEM + ptr);
    return 0;
  }

  if (value.type == ${TYPES.string}) {
    const u32 ptr = (u32)value.val;
    const size_t len = (size_t)*(u32*)(MEM + ptr);
    const u16* chars = (const u16*)(MEM + ptr + 4);
    char* utf8 = malloc(len * 3 + 1);
    if (!utf8) return -1;

    size_t out_len_local = 0;
    for (size_t i = 0; i < len; i++) {
      u16 c = chars[i];
      if (c < 0x80) {
        utf8[out_len_local++] = (char)c;
      } else if (c < 0x800) {
        utf8[out_len_local++] = (char)(0xc0 | (c >> 6));
        utf8[out_len_local++] = (char)(0x80 | (c & 0x3f));
      } else {
        utf8[out_len_local++] = (char)(0xe0 | (c >> 12));
        utf8[out_len_local++] = (char)(0x80 | ((c >> 6) & 0x3f));
        utf8[out_len_local++] = (char)(0x80 | (c & 0x3f));
      }
    }

    utf8[out_len_local] = '\\0';
    *out_buf = utf8;
    *out_len = out_len_local;
    *out_owned = utf8;
    return 0;
  }

  return -1;
}
`);
  }

  if (entry && !prefs.nativeFetch) {
    emit(`int main(int argc, char** argv) {\n  porf_init(argc, argv);\n  porf_data_init();\n  ${gcEnabled ? 'volatile int porf_stack_anchor = 0;\n  porf_c_stack_top = (void*)&porf_stack_anchor;\n  ' : ''}${fnSym(funcByName.get(entry))}();\n  ${usesThreads ? 'porf_threads_drain();\n  ' : ''}return 0;\n}\n`);
  }

  if (usesMath) head.splice(1, 0, '#include <math.h>\n');
  const c = head.join('') + out.join('');
  if (!prefs.nativeFetch) return usesThreads ? { c, threads: true } : c;

  return { c, nativeFetch: true, threads: usesThreads };
};

const PORF_BUMP_ALLOC = () => {
  const st = 'static ';
  const sti = 'static inline ';
  return `// ---- arena ----
// fixed-address reserve; commit-on-demand; NEVER moves. 32-bit offsets.
static u32 porf_heap_base = 0;
static u32 porf_heap_cur = 0;
static u32 porf_heap_committed = 0;

static void porf_commit(u32 end) {
  if (end <= porf_heap_committed) return;
  u32 want = (end + (1u << 20)) & ~((1u << 20) - 1);
  if (mprotect(MEM, want, PROT_READ | PROT_WRITE) != 0) {
    fprintf(stderr, "porffor: out of memory (commit %u)\\n", want);
    exit(1);
  }
  porf_heap_committed = want;
}

static void porf_arena_init(void) {
  void* got = mmap(PORF_ARENA_HINT, PORF_ARENA_RESERVE, PROT_NONE,
    MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (got == MAP_FAILED) {
    fprintf(stderr, "porffor: failed to reserve arena\\n");
    exit(1);
  }
  porf_mem = (u8*)got;
  porf_heap_base = (PORF_STATIC_END + 4095u) & ~4095u;
  porf_heap_cur = porf_heap_base + 8;
  porf_heap_committed = 0;
  porf_commit(porf_heap_base + 65536u);
}

${st}u32 porf_alloc_slow(u32 bytes);
${sti}u32 porf_alloc(u32 bytes, u32 typeId) {
  const u32 size = (bytes + 7u) & ~7u;
  const u32 p = porf_heap_cur;
  const u32 next = p + size;
  (void)typeId;
  if (next <= porf_heap_committed) {
    porf_heap_cur = next;
    return p;
  }
  return porf_alloc_slow(size);
}
${st}u32 porf_alloc_slow(u32 size) {
  porf_commit(porf_heap_cur + size);
  const u32 p = porf_heap_cur;
  porf_heap_cur = p + size;
  return p;
}

${st}void porf_gc_barrier_impl(u32 p, i32 type) { (void)p; (void)type; }
${sti}int porf_gc_type_can_reference(i32 type) { (void)type; return 0; }
static inline u32 porf_gc_barrier_ptr_u32(u32 p) { return p; }
static inline u32 porf_gc_barrier_ptr_i32(i32 p) { return (u32)p; }
static inline u32 porf_gc_barrier_ptr_jsval(jsval v) { return (u32)v.val; }
#define porf_gc_barrier(p, type) porf_gc_barrier_impl(_Generic((p), jsval: porf_gc_barrier_ptr_jsval, i32: porf_gc_barrier_ptr_i32, default: porf_gc_barrier_ptr_u32)(p), (type))
static void* porf_c_stack_top = NULL;
${st}i32 porf_gc_native_root_add(f64 value, i32 type) { (void)value; (void)type; return -1; }
${st}void porf_gc_native_root_remove(i32 slot) { (void)slot; }
${st}void porf_gc_collect_impl(int minor) { (void)minor; }

`;
};

const PORF_GC_ALLOC = (prefs, usesThreads = false) => {
  const st = 'static ';
  const sti = 'static inline ';
  return `// ---- sticky gc arena ----
static u32 porf_heap_base = 0;
static u32 porf_heap_top = 0;
static u32 porf_heap_committed = 0;
static u32 porf_gc_free_head = 0;

#define PORF_GC_SMALL_BIN_MAX 1024u
#define PORF_GC_SMALL_BINS (PORF_GC_SMALL_BIN_MAX / 8u)
#define PORF_GC_FREE_BINS (PORF_GC_SMALL_BINS + 32u)
static u32 porf_gc_free_bins[PORF_GC_FREE_BINS];
static u32 porf_gc_free_bin_largest[PORF_GC_FREE_BINS];
static u64 porf_gc_free_bin_words[(PORF_GC_FREE_BINS + 63u) / 64u];

static u8* porf_gc_block_starts = NULL;
static size_t porf_gc_block_start_bytes = 0;
static u64 porf_gc_allocation_debt = 0;
static u64 porf_gc_collection_count = 0;
static u64 porf_gc_last_heap_growth_collection = 0;
static u64 porf_gc_last_live_bytes = 0;
static u64 porf_gc_live_bytes = 0;
static u64 porf_gc_free_bytes = 0;
static u32 porf_gc_live_blocks = 0;
static u32 porf_gc_free_blocks = 0;
static u32 porf_gc_largest_live = 0;
static u32 porf_gc_largest_free = 0;
static u32 porf_gc_free_bins_used = 0;
${usesThreads ? `struct porf_gc_thread_tlab {
  u32 cur;
  u32 end;
  u32 window_start;
  u32* remembered;
  i32 remembered_len;
  i32 remembered_cap;
  struct porf_gc_thread_tlab* next;
};
static pthread_mutex_t porf_gc_thread_alloc_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t porf_gc_thread_tlab_lock = PTHREAD_MUTEX_INITIALIZER;
static _Thread_local struct porf_gc_thread_tlab* porf_gc_thread_tlab = NULL;
static struct porf_gc_thread_tlab* porf_gc_thread_tlabs = NULL;
static int porf_stw_requested;
` : ''}

static const u64 porf_gc_allocation_debt_min = ${prefs.nativeFetch ? '64ull * 1024ull' : '1ull * 1024ull * 1024ull'};
static const u64 porf_gc_allocation_debt_max = 256ull * 1024ull * 1024ull;

#define PORF_GC_FLAG_MARKED 1u
#define PORF_GC_FLAG_ALLOCATED 2u
#define PORF_GC_FLAG_RAW 4u
#define PORF_GC_FLAG_AGED 8u
#define PORF_GC_FLAG_AGED_DIRTY 16u
#define PORF_GC_FLAG_OLD (1u << 26)
#define PORF_GC_FLAG_REMEMBERED (1u << 27)
#define PORF_GC_FLAG_REMEMBERED_AGED (1u << 28)
#define PORF_GC_TEMP_TYPE_SHIFT 8u
#define PORF_GC_KIND_SHIFT 16u
#define PORF_GC_KIND_MASK (0x3ffu << PORF_GC_KIND_SHIFT)
#define PORF_GC_KIND_OBJECT_ENTRIES 256u
#define PORF_GC_KIND_ARRAY_ENTRIES 257u
#define PORF_GC_KIND_FUNCTION 258u
#define PORF_GC_KIND_UNDERLYING_STORE 259u
#define PORF_GC_KIND_REGEX_CACHE 260u
#define PORF_GC_KIND_LEAF 261u

// Compiler-typed allocations carry their precise scan kind from birth. Raw
// Porffor.malloc blocks begin as leaves until explicitly classified.
static inline u32 porf_gc_alloc_kind_bits(u32 typeId) {
  if (typeId == 0u) return PORF_GC_KIND_LEAF << PORF_GC_KIND_SHIFT;
  return typeId > 0u && typeId < 256u ? typeId << PORF_GC_KIND_SHIFT : 0u;
}

static inline void porf_gc_init_raw_alloc(u32 body, u32 size, u32 typeId) {
  if (typeId == 0u) memset(MEM + body, 0, (size_t)size);
}

#define PORF_GC_NURSERY_BYTES ${Math.min(((parseInt(prefs.gcNursery) || 32) * 1024 * 1024), 256 * 1024 * 1024)}u
#define PORF_GC_NURSERY_LARGE 512u
#define PORF_GC_SPAGE 8192u
#define PORF_GC_SPAGE_MASK 8191u
#define PORF_GC_SPAGE_SHIFT 13
#define PORF_GC_LINE_SIZE 128u
#define PORF_GC_LINE_MASK (PORF_GC_LINE_SIZE - 1u)
#define PORF_GC_HOLE_BINS 5
#define PORF_GC_PAGE_ACTIVE 2u
#define PORF_GC_PAGE_LISTED 64u
#define PORF_GC_PAGE_COLD 128u
#define PORF_GC_HOT_FREE_PAGES ${usesThreads ? '2048' : '512'}

${usesThreads ? `static int porf_threads_default_pool_value = ${parseInt(prefs.threadsPool) || 0};

static inline int porf_threads_default_pool(void) {
  return porf_threads_default_pool_value;
}

static void porf_threads_default_pool_init(void) {
  if (porf_threads_default_pool_value < 1) {
    porf_threads_default_pool_value = (int)sysconf(_SC_NPROCESSORS_ONLN);
    if (porf_threads_default_pool_value < 1) porf_threads_default_pool_value = 1;
  }
}

static inline i64 porf_gc_thread_budget_mutators(void) {
  return (i64)porf_threads_default_pool();
}

static inline i64 porf_gc_thread_nursery_limit(void) {
  return (i64)PORF_GC_NURSERY_BYTES * porf_gc_thread_budget_mutators();
}
static inline i64 porf_gc_thread_span_limit(void) {
  return 8388608ll * porf_gc_thread_budget_mutators();
}

` : ''}\
static u8* porf_gc_page_kind = NULL;
static u32 porf_gc_old_base = 0;
static u32 porf_gc_nursery_cur = 0;
static u32 porf_gc_nursery_end = 0;
static u32 porf_gc_nursery_window_start = 0;
static int porf_gc_nursery_is_hole = 0;
static i64 porf_gc_window_bytes = 0;
static i64 porf_gc_span_bytes = 0;
static u32 porf_gc_med_cur = 0;
static u32 porf_gc_med_end = 0;
${usesThreads ? 'static _Thread_local' : 'static'} void* porf_c_stack_top = NULL;

static u32* porf_gc_remembered = NULL;
static i32 porf_gc_remembered_len = 0;
static i32 porf_gc_remembered_cap = 0;
static u32* porf_gc_weakmaps = NULL;
static i32 porf_gc_weakmaps_len = 0;
static i32 porf_gc_weakmaps_cap = 0;
static u32* porf_gc_young_active = NULL;
static i32 porf_gc_young_active_len = 0;
static i32 porf_gc_young_active_cap = 0;
static u32* porf_gc_young_free = NULL;
static i32 porf_gc_young_free_len = 0;
static i32 porf_gc_young_free_cap = 0;
static u32* porf_gc_young_cold = NULL;
static i32 porf_gc_young_cold_len = 0;
static i32 porf_gc_young_cold_cap = 0;
static u32* porf_gc_touched = NULL;
static i32 porf_gc_touched_len = 0;
static i32 porf_gc_touched_cap = 0;
static u32* porf_gc_aging = NULL;
static i32 porf_gc_aging_len = 0;
static i32 porf_gc_aging_cap = 0;
static u32* porf_gc_holes[PORF_GC_HOLE_BINS];
static u32* porf_gc_hole_ends[PORF_GC_HOLE_BINS];
static i32 porf_gc_holes_len[PORF_GC_HOLE_BINS];
static i32 porf_gc_holes_cap[PORF_GC_HOLE_BINS];
static i64 porf_gc_claimed_since_full = 0;
static i64 porf_gc_promoted_since_full = 0;
static u64 porf_gc_page_live_bytes = 0;
static u32 porf_gc_page_live_blocks = 0;
static u32 porf_gc_page_largest_live = 0;
static int porf_gc_minor_mode = 0;
static u64 porf_gc_minor_count = 0;
static u64 porf_gc_full_count = 0;
static u64 porf_gc_minors_since_full = 0;

struct porf_gc_mark_item { u32 body; i32 type; };
static struct porf_gc_mark_item* porf_gc_mark_queue = NULL;
static i32 porf_gc_mark_queue_len = 0;
static i32 porf_gc_mark_queue_cap = 0;

struct porf_gc_boxed_mark { f64 value; i32 type; };
static struct porf_gc_boxed_mark* porf_gc_boxed_marks = NULL;
static i32 porf_gc_boxed_marks_len = 0;
static i32 porf_gc_boxed_marks_cap = 0;

static u64* porf_gc_static_marks = NULL;
static i32 porf_gc_static_marks_len = 0;
static i32 porf_gc_static_marks_cap = 0;

${st}void porf_gc_collect_impl(int minor);
${usesThreads ? 'static void porf_gc_collect_threaded(int minor);\n' : ''}\
static void porf_gc_mark_js(f64 value, i32 type);
static void porf_gc_mark_raw(i32 body);
static void porf_gc_mark_underlying_store(i32 body);
static void porf_gc_mark_regex_cache(i32 cache);
static void porf_gc_mark_coro_handle(uintptr_t raw);
static void porf_gc_finalize_body(i32 body, i32 type);
static void porf_gc_cons_scan_range(const u64* lo, const u64* hi);
static void porf_gc_mark_global_roots(void);
static void porf_gc_mark_global_raw_roots(void);
static void porf_gc_mark_coro_roots(void);
${usesThreads ? 'static void porf_gc_mark_thread_roots(void);\n' : ''}\

static inline u32 porf_gc_align(u32 size) { return (size + 7u) & ~7u; }
static inline void porf_gc_bin_word_set(i32 bin) { porf_gc_free_bin_words[bin >> 6] |= 1ull << (bin & 63); }
static inline void porf_gc_bin_word_clear(i32 bin) { porf_gc_free_bin_words[bin >> 6] &= ~(1ull << (bin & 63)); }

static inline i32 porf_gc_next_set_bin(i32 from) {
  if (from < 0) from = 0;
  u32 w = (u32)from >> 6;
  const u32 words = (PORF_GC_FREE_BINS + 63u) / 64u;
  if (w >= words) return -1;
  u64 word = porf_gc_free_bin_words[w] & (~0ull << ((u32)from & 63u));
  for (;;) {
    if (word != 0) return (i32)(w << 6) + __builtin_ctzll(word);
    if (++w >= words) return -1;
    word = porf_gc_free_bin_words[w];
  }
}

static inline int porf_gc_in_nursery(i32 body) {
  return body > 0 && porf_gc_page_kind != NULL && porf_gc_page_kind[(u32)body >> PORF_GC_SPAGE_SHIFT] != 0u;
}
static inline int porf_gc_in_heap(i32 body) {
  return body >= (i32)porf_heap_base + 8 && (u32)body < porf_heap_top;
}
static inline int porf_gc_in_static(i32 body) {
  return body > 0 && (u32)body < porf_heap_base;
}
static inline int porf_gc_static_range(i32 ptr, u64 bytes) {
  return ptr > 0 && (u32)ptr <= porf_heap_base && bytes <= (u64)(porf_heap_base - (u32)ptr);
}

static void porf_gc_ensure_block_starts(size_t bytes) {
  const size_t needed_slots = (bytes + 7u) >> 3;
  const size_t needed_bytes = (needed_slots + 7u) >> 3;
  if (needed_bytes <= porf_gc_block_start_bytes) return;
  u8* grown = realloc(porf_gc_block_starts, needed_bytes);
  if (!grown) abort();
  memset(grown + porf_gc_block_start_bytes, 0, needed_bytes - porf_gc_block_start_bytes);
  porf_gc_block_starts = grown;
  porf_gc_block_start_bytes = needed_bytes;
}

#define porf_gc_block_start_slot(body) ((u32)(body) >> 3)
#define porf_gc_block_start_bit(body) ((porf_gc_block_starts[porf_gc_block_start_slot(body) >> 3] & (u8)(1u << (porf_gc_block_start_slot(body) & 7u))) != 0u)
#define porf_gc_set_block_start(body) (porf_gc_block_starts[porf_gc_block_start_slot(body) >> 3] |= (u8)(1u << (porf_gc_block_start_slot(body) & 7u)))
#define porf_gc_clear_block_start(body) (porf_gc_block_starts[porf_gc_block_start_slot(body) >> 3] &= (u8)~(1u << (porf_gc_block_start_slot(body) & 7u)))
#define porf_gc_is_block_start(body) (porf_gc_in_heap(body) && (((u32)(body) & 7u) == 0u) && (size_t)(porf_gc_block_start_slot(body) >> 3) < porf_gc_block_start_bytes && porf_gc_block_start_bit(body))
#define porf_gc_header(body) ((u32*)(MEM + (i32)(body) - 8))

static inline u32 porf_gc_header_kind(u32 flags) {
  return (flags & PORF_GC_KIND_MASK) >> PORF_GC_KIND_SHIFT;
}
static inline u32 porf_gc_kind(i32 body) {
  if (!porf_gc_is_block_start(body)) return 0;
  return porf_gc_header_kind(porf_gc_header(body)[1]);
}
static inline void porf_gc_set_kind(i32 body, u32 kind) {
  if (!porf_gc_is_block_start(body)) return;
  u32* header = porf_gc_header(body);
  header[1] = (header[1] & ~PORF_GC_KIND_MASK) | ((kind & 0x3ffu) << PORF_GC_KIND_SHIFT);
}
static inline int porf_gc_is_old(i32 body) {
  if (!porf_gc_is_block_start(body)) return 0;
  return (porf_gc_header(body)[1] & PORF_GC_FLAG_OLD) != 0u;
}
static inline void porf_gc_set_marked_type(i32 body, i32 type) {
  u32* header = porf_gc_header(body);
  header[1] = (header[1] & ~(PORF_GC_KIND_MASK | (0xffu << PORF_GC_TEMP_TYPE_SHIFT))) |
    PORF_GC_FLAG_MARKED |
    (((u32)type & 0xffu) << PORF_GC_TEMP_TYPE_SHIFT) |
    (((u32)type & 0x3ffu) << PORF_GC_KIND_SHIFT);
}
static inline int porf_gc_has_marked_type(i32 body, i32 type) {
  if (!porf_gc_is_block_start(body)) return 0;
  const u32 flags = porf_gc_header(body)[1];
  if ((flags & PORF_GC_FLAG_MARKED) == 0u) return 0;
  return ((flags >> PORF_GC_TEMP_TYPE_SHIFT) & 0xffu) == ((u32)type & 0xffu);
}

static void porf_commit(u32 end) {
  if (end <= porf_heap_committed) return;
  u64 want64 = ((u64)end + (1ull << 20)) & ~((1ull << 20) - 1ull);
  if (want64 > PORF_ARENA_RESERVE) {
    fprintf(stderr, "porffor: out of memory (commit %llu)\\n", (unsigned long long)want64);
    exit(1);
  }
  u32 want = (u32)want64;
  if (mprotect(MEM, want, PROT_READ | PROT_WRITE) != 0) {
    fprintf(stderr, "porffor: out of memory (commit %u)\\n", want);
    exit(1);
  }
  porf_heap_committed = want;
  porf_gc_ensure_block_starts(want);
  porf_gc_last_heap_growth_collection = porf_gc_collection_count;
}

static void porf_gc_maybe_trim_memory(void) {
  const u32 trim_granule = 1u << 20;
  const u32 keep_slack = ${prefs.nativeFetch ? '0u' : '16u * 1024u * 1024u'};
  const u32 min_trim = ${prefs.nativeFetch ? '1u << 20' : '16u * 1024u * 1024u'};

  u64 wanted64 = ((u64)porf_heap_top + keep_slack + trim_granule - 1ull) & ~((u64)trim_granule - 1ull);
  const u64 min_committed = (u64)porf_heap_base + 65536ull;
  if (wanted64 < min_committed) wanted64 = min_committed;
  if (wanted64 >= porf_heap_committed) return;

  const u32 wanted = (u32)wanted64;
  const u32 trim_bytes = porf_heap_committed - wanted;
  if (trim_bytes < min_trim) return;

#if defined(MADV_DONTNEED)
  (void)madvise(MEM + wanted, trim_bytes, MADV_DONTNEED);
#elif defined(MADV_FREE)
  (void)madvise(MEM + wanted, trim_bytes, MADV_FREE);
#endif
  if (mprotect(MEM + wanted, trim_bytes, PROT_NONE) != 0) return;
  porf_heap_committed = wanted;
}

static void porf_gc_clear_free_lists(void) {
  porf_gc_free_head = 0;
  memset(porf_gc_free_bins, 0, sizeof(porf_gc_free_bins));
  memset(porf_gc_free_bin_largest, 0, sizeof(porf_gc_free_bin_largest));
  memset(porf_gc_free_bin_words, 0, sizeof(porf_gc_free_bin_words));
  porf_gc_free_bytes = 0;
  porf_gc_free_blocks = 0;
  porf_gc_largest_free = 0;
  porf_gc_free_bins_used = 0;
}

static inline i32 porf_gc_free_bin(u32 size) {
  if (size <= PORF_GC_SMALL_BIN_MAX) return (i32)((size >> 3) - 1u);
  i32 bin = (i32)PORF_GC_SMALL_BINS;
  u32 n = size - 1u;
  while (n > PORF_GC_SMALL_BIN_MAX && bin < (i32)PORF_GC_FREE_BINS - 1) {
    n >>= 1;
    bin++;
  }
  return bin;
}

static inline void porf_gc_insert_free(i32 body, u32 size) {
  if (size < 8u) return;
  const i32 bin = porf_gc_free_bin(size);
  u32* header = porf_gc_header(body);
  if (porf_gc_free_bins[bin] == 0) {
    porf_gc_free_bins_used++;
    porf_gc_bin_word_set(bin);
  }
  header[1] = porf_gc_free_bins[bin];
  porf_gc_free_bins[bin] = (u32)body;
  if (size > porf_gc_free_bin_largest[bin]) porf_gc_free_bin_largest[bin] = size;
  porf_gc_free_head = (u32)body;
  porf_gc_free_bytes += 8u + (u64)size;
  porf_gc_free_blocks++;
  if (size > porf_gc_largest_free) porf_gc_largest_free = size;
}

static inline void porf_gc_recompute_largest_free(void) {
  u32 largest = 0;
  for (i32 bin = 0; bin < (i32)PORF_GC_FREE_BINS; bin++) {
    if (porf_gc_free_bin_largest[bin] > largest) largest = porf_gc_free_bin_largest[bin];
  }
  porf_gc_largest_free = largest;
}

static void porf_arena_init(void) {
  void* got = mmap(PORF_ARENA_HINT, PORF_ARENA_RESERVE, PROT_NONE,
    MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (got == MAP_FAILED) {
    fprintf(stderr, "porffor: failed to reserve arena\\n");
    exit(1);
  }
  porf_mem = (u8*)got;
  porf_heap_base = (PORF_STATIC_END + 4095u) & ~4095u;
  porf_gc_old_base = porf_heap_base;
  porf_heap_top = porf_gc_old_base;
  porf_heap_committed = 0;
  porf_gc_clear_free_lists();
  porf_commit(porf_heap_base + 65536u);
}

static void porf_gc_young_push(u32** arr, i32* len, i32* cap, u32 v) {
  if (*len == *cap) {
    const i32 nc = *cap == 0 ? 1024 : *cap * 2;
    u32* grown = realloc(*arr, (size_t)nc * sizeof(u32));
    if (!grown) abort();
    *arr = grown;
    *cap = nc;
  }
  (*arr)[(*len)++] = v;
}

static void porf_gc_free_page_push(u32 pg, int cold) {
  u8* kind = &porf_gc_page_kind[pg >> PORF_GC_SPAGE_SHIFT];
  *kind |= 8u;
  if (cold) {
    *kind |= PORF_GC_PAGE_COLD;
    porf_gc_young_push(&porf_gc_young_cold, &porf_gc_young_cold_len, &porf_gc_young_cold_cap, pg);
  } else {
    *kind &= ~PORF_GC_PAGE_COLD;
    porf_gc_young_push(&porf_gc_young_free, &porf_gc_young_free_len, &porf_gc_young_free_cap, pg);
  }
}

static void porf_gc_hole_push(u32 start, u32 end) {
  if (end <= start) return;
  const u32 lines = (end - start) / PORF_GC_LINE_SIZE;
  const i32 bin = lines >= PORF_GC_HOLE_BINS ? PORF_GC_HOLE_BINS - 1 : (i32)lines - 1;
  if (porf_gc_holes_len[bin] == porf_gc_holes_cap[bin]) {
    const i32 nc = porf_gc_holes_cap[bin] == 0 ? 1024 : porf_gc_holes_cap[bin] * 2;
    u32* g1 = realloc(porf_gc_holes[bin], (size_t)nc * sizeof(u32));
    u32* g2 = realloc(porf_gc_hole_ends[bin], (size_t)nc * sizeof(u32));
    if (!g1 || !g2) abort();
    porf_gc_holes[bin] = g1;
    porf_gc_hole_ends[bin] = g2;
    porf_gc_holes_cap[bin] = nc;
  }
  const i32 i = porf_gc_holes_len[bin]++;
  porf_gc_holes[bin][i] = start;
  porf_gc_hole_ends[bin][i] = end;
}

static void porf_gc_hole_push_reclaim(u32 start, u32 end, int minor) {
  if (minor) {
    if (end - start >= 512u) porf_gc_hole_push(start, end);
    return;
  }
  start = (start + PORF_GC_LINE_MASK) & ~PORF_GC_LINE_MASK;
  end &= ~PORF_GC_LINE_MASK;
  if (end > start && end - start >= PORF_GC_LINE_SIZE) porf_gc_hole_push(start, end);
}

static int porf_gc_hole_take(u32 need, u32* start, u32* end) {
  const u32 lines = (need + PORF_GC_LINE_MASK) / PORF_GC_LINE_SIZE;
  const i32 first = lines >= PORF_GC_HOLE_BINS ? PORF_GC_HOLE_BINS - 1 : (i32)lines - 1;
  for (i32 bin = first; bin < PORF_GC_HOLE_BINS; bin++) {
    if (porf_gc_holes_len[bin] == 0) continue;
    const i32 i = --porf_gc_holes_len[bin];
    *start = porf_gc_holes[bin][i];
    *end = porf_gc_hole_ends[bin][i];
    return 1;
  }
  return 0;
}

static u32 porf_gc_page_claim_top(void) {
  if ((porf_heap_top & PORF_GC_SPAGE_MASK) != 0u) {
    const u32 gap = PORF_GC_SPAGE - (porf_heap_top & PORF_GC_SPAGE_MASK);
    porf_commit(porf_heap_top + gap);
    u32* fh = (u32*)(MEM + porf_heap_top);
    fh[0] = gap - 8u;
    fh[1] = 0;
    if (gap >= 16u) {
      porf_gc_insert_free((i32)porf_heap_top + 8, fh[0]);
    }
    porf_heap_top += gap;
  }
  if ((u64)porf_heap_top + PORF_GC_SPAGE >= PORF_ARENA_RESERVE) return 0;
  porf_commit(porf_heap_top + PORF_GC_SPAGE);
  const u32 pg = porf_heap_top;
  porf_heap_top += PORF_GC_SPAGE;
  return pg;
}

static int porf_gc_full_due(i64 additional_claimed) {
  const i64 scale = ${usesThreads ? 'porf_gc_thread_budget_mutators()' : '1'};
  const u64 live_limit = porf_gc_last_live_bytes > 268435456ull ? porf_gc_last_live_bytes : 268435456ull;
  u64 promoted_limit = porf_gc_last_live_bytes / 2u;
  if (promoted_limit < 134217728ull) promoted_limit = 134217728ull;
  if (promoted_limit > 536870912ull) promoted_limit = 536870912ull;
  const i64 full_at = live_limit > (u64)((1ll << 62) / scale) ? (1ll << 62) : (i64)live_limit * scale;
  const i64 promoted_at = promoted_limit > (u64)((1ll << 62) / scale) ? (1ll << 62) : (i64)promoted_limit * scale;
  const i64 pressure_full_at = 67108864ll * scale;
  const i64 claimed = porf_gc_claimed_since_full > (1ll << 62) - additional_claimed ? (1ll << 62) : porf_gc_claimed_since_full + additional_claimed;
  return claimed > full_at || porf_gc_promoted_since_full > promoted_at ||
    (porf_heap_top > 1610612736u && claimed > pressure_full_at);
}

static void porf_gc_young_claim(i32 n) {
  const i64 claim_bytes = (i64)n * (i64)PORF_GC_SPAGE;
  if (porf_gc_full_due(claim_bytes)) {
    ${usesThreads ? 'porf_gc_collect_threaded(0)' : 'porf_gc_collect_impl(0)'};
  }
  porf_gc_claimed_since_full += claim_bytes;
  if (porf_gc_page_kind == NULL) {
    porf_gc_page_kind = calloc(1u << (32 - PORF_GC_SPAGE_SHIFT), 1);
    if (!porf_gc_page_kind) abort();
  }
  for (i32 i = 0; i < n; i++) {
    const u32 pg = porf_gc_page_claim_top();
    if (pg == 0) return;
    porf_gc_page_kind[pg >> PORF_GC_SPAGE_SHIFT] = 1u;
    porf_gc_free_page_push(pg, 0);
  }
}

${usesThreads ? `static struct porf_gc_thread_tlab* porf_gc_thread_tlab_get(void) {
  struct porf_gc_thread_tlab* t = porf_gc_thread_tlab;
  if (t != NULL) return t;
  t = (struct porf_gc_thread_tlab*)calloc(1, sizeof(*t));
  if (!t) abort();
  pthread_mutex_lock(&porf_gc_thread_tlab_lock);
  t->next = porf_gc_thread_tlabs;
  porf_gc_thread_tlabs = t;
  pthread_mutex_unlock(&porf_gc_thread_tlab_lock);
  porf_gc_thread_tlab = t;
  return t;
}

static void porf_gc_thread_tlabs_clear(void) {
  pthread_mutex_lock(&porf_gc_thread_tlab_lock);
  for (struct porf_gc_thread_tlab* t = porf_gc_thread_tlabs; t != NULL; t = t->next) {
    t->cur = 0;
    t->end = 0;
    t->window_start = 0;
  }
  pthread_mutex_unlock(&porf_gc_thread_tlab_lock);
}

` : ''}\

static void porf_gc_activate_page(u32 pg) {
  const u32 idx = pg >> PORF_GC_SPAGE_SHIFT;
  if ((porf_gc_page_kind[idx] & PORF_GC_PAGE_ACTIVE) != 0u) return;
  porf_gc_page_kind[idx] |= PORF_GC_PAGE_ACTIVE;
  if ((porf_gc_page_kind[idx] & PORF_GC_PAGE_LISTED) != 0u) return;
  porf_gc_page_kind[idx] |= PORF_GC_PAGE_LISTED;
  porf_gc_young_push(&porf_gc_young_active, &porf_gc_young_active_len, &porf_gc_young_active_cap, pg);
}

static void porf_gc_compact_active_pages(void) {
  i32 out = 0;
  for (i32 i = 0; i < porf_gc_young_active_len; i++) {
    const u32 pg = porf_gc_young_active[i];
    const u32 idx = pg >> PORF_GC_SPAGE_SHIFT;
    if ((porf_gc_page_kind[idx] & PORF_GC_PAGE_ACTIVE) != 0u) porf_gc_young_active[out++] = pg;
      else porf_gc_page_kind[idx] &= ~PORF_GC_PAGE_LISTED;
  }
  porf_gc_young_active_len = out;
}

static void porf_gc_touch_page(i32 addr) {
  const u32 pg = (u32)addr & ~PORF_GC_SPAGE_MASK;
  const u32 idx = pg >> PORF_GC_SPAGE_SHIFT;
  porf_gc_activate_page(pg);
  if ((porf_gc_page_kind[idx] & 4u) != 0u) return;
  porf_gc_page_kind[idx] |= 4u;
  porf_gc_young_push(&porf_gc_touched, &porf_gc_touched_len, &porf_gc_touched_cap, pg);
}

static void porf_gc_prepare_aging_pages(void) {
  const i32 len = porf_gc_aging_len;
  porf_gc_aging_len = 0;
  for (i32 i = 0; i < len; i++) porf_gc_touch_page((i32)porf_gc_aging[i]);
}

static u32 porf_gc_pop_free_page(int* cold) {
  while (porf_gc_young_free_len > 0) {
    const u32 pg = porf_gc_young_free[--porf_gc_young_free_len];
    u8* kind = &porf_gc_page_kind[pg >> PORF_GC_SPAGE_SHIFT];
    if ((*kind & (8u | PORF_GC_PAGE_COLD)) == 8u) {
      *kind &= ~(8u | PORF_GC_PAGE_COLD);
      *cold = 0;
      return pg;
    }
  }
  while (porf_gc_young_cold_len > 0) {
    const u32 pg = porf_gc_young_cold[--porf_gc_young_cold_len];
    u8* kind = &porf_gc_page_kind[pg >> PORF_GC_SPAGE_SHIFT];
    if ((*kind & (8u | PORF_GC_PAGE_COLD)) == (8u | PORF_GC_PAGE_COLD)) {
      *kind &= ~(8u | PORF_GC_PAGE_COLD);
      *cold = 1;
      return pg;
    }
  }
  return 0;
}

static inline int porf_gc_free_page_matches(u32 pg, int cold) {
  return (porf_gc_page_kind[pg >> PORF_GC_SPAGE_SHIFT] & (8u | PORF_GC_PAGE_COLD)) ==
    (8u | (cold ? PORF_GC_PAGE_COLD : 0u));
}

static inline void porf_gc_free_page_take(u32 pg) {
  porf_gc_page_kind[pg >> PORF_GC_SPAGE_SHIFT] &= ~(8u | PORF_GC_PAGE_COLD);
}

static int porf_gc_sticky_next_page(u32 need) {
  u32 hole_start;
  u32 hole_end;
  if (porf_gc_hole_take(need, &hole_start, &hole_end)) {
    porf_gc_nursery_cur = hole_start;
    porf_gc_nursery_window_start = porf_gc_nursery_cur;
    porf_gc_nursery_end = hole_end;
    porf_gc_nursery_is_hole = 1;
    porf_gc_window_bytes += porf_gc_nursery_end - porf_gc_nursery_cur;
    porf_gc_touch_page((i32)porf_gc_nursery_cur);
    return 1;
  }
  int cold = 0;
  const u32 pg = porf_gc_pop_free_page(&cold);
  if (pg == 0) return 0;
  u32 lo = pg;
  u32 hi = pg + PORF_GC_SPAGE;
  while (hi - lo < ${usesThreads ? '64u' : '8u'} * PORF_GC_SPAGE && lo >= PORF_GC_SPAGE &&
    porf_gc_free_page_matches(lo - PORF_GC_SPAGE, cold)) lo -= PORF_GC_SPAGE;
  while (hi - lo < ${usesThreads ? '64u' : '8u'} * PORF_GC_SPAGE &&
    porf_gc_free_page_matches(hi, cold)) hi += PORF_GC_SPAGE;
  for (u32 a = lo; a < hi; a += PORF_GC_SPAGE) {
    porf_gc_free_page_take(a);
    porf_gc_touch_page((i32)a);
  }
  porf_gc_window_bytes += hi - lo;
  porf_gc_nursery_cur = lo;
  porf_gc_nursery_window_start = lo;
  porf_gc_nursery_end = hi;
  porf_gc_nursery_is_hole = 0;
  return 1;
}

${usesThreads ? `static int porf_gc_thread_sticky_next_span(void) {
  int cold = 0;
  const u32 pg = porf_gc_pop_free_page(&cold);
  if (pg == 0) return 0;
  u32 lo = pg;
  u32 hi = pg + PORF_GC_SPAGE;
  while (hi - lo < 64u * PORF_GC_SPAGE && lo >= PORF_GC_SPAGE &&
    porf_gc_free_page_matches(lo - PORF_GC_SPAGE, cold)) lo -= PORF_GC_SPAGE;
  while (hi - lo < 64u * PORF_GC_SPAGE &&
    porf_gc_free_page_matches(hi, cold)) hi += PORF_GC_SPAGE;
  for (u32 a = lo; a < hi; a += PORF_GC_SPAGE) {
    porf_gc_free_page_take(a);
    porf_gc_touch_page((i32)a);
  }
  porf_gc_window_bytes += hi - lo;
  porf_gc_nursery_cur = lo;
  porf_gc_nursery_window_start = lo;
  porf_gc_nursery_end = hi;
  return 1;
}

` : ''}\
static u32 porf_gc_span_alloc(u32 size, u32 typeId) {
  const i32 npg = (i32)((size + 8u + PORF_GC_SPAGE_MASK) >> PORF_GC_SPAGE_SHIFT);
  const u32 want = (u32)npg * PORF_GC_SPAGE;
  u32 lo = 0;
  u32 stash[16];
  u8 stash_cold[16];
  i32 stash_len = 0;
  while (stash_len < 16) {
    int cold = 0;
    const u32 seed = porf_gc_pop_free_page(&cold);
    if (seed == 0) break;
    u32 rlo = seed;
    u32 rhi = seed + PORF_GC_SPAGE;
    while (rhi - rlo < want && rlo >= PORF_GC_SPAGE &&
      porf_gc_free_page_matches(rlo - PORF_GC_SPAGE, cold)) rlo -= PORF_GC_SPAGE;
    while (rhi - rlo < want &&
      porf_gc_free_page_matches(rhi, cold)) rhi += PORF_GC_SPAGE;
    if (rhi - rlo >= want) {
      lo = rlo;
      for (u32 a = rlo; a < rlo + want; a += PORF_GC_SPAGE)
        porf_gc_free_page_take(a);
      break;
    }
    stash[stash_len] = seed;
    stash_cold[stash_len++] = (u8)cold;
  }
  for (i32 si = 0; si < stash_len; si++) porf_gc_free_page_push(stash[si], stash_cold[si]);
  if (lo == 0) {
    if (porf_gc_page_kind == NULL) {
      porf_gc_page_kind = calloc(1u << (32 - PORF_GC_SPAGE_SHIFT), 1);
      if (!porf_gc_page_kind) abort();
    }
    if (porf_gc_full_due((i64)want)) {
      ${usesThreads ? 'porf_gc_collect_threaded(0)' : 'porf_gc_collect_impl(0)'};
      return porf_gc_span_alloc(size, typeId);
    }
    porf_gc_claimed_since_full += (i64)want;
    for (i32 k = 0; k < npg; k++) {
      const u32 pg2 = porf_gc_page_claim_top();
      if (pg2 == 0) return 0;
      if (k == 0) lo = pg2;
      else if (pg2 != lo + (u32)k * PORF_GC_SPAGE) return 0;
      porf_gc_page_kind[pg2 >> PORF_GC_SPAGE_SHIFT] = 1u;
    }
  }
  for (i32 k = 1; k < npg; k++) porf_gc_page_kind[(lo + (u32)k * PORF_GC_SPAGE) >> PORF_GC_SPAGE_SHIFT] |= 16u;
  porf_gc_page_kind[lo >> PORF_GC_SPAGE_SHIFT] |= 32u;
  porf_gc_touch_page((i32)lo);
  porf_gc_window_bytes += (i64)want;
  porf_gc_span_bytes += (i64)want;
  u32* h = (u32*)(MEM + lo);
  h[0] = size;
  h[1] = PORF_GC_FLAG_ALLOCATED | porf_gc_alloc_kind_bits(typeId);
  porf_gc_set_block_start(lo + 8);
  porf_gc_init_raw_alloc(lo + 8, size, typeId);
  return lo + 8;
}

static u32 porf_gc_nursery_block_base(i32 p) {
  if (!porf_gc_in_nursery(p)) return 0;
  {
    u32 pb = (u32)p & ~PORF_GC_SPAGE_MASK;
    while (pb >= PORF_GC_SPAGE && (porf_gc_page_kind[pb >> PORF_GC_SPAGE_SHIFT] & 16u) != 0u) pb -= PORF_GC_SPAGE;
    if ((porf_gc_page_kind[pb >> PORF_GC_SPAGE_SHIFT] & 32u) != 0u) {
      const u32 sbody = pb + 8;
      if (porf_gc_is_block_start((i32)sbody)) {
        const u32 ssz = porf_gc_header((i32)sbody)[0];
        if ((u32)p < pb + 8u + ssz) return sbody;
      }
      return 0;
    }
  }
  i32 slot = p >> 3;
  const i32 min_slot = (i32)((((u32)p & ~PORF_GC_SPAGE_MASK) + 8u) >> 3);
  const i32 limit_slot = slot - (i32)(PORF_GC_SPAGE / 8u) - 16;
  while (slot >= min_slot && slot > limit_slot) {
    const u8 byte = porf_gc_block_starts[slot >> 3];
    if (byte != 0u) {
      const i32 bit = slot & 7;
      const u8 masked = (u8)(byte & (u8)((1u << (bit + 1)) - 1u));
      if (masked != 0u) {
        const i32 found_slot = (slot & ~7) + (31 - __builtin_clz((u32)masked));
        const u32 base = (u32)found_slot << 3;
        if (base < porf_heap_base + 8) return 0;
        const u32 size = porf_gc_header((i32)base)[0];
        if ((u32)(p - (i32)base) <= size) return base;
        return 0;
      }
    }
    slot = (slot & ~7) - 1;
  }
  return 0;
}

static u32 porf_gc_any_block_base(i32 p) {
  if (p < (i32)porf_heap_base + 8 || (u32)p >= porf_heap_top) return 0;
  if (porf_gc_in_nursery(p)) return porf_gc_nursery_block_base(p);
  i32 slot = p >> 3;
  const i32 min_slot = ((i32)porf_heap_base + 8) >> 3;
  const i32 limit_slot = slot - (i32)(1048576 / 8) - 16;
  while (slot >= min_slot && slot > limit_slot) {
    if ((slot & 7) == 7 && ((slot >> 3) & 7) == 7 && slot - 63 > min_slot && slot - 63 > limit_slot) {
      const u64 w = *(const u64*)(porf_gc_block_starts + ((slot >> 3) & ~7));
      if (w == 0ull) { slot -= 64; continue; }
    }
    const u8 byte = porf_gc_block_starts[slot >> 3];
    if (byte != 0u) {
      const i32 bit = slot & 7;
      const u8 masked = (u8)(byte & (u8)((1u << (bit + 1)) - 1u));
      if (masked != 0u) {
        const i32 found_slot = (slot & ~7) + (31 - __builtin_clz((u32)masked));
        const u32 base = (u32)found_slot << 3;
        if (base < porf_heap_base + 8) return 0;
        const u32 size = porf_gc_header((i32)base)[0];
        if ((u32)(p - (i32)base) <= size) return base;
        return 0;
      }
    }
    slot = (slot & ~7) - 1;
  }
  return 0;
}

static void porf_gc_clear_block_start_range(i32 lo, i32 hi) {
  if (hi <= lo) return;
  const u32 slot_lo = (u32)lo >> 3;
  const u32 slot_hi = ((u32)hi - 1u) >> 3;
  const u32 byte_lo = slot_lo >> 3;
  const u32 byte_hi = slot_hi >> 3;
  if (byte_lo == byte_hi) {
    const u8 mask = (u8)((u8)((1u << ((slot_hi & 7u) + 1u)) - 1u) & (u8)~((1u << (slot_lo & 7u)) - 1u));
    porf_gc_block_starts[byte_lo] &= (u8)~mask;
    return;
  }
  porf_gc_block_starts[byte_lo] &= (u8)((1u << (slot_lo & 7u)) - 1u);
  if (byte_hi > byte_lo + 1u) memset(porf_gc_block_starts + byte_lo + 1u, 0, (size_t)(byte_hi - byte_lo - 1u));
  porf_gc_block_starts[byte_hi] &= (u8)~((1u << ((slot_hi & 7u) + 1u)) - 1u);
}

static void porf_gc_publish_alloc_range(u32 start, u32 end) {
  while (start < end) {
    porf_gc_set_block_start(start + 8);
    start += 8u + *(u32*)(MEM + start);
  }
}

static void porf_gc_publish_young_block_starts(void) {
  porf_gc_publish_alloc_range(porf_gc_nursery_window_start, porf_gc_nursery_cur);
  porf_gc_nursery_window_start = porf_gc_nursery_cur;
${usesThreads ? `  pthread_mutex_lock(&porf_gc_thread_tlab_lock);
  for (struct porf_gc_thread_tlab* t = porf_gc_thread_tlabs; t != NULL; t = t->next) {
    porf_gc_publish_alloc_range(t->window_start, t->cur);
    t->window_start = t->cur;
  }
  pthread_mutex_unlock(&porf_gc_thread_tlab_lock);
` : ''}\
}

static void porf_gc_mark_boxed_primitive(f64 value, i32 type) {
  for (i32 i = 0; i < porf_gc_boxed_marks_len; i++)
    if (porf_gc_boxed_marks[i].type == type && porf_gc_boxed_marks[i].value == value) return;
  if (porf_gc_boxed_marks_len == porf_gc_boxed_marks_cap) {
    const i32 new_cap = porf_gc_boxed_marks_cap == 0 ? 64 : porf_gc_boxed_marks_cap * 2;
    struct porf_gc_boxed_mark* grown = realloc(porf_gc_boxed_marks, (size_t)new_cap * sizeof(*grown));
    if (!grown) abort();
    porf_gc_boxed_marks = grown;
    porf_gc_boxed_marks_cap = new_cap;
  }
  porf_gc_boxed_marks[porf_gc_boxed_marks_len++] = (struct porf_gc_boxed_mark){ value, type };
}
static int porf_gc_is_marked_boxed_primitive(f64 value, i32 type) {
  for (i32 i = 0; i < porf_gc_boxed_marks_len; i++)
    if (porf_gc_boxed_marks[i].type == type && porf_gc_boxed_marks[i].value == value) return 1;
  return 0;
}

static inline u64 porf_gc_static_mark_key(i32 body, i32 type) {
  return ((((u64)(u32)body) << 8) | (u64)(u8)type) + 1u;
}
static inline u64 porf_gc_static_mark_hash(u64 key) {
  key ^= key >> 33;
  key *= 0xff51afd7ed558ccdull;
  key ^= key >> 33;
  return key;
}
static int porf_gc_static_is_marked(i32 body, i32 type) {
  if (porf_gc_static_marks_cap == 0) return 0;
  const u64 key = porf_gc_static_mark_key(body, type);
  const u32 mask = (u32)porf_gc_static_marks_cap - 1u;
  u32 pos = (u32)porf_gc_static_mark_hash(key) & mask;
  while (porf_gc_static_marks[pos] != 0) {
    if (porf_gc_static_marks[pos] == key) return 1;
    pos = (pos + 1u) & mask;
  }
  return 0;
}
static void porf_gc_static_marks_grow(void) {
  const i32 old_cap = porf_gc_static_marks_cap;
  u64* old = porf_gc_static_marks;
  const i32 new_cap = old_cap == 0 ? 128 : old_cap * 2;
  u64* grown = calloc((size_t)new_cap, sizeof(*grown));
  if (!grown) abort();
  porf_gc_static_marks = grown;
  porf_gc_static_marks_cap = new_cap;
  if (old != NULL) {
    const u32 mask = (u32)new_cap - 1u;
    for (i32 i = 0; i < old_cap; i++) {
      const u64 key = old[i];
      if (key == 0) continue;
      u32 pos = (u32)porf_gc_static_mark_hash(key) & mask;
      while (porf_gc_static_marks[pos] != 0) pos = (pos + 1u) & mask;
      porf_gc_static_marks[pos] = key;
    }
    free(old);
  }
}
static int porf_gc_mark_static(i32 body, i32 type) {
  if (porf_gc_static_is_marked(body, type)) return 0;
  if (porf_gc_static_marks_len * 2 >= porf_gc_static_marks_cap) porf_gc_static_marks_grow();
  const u64 key = porf_gc_static_mark_key(body, type);
  const u32 mask = (u32)porf_gc_static_marks_cap - 1u;
  u32 pos = (u32)porf_gc_static_mark_hash(key) & mask;
  while (porf_gc_static_marks[pos] != 0) pos = (pos + 1u) & mask;
  porf_gc_static_marks[pos] = key;
  porf_gc_static_marks_len++;
  return 1;
}

static void porf_gc_enqueue_mark(i32 body, i32 type) {
  if (porf_gc_mark_queue_len == porf_gc_mark_queue_cap) {
    const i32 new_cap = porf_gc_mark_queue_cap == 0 ? 4096 : porf_gc_mark_queue_cap * 2;
    struct porf_gc_mark_item* grown = realloc(porf_gc_mark_queue, (size_t)new_cap * sizeof(*grown));
    if (!grown) abort();
    porf_gc_mark_queue = grown;
    porf_gc_mark_queue_cap = new_cap;
  }
  porf_gc_mark_queue[porf_gc_mark_queue_len++] = (struct porf_gc_mark_item){ (u32)body, type };
}

static int porf_gc_mark_body(i32 body) {
  if (!porf_gc_is_block_start(body)) return 0;
  if (porf_gc_minor_mode && porf_gc_is_old(body)) return 0;
  u32* header = porf_gc_header(body);
  if ((header[1] & PORF_GC_FLAG_ALLOCATED) == 0u) return 0;
  if ((header[1] & PORF_GC_FLAG_MARKED) != 0u) return 0;
  header[1] |= PORF_GC_FLAG_MARKED;
  return 1;
}

static void porf_gc_mark_raw(i32 body) {
  if (body == 0) return;
  if (!porf_gc_is_block_start(body)) return;
  if (porf_gc_minor_mode && porf_gc_is_old(body)) return;
  u32* header = porf_gc_header(body);
  if ((header[1] & PORF_GC_FLAG_ALLOCATED) == 0u) return;
  header[1] |= PORF_GC_FLAG_RAW;
}

static void porf_gc_clear_heap_marks(void) {
  if (porf_gc_block_starts == NULL) return;
  const u32 start_slot = (porf_heap_base + 8u) >> 3;
  const u32 end_slot = (porf_heap_top + 7u) >> 3;
  const u32 end_word = (end_slot + 63u) >> 6;
  for (u32 wi = start_slot >> 6; wi < end_word; wi++) {
    const u32 word_slot = wi << 6;
    u64 word = *(const u64*)(porf_gc_block_starts + (size_t)wi * sizeof(u64));
    if (word_slot < start_slot) word &= ~0ull << (start_slot - word_slot);
    if (word_slot + 64u > end_slot) word &= (1ull << (end_slot - word_slot)) - 1ull;
    while (word != 0ull) {
      const u32 slot = word_slot + (u32)__builtin_ctzll(word);
      word &= word - 1ull;
      u32* header = porf_gc_header((i32)(slot << 3));
      if ((header[1] & PORF_GC_FLAG_ALLOCATED) == 0u) continue;
      header[1] &= ~(PORF_GC_FLAG_MARKED | PORF_GC_FLAG_RAW | (0xffu << PORF_GC_TEMP_TYPE_SHIFT));
    }
  }
}

${sti}int porf_gc_type_can_reference(i32 type) {
  switch (type) {
    case ${TYPES.undefined}:
    case ${TYPES.number}:
    case ${TYPES.boolean}:
    case ${TYPES.numberobject}:
    case ${TYPES.booleanobject}:
      return 0;
  }
  return 1;
}

static inline i32 porf_gc_value_body(f64 value, i32 type) {
  if (type == ${TYPES.bigint}) {
    if (value < 2251799813685248.0) return 0;
    value -= 2251799813685248.0;
  }
  return (i32)value;
}

static int porf_gc_object_shape_valid(i32 body) {
  if (!porf_gc_is_block_start(body)) return 0;
  const u32 block_size = porf_gc_header(body)[0];
  if (block_size < 16u) return 0;
  const u32 size = *(u16*)(MEM + body);
  const u32 capacity = *(u16*)(MEM + body + 2);
  if (size > capacity) return 0;
  const i32 entries = *(u32*)(MEM + body + 12);
  const u64 entry_bytes = (u64)capacity * 20ull;
  if (entries == body + 16) return 16ull + entry_bytes <= (u64)block_size;
  if (!porf_gc_is_block_start(entries)) return 0;
  return (u64)porf_gc_header(entries)[0] >= entry_bytes;
}

static int porf_gc_static_object_shape_valid(i32 body) {
  if (!porf_gc_static_range(body, 16ull)) return 0;
  const u32 size = *(u16*)(MEM + body);
  const u32 capacity = *(u16*)(MEM + body + 2);
  if (size > capacity) return 0;
  const i32 entries = *(u32*)(MEM + body + 12);
  const u64 entry_bytes = (u64)capacity * 20ull;
  if (entries == body + 16) return porf_gc_static_range(body, 16ull + entry_bytes);
  if (porf_gc_in_static(entries)) return porf_gc_static_range(entries, entry_bytes);
  if (!porf_gc_is_block_start(entries)) return 0;
  return (u64)porf_gc_header(entries)[0] >= entry_bytes;
}

static int porf_gc_array_like_shape_valid(i32 body) {
  if (!porf_gc_is_block_start(body)) return 0;
  const u32 block_size = porf_gc_header(body)[0];
  if (block_size < 16u) return 0;
  const u32 len = *(u32*)(MEM + body);
  const i32 entries = *(u32*)(MEM + body + 4);
  const u32 capacity = *(u32*)(MEM + body + 8);
  if (len > capacity) return 0;
  const u64 bytes = (u64)capacity * 8ull;
  if (entries == body + 16) return 16ull + bytes <= (u64)block_size;
  if (!porf_gc_is_block_start(entries)) return 0;
  return bytes <= (u64)porf_gc_header(entries)[0];
}

static int porf_gc_static_array_like_shape_valid(i32 body) {
  if (!porf_gc_static_range(body, 16ull)) return 0;
  const u32 len = *(u32*)(MEM + body);
  const i32 entries = *(u32*)(MEM + body + 4);
  const u32 capacity = *(u32*)(MEM + body + 8);
  if (len > capacity) return 0;
  const u64 bytes = (u64)capacity * 8ull;
  if (entries == body + 16) return porf_gc_static_range(body, 16ull + bytes);
  return porf_gc_static_range(entries, bytes);
}

static int porf_gc_is_marked_js(f64 value, i32 type) {
  switch (type) {
    case ${TYPES.undefined}:
    case ${TYPES.number}:
    case ${TYPES.boolean}:
      return 0;
    case ${TYPES.numberobject}:
    case ${TYPES.booleanobject}:
      return porf_gc_is_marked_boxed_primitive(value, type);
  }
  const i32 body = porf_gc_value_body(value, type);
  if (body == 0) return 0;
  if (porf_gc_minor_mode && porf_gc_is_old(body)) return 1;
  if (porf_gc_in_static(body)) return porf_gc_static_is_marked(body, type);
  if (porf_gc_is_block_start(body)) return (porf_gc_header(body)[1] & PORF_GC_FLAG_MARKED) != 0u;
  return 0;
}

struct porf_gc_native_root {
  f64 value;
  i32 type;
};

static struct porf_gc_native_root* porf_gc_native_roots = NULL;
static i32 porf_gc_native_roots_len = 0;
static i32 porf_gc_native_roots_cap = 0;
static i32* porf_gc_native_root_free_slots = NULL;
static i32 porf_gc_native_root_free_slots_len = 0;
static i32* porf_gc_native_root_active = NULL;
static i32* porf_gc_native_root_active_pos = NULL;
static i32 porf_gc_native_root_active_len = 0;
${usesThreads ? 'static pthread_mutex_t porf_gc_native_root_lock = PTHREAD_MUTEX_INITIALIZER;\n' : ''}

i32 porf_gc_native_root_add(f64 value, i32 type) {
  if (type == ${TYPES.undefined} || type == ${TYPES.number} || type == ${TYPES.boolean}) return -1;
${usesThreads ? '  pthread_mutex_lock(&porf_gc_native_root_lock);\n' : ''}\
  if (porf_gc_native_roots_len == porf_gc_native_roots_cap) {
    i32 new_cap = porf_gc_native_roots_cap == 0 ? 64 : porf_gc_native_roots_cap * 2;
    struct porf_gc_native_root* grown = realloc(porf_gc_native_roots, (size_t)new_cap * sizeof(*grown));
    i32* grown_free_slots = realloc(porf_gc_native_root_free_slots, (size_t)new_cap * sizeof(*grown_free_slots));
    i32* grown_active = realloc(porf_gc_native_root_active, (size_t)new_cap * sizeof(*grown_active));
    i32* grown_active_pos = realloc(porf_gc_native_root_active_pos, (size_t)new_cap * sizeof(*grown_active_pos));
    if (!grown || !grown_free_slots || !grown_active || !grown_active_pos) abort();
    for (i32 i = porf_gc_native_roots_cap; i < new_cap; i++) {
      grown[i].value = 0;
      grown[i].type = ${TYPES.undefined};
      grown_active_pos[i] = -1;
    }
    porf_gc_native_roots = grown;
    porf_gc_native_root_free_slots = grown_free_slots;
    porf_gc_native_root_active = grown_active;
    porf_gc_native_root_active_pos = grown_active_pos;
    porf_gc_native_roots_cap = new_cap;
  }

  i32 slot;
  if (porf_gc_native_root_free_slots_len > 0) slot = porf_gc_native_root_free_slots[--porf_gc_native_root_free_slots_len];
    else slot = porf_gc_native_roots_len++;
  porf_gc_native_roots[slot].value = value;
  porf_gc_native_roots[slot].type = type;
  porf_gc_native_root_active_pos[slot] = porf_gc_native_root_active_len;
  porf_gc_native_root_active[porf_gc_native_root_active_len++] = slot;
${usesThreads ? '  pthread_mutex_unlock(&porf_gc_native_root_lock);\n' : ''}\
  return slot;
}

void porf_gc_native_root_remove(i32 slot) {
  if (slot < 0 || slot >= porf_gc_native_roots_len) return;
  if (porf_gc_native_roots[slot].type == ${TYPES.undefined}) return;
${usesThreads ? '  pthread_mutex_lock(&porf_gc_native_root_lock);\n' : ''}\
  porf_gc_native_roots[slot].value = 0;
  porf_gc_native_roots[slot].type = ${TYPES.undefined};
  porf_gc_native_root_free_slots[porf_gc_native_root_free_slots_len++] = slot;

  const i32 pos = porf_gc_native_root_active_pos[slot];
  const i32 last_slot = porf_gc_native_root_active[--porf_gc_native_root_active_len];
  if (pos != porf_gc_native_root_active_len) {
    porf_gc_native_root_active[pos] = last_slot;
    porf_gc_native_root_active_pos[last_slot] = pos;
  }
  porf_gc_native_root_active_pos[slot] = -1;
${usesThreads ? '  pthread_mutex_unlock(&porf_gc_native_root_lock);\n' : ''}\
}

static void porf_gc_mark_native_roots(void) {
${usesThreads ? '  pthread_mutex_lock(&porf_gc_native_root_lock);\n' : ''}\
  for (i32 i = 0; i < porf_gc_native_root_active_len; i++) {
    const i32 slot = porf_gc_native_root_active[i];
    porf_gc_mark_js(porf_gc_native_roots[slot].value, porf_gc_native_roots[slot].type);
  }
${usesThreads ? '  pthread_mutex_unlock(&porf_gc_native_root_lock);\n' : ''}\
}

static void porf_gc_mark_array_entries(i32 entries, u32 len) {
  for (u32 i = 0; i < len; i++) {
    const jsbits b = *(jsbits*)(MEM + entries + ((u64)i << 3));
    if (b == 0) continue;
    const jsval v = porf_unpack(b);
    if (porf_gc_type_can_reference(v.type)) porf_gc_mark_js(v.val, v.type);
  }
}

static void porf_gc_mark_array_like(i32 body) {
  u32 len = *(u32*)(MEM + body);
  i32 entries = *(u32*)(MEM + body + 4);
  const u32 capacity = *(u32*)(MEM + body + 8);
  if (len > capacity) len = capacity;
  if (entries == body + 16) {
    if (porf_gc_is_block_start(body)) {
      const u32 block_size = porf_gc_header(body)[0];
      const u32 max_len = block_size >= 16u ? (block_size - 16u) / 8u : 0u;
      if (len > max_len) len = max_len;
    } else if (!porf_gc_static_range(body, 16ull + (u64)len * 8ull)) return;
    porf_gc_mark_array_entries(entries, len);
    return;
  }
  if (porf_gc_is_block_start(entries)) {
    const u32 max_len = porf_gc_header(entries)[0] / 8u;
    if (len > max_len) len = max_len;
    porf_gc_mark_body(entries);
    porf_gc_set_kind(entries, PORF_GC_KIND_ARRAY_ENTRIES);
    porf_gc_mark_array_entries(entries, len);
    return;
  }
  if (porf_gc_in_static(entries)) {
    if (!porf_gc_static_range(entries, (u64)len * 8ull)) return;
    porf_gc_mark_array_entries(entries, len);
  }
}

static void porf_gc_mark_jsbits(jsbits bits) {
  const jsval v = porf_unpack(bits);
  if (porf_gc_type_can_reference(v.type)) porf_gc_mark_js(v.val, v.type);
}

static void porf_gc_mark_promise_reaction(u32 raw);

static void porf_gc_mark_promise_reaction_chain(u32 raw) {
  while (raw != 0) {
    const u32 next = *(u32*)(MEM + raw + PORF_REACTION_NEXT);
    porf_gc_mark_promise_reaction(raw);
    raw = next;
  }
}

static void porf_gc_mark_promise_reaction(u32 raw) {
  if (raw == 0 || !porf_gc_is_block_start((i32)raw)) return;
  if (!porf_gc_mark_body((i32)raw) && porf_gc_kind((i32)raw) == PORF_GC_KIND_PROMISE_REACTION) return;
  porf_gc_set_kind((i32)raw, PORF_GC_KIND_PROMISE_REACTION);
  const u8 kind = *(u8*)(MEM + raw + PORF_REACTION_KIND);
  if (kind == 11) porf_gc_mark_coro_handle((uintptr_t)*(u64*)(MEM + raw + PORF_REACTION_HANDLER));
    else if (kind != 12) porf_gc_mark_jsbits(*(jsbits*)(MEM + raw + PORF_REACTION_HANDLER));
  porf_gc_mark_jsbits(*(jsbits*)(MEM + raw + PORF_REACTION_OUT_PROMISE));
  porf_gc_mark_jsbits(*(jsbits*)(MEM + raw + PORF_REACTION_VALUE));
}

static void porf_gc_mark_promise_jobs(void) {
  for (u32 i = 0; i < porf_promise_job_len; i++) {
    porf_gc_mark_promise_reaction(porf_promise_job_queue[(porf_promise_job_head + i) & (porf_promise_job_cap - 1u)]);
  }
}

static void porf_gc_mark_promise_body(i32 body) {
  porf_gc_mark_jsbits(*(jsbits*)(MEM + body + PORF_PROMISE_RESULT));
  porf_gc_mark_promise_reaction_chain(*(u32*)(MEM + body + PORF_PROMISE_FULFILL_HEAD));
  porf_gc_mark_promise_reaction_chain(*(u32*)(MEM + body + PORF_PROMISE_REJECT_HEAD));
  porf_gc_mark_jsbits(*(jsbits*)(MEM + body + PORF_PROMISE_PAYLOAD));
}

static int porf_gc_has_marked_array_like_type(i32 body) {
  if (!porf_gc_is_block_start(body)) return 0;
  const u32 flags = porf_gc_header(body)[1];
  if ((flags & PORF_GC_FLAG_MARKED) == 0u) return 0;
  switch ((flags >> PORF_GC_TEMP_TYPE_SHIFT) & 0xffu) {
    case ${TYPES.array}:
      return 1;
  }
  return 0;
}

static int porf_gc_has_marked_type_simple(i32 body, i32 type) {
  if (!porf_gc_is_block_start(body)) return 0;
  const u32 flags = porf_gc_header(body)[1];
  return (flags & PORF_GC_FLAG_MARKED) != 0u &&
    (i32)((flags >> PORF_GC_TEMP_TYPE_SHIFT) & 0xffu) == type;
}

static int porf_gc_should_rescan_marked_body(i32 body, i32 type) {
  switch (type) {
    case ${TYPES.object}:
      return !porf_gc_has_marked_type(body, type) && porf_gc_object_shape_valid(body);
    case ${TYPES.array}:
      return !porf_gc_has_marked_array_like_type(body) && porf_gc_array_like_shape_valid(body);
    case ${TYPES.promise}:
      return !porf_gc_has_marked_type_simple(body, type);
    case ${TYPES.function}:
    case ${TYPES.map}:
    case ${TYPES.set}:
    case ${TYPES.weakmap}:
    case ${TYPES.weakset}:
    case ${TYPES.__porffor_generator}:
    case ${TYPES.__porffor_asyncgenerator}:
    case ${TYPES.symbol}:
    case ${TYPES.weakref}:
    case ${TYPES.error}:
    case ${TYPES.aggregateerror}:
    case ${TYPES.typeerror}:
    case ${TYPES.referenceerror}:
    case ${TYPES.syntaxerror}:
    case ${TYPES.rangeerror}:
    case ${TYPES.evalerror}:
    case ${TYPES.urierror}:
    case ${TYPES.regexp}:
    case ${TYPES.dataview}:
    case ${TYPES.uint8clampedarray}:
    case ${TYPES.uint8array}:
    case ${TYPES.int8array}:
    case ${TYPES.uint16array}:
    case ${TYPES.int16array}:
    case ${TYPES.uint32array}:
    case ${TYPES.int32array}:
    case ${TYPES.float32array}:
    case ${TYPES.float64array}:
    case ${TYPES.bigint64array}:
    case ${TYPES.biguint64array}:
      return !porf_gc_has_marked_type(body, type);
  }
  return 0;
}

static void porf_gc_mark_function_raw(u32 raw) {
  const i32 body = (i32)raw;
  if (!porf_gc_in_heap(body)) return;
  if (!porf_gc_mark_body(body) && porf_gc_kind(body) == PORF_GC_KIND_FUNCTION) return;
  porf_gc_set_kind(body, PORF_GC_KIND_FUNCTION);
  const i32 env = *(u32*)(MEM + body + 4);
  if (env != 0) porf_gc_mark_js((f64)env, ${TYPES.object});
}

static void porf_gc_scan_body(i32 body, i32 type) {
  switch (type) {
    case ${TYPES.object}: {
      const i32 proto = *(u32*)(MEM + body + 8);
      const i32 proto_type = *(u8*)(MEM + body + 5);
      if (proto != 0 || proto_type != ${TYPES.undefined}) porf_gc_mark_js((f64)proto, proto_type);
      u32 size = *(u16*)(MEM + body);
      const i32 entries = *(u32*)(MEM + body + 12);
      if (entries != 0) {
        porf_gc_mark_body(entries);
        if (entries != body + 16) {
          porf_gc_set_kind(entries, PORF_GC_KIND_OBJECT_ENTRIES);
          if (porf_gc_is_block_start(entries)) {
            const u32 max_size = porf_gc_header(entries)[0] / 20u;
            if (size > max_size) size = max_size;
          }
        }
      }
      for (u32 i = 0; i < size; i++) {
        const i32 entry = entries + (i32)(i * 20u);
        const u32 key_raw = *(u32*)(MEM + entry + 4);
        const i32 key_type = *(u8*)(MEM + entry + 18);
        porf_gc_mark_js((f64)key_raw, key_type);
        const u8 flags = *(u8*)(MEM + entry + 16);
        if ((flags & 1u) != 0u) {
          const u32 get = *(u32*)(MEM + entry + 8);
          const u32 set = *(u32*)(MEM + entry + 12);
          if (get != 0) porf_gc_mark_js((f64)get, ${TYPES.function});
          if (set != 0) porf_gc_mark_js((f64)set, ${TYPES.function});
        } else {
          porf_gc_mark_js(porf_load_un_f64(MEM + entry + 8), *(u8*)(MEM + entry + 17));
        }
      }
      break;
    }
    case ${TYPES.array}:
      porf_gc_mark_array_like(body);
      break;
    case ${TYPES.promise}:
      porf_gc_mark_promise_body(body);
      break;
    case ${TYPES.__porffor_generator}:
    case ${TYPES.__porffor_asyncgenerator}:
      porf_gc_mark_coro_handle(*(uintptr_t*)(MEM + body));
      break;
    case ${TYPES.function}: {
      const i32 env = *(u32*)(MEM + body + 4);
      if (env != 0) porf_gc_mark_js((f64)env, ${TYPES.object});
      break;
    }
    case ${TYPES.map}:
    case ${TYPES.set}:
    case ${TYPES.weakset}: {
      const i32 keys = *(u32*)(MEM + body);
      const i32 vals = *(u32*)(MEM + body + 4);
      const i32 buckets = *(u32*)(MEM + body + 8);
      if (keys != 0) porf_gc_mark_js((f64)keys, ${TYPES.array});
      if (vals != 0) porf_gc_mark_js((f64)vals, ${TYPES.array});
      if (buckets != 0) porf_gc_mark_body(buckets);
      break;
    }
    case ${TYPES.weakmap}: {
      for (i32 i = 0; i < porf_gc_weakmaps_len; i++) if (porf_gc_weakmaps[i] == (u32)body) goto weakmap_seen;
      if (porf_gc_weakmaps_len == porf_gc_weakmaps_cap) {
        const i32 new_cap = porf_gc_weakmaps_cap == 0 ? 64 : porf_gc_weakmaps_cap * 2;
        u32* grown = realloc(porf_gc_weakmaps, (size_t)new_cap * sizeof(*grown));
        if (!grown) abort();
        porf_gc_weakmaps = grown;
        porf_gc_weakmaps_cap = new_cap;
      }
      porf_gc_weakmaps[porf_gc_weakmaps_len++] = (u32)body;
weakmap_seen:
      {
        const i32 keys = *(u32*)(MEM + body);
        const i32 vals = *(u32*)(MEM + body + 4);
        const i32 buckets = *(u32*)(MEM + body + 8);
        if (keys != 0) {
          porf_gc_mark_body(keys);
          porf_gc_set_marked_type(keys, ${TYPES.array});
          u32 len = 0;
          if (porf_gc_array_like_shape_valid(keys)) { len = *(u32*)(MEM + keys); (void)len; }
        }
        if (vals != 0) {
          porf_gc_mark_body(vals);
          porf_gc_set_marked_type(vals, ${TYPES.array});
        }
        if (buckets != 0) porf_gc_mark_body(buckets);
      }
      break;
    }
    case ${TYPES.symbol}:
    case ${TYPES.weakref}: {
      const jsval v = porf_unpack(*(jsbits*)(MEM + body));
      porf_gc_mark_js(v.val, v.type);
      break;
    }
    case ${TYPES.error}:
    case ${TYPES.aggregateerror}:
    case ${TYPES.typeerror}:
    case ${TYPES.referenceerror}:
    case ${TYPES.syntaxerror}:
    case ${TYPES.rangeerror}:
    case ${TYPES.evalerror}:
    case ${TYPES.urierror}: {
      const jsval v = porf_unpack(*(jsbits*)(MEM + body));
      porf_gc_mark_js(v.val, v.type);
      break;
    }
    case ${TYPES.regexp}: {
      porf_gc_mark_js((f64)(*(u32*)(MEM + body)), ${TYPES.bytestring});
      const i32 re_blob = *(u32*)(MEM + body + 12);
      if (re_blob != 0) porf_gc_mark_body(re_blob);
      const i32 re_names = *(u32*)(MEM + body + 16);
      if (re_names != 0) porf_gc_mark_js((f64)re_names, ${TYPES.array});
      break;
    }
    case ${TYPES.dataview}: {
      const i32 ptr = *(u32*)(MEM + body + 4);
      const i32 byte_offset = *(u32*)(MEM + body + 8);
      const i32 buffer = ptr - byte_offset;
      if (buffer != 0) porf_gc_mark_body(buffer);
      break;
    }
    case ${TYPES.uint8clampedarray}:
    case ${TYPES.uint8array}:
    case ${TYPES.int8array}:
    case ${TYPES.uint16array}:
    case ${TYPES.int16array}:
    case ${TYPES.uint32array}:
    case ${TYPES.int32array}:
    case ${TYPES.float32array}:
    case ${TYPES.float64array}:
    case ${TYPES.bigint64array}:
    case ${TYPES.biguint64array}: {
      const i32 buffer = *(u32*)(MEM + body + 4) - *(u32*)(MEM + body + 8);
      if (buffer != 0) porf_gc_mark_body(buffer);
      break;
    }
  }
}

static void porf_gc_mark_js(f64 value, i32 type) {
  switch (type) {
    case ${TYPES.undefined}:
    case ${TYPES.number}:
    case ${TYPES.boolean}:
      return;
    case ${TYPES.numberobject}:
    case ${TYPES.booleanobject}:
      porf_gc_mark_boxed_primitive(value, type);
      return;
  }
  const i32 body = porf_gc_value_body(value, type);
  if (body == 0) return;
  if (porf_gc_is_block_start(body)) {
    if (type == ${TYPES.object} && !porf_gc_object_shape_valid(body)) return;
    if (!porf_gc_mark_body(body)) {
      if (porf_gc_minor_mode && porf_gc_is_old(body)) return;
      if (porf_gc_should_rescan_marked_body(body, type)) {
        porf_gc_set_marked_type(body, type);
        porf_gc_enqueue_mark(body, type);
      }
      return;
    }
    porf_gc_set_marked_type(body, type);
    porf_gc_enqueue_mark(body, type);
    return;
  }
  if (!porf_gc_in_static(body)) return;
  switch (type) {
    case ${TYPES.object}:
      if (!porf_gc_static_object_shape_valid(body)) return;
      break;
    case ${TYPES.array}:
      if (!porf_gc_static_array_like_shape_valid(body)) return;
      break;
    case ${TYPES.promise}:
      return;
    case ${TYPES.__porffor_generator}:
    case ${TYPES.__porffor_asyncgenerator}:
      return;
    case ${TYPES.string}:
    case ${TYPES.bytestring}:
    case ${TYPES.function}:
    case ${TYPES.bigint}:
    case ${TYPES.symbol}:
    case ${TYPES.regexp}:
    case ${TYPES.date}:
    case ${TYPES.map}:
    case ${TYPES.set}:
    case ${TYPES.weakmap}:
    case ${TYPES.weakset}:
    case ${TYPES.weakref}:
    case ${TYPES.error}:
    case ${TYPES.aggregateerror}:
    case ${TYPES.typeerror}:
    case ${TYPES.referenceerror}:
    case ${TYPES.syntaxerror}:
    case ${TYPES.rangeerror}:
    case ${TYPES.evalerror}:
    case ${TYPES.urierror}:
      break;
    default:
      return;
  }
  if (!porf_gc_mark_static(body, type)) return;
  porf_gc_enqueue_mark(body, type);
}

static i32 porf_gc_drain_mark_queue_budget(i32 budget) {
  i32 done = 0;
  while (porf_gc_mark_queue_len > 0 && done < budget) {
    const struct porf_gc_mark_item item = porf_gc_mark_queue[--porf_gc_mark_queue_len];
    porf_gc_scan_body((i32)item.body, item.type);
    done++;
  }
  return done;
}
static void porf_gc_drain_mark_queue(void) {
  while (porf_gc_mark_queue_len > 0) porf_gc_drain_mark_queue_budget(4096);
}

static void porf_gc_scan_object_entries(i32 entries) {
  if (!porf_gc_is_block_start(entries)) return;
  const u32 capacity = porf_gc_header(entries)[0] / 20u;
  for (u32 i = 0; i < capacity; i++) {
    const i32 entry = entries + (i32)(i * 20u);
    const i32 key_type = *(u8*)(MEM + entry + 18);
    if (porf_gc_type_can_reference(key_type)) porf_gc_mark_js((f64)(*(u32*)(MEM + entry + 4)), key_type);
    const u8 flags = *(u8*)(MEM + entry + 16);
    if ((flags & 1u) != 0u) {
      const u32 get = *(u32*)(MEM + entry + 8);
      const u32 set = *(u32*)(MEM + entry + 12);
      if (get != 0) porf_gc_mark_js((f64)get, ${TYPES.function});
      if (set != 0) porf_gc_mark_js((f64)set, ${TYPES.function});
    } else {
      const i32 value_type = *(u8*)(MEM + entry + 17);
      if (porf_gc_type_can_reference(value_type)) porf_gc_mark_js(porf_load_un_f64(MEM + entry + 8), value_type);
    }
  }
}

static void porf_gc_scan_underlying_store(i32 body) {
  const u32 len = *(u32*)(MEM + body);
  for (u32 i = 0; i < len; i++) {
    const i32 base = body + 8 + (i32)(i * 16u);
    const jsval original = porf_unpack(*(jsbits*)(MEM + base));
    porf_gc_mark_js(original.val, original.type);
    const i32 underlying = *(u32*)(MEM + base + 8);
    if (underlying != 0) porf_gc_mark_js((f64)underlying, ${TYPES.object});
  }
}

static void porf_gc_scan_regex_cache(i32 cache) {
  while (cache != 0 && porf_gc_is_block_start(cache)) {
    porf_gc_mark_js((f64)(*(u32*)(MEM + cache + 4)), ${TYPES.bytestring});
    porf_gc_mark_js((f64)(*(u32*)(MEM + cache + 8)), ${TYPES.bytestring});
    const i32 cache_blob = *(u32*)(MEM + cache + 12);
    if (cache_blob != 0) porf_gc_mark_body(cache_blob);
    const i32 cache_names = *(u32*)(MEM + cache + 16);
    if (cache_names != 0) porf_gc_mark_js((f64)cache_names, ${TYPES.array});
    cache = *(u32*)(MEM + cache);
  }
}

static void porf_gc_scan_remembered_block(i32 body) {
  if (!porf_gc_is_block_start(body)) return;
  const u32 kind = porf_gc_kind(body);
  switch (kind) {
    case PORF_GC_KIND_OBJECT_ENTRIES:
      porf_gc_scan_object_entries(body);
      break;
    case PORF_GC_KIND_ARRAY_ENTRIES:
      porf_gc_mark_array_entries(body, porf_gc_header(body)[0] / 8u);
      break;
    case PORF_GC_KIND_FUNCTION: {
      const i32 env = *(u32*)(MEM + body + 4);
      if (env != 0) porf_gc_mark_js((f64)env, ${TYPES.object});
      break;
    }
    case PORF_GC_KIND_UNDERLYING_STORE:
      porf_gc_scan_underlying_store(body);
      break;
    case PORF_GC_KIND_REGEX_CACHE:
      porf_gc_scan_regex_cache(body);
      break;
    case PORF_GC_KIND_PROMISE_REACTION:
      porf_gc_mark_promise_reaction((u32)body);
      break;
    default:
      if (kind > 0 && kind < 256u) porf_gc_scan_body(body, (i32)kind);
      break;
  }
}

static i32 porf_gc_scan_remembered_list(u32* remembered, i32 len) {
  i32 out = 0;
  for (i32 i = 0; i < len; i++) {
    const i32 body = (i32)remembered[i];
    if (!porf_gc_is_block_start(body)) continue;
    u32* header = porf_gc_header(body);
    const int retain = (header[1] & PORF_GC_FLAG_REMEMBERED_AGED) == 0u;
    if (retain) header[1] |= PORF_GC_FLAG_REMEMBERED_AGED;
      else header[1] &= ~(PORF_GC_FLAG_REMEMBERED | PORF_GC_FLAG_REMEMBERED_AGED);
    porf_gc_scan_remembered_block(body);
    porf_gc_drain_mark_queue();
    if (retain) remembered[out++] = (u32)body;
  }
  return out;
}

static void porf_gc_scan_remembered(void) {
  porf_gc_remembered_len = porf_gc_scan_remembered_list(porf_gc_remembered, porf_gc_remembered_len);
${usesThreads ? `  pthread_mutex_lock(&porf_gc_thread_tlab_lock);
  for (struct porf_gc_thread_tlab* t = porf_gc_thread_tlabs; t != NULL; t = t->next) {
    t->remembered_len = porf_gc_scan_remembered_list(t->remembered, t->remembered_len);
  }
  pthread_mutex_unlock(&porf_gc_thread_tlab_lock);
` : ''}\
}

static void porf_gc_clear_remembered(void) {
  while (porf_gc_remembered_len > 0) {
    const i32 body = (i32)porf_gc_remembered[--porf_gc_remembered_len];
    if (porf_gc_is_block_start(body)) porf_gc_header(body)[1] &= ~(PORF_GC_FLAG_REMEMBERED | PORF_GC_FLAG_REMEMBERED_AGED);
  }
${usesThreads ? `  pthread_mutex_lock(&porf_gc_thread_tlab_lock);
  for (struct porf_gc_thread_tlab* t = porf_gc_thread_tlabs; t != NULL; t = t->next) {
    while (t->remembered_len > 0) {
      const i32 body = (i32)t->remembered[--t->remembered_len];
      if (porf_gc_is_block_start(body)) porf_gc_header(body)[1] &= ~(PORF_GC_FLAG_REMEMBERED | PORF_GC_FLAG_REMEMBERED_AGED);
    }
  }
  pthread_mutex_unlock(&porf_gc_thread_tlab_lock);
` : ''}\
}

static void porf_gc_remember_block(i32 body) {
  if (body == 0 || !porf_gc_is_block_start(body)) return;
  u32* header = porf_gc_header(body);
${usesThreads ? `  u32 flags = __atomic_load_n(&header[1], __ATOMIC_RELAXED);
  for (;;) {
    if ((flags & (PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD)) != (PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD)) return;
    if ((flags & PORF_GC_FLAG_REMEMBERED) != 0u) {
      if ((flags & PORF_GC_FLAG_REMEMBERED_AGED) == 0u) return;
      const u32 next = flags & ~PORF_GC_FLAG_REMEMBERED_AGED;
      if (__atomic_compare_exchange_n(&header[1], &flags, next, 0, __ATOMIC_ACQ_REL, __ATOMIC_RELAXED)) return;
      continue;
    }
    const u32 next = flags | PORF_GC_FLAG_REMEMBERED;
    if (__atomic_compare_exchange_n(&header[1], &flags, next, 0, __ATOMIC_ACQ_REL, __ATOMIC_RELAXED)) break;
  }
  struct porf_gc_thread_tlab* t = porf_gc_thread_tlab_get();
  if (t->remembered_len == t->remembered_cap) {
    const i32 new_cap = t->remembered_cap == 0 ? 4096 : t->remembered_cap * 2;
    u32* grown = realloc(t->remembered, (size_t)new_cap * sizeof(*grown));
    if (!grown) abort();
    t->remembered = grown;
    t->remembered_cap = new_cap;
  }
  t->remembered[t->remembered_len++] = (u32)body;
` : `\
  if ((header[1] & (PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD)) != (PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD)) return;
  if ((header[1] & PORF_GC_FLAG_REMEMBERED) != 0u) {
    header[1] &= ~PORF_GC_FLAG_REMEMBERED_AGED;
    return;
  }
  if (porf_gc_remembered_len == porf_gc_remembered_cap) {
    const i32 new_cap = porf_gc_remembered_cap == 0 ? 4096 : porf_gc_remembered_cap * 2;
    u32* grown = realloc(porf_gc_remembered, (size_t)new_cap * sizeof(*grown));
    if (!grown) abort();
    porf_gc_remembered = grown;
    porf_gc_remembered_cap = new_cap;
  }
  header[1] |= PORF_GC_FLAG_REMEMBERED;
  porf_gc_remembered[porf_gc_remembered_len++] = (u32)body;
`}\
}

static void porf_gc_remember_promoted(i32 body) {
  porf_gc_remember_block(body);
  porf_gc_header(body)[1] |= PORF_GC_FLAG_REMEMBERED_AGED;
}

static void porf_gc_write_barrier_body(i32 body, u32 kind) {
  if (porf_heap_base == 0 || body == 0) return;
  if (!porf_gc_in_nursery(body) && !porf_gc_is_block_start(body)) return;
  u32* header = porf_gc_header(body);
${usesThreads ? `  u32 flags = __atomic_load_n(&header[1], __ATOMIC_RELAXED);
  if ((flags & PORF_GC_FLAG_ALLOCATED) == 0u) return;
  if (kind != 0u) {
    for (;;) {
      if ((flags & PORF_GC_FLAG_ALLOCATED) == 0u) return;
      const u32 next = (flags & ~PORF_GC_KIND_MASK) | ((kind & 0x3ffu) << PORF_GC_KIND_SHIFT);
      if (next == flags) break;
      if (__atomic_compare_exchange_n(&header[1], &flags, next, 0, __ATOMIC_ACQ_REL, __ATOMIC_RELAXED)) {
        flags = next;
        break;
      }
    }
  }
  if ((flags & PORF_GC_FLAG_OLD) == 0u) {
    if ((flags & PORF_GC_FLAG_AGED) != 0u) __atomic_fetch_or(&header[1], PORF_GC_FLAG_AGED_DIRTY, __ATOMIC_RELAXED);
    return;
  }
` : `\
  if ((header[1] & PORF_GC_FLAG_ALLOCATED) == 0u) return;
  if (kind != 0u) header[1] = (header[1] & ~PORF_GC_KIND_MASK) | ((kind & 0x3ffu) << PORF_GC_KIND_SHIFT);
  if ((header[1] & PORF_GC_FLAG_OLD) == 0u) {
    if ((header[1] & PORF_GC_FLAG_AGED) != 0u) header[1] |= PORF_GC_FLAG_AGED_DIRTY;
    return;
  }
`}\
  porf_gc_remember_block(body);
}

static void porf_gc_write_barrier_js(f64 value, i32 type) {
  if (!porf_gc_type_can_reference(type)) return;
  const i32 body = porf_gc_value_body(value, type);
  if (body == 0 || porf_gc_in_static(body)) return;
  porf_gc_write_barrier_body(body, (u32)type);
}

${prefs.nativeFetch && !usesThreads ? `${st}void porf_gc_barrier_impl(u32 p, i32 type) {
  if (type == 0) return;
  u32* header = porf_gc_header((i32)p);
  if (porf_gc_header_kind(header[1]) != (u32)type)
    header[1] = (header[1] & ~PORF_GC_KIND_MASK) | (((u32)type & 0x3ffu) << PORF_GC_KIND_SHIFT);
}
` : `${st}void porf_gc_barrier_impl(u32 p, i32 type) {
  if (type != 0 && !porf_gc_type_can_reference(type)) return;
  porf_gc_write_barrier_body((i32)p, (u32)type);
}
`}\
static inline u32 porf_gc_barrier_ptr_u32(u32 p) { return p; }
static inline u32 porf_gc_barrier_ptr_i32(i32 p) { return (u32)p; }
static inline u32 porf_gc_barrier_ptr_jsval(jsval v) { return (u32)v.val; }
#define porf_gc_barrier(p, type) porf_gc_barrier_impl(_Generic((p), jsval: porf_gc_barrier_ptr_jsval, i32: porf_gc_barrier_ptr_i32, default: porf_gc_barrier_ptr_u32)(p), (type))

static void porf_gc_mark_underlying_store(i32 body) {
  if (!porf_gc_is_block_start(body)) return;
  u32* header = porf_gc_header(body);
  if ((header[1] & PORF_GC_FLAG_ALLOCATED) == 0u) return;
  porf_gc_mark_body(body);
  porf_gc_set_kind(body, PORF_GC_KIND_UNDERLYING_STORE);

  const u32 len = *(u32*)(MEM + body);
  int changed;
  do {
    changed = 0;
    for (u32 i = 0; i < len; i++) {
      const i32 base = body + 8 + (i32)(i * 16u);
      const jsval original = porf_unpack(*(jsbits*)(MEM + base));
      const i32 underlying = *(u32*)(MEM + base + 8);

      if (!porf_gc_in_static(porf_gc_value_body(original.val, original.type)) && !porf_gc_is_marked_js(original.val, original.type)) continue;
      if (underlying == 0) continue;

      const int marked_before = porf_gc_is_marked_js((f64)(u32)underlying, ${TYPES.object});
      porf_gc_mark_js((f64)(u32)underlying, ${TYPES.object});
      if (!marked_before && porf_gc_is_marked_js((f64)(u32)underlying, ${TYPES.object})) changed = 1;
    }

    if (changed) porf_gc_drain_mark_queue();
  } while (changed);

  u32 out = 0;
  for (u32 i = 0; i < len; i++) {
    const i32 base = body + 8 + (i32)(i * 16u);
    const jsval original = porf_unpack(*(jsbits*)(MEM + base));
    if (!porf_gc_in_static(porf_gc_value_body(original.val, original.type)) && !porf_gc_is_marked_js(original.val, original.type)) continue;

    if (out != i) {
      const i32 dst = body + 8 + (i32)(out * 16u);
      *(u64*)(MEM + dst) = *(u64*)(MEM + base);
      *(u32*)(MEM + dst + 8) = *(u32*)(MEM + base + 8);
      *(u32*)(MEM + dst + 12) = *(u32*)(MEM + base + 12);
    }

    out++;
  }

  *(u32*)(MEM + body) = out;
}

static void porf_gc_mark_regex_cache(i32 cache) {
  while (cache != 0) {
    if (!porf_gc_is_block_start(cache)) return;
    u32* header = porf_gc_header(cache);
    if ((header[1] & PORF_GC_FLAG_ALLOCATED) == 0u) return;
    porf_gc_mark_body(cache);
    porf_gc_set_kind(cache, PORF_GC_KIND_REGEX_CACHE);
    porf_gc_scan_regex_cache(cache);
    cache = *(u32*)(MEM + cache);
  }
}

static u32 porf_gc_weakmap_hash(f64 key) {
  u32 hash = (u32)key;
  hash = hash >> 3;
  hash ^= hash >> 16;
  hash *= 0x7feb352d;
  hash ^= hash >> 15;
  return hash;
}

static void porf_gc_weakmap_insert_bucket(i32 buckets, u32 capacity, f64 key, u32 index) {
  if (buckets == 0 || capacity == 0) return;
  u32 slot = porf_gc_weakmap_hash(key) & (capacity - 1u);
  while (1) {
    const i32 bucket_ptr = buckets + (i32)(slot * 4u);
    if (*(u32*)(MEM + bucket_ptr) == 0u) {
      *(u32*)(MEM + bucket_ptr) = index + 1u;
      return;
    }
    slot = (slot + 1u) & (capacity - 1u);
  }
}

static i32 porf_gc_array_entries_shallow(i32 arr, u32* len_out) {
  if (arr == 0) { *len_out = 0; return 0; }
  u32 len = *(u32*)(MEM + arr);
  const i32 entries = *(u32*)(MEM + arr + 4);
  const u32 capacity = *(u32*)(MEM + arr + 8);
  if (len > capacity) len = capacity;
  if (entries != arr + 16) porf_gc_mark_body(entries);
  *len_out = len;
  return entries;
}

static int porf_gc_mark_weakmap_values_once(void) {
  int changed = 0;
  for (i32 w = 0; w < porf_gc_weakmaps_len; w++) {
    const i32 body = (i32)porf_gc_weakmaps[w];
    if (!porf_gc_is_block_start(body)) continue;
    const i32 keys = *(u32*)(MEM + body);
    const i32 vals = *(u32*)(MEM + body + 4);
    u32 keys_len = 0, vals_len = 0;
    const i32 keys_entries = porf_gc_array_entries_shallow(keys, &keys_len);
    const i32 vals_entries = porf_gc_array_entries_shallow(vals, &vals_len);
    const u32 len = keys_len < vals_len ? keys_len : vals_len;
    for (u32 i = 0; i < len; i++) {
      const jsbits key_bits = *(jsbits*)(MEM + keys_entries + ((u64)i << 3));
      if (key_bits == 0xffffffffffffffffull) continue;
      const jsval key = porf_unpack(key_bits);
      if (!porf_gc_is_marked_js(key.val, key.type)) continue;
      const jsval val = porf_unpack(*(jsbits*)(MEM + vals_entries + ((u64)i << 3)));
      const int marked_before = porf_gc_is_marked_js(val.val, val.type);
      porf_gc_mark_js(val.val, val.type);
      if (!marked_before && porf_gc_is_marked_js(val.val, val.type)) changed = 1;
    }
  }
  return changed;
}

static void porf_gc_sweep_weakmaps(void) {
  for (i32 w = 0; w < porf_gc_weakmaps_len; w++) {
    const i32 body = (i32)porf_gc_weakmaps[w];
    if (!porf_gc_is_block_start(body)) continue;
    const i32 keys = *(u32*)(MEM + body);
    const i32 vals = *(u32*)(MEM + body + 4);
    const i32 buckets = *(u32*)(MEM + body + 8);
    const u32 capacity = *(u32*)(MEM + body + 12);
    u32 keys_len = 0, vals_len = 0;
    const i32 keys_entries = porf_gc_array_entries_shallow(keys, &keys_len);
    const i32 vals_entries = porf_gc_array_entries_shallow(vals, &vals_len);
    const u32 len = keys_len < vals_len ? keys_len : vals_len;
    if (buckets != 0 && capacity != 0) memset(MEM + buckets, 0, (size_t)capacity * 4u);
    for (u32 i = 0; i < len; i++) {
      const i32 key_ptr = keys_entries + (i32)((u64)i << 3);
      const jsbits key_bits = *(jsbits*)(MEM + key_ptr);
      if (key_bits == 0xffffffffffffffffull) continue;
      const jsval key = porf_unpack(key_bits);
      if (porf_gc_is_marked_js(key.val, key.type)) {
        porf_gc_weakmap_insert_bucket(buckets, capacity, key.val, i);
        continue;
      }
      *(jsbits*)(MEM + key_ptr) = 0xffffffffffffffffull;
      *(jsbits*)(MEM + vals_entries + ((u64)i << 3)) = JV_UNDEFINED_BITS;
      *(u32*)(MEM + body + 16) += 1u;
    }
  }
}

static void porf_gc_process_weakmaps(void) {
  while (porf_gc_mark_weakmap_values_once()) porf_gc_drain_mark_queue();
  porf_gc_sweep_weakmaps();
}

static void porf_gc_cons_candidate(u32 c);
static void porf_gc_cons_mark_block(i32 body) {
  if (!porf_gc_mark_body(body)) return;
  const u32 flags = porf_gc_header(body)[1];
  const u32 kind = porf_gc_header_kind(flags);
  if (kind != 0u) { porf_gc_scan_remembered_block(body); return; }
  if (porf_gc_object_shape_valid(body)) { porf_gc_enqueue_mark(body, ${TYPES.object}); return; }
  if (porf_gc_array_like_shape_valid(body)) { porf_gc_enqueue_mark(body, ${TYPES.array}); return; }
  const u32 size = porf_gc_header(body)[0];
  for (u32 off = 0; off + 4u <= size; off += 4u) porf_gc_cons_candidate(*(u32*)(MEM + body + off));
  for (u32 off = 0; off + 8u <= size; off += 8u) {
    const f64 d = *(f64*)(MEM + body + off);
    if (d > 0.0 && d < 4294967296.0) {
      const i64 iv = (i64)d;
      if ((f64)iv == d) porf_gc_cons_candidate((u32)(u64)iv);
    }
  }
}
static void porf_gc_cons_candidate(u32 c) {
  const i32 p = (i32)c;
  if (porf_gc_minor_mode) {
    if (!porf_gc_in_nursery(p)) return;
    const u32 base = porf_gc_is_block_start(p) ? (u32)p : porf_gc_nursery_block_base(p);
    if (base != 0) porf_gc_cons_mark_block((i32)base);
    return;
  }
  const u32 base = porf_gc_is_block_start(p) ? (u32)p : porf_gc_any_block_base(p);
  if (base != 0) porf_gc_cons_mark_block((i32)base);
}
static void porf_gc_cons_scan_range(const u64* lo, const u64* hi) {
  for (const u64* w = lo; w < hi; w++) {
    const u64 v = *w;
    if (v == 0) continue;
    porf_gc_cons_candidate((u32)v);
    porf_gc_cons_candidate((u32)(v >> 32));
    f64 d;
    memcpy(&d, w, 8);
    if (d > 0.0 && d < 4294967296.0) {
      const i64 iv = (i64)d;
      if ((f64)iv == d) porf_gc_cons_candidate((u32)(u64)iv);
    }
  }
}

static void porf_gc_mark_cons_roots(void) {
  jmp_buf regs;
  if (_setjmp(regs) == 0) {
    porf_gc_cons_scan_range((const u64*)&regs, (const u64*)((const char*)&regs + sizeof(regs)));
  }
  volatile u64 anchor = 0;
  const u64* lo = (const u64*)(((uintptr_t)&anchor + 7) & ~(uintptr_t)7);
  const u64* hi = (const u64*)porf_c_stack_top;
  if (lo < hi) porf_gc_cons_scan_range(lo, hi);
  if (porf_try_depth > 0) {
    const i32 td = porf_try_depth < 256 ? porf_try_depth : 256;
    porf_gc_cons_scan_range((const u64*)porf_try_stack, (const u64*)(porf_try_stack + td));
  }
  porf_gc_mark_promise_jobs();
  porf_gc_mark_coro_roots();
${usesThreads ? '  porf_gc_mark_thread_roots();\n' : ''}\
  porf_gc_drain_mark_queue();
}

static void porf_gc_discard_range(u32 start, u32 end) {
  if (end <= start) return;
#if defined(MADV_DONTNEED)
  (void)madvise(MEM + start, (size_t)(end - start), MADV_DONTNEED);
#elif defined(MADV_FREE)
  (void)madvise(MEM + start, (size_t)(end - start), MADV_FREE);
#else
  (void)start;
  (void)end;
#endif
}

static void porf_gc_age_hot_free_pages(void) {
  for (i32 i = 0; i < porf_gc_young_free_len; i++) {
    u8* kind = &porf_gc_page_kind[porf_gc_young_free[i] >> PORF_GC_SPAGE_SHIFT];
    if ((*kind & (8u | PORF_GC_PAGE_COLD)) == 8u) *kind |= PORF_GC_PAGE_COLD;
  }
  porf_gc_young_free_len = 0;
}

static void porf_gc_rebuild_free_page_pools(void) {
  if (porf_gc_page_kind == NULL) return;
  porf_gc_young_free_len = 0;
  porf_gc_young_cold_len = 0;
  u32 run_start = 0;
  u32 run_end = 0;
  for (u32 pg = porf_heap_base & ~PORF_GC_SPAGE_MASK; pg < porf_heap_top; pg += PORF_GC_SPAGE) {
    u8* kind = &porf_gc_page_kind[pg >> PORF_GC_SPAGE_SHIFT];
    if ((*kind & 8u) == 0u) {
      porf_gc_discard_range(run_start, run_end);
      run_start = 0;
      run_end = 0;
      continue;
    }
    if ((*kind & PORF_GC_PAGE_COLD) == 0u && porf_gc_young_free_len < PORF_GC_HOT_FREE_PAGES) {
      porf_gc_discard_range(run_start, run_end);
      run_start = 0;
      run_end = 0;
      porf_gc_young_push(&porf_gc_young_free, &porf_gc_young_free_len, &porf_gc_young_free_cap, pg);
    } else {
      *kind |= PORF_GC_PAGE_COLD;
      porf_gc_young_push(&porf_gc_young_cold, &porf_gc_young_cold_len, &porf_gc_young_cold_cap, pg);
      if (run_end == pg) {
        run_end += PORF_GC_SPAGE;
      } else {
        porf_gc_discard_range(run_start, run_end);
        run_start = pg;
        run_end = pg + PORF_GC_SPAGE;
      }
    }
  }
  porf_gc_discard_range(run_start, run_end);
}

static void porf_gc_sticky_reclaim(int minor) {
  if (!minor) {
    for (i32 bin = 0; bin < PORF_GC_HOLE_BINS; bin++) porf_gc_holes_len[bin] = 0;
    porf_gc_age_hot_free_pages();
  } else {
    for (i32 bin = 0; bin < PORF_GC_HOLE_BINS; bin++) {
      i32 out = 0;
      for (i32 i = 0; i < porf_gc_holes_len[bin]; i++) {
        const u32 idx = porf_gc_holes[bin][i] >> PORF_GC_SPAGE_SHIFT;
        if ((porf_gc_page_kind[idx] & 4u) != 0u) continue;
        porf_gc_holes[bin][out] = porf_gc_holes[bin][i];
        porf_gc_hole_ends[bin][out] = porf_gc_hole_ends[bin][i];
        out++;
      }
      porf_gc_holes_len[bin] = out;
    }
  }
  u32* pages = minor ? porf_gc_touched : porf_gc_young_active;
  const i32 pages_len = minor ? porf_gc_touched_len : porf_gc_young_active_len;
  for (i32 pi = 0; pi < pages_len; pi++) {
    const u32 lo = pages[pi];
    const u32 hi = lo + PORF_GC_SPAGE;
    const u8 pk = porf_gc_page_kind[lo >> PORF_GC_SPAGE_SHIFT];
    if (!minor && (pk & PORF_GC_PAGE_ACTIVE) == 0u) continue;
    if ((pk & 16u) != 0u) {
      porf_gc_page_kind[lo >> PORF_GC_SPAGE_SHIFT] &= ~4u;
      continue;
    }
    if ((pk & 32u) != 0u) {
      u32* sheader = (u32*)(MEM + lo);
      const u32 ssize = sheader[0];
      const u32 sflags = sheader[1];
      const i32 snpg = (i32)((ssize + 8u + PORF_GC_SPAGE_MASK) >> PORF_GC_SPAGE_SHIFT);
      const int slive = (sflags & PORF_GC_FLAG_ALLOCATED) != 0u &&
        ((minor && (sflags & PORF_GC_FLAG_OLD) != 0u) || (sflags & (PORF_GC_FLAG_MARKED | PORF_GC_FLAG_RAW)) != 0u);
      if (slive) {
        if (!minor) {
          porf_gc_page_live_bytes += 8u + (u64)ssize;
          porf_gc_page_live_blocks++;
          if (ssize > porf_gc_page_largest_live) porf_gc_page_largest_live = ssize;
        }
        if (minor && (sflags & PORF_GC_FLAG_OLD) == 0u && (sflags & PORF_GC_FLAG_AGED) == 0u) {
          sheader[1] = PORF_GC_FLAG_ALLOCATED | (sflags & PORF_GC_KIND_MASK) | PORF_GC_FLAG_AGED;
          porf_gc_young_push(&porf_gc_aging, &porf_gc_aging_len, &porf_gc_aging_cap, lo);
        } else {
          if (minor && (sflags & PORF_GC_FLAG_OLD) == 0u) porf_gc_promoted_since_full += 8u + (i64)ssize;
          sheader[1] = PORF_GC_FLAG_ALLOCATED | (sflags & (PORF_GC_KIND_MASK | PORF_GC_FLAG_REMEMBERED | PORF_GC_FLAG_REMEMBERED_AGED)) | PORF_GC_FLAG_OLD;
          if (minor && (sflags & (PORF_GC_FLAG_OLD | PORF_GC_FLAG_AGED_DIRTY)) == PORF_GC_FLAG_AGED_DIRTY)
            porf_gc_remember_promoted((i32)lo + 8);
        }
      } else {
        porf_gc_finalize_body((i32)lo + 8, (i32)porf_gc_header_kind(sflags));
        porf_gc_clear_block_start((i32)lo + 8);
        for (i32 sk = 0; sk < snpg; sk++) {
          const u32 sa = lo + (u32)sk * PORF_GC_SPAGE;
          const u8 listed = porf_gc_page_kind[sa >> PORF_GC_SPAGE_SHIFT] & PORF_GC_PAGE_LISTED;
          porf_gc_page_kind[sa >> PORF_GC_SPAGE_SHIFT] = 1u | listed;
          porf_gc_free_page_push(sa, 0);
        }
        continue;
      }
      porf_gc_page_kind[lo >> PORF_GC_SPAGE_SHIFT] &= ~4u;
      continue;
    }
    i32 survivors = 0;
    i32 any = 0;
    i32 age_again = 0;
    u32 hole = lo;
    const i32 base_slot = (i32)(lo >> 3);
    u64* bwords = (u64*)(porf_gc_block_starts + (base_slot >> 3));
    for (i32 w = 0; w < (i32)(PORF_GC_SPAGE / 512u); w++) {
      u64 word = bwords[w];
      while (word != 0ull) {
        const i32 bit = __builtin_ctzll(word);
        word &= word - 1ull;
        const u32 body = (u32)(base_slot + w * 64 + bit) << 3;
        const u32 scan = body - 8;
        any = 1;
        u32* header = (u32*)(MEM + scan);
        const u32 size = header[0];
        const u32 flags = header[1];
        const int live = (flags & PORF_GC_FLAG_ALLOCATED) != 0u &&
          ((minor && (flags & PORF_GC_FLAG_OLD) != 0u) || (flags & (PORF_GC_FLAG_MARKED | PORF_GC_FLAG_RAW)) != 0u);
        if (live) {
          if (!minor) {
            porf_gc_page_live_bytes += 8u + (u64)size;
            porf_gc_page_live_blocks++;
            if (size > porf_gc_page_largest_live) porf_gc_page_largest_live = size;
          }
          porf_gc_hole_push_reclaim(hole, scan, minor);
          if (minor && (flags & PORF_GC_FLAG_OLD) == 0u && (flags & PORF_GC_FLAG_AGED) == 0u) {
            header[1] = PORF_GC_FLAG_ALLOCATED | (flags & PORF_GC_KIND_MASK) | PORF_GC_FLAG_AGED;
            age_again = 1;
          } else {
            if (minor && (flags & PORF_GC_FLAG_OLD) == 0u) porf_gc_promoted_since_full += 8u + (i64)size;
            header[1] = PORF_GC_FLAG_ALLOCATED | (flags & (PORF_GC_KIND_MASK | PORF_GC_FLAG_REMEMBERED | PORF_GC_FLAG_REMEMBERED_AGED)) | PORF_GC_FLAG_OLD;
            if (minor && (flags & (PORF_GC_FLAG_OLD | PORF_GC_FLAG_AGED_DIRTY)) == PORF_GC_FLAG_AGED_DIRTY)
              porf_gc_remember_promoted((i32)body);
          }
          survivors++;
          hole = body + size;
          continue;
        }
        porf_gc_finalize_body((i32)body, (i32)porf_gc_header_kind(flags));
        porf_gc_clear_block_start((i32)body);
      }
    }
    if (survivors == 0) {
      if ((porf_gc_page_kind[lo >> PORF_GC_SPAGE_SHIFT] & 8u) == 0u) {
        if (any) {
          porf_gc_clear_block_start_range((i32)lo, (i32)hi);
        }
        porf_gc_free_page_push(lo, 0);
      }
      porf_gc_page_kind[lo >> PORF_GC_SPAGE_SHIFT] &= ~(4u | PORF_GC_PAGE_ACTIVE);
      continue;
    }
    if (age_again) porf_gc_young_push(&porf_gc_aging, &porf_gc_aging_len, &porf_gc_aging_cap, lo);
    porf_gc_hole_push_reclaim(hole, hi, minor);
    porf_gc_page_kind[lo >> PORF_GC_SPAGE_SHIFT] &= ~4u;
  }
  if (!minor) {
    porf_gc_aging_len = 0;
    porf_gc_compact_active_pages();
    porf_gc_rebuild_free_page_pools();
  }
  porf_gc_touched_len = 0;
  porf_gc_nursery_cur = 0;
  porf_gc_nursery_end = 0;
  porf_gc_nursery_window_start = 0;
  porf_gc_nursery_is_hole = 0;
  porf_gc_med_cur = 0;
  porf_gc_med_end = 0;
${usesThreads ? '  porf_gc_thread_tlabs_clear();\n' : ''}\
}

static inline u64 porf_gc_allocation_debt_threshold(void) {
  u64 threshold = porf_gc_last_live_bytes / 2u;
  if (threshold < porf_gc_allocation_debt_min) return porf_gc_allocation_debt_min;
  if (threshold > porf_gc_allocation_debt_max) return porf_gc_allocation_debt_max;
  return threshold;
}
static inline int porf_gc_can_grow_for_request(u32 request_size) {
  const u64 allocation_bytes = 8u + (u64)request_size;
  const u64 heap_slack = (u64)(PORF_ARENA_RESERVE - porf_heap_top);
  if (heap_slack <= 16ull * 1024ull * 1024ull + allocation_bytes) return 0;
  const u64 heap_bytes = porf_heap_top > porf_gc_old_base ? (u64)(porf_heap_top - porf_gc_old_base) : 0u;
  if (porf_gc_last_live_bytes == 0) {
${usesThreads ? '    return heap_bytes + allocation_bytes <= (u64)porf_gc_thread_nursery_limit();\n' : '    return 0;\n'}\
  }
  const u64 live_bytes = porf_gc_last_live_bytes;
  u64 grow_window = live_bytes + 64ull * 1024ull * 1024ull;
  if (grow_window < 1ull * 1024ull * 1024ull) grow_window = 1ull * 1024ull * 1024ull;
  return heap_bytes + allocation_bytes <= grow_window;
}
static inline int porf_gc_should_collect_for(u32 request_size) {
  const u64 threshold = porf_gc_allocation_debt_threshold();
  if (porf_gc_allocation_debt < threshold) return 0;
  if (porf_gc_last_live_bytes == 0) return !porf_gc_can_grow_for_request(request_size);
  if (porf_gc_allocation_debt >= threshold * 4u) return 1;
  if (porf_gc_can_grow_for_request(request_size)) return 0;
  return 1;
}

static void porf_gc_minor(void) {
  porf_gc_collect_impl(1);
  if (porf_gc_full_due(0)) porf_gc_collect_impl(0);
}

${st}void porf_gc_collect_impl(int minor) {
  if (porf_heap_base == 0) return;
  if (minor) porf_gc_prepare_aging_pages();
  porf_gc_publish_young_block_starts();
  porf_gc_minor_mode = minor;
  porf_gc_collection_count++;
  if (minor) {
    porf_gc_minor_count++;
    porf_gc_minors_since_full++;
  } else {
    porf_gc_full_count++;
    porf_gc_minors_since_full = 0;
    porf_gc_claimed_since_full = 0;
    porf_gc_promoted_since_full = 0;
    porf_gc_page_live_bytes = 0;
    porf_gc_page_live_blocks = 0;
    porf_gc_page_largest_live = 0;
  }
  porf_gc_allocation_debt = 0;
  porf_gc_static_marks_len = 0;
  if (porf_gc_static_marks != NULL) memset(porf_gc_static_marks, 0, (size_t)porf_gc_static_marks_cap * sizeof(*porf_gc_static_marks));
  if (!minor) porf_gc_clear_heap_marks();
  porf_gc_mark_queue_len = 0;
  porf_gc_weakmaps_len = 0;
  porf_gc_boxed_marks_len = 0;
  porf_gc_mark_native_roots();
  porf_gc_mark_cons_roots();
  porf_gc_mark_js(porf_exception.val, porf_exception.type);
  porf_gc_mark_global_roots();
  porf_gc_drain_mark_queue();
  if (minor) {
    porf_gc_scan_remembered();
    porf_gc_drain_mark_queue();
  }
  porf_gc_mark_global_raw_roots();
  porf_gc_drain_mark_queue();
  porf_gc_process_weakmaps();
  porf_gc_drain_mark_queue();
  if (minor) {
    porf_gc_sticky_reclaim(1);
    porf_gc_minor_mode = 0;
    return;
  }
  porf_gc_sticky_reclaim(0);
  porf_gc_clear_free_lists();
  const u32 old_heap_top = porf_heap_top;
  u64 live_bytes_after = porf_gc_page_live_bytes;
  u32 live_blocks_after = porf_gc_page_live_blocks;
  u32 largest_live_after = porf_gc_page_largest_live;
  u32 scan = porf_gc_old_base;
  while (scan < porf_heap_top) {
    if (porf_gc_page_kind != NULL && porf_gc_page_kind[scan >> PORF_GC_SPAGE_SHIFT] != 0u) {
      scan = (scan & ~PORF_GC_SPAGE_MASK) + PORF_GC_SPAGE;
      continue;
    }
    u32* header = (u32*)(MEM + scan);
    const u32 size = header[0];
    u32 next = scan + 8u + size;
    if ((size & 7u) != 0u || next < scan + 8u || next > porf_heap_top) break;
    const u32 flags = header[1];
    const int live = (flags & PORF_GC_FLAG_ALLOCATED) != 0u && (flags & (PORF_GC_FLAG_MARKED | PORF_GC_FLAG_RAW)) != 0u;
    if (live) {
      live_bytes_after += 8u + (u64)size;
      live_blocks_after++;
      if (size > largest_live_after) largest_live_after = size;
      header[1] = PORF_GC_FLAG_ALLOCATED | (flags & PORF_GC_KIND_MASK) | PORF_GC_FLAG_OLD;
      scan = next;
      continue;
    }
    const u32 free_start = scan;
    porf_gc_finalize_body((i32)scan + 8, (i32)porf_gc_header_kind(flags));
    porf_gc_clear_block_start((i32)free_start + 8);
    while (next < porf_heap_top) {
      if (porf_gc_page_kind != NULL && porf_gc_page_kind[next >> PORF_GC_SPAGE_SHIFT] != 0u) break;
      u32* next_header = (u32*)(MEM + next);
      const u32 next_size = next_header[0];
      const u32 after_next = next + 8u + next_size;
      if ((next_size & 7u) != 0u || after_next < next + 8u || after_next > porf_heap_top) break;
      const u32 next_flags = next_header[1];
      const int next_live = (next_flags & PORF_GC_FLAG_ALLOCATED) != 0u && (next_flags & (PORF_GC_FLAG_MARKED | PORF_GC_FLAG_RAW)) != 0u;
      if (next_live) break;
      porf_gc_finalize_body((i32)next + 8, (i32)porf_gc_header_kind(next_flags));
      porf_gc_clear_block_start((i32)next + 8);
      next = after_next;
    }
    if (next >= porf_heap_top) {
      porf_heap_top = free_start;
      break;
    }
    header = (u32*)(MEM + free_start);
    header[0] = next - free_start - 8u;
    header[1] = 0;
    porf_gc_insert_free((i32)free_start + 8, header[0]);
    scan = next;
  }
  (void)old_heap_top;
  porf_gc_last_live_bytes = live_bytes_after;
  porf_gc_live_bytes = live_bytes_after;
  porf_gc_live_blocks = live_blocks_after;
  porf_gc_largest_live = largest_live_after;
  porf_gc_clear_remembered();
  porf_gc_maybe_trim_memory();
  porf_gc_minor_mode = 0;
}

static u32 porf_gc_alloc_old(u32 bytes, u32 typeId) {
  (void)typeId;
  const u32 size = porf_gc_align(bytes);
  int debt_collection = 0;
  int boundary_collection = 0;
${prefs.nativeFetch ? `  if (porf_gc_largest_free < size) {
    const u64 fast_need_end64 = (u64)porf_heap_top + 8u + (u64)size;
    if (fast_need_end64 < PORF_ARENA_RESERVE) {
      const u32 fast_need_end = (u32)fast_need_end64;
      porf_commit(fast_need_end);
      const u32 header_offset = porf_heap_top;
      u32* header = (u32*)(MEM + header_offset);
      header[0] = size;
      header[1] = PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD | porf_gc_alloc_kind_bits(typeId);
      porf_gc_set_block_start(header_offset + 8);
      porf_heap_top = header_offset + 8u + size;
      porf_gc_allocation_debt += 8u + (u64)size;
      porf_gc_live_bytes += 8u + (u64)size;
      porf_gc_live_blocks++;
      if (size > porf_gc_largest_live) porf_gc_largest_live = size;
      porf_gc_init_raw_alloc(header_offset + 8, size, typeId);
      return header_offset + 8;
    }
  }
` : ''}\
retry_free_list:
  ;
  const i32 start_bin = porf_gc_free_bin(size);
${prefs.nativeFetch ? `  if (size <= PORF_GC_SMALL_BIN_MAX && porf_gc_free_bins[start_bin] != 0) {
    const i32 cur = (i32)porf_gc_free_bins[start_bin];
    u32* header = porf_gc_header(cur);
    const u32 block_size = header[0];
    const i32 next = (i32)header[1];
    porf_gc_free_bins[start_bin] = (u32)next;
    if (next == 0) {
      if (porf_gc_free_bins_used > 0) porf_gc_free_bins_used--;
      porf_gc_free_bin_largest[start_bin] = 0;
      porf_gc_bin_word_clear(start_bin);
    }
    if (porf_gc_free_head == (u32)cur) porf_gc_free_head = (u32)next;
    porf_gc_free_bytes -= 8u + (u64)block_size;
    if (porf_gc_free_blocks > 0) porf_gc_free_blocks--;
    if (block_size >= porf_gc_largest_free) porf_gc_recompute_largest_free();
    header[1] = PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD | porf_gc_alloc_kind_bits(typeId);
    porf_gc_set_block_start(cur);
    porf_gc_allocation_debt += 8u + (u64)size;
    porf_gc_live_bytes += 8u + (u64)size;
    porf_gc_live_blocks++;
    if (size > porf_gc_largest_live) porf_gc_largest_live = size;
    porf_gc_init_raw_alloc((u32)cur, size, typeId);
    return (u32)cur;
  }
` : ''}\
  for (i32 bin = start_bin; bin < (i32)PORF_GC_FREE_BINS; bin++) {
    bin = porf_gc_next_set_bin(bin);
    if (bin < 0) break;
    if (porf_gc_free_bin_largest[bin] < size) continue;
    u32 scanned_largest = 0;
    i32 prev = 0;
    i32 cur = (i32)porf_gc_free_bins[bin];
    while (cur != 0) {
      u32* header = porf_gc_header(cur);
      const u32 block_size = header[0];
      const i32 next = (i32)header[1];
      if (block_size > scanned_largest) scanned_largest = block_size;
      if (block_size >= size) {
        if (prev != 0) porf_gc_header(prev)[1] = (u32)next;
        else {
          porf_gc_free_bins[bin] = (u32)next;
          if (next == 0) {
            if (porf_gc_free_bins_used > 0) porf_gc_free_bins_used--;
            porf_gc_free_bin_largest[bin] = 0;
            porf_gc_bin_word_clear(bin);
          }
        }
        if (porf_gc_free_head == (u32)cur) porf_gc_free_head = (u32)next;
        porf_gc_free_bytes -= 8u + (u64)block_size;
        if (porf_gc_free_blocks > 0) porf_gc_free_blocks--;
        if (block_size >= porf_gc_largest_free) porf_gc_recompute_largest_free();
        const u32 remainder = block_size - size;
        if (remainder >= 16u) {
          const i32 new_header = cur + (i32)size;
          u32* split = (u32*)(MEM + new_header);
          split[0] = remainder - 8u;
          split[1] = 0;
          porf_gc_insert_free(new_header + 8, split[0]);
          header[0] = size;
          header[1] = PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD | porf_gc_alloc_kind_bits(typeId);
          porf_gc_set_block_start(cur);
          porf_gc_allocation_debt += 8u + (u64)size;
          porf_gc_live_bytes += 8u + (u64)size;
          porf_gc_live_blocks++;
          if (size > porf_gc_largest_live) porf_gc_largest_live = size;
          porf_gc_init_raw_alloc((u32)cur, size, typeId);
          return (u32)cur;
        }
        header[1] = PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD | porf_gc_alloc_kind_bits(typeId);
        porf_gc_set_block_start(cur);
        porf_gc_allocation_debt += 8u + (u64)size;
        porf_gc_live_bytes += 8u + (u64)block_size;
        porf_gc_live_blocks++;
        if (block_size > porf_gc_largest_live) porf_gc_largest_live = block_size;
        porf_gc_init_raw_alloc((u32)cur, block_size, typeId);
        return (u32)cur;
      }
      prev = cur;
      cur = next;
    }
    if (scanned_largest < porf_gc_free_bin_largest[bin]) porf_gc_free_bin_largest[bin] = scanned_largest;
  }
  if (${prefs.nativeFetch ? '0' : '1'} && porf_gc_should_collect_for(size) && !debt_collection && !porf_gc_can_grow_for_request(size)) {
    debt_collection = 1;
    const u64 heap_slack = PORF_ARENA_RESERVE - porf_heap_top;
    const int full_debt_collection = porf_gc_minors_since_full >= 64u ||
      (porf_gc_minors_since_full >= 16u && heap_slack < 128ull * 1024ull * 1024ull);
    if (full_debt_collection) {
      ${usesThreads ? 'porf_gc_collect_threaded(0)' : 'porf_gc_collect_impl(0)'};
    } else if (porf_gc_allocation_debt > (porf_gc_last_live_bytes * 2ull > 67108864ull ? porf_gc_last_live_bytes * 2ull : 67108864ull)) {
      ${usesThreads ? 'porf_gc_collect_threaded(0)' : 'porf_gc_collect_impl(0)'};
    }
    goto retry_free_list;
  }
  const u64 need_end64 = (u64)porf_heap_top + 8u + (u64)size;
  if (need_end64 >= PORF_ARENA_RESERVE) {
    if (${prefs.nativeFetch ? '0' : '1'} && !boundary_collection) {
      boundary_collection = 1;
      ${usesThreads ? 'porf_gc_collect_threaded(0)' : 'porf_gc_collect_impl(0)'};
      goto retry_free_list;
    }
    porf_gc_recompute_largest_free();
    fprintf(stderr, "porffor: out of memory (gc heap limit; req=%u live=%lluMB free=%lluMB largest_free=%u heap_top=%u)\\n",
      size, (unsigned long long)(porf_gc_live_bytes / 1048576ull), (unsigned long long)(porf_gc_free_bytes / 1048576ull), porf_gc_largest_free, porf_heap_top);
    abort();
  }
  const u32 need_end = (u32)need_end64;
  porf_commit(need_end);
  const u32 header_offset = porf_heap_top;
  u32* header = (u32*)(MEM + header_offset);
  header[0] = size;
  header[1] = PORF_GC_FLAG_ALLOCATED | PORF_GC_FLAG_OLD | porf_gc_alloc_kind_bits(typeId);
  porf_gc_set_block_start(header_offset + 8);
  porf_heap_top = header_offset + 8u + size;
  porf_gc_allocation_debt += 8u + (u64)size;
  porf_gc_live_bytes += 8u + (u64)size;
  porf_gc_live_blocks++;
  if (size > porf_gc_largest_live) porf_gc_largest_live = size;
  porf_gc_init_raw_alloc(header_offset + 8, size, typeId);
  return header_offset + 8;
}

${st}u32 porf_alloc_slow(u32 bytes, u32 typeId);
${usesThreads ? 'static u32 porf_gc_alloc_threaded(u32 bytes, u32 typeId);\n' : ''}\
${sti}u32 porf_alloc(u32 bytes, u32 typeId) {
  (void)typeId;
${usesThreads ? `  return porf_gc_alloc_threaded(bytes, typeId);
` : ''}\
${prefs.nativeFetch ? `  return porf_gc_alloc_old(bytes, typeId);
` : `\
  const u32 size = porf_gc_align(bytes);
  u32 cur = porf_gc_nursery_cur;
  u32 next = cur + 8u + size;
  if (((cur ^ (next - 1u)) & ~PORF_GC_SPAGE_MASK) != 0u) {
    porf_gc_publish_alloc_range(porf_gc_nursery_window_start, cur);
    cur = (cur + PORF_GC_SPAGE_MASK) & ~PORF_GC_SPAGE_MASK;
    next = cur + 8u + size;
    porf_gc_nursery_cur = cur;
    porf_gc_nursery_window_start = cur;
  }
  if (next <= porf_gc_nursery_end && size <= PORF_GC_NURSERY_LARGE) {
    u32* header = (u32*)(MEM + cur);
    header[0] = size;
    header[1] = PORF_GC_FLAG_ALLOCATED | porf_gc_alloc_kind_bits(typeId);
    porf_gc_init_raw_alloc(cur + 8, size, typeId);
    porf_gc_nursery_cur = next;
    return cur + 8;
  }
  return porf_alloc_slow(bytes, typeId);
`}\
}

${st}u32 porf_alloc_slow(u32 bytes, u32 typeId) {
  if (porf_heap_base == 0) {
    porf_arena_init();
    return porf_alloc_slow(bytes, typeId);
  }
  porf_gc_publish_alloc_range(porf_gc_nursery_window_start, porf_gc_nursery_cur);
  porf_gc_nursery_window_start = porf_gc_nursery_cur;
  if (porf_gc_nursery_is_hole) {
    const u32 residual_start = (porf_gc_nursery_cur + PORF_GC_LINE_MASK) & ~PORF_GC_LINE_MASK;
    const u32 residual_end = porf_gc_nursery_end & ~PORF_GC_LINE_MASK;
    if (residual_end > residual_start) {
      porf_gc_window_bytes -= residual_end - residual_start;
      porf_gc_hole_push(residual_start, residual_end);
    }
    porf_gc_nursery_end = porf_gc_nursery_cur;
    porf_gc_nursery_is_hole = 0;
  }
  const u32 size = porf_gc_align(bytes);
  if (porf_gc_window_bytes >= (i64)PORF_GC_NURSERY_BYTES || porf_gc_span_bytes >= 8388608ll) {
    porf_gc_window_bytes = 0;
    porf_gc_span_bytes = 0;
    porf_gc_minor();
  }
  if (size > PORF_GC_SPAGE - 8u) {
    if (size <= 65528u) {
      const u32 sp = porf_gc_span_alloc(size, typeId);
      if (sp != 0) return sp;
    }
    return porf_gc_alloc_old(bytes, typeId);
  }
  if (size > 512u) {
    for (int attempt = 0; attempt < 2; attempt++) {
      if (porf_gc_med_cur != 0) {
        const u32 mnext = porf_gc_med_cur + 8u + size;
        if (mnext <= porf_gc_med_end) {
          const u32 mc = porf_gc_med_cur;
          u32* mh = (u32*)(MEM + mc);
          mh[0] = size;
          mh[1] = PORF_GC_FLAG_ALLOCATED | porf_gc_alloc_kind_bits(typeId);
          porf_gc_set_block_start(mc + 8);
          porf_gc_init_raw_alloc(mc + 8, size, typeId);
          porf_gc_med_cur = mnext;
          return mc + 8;
        }
      }
      int cold = 0;
      u32 mpg = porf_gc_pop_free_page(&cold);
      if (mpg == 0) { porf_gc_young_claim(512); mpg = porf_gc_pop_free_page(&cold); }
      if (mpg == 0) break;
      porf_gc_window_bytes += (i64)PORF_GC_SPAGE;
      porf_gc_touch_page((i32)mpg);
      porf_gc_med_cur = mpg;
      porf_gc_med_end = mpg + PORF_GC_SPAGE;
    }
    return porf_gc_alloc_old(bytes, typeId);
  }
  if (porf_gc_sticky_next_page(8u + size)) return porf_alloc(bytes, typeId);
  porf_gc_young_claim(512);
  if (porf_gc_sticky_next_page(8u + size)) return porf_alloc(bytes, typeId);
  return porf_gc_alloc_old(bytes, typeId);
}

${usesThreads ? `static u32 porf_gc_alloc_threaded(u32 bytes, u32 typeId) {
  if (__atomic_load_n(&porf_stw_requested, __ATOMIC_RELAXED)) porf_gc_safepoint();
  const u32 size = porf_gc_align(bytes);
  struct porf_gc_thread_tlab* t = porf_gc_thread_tlab;
  if (t != NULL && size <= PORF_GC_NURSERY_LARGE) {
    u32 cur = t->cur;
    u32 next = cur + 8u + size;
    if (((cur ^ (next - 1u)) & ~PORF_GC_SPAGE_MASK) != 0u) {
      porf_gc_publish_alloc_range(t->window_start, cur);
      cur = (cur + PORF_GC_SPAGE_MASK) & ~PORF_GC_SPAGE_MASK;
      next = cur + 8u + size;
      t->cur = cur;
      t->window_start = cur;
    }
    if (next <= t->end) {
      u32* header = (u32*)(MEM + cur);
      header[0] = size;
      header[1] = PORF_GC_FLAG_ALLOCATED | porf_gc_alloc_kind_bits(typeId);
      porf_gc_init_raw_alloc(cur + 8, size, typeId);
      t->cur = next;
      return cur + 8;
    }
  }
  while (pthread_mutex_trylock(&porf_gc_thread_alloc_lock) != 0) {
    porf_gc_safepoint();
    sched_yield();
  }
  if (porf_heap_base == 0) porf_arena_init();
  u32 out = 0;
  if (size <= PORF_GC_NURSERY_LARGE) {
    t = porf_gc_thread_tlab_get();
    porf_gc_publish_alloc_range(t->window_start, t->cur);
    t->window_start = t->cur;
    if (!porf_thread_worker && (porf_gc_window_bytes >= porf_gc_thread_nursery_limit() || porf_gc_span_bytes >= porf_gc_thread_span_limit())) {
      porf_gc_window_bytes = 0;
      porf_gc_span_bytes = 0;
      porf_gc_collect_threaded(1);
    }
    if (!porf_gc_thread_sticky_next_span()) {
      porf_gc_young_claim(512);
      (void)porf_gc_thread_sticky_next_span();
    }
    if (porf_gc_nursery_cur != 0) {
      t->cur = porf_gc_nursery_cur;
      t->end = porf_gc_nursery_end;
      t->window_start = t->cur;
      porf_gc_nursery_cur = 0;
      porf_gc_nursery_end = 0;
      porf_gc_nursery_window_start = 0;
      u32 cur = t->cur;
      u32 next = cur + 8u + size;
      if (((cur ^ (next - 1u)) & ~PORF_GC_SPAGE_MASK) != 0u) {
        porf_gc_publish_alloc_range(t->window_start, cur);
        cur = (cur + PORF_GC_SPAGE_MASK) & ~PORF_GC_SPAGE_MASK;
        next = cur + 8u + size;
        t->cur = cur;
        t->window_start = cur;
      }
      if (next <= t->end) {
        u32* header = (u32*)(MEM + cur);
        header[0] = size;
        header[1] = PORF_GC_FLAG_ALLOCATED | porf_gc_alloc_kind_bits(typeId);
        porf_gc_init_raw_alloc(cur + 8, size, typeId);
        t->cur = next;
        out = cur + 8;
      }
    }
  }
  if (out == 0) out = porf_gc_alloc_old(bytes, typeId);
  pthread_mutex_unlock(&porf_gc_thread_alloc_lock);
  return out;
}

` : ''}\
`;
};

const THREAD_RUNTIME = (entrySym, entryArgs, promiseRunOneSym, prefs, usesCoro = false) => {
  const threadsPool = parseInt(prefs.threadsPool) || 0;
  const stackBytes = (parseInt(prefs.threadsStack) || 1024) * 1024;
  const threadsFiberCache = parseInt(prefs.threadsFiberCache) || 1024;

  return `// ---- Porffor threads ----
#if !defined(__aarch64__) && !defined(__x86_64__)
#error "porffor --threads requires arm64 or x86_64"
#endif

__attribute__((naked)) static void porf_ctx_switch(void** save_sp, void* to_sp) {
#if defined(__aarch64__)
  __asm__ volatile(
    "sub sp, sp, #192\\n"
    "stp x19, x20, [sp, #0]\\n"
    "stp x21, x22, [sp, #16]\\n"
    "stp x23, x24, [sp, #32]\\n"
    "stp x25, x26, [sp, #48]\\n"
    "stp x27, x28, [sp, #64]\\n"
    "stp x29, x30, [sp, #80]\\n"
    "stp d8, d9, [sp, #96]\\n"
    "stp d10, d11, [sp, #112]\\n"
    "stp d12, d13, [sp, #128]\\n"
    "stp d14, d15, [sp, #144]\\n"
    "mov x9, sp\\n"
    "str x9, [x0]\\n"
    "mov sp, x1\\n"
    "ldp x19, x20, [sp, #0]\\n"
    "ldp x21, x22, [sp, #16]\\n"
    "ldp x23, x24, [sp, #32]\\n"
    "ldp x25, x26, [sp, #48]\\n"
    "ldp x27, x28, [sp, #64]\\n"
    "ldp x29, x30, [sp, #80]\\n"
    "ldp d8, d9, [sp, #96]\\n"
    "ldp d10, d11, [sp, #112]\\n"
    "ldp d12, d13, [sp, #128]\\n"
    "ldp d14, d15, [sp, #144]\\n"
    "add sp, sp, #192\\n"
    "ret\\n"
  );
#elif defined(__x86_64__)
  __asm__ volatile(
    "pushq %rbp\\n"
    "pushq %rbx\\n"
    "pushq %r12\\n"
    "pushq %r13\\n"
    "pushq %r14\\n"
    "pushq %r15\\n"
    "movq %rsp, (%rdi)\\n"
    "movq %rsi, %rsp\\n"
    "popq %r15\\n"
    "popq %r14\\n"
    "popq %r13\\n"
    "popq %r12\\n"
    "popq %rbx\\n"
    "popq %rbp\\n"
    "ret\\n"
  );
#endif
}

typedef struct porf_runq {
  pthread_mutex_t lock;
  pthread_cond_t cond;
  porf_fiber* head;
  porf_fiber* tail;
} porf_runq;

static porf_runq* porf_runqs = NULL;
static int porf_nworkers = 0;
static atomic_int porf_spawn_rr = 0;
static _Thread_local void* porf_sched_sp = NULL;
static pthread_mutex_t porf_threads_boot_lock = PTHREAD_MUTEX_INITIALIZER;
static atomic_int porf_threads_started = 0;
static atomic_int porf_thread_live = 0;
static atomic_int porf_thread_jobs_active = 0;

static porf_fiber* porf_fiber_pool = NULL;
static int porf_fiber_pool_count = 0;
static pthread_mutex_t porf_fiber_pool_lock = PTHREAD_MUTEX_INITIALIZER;

static pthread_mutex_t porf_stw_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t porf_stw_cond = PTHREAD_COND_INITIALIZER;
static int porf_stw_requested = 0;
static int porf_stw_mutators = 1;
static int porf_stw_parked = 0;
static _Thread_local int porf_stw_initiator = 0;

static int porf_threads_active(void) {
  return atomic_load_explicit(&porf_thread_live, memory_order_acquire) != 0;
}

static int porf_threads_busy(void) {
  return porf_threads_active() ||
    atomic_load_explicit(&porf_thread_jobs_active, memory_order_acquire) != 0;
}

static void porf_runq_push(porf_runq* q, porf_fiber* f) {
  f->next = NULL;
  pthread_mutex_lock(&q->lock);
  if (q->tail) q->tail->next = f;
    else q->head = f;
  q->tail = f;
  pthread_cond_signal(&q->cond);
  pthread_mutex_unlock(&q->lock);
}

struct porf_park_entry {
  f64 key;
  f64 gen;
  porf_fiber* head;
  struct porf_park_entry* next;
};
static struct porf_park_entry* porf_park_entries = NULL;
static pthread_mutex_t porf_park_lock = PTHREAD_MUTEX_INITIALIZER;

static struct porf_park_entry* porf_park_find(f64 key) {
  for (struct porf_park_entry* e = porf_park_entries; e != NULL; e = e->next) {
    if (e->key == key) return e;
  }
  struct porf_park_entry* e = (struct porf_park_entry*)calloc(1, sizeof(*e));
  if (!e) abort();
  e->key = key;
  e->next = porf_park_entries;
  porf_park_entries = e;
  return e;
}

static f64 porf_thread_park_prepare(f64 key) {
  pthread_mutex_lock(&porf_park_lock);
  const f64 gen = porf_park_find(key)->gen;
  pthread_mutex_unlock(&porf_park_lock);
  return gen;
}

static void porf_thread_wake(f64 key) {
  pthread_mutex_lock(&porf_park_lock);
  struct porf_park_entry* e = porf_park_find(key);
  e->gen += 1.0;
  porf_fiber* list = e->head;
  e->head = NULL;
  for (porf_fiber* f = list; f != NULL; f = f->park_next) f->parked = 0;
  pthread_mutex_unlock(&porf_park_lock);

  while (list) {
    porf_fiber* next = list->park_next;
    list->park_next = NULL;
    porf_runq_push((porf_runq*)list->home_q, list);
    list = next;
  }
}

static void porf_thread_wake_one(f64 key) {
  pthread_mutex_lock(&porf_park_lock);
  struct porf_park_entry* e = porf_park_find(key);
  e->gen += 1.0;
  porf_fiber* f = e->head;
  if (f) {
    e->head = f->park_next;
    f->park_next = NULL;
    f->parked = 0;
  }
  pthread_mutex_unlock(&porf_park_lock);

  if (f) porf_runq_push((porf_runq*)f->home_q, f);
}

static void porf_fiber_trampoline(void) {
  porf_fiber* task = porf_fiber_current;
  ${entrySym}(${entryArgs});
  porf_gc_native_root_remove(task->fn_root);
  porf_gc_native_root_remove(task->args_root);
  porf_gc_native_root_remove(task->prom_root);
  atomic_fetch_sub_explicit(&porf_thread_live, 1, memory_order_release);
  pthread_mutex_lock(&porf_promise_job_lock);
  pthread_cond_broadcast(&porf_promise_job_cond);
  pthread_mutex_unlock(&porf_promise_job_lock);
  task->done = 1;
  porf_ctx_switch(&task->sp, porf_sched_sp);
  __builtin_unreachable();
}

static void porf_fiber_save_runtime(porf_fiber* f) {
  f->c_stack_top = porf_c_stack_top;
${usesCoro ? '  f->coro_cur = porf_coro_cur;\n' : ''}\
}

static void porf_fiber_restore_runtime(porf_fiber* f) {
  porf_c_stack_top = f->c_stack_top;
${usesCoro ? '  porf_coro_cur = f->coro_cur;\n' : ''}\
}

static void porf_stw_mutator_register(void) {
  pthread_mutex_lock(&porf_stw_lock);
  porf_stw_mutators++;
  pthread_mutex_unlock(&porf_stw_lock);
}

static void porf_gc_safepoint(void) {
  if (!__atomic_load_n(&porf_stw_requested, __ATOMIC_RELAXED) || porf_stw_initiator) return;
  porf_fiber* f = porf_fiber_self();
  volatile u64 anchor = 0;
  porf_fiber_save_runtime(f);
  f->sp = (void*)&anchor;
  pthread_mutex_lock(&porf_stw_lock);
  if (porf_stw_requested && !porf_stw_initiator) {
    porf_stw_parked++;
    pthread_cond_broadcast(&porf_stw_cond);
    while (porf_stw_requested) pthread_cond_wait(&porf_stw_cond, &porf_stw_lock);
    porf_stw_parked--;
  }
  pthread_mutex_unlock(&porf_stw_lock);
  (void)anchor;
}

static void porf_stw_begin(void) {
  porf_stw_initiator = 1;
  pthread_mutex_lock(&porf_stw_lock);
  porf_stw_requested = 1;
  pthread_cond_broadcast(&porf_stw_cond);
  pthread_cond_broadcast(&porf_promise_job_cond);
  for (int i = 0; i < porf_nworkers; i++) {
    pthread_mutex_lock(&porf_runqs[i].lock);
    pthread_cond_broadcast(&porf_runqs[i].cond);
    pthread_mutex_unlock(&porf_runqs[i].lock);
  }
  while (porf_stw_parked < porf_stw_mutators - 1) pthread_cond_wait(&porf_stw_cond, &porf_stw_lock);
  pthread_mutex_unlock(&porf_stw_lock);
}

static void porf_stw_end(void) {
  pthread_mutex_lock(&porf_stw_lock);
  porf_stw_requested = 0;
  pthread_cond_broadcast(&porf_stw_cond);
  pthread_mutex_unlock(&porf_stw_lock);
  porf_stw_initiator = 0;
}

static void porf_gc_collect_threaded(int minor) {
  porf_stw_begin();
  porf_gc_collect_impl(minor);
  porf_stw_end();
}

static void* porf_worker_main(void* arg) {
  porf_runq* q = (porf_runq*)arg;
  volatile int porf_thread_stack_anchor = 0;
  porf_thread_worker = 1;
  porf_stw_mutator_register();
  porf_fiber* root = porf_fiber_self();
  root->c_stack_top = (void*)&porf_thread_stack_anchor;
  porf_fiber_restore_runtime(root);
  unsigned idle_spins = 0;

  while (1) {
    porf_gc_safepoint();
    pthread_mutex_lock(&q->lock);
    porf_fiber* f = q->head;
    if (f) {
      q->head = f->next;
      if (!q->head) q->tail = NULL;
    }
    pthread_mutex_unlock(&q->lock);

    if (!f) {
      if (++idle_spins < 256) {
        for (int r = 0; r < 32; r++) {
#if defined(__aarch64__)
          __asm__ __volatile__("yield");
#elif defined(__x86_64__)
          __asm__ __volatile__("pause");
#endif
        }
        continue;
      }
      pthread_mutex_lock(&q->lock);
      if (!q->head) {
        struct timespec ts;
        clock_gettime(CLOCK_REALTIME, &ts);
        ts.tv_nsec += 1000000;
        if (ts.tv_nsec >= 1000000000) { ts.tv_sec++; ts.tv_nsec -= 1000000000; }
        pthread_cond_timedwait(&q->cond, &q->lock, &ts);
      }
      pthread_mutex_unlock(&q->lock);
      continue;
    }
    idle_spins = 0;

    porf_fiber_save_runtime(root);
    porf_fiber_current = f;
    porf_fiber_restore_runtime(f);
    porf_ctx_switch(&porf_sched_sp, f->sp);
    porf_fiber_save_runtime(f);
    porf_fiber_current = root;
    porf_fiber_restore_runtime(root);

    if (f->park_pending) {
      f->park_pending = 0;
      pthread_mutex_lock(&porf_park_lock);
      struct porf_park_entry* e = porf_park_find(f->park_key);
      if (e->gen != f->park_gen) {
        pthread_mutex_unlock(&porf_park_lock);
        porf_runq_push(q, f);
      } else {
        f->parked = 1;
        f->park_next = e->head;
        e->head = f;
        pthread_mutex_unlock(&porf_park_lock);
      }
      continue;
    }

    if (f->done) {
      porf_fiber_live_remove(f);
      int pooled = 0;
      pthread_mutex_lock(&porf_fiber_pool_lock);
      if (porf_fiber_pool_count < ${threadsFiberCache}) {
        f->next = porf_fiber_pool;
        porf_fiber_pool = f;
        porf_fiber_pool_count++;
        pooled = 1;
      }
      pthread_mutex_unlock(&porf_fiber_pool_lock);
      if (!pooled) {
        munmap(f->stack_base, f->stack_bytes);
        if (f->fiber_try_heap) free(f->fiber_try_stack);
        free(f);
      }
    } else {
      porf_runq_push(q, f);
    }
  }
  return NULL;
}

static void porf_threads_boot(void) {
  pthread_mutex_lock(&porf_threads_boot_lock);
  if (!atomic_load_explicit(&porf_threads_started, memory_order_acquire)) {
    int n = porf_threads_default_pool();
    porf_nworkers = n;
    porf_runqs = (porf_runq*)calloc((size_t)n, sizeof(porf_runq));
    if (!porf_runqs) abort();
    for (int i = 0; i < n; i++) {
      pthread_mutex_init(&porf_runqs[i].lock, NULL);
      pthread_cond_init(&porf_runqs[i].cond, NULL);
    }
    for (int i = 0; i < n; i++) {
      pthread_t t;
      pthread_attr_t attr;
      pthread_attr_init(&attr);
      pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);
      if (pthread_create(&t, &attr, porf_worker_main, &porf_runqs[i]) != 0) abort();
      pthread_attr_destroy(&attr);
    }
    atomic_store_explicit(&porf_threads_started, 1, memory_order_release);
  }
  pthread_mutex_unlock(&porf_threads_boot_lock);
}

static void porf_thread_spawn(f64 fnv, i32 fnt, f64 argsv, i32 argst, f64 promv, i32 promt) {
  if (!atomic_load_explicit(&porf_threads_started, memory_order_acquire)) porf_threads_boot();

  porf_fiber* f = NULL;
  pthread_mutex_lock(&porf_fiber_pool_lock);
  if (porf_fiber_pool) {
    f = porf_fiber_pool;
    porf_fiber_pool = f->next;
    porf_fiber_pool_count--;
  }
  pthread_mutex_unlock(&porf_fiber_pool_lock);

  if (!f) {
    f = (porf_fiber*)calloc(1, sizeof(porf_fiber));
    if (!f) abort();
    char* base = (char*)mmap(NULL, (size_t)${stackBytes}, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (base == MAP_FAILED) abort();
    mprotect(base, 4096, PROT_NONE);
    f->stack_base = base;
    f->stack_bytes = (size_t)${stackBytes};
  } else {
    void* sb = f->stack_base;
    size_t sz = f->stack_bytes;
    jmp_buf* ts = f->fiber_try_stack;
    i32 tc = f->fiber_try_cap;
    i32 th = f->fiber_try_heap;
    memset(f, 0, sizeof(porf_fiber));
    f->stack_base = sb;
    f->stack_bytes = sz;
    f->fiber_try_stack = ts;
    f->fiber_try_cap = tc;
    f->fiber_try_heap = th;
  }

  f->fnv = fnv; f->fnt = fnt;
  f->argsv = argsv; f->argst = argst;
  f->promv = promv; f->promt = promt;
  f->fn_root = porf_gc_native_root_add(fnv, fnt);
  f->args_root = porf_gc_native_root_add(argsv, argst);
  f->prom_root = porf_gc_native_root_add(promv, promt);
  f->fiber_exception = JV_UNDEFINED;

  char* top = (char*)f->stack_base + f->stack_bytes;
  top = (char*)((uintptr_t)top & ~(uintptr_t)15);
  f->c_stack_top = top;
  if (!f->fiber_try_heap) {
    const size_t try_bytes = (8 * sizeof(jmp_buf) + 15) & ~(size_t)15;
    top -= try_bytes;
    f->fiber_try_stack = (jmp_buf*)top;
    f->fiber_try_cap = 8;
  }
#if defined(__aarch64__)
  void** save = (void**)(top - 192);
  memset(save, 0, 192);
  save[11] = (void*)&porf_fiber_trampoline;
  f->sp = save;
#elif defined(__x86_64__)
  void** save = (void**)(top - 64);
  memset(save, 0, 56);
  save[6] = (void*)&porf_fiber_trampoline;
  f->sp = save;
#endif

  porf_fiber_live_add(f);
  atomic_fetch_add_explicit(&porf_thread_live, 1, memory_order_release);
  int wi = atomic_fetch_add_explicit(&porf_spawn_rr, 1, memory_order_relaxed) % porf_nworkers;
  f->home_q = (void*)&porf_runqs[wi];
  porf_runq_push(&porf_runqs[wi], f);
}

static void porf_promise_run_one(u32 reaction) {
  atomic_fetch_add_explicit(&porf_thread_jobs_active, 1, memory_order_acquire);
  (void)${promiseRunOneSym}((i32)reaction);
  atomic_fetch_sub_explicit(&porf_thread_jobs_active, 1, memory_order_release);
  pthread_mutex_lock(&porf_promise_job_lock);
  pthread_cond_broadcast(&porf_promise_job_cond);
  pthread_mutex_unlock(&porf_promise_job_lock);
}

static void porf_thread_yield(void) {
  porf_gc_safepoint();
  porf_fiber* f = porf_fiber_self();
  if (f->is_root) {
    static _Thread_local unsigned porf_yield_spin = 0;
    if ((++porf_yield_spin & 63u) == 0u) usleep(100);
      else sched_yield();
    return;
  }
  const u32 reaction = porf_promise_dequeue_job();
  if (reaction != 0) {
    porf_promise_run_one(reaction);
    return;
  }
  porf_fiber_save_runtime(f);
  porf_ctx_switch(&f->sp, porf_sched_sp);
  porf_fiber_restore_runtime(f);
}

static void porf_thread_fence(void) {
  atomic_thread_fence(memory_order_seq_cst);
}

#define PORF_THREAD_LOCKS_MAX 65536u
static atomic_uint* porf_thread_locks = NULL;
static atomic_uint porf_thread_lock_next = 0;
static pthread_mutex_t porf_thread_locks_init_lock = PTHREAD_MUTEX_INITIALIZER;

static void porf_thread_locks_ensure(void) {
  if (porf_thread_locks) return;
  pthread_mutex_lock(&porf_thread_locks_init_lock);
  if (!porf_thread_locks) {
    porf_thread_locks = (atomic_uint*)calloc(PORF_THREAD_LOCKS_MAX, sizeof(*porf_thread_locks));
    if (!porf_thread_locks) abort();
  }
  pthread_mutex_unlock(&porf_thread_locks_init_lock);
}

static f64 porf_thread_lock_new(void) {
  porf_thread_locks_ensure();
  const u32 id = atomic_fetch_add_explicit(&porf_thread_lock_next, 1u, memory_order_relaxed);
  if (id >= PORF_THREAD_LOCKS_MAX) abort();
  return (f64)id;
}

static f64 porf_thread_try_lock(f64 id) {
  porf_thread_locks_ensure();
  unsigned expected = 0;
  return atomic_compare_exchange_strong_explicit(&porf_thread_locks[(u32)id], &expected, 1u, memory_order_acquire, memory_order_relaxed) ? 1.0 : 0.0;
}

static void porf_thread_unlock(f64 id) {
  atomic_store_explicit(&porf_thread_locks[(u32)id], 0u, memory_order_release);
}

static void porf_thread_park(f64 key, f64 gen) {
  porf_gc_safepoint();
  porf_fiber* f = porf_fiber_self();
  if (f->is_root || f->home_q == NULL) {
    porf_thread_yield();
    return;
  }
  f->park_key = key;
  f->park_gen = gen;
  f->park_pending = 1;
  porf_fiber_save_runtime(f);
  porf_ctx_switch(&f->sp, porf_sched_sp);
  porf_fiber_restore_runtime(f);
}

static f64 porf_thread_available(void) {
  return 1.0;
}

static void porf_threads_drain(void) {
  while (porf_threads_busy() || porf_promise_has_jobs()) {
    const u32 reaction = porf_promise_dequeue_job();
    if (reaction != 0) {
      porf_promise_run_one(reaction);
      continue;
    }
    sched_yield();
  }
}

`;
};

// jsval encoding: f64 numbers are themselves, else 0xFFF8 (sign + quiet-NaN) << 48 |
// type:8 << 43 | payload:32. hardware qNaN is 0x7FF8 (sign clear) so never collides,
// sign-set NaNs from raw bytes are canonicalized at Float64Array/DataView reads (porf_canon)
const RUNTIME_HEAD = (staticEnd, prefs, usesThreads = false, usesCoro = false, toStr = null) => {
  const st = 'static ';
  const sti = 'static inline ';
  return `// generated by porffor ${globalThis.version}
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <setjmp.h>
#include <math.h>
${usesThreads ? `#include <pthread.h>
#include <stdatomic.h>
#include <sched.h>
` : ''}

#include <signal.h>
#include <unistd.h>
#include <dirent.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <time.h>

${prefs.repl ? `static int porf_repl_output_enabled = 1;
#define printf(...) (porf_repl_output_enabled ? fprintf(stdout, __VA_ARGS__) : 0)
` : ''}

typedef uint8_t u8;
typedef uint16_t u16;
typedef int32_t i32;
typedef uint32_t u32;
typedef int64_t i64;
typedef uint64_t u64;
typedef float f32;
typedef double f64;
typedef struct jsval { f64 val; i32 type; } jsval;
typedef u64 jsbits;
${usesThreads ? `typedef struct porf_coro porf_coro;
typedef struct porf_fiber {
  void* sp;
  void* stack_base;
  size_t stack_bytes;
  struct porf_fiber* next;
  int done;
  int is_root;
  f64 fnv; i32 fnt;
  f64 argsv; i32 argst;
  f64 promv; i32 promt;
  i32 fn_root;
  i32 args_root;
  i32 prom_root;
  void* c_stack_top;
  ${usesCoro ? 'porf_coro* coro_cur;\n  ' : ''}struct porf_fiber* live_next;
  struct porf_fiber* live_prev;
  i32 fiber_try_depth;
  jsval fiber_exception;
  jmp_buf* fiber_try_stack;
  i32 fiber_try_cap;
  i32 fiber_try_heap;
  f64 park_key;
  f64 park_gen;
  int park_pending;
  int parked;
  struct porf_fiber* park_next;
  void* home_q;
} porf_fiber;

static _Thread_local porf_fiber* porf_fiber_current = NULL;
static _Thread_local porf_fiber porf_root_fiber;

static porf_fiber* porf_fiber_live = NULL;
static pthread_mutex_t porf_fiber_live_lock = PTHREAD_MUTEX_INITIALIZER;

static void porf_fiber_live_add(porf_fiber* f) {
  pthread_mutex_lock(&porf_fiber_live_lock);
  f->live_next = porf_fiber_live;
  f->live_prev = NULL;
  if (porf_fiber_live) porf_fiber_live->live_prev = f;
  porf_fiber_live = f;
  pthread_mutex_unlock(&porf_fiber_live_lock);
}

static void porf_fiber_live_remove(porf_fiber* f) {
  pthread_mutex_lock(&porf_fiber_live_lock);
  if (f->live_prev) f->live_prev->live_next = f->live_next;
    else if (porf_fiber_live == f) porf_fiber_live = f->live_next;
  if (f->live_next) f->live_next->live_prev = f->live_prev;
  f->live_next = NULL;
  f->live_prev = NULL;
  pthread_mutex_unlock(&porf_fiber_live_lock);
}

static inline porf_fiber* porf_fiber_self(void) {
  porf_fiber* f = porf_fiber_current;
  if (!f) {
    f = &porf_root_fiber;
    f->is_root = 1;
    f->fiber_exception = (jsval){0.0, ${TYPES.undefined}};
    porf_fiber_current = f;
    porf_fiber_live_add(f);
  }
  return f;
}

static inline jmp_buf* porf_fiber_try_ensure(void) {
  porf_fiber* f = porf_fiber_self();
  if (f->fiber_try_depth > f->fiber_try_cap) {
    i32 cap = f->fiber_try_cap ? f->fiber_try_cap << 1 : 8;
    while (cap < f->fiber_try_depth) cap <<= 1;
    jmp_buf* grown;
    if (f->fiber_try_stack && !f->fiber_try_heap) {
      grown = (jmp_buf*)malloc((size_t)cap * sizeof(jmp_buf));
      if (grown) memcpy(grown, f->fiber_try_stack, (size_t)f->fiber_try_cap * sizeof(jmp_buf));
    } else {
      grown = (jmp_buf*)realloc(f->fiber_try_stack, (size_t)cap * sizeof(jmp_buf));
    }
    if (!grown) abort();
    f->fiber_try_stack = grown;
    f->fiber_try_cap = cap;
    f->fiber_try_heap = 1;
  }
  return f->fiber_try_stack;
}

#define porf_try_stack (porf_fiber_try_ensure())
#define porf_try_depth (porf_fiber_self()->fiber_try_depth)
#define porf_exception (porf_fiber_self()->fiber_exception)

` : ''}
${prefs.nativeFetch ? `typedef struct NativeFetchResponseParts {
  i32 status;
  jsval body;
  jsval headers;
} NativeFetchResponseParts;

static _Thread_local NativeFetchResponseParts* porf_native_fetch_response_parts_out = NULL;
` : ''}

// arena base: reserved once at init, NEVER moves. a fixed constant VA is
// not reliably free on macOS (per-process dyld/malloc randomization), and
// x86-64 has no [imm64+reg] addressing so a constant folds to a register
// materialization anyway - a once-set global compiles to the same code.
// 0x400000000 is used as a hint for deterministic debugging when free.
${prefs.nativeFetch ? '' : st}u8* porf_mem;
#define MEM porf_mem
#define PORF_ARENA_HINT ((void*)0x400000000ull)
#define PORF_ARENA_RESERVE (1ull << 32)
#define PORF_STATIC_END ${staticEnd}u
#define PORF_GC_ENABLED ${prefs.gc === false ? 0 : 1}

#define JV_PATTERN 0xFFF8000000000000ull
#define JV_TYPE_MASK 0x07F8000000000000ull
#define JV_UNDEFINED_BITS (JV_PATTERN | ((u64)${TYPES.undefined} << 43))
#define JV_UNDEFINED ((jsval){0.0, ${TYPES.undefined}})
#define JV_ZERO_BITS (JV_PATTERN | ((u64)${TYPES.number} << 43))

#define PORF_PROMISE_RESULT 0
#define PORF_PROMISE_FULFILL_HEAD 8
#define PORF_PROMISE_FULFILL_TAIL 12
#define PORF_PROMISE_REJECT_HEAD 16
#define PORF_PROMISE_REJECT_TAIL 20
#define PORF_PROMISE_PAYLOAD 24
#define PORF_PROMISE_STATE 32
#define PORF_PROMISE_FLAGS 33
#define PORF_PROMISE_HANDLED 34
#define PORF_PROMISE_SIZE 40

#define PORF_REACTION_HANDLER 0
#define PORF_REACTION_OUT_PROMISE 8
#define PORF_REACTION_VALUE 16
#define PORF_REACTION_NEXT 24
#define PORF_REACTION_PAYLOAD 28
#define PORF_REACTION_KIND 32
#define PORF_REACTION_FLAGS 33
#define PORF_REACTION_SIZE 40

#define PORF_GC_KIND_PROMISE_REACTION 900u

static inline f64 porf_bits_to_f64_bits(u64 b) { f64 d; memcpy(&d, &b, 8); return d; }
static inline u64 porf_f64_to_bits(f64 d) { u64 b; memcpy(&b, &d, 8); return b; }
static inline f64 porf_bits_to_f32(u32 b) { f32 f; memcpy(&f, &b, 4); return (f64)f; }
static inline u32 porf_f32_to_bits(f64 d) { f32 f = (f32)d; u32 b; memcpy(&b, &f, 4); return b; }
static inline f64 porf_jsval_to_f64(jsval v) { return v.val; }
#define porf_bits_to_f64(x) _Generic((x), jsval: porf_jsval_to_f64, default: porf_bits_to_f64_bits)(x)

static inline int porf_jv_is_num(jsval v) { return v.type == ${TYPES.number}; }
static inline i32 porf_jv_type(jsval v) { return v.type; }
static inline jsval porf_box_num(f64 d) { return (jsval){d, ${TYPES.number}}; }
static inline jsval porf_box(f64 payload, i32 type) {
  return type == ${TYPES.number} ? porf_box_num(payload) : (jsval){payload, type};
}
static inline jsbits porf_pack(jsval v) {
  if (v.type == ${TYPES.number}) {
    const jsbits b = porf_f64_to_bits(v.val);
    // negative quiet NaNs collide with the boxed encoding: canonicalize
    return (b & JV_PATTERN) == JV_PATTERN ? 0x7FF8000000000000ull : b;
  }
  return JV_PATTERN | ((u64)(v.type & 0xFF) << 43) | (u64)(u32)v.val;
}
${sti}jsbits porf_arr_pack(jsval v) {
  const jsbits b = porf_pack(v);
  return b == 0 ? JV_ZERO_BITS : b;
}
static inline jsval porf_unpack(jsbits b) {
  if ((b & JV_PATTERN) != JV_PATTERN) return porf_box_num(porf_bits_to_f64(b));
  return (jsval){(f64)(u32)b, (i32)((b >> 43) & 0xFF)};
}
static inline f64 porf_canon(f64 d) { return d == d ? d : porf_bits_to_f64(0x7FF8000000000000ull); }

static u32* porf_promise_job_queue = NULL;
static u32 porf_promise_job_head = 0;
static u32 porf_promise_job_len = 0;
static u32 porf_promise_job_cap = 0;
${usesThreads ? `static pthread_mutex_t porf_promise_job_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t porf_promise_job_cond = PTHREAD_COND_INITIALIZER;
static _Thread_local int porf_thread_worker = 0;
` : ''}
static void (*porf_promise_run_coro_reaction_impl)(u32) = NULL;
static void (*porf_native_fetch_run_response_reaction_impl)(u32) = NULL;

static u32 porf_native_fetch_set_timer(jsval callback, jsval args, jsval delay_value, i32 repeat);
static void porf_native_fetch_clear_timer(jsval timer);
${usesThreads ? `static void porf_thread_spawn(f64 fnv, i32 fnt, f64 argsv, i32 argst, f64 promv, i32 promt);
static void porf_thread_yield(void);
static void porf_thread_fence(void);
static void porf_promise_run_one(u32 reaction);
static f64 porf_thread_lock_new(void);
static f64 porf_thread_try_lock(f64 id);
static void porf_thread_unlock(f64 id);
static f64 porf_thread_available(void);
static f64 porf_thread_park_prepare(f64 key);
static void porf_thread_park(f64 key, f64 gen);
static void porf_thread_wake(f64 key);
static void porf_thread_wake_one(f64 key);
static int porf_threads_active(void);
static void porf_threads_drain(void);
static void porf_gc_safepoint(void);
static void porf_gc_collect_threaded(int minor);
` : ''}

static void porf_promise_enqueue_job(u32 reaction) {
  if (reaction == 0) return;
${usesThreads ? '  pthread_mutex_lock(&porf_promise_job_lock);\n' : ''}\
  if (porf_promise_job_len == porf_promise_job_cap) {
    const u32 old_cap = porf_promise_job_cap;
    const u32 new_cap = old_cap == 0 ? 64u : old_cap * 2u;
    u32* next = (u32*)malloc((size_t)new_cap * sizeof(u32));
    if (!next) abort();
    for (u32 i = 0; i < porf_promise_job_len; i++) {
      next[i] = porf_promise_job_queue[(porf_promise_job_head + i) & (old_cap - 1u)];
    }
    free(porf_promise_job_queue);
    porf_promise_job_queue = next;
    porf_promise_job_cap = new_cap;
    porf_promise_job_head = 0;
  }
  porf_promise_job_queue[(porf_promise_job_head + porf_promise_job_len) & (porf_promise_job_cap - 1u)] = reaction;
  porf_promise_job_len++;
${usesThreads ? '  pthread_cond_signal(&porf_promise_job_cond);\n' : ''}\
${usesThreads ? '  pthread_mutex_unlock(&porf_promise_job_lock);\n' : ''}\
}

static u32 porf_promise_dequeue_job(void) {
${usesThreads ? '  porf_gc_safepoint();\n' : ''}\
${usesThreads ? '  pthread_mutex_lock(&porf_promise_job_lock);\n' : ''}\
${usesThreads ? '  while (porf_promise_job_len == 0 && !porf_thread_worker && porf_threads_active()) {\n    pthread_mutex_unlock(&porf_promise_job_lock);\n    porf_gc_safepoint();\n    pthread_mutex_lock(&porf_promise_job_lock);\n    if (porf_promise_job_len == 0 && !porf_thread_worker && porf_threads_active()) pthread_cond_wait(&porf_promise_job_cond, &porf_promise_job_lock);\n  }\n' : ''}\
  if (porf_promise_job_len == 0) {
${usesThreads ? '    pthread_mutex_unlock(&porf_promise_job_lock);\n' : ''}\
    return 0;
  }
  const u32 reaction = porf_promise_job_queue[porf_promise_job_head];
  porf_promise_job_head = (porf_promise_job_head + 1u) & (porf_promise_job_cap - 1u);
  porf_promise_job_len--;
  if (porf_promise_job_len == 0) porf_promise_job_head = 0;
${usesThreads ? '  pthread_mutex_unlock(&porf_promise_job_lock);\n' : ''}\
  return reaction;
}

static int porf_promise_has_jobs(void) {
${usesThreads ? '  pthread_mutex_lock(&porf_promise_job_lock);\n  const int has_jobs = porf_promise_job_len != 0;\n  pthread_mutex_unlock(&porf_promise_job_lock);\n  return has_jobs;\n' : ''}\
${usesThreads ? '' : '  return porf_promise_job_len != 0;\n'}\
}

static void porf_promise_run_coro_reaction(u32 reaction) {
  if (!porf_promise_run_coro_reaction_impl) abort();
  porf_promise_run_coro_reaction_impl(reaction);
}

static void porf_native_fetch_run_response_reaction(u32 reaction) {
  if (!porf_native_fetch_run_response_reaction_impl) abort();
  porf_native_fetch_run_response_reaction_impl(reaction);
}

static inline i32 porf_jv_eq(jsval a, jsval b) {
  if (a.type != b.type) return 0;
  if (a.type == ${TYPES.number}) return a.val == b.val;
  return (u32)a.val == (u32)b.val;
}

// truthiness: number path = one compare; boxed = payload check, strings load length
static inline i32 porf_truthy(jsval v) {
  if (v.type == ${TYPES.number}) return v.val == v.val && v.val != 0.0;
  if (v.type == ${TYPES.string} || v.type == ${TYPES.bytestring}) return *(u32*)(MEM + (u32)v.val) != 0u;
  return (u32)v.val != 0u;
}

static inline i32 porf_falsy(jsval v) {
  if (v.type == ${TYPES.number}) return v.val != v.val || v.val == 0.0;
  if (v.type == ${TYPES.string} || v.type == ${TYPES.bytestring}) return *(u32*)(MEM + (u32)v.val) == 0u;
  return (u32)v.val == 0u;
}

static inline i32 porf_nullish(jsval v) {
  return v.type == ${TYPES.undefined} || (v.type == ${TYPES.object} && (u32)v.val == 0u);
}

// saturating f64 -> int (JS semantics handled above; this is trunc_sat)
static inline i32 porf_f64_to_i32(f64 d) {
  if (d != d) return 0;
  if (d <= -2147483648.0) return -2147483648;
  if (d >= 2147483647.0) return 2147483647;
  return (i32)d;
}
static inline u32 porf_f64_to_u32(f64 d) {
  if (d != d || d <= 0.0) return 0;
  if (d >= 4294967295.0) return 4294967295u;
  return (u32)d;
}

static inline i32 porf_clz32(u32 x) { return x ? __builtin_clz(x) : 32; }
static inline i32 porf_ctz32(u32 x) { return x ? __builtin_ctz(x) : 32; }
static inline u32 porf_rotl32(u32 x, u32 k) { k &= 31u; return (x << k) | (x >> ((0u - k) & 31u)); }
static inline u32 porf_rotr32(u32 x, u32 k) { k &= 31u; return (x >> k) | (x << ((0u - k) & 31u)); }
static inline u64 porf_rotl64(u64 x, u64 k) { k &= 63ull; return (x << k) | (x >> ((0ull - k) & 63ull)); }
static inline u64 porf_rotr64(u64 x, u64 k) { k &= 63ull; return (x >> k) | (x << ((0ull - k) & 63ull)); }
static inline f64 porf_nearest(f64 d) { f64 r = round(d); if (fabs(d - trunc(d)) == 0.5 && ((i64)r & 1)) r -= d < 0 ? -1.0 : 1.0; return r; }
static inline f64 porf_f64_min(f64 a, f64 b) { return a != a ? a : b != b ? b : a < b ? a : b; }
static inline f64 porf_f64_max(f64 a, f64 b) { return a != a ? a : b != b ? b : a > b ? a : b; }

static struct timespec porf_performance_start;
static f64 porf_performance_time_origin_value = 0.0;
static int porf_performance_started = 0;

static inline void porf_performance_init(void) {
  if (!porf_performance_started) {
    struct timespec real;
    clock_gettime(CLOCK_REALTIME, &real);
    clock_gettime(CLOCK_MONOTONIC, &porf_performance_start);
    porf_performance_time_origin_value = (f64)real.tv_sec * 1000.0 + (f64)real.tv_nsec / 1.0e6;
    porf_performance_started = 1;
  }
}

${sti}f64 porf_performance_now(void) {
  porf_performance_init();

  struct timespec now;
  clock_gettime(CLOCK_MONOTONIC, &now);

  i64 sec = (i64)now.tv_sec - (i64)porf_performance_start.tv_sec;
  i64 nsec = (i64)now.tv_nsec - (i64)porf_performance_start.tv_nsec;
  if (nsec < 0) {
    sec--;
    nsec += 1000000000ll;
  }
  return (f64)sec * 1000.0 + (f64)nsec / 1.0e6;
}

${sti}f64 porf_performance_time_origin(void) {
  porf_performance_init();
  return porf_performance_time_origin_value;
}

// unaligned access (DataView, object entry values): memcpy folds to plain loads on x86/arm
// tcc: plain derefs instead - it emits real memcpy calls, and it never optimizes on alignment UB
#ifdef __TINYC__
#define porf_load_un_u16(p) (*(const u16*)(p))
#define porf_load_un_u32(p) (*(const u32*)(p))
#define porf_load_un_u64(p) (*(const u64*)(p))
#define porf_load_un_f32(p) (*(const f32*)(p))
#define porf_load_un_f64(p) (*(const f64*)(p))
#define porf_store_un_u16(p, v) (*(u16*)(p) = (v))
#define porf_store_un_u32(p, v) (*(u32*)(p) = (v))
#define porf_store_un_u64(p, v) (*(u64*)(p) = (v))
#define porf_store_un_f32(p, v) (*(f32*)(p) = (v))
#define porf_store_un_f64(p, v) (*(f64*)(p) = (v))
#else
#define PORF_UN(ctype) \\
  static inline ctype porf_load_un_##ctype(const u8* p) { ctype v; memcpy(&v, p, sizeof v); return v; } \\
  static inline void porf_store_un_##ctype(u8* p, ctype v) { memcpy(p, &v, sizeof v); }
PORF_UN(u16) PORF_UN(u32) PORF_UN(u64) PORF_UN(f32) PORF_UN(f64)
#endif

// exceptions: setjmp-based, exception is a jsval
${usesThreads ? '' : `${st}jmp_buf porf_try_stack[256];
${st}i32 porf_try_depth = 0;
${st}jsval porf_exception = {0.0, ${TYPES.undefined}};
`}\
${toStr ? `jsval ${toStr}(jsval);
` : ''}\
#if defined(__GNUC__) || defined(__clang__)
__attribute__((cold, noinline, noreturn))
#endif
${st}void porf_throw(jsval v) {
  porf_exception = v;
  if (porf_try_depth > 0) _longjmp(porf_try_stack[porf_try_depth - 1], 1);
${toStr ? `
  static i32 _uncaught_busy = 0;
  if (!_uncaught_busy) {
    _uncaught_busy = 1;
    const jsval _s = ${toStr}(v);
    const i32 _st = porf_jv_type(_s);
    const u32 _sp = (u32)_s.val;
    if (_st == ${TYPES.bytestring} && _sp) { fprintf(stderr, "Uncaught %.*s\\n", (int)*(u32*)(MEM + _sp), (const char*)(MEM + _sp + 4)); exit(1); }
    if (_st == ${TYPES.string} && _sp) {
      const u32 _sl = *(u32*)(MEM + _sp);
      fprintf(stderr, "Uncaught ");
      for (u32 _i = 0; _i < _sl; _i++) { const u16 _c = porf_load_un_u16(MEM + _sp + 4 + _i * 2); fputc(_c < 128 ? (int)_c : '?', stderr); }
      fputc('\\n', stderr);
      exit(1);
    }
  }
` : ''}\
  fprintf(stderr, "Uncaught exception\\n");
  exit(1);
}

// internal throws construct a standard error (message jsval at +0, like the error
// builtins) so a caught internal error behaves identically to a \`new X(msg)\` one
${sti}u32 porf_alloc(u32 bytes, u32 typeId);
#if defined(__GNUC__) || defined(__clang__)
__attribute__((cold, noinline, noreturn))
#endif
${st}void porf_throw_new(i32 errType, u32 msgId) {
  const u32 p = porf_alloc(8, (u32)errType);
  *(jsbits*)(MEM + p) = JV_PATTERN | ((u64)${TYPES.bytestring} << 43) | msgId;
  porf_throw(porf_box((f64)p, errType));
}

#if defined(__GNUC__) || defined(__clang__)
__attribute__((cold, noinline, noreturn))
#endif
${st}void porf_unreachable(const char* msg) {
  fprintf(stderr, "porffor: unreachable%s%s\\n", msg ? ": " : "", msg ? msg : "");
  abort();
}

${prefs.gc === false ? PORF_BUMP_ALLOC() : PORF_GC_ALLOC(prefs, usesThreads)}

// ---- core layouts ----
// array:      [len i32 @0][cap i32 @4][ent u32 @8]; entries = jsval[cap]
// object:     [count i32 @0][bcap i32 @4][ent u32 @8][buckets u32 @12]
//             entries = {key jsval, val jsval}[count] in insertion order
//             buckets = i32[bcap] entry indices, -1 empty (ordered hashmap)
// bytestring: [len u32 @0][bytes @4]
// function:   [fnIdx u32 @0][env u32 @4]; env = jsval slots
// array layout matches builtins (array_storage.ts): len@0, ent@4, cap@8;
// header padded to 16 so inline entries stay 8-aligned
#define PORF_ARR_LEN(a) (*(i32*)(MEM + (a)))
#define PORF_ARR_ENT(a) (*(u32*)(MEM + (a) + 4))
#define PORF_ARR_CAP(a) (*(i32*)(MEM + (a) + 8))

${st}u32 porf_arr_new(i32 len, i32 cap) {
  if (cap < len) cap = len;
  if (cap < 4) cap = 4;
  const u32 a = porf_alloc(16 + ((u32)cap << 3), ${TYPES.array});
  PORF_ARR_LEN(a) = len; PORF_ARR_ENT(a) = a + 16; PORF_ARR_CAP(a) = cap;
  memset(MEM + PORF_ARR_ENT(a), 0, (size_t)cap << 3);
  return a;
}

${sti}int porf_arr_has_own(u32 a, u32 i) {
  if (i >= (u32)PORF_ARR_LEN(a)) return 0;
  return *(jsbits*)(MEM + PORF_ARR_ENT(a) + ((u64)i << 3)) != 0;
}

${sti}jsval porf_arr_get(u32 a, u32 i) {
  if (i >= (u32)PORF_ARR_LEN(a)) return JV_UNDEFINED;
  const jsbits b = *(jsbits*)(MEM + PORF_ARR_ENT(a) + ((u64)i << 3));
  if (b == 0) return JV_UNDEFINED;
  return porf_unpack(b);
}

${st}void porf_arr_grow(u32 a, i32 need) {
  i32 cap = PORF_ARR_CAP(a);
  if (need <= cap) return;
  const i32 copy = PORF_ARR_LEN(a) < cap ? PORF_ARR_LEN(a) : cap;
  while (cap < need) cap += cap >> 1 > 4 ? cap >> 1 : 4;
  const u32 ent = porf_alloc((u32)cap << 3, 0);
  memcpy(MEM + ent, MEM + PORF_ARR_ENT(a), (size_t)copy << 3);
  memset(MEM + ent + ((u64)copy << 3), 0, ((size_t)cap - (size_t)copy) << 3);
  PORF_ARR_ENT(a) = ent; PORF_ARR_CAP(a) = cap;
  porf_gc_barrier(a, ${TYPES.array});
}

${st}void porf_arr_set(u32 a, u32 i, jsval v) {
  const i32 len = PORF_ARR_LEN(a);
  if (i >= (u32)PORF_ARR_CAP(a)) porf_arr_grow(a, (i32)i + 1);
  if (i >= (u32)len) PORF_ARR_LEN(a) = (i32)i + 1;
  *(jsbits*)(MEM + PORF_ARR_ENT(a) + ((u64)i << 3)) = porf_arr_pack(v);
  if (porf_gc_type_can_reference(v.type)) porf_gc_barrier(a, ${TYPES.array});
}

${st}void porf_arr_delete(u32 a, u32 i) {
  if (i >= (u32)PORF_ARR_LEN(a)) return;
  *(jsbits*)(MEM + PORF_ARR_ENT(a) + ((u64)i << 3)) = 0;
}

${st}void porf_arr_set_len(u32 a, u32 new_len) {
  const u32 old_len = (u32)PORF_ARR_LEN(a);
  if (new_len < old_len) {
    const u32 cap = (u32)PORF_ARR_CAP(a);
    const u32 clear = old_len < cap ? old_len : cap;
    if (new_len < clear) memset(MEM + PORF_ARR_ENT(a) + ((u64)new_len << 3), 0, ((size_t)clear - new_len) << 3);
  }
  PORF_ARR_LEN(a) = (i32)new_len;
}

${st}jsval porf_arr_push(u32 a, jsval v) {
  const i32 len = PORF_ARR_LEN(a);
  porf_arr_grow(a, len + 1);
  *(jsbits*)(MEM + PORF_ARR_ENT(a) + ((u64)len << 3)) = porf_arr_pack(v);
  PORF_ARR_LEN(a) = len + 1;
  if (porf_gc_type_can_reference(v.type)) porf_gc_barrier(a, ${TYPES.array});
  return porf_box_num((f64)(len + 1));
}

// ---- strings ----
${st}u32 porf_bstr_new(u32 len) {
  const u32 s = porf_alloc(4 + len, ${TYPES.bytestring});
  *(u32*)(MEM + s) = len;
  return s;
}

${st}jsval porf_str_concat(jsval a, jsval b) {
  volatile u32 keep_a = (u32)a.val, keep_b = (u32)b.val;
  const u32 pa = keep_a, pb = keep_b;
  const u32 la = *(u32*)(MEM + pa), lb = *(u32*)(MEM + pb);
  if (a.type == ${TYPES.bytestring} && b.type == ${TYPES.bytestring}) {
    const u32 s = porf_bstr_new(la + lb);
    memcpy(MEM + s + 4, MEM + pa + 4, la);
    memcpy(MEM + s + 4 + la, MEM + pb + 4, lb);
    return porf_box((f64)s, ${TYPES.bytestring});
  }

  const u32 s = porf_alloc(4 + (la + lb) * 2, ${TYPES.string});
  *(u32*)(MEM + s) = la + lb;
  u16* out = (u16*)(MEM + s + 4);
  if (a.type == ${TYPES.bytestring}) {
    for (u32 i = 0; i < la; i++) out[i] = MEM[pa + 4 + i];
  } else {
    memcpy(out, MEM + pa + 4, (size_t)la * 2);
  }
  out += la;
  if (b.type == ${TYPES.bytestring}) {
    for (u32 i = 0; i < lb; i++) out[i] = MEM[pb + 4 + i];
  } else {
    memcpy(out, MEM + pb + 4, (size_t)lb * 2);
  }
  return porf_box((f64)s, ${TYPES.string});
}

${st}i32 porf_str_eq(jsval a, jsval b) {
  const u32 pa = (u32)a.val, pb = (u32)b.val;
  if (pa == pb) return 1;
  const u32 la = *(u32*)(MEM + pa);
  if (la != *(u32*)(MEM + pb)) return 0;
  const i32 ta = porf_jv_type(a), tb = porf_jv_type(b);
  if (ta == tb) return memcmp(MEM + pa + 4, MEM + pb + 4, (size_t)la * (ta == ${TYPES.string} ? 2 : 1)) == 0;
  if (ta == ${TYPES.bytestring}) {
    for (u32 i = 0; i < la; i++) if ((u16)MEM[pa + 4 + i] != *(u16*)(MEM + pb + 4 + i * 2)) return 0;
  } else {
    for (u32 i = 0; i < la; i++) if (*(u16*)(MEM + pa + 4 + i * 2) != (u16)MEM[pb + 4 + i]) return 0;
  }
  return 1;
}

${st}jsval porf_num_to_str(f64 d) {
  char buf[32];
  int n;
  if (d != d) n = snprintf(buf, sizeof buf, "NaN");
    else if (d == INFINITY) n = snprintf(buf, sizeof buf, "Infinity");
    else if (d == -INFINITY) n = snprintf(buf, sizeof buf, "-Infinity");
    else if (d == (f64)(i64)d && fabs(d) < 1e21) n = snprintf(buf, sizeof buf, "%lld", (i64)d);
    else {
    for (int prec = 1; prec <= 17; prec++) {
      n = snprintf(buf, sizeof buf, "%.*g", prec, d);
      f64 back; sscanf(buf, "%lf", &back);
      if (back == d) break;
    }
  }
  const u32 s = porf_bstr_new((u32)n);
  memcpy(MEM + s + 4, buf, (size_t)n);
  return porf_box((f64)s, ${TYPES.bytestring});
}

// ToString for + and template literals
${st}jsval porf_to_str(jsval v);
${st}jsval porf_str_concat(jsval a, jsval b);
${st}jsval porf_to_str(jsval v) {
  if (porf_jv_is_num(v)) return porf_num_to_str(v.val);
  const i32 t = v.type;
  if (t == ${TYPES.bytestring} || t == ${TYPES.string}) return v;
  if (t == ${TYPES.array}) {
    // join(',')
    const u32 a = (u32)v.val;
    const i32 n = PORF_ARR_LEN(a);
    jsval acc = porf_box((f64)porf_bstr_new(0), ${TYPES.bytestring});
    for (i32 i = 0; i < n; i++) {
      if (i) {
        const u32 c = porf_bstr_new(1); MEM[c + 4] = 44;
        acc = porf_str_concat(acc, porf_box((f64)c, ${TYPES.bytestring}));
      }
      const jsval e = porf_arr_get(a, (u32)i);
      const i32 et = porf_jv_type(e);
      if (et != ${TYPES.undefined} && !(et == ${TYPES.object} && (u32)e.val == 0))
        acc = porf_str_concat(acc, porf_to_str(e));
    }
    return acc;
  }
  const char* lit =
    t == ${TYPES.undefined} ? "undefined" :
    t == ${TYPES.boolean} ? ((u32)v.val ? "true" : "false") :
    t == ${TYPES.object} && (u32)v.val == 0 ? "null" :
    t == ${TYPES.function} ? "function" : "[object Object]";
  const u32 len = (u32)strlen(lit);
  const u32 s = porf_bstr_new(len);
  memcpy(MEM + s + 4, lit, len);
  return porf_box((f64)s, ${TYPES.bytestring});
}

// basic ToNumber (string parsing arrives with builtins port)
${sti}f64 porf_to_num(jsval v) {
  if (porf_jv_is_num(v)) return v.val;
  const i32 t = v.type;
  if (t == ${TYPES.boolean}) return (f64)(u32)v.val;
  if (t == ${TYPES.object} && (u32)v.val == 0) return 0.0; // null
  return porf_bits_to_f64(0x7FF8000000000000ull); // NaN
}

static inline int porf_bigint_is_heap(jsval v) {
  return v.type == ${TYPES.bigint} && v.val >= 2251799813685248.0;
}

static inline u32 porf_bigint_ptr(jsval v) {
  return (u32)(v.val - 2251799813685248.0);
}

static inline int porf_bigint_is_negative(jsval v) {
  return porf_bigint_is_heap(v) ? *(u8*)(MEM + porf_bigint_ptr(v)) != 0 : v.val < 0;
}

static u32 porf_bigint_trimmed_len(u32 p) {
  const u32 len = *(u16*)(MEM + p + 2);
  u32 i = 0;
  while (i < len && *(u32*)(MEM + p + 4 + (i << 2)) == 0) i++;
  return len - i;
}

static i32 porf_bigint_cmp_abs(jsval a, jsval b) {
  const int ah = porf_bigint_is_heap(a), bh = porf_bigint_is_heap(b);
  if (!ah && !bh) {
    const f64 av = a.val < 0 ? -a.val : a.val;
    const f64 bv = b.val < 0 ? -b.val : b.val;
    return av < bv ? -1 : av > bv ? 1 : 0;
  }
  if (ah && !bh) return 1;
  if (!ah && bh) return -1;

  const u32 ap = porf_bigint_ptr(a), bp = porf_bigint_ptr(b);
  const u32 alen = porf_bigint_trimmed_len(ap), blen = porf_bigint_trimmed_len(bp);
  if (alen != blen) return alen < blen ? -1 : 1;

  const u32 astart = *(u16*)(MEM + ap + 2) - alen;
  const u32 bstart = *(u16*)(MEM + bp + 2) - blen;
  for (u32 i = 0; i < alen; i++) {
    const u32 av = *(u32*)(MEM + ap + 4 + ((astart + i) << 2));
    const u32 bv = *(u32*)(MEM + bp + 4 + ((bstart + i) << 2));
    if (av != bv) return av < bv ? -1 : 1;
  }
  return 0;
}

static i32 porf_bigint_cmp(jsval a, jsval b) {
  const int an = porf_bigint_is_negative(a), bn = porf_bigint_is_negative(b);
  if (an != bn) return an ? -1 : 1;
  const i32 c = porf_bigint_cmp_abs(a, b);
  return an ? -c : c;
}

${sti}int porf_is_strlike(jsval v) {
  if (porf_jv_is_num(v)) return 0;
  const i32 t = v.type;
  return t == ${TYPES.bytestring} || t == ${TYPES.string} ||
    t == ${TYPES.object} && (u32)v.val != 0 || t == ${TYPES.array} || t == ${TYPES.function};
}

// JS + : string-ish on either side concats; else numeric coercion
${sti}jsval porf_add(jsval a, jsval b) {
  if (porf_jv_is_num(a) && porf_jv_is_num(b))
    return porf_box_num(a.val + b.val);
  if (porf_is_strlike(a) || porf_is_strlike(b)) {
    jsval sa = porf_to_str(a);
    volatile u32 keep_sa = porf_gc_type_can_reference(sa.type) ? (u32)sa.val : 0u;
    jsval sb = porf_to_str(b);
    (void)keep_sa;
    return porf_str_concat(sa, sb);
  }
  return porf_box_num(porf_to_num(a) + porf_to_num(b));
}

// numeric -, *, / on two unknown-typed operands: a single combined both-number fast-path (one
// hoistable/unswitchable condition) rather than two independent porf_to_num branches.
${sti}jsval porf_sub(jsval a, jsval b) {
  if (porf_jv_is_num(a) && porf_jv_is_num(b)) return porf_box_num(a.val - b.val);
  return porf_box_num(porf_to_num(a) - porf_to_num(b));
}
${sti}jsval porf_mul(jsval a, jsval b) {
  if (porf_jv_is_num(a) && porf_jv_is_num(b)) return porf_box_num(a.val * b.val);
  return porf_box_num(porf_to_num(a) * porf_to_num(b));
}
${sti}jsval porf_div(jsval a, jsval b) {
  if (porf_jv_is_num(a) && porf_jv_is_num(b)) return porf_box_num(a.val / b.val);
  return porf_box_num(porf_to_num(a) / porf_to_num(b));
}

// JS abstract relational comparison: -1/0/1, 2 = unordered (NaN involved).
// numeric coercion, or lexicographic when both sides are strings.
// twin helper: dies when string.ts/coercion builtins port (step 3).
${sti}i32 porf_cmp(jsval a, jsval b) {
  const i32 ta = porf_jv_type(a), tb = porf_jv_type(b);
  if (ta == ${TYPES.bigint} && tb == ${TYPES.bigint}) return porf_bigint_cmp(a, b);
  if ((ta == ${TYPES.bytestring} || ta == ${TYPES.string}) && (tb == ${TYPES.bytestring} || tb == ${TYPES.string})) {
    const u32 pa = (u32)a.val, pb = (u32)b.val;
    const u32 la = *(u32*)(MEM + pa), lb = *(u32*)(MEM + pb);
    const u32 n = la < lb ? la : lb;
    const int c = memcmp(MEM + pa + 4, MEM + pb + 4, n);
    if (c != 0) return c < 0 ? -1 : 1;
    return la == lb ? 0 : la < lb ? -1 : 1;
  }
  const f64 x = porf_to_num(a), y = porf_to_num(b);
  if (x != x || y != y) return 2;
  return x < y ? -1 : x > y ? 1 : 0;
}

// loose ==: common matrix (num/num, str/str, bool->num, null<->undefined);
// str<->num coercion arrives with the ToNumber builtin port
${sti}i32 porf_loose_eq(jsval a, jsval b) {
  const i32 ta = porf_jv_type(a), tb = porf_jv_type(b);
  if (ta == ${TYPES.number} && tb == ${TYPES.number}) return a.val == b.val;
  const int an = ta == ${TYPES.undefined} || (ta == ${TYPES.object} && (u32)a.val == 0);
  const int bn = tb == ${TYPES.undefined} || (tb == ${TYPES.object} && (u32)b.val == 0);
  if (an || bn) return an && bn;
  if ((ta == ${TYPES.bytestring} || ta == ${TYPES.string}) && (tb == ${TYPES.bytestring} || tb == ${TYPES.string}))
    return porf_str_eq(a, b);
  if ((ta == ${TYPES.bytestring} || ta == ${TYPES.string}) && tb == ${TYPES.number})
    return b.val == 0.0 && ((u32)a.val == 0u || *(u32*)(MEM + (u32)a.val) == 0u);
  if (ta == ${TYPES.number} && (tb == ${TYPES.bytestring} || tb == ${TYPES.string}))
    return a.val == 0.0 && ((u32)b.val == 0u || *(u32*)(MEM + (u32)b.val) == 0u);
  if (ta == ${TYPES.boolean}) return porf_loose_eq(porf_box_num((f64)(u32)a.val), b);
  if (tb == ${TYPES.boolean}) return porf_loose_eq(a, porf_box_num((f64)(u32)b.val));
  return porf_jv_eq(a, b);
}

// === : numbers as f64, strings by content, else identity
${sti}i32 porf_strict_eq(jsval a, jsval b) {
  if (porf_jv_is_num(a)) return porf_jv_is_num(b) && a.val == b.val;
  const i32 ta = porf_jv_type(a), tb = porf_jv_type(b);
  if ((ta == ${TYPES.bytestring} || ta == ${TYPES.string}) && (tb == ${TYPES.bytestring} || tb == ${TYPES.string})) return porf_str_eq(a, b);
  if (ta != tb) return 0;
  return (u32)a.val == (u32)b.val;
}

static int porf_argc;
static char** porf_argv;
static void porf_init(int argc, char** argv) {
  porf_argc = argc;
  porf_argv = argv;
${usesThreads ? '  porf_threads_default_pool_init();\n' : ''}\
  porf_arena_init();
}

`;
};

const CORO_RUNTIME = usesThreads => `// ---- coroutines (fiber stacks) ----
#if defined(__TINYC__) || (!defined(__x86_64__) && !defined(__aarch64__))
#define PORF_CORO_USE_UCONTEXT 1
#include <ucontext.h>
#else
#define PORF_CORO_USE_UCONTEXT 0
#endif

#ifndef MAP_NORESERVE
#define MAP_NORESERVE 0
#endif

#define PORF_CORO_STACK_SIZE (256u * 1024u)
#define PORF_CORO_MAX 16384

typedef struct porf_coro {
  char* stack_map;        // mmap reservation, including the low guard page
  size_t stack_map_size;
  char* stack_lo;         // first usable byte, above the guard page
  char* stack_top;        // high end of the downward-growing usable stack
  char* sp;               // saved stack pointer for GC while suspended
  char* caller_sp;        // inactive caller stack lower bound while running
  void* caller_stack_top;
#if PORF_CORO_USE_UCONTEXT
  ucontext_t ctx;
  ucontext_t caller_ctx;
  void (*fn)(void*);
  void* arg;
  i32 ctx_init;
#else
  jmp_buf resume_pt;      // inside the coroutine, at the await/yield
  jmp_buf caller_pt;      // latest frame that ran/resumed it
#endif
  jsval channel;          // value (or thrown exception) crossing the boundary
  i32 state;              // 0 idle, 1 running, 2 suspended, 3 done
  i32 throw_pending;      // resume delivers channel as a throw at the await
  i32 entry_try_depth;    // porf_try_depth when the coroutine started
  i32 saved_try_depth;    // porf_try_depth at suspension
  jmp_buf* try_save;      // try-stack entries [entry..saved) opened inside
  i32 try_save_cap;
  i32 live_idx;           // index in porf_coro_live, or -1 if not tracked
  struct porf_coro* parent;
} porf_coro;

typedef struct porf_coro_call {
  porf_coro coro;
  u32 idx;
  jsval callee;
  u32 env;
  jsval thisv;
  jsval newtv;
  i32 argc;
  jsbits* argv;
  jsval result;
  i32 started;
  u32 box_body;
  i32 box_type;
} porf_coro_call;

${usesThreads ? `static _Thread_local porf_coro* porf_coro_cur = 0;
static pthread_mutex_t porf_coro_live_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t porf_coro_stack_pool_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_mutex_t porf_coro_call_pool_lock = PTHREAD_MUTEX_INITIALIZER;` : 'static porf_coro* porf_coro_cur = 0;'}
static porf_coro* porf_coro_live[PORF_CORO_MAX];
static i32 porf_coro_live_len = 0;

static jsval porf_promise_pending(void) {
  const u32 p = porf_alloc(PORF_PROMISE_SIZE, ${TYPES.promise});
  *(jsbits*)(MEM + p + PORF_PROMISE_RESULT) = JV_UNDEFINED_BITS;
  *(u32*)(MEM + p + PORF_PROMISE_FULFILL_HEAD) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_FULFILL_TAIL) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_REJECT_HEAD) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_REJECT_TAIL) = 0;
  *(jsbits*)(MEM + p + PORF_PROMISE_PAYLOAD) = JV_UNDEFINED_BITS;
  *(u8*)(MEM + p + PORF_PROMISE_STATE) = 0;
  *(u8*)(MEM + p + PORF_PROMISE_FLAGS) = 0;
  *(u8*)(MEM + p + PORF_PROMISE_HANDLED) = 0;
  return porf_box((f64)p, ${TYPES.promise});
}

static void porf_promise_trigger_reactions(u32 reaction, jsval value) {
  while (reaction != 0) {
    const u32 next = *(u32*)(MEM + reaction + PORF_REACTION_NEXT);
    *(u32*)(MEM + reaction + PORF_REACTION_NEXT) = 0;
    *(jsbits*)(MEM + reaction + PORF_REACTION_VALUE) = porf_pack(value);
    porf_gc_barrier(reaction, PORF_GC_KIND_PROMISE_REACTION);
    porf_promise_enqueue_job(reaction);
    reaction = next;
  }
}

static void porf_promise_settle_direct(jsval promise, jsval value, i32 state) {
  if (promise.type != ${TYPES.promise}) return;
  const u32 p = (u32)promise.val;
  if (*(u8*)(MEM + p + PORF_PROMISE_STATE) != 0) return;
  const u32 reactions = *(u32*)(MEM + p + (state == 1 ? PORF_PROMISE_FULFILL_HEAD : PORF_PROMISE_REJECT_HEAD));
  *(jsbits*)(MEM + p + PORF_PROMISE_RESULT) = porf_pack(value);
  *(u32*)(MEM + p + PORF_PROMISE_FULFILL_HEAD) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_FULFILL_TAIL) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_REJECT_HEAD) = 0;
  *(u32*)(MEM + p + PORF_PROMISE_REJECT_TAIL) = 0;
  *(u8*)(MEM + p + PORF_PROMISE_STATE) = (u8)state;
  porf_gc_barrier(p, ${TYPES.promise});
  porf_promise_trigger_reactions(reactions, value);
}

static u32 porf_promise_new_coro_reaction(porf_coro_call* call, jsval out_promise, i32 is_throw) {
  const u32 reaction = porf_alloc(PORF_REACTION_SIZE, 0);
  *(u64*)(MEM + reaction + PORF_REACTION_HANDLER) = (u64)(uintptr_t)call;
  *(jsbits*)(MEM + reaction + PORF_REACTION_OUT_PROMISE) = porf_pack(out_promise);
  *(jsbits*)(MEM + reaction + PORF_REACTION_VALUE) = JV_UNDEFINED_BITS;
  *(u32*)(MEM + reaction + PORF_REACTION_NEXT) = 0;
  *(u32*)(MEM + reaction + PORF_REACTION_PAYLOAD) = (u32)is_throw;
  *(u8*)(MEM + reaction + PORF_REACTION_KIND) = 11;
  *(u8*)(MEM + reaction + PORF_REACTION_FLAGS) = 0;
  porf_gc_barrier(reaction, PORF_GC_KIND_PROMISE_REACTION);
  return reaction;
}

static void porf_promise_append_raw_reaction(u32 promise, u32 reaction, i32 reject) {
  const u32 head_off = reject ? PORF_PROMISE_REJECT_HEAD : PORF_PROMISE_FULFILL_HEAD;
  const u32 tail_off = reject ? PORF_PROMISE_REJECT_TAIL : PORF_PROMISE_FULFILL_TAIL;
  const u32 tail = *(u32*)(MEM + promise + tail_off);
  if (tail == 0) {
    *(u32*)(MEM + promise + head_off) = reaction;
  } else {
    *(u32*)(MEM + tail + PORF_REACTION_NEXT) = reaction;
    porf_gc_barrier(tail, PORF_GC_KIND_PROMISE_REACTION);
  }
  *(u32*)(MEM + promise + tail_off) = reaction;
  porf_gc_barrier(promise, ${TYPES.promise});
}

static void porf_promise_attach_coro(jsval awaited, porf_coro_call* call, jsval out_promise) {
  if (awaited.type != ${TYPES.promise}) porf_unreachable("coroutine awaited non-pending non-promise");
  const u32 p = (u32)awaited.val;
  *(u8*)(MEM + p + PORF_PROMISE_HANDLED) = 1;
  porf_promise_append_raw_reaction(p, porf_promise_new_coro_reaction(call, out_promise, 0), 0);
  porf_promise_append_raw_reaction(p, porf_promise_new_coro_reaction(call, out_promise, 1), 1);
}

static void porf_coro_prologue(void) {
  // stack selection happens at coroutine entry; the compiled body stays plain C.
}

static size_t porf_coro_page_size(void) {
  const long p = sysconf(_SC_PAGESIZE);
  return p > 0 ? (size_t)p : 4096u;
}

static char* porf_coro_read_sp(void) {
  void* sp;
#if !PORF_CORO_USE_UCONTEXT && defined(__x86_64__)
  __asm__ volatile("mov %%rsp, %0" : "=r"(sp));
#elif !PORF_CORO_USE_UCONTEXT && defined(__aarch64__)
  __asm__ volatile("mov %0, sp" : "=r"(sp));
#else
  char probe;
  sp = &probe;
#endif
  return (char*)sp;
}

static inline char* porf_coro_align_lo(char* p) {
  return (char*)(((uintptr_t)p + 7u) & ~(uintptr_t)7u);
}

static inline char* porf_coro_align_hi(char* p) {
  return (char*)((uintptr_t)p & ~(uintptr_t)7u);
}

static inline void* porf_coro_current_stack_top(void) {
#if PORF_GC_ENABLED
  return porf_c_stack_top;
#else
  return 0;
#endif
}

static inline void porf_coro_set_current_stack_top(void* top) {
#if PORF_GC_ENABLED
  porf_c_stack_top = top;
#else
  (void)top;
#endif
}

typedef struct porf_coro_stack_pool_entry {
  char* stack_map;
  size_t stack_map_size;
  char* stack_lo;
  char* stack_top;
} porf_coro_stack_pool_entry;

#define PORF_CORO_STACK_POOL_MAX 8192
static porf_coro_stack_pool_entry porf_coro_stack_pool[PORF_CORO_STACK_POOL_MAX];
static i32 porf_coro_stack_pool_len = 0;

static void porf_coro_stack_ensure(porf_coro* c) {
  if (c->stack_top) return;
${usesThreads ? '  pthread_mutex_lock(&porf_coro_stack_pool_lock);\n' : ''}\
  if (porf_coro_stack_pool_len > 0) {
    porf_coro_stack_pool_entry e = porf_coro_stack_pool[--porf_coro_stack_pool_len];
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_stack_pool_lock);\n' : ''}\
    c->stack_map = e.stack_map;
    c->stack_map_size = e.stack_map_size;
    c->stack_lo = e.stack_lo;
    c->stack_top = e.stack_top;
    c->sp = 0;
    return;
  }
${usesThreads ? '  pthread_mutex_unlock(&porf_coro_stack_pool_lock);\n' : ''}\
  const size_t page = porf_coro_page_size();
  const size_t usable = ((size_t)PORF_CORO_STACK_SIZE + page - 1u) & ~(page - 1u);
  const size_t map_size = usable + page;
  void* mem = mmap(NULL, map_size, PROT_NONE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_NORESERVE, -1, 0);
  if (mem == MAP_FAILED) {
    fprintf(stderr, "porffor: failed to reserve coroutine stack\\n");
    abort();
  }
  char* lo = (char*)mem + page;
  if (mprotect(lo, usable, PROT_READ | PROT_WRITE) != 0) {
    munmap(mem, map_size);
    fprintf(stderr, "porffor: failed to commit coroutine stack\\n");
    abort();
  }
  c->stack_map = (char*)mem;
  c->stack_map_size = map_size;
  c->stack_lo = lo;
  c->stack_top = lo + usable;
  c->sp = 0;
}

static void porf_coro_stack_free(porf_coro* c) {
  if (c->stack_map) {
${usesThreads ? '    pthread_mutex_lock(&porf_coro_stack_pool_lock);\n' : ''}\
    if (porf_coro_stack_pool_len < PORF_CORO_STACK_POOL_MAX) {
      porf_coro_stack_pool_entry e;
      e.stack_map = c->stack_map;
      e.stack_map_size = c->stack_map_size;
      e.stack_lo = c->stack_lo;
      e.stack_top = c->stack_top;
      porf_coro_stack_pool[porf_coro_stack_pool_len++] = e;
    } else {
      munmap(c->stack_map, c->stack_map_size);
    }
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_stack_pool_lock);\n' : ''}\
    c->stack_map = 0;
    c->stack_map_size = 0;
    c->stack_lo = 0;
    c->stack_top = 0;
    c->sp = 0;
  }
  free(c->try_save);
  c->try_save = 0;
  c->try_save_cap = 0;
}

static void porf_coro_live_add(porf_coro* c) {
${usesThreads ? '  pthread_mutex_lock(&porf_coro_live_lock);\n' : ''}\
  if (c->live_idx >= 0) {
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_live_lock);\n' : ''}\
    return;
  }
  if (porf_coro_live_len < PORF_CORO_MAX) {
    c->live_idx = porf_coro_live_len;
    porf_coro_live[porf_coro_live_len++] = c;
  }
${usesThreads ? '  pthread_mutex_unlock(&porf_coro_live_lock);\n' : ''}\
}

static void porf_coro_live_remove(porf_coro* c) {
${usesThreads ? '  pthread_mutex_lock(&porf_coro_live_lock);\n' : ''}\
  const i32 idx = c->live_idx;
  if (idx < 0) {
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_live_lock);\n' : ''}\
    return;
  }
  const i32 last = --porf_coro_live_len;
  porf_coro* moved = porf_coro_live[last];
  porf_coro_live[idx] = moved;
  moved->live_idx = idx;
  c->live_idx = -1;
${usesThreads ? '  pthread_mutex_unlock(&porf_coro_live_lock);\n' : ''}\
}

#define PORF_CORO_CALL_POOL_MAX 8192
static porf_coro_call* porf_coro_call_pool[PORF_CORO_CALL_POOL_MAX];
static i32 porf_coro_call_pool_len = 0;

static porf_coro_call* porf_coro_call_alloc(void) {
  porf_coro_call* call;
${usesThreads ? '  pthread_mutex_lock(&porf_coro_call_pool_lock);\n' : ''}\
  if (porf_coro_call_pool_len > 0) {
    call = porf_coro_call_pool[--porf_coro_call_pool_len];
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_call_pool_lock);\n' : ''}\
    memset(call, 0, sizeof(*call));
  } else {
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_call_pool_lock);\n' : ''}\
    call = calloc(1, sizeof(porf_coro_call));
    if (!call) abort();
  }
  return call;
}

static void porf_coro_call_free(porf_coro_call* call) {
  if (!call) return;
  porf_coro_live_remove(&call->coro);
  porf_coro_stack_free(&call->coro);
  free(call->argv);
${usesThreads ? '  pthread_mutex_lock(&porf_coro_call_pool_lock);\n' : ''}\
  if (porf_coro_call_pool_len < PORF_CORO_CALL_POOL_MAX) {
    porf_coro_call_pool[porf_coro_call_pool_len++] = call;
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_call_pool_lock);\n' : ''}\
  } else {
${usesThreads ? '    pthread_mutex_unlock(&porf_coro_call_pool_lock);\n' : ''}\
    free(call);
  }
}

#if PORF_GC_ENABLED
static void porf_coro_gc_scan_mem(const void* lo0, const void* hi0) {
  char* lo = porf_coro_align_lo((char*)lo0);
  char* hi = porf_coro_align_hi((char*)hi0);
  if (lo < hi) porf_gc_cons_scan_range((const u64*)lo, (const u64*)hi);
}

static void porf_coro_gc_scan_stack(porf_coro* c, char* sp) {
  if (!c || !sp || !c->stack_top) return;
  porf_coro_gc_scan_mem(sp, c->stack_top);
}

static void porf_coro_gc_scan_saved_context(porf_coro* c) {
#if PORF_CORO_USE_UCONTEXT
  porf_coro_gc_scan_mem(&c->ctx, (const char*)&c->ctx + sizeof(c->ctx));
#else
  porf_coro_gc_scan_mem(&c->resume_pt, (const char*)&c->resume_pt + sizeof(c->resume_pt));
#endif
}

static void porf_coro_gc_scan_caller_context(porf_coro* c) {
#if PORF_CORO_USE_UCONTEXT
  porf_coro_gc_scan_mem(&c->caller_ctx, (const char*)&c->caller_ctx + sizeof(c->caller_ctx));
#else
  porf_coro_gc_scan_mem(&c->caller_pt, (const char*)&c->caller_pt + sizeof(c->caller_pt));
#endif
}

static void porf_coro_gc_mark_call_fields(porf_coro_call* call, i32 mark_box) {
  if (!call) return;
  if (mark_box && call->box_body) porf_gc_mark_js((f64)call->box_body, call->box_type);
  porf_gc_mark_js(call->callee.val, call->callee.type);
  porf_gc_mark_js(call->thisv.val, call->thisv.type);
  porf_gc_mark_js(call->newtv.val, call->newtv.type);
  porf_gc_mark_js(call->result.val, call->result.type);
  porf_gc_mark_js(call->coro.channel.val, call->coro.channel.type);
  for (i32 i = 0; i < call->argc; i++) {
    const jsval v = porf_unpack(call->argv[i]);
    porf_gc_mark_js(v.val, v.type);
  }
}

static void porf_coro_gc_mark_suspended(porf_coro* c, i32 mark_box) {
  porf_coro_gc_mark_call_fields((porf_coro_call*)c, mark_box);
  if (c->sp) porf_coro_gc_scan_stack(c, c->sp);
  porf_coro_gc_scan_saved_context(c);
  if (c->try_save && c->saved_try_depth > c->entry_try_depth)
    porf_coro_gc_scan_mem(c->try_save, (const char*)c->try_save + (size_t)(c->saved_try_depth - c->entry_try_depth) * sizeof(jmp_buf));
}

static void porf_coro_gc_mark_handle(porf_coro_call* call) {
  if (!call) return;
  if (call->coro.state == 2) porf_coro_gc_mark_suspended(&call->coro, 0);
  else porf_coro_gc_mark_call_fields(call, 0);
}

static void porf_coro_gc_mark_active(porf_coro* c) {
  porf_coro_gc_mark_call_fields((porf_coro_call*)c, 1);
  if (c->caller_sp && c->caller_stack_top) porf_coro_gc_scan_mem(c->caller_sp, c->caller_stack_top);
  porf_coro_gc_scan_caller_context(c);
}
#endif

static void porf_coro_save_try_stack(porf_coro* c) {
  c->saved_try_depth = porf_try_depth;
  const i32 try_n = porf_try_depth - c->entry_try_depth;
  if (try_n > 0) {
    if (try_n > c->try_save_cap) {
      free(c->try_save);
      c->try_save = malloc((size_t)try_n * sizeof(jmp_buf));
      if (!c->try_save) abort();
      c->try_save_cap = try_n;
    }
    memcpy(c->try_save, porf_try_stack + c->entry_try_depth, (size_t)try_n * sizeof(jmp_buf));
  }
}

static void porf_coro_restore_try_stack(porf_coro* c) {
  porf_try_depth = c->saved_try_depth;
  const i32 try_n = c->saved_try_depth - c->entry_try_depth;
  if (try_n > 0) memcpy(porf_try_stack + c->entry_try_depth, c->try_save, (size_t)try_n * sizeof(jmp_buf));
}

static void porf_coro_prepare_run(porf_coro* c) {
  c->caller_sp = porf_coro_read_sp();
  c->caller_stack_top = porf_coro_current_stack_top();
  c->parent = porf_coro_cur;
  porf_coro_cur = c;
  porf_coro_set_current_stack_top(c->stack_top);
}

static void porf_coro_restore_caller(porf_coro* c) {
  porf_coro_set_current_stack_top(c->caller_stack_top);
  porf_coro_cur = c->parent;
  if (c->state == 3) porf_coro_stack_free(c);
}

#if PORF_CORO_USE_UCONTEXT
${usesThreads ? 'static _Thread_local porf_coro* porf_coro_starting = 0;' : 'static porf_coro* porf_coro_starting = 0;'}

static void porf_coro_ucontext_bootstrap(void) {
  porf_coro* c = porf_coro_starting;
  porf_coro_starting = 0;
  c->fn(c->arg);
  c->state = 3;
  porf_coro_set_current_stack_top(c->caller_stack_top);
  setcontext(&c->caller_ctx);
  abort();
}
#else
__attribute__((noreturn, noinline))
static void porf_coro_bootstrap(porf_coro* c, void (*fn)(void*), void* arg) {
  fn(arg);
  c->state = 3;
  porf_coro_set_current_stack_top(c->caller_stack_top);
  _longjmp(c->caller_pt, 1);
}

__attribute__((noreturn, noinline))
static void porf_coro_switch_start(char* stack_top, porf_coro* c, void (*fn)(void*), void* arg) {
  uintptr_t sp = (uintptr_t)stack_top & ~(uintptr_t)15u;
#if defined(__x86_64__)
  __asm__ volatile(
    "mov %0, %%rsp\\n"
    "call *%1\\n"
    :
    : "r"(sp), "r"(porf_coro_bootstrap), "D"(c), "S"(fn), "d"(arg)
    : "memory");
#elif defined(__aarch64__)
  __asm__ volatile(
    "mov sp, %0\\n"
    "mov x0, %1\\n"
    "mov x1, %2\\n"
    "mov x2, %3\\n"
    "br %4\\n"
    :
    : "r"(sp), "r"(c), "r"(fn), "r"(arg), "r"(porf_coro_bootstrap)
    : "memory");
#endif
  __builtin_unreachable();
}
#endif

// run fn-with-context as a coroutine; returns 1 if it completed, 0 if it
// suspended. completion leaves through the latest caller context/jump point.
__attribute__((noinline))
static int porf_coro_enter(porf_coro* c, void (*fn)(void*), void* arg) {
  porf_coro_stack_ensure(c);
  c->state = 1;
  c->entry_try_depth = porf_try_depth;
  volatile i32 outer_try = porf_try_depth;
  porf_coro_prepare_run(c);
#if PORF_CORO_USE_UCONTEXT
  c->fn = fn;
  c->arg = arg;
  if (!c->ctx_init) {
    if (getcontext(&c->ctx) != 0) abort();
    c->ctx.uc_stack.ss_sp = c->stack_lo;
    c->ctx.uc_stack.ss_size = (size_t)(c->stack_top - c->stack_lo);
    c->ctx.uc_link = NULL;
    makecontext(&c->ctx, porf_coro_ucontext_bootstrap, 0);
    c->ctx_init = 1;
  }
  porf_coro_starting = c;
  if (swapcontext(&c->caller_ctx, &c->ctx) != 0) abort();
#else
  if (_setjmp(c->caller_pt) == 0) porf_coro_switch_start(c->stack_top, c, fn, arg);
#endif
  porf_try_depth = outer_try; // suspension left the coroutine's depth active
  porf_coro_restore_caller(c);
  return c->state == 3;
}

__attribute__((noinline))
static jsval porf_coro_suspend(jsval out) {
  porf_coro* c = porf_coro_cur;
  if (!c) porf_unreachable("await outside coroutine");
  c->channel = out;
  porf_coro_save_try_stack(c);
  porf_coro_live_add(c);
  c->state = 2;
#if PORF_CORO_USE_UCONTEXT
  c->sp = porf_coro_read_sp();
  porf_coro_set_current_stack_top(c->caller_stack_top);
  if (swapcontext(&c->ctx, &c->caller_ctx) != 0) abort();
#else
  if (_setjmp(c->resume_pt) == 0) {
    c->sp = porf_coro_read_sp();
    porf_coro_set_current_stack_top(c->caller_stack_top);
    _longjmp(c->caller_pt, 1);
  }
#endif
  // resumed: stack + try entries restored; deliver value or throw
  if (c->throw_pending) {
    c->throw_pending = 0;
    porf_throw(c->channel);
  }
  return c->channel;
}

__attribute__((noinline))
static int porf_coro_resume_inner(porf_coro* c, jsval in, i32 is_throw) {
  if (c->state != 2) porf_unreachable("resume of non-suspended coroutine");
  porf_coro_live_remove(c);
  c->sp = 0;
  c->channel = in;
  c->throw_pending = is_throw;
  c->state = 1;
  volatile i32 my_try = porf_try_depth;
  porf_coro_restore_try_stack(c);
  porf_coro_prepare_run(c);
#if PORF_CORO_USE_UCONTEXT
  if (swapcontext(&c->caller_ctx, &c->ctx) != 0) abort();
#else
  if (_setjmp(c->caller_pt) == 0) _longjmp(c->resume_pt, 1);
#endif
  porf_try_depth = my_try; // restore resumer's depth (coroutine's was active)
  porf_coro_restore_caller(c);
  return c->state == 3;
}
static int porf_coro_resume(porf_coro* c, jsval in) { return porf_coro_resume_inner(c, in, 0); }
static int porf_coro_resume_throw(porf_coro* c, jsval err) { return porf_coro_resume_inner(c, err, 1); }

static jsval porf_await(jsval v) {
${usesThreads ? `\
  if (!porf_coro_cur && porf_jv_type(v) == ${TYPES.promise}) {
    const u32 p = (u32)v.val;
    while (*(u8*)(MEM + p + PORF_PROMISE_STATE) == 0) {
      const u32 reaction = porf_promise_dequeue_job();
      if (reaction == 0) break;
      porf_promise_run_one(reaction);
    }
    const u8 state = *(u8*)(MEM + p + PORF_PROMISE_STATE);
    if (state) *(u8*)(MEM + p + PORF_PROMISE_HANDLED) = 1;
    if (state == 1) return porf_unpack(*(jsbits*)(MEM + p + PORF_PROMISE_RESULT));
    if (state == 2) porf_throw(porf_unpack(*(jsbits*)(MEM + p + PORF_PROMISE_RESULT)));
  }
` : ''}\
  if (!porf_coro_cur) return v;
  if (porf_jv_type(v) != ${TYPES.promise}) return v;

  const u32 p = (u32)v.val;
  const u8 state = *(u8*)(MEM + p + PORF_PROMISE_STATE);
  if (state) *(u8*)(MEM + p + PORF_PROMISE_HANDLED) = 1;
  if (state == 1) return porf_unpack(*(jsbits*)(MEM + p + PORF_PROMISE_RESULT));
  if (state == 2) porf_throw(porf_unpack(*(jsbits*)(MEM + p + PORF_PROMISE_RESULT)));

  return porf_coro_suspend(v);
}
static jsval porf_yield(jsval v) {
  return porf_coro_suspend(v);
}

`;
