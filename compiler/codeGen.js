import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";
import { signedLEB128, unsignedLEB128, encodeVector, encodeLocal } from "./encoding.js";
import { operatorOpcode } from "./expression.js";
import parse from "./parse.js";

const importedFuncs = { print: 0, printChar: 1 };
let globals = {};
let funcs = [];
let funcIndex = {};
let currentFuncIndex = Object.keys(importedFuncs).length;

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

const number = n => [ Opcodes.const, ...signedLEB128(n) ];

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

    default:
      return todo(`no generation for ${decl.type}!`);
  }
};

const generateIdent = (scope, decl) => {
  let idx = scope.locals[decl.name];

  if (decl.name === 'undefined') return number(UNDEFINED);
  if (decl.name === 'null') return number(NULL);

  if (idx === undefined) {
    // no local var with name
    if (importedFuncs[decl.name] !== undefined) return number(importedFuncs[decl.name]);
    if (funcIndex[decl.name] !== undefined) return number(funcIndex[decl.name]);

    if (globals[decl.name] !== undefined) return [ Opcodes.global_get, globals[decl.name] ];
  }

  // if (idx === undefined) throw new Error(`could not find idx for ${decl.name} (locals: ${Object.keys(scope.locals)}, globals: ${Object.keys(globals)})`);
  if (idx === undefined) throw new ReferenceError(`${decl.name} is not defined`);

  return [ Opcodes.local_get, idx ];
};

const generateReturn = (scope, decl) => {
  return [
    ...generate(scope, decl.argument),
    Opcodes.return
  ];
};

const generateBinaryExp = (scope, decl) => {
  // TODO: this assumes all variables are numbers !!!

  const out = [
    ...generate(scope, decl.left),
    ...generate(scope, decl.right),
    operatorOpcode[valtype][decl.operator],
  ];

  if (valtype === 'i64' && ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(decl.operator)) out.push(Opcodes.i64_extend_i32_u);

  return out;
};

const asmFunc = (name, wasm, params, localCount) => {
  const existing = funcs.find(x => x.name === name);
  if (existing) return existing;

  const func = {
    name,
    params,
    wasm: encodeVector([ ...encodeVector(localCount > 0 ? [encodeLocal(localCount, Valtype[valtype])] : []), ...wasm, Opcodes.end ]),
    index: currentFuncIndex++
  };

  funcs.push(func);
  funcIndex[name] = func.index;

  return func;
};

const includeBuiltin = (scope, js) => {
  return parse(js, []).body.map(x => generate(scope, x));
};

const builtins = {
  '__console_log': `function __console_log(x) { print(x); printChar('\\n'); }`
};

const generateLogicExp = (scope, decl) => {
  if (decl.operator === '||') {
    // it basically does:
    // {a} || {b}
    // -->
    // _ = {a}; if (!_) {b} else _

    if (scope.locals.tmp1 === undefined) scope.locals.tmp1 = Object.keys(scope.locals).length;

    return [
      ...generate(scope, decl.left),
      Opcodes.local_tee, scope.locals.tmp1,
      // Opcodes.i32_eqz, Opcodes.i32_eqz, // != 0 (fail ||)
      // Opcodes.eqz, Opcodes.i32_eqz
      Opcodes.i32_to,
      Opcodes.if, Valtype[valtype],
      ...generate(scope, decl.right),
      Opcodes.else,
      Opcodes.local_get, scope.locals.tmp1,
      Opcodes.end,
    ];
  }

  if (decl.operator === '&&') {
    // it basically does:
    // {a} && {b}
    // -->
    // _ = {a}; if (_) {b} else _

    if (scope.locals.tmp1 === undefined) scope.locals.tmp1 = Object.keys(scope.locals).length;

    return [
      ...generate(scope, decl.left),
      Opcodes.local_tee, scope.locals.tmp1,
      Opcodes.eqz, // == 0 (success &&)
      Opcodes.if, Valtype[valtype],
      ...generate(scope, decl.right),
      Opcodes.else,
      Opcodes.local_get, scope.locals.tmp1,
      Opcodes.end,
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

  if (decl.callee.type.endsWith('FunctionExpression')) {
    const func = generateFunc(decl.callee);
  }

  const name = decl.callee.name;

  // TODO: only allows callee as literal
  if (!name) return todo(`only literal callees (got ${decl.callee.type})`);

  let idx = funcIndex[name] ?? importedFuncs[name];
  if (idx === undefined && builtins[name]) {
    includeBuiltin(scope, builtins[name]);
    idx = funcIndex[name];
  }

  if (idx === undefined) throw new Error(`failed to find func idx for ${name} (funcIndex: ${Object.keys(funcIndex)})`);

  const out = [];
  for (const arg of decl.arguments) {
    out.push(...generate(scope, arg));
  }

  out.push(Opcodes.call, idx);

  return out;
};

// bad hack for undefined and null working without additional logic
const UNDEFINED = 0, NULL = 0;
const DEFAULT_VALUE = {
  type: 'Identifier',
  name: 'undefined'
};

const generateVar = (scope, decl, global = false) => {
  const out = [];

  // global variable if in top scope (main) and var ..., or if wanted
  if ((scope.name === 'main' && decl.kind === 'var') || global) {
    for (const x of decl.declarations) {
      const name = x.id.name;

      if (x.init && x.init.type.endsWith('FunctionExpression')) {
        // hack for var a = function () { ... }
        x.init.id = { name };
        generateFunc(scope, x.init);
        continue;
      }

      const idx = Object.keys(globals).length;
      globals[name] = idx;

      out.push(...generate(scope, x.init ?? DEFAULT_VALUE));
      out.push(Opcodes.global_set, idx);
    }

    return out;
  }

  for (const x of decl.declarations) {
    const name = x.id.name;

    if (x.init && x.init.type.endsWith('FunctionExpression')) {
      // hack for let a = function () { ... }
      x.init.id = { name };
      generateFunc(scope, x.init);
      continue;
    }

    const idx = Object.keys(scope.locals).length;
    scope.locals[name] = idx;

    out.push(...generate(scope, x.init ?? DEFAULT_VALUE));
    out.push(Opcodes.local_set, idx);
  }

  return out;
};

const generateAssign = (scope, decl) => {
  const { name } = decl.left;

  if (decl.right.type.endsWith('FunctionExpression')) {
    // hack for a = function () { ... }
    decl.right.id = { name };
    generateFunc(scope, decl.right);
    return [];
  }

  let idx = scope.locals[name], op = Opcodes.local_set;

  if (idx === undefined && globals[name] !== undefined) {
    idx = globals[name];
    op = Opcodes.global_set;
  }

  if (idx === undefined) {
    // set global (eg a = 2)
    return generateVar(scope, { declarations: [ { id: { name }, init: decl.right } ] }, true);
  }

  return [
    ...generate(scope, decl.right),
    op, idx
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
      out.push(...number(-1), Opcodes.mul);
      break;

    case '!':
      // !=
      out.push(Opcodes.eqz);
      if (valtype === 'i64') out.push(Opcodes.i64_extend_i32_u);
      break;
  }

  return out;
};

const generateUpdate = (scope, decl) => {
  const { name } = decl.argument;

  let idx = scope.locals[name], global = false;

  if (idx === undefined && globals[name] !== undefined) {
    idx = globals[name];
    global = true;
  }

  if (idx === undefined) {
    return todo(`update expression with undefined variable`);
  }

  const out = [];

  out.push(global ? Opcodes.global_get : Opcodes.local_get, idx);
  if (!decl.prefix) out.push(global ? Opcodes.global_get : Opcodes.local_get, idx);

  switch (decl.operator) {
    case '++':
      out.push(...number(1), Opcodes.add);
      break;

    case '--':
      out.push(...number(1), Opcodes.sub);
      break;
  }

  out.push(global ? Opcodes.global_set : Opcodes.local_set, idx);
  if (decl.prefix) out.push(global ? Opcodes.global_get : Opcodes.local_get, idx);

  return out;
};

const generateIf = (scope, decl) => {
  const out = [ ...generate(scope, decl.test) ];

  out.push(Opcodes.i32_to, Opcodes.if, Blocktype.void);
  depth.push('if');

  out.push(...generate(scope, decl.consequent));

  if (decl.alternate) {
    out.push(Opcodes.else);
    out.push(...generate(scope, decl.alternate));
  }

  out.push(Opcodes.end);
  depth.pop();

  return out;
};

let depth = [];
const generateFor = (scope, decl) => {
  const out = [];

  if (decl.init) out.push(...generate(scope, decl.init));

  out.push(Opcodes.loop, Blocktype.void);
  depth.push('for');

  out.push(...generate(scope, decl.test), Opcodes.i32_to);
  out.push(Opcodes.if, Blocktype.void);
  depth.push('if');

  out.push(Opcodes.block, Blocktype.void);
  depth.push('block');
  out.push(...generate(scope, decl.body));
  out.push(Opcodes.end);

  out.push(...generate(scope, decl.update));
  depth.pop();

  out.push(Opcodes.br, ...signedLEB128(1));
  out.push(Opcodes.end, Opcodes.end);
  depth.pop(); depth.pop();

  return out;
};

const generateWhile = (scope, decl) => {
  const out = [];

  out.push(Opcodes.loop, Blocktype.void);
  depth.push('while');

  out.push(...generate(scope, decl.test), Opcodes.i32_to);
  out.push(Opcodes.if, Blocktype.void);
  depth.push('if');

  out.push(...generate(scope, decl.body));

  out.push(Opcodes.br, ...signedLEB128(1));
  out.push(Opcodes.end, Opcodes.end);
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
  return [ Opcodes.br, ...signedLEB128(nearestLoop - 2) ];
};

const generateContinue = (scope, decl) => {
  const nearestLoop = depth.length - getNearestLoop();
  return [ Opcodes.br, ...signedLEB128(nearestLoop - 3) ];
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
  if (node.body && !Array.isArray(node.body)) return hasReturn(node.body);

  if (Array.isArray(node.body)) {
    for (const x of node.body) {
      if (hasReturn(x)) return true;
    }
  }

  return node.type === 'ReturnStatement';
};

const objectHack = node => {
  if (node.type === 'MemberExpression') {
    const name = '__' + node.object.name + '_' + node.property.name;
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
  const params = decl.params ?? [];

  // const innerScope = { ...scope };
  // TODO: share scope/locals between !!!
  const innerScope = { locals: {}, name };

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    innerScope.locals[param.name] = i;
  }

  let body = objectHack(decl.body);
  if (decl.type === 'ArrowFunctionExpression' && decl.expression) {
    // hack: () => 0 -> () => return 0
    body = {
      type: 'ReturnStatement',
      argument: decl.body
    };
  }

  const func = {
    name,
    params,
    return: hasReturn(body),
    locals: innerScope.locals,
    wasm: generate(innerScope, body).filter(x => x !== null),
    index: currentFuncIndex++
  };

  const localCount = Object.keys(innerScope.locals).length - params.length;
  const localDecl = localCount > 0 ? [encodeLocal(localCount, Valtype[valtype])] : [];
  func.innerWasm = func.wasm;
  func.wasm = encodeVector([ ...encodeVector(localDecl), ...func.wasm, Opcodes.end ]);

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

  global.valtype = 'i32';

  const valtypeOpt = process.argv.find(x => x.startsWith('-valtype='));
  if (valtypeOpt) valtype = valtypeOpt.split('=')[1];

  const valtypeInd = ['i32', 'i64', 'f64'].indexOf(valtype);

  Opcodes.const = [ Opcodes.i32_const, Opcodes.i64_const, Opcodes.f64_const ][valtypeInd];
  Opcodes.eqz = [ Opcodes.i32_eqz, Opcodes.i64_eqz, Opcodes.unreachable ][valtypeInd];
  Opcodes.mul = [ Opcodes.i32_mul, Opcodes.i64_mul, Opcodes.f64_mul ][valtypeInd];
  Opcodes.add = [ Opcodes.i32_add, Opcodes.i64_add, Opcodes.f64_add ][valtypeInd];
  Opcodes.sub = [ Opcodes.i32_sub, Opcodes.i64_sub, Opcodes.f64_sub ][valtypeInd];
  Opcodes.i32_to = [ null, Opcodes.i32_wrap_i64, Opcodes.unreachable ][valtypeInd];

  program.id = { name: 'main' };

  const scope = {
    locals: {}
  };

  program.body = {
    type: 'BlockStatement',
    body: program.body
  };

  generateFunc(scope, program);

  return { funcs, globals };
};