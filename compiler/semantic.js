const varId = name => {
  const lastFunc = scopes[scopes.lastFuncs.at(-1)];
  lastFunc._variableIds ??= Object.create(null);
  lastFunc._variableIds[name] ??= 0;
  return lastFunc._variableIds[name]++;

  // scopes._varId ??= Object.create(null);
  // scopes._varId[name] ??= 0;
  // return scopes._varId[name]++;
};

const declVar = (name, kind, node) => {
  let parent;
  if (kind === 'var') {
    parent = scopes[scopes.lastFuncs.at(-1)];
    // same id for redecl
    if (parent._variables?.[name]) {
      parent._variables[name].node = node;
      return;
    }
  } else {
    parent = scopes.at(-1);
  }

  parent._variables ??= Object.create(null);
  parent._variables[name] = { node, id: varId(name) };
};

const analyzePattern = (kind, node) => {
  if (!node) return;
  switch (node.type) {
    case 'Identifier':
      declVar(node.name, kind, node);
      break;

    case 'RestElement':
      analyzePattern(kind, node.argument);
      break;

    case 'AssignmentPattern':
      analyzePattern(kind, node.left);
      break;

    case 'Property':
      analyzePattern(kind, node.value);
      break;

    case 'ObjectPattern':
      for (const x of node.properties) {
        analyzePattern(kind, x.value);
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

    case 'CatchClause':
      scopes.push(node);
      if (node.param) analyzePattern('let', node.param);
      openedScope = true;
      break;

    case 'VariableDeclaration':
      for (const x of node.declarations) analyzePattern(node.kind, x.id);
      break;

    case 'ClassDeclaration':
      if (node.id?.name) declVar(node.id.name, 'let', node);
      break;

    case 'FunctionDeclaration':
      if (node.id?.name) if (strict) {
        declVar(node.id.name, 'let', node);
      } else {
        declVar(node.id.name, 'var', node);
      }
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      scopes.lastFuncs.push(scopes.length);
      scopes.push(node);
      openedScope = true;

      for (const p of node.params) analyzePattern('var', p);
      break;
  }

  for (const x in node) {
    if (node[x] != null && typeof node[x] === 'object') {
      if (node[x].type) analyze(node[x], strict || top._strict);
      if (Array.isArray(node[x])) {
        for (const y of node[x]) analyze(y, strict || top._strict);
      }
    }
  }

  if (openedScope) {
    scopes.pop();
  }

  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    scopes.lastFuncs.pop();
  }
};

const objectHackers = ["assert","compareArray","Test262Error","Number","Math","Porffor","performance","String","ByteString","Array","ArrayBuffer","SharedArrayBuffer","Atomics","ecma262","BigInt","Boolean","console","crypto","DataView","Date","Error","AggregateError","TypeError","ReferenceError","SyntaxError","RangeError","EvalError","URIError","Test262Error","Function","JSON","Map","Object","Promise","Reflect","RegExp","Set","Symbol","Uint8Array","Int8Array","Uint8ClampedArray","Uint16Array","Int16Array","Uint32Array","Int32Array","Float32Array","Float64Array","BigInt64Array","BigUint64Array","WeakMap","WeakRef","WeakSet","navigator"];
const annotate = node => {
  if (!node) return;

  let openedScope = false;
  if (node._variables) {
    scopes.push(node);
    openedScope = true;
  }

  switch (node.type) {
    case 'Identifier':
      if (objectHackers.includes(node.name)) break;
      for (let i = scopes.length - 1; i >= 0; i--) {
        if (scopes[i]._variables?.[node.name]) {
          const variable = scopes[i]._variables[node.name];
          if (variable.id > 0) node.name = node.name + '#' + variable.id;
          break;
        }
      }
      break;

    case 'MemberExpression':
      if (node.computed) annotate(node.property);
      annotate(node.object);
      return;

    case 'PropertyDefinition':
    case 'Property':
      if (node.computed) annotate(node.key);
      annotate(node.value);
      return;

    case 'CallExpression':
      if (node.callee.name === 'eval' || (node.callee.type === 'SequenceExpression' && node.callee.expressions.at(-1)?.name === 'eval')) {
        if (node.callee.type === 'SequenceExpression' || node.optional) {
          // indirect eval, only top scope
          node._semanticScopes = [ scopes[0], node ];
          node._semanticScopes.lastFuncs = [ 0 ];
        } else {
          // direct eval, use existing scope
          node._semanticScopes = Object.assign([], scopes);
          node._semanticScopes.push(node);
        }
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
    if (node[x] != null && typeof node[x] === 'object' && x[0] !== '_') {
      if (node[x].type) annotate(node[x]);
      if (Array.isArray(node[x])) {
        for (const y of node[x]) annotate(y);
      }
    }
  }

  if (openedScope) {
    scopes.pop();
  }
};

export default (node, _scopes = null) => {
  if (!_scopes) {
    _scopes = [ node ];
    _scopes.lastFuncs = [ 0 ];
  }
  scopes = _scopes;

  analyze(node);
  if (scopes.length !== _scopes.length) throw new Error('Scope mismatch');

  annotate(node);
  return node;
};