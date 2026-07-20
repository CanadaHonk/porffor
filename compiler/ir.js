// porffor IR: one flat structured tree, high- and low-level ops as siblings.
// pipeline: AST -> IR tree -> C text (render.js), no lowering passes between.
// nodes are uniform arrays for speed: [kind, type, fx, a, b, c]
// kind: K.* enum. type: T.* value type (T.none for stmts). fx: FX.* effects
// bitmask, OR-merged from operands. a/b/c: per-kind operands (documented at
// each constructor). constructors fold at build time - there is NO post-hoc pass.

import { TYPES } from './types.js';

// value types
export const T = {
  none: 0,
  f64: 1,
  i32: 2,
  u32: 3,
  i64: 4,
  u64: 5,
  jsval: 6, // NaN-boxed u64
  ptr: 7 // u32 arena offset, distinct so GC/render reasoning knows it's a ref
};

// effects bitmask
export const FX = {
  none: 0,
  readMem: 1,
  writeMem: 2,
  call: 4, // may call (anything could happen: alloc, throw, suspend)
  readGlobal: 8,
  writeLocal: 16 // assigns (so exprs can't be reordered past it)
};
const fxOf = n => typeof n === 'object' && n !== null ? n[2] : 0;

// node slot indices
export const N_KIND = 0, N_TYPE = 1, N_FX = 2, N_A = 3, N_B = 4, N_C = 5;

// op kinds: keep grouped + stable, renderer dispatch arrays index by these
let k = 0;
export const K = {
  // constants
  Const: k++,    // a: literal (number/bigint as string when i64), b: -
  JvConst: k++,  // a: typeId, b: payload (u32) - folded to a u64 at render
  DataRef: k++,  // a: data segment id

  // variables
  Local: k++,    // a: name (string)
  Global: k++,   // a: name
  DeclLocal: k++,// a: name, b: init expr|null   (type = local's type)
  Assign: k++,   // a: Local/Global node, b: value expr

  // arithmetic / compare / bits - op strings are C operators
  Bin: k++,      // a: op string, b: left, c: right  (type = operand type; cmp result i32)
  Un: k++,       // a: op string ('neg','!','~','abs','floor','ceil','trunc','nearest','sqrt','clz','ctz','popcnt'), b: value
  Select: k++,   // a: cond, b: then, c: else

  // conversions
  Convert: k++,  // type = to; a: from type, b: value, c: signed|rangeKnown flags
  Reinterpret: k++, // type = to (f64|u64|i32); a: value, b: mode|null
  Canon: k++,    // a: f64 value - NaN canonicalization

  // jsval
  Box: k++,      // a: value expr, b: type expr (Const i32 typeId when static)
  JvType: k++,   // a: jsval
  JvNum: k++,    // a: jsval
  JvPtr: k++,    // a: jsval
  JvBits: k++,   // a: jsval -> u64
  JvFromBits: k++, // a: u64 -> jsval
  JvIsNum: k++,  // a: jsval -> i32
  Eq: k++,       // a: strict bool, b, c: jsvals -> i32 (JS == / ===)
  Add: k++,      // a, b: jsvals -> jsval (JS +: string concat or numeric)
  Cmp: k++,      // a, b: jsvals -> i32 (relational: -1/0/1, 2=unordered)
  JvTruthy: k++, // a: jsval -> i32

  // memory (ptr = u32 arena offset; renders *(T*)(MEM + p + off))
  Load: k++,     // type = result; a: ctype string, b: ptr expr, c: [constOff, unaligned]
  Store: k++,    // a: ctype string, b: ptr expr, c: [constOff, unaligned, value]
  MemCopy: k++,  // a: dst, b: src, c: [bytes expr, mayOverlap]
  MemFill: k++,  // a: dst, b: byte expr, c: bytes expr

  // control flow (stmts)
  If: k++,       // a: cond, b: stmts[], c: stmts[]|null
  Loop: k++,     // a: cond expr|null, b: update expr|null, c: [stmts, label|null]
  Break: k++,    // a: label|null
  Continue: k++, // a: label|null
  Block: k++,    // a: stmts[], b: label|null
  Switch: k++,   // a: subject (i32), b: cases [[values[], stmts[]]...], c: default stmts[]|null
  TypeSwitch: k++, // a: subject (jsval expr | i32 type expr), b: cases [[typeIds[], stmts[]]...], c: default stmts[]|null
  Return: k++,   // a: value expr|null
  Unreachable: k++, // a: msg string|null

  // calls
  Call: k++,     // type = return type; a: func ref (index|name), b: args[]
  CallDynamic: k++, // a: fn jsval, b: this jsval, c: [args[], kind 'call'|'new']

  // exceptions
  Try: k++,      // a: stmts[], b: catch param name, c: catch stmts[]
  Throw: k++,    // a: jsval
  ThrowNew: k++, // a: error type id, b: msg id (static data)

  // coroutines
  Await: k++,    // a: jsval -> jsval
  Yield: k++,    // a: jsval -> jsval

  // alloc / gc
  Alloc: k++,    // a: bytes expr, b: typeId, c: [siteId, raw]
  GcBarrier: k++,// a: ptr expr, b: type expr

  // JS structure
  ArrGet: k++,   // a: arr ptr, b: index (u32) -> jsval
  ArrSet: k++,   // a: arr ptr, b: index, c: jsval
  ArrLenSet: k++,// a: arr ptr, b: i32
  LenGet: k++,   // a: ptr -> i32
  LenSet: k++,   // a: ptr, b: i32

  // escape hatches
  RawC: k++,     // a: code string, b: semi bool
  Reserved: k++,
  JvFalsy: k++,  // a: jsval -> i32
  JvNullish: k++ // a: jsval -> i32
};

export const KNames = [];
for (const name in K) KNames[K[name]] = name;

// interned singletons (do not mutate nodes, ever)
const constCache = new Map(); // `${type}|${lit}` -> node

export const Const = (type, lit) => {
  const key = type * 1000000007 + (typeof lit === 'number' && Number.isInteger(lit) && Math.abs(lit) < 1000000 && !Object.is(lit, -0) ? lit : NaN);
  if (key === key) { // small int fast path
    let node = constCache.get(key);
    if (node === undefined) {
      node = [K.Const, type, FX.none, lit, 0, 0];
      constCache.set(key, node);
    }
    return node;
  }
  return [K.Const, type, FX.none, lit, 0, 0];
};

export const JvConst = (typeId, payload) => [K.JvConst, T.jsval, FX.none, typeId, payload, 0];
export const DataRef = segId => [K.DataRef, T.ptr, FX.none, segId, 0, 0];

export const Local = (name, type) => [K.Local, type, FX.none, name, 0, 0];
export const Global = (name, type) => [K.Global, type, FX.readGlobal, name, 0, 0];
export const DeclLocal = (type, name, init = null) =>
  [K.DeclLocal, T.none, FX.writeLocal | (init ? fxOf(init) : 0), name, init, type];
export const Assign = (target, value) =>
  [K.Assign, T.none, FX.writeLocal | fxOf(target) | fxOf(value) | (target[N_KIND] === K.Global ? FX.readGlobal : 0), target, value, 0];

const CMP_OPS = new Set(['==', '!=', '<', '<=', '>', '>=']);

const isConst = n => n[N_KIND] === K.Const;

// constant folding for int/float binary ops. i64 consts are bigint.
const foldBin = (op, type, a, b) => {
  if (!isConst(a) || !isConst(b)) return null;
  const x = a[N_A], y = b[N_A];
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (type === T.i64 || type === T.u64) return null; // no i64 folding

  let v;
  switch (op) {
    case '+': v = x + y; break;
    case '-': v = x - y; break;
    case '*': v = x * y; break;
    case '==': return Const(T.i32, x === y ? 1 : 0);
    case '!=': return Const(T.i32, x !== y ? 1 : 0);
    case '<': return Const(T.i32, x < y ? 1 : 0);
    case '<=': return Const(T.i32, x <= y ? 1 : 0);
    case '>': return Const(T.i32, x > y ? 1 : 0);
    case '>=': return Const(T.i32, x >= y ? 1 : 0);
    case '&': v = x & y; break;
    case '|': v = x | y; break;
    case '^': v = x ^ y; break;
    case '<<': v = type === T.u32 ? (x << (y & 31)) >>> 0 : x << (y & 31); break;
    case '>>': v = type === T.u32 ? x >>> (y & 31) : x >> (y & 31); break;
    case '/': if (y === 0) return null; v = type === T.f64 ? x / y : (type === T.u32 ? Math.floor((x >>> 0) / (y >>> 0)) : Math.trunc(x / y)); break;
    case '%': if (y === 0) return null; v = type === T.f64 ? x % y : (type === T.u32 ? (x >>> 0) % (y >>> 0) : x % y); break;
    default: return null;
  }
  if (type !== T.f64) {
    v = type === T.u32 ? v >>> 0 : v | 0;
  }
  return Const(type, v);
};

export const Bin = (op, type, a, b) => {
  const folded = foldBin(op, type, a, b);
  if (folded) return folded;
  const resType = CMP_OPS.has(op) ? T.i32 : type;
  return [K.Bin, resType, fxOf(a) | fxOf(b), op, a, b];
};

export const Un = (op, type, a) => {
  if (isConst(a) && typeof a[N_A] === 'number') {
    const x = a[N_A];
    switch (op) {
      case 'neg': return Const(type, -x);
      case '!': return Const(T.i32, x === 0 ? 1 : 0);
      case '~': return Const(type, ~x);
      case 'abs': return Const(type, Math.abs(x));
      case 'floor': return Const(type, Math.floor(x));
      case 'ceil': return Const(type, Math.ceil(x));
      case 'trunc': return Const(type, Math.trunc(x));
      case 'sqrt': return Const(type, Math.sqrt(x));
    }
  }
  return [K.Un, op === '!' ? T.i32 : type, fxOf(a), op, a, 0];
};

export const Select = (cond, a, b) => {
  if (isConst(cond) && typeof cond[N_A] === 'number') return cond[N_A] !== 0 ? a : b;
  return [K.Select, a[N_TYPE], fxOf(cond) | fxOf(a) | fxOf(b), cond, a, b];
};

// drop no-op converts, collapse same-width int chains, fold consts.
// flags: bit 0 = signed, bit 1 = range-known (plain C cast ok)
export const CONVERT_SIGNED = 1, CONVERT_RANGE_KNOWN = 2;
const intTypes = new Set([T.i32, T.u32, T.i64, T.u64, T.ptr]);

export const Convert = (to, value, flags = CONVERT_SIGNED) => {
  const from = value[N_TYPE];
  if (from === to) return value;

  // const folding
  if (isConst(value) && typeof value[N_A] === 'number') {
    const x = value[N_A];
    if (to === T.f64) return Const(T.f64, flags & CONVERT_SIGNED ? x : x >>> 0);
    if (to === T.i32) return Const(T.i32, Math.trunc(x) | 0);
    if (to === T.u32 || to === T.ptr) return Const(to, Math.trunc(x) >>> 0);
  }

  // int<->int same width: retype without a node
  if (intTypes.has(from) && intTypes.has(to)) {
    if (value[N_KIND] === K.Convert) {
      // collapse Convert(int, Convert(int, x)) where inner from is also int
      const inner = value[N_B];
      if (intTypes.has(inner[N_TYPE])) return Convert(to, inner, flags);
    }
  }

  // f64 -> int -> f64 collapse (when the int conversion was range-known)
  if (to === T.f64 && value[N_KIND] === K.Convert && value[N_B][N_TYPE] === T.f64 && (value[N_C] & CONVERT_RANGE_KNOWN)) {
    return value[N_B];
  }

  return [K.Convert, to, fxOf(value), from, value, flags];
};

export const Reinterpret = (to, value, mode = 0) => [K.Reinterpret, to, fxOf(value), value, mode, 0];
export const Canon = value => [K.Canon, T.f64, fxOf(value), value, 0, 0];

// jsval ops
export const Box = (value, typeExpr) => {
  // const payload of const type folds: f64 number -> raw number jsval, int payload -> JvConst,
  // non-number f64 payload (bigint: may exceed JvConst's u32) stays a runtime Box
  if (value[N_KIND] === K.Const && typeExpr[N_KIND] === K.Const) {
    if (value[N_TYPE] === T.f64) {
      if (typeExpr[N_A] === TYPES.number) return Const(T.jsval, value[N_A]);
    } else return JvConst(typeExpr[N_A], value[N_A]);
  }
  return [K.Box, T.jsval, fxOf(value) | fxOf(typeExpr), value, typeExpr, 0];
};
export const JvType = jv => {
  if (jv[N_KIND] === K.JvConst) return Const(T.i32, jv[N_A]);
  if (jv[N_KIND] === K.Const && jv[N_TYPE] === T.jsval) return Const(T.i32, TYPES.number);
  if (jv[N_KIND] === K.Box && jv[N_B][N_KIND] === K.Const) return jv[N_B];
  return [K.JvType, T.i32, fxOf(jv), jv, 0, 0];
};
export const JvNum = jv => {
  if (jv[N_KIND] === K.Const && jv[N_TYPE] === T.jsval) return Const(T.f64, jv[N_A]);
  if (jv[N_KIND] === K.Box && jv[N_A][N_TYPE] === T.f64) return jv[N_A];
  return [K.JvNum, T.f64, fxOf(jv), jv, 0, 0];
};
export const JvPtr = jv => {
  if (jv[N_KIND] === K.Box && jv[N_A][N_TYPE] === T.ptr) return jv[N_A];
  if (jv[N_KIND] === K.JvConst) return Const(T.ptr, jv[N_B]);
  return [K.JvPtr, T.ptr, fxOf(jv), jv, 0, 0];
};
export const JvBits = jv => [K.JvBits, T.u64, fxOf(jv), jv, 0, 0];
export const JvFromBits = bits => [K.JvFromBits, T.jsval, fxOf(bits), bits, 0, 0];
export const JvIsNum = jv => {
  if (jv[N_KIND] === K.Const && jv[N_TYPE] === T.jsval) return Const(T.i32, 1);
  if (jv[N_KIND] === K.JvConst) return Const(T.i32, 0);
  return [K.JvIsNum, T.i32, fxOf(jv), jv, 0, 0];
};
// JS equality: strict (===) is pure; loose (==) may run ToPrimitive (valueOf/toString)
export const Eq = (strict, a, b) => [K.Eq, T.i32, fxOf(a) | fxOf(b) | (strict ? 0 : FX.call), strict, a, b];
// JS coercing binary operators (may run valueOf/toString)
export const Add = (a, b) => [K.Add, T.jsval, fxOf(a) | fxOf(b) | FX.call, a, b, 0];
export const Cmp = (a, b) => [K.Cmp, T.i32, fxOf(a) | fxOf(b) | FX.call, a, b, 0];
const foldedJvTruthy = jv => {
  if (jv[N_KIND] === K.Box && jv[N_B][N_KIND] === K.Const && jv[N_B][N_A] === TYPES.boolean) return jv[N_A];
  if (jv[N_KIND] === K.JvConst && jv[N_A] === TYPES.boolean) return Const(T.i32, jv[N_B] !== 0 ? 1 : 0);
  if (jv[N_KIND] === K.JvConst && jv[N_A] === TYPES.undefined) return Const(T.i32, 0);
  if (jv[N_KIND] === K.JvConst && jv[N_A] === TYPES.object) return Const(T.i32, jv[N_B] !== 0 ? 1 : 0);
  return null;
};
export const JvTruthy = jv =>
  foldedJvTruthy(jv) ?? [K.JvTruthy, T.i32, fxOf(jv), jv, 0, 0];
export const JvFalsy = jv => {
  const truthy = foldedJvTruthy(jv);
  if (truthy) return Un('!', T.i32, truthy);
  return [K.JvFalsy, T.i32, fxOf(jv), jv, 0, 0];
};
export const JvNullish = jv => {
  if (jv[N_KIND] === K.JvConst) return Const(T.i32, jv[N_A] === TYPES.undefined || (jv[N_A] === TYPES.object && jv[N_B] === 0) ? 1 : 0);
  if (jv[N_KIND] === K.Box && jv[N_B][N_KIND] === K.Const && jv[N_B][N_A] !== TYPES.object) return Const(T.i32, jv[N_B][N_A] === TYPES.undefined ? 1 : 0);
  return [K.JvNullish, T.i32, fxOf(jv), jv, 0, 0];
};

// memory
const ctypeResult = ctype =>
  ctype === 'f64' ? T.f64 :
  ctype === 'f32' ? T.f64 : // f32 widened on load
  ctype === 'u64' || ctype === 'i64' ? T.i64 :
  ctype === 'jsval' ? T.jsval :
  T.i32;

export const Load = (ctype, ptr, off = 0, unaligned = false) =>
  [K.Load, ctypeResult(ctype), fxOf(ptr) | FX.readMem, ctype, ptr, [off, unaligned]];
export const Store = (ctype, ptr, off, value, unaligned = false) =>
  [K.Store, T.none, fxOf(ptr) | fxOf(value) | FX.writeMem, ctype, ptr, [off, unaligned, value]];
export const MemCopy = (dst, src, bytes, mayOverlap = true) =>
  [K.MemCopy, T.none, fxOf(dst) | fxOf(src) | fxOf(bytes) | FX.readMem | FX.writeMem, dst, src, [bytes, mayOverlap]];
export const MemFill = (dst, byte, bytes) =>
  [K.MemFill, T.none, fxOf(dst) | fxOf(byte) | fxOf(bytes) | FX.writeMem, dst, byte, bytes];

// control flow
export const If = (cond, then, els = null) => {
  if (isConst(cond) && typeof cond[N_A] === 'number') {
    const taken = cond[N_A] !== 0 ? then : els;
    return taken == null || taken.length === 0 ? null : BlockStmt(taken);
  }
  return [K.If, T.none, fxOf(cond), cond, then, els];
};
export const Loop = (cond, update, stmts, label = null) => [K.Loop, T.none, FX.none, cond, update, [stmts, label]];
export const Break = (label = null) => [K.Break, T.none, FX.none, label, 0, 0];
export const Continue = (label = null) => [K.Continue, T.none, FX.none, label, 0, 0];
export const BlockStmt = (stmts, label = null) => [K.Block, T.none, FX.none, stmts, label, 0];
export const Switch = (subject, cases, def = null) => [K.Switch, T.none, fxOf(subject), subject, cases, def];
export const TypeSwitch = (subject, cases, def = null) => [K.TypeSwitch, T.none, fxOf(subject), subject, cases, def];
export const Return = (value = null) => [K.Return, T.none, value ? fxOf(value) : 0, value, 0, 0];
export const Unreachable = (msg = null) => [K.Unreachable, T.none, FX.none, msg, 0, 0];

// calls
export const Call = (func, args, retType = T.jsval) => {
  let fx = FX.call;
  for (let i = 0; i < args.length; i++) fx |= fxOf(args[i]);
  return [K.Call, retType, fx, func, args, 0];
};
// newTarget: expr|null (plain call). spreadArr: array jv expr|null (argv from its entries instead of args)
export const CallDynamic = (fn, thisArg, args, newTarget = null, spreadArr = null) => {
  let fx = FX.call | fxOf(fn) | fxOf(thisArg) | fxOf(newTarget) | fxOf(spreadArr);
  for (let i = 0; i < args.length; i++) fx |= fxOf(args[i]);
  return [K.CallDynamic, T.jsval, fx, fn, thisArg, [args, newTarget, spreadArr]];
};

// exceptions
export const Try = (stmts, catchParam, catchStmts) => [K.Try, T.none, FX.call, stmts, catchParam, catchStmts];
export const Throw = jv => [K.Throw, T.none, FX.call | fxOf(jv), jv, 0, 0];
export const ThrowNew = (errTypeId, msgId) => [K.ThrowNew, T.none, FX.call, errTypeId, msgId, 0];

// coroutines
export const Await = jv => [K.Await, T.jsval, FX.call | fxOf(jv), jv, 0, 0];
export const Yield = jv => [K.Yield, T.jsval, FX.call | fxOf(jv), jv, 0, 0];

// alloc / gc
export const Alloc = (bytes, typeId) =>
  [K.Alloc, T.ptr, FX.call | fxOf(bytes), bytes, typeId, 0];
export const GcBarrier = (ptr, typeExpr) =>
  [K.GcBarrier, T.none, fxOf(ptr) | fxOf(typeExpr) | FX.writeMem, ptr, typeExpr, 0];

// JS structure
export const ArrGet = (arr, idx) => [K.ArrGet, T.jsval, fxOf(arr) | fxOf(idx) | FX.readMem, arr, idx, 0];
export const ArrSet = (arr, idx, value) => [K.ArrSet, T.none, fxOf(arr) | fxOf(idx) | fxOf(value) | FX.writeMem, arr, idx, value];
export const ArrLenSet = (arr, len) => [K.ArrLenSet, T.none, fxOf(arr) | fxOf(len) | FX.writeMem, arr, len, 0];
export const LenGet = ptr => [K.LenGet, T.i32, fxOf(ptr) | FX.readMem, ptr, 0, 0];
export const LenSet = (ptr, len) => [K.LenSet, T.none, fxOf(ptr) | fxOf(len) | FX.writeMem, ptr, len, 0];

// escape hatches
export const RawC = (code, semi = true) => [K.RawC, T.none, FX.call, code, semi, 0];

export const FN_ASYNC = 1, FN_GENERATOR = 2, FN_ASYNC_GENERATOR = 4;
