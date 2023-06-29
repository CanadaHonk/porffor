import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";
import { signedLEB128, unsignedLEB128 } from "./encoding.js";
import { operatorOpcode } from "./expression.js";
import { makeBuiltins, importedFuncs } from "./builtins.js";
import { number } from "./embedding.js";

let globals = {};
let funcs = [];
let funcIndex = {};
let currentFuncIndex = Object.keys(importedFuncs).length;
let builtins = {};

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
const generate = (scope, decl) => {
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
      return generateCall(scope, decl);

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
          scope.locals[name] = { idx, type: Valtype[type] };
          continue;
        }

        if (asm[0] === 'returns') {
          scope.returns = asm.slice(1).map(x => Valtype[x]);
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

const lookupName = (scope, name) => {
  let local = scope.locals[name];
  if (local) return [ local, false ];

  let global = globals[name];
  if (global) return [ global, true ];

  return [ undefined, undefined ];
};

const generateIdent = (scope, decl) => {
  let local = scope.locals[decl.name];

  if (decl.name === 'undefined') return number(UNDEFINED);
  if (decl.name === 'null') return number(NULL);

  if (local === undefined) {
    // no local var with name
    if (importedFuncs[decl.name] !== undefined) return number(importedFuncs[decl.name]);
    if (funcIndex[decl.name] !== undefined) return number(funcIndex[decl.name]);

    if (globals[decl.name] !== undefined) return [ [ Opcodes.global_get, globals[decl.name].idx ] ];
  }

  if (local === undefined) throw new ReferenceError(`${decl.name} is not defined (locals: ${Object.keys(scope.locals)}, globals: ${Object.keys(globals)})`);

  return [ [ Opcodes.local_get, local.idx ] ];
};

const generateReturn = (scope, decl) => {
  return [
    ...generate(scope, decl.argument),
    [ Opcodes.return ]
  ];
};

const generateBinaryExp = (scope, decl) => {
  // TODO: this assumes all variables are numbers !!!

  const out = [
    ...generate(scope, decl.left),
    ...generate(scope, decl.right),
    [ operatorOpcode[valtype][decl.operator], ]
  ];

  if (valtype === 'i64' && ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(decl.operator)) out.push([ Opcodes.i64_extend_i32_u ]);

  return out;
};

const asmFunc = (name, wasm, params, localTypes, returns) => {
  const existing = funcs.find(x => x.name === name);
  if (existing) return existing;

  const nameParam = i => params.length === 1 ? 'x' : ['a', 'b', 'c'][i];

  const allLocals = params.concat(localTypes);
  const locals = {};
  for (let i = 0; i < allLocals.length; i++) {
    locals[nameParam(i)] = { idx: i, type: allLocals[i] };
  }

  const func = {
    name,
    params,
    locals,
    returns,
    wasm,
    internal: true,
    index: currentFuncIndex++
  };

  funcs.push(func);
  funcIndex[name] = func.index;

  return func;
};

const includeBuiltin = (scope, builtin) => {
  const code = builtins[builtin];
  if (code.wasm) return asmFunc(builtin, code.wasm, code.params, code.locals, code.returns);

  return code.body.map(x => generate(scope, x));
};

const generateLogicExp = (scope, decl) => {
  const getLocalTmp = ind => {
    const name = `tmp${ind}`;
    if (scope.locals[name]) return scope.locals[name].idx;

    const idx = Object.keys(scope.locals).length;
    scope.locals[name] = { idx, type: valtypeBinary };

    return idx;
  };

  if (decl.operator === '||') {
    // it basically does:
    // {a} || {b}
    // -->
    // _ = {a}; if (!_) {b} else _

    return [
      ...generate(scope, decl.left),
      [ Opcodes.local_tee, getLocalTmp(1) ],
      // Opcodes.i32_eqz, Opcodes.i32_eqz, // != 0 (fail ||)
      // Opcodes.eqz, Opcodes.i32_eqz
      [ Opcodes.i32_to ],
      [ Opcodes.if, valtypeBinary ],
      ...generate(scope, decl.right),
      [ Opcodes.else ],
      [ Opcodes.local_get, getLocalTmp(1) ],
      [ Opcodes.end ]
    ];
  }

  if (decl.operator === '&&') {
    // it basically does:
    // {a} && {b}
    // -->
    // _ = {a}; if (_) {b} else _

    return [
      ...generate(scope, decl.left),
      [ Opcodes.local_tee, getLocalTmp(1) ],
      [ Opcodes.eqz ], // == 0 (success &&)
      [ Opcodes.if, valtypeBinary ],
      ...generate(scope, decl.right),
      [ Opcodes.else ],
      [ Opcodes.local_get, getLocalTmp(1) ],
      [ Opcodes.end ]
    ];
  }

  return todo(`logical op ${decl.operator} not implemented`);
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
      if (decl.value.length > 1) todo(`cannot generate string literal (char only)`);

      // hack: char as int
      return number(decl.value.charCodeAt(0));

    default:
      return todo(`cannot generate literal of type ${typeof decl.value}`);
  }
};

const generateExp = (scope, decl) => {
  const expression = decl.expression;

  return generate(scope, expression);
};

const generateCall = (scope, decl) => {
  /* const callee = decl.callee;
  const args = decl.arguments;

  return [
    ...generate(args),
    ...generate(callee),
    Opcodes.call_indirect,
  ]; */

  if (isFuncType(decl.callee.type)) {
    const func = generateFunc(decl.callee);
  }

  const name = decl.callee.name;

  // TODO: only allows callee as literal
  if (!name) return todo(`only literal callees (got ${decl.callee.type})`);

  let idx = funcIndex[name] ?? importedFuncs[name];
  if (idx === undefined && builtins[name]) {
    includeBuiltin(scope, name);
    idx = funcIndex[name];
  }

  if (idx === undefined) throw new Error(`failed to find func idx for ${name} (funcIndex: ${Object.keys(funcIndex)})`);

  const out = [];
  for (const arg of decl.arguments) {
    out.push(...generate(scope, arg));
  }

  out.push([ Opcodes.call, idx ]);

  return out;
};

// bad hack for undefined and null working without additional logic
const UNDEFINED = 0, NULL = 0;
const DEFAULT_VALUE = {
  type: 'Identifier',
  name: 'undefined'
};

const generateVar = (scope, decl, globalWanted = false) => {
  const out = [];

  // global variable if in top scope (main) and var ..., or if wanted
  const global = globalWanted || (scope.name === 'main' && decl.kind === 'var');
  const target = global ? globals : scope.locals;

  for (const x of decl.declarations) {
    const name = x.id.name;

    if (x.init && isFuncType(x.init.type)) {
      // hack for let a = function () { ... }
      x.init.id = { name };
      generateFunc(scope, x.init);
      continue;
    }

    const idx = Object.keys(target).length;
    target[name] = { idx, type: valtypeBinary };

    out.push(...generate(scope, x.init ?? DEFAULT_VALUE));

    // if our value is the result of a function, infer the type from that func's return value
    if (out[out.length - 1][0] === Opcodes.call) {
      const ind = out[out.length - 1][1];
      if (ind >= Object.keys(importedFuncs).length) { // not an imported func
        const func = funcs.find(x => x.index === ind);
        if (!func) throw new Error('could not find func being called as var value to infer type'); // sanity check

        const returns = func.returns;
        if (returns.length > 1) throw new Error('func returning >1 value being set as 1 local'); // sanity check

        target[name].type = func.returns[0];
      } else {
        // we do not have imports that return yet, ignore for now
      }
    }

    out.push([ global ? Opcodes.global_set : Opcodes.local_set, idx ]);
  }

  return out;
};

const generateAssign = (scope, decl) => {
  const { name } = decl.left;

  if (isFuncType(decl.right.type)) {
    // hack for a = function () { ... }
    decl.right.id = { name };
    generateFunc(scope, decl.right);
    return [];
  }

  const [ local, isGlobal ] = lookupName(scope, name);

  if (local === undefined) {
    // set global (eg a = 2)
    return generateVar(scope, { declarations: [ { id: { name }, init: decl.right } ] }, true);
  }

  return [
    ...generate(scope, decl.right),
    [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ]
  ];
};

const generateUnary = (scope, decl) => {
  const out = [ ...generate(scope, decl.argument) ];

  switch (decl.operator) {
    case '+':
      // stub
      break;

    case '-':
      // * -1
      out.push(...number(-1), [ Opcodes.mul ]);
      break;

    case '!':
      // !=
      out.push([ Opcodes.eqz ]);
      if (valtype === 'i64') out.push([ Opcodes.i64_extend_i32_u ]);
      break;
  }

  return out;
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

  out.push([ Opcodes.i32_to ], [ Opcodes.if, Blocktype.void ]);
  depth.push('if');

  out.push(...generate(scope, decl.consequent));

  if (decl.alternate) {
    out.push([ Opcodes.else ]);
    out.push(...generate(scope, decl.alternate));
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

let depth = [];
const generateFor = (scope, decl) => {
  const out = [];

  if (decl.init) out.push(...generate(scope, decl.init));

  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('for');

  out.push(...generate(scope, decl.test));
  out.push([ Opcodes.i32_to ], [ Opcodes.if, Blocktype.void ]);
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
  out.push([ Opcodes.i32_to ], [ Opcodes.if, Blocktype.void ]);
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

const generateEmpty = (scope, decl) => {
  return [];
};

const generateAssignPat = (scope, decl) => {
  // TODO
  // if identifier declared, use that
  // else, use default (right)
  return todo('assignment pattern (optional arg)');
};

const randId = () => Math.random().toString(16).slice(0, -4);

const hasReturn = node => {
  if (isFuncType(node.type)) return false;

  for (const x in node) {
    if (node[x] != null && typeof node[x] === 'object') {
      if (Array.isArray(node[x]) && node[x].some(y => hasReturn(y))) return true;
      if (hasReturn(node[x])) return true;
    }
  }

  return node.type === 'ReturnStatement';
};

const objectHack = node => {
  if (node.type === 'MemberExpression') {
    let objectName = node.object.name;
    if (!objectName) objectName = objectHack(node.object).name.slice(2);

    const name = '__' + objectName + '_' + node.property.name;
    // console.log(`object hack! ${node.object.name}.${node.property.name} -> ${name}`);

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
  const name = decl.id ? decl.id.name : `anonymous_${randId()}`;
  const params = decl.params?.map(x => x.name) ?? [];

  // const innerScope = { ...scope };
  // TODO: share scope/locals between !!!
  const innerScope = { locals: {}, name };

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    innerScope.locals[param] = { idx: i, type: valtypeBinary };
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
    params: new Array(params.length).fill(valtypeBinary),
    returns: hasReturn(body) ? [ valtypeBinary ] : [],
    locals: innerScope.locals,
    index: currentFuncIndex++
  };

  if (func.returns.length !== 0 && wasm[wasm.length - 1][0] !== Opcodes.return) wasm.push(...number(0), [ Opcodes.return ]);

  if (innerScope.returns) func.returns = innerScope.returns;

  func.wasm = wasm;

  funcs.push(func);
  funcIndex[name] = func.index;

  return func;
};

const generateCode = (scope, decl) => {
  const out = [];

  for (const x of decl.body) {
    out.push(...generate(scope, x));
  }

  return out;
};

export default program => {
  globals = {};
  funcs = [];
  funcIndex = {};
  depth = [];
  currentFuncIndex = Object.keys(importedFuncs).length;

  globalThis.valtype = 'i32';

  const valtypeOpt = process.argv.find(x => x.startsWith('-valtype='));
  if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

  globalThis.valtypeBinary = Valtype[valtype];

  const valtypeInd = ['i32', 'i64', 'f64'].indexOf(valtype);

  // set generic opcodes for current valtype
  Opcodes.const = [ Opcodes.i32_const, Opcodes.i64_const, Opcodes.f64_const ][valtypeInd];
  Opcodes.eq = [ Opcodes.i32_eq, Opcodes.i64_eq, Opcodes.f64_eq ][valtypeInd];
  Opcodes.eqz = [ Opcodes.i32_eqz, Opcodes.i64_eqz, Opcodes.unreachable ][valtypeInd];
  Opcodes.mul = [ Opcodes.i32_mul, Opcodes.i64_mul, Opcodes.f64_mul ][valtypeInd];
  Opcodes.add = [ Opcodes.i32_add, Opcodes.i64_add, Opcodes.f64_add ][valtypeInd];
  Opcodes.sub = [ Opcodes.i32_sub, Opcodes.i64_sub, Opcodes.f64_sub ][valtypeInd];
  Opcodes.i32_to = [ null, Opcodes.i32_wrap_i64, Opcodes.unreachable ][valtypeInd];

  builtins = makeBuiltins();

  program.id = { name: 'main' };

  const scope = {
    locals: {}
  };

  program.body = {
    type: 'BlockStatement',
    body: program.body
  };

  generateFunc(scope, program);

  // export main
  funcs[funcs.length - 1].export = true;

  // if blank main func and other exports, remove it
  if (funcs[funcs.length - 1].wasm.length === 0 && funcs.reduce((acc, x) => acc + (x.export ? 1 : 0), 0) > 1) funcs.splice(funcs.length - 1, 1);

  return { funcs, globals };
};