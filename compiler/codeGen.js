import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";
import { signedLEB128, unsignedLEB128, encodeVector, encodeLocal } from "./encoding.js";
import { operatorOpcode } from "./expression.js";

const importedFuncs = { print: 0 };
let globals = {};
let funcs = [];
let funcIndex = {};
let currentFuncIndex = 1;

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

const number = n => [ Opcodes.i32_const, ...signedLEB128(n) ];

const generate = (scope, decl) => {
  switch (decl.type) {
    case 'BinaryExpression':
      return generateBinaryExp(scope, decl);

    case 'Identifier':
      return generateIdent(scope, decl);

    case 'FunctionDeclaration':
      return generateFunc(scope, decl);

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

    case 'IfStatement':
      return generateIf(scope, decl);

    case 'EmptyStatement':
      return generateEmpty(scope, decl);

    default:
      return todo(`no generation for ${decl.type}!`);
  }
};

const generateIdent = (scope, decl) => {
  let idx = scope.locals[decl.name];

  if (idx === undefined) {
    // no local var with name
    if (importedFuncs[decl.name] !== undefined) return generateLiteral(importedFuncs[decl.name]);
    if (funcIndex[decl.name] !== undefined) return generateLiteral(funcIndex[decl.name]);

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

  return [
    ...generate(scope, decl.left),
    ...generate(scope, decl.right),
    operatorOpcode[decl.operator]
  ];
};

const generateLiteral = (scope, decl) => {
  switch (typeof decl.value) {
    case 'number':
      return number(decl.value);

    case 'boolean':
      // hack: bool as int (1/0)
      return number(decl.value ? 1 : 0);

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

  // TODO: only allows callee as literal
  if (!decl.callee.name) return todo(`only literal callees`);

  const idx = funcIndex[decl.callee.name] ?? importedFuncs[decl.callee.name];
  if (idx === undefined) throw new Error(`failed to find func idx for ${decl.callee.name} (funcIndex: ${Object.keys(funcIndex)})`);

  const out = [];
  for (const arg of decl.arguments) {
    out.push(...generate(scope, arg));
  }

  out.push(Opcodes.call, idx);

  return out;
};

const generateVar = (scope, decl, global = false) => {
  const out = [];

  // global variable if in top scope (main) and var ..., or if wanted
  if ((scope.name === 'main' && decl.kind === 'var') || global) {
    for (const x of decl.declarations) {
      const name = x.id.name;

      const idx = Object.keys(globals).length;
      globals[name] = idx;

      out.push(...generate(scope, x.init));
      out.push(Opcodes.global_set, idx);
    }

    return out;
  }

  for (const x of decl.declarations) {
    const name = x.id.name;

    const idx = Object.keys(scope.locals).length;
    scope.locals[name] = idx;

    out.push(...generate(scope, x.init));
    out.push(Opcodes.local_set, idx);
  }

  return out;
};

const generateAssign = (scope, decl) => {
  const { name } = decl.left;
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
      out.push(...number(-1), Opcodes.i32_mul);
      break;

    case '!':
      // !=
      out.push(Opcodes.i32_eqz);
      break;
  }

  return out;
};

const generateIf = (scope, decl) => {
  const out = [
    ...generate(scope, decl.test),
    Opcodes.if, Blocktype.void,
    ...generate(scope, decl.consequent)
  ];

  if (decl.alternate) {
    out.push(Opcodes.else);
    out.push(...generate(scope, decl.alternate));
  }

  out.push(Opcodes.end);
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

const generateFunc = (scope, decl) => {
  const name = decl.id.name;
  const params = decl.params ?? [];

  // const innerScope = { ...scope };
  // TODO: share scope/locals between !!!
  const innerScope = { locals: {}, name };

  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    innerScope.locals[param.name] = i;
  }

  const func = {
    name,
    params,
    wasm: generate(innerScope, decl.body),
    index: currentFuncIndex++
  };

  const localCount = Object.keys(innerScope.locals).length - params.length;
  const localDecl = localCount > 0 ? [encodeLocal(localCount, Valtype.i32)] : [];
  func.wasm = encodeVector([ ...encodeVector(localDecl), ...func.wasm, Opcodes.end ]);

  funcs.push(func);
  funcIndex[name] = func.index;

  return [];
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
  currentFuncIndex = 1;

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