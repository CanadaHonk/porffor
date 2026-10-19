import parse from './parse.js';
import { TYPES } from './types.js';

const varId = name => {
  const lastFunc = scopes[scopes.lastFuncs.at(-1)];
  lastFunc._variableIds ??= Object.create(null);
  lastFunc._variableIds[name] ??= 0;
  return lastFunc._variableIds[name]++;
};

const isFunctionScope = node =>
  node?.type === 'FunctionDeclaration' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'ArrowFunctionExpression';

const findLexicalThisOwner = (currentFunc, boundary) => {
  if (currentFunc?.type !== 'ArrowFunctionExpression' || currentFunc === boundary) return null;

  let owner = currentFunc._parentFunc;
  while (owner && owner !== boundary) {
    if (owner.type !== 'ArrowFunctionExpression') return owner;
    owner = owner._parentFunc;
  }

  return null;
};

const markClosurePassThrough = (currentFunc, owner) => {
  let cursor = currentFunc?._parentFunc;
  while (cursor && cursor !== owner) {
    cursor._closurePassThrough = true;
    cursor = cursor._parentFunc;
  }
};

const isSelfReferenceContext = (currentFunc, owner) => {
  if (!currentFunc || !owner) return false;
  if (!isFunctionScope(currentFunc)) return false;

  let cursor = currentFunc;
  while (cursor) {
    if (cursor === owner) return true;
    cursor = cursor._parentFunc;
  }

  return false;
};

const isLoopScope = scope =>
  scope?.type === 'ForStatement' ||
  scope?.type === 'ForInStatement' ||
  scope?.type === 'ForOfStatement';

const bindingHasLoopScope = variable => {
  const funcInd = scopes.indexOf(variable.func);
  const scopeInd = scopes.indexOf(variable.scope);
  for (let i = funcInd + 1; i <= scopeInd; i++) {
    if (isLoopScope(scopes[i])) return true;
  }

  return false;
};

const renameBindingNode = (node, name) => {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'Identifier') {
    node.name = name;
  } else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.id?.name) {
    node.id.name = name;
  }
};

const resolveVariable = (name, below = scopes.length) => {
  for (let i = below - 1; i >= 0; i--) {
    const variable = scopes[i]._variables?.[name];
    if (variable) return variable;
  }
};

const markWrite = node => {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'Identifier') {
    const variable = node._resolvedVariable ?? node._variable ?? resolveVariable(node.name);
    if (variable) {
      variable.node._writes = (variable.node._writes ?? 0) + 1;
      if (variable.node.type === 'FunctionDeclaration') variable.node._reassigned = true;
    }
    return;
  }

  if (node.type === 'ArrayPattern') {
    for (const x of node.elements) markWrite(x);
    return;
  }

  if (node.type === 'ObjectPattern') {
    for (const x of node.properties) markWrite(x.value ?? x.argument);
    return;
  }

  if (node.type === 'AssignmentPattern') {
    markWrite(node.left);
    return;
  }

  if (node.type === 'RestElement') markWrite(node.argument);
};

const recordStorageWrite = (target, value) => {
  if (!target || typeof target !== 'object') return;

  if (target.type === 'Identifier') {
    const variable = target._resolvedVariable ?? target._variable ?? resolveVariable(target.name);
    if (!variable) return;

    if (variable.node._storageType !== null) {
      variable.node._storageType = storageExpressionType(value) === TYPES.number ? TYPES.number : null;
    }
    return;
  }

  if (target.type === 'ArrayPattern') {
    for (const x of target.elements) recordStorageWrite(x, null);
    return;
  }

  if (target.type === 'ObjectPattern') {
    for (const x of target.properties) recordStorageWrite(x.value ?? x.argument, null);
    return;
  }

  if (target.type === 'AssignmentPattern') {
    recordStorageWrite(target.left, value);
    return;
  }

  if (target.type === 'RestElement') recordStorageWrite(target.argument, null);
};

const markMaybeUndefinedStorage = node => {
  if (node?.type !== 'Identifier') return;

  const variable = node._resolvedVariable ?? node._variable ?? resolveVariable(node.name);
  if (variable?.node?._uninitialized) variable.node._storageType = null;
};

const undefinedCheckTarget = (left, right) => {
  if (left?.type === 'Identifier' && right?.type === 'Identifier' && right.name === 'undefined') return left;
  if (right?.type === 'Identifier' && left?.type === 'Identifier' && left.name === 'undefined') return right;
};

const storageExpressionType = node => {
  if (!node) return null;
  if (node._type != null) return typeof node._type === 'number' ? node._type : null;

  if (node.type === 'Literal') {
    if (node.bigint != null) return TYPES.bigint;
    if (node.regex) return TYPES.regexp;
    if (typeof node.value === 'string') return TYPES.bytestring;
    return TYPES[typeof node.value] ?? null;
  }

  if (node.type === 'Identifier') {
    if (node.name === 'undefined') return TYPES.undefined;
    if (node.name === 'NaN' || node.name === 'Infinity') return TYPES.number;
    return !node._noStorageInfer && (node._resolvedVariable ?? resolveVariable(node.name))?.node?._storageType === TYPES.number ? TYPES.number : null;
  }

  if (node.type === 'UnaryExpression') {
    if (node.operator === '!') return TYPES.boolean;
    if (node.operator === 'void') return TYPES.undefined;
    if (node.operator === 'delete') return TYPES.boolean;
    if (node.operator === 'typeof') return TYPES.bytestring;
    return TYPES.number;
  }

  if (node.type === 'UpdateExpression') return TYPES.number;

  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    if (['==', '===', '!=', '!==', '>', '>=', '<', '<=', 'instanceof', 'in'].includes(node.operator)) return TYPES.boolean;
    if (node.type === 'LogicalExpression') return null;

    const l = storageExpressionType(node.left), r = storageExpressionType(node.right);
    if (l === TYPES.bigint || r === TYPES.bigint) return TYPES.bigint;
    if (node.operator !== '+') return TYPES.number;
    if (l === TYPES.number && r === TYPES.number) return TYPES.number;
    if (l === TYPES.string || r === TYPES.string) return TYPES.string;
    if (l === TYPES.bytestring && r === TYPES.bytestring) return TYPES.bytestring;
    return null;
  }

  if (node.type === 'AssignmentExpression') {
    const op = node.operator.slice(0, -1) || '=';
    return op === '=' ? storageExpressionType(node.right) : storageExpressionType({
      type: ['||', '&&', '??'].includes(op) ? 'LogicalExpression' : 'BinaryExpression',
      left: node.left,
      right: node.right,
      operator: op
    });
  }

  if (node.type === 'SequenceExpression') return storageExpressionType(node.expressions.at(-1));
  if (node.type === 'TemplateLiteral') return TYPES.bytestring;
  if (node.type === 'ObjectExpression') return TYPES.object;
  if (node.type === 'ArrayExpression') return TYPES.array;

  return null;
};

const nearestEvalScope = () => {
  const lastFunc = scopes.lastFuncs.at(-1);
  for (let i = scopes.length - 1; i > lastFunc; i--) {
    const scope = scopes[i];
    if (scope._evalScope) return scope;
  }

  return null;
};

const nearestStrictEvalScope = () => {
  const scope = nearestEvalScope();
  return scope && (scope._strictEval || scope._strict) ? scope : null;
};

const lexicalConflict = (name, from, to) => {
  for (let i = from; i < to; i++) {
    const variable = scopes[i]._variables?.[name];
    if (variable && variable.kind !== 'var' && variable.kind !== 'function-name') return true;
  }
  return false;
};

const evalLexicalConflict = name => {
  const evalScope = nearestEvalScope();
  return !!evalScope && lexicalConflict(name, scopes.indexOf(evalScope) + 1, scopes.length);
};

const isBlockFunction = node => {
  const scope = scopes.at(-1);
  // a function's body block is one scope below it, the program's body is the program
  const depth = scopes.length - 1 - scopes.lastFuncs.at(-1);
  return depth > (scopes[scopes.lastFuncs.at(-1)].type === 'Program' ? 0 : 1) || !Array.isArray(scope.body) || !scope.body.includes(node);
};

// a sloppy block function whose var would clash with an enclosing lexical binding stays block scoped
const blockFunctionConflict = node => isBlockFunction(node) && lexicalConflict(node.id.name, scopes.lastFuncs.at(-1), scopes.length - 1);

export const unknownValue = Symbol('Porffor.unknownValue');
export const knownValue = (scope, node) => {
  if (!node) return undefined;

  if (node.type === 'Literal' && node.value !== undefined) return node.value;
  if (node._resolvedVariable?.kind === 'const' && !node._tdz && node._resolvedVariable.node._declarator?.init) return knownValue(scope, node._resolvedVariable.node._declarator.init);

  if (node.type === 'TemplateLiteral') {
    let out = '';

    for (let i = 0; i < node.quasis.length; i++) {
      out += node.quasis[i].value.cooked;

      if (i < node.expressions.length) {
        const value = knownValue(scope, node.expressions[i]);
        if (value === unknownValue) return unknownValue;

        out += String(value);
      }
    }

    return out;
  }

  if (node.type === 'BinaryExpression') {
    const left = knownValue(scope, node.left);
    if (left === unknownValue) return unknownValue;

    const right = knownValue(scope, node.right);
    if (right === unknownValue) return unknownValue;

    switch (node.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '==': return left == right;
      case '===': return left === right;
      case '!=': return left != right;
      case '!==': return left !== right;
    }
  }

  return unknownValue;
};

const knownEvalSource = node => {
  const value = knownValue(null, node);
  return value === unknownValue ? null : String(value);
};

// owner of this, super and new.target, null in field initializers and static blocks
const thisFunc = currentFunc => {
  const init = classFieldInitializerFunc ?? classStaticFunc;
  if (currentFunc.type !== 'ArrowFunctionExpression') return currentFunc === init ? null : currentFunc;
  return findLexicalThisOwner(currentFunc, init);
};

const parseEval = node => {
  const code = knownEvalSource(node._evalSource ?? node.arguments[0]);
  if (code == null) return;

  let context = null;
  if (!node._indirectEval) {
    const owner = thisFunc(scopes[scopes.lastFuncs.at(-1)]);
    context = { fieldInit: !owner, privateNames: classStack.flatMap(x => Object.keys(x._privates)), superProperty: !owner || !!owner._homeOwner, superCall: !!owner?._derivedCtor, newTarget: owner?.type !== 'Program' };
  }

  try {
    const body = semantic(semantic.objectHack(parse(code, null, context)), node._semanticScopes, !node._indirectEval).body;
    // eval code's function declarations are initialized before it runs
    let at = 0;
    while (at < body.length && body[at].directive) at++;
    const funcs = body.filter(x => x.type === 'FunctionDeclaration');
    node._evalParsed = {
      type: 'BlockStatement',
      body: [ ...body.slice(0, at), ...funcs, ...body.slice(at).filter(x => x.type !== 'FunctionDeclaration') ]
    };
  } catch (e) {
    if (e.name !== 'SyntaxError') throw e;
    node._evalSyntaxError = e.message;
  }
};

const evalCallKind = node => {
  if (node.callee.name === 'eval') return 'direct';
  if (node.callee.type === 'SequenceExpression' && node.callee.expressions.at(-1)?.name === 'eval') return 'indirect';
  if (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object.name === 'eval' &&
    node.callee.property.name === 'call'
  ) return 'call';
};

const declVar = (name, kind, node) => {
  const func = scopes[scopes.lastFuncs.at(-1)];
  // sloppy function decls hoist as var, but each loop iteration still makes a fresh binding
  if (kind === 'var' && node?.type === 'FunctionDeclaration') {
    if (isBlockFunction(node)) node._writes = 1;
    for (let i = scopes.lastFuncs.at(-1) + 1; i < scopes.length; i++) {
      if (isLoopScope(scopes[i])) { node._loopScopedFuncDecl = true; break; }
    }
  }
  let parent;
  if (kind === 'var') {
    parent = nearestStrictEvalScope() ?? func;
    if (parent._variables?.[name]) {
      const existing = parent._variables[name];
      if (node?._writes && existing.node.type === 'Identifier' && !existing.node._declarator) node._skipVarUpdate = true;
      if (existing.node._writes) node._writes = 1;
      existing.node = node;
      if (node && typeof node === 'object') node._variable = existing;

      if (existing.internalName) renameBindingNode(node, existing.internalName);
      return;
    }
  } else {
    parent = scopes.at(-1);
  }

  parent._variables ??= Object.create(null);
  if (node && typeof node === 'object') node._refs ??= 0;

  const id = varId(name);
  let shadowsOuterFuncBinding = false;
  if (kind !== 'var') {
    const currentFuncInd = scopes.lastFuncs.at(-1);
    for (let i = currentFuncInd - 1; i >= 0; i--) {
      const variable = scopes[i]._variables?.[name];
      if (!variable) continue;
      shadowsOuterFuncBinding = variable.func !== func && variable.scope?.type !== 'Program';
      break;
    }
  }
  const activeEvalScope = nearestEvalScope();
  const evalScope = parent._evalScope ? parent : (kind === 'var' ? null : activeEvalScope);
  // block scoped bindings stay hidden from unresolved names (not in builtins)
  const blockScoped = !globalThis.precompile && (kind === 'let' || kind === 'const') && name[0] !== '#' && node?.type !== 'FunctionDeclaration' && parent !== func && parent !== func.body;
  const internalName = evalScope ? `${evalScope._evalName}_${name}${id > 0 ? `#${id}` : ''}` :
    (id > 0 || shadowsOuterFuncBinding || blockScoped ? `${name}#${id}` : null);
  const variable = { node, id, func, kind, scope: parent, internalName, inParams: paramDecl != null || paramTdz?.func === func, unit };
  parent._variables[name] = variable;
  if (node && typeof node === 'object') node._variable = variable;

  if (internalName) renameBindingNode(node, internalName);
};

// hidden binding for the [[HomeObject]] super resolves from
const declHome = node => {
  node._home = { type: 'Identifier', name: `#home_${node.start}`, _binding: true };
  declVar(node._home.name, 'let', node._home);
};

// hidden class bindings: home object, private name WeakMaps (#priv_), instance private methods (#privfn_)
const declClass = node => {
  declHome(node);
  node._privates = Object.create(null);
  for (const x of node.body.body) {
    if (x.type === 'MethodDefinition') {
      x.value._homeOwner = node;
      x.value._homeStatic = x.static;
      if (x.kind === 'constructor' && node.superClass) x.value._derivedCtor = true;
    }
    if (x.key?.type !== 'PrivateIdentifier') continue;

    const name = x.key.name;
    let info = node._privates[name];
    if (!info) {
      info = node._privates[name] = { map: { type: 'Identifier', name: `#priv_${node.start}_${name}`, _binding: true, _writes: 1 }, fn: null, kind: 'field', static: !!x.static };
      declVar(info.map.name, 'let', info.map);
    }
    if (x.type !== 'MethodDefinition') continue;

    info.kind = x.kind === 'method' ? 'method' : 'accessor';
    if (!x.static && !info.fn) {
      info.fn = { type: 'Identifier', name: `#privfn_${node.start}_${name}`, _binding: true, _writes: 1 };
      declVar(info.fn.name, 'let', info.fn);
    }
  }
};

const analyzePattern = (kind, node) => {
  if (!node) return;
  switch (node.type) {
    case 'Identifier':
      node._binding = true;
      node._param = paramDecl;
      declVar(node.name, kind, node);
      break;

    case 'RestElement':
      analyzePattern(kind, node.argument);
      break;

    case 'AssignmentPattern':
      // initialized once its default has run
      node.left._paramEnd = node.end;
      analyzePattern(kind, node.left);
      break;

    case 'Property':
      analyzePattern(kind, node.value);
      break;

    case 'ObjectPattern':
      for (const x of node.properties) {
        analyzePattern(kind, x);
      }
      break;

    case 'ArrayPattern':
      for (const x of node.elements) {
        analyzePattern(kind, x);
      }
      break;
  }
};

let scopes;
let evalScopeId = 0;
const analyze = (node, strict = false) => {
  if (!node) return;

  const top = scopes.at(-1);
  if (node.directive === 'use strict') {
    top._strict = true;
  }

  let openedScope = false;
  switch (node.type) {
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'SwitchStatement':
    case 'BlockStatement':
      scopes.push(node);
      openedScope = true;
      break;

    case 'WithStatement':
      // a fresh object binding each time the statement runs, closures keep theirs
      declVar(`#with_${node.start}`, 'let', { type: 'Identifier', name: `#with_${node.start}` });
      break;

    case 'CatchClause':
      scopes.push(node);
      if (node.param) analyzePattern('let', node.param);
      openedScope = true;
      break;

    case 'VariableDeclaration':
      for (const x of node.declarations) {
        if (x.id?.type === 'Identifier') x.id._declarator = x;
        analyzePattern(node.kind, x.id);
      }
      // only an initializer at the top of the func body dominates later reads
      if (scopes.length - 1 - scopes.lastFuncs.at(-1) <= 1) {
        for (const x of node.declarations) {
          if (x.init && x.id?.type === 'Identifier') x.id._storageTopDecl = true;
        }
      }
      break;

    case 'CallExpression':
      if (evalCallKind(node)) {
        node._directEval = evalCallKind(node) === 'direct' && !node.optional;
        node._strictEval = node._directEval && (strict || top._strict);
      }
      break;

    case 'ClassDeclaration':
      if (node.id?.name) {
        node.id._binding = true;
        declVar(node.id.name, 'let', node);
      }
      declClass(node);
      break;

    case 'ClassExpression':
      declClass(node);
      scopes.push(node);
      openedScope = true;
      if (node.id?.name) {
        node.id._binding = true;
        declVar(node.id.name, 'function-name', node);
      }
      break;

    case 'ObjectExpression':
      for (const x of node.properties) {
        if (!x.method && x.kind !== 'get' && x.kind !== 'set') continue;
        x.value._homeOwner = node;
        node._home ?? declHome(node);
      }
      break;

    case 'FunctionDeclaration':
      if (node.id?.name) {
        node.id._binding = true;
        declVar(node.id.name, (strict || evalLexicalConflict(node.id.name) || blockFunctionConflict(node)) ? 'let' : 'var', node);
      }
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      node._parentFunc = scopes[scopes.lastFuncs.at(-1)];
      scopes.lastFuncs.push(scopes.length);
      scopes.push(node);
      openedScope = true;

      // named function expressions bind their own name
      if (node.type === 'FunctionExpression' && node.id?.name) {
        node.id._binding = true;
        declVar(node.id.name, 'function-name', node);
      }

      if (node._derivedCtor) {
        node._thisBinding = { type: 'Identifier', name: `#this_${node.start}`, _binding: true, _writes: 1 };
        declVar(node._thisBinding.name, 'let', node._thisBinding);
      }
      if (node.type !== 'ArrowFunctionExpression') {
        node._newTargetBinding = { type: 'Identifier', name: `#newtarget_${node.start}`, _binding: true };
        declVar(node._newTargetBinding.name, 'let', node._newTargetBinding);
      }

      for (let i = 0; i < node.params.length; i++) {
        paramDecl = { func: node, index: i };
        analyzePattern('var', node.params[i]);
      }
      paramDecl = null;
      break;
  }

  for (const x in node) {
    if (x[0] === '_') continue;
    const value = node[x];
    if (value != null && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const y of value) {
          // linked modules share one program, so source offsets only compare within a unit
          if (node.type === 'Program') unit = y._unit;
          analyze(y, strict || top._strict);
        }
      } else if (value.type) analyze(value, strict || top._strict);
    }
  }

  if (openedScope) {
    scopes.pop();
  }

  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    scopes.lastFuncs.pop();
  }
};

// resolving past with statements checks their objects first
const markWiths = (node, variable) => {
  for (let i = scopes.length - 1; i >= 0 && scopes[i] !== variable?.scope; i--) {
    if (scopes[i].type !== 'WithStatement') continue;
    const ref = { type: 'Identifier', name: `#with_${scopes[i].start}` };
    annotate(ref, node, '_withs');
    (node._withs ??= []).push(ref);
  }
};

const annotate = (node, parent = null, key = null) => {
  if (!node) return;

  let openedScope = false;
  let openedFunc = false;
  if (node._variables || node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    scopes.push(node);
    openedScope = true;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      scopes.lastFuncs.push(scopes.length - 1);
      openedFunc = true;
    }
  }

  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      for (const param of node.params) recordStorageWrite(param, null);

      // a param is uninitialized until its own initializer has run
      const previous = paramTdz, previousParamsFunc = paramsFunc;
      // direct eval in a (non-arrow) function's parameters cannot declare arguments
      paramsFunc = node.type !== 'ArrowFunctionExpression' ? node : null;
      for (let i = 0; i < node.params.length; i++) {
        paramTdz = { func: node, index: i };
        annotate(node.params[i], node, 'params');
      }
      paramTdz = previous;

      paramsFunc = null;
      annotate(node.body, node, 'body');
      paramsFunc = previousParamsFunc;
      scopes.pop();
      scopes.lastFuncs.pop();
      return;
    }

    case 'VariableDeclarator':
      annotate(node.id, node, 'id');
      if (node.init && node.id.type === 'Identifier') markWiths(node.id, node.id._variable);
      annotate(node.init, node, 'init');
      if (node.init) recordStorageWrite(node.id, node.init);
        else if (node.id.type === 'Identifier') node.id._uninitialized = true;
      if (node.init && node.id._storageTopDecl) {
        const variable = node.id._variable ?? resolveVariable(node.id.name);
        if (variable) variable.node._storageInitSeen = true;
      }
      return;

    case 'ForInStatement':
    case 'ForOfStatement':
      markWrite(node.left);
      recordStorageWrite(node.left.type === 'VariableDeclaration' ? node.left.declarations[0]?.id : node.left, null);
      break;

    case 'CatchClause':
      recordStorageWrite(node.param, null);
      break;

    case 'WithStatement':
      node._withWrite = { type: 'Identifier', name: `#with_${node.start}` };
      annotate(node._withWrite, node, '_withWrite');
      markWrite(node._withWrite);
      annotate(node.object, node, 'object');
      scopes.push(node);
      annotate(node.body, node, 'body');
      scopes.pop();
      return;

    case 'AssignmentExpression':
      annotate(node.left, node, 'left');
      annotate(node.right, node, 'right');
      markWrite(node.left);
      recordStorageWrite(node.left, node.operator === '=' ? node.right : {
        type: ['||=', '&&=', '??='].includes(node.operator) ? 'LogicalExpression' : 'BinaryExpression',
        left: node.left,
        right: node.right,
        operator: node.operator.slice(0, -1)
      });
      return;

    case 'UpdateExpression':
      markWrite(node.argument);
      recordStorageWrite(node.argument, node);
      break;

    case 'BinaryExpression':
      if (['==', '===', '!=', '!=='].includes(node.operator)) {
        const target = undefinedCheckTarget(node.left, node.right);
        if (target) markMaybeUndefinedStorage(target);
      }
      break;

    case 'Identifier':
      if (node._binding) break;
      if (semantic.objectHackers.includes(node.name)) break;

      const name = node.name;
      const currentFunc = scopes[scopes.lastFuncs.at(-1)];
      let variable = resolveVariable(name);
      // params do not see the body's vars
      if (variable?.kind === 'var' && !variable.inParams && variable.scope === paramTdz?.func) variable = resolveVariable(name, scopes.indexOf(variable.scope));
      if (name[0] !== '#') markWiths(node, variable);
      if (variable) {
        node._resolvedBinding = true;
        node._resolvedVariable = variable;
        if (variable.node === heritage?.cls && currentFunc === heritage.func) node._tdz = true;
        const param = variable.node._param;
        if (param?.func === currentFunc && paramTdz?.func === currentFunc &&
          (param.index > paramTdz.index || (param.index === paramTdz.index && node.start < (variable.node._paramEnd ?? variable.node.end)))) node._tdz = true;
        // read before its lexical declaration in the same func
        if ((variable.kind === 'let' || variable.kind === 'const') && variable.node.type !== 'FunctionDeclaration' && variable.func === currentFunc &&
          !inEval && classFieldInitializerFunc !== currentFunc && variable.unit === unit && node.start < (variable.node._declarator?.end ?? variable.node.start)) node._tdz = true;
        variable.node._refs = (variable.node._refs ?? 0) + 1;
        // reads from other funcs or before the dominating init can see undefined
        if (variable.func !== currentFunc || !variable.node._storageInitSeen) {
          node._noStorageInfer = true;
          variable.node._storageHazardRef = true;
        }
        if (parent?.type === 'CallExpression' && key === 'callee' && !parent.optional && !parent.arguments.some(x => x?.type === 'SpreadElement')) {
          variable.node._directCallRefs = (variable.node._directCallRefs ?? 0) + 1;
          // eval bodies are compiled without direct param type inference
          if (!inEval) {
            if (variable.node._directCalls) variable.node._directCalls.push(parent);
            else {
              variable.node._directCalls = [ parent ];
              (scopes[0]._directCallDecls ??= []).push(variable.node);
            }
          }
          variable.node._directCallMinStart = variable.node._directCallMinStart == null ?
            node.start : Math.min(variable.node._directCallMinStart, node.start);
        } else {
          variable.node._valueRefs = (variable.node._valueRefs ?? 0) + 1;
        }
        if (variable.internalName) node.name = variable.internalName;

        if (
          (variable.node.type === 'FunctionDeclaration' || variable.node.type === 'FunctionExpression' || variable.node.type === 'ClassExpression') &&
          variable.node.id?.name === name &&
          isSelfReferenceContext(currentFunc, variable.node)
        ) {
          if (variable.node.type !== 'ClassExpression') variable.node._selfAware = true;
          if (variable.node.type !== 'FunctionDeclaration') node._selfBinding = variable.node;
        }
        if (variable.node.type === 'ClassExpression' && variable.scope?.type === 'ClassExpression') {
          node._selfBinding = variable.node;
          node._classBinding = true;
        }

        if (variable.func && variable.scope?.type !== 'ClassExpression') {
          if (classFieldInitializerFunc === currentFunc && variable.func === currentFunc && variable.scope?.type !== 'Program') {
            node._closureFunc = variable.func;

            variable.func._capturedVars ??= Object.create(null);
            variable.func._capturedVars[node.name] = {
              kind: variable.kind,
              node: variable.node
            };
          } else if (variable.func !== currentFunc) {
            if (variable.scope?.type !== 'Program') {
              node._closureFunc = variable.func;

              currentFunc._captures ??= Object.create(null);
              currentFunc._captures[node.name] = {
                func: variable.func,
                kind: variable.kind,
                node: variable.node,
                perIteration: (variable.kind !== 'var' && bindingHasLoopScope(variable)) || !!variable.node?._loopScopedFuncDecl
              };

              variable.func._capturedVars ??= Object.create(null);
              variable.func._capturedVars[node.name] = {
                kind: variable.kind,
                node: variable.node
              };

              markClosurePassThrough(currentFunc, variable.func);
              // pass loop captures through intermediate closures
              const capture = currentFunc._captures[node.name];
              if (capture.perIteration) {
                for (let cursor = currentFunc._parentFunc; cursor !== variable.func; cursor = cursor._parentFunc) {
                  cursor._captures ??= Object.create(null);
                  cursor._captures[node.name] ??= capture;
                }
              }
            }
          } else if (currentFunc._capturedVars?.[node.name]) {
            node._closureFunc = currentFunc;
          }
        }
      }

      if (!variable && name === 'arguments') {
        for (let i = scopes.length - 1; i >= 0; i--) {
          const scope = scopes[i];
          if (scope.type === 'FunctionDeclaration' || scope.type === 'FunctionExpression') {
            scope._usesArguments = true;
            // arrow: owner's arguments via its closure env
            if (scope !== currentFunc) {
              node._closureFunc = scope;
              (currentFunc._captures ??= Object.create(null)).arguments = { func: scope, kind: 'var', node };
              (scope._capturedVars ??= Object.create(null)).arguments = { kind: 'var', node };
              markClosurePassThrough(currentFunc, scope);
            }
            return;
          }
        }
      }
      break;

    case 'ThisExpression': {
      const currentFunc = scopes[scopes.lastFuncs.at(-1)];
      // arrows in static initializers see the class
      const func = thisFunc(currentFunc);
      if (classStaticFunc && currentFunc.type === 'ArrowFunctionExpression' && !func) {
        node._classThis = { type: 'Identifier', name: `#home_${classStack.at(-1).start}` };
        annotate(node._classThis, node, '_classThis');
        break;
      }

      if (func?._derivedCtor) {
        node._derivedThis = { type: 'Identifier', name: `#this_${func.start}` };
        annotate(node._derivedThis, node, '_derivedThis');
        break;
      }

      const owner = currentFunc === classStaticFunc ? null : findLexicalThisOwner(currentFunc, classFieldInitializerFunc);
      if (owner) {
        node._closureThisFunc = owner;
        currentFunc._capturesThis = owner;
        owner._capturedThis = true;
        markClosurePassThrough(currentFunc, owner);
      }
      break;
    }

    case 'Super': {
      node._this = { type: 'ThisExpression' };
      annotate(node._this, node, '_this');
      if (key === 'callee') {
        node._newTarget = { type: 'MetaProperty', meta: { type: 'Identifier', name: 'new' }, property: { type: 'Identifier', name: 'target' } };
        annotate(node._newTarget, node, '_newTarget');
      }

      // a constructor's own super() call uses its callee instead
      const currentFunc = scopes[scopes.lastFuncs.at(-1)];
      if (key === 'callee' && currentFunc.type !== 'ArrowFunctionExpression') break;

      // the enclosing method, else a field initializer or static block of the innermost class
      const method = thisFunc(currentFunc);
      const owner = method?._homeOwner ?? classStack.at(-1);
      node._home = { type: 'Identifier', name: `#home_${owner.start}` };
      node._homeProto = key !== 'callee' && owner.type !== 'ObjectExpression' && !(method ? method._homeStatic : classStaticFunc);
      annotate(node._home, node, '_home');
      break;
    }

    case 'ClassDeclaration':
    case 'ClassExpression': {
      // the class binding is uninitialized while the heritage evaluates
      const previous = heritage;
      heritage = { cls: node, func: scopes[scopes.lastFuncs.at(-1)] };
      annotate(node.superClass, node, 'superClass');
      heritage = previous;

      // the constructor adds instance private elements, reading their bindings like field initializers
      const previousInit = classFieldInitializerFunc;
      classFieldInitializerFunc = scopes[scopes.lastFuncs.at(-1)];
      for (const name in node._privates) {
        const info = node._privates[name];
        if (info.static) continue;

        annotate(info.ctorMap = { type: 'Identifier', name: `#priv_${node.start}_${name}` }, node, '_privates');
        if (info.fn) annotate(info.ctorFn = { type: 'Identifier', name: `#privfn_${node.start}_${name}` }, node, '_privates');
      }
      classFieldInitializerFunc = previousInit;

      classStack.push(node);
      annotate(node.body, node, 'body');
      classStack.pop();
      if (openedScope) scopes.pop();
      return;
    }

    case 'PrivateIdentifier': {
      const cls = classStack.findLast(x => x._privates[node.name]);
      node._private = cls._privates[node.name];
      node._map = { type: 'Identifier', name: `#priv_${cls.start}_${node.name}` };
      annotate(node._map, node, '_map');
      break;
    }

    case 'MetaProperty': {
      if (node.meta.name !== 'new') return;

      // field initializers and static blocks have no new.target
      const func = thisFunc(scopes[scopes.lastFuncs.at(-1)]);
      if (!func) node._undefined = true;
      // arrows read their function's new.target through a binding
      if (func?._newTargetBinding && (func._derivedCtor || func !== scopes[scopes.lastFuncs.at(-1)])) {
        node._binding = { type: 'Identifier', name: `#newtarget_${func.start}` };
        annotate(node._binding, node, '_binding');
      }
      return;
    }

    case 'MemberExpression':
      if (node.computed || node.property.type === 'PrivateIdentifier') annotate(node.property, node, 'property');
      annotate(node.object, node, 'object');
      return;

    case 'StaticBlock': {
      const previous = [ classStaticFunc, classFieldInitializerFunc ];
      classStaticFunc = scopes[scopes.lastFuncs.at(-1)];
      classFieldInitializerFunc = null;
      for (const x of node.body) annotate(x, node, 'body');
      [ classStaticFunc, classFieldInitializerFunc ] = previous;
      if (openedScope) scopes.pop();
      return;
    }

    case 'PropertyDefinition': {
      if (node.computed) annotate(node.key, node, 'key');
      // an element is in exactly one of the static or instance contexts
      const previous = [ classStaticFunc, classFieldInitializerFunc ];
      const func = scopes[scopes.lastFuncs.at(-1)];
      classStaticFunc = node.static ? func : null;
      classFieldInitializerFunc = node.static ? null : func;
      annotate(node.value, node, 'value');
      [ classStaticFunc, classFieldInitializerFunc ] = previous;
      return;
    }

    case 'Property':
      if (node.computed) annotate(node.key, node, 'key');
      annotate(node.value, node, 'value');
      return;

    case 'CallExpression': {
      const evalKind = evalCallKind(node);
      if (evalKind) {
        node._evalScope = true;
        node._evalName ??= `#eval_${evalScopeId++}`;
        if (evalKind !== 'direct' || node.optional) {
          // indirect eval, only top scope
          node._indirectEval = true;
          node._semanticScopes = [ scopes[0], node ];
          node._semanticScopes.lastFuncs = [ 0 ];
        } else {
          // direct eval, use existing scope
          node._semanticScopes = Object.assign([], scopes);
          node._semanticScopes.lastFuncs = scopes.lastFuncs.slice();
          node._semanticScopes.push(node);
        }

        if (evalKind === 'call') node._evalSource = node.arguments[1];
        parseEval(node);

        const parsed = node._evalParsed;
        if (evalKind === 'direct' && paramsFunc && parsed && !isStrictBlock(parsed.body) && !isStrictBlock(paramsFunc.body?.body ?? []) &&
            evalVarNames(parsed).some(x => x.split('#')[0] === 'arguments')) node._evalSyntaxError = 'Cannot declare arguments in eval code in parameters';
      }
      break;
    }

    case 'NewExpression':
      if (node.callee.name === 'Function') {
        // new Function(...) - use global scope and self as scope
        node._semanticScopes = [ scopes[0], node ];
        node._semanticScopes.lastFuncs = [ 0, 1 ];
      }
      break;
  }

  for (const x in node) {
    if (x[0] === '_') continue;
    const value = node[x];
    if (value != null && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const y of value) {
          if (node.type === 'Program') unit = y._unit;
          annotate(y, node, x);
        }
      } else if (value.type) annotate(value, node, x);
    }
  }

  if (openedScope) {
    scopes.pop();
  }

  if (openedFunc) {
    scopes.lastFuncs.pop();
  }
};

const evalVarNames = (node, out = [], top = true) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) evalVarNames(x, out, top); return out; }
  if (node.type === 'FunctionDeclaration') { if (top && node.id) out.push(node.id.name); return out; }
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return out;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') {
    const names = d => d.type === 'Identifier' ? [ d.name ] : [];
    for (const d of node.declarations) out.push(...names(d.id));
  }
  for (const key in node) {
    if (key[0] === '_' || key === 'start' || key === 'end') continue;
    // only top-level statements' function declarations are var scoped
    if (node[key] && typeof node[key] === 'object') evalVarNames(node[key], out, top && (key === 'body' && node.type === 'BlockStatement'));
  }
  return out;
};

let paramDecl = null, paramTdz = null, unit;
let inEval = false, classFieldInitializerFunc = null, classStaticFunc = null, paramsFunc = null, heritage = null, classStack = [];
const isStrictBlock = body => {
  for (const x of body) {
    if (x.type !== 'ExpressionStatement' || x.expression.type !== 'Literal' || typeof x.expression.value !== 'string') return false;
    if (x.expression.value === 'use strict') return true;
  }
  return false;
};
// direct eval code keeps the class context it is evaluated in
const semantic = (node, _scopes = null, direct = false) => {
  const oldScopes = scopes, oldInEval = inEval, oldClassFieldInitializerFunc = classFieldInitializerFunc, oldClassStaticFunc = classStaticFunc, oldClassStack = classStack, oldUnit = unit;
  inEval = !!_scopes;
  if (!direct) {
    classFieldInitializerFunc = null;
    classStaticFunc = null;
    classStack = [];
  }
  if (!_scopes) {
    _scopes = [ node ];
    _scopes.lastFuncs = [ 0 ];
  }
  scopes = _scopes;

  analyze(node, node.sourceType === 'module' || !!scopes.at(-1)?._strictEval);
  if (scopes.length !== _scopes.length) throw new Error('Scope mismatch');

  annotate(node);
  scopes = oldScopes;
  inEval = oldInEval;
  classFieldInitializerFunc = oldClassFieldInitializerFunc;
  classStaticFunc = oldClassStaticFunc;
  classStack = oldClassStack;
  unit = oldUnit;
  return node;
};
export default semantic;
semantic.objectHack = x => x;
