import './c-helpers.js';
import { Buffer } from './buffer.js';
import { codedError } from './internal/errors.js';
import { platform } from './internal/host.js';

Porffor.c`
#include <dlfcn.h>

// type codes, 4 bits each in a signature: the return type then each argument
#define PORF_FFI_VOID 0
#define PORF_FFI_I8 1
#define PORF_FFI_U8 2
#define PORF_FFI_I16 3
#define PORF_FFI_U16 4
#define PORF_FFI_I32 5
#define PORF_FFI_U32 6
#define PORF_FFI_I64 7
#define PORF_FFI_U64 8
#define PORF_FFI_F32 9
#define PORF_FFI_F64 10
#define PORF_FFI_PTR 11
#define PORF_FFI_CHAR 12
#define PORF_FFI_IS_FLOAT(t) ((t) == PORF_FFI_F32 || (t) == PORF_FFI_F64)

// calls pass all 8 integer and 8 float argument registers, the abi ignores undeclared ones
#define PORF_FFI_PARAMS u64, u64, u64, u64, u64, u64, u64, u64, f64, f64, f64, f64, f64, f64, f64, f64
typedef u64 (*porf_ffi_ifn)(PORF_FFI_PARAMS);
typedef f64 (*porf_ffi_ffn)(PORF_FFI_PARAMS);
typedef u64 (*porf_ffi_xfn)(u64, u64, u64, u64, u64, u64, u64, u64);

// low 64 bits of a bigint
static u64 porf_ffi_u64(f64 v) {
  if (v < 2251799813685248.0) return (u64)(i64)v;
  const u8 *b = MEM + (u32)(v - 2251799813685248.0);
  const u32 n = *(u16*)(b + 2);
  u64 out = *(u32*)(b + n * 4);
  if (n > 1) out |= (u64)*(u32*)(b + n * 4 - 4) << 32;
  return b[0] ? -out : out;
}

static jsval porf_ffi_bigint(u64 mag, int neg) {
  if (mag < 2251799813685248ull) return (jsval){ neg ? -(f64)mag : (f64)mag, 4 };
  const u32 p = porf_alloc(12, 4);
  *(u8*)(MEM + p) = neg;
  *(u16*)(MEM + p + 2) = 2;
  *(u32*)(MEM + p + 4) = mag >> 32;
  *(u32*)(MEM + p + 8) = (u32)mag;
  return (jsval){ (f64)p + 2251799813685248.0, 4 };
}

// raw native bits of a type as a js value
static inline __attribute__((always_inline)) jsval porf_ffi_value(u64 r, u32 t) {
  switch (t) {
    case PORF_FFI_VOID: return JV_UNDEFINED;
    case PORF_FFI_I8: return porf_box_num((int8_t)r);
    case PORF_FFI_U8: return porf_box_num((u8)r);
    case PORF_FFI_I16: return porf_box_num((int16_t)r);
    case PORF_FFI_U16: return porf_box_num((u16)r);
    case PORF_FFI_I32: return porf_box_num((i32)r);
    case PORF_FFI_U32: return porf_box_num((u32)r);
    case PORF_FFI_I64: return porf_ffi_bigint((i64)r < 0 ? -r : r, (i64)r < 0);
    case PORF_FFI_F32: return porf_box_num(porf_bits_to_f32((u32)r));
    case PORF_FFI_F64: return porf_box_num(porf_bits_to_f64_bits(r));
    case PORF_FFI_CHAR: return porf_box_num((char)r);
  }
  return porf_ffi_bigint(r, 0);
}

// numbers allowed per type: none for pointers, safe integers for 64-bit types
static const i64 porf_ffi_min[13] = { 0, -128, 0, -32768, 0, INT32_MIN, 0, -9007199254740991ll, 0, 0, 0, 1, -128 };
static const i64 porf_ffi_max[13] = { 0, 127, 255, 32767, 65535, INT32_MAX, UINT32_MAX, 9007199254740991ll, 9007199254740991ll, 0, 0, 0, 127 };

// numbers, inline bigints and null pointers for integer types, without calls
static inline __attribute__((always_inline)) int porf_ffi_fast_arg(jsval v, u32 t, u64 *out) {
  const i64 x = (i64)v.val;
  *out = x;
  if (v.type == 1) return (f64)x == v.val && x >= porf_ffi_min[t] && x <= porf_ffi_max[t];
  if (v.type == 4) return v.val < 2251799813685248.0 && (t == PORF_FFI_PTR || t == PORF_FFI_I64 || t == PORF_FFI_U64);
  return t == PORF_FFI_PTR && (v.type == 0 || (v.type == 7 && x == 0));
}

// heap bigints, buffers and strings, which are copied to *str for the caller to free
static PORF_NOINLINE int porf_ffi_slow_arg(jsval v, u32 t, u64 *out, char **str) {
  if (v.type == 4) {
    *out = porf_ffi_u64(v.val);
    return t == PORF_FFI_PTR || t == PORF_FFI_I64 || t == PORF_FFI_U64;
  }
  if (t != PORF_FFI_PTR) return 0;

  switch (v.type) {
    case 13: case 14: *out = (u64)(MEM + porf_jv_ptr(v) + 8); return 1;
    case 15: *out = (u64)porf_node_u8(v); return 1;
    case 67: case 195: *out = (u64)(*str = porf_node_bytes(v, NULL)); return 1;
  }
  if (v.type < 80 || v.type > 90) return 0;
  *out = (u64)porf_node_u8(v);
  return 1;
}

// a js value as the raw native bits of a type, 0 if it does not fit
static inline int porf_ffi_arg(jsval v, u32 t, u64 *out, char **str) {
  if (PORF_FFI_IS_FLOAT(t)) {
    *out = t == PORF_FFI_F64 ? porf_f64_to_bits(v.val) : porf_f32_to_bits(v.val);
    return v.type == 1;
  }
  return porf_ffi_fast_arg(v, t, out) || porf_ffi_slow_arg(v, t, out, str);
}

// signatures with a float argument or result have this bit set
#define PORF_FFI_FLOATS (1ull << 40)

// calls fn with js arguments as sig describes, a bad argument gives its 1-based index typed PORF_FFI_BAD
#define PORF_FFI_BAD 255
static PORF_NOINLINE jsval porf_ffi_call(u64 fn, u64 sig, const jsval *args) {
  u64 ints[8] = { 0 }, floats[8] = { 0 };
  char *strs[8];
  u32 argc = 0, ni = 0, nf = 0, owned = 0;
  jsval out = JV_UNDEFINED;
  for (u64 s = (sig & (PORF_FFI_FLOATS - 1)) >> 4; s; s >>= 4, argc++) {
    const u32 t = s & 15;
    if (!porf_ffi_arg(args[argc], t, PORF_FFI_IS_FLOAT(t) ? &floats[nf++] : &ints[ni++], &strs[argc])) {
      out = (jsval){ argc + 1, PORF_FFI_BAD };
      break;
    }
    if ((args[argc].type | 128) == 195) owned |= 1u << argc;
  }

  const u32 rt = sig & 15;
  #define PORF_FFI_ARGS ints[0], ints[1], ints[2], ints[3], ints[4], ints[5], ints[6], ints[7], \
    porf_bits_to_f64_bits(floats[0]), porf_bits_to_f64_bits(floats[1]), porf_bits_to_f64_bits(floats[2]), porf_bits_to_f64_bits(floats[3]), \
    porf_bits_to_f64_bits(floats[4]), porf_bits_to_f64_bits(floats[5]), porf_bits_to_f64_bits(floats[6]), porf_bits_to_f64_bits(floats[7])
  if (out.type != PORF_FFI_BAD) out = porf_ffi_value(PORF_FFI_IS_FLOAT(rt) ? porf_f64_to_bits(((porf_ffi_ffn)fn)(PORF_FFI_ARGS)) : ((porf_ffi_ifn)fn)(PORF_FFI_ARGS), rt);
  #undef PORF_FFI_ARGS

  for (u32 i = 0; owned; i++, owned >>= 1) if (owned & 1) free(strs[i]);
  return out;
}

// the same for signatures without floats: each argument converts straight into its register
static inline __attribute__((always_inline)) jsval porf_ffi_call_ints(u64 fn, u64 sig, jsval a0, jsval a1, jsval a2, jsval a3, jsval a4, jsval a5, jsval a6, jsval a7) {
  u64 x0 = 0, x1 = 0, x2 = 0, x3 = 0, x4 = 0, x5 = 0, x6 = 0, x7 = 0;
  #define PORF_FFI_ARG(i) if ((sig >> 4 * (i + 1)) && !porf_ffi_fast_arg(a##i, (sig >> 4 * (i + 1)) & 15, &x##i)) goto slow;
  PORF_FFI_ARG(0) PORF_FFI_ARG(1) PORF_FFI_ARG(2) PORF_FFI_ARG(3) PORF_FFI_ARG(4) PORF_FFI_ARG(5) PORF_FFI_ARG(6) PORF_FFI_ARG(7)
  #undef PORF_FFI_ARG
  return porf_ffi_value(((porf_ffi_xfn)fn)(x0, x1, x2, x3, x4, x5, x6, x7), sig & 15);

slow:
  return porf_ffi_call(fn, sig, (const jsval[8]){ a0, a1, a2, a3, a4, a5, a6, a7 });
}

// for compiled wrappers (constant sig), 0 when an argument needs the generic path
static inline __attribute__((always_inline)) int porf_ffi_direct(u64 fn, u64 sig, jsval a0, jsval a1, jsval a2, jsval a3, jsval a4, jsval a5, jsval a6, jsval a7, jsval *out) {
  u64 x[8] = { 0 }, d[8] = { 0 };
  u32 ni = 0, nf = 0;
  if (!fn) return 0;
  #define PORF_FFI_ARG(i) \
    if (sig >> 4 * (i + 1) & 15) { \
      const u32 t = sig >> 4 * (i + 1) & 15; \
      if (!PORF_FFI_IS_FLOAT(t)) { \
        if (!porf_ffi_fast_arg(a##i, t, &x[ni++])) return 0; \
      } else if (!porf_ffi_arg(a##i, t, &d[nf++], NULL)) return 0; \
    }
  PORF_FFI_ARG(0) PORF_FFI_ARG(1) PORF_FFI_ARG(2) PORF_FFI_ARG(3) PORF_FFI_ARG(4) PORF_FFI_ARG(5) PORF_FFI_ARG(6) PORF_FFI_ARG(7)
  #undef PORF_FFI_ARG

  const u32 rt = sig & 15;
  #define PORF_FFI_ARGS x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], \
    porf_bits_to_f64_bits(d[0]), porf_bits_to_f64_bits(d[1]), porf_bits_to_f64_bits(d[2]), porf_bits_to_f64_bits(d[3]), \
    porf_bits_to_f64_bits(d[4]), porf_bits_to_f64_bits(d[5]), porf_bits_to_f64_bits(d[6]), porf_bits_to_f64_bits(d[7])
  if (!(sig & PORF_FFI_FLOATS)) *out = porf_ffi_value(((porf_ffi_xfn)fn)(x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7]), rt);
    else if (PORF_FFI_IS_FLOAT(rt)) *out = porf_ffi_value(porf_f64_to_bits(((porf_ffi_ffn)fn)(PORF_FFI_ARGS)), rt);
    else *out = porf_ffi_value(((porf_ffi_ifn)fn)(PORF_FFI_ARGS), rt);
  #undef PORF_FFI_ARGS
  return 1;
}

// callbacks: a fixed pool of native entry points that hand their raw arguments to js
#define PORF_FFI_CALLBACKS 64
static u64 porf_ffi_cb_sigs[PORF_FFI_CALLBACKS];
static jsval porf_ffi_dispatch;

static u64 porf_ffi_cb_run(u32 slot, const u64 *ints, const f64 *floats) {
  const u64 sig = porf_ffi_cb_sigs[slot];
  jsbits argv[9];
  u32 argc = 0, ni = 0, nf = 0;
  argv[argc++] = porf_pack(porf_box_num(slot));
  for (u64 s = sig >> 4; s; s >>= 4) {
    const u32 t = s & 15;
    argv[argc++] = porf_pack(porf_ffi_value(PORF_FFI_IS_FLOAT(t) ? porf_f64_to_bits(floats[nf++]) : ints[ni++], t));
  }

  const jsval r = porf_call_dynamic(porf_ffi_dispatch, JV_UNDEFINED, JV_UNDEFINED, argc, argv);
  u64 out = 0;
  char *str = NULL;
  // incompatible results (and strings, which would not outlive the call) return zero
  if (!porf_ffi_arg(r, sig & 15, &out, &str) || str) out = 0;
  free(str);
  return out;
}

#define PORF_FFI_CB_PARAMS u64 a0, u64 a1, u64 a2, u64 a3, u64 a4, u64 a5, u64 a6, u64 a7, f64 d0, f64 d1, f64 d2, f64 d3, f64 d4, f64 d5, f64 d6, f64 d7
#define PORF_FFI_CB(n) \
  static u64 porf_ffi_cbi##n(PORF_FFI_CB_PARAMS) { \
    const u64 ints[8] = { a0, a1, a2, a3, a4, a5, a6, a7 }; \
    const f64 floats[8] = { d0, d1, d2, d3, d4, d5, d6, d7 }; \
    return porf_ffi_cb_run(0##n, ints, floats); \
  } \
  static f64 porf_ffi_cbf##n(PORF_FFI_CB_PARAMS) { \
    const u64 ints[8] = { a0, a1, a2, a3, a4, a5, a6, a7 }; \
    const f64 floats[8] = { d0, d1, d2, d3, d4, d5, d6, d7 }; \
    return porf_bits_to_f64_bits(porf_ffi_cb_run(0##n, ints, floats)); \
  }
#define PORF_FFI_CB8(b) PORF_FFI_CB(b##0) PORF_FFI_CB(b##1) PORF_FFI_CB(b##2) PORF_FFI_CB(b##3) PORF_FFI_CB(b##4) PORF_FFI_CB(b##5) PORF_FFI_CB(b##6) PORF_FFI_CB(b##7)
PORF_FFI_CB8(0) PORF_FFI_CB8(1) PORF_FFI_CB8(2) PORF_FFI_CB8(3) PORF_FFI_CB8(4) PORF_FFI_CB8(5) PORF_FFI_CB8(6) PORF_FFI_CB8(7)

#define PORF_FFI_CBT8(p, b) (void*)p##b##0, (void*)p##b##1, (void*)p##b##2, (void*)p##b##3, (void*)p##b##4, (void*)p##b##5, (void*)p##b##6, (void*)p##b##7
#define PORF_FFI_CBT(p) PORF_FFI_CBT8(p, 0), PORF_FFI_CBT8(p, 1), PORF_FFI_CBT8(p, 2), PORF_FFI_CBT8(p, 3), PORF_FFI_CBT8(p, 4), PORF_FFI_CBT8(p, 5), PORF_FFI_CBT8(p, 6), PORF_FFI_CBT8(p, 7)
static void *const porf_ffi_cbs[2][PORF_FFI_CALLBACKS] = { { PORF_FFI_CBT(porf_ffi_cbi) }, { PORF_FFI_CBT(porf_ffi_cbf) } };
`;

const codes = {
  __proto__: null,
  void: 0,
  int8: 1, i8: 1,
  uint8: 2, u8: 2, bool: 2,
  int16: 3, i16: 3,
  uint16: 4, u16: 4,
  int32: 5, i32: 5,
  uint32: 6, u32: 6,
  int64: 7, i64: 7,
  uint64: 8, u64: 8,
  float32: 9, f32: 9, float: 9,
  float64: 10, f64: 10, double: 10,
  pointer: 11, ptr: 11, string: 11, str: 11, buffer: 11, arraybuffer: 11, function: 11,
  char: 12
};
const codeNames = [ 'void', 'an int8', 'a uint8', 'an int16', 'a uint16', 'an int32', 'a uint32', 'an int64', 'a uint64', 'a float', 'a double', 'a buffer, an ArrayBuffer, a string, or a bigint', 'a char' ];

const invalid = message => codedError(TypeError, 'ERR_INVALID_ARG_VALUE', message);
const callFailed = message => codedError(Error, 'ERR_FFI_CALL_FAILED', message);
const closedError = () => codedError(Error, 'ERR_FFI_LIBRARY_CLOSED', 'Library is closed');

const typeCode = (name, result) => {
  const code = codes[name];
  if (code === undefined || (code === 0 && !result)) throw invalid(`Unsupported FFI type: ${name}`);
  return code;
};

// return type then argument types, 4 bits each
const encode = signature => {
  const args = signature?.arguments ?? [];
  if (args.length > 8) throw invalid('FFI functions take at most 8 arguments');
  let sig = typeCode(signature?.return ?? 'void', true), shift = 16, floats = sig === 9 || sig === 10;
  for (const x of args) {
    const code = typeCode(x, false);
    if (code === 9 || code === 10) floats = true;
    sig += code * shift;
    shift *= 16;
  }
  // the PORF_FFI_FLOATS bit
  return floats ? sig + 2 ** 40 : sig;
};

const typeAt = (sig, i) => Math.floor(sig / 16 ** (i + 1)) % 16;
const arity = sig => {
  let n = 0;
  while (typeAt(sig, n) !== 0) n++;
  return n;
};

const checkPointer = pointer => {
  if (typeof pointer !== 'bigint') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The pointer must be a bigint');
};

const callError = (status, sig) => {
  if (status < 0) return closedError();
  return invalid(`Argument ${status - 1} must be ${codeNames[typeAt(sig, status - 1)]}`);
};

// [ wrapper, invalidate ], compiled is codegen's (ptr, generic) => [ wrapper, invalidate ] for a literal signature
const wrap = (name, ptr, sig, compiled) => {
  let fn = ptr;
  const generic = (a0, a1, a2, a3, a4, a5, a6, a7) => {
    const f = fn, s = sig;
    let out, status = 0;
    Porffor.c`{
  const u64 sig = (u64)s.val;
  if (f.val == 0) status = -1;
    else if (sig & PORF_FFI_FLOATS) out = porf_ffi_call((u64)f.val, sig, (const jsval[8]){ a0, a1, a2, a3, a4, a5, a6, a7 });
    else out = porf_ffi_call_ints((u64)f.val, sig, a0, a1, a2, a3, a4, a5, a6, a7);
  if (out.type == PORF_FFI_BAD) status = out.val;
}`;
    if (status !== 0) throw callError(status, sig);
    return out;
  };

  const [ call, invalidate ] = compiled === undefined ? [ generic, () => {} ] : compiled(ptr, generic);
  Object.defineProperty(call, 'name', { value: name });
  Object.defineProperty(call, 'length', { value: arity(sig) });
  call.pointer = BigInt(ptr);
  return [ call, () => {
    fn = 0;
    invalidate();
  } ];
};

// js function per callback slot, or a WeakRef to it once unref'd, and the library that registered it
const callbacks = [], owners = [];
const dispatch = (slot, ...args) => {
  const target = callbacks[slot];
  const fn = target instanceof WeakRef ? target.deref() : target;
  if (fn !== undefined) return fn(...args);
};

const callbackSlot = (lib, pointer) => {
  let slot = -1;
  Porffor.c`{
  const u64 p = porf_ffi_u64(pointer.val);
  for (i32 i = 0; i < PORF_FFI_CALLBACKS; i++) if ((u64)porf_ffi_cbs[0][i] == p || (u64)porf_ffi_cbs[1][i] == p) slot = i;
}`;
  if (slot === -1 || owners[slot] !== lib) throw invalid('Unknown callback pointer');
  return slot;
};

export class DynamicLibrary {
  #handle;
  #path;
  #functions = { __proto__: null };
  #signatures = { __proto__: null };
  #symbols = { __proto__: null };
  #invalidators = [];

  constructor(path) {
    if (path !== null && typeof path !== 'string') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "path" argument must be of type string or null');
    let handle = 0, err;
    Porffor.c`{
  char *p = path.type == 0 || path.type == 7 ? NULL : porf_node_bytes(path, NULL);
  void *h = dlopen(p, RTLD_LAZY);
  free(p);
  if (h) handle = (f64)(u64)h;
    else err = porf_node_cstr(dlerror());
}`;
    if (handle === 0) throw callFailed(`dlopen failed: ${err}`);
    this.#handle = handle;
    this.#path = path ?? '';
  }

  get path() {
    return this.#path;
  }

  get functions() {
    return { __proto__: null, ...this.#functions };
  }

  get symbols() {
    return { __proto__: null, ...this.#symbols };
  }

  close() {
    const handle = this.#handle;
    if (handle === 0) return;
    this.#handle = 0;
    for (const x of this.#invalidators) x();
    for (let i = 0; i < 64; i++) if (owners[i] === this) callbacks[i] = owners[i] = undefined;
    Porffor.c`dlclose((void*)(u64)handle.val);`;
  }

  [Symbol.dispose]() {
    this.close();
  }

  getSymbol(name) {
    const handle = this.#handle;
    if (handle === 0) throw closedError();
    const cached = this.#symbols[name];
    if (cached !== undefined) return cached;

    let ptr = 0, err;
    Porffor.c`{
  char *n = porf_node_bytes(name, NULL);
  dlerror();
  void *p = dlsym((void*)(u64)handle.val, n);
  free(n);
  if (p) ptr = (f64)(u64)p;
    else err = porf_node_cstr(dlerror());
}`;
    if (ptr === 0) throw callFailed(`dlsym failed: ${err}`);
    return this.#symbols[name] = BigInt(ptr);
  }

  getSymbols() {
    return this.symbols;
  }

  getFunction(name, signature, compiled) {
    const sig = encode(signature);
    const cached = this.#functions[name];
    if (cached !== undefined) {
      if (this.#signatures[name] !== sig) throw invalid(`Function ${name} was already requested with a different signature`);
      return cached;
    }

    const [ fn, invalidate ] = wrap(name, Number(this.getSymbol(name)), sig, compiled);
    this.#invalidators.push(invalidate);
    this.#signatures[name] = sig;
    return this.#functions[name] = fn;
  }

  getFunctions(definitions, compiled) {
    if (definitions === undefined) return this.functions;
    const out = {};
    for (const name in definitions) out[name] = this.getFunction(name, definitions[name], compiled === undefined ? undefined : compiled[name]);
    return out;
  }

  registerCallback(signature, callback) {
    if (callback === undefined) {
      callback = signature;
      signature = undefined;
    }
    if (this.#handle === 0) throw closedError();
    if (typeof callback !== 'function') throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "callback" argument must be of type function');

    const sig = encode(signature);
    let slot = 0;
    while (slot < 64 && owners[slot] !== undefined) slot++;
    if (slot === 64) throw callFailed('Too many FFI callbacks registered');
    callbacks[slot] = callback;
    owners[slot] = this;

    const d = dispatch;
    let ptr = 0;
    Porffor.c`porf_ffi_dispatch = d;
porf_ffi_cb_sigs[(i32)slot] = (u64)sig.val & (PORF_FFI_FLOATS - 1);
ptr = (f64)(u64)porf_ffi_cbs[PORF_FFI_IS_FLOAT((u64)sig.val & 15)][(i32)slot];`;
    return BigInt(ptr);
  }

  unregisterCallback(pointer) {
    const slot = callbackSlot(this, pointer);
    callbacks[slot] = owners[slot] = undefined;
  }

  refCallback(pointer) {
    const slot = callbackSlot(this, pointer);
    const target = callbacks[slot];
    if (!(target instanceof WeakRef)) return;
    const fn = target.deref();
    if (fn === undefined) throw invalid('Callback was garbage collected');
    callbacks[slot] = fn;
  }

  unrefCallback(pointer) {
    const slot = callbackSlot(this, pointer);
    const target = callbacks[slot];
    if (target instanceof WeakRef) {
      if (target.deref() === undefined) throw invalid('Callback was garbage collected');
      return;
    }
    callbacks[slot] = new WeakRef(target);
  }
}

export const dlopen = (path, definitions, compiled) => {
  const lib = new DynamicLibrary(path);
  let functions;
  try {
    functions = definitions === undefined ? Object.freeze({ __proto__: null }) : lib.getFunctions(definitions, compiled);
  } catch (e) {
    lib.close();
    throw e;
  }
  return {
    lib,
    functions,
    [Symbol.dispose]() {
      lib.close();
    }
  };
};

export const dlclose = handle => handle.close();
export const dlsym = (handle, symbol) => handle.getSymbol(symbol);

export const suffix = platform === 'darwin' ? 'dylib' : 'so';

export const types = {
  __proto__: null,
  VOID: 'void',
  POINTER: 'pointer',
  BUFFER: 'buffer',
  ARRAY_BUFFER: 'arraybuffer',
  FUNCTION: 'function',
  BOOL: 'bool',
  CHAR: 'char',
  STRING: 'string',
  FLOAT: 'float',
  DOUBLE: 'double',
  INT_8: 'int8',
  UINT_8: 'uint8',
  INT_16: 'int16',
  UINT_16: 'uint16',
  INT_32: 'int32',
  UINT_32: 'uint32',
  INT_64: 'int64',
  UINT_64: 'uint64',
  FLOAT_32: 'float32',
  FLOAT_64: 'float64'
};

const load = (pointer, offset, type) => {
  checkPointer(pointer);
  let out;
  Porffor.c`{
  const u8 *p = (const u8*)porf_ffi_u64(pointer.val) + (i64)offset.val;
  const u32 t = (u32)type.val;
  u64 r = 0;
  if (t == PORF_FFI_I8 || t == PORF_FFI_U8) r = *p;
    else if (t == PORF_FFI_I16 || t == PORF_FFI_U16) r = *(const u16*)p;
    else if (t == PORF_FFI_I32 || t == PORF_FFI_U32 || t == PORF_FFI_F32) r = *(const u32*)p;
    else memcpy(&r, p, 8);
  out = porf_ffi_value(r, t);
}`;
  return out;
};

const store = (pointer, offset, value, type) => {
  checkPointer(pointer);
  let ok = 0;
  Porffor.c`{
  u8 *p = (u8*)porf_ffi_u64(pointer.val) + (i64)offset.val;
  const u32 t = (u32)type.val;
  u64 r = 0;
  if (porf_ffi_arg(value, t, &r, NULL)) {
    ok = 1;
    if (t == PORF_FFI_I8 || t == PORF_FFI_U8) *p = (u8)r;
      else if (t == PORF_FFI_I16 || t == PORF_FFI_U16) *(u16*)p = (u16)r;
      else if (t == PORF_FFI_I32 || t == PORF_FFI_U32 || t == PORF_FFI_F32) *(u32*)p = (u32)r;
      else memcpy(p, &r, 8);
  }
}`;
  if (!ok) throw invalid(`The value must be ${codeNames[type]}`);
};

export const getInt8 = (pointer, offset = 0) => load(pointer, offset, 1);
export const getUint8 = (pointer, offset = 0) => load(pointer, offset, 2);
export const getInt16 = (pointer, offset = 0) => load(pointer, offset, 3);
export const getUint16 = (pointer, offset = 0) => load(pointer, offset, 4);
export const getInt32 = (pointer, offset = 0) => load(pointer, offset, 5);
export const getUint32 = (pointer, offset = 0) => load(pointer, offset, 6);
export const getInt64 = (pointer, offset = 0) => load(pointer, offset, 7);
export const getUint64 = (pointer, offset = 0) => load(pointer, offset, 8);
export const getFloat32 = (pointer, offset = 0) => load(pointer, offset, 9);
export const getFloat64 = (pointer, offset = 0) => load(pointer, offset, 10);

export const setInt8 = (pointer, offset, value) => store(pointer, offset, value, 1);
export const setUint8 = (pointer, offset, value) => store(pointer, offset, value, 2);
export const setInt16 = (pointer, offset, value) => store(pointer, offset, value, 3);
export const setUint16 = (pointer, offset, value) => store(pointer, offset, value, 4);
export const setInt32 = (pointer, offset, value) => store(pointer, offset, value, 5);
export const setUint32 = (pointer, offset, value) => store(pointer, offset, value, 6);
export const setInt64 = (pointer, offset, value) => store(pointer, offset, value, 7);
export const setUint64 = (pointer, offset, value) => store(pointer, offset, value, 8);
export const setFloat32 = (pointer, offset, value) => store(pointer, offset, value, 9);
export const setFloat64 = (pointer, offset, value) => store(pointer, offset, value, 10);

export const toString = pointer => {
  checkPointer(pointer);
  let out = null;
  Porffor.c`{
  const char *p = (const char*)porf_ffi_u64(pointer.val);
  if (p) out = porf_node_cstr(p);
}`;
  return out;
};

const copyFrom = (pointer, length, copy, target) => {
  checkPointer(pointer);
  if (copy === false) throw callFailed('Zero-copy views of native memory are not supported');
  Porffor.c`memcpy(porf_node_u8(target), (const void*)porf_ffi_u64(pointer.val), (size_t)length.val);`;
  return target;
};

export const toBuffer = (pointer, length, copy = true) => copyFrom(pointer, length, copy, Buffer.allocUnsafe(length));
export const toArrayBuffer = (pointer, length, copy = true) => copyFrom(pointer, length, copy, new Uint8Array(length)).buffer;

// the address of a view's or buffer's bytes
export const getRawPointer = source => {
  let out = 0, ok = 0;
  Porffor.c`{
  u64 p = 0;
  if (source.type != 67 && source.type != 195 && source.type != 0 && source.type != 7 && source.type != 4 && porf_ffi_arg(source, PORF_FFI_PTR, &p, NULL)) {
    ok = 1;
    out = (f64)p;
  }
}`;
  if (!ok) throw codedError(TypeError, 'ERR_INVALID_ARG_TYPE', 'The "source" argument must be an instance of Buffer, ArrayBuffer, SharedArrayBuffer, or ArrayBufferView');
  return BigInt(out);
};

const exportBytes = (source, byteLength, pointer, length, terminator) => {
  checkPointer(pointer);
  if (length < byteLength + terminator) throw codedError(RangeError, 'ERR_OUT_OF_RANGE', `The value of "length" is out of range. It must be >= ${byteLength + terminator}. Received ${length}`);
  const from = getRawPointer(source);
  Porffor.c`{
  u8 *p = (u8*)porf_ffi_u64(pointer.val);
  memcpy(p, (const void*)porf_ffi_u64(from.val), (size_t)byteLength.val);
  memset(p + (size_t)byteLength.val, 0, (size_t)terminator.val);
}`;
};

export const exportString = (string, pointer, length, encoding = 'utf8') => {
  const bytes = Buffer.from(string, encoding);
  const wide = encoding === 'utf16le' || encoding === 'utf-16le' || encoding === 'ucs2' || encoding === 'ucs-2';
  exportBytes(bytes, bytes.length, pointer, length, wide ? 2 : 1);
};
export const exportBuffer = (buffer, pointer, length) => exportBytes(buffer, buffer.length, pointer, length, 0);
export const exportArrayBuffer = (arrayBuffer, pointer, length) => exportBytes(arrayBuffer, arrayBuffer.byteLength, pointer, length, 0);
export const exportArrayBufferView = (view, pointer, length) => exportBytes(view, view.byteLength, pointer, length, 0);

export const getCurrentEventLoop = () => {
  throw codedError(Error, 'ERR_METHOD_NOT_IMPLEMENTED', 'The getCurrentEventLoop method is not implemented');
};

export default {
  DynamicLibrary, dlopen, dlclose, dlsym, suffix, types,
  getInt8, getUint8, getInt16, getUint16, getInt32, getUint32, getInt64, getUint64, getFloat32, getFloat64,
  setInt8, setUint8, setInt16, setUint16, setInt32, setUint32, setInt64, setUint64, setFloat32, setFloat64,
  toString, toBuffer, toArrayBuffer, getRawPointer,
  exportString, exportBuffer, exportArrayBuffer, exportArrayBufferView, getCurrentEventLoop
};
