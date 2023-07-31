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
      return generateBinaryExp(scope, decl, global, name);

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
      return generateLiteral(scope, decl, global, name);

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
      return generateMember(scope, decl, global, name);

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
          allocPage('asm instrinsic');
          // todo: add to store/load offset insts
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

const concatStrings = (scope, left, right, global, name, assign) => {
  // todo: this should be rewritten into a built-in/func: String.prototype.concat
  // todo: convert left and right to strings if not
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?

  scope.memory = true;

  const getLocalTmp = (name, type = Valtype.i32) => {
    if (scope.locals[name]) return scope.locals[name].idx;

    let idx = scope.localInd++;
    scope.locals[name] = { idx, type };

    return idx;
  };

  const pointer = arrays.get(name ?? '$undeclared');

  const rightPointer = getLocalTmp(`concat_right_pointer`);
  const rightLength = getLocalTmp(`concat_right_length`);
  const leftLength = getLocalTmp(`concat_left_length`);

  if (assign) {
    return [
      // setup right
      ...right,
      Opcodes.i32_to,
      [ Opcodes.local_set, rightPointer ],

      // calculate length
      ...number(0, Valtype.i32), // base 0 for store later

      ...number(pointer, Valtype.i32),
      [ Opcodes.i32_load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(0) ],
      [ Opcodes.local_tee, leftLength ],

      [ Opcodes.local_get, rightPointer ],
      [ Opcodes.i32_load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(0) ],
      [ Opcodes.local_tee, rightLength ],

      [ Opcodes.i32_add ],

      // store length
      [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ],

      // copy right
      // dst = out pointer + length size + current length * i16 size
      ...number(pointer + ValtypeSize.i32, Valtype.i32),

      [ Opcodes.local_get, leftLength ],
      ...number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_mul ],
      [ Opcodes.i32_add ],

      // src = right pointer + length size
      [ Opcodes.local_get, rightPointer ],
      ...number(ValtypeSize.i32, Valtype.i32),
      [ Opcodes.i32_add ],

      // size = right length * i16 size
      [ Opcodes.local_get, rightLength ],
      ...number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_mul ],

      [ ...Opcodes.memory_copy, 0x00, 0x00 ],

      // return new string (page)
      ...number(pointer)
    ];
  }

  const leftPointer = getLocalTmp(`concat_left_pointer`);

  const newOut = makeArray(scope, {
    rawElements: new Array(0)
  }, global, name, true, 'i16');

  return [
    // setup new/out array
    ...newOut,
    [ Opcodes.drop ],

    // setup left
    ...left,
    Opcodes.i32_to,
    [ Opcodes.local_set, leftPointer ],

    // setup right
    ...right,
    Opcodes.i32_to,
    [ Opcodes.local_set, rightPointer ],

    // calculate length
    ...number(0, Valtype.i32), // base 0 for store later

    [ Opcodes.local_get, leftPointer ],
    [ Opcodes.i32_load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(0) ],
    [ Opcodes.local_tee, leftLength ],

    [ Opcodes.local_get, rightPointer ],
    [ Opcodes.i32_load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128(0) ],
    [ Opcodes.local_tee, rightLength ],

    [ Opcodes.i32_add ],

    // store length
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ],

    // copy left
    // dst = out pointer + length size
    ...number(pointer + ValtypeSize.i32, Valtype.i32),

    // src = left pointer + length size
    [ Opcodes.local_get, leftPointer ],
    ...number(ValtypeSize.i32, Valtype.i32),
    [ Opcodes.i32_add ],

    // size = PageSize - length size. we do not need to calculate length as init value
    ...number(pageSize - ValtypeSize.i32, Valtype.i32),
    [ ...Opcodes.memory_copy, 0x00, 0x00 ],

    // copy right
    // dst = out pointer + length size + left length * i16 size
    ...number(pointer + ValtypeSize.i32, Valtype.i32),

    [ Opcodes.local_get, leftLength ],
    ...number(ValtypeSize.i16, Valtype.i32),
    [ Opcodes.i32_mul ],
    [ Opcodes.i32_add ],

    // src = right pointer + length size
    [ Opcodes.local_get, rightPointer ],
    ...number(ValtypeSize.i32, Valtype.i32),
    [ Opcodes.i32_add ],

    // size = right length * i16 size
    [ Opcodes.local_get, rightLength ],
    ...number(ValtypeSize.i16, Valtype.i32),
    [ Opcodes.i32_mul ],

    [ ...Opcodes.memory_copy, 0x00, 0x00 ],

    // return new string (page)
    ...number(pointer)
  ];
};

const falsy = (scope, wasm, type) => {
  // arrays are always truthy
  if (type === TYPES._array) return [
    ...wasm,
    [ Opcodes.drop ],
    number(0)
  ];

  if (type === TYPES.string) {
    // if "" (length = 0)
    return [
      // pointer
      ...wasm,

      // get length
      [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

      // if length == 0
      [ Opcodes.i32_eqz ],
      Opcodes.i32_from
    ]
  }

  // if = 0
  return [
    ...wasm,

    ...Opcodes.eqz,
    Opcodes.i32_from
  ];
};

const truthy = (scope, wasm, type) => {
  // arrays are always truthy
  if (type === TYPES._array) return [
    ...wasm,
    [ Opcodes.drop ],
    number(1)
  ];

  if (type === TYPES.string) {
    // if not "" (length = 0)
    return [
      // pointer
      ...wasm,

      // get length
      [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

      // if length != 0
      /* [ Opcodes.i32_eqz ],
      [ Opcodes.i32_eqz ], */
      Opcodes.i32_from
    ]
  }

  // if != 0
  return [
    ...wasm,

    /* Opcodes.eqz,
    [ Opcodes.i32_eqz ],
    Opcodes.i32_from */
  ];
};

const performOp = (scope, op, left, right, leftType, rightType, _global = false, _name = '$unspecified', assign = false) => {
  if (op === '||' || op === '&&' || op === '??') {
    return performLogicOp(scope, op, left, right);
  }

  if (leftType === TYPES.string || rightType === TYPES.string) {
    if (op === '+') {
      // string concat (a + b)
      return concatStrings(scope, left, right, _global, _name, assign);
    }

    // any other math op, NaN
    if (!['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(op)) return number(NaN);

    // else false for bools
    // todo: handle == 0 (and >= <=)
    return number(0);
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

const generateBinaryExp = (scope, decl, _global, _name) => {
  const out = [
    ...performOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right), getNodeType(scope, decl.left), getNodeType(scope, decl.right), _global, _name)
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

const TYPE_NAMES = {
  [TYPES.number]: 'Number',
  [TYPES.boolean]: 'Boolean',
  [TYPES.string]: 'String',
  [TYPES.undefined]: 'undefined',
  [TYPES.object]: 'Object',
  [TYPES.function]: 'Function',
  [TYPES.symbol]: 'Symbol',
  [TYPES.bigint]: 'BigInt',

  [TYPES._array]: 'Array'
};

let typeStates = {};

const getType = (scope, _name) => {
  const name = mapName(_name);
  if (scope.locals[name]) return typeStates[name];

  if (builtinVars[name]) return TYPES[builtinVars[name].type ?? 'number'];
  if (builtinFuncs[name] !== undefined || importedFuncs[name] !== undefined || funcIndex[name] !== undefined || internalConstrs[name] !== undefined) return TYPES.function;
  if (globals[name]) return typeStates[name];

  if (name.startsWith('__Array_prototype_') && prototypeFuncs[TYPES._array][name.slice(18)]) return TYPES.function;
  if (name.startsWith('__String_prototype_') && prototypeFuncs[TYPES.string][name.slice(19)]) return TYPES.function;

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

    let protoFunc;
    // ident.func()
    if (name && name.startsWith('__')) {
      const spl = name.slice(2).split('_');

      const baseName = spl.slice(0, -1).join('_');
      const baseType = getType(scope, baseName);

      const func = spl[spl.length - 1];
      protoFunc = prototypeFuncs[baseType]?.[func];
    }

    // literal.func()
    if (!name && node.callee.type === 'MemberExpression') {
      const baseType = getNodeType(scope, node.callee.object);

      const func = node.callee.property.name;
      protoFunc = prototypeFuncs[baseType]?.[func];
    }

    if (protoFunc) return protoFunc.returnType ?? TYPES.number;

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

  if (node.type === 'BinaryExpression') {
    if (['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(node.operator)) return TYPES.boolean;

    if (node.operator === '+' && (getNodeType(scope, node.left) === TYPES.string || getNodeType(scope, node.right) === TYPES.string)) return TYPES.string;
  }

  if (node.type === 'UnaryExpression') {
    if (node.operator === '!') return TYPES.boolean;
    if (node.operator === 'void') return TYPES.undefined;
    if (node.operator === 'delete') return TYPES.boolean;
  }

  if (node.type === 'MemberExpression') {
    const objectType = getNodeType(scope, node.object);

    if (objectType === TYPES.string && node.computed) return TYPES.string;
  }

  // default to number
  return TYPES.number;
};

const generateLiteral = (scope, decl, global, name) => {
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

      const str = decl.value;
      const rawElements = new Array(str.length);
      for (let i = 0; i < str.length; i++) {
        rawElements[i] = str.charCodeAt(i);
      }

      return makeArray(scope, {
        rawElements
      }, global, name, false, 'i16');

    default:
      return todo(`cannot generate literal of type ${typeof decl.value}`);
  }
};

const countLeftover = wasm => {
  let count = 0, depth = 0;

  for (const inst of wasm) {
    if (depth === 0 && (inst[0] === Opcodes.if || inst[0] === Opcodes.block || inst[0] === Opcodes.loop)) {
      if (inst[0] === Opcodes.if) count--;
      if (inst[1] !== Blocktype.void) count++;
    }
    if ([Opcodes.if, Opcodes.try, Opcodes.loop, Opcodes.block].includes(inst[0])) depth++;
    if (inst[0] === Opcodes.end) depth--;

    if (depth === 0)
      if ([Opcodes.throw, Opcodes.return, Opcodes.drop, Opcodes.local_set, Opcodes.global_set].includes(inst[0])) count--;
        else if ([null, Opcodes.i32_eqz, Opcodes.i64_eqz, Opcodes.f64_ceil, Opcodes.f64_floor, Opcodes.f64_trunc, Opcodes.f64_nearest, Opcodes.f64_sqrt, Opcodes.local_tee, Opcodes.i32_wrap_i64, Opcodes.i64_extend_i32_s, Opcodes.i64_extend_i32_u, Opcodes.f32_demote_f64, Opcodes.f64_promote_f32, Opcodes.f64_convert_i32_s, Opcodes.f64_convert_i32_u, Opcodes.i32_clz, Opcodes.i32_ctz, Opcodes.i32_popcnt, Opcodes.f64_neg, Opcodes.end, Opcodes.i32_trunc_sat_f64_s[0], Opcodes.i32x4_extract_lane, Opcodes.i16x8_extract_lane, Opcodes.i32_load, Opcodes.i64_load, Opcodes.f64_load, Opcodes.v128_load, Opcodes.i32_load16_u, Opcodes.i32_load16_s, Opcodes.memory_grow].includes(inst[0]) && (inst[0] !== 0xfc || inst[1] < 0x0a)) {}
        else if ([Opcodes.local_get, Opcodes.global_get, Opcodes.f64_const, Opcodes.i32_const, Opcodes.i64_const, Opcodes.v128_const].includes(inst[0])) count++;
        else if ([Opcodes.i32_store, Opcodes.i64_store, Opcodes.f64_store, Opcodes.i32_store16].includes(inst[0])) count -= 2;
        else if (Opcodes.memory_copy[0] === inst[0] && Opcodes.memory_copy[1] === inst[1]) count -= 3;
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

const arrayUtil = {
  getLengthI32: pointer => [
    ...number(0, Valtype.i32),
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ]
  ],

  getLength: pointer => [
    ...number(0, Valtype.i32),
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ],
    Opcodes.i32_from
  ],

  setLengthI32: (pointer, value) => [
    ...number(0, Valtype.i32),
    ...value,
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ]
  ],

  setLength: (pointer, value) => [
    ...number(0, Valtype.i32),
    ...value,
    Opcodes.i32_to,
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ]
  ]
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

  let out = [];
  let protoFunc, protoName, baseType, baseName = '$undeclared';
  // ident.func()
  if (name && name.startsWith('__')) {
    const spl = name.slice(2).split('_');

    baseName = spl.slice(0, -1).join('_');
    baseType = getType(scope, baseName);

    const func = spl[spl.length - 1];
    protoFunc = prototypeFuncs[baseType]?.[func] ?? Object.values(prototypeFuncs).map(x => x[func]).find(x => x);
    protoName = func;
  }

  // literal.func()
  if (!name && decl.callee.type === 'MemberExpression') {
    baseType = getNodeType(scope, decl.callee.object);

    const func = decl.callee.property.name;
    protoFunc = prototypeFuncs[baseType]?.[func] ?? Object.values(prototypeFuncs).map(x => x[func]).find(x => x);
    protoName = func;

    out = generate(scope, decl.callee.object);
    out.push([ Opcodes.drop ]);
  }

  if (protoFunc) {
    scope.memory = true;

    let pointer = arrays.get(baseName);

    if (pointer == null) {
      // unknown dynamic pointer, so clone to new pointer which we know aot. now that's what I call inefficient™
      if (codeLog) log('codegen', 'cloning unknown dynamic pointer');

      // register array
      makeArray(scope, {
        rawElements: new Array(0)
      }, _global, baseName, true, baseType === TYPES.string ? 'i16' : valtype);
      pointer = arrays.get(baseName);

      const [ local, isGlobal ] = lookupName(scope, baseName);

      out = [
        // clone to new pointer
        ...number(pointer, Valtype.i32), // dst = new pointer
        [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ], // src = unknown pointer
        Opcodes.i32_to,
        ...number(pageSize, Valtype.i32), // size = pagesize

        [ ...Opcodes.memory_copy, 0x00, 0x00 ],
      ];
    }

    if (protoFunc.noArgRetLength && decl.arguments.length === 0) return arrayUtil.getLength(pointer)

    let protoLocal;
    if (protoFunc.local) {
      const localName = `__${TYPE_NAMES[baseType]}_${protoName}_tmp`;
      if (!scope.locals[localName]) scope.locals[localName] = { idx: scope.localInd++, type: protoFunc.local };

      protoLocal = scope.locals[localName].idx;
    }

    // use local for cached i32 length as commonly used
    const lengthLocalName = `__proto_length_tmp`;
    if (!scope.locals[lengthLocalName]) scope.locals[lengthLocalName] = { idx: scope.localInd++, type: Valtype.i32 };
    let lengthLocal = scope.locals[lengthLocalName].idx;

    return [
      ...out,

      ...arrayUtil.getLengthI32(pointer),
      [ Opcodes.local_set, lengthLocal ],

      [ Opcodes.block, valtypeBinary ],
      ...protoFunc(pointer, {
        cachedI32: [ [ Opcodes.local_get, lengthLocal ] ],
        get: arrayUtil.getLength(pointer),
        getI32: arrayUtil.getLengthI32(pointer),
        set: value => arrayUtil.setLength(pointer, value),
        setI32: value => arrayUtil.setLengthI32(pointer, value)
      }, generate(scope, decl.arguments[0] ?? DEFAULT_VALUE), protoLocal, (length, itemType) => {
        const out = makeArray(scope, {
          rawElements: new Array(length)
        }, _global, _name, true, itemType);
        return [ out, arrays.get(_name ?? '$undeclared') ];
      }),
      [ Opcodes.end ]
    ];
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

  return generateCall(scope, decl, _global, _name);
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

  return [
    ...performOp(scope, decl.operator.slice(0, -1), [ [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ] ], generate(scope, decl.right), getType(scope, name), getNodeType(scope, decl.right), isGlobal, name, true),
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
      return falsy(scope, generate(scope, decl.argument));

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
  const out = truthy(scope, generate(scope, decl.test), decl.test);

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

  let ind = pages.size;
  pages.set(reason, ind);

  if (codeLog) log('codegen', `allocated new page of memory (${ind}) | ${reason}`);

  return ind;
};

const itemTypeToValtype = {
  i32: 'i32',
  i64: 'i64',
  f64: 'f64',

  i8: 'i32',
  i16: 'i32'
};

const storeOps = {
  i32: Opcodes.i32_store,
  i64: Opcodes.i64_store,
  f64: Opcodes.f64_store,

  // expects i32 input!
  i16: Opcodes.i32_store16
};

const makeArray = (scope, decl, global = false, name = '$undeclared', initEmpty = false, itemType = valtype) => {
  const out = [];

  if (!arrays.has(name) || name === '$undeclared') {
    // todo: can we just have 1 undeclared array? probably not? but this is not really memory efficient
    const uniqueName = name === '$undeclared' ? name + Math.random().toString().slice(2) : name;
    arrays.set(name, allocPage(`${itemType === 'i16' ? 'string' : 'array'}: ${uniqueName}`) * pageSize);
  }

  const pointer = arrays.get(name);

  const useRawElements = !!decl.rawElements;
  const elements = useRawElements ? decl.rawElements : decl.elements;

  const length = elements.length;

  // store length as 0th array
  out.push(
    ...number(0, Valtype.i32),
    ...number(length, Valtype.i32),
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ]
  );

  const storeOp = storeOps[itemType];
  const valtype = itemTypeToValtype[itemType];

  if (!initEmpty) for (let i = 0; i < length; i++) {
    if (elements[i] == null) continue;

    out.push(
      ...number(0, Valtype.i32),
      ...(useRawElements ? number(elements[i], Valtype[valtype]) : generate(scope, elements[i])),
      [ storeOp, Math.log2(ValtypeSize[itemType]) - 1, ...unsignedLEB128(pointer + ValtypeSize.i32 + i * ValtypeSize[itemType]) ]
    );
  }

  // local value as pointer
  out.push(...number(pointer));

  scope.memory = true;

  return out;
};

let arrays = new Map();
const generateArray = (scope, decl, global = false, name = '$undeclared', initEmpty = false) => {
  return makeArray(scope, decl, global, name, initEmpty, valtype);
};

export const generateMember = (scope, decl, _global, _name) => {
  const type = getNodeType(scope, decl.object);

  // hack: .length
  if (decl.property.name === 'length') {
    // if (![TYPES._array, TYPES.string].includes(type)) return number(UNDEFINED);

    const name = decl.object.name;
    const pointer = arrays.get(name);

    scope.memory = true;

    const aotPointer = pointer != null;

    return [
      ...(aotPointer ? number(0, Valtype.i32) : [
        ...generate(scope, decl.object),
        Opcodes.i32_to
      ]),

      [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128((aotPointer ? pointer : 0)) ],
      Opcodes.i32_from
    ];
  }

  // this is just for arr[ind] for now. objects are partially supported via object hack (a.b -> __a_b)
  if (![TYPES._array, TYPES.string].includes(type)) return todo(`computed member expression for objects are not supported yet`);

  const name = decl.object.name;
  const pointer = arrays.get(name);

  scope.memory = true;

  const aotPointer = pointer != null;

  if (type === TYPES._array) {
    return [
      // get index as valtype
      ...generate(scope, decl.property),

      // convert to i32 and turn into byte offset by * valtypeSize (4 for i32, 8 for i64/f64)
      Opcodes.i32_to,
      ...number(ValtypeSize[valtype], Valtype.i32),
      [ Opcodes.i32_mul ],

      ...(aotPointer ? [] : [
        ...generate(scope, decl.object),
        Opcodes.i32_to,
        [ Opcodes.i32_add ]
      ]),

      // read from memory
      [ Opcodes.load, Math.log2(ValtypeSize[valtype]) - 1, ...unsignedLEB128((aotPointer ? pointer : 0) + ValtypeSize.i32) ]
    ];
  }

  // string

  const newOut = makeArray(scope, {
    rawElements: new Array(1)
  }, _global, _name, true, 'i16');
  const newPointer = arrays.get(_name ?? '$undeclared');

  return [
    // setup new/out array
    ...newOut,
    [ Opcodes.drop ],

    ...number(0, Valtype.i32), // base 0 for store later

    ...generate(scope, decl.property),

    Opcodes.i32_to,
    ...number(ValtypeSize.i16, Valtype.i32),
    [ Opcodes.i32_mul ],

    ...(aotPointer ? [] : [
      ...generate(scope, decl.object),
      Opcodes.i32_to,
      [ Opcodes.i32_add ]
    ]),

    // load current string ind {arg}
    [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128((aotPointer ? pointer : 0) + ValtypeSize.i32) ],

    // store to new string ind 0
    [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ...unsignedLEB128(newPointer + ValtypeSize.i32) ],

    // return new string (page)
    ...number(newPointer)
  ];
};

const randId = () => Math.random().toString(16).slice(0, -4);

const objectHack = node => {
  if (!node) return node;

  if (node.type === 'MemberExpression') {
    if (node.computed || node.optional) return node;

    let objectName = node.object.name;

    // if object is not identifier or another member exp, give up
    if (node.object.type !== 'Identifier' && node.object.type !== 'MemberExpression') return node;

    if (!objectName) objectName = objectHack(node.object).name.slice(2);

    // if .length, give up (hack within a hack!)
    if (node.property.name === 'length') return node;

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
  Opcodes.i32_from_u = [ [ null ], [ Opcodes.i64_extend_i32_u ], [ Opcodes.f64_convert_i32_u ] ][valtypeInd];

  Opcodes.load = [ Opcodes.i32_load, Opcodes.i64_load, Opcodes.f64_load ][valtypeInd];
  Opcodes.store = [ Opcodes.i32_store, Opcodes.i64_store, Opcodes.f64_store ][valtypeInd];

  Opcodes.lt = [ Opcodes.i32_lt_s, Opcodes.i64_lt_s, Opcodes.f64_lt ][valtypeInd];

  builtinFuncs = new BuiltinFuncs();
  builtinVars = new BuiltinVars();
  prototypeFuncs = new PrototypeFuncs();

  program.id = { name: 'main' };

  globalThis.pageSize = PageSize;
  const pageSizeOpt = process.argv.find(x => x.startsWith('-page-size='));
  if (pageSizeOpt) pageSize = parseInt(pageSizeOpt.split('=')[1]) * 1024;

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