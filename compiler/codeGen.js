import { Blocktype, Opcodes, Valtype } from "./wasmSpec.js";
import { signedLEB128, unsignedLEB128 } from "./encoding.js";
import { operatorOpcode } from "./expression.js";
import { makeBuiltins, importedFuncs } from "./builtins.js";
import { number, i32x4 } from "./embedding.js";

let globals = {};
let tags = [];
let funcs = [];
let exceptions = [];
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

    case 'ConditionalExpression':
      return generateConditional(scope, decl);

    case 'ThrowStatement':
      return generateThrow(scope, decl);

    case 'TryStatement':
      return generateTry(scope, decl);

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

  if (decl.name === 'NaN') {
    if (valtype[0] === 'i') throw new Error(`Cannot use NaN with integer valtype`);
    return number(NaN);
  }

  if (decl.name === 'Infinity') {
    if (valtype[0] === 'i') throw new Error(`Cannot use Infinity with integer valtype`);
    return number(Infinity);
  }

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
  if (decl.argument === null) {
    // just bare "return"
    return [
      ...(scope.returns.length === 0 ? [] : number(0)), // "undefined" if func returns
      [ Opcodes.return ]
    ];
  }

  scope.returns = [ valtypeBinary ];

  return [
    ...generate(scope, decl.argument),
    [ Opcodes.return ]
  ];
};

const generateBinaryExp = (scope, decl) => {
  // TODO: this assumes all variables are numbers !!!

  const opcode = operatorOpcode[valtype][decl.operator];
  if (!opcode) throw new Error(`unknown operator ${decl.operator}`)

  const out = [
    ...generate(scope, decl.left),
    ...generate(scope, decl.right),
    Array.isArray(opcode) ? opcode : [ opcode ]
  ];

  if (valtype !== 'i32' && ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(decl.operator)) out.push(Opcodes.i32_from);

  return out;
};

const asmFunc = (name, { wasm, params, locals: localTypes, returns, memory }) => {
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
    memory,
    internal: true,
    index: currentFuncIndex++
  };

  funcs.push(func);
  funcIndex[name] = func.index;

  return func;
};

const includeBuiltin = (scope, builtin) => {
  const code = builtins[builtin];
  if (code.wasm) return asmFunc(builtin, code);

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
      ...Opcodes.eqz, // == 0 (fail ||)
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
      Opcodes.i32_to, // != 0 (success &&)
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

  let name = decl.callee.name;
  if (isFuncType(decl.callee.type)) { // iife
    const func = generateFunc(scope, decl.callee);
    name = func.name;
  }

  // TODO: only allows callee as literal
  if (!name) return todo(`only literal callees (got ${decl.callee.type})`);

  let idx = funcIndex[name] ?? importedFuncs[name];
  if (idx === undefined && builtins[name]) {
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

  if (idx === undefined && name === scope.name) {
    // hack: calling self, func generator will fix later
    idx = -1;
  }

  if (idx === undefined) throw new Error(`failed to find func idx for ${name} (funcIndex: ${Object.keys(funcIndex)})`);

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
    // only allow = for this
    if (decl.operator !== '=') throw new ReferenceError(`${decl.name} is not defined (locals: ${Object.keys(scope.locals)}, globals: ${Object.keys(globals)})`);

    // set global (eg a = 2)
    return generateVar(scope, { declarations: [ { id: { name }, init: decl.right } ] }, true);
  }

  if (decl.operator === '=') {
    return [
      ...generate(scope, decl.right),
      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ]
    ];
  }

  const mathOp = decl.operator[0];
  const opcode = operatorOpcode[valtype][mathOp];
  if (!opcode) throw new Error(`unknown operator ${decl.operator}`)

  return [
    [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ],
    ...generate(scope, decl.right),
    Array.isArray(opcode) ? opcode : [ opcode ],
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

      if (decl.prefix && decl.argument.type === 'Literal' && typeof decl.argument.value === 'number') {
        // if -<N>, just return that
        return number(-1 * decl.argument.value);
      }

      out.push(...number(-1), [ Opcodes.mul ]);
      break;

    case '!':
      // !=
      out.push(...Opcodes.eqz);
      if (valtype !== 'i32') out.push(Opcodes.i32_from);
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

  out.push(Opcodes.i32_to, [ Opcodes.if, Blocktype.void ]);
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

  if (decl.init) out.push(...generate(scope, decl.init));

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
  if (!message && decl.argument.type === 'NewExpression') {
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

const randId = () => Math.random().toString(16).slice(0, -4);

const returnsValue = node => {
  if (isFuncType(node.type)) return false;

  for (const x in node) {
    if (node[x] != null && typeof node[x] === 'object') {
      if (Array.isArray(node[x]) && node[x].some(y => returnsValue(y))) return true;
      if (returnsValue(node[x])) return true;
    }
  }

  return node.type === 'ReturnStatement' && node.argument !== null;
};

const objectHack = node => {
  if (node.type === 'MemberExpression') {
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
    returns: [],
    memory: false,
    throws: false,
    name
  };

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

  if (returnsValue(body)) innerScope.returns = [ valtypeBinary ];

  const wasm = generate(innerScope, body);
  const func = {
    name,
    params: Object.values(innerScope.locals).slice(0, params.length).map(x => x.type),
    returns: innerScope.returns,
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

  if (func.returns.length !== 0 && wasm[wasm.length - 1][0] !== Opcodes.return) wasm.push(...number(0), [ Opcodes.return ]);

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

export default program => {
  globals = {};
  tags = [];
  exceptions = [];
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
  Opcodes.eqz = [ [ [ Opcodes.i32_eqz ] ], [ [ Opcodes.i64_eqz ] ], [ ...number(0), [ Opcodes.f64_eq ] ] ][valtypeInd];
  Opcodes.mul = [ Opcodes.i32_mul, Opcodes.i64_mul, Opcodes.f64_mul ][valtypeInd];
  Opcodes.add = [ Opcodes.i32_add, Opcodes.i64_add, Opcodes.f64_add ][valtypeInd];
  Opcodes.sub = [ Opcodes.i32_sub, Opcodes.i64_sub, Opcodes.f64_sub ][valtypeInd];
  Opcodes.i32_to = [ [ null ], [ Opcodes.i32_wrap_i64 ], Opcodes.i32_trunc_sat_f64_s ][valtypeInd];
  Opcodes.i32_from = [ [ null ], [ Opcodes.i64_extend_i32_u ], [ Opcodes.f64_convert_i32_u ] ][valtypeInd];

  Opcodes.sqrt = [ Opcodes.unreachable ]; // todo

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

  return { funcs, globals, tags, exceptions };
};