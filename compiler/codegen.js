import {
  K, T, FX, N_KIND, N_TYPE, N_FX, N_A, N_B, N_C,
  Const, JvConst, DataRef, Local, Global, Assign,
  Bin, Un, Select, Convert, CONVERT_SIGNED, CONVERT_RANGE_KNOWN,
  Reinterpret, Box, JvType, JvNum, JvPtr, JvBits, JvIsNum, Eq, Add, Cmp, JvTruthy, JvFalsy, JvNullish,
  Load, Store, MemCopy, MemFill,
  If, Loop, Break, Continue, BlockStmt, TypeSwitch, Return, Unreachable,
  Call, CallDynamic, Try, Throw, ThrowNew, Await, Yield,
  Alloc, GcBarrier, ArrGet, ArrSet, ArrLenSet, LenGet, LenSet, RawC, FuncIdx, FuncRec
} from './ir.js';
import { BuiltinFuncs, BuiltinVars, fullPrototypes } from './builtins.js';
import { TYPES, TYPE_FLAGS, TYPE_NAMES, TYPED_ARRAY_TYPES, ITERATOR_TYPES } from './types.js';
import semantic, { knownValue, unknownValue } from './semantic.js';
import parse from './parse.js';
import temporalPolyfillSource from './intl/temporal.js';
import intlPolyfillSource from './intl/intl.js';
import tzSource from './intl/tz.js';
import desugarUsing from './using.js';
import './prefs.js';

// jsval constants
const valNum = x => Const(T.jsval, x);
const valUndefined = () => JvConst(TYPES.undefined, 0);
const valNull = () => JvConst(TYPES.object, 0);
const valBool = b => JvConst(TYPES.boolean, b ? 1 : 0);
const valOf = (payloadExpr, typeExpr) => Box(payloadExpr, typeof typeExpr === 'number' ? Const(T.i32, typeExpr) : typeExpr);
const valNumber = x => x[N_TYPE] === T.jsval ? x : Box(x, Const(T.i32, TYPES.number));
const numValue = x => x[N_TYPE] === T.f64 ? x
  : x[N_TYPE] === T.i32 ? Convert(T.f64, x, CONVERT_SIGNED)
  : x[N_TYPE] === T.u32 || x[N_TYPE] === T.ptr ? Convert(T.f64, x)
  : JvNum(x);
const isRawNum = x => x[N_TYPE] === T.f64 || x[N_TYPE] === T.i32 || x[N_TYPE] === T.u32 || x[N_TYPE] === T.ptr;
const intLiteralValue = x => {
  if (x[N_KIND] === K.Const && (x[N_TYPE] === T.jsval || x[N_TYPE] === T.f64) && Number.isInteger(x[N_A])) return x[N_A];
  if (x[N_KIND] === K.Box && x[N_B]?.[N_KIND] === K.Const && x[N_B][N_A] === TYPES.number) return intLiteralValue(x[N_A]);
};
const isIntLiteral = x => intLiteralValue(x) !== undefined;
const isRawInt = x => x[N_TYPE] === T.i32 || x[N_TYPE] === T.u32 || x[N_TYPE] === T.i64 || x[N_TYPE] === T.u64 || x[N_TYPE] === T.ptr;
// a literal fits a raw int type if representable at that width by EITHER signedness:
// wrapping +/-/* are bit-identical for i32/u32, so e.g. 3266489917 (> INT32_MAX) must stay
// raw i32 (Math.imul / >>> semantics), only genuinely-out-of-width values fall back to f64
const intLiteralFits = (type, value) =>
  type === T.i32 || type === T.u32 || type === T.ptr ? value >= -2147483648 && value <= 4294967295
  : type === T.i64 || type === T.u64 ? value >= -9007199254740991 && value <= 9007199254740991
  : false;
const rawIntType = (left, right) => {
  if (!isRawInt(left) && !isRawInt(right)) return null;
  if (!isRawInt(left) && !isIntLiteral(left)) return null;
  if (!isRawInt(right) && !isIntLiteral(right)) return null;
  const type =
    left[N_TYPE] === T.i64 || right[N_TYPE] === T.i64 ? T.i64
    : left[N_TYPE] === T.u64 || right[N_TYPE] === T.u64 ? T.u64
    : left[N_TYPE] === T.ptr || right[N_TYPE] === T.ptr ? T.u32
    : left[N_TYPE] === T.u32 || right[N_TYPE] === T.u32 ? T.u32
    : T.i32;
  const leftLiteral = intLiteralValue(left);
  const rightLiteral = intLiteralValue(right);
  if (leftLiteral !== undefined && !intLiteralFits(type, leftLiteral)) return null;
  if (rightLiteral !== undefined && !intLiteralFits(type, rightLiteral)) return null;
  return type;
};
const rawIntValue = (type, v) => v[N_TYPE] === type ? v
  : isIntLiteral(v) ? Const(type, intLiteralValue(v))
  : Convert(type, v, type === T.i32 || type === T.i64 ? CONVERT_SIGNED : 0);
const rawAddType = (left, right) => {
  const rawInt = rawIntType(left, right);
  if (rawInt != null) return left[N_TYPE] === T.ptr ? T.ptr : rawInt;
  if (!isRawNum(left) || !isRawNum(right)) return null;
  if (left[N_TYPE] === T.f64 || right[N_TYPE] === T.f64) return T.f64;
  if (left[N_TYPE] === T.ptr || left[N_TYPE] === T.u32) return left[N_TYPE];
  if (right[N_TYPE] === T.ptr || right[N_TYPE] === T.u32) return right[N_TYPE];
  return T.i32;
};
const coerceValue = (v, type) => type === T.jsval ? (v[N_TYPE] === T.jsval ? v : valNumber(v))
  : v[N_TYPE] === type ? v
  : type === T.ptr ? (isRawInt(v) ? Convert(T.ptr, v, 0) : JvPtr(v))
  : type === T.f64 ? numValue(v)
  : (type === T.i32 || type === T.u32) && isRawInt(v) ? Convert(type, v, type === T.i32 ? CONVERT_SIGNED : 0)
  : Convert(type, numValue(v), type === T.i32 ? CONVERT_SIGNED : 0);
const coerceReturnValue = (scope, v) => {
  if (scope.retType !== T.jsval) return coerceValue(v, scope.retType);
  if (v[N_TYPE] === T.jsval) {
    if (scope.returnType > 5) return Box(JvPtr(v), Const(T.i32, scope.returnType));
    return v;
  }
  if (scope.returnType != null && scope.returnType !== TYPES.number) return Box(v, Const(T.i32, scope.returnType));
  return valNumber(v);
};

const initBuilder = scope => {
  scope.body = [];
  scope.blockStack = [ scope.body ];
  scope.locals ??= Object.create(null);
  scope.tmpPool = Object.create(null);
  scope.tmpBusy = [];
  scope.tmpCount = Object.create(null);
  scope.labelId ??= 0;
};

const curBlock = scope => scope.blockStack[scope.blockStack.length - 1];
const stmt = (scope, node) => { if (node != null) curBlock(scope).push(node); };
const CLASS_FIELD_INIT_MARKER = Symbol('class field init');

// evaluate for effects, discard value
const exprStmt = (scope, node) => {
  if (node == null) return;
  const isIRNode = Array.isArray(node) && typeof node[N_KIND] === 'number' && typeof node[N_TYPE] === 'number' && typeof node[N_FX] === 'number';
  if (!isIRNode && Array.isArray(node)) {
    for (const x of node) exprStmt(scope, x);
    return;
  }
  if (node[N_TYPE] === T.none) { stmt(scope, node); return; }
  if ((node[N_FX] & (FX.call | FX.writeMem | FX.writeLocal)) !== 0) stmt(scope, node);
};

const collect = (scope, fn) => {
  const list = [];
  const m = mark(scope);
  scope.blockStack.push(list);
  try { fn(); } finally { scope.blockStack.pop(); }
  release(scope, m);
  return list;
};

// scratch temp from the per-type pool, minted on first use
const tmp = (scope, type = T.jsval, init = null) => {
  const pool = scope.tmpPool[type] ??= [];
  let name = pool.pop();
  if (name === undefined) {
    name = `#${type}${scope.tmpCount[type] = (scope.tmpCount[type] ?? 0) + 1}`;
    scope.locals[name] = { type, temp: true };
  }
  scope.tmpBusy.push({ name, type });
  const node = Local(name, type);
  if (init != null) stmt(scope, Assign(node, init));
  return node;
};

// release() returns temps taken since mark, only release where provably dead (reuse-while-live miscompiles)
const mark = scope => scope.tmpBusy.length;
const release = (scope, m) => {
  const busy = scope.tmpBusy;
  while (busy.length > m) {
    const { name, type } = busy.pop();
    scope.tmpPool[type].push(name);
  }
};

// named local that survives the whole function, never pooled
const local = (scope, name, type = T.jsval) => {
  const l = scope.locals[name];
  if (l) return Local(name, l.type);
  scope.locals[name] = { type };
  return Local(name, type);
};

// make expr safe to reference twice: consts/locals as-is, the rest into a temp
const reuse = (scope, expr) => {
  const k = expr[N_KIND];
  if (k === K.Const || k === K.Local || k === K.JvConst || k === K.Global || k === K.DataRef) return expr;
  if (k === K.Box &&
      (expr[N_A][N_KIND] === K.Const || expr[N_A][N_KIND] === K.DataRef) &&
      expr[N_B][N_KIND] === K.Const) return expr;
  return tmp(scope, expr[N_TYPE], expr);
};

// reuse but always a named node (Local/Global): callers mint an AST Identifier from N_A
const reuseNamed = (scope, expr) => {
  const k = expr[N_KIND];
  if (k === K.Local || k === K.Global) return expr;
  return tmp(scope, expr[N_TYPE], expr);
};

const assign = (scope, target, value) => stmt(scope, Assign(target, value));

const emitIf = (scope, cond, thenFn, elseFn = null) => {
  const then = collect(scope, thenFn);
  const els = elseFn ? collect(scope, elseFn) : null;
  stmt(scope, If(cond, then, els));
};

// a BigInt dispatch: precompiled builtins only keep it for programs that use BigInts
const emitBigIntIf = (scope, cond, bigFn, otherFn) => {
  if (!globalThis.precompile) return emitIf(scope, cond, bigFn, otherFn);
  const dispatch = collect(scope, () => emitIf(scope, cond, bigFn, otherFn));
  stmt(scope, { __porfComptimeFlag: [ 'hasType', TYPES.bigint, dispatch, collect(scope, otherFn) ] });
};

const fresh = scope => `L${scope.labelId++}`;
const identNode = name => typeof name === 'string' ? { type: 'Identifier', name } : name;
const memberNode = (object, property, computed = false, extra = null) => extra
  ? { type: 'MemberExpression', object, property, computed, ...extra }
  : { type: 'MemberExpression', object, property, computed };

// references through with statements check their objects first
const withReference = (scope, decl) => {
  const key = decl.type === 'Identifier' ? null : decl.type === 'AssignmentExpression' ? 'left' :
    decl.type === 'UpdateExpression' || decl.type === 'UnaryExpression' ? 'argument' : decl.type === 'CallExpression' ? 'callee' : null;
  const ident = key ? decl[key] : decl;
  if (ident.type !== 'Identifier' || !ident._withs) return null;

  const { _withs, ...plain } = ident;
  // with objects see the source name
  const name = ident.name.split('#')[0];
  // the innermost object having the name, resolved once
  let found = identNode('undefined');
  for (let i = _withs.length - 1; i >= 0; i--) found = {
    type: 'ConditionalExpression',
    test: { type: 'CallExpression', callee: identNode('__Porffor_with_has'), arguments: [ _withs[i], { type: 'Literal', value: name } ] },
    consequent: _withs[i],
    alternate: found
  };
  const obj = identNode(reuseNamed(scope, generate(scope, found))[N_A]);
  const test = { type: 'BinaryExpression', operator: '!==', left: obj, right: identNode('undefined') };
  const pick = (a, b) => ({ type: 'ConditionalExpression', test, consequent: a, alternate: b });
  const member = memberNode(obj, identNode(name));

  // a direct eval stays a plain call so its source can still be compiled
  if (decl.type === 'CallExpression' && name !== 'eval') return generate(scope, { ...decl, callee: pick(member, plain), _thisArg: obj });
  if (decl.type === 'AssignmentExpression' && decl.operator === '=') {
    const right = identNode(reuseNamed(scope, generate(scope, decl.right))[N_A]);
    return generate(scope, pick({ ...decl, left: member, right }, { ...decl, left: plain, right }));
  }
  return generate(scope, key ? pick({ ...decl, [key]: member }, { ...decl, [key]: plain }) : pick(member, plain));
};

const genStmt = (scope, node) => {
  const m = mark(scope);
  exprStmt(scope, generate(scope, node));
  release(scope, m);
};

// bytes pushed to `data` are referenced by DataRef(id), render assigns the offsets
const i32Bytes = x => [ x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff ];

// static data lives in its user's unit so each unit's text is self-contained
const unitOf = scope => scope.internal ? 'builtins' : scope.unit ?? 'main';
const dataSeg = (unit, key, bytes) => {
  if (!modular) unit = 'main';
  if (key != null) {
    const cached = dataCache.get(unit + '\0' + key);
    if (cached !== undefined) return cached;
  }
  const id = data.push(bytes) - 1;
  dataUnits[id] = unit;
  if (key != null) dataCache.set(unit + '\0' + key, id);
  return id;
};
const dataRef = (unit, key, bytes) => DataRef(dataSeg(unit, key, bytes));

const isFuncType = type =>
  type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression' ||
  type === 'ClassDeclaration' || type === 'ClassExpression';
const hasFuncWithName = name =>
  name in funcIndex || name in builtinFuncs;

let doNotMarkFuncRef = false;

// an escaping coroutine func can be called dynamically: mark its generator/promise type
// used so prototype dispatch (.next/.then) is included, mirroring generateCall's direct path
const coroTypeUsed = func => {
  if (!func.generator && !func.async) return;
  usedTypes.add(func.async ? (func.generator ? TYPES.__porffor_asyncgenerator : TYPES.promise) : TYPES.__porffor_generator);
  if (func.async && func.generator) usedTypes.add(TYPES.promise);
};

const useFunctionValue = (func, markReferenced = true) => {
  if (markReferenced && !doNotMarkFuncRef) func.referenced = true;
  func.indirect = true;
  coroTypeUsed(func);
  if (markReferenced) func.generate?.();
};

// function value with no env: one static [fnIdx][0] record per func
const funcRef = (func, markReferenced = true) => {
  useFunctionValue(func, markReferenced);
  return valOf(FuncRec(func.index), TYPES.function);
};

const closureAwareFunc = func =>
  Prefs.closures &&
  !func.internal &&
  !func.noClosureEnv &&
  !func.topLevel &&
  !!(func.closureCaptures || func.closureCapturesThis || func.closurePassThrough);

const hasClosureOwnEnv = scope => closureLayout(scope).count > 0;

const hasClosureCaptures = func =>
  !!(func.closureCaptures || func.closureCapturesThis || func.closurePassThrough);

const directCallOnlyFunctionBinding = (scope, kind, name, node, func) =>
  (kind === 'const' || (kind === 'var' && (node._directCallMinStart ?? -1) > (node._declarator?.end ?? node.end ?? node.start ?? 0))) &&
  !func.selfAware &&
  (node._directCallRefs ?? 0) > 0 &&
  (node._valueRefs ?? 0) === 0 &&
  (node._writes ?? 0) === 0 &&
  !scope.closureOwnLocals?.[name];

const directCallOnlyRefs = node =>
  (node?._directCallRefs ?? 0) > 0 &&
  (node?._valueRefs ?? 0) === 0 &&
  (node?._writes ?? 0) === 0;

const nodeHasPerIterationCaptures = node => {
  const captures = node?._captures ?? {};
  for (const name in captures) if (captures[name].perIteration) return true;
  return false;
};

const directCallOnlyFunctionNode = node =>
  isFuncType(node?.type) &&
  !node._selfAware &&
  !node._usesArguments &&
  !nodeHasPerIterationCaptures(node) &&
  directCallOnlyRefs(node);

const closureBindingNeedsSlot = capture =>
  !directCallOnlyFunctionNode(capture?.node);

// own env layout: name -> 1-based slot
const closureLayout = scope => {
  if (scope.closureLayout) return scope.closureLayout;

  const slots = Object.create(null);
  let count = 0;
  for (const name in scope.closureOwnLocals ?? {}) {
    if (closureBindingNeedsSlot(scope.closureOwnLocals[name])) slots[name] = ++count;
  }
  if (scope.closureOwnThis) slots['#this'] = ++count;

  return scope.closureLayout = { slots, count };
};

const getPerIterationClosureCaptureNames = func => {
  if (!func) return [];
  if (func.perIterationClosureCaptureNames) return func.perIterationClosureCaptureNames;

  const out = [];
  for (const name in func.closureCaptures ?? {}) {
    if (func.closureCaptures[name]?.perIteration) out.push(name);
  }

  return func.perIterationClosureCaptureNames = out;
};

const getClosureSnapshotCaptureNames = func => {
  if (!func) return [];
  if (func.closureSnapshotCaptureNames) return func.closureSnapshotCaptureNames;

  const out = new Set(getPerIterationClosureCaptureNames(func));

  for (const name in func.closureCaptures ?? {}) {
    const capture = func.closureCaptures[name];
    const capturedFunc = capture?.node?._func;
    if (!capturedFunc) continue;

    for (const name of getPerIterationClosureCaptureNames(capturedFunc)) {
      out.add(name);
    }
  }

  return func.closureSnapshotCaptureNames = [ ...out ];
};

const closureOwnerMatches = (scope, owner) =>
  scope?.ast === owner ||
  scope?.ast?._closureSource === owner ||
  (
    owner?.type === 'Program' &&
    scope?.ast?.type === 'Program' &&
    scope.ast._variables === owner._variables
  );

const closureEnvNode = (scope, name, owner) => {
  let node = identNode(hasClosureOwnEnv(scope) ? '#closure_env_local' : '#closure_env');
  let slot;
  for (;; scope = scope.parentFunc) {
    if (closureOwnerMatches(scope, owner)) {
      if (name == null) return node;
      slot = closureLayout(scope).slots[name] ?? 0;
      break;
    }
    if (hasClosureOwnEnv(scope)) {
      node = memberNode(node, { type: 'Literal', value: 0 }, true, { _closureSlot: 0 });
    }
    // snapshots sit between a function's own env and its parent's
    const names = getClosureSnapshotCaptureNames(scope);
    slot = names.indexOf(name) + 1;
    if (slot) break;
    if (names.length) {
      node = memberNode(node, { type: 'Literal', value: 0 }, true, { _closureSlot: 0 });
    }
  }
  return memberNode(node, { type: 'Literal', value: slot }, true, {
    _closureSlot: slot,
    _skipChainDepth: true
  });
};
const closureLocalReadNode = (name, markReferenced = true) => ({
  type: 'Identifier',
  name,
  _skipClosureOwnLocals: true,
  _markFunctionReferenced: markReferenced
});

// mirror a binding into the scope's own closure env
const mirrorToClosureEnv = (scope, name, right = closureLocalReadNode(name)) =>
  genStmt(scope, { type: 'AssignmentExpression', operator: '=',
    left: closureEnvNode(scope, name, scope.ast), right });

const closureOwnLocalReadIsLocal = (scope, name) =>
  name in scope.locals &&
  !scope.closureOwnLocals?.[name]?.node?._writes;

const currentClosureEnv = scope => {
  if (hasClosureOwnEnv(scope)) {
    if (!scope.locals['#closure_env_local']) {
      throw new Error(`missing #closure_env_local in ${scope.name}`);
    }
    return Local('#closure_env_local', T.jsval);
  }
  if (scope.closureAware) return valOf(Local('#env', T.ptr), TYPES.__porffor_closureenv);
  return valUndefined();
};

// [parent u32][count u32][payload f64, type u8, padding x7]...
const makeClosureEnv = (scope, parent, count, values = null) => {
  const pointer = reuse(scope, Alloc(Const(T.i32, 8 + count * 16), TYPES.__porffor_closureenv));
  stmt(scope, Store('u32', pointer, 0, JvPtr(parent)));
  if (values) {
    for (let i = 0; i < values.length; i++) {
      stmt(scope, Store('f64', pointer, 8 + i * 16, JvNum(values[i])));
      stmt(scope, Store('u8', pointer, 16 + i * 16, JvType(values[i])));
    }
  } else {
    const index = tmp(scope, T.i32, Const(T.i32, 0));
    const slot = Bin('+', T.u32, pointer, Bin('*', T.i32, index, Const(T.i32, 16)));
    stmt(scope, Loop(Bin('<', T.i32, index, Const(T.i32, count)), null, [
      Store('f64', slot, 8, Const(T.f64, 0)),
      Store('u8', slot, 16, Const(T.i32, TYPES.undefined)),
      Assign(index, Bin('+', T.i32, index, Const(T.i32, 1)))
    ], fresh(scope)));
  }
  stmt(scope, Store('u32', pointer, 4, Const(T.i32, count)));
  stmt(scope, GcBarrier(pointer, Const(T.i32, TYPES.__porffor_closureenv)));
  typeUsed(scope, TYPES.__porffor_closureenv);
  return valOf(pointer, TYPES.__porffor_closureenv);
};

// per-iteration captures get a snapshot env chained to the parent
const closureEnvFor = (scope, func) => {
  const env = currentClosureEnv(scope);
  const snap = getClosureSnapshotCaptureNames(func);
  if (snap.length === 0) return env;

  const parent = reuse(scope, env);
  const values = [];
  for (const name of snap) {
    values.push(reuse(scope, generate(scope, { type: 'Identifier', name, _closureFunc: func.closureCaptures?.[name]?.func })));
  }
  return reuse(scope, makeClosureEnv(scope, parent, values.length, values));
};

// closure value: heap [fnIdx][env] record
const makeClosureRecord = (scope, func, markReferenced = true) => {
  useFunctionValue(func, markReferenced);

  const env = closureEnvFor(scope, func);
  const rec = reuse(scope, Alloc(Const(T.i32, 8), TYPES.function));
  stmt(scope, Store('u32', rec, 0, FuncIdx(func.index)));
  stmt(scope, Store('u32', rec, 4, JvPtr(env)));
  return valOf(rec, TYPES.function);
};

// builtins and top-level funcs only ever have one instance, so one static record
const staticFuncIdentity = func =>
  func.internal || !func.parentFunc || func.parentFunc.topLevel;

// non-capturing nested funcs still mint a fresh record per evaluation for identity
const makeFreshFuncRecord = (scope, func, markReferenced = true) => {
  useFunctionValue(func, markReferenced);
  const rec = reuse(scope, Alloc(Const(T.i32, 8), TYPES.function));
  stmt(scope, Store('u32', rec, 0, FuncIdx(func.index)));
  stmt(scope, Store('u32', rec, 4, Const(T.u32, 0)));
  return valOf(rec, TYPES.function);
};

const makeFunctionValue = (scope, func, markReferenced = true) => {
  if (hasClosureCaptures(func)) return makeClosureRecord(scope, func, markReferenced);
  if (staticFuncIdentity(func)) return funcRef(func, markReferenced);
  return makeFreshFuncRecord(scope, func, markReferenced);
};

// a function expression is a new object each evaluation, never the static record
const materializeFunctionExpr = (scope, func, markReferenced = true) => {
  if (hasClosureCaptures(func)) return makeClosureRecord(scope, func, markReferenced);
  if (func.internal) return funcRef(func, markReferenced);
  return makeFreshFuncRecord(scope, func, markReferenced);
};

const materializeFunctionValue = (scope, func, markReferenced = true) => {
  if (staticFuncIdentity(func) && !hasClosureCaptures(func)) return funcRef(func, markReferenced);
  // per-iteration captures snapshot on every read, a cache can't tell iterations apart
  if (getPerIterationClosureCaptureNames(func).length > 0) return makeFunctionValue(scope, func, markReferenced);
  return cachedFunctionValue(scope, func, markReferenced);
};

// one record per activation: shared within it, fresh next call (cache resets to undefined)
const cachedFunctionValue = (scope, func, markReferenced = true) => {
  const cache = local(scope, `#func_cache_${func.start ?? func.index}`, T.jsval);
  emitIf(scope, Bin('!=', T.i32, JvType(cache), Const(T.i32, TYPES.function)),
    () => assign(scope, cache, makeFunctionValue(scope, func, markReferenced)));
  return cache;
};

const generate = (scope, decl, name = undefined, valueUnused = false) => {
  if (valueUnused && !Prefs.optUnused) valueUnused = false;

  const withRef = withReference(scope, decl);
  if (withRef) return withRef;
  if (scope.inEval && completionResets.has(decl.type)) setCompletion(scope, valUndefined());

  switch (decl.type) {
    case 'BinaryExpression':
      return generateBinaryExp(scope, decl);

    case 'LogicalExpression':
      return generateLogicExp(scope, decl);

    case 'Identifier':
      return generateIdent(scope, decl);

    case 'FunctionDeclaration': {
      const [ func, out ] = generateFunc(scope, decl);
      if (decl._writes && !decl._skipVarUpdate) {
        // generated now so globals its body implicitly creates exist for later code
        func.generate?.();
        const name = decl.id.name, global = scope.topLevel;
        allocVar(scope, name, global);
        func.referenced = true;
        setLocalWithType(scope, name, global, materializeFunctionValue(scope, func, false), false, TYPES.function);
      }
      const capture = scope.closureOwnLocals?.[decl.id?.name];
      if (capture && closureBindingNeedsSlot(capture))
        mirrorToClosureEnv(scope, decl.id.name, closureLocalReadNode(decl.id.name, false));
      return out;
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return generateFunc(scope, decl)[1];

    case 'BlockStatement':
      return generateBlock(scope, decl);

    case 'ReturnStatement':
      return generateReturn(scope, decl);

    case 'ExpressionStatement':
      return generateExp(scope, decl);

    case 'SequenceExpression':
      return generateSequence(scope, decl);

    case 'ChainExpression':
      return generateChain(scope, decl);

    case 'CallExpression':
    case 'NewExpression':
      return generateCall(scope, decl);

    case 'ThisExpression':
      return generateThis(scope, decl);

    case 'Super':
      return generateSuper(scope, decl);

    case 'Literal':
      return generateLiteral(scope, decl);

    case 'VariableDeclaration':
      return generateVar(scope, decl);

    case 'AssignmentExpression':
      return generateAssign(scope, decl, valueUnused);

    case 'UnaryExpression':
      return generateUnary(scope, decl);

    case 'UpdateExpression':
      return generateUpdate(scope, decl, valueUnused);

    case 'IfStatement':
      return generateIf(scope, decl);

    case 'ForStatement':
      return genLoop(scope, decl, 'for');

    case 'WhileStatement':
      return genLoop(scope, decl, 'while');

    case 'DoWhileStatement':
      return genLoop(scope, decl, 'dowhile');

    case 'ForOfStatement':
      return generateForOf(scope, decl);

    case 'ForInStatement':
      return generateForIn(scope, decl);

    case 'SwitchStatement':
      return generateSwitch(scope, decl);

    case 'BreakStatement':
      return generateBreak(scope, decl);

    case 'ContinueStatement':
      return generateContinue(scope, decl);

    case 'LabeledStatement':
      return generateLabel(scope, decl);

    case 'EmptyStatement':
      return valUndefined();

    case 'MetaProperty':
      return generateMeta(scope, decl);

    case 'ConditionalExpression':
      return generateConditional(scope, decl);

    case 'ThrowStatement':
      return generateThrow(scope, decl);

    case 'TryStatement':
      return generateTry(scope, decl);

    case 'DebuggerStatement':
      return valUndefined();

    case 'ArrayExpression':
      return generateArray(scope, decl, name, globalThis.precompile);

    case 'ObjectExpression':
      return generateObject(scope, decl);

    case 'MemberExpression':
      return generateMember(scope, decl);

    case 'ClassExpression':
    case 'ClassDeclaration':
      return generateClass(scope, decl);

    case 'AwaitExpression':
      return generateAwait(scope, decl);

    case 'YieldExpression':
      return generateYield(scope, decl);

    case 'TemplateLiteral':
      return generateTemplate(scope, decl);

    case 'TaggedTemplateExpression':
      return generateTaggedTemplate(scope, decl);

    case 'ExportNamedDeclaration':
      if (!decl.declaration) {
        for (const spec of decl.specifiers ?? []) {
          const local = spec.local?.name;
          if (!local) continue;

          const func = resolveNamedFunction(scope, local);
          if (!func || func.internal) {
            return internalThrow(scope, 'Error', `porffor: unsupported export '${local}'`);
          }

          func.export = true;
          if (spec.exported?.name && spec.exported.name !== local) func.exportName = spec.exported.name;
          func.generate?.();
        }

        return valUndefined();
      }

      {
        const funcsBefore = new Set(funcs);
        generate(scope, decl.declaration);
        for (const x of funcs) {
          if (funcsBefore.has(x) || x.internal) continue;
          x.export = true;
          x.exportName ??= x.name;
          x.generate?.();
        }
      }

      return valUndefined();

    case 'TSAsExpression': {
      const value = generate(scope, decl.expression);
      const type = extractTypeAnnotation(decl);
      if (type.irType) {
        if (value[N_TYPE] === type.irType) return value;
        if (type.irType === T.f64) return numValue(value);
        if (type.irType === T.ptr) return JvPtr(value);
        return Convert(type.irType, numValue(value), type.irType === T.i32 ? CONVERT_SIGNED : 0);
      }
      if (type.type === TYPES.bigint) return Box(numValue(value), Const(T.i32, TYPES.bigint));
      if (type.type != null && value[N_TYPE] !== T.jsval)
        return Box(type.type === TYPES.number ? numValue(value) : value, Const(T.i32, type.type));
      if (type.type === TYPES.numberobject) return Box(numValue(value), Const(T.i32, type.type));
      if (type.type > 5) return Box(JvPtr(value), Const(T.i32, type.type));
      return value;
    }

    case 'WithStatement':
      genStmt(scope, { type: 'AssignmentExpression', operator: '=', left: decl._withWrite, right: { type: 'CallExpression', callee: identNode('__ecma262_ToObject'), arguments: [ decl.object ] } });
      return generate(scope, decl.body);

    case 'TSEnumDeclaration':
      return generateEnum(scope, decl);

    default:
      // ignore typescript nodes
      if (decl.type.startsWith('TS') ||
          decl.type === 'ImportDeclaration' && decl.importKind === 'type') {
        return valUndefined();
      }

      return internalThrow(scope, 'Error', `porffor: no generation for ${decl.type}`);
  }
};

const generateEnum = (scope, decl) => {
  // todo: opt const enum into compile-time values
  const properties = [];

  let value = -1;
  for (const x of decl.members) {
    if (x.initializer) {
      value = x.initializer;
    } else {
      if (typeof value === 'number') {
        value = {
          type: 'Literal',
          value: value + 1
        };
      } else {
        value = {
          type: 'Identifier',
          value: undefined
        };
      }
    }

    // enum.key = value
    properties.push({
      key: x.id,
      value,
      kind: 'init'
    });

    // enum[value] = key
    properties.push({
      key: value,
      value: {
        type: 'Literal',
        value: x.id.name
      },
      computed: true,
      kind: 'init'
    });

    value = value?.value;
  }

  generateVarDstr(scope, decl.const ? 'const' : 'let', decl.id, {
    type: 'ObjectExpression',
    properties
  }, undefined, false);
  return valUndefined();
};

const lookupName = (scope, name) => {
  if (name === undefined) return [ undefined, undefined ];
  if (name in scope.locals) return [ scope.locals[name], false ];
  if (name in globals) return [ globals[name], true ];

  return [ undefined, undefined ];
};

// a builtin global shadowed by a user binding (e.g. sta.js `function Test262Error() {}`)
// no longer refers to the builtin: name-based special-casing must not apply
const builtinShadowed = (scope, name) => {
  if (lookupName(scope, name)[0] != null) return true;
  const named = resolveNamedFunction(scope, name);
  return named != null && !named.internal;
};

// lightweight throw: a bare error-typed jsval carrying the message bytestring offset (ThrowNew)
const internalThrow = (scope, constructor, message) => {
  message = Prefs.d ? `${message} (in ${scope.name})` : message;
  const msg = message
    ? dataRef(unitOf(scope), `#msg:${message}`, [ ...i32Bytes(message.length), ...[...message].map(c => c.charCodeAt(0) & 0xff) ])
    : Const(T.u32, 0);
  const errType = TYPES[constructor.toLowerCase()] ?? TYPES.error;
  typeUsed(scope, errType);
  stmt(scope, ThrowNew(errType, msg));
  return valUndefined();
};

const lookup = (scope, name, allowImplicitArguments = true, markFunctionReferenced = true) => {
  if (globalThis.precompile && name === '_argc' && scope.usesArguments)
    return Box(Convert(T.f64, LenGet(JvPtr(Local('#allargs', T.jsval)))), Const(T.i32, TYPES.number));

  if (name in scope.locals) {
    const local = Local(name, scope.locals[name].type);
    return scope.locals[name].type === T.f64 ? valNumber(local) : local;
  }

  // undefined/NaN/Infinity are values, not bindings
  if (name === 'undefined') return valUndefined();
  if (name === 'NaN') return valNum(NaN);
  if (name === 'Infinity') return valNum(Infinity);

  // implicit `arguments`: the #allargs param (render materialises all args, no raw argv access)
  if (allowImplicitArguments && scope.usesArguments && name === 'arguments' && !scope.arrow)
    return Local('#allargs', T.jsval);

  // self-reference reads the function's own value (#callee), preserving identity
  if (scope.selfAware && name === scope.name && !scope.ast._reassigned) return Local('#callee', T.jsval);

  if (name in globals) {
    const global = Global(name, globals[name].type ?? T.jsval);
    return (globals[name].type ?? T.jsval) === T.f64 ? valNumber(global) : global;
  }

  const hoisted = !(name in funcIndex) && lookupHoistedVar(scope, name);
  if (hoisted) return hoisted;

  // Porffor.TYPES.x folds to its id
  if (name.startsWith('__Porffor_TYPES_')) return Const(T.i32, TYPES[name.slice(16)]);

  // %TypedArray% is not a global
  if (name === 'TypedArray' && !globalThis.precompile) return null;

  // builtin value globals like Number.MAX_VALUE
  if (name in builtinVars) {
    // a well-known symbol can be used as a key on anything (eg Object.getOwnPropertyDescriptor)
    if (name.startsWith('__Symbol_') && !globalThis.precompile) {
      memberDemands.add(name.slice(2));
      iteratorDemands.add(name.slice(2));
    }

    const v = builtinVars[name];
    return typeof v === 'function' ? v(scope, irBuiltinHelpers(scope, name, {})) : v;
  }

  const namedFunc = resolveNamedFunction(scope, name);
  if (namedFunc) return materializeFunctionValue(scope, namedFunc, markFunctionReferenced);
  if (name in builtinFuncs && !(name in funcIndex)) includeBuiltin(scope, name);
  const globalFunc = globalFuncByName(scope, name);
  if (globalFunc) return materializeFunctionValue(scope, globalFunc);

  // missing member of an existing namespace reads as undefined
  if (name.startsWith('__')) {
    if ((name + '$get') in builtinFuncs) {
      // X.prototype.accessor reads with the prototype as receiver
      if (name.includes('_prototype_')) return generate(scope, {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: name + '$get' },
        arguments: [],
        _thisArg: { type: 'Identifier', name: name.slice(0, name.indexOf('_prototype_') + 10) }
      });
      const owner = name.slice(2, name.indexOf('_', 2));
      if (owner in builtinFuncs) return generate(scope, {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: name + '$get' },
        arguments: [],
        _thisArg: { type: 'Identifier', name: owner }
      });
      return internalThrow(scope, 'TypeError', 'Accessor called without object');
    }
    let parent = name.slice(2).split('_').slice(0, -1).join('_');
    if (parent.includes('_')) parent = '__' + parent;
    if (lookup(scope, parent) != null) return valUndefined();
  }

  // the func referencing itself under another name, the static record keeps identity
  if (scope.name === name) return materializeFunctionValue(scope, funcByIndex(scope.index));

  return null;
};

const generateIdent = (scope, decl) => {
  // TDZ: read before its let/const initializer (static flag from binding resolver)
  if (decl._tdz) return internalThrow(scope, 'ReferenceError', `Cannot access '${unhackName(decl.name)}' before initialization`);

  if (decl.name === '#closure_env') {
    if (!scope.closureAware) throw new Error(`missing closure env in ${scope.name}`);
    return currentClosureEnv(scope);
  }

  let closureOwner = null;
  if (decl._closureFunc && !(decl.name in scope.locals)) closureOwner = decl._closureFunc;
  else if (!decl._skipClosureOwnLocals && scope.closureOwnLocals?.[decl.name] && !closureOwnLocalReadIsLocal(scope, decl.name)) closureOwner = scope.ast;
  if (closureOwner) {
    const func = decl._resolvedVariable?.node?._porfforFunc ?? resolveNamedFunction(scope, decl.name);
    if (func) useFunctionValue(func, decl._markFunctionReferenced !== false);
    return generate(scope, closureEnvNode(scope, decl.name, closureOwner));
  }

  // JSON.parse called indirectly may get a reviver
  if (decl.name === '__JSON_parse' && !globalThis.precompile) includeBuiltin(scope, '__Porffor_json_reviverUsed');
  if (decl._builtinMember && decl.name in builtinFuncs) return materializeFunctionValue(scope, builtinShadow(decl.name) ?? includeBuiltin(scope, decl.name));

  const boundFunc = decl._resolvedVariable?.node?._porfforFunc;
  if (boundFunc && !decl._selfBinding && decl._resolvedVariable.scope.type !== 'Program' && !decl._resolvedVariable.node._writes) return materializeFunctionValue(scope, boundFunc);

  if (decl.name in scope.locals) (scope.locals[decl.name].metadata ??= {}).read = true;
  const out = lookup(scope, decl.name, !(decl.name === 'arguments' && decl._resolvedBinding), decl._markFunctionReferenced !== false);
  if (out) return out;

  // unresolvable names can still be global object properties
  if (globalObjectUsed) return globalGet(scope, decl.name);
  return internalThrow(scope, 'ReferenceError', `${unhackName(decl.name)} is not defined`);
};

const generateYield = (scope, decl) => {
  let arg = decl.argument ?? DEFAULT_VALUE;

  if (!scope.generator) {
    // todo: access upper-scoped generator. evaluate for effects, value undefined
    exprStmt(scope, generate(scope, arg));
    return valUndefined();
  }

  if (decl.delegate) {
    const gen = !scope.async && knownType(scope, getNodeType(scope, arg)) === TYPES.__porffor_generator ? reuse(scope, generate(scope, arg)) : null;
    const rec = gen ? null : reuse(scope, builtinCall(scope, scope.async ? '__Porffor_iterator_getAsync' : '__Porffor_iterator_get', [ generate(scope, arg) ]));
    const received = tmp(scope, T.jsval, valUndefined());
    const mode = tmp(scope, T.i32, Const(T.i32, 0));
    const value = tmp(scope, T.jsval);
    const L = fresh(scope);
    stmt(scope, Loop(null, null, collect(scope, () => {
      let done;
      if (gen) {
        done = reuse(scope, Call('__Porffor_coroutine_resume', [ gen, received, mode ], T.i32));
        stmt(scope, Call('__Porffor_coroutine_setRaw', [ Call('__Porffor_coroutine_raw', [ gen ], T.i32) ], T.none));
        assign(scope, value, Call('__Porffor_coroutine_value', [ gen ]));
      } else {
        assign(scope, value, scope.async
          ? builtinCall(scope, '__Porffor_iterator_complete', [ rec, awaitValue(scope, builtinCall(scope, '__Porffor_iterator_call', [ rec, received, mode ])) ])
          : builtinCall(scope, '__Porffor_iterator_resume', [ rec, received, mode ]));
        done = iteratorDone(rec);

        // sync iterator values are awaited as by CreateAsyncFromSyncIterator, rejections close it unless done
        if (scope.async) emitIf(scope, Bin('!=', T.i32, Convert(T.i32, JvNum(ArrGet(JvPtr(rec), Const(T.i32, 3)))), Const(T.i32, 2)), () => {
          const tmpName = '#catch_tmp' + (scope.catchId = (scope.catchId ?? 0) + 1);
          allocVar(scope, tmpName);
          const caught = Local(tmpName, T.jsval);
          stmt(scope, Try(collect(scope, () => assign(scope, value, awaitValue(scope, value))), tmpName, collect(scope, () => {
            emitIf(scope, Bin('==', T.jsval, caught, JvConst(TYPES.__porffor_generator, 0)), () => stmt(scope, Throw(caught)));
            emitIf(scope, Un('!', T.i32, iteratorDone(rec)), () => exprStmt(scope, builtinCall(scope, '__Porffor_iterator_close', [ rec ])));
            stmt(scope, Throw(caught));
          })));
        });
      }

      emitIf(scope, done, () => {
        emitIf(scope, Bin('==', T.i32, mode, Const(T.i32, 2)), () => generateReturn(scope, { type: 'ReturnStatement', argument: identNode(value[N_A]) }));
        stmt(scope, Break(L));
      });
      assign(scope, received, Yield(value, 1));
      assign(scope, mode, Call('porf_yield_mode', [], T.i32));
    }), L));
    return value;
  }

  return Yield(generate(scope, arg));
};

// inlined so plain classes don't pull in the object machinery
const jvIsObject = (v, t) => Bin('&&', T.i32,
  Bin('&&', T.i32,
    Bin('>', T.i32, t, Const(T.i32, TYPES.symbol)),
    Bin('||', T.i32, Bin('!=', T.i32, JvPtr(v), Const(T.i32, 0)), Bin('!=', T.i32, t, Const(T.i32, TYPES.object)))),
  Bin('&&', T.i32,
    Bin('!=', T.i32, t, Const(T.i32, TYPES.string)),
    Bin('!=', T.i32, t, Const(T.i32, TYPES.bytestring))));

const generateReturn = (scope, decl) => {
  const arg = decl.argument ?? DEFAULT_VALUE;

  // inside try/catch with a finally: park the value and let the finalizer complete the return
  const fin = scope.finallyStack?.[scope.finallyStack.length - 1];
  if (fin) {
    if (scope.retType === T.none) {
      if (arg.type !== 'Identifier') exprStmt(scope, generate(scope, arg));
    } else {
      assign(scope, Local(fin.val, T.jsval), coerceValue(generate(scope, arg), T.jsval));
    }
    finallyExit(scope, fin, FIN_RETURN);
    return;
  }

  // void IR retType (distinct from porffor returnType): evaluate arg for effects only
  if (scope.retType === T.none) {
    if (arg.type !== 'Identifier') exprStmt(scope, generate(scope, arg));
    stmt(scope, Return());
    return;
  }

  // builtin constructors take their prototype from new.target
  if (scope.constr && globalThis.precompile && scope.retType === T.jsval && staticFuncIdentity(scope) && !hasClosureCaptures(scope)) {
    const ret = reuse(scope, coerceReturnValue(scope, generate(scope, arg)));
    const newTarget = Local('#newtarget', T.jsval);
    emitIf(scope, Bin('&&', T.i32, JvTruthy(newTarget), Bin('!=', T.i32, JvPtr(newTarget), JvPtr(funcRef(scope, false)))),
      () => exprStmt(scope, builtinCall(scope, '__Porffor_object_setPrototypeFromConstructor', [ ret, newTarget ])));
    stmt(scope, Return(ret));
    return;
  }

  // constructors coerce their return value
  if (scope.constr && !globalThis.precompile) {
    const constructing = () => JvTruthy(Local('#newtarget', T.jsval));
    const retThis = () => stmt(scope, Return(scope.ast._thisBinding ? derivedThis(scope, identNode(scope.ast._thisBinding.name)) : Local('#this', T.jsval)));

    // return undefined / return this give back the new instance when constructing
    if ((arg.type === 'Identifier' && arg.name === 'undefined') || arg.type === 'ThisExpression') {
      if (scope._onlyConstr) return void retThis();
      emitIf(scope, constructing(), retThis, () => stmt(scope, Return(generate(scope, arg))));
      return;
    }

    const ret = reuse(scope, generate(scope, arg));
    const returnRet = () => stmt(scope, Return(coerceReturnValue(scope, ret)));
    if (ret[N_TYPE] !== T.jsval) {
      const primitiveReturn = () => {
        if (scope.subclass) internalThrow(scope, 'TypeError', 'Subclass can only return an object or undefined');
        else retThis();
      };
      if (scope._onlyConstr) primitiveReturn();
      else emitIf(scope, constructing(), primitiveReturn);
      returnRet();
      return;
    }

    const checks = () => {
      // undefined from a subclass gives back the new instance
      if (scope.subclass)
        emitIf(scope, Bin('==', T.i32, JvType(ret), Const(T.i32, TYPES.undefined)), retThis);
      // non-object return -> the new instance (TypeError for subclasses)
      emitIf(scope, Un('!', T.i32, jvIsObject(ret, reuse(scope, JvType(ret)))), () => {
        if (scope.subclass) internalThrow(scope, 'TypeError', 'Subclass can only return an object or undefined');
        else retThis();
      });
    };
    if (scope._onlyConstr) checks();
    else emitIf(scope, constructing(), checks);
    returnRet();
    return;
  }

  stmt(scope, Return(coerceReturnValue(scope, generate(scope, arg))));
};

// a + b: both known primitive strings -> direct strcat, else the coercing concatStrings builtin
const knownStr = ty => ty === TYPES.string || ty === TYPES.bytestring;
const concatStrings = (scope, left, right, leftType, rightType) =>
  builtinCall(scope, knownStr(leftType) && knownStr(rightType) ? '__Porffor_strcat' : '__Porffor_concatStrings', [ reuse(scope, left), reuse(scope, right) ]);

// truthiness as i32. JvTruthy is the shared runtime helper, statically-known
// types collapse to the cheap path. `type` = inferred porffor type (TYPES|null)
const truthy = (scope, node, type = null) => {
  const t = node[N_TYPE];
  if (t === T.f64) {
    const d = reuse(scope, node);
    return Bin('&', T.i32, Bin('!=', T.f64, d, Const(T.f64, 0)), Bin('==', T.f64, d, d));
  }
  if (t === T.i32 || t === T.u32 || t === T.ptr) return Bin('!=', t, node, Const(t, 0));

  if (type === TYPES.number) {
    const d = reuse(scope, numValue(node));
    return Bin('&', T.i32, Bin('!=', T.f64, d, Const(T.f64, 0)), Bin('==', T.f64, d, d));
  }
  if (type === TYPES.string || type === TYPES.bytestring)
    return Bin('!=', T.i32, LenGet(JvPtr(node)), Const(T.i32, 0));
  if (type === TYPES.undefined) return Const(T.i32, 0);

  return JvTruthy(node);
};

const falsy = (scope, node, type = null) => {
  const t = node[N_TYPE];
  if (t === T.f64 || t === T.i32 || t === T.u32 || t === T.ptr || type === TYPES.number || type === TYPES.string || type === TYPES.bytestring || type === TYPES.undefined)
    return Un('!', T.i32, truthy(scope, node, type));

  return JvFalsy(node);
};

// 1 if null/undefined: both are singletons with fixed bit patterns, so a plain bit compare
const nullish = (scope, node, type = null) => {
  if (type === TYPES.undefined) return Const(T.i32, 1);
  if (type === TYPES.object) return Bin('==', T.jsval, node, valNull());
  if (type != null) return Const(T.i32, 0);
  return JvNullish(node);
};

// ToUint32 for bitwise operands: trunc, then wrap into [0, 2^32)
const toUint32 = (scope, d) => {
  const t = reuse(scope, Un('trunc', T.f64, d));
  const w = reuse(scope, Bin('-', T.f64, t, Bin('*', T.f64,
    Un('trunc', T.f64, Bin('/', T.f64, t, Const(T.f64, 4294967296))), Const(T.f64, 4294967296))));
  return Convert(T.u32, Select(Bin('<', T.f64, w, Const(T.f64, 0)),
    Bin('+', T.f64, w, Const(T.f64, 4294967296)), w));
};

// bitwise on f64s: ToUint32 both, run it as i32, mask shifts, back to f64
const bitwiseOp = (scope, op, l, r) => {
  const li = toUint32(scope, l), ri = toUint32(scope, r);
  if (op === '>>>')
    return Convert(T.f64, Bin('>>', T.u32, li, Bin('&', T.u32, ri, Const(T.u32, 31))), 0);
  const a = Convert(T.i32, li, CONVERT_RANGE_KNOWN | CONVERT_SIGNED);
  const b = Convert(T.i32, ri, CONVERT_RANGE_KNOWN | CONVERT_SIGNED);
  const shift = op === '<<' || op === '>>';
  return Convert(T.f64, Bin(op, T.i32, a, shift ? Bin('&', T.i32, b, Const(T.i32, 31)) : b), CONVERT_SIGNED);
};

// f64 op f64 for everything but +
const numericOp = (scope, op, l, r) => {
  switch (op) {
    case '-': case '*': case '/': return Bin(op, T.f64, l, r);
    case '%': return Bin('%', T.f64, reuse(scope, l), reuse(scope, r));
    case '**': return JvNum(builtinCall(scope, '__Math_pow', [ Box(l, Const(T.i32, TYPES.number)), Box(r, Const(T.i32, TYPES.number)) ]));
    default: return bitwiseOp(scope, op, l, r);
  }
};

const rawIntOp = (op, left, right) => {
  const type = rawIntType(left, right);
  if (type == null) return null;
  const l = rawIntValue(T.u32, left);
  const r = rawIntValue(T.u32, right);
  // wrapping math in u32, i32 operands get their result back signed
  const signed = v => type === T.i32 ? Convert(T.i32, v, CONVERT_RANGE_KNOWN | CONVERT_SIGNED) : v;
  if (op === '>>>') return Bin('>>', T.u32, l, Bin('&', T.u32, r, Const(T.u32, 31)));
  if (op === '>>' && type === T.i32) return Bin('>>', T.i32, signed(l), signed(Bin('&', T.u32, r, Const(T.u32, 31))));
  if (op === '<<' || op === '>>') return signed(Bin(op, T.u32, l, Bin('&', T.u32, r, Const(T.u32, 31))));
  if (op === '*' || op === '&' || op === '|' || op === '^' || op === '-') return signed(Bin(op, T.u32, l, r));
  return null;
};

// reuse, but copy variables too: a later operand may reassign them (x < (x = 1))
const snapshot = (scope, expr) => {
  const k = expr[N_KIND];
  return k === K.Local || k === K.Global ? tmp(scope, expr[N_TYPE], expr) : reuse(scope, expr);
};

const bigintOps = { '+': 0, '-': 1, '*': 2, '/': 3, '%': 4, '**': 5, '&': 6, '|': 7, '^': 8, '<<': 9, '>>': 10, '>>>': 11 };

// any binary op on two values, types are inferred TYPES or null, gives a jsval
const performOp = (scope, op, left, right, leftType, rightType, noBigint = false) => {
  const knownLeft = leftType, knownRight = rightType;
  const strict = op === '===' || op === '!==';
  const neg = op === '!=' || op === '!==';
  const eqEq = op === '==' || op === '===' || op === '!=' || op === '!==';
  const relOp = op === '<' || op === '<=' || op === '>' || op === '>=';
  const bothNum = knownLeft === TYPES.number && knownRight === TYPES.number;
  const isStr = ty => ty === TYPES.string || ty === TYPES.bytestring || ty === TYPES.stringobject;
  const boolBox = e => Box(e, Const(T.i32, TYPES.boolean));
  // unknown runtime type: full coercion path (StringToNumber/ToPrimitive)
  const numOperand = (node, ty) => {
    if (isRawNum(node) || ty === TYPES.number || ty === TYPES.bigint) return numValue(node);
    const v = reuse(scope, node);
    return Select(JvIsNum(v), JvNum(v), numValue(builtinCall(scope, '__ecma262_ToNumeric', [ v ])));
  };

  if (eqEq) {
    let r;
    const rawInt = rawIntType(left, right);
    if (rawInt != null) r = Bin(neg ? '!=' : '==', rawInt, rawIntValue(rawInt, left), rawIntValue(rawInt, right));
    else if ((knownLeft === TYPES.number || isRawNum(left)) && (knownRight === TYPES.number || isRawNum(right))) r = Bin(neg ? '!=' : '==', T.f64, numValue(left), numValue(right));
    else if (globalThis.precompile && !strict) {
      // builtins keep raw == (x == 0 pointer checks), see porf_loose_eq_raw
      r = Eq(2, left, right);
      if (neg) r = Un('!', T.i32, r);
    } else if (strict || (knownLeft != null && knownLeft === knownRight) || (isStr(knownLeft) && isStr(knownRight) && knownLeft !== TYPES.stringobject && knownRight !== TYPES.stringobject) ||
      knownLeft === TYPES.undefined || knownRight === TYPES.undefined) {
      r = Eq(strict, left, right);
      if (neg) r = Un('!', T.i32, r);
    } else {
      // porf_loose_eq gives 2 when coercion is needed (objects vs primitives, strings/BigInts vs numbers)
      const l = reuse(scope, left), rr = reuse(scope, right);
      r = tmp(scope, T.i32, Eq(false, l, rr));
      emitIf(scope, Bin('==', T.i32, r, Const(T.i32, 2)),
        () => assign(scope, r, builtinCall(scope, '__Porffor_looseEq', [ l, rr ], T.i32)));
      if (neg) r = Un('!', T.i32, r);
    }
    return boolBox(r);
  }

  // relational: porf_cmp gives -1/0/1, 2 = unordered/NaN so every compare is false
  if (relOp) {
    const rawInt = rawIntType(left, right);
    if (rawInt != null) return boolBox(Bin(op, rawInt, rawIntValue(rawInt, left), rawIntValue(rawInt, right)));
    if ((knownLeft === TYPES.number || isRawNum(left)) && (knownRight === TYPES.number || isRawNum(right))) return boolBox(Bin(op, T.f64, numValue(left), numValue(right)));
    const numish = ty => ty === TYPES.number || ty === TYPES.boolean || ty === TYPES.undefined;
    const strish = ty => ty === TYPES.string || ty === TYPES.bytestring;
    const direct = (numish(knownLeft) && numish(knownRight)) || (strish(knownLeft) && strish(knownRight)) ||
      (knownLeft === TYPES.bigint && knownRight === TYPES.bigint);
    let c;
    // builtins keep raw comparisons: no coercion, 3 compares false like unordered
    if (direct || globalThis.precompile) c = reuse(scope, Cmp(left, right));
    else {
      // porf_cmp gives 3 when coercion is needed (objects, string vs number, mixed BigInts)
      const l = reuse(scope, left), r = reuse(scope, right);
      c = tmp(scope, T.i32, Cmp(l, r));
      emitIf(scope, Bin('==', T.i32, c, Const(T.i32, 3)),
        () => assign(scope, c, builtinCall(scope, '__Porffor_compare', [ l, r ], T.i32)));
    }
    let r;
    if (op === '<') r = Bin('==', T.i32, c, Const(T.i32, -1));
    else if (op === '>') r = Bin('==', T.i32, c, Const(T.i32, 1));
    else if (op === '<=') r = Bin('<=', T.i32, c, Const(T.i32, 0));
    else r = Bin('|', T.i32, Bin('==', T.i32, c, Const(T.i32, 0)), Bin('==', T.i32, c, Const(T.i32, 1)));
    return boolBox(r);
  }

  const bigOp = bigintOps[op];
  if (bigOp !== undefined && !noBigint && mayHaveBigInt) {
    const binop = (l, r) => builtinCall(scope, '__Porffor_bigint_binop', [ Const(T.i32, bigOp), l, r ]);
    if (knownLeft === TYPES.bigint || knownRight === TYPES.bigint) return binop(left, right);
    const lMaybe = knownLeft == null && !isRawNum(left), rMaybe = knownRight == null && !isRawNum(right);
    if ((lMaybe || rMaybe) && !(op === '+' && (isStr(knownLeft) || isStr(knownRight)))) {
      const l = reuse(scope, left), r = reuse(scope, right);
      const isBig = x => Bin('==', T.i32, JvType(x), Const(T.i32, TYPES.bigint));
      const out = tmp(scope, T.jsval);
      emitBigIntIf(scope, lMaybe && rMaybe ? Bin('|', T.i32, isBig(l), isBig(r)) : isBig(lMaybe ? l : r),
        () => assign(scope, out, binop(l, r)),
        () => assign(scope, out, coerceValue(performOp(scope, op, l, r, knownLeft, knownRight, true), T.jsval)));
      return out;
    }
  }

  // +: concat when either side is stringish, else numeric
  if (op === '+') {
    const primitive = t => t === TYPES.number || t === TYPES.boolean || t === TYPES.undefined || t === TYPES.bigint || isStr(t);
    // objects convert with ToPrimitive first
    const operand = (x, known) => {
      const v = reuse(scope, x[N_TYPE] === T.jsval ? x : valNumber(x));
      if (globalThis.precompile || primitive(known)) return v;
      const prim = builtinCall(scope, '__ecma262_ToPrimitive', [ v, makeString(scope, 'default') ]);
      return reuse(scope, known == null ? Select(jvIsObject(v, JvType(v)), prim, v) : prim);
    };
    if (isStr(knownLeft) || isStr(knownRight)) return concatStrings(scope, operand(left, knownLeft), operand(right, knownRight), knownLeft, knownRight);
    const rawType = rawAddType(left, right);
    if (rawType != null) return Bin('+', rawType, Convert(rawType, left, rawType === T.i32 ? CONVERT_SIGNED : 0), Convert(rawType, right, rawType === T.i32 ? CONVERT_SIGNED : 0));
    if ((knownLeft === TYPES.number || isRawNum(left)) && (knownRight === TYPES.number || isRawNum(right))) return Box(Bin('+', T.f64, numValue(left), numValue(right)), Const(T.i32, TYPES.number));
    if (bothNum) return Box(Bin('+', T.f64, numValue(left), numValue(right)), Const(T.i32, TYPES.number));
    if (globalThis.precompile ? knownLeft == null || knownRight == null : !primitive(knownLeft) || !primitive(knownRight)) {
      const l = reuse(scope, left[N_TYPE] === T.jsval ? left : valNumber(left));
      const r = reuse(scope, right[N_TYPE] === T.jsval ? right : valNumber(right));
      if (globalThis.precompile) return Add(l, r);

      // off the number fast path
      return Select(Bin('&&', T.i32, JvIsNum(l), JvIsNum(r)), Box(Bin('+', T.f64, JvNum(l), JvNum(r)), Const(T.i32, TYPES.number)), builtinCall(scope, '__Porffor_add', [ l, r ]));
    }
    return Box(Bin('+', T.f64, numOperand(left, knownLeft), numOperand(right, knownRight)), Const(T.i32, TYPES.number));
  }

  // arithmetic and bitwise: mixing BigInt with non-BigInt throws
  const lb = knownLeft === TYPES.bigint, rb = knownRight === TYPES.bigint;
  if (lb !== rb && (lb || rb)) {
    if (knownLeft != null && knownRight != null)
      internalThrow(scope, 'TypeError', 'Cannot mix BigInts and non-BigInts in numeric expressions');
    else emitIf(scope, Bin('!=', T.i32, JvType(lb ? right : left), Const(T.i32, TYPES.bigint)),
      () => internalThrow(scope, 'TypeError', 'Cannot mix BigInts and non-BigInts in numeric expressions'));
  }

  const rawInt = rawIntOp(op, left, right);
  if (rawInt) return rawInt;

  return Box(numericOp(scope, op, numOperand(left, knownLeft), numOperand(right, knownRight)), Const(T.i32, TYPES.number));
};

const knownNullish = decl => {
  if (decl.type === 'Literal' && decl.value === null) return true;
  if (decl.type === 'Identifier' && decl.name === 'undefined') return true;

  return false;
};

const generateBinaryExp = (scope, decl) => {
  if (decl.operator === 'in' && decl.left.type === 'PrivateIdentifier')
    return builtinCall(scope, '__Porffor_private_has', [ generate(scope, decl.left._map), generate(scope, decl.right) ]);

  if (decl.operator === 'instanceof') {
    // hack: check type for primitive objects
    const rightName = decl.right.name;
    if (rightName) {
      let checkType = TYPES[rightName.toLowerCase()];
      if (checkType != null && rightName === TYPE_NAMES[checkType] && rightName in builtinFuncs && !rightName.endsWith('Error')) {
        if (checkType === TYPES.number) checkType = TYPES.numberobject;
        else if (checkType === TYPES.boolean) checkType = TYPES.booleanobject;
        else if (checkType === TYPES.string) checkType = TYPES.stringobject;
        return Box(Bin('==', T.i32, JvType(reuse(scope, generate(scope, decl.left))), Const(T.i32, checkType)), Const(T.i32, TYPES.boolean));
      }
    }

    // copy the left value first: the right side may reassign it
    const left = tmp(scope, T.jsval, coerceValue(generate(scope, decl.left), T.jsval));
    if (definedKeys.has('#hasInstance')) includeBuiltin(scope, '__Porffor_object_hasInstanceUsed');
    return builtinCall(scope, '__Porffor_object_instanceof', [ left, generate(scope, decl.right) ]);
  }

  if (decl.operator === 'in') {
    return generate(scope, {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__Porffor_object_in' },
      arguments: [ decl.right, decl.left ]
    });
  }

  // opt: x == null|undefined -> nullish(x)
  if (decl.operator === '==' || decl.operator === '!=') {
    const other = knownNullish(decl.right) ? decl.left : knownNullish(decl.left) ? decl.right : null;
    if (other) {
      let r = nullish(scope, generate(scope, other), getNodeType(scope, other));
      if (decl.operator === '!=') r = Un('!', T.i32, r);
      return Box(r, Const(T.i32, TYPES.boolean));
    }
  }

  // the right operand may reassign a variable read by the left (x * (x = 1)): evaluate left first
  let left = generate(scope, decl.left);
  const leftType = getNodeType(scope, decl.left);
  const r = decl.right.type;
  if (r !== 'Literal' && !(r === 'Identifier' && !ifIdentifierErrors(scope, decl.right)) && r !== 'ThisExpression') left = snapshot(scope, left);
  const right = generate(scope, decl.right);
  return performOp(scope, decl.operator, left, right, leftType, getNodeType(scope, decl.right));
};

const usesAnyType = types => {
  for (let i = 0; i < types.length; i++) {
    if (usedTypes.has(types[i])) return true;
  }

  return false;
};

const irBuiltinHelpers = (scope, name, def) => ({
  includeBuiltin: builtin => includeBuiltin(scope, builtin),
  typeUsed: x => typeUsed(scope, x),
  // a builtin shadow is also the prototype's value
  funcRefPtr: name => JvPtr(funcRef(builtinShadow(name) ?? includeBuiltin(scope, name))),
  hasBuiltin: name => name in builtinFuncs,
  makeString: str => makeString(scope, str),
  usesAnyType,
  hasFunc: name => funcIndex[name] != null,
  onFinalize,
  onLateFinalize,
  remapData: id => {
    if (!def.data || !Object.hasOwn(def.data, id)) throw new Error(`${name}: missing precompiled data segment ${id}`);
    return dataSeg('builtins', `builtin:${name}:${id}`, def.data[id]);
  },
  remapAllocSite: id => id,
  global: (name, type, init) => {
    if (!(name in globals)) {
      const idx = globals['#ind']++;
      globals[name] = { idx, type };
    }
    if (init !== undefined && !includedBuiltinGlobalInits.has(name)) {
      includedBuiltinGlobalInits.add(name);
      builtinGlobalInits.push(Assign(Global(name, type), init));
    }
    return Global(name, type);
  },
  // top-level user bindings are own props of the global object: fill `sync` (inside
  // #get_globalThis) with add-or-update writes reading current binding values, deferred
  // until all globals exist. `once` writes every binding when the object is built; `sync`, run on every
  // later access, only rewrites bindings whose value changed since the last write (a packed copy of what
  // was written is kept per binding), so a read of globalThis does not cost a hashed write per binding.
  // rerun-safe (the finalizer fixpoint runs every finalizer each pass)
  globalThisUserSync: (objJv, sync, once) => {
    const finalizer = () => {
      sync.length = 0;
      once.length = 0;
      const seen = new Set();
      const push = (key, value) => {
        seen.add(key);
        const shadowName = '#gtsync_' + key;
        if (!(shadowName in globals)) globals[shadowName] = { idx: globals['#ind']++, type: T.u64 };
        const shadow = Global(shadowName, T.u64);
        const write = () => [ builtinCall(scope, '__Porffor_object_set', [ objJv, makeString(scope, key), value ]), Assign(shadow, JvBits(value)) ];
        once.push(...write());
        sync.push(If(Bin('!=', T.u64, JvBits(value), shadow), write()));
      };

      for (const name in topLevelFunc?.namedFuncBindings ?? {}) {
        if (name[0] === '#' || seen.has(name)) continue;
        const func = topLevelFunc.namedFuncBindings[name];
        if (!func || func.internal) continue;
        push(name, funcRef(func));
      }

      for (const name in globals) {
        if (name[0] === '#' || seen.has(name) || globals[name].metadata?.kind !== 'var') continue;
        const type = globals[name].type ?? T.jsval;
        push(name, type === T.jsval ? Global(name, T.jsval) : valNumber(Global(name, type)));
      }
    };

    onFinalize(finalizer);
  }
});

const includeIRBuiltinCallDeps = (scope, node) => {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    if (node.length === 6 && node[N_KIND] === K.Call && typeof node[N_A] === 'string' && node[N_A] in builtinFuncs) {
      includeBuiltin(scope, node[N_A]);
    }

    for (const x of node) includeIRBuiltinCallDeps(scope, x);
    return;
  }

  for (const x of Object.values(node)) includeIRBuiltinCallDeps(scope, x);
};

const materializeIRBuiltin = (func, name, def) => {
  const params = (def.params ?? []).map(p => Array.isArray(p) ? { name: p[0], type: p[1] } : { name: p.name, type: p.type });
  func.params = params;
  func.retType = def.retType ?? T.jsval;
  func.returnType = def.returnType;
  func.returnTypes = def.returnTypes;
  func.constr = !!def.constr;
  func.async = func.hasAwait = !!def.async;
  func.locals = Object.create(null);
  for (const p of func.params) func.locals[p.name] = { type: p.type, metadata: { param: true } };
  if (def.localTypes) {
    for (let i = 0; i < def.localTypes.length; i++) {
      const localName = def.localNames?.[i] ?? `l${i}`;
      if (!(localName in func.locals)) func.locals[localName] = { type: def.localTypes[i] };
    }
  }
  if (def.localMetadata) {
    for (let i = 0; i < def.localMetadata.length; i += 2) {
      const localName = def.localNames?.[def.localMetadata[i]] ?? `l${def.localMetadata[i]}`;
      func.locals[localName] ??= { type: def.localTypes?.[def.localMetadata[i]] ?? T.jsval };
      func.locals[localName].metadata = { type: def.localMetadata[i + 1] };
    }
  }
  func.jsLength = def.jsLength ?? func.params.filter(p => p.name[0] !== '#').length;
  if (!globalThis.precompile && def.memberReads) for (const x of def.memberReads) memberDemands.add(x);

  const helpers = irBuiltinHelpers(func, name, def);
  const bodyFn = typeof def.body === 'function' ? def.body : null;
  func.body = globalThis.precompile ? [] : bodyFn ? bodyFn(helpers) : def.body;
  if (!globalThis.precompile && def.globalInits) {
    for (const initName in def.globalInits) {
      if (includedBuiltinGlobalInits.has(initName)) continue;
      includedBuiltinGlobalInits.add(initName);
      const initFn = def.globalInits[initName];
      const init = initFn(helpers);
      builtinGlobalInits.push(init);
      if (!initFn.precompiled) includeIRBuiltinCallDeps(func, init);
    }
  }
  if (!bodyFn?.precompiled) includeIRBuiltinCallDeps(func, func.body);
  if (func.returnTypes) {
    for (const x of func.returnTypes) typeUsed(func, x);
  } else if (func.returnType != null) {
    typeUsed(func, func.returnType);
  }
  return func;
};

const irBuiltin = (name, def) => {
  const func = {
    internal: true,
    name,
    index: currentFuncIndex++,
    params: [],
    constr: false,
    locals: Object.create(null)
  };

  funcs.push(func);
  funcsByIndex[func.index] = func;
  setFuncIndex(name, func.index);
  return materializeIRBuiltin(func, name, def);
};

const asmFunc = (name, func) => {
  const existing = builtinFuncByName(name);
  if (existing) {
    if (!existing.body && existing.generate) existing.generate();
    return existing;
  }

  if (func.body) return irBuiltin(name, func);

  throw new Error(`${name} has no IR built-in`);
};

const includeBuiltin = (scope, builtin) => {
  scope.includes ??= new Set();
  scope.includes.add(builtin);
  // regexps can exist without a literal (RegExp()), generic gets on them need the lazy prototype
  if (builtinFuncs[builtin]?.returnType === TYPES.regexp || builtin === 'RegExp') {
    typeUsed(scope, TYPES.regexp);
    if (!('#get___RegExp_prototype' in funcIndex)) includeBuiltin(scope, '#get___RegExp_prototype');
  }

  const func = asmFunc(builtin, builtinFuncs[builtin]);
  // dynamic calls of proxies go through their apply/construct traps
  if (builtin === 'Proxy') includeBuiltin(scope, '__Porffor_proxy_call').indirect = true;
  // these read @@iterator off any iterable
  if ((builtin === '__Porffor_iterator_flattenable' || builtin === '__Porffor_iterator_getSync' || builtin === '__Iterator_concat') && !globalThis.precompile) memberDemands.add('Symbol_iterator');
  return func;
};
const builtinCall = (scope, name, args, retType) => {
  const f = name in builtinFuncs ? includeBuiltin(scope, name) : null;
  if (!f) return Call(name, args, retType ?? T.jsval);

  return Call(f.index, args.map((arg, i) => coerceValue(arg, f.params[i]?.type ?? T.jsval)), retType ?? f.retType ?? T.jsval);
};

const assignmentOp = op => op.slice(0, -1) || '=';
const logicalChecks = { '||': falsy, '&&': truthy, '??': nullish };

// short-circuit && / || / ??: right is generated lazily inside the branch
const generateLogicExp = (scope, decl) => {
  const check = logicalChecks[decl.operator];
  const res = tmp(scope, T.jsval, coerceValue(generate(scope, decl.left), T.jsval));
  emitIf(scope, check(scope, res, getNodeType(scope, decl.left)),
    () => assign(scope, res, coerceValue(generate(scope, decl.right), T.jsval)));
  return res;
};

const getInferred = (scope, name, global = false) => {
  const isConst = getVarMetadata(scope, name, global)?.kind === 'const';
  if (global) {
    if (name in globalInfer && (isConst || inferLoopPrev.length === 0)) return globalInfer[name];
  } else if (scope.inferTree) {
    for (let i = scope.inferTree.length - 1; i >= 0; i--) {
      const x = scope.inferTree[i];
      if (name in x) return x[name];
    }
  }

  return null;
};

const setInferred = (scope, name, type, global = false) => {
  const isConst = getVarMetadata(scope, name, global)?.kind === 'const';
  scope.inferTree ??= [ Object.create(null) ];

  if (global) {
    // set inferred type in global if not already and not in a loop, else make it null
    globalInfer[name] = name in globalInfer || (!isConst && inferLoopPrev.length > 0) ? null : type;
  } else {
    for (const assigned of inferLoopAssigned) assigned.add(name);
    for (const assigned of inferBranchAssigned) assigned.add(name);

    const top = scope.inferTree.at(-1);
    top[name] = type;

    // invalidate inferred type above if mismatched
    for (let i = scope.inferTree.length - 2; i >= 0; i--) {
      const x = scope.inferTree[i];
      if (name in x && x[name] !== type) x[name] = null;
    }
  }
};

const getType = (scope, name) => {
  if (name in builtinVars) return builtinVars[name].type ?? TYPES.number;

  let metadata, global = false, bound = false;
  if (name in scope.locals) {
    bound = true;
    if (scope.locals[name].type === T.f64) return TYPES.number;
    metadata = scope.locals[name].metadata;
  } else if (name in globals) {
    bound = true;
    if (globals[name].type === T.f64) return TYPES.number;
    metadata = globals[name].metadata; global = true;
  }

  if (name === 'arguments' && !scope.arrow) return TYPES.array;
  if (metadata?.type != null) return metadata.type;

  const inferred = getInferred(scope, name, global);
  if (inferred != null) return inferred;

  if (!bound && hasFuncWithName(name)) return TYPES.function;
  return null;
};

// record the compile-time inference on assignment (the runtime type travels with the jsval)
const setType = (scope, name, type, noInfer = false) => {
  const known = knownType(scope, type);
  typeUsed(scope, known);

  let metadata, global = false;
  if (name in scope.locals) metadata = scope.locals[name].metadata;
  else if (name in globals) { metadata = globals[name].metadata; global = true; }

  if (metadata?.type != null) return; // annotated type is fixed
  if (!noInfer) setInferred(scope, name, known, global);
};

const getNodeType = (scope, node) => {
  if (node._type != null) return knownType(scope, node._type);

  let ret = null;
  if (node.type === 'TSAsExpression') ret = extractTypeAnnotation(node).type;
  else if (node.type === 'Literal') {
    if (node.bigint != null) ret = TYPES.bigint;
    else if (node.regex) ret = TYPES.regexp;
    else if (typeof node.value === 'string' && byteStringable(node.value)) ret = TYPES.bytestring;
    else ret = TYPES[typeof node.value] ?? null;
  }
  else if (isFuncType(node.type)) ret = node.type.endsWith('Declaration') ? TYPES.undefined : TYPES.function;
  else if (node.type === 'Identifier') {
    if (node._closureFunc && !(node.name in scope.locals))
      return getNodeType(scope, closureEnvNode(scope, node.name, node._closureFunc));
    if (!node._skipClosureOwnLocals && scope.closureOwnLocals?.[node.name] && !closureOwnLocalReadIsLocal(scope, node.name))
      return getNodeType(scope, closureEnvNode(scope, node.name, scope.ast));
    ret = getType(scope, node.name);
  }
  else if (node.type === 'ObjectExpression' || node.type === 'Super') ret = TYPES.object;
  else if (node.type === 'CallExpression' || node.type === 'NewExpression') {
    let name = node.callee.name;
    if (node.type === 'NewExpression' && (name == null || !builtinShadowed(scope, name))) {
      if (name === 'Number') ret = TYPES.numberobject;
      else if (name === 'Boolean') ret = TYPES.booleanobject;
      else if (name === 'String') ret = TYPES.stringobject;
      else { const tn = name?.toLowerCase(); if (tn != null && TYPES[tn] != null) ret = TYPES[tn]; }
    }
    if (ret == null && node.type === 'CallExpression' && node.callee._builtinThis) ret = TYPES[node.callee._builtinThis.toLowerCase()];
    if (ret == null && node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed &&
        typedArraySameTypeMethods.includes(node.callee.property.name)) {
      const t = knownType(scope, getNodeType(scope, node.callee.object));
      if (TYPED_ARRAY_TYPES.includes(t)) ret = t;
    }
    if (ret == null) {
      // x.call(...) has x's return type, except comptime builtins
      if (name == null && node.callee.type === 'MemberExpression' && node.callee.property.name === 'call' && !builtinFuncs[node.callee.object.name]?.comptime) name = node.callee.object.name;
      if (name != null) {
        const func = resolveNamedFunction(scope, name) ?? funcByName(name);
        if (node.type === 'CallExpression' && (func?.generator || func?.async)) ret = func.async
          ? (func.generator ? TYPES.__porffor_asyncgenerator : TYPES.promise)
          : TYPES.__porffor_generator;
        else if (func?.returnType != null) ret = func.returnType;
        else if (name in builtinFuncs && builtinFuncs[name].returnType != null && !builtinShadowed(scope, name)) ret = builtinFuncs[name].returnType;
      }
    }
  }
  else if (node.type === 'ExpressionStatement') ret = getNodeType(scope, node.expression);
  else if (node.type === 'AssignmentExpression') {
    const op = assignmentOp(node.operator);
    ret = op === '='
      ? getNodeType(scope, node.right)
      : getNodeType(scope, { type: logicalChecks[op] ? 'LogicalExpression' : 'BinaryExpression', left: node.left, right: node.right, operator: op });
  }
  else if (node.type === 'ArrayExpression') ret = TYPES.array;
  else if (node.type === 'BinaryExpression') {
    if (['==', '===', '!=', '!==', '>', '>=', '<', '<=', 'instanceof', 'in'].includes(node.operator)) ret = TYPES.boolean;
    else {
      const stack = [ node ];
      let anyBigint = false, anyKnown = false, anyUnknown = false, anyNumeric = false, anyStringLike = false, anyString = false, allBytes = true, allNumeric = true, allPrimitive = true;
      while (stack.length !== 0) {
        const n = stack.pop();
        if (n.type === 'BinaryExpression' && n.operator === node.operator) {
          stack.push(n.right, n.left);
          continue;
        }

        const known = getNodeType(scope, n);
        if (known === TYPES.bigint) anyBigint = true;
        if (known != null) anyKnown = true;
          else anyUnknown = true;
        // ToNumeric of these is never a BigInt, so the result is a Number (or a mixing TypeError)
        if (known === TYPES.number || known === TYPES.boolean || known === TYPES.undefined || known === TYPES.string || known === TYPES.bytestring) anyNumeric = true;
        if (known === TYPES.string || known === TYPES.bytestring || known === TYPES.stringobject) anyStringLike = true;
        if (known === TYPES.string || known === TYPES.stringobject) anyString = true;
        if (known !== TYPES.bytestring) allBytes = false;
        if (known !== TYPES.number && known !== TYPES.boolean && known !== TYPES.undefined) allNumeric = false;
        if (known !== TYPES.number && known !== TYPES.boolean && known !== TYPES.undefined && known !== TYPES.bigint) allPrimitive = false;
      }

      // + of a BigInt and a string or object may concat instead
      if (anyBigint && (node.operator !== '+' || allPrimitive)) ret = TYPES.bigint;
      else if (node.operator !== '+') ret = anyUnknown && !anyNumeric && mayHaveBigInt && bigintOps[node.operator] !== undefined ? null : TYPES.number; // unknown operands may be BigInts
      // unknown operands and objects may convert to strings
      else if (globalThis.precompile ? anyKnown && !anyStringLike : allNumeric) ret = TYPES.number;
      else if (anyString) ret = TYPES.string;
      else if (allBytes) ret = TYPES.bytestring;
      else ret = null; // string or number, only known at runtime
    }
  }
  else if (node.type === 'UnaryExpression') {
    if (node.operator === '!') ret = TYPES.boolean;
    else if (node.operator === 'void') ret = TYPES.undefined;
    else if (node.operator === 'delete') ret = TYPES.boolean;
    else if (node.operator === 'typeof') ret = TYPES.bytestring;
    else {
      const argType = getNodeType(scope, node.argument);
      ret = argType === TYPES.bigint ? TYPES.bigint : (argType == null && mayHaveBigInt && (node.operator === '-' || node.operator === '~') ? null : TYPES.number);
    }
  }
  else if (node.type === 'UpdateExpression') {
    // identifiers may hold BigInts (see generateUpdate)
    const argType = getNodeType(scope, node.argument);
    ret = argType === TYPES.bigint ? TYPES.bigint : (argType == null && mayHaveBigInt && node.argument.type === 'Identifier' ? null : TYPES.number);
  }
  else if (node.type === 'MemberExpression') {
    const name = node.property.name;
    if (name === 'length' && (hasFuncWithName(node.object.name) || Prefs.fastLength)) ret = TYPES.number;
    else {
      const objType = getNodeType(scope, node.object);
      if (objType != null) {
        if (name === 'length' && (objType & TYPE_FLAGS.length) !== 0) ret = TYPES.number;
        else if (node.computed && getNodeType(scope, node.property) === TYPES.number) {
          if (objType === TYPES.string) ret = TYPES.string;
          else if (objType === TYPES.bytestring) ret = TYPES.bytestring;
        }
      }
    }
  }
  else if (node.type === 'TemplateLiteral') ret = TYPES.bytestring;
  else if (node.type === 'TaggedTemplateExpression') {
    switch (node.tag.name) {
      case '__Porffor_bs': ret = TYPES.bytestring; break;
      case '__Porffor_s': ret = TYPES.string; break;
      default: ret = getNodeType(scope, { type: 'CallExpression', callee: node.tag, arguments: [] });
    }
  }
  else if (node.type === 'ThisExpression') {
    if (node._closureThisFunc) return getNodeType(scope, closureEnvNode(scope, '#this', node._closureThisFunc));
    if (scope.overrideThisType) ret = scope.overrideThisType;
    else if (scope.overrideThis) ret = getNodeType(scope, scope.overrideThis);
    else if (scope.ast?.type === 'Program' && scope.strict) ret = TYPES.undefined;
    else if (!scope.constr && !scope.method) ret = getType(scope, 'globalThis');
    else ret = null; // runtime `this` type
  }
  else if (node.type === 'MetaProperty')
    ret = (scope.constr || node._binding) && node.meta.name === 'new' && node.property.name === 'target' ? null : TYPES.undefined;
  else if (node.type === 'SequenceExpression') ret = getNodeType(scope, node.expressions.at(-1));
  else if (node.type === 'ChainExpression') ret = getNodeType(scope, node.expression);
  else if (node.type === 'BlockStatement') ret = getNodeType(scope, getLastNode(node.body));
  else if (node.type === 'LabeledStatement') ret = getNodeType(scope, node.body);
  else if (node.type.endsWith('Statement') || node.type.endsWith('Declaration')) ret = TYPES.undefined;

  if (!node._doNotMarkTypeUsed) typeUsed(scope, ret);
  return ret;
};

const generateLiteral = (scope, decl) => {
  if (decl.bigint != null) {
    // todo/opt: parse and inline small BigInt literals instead of constructing them at runtime
    return builtinCall(scope, '__Porffor_bigint_fromString', [ makeString(scope, decl.bigint) ]);
  }

  if (decl.value === null) return valNull();

  switch (typeof decl.value) {
    case 'number':
      return valNum(decl.value);

    case 'boolean':
      return valBool(decl.value);

    case 'string':
      return makeString(scope, decl.value);
  }

  if (decl.regex) {
    // todo/opt: aot-compile compile-time-known regexes
    // literals use the intrinsic constructor, not the mutable global RegExp binding
    return builtinCall(scope, '__Porffor_regex_compile', [
      generate(scope, { type: 'Literal', value: decl.regex.pattern }),
      generate(scope, { type: 'Literal', value: decl.regex.flags })
    ]);
  }
};

const generateExp = (scope, decl) => {
  if (decl.directive === 'use strict') {
    scope.strict = true;
    return valUndefined();
  }

  if (!scope.inEval) return generate(scope, decl.expression, undefined, true);

  setCompletion(scope, generate(scope, decl.expression));
  return valUndefined();
};

// eval code's completion value, kept in the scope.inEval local
const completion = scope => {
  allocVar(scope, scope.inEval);
  return Local(scope.inEval, T.jsval);
};
const setCompletion = (scope, value) => assign(scope, completion(scope), coerceValue(value, T.jsval));
// these complete with undefined unless their body has a value
const completionResets = new Set([ 'IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement', 'TryStatement', 'WithStatement' ]);

const generateSequence = (scope, decl) => {
  const exprs = decl.expressions;
  for (let i = 0; i < exprs.length - 1; i++) exprStmt(scope, generate(scope, exprs[i]));
  return generate(scope, exprs[exprs.length - 1]);
};

const generateChain = (scope, decl) => {
  const expression = decl.expression.type === 'CallExpression' && decl.expression.callee?.optional ?
    { ...decl.expression, optional: true } :
    decl.expression;

  const label = fresh(scope);
  const res = tmp(scope, T.jsval);
  const prevLabel = scope.chainLabel, prevRes = scope.chainRes;
  scope.chainLabel = label;
  scope.chainRes = res;

  const body = collect(scope, () => assign(scope, res, generate(scope, expression)));

  scope.chainLabel = prevLabel;
  scope.chainRes = prevRes;

  stmt(scope, BlockStmt(body, label));
  return res;
};

const getObjProp = (obj, prop) => objectHack(memberNode(
  identNode(obj), identNode(prop), false, { optional: false }
));

const setObjProp = (obj, prop, value) => objectHack({
  type: 'AssignmentExpression',
  operator: '=',
  left: memberNode(identNode(obj), identNode(prop), false, { optional: false }),
  right: value
});

const protoOwnerOf = name => name.slice(2, name.indexOf('_prototype'));
const ERROR_TYPES = Object.values(TYPES).filter(x => x >= TYPES.error && x <= TYPES.suppressederror);
const iteratorProtoTypes = [ TYPES.object, TYPES.__porffor_generator, ...ITERATOR_TYPES ];
const inheritedProtoTypes = { Iterator: iteratorProtoTypes, Porffor_AsyncIterator: [ TYPES.object, TYPES.__porffor_asyncgenerator ] };
const protoOwnerTypes = owner => {
  if (owner === 'TypedArray') return TYPED_ARRAY_TYPES;
  if (owner === 'Error') return ERROR_TYPES;
  const t = TYPES[owner.toLowerCase()] ?? TYPES['__' + owner.toLowerCase()];
  return t == null ? [] : [ t ];
};

const typedArraySameTypeMethods = [ 'copyWithin', 'fill', 'filter', 'map', 'reverse', 'slice', 'sort', 'subarray', 'toReversed', 'toSorted', 'with' ];

const aliasPrimObjsBC = bc => {
  const add = (x, y) => {
    if (bc[x] == null) return;

    // intentionally duplicate to avoid extra bc for prim objs as rarely used
    bc[y] ??= bc[x];
  };

  add(TYPES.boolean, TYPES.booleanobject);
  add(TYPES.number, TYPES.numberobject);
  add(TYPES.string, TYPES.stringobject);
};

const iteratorRecord = (scope, value, known, inPlace, getter = '__Porffor_iterator_get') => {
  if (definedKeys.has('#arrayIterator')) {
    includeBuiltin(scope, '__Porffor_array_iteratorPatched');
    inPlace = inPlace.filter(x => x !== TYPES.array);
  }
  if (inPlace.includes(known) || (known >= TYPES.uint8clampedarray && known <= TYPES.float64array)) return null;

  // linked so a throw leaving the loop or pattern closes it
  const rec = tmp(scope, T.jsval);
  const open = () => {
    assign(scope, rec, builtinCall(scope, getter, [ value ]));
    stmt(scope, Call('porf_iter_link', [ rec ], T.none));
  };
  if (known != null) {
    open();
    return rec;
  }

  assign(scope, rec, valUndefined());
  const t = reuse(scope, JvType(value));
  emitIf(scope, Un('!', T.i32, Bin('|', T.i32, typeIsOneOf(t, inPlace),
    Bin('&', T.i32,
      Bin('>=', T.i32, t, Const(T.i32, TYPES.uint8clampedarray)),
      Bin('<=', T.i32, t, Const(T.i32, TYPES.float64array))))), open);
  return rec;
};

const closeIterator = (scope, rec, isAwait = false) => emitIf(scope, Bin('!=', T.jsval, rec, valUndefined()), () => {
  stmt(scope, Call('porf_iter_unlink', [], T.none));
  exprStmt(scope, isAwait ? awaitValue(scope, builtinCall(scope, '__Porffor_iterator_closeAsync', [ rec ])) : builtinCall(scope, '__Porffor_iterator_close', [ rec ]));
});
const iteratorDone = rec => JvTruthy(ArrGet(JvPtr(rec), Const(T.i32, 2)));

const getKnownThisSlots = node => {
  const slots = new Set();
  const walk = node => {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'AssignmentExpression' &&
        node.left?.type === 'MemberExpression' &&
        node.left.object?.type === 'ThisExpression' &&
        node.left.property?.type === 'Identifier') {
      slots.add(node.left.property.name);
      return;
    }

    if (isFuncType(node.type)) {
      return;
    }

    for (const key in node) {
      if (key[0] === '_') continue;

      const value = node[key];
      if (value == null || typeof value !== 'object') continue;

      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        continue;
      }

      if (value.type) {
        walk(value);
      }
    }
  };

  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
    for (const x of node.body.body) {
      if (x.type === 'PropertyDefinition' && !x.static && x.key?.type === 'Identifier') {
        slots.add(x.key.name);
      }

      if (x.kind === 'constructor' && x.value?.body) walk(x.value.body);
    }
  } else if (isFuncType(node.type)) {
    walk(node.body);
  }

  return slots;
};

const createThisArg = (scope, decl, calleeVal = null) => {
  const name = decl.callee?.name;
  if (decl._new) {
    if (!decl._forceCreateThis && globalThis.precompile) return valNull();

    // a builtin constructor creates its own `this` -> null, unless a user binding
    // shadows it (then it's a plain constructor needing a real `this`)
    if (!decl._forceCreateThis && name in builtinFuncs && !builtinShadowed(scope, name)) return valNull();

    // a fresh object whose prototype is callee.prototype
    const knownSlots = name ? resolveNamedFunction(scope, name)?.knownThisSlots?.size : null;
    let knownSlotCount = knownSlots == null ? 4 : Math.max(knownSlots, 2);
    if (knownSlotCount > 4) {
      let capacity = 8;
      while (capacity < knownSlotCount) capacity *= 2;
      knownSlotCount = capacity;
    }

    const obj = reuse(scope, builtinCall(scope, '__Porffor_object_new', [ Const(T.i32, knownSlotCount) ]));
    const proto = calleeVal ? generateMember(scope, memberNode(decl.callee, identNode('prototype'), false), calleeVal) : generate(scope, getObjProp(decl.callee, 'prototype'));
    exprStmt(scope, builtinCall(scope, '__Porffor_object_setPrototype', [ obj, proto ]));
    return obj;
  }

  // primitive receivers of builtin prototype methods get boxed (ToObject)
  if (name && name.startsWith('__')) {
    const obj = decl.callee._builtinThis ?? name.slice(2, name.indexOf('_', 2));
    if (name.includes('_prototype_') && ['Object', 'String', 'Boolean', 'Number'].includes(obj)) {
      return generate(scope, { type: 'NewExpression', callee: { type: 'Identifier', name: obj }, arguments: [] });
    }

    const node = { type: 'Identifier', name: obj };
    if (!ifIdentifierErrors(scope, node)) return generate(scope, node);
  }

  // undefined here, the callee's generateThis lazily falls back to globalThis
  return valUndefined();
};

const isEmptyNode = x => x && (x.type === 'EmptyStatement' || (x.type === 'BlockStatement' && x.body.length === 0));
const getLastNode = body => {
  let offset = 1, node = body[body.length - offset];
  while (isEmptyNode(node)) node = body[body.length - ++offset];

  return node ?? { type: 'EmptyStatement' };
};

const makeArrayFromValues = (scope, values) => {
  const capacity = Math.max(values.length, 2);
  const pointer = reuse(scope, Alloc(Const(T.i32, 16 + capacity * 8), TYPES.array));
  stmt(scope, LenSet(pointer, Const(T.i32, 0)));
  stmt(scope, Store('u32', pointer, 4, Bin('+', T.u32, pointer, Const(T.u32, 16))));
  stmt(scope, Store('i32', pointer, 8, Const(T.i32, capacity)));
  stmt(scope, Store('i32', pointer, 12, Const(T.i32, 0)));
  for (let i = 0; i < values.length; i++) stmt(scope, ArrSet(pointer, Const(T.u32, i), values[i]));
  stmt(scope, LenSet(pointer, Const(T.i32, values.length)));
  if (values.some(v => v[N_TYPE] === T.jsval || v[N_TYPE] === T.ptr))
    stmt(scope, GcBarrier(pointer, Const(T.i32, TYPES.array)));
  typeUsed(scope, TYPES.array);
  return valOf(pointer, TYPES.array);
};

// positional args for a direct call: walk the callee's params, filling hidden params
// (#callee/#env/#newtarget/#this/#allargs/#rest) and the already-evaluated user args
const buildDirectArgs = (scope, decl, func, userArgs, newTargetVal, thisVal, envVal = null) => {
  const out = [];
  let ui = 0;
  for (const p of func.params) {
    switch (p.name) {
      case '#callee': out.push(materializeFunctionValue(scope, func, false)); break;
      case '#env': out.push(JvPtr(envVal ?? currentClosureEnv(scope))); break;
      case '#newtarget': out.push(newTargetVal ?? valUndefined()); break;
      case '#this': out.push(coerceValue(thisVal ?? createThisArg(scope, decl), p.type)); break;
      case '#allargs': out.push(makeArrayFromValues(scope, userArgs)); break;
      case '#rest': out.push(makeArrayFromValues(scope, userArgs.slice(ui))); break;
      default: {
        const arg = userArgs[ui++] ?? valUndefined();
        out.push(coerceValue(arg, p.type));
      }
    }
  }
  return out;
};

// runtime check: can this jsval hold a GC reference? (not undefined/number/boolean or their objects)
const canReferenceCheck = (scope, v) => {
  const t = reuse(scope, JvType(v));
  return Bin('&&', T.i32,
    Bin('&&', T.i32,
      Bin('!=', T.i32, t, Const(T.i32, TYPES.undefined)),
      Bin('!=', T.i32, t, Const(T.i32, TYPES.number))),
    Bin('&&', T.i32,
      Bin('!=', T.i32, t, Const(T.i32, TYPES.boolean)),
      Bin('&&', T.i32,
        Bin('!=', T.i32, t, Const(T.i32, TYPES.numberobject)),
        Bin('!=', T.i32, t, Const(T.i32, TYPES.booleanobject)))));
};

const generateIRIntrinsic = (scope, op, args) => {
  const a = i => {
    const v = knownValue(scope, args[i]);
    return v !== unknownValue && typeof v === 'number' ? Const(Number.isInteger(v) ? T.i32 : T.f64, v) : generate(scope, args[i]);
  };
  const rawPtr = v => v[N_TYPE] === T.ptr || v[N_TYPE] === T.u32 || v[N_TYPE] === T.i32 ? v : JvPtr(v);
  const rawI32 = v => v[N_TYPE] === T.i32 ? v : Convert(T.i32, numValue(v), CONVERT_SIGNED);
  const rawFor = (ctype, v) => ctype === 'jsval' ? (v[N_TYPE] === T.jsval ? v : valNumber(v))
    : ctype === 'f64' || ctype === 'f32' ? numValue(v)
    : ctype === 'u64' || ctype === 'i64' ? (v[N_TYPE] === T.i64 || v[N_TYPE] === T.u64 ? v : Convert(T.i64, numValue(v), ctype === 'i64' ? CONVERT_SIGNED : 0))
    : Convert(T.i32, numValue(v), ctype[0] === 'i' ? CONVERT_SIGNED : 0);
  let m;
  if (m = /^(load|store)(Un)?(\w+)$/.exec(op)) {
    const ct = m[3] === 'Jv' ? 'jsval' : m[3].toLowerCase();
    const unaligned = m[2] != null;
    const off = args[1] == null ? 0 : knownValue(scope, args[1]);
    if (typeof off !== 'number') throw new Error(`Porffor.IR.${op}: offset must be a compile-time constant`);
    if (m[1] === 'load') return Load(ct, rawPtr(a(0)), off, unaligned);
    const ptr = rawPtr(a(0));
    const value = rawFor(ct, a(2));
    const out = Store(ct, ptr, off, value, unaligned);
    return out;
  }
  if (op === 'bitsToF32') return Reinterpret(T.f64, rawI32(a(0)), 'bitsToF32');
  if (op === 'f32ToBits') return Reinterpret(T.i32, numValue(a(0)), 'f32ToBits');
  if (op === 'bitsToF64') return Reinterpret(T.f64, a(0));
  if (op === 'f64ToBits') return Reinterpret(T.u64, a(0));
  if (op === 'copy') return MemCopy(rawPtr(a(0)), rawPtr(a(1)), rawI32(a(2)));
  if (op === 'fill') return MemFill(rawPtr(a(0)), rawI32(a(1)), rawI32(a(2)));
  if (op === 'ptr')  return JvPtr(generate(scope, args[0]));
  if (op === 'gcBarrier') return GcBarrier(rawPtr(a(0)), rawI32(a(1)));
  if (op === 'gcBarrierValue') {
    const known = knownType(scope, getNodeType(scope, args[2]));
    if (known === TYPES.number || known === TYPES.boolean || known === TYPES.undefined) return null;
    const ptr = rawPtr(a(0));
    const type = rawI32(a(1));
    if (known != null) return GcBarrier(ptr, type);
    const value = a(2);
    const jv = value[N_TYPE] === T.jsval ? value : valNumber(value);
    return If(canReferenceCheck(scope, jv), [ GcBarrier(ptr, type) ]);
  }
  throw new Error(`unknown Porffor.IR.${op}`);
};

const generateMallocIntrinsic = (scope, args, typeId = 0) => {
  const bytes = args.length === 0 ? Const(T.i32, pageSize) : generate(scope, args[0]);
  return Alloc(bytes[N_TYPE] === T.i32 ? bytes : Convert(T.i32, bytes[N_TYPE] === T.jsval ? JvNum(bytes) : bytes, CONVERT_SIGNED), typeId);
};

const generateCall = (scope, decl) => {
  if (decl.type === 'NewExpression') decl._new = true;

  let name = decl.callee.name;

  // opt: virtualize IIFEs -> call the generated func by name
  let iifeEnv = null;
  if (decl.callee.type === 'FunctionExpression' || decl.callee.type === 'ArrowFunctionExpression') {
    const [ func ] = generateFunc(scope, decl.callee, true);
    name = func.name;
    if (getClosureSnapshotCaptureNames(func).length > 0) iifeEnv = closureEnvFor(scope, func);
  }

  if (name?.startsWith('__Porffor_IR_')) {
    if (Prefs.safe) throw new Error('Porffor.IR is not allowed in --safe');
    return generateIRIntrinsic(scope, name.slice(13), decl.arguments);
  }
  if (name === '__Porffor_malloc') return generateMallocIntrinsic(scope, decl.arguments, decl._porfMallocType ?? 0);

  // literal-key generic gets in builtins are member reads too, except constructor (would pull in every used constructor)
  if (globalThis.precompile && (name === '__Porffor_object_get' || name === '__Porffor_regex_getData')) {
    const key = decl.arguments[1];
    if (key?.type === 'Literal' && typeof key.value === 'string' && key.value !== 'constructor') (scope.memberReads ??= new Set()).add(key.value);
  }

  // Number() of nothing is 0, of undefined NaN
  if (decl.callee.name === 'Number' && !decl.callee._resolvedVariable && decl.arguments.length === 0) decl = { ...decl, arguments: [ { type: 'Literal', value: 0 } ] };

  // JSON.parse only compiles its reviver path when a reviver can be passed
  if (name === '__JSON_parse' && !globalThis.precompile && (decl.arguments.length > 1 || decl.arguments.some(x => x.type === 'SpreadElement'))) includeBuiltin(scope, '__Porffor_json_reviverUsed');

  if (name?.startsWith('__Porffor_coroutine_'))
    return Call(name, decl.arguments.map(a => generate(scope, a)),
      name === '__Porffor_coroutine_value' || name === '__Porffor_coroutine_callee' ? T.jsval : name === '__Porffor_coroutine_setRaw' ? T.none : T.i32);

  // eval('known/literal string') -> inline the parsed program
  if (!decl._funcIdx && !decl._new && (name === 'eval' || (decl.callee.type === 'SequenceExpression' && decl.callee.expressions.at(-1)?.name === 'eval'))) {
    // semantic parsed sources it knows
    if (decl._evalParsed || decl._evalSyntaxError) {
      if (decl._evalSyntaxError) return internalThrow(scope, 'SyntaxError', decl._evalSyntaxError);
      const parsed = decl._evalParsed;

      if (decl._indirectEval || decl.callee.type === 'SequenceExpression' || decl.optional) {
        // indirect eval: a separate func + scope
        const [ func ] = generateFunc({}, { type: 'ArrowFunctionExpression', body: parsed, expression: true, _noClosureEnv: true, _evalBody: true }, true);
        func.generate();
        return Call(func.index, [], func.retType);
      }

      const oldInEval = scope.inEval;
      scope.inEval = '#completion' + uniqId(scope);
      setCompletion(scope, valUndefined());
      const out = generate(scope, parsed);
      scope.inEval = oldInEval;
      return out;
    }
  }

  // new Function with compile-time-known strings compiles right here
  if (!decl._funcIdx && name === 'Function') {
    const knowns = decl.arguments.map(x => knownValue(scope, x));
    if (knowns.every(x => x !== unknownValue)) {
      const code = knowns.length ? String(knowns[knowns.length - 1]) : '';
      const fnArgs = knowns.slice(0, -1).map(x => String(x));
      let parsed;
      try {
        parsed = semantic(objectHack(parse(`(function(${fnArgs.join(',')}){${code}})`)), decl._semanticScopes);
      } catch (e) {
        if (e.name === 'SyntaxError') return internalThrow(scope, 'SyntaxError', e.message);
        throw e;
      }
      const fn = parsed.body[0].expression;
      fn.strict = false;
      fn._jsName = 'anonymous';
      return generate(scope, fn);
    }
  }

  // split __X_prototype_method into method name + target
  let protoName, target;
  if (!decl._new && name && name.startsWith('__')) {
    const spl = name.slice(2).split('_');
    protoName = spl[spl.length - 1];
    target = { ...decl.callee };
    target.name = spl.slice(0, -1).join('_');

    if (builtinFuncs['__' + target.name + '_' + protoName]) protoName = null;
    else if (lookupName(scope, target.name)[0] == null && !(target.name in builtinFuncs)) {
      if (lookupName(scope, '__' + target.name)[0] != null || builtinFuncs['__' + target.name]) target.name = '__' + target.name;
      else protoName = null;
    }
  }

  const member = decl.callee.expression ?? decl.callee;
  if (!decl._new && !name && member.type === 'MemberExpression' && member.object.type !== 'Super' && member.property.type !== 'PrivateIdentifier') {
    const prop = member.property;
    const object = member.object;
    protoName = prop?.name;
    target = object;
  }

  // super.method(): the receiver is this, not the home object's prototype, so no builtin dispatch on it
  if (protoName && target && target.type !== 'Super') {
    const targetKnownType = knownType(scope, getNodeType(scope, target));

    const builtinProtoCands = builtinPrototypeFuncs.get(protoName) ?? [];
    if (!globalThis.precompile && mayBeIterator(targetKnownType)) iteratorDemands.add(protoName);
    if (!decl._protoInternalCall && builtinProtoCands.length > 0) {
      const targetVal = generate(scope, target);
      const targetTmp = reuseNamed(scope, targetVal);
      const targetIdent = { type: 'Identifier', name: targetTmp[N_A] };

      // don't duplicate function literals in typeSwitch
      const args = decl.arguments.map(x => isFuncType(x?.type)
        ? { type: 'Identifier', name: reuseNamed(scope, generate(scope, x))[N_A] }
        : x);

      // the target is already evaluated (targetTmp), so the generic call must not evaluate it again
      const calleeMember = (decl.callee.expression ?? decl.callee).type === 'MemberExpression' ? (decl.callee.expression ?? decl.callee) : null;
      const fallbackCall = !calleeMember ? { ...decl, _protoInternalCall: true }
        : decl.callee.type === 'MemberExpression' ? { ...decl, callee: { ...calleeMember, object: targetIdent }, arguments: args, _protoInternalCall: true }
        : { ...decl, callee: { ...decl.callee, expression: { ...calleeMember, object: targetIdent } }, arguments: args, _protoInternalCall: true };

      const protoBC = {};
      let typedArrayCall;
      for (const x of builtinProtoCands) {
        // a builtin method the program overwrites is looked up dynamically
        if (objectHackAssigned.has(x)) continue;

        const owner = protoOwnerOf(x);
        const builtinCallNode = {
          type: 'CallExpression',
          optional: decl.optional,
          callee: { type: 'Identifier', name: x },
          arguments: args,
          _thisArg: targetIdent,
          _protoInternalCall: true
        };
        // regexps and wrapper objects with own state can shadow their methods
        const shadowable = calleeMember && !globalThis.precompile && definedKeys.has(protoName);
        const shadowed = () => generate(scope, {
          type: 'ConditionalExpression',
          test: { type: 'CallExpression', callee: { type: 'Identifier', name: '__Porffor_object_underlyingIfAny' }, arguments: [ targetIdent ] },
          consequent: fallbackCall,
          alternate: builtinCallNode
        });
        const call = owner === 'RegExp' && shadowable ? shadowed : () => generate(scope, builtinCallNode);

        if (owner === 'TypedArray') {
          typedArrayCall = call;
          continue;
        }

        const t = protoOwnerTypes(owner)[0];
        if (t == null) continue;
        // own props win over Object.prototype methods
        if (t === TYPES.object) {
          includeBuiltin(scope, x);
          continue;
        }
        protoBC[t] = call;
        if (shadowable && primObjAlias[t] && t !== TYPES.bytestring) protoBC[primObjAlias[t]] = shadowed;
      }

      aliasPrimObjsBC(protoBC);

      const entries = Object.keys(protoBC).map(x => [ +x, protoBC[x] ]).sort((a, b) => a[0] - b[0]);
      if (typedArrayCall) entries.push([ TYPED_ARRAY_TYPES, typedArrayCall ]);
      entries.push([ 'default', () => Prefs.neverFallbackBuiltinProto && !decl.optional
        ? internalThrow(scope, 'TypeError', `'${protoName}' proto func tried to be called on a type without an impl`)
        : generate(scope, fallbackCall) ]);

      return typeSwitch(scope, JvType(targetTmp), targetKnownType, entries);
    }
  }

  const hasSpread = decl.arguments.some(x => x?.type === 'SpreadElement');
  let spreadArr = null;
  if (hasSpread) {
    spreadArr = generate(scope, { type: 'ArrayExpression', elements: decl.arguments, _doNotMarkTypeUsed: true });
  }
  const userArgs = hasSpread ? [] : decl.arguments;

  // super(): construct with the parent, field initializers follow the marker
  if (decl.callee.type === 'Super') {
    const superCtor = reuse(scope, decl.callee._home ? generateSuper(scope, decl.callee) : generate(scope, scope.ast._superClassExpr));
    const argVals = hasSpread ? [] : userArgs.map(a => reuse(scope, generate(scope, a)));
    emitIf(scope, JvFalsy(builtinCall(scope, '__ecma262_IsConstructor', [ superCtor ])),
      () => internalThrow(scope, 'TypeError', 'Super constructor is not a constructor'));
    const newTarget = reuse(scope, generate(scope, decl.callee._newTarget ?? { type: 'MetaProperty', meta: { name: 'new' }, property: { name: 'target' } }));

    // arrows have no preallocated this, the parent gets a fresh one from new.target
    let thisArg = Local('#this', T.jsval);
    if (!scope.subclass) {
      thisArg = reuse(scope, builtinCall(scope, '__Porffor_object_new', [ Const(T.i32, 4) ]));
      exprStmt(scope, builtinCall(scope, '__Porffor_object_setPrototypeFromConstructor', [ thisArg, newTarget ]));
    }

    const res = reuseNamed(scope, CallDynamic(superCtor, thisArg, argVals, newTarget, spreadArr));
    const binding = scope.subclass ? scope.ast._thisBinding && identNode(scope.ast._thisBinding.name) : decl.callee._this._derivedThis;
    if (binding) {
      emitIf(scope, Bin('!=', T.i32, JvType(generate(scope, binding)), Const(T.i32, TYPES.undefined)),
        () => internalThrow(scope, 'ReferenceError', 'Super constructor may only be called once'));
      genStmt(scope, { type: 'AssignmentExpression', operator: '=', left: binding, right: identNode(res[N_A]) });
    }

    if (scope.constr && scope.subclass && !globalThis.precompile) {
      const thisRef = Local('#this', T.jsval);
      const t = reuse(scope, JvType(res));
      emitIf(scope, Bin('&&', T.i32, jvIsObject(res, t), Un('!', T.i32, Eq(true, res, thisRef))), () => {
        const sup = reuseNamed(scope, superCtor);
        const parentProto = generate(scope, getObjProp({ type: 'Identifier', name: sup[N_A] }, 'prototype'));
        const builtinInstance = Bin('&&', T.i32, Bin('&&', T.i32, Bin('!=', T.i32, t, Const(T.i32, TYPES.object)), Bin('!=', T.i32, t, Const(T.i32, TYPES.function))), Bin('!=', T.i32, t, Const(T.i32, TYPES.proxy)));
        emitIf(scope, Bin('||', T.i32, builtinInstance, Eq(true, builtinCall(scope, '__Object_getPrototypeOf', [ res ]), parentProto)), () =>
          exprStmt(scope, builtinCall(scope, '__Object_setPrototypeOf', [ res, builtinCall(scope, '__Object_getPrototypeOf', [ thisRef ]) ])));
        stmt(scope, Assign(thisRef, res));
      });
    }
    if (scope.subclass && hasClosureOwnEnv(scope) && scope.closureOwnThis) mirrorToClosureEnv(scope, '#this', { type: 'ThisExpression' });

    stmt(scope, CLASS_FIELD_INIT_MARKER);
    return res;
  }

  if (name && name in builtinFuncs && builtinFuncs[name].comptime && !decl._noComptime) {
    return builtinFuncs[name].comptime(scope, decl, { generate, getNodeType, knownType, makeString, printStaticStr, createThisArg, exprStmt });
  }

  // resolve the callee to a known user func for a direct call
  let func, directCallEnv = iifeEnv, isBuiltin = false;
  if (decl._funcIdx) func = funcByIndex(decl._funcIdx);
  else {
    const isBuiltinMember = decl.callee._builtinMember && name in builtinFuncs;
    const isLocal = decl.callee.type === 'Identifier' && !isBuiltinMember && lookupName(scope, name)[0] != null;
    const closureBacked = decl.callee.type === 'Identifier' && (decl.callee._closureFunc || scope.closureCaptures?.[name] || (!decl.callee._skipClosureOwnLocals && scope.closureOwnLocals?.[name]));
    const binding = decl.callee._resolvedVariable?.node ?? scope.closureCaptures?.[name]?.node ?? scope.closureOwnLocals?.[name]?.node;
    if (!isBuiltinMember && closureBacked && name && isFuncType(binding?.type) && directCallOnlyRefs(binding)) {
      func = resolveNamedFunction(scope, name);
      // per-iteration snapshot envs can't be recomputed from the caller's env
      if (getPerIterationClosureCaptureNames(func).length > 0) func = null;
      const owner = decl.callee._closureFunc ?? scope.closureCaptures?.[name]?.func;
      // a fully elided env chain leaves the caller envless; the callee then only has
      // elided captures itself, so it never reads the env
      if (func?.closureAware && owner && (hasClosureOwnEnv(scope) || scope.closureAware)) directCallEnv = generate(scope, closureEnvNode(scope, undefined, owner));
    }
    if (isBuiltinMember) {
      isBuiltin = true;
    } else if (!func && !isLocal && !closureBacked && name) {
      func = resolveNamedFunction(scope, name) ?? globalFuncByName(scope, name);
      if (!func && name in builtinFuncs) isBuiltin = true;
    }
    if (!func && !isBuiltin && !isLocal && !closureBacked && scope.name === name) func = scope;
  }

  if (isBuiltin && !hasSpread) {
    const f = includeBuiltin(scope, name);
    const argv = userArgs.map(a => reuse(scope, generate(scope, a)));
    if (decl._new && f.constr === false) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`);
    const newTargetVal = decl._new ? materializeFunctionValue(scope, f, false) : null;
    return Call(f.index, buildDirectArgs(scope, decl, f, argv, newTargetVal, decl._thisArg ? reuse(scope, generate(scope, decl._thisArg)) : null), f.retType ?? T.jsval);
  }

  if (func && !hasSpread) {
    func.generate?.();
    if (func && !decl._new && !decl._insideIndirect) func.onlyNew = false;

    coroTypeUsed(func);

    // evaluate every arg left-to-right up front, before #this creation (C doesn't order
    // call args), args beyond the callee's arity still run
    const argv = userArgs.map(a => reuse(scope, generate(scope, a)));
    if (decl._new && func.constr === false) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`);
    const newTargetVal = decl._new ? materializeFunctionValue(scope, func, false) : null;
    const args = buildDirectArgs(scope, decl, func, argv, newTargetVal, decl._thisArg ? reuse(scope, generate(scope, decl._thisArg)) : null, directCallEnv);
    const call = Call(func.index, args, func.retType ?? T.jsval);
    if (func.async || func.generator) call[N_C] = argv;
    return call;
  }

  let calleeVal, thisVal = null;
  const callee = decl.callee.expression ?? decl.callee;
  if (!decl._new && callee.type === 'MemberExpression' && callee.object.type === 'Super') {
    thisVal = reuse(scope, generate(scope, callee.object._this));
    calleeVal = generateSuperMember(scope, callee, thisVal);
  } else if (!decl._new && callee.type === 'MemberExpression') {
    thisVal = reuse(scope, generate(scope, callee.object));
    calleeVal = generateMember(scope, callee, thisVal);
  } else {
    calleeVal = generate(scope, decl.callee);
    if (!decl._new) thisVal = decl._thisArg ? reuse(scope, generate(scope, decl._thisArg)) : createThisArg(scope, decl);
  }
  calleeVal = reuse(scope, calleeVal);

  if (decl.optional) {
    emitIf(scope, nullish(scope, calleeVal), () => {
      assign(scope, scope.chainRes, valUndefined());
      stmt(scope, Break(scope.chainLabel));
    });
  }

  const argVals = hasSpread ? [] : userArgs.map(a => reuse(scope, generate(scope, a)));

  if (decl._new) {
    emitIf(scope, JvFalsy(builtinCall(scope, '__ecma262_IsConstructor', [ calleeVal ])),
      () => internalThrow(scope, 'TypeError', `${Prefs.d ? exprText(callee) : 'value'} is not a constructor`));
    thisVal = decl._thisArg ? reuse(scope, generate(scope, decl._thisArg)) : createThisArg(scope, decl, calleeVal);
  } else if (Prefs.d) {
    emitIf(scope, Bin('!=', T.i32, JvType(calleeVal), Const(T.i32, TYPES.function)),
      () => internalThrow(scope, 'TypeError', `${exprText(callee)} is not a function`));
  }

  return CallDynamic(calleeVal, coerceValue(thisVal, T.jsval), argVals, decl._new ? calleeVal : null, spreadArr);
};

// derived constructors have no this until super() returns
const derivedThis = (scope, binding) => {
  const value = reuse(scope, generate(scope, binding));
  emitIf(scope, Bin('==', T.i32, JvType(value), Const(T.i32, TYPES.undefined)),
    () => internalThrow(scope, 'ReferenceError', 'Must call super constructor before accessing this'));
  return value;
};

const generateThis = (scope, decl) => {
  if (decl._classThis) return generate(scope, decl._classThis);

  // arrows read the enclosing `this` out of the closure env
  if (decl._closureThisFunc) return generate(scope, closureEnvNode(scope, '#this', decl._closureThisFunc));

  if (scope.overrideThis) return generate(scope, scope.overrideThis);

  if (decl._derivedThis) return derivedThis(scope, decl._derivedThis);
  if (scope.ast?._thisBinding) return derivedThis(scope, identNode(scope.ast._thisBinding.name));

  // ordinary direct calls have a fixed receiver
  if (scope.directCallOnly) return scope.strict
    ? valUndefined()
    : generate(scope, { type: 'Identifier', name: 'globalThis' });

  // top-level strict module: `this` is undefined
  if (scope.ast?.type === 'Program' && scope.strict) return valUndefined();

  // a non-constructor, non-method function: `this` is globalThis
  if (!scope.constr && !scope.method) return generate(scope, { type: 'Identifier', name: 'globalThis' });

  // when `this` can't be globalThis, read #this directly
  if (
    (!globalThis.precompile && scope.strict) || // strict mode
    scope._onlyConstr || // inside func that is only constructed
    scope._noGlobalThis || // inside func known to never use globalThis
    decl._noGlobalThis // this generation known to not be globalThis
  ) return Local('#this', T.jsval);

  // defaulted once at entry
  if (scope.thisDefault) return Local('#this', T.jsval);
  const block = scope.body;
  const marker = scope.thisDefault = Symbol('this default');
  block.unshift(marker);
  onFinalize(() => {
    const i = block.indexOf(marker);
    if (i === -1) return;
    const thisv = Local('#this', T.jsval);
    block.splice(i, 1, ...(scope.onlyNew !== false && !scope.referenced ? [] : [
      If(JvNullish(thisv),
        [ Assign(thisv, generate(scope, { type: 'Identifier', name: 'globalThis' })) ],
        [ If(Un('!', T.i32, jvIsObject(thisv, JvType(thisv))), [ Assign(thisv, builtinCall(scope, '__ecma262_ToObject', [ thisv ])) ], null) ])
    ]));
  });
  return Local('#this', T.jsval);
};

// super's base is the prototype of the [[HomeObject]]
const generateSuper = (scope, decl) => builtinCall(scope, '__Object_getPrototypeOf', [
  generate(scope, decl._homeProto ? getObjProp(decl._home, 'prototype') : decl._home)
]);

// super[key] looks up from the base but getters see this
const generateSuperMember = (scope, decl, thisVal = reuse(scope, generate(scope, decl.object._this))) => {
  const key = reuse(scope, generate(scope, getProperty(decl)));
  return builtinCall(scope, '__Porffor_object_getWithReceiver', [ generate(scope, decl.object), key, thisVal ]);
};

// o.#x reads the name's WeakMap, throwing without the element
const privateGet = (scope, prop, obj) =>
  builtinCall(scope, prop._private.kind === 'accessor' ? '__Porffor_private_getAccessor' : '__Porffor_private_get', [ generate(scope, prop._map), obj ]);

const privateSet = (scope, prop, obj, value) => {
  const map = generate(scope, prop._map);
  if (prop._private.kind === 'method') return builtinCall(scope, '__Porffor_private_setMethod', [ map, obj ]);
  return builtinCall(scope, prop._private.kind === 'accessor' ? '__Porffor_private_setAccessor' : '__Porffor_private_set', [ map, obj, value ]);
};

const writeBinding = (scope, binding, value, type) => {
  // classes in field initializers are generated inside the constructor
  const global = binding._variable.func.type === 'Program';
  allocVar(scope, binding.name, global);
  setLocalWithType(scope, binding.name, global, value, false, type);
  if (scope.closureOwnLocals?.[binding.name]) mirrorToClosureEnv(scope, binding.name);
};

const DEFAULT_VALUE = { type: 'Identifier', name: 'undefined' };

const unhackName = name => {
  if (!name) return name;

  if (name.startsWith('__')) return name.slice(2).replaceAll('_', '.');
  return name.replace(/(?!^)#(m\w+|\d+)$/, '');
};

const knownType = (scope, type) => typeof type === 'number' ? type : null;

const typeUsed = (scope, x) => {
  // no BigInt value can exist then, so its type switch cases are dead
  if (x == null || (x === TYPES.bigint && !mayHaveBigInt)) return;
  usedTypes.add(x);

  scope.usedTypes ??= new Set();
  scope.usedTypes.add(x);
};

const typeSwitch = (scope, subject, staticType, bc, fallthrough = false) => {
  const branch = x => typeof x === 'function' ? x() : x;
  const entriesOf = bc => {
    if (typeof bc === 'function') bc = bc();
    if (Array.isArray(bc)) return bc;

    return Object.keys(bc)
      .sort((a, b) => a === 'default' ? 1 : b === 'default' ? -1 : +a - +b)
      .map(k => [ k === 'default' ? 'default' : +k, bc[k] ]);
  };
  const entries = entriesOf(bc);
  const typeIdsOf = types => Array.isArray(types) ? types : [ types ];

  if (staticType != null) {
    let def;
    for (const [ types, v ] of entries) {
      if (types === 'default') { def = v; continue; }
      if (types === staticType || (Array.isArray(types) && types.includes(staticType))) return branch(v);
    }
    return def != null ? branch(def) : valUndefined();
  }

  const res = tmp(scope, T.jsval);
  const cases = [];
  const finalizers = [];
  let def;
  const collectAssign = (target, value) => {
    target.push(...collect(scope, () => {
      const pool = scope.tmpPool[res[N_TYPE]];
      const i = pool ? pool.indexOf(res[N_A]) : -1;
      if (i !== -1) pool.splice(i, 1);
      assign(scope, res, typeof value === 'function' ? value() : value);
    }));
  };

  const addDefault = value => {
    def = [];
    finalizers.push(() => {
      if (def.length === 0) collectAssign(def, value);
    });
  };

  const addCase = (types, value) => {
    const typeIds = typeIdsOf(types);
    const body = [];
    cases.push([ typeIds, body, fallthrough ]);
    if (!globalThis.precompile && usesAnyType(typeIds)) collectAssign(body, value);
    finalizers.push(() => {
      if (body.length === 0 && (globalThis.precompile || usesAnyType(typeIds))) collectAssign(body, value);
    });
  };

  for (const [ types, v ] of entries) {
    if (types === 'default') addDefault(v);
    else addCase(types, v);
  }

  // temps live at creation are referenced by deferred case bodies: pull them from
  // the pool so branch scratch cannot clobber them
  const pinned = scope.tmpBusy.slice();
  const chainLabel = scope.chainLabel, chainRes = scope.chainRes;
  let lastTypes = -1;
  const finalize = () => {
    if (lastTypes === usedTypes.size) return;
    lastTypes = usedTypes.size;

    const prevLabel = scope.chainLabel, prevRes = scope.chainRes;
    scope.chainLabel = chainLabel;
    scope.chainRes = chainRes;
    for (const { name, type } of pinned) {
      const pool = scope.tmpPool[type];
      const i = pool ? pool.indexOf(name) : -1;
      if (i !== -1) pool.splice(i, 1);
    }
    for (let i = 0; i < finalizers.length; i++) finalizers[i]();
    scope.chainLabel = prevLabel;
    scope.chainRes = prevRes;
  };
  if (globalThis.precompile) finalize();
  else onFinalize(finalize);

  stmt(scope, TypeSwitch(subject, cases, def));
  return res;
};

const typeIsOneOf = (type, types) =>
  types.map(t => Bin('==', T.i32, type, Const(T.i32, t))).reduce((a, b) => Bin('|', T.i32, a, b));

const allocVar = (scope, name, global = false, valType = T.jsval, redecl = false) => {
  const target = global ? globals : scope.locals;

  // already declared
  if (name in target) {
    if (redecl) {
      // a redeclaration shadows the old binding: move it aside under a unique name
      target['#redecl_' + name + uniqId(scope)] = target[name];
    } else {
      return name;
    }
  }

  target[name] = { type: valType };
  return name;
};

const getVarMetadata = (scope, name, global = false) => {
  const target = global ? globals : scope.locals;
  return target[name]?.metadata;
};

const setVarMetadata = (scope, name, global = false, metadata = {}) => {
  const target = global ? globals : scope.locals;
  target[name].metadata = metadata;
};

const addVarMetadata = (scope, name, global = false, metadata = {}) => {
  const target = global ? globals : scope.locals;

  target[name].metadata ??= {};
  for (const x in metadata) {
    if (metadata[x] != null) target[name].metadata[x] = metadata[x];
  }
};

const HOIST_DECL = 1;
// module let/const: seen by inner functions only, the module body keeps its tdz
const HOIST_LEXICAL = 2;
const markVarHoists = (scope, body, moduleTop = false) => {
  scope.hoists ??= new Map();

  const mark = (pattern, kind = HOIST_DECL) => {
    if (!pattern) return;
    const add = name => {
      if (scope.topLevel && name in builtinVars) return;
      scope.hoists.set(name, kind);
    };
    if (typeof pattern === 'string') return void add(pattern);

    switch (pattern.type) {
      case 'Identifier': return void add(pattern.name);
      case 'AssignmentPattern': return mark(pattern.left, kind);
      case 'RestElement': return mark(pattern.argument, kind);
      case 'ArrayPattern':
        for (const x of pattern.elements) mark(x, kind);
        return;
      case 'ObjectPattern':
        for (const x of pattern.properties) mark(x.type === 'RestElement' ? x.argument : x.value, kind);
        return;
    }
  };

  const scan = node => {
    if (!node || typeof node !== 'object') return;

    switch (node.type) {
      case 'FunctionDeclaration':
        if (node._writes && node.id) mark(node.id);
        return;

      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'ClassDeclaration':
      case 'ClassExpression':
        return;

      case 'VariableDeclaration':
        if (node.kind === 'var') for (const x of node.declarations) mark(x.id);
        return;
    }

    for (const k in node) {
      if (k[0] === '_') continue;
      const v = node[k];
      if (Array.isArray(v)) for (const x of v) scan(x);
      else scan(v);
    }
  };

  const stmts = body.type === 'Program' || body.type === 'BlockStatement' ? body.body : null;
  if (stmts) for (const x of stmts) {
    if (moduleTop && x.type === 'VariableDeclaration' && x.kind !== 'var') {
      for (const d of x.declarations) mark(d.id, HOIST_LEXICAL);
    }
    scan(x);
  }
};

const materializeHoistedVar = (scope, name) => {
  const global = scope.topLevel;
  allocVar(scope, name, global);
  return global ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval);
};

const lookupHoistedVar = (scope, name) => {
  if (scope.hoists?.get(name) === HOIST_DECL) return materializeHoistedVar(scope, name);

  for (let cursor = scope.parentFunc; cursor; cursor = cursor.parentFunc) {
    if (cursor.topLevel && cursor.hoists?.has(name)) return materializeHoistedVar(cursor, name);
  }
};

const typeAnnoToPorfType = x => {
  if (!x) return null;
  if (TYPES[x.toLowerCase()] != null) return TYPES[x.toLowerCase()];

  switch (x) {
    case 'i32':
    case 'i64':
    case 'f64':
      return TYPES.number;
  }

  return null;
};
const typeAnnoToIrType = x => {
  switch (x) {
    case 'i32': return T.i32;
    case 'i64': return T.i64;
    case 'f64': return T.f64;
  }
  return null;
};

const extractTypeAnnotation = (decl, unwrapPromise = false) => {
  let a = decl;
  while (a.typeAnnotation) a = a.typeAnnotation;
  if (unwrapPromise && a.type === 'TSTypeReference' && a.typeName?.name === 'Promise') a = a.typeParameters?.params?.[0];
  if (!a) return {};

  let types = null, type = null, elementType = null, irType = null;
  if (a.typeName) {
    type = a.typeName.name;
  }
  if (type == null && a.type.endsWith('Keyword')) {
    type = a.type.slice(2, -7).toLowerCase();
    if (type === 'void') type = 'undefined';
  } else if (a.type === 'TSArrayType') {
    type = 'array';
    elementType = extractTypeAnnotation(a.elementType).type;
  } else if (a.type === 'TSUnionType') {
    types = [];
    for (const x of a.types) {
      const inner = extractTypeAnnotation(x);
      if (inner.types) for (const t of inner.types) {
        if (!types.includes(t)) types.push(t);
      }
    }
  }

  irType = typeAnnoToIrType(type);
  type = typeAnnoToPorfType(type);

  if (!types && type != null) types = [ type ];

  // outside precompile, string means string|bytestring
  if (!globalThis.precompile && type === TYPES.string) {
    type = null;
    types = [ TYPES.string, TYPES.bytestring ];
  }

  return { type, types, elementType, irType };
};

const setLocalWithType = (scope, name, isGlobal, decl, tee = false, overrideType = undefined) => {
  const metadata = scope.locals[name]?.metadata;
  // assigning to an annotated local is `value as T`
  if (metadata?.typeAnnotation && !Array.isArray(decl) && decl.type !== 'TSAsExpression')
    decl = { type: 'TSAsExpression', expression: decl, typeAnnotation: metadata.typeAnnotation };
  const known = overrideType ?? metadata?.type ?? (Array.isArray(decl) ? null : getNodeType(scope, decl));
  if (!Array.isArray(decl) && known != null && known !== TYPES.undefined && known !== TYPES.number && known !== TYPES.boolean &&
      decl.type === 'CallExpression' && (decl.callee.name === '__Porffor_malloc' ||
        (decl.callee.type === 'MemberExpression' && decl.callee.object.name === 'Porffor' && decl.callee.property.name === 'malloc')))
    decl._porfMallocType = known;
  // promote to raw f64 only when semantic write analysis proved every visible write numeric
  if (!isGlobal && known === TYPES.number && scope.locals[name]?.type === T.jsval &&
      (metadata?.type === TYPES.number || metadata?.storageType === TYPES.number) &&
      !scope.closureOwnLocals?.[name] && !scope.closureCaptures?.[name] && !metadata?.read && !metadata?.param) {
    scope.locals[name].type = T.f64;
  }
  const ref = isGlobal ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval);
  const value = Array.isArray(decl) ? decl : generate(scope, decl, name);
  if (known != null && known !== TYPES.undefined && known !== TYPES.number && known !== TYPES.boolean) {
    const alloc = value[N_KIND] === K.Alloc ? value :
      (value[N_KIND] === K.Box && value[N_A][N_KIND] === K.Alloc ? value[N_A] : null);
    if (alloc != null && alloc[N_B] === 0) alloc[N_B] = known;
  }
  setType(scope, name, known);
  assign(scope, ref, ref[N_TYPE] === T.jsval ? (value[N_TYPE] === T.jsval ? value : known != null && known !== TYPES.number ? valOf(value, known) : valNumber(value))
    : ref[N_TYPE] === value[N_TYPE] ? value
    : ref[N_TYPE] === T.f64 ? numValue(value)
    : ref[N_TYPE] === T.ptr ? JvPtr(value)
    : coerceValue(value, ref[N_TYPE]));
  return tee ? (ref[N_TYPE] === T.f64 ? valNumber(ref) : ref) : undefined;
};

const setDefaultFuncName = (decl, name) => {
  if (decl.id) return;

  if (decl.type === 'ClassExpression') {
    for (const x of decl.body.body) {
      if (x.static && x.key.name === 'name') return;
    }
  }

  name = name.split('#')[0];
  decl.id = { type: 'Identifier', name };
  decl._porfDefaultName = true;
};

const generatePatternDstr = (scope, tmpPrefix, pattern, init, defaultValue, emit) => {
  const tmpName = tmpPrefix + uniqId(scope);
  generateVarDstr(scope, 'const', tmpName, init, defaultValue, false);

  const tmpRef = Local(tmpName, scope.locals[tmpName]?.type ?? T.jsval);
  if (pattern.type === 'ArrayPattern') {
    const known = knownType(scope, getType(scope, tmpName));
    // (utf-16) strings iterate code points, so are not indexed directly
    const rec = iteratorRecord(scope, tmpRef, known, [ TYPES.array, TYPES.bytestring ]);
    const recNode = rec && identNode(rec[N_A]);
    const iterCall = name => ({ type: 'CallExpression', callee: identNode(name), arguments: [ recNode ] });
    const read = (indexed, iterated) => {
      if (!rec) return indexed;
      if (known != null) return iterated;
      const test = { type: 'BinaryExpression', operator: '!==', left: recNode, right: identNode('undefined') };
      return { type: 'ConditionalExpression', test, consequent: iterated, alternate: indexed };
    };

    let i = 0;
    const elements = pattern.elements.slice();
    for (const e of elements) {
      if (!e) {
        if (rec) genStmt(scope, read(identNode('undefined'), iterCall('__Porffor_iterator_skip')));
        i++;
        continue;
      }

      if (e.type === 'RestElement') {
        if (e.argument.type === 'ArrayPattern' && !rec) {
          elements.push(...e.argument.elements);
        } else {
          emit(e.argument, read({
            type: 'CallExpression',
            callee: { type: 'Identifier', name: '__Array_prototype_slice' },
            arguments: [
              { type: 'Literal', value: i }
            ],
            _thisArg: identNode(tmpName),
            _protoInternalCall: true
          }, iterCall('__Porffor_iterator_rest')));
        }

        continue;
      }

      emit(e.type === 'AssignmentPattern' ? e.left : e,
        read(memberNode(identNode(tmpName), { type: 'Literal', value: i }, true), iterCall('__Porffor_iterator_step')),
        e.type === 'AssignmentPattern' ? e.right : undefined);

      i++;
    }

    if (rec) closeIterator(scope, rec);
  } else if (pattern.type === 'ObjectPattern') {
    emitIf(scope, nullish(scope, tmpRef, getType(scope, tmpName)),
      () => internalThrow(scope, 'TypeError', 'Cannot object destructure undefined or null'));

    const usedProps = [];
    const hasRest = pattern.properties.at(-1)?.type === 'RestElement';
    for (const prop of pattern.properties) {
      if (prop.type == 'Property') {
        let key = prop.key;
        // the rest excludes computed keys as property keys, evaluated once
        if (hasRest && prop.computed) {
          const keyName = '#dstr_key' + uniqId(scope);
          generateVarDstr(scope, 'const', keyName, { type: 'CallExpression', callee: identNode('__ecma262_ToPropertyKey'), arguments: [ key ] }, undefined, false);
          key = identNode(keyName);
        }
        usedProps.push(prop.computed ? key : getProperty(prop, true));

        const memberComputed = prop.computed || prop.key.type === 'Literal';
        emit(prop.value.type === 'AssignmentPattern' ? prop.value.left : prop.value,
          memberNode(identNode(tmpName), key, memberComputed),
          prop.value.type === 'AssignmentPattern' ? prop.value.right : undefined);
      } else if (prop.type === 'RestElement') {
        emit(prop.argument, {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: '__Porffor_object_rest' },
          arguments: [
            { type: 'ObjectExpression', properties: [] },
            identNode(tmpName),
            ...usedProps
          ]
        });
      }
    }
  }
};

const generateVarDstr = (scope, kind, pattern, init, defaultValue, global) => {
  if (init && init.type === 'CallExpression' && init.callee.name === '__Porffor_dlopen') {
    throw new Error('Porffor.dlopen is not yet supported in the native IR backend');
  }

  pattern = identNode(pattern);

  const topLevel = scope.topLevel;
  if (pattern.type === 'Identifier') {
    const name = pattern.name;

    if (init && isFuncType(init.type)) {
      // opt: declare directly from the function expression
      setDefaultFuncName(init, name);
      const [ func ] = generateFunc(scope, init, true);
      pattern._func = func;

      const funcName = init.id?.name;
      if (name !== funcName && funcName in funcIndex) {
        setFuncIndex(name, funcIndex[funcName]);
        delete funcIndex[funcName];
      }

      // an earlier-generated function already read the hoisted global
      const hoistRead = global && name in globals;
      if (!hoistRead && directCallOnlyFunctionBinding(scope, kind, name, pattern, func)) {
        return valUndefined();
      }

      // var/let function exprs need their binding value immediately (e.g. constructor .prototype reads), const stays lazy
      if (kind !== 'const' || hoistRead || hasClosureCaptures(func) || scope.closureOwnLocals?.[name]) {
        allocVar(scope, name, global);
        setVarMetadata(scope, name, global, { kind });
        setLocalWithType(scope, name, global, materializeFunctionValue(scope, func), false, TYPES.function);
      }

      // mirror the binding into the closure env when an inner closure captures it
      if (scope.closureOwnLocals?.[name]) mirrorToClosureEnv(scope, name);

      return valUndefined();
    }

    if (defaultValue && isFuncType(defaultValue.type)) {
      setDefaultFuncName(defaultValue, name);
    }

    if (topLevel && name in builtinVars) {
      if (kind !== 'var') return internalThrow(scope, 'SyntaxError', `Identifier '${unhackName(name)}' has already been declared`);
      if (!init) return valUndefined();

      allocVar(scope, name, global);
      setVarMetadata(scope, name, global, { kind });
      setLocalWithType(scope, name, global, init);
      return valUndefined();
    }

    const typed = typedInput && pattern.typeAnnotation && extractTypeAnnotation(pattern);
    const redecl = name in (global ? globals : scope.locals);
    allocVar(scope, name, global, typed?.irType ?? T.jsval);

    const metadata = { kind };
    // read before any write it can observe undefined, so no raw slot
    if (pattern._storageType != null && !(pattern._uninitialized && pattern._storageHazardRef)) metadata.storageType = pattern._storageType;
    if (init?.type === 'ObjectExpression') {
      metadata.ownProperties = new Set();
      for (const prop of init.properties) {
        if (prop.type === 'SpreadElement') continue;
        const propName = prop.computed ? prop.key.value : (prop.key.name ?? prop.key.value);
        if (propName != null) metadata.ownProperties.add(String(propName));
      }
    }
    if (redecl) {
      // a redeclaration is a new binding sharing the slot: drop stale type info, but pin
      // the value type (read) as earlier IR may already reference the local
      const oldMd = (global ? globals : scope.locals)[name].metadata;
      if (oldMd) {
        delete oldMd.type;
        delete oldMd.types;
        delete oldMd.typeAnnotation;
        delete oldMd.elementType;
        delete oldMd.storageType;
      }
      addVarMetadata(scope, name, global, { ...metadata, read: true });
    } else {
      setVarMetadata(scope, name, global, metadata);
    }
    if (typed) addVarMetadata(scope, name, global, { ...typed, typeAnnotation: pattern.typeAnnotation });

    if (init) {
      setLocalWithType(scope, name, global, init, false, typed?.type);

      if (defaultValue) {
        const ref = global ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval);
        const doDefault = () => {
          assign(scope, ref, generate(scope, defaultValue, name));
          setType(scope, name, getNodeType(scope, defaultValue), true);
        };
        const st = getType(scope, name);
        if (st === TYPES.undefined) doDefault();
        else if (st == null) emitIf(scope, Bin('==', T.jsval, ref, valUndefined()), doDefault);
      }
    } else {
      // a let is undefined at its declaration, again on every loop iteration
      const ref = global ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval);
      if (kind === 'let' && !typed && ref[N_TYPE] === T.jsval) assign(scope, ref, valUndefined());
      setInferred(scope, name, null, global);
    }

    if (scope.closureOwnLocals?.[name] && (!redecl || init)) {
      mirrorToClosureEnv(scope, name, init ? closureLocalReadNode(name) : DEFAULT_VALUE);
    }

    return valUndefined();
  }

  if (pattern.type === 'ArrayPattern') {
    generatePatternDstr(scope, '#destructure', pattern, init, defaultValue,
      (target, value, def) => generateVarDstr(scope, kind, target, value, def, global));
    return valUndefined();
  }

  if (pattern.type === 'ObjectPattern') {
    generatePatternDstr(scope, '#destructure', pattern, init, defaultValue,
      (target, value, def) => generateVarDstr(scope, kind, target, value, def, global));
    return valUndefined();
  }

  if (pattern.type === 'MemberExpression') {
    genStmt(scope, {
      type: 'AssignmentExpression',
      operator: '=',
      left: pattern,
      right: !defaultValue ? init : {
        type: 'LogicalExpression',
        operator: '??',
        left: init,
        right: defaultValue
      }
    });
    return valUndefined();
  }
};

const generatePatternAssign = (scope, pattern, init, defaultValue) => {
  pattern = identNode(pattern);

  if (pattern.type === 'Identifier' && defaultValue && isFuncType(defaultValue.type)) {
    setDefaultFuncName(defaultValue, pattern.name);
  }

  if (pattern.type === 'MemberExpression' && init?.type === 'MemberExpression' &&
      pattern.object.type !== 'Super' && pattern.property.type !== 'PrivateIdentifier') {
    // a.b = c.d: bind source key, target object and property up-front for evaluation order
    const id = uniqId(scope);
    const sourceKeyName = '#assign_source_key' + id;
    const targetObjectName = '#assign_target_obj' + id;
    const targetPropertyName = '#assign_target_prop' + id;
    const rhsName = '#assign_value' + id;

    generateVarDstr(scope, 'const', sourceKeyName, {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__ecma262_ToPropertyKey' },
      arguments: [ getProperty(init) ]
    }, undefined, false);
    generateVarDstr(scope, 'const', targetObjectName, pattern.object, undefined, false);
    generateVarDstr(scope, 'const', targetPropertyName, getProperty(pattern), undefined, false);
    generateVarDstr(scope, 'const', rhsName,
      memberNode(init.object, identNode(sourceKeyName), true), defaultValue, false);
    genStmt(scope, {
      type: 'AssignmentExpression',
      operator: '=',
      left: memberNode(identNode(targetObjectName), identNode(targetPropertyName), true),
      right: identNode(rhsName)
    });
    return valUndefined();
  }

  if (pattern.type === 'Identifier' || pattern.type === 'MemberExpression') {
    let right = init;

    if (defaultValue) {
      const tmpName = '#assign' + uniqId(scope);
      generateVarDstr(scope, 'const', tmpName, init, undefined, false);
      right = {
        type: 'ConditionalExpression',
        test: {
          type: 'BinaryExpression',
          operator: '===',
          left: identNode(tmpName),
          right: identNode('undefined')
        },
        consequent: defaultValue,
        alternate: identNode(tmpName)
      };
    }

    genStmt(scope, {
      type: 'AssignmentExpression',
      operator: '=',
      left: pattern,
      right
    });
    return valUndefined();
  }

  if (pattern.type === 'ArrayPattern') {
    generatePatternDstr(scope, '#assign_dstr', pattern, init, defaultValue,
      (target, value, def) => generatePatternAssign(scope, target, value, def));
    return valUndefined();
  }

  if (pattern.type === 'ObjectPattern') {
    generatePatternDstr(scope, '#assign_dstr', pattern, init, defaultValue,
      (target, value, def) => generatePatternAssign(scope, target, value, def));
    return valUndefined();
  }
};

const generateVar = (scope, decl) => {
  const topLevel = scope.topLevel;
  const global = decl._global ?? (topLevel || decl._bare);

  for (const x of decl.declarations) {
    const m = mark(scope);
    // var initializers inside with statements assign through them
    generateVarDstr(scope, decl.kind, x.id, x.id._withs ? undefined : x.init, undefined, global);
    if (x.id._withs && x.init) genStmt(scope, { type: 'AssignmentExpression', operator: '=', left: x.id, right: x.init });
    release(scope, m);
  }

  return valUndefined();
};

const getProperty = (decl, forceValueStr = false) => {
  const prop = decl.property ?? decl.key;
  if (decl.computed) return prop;

  if (prop.name != null) return {
    type: 'Literal',
    value: prop.name,
  };

  if (forceValueStr && prop.value != null) return {
    ...prop,
    value: prop.value.toString()
  };

  return prop;
};

const propertyNameForError = decl => {
  const prop = getProperty(decl, true);
  if (prop.type === 'Literal' && prop.value !== undefined) return String(prop.value);

  const value = knownValue(null, prop);
  if (value !== unknownValue && value !== undefined) return String(value);
};

const exprText = node => {
  if (node.type === 'Identifier') return unhackName(node.name);
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression' && !node.computed) return `${exprText(node.object)}.${node.property.name}`;
  if (node.type === 'MemberExpression' && node.property.type === 'Literal') return `${exprText(node.object)}[${JSON.stringify(node.property.value)}]`;
  return '(intermediate value)';
};

const propertyErrorMessage = (action, target, decl) => {
  if (Prefs.d && decl) {
    const name = propertyNameForError(decl);
    const object = exprText(decl.object);
    return `Cannot ${action} property ${name != null ? `'${name}' ` : ''}of ${target}` + (object !== '(intermediate value)' ? ` (${object})` : '');
  }
  return `Cannot ${action} property of ${target}`;
};

const globalThisBindingName = (scope, decl) => {
  if (decl.type !== 'MemberExpression') return;
  const viaThis = decl.object.type === 'ThisExpression' && scope.topLevel && !Prefs.module;
  if (!viaThis && (decl.object.type !== 'Identifier' || decl.object.name !== 'globalThis')) return;

  const name = propertyNameForError(decl);
  // top-level this only reaches declared globals, the rest stay plain properties
  if (viaThis && name != null && lookupName(scope, name)[0] == null && lookupHoistedVar(scope, name) == null) return;
  if (name != null && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(name) && !(name in builtinVars)) return name;
};

const bindMemberTarget = (scope, member, prefix, coerceKey = false) => {
  const id = uniqId(scope);
  const objName = prefix + 'obj' + id;
  if (member.object.type !== 'Super') generateVarDstr(scope, 'const', objName, member.object, undefined, false);

  let property = member.property;
  if (member.computed && member._closureSlot == null) {
    const keyName = prefix + 'key' + id;
    generateVarDstr(scope, 'const', keyName, member.property, undefined, false);
    property = identNode(keyName);
    if (coerceKey) {
      // a nullish base throws before its key is converted
      if (member.object.type !== 'Super') emitIf(scope, nullish(scope, generate(scope, identNode(objName)), knownType(scope, getType(scope, objName))), () => internalThrow(scope, 'TypeError', 'Cannot read properties of null or undefined'));
      generateVarDstr(scope, 'const', keyName + 'p', { type: 'CallExpression', callee: identNode('__ecma262_ToPropertyKey'), arguments: [ property ] }, undefined, false);
      property = identNode(keyName + 'p');
    }
  }

  return memberNode(member.object.type === 'Super' ? member.object : identNode(objName), property, member.computed, {
    _closureSlot: member._closureSlot,
    _skipChainDepth: member._skipChainDepth
  });
};

const isIdentAssignable = (scope, name, op = '=') => {
  if (!scope.strict && op === '=') return true;

  if (lookupName(scope, name)[0] != null) return true;

  if (lookupHoistedVar(scope, name) != null) return true;

  if (hasFuncWithName(name) && scope.name !== name) return true;

  return false;
};

// todo: generate this array procedurally
const builtinPrototypeGets = ['size', 'description', 'byteLength', 'byteOffset', 'buffer', 'detached', 'resizable', 'growable', 'maxByteLength', 'name', 'message', 'constructor', 'source', 'flags', 'global', 'ignoreCase', 'multiline', 'dotAll', 'unicode', 'sticky', 'hasIndices', 'unicodeSets', 'lastIndex', 'disposed'];

const ctHash = prop => {
  if (!Prefs.ctHash || !prop || prop.computed || prop.optional) return null;

  prop = prop.property.name;
  // typed arrays treat Infinity and NaN as numeric keys
  if (!prop || prop === '__proto__' || prop === 'Infinity' || prop === 'NaN' || !byteStringable(prop)) return null;

  let i = 0;
  const len = prop.length;
  let hash = 374761393;

  const rotl = (n, k) => (n << k) | (n >>> (32 - k));
  const read = () => (prop.charCodeAt(i + 3) << 24 | prop.charCodeAt(i + 2) << 16 | prop.charCodeAt(i + 1) << 8 | prop.charCodeAt(i));

  for (; i + 4 <= len; i += 4) {
    hash = Math.imul(rotl(hash + Math.imul(read(), 3266489917), 17), 668265263);
  }

  let tail = 0;
  if (i < len) tail |= prop.charCodeAt(i);
  if (i + 1 < len) tail |= prop.charCodeAt(i + 1) << 8;
  if (i + 2 < len) tail |= prop.charCodeAt(i + 2) << 16;
  if (i < len) hash = Math.imul(rotl(hash + Math.imul(tail, 3266489917), 17), 668265263);

  hash = Math.imul(hash ^ (hash >>> 15), 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917);
  return (hash ^ (hash >>> 16));
};


const generateAssign = (scope, decl, valueUnused = false) => {
  // NamedEvaluation, not for parenthesized targets
  if (decl.left.type === 'Identifier' && decl.left._resolvedVariable && decl.left.start === decl.start && isFuncType(decl.right.type) && [ '=', '||=', '&&=', '??=' ].includes(decl.operator)) setDefaultFuncName(decl.right, decl.left.name);

  if (decl.left._tdz) {
    if (decl.operator === '=') exprStmt(scope, generate(scope, decl.right));
    return internalThrow(scope, 'ReferenceError', `Cannot access '${unhackName(decl.left.name)}' before initialization`);
  }

  if (decl.left.type === 'Identifier' && decl.left._selfBinding) {
    if (scope.strict || decl.left._classBinding) return internalThrow(scope, 'TypeError', `Cannot assign to constant variable ${decl.left.name}`);

    const v = generate(scope, decl.right);
    if (valueUnused) { exprStmt(scope, v); return valUndefined(); }
    return v;
  }

  if (decl.left.type === 'Identifier' && ((decl.left._closureFunc && !(decl.left.name in scope.locals)) || scope.closureOwnLocals?.[decl.left.name])) {
    return generateAssign(scope, {
      ...decl,
      left: closureEnvNode(scope, decl.left.name, decl.left._closureFunc ?? scope.ast)
    }, valueUnused);
  }

  const { type, name } = decl.left;
  let [ local, isGlobal ] = lookupName(scope, name);
  if (local === undefined && type === 'Identifier' && lookupHoistedVar(scope, name)) {
    [ local, isGlobal ] = lookupName(scope, name);
  }

  const op = assignmentOp(decl.operator);

  // logical assignment ops short-circuit: x @= y is x @ (x = y), NOT x = x @ y
  // (the store only happens on the branch that evaluates the right)
  const check = logicalChecks[op];
  if (check) {
    if (local !== undefined) {
      // fast path: conditional in-place store, the var itself is the result: if (check(x)) x = y
      const ref = isGlobal ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval);
      const cond = check(scope, ref, getType(scope, name));
      setInferred(scope, name, knownType(scope, getNodeType(scope, decl)), isGlobal);
      emitIf(scope, cond, () => setLocalWithType(scope, name, isGlobal, decl.right));
      return valueUnused ? valUndefined() : (isGlobal ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval));
    }

    // member/other: x @= y -> x @ (x = y), bases/keys evaluated once before the RHS via temp-backed member nodes
    let left = decl.left;
    let rightLeft = left;
    if (type === 'MemberExpression') {
      left = bindMemberTarget(scope, decl.left, '#logical_');
      rightLeft = { ...left };
    }

    return generate(scope, {
      type: 'LogicalExpression',
      operator: op,
      left,
      right: { type: 'AssignmentExpression', operator: '=', left: rightLeft, right: decl.right }
    }, undefined, valueUnused);
  }

  if (type === 'MemberExpression' && decl.left.object.type === 'Super') {
    const thisVal = reuse(scope, generate(scope, decl.left.object._this));
    let key = reuse(scope, generate(scope, getProperty(decl.left)));
    const base = reuse(scope, generate(scope, decl.left.object));
    if (op !== '=') key = reuse(scope, toPropertyKey(scope, key, decl.left.computed));

    const value = reuse(scope, coerceValue(op === '=' ? generate(scope, decl.right) : performOp(scope, op,
      builtinCall(scope, '__Porffor_object_getWithReceiver', [ base, key, thisVal ]),
      generate(scope, decl.right), null, getNodeType(scope, decl.right)), T.jsval));
    const ok = builtinCall(scope, '__Porffor_object_setWithReceiver', [ base, key, value, thisVal ]);
    if (scope.strict) emitIf(scope, JvFalsy(ok), () => internalThrow(scope, 'TypeError', 'Cannot assign to super property'));
      else exprStmt(scope, ok);
    return valueUnused ? valUndefined() : value;
  }

  if (type === 'MemberExpression' && decl.left.property.type === 'PrivateIdentifier') {
    const obj = reuse(scope, generate(scope, decl.left.object));
    const value = reuse(scope, coerceValue(op === '=' ? generate(scope, decl.right) : performOp(scope, op,
      privateGet(scope, decl.left.property, obj), generate(scope, decl.right), null, getNodeType(scope, decl.right)), T.jsval));
    exprStmt(scope, privateSet(scope, decl.left.property, obj, value));
    return valueUnused ? valUndefined() : value;
  }

  if (type === 'MemberExpression' && decl.left._closureSlot != null) {
    const slot = decl.left._closureSlot - 1;
    const env = reuse(scope, generate(scope, decl.left.object));
    const previous = op === '=' ? null : reuse(scope, generateMember(scope, decl.left, env));
    const right = generate(scope, decl.right);
    const value = reuse(scope, op === '=' ? right : performOp(scope, op, previous, right, null, getNodeType(scope, decl.right)));
    stmt(scope, Store('f64', JvPtr(env), 8 + slot * 16, JvNum(value)));
    stmt(scope, Store('u8', JvPtr(env), 16 + slot * 16, JvType(value)));
    stmt(scope, If(canReferenceCheck(scope, value), [
      GcBarrier(JvPtr(env), Const(T.i32, TYPES.__porffor_closureenv))
    ]));
    return valueUnused ? valUndefined() : value;
  }

  if (type === 'MemberExpression' && decl.left.property.name === 'length' && !decl._internalAssign) {
    const known = knownType(scope, getNodeType(scope, decl.left.object));

    const storeLength = (p, ensureArray = null) => {
      const ptr = reuse(scope, p);
      const newVal = reuse(scope, op === '=' ? generate(scope, decl.right) : performOp(scope, op,
        Box(Convert(T.f64, LenGet(ptr)), Const(T.i32, TYPES.number)),
        generate(scope, decl.right), TYPES.number, getNodeType(scope, decl.right)));
      const lenValue = Convert(T.u32, numValue(newVal));
      // user arrays go through ArraySetLength (RangeError, non-writable length, non-configurable elements)
      const arrLenSet = () => globalThis.precompile ? stmt(scope, ArrLenSet(ptr, lenValue))
        : exprStmt(scope, builtinCall(scope, '__Porffor_array_setLengthValue', [ Box(ptr, Const(T.i32, TYPES.array)), newVal, Box(Const(T.i32, scope.strict ? 1 : 0), Const(T.i32, TYPES.boolean)) ]));
      if (ensureArray === true) {
        arrLenSet();
      } else if (ensureArray) {
        emitIf(scope, ensureArray,
          arrLenSet,
          () => stmt(scope, LenSet(ptr, lenValue)));
      } else {
        stmt(scope, LenSet(ptr, lenValue));
      }
      return newVal;
    };

    if (known != null && (known & TYPE_FLAGS.length) !== 0) {
      const v = storeLength(JvPtr(generate(scope, decl.left.object)), known === TYPES.array);
      return valueUnused ? valUndefined() : v;
    }

    const obj = reuse(scope, generate(scope, decl.left.object));
    const res = tmp(scope, T.jsval);
    emitIf(scope, Bin('!=', T.i32, Bin('&', T.i32, JvType(obj), Const(T.i32, TYPE_FLAGS.length)), Const(T.i32, 0)),
      () => assign(scope, res, coerceValue(storeLength(JvPtr(obj), Bin('==', T.i32, JvType(obj), Const(T.i32, TYPES.array))), T.jsval)),
      () => assign(scope, res, generate(scope, { ...decl, _internalAssign: true })));
    return valueUnused ? valUndefined() : res;
  }

  if (type === 'MemberExpression') {
    const object = decl.left.object;
    const property = getProperty(decl.left);
    const propertyType = getNodeType(scope, property);
    const propertyKnown = knownType(scope, propertyType);
    const canFastComputedIndex = decl.left.computed && propertyKnown === TYPES.number;
    const globalThisName = op === '=' && globalThisBindingName(scope, decl.left);
    const objectType = getNodeType(scope, object);
    const objectKnown = knownType(scope, objectType);
    const objectKnownValue = knownValue(scope, object);

    // opt: do not mark prototype funcs as referenced to optimize this in them
    if (object?.property?.name === 'prototype' && isFuncType(decl.right.type)) decl.right._doNotMarkFuncRef = true;

    const snapshotRef = v => v[N_KIND] === K.Local || v[N_KIND] === K.Global ? tmp(scope, v[N_TYPE], v) : reuse(scope, v);
    const needSnapshot = op === '=' && decl.right.type !== 'Literal' && decl.right.type !== 'Identifier';
    const obj = needSnapshot ? snapshotRef(generate(scope, object)) : reuse(scope, generate(scope, object));
    const prop = needSnapshot ? snapshotRef(generate(scope, property)) : reuse(scope, generate(scope, property));
    const simpleValue = op === '=' ? reuse(scope, generate(scope, decl.right)) : null;

    const hash = ctHash(decl.left);
    // writes can reach inherited setters
    if (!globalThis.precompile) demandMemberRead(scope, decl.left);

    // compound ops reuse one converted key for their get + set
    const keyOf = () => {
      if (!decl.left.computed || op === '=') return prop;
      // a nullish base throws before its key is converted
      emitIf(scope, nullish(scope, obj, knownType(scope, getNodeType(scope, object))), () => internalThrow(scope, 'TypeError', 'Cannot read properties of null or undefined'));
      return builtinCall(scope, '__ecma262_ToPropertyKey', [ prop ]);
    };
    const setBuiltin = scope.strict ? '__Porffor_object_setStrict' : '__Porffor_object_set';

    if (globalThisName) {
      // globalThis.x writes both the global binding and the object property
      allocVar(scope, globalThisName, true);
      setVarMetadata(scope, globalThisName, true, { kind: 'var' });

      const v = simpleValue;
      assign(scope, Global(globalThisName, T.jsval), v);
      exprStmt(scope, builtinCall(scope, setBuiltin, [ obj, keyOf(), v ]));
      return valueUnused ? valUndefined() : v;
    }

    const genericMemberSet = () => {
      const key = reuse(scope, keyOf());
      const value = op === '=' ? simpleValue
        : performOp(scope, op,
            hash != null ? builtinCall(scope, '__Porffor_object_get_withHash', [ obj, key, Const(T.i32, hash) ]) : builtinCall(scope, '__Porffor_object_get', [ obj, key ]),
            generate(scope, decl.right), null, getNodeType(scope, decl.right));
      return hash != null
        ? builtinCall(scope, setBuiltin + '_withHash', [ obj, key, value, Const(T.i32, hash) ])
        : builtinCall(scope, setBuiltin, [ obj, key, value ]);
    };

    const arraySet = () => {
      const arr = reuse(scope, JvPtr(obj));
      const { idx, valid } = denseArrayIndexKey(scope, prop);
      const res = tmp(scope, T.jsval);
      emitIf(scope, valid, () => {
        const v = reuse(scope, op === '=' ? simpleValue
          : performOp(scope, op, ArrGet(arr, idx), generate(scope, decl.right), null, getNodeType(scope, decl.right)));
        stmt(scope, ArrSet(arr, idx, v));
        assign(scope, res, v[N_TYPE] === T.jsval ? v : valNumber(v));
      }, () => assign(scope, res, genericMemberSet()));
      return res;
    };

    const taSet = t => () => {
      const v = reuse(scope, op === '=' ? simpleValue
        : performOp(scope, op, typedArrayGet(scope, obj, prop, t), generate(scope, decl.right), null, getNodeType(scope, decl.right)));
      typedArraySet(scope, obj, prop, t, v);
      return v[N_TYPE] === T.jsval ? v : valNumber(v);
    };

    const indexedMemberSetBC = [
      [ TYPES.array, arraySet ],
      ...TYPED_ARRAY_TYPES.map(t => [ t, taSet(t) ])
    ];

    const genericMemberSetBC = [
      [ TYPES.undefined, () => internalThrow(scope, 'TypeError', propertyErrorMessage('set', 'undefined', decl.left)) ],
      ...(objectKnownValue === null ? [ [ TYPES.object, () => {
        if (op === '=') exprStmt(scope, simpleValue);
        return internalThrow(scope, 'TypeError', propertyErrorMessage(op === '=' ? 'set' : 'read', 'null', decl.left));
      } ] ] : Prefs.d ? [ [ TYPES.object, () => {
        emitIf(scope, Bin('==', T.i32, JvPtr(obj), Const(T.u32, 0)), () => internalThrow(scope, 'TypeError', propertyErrorMessage(op === '=' ? 'set' : 'read', 'null', decl.left)));
        return genericMemberSet();
      } ] ] : []),
      [ 'default', genericMemberSet ]
    ];

    const memberSetBC = canFastComputedIndex ? [ ...indexedMemberSetBC, ...genericMemberSetBC ] : genericMemberSetBC;

    let res;
    if (decl.left.computed && propertyKnown == null) {
      res = typeSwitch(scope, prop, null, {
        [TYPES.number]: () => typeSwitch(scope, obj, objectKnown, [ ...indexedMemberSetBC, ...genericMemberSetBC ]),
        default: () => typeSwitch(scope, obj, objectKnown, genericMemberSetBC)
      });
    } else {
      res = typeSwitch(scope, obj, objectKnown, memberSetBC);
    }
    if (valueUnused) {
      exprStmt(scope, res);
      return valUndefined();
    }
    return res;
  }

  if ((type === 'ArrayPattern' || type === 'ObjectPattern') && op === '=') {
    const tmpName = '#rhs' + uniqId(scope);
    generateVarDstr(scope, 'const', tmpName, decl.right, undefined, false);
    generatePatternAssign(scope, decl.left, identNode(tmpName));
    return valueUnused ? valUndefined() : generate(scope, identNode(tmpName));
  }

  if (local === undefined) {
    if (type === 'Identifier' && name === 'arguments' && !scope.arrow) {
      allocVar(scope, name, false);
      setVarMetadata(scope, name, false, { kind: 'var' });

      if (valueUnused) { setLocalWithType(scope, name, false, decl.right); return valUndefined(); }
      return setLocalWithType(scope, name, false, decl.right, true);
    }

    // only allow = for this, or if in strict mode always throw
    const assignable = isIdentAssignable(scope, name, op);
    if (!assignable && type !== 'Identifier') return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`);

    if (type !== 'Identifier') {
      const tmpName = '#rhs' + uniqId(scope);
      generateVarDstr(scope, 'const', tmpName, decl.right, undefined, true);
      generateVarDstr(scope, 'var', decl.left, identNode(tmpName), undefined, true);
      return generate(scope, identNode(tmpName));
    }

    if (name in builtinVars) {
      if (scope.strict) return internalThrow(scope, 'TypeError', `Cannot assign to non-writable global ${name}`);

      // just return rhs (eg `NaN = 2`)
      return generate(scope, decl.right);
    }

    // undeclared names are global object properties (eg a = 2)
    if (globalObjectUsed && (!assignable || (lookupHoistedVar(scope, name) == null && !hasFuncWithName(name)))) {
      if (!assignable) exprStmt(scope, globalGet(scope, name));
      if (op === '=') return builtinCall(scope, '__Porffor_object_set_withHash', [ generate(scope, identNode('globalThis')), makeString(scope, name), generate(scope, decl.right), globalHash(scope, name) ]);
      return generate(scope, { ...decl, left: memberNode(identNode('globalThis'), identNode(name)) }, undefined, valueUnused);
    }
    if (!assignable) return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`);

    generateVarDstr(scope, 'var', name, decl.right, undefined, true);
    return valueUnused ? valUndefined() : generate(scope, decl.left);
  }

  if (local.metadata?.kind === 'const') return internalThrow(scope, 'TypeError', `Cannot assign to constant variable ${unhackName(name)}`);

  if (op === '=') {
    if (valueUnused) { setLocalWithType(scope, name, isGlobal, decl.right); return valUndefined(); }
    return setLocalWithType(scope, name, isGlobal, decl.right, true);
  }

  // compound assignment: left @= right -> left = left @ right
  const cur = isGlobal ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval);
  const newVal = performOp(scope, op, cur, generate(scope, decl.right), getType(scope, name), getNodeType(scope, decl.right));
  setInferred(scope, name, knownType(scope, getNodeType(scope, decl)), isGlobal);

  if (valueUnused) { setLocalWithType(scope, name, isGlobal, newVal, false, getNodeType(scope, decl)); return valUndefined(); }
  return setLocalWithType(scope, name, isGlobal, newVal, true, getNodeType(scope, decl));
};

// without these the global object can't be observed, so undeclared names stay static globals
let globalObjectUsed;
const usesGlobalObject = (node, top) => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(x => usesGlobalObject(x, top));
  if (node.type === 'ThisExpression') return top;
  if (node.type === 'Identifier') return node.name === 'globalThis' || node.name === 'Function';
  if (node.type === 'WithStatement' || node._evalParsed || (node.operator === 'delete' && node.argument.type === 'Identifier')) return true;
  // an unread capture (var global = this) observes nothing
  if (node.type === 'VariableDeclarator' && node.id._refs === 0 && node.init?.type === 'ThisExpression') return false;
  const inner = top && node.type !== 'FunctionDeclaration' && node.type !== 'FunctionExpression' && node.type !== 'ClassBody';
  for (const k in node) if (k[0] !== '_' && usesGlobalObject(node[k], inner)) return true;
  return false;
};

const globalHash = (scope, name) => {
  const hash = ctHash({ property: { name } });
  return hash != null ? Const(T.i32, hash) : builtinCall(scope, '__Porffor_object_hash', [ makeString(scope, name) ], T.i32);
};
const globalGet = (scope, name) => builtinCall(scope, '__Porffor_global_get', [ makeString(scope, name), globalHash(scope, name) ]);

const ifIdentifierErrors = (scope, decl) => {
  if (decl.type === 'Identifier') {
    if (decl._resolvedBinding || decl._closureFunc || (!decl._skipClosureOwnLocals && scope.closureOwnLocals?.[decl.name])) return false;
    if (lookup(scope, decl.name, true) == null) return true;
  }

  return false;
};

const generateUnary = (scope, decl) => {
  // numeric value of the argument (ToNumeric), skipping the call if already a number
  const toNumeric = () => knownType(scope, getNodeType(scope, decl.argument)) === TYPES.number
    ? generate(scope, decl.argument)
    : generate(scope, { type: 'CallExpression', callee: { type: 'Identifier', name: '__ecma262_ToNumeric' }, arguments: [ decl.argument ] });

  switch (decl.operator) {
    case '+':
      if (knownType(scope, getNodeType(scope, decl.argument)) === TYPES.number) return generate(scope, decl.argument);
      return generate(scope, { type: 'CallExpression', callee: { type: 'Identifier', name: '__ecma262_ToNumber' }, arguments: [ decl.argument ] });

    case '-':
      if (decl.prefix && decl.argument.type === 'Literal') {
        if (decl.argument.bigint != null)
          return generate(scope, { type: 'Literal', bigint: `-${decl.argument.bigint}` });
        if (typeof decl.argument.value === 'number')
          return generate(scope, { type: 'Literal', value: -decl.argument.value });
      }
      {
        const argType = knownType(scope, getNodeType(scope, decl.argument));
        if (argType === TYPES.bigint) return builtinCall(scope, '__Porffor_bigint_arith', [ Const(T.i32, 1), Const(T.f64, 0), generate(scope, decl.argument) ]);
        if (argType == null && mayHaveBigInt) {
          const v = reuse(scope, coerceValue(toNumeric(), T.jsval));
          const out = tmp(scope, T.jsval);
          emitBigIntIf(scope, Bin('==', T.i32, JvType(v), Const(T.i32, TYPES.bigint)),
            () => assign(scope, out, builtinCall(scope, '__Porffor_bigint_arith', [ Const(T.i32, 1), Const(T.f64, 0), v ])),
            () => assign(scope, out, Box(Un('neg', T.f64, JvNum(v)), Const(T.i32, TYPES.number))));
          return out;
        }
      }
      return Box(Un('neg', T.f64, numValue(toNumeric())), Const(T.i32, TYPES.number));

    case '~': {
      // ~x is -x - 1n for BigInts
      const bigNot = v => builtinCall(scope, '__Porffor_bigint_arith', [ Const(T.i32, 1), builtinCall(scope, '__Porffor_bigint_arith', [ Const(T.i32, 1), Const(T.f64, 0), v ]), Const(T.f64, 1) ]);
      const numNot = v => Box(Convert(T.f64, Un('~', T.i32, Convert(T.i32, toUint32(scope, v), CONVERT_RANGE_KNOWN | CONVERT_SIGNED)), CONVERT_SIGNED), Const(T.i32, TYPES.number));
      const argType = knownType(scope, getNodeType(scope, decl.argument));
      if (argType === TYPES.bigint) return bigNot(generate(scope, decl.argument));
      if (argType == null && mayHaveBigInt) {
        const v = reuse(scope, coerceValue(toNumeric(), T.jsval));
        const out = tmp(scope, T.jsval);
        emitBigIntIf(scope, Bin('==', T.i32, JvType(v), Const(T.i32, TYPES.bigint)),
          () => assign(scope, out, bigNot(v)),
          () => assign(scope, out, numNot(JvNum(v))));
        return out;
      }
      return numNot(numValue(toNumeric()));
    }

    case '!': {
      const arg = decl.argument;
      // opt: !!x -> is x truthy
      if (arg.type === 'UnaryExpression' && arg.operator === '!')
        return Box(truthy(scope, generate(scope, arg.argument), getNodeType(scope, arg.argument)), Const(T.i32, TYPES.boolean));
      return Box(falsy(scope, generate(scope, arg), getNodeType(scope, arg)), Const(T.i32, TYPES.boolean));
    }

    case 'void':
      exprStmt(scope, generate(scope, decl.argument));
      return valUndefined();

    case 'delete': {
      if (decl.argument.type === 'MemberExpression') {
        const object = decl.argument.object;
        if (object.type === 'Super') return internalThrow(scope, 'ReferenceError', 'Cannot delete super property');

        const property = getProperty(decl.argument);
        const obj = reuse(scope, generate(scope, object));
        const key = decl.argument.computed ? builtinCall(scope, '__ecma262_ToPropertyKey', [ generate(scope, property) ]) : generate(scope, property);
        return builtinCall(scope, scope.strict ? '__Porffor_object_deleteStrict' : '__Porffor_object_delete', [ obj, key ]);
      }

      // sloppy delete of an unresolvable name deletes a global object property
      if (globalObjectUsed && !scope.strict && ifIdentifierErrors(scope, decl.argument)) return generate(scope, { ...decl, argument: memberNode(identNode('globalThis'), identNode(decl.argument.name)) });
      let toReturn = true, toGenerate = true;
      if (decl.argument.type === 'Identifier') {
        if (ifIdentifierErrors(scope, decl.argument)) { toReturn = true; toGenerate = false; }
        else toReturn = false;
      }
      if (toGenerate) exprStmt(scope, generate(scope, decl.argument));
      return valBool(toReturn);
    }

    case 'typeof': {
      if (ifIdentifierErrors(scope, decl.argument)) return globalObjectUsed ? generate(scope, { ...decl, argument: memberNode(identNode('globalThis'), identNode(decl.argument.name)) }) : makeString(scope, 'undefined');

      const arg = reuse(scope, generate(scope, decl.argument));
      return typeSwitch(scope, arg, knownType(scope, getNodeType(scope, decl.argument)), [
        [ TYPES.number, () => makeString(scope, 'number') ],
        [ TYPES.boolean, () => makeString(scope, 'boolean') ],
        [ [ TYPES.string, TYPES.bytestring ], () => makeString(scope, 'string') ],
        [ TYPES.undefined, () => makeString(scope, 'undefined') ],
        [ TYPES.function, () => makeString(scope, 'function') ],
        [ TYPES.symbol, () => makeString(scope, 'symbol') ],
        [ TYPES.bigint, () => makeString(scope, 'bigint') ],
        [ TYPES.proxy, () => builtinCall(scope, '__Porffor_proxy_typeof', [ arg ]) ],

        [ 'default', () => makeString(scope, 'object') ]
      ]);
    }
  }
};

const generateUpdate = (scope, decl, valueUnused = false) => {
  if (decl.argument.type === 'Identifier' && (decl.argument._closureFunc || scope.closureOwnLocals?.[decl.argument.name])) {
    return generateUpdate(scope, {
      ...decl,
      argument: closureEnvNode(scope, decl.argument.name, decl.argument._closureFunc ?? scope.ast)
    }, valueUnused);
  }

  const { name } = decl.argument;
  const [ local, isGlobal ] = lookupName(scope, name);
  if (local?.metadata?.kind === 'const') return internalThrow(scope, 'TypeError', `Cannot assign to constant variable ${unhackName(name)}`);
  if (local != null) {
    // fast path: a local/global. todo: not as compliant as the slow path (non-numbers)
    const ref = isGlobal ? Global(name, globals[name]?.type ?? T.jsval) : Local(name, scope.locals[name]?.type ?? T.jsval);
    const inc = v => Bin(decl.operator === '++' ? '+' : '-', T.f64, numValue(v), Const(T.f64, 1));
    const incForRef = v => ref[N_TYPE] === T.jsval ? valNumber(inc(v))
      : ref[N_TYPE] === T.f64 ? inc(v)
      : Convert(ref[N_TYPE], inc(v), ref[N_TYPE] === T.i32 ? CONVERT_SIGNED : 0);

    const argType = knownType(scope, getNodeType(scope, decl.argument));
    if (ref[N_TYPE] === T.jsval && argType !== TYPES.number) {
      if (argType !== TYPES.bigint) emitIf(scope, Bin('!=', T.i32, JvType(ref), Const(T.i32, TYPES.number)),
        () => assign(scope, ref, builtinCall(scope, '__ecma262_ToNumeric', [ ref ])));
      const stepBig = v => builtinCall(scope, '__Porffor_bigint_binop', [ Const(T.i32, decl.operator === '++' ? 0 : 1), v, generate(scope, { type: 'Literal', bigint: '1' }) ]);
      const update = (big, wantOld) => {
        const old = wantOld ? tmp(scope, T.jsval, ref) : ref;
        assign(scope, ref, big ? stepBig(old) : incForRef(old));
        return old;
      };
      const wantOld = !decl.prefix && !valueUnused;
      if (argType === TYPES.bigint) {
        const old = update(true, wantOld);
        setType(scope, name, TYPES.bigint);
        return valueUnused ? valUndefined() : wantOld ? old : ref;
      }
      if (argType == null && mayHaveBigInt) {
        const out = tmp(scope, T.jsval);
        emitBigIntIf(scope, Bin('==', T.i32, JvType(ref), Const(T.i32, TYPES.bigint)),
          () => assign(scope, out, update(true, wantOld)),
          () => assign(scope, out, wantOld ? valNumber(update(false, true)) : update(false, false)));
        setType(scope, name, null);
        return valueUnused ? valUndefined() : out;
      }
    }
    setType(scope, name, TYPES.number);

    if (!decl.prefix && !valueUnused) {
      const old = tmp(scope, ref[N_TYPE], ref);
      assign(scope, ref, incForRef(old));
      return valNumber(old);
    }

    assign(scope, ref, incForRef(ref));
    return valueUnused ? valUndefined() : valNumber(ref);
  }

  let target = decl.argument;
  if (target.type === 'MemberExpression') {
    target = bindMemberTarget(scope, target, '#update', true);
  }

  let tmpName, one = { type: 'Literal', value: 1 };
  if (mayHaveBigInt) {
    // ToNumeric, then step by 1n for bigints
    const old = tmp(scope, T.jsval);
    tmpName = old[N_A];
    assign(scope, old, coerceValue(generate(scope, { type: 'CallExpression', callee: identNode('__ecma262_ToNumeric'), arguments: [ target ] }), T.jsval));
    one = {
      type: 'ConditionalExpression',
      test: { type: 'BinaryExpression', operator: '===', left: { type: 'UnaryExpression', operator: 'typeof', prefix: true, argument: identNode(tmpName) }, right: { type: 'Literal', value: 'bigint' } },
      consequent: { type: 'Literal', bigint: '1' },
      alternate: one
    };
  } else {
    tmpName = tmp(scope, T.f64)[N_A];
    addVarMetadata(scope, tmpName, false, { type: TYPES.number });
    setLocalWithType(scope, tmpName, false, { type: 'UnaryExpression', operator: '+', prefix: true, argument: target }, false, TYPES.number);
  }

  const assignNode = {
    type: 'AssignmentExpression',
    operator: '=',
    left: target,
    right: {
      type: 'BinaryExpression',
      operator: decl.operator[0],
      left: { type: 'Identifier', name: tmpName },
      right: one
    }
  };

  if (decl.prefix) return generate(scope, assignNode, undefined, valueUnused);
  genStmt(scope, assignNode);
  return valueUnused ? valUndefined() : generate(scope, identNode(tmpName));
};

const inferBranchAssigned = [];
const inferBranchStart = scope => {
  scope.inferTree ??= [ Object.create(null) ];
  inferBranchAssigned.push(new Set());
  scope.inferTree.push(Object.create(null));
};

const inferBranchEnd = scope => {
  const assigned = inferBranchAssigned.pop();
  scope.inferTree.pop();

  for (const name of assigned) {
    for (const tree of scope.inferTree) {
      if (name in tree) tree[name] = null;
    }
  }
};

const inferBranchElse = scope => {
  // todo/opt: at end of else, find inferences in common and keep them?
  inferBranchEnd(scope);
  inferBranchStart(scope);
};

const inferLoopPrev = [];
const inferLoopAssigned = [];
const inferLoopStart = scope => {
  // todo/opt: do not just wipe the infer tree for loops
  inferLoopPrev.push(scope.inferTree ?? [ Object.create(null) ]);
  inferLoopAssigned.push(new Set());
  scope.inferTree = [ Object.create(null) ];
};

const inferLoopEnd = scope => {
  const assigned = inferLoopAssigned.pop();
  scope.inferTree = inferLoopPrev.pop();

  for (const name of assigned) {
    for (const tree of scope.inferTree) {
      if (name in tree) tree[name] = null;
    }
  }
};

const generateLoopBinding = (scope, left, valNode) => {
  if (left.type === 'VariableDeclaration') generateVarDstr(scope, left.kind, left.declarations[0]?.id ?? left, valNode, undefined, scope.topLevel);
  else generatePatternAssign(scope, left, valNode);
};

const getComptimeFlag = (scope, node) => {
  if (!globalThis.precompile || node?.type !== 'TaggedTemplateExpression') return null;

  if (node.tag.name !== '__Porffor_comptime_flag') return null;

  const { quasis, expressions } = node.quasi;
  let out = quasis[0].value.raw;
  for (let i = 0; i < expressions.length; i++) {
    const value = knownValue(scope, expressions[i]);
    if (value === unknownValue) return null;
    out += value + quasis[i + 1].value.raw;
  }

  return out;
};

const generateIf = (scope, decl) => {
  const comptimeFlag = getComptimeFlag(scope, decl.test);
  if (comptimeFlag) {
    const [ kind, value ] = comptimeFlag.split('.');

    inferBranchStart(scope);
    const then = collect(scope, () => genStmt(scope, decl.consequent));
    let els = [];
    if (decl.alternate) {
      inferBranchElse(scope);
      els = collect(scope, () => genStmt(scope, decl.alternate));
      inferBranchEnd(scope);
    } else inferBranchEnd(scope);

    stmt(scope, { __porfComptimeFlag: [ kind, kind === 'hasType' ? TYPES[value] : value, then, els ] });
    return valUndefined();
  }

  const cond = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test));

  inferBranchStart(scope);
  const then = collect(scope, () => genStmt(scope, decl.consequent));
  let els = null;
  if (decl.alternate) {
    inferBranchElse(scope);
    els = collect(scope, () => genStmt(scope, decl.alternate));
    inferBranchEnd(scope);
  } else inferBranchEnd(scope);

  stmt(scope, If(cond, then, els));
  return valUndefined();
};

const generateConditional = (scope, decl) => {
  const cond = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test));
  const resType = getNodeType(scope, decl) === TYPES.number ? T.f64 : T.jsval;
  const res = tmp(scope, resType);

  inferBranchStart(scope);
  const then = collect(scope, () => assign(scope, res, coerceValue(generate(scope, decl.consequent), resType)));
  inferBranchElse(scope);
  const els = collect(scope, () => assign(scope, res, coerceValue(generate(scope, decl.alternate), resType)));
  inferBranchEnd(scope);

  stmt(scope, If(cond, then, els));
  return resType === T.f64 ? valNumber(res) : res;
};

const genLoop = (scope, decl, type) => {
  if (type === 'for' && decl.init) genStmt(scope, decl.init);

  let cond = null;
  const condStmts = [];
  if (decl.test) {
    scope.blockStack.push(condStmts);
    try { cond = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test)); }
    finally { scope.blockStack.pop(); }
  }

  const updateStmts = type === 'for' && decl.update ? collect(scope, () => genStmt(scope, decl.update)) : [];
  const testInBody = condStmts.length > 0 || type === 'dowhile';
  const updateInClause = type === 'for' && (updateStmts.length === 0 || (updateStmts.length === 1 &&
    (updateStmts[0][N_KIND] === K.Assign || updateStmts[0][N_TYPE] !== T.none)));
  const bodyUpdate = type === 'for' && !updateInClause;

  const L = fresh(scope);
  const C = bodyUpdate || type === 'dowhile' ? fresh(scope) : null;
  const d = { type, brk: L, cont: C ?? L, contViaBreak: C != null };
  consumePendingLabels(scope, d);
  depth.push(d);
  inferLoopStart(scope);

  const testBreak = () => {
    for (const s of condStmts) stmt(scope, s);
    emitIf(scope, Un('!', T.i32, cond), () => stmt(scope, Break(L)));
  };
  const userBody = () => C != null
    ? stmt(scope, BlockStmt(collect(scope, () => genStmt(scope, decl.body)), C))
    : genStmt(scope, decl.body);

  const body = collect(scope, () => {
    if (type === 'dowhile') {
      userBody();
      testBreak();
    } else {
      if (testInBody) testBreak();
      userBody();
      if (bodyUpdate) for (const s of updateStmts) stmt(scope, s);
    }
  });

  inferLoopEnd(scope);
  depth.pop();
  stmt(scope, Loop(testInBody ? null : cond, updateInClause ? (updateStmts[0] ?? null) : null, body, L));
  return valUndefined();
};

// top-level await: synchronously drain promise jobs as there is no coroutine to suspend
const awaitValue = (scope, value) => {
  if (scope.topLevel) return builtinCall(scope, '__Porffor_promise_awaitSync', [ value ]);
  scope.hasAwait = true;
  return Await(builtinCall(scope, '__Porffor_promise_awaitValue', [ value ]));
};

const generateForOf = (scope, decl) => {
  const root = tmp(scope, T.jsval, coerceValue(generate(scope, decl.right), T.jsval));
  const rootKnown = knownType(scope, getNodeType(scope, decl.right));
  const isAwait = decl.await === true;
  const rec = iteratorRecord(scope, root, rootKnown, [ TYPES.array, TYPES.set, TYPES.map, TYPES.string, TYPES.bytestring ], isAwait ? '__Porffor_iterator_getAsync' : '__Porffor_iterator_get');

  if (decl.left.type === 'Identifier' && !isIdentAssignable(scope, decl.left.name))
    return internalThrow(scope, 'ReferenceError', `${decl.left.name} is not defined`);

  const counter = tmp(scope, T.i32);
  const pointer = tmp(scope, T.u32);
  const length = tmp(scope, T.i32);
  assign(scope, counter, Const(T.i32, 0));

  assign(scope, pointer, JvPtr(root));
  assign(scope, length, LenGet(pointer));

  const L = fresh(scope);
  const d = { type: 'forof', brk: L, cont: L, contViaBreak: false };
  consumePendingLabels(scope, d);
  const fin = rec ? finallyStart(scope) : null;
  depth.push(d);
  inferLoopStart(scope);

  const taNext = t => () => {
    // length is rechecked each step as a resizable buffer can change it
    emitIf(scope, Bin('>=', T.i32, counter, typedArrayLength(scope, root, '__Porffor_typedArray_validate')), () => stmt(scope, Break(L)));
    const v = reuse(scope, typedArrayLoad(scope, root, counter, t));
    assign(scope, counter, Bin('+', T.i32, counter, Const(T.i32, 1)));
    return v;
  };
  const strNext = (ctype, size, strType) => () => {
    emitIf(scope, Bin('==', T.i32, counter, length), () => stmt(scope, Break(L)));
    const out = reuse(scope, Alloc(Const(T.i32, 8), strType));
    stmt(scope, Store('u32', out, 0, Const(T.u32, 1)));
    const src = reuse(scope, Bin('+', T.u32, Bin('+', T.u32, JvPtr(root), Const(T.u32, 4)),
      size === 1 ? counter : Bin('*', T.u32, counter, Const(T.u32, size))));
    const c = reuse(scope, Load(ctype, src, 0));
    stmt(scope, Store(ctype, out, 4, c));
    assign(scope, counter, Bin('+', T.i32, counter, Const(T.i32, 1)));

    if (size === 2) emitIf(scope, Bin('==', T.i32, Bin('&', T.i32, c, Const(T.i32, 0xFC00)), Const(T.i32, 0xD800)), () =>
      emitIf(scope, Bin('<', T.i32, counter, length), () => {
        const d = reuse(scope, Load(ctype, src, 2));
        emitIf(scope, Bin('==', T.i32, Bin('&', T.i32, d, Const(T.i32, 0xFC00)), Const(T.i32, 0xDC00)), () => {
          stmt(scope, Store('u32', out, 0, Const(T.u32, 2)));
          stmt(scope, Store(ctype, out, 6, d));
          assign(scope, counter, Bin('+', T.i32, counter, Const(T.i32, 1)));
        });
      }));
    return valOf(out, strType);
  };
  const skipTombstones = (count, entries) => {
    const sk = fresh(scope);
    stmt(scope, Loop(Bin('<', T.u32, counter, count), null, [
      If(Bin('!=', T.u64, Load('u64', Bin('+', T.u32, entries, Bin('*', T.u32, counter, Const(T.u32, 8))), 0), Const(T.u64, -1)), [ Break(sk) ], null),
      Assign(counter, Bin('+', T.i32, counter, Const(T.i32, 1)))
    ], sk));
  };

  const valName = tmp(scope, T.jsval)[N_A];
  const body = collect(scope, () => {
    const cases = [
      [ [ TYPES.array ], () => {
        emitIf(scope, Bin('>=', T.i32, counter, LenGet(pointer)), () => stmt(scope, Break(L)));
        const v = reuse(scope, arrayIndexGet(scope, pointer, counter));
        assign(scope, counter, Bin('+', T.i32, counter, Const(T.i32, 1)));
        return v;
      } ],

      [ TYPES.__porffor_generator, () => {
        const done = reuse(scope, Call('__Porffor_coroutine_resume', [ root, valUndefined(), Const(T.i32, 0) ], T.i32));
        emitIf(scope, done, () => stmt(scope, Break(L)));
        const v = tmp(scope, T.jsval, Call('__Porffor_coroutine_value', [ root ]));
        emitIf(scope, Call('__Porffor_coroutine_raw', [ root ], T.i32), () => assign(scope, v, builtinCall(scope, '__Porffor_Generator_value', [ root ])));
        return v;
      } ],

      [ TYPES.string, strNext('u16', 2, TYPES.string) ],
      [ TYPES.bytestring, strNext('u8', 1, TYPES.bytestring) ],

      ...TYPED_ARRAY_TYPES.map(t => [ t, taNext(t) ]),

      [ TYPES.set, () => {
        const count = reuse(scope, Load('u32', length, 0));
        const entries = reuse(scope, Load('u32', length, 4));
        skipTombstones(count, entries);
        emitIf(scope, Bin('>=', T.i32, counter, count), () => stmt(scope, Break(L)));
        const v = reuse(scope, Load('jsval', Bin('+', T.u32, entries, Bin('*', T.u32, counter, Const(T.u32, 8))), 0));
        assign(scope, counter, Bin('+', T.i32, counter, Const(T.i32, 1)));
        return v;
      } ],

      [ TYPES.map, () => {
        const count = reuse(scope, Load('u32', length, 0));
        const keysEnt = reuse(scope, Load('u32', length, 4));
        const valsEnt = reuse(scope, Load('u32', Load('u32', pointer, 4), 4));
        skipTombstones(count, keysEnt);
        emitIf(scope, Bin('>=', T.i32, counter, count), () => stmt(scope, Break(L)));
        const off = Bin('*', T.u32, counter, Const(T.u32, 8));
        const kName = tmp(scope, T.jsval)[N_A], vName = tmp(scope, T.jsval)[N_A];
        setLocalWithType(scope, kName, false, Load('jsval', Bin('+', T.u32, keysEnt, off), 0));
        setLocalWithType(scope, vName, false, Load('jsval', Bin('+', T.u32, valsEnt, off), 0));
        assign(scope, counter, Bin('+', T.i32, counter, Const(T.i32, 1)));
        return generate(scope, { type: 'ArrayExpression', elements: [ { type: 'Identifier', name: kName }, { type: 'Identifier', name: vName } ] });
      } ],

      [ 'default', () => {
        const v = tmp(scope, T.jsval);
        const step = () => {
          assign(scope, v, builtinCall(scope, '__Porffor_iterator_step', [ rec ]));
          emitIf(scope, iteratorDone(rec), () => stmt(scope, Break(L)));
          if (isAwait) assign(scope, v, awaitValue(scope, v));
        };
        // async iterators' values are not awaited
        if (isAwait) emitIf(scope, Bin('==', T.jsval, ArrGet(JvPtr(rec), Const(T.i32, 3)), valNum(2)), () => {
          assign(scope, v, builtinCall(scope, '__Porffor_iterator_stepAsync', [ rec, awaitValue(scope, builtinCall(scope, '__Porffor_iterator_nextAsync', [ rec ])) ]));
          emitIf(scope, iteratorDone(rec), () => stmt(scope, Break(L)));
        }, step);
          else step();
        return v;
      } ]
    ];

    // a replaced Array.prototype[Symbol.iterator] iterates arrays through the record
    if (definedKeys.has('#arrayIterator')) cases.shift();

    // values from sync sources are awaited
    const nextVal = typeSwitch(scope, root, rootKnown, !isAwait ? cases
      : cases.map(([ types, next ]) => [ types, types === 'default' ? next : () => awaitValue(scope, next()) ]));

    setLocalWithType(scope, valName, false, nextVal);
    generateLoopBinding(scope, decl.left, identNode(valName));
    genStmt(scope, decl.body);
  });

  inferLoopEnd(scope);
  depth.pop();
  const loop = Loop(null, null, body, L);
  if (!fin) {
    stmt(scope, loop);
    return valUndefined();
  }

  finallyEnd(scope, fin, [ loop ], () => closeIterator(scope, rec, isAwait), false);
  return valUndefined();
};

const generateForIn = (scope, decl) => {
  const objName = tmp(scope, T.jsval)[N_A];
  setLocalWithType(scope, objName, false, decl.right);

  if (decl.left.type === 'Identifier' && !isIdentAssignable(scope, decl.left.name))
    return internalThrow(scope, 'ReferenceError', `${decl.left.name} is not defined`);

  const objKnown = knownType(scope, getNodeType(scope, decl.right));
  return typeSwitch(scope, Local(objName, T.jsval), objKnown, {
    [TYPES.object]: () => {
      const counter = tmp(scope, T.i32);
      const pointer = tmp(scope, T.u32);
      const length = tmp(scope, T.i32);
      const objPtr = reuse(scope, JvPtr(Local(objName, T.jsval)));
      assign(scope, counter, Const(T.i32, 0));
      assign(scope, length, Load('u16', objPtr, 0));
      assign(scope, pointer, Load('u32', objPtr, 12));

      const L = fresh(scope), C = fresh(scope);
      const d = { type: 'forin', brk: L, cont: C, contViaBreak: true };
      consumePendingLabels(scope, d);
      depth.push(d);
      inferLoopStart(scope);

      const tmpName = tmp(scope, T.jsval)[N_A];
      const body = collect(scope, () => {
        stmt(scope, BlockStmt(collect(scope, () => {
          setLocalWithType(scope, tmpName, false, Box(Load('u32', pointer, 4), Load('u8', pointer, 18)));
          generateLoopBinding(scope, decl.left, identNode(tmpName));
          emitIf(scope, Bin('&', T.i32,
            Bin('!=', T.i32, Bin('&', T.i32, Load('u16', pointer, 16), Const(T.i32, 0b0100)), Const(T.i32, 0)),
            Bin('!=', T.i32, Load('u8', pointer, 18), Const(T.i32, TYPES.symbol))),
            () => genStmt(scope, decl.body));
        }), C));
        assign(scope, counter, Bin('+', T.i32, counter, Const(T.i32, 1)));
        assign(scope, pointer, Bin('+', T.u32, pointer, Const(T.u32, 20)));
      });

      inferLoopEnd(scope);
      depth.pop();
      stmt(scope, Loop(Bin('!=', T.i32, counter, length), null, body, L));
      return valUndefined();
    },

    // wrap as for..of Object.keys(obj ?? 0)
    default: () => generate(scope, {
      type: 'ForOfStatement',
      left: decl.left,
      body: decl.body,
      right: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '__Object_keys' },
        arguments: [ { type: 'LogicalExpression', left: { type: 'Identifier', name: objName }, operator: '??', right: { type: 'Literal', value: 0 } } ]
      }
    })
  });
};

const generateSwitch = (scope, decl) => {
  // fast path: switch (Porffor.type(x)) over type literals -> a typeSwitch
  if (decl.discriminant.type === 'CallExpression' && decl.discriminant.callee.type === 'Identifier' && decl.discriminant.callee.name === '__Porffor_type') {
    const cases = [];
    let canTypeCheck = true;
    for (const x of decl.cases) {
      let type;
      if (!x.test) type = 'default';
      else if (x.test.type === 'Literal') type = x.test.value;
      else if (x.test.type === 'Identifier' && x.test.name.startsWith('__Porffor_TYPES_')) type = TYPES[x.test.name.slice('__Porffor_TYPES_'.length)];
      if (type !== undefined) cases.push([ type, x.consequent ]);
      else { canTypeCheck = false; break; }
    }

    if (canTypeCheck) {
      const xv = reuse(scope, generate(scope, decl.discriminant.arguments[0]));
      const xKnown = knownType(scope, getNodeType(scope, decl.discriminant.arguments[0]));
      const dd = { type: 'switch_typeswitch', brk: null, cont: null };
      consumePendingLabels(scope, dd);
      depth.push(dd);
      typeSwitch(scope, xv, xKnown, () => {
        const bc = [];
        let types = [];
        for (const [ type, consequent ] of cases) {
          types.push(type);
          if (consequent.length !== 0) {
            const ts = types;
            bc.push([ ts.includes('default') ? 'default' : ts, () => { genStmt(scope, { type: 'BlockStatement', body: consequent }); return valUndefined(); } ]);
            types = [];
          }
        }
        return bc;
      });
      depth.pop();
      return valUndefined();
    }
  }

  const discName = '#switch' + uniqId(scope);
  allocVar(scope, discName, false);
  setLocalWithType(scope, discName, false, decl.discriminant);

  const cases = decl.cases.slice();
  if (!cases.some(x => x.test == null)) cases.push({ test: null, consequent: [] });
  const N = cases.length;

  const switchL = fresh(scope);
  const dd = { type: 'switch', brk: switchL, cont: null };
  consumePendingLabels(scope, dd);
  depth.push(dd);

  const labels = cases.map(() => fresh(scope));

  const comparisons = collect(scope, () => {
    for (let i = 0; i < N; i++) {
      if (cases[i].test) emitIf(scope, JvTruthy(generate(scope, { type: 'BinaryExpression', operator: '===', left: { type: 'Identifier', name: discName }, right: cases[i].test })),
        () => stmt(scope, Break(labels[N - 1 - i])));
    }
    // default is taken last, wherever it is
    stmt(scope, Break(labels[N - 1 - cases.findIndex(x => x.test == null)]));
  });

  let cur = BlockStmt(comparisons, labels[N - 1]);
  for (let j = 1; j < N; j++) {
    const caseBody = collect(scope, () => genStmt(scope, { type: 'BlockStatement', body: cases[j - 1].consequent }));
    cur = BlockStmt([ cur, ...caseBody ], labels[N - 1 - j]);
  }
  const lastBody = collect(scope, () => genStmt(scope, { type: 'BlockStatement', body: cases[N - 1].consequent }));

  depth.pop();
  stmt(scope, BlockStmt([ cur, ...lastBody ], switchL));
  return valUndefined();
};

const LOOP_TYPES = [ 'while', 'dowhile', 'for', 'forof', 'forin' ];
const getNearestLoop = (types = [ ...LOOP_TYPES, 'switch', 'switch_typeswitch' ]) => {
  for (let i = depth.length - 1; i >= 0; i--) {
    if (types.includes(depth[i].type)) return depth[i];
  }

  return null;
};

let pendingLabels = [];
const consumePendingLabels = (scope, d) => {
  if (pendingLabels.length === 0) return;
  scope.labels ??= new Map();
  for (const name of pendingLabels) scope.labels.set(name, d);
  pendingLabels = [];
};

const generateBreak = (scope, decl) => {
  const target = decl.label ? scope.labels.get(decl.label.name) : getNearestLoop();
  const fin = finallyCrossing(scope, target);
  if (fin) {
    finallyExit(scope, fin, fin.exits.push(() => generateBreak(scope, decl)));
    return valUndefined();
  }
  stmt(scope, Break(target.brk));
  return valUndefined();
};

const generateContinue = (scope, decl) => {
  const target = decl.label ? scope.labels.get(decl.label.name) : getNearestLoop(LOOP_TYPES);
  const fin = finallyCrossing(scope, target);
  if (fin) {
    finallyExit(scope, fin, fin.exits.push(() => generateContinue(scope, decl)));
    return valUndefined();
  }
  stmt(scope, target.contViaBreak ? Break(target.cont) : Continue(target.cont));
  return valUndefined();
};

const LOOP_STMTS = [ 'ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement' ];
const generateLabel = (scope, decl) => {
  const name = decl.label.name;

  if (LOOP_STMTS.includes(decl.body.type)) {
    pendingLabels.push(name);
    return generate(scope, decl.body);
  }

  const brk = fresh(scope);
  const d = { type: 'label', brk, cont: null };
  (scope.labels ??= new Map()).set(name, d);
  depth.push(d);
  const body = collect(scope, () => genStmt(scope, decl.body));
  depth.pop();
  stmt(scope, BlockStmt(body, brk));
  return valUndefined();
};

const generateThrow = (scope, decl) => {
  // precompile: `throw new SomeError('literal')` lowers to a pattern throw (no error object), same shape as ThrowNew
  if (globalThis.precompile && decl.argument.callee != null) {
    let constructor = decl.argument.callee.name;
    if (constructor && constructor.startsWith('__')) constructor = constructor.split('_').pop();

    const arg = decl.argument.arguments[0];
    if (constructor && (arg == null || arg.value != null)) {
      const message = arg == null ? '' : String(arg.value);
      const msg = message
        ? dataRef(unitOf(scope), `#msg:${message}`, [ ...i32Bytes(message.length), ...[...message].map(c => c.charCodeAt(0) & 0xff) ])
        : Const(T.u32, 0);
      stmt(scope, ThrowNew(TYPES[constructor.toLowerCase()] ?? TYPES.error, msg));
      return;
    }
  }

  stmt(scope, Throw(generate(scope, decl.argument)));
};

// exits inside a try with a finalizer record themselves in #fin_pend and jump to the finalizer, which then completes them
// #fin_pend is 0 for normal completion, else 1 + index into fin.exits
const FIN_THROW = 1, FIN_RETURN = 2;
const finallyCrossing = (scope, target) => {
  const fin = scope.finallyStack?.[scope.finallyStack.length - 1];
  return fin && depth.indexOf(target) < fin.depthIndex ? fin : null;
};
const finallyExit = (scope, fin, kind) => {
  fin.taken.add(kind);
  assign(scope, Local(fin.pend, T.i32), Const(T.i32, kind));
  stmt(scope, Break(fin.brk));
};

const generateTry = (scope, decl) => {
  const fin = decl.finalizer ? finallyStart(scope) : null;
  const tryBody = collect(scope, () => genStmt(scope, decl.block));

  let protectedStmts;
  if (decl.handler) {
    const tmpName = '#catch_tmp' + (scope.catchId = (scope.catchId ?? 0) + 1);
    allocVar(scope, tmpName);
    const param = decl.handler.param;
    const catchBody = collect(scope, () => {
      if (scope.generator) emitIf(scope, Bin('==', T.jsval, Local(tmpName, T.jsval), JvConst(TYPES.__porffor_generator, 0)),
        () => stmt(scope, Throw(Local(tmpName, T.jsval))));
      if (param) generateVarDstr(scope, 'let', param, { type: 'Identifier', name: tmpName }, undefined, false);
      genStmt(scope, decl.handler.body);
    });
    protectedStmts = [ Try(tryBody, tmpName, catchBody) ];
  } else protectedStmts = tryBody;

  if (!fin) {
    for (const s of protectedStmts) stmt(scope, s);
    return;
  }

  // a finally block's value never completes the try
  finallyEnd(scope, fin, protectedStmts, () => {
    const inEval = scope.inEval;
    scope.inEval = null;
    genStmt(scope, decl.finalizer);
    scope.inEval = inEval;
  });
};

// exits generated between finallyStart and finallyEnd run the finalizer first
const finallyStart = scope => {
  const id = scope.catchId = (scope.catchId ?? 0) + 1;
  const fin = { brk: fresh(scope), pend: '#fin_pend' + id, val: '#fin_val' + id, catchName: '#catch_tmp' + id, depthIndex: depth.length, taken: new Set() };
  fin.exits = [
    () => stmt(scope, Throw(Local(fin.val, T.jsval))),
    () => generateReturn(scope, { type: 'ReturnStatement', argument: scope.retType === T.none ? null : identNode(fin.val) })
  ];
  allocVar(scope, fin.pend, false, T.i32);
  allocVar(scope, fin.val);
  assign(scope, Local(fin.pend, T.i32), Const(T.i32, 0));
  (scope.finallyStack ??= []).push(fin);
  return fin;
};

const finallyEnd = (scope, fin, protectedStmts, finalize, catchThrows = true) => {
  scope.finallyStack.pop();

  // anything thrown out of the protected region is held while the finalizer runs
  if (catchThrows) {
    allocVar(scope, fin.catchName);
    const catchAll = collect(scope, () => {
      assign(scope, Local(fin.val, T.jsval), Local(fin.catchName, T.jsval));
      assign(scope, Local(fin.pend, T.i32), Const(T.i32, FIN_THROW));
    });
    protectedStmts = [ Try(protectedStmts, fin.catchName, catchAll) ];
    fin.taken.add(FIN_THROW);
  }
  stmt(scope, BlockStmt(protectedStmts, fin.brk));

  finalize();

  let code = 1;
  for (const exit of fin.exits) {
    if (fin.taken.has(code)) emitIf(scope, Bin('==', T.i32, Local(fin.pend, T.i32), Const(T.i32, code)), exit);
    code++;
  }
};

const generateMeta = (scope, decl) => {
  if (decl.meta.name === 'new' && decl.property.name === 'target') {
    // new.target: the hidden #newtarget param (the constructor when invoked via `new`)
    if (decl._undefined) return valUndefined();
    if (decl._binding) return generate(scope, decl._binding);
    if (scope.constr) return Local('#newtarget', T.jsval);

    // todo: access upper-scoped new.target
    return valUndefined();
  }

  // todo: import.meta
  return internalThrow(scope, 'Error', `porffor: meta property ${decl.meta.name}.${decl.property.name} is not supported yet`);
};

const printStaticStr = (scope, str) => {
  if (str.length === 0) return [];
  let literal = '';
  for (let i = 0; i < str.length; i++) literal += '\\' + str.charCodeAt(i).toString(8).padStart(3, '0');
  return [ RawC(`printf("%.*s", ${str.length}, "${literal}")`) ];
};

const byteStringable = str => {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0xFF) return false;
  }

  return true;
};

// big regexp unicode tables and v-mode classes are only linked in when some string could name them / be v flags
const regexTableUses = [ [ /sc=|scx=|Script/, '__Porffor_regex_ucdScUsed' ], [ /Emoji/, '__Porffor_regex_ucdStrsUsed' ], [ /^[dgimsuy]*v[dgimsuyv]*$/, '__Porffor_regex_vUsed' ] ];

const makeString = (scope, str, bytestring = true) => {
  if (!globalThis.precompile) for (const [ re, marker ] of regexTableUses) {
    if (!(marker in funcIndex) && re.test(str)) includeBuiltin(scope, marker);
  }
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) > 0xFF) { bytestring = false; break; }
  typeUsed(scope, bytestring ? TYPES.bytestring : TYPES.string);

  if (str.length === 0) return valOf(Const(T.u32, 0), bytestring ? TYPES.bytestring : TYPES.string);

  const bytes = [ ...i32Bytes(str.length) ];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    bytes.push(c & 0xff);
    if (!bytestring) bytes.push((c >>> 8) & 0xff);
  }

  return valOf(dataRef(unitOf(scope), `#str:${bytestring ? 'b' : 's'}:${str}`, bytes), bytestring ? TYPES.bytestring : TYPES.string);
};

const generateArray = (scope, decl, name = '$undeclared', staticAlloc = false) => {
  const elements = decl.elements;
  const length = elements.length;
  const capacity = Math.max(length, 2);

  const allocSize = 16 + capacity * 8;

  let pointer;
  const isStatic = staticAlloc || decl._staticAlloc;
  if (isStatic) {
    const uniqueName = name === '$undeclared' ? name + uniqId(scope) : name;
    pointer = dataRef(unitOf(scope), `#staticarr:${uniqueName}`, new Array(allocSize).fill(0));
  } else {
    pointer = reuse(scope, Alloc(Const(T.i32, allocSize), TYPES.array));
  }

  stmt(scope, LenSet(pointer, Const(T.i32, 0)));
  stmt(scope, Store('u32', pointer, 4, Bin('+', T.u32, pointer, Const(T.u32, 16))));
  stmt(scope, Store('i32', pointer, 8, Const(T.i32, capacity)));
  if (!isStatic) stmt(scope, Store('i32', pointer, 12, Const(T.i32, 0)));
  if (!isStatic) stmt(scope, MemFill(Bin('+', T.u32, pointer, Const(T.u32, 16)), Const(T.i32, 0), Const(T.i32, capacity * 8)));

  // fast path: store leading non-spread elements straight into their slots (a jsval each)
  let i = 0;
  for (; i < length; i++) {
    if (elements[i] == null) continue;
    if (elements[i].type === 'SpreadElement') break;

    const value = elements[i].type === 'Literal' && typeof elements[i].value === 'number'
      ? valNum(elements[i].value)
      : generate(scope, elements[i]);
    stmt(scope, ArrSet(pointer, Const(T.u32, i), value));
  }

  // direct length = number of leading elements stored
  stmt(scope, LenSet(pointer, Const(T.i32, i)));

  // a collection during element evaluation can sticky-promote this fresh array to old,
  // raw stores of young pointers into it must then be remembered, so flag it to the GC
  // once after construction. skipped for static arrays / all-non-reference entries, no-op sans GC
  if (!isStatic && i > 0 &&
      elements.slice(0, i).some(x => {
        if (x == null) return false;
        if (x.type === 'Literal' && typeof x.value === 'number') return false;
        const known = knownType(scope, getNodeType(scope, x));
        return known !== TYPES.number && known !== TYPES.boolean && known !== TYPES.undefined;
      })) {
    stmt(scope, GcBarrier(pointer, Const(T.i32, TYPES.array)));
  }

  for (; i < length; i++) {
    if (elements[i] == null) {
      stmt(scope, ArrLenSet(pointer, Bin('+', T.i32, LenGet(pointer), Const(T.i32, 1))));
      continue;
    }

    const element = elements[i];
    if (element.type === 'SpreadElement') {
      exprStmt(scope, builtinCall(scope, '__Porffor_array_spread', [ valOf(pointer, TYPES.array), generate(scope, element.argument) ]));
      continue;
    }

    const push = includeBuiltin(scope, '__Array_prototype_push');
    exprStmt(scope, Call(push.index, buildDirectArgs(scope, decl, push, [ generate(scope, element) ], null, valOf(pointer, TYPES.array)), push.retType ?? T.jsval));
  }

  typeUsed(scope, TYPES.array);
  return valOf(pointer, TYPES.array);
};

// only computed keys need ToPropertyKey, static ones already are keys
const toPropertyKey = (scope, key, computed = false) =>
  computed ? builtinCall(scope, '__ecma262_ToPropertyKey', [ key[N_TYPE] === T.jsval ? key : valNumber(key) ]) : key;

// views on resizable buffers have length -1 and compute it from their buffer
const typedArrayLength = (scope, obj, slow = '__Porffor_typedArray_length') => {
  const len = reuse(scope, LenGet(JvPtr(obj)));
  return Select(Bin('==', T.i32, len, Const(T.i32, -1)), builtinCall(scope, slow, [ obj ], T.i32), len);
};

const typedArrayElements = {
  [TYPES.uint8array]: [ 'u8', 1, false ],
  [TYPES.uint8clampedarray]: [ 'u8', 1, false ],
  [TYPES.int8array]: [ 'i8', 1, true ],
  [TYPES.uint16array]: [ 'u16', 2, false ],
  [TYPES.int16array]: [ 'i16', 2, true ],
  [TYPES.uint32array]: [ 'u32', 4, false ],
  [TYPES.int32array]: [ 'i32', 4, true ],
  [TYPES.float32array]: [ 'f32', 4, true ],
  [TYPES.float64array]: [ 'f64', 8, true ],
  [TYPES.bigint64array]: [ 'i64', 8, true ],
  [TYPES.biguint64array]: [ 'i64', 8, false ]
};

const typedArrayElementAddr = (obj, idx, size) =>
  Bin('+', T.u32, Load('u32', JvPtr(obj), 4), size === 1 ? idx : Bin('*', T.u32, idx, Const(T.u32, size)));

// stores also need a writable (not immutable) buffer
const typedArrayIndex = (scope, obj, prop, write = false) => {
  const num = reuse(scope, numValue(prop));
  const idx = reuse(scope, Convert(T.u32, num, 0));
  return {
    idx,
    valid: Bin('&&', T.i32,
      Bin('==', T.i32, num, Convert(T.f64, idx, 0)),
      Bin('<', T.u32, idx, Convert(T.u32, typedArrayLength(scope, obj, write ? '__Porffor_typedArray_writeLength' : '__Porffor_typedArray_length'))))
  };
};

// idx must be in bounds
const typedArrayLoad = (scope, obj, idx, t) => {
  const [ ctype, size, signed ] = typedArrayElements[t];
  const loaded = Load(ctype, typedArrayElementAddr(obj, idx, size), 4);
  const big = ctype === 'i64' ? builtinCall(scope, signed ? '__Porffor_bigint_fromS64' : '__Porffor_bigint_fromU64', [ loaded ]) : null;
  return big
    ? (big[N_TYPE] === T.jsval ? big : Box(big, Const(T.i32, TYPES.bigint)))
    : Box(ctype === 'f32' || ctype === 'f64' ? loaded : Convert(T.f64, loaded, signed ? CONVERT_SIGNED : 0), Const(T.i32, TYPES.number));
};

const typedArrayGet = (scope, obj, prop, t) => {
  const { idx, valid } = typedArrayIndex(scope, obj, prop);
  const res = tmp(scope, T.jsval);
  emitIf(scope, valid, () => assign(scope, res, typedArrayLoad(scope, obj, idx, t)), () => assign(scope, res, valUndefined()));
  return res;
};

const typedArraySet = (scope, obj, prop, t, v) => {
  const [ ctype, size ] = typedArrayElements[t];
  let n;
  if (ctype === 'i64') {
    n = reuse(scope, builtinCall(scope, '__ecma262_ToBigInt', [ v ]));
  } else if (isRawNum(v)) {
    n = reuse(scope, numValue(v));
  } else {
    n = tmp(scope, T.f64);
    emitIf(scope, JvIsNum(v),
      () => assign(scope, n, JvNum(v)),
      () => assign(scope, n, numValue(builtinCall(scope, '__ecma262_ToNumber', [ v ]))));
  }

  const { idx, valid } = typedArrayIndex(scope, obj, prop, true);
  emitIf(scope, valid, () => {
    const addr = reuse(scope, typedArrayElementAddr(obj, idx, size));
    let stored;
    if (ctype === 'i64') stored = builtinCall(scope, '__Porffor_bigint_toI64', [ n ]);
      else if (ctype === 'f32' || ctype === 'f64') stored = n;
      else if (t === TYPES.uint8clampedarray) stored = Convert(T.u32, Un('nearest', T.f64, Bin('min', T.f64, n, Const(T.f64, 255))), 0);
      else stored = toUint32(scope, n);
    stmt(scope, Store(ctype, addr, 4, stored));
  });
};

// array holes may be shadowed by underlying object accessors or inherited indexed props
const arrayIndexGet = (scope, ptr, idx) => {
  if (globalThis.precompile) return ArrGet(ptr, idx);

  // holes read as undefined, so only an undefined result needs the slow check
  const res = tmp(scope, T.jsval);
  assign(scope, res, ArrGet(ptr, idx));
  emitIf(scope, Bin('==', T.i32, JvType(res), Const(T.i32, TYPES.undefined)),
    () => emitIf(scope, Un('!', T.i32, Call('porf_arr_has_own', [ ptr, idx ], T.i32)),
      () => assign(scope, res, builtinCall(scope, '__Porffor_array_holeGet', [ Box(ptr, Const(T.i32, TYPES.array)), idx ]))));
  return res;
};

const denseArrayIndexKey = (scope, prop) => {
  const num = reuse(scope, numValue(prop));
  const idx = reuse(scope, Convert(T.u32, num, 0));
  return {
    idx,
    valid: Bin('&&', T.i32,
      Bin('==', T.i32, num, Convert(T.f64, idx, 0)),
      Bin('<=', T.i32, idx, Const(T.u32, 2147483646)))
  };
};

// anonymous functions under computed keys are named at runtime (SetFunctionName)
const nameByKey = (scope, value, key, computed, kind) => {
  if (!computed || !isFuncType(value.type) || value.id) return generate(scope, value);

  const fn = reuse(scope, generate(scope, value));
  exprStmt(scope, builtinCall(scope, '__Porffor_function_setName', [ fn, key, makeString(scope, kind === 'get' || kind === 'set' ? kind + ' ' : '') ]));
  return fn;
};

const generateObject = (scope, decl) => {
  const obj = reuse(scope, builtinCall(scope, '__Porffor_object_new', [ Const(T.i32, Math.max(decl.properties.length, 2)) ]));
  if (decl._home?._refs) writeBinding(scope, decl._home, obj, TYPES.object);
  const keys = new Set();
  let slot = 0;

  for (const x of decl.properties) {
    let { type, argument, computed, kind, value, method } = x;

    // accessors are method definitions too
    if (method || kind === 'get' || kind === 'set') {
      value._method = true;
      value._noGlobalThis = true;
    }

    if (type === 'SpreadElement') {
      slot = -1;
      exprStmt(scope, builtinCall(scope, '__Porffor_object_spread', [ obj, generate(scope, argument) ]));
      continue;
    }

    const key = getProperty(x, true);
    if (!computed && !x.shorthand && !method && kind === 'init' && key.value === '__proto__') {
      exprStmt(scope, builtinCall(scope, '__Porffor_object_setPrototype', [ obj, generate(scope, value) ]));
      continue;
    }

    if (isFuncType(value.type)) {
      let id = value.id;
      let noFuncIndex = false;

      // todo: support computed names properly
      if (typeof key.value === 'string' && !id) {
        id = { type: 'Identifier', name: kind === 'get' || kind === 'set' ? `${kind} ${key.value}` : key.value };
        noFuncIndex = true;
      }

      // keep closure owner identity for semantic capture resolution
      value = { ...value, id, _noFuncIndex: noFuncIndex, _closureSource: value._closureSource ?? value };
    }

    const hash = slot >= 0 && !computed && kind === 'init' && !keys.has(key.value)
      ? ctHash({ property: { name: key.value } }) : null;
    if (hash != null) {
      keys.add(key.value);
      const prop = reuse(scope, generate(scope, key));
      const val = reuse(scope, coerceValue(generate(scope, value), T.jsval));
      const entries = Load('u32', JvPtr(obj), 12);
      stmt(scope, Store('i32', entries, slot * 20, Const(T.i32, hash)));
      stmt(scope, Store('u32', entries, slot * 20 + 4, JvPtr(prop)));
      stmt(scope, Store('f64', entries, slot * 20 + 8, JvNum(val), true));
      stmt(scope, Store('u8', entries, slot * 20 + 16, Const(T.i32, 14)));
      stmt(scope, Store('u8', entries, slot * 20 + 17, JvType(val)));
      stmt(scope, Store('u8', entries, slot * 20 + 18, JvType(prop)));
      stmt(scope, Store('u16', JvPtr(obj), 0, Const(T.i32, ++slot)));
      stmt(scope, If(canReferenceCheck(scope, val), [ GcBarrier(JvPtr(obj), Const(T.i32, TYPES.object)) ]));
    } else {
      slot = -1;
      const k = reuse(scope, toPropertyKey(scope, generate(scope, key), computed));
      exprStmt(scope, builtinCall(scope, `__Porffor_object_expr_${kind}`, [ obj, k, nameByKey(scope, value, k, computed, kind) ]));
    }
  }

  typeUsed(scope, TYPES.object);
  return obj;
};

let memberDemands, globalDemands;
// values that can be the global object: globalThis, this, a param such as (function (global) {})(this)
const mayBeGlobal = node => node?.type === 'ThisExpression' || node?.name === 'globalThis' || !!node?._resolvedVariable?.node._param ||
  (node?.type === 'Identifier' && mayBeGlobal(node._resolvedVariable?.node._declarator?.init));

// precompiled builtins keep theirs, demanded once they are included
const demandMemberRead = (scope, decl) => {
  const propName = decl.computed
    ? (decl.property.type === 'Literal' && typeof decl.property.value === 'string' ? decl.property.value
      : decl.property.name?.startsWith('__Symbol_') ? decl.property.name.slice(2) : null)
    : decl.property.name;
  if (!propName || propName === '__proto__') return null;
  if (globalThis.precompile) (scope.memberReads ??= new Set()).add(propName);
    else memberDemands.add(propName);
  if (!globalThis.precompile && !propName.startsWith('__') && mayBeGlobal(decl.object)) globalDemands.add(propName);
  return propName;
};

// %Iterator.prototype% members are only included for reads on possible iterators
let iteratorDemands;
const mayBeIterator = known => known == null || known === TYPES.proxy || iteratorProtoTypes.includes(known);

const primObjAlias = {
  [TYPES.boolean]: TYPES.booleanobject,
  [TYPES.number]: TYPES.numberobject,
  [TYPES.string]: TYPES.stringobject,
  [TYPES.bytestring]: TYPES.stringobject
};

const resolveMemberDemands = scope => {
  // builtin iterators are iterated generically without member reads, generators only by helpers or a reachable prototype
  for (const t of [ TYPES.__porffor_generator, TYPES.__porffor_asyncgenerator, ...ITERATOR_TYPES ]) {
    const getter = '#get_' + TYPE_NAMES[t] + '_prototype';
    if (!usedTypes.has(t) || !(getter in builtinFuncs)) continue;
    if (t === TYPES.__porffor_asyncgenerator) {
      if (funcIndex[getter] != null) fullPrototypes.add(getter);
      continue;
    }
    if (t === TYPES.__porffor_generator && funcIndex['__Porffor_iterator_direct'] == null && funcIndex[getter] == null) continue;

    fullPrototypes.add(getter);
    includeBuiltin(scope, getter);
    includeBuiltin(scope, '__Iterator_prototype_Symbol_iterator');
  }

  // globals read off a materialized globalThis
  if (funcIndex['#get_globalThis'] != null) for (const propName of globalDemands) {
    if (('#get_' + propName) in builtinFuncs) includeBuiltin(scope, '#get_' + propName);
      else if (propName in builtinFuncs) includeBuiltin(scope, propName);
  }

  for (const propName of memberDemands) {
    for (const x of builtinStaticFuncs.get(propName) ?? []) {
      if (funcIndex['#get_' + x.slice(2, x.indexOf('_', 2))] != null) includeBuiltin(scope, x);
    }

    const getterOnly = propName === 'constructor';
    for (const x of getterOnly ? builtinPrototypeObjectGetters.values() : [ ...(builtinPrototypeFuncs.get(propName) ?? []), ...(builtinPrototypeGetters.get(propName) ?? []) ]) {
      const tn = getterOnly ? x.slice(7, -'_prototype'.length) : protoOwnerOf(x);
      if (getterOnly && tn === 'TypedArray') continue;

      // any object can inherit from %Iterator.prototype%
      if (tn === 'Iterator' && !getterOnly && !iteratorDemands.has(propName)) continue;
      const used = (inheritedProtoTypes[tn] ?? protoOwnerTypes(tn)).filter(t => usesAnyType([ t, primObjAlias[t] ]) || (t === TYPES.string && usedTypes.has(TYPES.bytestring)));
      if (used.length === 0) continue;
      includeBuiltin(scope, x);
      if (!getterOnly) {
        const getter = '#get___' + tn + '_prototype';
        if (getter in builtinFuncs) includeBuiltin(scope, getter);

        if (tn === 'TypedArray') for (const t of used) includeBuiltin(scope, '#get___' + TYPE_NAMES[t] + '_prototype');
      }
    }

    // error instances inherit name, message and Error.prototype methods through their own prototype
    if (propName === 'name' || propName === 'message' || propName === 'constructor' || (builtinPrototypeFuncs.get(propName) ?? []).some(x => protoOwnerOf(x) === 'Error')) {
      for (const t of ERROR_TYPES) {
        if (!usedTypes.has(t)) continue;
        includeBuiltin(scope, '#get___Error_prototype');
        includeBuiltin(scope, '#get___' + TYPE_NAMES[t] + '_prototype');
        if (propName === 'constructor') includeBuiltin(scope, TYPE_NAMES[t]);
      }
    }

    // accessors on included prototypes are reachable by generic gets, eg flags read by RegExp.prototype.flags
    for (const x of builtinPrototypeGetters.get(propName) ?? []) {
      if (funcIndex['#get___' + protoOwnerOf(x) + '_prototype'] != null) includeBuiltin(scope, x);
    }

    const shared = '__TypedArray_' + propName;
    if (shared in builtinFuncs && TYPED_ARRAY_TYPES.some(t => TYPE_NAMES[t] in funcIndex)) includeBuiltin(scope, shared);
  }
};

let icSites;

const generateMember = (scope, decl, objValue = null) => {
  const demanded = globalThis.precompile ? null : demandMemberRead(scope, decl);
  if (decl.object.type === 'Super') return generateSuperMember(scope, decl);
  // builtins unless reassigned via globalThis
  const globalName = decl.object.name === 'globalThis' && !decl.computed && decl.property.name;
  if (globalName && !globalName.startsWith('__') && globalName !== 'null' && globalName !== 'TypedArray' && !(globalName in globals)) {
    const v = builtinVars[globalName];
    if (v) return typeof v === 'function' ? v(scope, irBuiltinHelpers(scope, globalName, {})) : v;
    if (globalName in builtinFuncs) return materializeFunctionValue(scope, includeBuiltin(scope, globalName));
  }
  const closureSlot = decl._closureSlot;
  if (closureSlot != null) {
    const pointer = JvPtr(reuse(scope, objValue ?? generate(scope, decl.object)));
    if (closureSlot === 0) return valOf(Load('u32', pointer, 0), TYPES.__porffor_closureenv);
    return Box(Load('f64', pointer, 8 + (closureSlot - 1) * 16), Load('u8', pointer, 16 + (closureSlot - 1) * 16));
  }

  const object = decl.object;
  const property = getProperty(decl);

  let objectValue = objValue;
  if (!objectValue) {
    doNotMarkFuncRef = true;
    objectValue = generate(scope, object); // generate first so getNodeType sees the inferred type
    doNotMarkFuncRef = false;
  }

  const type = getNodeType(scope, object);
  const known = knownType(scope, type);
  // reads in builtins of unknown objects can reach any prototype
  if (globalThis.precompile && (known == null || known === TYPES.object)) demandMemberRead(scope, decl);
  if (demanded && mayBeIterator(known)) iteratorDemands.add(demanded);
  const propertyType = getNodeType(scope, property);
  const propertyKnown = knownType(scope, propertyType);
  const objectKnownValue = knownValue(scope, object);

  const obj = reuse(scope, objectValue);

  // a?.b / a?.[b] : a nullish base short-circuits the whole chain to undefined
  if (decl.optional) {
    emitIf(scope, nullish(scope, obj, known), () => {
      assign(scope, scope.chainRes, valUndefined());
      stmt(scope, Break(scope.chainLabel));
    });
  }

  if (decl.property.type === 'PrivateIdentifier') return privateGet(scope, decl.property, obj);

  const prop = reuse(scope, generate(scope, property));

  // builtin prototype getters dispatch to __X_prototype_NAME$get by the object's runtime type
  let extraBC = [];
  if (builtinPrototypeGets.includes(decl.property.name)) {
    const bc = [];
    const cands = builtinPrototypeGetters.get(decl.property.name) ?? [];
    for (const x of cands) {
      const types = protoOwnerTypes(protoOwnerOf(x));
      if (types.length === 0) continue;

      const getter = includeBuiltin(scope, x);
      const callGetter = recv => Call(getter.index, buildDirectArgs(scope, decl, getter, [], null, recv), getter.retType ?? T.jsval);

      if (types.includes(known)) return callGetter(obj);
      bc.push([ types, () => callGetter(obj) ]);
    }

    if (known == null) extraBC = bc;
  }

  const hash = ctHash(decl);

  const genericMemberGet = () => {
    const key = prop[N_TYPE] === T.jsval ? prop : valNumber(prop);
    if (hash == null) return builtinCall(scope, '__Porffor_object_get', [ obj, key ]);

    if (Prefs.ic && (known == null || known === TYPES.object)) {
      const unit = unitOf(scope);
      const ic = icSites[unit] ??= { site: 0, chunk: null };
      const index = ic.site++ % 256;
      if (index === 0)
        ic.chunk = dataSeg(unit, `#ic:${unit}:${ic.site}`, new Array(256).fill(i32Bytes(0x7fffffff)).flat());

      const chunk = DataRef(ic.chunk);
      const slot = index === 0 ? chunk : Bin('+', T.i32, chunk, Const(T.i32, index * 4));
      return builtinCall(scope, '__Porffor_object_get_ic', [ obj, key, Const(T.i32, hash), slot ]);
    }

    return builtinCall(scope, '__Porffor_object_get_withHash', [ obj, key, Const(T.i32, hash) ]);
  };

  const genericMemberGetBC = [
    ...extraBC,
    [ 'default', () => genericMemberGet() ]
  ];

  // -d: nullish errors include the property name
  if (Prefs.d) genericMemberGetBC.unshift(
    [ TYPES.undefined, () => internalThrow(scope, 'TypeError', propertyErrorMessage('read', 'undefined', decl)) ],
    [ TYPES.object, () => {
      emitIf(scope, Bin('==', T.i32, JvPtr(obj), Const(T.u32, 0)), () => internalThrow(scope, 'TypeError', propertyErrorMessage('read', 'null', decl)));
      return genericMemberGet();
    } ]);

  const lengthMemberGet = () => {
    const lengthVal = () => Box(Convert(T.f64, known != null && !TYPED_ARRAY_TYPES.includes(known) ? LenGet(JvPtr(obj)) : typedArrayLength(scope, obj)), Const(T.i32, TYPES.number));
    const arrayLengthVal = () => Box(Convert(T.f64, Load('u32', JvPtr(obj), 0)), Const(T.i32, TYPES.number));
    if (known === TYPES.array) return arrayLengthVal();
    if (Prefs.fastLength || (known != null && (known & TYPE_FLAGS.length) !== 0)) return lengthVal();
    if (known != null) return genericMemberGet();

    const res = tmp(scope, T.jsval);
    emitIf(scope, Bin('==', T.i32, JvType(obj), Const(T.i32, TYPES.array)),
      () => assign(scope, res, arrayLengthVal()),
      () => emitIf(scope, Bin('!=', T.i32, Bin('&', T.i32, JvType(obj), Const(T.i32, TYPE_FLAGS.length)), Const(T.i32, 0)),
        () => assign(scope, res, lengthVal()),
        () => assign(scope, res, genericMemberGet())));
    return res;
  };

  const indexedMemberGetBC = [
    [ TYPES.array, () => {
      const { idx, valid } = denseArrayIndexKey(scope, prop);
      const res = tmp(scope, T.jsval);
      emitIf(scope, valid,
        () => assign(scope, res, arrayIndexGet(scope, reuse(scope, JvPtr(obj)), idx)),
        () => assign(scope, res, genericMemberGet()));
      return res;
    } ],
    [ [ TYPES.string, TYPES.bytestring ], () => builtinCall(scope, '__Porffor_string_get', [ obj, prop ]) ],
    ...TYPED_ARRAY_TYPES.map(t => [ t, () => typedArrayGet(scope, obj, prop, t) ]),
    ...genericMemberGetBC
  ];

  if (!decl.optional && objectKnownValue === null)
    return internalThrow(scope, 'TypeError', propertyErrorMessage('read', 'null', decl));

  if (decl.property.name === 'length') return lengthMemberGet();

  if (decl.computed) return typeSwitch(scope, prop, propertyKnown, {
    [TYPES.number]: () => typeSwitch(scope, obj, known, indexedMemberGetBC),
    default: () => typeSwitch(scope, obj, known, genericMemberGetBC)
  });

  return typeSwitch(scope, obj, known, genericMemberGetBC);
};

const generateAwait = (scope, decl) =>
  awaitValue(scope, generate(scope, decl.argument));

const bindClassFieldInitializer = (node, owner, currentArrow = null, root = node) => {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'Identifier') {
    // captures of bindings declared inside the initializer stay within it
    if (node._closureFunc && !(node._closureFunc.start >= root.start && node._closureFunc.end <= root.end)) owner._closurePassThrough = true;
    return;
  }

  if (node.type === 'ThisExpression') {
    if (!currentArrow) return;
    node._closureThisFunc = owner;
    currentArrow._capturesThis = owner;
    owner._capturedThis = true;

    let cursor = currentArrow?._parentFunc;
    while (cursor && cursor !== owner) {
      cursor._closurePassThrough = true;
      cursor = cursor._parentFunc;
    }
    return;
  }

  if (node.type === 'ArrowFunctionExpression') {
    currentArrow = node;
  } else if (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ClassDeclaration' ||
    node.type === 'ClassExpression'
  ) {
    return;
  }

  if (node._evalParsed) bindClassFieldInitializer(node._evalParsed, owner, currentArrow, root);
  if (node._home) bindClassFieldInitializer(node._home, owner, currentArrow, root);

  for (const key in node) {
    if (key[0] === '_') continue;

    const value = node[key];
    if (value == null || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const item of value) bindClassFieldInitializer(item, owner, currentArrow, root);
      continue;
    }

    if (value.type) {
      bindClassFieldInitializer(value, owner, currentArrow, root);
    }
  }
};

const classHasDefinitionSideEffects = decl => {
  if (decl.superClass) return true;

  for (const x of decl.body.body) {
    if (x.type === 'StaticBlock') return true;
    if (x.computed) return true;
    if (x.type === 'PropertyDefinition' && x.static && x.value) return true;
  }

  return false;
};

const classSuperExpr = () => ({
  type: 'CallExpression',
  callee: { type: 'Identifier', name: '__Porffor_object_getPrototype' },
  arguments: [
    { type: 'Identifier', name: '#callee' }
  ]
});

const declareClass = (scope, decl) => {
  const expr = decl.type === 'ClassExpression';
  const name = decl.id.name;
  const body = decl.body.body;
  const root = { type: 'Identifier', name };

  const constructor = body.find(x => x.kind === 'constructor')?.value;
  const constructorDecl = {
    ...(constructor ?? (decl.superClass ? {
      type: 'FunctionExpression',
      params: [ { type: 'RestElement', argument: { type: 'Identifier', name: 'args' } } ],
      body: {
        type: 'ExpressionStatement',
        expression: {
          type: 'CallExpression',
          callee: { type: 'Super', _this: { type: 'ThisExpression', _noGlobalThis: true } },
          arguments: [ { type: 'SpreadElement', argument: { type: 'Identifier', name: 'args' } } ]
        }
      }
    } : {
      type: 'FunctionExpression',
      params: [],
      body: { type: 'BlockStatement', body: [] }
    })),
    id: root,
    strict: true,
    type: (!expr || decl._porfDefaultName) ? 'FunctionDeclaration' : 'FunctionExpression',
    _selfAware: !!decl.superClass,
    _onlyConstr: true,
    _subclass: !!decl.superClass,
    _superClassExpr: decl.superClass ? classSuperExpr() : null,
    _baseClassFieldInit: !decl.superClass && body.some(x => x.type === 'PropertyDefinition' && !x.static),
    ...(constructor ? { _closureSource: constructor } : {})
  };

  for (const x of body) {
    if (x.type === 'PropertyDefinition' && !x.static && x.value) {
      bindClassFieldInitializer(x.value, constructorDecl);
    }
  }
  for (const name in decl._privates) {
    const x = decl._privates[name];
    if (x.ctorMap) bindClassFieldInitializer(x.ctorMap, constructorDecl);
    if (x.ctorFn) bindClassFieldInitializer(x.ctorFn, constructorDecl);
  }

  const [ func ] = generateFunc(scope, constructorDecl);
  if (expr && name.includes('#')) func.jsName = name.split('#')[0];
  bindNamedFunction(scope, name, func);
  func.knownThisSlots = getKnownThisSlots(decl);
  decl._porfforFunc = func;
  return decl._classFunc = func;
};

const generateClass = (scope, decl) => {
  const expr = decl.type === 'ClassExpression';
  if (!expr && !classHasDefinitionSideEffects(decl) && (decl._refs ?? 0) === 0) {
    return valUndefined();
  }

  if (!decl.id) decl.id = { type: 'Identifier', name: anonymousName(decl) };
  const name = decl.id.name;
  const body = decl.body.body;
  const root = { type: 'Identifier', name };

  const privates = Object.values(decl._privates);

  // the constructor may read the home and private bindings, a class expression's is generated as it is declared
  const bindings = privates.flatMap(x => x.fn ? [ x.map, x.fn ] : [ x.map ]);
  if (decl._home._refs) bindings.push(decl._home);
  for (const x of bindings) allocVar(scope, x.name, x._variable.func.type === 'Program');
  const func = decl._classFunc ?? declareClass(scope, decl);
  func.generate();

  const classRoot = reuseNamed(scope, decl._writes ? generate(scope, root) : materializeFunctionValue(scope, func));
  const rootIdent = { type: 'Identifier', name: classRoot[N_A] };

  const classProto = reuse(scope, generate(scope, getObjProp(rootIdent, 'prototype')));

  if (decl._home._refs) writeBinding(scope, decl._home, classRoot, TYPES.function);
  for (const x of privates) writeBinding(scope, x.map, builtinCall(scope, '__Porffor_private_new', []), TYPES.weakmap);

  // wire constructor + prototype chains to the superclass, null superclass included
  if (decl.superClass) {
    const sup = reuseNamed(scope, generate(scope, decl.superClass));
    const supIdent = { type: 'Identifier', name: sup[N_A] };

    emitIf(scope, Bin('&&', T.i32, Bin('==', T.i32, JvType(sup), Const(T.i32, TYPES.object)), Un('!', T.i32, JvTruthy(sup))),
      () => exprStmt(scope, builtinCall(scope, '__Porffor_object_setPrototype', [ classProto, valNull() ])),
      () => {
        emitIf(scope, JvFalsy(builtinCall(scope, '__ecma262_IsConstructor', [ sup ])),
          () => internalThrow(scope, 'TypeError', 'Class extends value is not a constructor or null'));
        const supProto = reuse(scope, generate(scope, getObjProp(supIdent, 'prototype')));
        emitIf(scope, JvFalsy(builtinCall(scope, '__Porffor_object_isObjectOrNull', [ supProto ])),
          () => internalThrow(scope, 'TypeError', 'Class extends value does not have a valid prototype'));
        exprStmt(scope, builtinCall(scope, '__Porffor_object_setPrototype', [ classRoot, sup ]));
        exprStmt(scope, builtinCall(scope, '__Porffor_object_setPrototype', [ classProto, supProto ]));
      });
  }

  exprStmt(scope, builtinCall(scope, '__Porffor_object_define', [ classRoot, makeString(scope, 'prototype'), classProto, Const(T.i32, 0) ]));

  // `this` in the (static) class body refers to the class itself
  scope.overrideThis = root;

  const elementValue = (x, value) => {
    if (x.type === 'MethodDefinition') { value._method = true; value._noGlobalThis = true; }
    if (!isFuncType(value.type)) return value;

    const name = x.key.type === 'PrivateIdentifier' ? '#' + x.key.name : !x.computed ? getProperty(x, true).value : null;
    let id = value.id;
    let noFuncIndex = false;
    if (typeof name === 'string' && !id) { id = { type: 'Identifier', name: x.kind === 'get' || x.kind === 'set' ? `${x.kind} ${name}` : name }; noFuncIndex = true; }
    // private names start with # which internal names reserve
    const jsName = x.key.type === 'PrivateIdentifier' && !value.id ? id.name : undefined;
    return { ...value, id, _noFuncIndex: noFuncIndex, strict: true, _noGlobalThis: true, _jsName: jsName, _closureSource: value._closureSource ?? value };
  };

  // private methods: static ones on the class, instance ones via the constructor
  const privateMethods = Object.create(null);
  for (const x of body) {
    if (x.type !== 'MethodDefinition' || x.key.type !== 'PrivateIdentifier') continue;

    const fn = elementValue(x, x.value);
    if (x.kind === 'method') privateMethods[x.key.name] = fn;
      else (privateMethods[x.key.name] ??= { type: 'ArrayExpression', elements: [ DEFAULT_VALUE, DEFAULT_VALUE ] }).elements[x.kind === 'get' ? 0 : 1] = fn;
  }
  for (const name in privateMethods) {
    const x = decl._privates[name];
    const value = generate(scope, privateMethods[name]);
    if (x.static) exprStmt(scope, builtinCall(scope, '__Porffor_private_add', [ generate(scope, identNode(x.map.name)), classRoot, value ]));
      else writeBinding(scope, x.fn, value);
  }

  const fieldInits = [];
  const addToThis = (x, value) => fieldInits.push(...collect(func, () => exprStmt(func, builtinCall(func, '__Porffor_private_add', [
    generate(func, x.ctorMap), generate(func, { type: 'ThisExpression', _noGlobalThis: true }), generate(func, value) ]))));
  for (const x of privates) if (x.ctorFn) addToThis(x, x.ctorFn);

  for (const x of body) {
    let { type, value, kind, static: _static, computed } = x;
    if (kind === 'constructor') continue;

    if (type === 'StaticBlock') {
      genStmt(scope, { type: 'BlockStatement', body: x.body });
      continue;
    }

    if (type === 'MethodDefinition' && x.key.type === 'PrivateIdentifier') continue;

    value ??= { type: 'Identifier', name: 'undefined' };
    if (type === 'PropertyDefinition' && !_static) bindClassFieldInitializer(value, func.ast);
    value = elementValue(x, value);

    if (x.key.type === 'PrivateIdentifier') {
      const priv = decl._privates[x.key.name];
      if (_static) exprStmt(scope, builtinCall(scope, '__Porffor_private_add', [ generate(scope, identNode(priv.map.name)), classRoot, generate(scope, value) ]));
        else addToThis(priv, value);
      continue;
    }

    const key = getProperty(x, true);
    if (type === 'PropertyDefinition' && !_static) {
      let keyNode;
      if (computed) {
        const keyGlobal = `#class_computed_prop${scope.start ?? scope.index}` + uniqId(scope);
        allocVar(scope, keyGlobal, true);
        assign(scope, Global(keyGlobal, T.jsval), toPropertyKey(scope, generate(scope, key), true));
        keyNode = () => Global(keyGlobal, T.jsval);
      } else keyNode = () => generate(func, key);

      fieldInits.push(...collect(func, () => {
        const k = keyNode();
        exprStmt(func, builtinCall(func, '__Porffor_object_class_value', [
          generate(func, { type: 'ThisExpression', _noGlobalThis: true }), k, nameByKey(func, value, k, computed, kind) ]));
      }));
    } else {
      let initKind = type === 'MethodDefinition' ? 'method' : 'value';
      if (kind === 'get' || kind === 'set') initKind = kind;

      const k = reuse(scope, toPropertyKey(scope, generate(scope, key), computed));
      exprStmt(scope, builtinCall(scope, `__Porffor_object_class_${initKind}`, [ _static ? classRoot : classProto, k, nameByKey(scope, value, k, computed, kind) ]));
    }
  }

  delete scope.overrideThis;

  // the constructor must be invoked via `new`; field initialisers run after super() in a
  // subclass (at the marker generateCall left), else at the top of the body
  const guard = collect(func, () => emitIf(func, Un('!', T.i32, JvTruthy(Local('#newtarget', T.jsval))),
    () => internalThrow(func, 'TypeError', `Class constructor ${unhackName(name)} requires 'new'`)));
  const markerIdx = func.body.indexOf(CLASS_FIELD_INIT_MARKER);
  if (markerIdx !== -1) func.body.splice(markerIdx, 1, ...fieldInits);
  else func.body.unshift(...fieldInits);
  func.body.unshift(...guard);

  if (!expr && scope.closureOwnLocals?.[name]) mirrorToClosureEnv(scope, name);

  return expr ? classRoot : valUndefined();
};

const generateTemplate = (scope, decl) => {
  const parts = [];
  const { expressions, quasis } = decl;
  for (let i = 0; i < quasis.length; i++) {
    const value = quasis[i].value.cooked;
    if (!byteStringable(value)) decl._type = TYPES.string;
    parts.push({ type: 'Literal', value });

    // substitutions use ToString, not the ToPrimitive of +
    if (i < expressions.length) {
      const t = knownType(scope, getNodeType(scope, expressions[i]));
      const primitive = t === TYPES.number || t === TYPES.boolean || t === TYPES.undefined || t === TYPES.bigint || t === TYPES.string || t === TYPES.bytestring;
      parts.push(primitive ? expressions[i] : { type: 'CallExpression', callee: identNode('__ecma262_ToString'), arguments: [ expressions[i] ] });
    }
  }

  // balanced so big templates copy each part log(n) times, not n
  const concat = (start, end) => {
    if (end - start === 1) return generate(scope, parts[start]);

    const mid = (start + end) >> 1;
    const left = snapshot(scope, concat(start, mid));
    return builtinCall(scope, '__Porffor_concatStrings', [ left, concat(mid, end) ]);
  };

  return concat(0, parts.length);
};

const generateTaggedTemplate = (scope, decl) => {
  const isRawCDefinitionBlock = str => /^\s*(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s+)+(?:\*\s*)?[A-Za-z_][A-Za-z0-9_]*\s*\([^;]*\)\s*\{/.test(str);
  const intrinsics = {
    __proto__: null,

    __Porffor_c: str => {
      if (Prefs.safe) throw new Error('Porffor.c is not allowed in --safe');
      if (scope.topLevel || isRawCDefinitionBlock(str)) {
        rawHead.push(str);
        return valUndefined();
      }
      stmt(scope, RawC(str, false));
      return valUndefined();
    },

    __Porffor_bs: str => makeString(scope, str, true),
    __Porffor_s: str => makeString(scope, str, false)
  };

  const { quasis, expressions } = decl.quasi;
  if (decl.tag.name in intrinsics) {
    let str = quasis[0].value.raw;

    for (let i = 0; i < expressions.length; i++) {
      const e = expressions[i];
      if (!e.name) {
        if (e.type === 'BinaryExpression' && e.operator === '+' && e.left.type === 'Identifier' && e.right.type === 'Literal') {
          str += lookupName(scope, e.left.name)[0].idx + e.right.value;
        }
      } else str += lookupName(scope, e.name)[0].idx;

      str += quasis[i + 1].value.raw;
    }

    return intrinsics[decl.tag.name](str);
  }

  const strings = reuseNamed(scope, generate(scope, {
    type: 'ArrayExpression',
    elements: quasis.map(x => ({ type: 'Literal', value: x.value.cooked }))
  }));

  const tmpIdent = { type: 'Identifier', name: strings[N_A], _type: TYPES.array };
  exprStmt(scope, generate(scope, setObjProp(tmpIdent, 'raw', {
    type: 'ArrayExpression',
    elements: quasis.map(x => ({ type: 'Literal', value: x.value.raw }))
  })));

  return generate(scope, {
    type: 'CallExpression',
    callee: decl.tag,
    arguments: [ tmpIdent, ...expressions ]
  });
};

// anonymous functions are named by source position so a unit's text is stable
let anonymousId = 0;
const anonymousName = decl => globalThis.precompile || decl.start == null ? `#${globalThis.precompile ? 'builtin_' : ''}anonymous${anonymousId++}` : `#anonymous_${decl.start}`;
const uniqId = scope => '_' + (scope.uniqId = (scope.uniqId ?? 0) + 1);
let objectHackers = [], allObjectHackers = [];
// builtin members the program writes (eg RegExp.prototype.exec = f) stay real member accesses
let objectHackAssigned = new Set();

// without bigint literals or these names no BigInt can exist, so untyped values need no BigInt dispatch
let mayHaveBigInt = true;
const BIGINT_NAMES = new Set([ 'BigInt', 'BigInt64Array', 'BigUint64Array', 'getBigInt64', 'getBigUint64' ]);
const usesBigInt = node => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(usesBigInt);
  if (node.type === 'Literal') return node.bigint != null || BIGINT_NAMES.has(node.value);
  if (node.type === 'Identifier') return BIGINT_NAMES.has(node.name);
  // new Function sources are only parsed while generating
  if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.callee.name === 'Function' &&
    node.arguments.some(x => /\d[\d_]*n\b/.test(x.value ?? x.quasis?.map(q => q.value.cooked).join('') ?? ''))) return true;
  if (node._evalParsed && usesBigInt(node._evalParsed)) return true;
  for (const k in node) if (k[0] !== '_' && k !== 'start' && k !== 'end' && usesBigInt(node[k])) return true;
  return false;
};

// specialize literal-arg calls to functions whose new Function sources use their params
const specializeFunctionSources = program => {
  const find = (node, f, out = []) => {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
      for (const x of node) find(x, f, out);
      return out;
    }
    if (f(node)) out.push(node);
    for (const k in node) if (k[0] !== '_') find(node[k], f, out);
    return out;
  };

  const funcs = new Map();
  for (const x of program.body) {
    if (x.type !== 'FunctionDeclaration' || !x.params.every(p => p.type === 'Identifier')) continue;
    const names = x.params.map(p => p.name);
    // only names that are nothing but this declaration and its direct calls
    if (find(program, n => n.name === x.id.name).length !== find(program, n => n.type === 'CallExpression' && n.callee.name === x.id.name).length + 1) continue;
    if (find(x.body, n => (n.type === 'CallExpression' || n.type === 'NewExpression') && n.callee.name === 'Function').length > 0 &&
      find(x.body, n => n.name === 'arguments' || names.includes(n.type === 'AssignmentExpression' ? n.left.name : n.type === 'UpdateExpression' && n.argument.name)).length === 0) funcs.set(x.id.name, x);
  }

  for (const call of find(program, n => n.type === 'CallExpression' && funcs.has(n.callee.name))) {
    const func = funcs.get(call.callee.name);
    if (call.arguments.length !== func.params.length || !call.arguments.every(x => x.type === 'Literal')) continue;
    call.callee = { ...structuredClone(func), type: 'FunctionExpression', id: null, params: [] };
    call.callee.body.body.unshift({ type: 'VariableDeclaration', kind: 'const', declarations: func.params.map((p, i) => ({ type: 'VariableDeclarator', id: identNode(p.name), init: call.arguments[i] })) });
    call.arguments = [];
  }
};

// property names the program may define (keys, uncalled members, strings), so builtin method calls know what can shadow them
let definedKeys = new Set();
const collectDefinedKeys = program => {
  const out = new Set();
  const walk = (node, called = false) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (node.type === 'Literal' && typeof node.value === 'string') out.add(node.value);
    if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern' && !globalThis.precompile && mayBeGlobal(node.init))
      for (const x of node.id.properties) if (x.key?.name) globalDemands.add(x.key.name);
    if (node.type === 'CallExpression' && !globalThis.precompile && mayBeGlobal(node.arguments[0]))
      for (const x of node.arguments) if (typeof x.value === 'string') globalDemands.add(x.value);
    // string keys passed after an object or listed in an array can name builtin members (verifyProperty(o, 'key'), for (const k of ['a', 'b']) o[k])
    if (node.type === 'CallExpression' && !globalThis.precompile && (node.arguments.length > 1 ? typeof node.arguments[0].value !== 'string' :
      node.callee.property?.name === 'hasOwnProperty' || node.callee.property?.name === 'propertyIsEnumerable'))
      for (const x of node.arguments) if (typeof x.value === 'string') memberDemands.add(x.value);
    if (node.type === 'ArrayExpression' && !globalThis.precompile)
      for (const x of node.elements) if (typeof x?.value === 'string') memberDemands.add(x.value);
    if (node.type === 'TemplateElement') out.add(node.value.cooked);
    // new Function sources are only parsed while generating
    if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.callee.name === 'Function')
      for (const x of node.arguments) for (const w of (x.value ?? x.quasis?.map(q => q.value.cooked).join('') ?? '').match?.(/[\w$]+/g) ?? []) out.add(w);
    if ((node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') && !node.computed) out.add(node.key.name ?? String(node.key.value));
    if (node.type === 'MemberExpression' && !node.computed && !called) out.add(node.property.name);
    // writes to Array.prototype[Symbol.iterator] make arrays iterate through it
    const target = node.type === 'AssignmentExpression' ? node.left : node.operator === 'delete' ? node.argument : null;
    if (target?.object?.name === '__Array_prototype' && target.property.name === '__Symbol_iterator') out.add('#arrayIterator');
    if (node.name === '__Symbol_hasInstance') out.add('#hasInstance');
    if (node._evalParsed) walk(node._evalParsed);
    for (const k in node) if (k[0] !== '_' && k !== 'start' && k !== 'end') walk(node[k], node.type === 'CallExpression' && k === 'callee');
  };
  walk(program);
  return out;
};

const assignedBuiltinMembers = program => {
  const out = new Set();
  const path = node => {
    if (node.type === 'Identifier') return node.name;
    if (node.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return null;
    const obj = path(node.object);
    return obj == null ? null : obj + '_' + node.property.name;
  };
  const add = target => {
    if (target?.type !== 'MemberExpression') return;
    const p = path(target);
    // builtins never read Math methods back, so writes to them can stay static globals (constants are read-only)
    if (p != null && p.includes('_') && !/^Math_[a-z]/.test(p)) out.add('__' + p);
  };
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (node.type === 'AssignmentExpression') add(node.left);
      else if (node.type === 'UpdateExpression') add(node.argument);
      else if (node.type === 'UnaryExpression' && node.operator === 'delete') add(node.argument);
    for (const k in node) if (k[0] !== '_' && k !== 'loc' && k !== 'range') walk(node[k]);
  };
  walk(program);
  return out;
};

const objectHack = node => {
  if (!node) return node;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = objectHack(node[i]);
    }
    return node;
  }

  if (node.type === 'MemberExpression') {
    return (() => {
      if (node.computed || node.optional || node.property.type === 'PrivateIdentifier') return;

      let objectName = node.object.name;
      if (node.object.object?.name === 'globalThis' && !node.object.computed) objectName = node.object.property.name;

      // block length/name: accessible on functions / need method receivers. 'call' passes:
      // the checks below only rewrite when a __X_call builtin exists (only Function.prototype.call)
      if (node.object.name !== 'Porffor' && (node.property.name === 'length' || node.property.name === 'name')) {
        return;
      }
      if (node.property.name === '__proto__') return;
      if (node.property.name === 'propertyIsEnumerable' || node.property.name === 'hasOwnProperty' || node.property.name === 'isPrototypeOf') return;

      if (node.object.type !== 'Identifier' && node.object.type !== 'MemberExpression') return;
      if (objectName && ['undefined', 'null', 'NaN', 'Infinity'].includes(objectName)) return;

      let objectOut;
      if (!objectName) {
        objectOut = objectHack(node.object);
        objectName = objectOut?.name?.slice?.(2);
      }
      if (!objectName || (!objectHackers.includes(objectName) && !objectHackers.some(x => objectName.startsWith(`${x}_`)))) return;

      const name = '__' + objectName + '_' + node.property.name;
      if (objectHackAssigned.has(name)) return;
      const inherited = '__TypedArray_' + node.property.name;
      if (TYPED_ARRAY_TYPES.some(t => TYPE_NAMES[t] === objectName) && hasFuncWithName(inherited)) return {
        type: 'Identifier',
        name: inherited,
        _builtinMember: true,
        _builtinThis: objectName
      };
      // accessors with a setter stay real member accesses, so assignments reach the setter
      if (!hasFuncWithName(name) && hasFuncWithName(name + '$set')) return;
      if ((!hasFuncWithName(name) && !(name in builtinVars) && !hasFuncWithName(name + '$get')) && (hasFuncWithName(objectName) || objectName in builtinVars || hasFuncWithName('__' + objectName) || ('__' + objectName) in builtinVars)) return;

      return {
        type: 'Identifier',
        name,
        _builtinMember: true
      };
    })() ?? {
      ...node,
      object: objectHack(node.object),
      property: node.computed ? objectHack(node.property) : node.property
    };
  }

  for (const x in node) {
    if (x[0] === '_') continue;
    const value = node[x];
    if (value != null && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = objectHack(value[i]);
        }
      } else if (value.type) {
        node[x] = objectHack(value);
      }
    }
  }

  return node;
};

const funcByIndex = idx => {
  if (idx == null) return null;

  if (funcsByIndex[idx]) return funcsByIndex[idx];

  const func = funcs[idx];
  if (func && func.index === idx) return func;

  return funcs.find(x => x.index === idx);
};
const funcByName = name => funcByIndex(funcIndex[name]);
// a closure is only callable from within its defining function
const globalFuncByName = (scope, name) => {
  const func = funcByName(name);
  if (!func?.closureAware) return func;
  for (let cursor = scope; cursor; cursor = cursor.parentFunc) if (cursor === func.parentFunc) return func;
  return null;
};
const hasAmbiguousFuncName = name => funcNameCollisions?.[name] === true;
const setFuncIndex = (name, index) => {
  if (funcIndex[name] != null && funcIndex[name] !== index) {
    funcNameCollisions[name] = true;
  }

  funcIndex[name] = index;
};
const bindNamedFunction = (scope, name, func) => {
  if (!scope || !name || !func) return;

  scope.namedFuncBindings ??= Object.create(null);
  scope.namedFuncBindings[name] = func;
};
const resolveNamedFunction = (scope, name) => {
  for (let cursor = scope; cursor; cursor = cursor.parentFunc) {
    const func = cursor.namedFuncBindings?.[name];
    if (func) return func;
  }

  if (!hasAmbiguousFuncName(name)) return globalFuncByName(scope, name);
  return null;
};

// a user top-level function of the same name replaces the builtin prototype method (eg from the Intl polyfill)
const builtinShadow = name => name.includes('_prototype_') && funcIndex[name] != null ? funcs.find(x => x.name === name && !x.internal) : null;

const builtinFuncByName = name => {
  const normal = funcByName(name);
  if (!normal || normal.internal) return normal;

  return funcs.find(x => x.name === name && x.internal);
};
let irFinalizers;
const onFinalize = fn => { (irFinalizers ??= []).push(fn); };

// run once everything else converged, eg comptime hasFunc flags which cannot be revisited
let irLateFinalizers = [];
const onLateFinalize = fn => { irLateFinalizers.push(fn); };

const generateFunc = (scope, decl, forceNoExpr = false) => {
  doNotMarkFuncRef = false;

  if (!decl.id) decl.id = { type: 'Identifier', name: anonymousName(decl) };
  const name = decl.id.name;
  const topLevel = !!decl._topLevel || decl.type === 'Program';
  const directCallOnly =
    !scope.topLevel &&
    decl.type === 'FunctionDeclaration' &&
    directCallOnlyFunctionNode(decl);
  if (decl.type.startsWith('Class')) {
    const out = generateClass(scope, { ...decl, id: { name } });
    const func = resolveNamedFunction(scope, name);
    return [ func, out ];
  }

  const params = decl.params ?? [];
  const arrow = decl.type === 'ArrowFunctionExpression' || decl.type === 'Program';

  const func = {
    start: decl.start,
    locals: Object.create(null),
    name,
    index: currentFuncIndex++,
    arrow,
    topLevel,
    constr: !directCallOnly && !arrow && !decl.generator && !decl.async && !decl._method && !decl._builtinShadow,
    method: !arrow && (decl._method || decl._builtinShadow || decl.generator || decl.async),
    async: decl.async,
    generator: decl.generator,
    subclass: decl._subclass, _onlyConstr: decl._onlyConstr, _noGlobalThis: decl._noGlobalThis, jsName: decl._jsName,
    strict: decl.strict ?? scope.strict,
    usesArguments: decl._usesArguments,
    ast: decl,
    unit: decl._unit ?? scope.unit,
    parentFunc: scope.name ? scope : null,
    selfAware: !!decl._selfAware,
    directCallOnly,
    inEval: decl._evalBody ? '#completion' : null,
    closureCaptures: decl._captures && Object.keys(decl._captures).length > 0 ? decl._captures : null,
    closureOwnLocals: decl._capturedVars && Object.keys(decl._capturedVars).length > 0 ? decl._capturedVars : null,
    closureCapturesThis: decl._capturesThis ?? null,
    closurePassThrough: !!decl._closurePassThrough,
    closureAware: decl.type !== 'Program' && closureAwareFunc({
      internal: false,
      name,
      topLevel,
      noClosureEnv: decl._noClosureEnv,
      closureCaptures: decl._captures && Object.keys(decl._captures).length > 0 ? decl._captures : null,
      closureCapturesThis: decl._capturesThis ?? null,
      closurePassThrough: !!decl._closurePassThrough
    }),
    closureOwnThis: !!decl._capturedThis,
    knownThisSlots: !arrow && !decl.generator && !decl.async && !decl._method && !decl._builtinShadow ? getKnownThisSlots(decl) : null,

    // render's C signature return type (IR T.*), porffor TYPES inference type rides in
    // `returnType`, coroutine kind in `flags` (async/generator bodies are otherwise plain)
    retType: topLevel ? T.none : T.jsval,
    returnType: topLevel ? TYPES.undefined : undefined,

    generate() {
      if (func.body) return func.body;
      initBuilder(func);
      for (const p of func.params) func.locals[p.name] = { type: p.type, metadata: { param: true } };

      let body = decl.body;
      if (decl.type === 'ArrowFunctionExpression' && decl.expression) {
        // expression body desugars to a return
        body = { type: 'ReturnStatement', argument: decl.body };
      }

      if (globalThis.precompile) {
        globalThis.funcBodies ??= {};
        globalThis.funcBodies[name] = body;
      }

      markVarHoists(func, body, !!decl._module);

      // pick numeric var storage before emitting refs
      if (!func.topLevel) {
        for (const [localName, variable] of Object.entries(decl._variables ?? {})) {
          if (func.hoists?.get(localName) !== HOIST_DECL) continue;
          if (variable.node?._storageType !== TYPES.number) continue;
          if (!variable.node._storageInitSeen || variable.node._storageHazardRef) continue;
          if (func.closureOwnLocals?.[localName] || func.closureCaptures?.[localName]) continue;
          allocVar(func, localName, false, T.f64);
        }
      }

      // hoist function decls so earlier calls stay direct (module inits hoist their own)
      const moduleInits = decl.type === 'Program' && !decl._module && body.body.some(x => x._unit != null);
      if (body.type === 'BlockStatement' && !moduleInits) {
        let b = body.body, j = 0;
        if (b[0]?.directive) j++;
        for (let i = 0; i < b.length; i++) {
          if (b[i].type === 'FunctionDeclaration') b.splice(j++, 0, b.splice(i, 1)[0]);
        }
        for (const x of b) if (x.type === 'ClassDeclaration' && x._refs) declareClass(func, x);
      }

      func.identFailEarly = true;

      if (hasClosureOwnEnv(func)) {
        const count = closureLayout(func).count;
        const parent = reuse(func, func.closureAware ? valOf(Local('#env', T.ptr), TYPES.__porffor_closureenv) : valUndefined());
        allocVar(func, '#closure_env_local');
        setLocalWithType(func, '#closure_env_local', false, makeClosureEnv(func, parent, count), false, TYPES.__porffor_closureenv);
      }

      // a named function expression sees its own name
      if (decl.type === 'FunctionExpression' && decl.id?.name && func.selfAware) {
        const selfName = decl._variable?.internalName ?? func.name;
        allocVar(func, selfName);
        setVarMetadata(func, selfName, false, { kind: 'function-name' });
        setLocalWithType(func, selfName, false, Local('#callee', T.jsval), false, TYPES.function);
        if (func.closureOwnLocals?.[selfName]?.node === decl) mirrorToClosureEnv(func, selfName);
      }

      // dynamic calls can deliver any receiver: prototype builtins coerce or type-guard #this by annotated type
      if (globalThis.precompile && func.overrideThisType != null && name.includes('_prototype_') && !name.startsWith('__Porffor_')) {
        const t = func.overrideThisType;
        const thisRef = () => Local('#this', T.jsval);
        const prettyName = name.slice(2).replace('_prototype_', '.prototype.');
        if (t === TYPES.string) {
          emitIf(func, Bin('!=', T.i32, JvType(thisRef()), Const(T.i32, TYPES.string)), () => {
            const nonNullish = () => internalThrow(func, 'TypeError', `${prettyName} expects 'this' to be non-nullish`);
            emitIf(func, Bin('==', T.i32, JvType(thisRef()), Const(T.i32, TYPES.undefined)), nonNullish);
            emitIf(func, Bin('==', T.i32, JvType(thisRef()), Const(T.i32, TYPES.object)),
              () => emitIf(func, Bin('==', T.i32, JvPtr(thisRef()), Const(T.u32, 0)), nonNullish));
            assign(func, thisRef(), builtinCall(func, '__ecma262_ToString', [ thisRef() ]));
            emitIf(func, Bin('==', T.i32, JvType(thisRef()), Const(T.i32, TYPES.bytestring)),
              () => assign(func, thisRef(), builtinCall(func, '__Porffor_bytestringToString', [ thisRef() ])));
          });
        } else if ([
          TYPES.number, TYPES.boolean, TYPES.promise, TYPES.symbol, TYPES.function,
          TYPES.set, TYPES.map, TYPES.weakref, TYPES.weakset, TYPES.weakmap,
          TYPES.arraybuffer, TYPES.sharedarraybuffer, TYPES.dataview
        ].includes(t)) {
          const guard = () => internalThrow(func, 'TypeError', `${prettyName} expects 'this' to be a ${TYPE_NAMES[t]}`);
          emitIf(func, Bin('!=', T.i32, JvType(thisRef()), Const(T.i32, t)),
            t === TYPES.number || t === TYPES.boolean
              ? () => emitIf(func, Bin('!=', T.i32, JvType(thisRef()), Const(T.i32, primObjAlias[t])), guard)
              : t === TYPES.function
                ? () => emitIf(func, Bin('!=', T.i32, JvType(thisRef()), Const(T.i32, TYPES.proxy)), guard)
                : guard);
        }
      }

      if (hasClosureOwnEnv(func) && func.closureOwnThis && !func.subclass) mirrorToClosureEnv(func, '#this', { type: 'ThisExpression' });
      if (decl._thisBinding) writeBinding(func, decl._thisBinding, valUndefined());
      if (decl._newTargetBinding?._refs) writeBinding(func, decl._newTargetBinding, func.constr ? Local('#newtarget', T.jsval) : valUndefined());
      if (func.closureOwnLocals?.arguments) mirrorToClosureEnv(func, 'arguments');

      for (let i = 0; i < args.length; i++) {
        const { name: argName, def, destr, type, inferredType } = args[i];
        if (args[i].rest) allocVar(func, argName);
        if (type) {
          const typeAnno = extractTypeAnnotation(type);
          addVarMetadata(func, argName, false, typeAnno);
          if (typeAnno.types) for (const x of typeAnno.types) typeUsed(func, x);
        } else if (inferredType != null) {
          addVarMetadata(func, argName, false, { type: inferredType });
          typeUsed(func, inferredType);
        }

        if (args[i].rest) {
          setLocalWithType(func, argName, false, Local('#rest', T.jsval), false, TYPES.array);
        } else if (def) {
          const ref = Local(argName, func.locals[argName]?.type ?? T.jsval);
          if (ref[N_TYPE] === T.jsval) emitIf(func, Bin('==', T.i32, JvType(ref), Const(T.i32, TYPES.undefined)), () => {
            const known = getNodeType(func, def);
            const value = generate(func, def, argName);
            assign(func, ref, value[N_TYPE] === T.jsval ? value : known != null && known !== TYPES.number ? valOf(value, known) : valNumber(value));
          });
        }

        if (destr) generateVarDstr(func, 'var', destr, { type: 'Identifier', name: argName }, undefined, false);

        // mirror as each param settles, a later default may be a closure reading it
        if (hasClosureOwnEnv(func) && func.closureOwnLocals?.[argName]) mirrorToClosureEnv(func, argName);
      }

      func.identFailEarly = false;

      if (func.coroInit) exprStmt(func, Yield(valUndefined()));

      if (decl._baseClassFieldInit) stmt(func, CLASS_FIELD_INIT_MARKER);

      if (moduleInits) generateModules(func, body.body);
      else genStmt(func, body);

      if (func.topLevel && !decl._module) {
        func.export = true;

        // drain the microtask queue at program end when promises exist
        if (('Promise' in funcIndex) || ('__Porffor_promise_create' in funcIndex) || ('__Promise_resolve' in funcIndex) || ('__Promise_reject' in funcIndex)) {
          exprStmt(func, builtinCall(func, '__Porffor_promise_runJobs', []));
        }
      }

      // implicit return on fall-off, via generateReturn so constructor coercion and void handling apply
      if (func.body.at(-1)?.[N_KIND] !== K.Return) generateReturn(func, {});

      return func.body;
    }
  };
  decl._porfforFunc = func;

  if (!decl._method && !decl._noFuncIndex) setFuncIndex(name, func.index);
  if (decl.type === 'FunctionDeclaration') bindNamedFunction(scope, name, func);
  if (func.topLevel && !decl._module) topLevelFunc = func;
  funcs.push(func);
  funcsByIndex[func.index] = func;

  if (typedInput && decl.returnType) {
    // unwrap Promise<T> for async functions
    const { type, types, irType } = extractTypeAnnotation(decl.returnType, func.async && !func.generator);
    if (irType != null) {
      func.retType = irType;
      // a raw return type cannot carry the constructed object
      if (irType !== T.jsval) func.constr = false;
    }
    if (type != null) { typeUsed(func, type); func.returnType = type; }
    else if (types != null) { func.returnTypes = types; for (const x of types) typeUsed(func, x); }
  }

  const args = [];
  // .length counts params before the first default or rest
  let jsLength;
  for (let i = 0; i < params.length; i++) {
    let argName, def, destr, typeAnnotation;
    const x = params[i];
    switch (x.type) {
      case 'Identifier': {
        argName = x.name;
        typeAnnotation = x.typeAnnotation;
        if (globalThis.precompile && argName === '_argc') { func.usesArguments = true; continue; }
        if (globalThis.precompile && i === 0 && argName === 'this' && !arrow) {
          // a TS this-param types the receiver, it is not a real argument
          func.method = true;
          func.constr = false;
          func._noGlobalThis = true;
          if (typeAnnotation) func.overrideThisType = extractTypeAnnotation(x).type;
          continue;
        }
        break;
      }
      case 'AssignmentPattern': {
        jsLength ??= args.length;
        def = x.right;
        typeAnnotation = x.typeAnnotation ?? x.left.typeAnnotation;
        if (x.left.name) argName = x.left.name;
        else { argName = '#arg_dstr' + i; destr = x.left; }
        break;
      }
      case 'RestElement': {
        jsLength ??= args.length;
        argName = x.argument.name ?? ('#arg_dstr' + i);
        if (!x.argument.name) destr = x.argument;
        func.hasRestArgument = true;
        args.push({ name: argName, destr, rest: true, type: typedInput && (x.typeAnnotation ?? x.argument.typeAnnotation) });
        continue;
      }
      default:
        argName = '#arg_dstr' + i; destr = x; break;
    }
    args.push({ name: argName, def, destr, type: typedInput && typeAnnotation,
      inferredType: !def && !destr ? decl._directParamTypes?.[args.length] : null });
  }

  // sloppy duplicate params: the last is the visible binding, earlier ones become hidden
  // slots so they still receive their positional argument without redeclaring the C param
  for (let i = 0; i < args.length; i++) {
    if (args[i].name[0] === '#') continue;
    for (let j = i + 1; j < args.length; j++) {
      if (args[j].name === args[i].name) {
        args[i].name = '#dupe_arg' + i + '_' + args[i].name;
        break;
      }
    }
  }

  func.coroInit = func.generator && args.some(a => a.def || a.destr);

  func.params = [];
  if (func.selfAware) func.params.push({ name: '#callee', type: T.jsval });
  if (func.closureAware) func.params.push({ name: '#env', type: T.ptr });
  if (func.constr) func.params.push({ name: '#newtarget', type: T.jsval }, { name: '#this', type: T.jsval });
  if (func.method) func.params.push({ name: '#this', type: T.jsval });
  for (const a of args) func.params.push(a.rest ? { name: '#rest', type: T.jsval } : {
    name: a.name,
    type: a.type ? (extractTypeAnnotation(a.type).irType ?? T.jsval) : (a.inferredType === TYPES.number ? T.f64 : T.jsval)
  });
  if (func.usesArguments) func.params.push({ name: '#allargs', type: T.jsval });

  for (const p of func.params) func.locals[p.name] = { type: p.type, metadata: { param: true } };

  func.jsLength = jsLength ?? args.length;

  if (func.topLevel) func.generate();
  if (globalThis.precompile) func.generate();

  if (decl._doNotMarkFuncRef) doNotMarkFuncRef = true;
  const out = decl.type.endsWith('Expression') && !forceNoExpr ? materializeFunctionExpr(scope, func) : valUndefined();
  doNotMarkFuncRef = false;
  return [ func, out ];
};

// each module's top level becomes an init function in its unit, unitless statements stay in #main
const generateModules = (scope, body) => {
  let unit = null, group = [];
  const flush = () => {
    if (group.length === 0) return;
    const [ func ] = generateFunc(scope, {
      type: 'Program', id: { name: `#mod_${unit}` }, _module: true, _unit: unit, strict: scope.strict,
      _capturedVars: scope.ast._capturedVars, _capturedThis: scope.ast._capturedThis, _variables: scope.ast._variables,
      body: { type: 'BlockStatement', body: group }
    });
    exprStmt(scope, Call(func.index, [], T.none));
    group = [];
  };
  for (const x of body) {
    if (x._unit == null) { flush(); genStmt(scope, x); continue; }
    if (x._unit !== unit) { flush(); unit = x._unit; }
    group.push(x);
  }
  flush();
};

const generateBlock = (scope, decl) => {
  inferBranchStart(scope);
  for (const x of decl.body) {
    if (!isEmptyNode(x)) genStmt(scope, x);
  }
  inferBranchEnd(scope);
  return scope.inEval ? completion(scope) : valUndefined();
};

const staticDirectArgType = node => {
  if (!node) return null;
  if (typeof node._type === 'number') return node._type;
  if (node.type === 'Literal') {
    if (node.bigint != null) return TYPES.bigint;
    if (node.value === null) return TYPES.object;
    if (node.regex) return TYPES.regexp;
    if (typeof node.value === 'string') return byteStringable(node.value) ? TYPES.bytestring : TYPES.string;
    return TYPES[typeof node.value] ?? null;
  }
  if (node.type === 'Identifier') {
    if (node.name === 'undefined') return TYPES.undefined;
    if (node.name === 'NaN' || node.name === 'Infinity') return TYPES.number;
    if (node._resolvedVariable?.node?._directInferredType != null)
      return node._resolvedVariable.node._directInferredType;
    if (!node._noStorageInfer && node._resolvedVariable?.node?._storageType === TYPES.number) return TYPES.number;
    return null;
  }
  if (node.type === 'UnaryExpression') {
    if (node.operator === '!') return TYPES.boolean;
    if (node.operator === 'void') return TYPES.undefined;
    if (node.operator === 'typeof') return TYPES.bytestring;
    if (node.operator === 'delete') return TYPES.boolean;
    const t = staticDirectArgType(node.argument);
    if (node.operator === '+') return TYPES.number;
    return t === TYPES.bigint || t === TYPES.number ? t : null;
  }
  if (node.type === 'BinaryExpression') {
    if (['==', '===', '!=', '!==', '>', '>=', '<', '<=', 'instanceof', 'in'].includes(node.operator)) return TYPES.boolean;
    const l = staticDirectArgType(node.left), r = staticDirectArgType(node.right);
    if (l === TYPES.bigint || r === TYPES.bigint)
      return l === TYPES.bigint && r === TYPES.bigint ? TYPES.bigint : null;
    if (node.operator !== '+') return l === TYPES.number && r === TYPES.number ? TYPES.number : null;
    return l === TYPES.number && r === TYPES.number ? TYPES.number : null;
  }
  if (node.type === 'UpdateExpression') {
    const t = staticDirectArgType(node.argument);
    return t === TYPES.bigint || t === TYPES.number ? t : null;
  }
  if (node.type === 'AssignmentExpression') {
    if (node.operator === '=') return staticDirectArgType(node.right);
    if (['||=', '&&=', '??='].includes(node.operator)) return null;
    const l = staticDirectArgType(node.left), r = staticDirectArgType(node.right);
    if (node.operator !== '+=') {
      if (l === TYPES.bigint || r === TYPES.bigint)
        return l === TYPES.bigint && r === TYPES.bigint ? TYPES.bigint : null;
      return l === TYPES.number && r === TYPES.number ? TYPES.number : null;
    }
    return l === TYPES.number && r === TYPES.number ? TYPES.number : null;
  }
  if (node.type === 'SequenceExpression') return staticDirectArgType(node.expressions.at(-1));
  if (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression') {
    const l = staticDirectArgType(node.consequent ?? node.left);
    const r = staticDirectArgType(node.alternate ?? node.right);
    return l != null && l === r ? l : null;
  }
  if (node.type === 'ArrayExpression') return TYPES.array;
  if (node.type === 'ObjectExpression') return TYPES.object;
  return null;
};

const inferDirectCallParamTypes = root => {
  const infos = new Map();
  for (const decl of root._directCallDecls ?? []) {
    if (directCallOnlyFunctionNode(decl)) infos.set(decl, decl._directCalls);
  }

  // propagate argument types through direct-only call chains
  let changed;
  do {
    changed = false;
    for (const [decl, calls] of infos) {
      for (let i = 0; i < (decl.params?.length ?? 0); i++) {
        const param = decl.params[i];
        if (param?.type !== 'Identifier' || param._directInferredType != null) continue;

        let inferred = null;
        let valid = calls.length > 0;
        for (const call of calls) {
          let spread = false;
          for (let j = 0; j <= i; j++) if (call.arguments[j]?.type === 'SpreadElement') spread = true;
          const arg = call.arguments[i];
          const type = spread ? null : arg == null ? TYPES.undefined : staticDirectArgType(arg);
          if (type == null || (inferred != null && inferred !== type)) { valid = false; break; }
          inferred = type;
        }
        if (valid && inferred != null) {
          param._directInferredType = inferred;
          changed = true;
        }
      }
    }
  } while (changed);

  for (const [decl] of infos) {
    // only number has a specialized user-function ABI
    const inferred = (decl.params ?? []).map(param =>
      param._directInferredType === TYPES.number ? TYPES.number : undefined);
    if (inferred.some(type => type != null)) decl._directParamTypes = inferred;
  }
};

let globals, funcs, funcsByIndex, funcIndex, funcNameCollisions, currentFuncIndex, depth, data, dataUnits, dataCache, modular, rawHead, builtinGlobalInits, includedBuiltinGlobalInits, usedTypes, globalInfer, builtinFuncs, builtinVars, builtinPrototypeFuncs, builtinStaticFuncs, builtinPrototypeGetters, builtinPrototypeObjectGetters, topLevelFunc;

export default (program, opts = {}) => {
  const entryName = opts.entryName ?? '#main';
  globals = Object.create(null);
  globals['#ind'] = 0;
  funcs = []; funcsByIndex = [];
  funcIndex = Object.create(null);
  funcNameCollisions = Object.create(null);
  depth = [];
  data = [];
  dataUnits = [];
  dataCache = new Map();
  modular = !!program._units;
  rawHead = [];
  builtinGlobalInits = [];
  includedBuiltinGlobalInits = new Set();
  irFinalizers = [];
  irLateFinalizers = [];
  memberDemands = new Set();
  globalDemands = new Set();
  iteratorDemands = new Set();
  fullPrototypes.clear();
  topLevelFunc = null;
  onFinalize(() => resolveMemberDemands(topLevelFunc));
  currentFuncIndex = 0;
  icSites = Object.create(null);
  usedTypes = new Set([ TYPES.undefined, TYPES.number, TYPES.boolean, TYPES.function ]);
  globalInfer = Object.create(null);

  if (!builtinFuncs) {
    builtinFuncs = BuiltinFuncs();
    builtinVars = BuiltinVars({ builtinFuncs });

    builtinPrototypeFuncs = new Map();
    builtinStaticFuncs = new Map();
    builtinPrototypeGetters = new Map();
    builtinPrototypeObjectGetters = new Map();
    for (const x in builtinFuncs) {
      const ind = x.indexOf('_prototype_');
      if (x.startsWith('__') && ind !== -1) {
        let name = x.slice(ind + '_prototype_'.length);
        if (name.endsWith('$set')) continue;
        const getters = name.endsWith('$get');
        if (getters) name = name.slice(0, -'$get'.length);
        const map = getters ? builtinPrototypeGetters : builtinPrototypeFuncs;
        const entries = map.get(name);
        if (entries) entries.push(x);
        else map.set(name, [ x ]);
      } else if (x.startsWith('#get___') && x.endsWith('_prototype')) {
        builtinPrototypeObjectGetters.set(x.slice(7, -'_prototype'.length), x);
      } else if (/^__[A-Z][A-Za-z0-9]*_[A-Za-z$][A-Za-z0-9$]*$/.test(x) && !x.startsWith('__Porffor_') && !builtinFuncs[x].comptime) {
        const name = x.slice(x.indexOf('_', 2) + 1);
        const entries = builtinStaticFuncs.get(name);
        if (entries) entries.push(x);
        else builtinStaticFuncs.set(name, [ x ]);
      }
    }

    const getObjectName = x => x.startsWith('__') && x.slice(2, x.indexOf('_', 2));
    allObjectHackers = [ ...new Set(Object.keys(builtinFuncs).map(getObjectName).concat(Object.keys(builtinVars).map(getObjectName)).filter(x => x && (globalThis.precompile || x !== 'TypedArray'))) ];
    semantic.objectHack = objectHack;
  }

  // a user top-level decl shadowing a builtin name disables the object hack for it:
  // its member accesses are real property accesses
  {
    const userDecls = new Set();
    for (const x of program.body) {
      if (x.type === 'FunctionDeclaration' || x.type === 'ClassDeclaration') {
        if (x.id?.name) userDecls.add(x.id.name);
      } else if (x.type === 'VariableDeclaration') {
        for (const d of x.declarations) if (d.id?.type === 'Identifier') userDecls.add(d.id.name);
      }
    }
    objectHackers = userDecls.size > 0 ? allObjectHackers.filter(x => !userDecls.has(x)) : allObjectHackers;
    semantic.objectHackers = objectHackers;
  }
  if (program._usesTemporal) {
    const polyfill = parse(temporalPolyfillSource).body;
    if (program._units) for (const x of polyfill) x._unit = 'temporal';
    program.body = polyfill.concat(program.body);
  }
  if (program._usesIntl) {
    let polyfill = parse(intlPolyfillSource).body;
    if (program._usesIntl !== true) {
      // unregistered services and hooks are never referenced, so never compiled
      const { services, hooks } = program._usesIntl;
      polyfill = polyfill.filter(x => x.expression?.callee?.name !== 'I$defineService' || services.has(x.expression.arguments[2].value));
      const hookObject = polyfill.find(x => x.expression?.left?.name === '$IntlHooks$').expression.right;
      hookObject.properties = hookObject.properties.filter(x => hooks.has(x.key.name));
    }
    if (program._units) for (const x of polyfill) x._unit = 'intl';
    // its replacements of builtin prototype methods are methods: not constructors, no prototype
    for (const x of polyfill) if (x.type === 'FunctionDeclaration' && x.id.name.includes('_prototype_')) x._builtinShadow = true;
    program.body = polyfill.concat(program.body);
  }
  if (program._usesTemporal || program._usesIntl) {
    const tz = parse(tzSource).body;
    if (program._units) for (const x of tz) x._unit = 'tz';
    program.body = tz.concat(program.body);
  }

  // todo/perf: make this lazy per func (again)
  // semantic relies on object hack happening before
  program = desugarUsing(program);
  specializeFunctionSources(program);
  objectHackAssigned = assignedBuiltinMembers(program);
  program = objectHack(program);
  if (Prefs.closures) program = semantic(program);
  mayHaveBigInt = globalThis.precompile || usesBigInt(program);
  if (mayHaveBigInt) usedTypes.add(TYPES.bigint);
  definedKeys = collectDefinedKeys(program);
  globalObjectUsed = usesGlobalObject(program, !Prefs.module);
  if (Prefs.p) {
    const last = getLastNode(program.body);
    const lastIndex = program.body.indexOf(last);
    if (lastIndex !== -1 && last.type === 'ExpressionStatement') {
      program.body.splice(lastIndex, 1,
        {
          type: 'VariableDeclaration', kind: 'const',
          declarations: [ { type: 'VariableDeclarator', id: identNode('#repl_result'), init: last.expression } ]
        },
        {
          type: 'ExpressionStatement',
          expression: { type: 'CallExpression', callee: identNode('__Porffor_promise_runJobs'), arguments: [] }
        },
        {
          ...last,
          expression: { type: 'CallExpression', callee: identNode(Prefs.repl ? '__Porffor_print' : '__console_log'), arguments: [ identNode('#repl_result') ] }
        }
      );
    }
  }
  inferDirectCallParamTypes(program);

  generateFunc({}, {
    type: 'Program',
    id: { name: entryName },
    _topLevel: true,
    strict: Prefs.module,
    _captures: program._captures,
    _capturedVars: program._capturedVars,
    _capturesThis: program._capturesThis,
    _capturedThis: program._capturedThis,
    _variables: program._variables,
    _variableIds: program._variableIds,
    _usesArguments: program._usesArguments,
    body: {
      type: 'BlockStatement',
      body: program.body
    }
  });

  if (!globalThis.precompile && funcs.some(f => f.async && !f.generator))
    includeBuiltin(topLevelFunc, '__Porffor_promise_resolve');

  for (const f of funcs.slice()) if (f.referenced || f.export) f.generate?.();

  for (let pass = 0; pass < 64; pass++) {
    const beforeFinalizers = irFinalizers.length;
    const beforeFuncs = funcs.length;
    const beforeTypes = usedTypes.size;

    for (let i = 0; i < irFinalizers.length; i++) irFinalizers[i]();
    for (const f of funcs.slice()) if (f.referenced || f.export) f.generate?.();

    if (irFinalizers.length === beforeFinalizers && funcs.length === beforeFuncs && usedTypes.size === beforeTypes) {
      if (irLateFinalizers.length === 0) break;
      const late = irLateFinalizers;
      irLateFinalizers = [];
      for (const f of late) f();
    }
    if (pass === 63) throw new Error('IR finalizers did not converge');
  }
  irFinalizers.length = 0;

  if (builtinGlobalInits.length !== 0) topLevelFunc.body.unshift(...builtinGlobalInits);

  // render input: funcs indexed by func.index, ungenerated ones null (tree-shaken to a trapping stub), globals as {name, type}
  const renderFuncs = [];
  for (const f of funcs) renderFuncs[f.index] = f.body ? f : null;

  const renderGlobals = [];
  for (const name in globals) {
    if (name === '#ind') continue;
    renderGlobals.push({ name, type: globals[name].type ?? T.jsval });
  }

  return {
    funcs: renderFuncs,
    data,
    dataUnits,
    units: program._units ?? null,
    globals: renderGlobals,
    entry: entryName,
    prefs: rawHead.length ? { ...Prefs, rawHead: [ Prefs.rawHead, ...rawHead ].filter(Boolean).join('\n') } : Prefs,
    usedTypes,
    bigints: mayHaveBigInt
  };
};
