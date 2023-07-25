import { Blocktype, Opcodes, Valtype, PageSize, ValtypeSize } from "./wasmSpec.js";
import { signedLEB128, unsignedLEB128 } from "./encoding.js";
import { operatorOpcode } from "./expression.js";
import { BuiltinFuncs, BuiltinVars, importedFuncs, NULL, UNDEFINED } from "./builtins.js";
import { PrototypeFuncs } from "./prototype.js";
import { number, i32x4 } from "./embedding.js";
import parse from "./parse.js";

let globals = {};
let globalInd = 0;
let tags = [];
let funcs = [];
let exceptions = [];
let funcIndex = {};
let currentFuncIndex = importedFuncs.length;
let builtinFuncs = {}, builtinVars = {}, prototypeFuncs = {};

const debug = str => {
  const code = [];

  const logChar = n => {
    code.push(...number(n));

    code.push(Opcodes.call);
    code.push(...unsignedLEB128(0));
  };

  for (let i = 0; i < str.length; i++) {
    logChar(str.charCodeAt(i));
  }

  logChar('\n'.charCodeAt(0));

  return code;
};

const todo = msg => {
  throw new Error(`todo: ${msg}`);

  const code = [];

  code.push(...debug(`todo! ` + msg));
  code.push(Opcodes.unreachable);

  return code;
};

const isFuncType = type => type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression';
const generate = (scope, decl, global = false, name = undefined) => {
  switch (decl.type) {
    case 'BinaryExpression':
      return generateBinaryExp(scope, decl);

    case 'LogicalExpression':
      return generateLogicExp(scope, decl);

    case 'Identifier':
      return generateIdent(scope, decl);

    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
      generateFunc(scope, decl);
      return [];

    case 'BlockStatement':
      return generateCode(scope, decl);

    case 'ReturnStatement':
      return generateReturn(scope, decl);

    case 'ExpressionStatement':
      return generateExp(scope, decl);

    case 'CallExpression':
      return generateCall(scope, decl, global, name);

    case 'NewExpression':
      return generateNew(scope, decl, global, name);

    case 'Literal':
      return generateLiteral(scope, decl);

    case 'VariableDeclaration':
      return generateVar(scope, decl);

    case 'AssignmentExpression':
      return generateAssign(scope, decl);

    case 'UnaryExpression':
      return generateUnary(scope, decl);

    case 'UpdateExpression':
      return generateUpdate(scope, decl);

    case 'IfStatement':
      return generateIf(scope, decl);

    case 'ForStatement':
      return generateFor(scope, decl);

    case 'WhileStatement':
      return generateWhile(scope, decl);

    case 'BreakStatement':
      return generateBreak(scope, decl);

    case 'ContinueStatement':
      return generateContinue(scope, decl);

    case 'EmptyStatement':
      return generateEmpty(scope, decl);

    case 'ConditionalExpression':
      return generateConditional(scope, decl);

    case 'ThrowStatement':
      return generateThrow(scope, decl);

    case 'TryStatement':
      return generateTry(scope, decl);

    case 'DebuggerStatement':
      // todo: add fancy terminal debugger?
      return [];

    case 'ArrayExpression':
      return generateArray(scope, decl, global, name);

    case 'MemberExpression':
      return generateMember(scope, decl);

    case 'ExportNamedDeclaration':
      // hack to flag new func for export
      const funcsBefore = funcs.length;
      generate(scope, decl.declaration);

      if (funcsBefore === funcs.length) throw new Error('no new func added in export');

      const newFunc = funcs[funcs.length - 1];
      newFunc.export = true;

      return [];

    case 'TaggedTemplateExpression':
      // hack for inline asm
      if (decl.tag.name !== 'asm') return todo('tagged template expressions not implemented');

      const str = decl.quasi.quasis[0].value.raw;
      let out = [];

      for (const line of str.split('\n')) {
        const asm = line.trim().split(';;')[0].split(' ');
        if (asm[0] === '') continue; // blank

        if (asm[0] === 'local') {
          const [ name, idx, type ] = asm.slice(1);
          scope.locals[name] = { idx: parseInt(idx), type: Valtype[type] };
          continue;
        }

        if (asm[0] === 'returns') {
          scope.returns = asm.slice(1).map(x => Valtype[x]);
          continue;
        }

        if (asm[0] === 'memory') {
          scope.memory = true;
          continue;
        }

        let inst = Opcodes[asm[0].replace('.', '_')];
        if (!inst) throw new Error(`inline asm: inst ${asm[0]} not found`);

        if (!Array.isArray(inst)) inst = [ inst ];
        const immediates = asm.slice(1).map(x => parseInt(x));

        out.push([ ...inst, ...immediates ]);
      }

      return out;

    default:
      return todo(`no generation for ${decl.type}!`);
  }
};

const mapName = x => {
  if (!x) return x;

  if (x.startsWith('__globalThis_')) {
    const key = x.slice('__globalThis_'.length);
    // hack: this will not work properly
    return key.includes('_') ? ('__' + key) : key;
  }

  return x;
};

const lookupName = (scope, _name) => {
  const name = mapName(_name);

  let local = scope.locals[name];
  if (local) return [ local, false ];

  let global = globals[name];
  if (global) return [ global, true ];

  return [ undefined, undefined ];
};

const internalThrow = (scope, constructor, message, expectsValue = false) => [
  ...generateThrow(scope, {
    argument: {
      type: 'NewExpression',
      callee: {
        name: constructor
      },
      arguments: [
        {
          value: message
        }
      ]
    }
  }),
  ...(expectsValue ? number(UNDEFINED) : [])
];

const generateIdent = (scope, decl) => {
  const lookup = rawName => {
    const name = mapName(rawName);
    let local = scope.locals[rawName];

    if (builtinVars[name]) {
      if (builtinVars[name].floatOnly && valtype[0] === 'i') throw new Error(`Cannot use ${unhackName(name)} with integer valtype`);
      return builtinVars[name];
    }

    if (builtinFuncs[name] || internalConstrs[name]) {
      // todo: return an actual something
      return number(1);
    }

    if (local === undefined) {
      // no local var with name
      if (importedFuncs.hasOwnProperty(name)) return number(importedFuncs[name]);
      if (funcIndex[name] !== undefined) return number(funcIndex[name]);

      if (globals[name] !== undefined) return [ [ Opcodes.global_get, globals[name].idx ] ];
    }

    if (local === undefined && rawName.startsWith('__')) {
      // return undefined if unknown key in already known var
      let parent = rawName.slice(2).split('_').slice(0, -1).join('_');
      if (parent.includes('_')) parent = '__' + parent;

      const parentLookup = lookup(parent);
      if (!parentLookup[1]) return number(UNDEFINED);
    }

    if (local === undefined) return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`, true);

    return [ [ Opcodes.local_get, local.idx ] ];
  };

  return lookup(decl.name);
};

const generateReturn = (scope, decl) => {
  if (decl.argument === null) {
    if (!scope.returnType) scope.returnType = TYPES.undefined;

    // just bare "return"
    return [
      ...number(UNDEFINED), // "undefined" if func returns
      [ Opcodes.return ]
    ];
  }

  if (!scope.returnType) scope.returnType = getNodeType(scope, decl.argument);

  return [
    ...generate(scope, decl.argument),
    [ Opcodes.return ]
  ];
};

const performLogicOp = (scope, op, left, right) => {
  const getLocalTmp = ind => {
    const name = `logictmp${ind}`;
    if (scope.locals[name]) return scope.locals[name].idx;

    let idx = scope.localInd++;
    scope.locals[name] = { idx, type: valtypeBinary };

    return idx;
  };

  const checks = {
    '||': Opcodes.eqz,
    '&&': [ Opcodes.i32_to ]
    // todo: ??
  };

  if (!checks[op]) return todo(`logic operator ${op} not implemented yet`);

  // generic structure for {a} OP {b}
  // -->
  // _ = {a}; if (OP_CHECK) {b} else _
  return [
    ...left,
    [ Opcodes.local_tee, getLocalTmp(1) ],
    ...checks[op],
    [ Opcodes.if, valtypeBinary ],
    ...right,
    [ Opcodes.else ],
    [ Opcodes.local_get, getLocalTmp(1) ],
    [ Opcodes.end ]
  ];
};

const performOp = (scope, op, left, right) => {
  if (op === '||' || op === '&&' || op === '??') {
    return performLogicOp(scope, op, left, right);
  }

  let ops = operatorOpcode[valtype][op];

  // some complex ops are implemented as builtin funcs
  const builtinName = `${valtype}_${op}`;
  if (!ops && builtinFuncs[builtinName]) {
    includeBuiltin(scope, builtinName);
    const idx = funcIndex[builtinName];

    return [
      ...left,
      ...right,
      [ Opcodes.call, idx ]
    ];
  }

  if (!ops) return todo(`operator ${op} not implemented yet`); // throw new Error(`unknown operator ${op}`);

  if (!Array.isArray(ops)) ops = [ ops ];

  return [
    ...left,
    ...right,
    ops
  ];
};

const generateBinaryExp = (scope, decl) => {
  const out = [
    ...performOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right))
  ];

  if (valtype !== 'i32' && ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(decl.operator)) out.push(Opcodes.i32_from);

  return out;
};

const asmFunc = (name, { wasm, params, locals: localTypes, globals: globalTypes = [], globalInits, returns, returnType, memory, localNames = [], globalNames = [] }) => {
  const existing = funcs.find(x => x.name === name);
  if (existing) return existing;

  const nameParam = i => localNames[i] ?? (i >= params.length ? ['a', 'b', 'c'][i - params.length] : ['x', 'y', 'z'][i]);

  const allLocals = params.concat(localTypes);
  const locals = {};
  for (let i = 0; i < allLocals.length; i++) {
    locals[nameParam(i)] = { idx: i, type: allLocals[i] };
  }

  let baseGlobalIdx, i = 0;
  for (const type of globalTypes) {
    if (baseGlobalIdx === undefined) baseGlobalIdx = globalInd;

    globals[globalNames[i] ?? `${name}_global_${i}`] = { idx: globalInd++, type, init: globalInits[i] ?? 0 };
    i++;
  }

  if (globalTypes.length !== 0) {
    // offset global ops for base global idx
    for (const inst of wasm) {
      if (inst[0] === Opcodes.global_get || inst[0] === Opcodes.global_set) {
        inst[1] += baseGlobalIdx;
      }
    }
  }

  const func = {
    name,
    params,
    locals,
    returns,
    returnType: TYPES[returnType ?? 'number'],
    wasm,
    memory,
    internal: true,
    index: currentFuncIndex++
  };

  funcs.push(func);
  funcIndex[name] = func.index;

  return func;
};

const includeBuiltin = (scope, builtin) => {
  const code = builtinFuncs[builtin];
  if (code.wasm) return asmFunc(builtin, code);

  return code.body.map(x => generate(scope, x));
};

const generateLogicExp = (scope, decl) => {
  return performLogicOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right));
};

const TYPES = {
  number: 0xffffffffffff0,
  boolean: 0xffffffffffff1,
  string: 0xffffffffffff2,
  undefined: 0xffffffffffff3,
  object: 0xffffffffffff4,
  function: 0xffffffffffff5,
  symbol: 0xffffffffffff6,
  bigint: 0xffffffffffff7,

  // these are not "typeof" types but tracked internally
  _array: 0xffffffffffff8
};

let typeStates = {};

const getType = (scope, name) => {
  if (scope.locals[name]) return typeStates[name];

  if (builtinVars[name]) return TYPES[builtinVars[name].type ?? 'number'];
  if (builtinFuncs[name] !== undefined || importedFuncs[name] !== undefined || funcIndex[name] !== undefined || internalConstrs[name] !== undefined) return TYPES.function;
  if (globals[name]) return typeStates[name];

  return TYPES.undefined;
};

const getNodeType = (scope, node) => {
  if (node.type === 'Literal') {
    return TYPES[typeof node.value];
  }

  if (isFuncType(node.type)) {
    return TYPES.function;
  }

  if (node.type === 'Identifier') {
    return getType(scope, node.name);
  }

  if (node.type === 'CallExpression' || node.type === 'NewExpression') {
    const name = node.callee.name;
    const func = funcs.find(x => x.name === name);
    if (func) return func.returnType ?? TYPES.number;

    if (builtinFuncs[name]) return TYPES[builtinFuncs[name].returnType ?? 'number'];
    if (internalConstrs[name]) return internalConstrs[name].type;

    return TYPES.number;
  }

  if (node.type === 'ExpressionStatement') {
    return getNodeType(scope, node.expression);
  }

  if (node.type === 'AssignmentExpression') {
    return getNodeType(scope, node.right);
  }

  if (node.type === 'ArrayExpression') {
    return TYPES._array;
  }

  // default to number
  return TYPES.number;
};

const generateLiteral = (scope, decl) => {
  if (decl.value === null) return number(NULL);

  switch (typeof decl.value) {
    case 'number':
      return number(decl.value);

    case 'boolean':
      // hack: bool as int (1/0)
      return number(decl.value ? 1 : 0);

    case 'string':
      // this is a terrible hack which changes type strings ("number" etc) to known const number values
      switch (decl.value) {
        case 'number': return number(TYPES.number);
        case 'boolean': return number(TYPES.boolean);
        case 'string': return number(TYPES.string);
        case 'undefined': return number(TYPES.undefined);
        case 'object': return number(TYPES.object);
        case 'function': return number(TYPES.function);
        case 'symbol': return number(TYPES.symbol);
        case 'bigint': return number(TYPES.bigint);
      }

      if (decl.value.length > 1) todo(`cannot generate string literal (char only)`);

      // hack: char as int
      return number(decl.value.charCodeAt(0));

    default:
      return todo(`cannot generate literal of type ${typeof decl.value}`);
  }
};

const countLeftover = wasm => {
  let count = 0, depth = 0;

  for (const inst of wasm) {
    if (depth === 0 && inst[0] === Opcodes.if) {
      count--;
      if (inst[1] !== Blocktype.void) count++;
    }
    if ([Opcodes.if, Opcodes.try, Opcodes.loop, Opcodes.block].includes(inst[0])) depth++;
    if (inst[0] === Opcodes.end) depth--;

    if (depth === 0)
      if ([Opcodes.throw, Opcodes.return, Opcodes.drop, Opcodes.local_set, Opcodes.global_set].includes(inst[0])) count--;
        else if ([null, Opcodes.i32_eqz, Opcodes.i64_eqz, Opcodes.f64_ceil, Opcodes.f64_floor, Opcodes.f64_trunc, Opcodes.f64_nearest, Opcodes.f64_sqrt, Opcodes.local_tee, Opcodes.i32_wrap_i64, Opcodes.i64_extend_i32_s, Opcodes.f32_demote_f64, Opcodes.f64_promote_f32, Opcodes.f64_convert_i32_s, Opcodes.i32_clz, Opcodes.i32_ctz, Opcodes.i32_popcnt, Opcodes.f64_neg, Opcodes.end, Opcodes.i32_trunc_sat_f64_s[0], Opcodes.i32x4_extract_lane, Opcodes.i16x8_extract_lane, Opcodes.i32_load, Opcodes.i64_load, Opcodes.f64_load, Opcodes.v128_load, Opcodes.memory_grow].includes(inst[0])) {}
        else if ([Opcodes.local_get, Opcodes.global_get, Opcodes.f64_const, Opcodes.i32_const, Opcodes.i64_const, Opcodes.v128_const].includes(inst[0])) count++;
        else if ([Opcodes.i32_store, Opcodes.i64_store, Opcodes.f64_store].includes(inst[0])) count -= 2;
        else if (inst[0] === Opcodes.call) {
          let func = funcs.find(x => x.index === inst[1]);
          if (func) {
            count -= func.params.length;
          } else count--;
          if (func) count += func.returns.length;
        } else count--;
  }

  return count;
};

const disposeLeftover = wasm => {
  let leftover = countLeftover(wasm);

  for (let i = 0; i < leftover; i++) wasm.push([ Opcodes.drop ]);
};

const generateExp = (scope, decl) => {
  const expression = decl.expression;

  const out = generate(scope, expression);
  disposeLeftover(out);

  return out;
};

const generateCall = (scope, decl, _global, _name) => {
  /* const callee = decl.callee;
  const args = decl.arguments;

  return [
    ...generate(args),
    ...generate(callee),
    Opcodes.call_indirect,
  ]; */

  let name = mapName(decl.callee.name);
  if (isFuncType(decl.callee.type)) { // iife
    const func = generateFunc(scope, decl.callee);
    name = func.name;
  }

  if (name === 'eval' && decl.arguments[0].type === 'Literal') {
    // literal eval hack
    const code = decl.arguments[0].value;
    const parsed = parse(code, []);

    const out = generate(scope, {
      type: 'BlockStatement',
      body: parsed.body
    });

    const lastInst = out[out.length - 1];
    if (lastInst && lastInst[0] === Opcodes.drop) {
      out.splice(out.length - 1, 1);
    } else if (countLeftover(out) === 0) {
      out.push(...number(UNDEFINED));
    }

    return out;
  }

  // literal member, check for prototypes. this is a hack for array prototypes
  if (name.startsWith('__')) {
    const spl = name.slice(2).split('_');

    const baseName = spl.slice(0, -1).join('_');
    const baseType = getType(scope, baseName);

    const func = spl[spl.length - 1];
    const protoFunc = prototypeFuncs[baseType]?.[func];

    if (protoFunc) {
      if (baseType === TYPES._array) {
        scope.memory = true;

        const arrayNumber = arrays.get(baseName);

        const [ length, lengthIsGlobal ] = lookupName(scope, '__' + baseName + '_length');

        if (protoFunc.noArgRetLength && decl.arguments.length === 0) return [ lengthIsGlobal ? Opcodes.global_get : Opcodes.local_get, length.idx ];

        return protoFunc(arrayNumber, {
          get: [ lengthIsGlobal ? Opcodes.global_get : Opcodes.local_get, length.idx ],
          set: [ lengthIsGlobal ? Opcodes.global_set : Opcodes.local_set, length.idx ],
        }, generate(scope, decl.arguments[0] ?? DEFAULT_VALUE));
      }
    }
  }

  // TODO: only allows callee as literal
  if (!name) return todo(`only literal callees (got ${decl.callee.type})`);

  let idx = funcIndex[name] ?? importedFuncs[name];
  if (idx === undefined && builtinFuncs[name]) {
    if (builtinFuncs[name].floatOnly && valtype !== 'f64') throw new Error(`Cannot use built-in ${unhackName(name)} with integer valtype`);

    includeBuiltin(scope, name);
    idx = funcIndex[name];

    // infer arguments types from builtins params
    const func = funcs.find(x => x.name === name);
    for (let i = 0; i < decl.arguments.length; i++) {
      const arg = decl.arguments[i];
      if (!arg.name) continue;

      const local = scope.locals[arg.name];
      if (!local) continue;

      local.type = func.params[i];
      if (local.type === Valtype.v128) {
        // specify vec subtype inferred from last vec type in function name
        local.vecType = name.split('_').reverse().find(x => x.includes('x'));
      }
    }
  }

  if (idx === undefined && internalConstrs[_name]) return internalConstrs[name].generate(scope, decl, _global, _name);

  if (idx === undefined && name === scope.name) {
    // hack: calling self, func generator will fix later
    idx = -1;
  }

  if (idx === undefined) {
    if (scope.locals[name] !== undefined || globals[name] !== undefined || builtinVars[name] !== undefined) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`);
    return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`);
  }

  const func = funcs.find(x => x.index === idx);

  let args = decl.arguments;
  if (func && args.length < func.params.length) {
    // too little args, push undefineds
    args = args.concat(new Array(func.params.length - args.length).fill(DEFAULT_VALUE));
  }

  if (func && args.length > func.params.length) {
    // too many args, slice extras off
    args = args.slice(0, func.params.length);
  }

  if (func && func.memory) scope.memory = true;
  if (func && func.throws) scope.throws = true;

  const out = [];
  for (const arg of args) {
    out.push(...generate(scope, arg));
  }

  out.push([ Opcodes.call, idx ]);

  return out;
};

const generateNew = (scope, decl, _global, _name) => {
  // hack: basically treat this as a normal call for builtins for now
  const name = mapName(decl.callee.name);
  if (internalConstrs[name]) return internalConstrs[name].generate(scope, decl, _global, _name);
  if (!builtinFuncs[name]) return todo(`new statement is not supported yet (new ${unhackName(name)})`);

  return generateCall(scope, decl);
};

// bad hack for undefined and null working without additional logic
const DEFAULT_VALUE = {
  type: 'Identifier',
  name: 'undefined'
};

const unhackName = name => {
  if (name.startsWith('__')) return name.slice(2).replaceAll('_', '.');
  return name;
};

const generateVar = (scope, decl) => {
  const out = [];

  const topLevel = scope.name === 'main';

  // global variable if in top scope (main) and var ..., or if wanted
  const global = decl.kind === 'var';
  const target = global ? globals : scope.locals;

  for (const x of decl.declarations) {
    const name = mapName(x.id.name);

    if (x.init && isFuncType(x.init.type)) {
      // hack for let a = function () { ... }
      x.init.id = { name };
      generateFunc(scope, x.init);
      continue;
    }

    // console.log(name);
    if (topLevel && builtinVars[name]) {
      // cannot redeclare
      if (decl.kind !== 'var') return internalThrow(scope, 'SyntaxError', `Identifier '${unhackName(name)}' has already been declared`);

      continue; // always ignore
    }

    let idx;
    // already declared
    if (target[name]) {
      // parser should catch this but sanity check anyway
      if (decl.kind !== 'var') return internalThrow(scope, 'SyntaxError', `Identifier '${unhackName(name)}' has already been declared`);

      idx = target[name].idx;
    } else {
      idx = global ? globalInd++ : scope.localInd++;
      target[name] = { idx, type: valtypeBinary };
    }

    typeStates[name] = x.init ? getNodeType(scope, x.init) : TYPES.undefined;

    // x.init ??= DEFAULT_VALUE;
    if (x.init) {
      out.push(...generate(scope, x.init, global, name));

      // if our value is the result of a function, infer the type from that func's return value
      if (out[out.length - 1][0] === Opcodes.call) {
        const ind = out[out.length - 1][1];
        if (ind >= importedFuncs.length) { // not an imported func
          const func = funcs.find(x => x.index === ind);
          if (!func) throw new Error('could not find func being called as var value to infer type'); // sanity check

          const returns = func.returns;
          if (returns.length > 1) throw new Error('func returning >1 value being set as 1 local'); // sanity check

          target[name].type = func.returns[0];
          if (target[name].type === Valtype.v128) {
            // specify vec subtype inferred from first vec type in function name
            target[name].vecType = func.name.split('_').find(x => x.includes('x'));
          }
        } else {
          // we do not have imports that return yet, ignore for now
        }
      }

      out.push([ global ? Opcodes.global_set : Opcodes.local_set, idx ]);
    }
  }

  return out;
};

const generateAssign = (scope, decl) => {
  const { type, name } = decl.left;

  if (type === 'ObjectPattern') {
    // hack: ignore object parts of `var a = {} = 2`
    return generate(scope, decl.right);
  }

  if (isFuncType(decl.right.type)) {
    // hack for a = function () { ... }
    decl.right.id = { name };
    generateFunc(scope, decl.right);
    return [];
  }

  const [ local, isGlobal ] = lookupName(scope, name);

  if (local === undefined) {
    // todo: this should be a devtools/repl/??? only thing

    // only allow = for this
    if (decl.operator !== '=') return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`);

    if (builtinVars[name]) {
      // just return rhs (eg `NaN = 2`)
      return generate(scope, decl.right);
    }

    // set global and return (eg a = 2)
    return [
      ...generateVar(scope, { kind: 'var', declarations: [ { id: { name }, init: decl.right } ] }),
      [ Opcodes.global_get, globals[name].idx ]
    ];
  }

  if (decl.operator === '=') {
    typeStates[name] = getNodeType(scope, decl.right);

    return [
      ...generate(scope, decl.right, isGlobal, name),
      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],
      [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ]
    ];
  }

  typeStates[name] = TYPES.number;

  return [
    ...performOp(scope, decl.operator.slice(0, -1), [ [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ] ], generate(scope, decl.right)),
    [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],
    [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ]
  ];
};

const generateUnary = (scope, decl) => {
  switch (decl.operator) {
    case '+':
      // stub
      return generate(scope, decl.argument);

    case '-':
      // * -1

      if (decl.prefix && decl.argument.type === 'Literal' && typeof decl.argument.value === 'number') {
        // if -<N>, just return that
        return number(-1 * decl.argument.value);
      }

      return [
        ...generate(scope, decl.argument),
        ...(valtype === 'f64' ? [ [ Opcodes.f64_neg ] ] : [ ...number(-1), [ Opcodes.mul ] ])
      ];

    case '!':
      // !=
      return [
        ...generate(scope, decl.argument),
        ...Opcodes.eqz,
        Opcodes.i32_from
      ];

    case '~':
      return [
        ...generate(scope, decl.argument),
        Opcodes.i32_to,
        [ Opcodes.i32_const, signedLEB128(-1) ],
        [ Opcodes.i32_xor ],
        Opcodes.i32_from
      ];

    case 'void': {
      // drop current expression value after running, give undefined
      const out = generate(scope, decl.argument);
      disposeLeftover(out);

      out.push(...number(UNDEFINED));
      return out;
    }

    case 'delete':
      let toReturn = true, toGenerate = true;

      if (decl.argument.type === 'Identifier') {
        const out = generateIdent(scope, decl.argument);

        // if ReferenceError (undeclared var), ignore and return true. otherwise false
        if (!out[1]) {
          // exists
          toReturn = false;
        } else {
          // does not exist (2 ops from throw)
          toReturn = true;
          toGenerate = false;
        }
      }

      const out = toGenerate ? generate(scope, decl.argument) : [];
      disposeLeftover(out);

      out.push(...number(toReturn ? 1 : 0));
      return out;

    case 'typeof':
      const type = getNodeType(scope, decl.argument);

      // for custom types, just return object
      if (type > 0xffffffffffff7) return number(TYPES.object);
      return number(type);

    default:
      return todo(`unary operator ${decl.operator} not implemented yet`);
  }
};

const generateUpdate = (scope, decl) => {
  const { name } = decl.argument;

  const [ local, isGlobal ] = lookupName(scope, name);

  if (local === undefined) {
    return todo(`update expression with undefined variable`);
  }

  const idx = local.idx;
  const out = [];

  out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);
  if (!decl.prefix) out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);

  switch (decl.operator) {
    case '++':
      out.push(...number(1), [ Opcodes.add ]);
      break;

    case '--':
      out.push(...number(1), [ Opcodes.sub ]);
      break;
  }

  out.push([ isGlobal ? Opcodes.global_set : Opcodes.local_set, idx ]);
  if (decl.prefix) out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);

  return out;
};

const generateIf = (scope, decl) => {
  const out = [ ...generate(scope, decl.test) ];

  out.push(Opcodes.i32_to, [ Opcodes.if, Blocktype.void ]);
  depth.push('if');

  const consOut = generate(scope, decl.consequent);
  disposeLeftover(consOut);
  out.push(...consOut);

  if (decl.alternate) {
    out.push([ Opcodes.else ]);

    const altOut = generate(scope, decl.alternate);
    disposeLeftover(altOut);
    out.push(...altOut);
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

const generateConditional = (scope, decl) => {
  const out = [ ...generate(scope, decl.test) ];

  out.push(Opcodes.i32_to, [ Opcodes.if, valtypeBinary ]);
  depth.push('if');

  out.push(...generate(scope, decl.consequent));

  out.push([ Opcodes.else ]);
  out.push(...generate(scope, decl.alternate));

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

let depth = [];
const generateFor = (scope, decl) => {
  const out = [];

  if (decl.init) {
    out.push(...generate(scope, decl.init));
    disposeLeftover(out);
  }

  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('for');

  out.push(...generate(scope, decl.test));
  out.push(Opcodes.i32_to, [ Opcodes.if, Blocktype.void ]);
  depth.push('if');

  out.push([ Opcodes.block, Blocktype.void ]);
  depth.push('block');
  out.push(...generate(scope, decl.body));
  out.push([ Opcodes.end ]);

  out.push(...generate(scope, decl.update));
  depth.pop();

  out.push([ Opcodes.br, 1 ]);
  out.push([ Opcodes.end ], [ Opcodes.end ]);
  depth.pop(); depth.pop();

  return out;
};

const generateWhile = (scope, decl) => {
  const out = [];

  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('while');

  out.push(...generate(scope, decl.test));
  out.push(Opcodes.i32_to, [ Opcodes.if, Blocktype.void ]);
  depth.push('if');

  out.push(...generate(scope, decl.body));

  out.push([ Opcodes.br, 1 ]);
  out.push([ Opcodes.end ], [ Opcodes.end ]);
  depth.pop(); depth.pop();

  return out;
};

const getNearestLoop = () => {
  for (let i = depth.length - 1; i >= 0; i--) {
    if (depth[i] === 'while' || depth[i] === 'for') return i;
  }

  return -1;
};

const generateBreak = (scope, decl) => {
  const nearestLoop = depth.length - getNearestLoop();
  return [
    [ Opcodes.br, ...signedLEB128(nearestLoop - 2) ]
  ];
};

const generateContinue = (scope, decl) => {
  const nearestLoop = depth.length - getNearestLoop();
  return [
    [ Opcodes.br, ...signedLEB128(nearestLoop - 3) ]
  ];
};

const generateThrow = (scope, decl) => {
  scope.throws = true;

  let message = decl.argument.value, constructor = null;

  // hack: throw new X("...") -> throw "..."
  if (!message && (decl.argument.type === 'NewExpression' || decl.argument.type === 'CallExpression')) {
    constructor = decl.argument.callee.name;
    message = decl.argument.arguments[0].value;
  }

  if (tags.length === 0) tags.push({
    params: [ Valtype.i32 ],
    results: [],
    idx: tags.length
  });

  let exceptId = exceptions.push({ constructor, message }) - 1;
  let tagIdx = tags[0].idx;

  // todo: write a description of how this works lol

  return [
    [ Opcodes.i32_const, signedLEB128(exceptId) ],
    [ Opcodes.throw, tagIdx ]
  ];
};

const generateTry = (scope, decl) => {
  if (decl.finalizer) return todo('try finally not implemented yet');

  const out = [];

  out.push([ Opcodes.try, Blocktype.void ]);
  depth.push('try');

  out.push(...generate(scope, decl.block));

  if (decl.handler) {
    depth.pop();
    depth.push('catch');

    out.push([ Opcodes.catch_all ]);
    out.push(...generate(scope, decl.handler.body));
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

const generateEmpty = (scope, decl) => {
  return [];
};

const generateAssignPat = (scope, decl) => {
  // TODO
  // if identifier declared, use that
  // else, use default (right)
  return todo('assignment pattern (optional arg)');
};

let pages = new Map();
const allocPage = reason => {
  if (pages.has(reason)) return pages.get(reason);

  let ind = pages.size + 1; // base (1) + current page amount
  pages.set(reason, ind);

  if (codeLog) log('codegen', `allocated new page of memory (${ind}) | ${reason}`);

  return ind;
};

let arrays = new Map();
const generateArray = (scope, decl, global = false, name = '$undeclared', initEmpty = false) => {
  const out = [];

  if (!arrays.has(name) || name === '$undeclared') {
    if (process.argv.includes('-runtime-alloc')) {
      out.push(
        ...number(1, Valtype.i32),
        [ Opcodes.memory_grow, 0 ],
        [ Opcodes.drop ]
      );
    } else {
      // todo: can we just have 1 undeclared array? probably not? but this is not really memory efficient
      const uniqueName = name === '$undeclared' ? name + Math.random().toString().slice(2) : name;
      arrays.set(name, allocPage(`array: ${uniqueName}`) - 1);
    }
  }

  let arrayNumber = arrays.get(name);

  const length = decl.elements.length;

  if (name) {
    const target = global ? globals : scope.locals;
    const lengthName = '__' + name + '_length';

    let idx;
    if (target[lengthName]) {
      idx = target[lengthName].idx;
    } else {
      idx = global ? globalInd++ : scope.localInd++;
      target[lengthName] = { idx, type: valtypeBinary };
    }

    out.push(
      ...number(length),
      [ global ? Opcodes.global_set : Opcodes.local_set, idx ]
    );
  }

  if (!initEmpty) for (let i = 0; i < length; i++) {
    if (decl.elements[i] === undefined) continue;

    out.push(
      ...number((arrayNumber + 1) * PageSize + i * ValtypeSize[valtype], Valtype.i32),
      ...generate(scope, decl.elements[i]),
      [ Opcodes.store, Math.log2(ValtypeSize[valtype]), 0 ]
    );
  }

  // local value as array number
  out.push(...number(arrayNumber));

  scope.memory = true;

  return out;
};

export const generateMember = (scope, decl) => {
  // this is just for arr[ind] for now. objects are partially supported via object hack (a.b -> __a_b)
  const name = decl.object.name;
  if (!name || getNodeType(scope, decl.object) !== TYPES._array) return todo(`computed member expression for objects are not supported yet`);

  // todo: fallback on using actual local value?
  const arrayNumber = arrays.get(name);

  scope.memory = true;

  return [
    // get index as valtype
    ...generate(scope, decl.property),

    // convert to i32 and turn into byte offset by * valtypeSize (4 for i32, 8 for i64/f64)
    Opcodes.i32_to,
    ...number(ValtypeSize[valtype], Valtype.i32),
    [ Opcodes.i32_mul ],

    // read from memory
    [ Opcodes.load, Math.log2(ValtypeSize[valtype]), ...unsignedLEB128((arrayNumber + 1) * PageSize) ]
  ];
};

const randId = () => Math.random().toString(16).slice(0, -4);

const objectHack = node => {
  if (node.type === 'MemberExpression') {
    if (node.computed || node.optional) return node;

    let objectName = node.object.name;

    // if object is not identifier or another member exp, give up
    if (node.object.type !== 'Identifier' && node.object.type !== 'MemberExpression') return node;

    if (!objectName) objectName = objectHack(node.object).name.slice(2);

    const name = '__' + objectName + '_' + node.property.name;
    if (codeLog) log('codegen', `object hack! ${node.object.name}.${node.property.name} -> ${name}`);

    return {
      type: 'Identifier',
      name
    };
  }

  for (const x in node) {
    if (node[x] != null && typeof node[x] === 'object') {
      if (node[x].type) node[x] = objectHack(node[x]);
      if (Array.isArray(node[x])) node[x] = node[x].map(y => objectHack(y));
    }
  }

  return node;
};

const generateFunc = (scope, decl) => {
  if (decl.async) return todo('async functions are not supported');
  if (decl.generator) return todo('generator functions are not supported');

  const name = decl.id ? decl.id.name : `anonymous_${randId()}`;
  const params = decl.params?.map(x => x.name) ?? [];

  // const innerScope = { ...scope };
  // TODO: share scope/locals between !!!
  const innerScope = {
    locals: {},
    localInd: 0,
    returns: [ valtypeBinary ],
    memory: false,
    throws: false,
    name
  };

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    innerScope.locals[param] = { idx: innerScope.localInd++, type: valtypeBinary };
  }

  let body = objectHack(decl.body);
  if (decl.type === 'ArrowFunctionExpression' && decl.expression) {
    // hack: () => 0 -> () => return 0
    body = {
      type: 'ReturnStatement',
      argument: decl.body
    };
  }

  const wasm = generate(innerScope, body);
  const func = {
    name,
    params: Object.values(innerScope.locals).slice(0, params.length).map(x => x.type),
    returns: innerScope.returns,
    returnType: innerScope.returnType ?? TYPES.number,
    locals: innerScope.locals,
    memory: innerScope.memory,
    throws: innerScope.throws,
    index: currentFuncIndex++
  };
  funcIndex[name] = func.index;

  // quick hack fixes
  for (const inst of wasm) {
    if (inst[0] === Opcodes.call && inst[1] === -1) {
      inst[1] = func.index;
    }
  }

  if (name !== 'main' && func.returns.length !== 0 && wasm[wasm.length - 1]?.[0] !== Opcodes.return && countLeftover(wasm) === 0) {
    wasm.push(...number(0), [ Opcodes.return ]);
  }

  // change v128 params into many <type> (i32x4 -> i32/etc) instead as unsupported param valtype
  let offset = 0, vecParams = 0;
  for (let i = 0; i < params.length; i++) {
    const name = params[i];
    const local = func.locals[name];
    if (local.type === Valtype.v128) {
      vecParams++;

      /* func.memory = true; // mark func as using memory

      wasm.unshift( // add v128 load for param
        [ Opcodes.i32_const, 0 ],
        [ ...Opcodes.v128_load, 0, i * 16 ],
        [ Opcodes.local_set, local.idx ]
      ); */

      // using params and replace_lane is noticably faster than just loading from memory (above) somehow

      // extract valtype and lane count from vec type (i32x4 = i32 4, i8x16 = i8 16, etc)
      const { vecType } = local;
      let [ type, lanes ] = vecType.split('x');
      if (!type || !lanes) throw new Error('bad metadata from vec params'); // sanity check

      lanes = parseInt(lanes);
      type = Valtype[type];

      const name = params[i]; // get original param name

      func.params.splice(offset, 1, ...new Array(lanes).fill(type)); // add new params of {type}, {lanes} times

      // update index of original local
      // delete func.locals[name];

      // add new locals for params
      for (let j = 0; j < lanes; j++) {
        func.locals[name + j] = { idx: offset + j, type, vecParamAutogen: true };
      }

      // prepend wasm to generate expected v128 locals
      wasm.splice(i * 2 + offset * 2, 0,
        ...i32x4(0, 0, 0, 0),
        ...new Array(lanes).fill(0).flatMap((_, j) => [
          [ Opcodes.local_get, offset + j ],
          [ ...Opcodes[vecType + '_replace_lane'], j ]
        ]),
        [ Opcodes.local_set, i ]
      );

      offset += lanes;

      // note: wrapping is disabled for now due to perf/dx concerns (so this will never run)
      /* if (!func.name.startsWith('#')) func.name = '##' + func.name;

      // add vec type index to hash name prefix for wrapper to know how to wrap
      const vecTypeIdx = [ 'i8x16', 'i16x8', 'i32x4', 'i64x2', 'f32x4', 'f64x2' ].indexOf(local.vecType);
      const secondHash = func.name.slice(1).indexOf('#');
      func.name = '#' + func.name.slice(1, secondHash) + vecTypeIdx + func.name.slice(secondHash); */
    }
  }

  if (offset !== 0) {
    // bump local indexes for all other locals after
    for (const x in func.locals) {
      const local = func.locals[x];
      if (!local.vecParamAutogen) local.idx += offset;
    }

    // bump local indexes in wasm local.get/set
    for (let j = 0; j < wasm.length; j++) {
      const inst = wasm[j];
      if (j < offset * 2 + vecParams * 2) {
        if (inst[0] === Opcodes.local_set) inst[1] += offset;
        continue;
      }

      if (inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_set) inst[1] += offset;
    }
  }

  // change v128 return into many <type> instead as unsupported return valtype
  const lastReturnLocal = wasm.length > 2 && wasm[wasm.length - 1][0] === Opcodes.return && Object.values(func.locals).find(x => x.idx === wasm[wasm.length - 2][1]);
  if (lastReturnLocal && lastReturnLocal.type === Valtype.v128) {
    const name = Object.keys(func.locals)[Object.values(func.locals).indexOf(lastReturnLocal)];
    // extract valtype and lane count from vec type (i32x4 = i32 4, i8x16 = i8 16, etc)
    const { vecType } = lastReturnLocal;
    let [ type, lanes ] = vecType.split('x');
    if (!type || !lanes) throw new Error('bad metadata from vec params'); // sanity check

    lanes = parseInt(lanes);
    type = Valtype[type];

    const vecIdx = lastReturnLocal.idx;

    const lastIdx = Math.max(0, ...Object.values(func.locals).map(x => x.idx));
    const tmpIdx = [];
    for (let i = 0; i < lanes; i++) {
      const idx = lastIdx + i + 1;
      tmpIdx.push(idx);
      func.locals[name + i] = { idx, type, vecReturnAutogen: true };
    }

    wasm.splice(wasm.length - 1, 1,
      ...new Array(lanes).fill(0).flatMap((_, i) => [
        i === 0 ? null : [ Opcodes.local_get, vecIdx ],
        [ ...Opcodes[vecType + '_extract_lane'], i ],
        [ Opcodes.local_set, tmpIdx[i] ],
      ].filter(x => x !== null)),
      ...new Array(lanes).fill(0).map((_, i) => [ Opcodes.local_get, tmpIdx[i]])
    );

    func.returns = new Array(lanes).fill(type);
  }

  func.wasm = wasm;

  funcs.push(func);

  return func;
};

const generateCode = (scope, decl) => {
  const out = [];

  for (const x of decl.body) {
    out.push(...generate(scope, x));
  }

  return out;
};

const internalConstrs = {
  Array: {
    generate: (scope, decl, global, name) => {
      // new Array(i0, i1, ...)
      if (decl.arguments.length > 1) return generateArray(scope, {
        elements: decl.arguments
      }, global, name);

      // new Array(n)
      // todo: only works with literal argument
      const value = decl.arguments[0]?.value ?? 0;
      if (value < 0 || !Number.isFinite(value) || value > 4294967295) return internalThrow(scope, 'RangeThrow', 'Invalid array length');

      return generateArray(scope, {
        elements: new Array(value)
      }, global, name, true);
    },
    type: TYPES._array
  }
};

export default program => {
  globals = {};
  globalInd = 0;
  tags = [];
  exceptions = [];
  funcs = [];
  funcIndex = {};
  depth = [];
  typeStates = {};
  arrays = new Map();
  pages = new Map();
  currentFuncIndex = importedFuncs.length;

  globalThis.valtype = 'f64';

  const valtypeOpt = process.argv.find(x => x.startsWith('-valtype='));
  if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

  globalThis.valtypeBinary = Valtype[valtype];

  const valtypeInd = ['i32', 'i64', 'f64'].indexOf(valtype);

  // set generic opcodes for current valtype
  Opcodes.const = [ Opcodes.i32_const, Opcodes.i64_const, Opcodes.f64_const ][valtypeInd];
  Opcodes.eq = [ Opcodes.i32_eq, Opcodes.i64_eq, Opcodes.f64_eq ][valtypeInd];
  Opcodes.eqz = [ [ [ Opcodes.i32_eqz ] ], [ [ Opcodes.i64_eqz ] ], [ ...number(0), [ Opcodes.f64_eq ] ] ][valtypeInd];
  Opcodes.mul = [ Opcodes.i32_mul, Opcodes.i64_mul, Opcodes.f64_mul ][valtypeInd];
  Opcodes.add = [ Opcodes.i32_add, Opcodes.i64_add, Opcodes.f64_add ][valtypeInd];
  Opcodes.sub = [ Opcodes.i32_sub, Opcodes.i64_sub, Opcodes.f64_sub ][valtypeInd];

  Opcodes.i32_to = [ [ null ], [ Opcodes.i32_wrap_i64 ], Opcodes.i32_trunc_sat_f64_s ][valtypeInd];
  Opcodes.i32_from = [ [ null ], [ Opcodes.i64_extend_i32_s ], [ Opcodes.f64_convert_i32_s ] ][valtypeInd];

  Opcodes.load = [ Opcodes.i32_load, Opcodes.i64_load, Opcodes.f64_load ][valtypeInd];
  Opcodes.store = [ Opcodes.i32_store, Opcodes.i64_store, Opcodes.f64_store ][valtypeInd];

  builtinFuncs = new BuiltinFuncs();
  builtinVars = new BuiltinVars();
  prototypeFuncs = new PrototypeFuncs();

  program.id = { name: 'main' };

  const scope = {
    locals: {},
    localInd: 0
  };

  program.body = {
    type: 'BlockStatement',
    body: program.body
  };

  generateFunc(scope, program);

  const main = funcs[funcs.length - 1];
  main.export = true;
  main.returns = [ valtypeBinary ];

  const lastInst = main.wasm[main.wasm.length - 1] ?? [ Opcodes.end ];
  if (lastInst[0] === Opcodes.drop) {
    main.wasm.splice(main.wasm.length - 1, 1);

    const finalStatement = program.body.body[program.body.body.length - 1];
    main.returnType = getNodeType(main, finalStatement);

    if (main.returnType === TYPES._array) {
      // if last thing in main is an array return [ arrayNumber, length ]

      const lastName = finalStatement.expression?.name ?? finalStatement.expression?.left?.name ?? '$undeclared';
      const lengthName = '__' + lastName + '_length';
      const [ lengthLocal, lengthIsGlobal ] = lookupName(main, lengthName);

      if (lengthLocal) {
        main.wasm.push([ lengthIsGlobal ? Opcodes.global_get : Opcodes.local_get, lengthLocal.idx ]);
        main.returns = [ valtypeBinary, valtypeBinary ];
      }
    }
  }

  if (lastInst[0] === Opcodes.end || lastInst[0] === Opcodes.local_set || lastInst[0] === Opcodes.global_set) {
    main.returns = [];
  }

  if (lastInst[0] === Opcodes.call) {
    const func = funcs.find(x => x.index === lastInst[1]);
    if (func) main.returns = func.returns.slice();
      else main.returns = [];
  }

  // if blank main func and other exports, remove it
  if (main.wasm.length === 0 && funcs.reduce((acc, x) => acc + (x.export ? 1 : 0), 0) > 1) funcs.splice(funcs.length - 1, 1);

  return { funcs, globals, tags, exceptions, pages };
};