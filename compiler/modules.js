import './prefs.js';
import parse from './parser/index.js';

const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);

const dirname = p => p.slice(0, p.lastIndexOf('/')) || '/';
const joinPath = (dir, rel) => {
  const parts = [];
  for (const x of (rel[0] === '/' ? rel : dir + '/' + rel).split('/')) {
    if (x === '..') parts.pop();
    else if (x !== '.' && x !== '') parts.push(x);
  }
  return '/' + parts.join('/');
};
const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));


export const hashId = str => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

// names (or dotted Object.member reads) from `names` referenced in an ast, ignoring keys and member properties
export const usedNames = (node, names, out = new Set()) => {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const x of node) usedNames(x, names, out);
    return out;
  }

  if (node.type === 'Identifier') {
    if (names.has(node.name)) out.add(node.name);
    return out;
  }
  if (node.type === 'MemberExpression') {
    // '.x' names any property read x
    if (!node.computed && names.has('.' + node.property.name)) out.add('.' + node.property.name);
    if (!node.computed && node.object.type === 'Identifier') {
      const dotted = node.object.name + '.' + node.property.name;
      if (names.has(dotted)) out.add(dotted);
      // globalThis.crypto is the crypto global
      if (node.object.name === 'globalThis' && names.has(node.property.name)) out.add(node.property.name);
    }
    return usedNames(node.computed ? [ node.object, node.property ] : node.object, names, out);
  }
  if (node.type === 'Literal' || node.type === 'TemplateElement') return out;
  if (node.type === 'TemplateLiteral') return usedNames(node.expressions, names, out);

  if (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') {
    if (node.computed) usedNames(node.key, names, out);
    return usedNames(node.value, names, out);
  }

  if (node.type === 'VariableDeclarator') {
    // const { crypto } = globalThis
    if (node.init?.type === 'Identifier' && node.init.name === 'globalThis' && node.id.type === 'ObjectPattern') {
      for (const p of node.id.properties) if (p.key?.type === 'Identifier' && !p.computed && names.has(p.key.name)) out.add(p.key.name);
    }
    return usedNames(node.init, names, out);
  }
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return usedNames(node.body, names, usedNames(node.params, names, out));
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return usedNames(node.body, names, usedNames(node.superClass, names, out));

  for (const key in node) {
    if (key[0] === '_' || key === 'start' || key === 'end') continue;
    usedNames(node[key], names, out);
  }

  return out;
};

const EXTENSIONS = [ '.ts', '.tsx', '.js', '.mjs', '.mts', '.cjs', '.json' ];
const resolveFile = p => {
  if (isFile(p)) return p;
  for (const ext of EXTENSIONS) if (isFile(p + ext)) return p + ext;
  // ts sources import their siblings as .js
  const stripped = p.replace(/\.[cm]?js$/, '');
  if (stripped !== p) for (const ext of EXTENSIONS) if (isFile(stripped + ext)) return stripped + ext;
  return resolveDir(p);
};
// a directory is its package.json "main", or its index
const resolveDir = p => {
  const main = isFile(p + '/package.json') ? readJson(p + '/package.json').main : null;
  const index = dir => EXTENSIONS.map(ext => dir + '/index' + ext).find(isFile) ?? null;
  if (typeof main === 'string') {
    const m = joinPath(p, main);
    const out = isFile(m) ? m : EXTENSIONS.map(ext => m + ext).find(isFile) ?? index(m);
    if (out) return out;
  }
  return index(p);
};

const findPackage = (dir, name) => {
  for (;;) {
    const pkgDir = dir + '/node_modules/' + name;
    // like node, a package without package.json still resolves its files
    if (isDir(pkgDir)) return pkgDir;
    if (dir === '/') return null;
    dir = dirname(dir);
  }
};

// package.json "exports": subpath map with conditions, "*" patterns and array fallbacks
const resolveTarget = (target, conditions, star) => {
  if (typeof target === 'string') return star != null ? target.replaceAll('*', () => star) : target;
  if (Array.isArray(target)) {
    for (const x of target) {
      const r = resolveTarget(x, conditions, star);
      if (r) return r;
    }
    return null;
  }
  if (target && typeof target === 'object') {
    for (const key in target) {
      if (key === 'default' || conditions.includes(key)) {
        const r = resolveTarget(target[key], conditions, star);
        if (r) return r;
      }
    }
  }
  return null;
};
// "exports" subpaths and "imports" #specifiers: exact keys, then "*" patterns
const resolveMap = (map, key, conditions) => {
  if (key in map) return resolveTarget(map[key], conditions);
  for (const pattern in map) {
    const i = pattern.indexOf('*');
    if (i === -1) continue;
    const pre = pattern.slice(0, i), post = pattern.slice(i + 1);
    if (key.startsWith(pre) && key.endsWith(post) && key.length >= pattern.length) {
      return resolveTarget(map[pattern], conditions, key.slice(pre.length, key.length - post.length));
    }
  }
  return null;
};
const resolveExports = (exports, subpath, conditions) => {
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports) || !Object.keys(exports).some(x => x[0] === '.')) {
    return subpath === '.' ? resolveTarget(exports, conditions) : null;
  }
  return resolveMap(exports, subpath, conditions);
};

const nearestPackage = dir => {
  for (;; dir = dirname(dir)) {
    if (isFile(dir + '/package.json')) return dir;
    if (dir === '/') return null;
  }
};

// runtime builtins live under a sentinel dir; their sources come from the runtimeImports dict
const RUNTIME_ROOT = '/@porffor-runtime';

// internals are runtime-only, node:test-style builtins need the prefix like in node
const PREFIX_ONLY = new Set([ 'test', 'test/reporters', 'sqlite', 'sea' ]);
const builtinKey = (name, from, prefixed) => {
  if (!prefixed && PREFIX_ONLY.has(name)) return null;
  if ((name.startsWith('internal/') || name === 'c-helpers' || name === 'sources') && !from.startsWith(RUNTIME_ROOT)) return null;
  return RUNTIME_ROOT + '/node/' + name + '.js';
};

// what --alias:pkg= resolves to: an empty object, whose named imports are undefined
const EMPTY_MODULE = 'data:text/javascript,export default {}';

const resolve = (spec, from, cjs, runtime, aliased = false) => {
  if (spec.startsWith('data:')) return spec;
  // --alias:pkg=target (like esbuild): pkg and its subpaths resolve to target, or with no target to an empty module
  if (!aliased) for (const k in Prefs) {
    if (!k.startsWith('alias:')) continue;
    const name = k.slice(6);
    const to = Prefs[k];
    const empty = to === '' || to === true;
    // a file stands in for the package itself, an empty module or another package for its subpaths too
    if (spec !== name && !(spec.startsWith(name + '/') && (empty || !/^\.{0,2}\//.test(to)))) continue;
    if (empty) return EMPTY_MODULE;
    // paths are from the working directory, packages from the importer like the specifier they replace
    return resolve(to + spec.slice(name.length), /^\.{0,2}\//.test(to) ? process.cwd() + '/' : from, cjs, runtime, true);
  }
  // esm specifiers are urls
  if (spec.startsWith('file://')) spec = spec.slice(7).replace(/[?#].*/, '');
  if (!cjs && /^\.{0,2}\//.test(spec)) spec = decodeURIComponent(spec);
  if (spec.startsWith('node:')) {
    if (Prefs.safe) throw new Error(`porffor: node builtin modules are not allowed in --safe (${spec})`);
    const key = builtinKey(spec.slice(5), from, true);
    if (!runtime || !key || !(key in runtime)) throw new Error(`porffor: node builtin module '${spec}' is not implemented`);
    return key;
  }
  // relative imports between runtime builtins stay inside the dict
  if ((spec[0] === '.' || spec[0] === '/') && from.startsWith(RUNTIME_ROOT)) {
    const key = joinPath(dirname(from), spec);
    if (runtime && key in runtime) return key;
    if (runtime && (key + '.js') in runtime) return key + '.js';
    throw new Error(`porffor: cannot resolve '${spec}' from ${from}`);
  }
  // bare builtin names win over packages, like node
  const builtin = runtime && builtinKey(spec, from, false);
  if (builtin && builtin in runtime) return builtin;
  // undici's http parser is wasm, so it is our own over fetch
  if (spec === 'undici' && runtime) return RUNTIME_ROOT + '/node/internal/undici.js';
  // with node's runtime linked, packages resolve like under node, else to their worker builds
  const conditions = [ 'porffor', runtime ? 'node' : 'worker', cjs ? 'require' : 'import', 'module', 'default', ...(Prefs.conditions ? String(Prefs.conditions).split(',') : []) ];
  let out = null;
  // trailing slashes, . and .. only name directories
  if (spec[0] === '.' || spec[0] === '/') out = (/(?:^|\/)\.{0,2}$/.test(spec) ? resolveDir : resolveFile)(joinPath(dirname(from), spec));
  else if (spec[0] === '#') {
    const pkgDir = nearestPackage(dirname(from));
    const target = pkgDir && resolveMap(readJson(pkgDir + '/package.json').imports ?? {}, spec, conditions);
    out = target ? resolveFile(joinPath(pkgDir, target)) : null;
  } else {
    const scoped = spec[0] === '@';
    const nameEnd = spec.indexOf('/', scoped ? spec.indexOf('/') + 1 : 0);
    const name = nameEnd === -1 ? spec : spec.slice(0, nameEnd);
    const subpath = nameEnd === -1 ? '.' : '.' + spec.slice(nameEnd);
    const pkgDir = findPackage(dirname(from), name);
    if (pkgDir) {
      const pkg = isFile(pkgDir + '/package.json') ? readJson(pkgDir + '/package.json') : {};
      if (pkg.exports != null) {
        const target = resolveExports(pkg.exports, subpath, conditions);
        // no . .. or node_modules segments, the runtime resolver throws node's error
        if (target && /(?:^|\/)(?:\.\.?|node_modules)(?:\/|$)/i.test(target.slice(2))) throw new Error(`porffor: invalid "exports" target for '${spec}' in ${pkgDir}/package.json`);
        out = target ? resolveFile(joinPath(pkgDir, target)) : null;
      } else if (subpath === '.') out = resolveFile(joinPath(pkgDir, pkg.module ?? pkg.main ?? 'index.js'));
      else out = resolveFile(joinPath(pkgDir, subpath));
    }
  }
  if (!out) throw Object.assign(new Error(`porffor: cannot resolve '${spec}' from ${from}`), { notFound: true });
  // modules are their real path like in node, so symlinked paths (pnpm, /tmp on macos) share one instance
  return fs.realpathSync(out);
};

// data: urls are [mime][;base64],data
const dataSource = url => {
  const comma = url.indexOf(',');
  return url.slice(0, comma).endsWith(';base64') ? atob(url.slice(comma + 1)) : decodeURIComponent(url.slice(comma + 1).replace(/%(?![\da-f]{2})/gi, '%25'));
};

const isEsmSource = (file, src) => {
  if (/\.m[jt]s$/.test(file) || file.startsWith('data:')) return true;
  if (/\.c[jt]s$/.test(file)) return false;
  const pkgDir = nearestPackage(dirname(file));
  if (pkgDir && readJson(pkgDir + '/package.json').type === 'module') return true;
  // like node, esm when only module syntax parses (import() is fine in cjs, a statement in a string is not a declaration)
  if (!/(?:^|[;}])\s*(?:import\b(?!\s*\()|export\b)/m.test(src) && !/\bimport\.meta\b/.test(src)) return false;
  try {
    parse(src, { module: false, topReturn: true, ts: /\.tsx?$/.test(file) });
    return false;
  } catch {
    return true;
  }
};

const ident = name => ({ type: 'Identifier', name });
const assign = (left, right) => ({ type: 'ExpressionStatement', expression: { type: 'AssignmentExpression', operator: '=', left, right } });
const literal = value => ({ type: 'Literal', value });
const call = (name, args = []) => ({ type: 'CallExpression', callee: ident(name), arguments: args, optional: false });
const throwNew = (type, message, props) => {
  const error = { type: 'NewExpression', callee: ident(type), arguments: [ literal(message) ] };
  return { type: 'ThrowStatement', argument: props ? { type: 'CallExpression', optional: false, callee: member(ident('Object'), 'assign'), arguments: [ error, jsonToAst(props) ] } : error };
};
const member = (object, name) => ({ type: 'MemberExpression', object, property: ident(name), computed: false, optional: false });
const property = (key, value, kind = 'init') => ({ type: 'Property', kind, computed: false, shorthand: false, method: false, key, value });
const varDecl = (kind, name, init) => ({
  type: 'VariableDeclaration', kind,
  declarations: [ { type: 'VariableDeclarator', id: ident(name), init } ]
});
const jsonToAst = value => {
  if (Array.isArray(value)) return { type: 'ArrayExpression', elements: value.map(jsonToAst) };
  if (value !== null && typeof value === 'object') {
    return { type: 'ObjectExpression', properties: Object.keys(value).map(key => property(literal(key), jsonToAst(value[key]))) };
  }
  return literal(value);
};

export const patternNames = (node, out) => {
  if (!node) return out;
  switch (node.type) {
    case 'Identifier': out.push(node.name); break;
    case 'ObjectPattern': for (const x of node.properties) patternNames(x.type === 'Property' ? x.value : x.argument, out); break;
    case 'ArrayPattern': for (const x of node.elements) patternNames(x, out); break;
    case 'AssignmentPattern': patternNames(node.left, out); break;
    case 'RestElement': patternNames(node.argument, out); break;
  }
  return out;
};

const isFunc = node => node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression';
const exportName = node => node.name ?? node.value;

// f(x) { return import(x); } only called with literals (hiding them from bundlers) becomes import('...')
const literalImports = body => {
  for (let i = 0; i < body.length; i++) {
    const x = body[i];
    const ret = x.type === 'FunctionDeclaration' && x.params.length === 1 && x.params[0].type === 'Identifier' && x.body.body.length === 1 && x.body.body[0].type === 'ReturnStatement' ? x.body.body[0].argument : null;
    if (ret?.type !== 'ImportExpression' || ret.options || ret.source.type !== 'Identifier' || ret.source.name !== x.params[0].name) continue;

    const calls = [];
    let others = 0;
    const find = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const y of node) find(y); return; }
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === x.id.name && node.arguments.length === 1 &&
        node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string') return calls.push(node);
      if (node.type === 'Identifier' && node.name === x.id.name) others++;
      for (const key in node) if (key !== 'start' && key !== 'end') find(node[key]);
    };
    find(body.filter(y => y !== x));
    if (others > 0) continue;

    for (const c of calls) {
      c.type = 'ImportExpression';
      c.source = c.arguments[0];
      delete c.callee;
      delete c.arguments;
      delete c.optional;
    }
    body.splice(i--, 1);
  }
};

// top-level returns become breaks out of the labeled block the module body is put in
const topReturns = (body, label) => {
  let found = false;
  const walk = x => {
    if (!x || typeof x !== 'object' || isFunc(x) || x.type === 'ClassBody') return x;
    if (x.type === 'ReturnStatement') {
      found = true;
      const exit = { type: 'BreakStatement', label: { type: 'Identifier', name: label } };
      return { type: 'BlockStatement', body: x.argument ? [ { type: 'ExpressionStatement', expression: x.argument }, exit ] : [ exit ] };
    }
    for (const key in x) {
      if (SKIP_KEYS.has(key)) continue;
      if (Array.isArray(x[key])) x[key] = x[key].map(walk);
        else if (x[key]?.type) x[key] = walk(x[key]);
    }
    return x;
  };
  for (let i = 0; i < body.length; i++) body[i] = walk(body[i]);
  return found;
};

// names declared directly in a statement list (let/const/class/function)
const lexicalNames = (body, out) => {
  for (let x of body) {
    if (x.type === 'ExportNamedDeclaration') x = x.declaration;
    if (x.type === 'VariableDeclaration' && x.kind !== 'var') for (const d of x.declarations) patternNames(d.id, out);
    else if (x.type === 'FunctionDeclaration' || x.type === 'ClassDeclaration' || x.type === 'TSEnumDeclaration') { if (x.id) out.push(x.id.name); }
  }
  return out;
};
// var-declared names anywhere below, not crossing function boundaries
const varNames = (node, out) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) varNames(x, out); return out; }
  if (isFunc(node) || node.type === 'ClassExpression' || node.type === 'ClassDeclaration') return out;
  if (node.type === 'VariableDeclaration' && node.kind === 'var') for (const d of node.declarations) patternNames(d.id, out);
  for (const key in node) if (key !== 'start' && key !== 'end') varNames(node[key], out);
  return out;
};
const funcScopeNames = node => {
  const out = [];
  for (const p of node.params) patternNames(p, out);
  if (node.body.type === 'BlockStatement') { lexicalNames(node.body.body, out); varNames(node.body.body, out); }
  return out;
};

// references to a name, minus where something nested declares its own
const renameUnshadowed = (node, from, to) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) renameUnshadowed(x, from, to); return; }
  switch (node.type) {
    case 'Identifier':
      if (node.name === from) node.name = to;
      return;
    case 'MemberExpression':
      renameUnshadowed(node.object, from, to);
      if (node.computed) renameUnshadowed(node.property, from, to);
      return;
    case 'Property': case 'MethodDefinition': case 'PropertyDefinition':
      if (node.computed) renameUnshadowed(node.key, from, to);
      if (node.shorthand && node.value.type === 'Identifier' && node.value.name === from) {
        node.value = { ...node.value, name: to };
        node.shorthand = false;
      } else renameUnshadowed(node.value, from, to);
      return;
    case 'BlockStatement':
      if (lexicalNames(node.body, []).includes(from)) return;
      break;
    case 'CatchClause':
      if (node.param && patternNames(node.param, []).includes(from)) return;
      break;
  }
  if (isFunc(node)) {
    if (node.type === 'FunctionDeclaration' && node.id?.name === from) node.id.name = to;
    if ((node.type === 'FunctionExpression' && node.id?.name === from) || funcScopeNames(node).includes(from)) return;
  }
  for (const key in node) if (key !== 'start' && key !== 'end') renameUnshadowed(node[key], from, to);
};

const SKIP_KEYS = new Set([ 'typeAnnotation', 'typeParameters', 'typeArguments', 'returnType', 'superTypeArguments', 'implements', 'start', 'end' ]);
const TS_EXPR = new Set([ 'TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'TSInstantiationExpression' ]);

// side-effect free on evaluation, so droppable when unreferenced (src for @__PURE__ annotations)
const PURE_NEW = new Set([ 'Map', 'Set', 'WeakMap', 'WeakSet', 'RegExp' ]);
const pureClass = (node, src) => (!node.superClass || node.superClass.type === 'Identifier') &&
  node.body.body.every(x => x.type !== 'StaticBlock' && !x.computed && (x.type !== 'PropertyDefinition' || !x.static || !x.value || pure(x.value, src)));
const pure = (node, src) => {
  switch (node.type) {
    case 'Literal': case 'Identifier': case 'FunctionExpression': case 'ArrowFunctionExpression': return true;
    case 'ClassExpression': return pureClass(node, src);
    case 'TemplateLiteral': return node.expressions.every(x => pure(x, src));
    case 'ArrayExpression': return node.elements.every(x => x === null || (x.type !== 'SpreadElement' && pure(x, src)));
    case 'ObjectExpression': return node.properties.every(x => x.type === 'Property' && !x.computed && pure(x.value, src));
    case 'UnaryExpression': return node.operator !== 'delete' && pure(node.argument, src);
    case 'BinaryExpression': case 'LogicalExpression': return pure(node.left, src) && pure(node.right, src);
    case 'ConditionalExpression': return pure(node.test, src) && pure(node.consequent, src) && pure(node.alternate, src);
    case 'NewExpression': case 'CallExpression': {
      const callee = node.callee;
      const known = callee.type === 'Identifier' && (node.type === 'NewExpression' ? PURE_NEW.has(callee.name) : callee.name === 'Symbol');
      const annotated = node.start != null && /\/\*\s*[@#]__PURE__\s*\*\/\s*$/.test(src.slice(Math.max(0, node.start - 40), node.start));
      return (known || annotated) && node.arguments.every(x => x.type !== 'SpreadElement' && pure(x, src));
    }
  }
  return false;
};
// the binding a droppable top-level declaration defines
const declName = (x, src) => x.type === 'FunctionDeclaration' || (x.type === 'ClassDeclaration' && pureClass(x, src)) ? x.id.name :
  x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'Identifier' && (!x.declarations[0].init || pure(x.declarations[0].init, src)) ? x.declarations[0].id.name : null;
const countRefs = (node, refs) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) countRefs(x, refs); return; }
  if (node.type === 'Identifier') { if (node.name.includes('#m')) refs[node.name] = (refs[node.name] ?? 0) + 1; return; }
  for (const key in node) if (key !== 'start' && key !== 'end') countRefs(node[key], refs);
};

// names builtins read off objects themselves
const IMPLICIT_NAMES = new Set([ 'then', 'next', 'return', 'throw', 'get', 'set', 'has', 'apply', 'call', 'construct', 'deleteProperty', 'defineProperty',
  'getOwnPropertyDescriptor', 'getPrototypeOf', 'setPrototypeOf', 'isExtensible', 'preventExtensions', 'ownKeys', 'toString', 'valueOf', 'toJSON', 'exec', 'constructor',
  'value', 'writable', 'enumerable', 'configurable', 'done' ]);


// a.b.c for a plain member chain
const dottedPath = node => node.type === 'Identifier' ? node.name
  : node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier' ? (x => x && `${x}.${node.property.name}`)(dottedPath(node.object)) : null;

const constValue = node => {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '!') { const v = constValue(node.argument); return v === undefined ? undefined : !v; }
  if (node.type === 'BinaryExpression') {
    const l = constValue(node.left), r = constValue(node.right);
    if (l === undefined || r === undefined) return undefined;
    switch (node.operator) {
      case '===': case '==': return l === r;
      case '!==': case '!=': return l !== r;
    }
  }
  return undefined;
};

// names and reexports node's cjs-module-lexer detects
const cjsExports = (node, out) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) cjsExports(x, out); return out; }
  const isExports = x => x.type === 'Identifier' ? x.name === 'exports' : x.type === 'MemberExpression' && !x.computed && x.object.name === 'module' && x.property.name === 'exports';
  const requireSpec = x => x?.type === 'CallExpression' && x.callee.name === 'require' && typeof x.arguments[0]?.value === 'string' ? x.arguments[0].value : null;
  const keyName = (key, computed) => !computed && key.type === 'Identifier' ? key.name : key.type === 'Literal' && typeof key.value === 'string' ? key.value : null;

  if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'MemberExpression') {
    if (isExports(node.left.object)) {
      const name = keyName(node.left.property, node.left.computed);
      if (name) out.names.add(name);
    } else if (isExports(node.left)) {
      if (requireSpec(node.right)) out.reexports.push(requireSpec(node.right));
      if (node.right.type === 'ObjectExpression') for (const x of node.right.properties) {
        if (x.type === 'SpreadElement') { if (requireSpec(x.argument)) out.reexports.push(requireSpec(x.argument)); }
          else if (keyName(x.key, x.computed)) out.names.add(keyName(x.key, x.computed));
      }
    }
  }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && requireSpec(node.init)) (out.required ??= Object.create(null))[node.id.name] = requireSpec(node.init);
  if (node.type === 'CallExpression') {
    const callee = node.callee, [ target, key ] = node.arguments;
    if (callee.type === 'MemberExpression' && callee.object.name === 'Object' && callee.property.name === 'defineProperty' && target && isExports(target) && typeof key?.value === 'string') out.names.add(key.value);
    const name = callee.type === 'MemberExpression' ? callee.property.name : callee.name;
    if ((name === '__exportStar' || name === '__export') && requireSpec(target)) out.reexports.push(requireSpec(target));
    // Object.keys(x).forEach(k => { exports[k] = x[k] }) with var x = require('y'), as babel and rollup emit
    if (name === 'forEach' && callee.object?.type === 'CallExpression' && callee.object.callee.object?.name === 'Object' && callee.object.callee.property?.name === 'keys') {
      const spec = out.required?.[callee.object.arguments[0]?.name];
      if (spec) out.reexports.push(spec);
    }
  }

  for (const key in node) if (key !== 'start' && key !== 'end') cjsExports(node[key], out);
  return out;
};

// require used as a value, or module beyond module.exports
const usesModuleSystem = node => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(usesModuleSystem);
  switch (node.type) {
    case 'Identifier': return node.name === 'require' || node.name === 'module';
    case 'CallExpression':
      if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments.length === 1 && typeof node.arguments[0].value === 'string') return false;
      break;
    case 'MemberExpression':
      if (!node.computed && node.object.type === 'Identifier' && node.object.name === 'module') return node.property.name !== 'exports';
      return usesModuleSystem(node.object) || (node.computed && usesModuleSystem(node.property));
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return (node.computed && usesModuleSystem(node.key)) || usesModuleSystem(node.value);
  }
  for (const key in node) if (key !== 'start' && key !== 'end' && usesModuleSystem(node[key])) return true;
  return false;
};

// names bound to createRequire() results (createRequire being its local names)
const createdRequires = (node, createRequire, out) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) createdRequires(x, createRequire, out); return out; }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'CallExpression' &&
    (createRequire.has(node.init.callee.name) || node.init.callee.property?.name === 'createRequire')) out.add(node.id.name);
  for (const key in node) if (key !== 'start' && key !== 'end') createdRequires(node[key], createRequire, out);
  return out;
};

// one of those requires called with a non-literal or used as a value (not just require.resolve)
const requiresDynamically = (node, names) => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(x => requiresDynamically(x, names));
  switch (node.type) {
    case 'Identifier': return names.has(node.name);
    case 'VariableDeclarator': return requiresDynamically(node.init, names);
    case 'CallExpression':
      if (node.callee.type === 'Identifier' && names.has(node.callee.name) && node.arguments.length === 1 && typeof node.arguments[0].value === 'string') return false;
      break;
    case 'MemberExpression':
      return (node.object.type !== 'Identifier' && requiresDynamically(node.object, names)) || (node.computed && requiresDynamically(node.property, names));
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return (node.computed && requiresDynamically(node.key, names)) || requiresDynamically(node.value, names);
  }
  for (const key in node) if (key !== 'start' && key !== 'end' && requiresDynamically(node[key], names)) return true;
  return false;
};

// vm sources known at compile time: literals and string vars built up in source order, ignoring scopes
const VM_CALLS = new Set([ 'Script', 'createScript', 'runInThisContext', 'runInContext', 'runInNewContext', 'compileFunction', 'SourceTextModule' ]);
const stringKey = node => node.type === 'Identifier' ? node.name :
  node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' ? node.object.name + '.' + node.property.name : null;
const constString = (node, known) => {
  switch (node.type) {
    case 'Literal': return typeof node.value === 'string' ? node.value : null;
    case 'TemplateLiteral': return node.expressions.length === 0 ? node.quasis[0].value.cooked : null;
    case 'BinaryExpression': {
      if (node.operator !== '+') return null;
      const l = constString(node.left, known), r = constString(node.right, known);
      return l != null && r != null ? l + r : null;
    }
  }
  return known[stringKey(node)] ?? null;
};
const stringConsts = (node, known) => {
  if (!node || typeof node !== 'object') return known;
  if (Array.isArray(node)) { for (const x of node) stringConsts(x, known); return known; }
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) known[node.id.name] = constString(node.init, known);
  if (node.type === 'AssignmentExpression' && stringKey(node.left)) {
    const key = stringKey(node.left), r = constString(node.right, known);
    known[key] = node.operator === '=' ? r : node.operator === '+=' && r != null && known[key] != null ? known[key] + r : null;
  }
  for (const key in node) if (key !== 'start' && key !== 'end') stringConsts(node[key], known);
  return known;
};

// vm scripts: top-level vars and functions go on the context, the completion value is the result
const vmStatement = node => {
  const assigns = decl => {
    const inits = decl.declarations.filter(d => d.init);
    return inits.length ? { type: 'SequenceExpression', expressions: inits.map(d => ({ type: 'AssignmentExpression', operator: '=', left: d.id, right: d.init })) } : null;
  };
  switch (node.type) {
    case 'ExpressionStatement': return assign(ident('#c'), node.expression);
    case 'VariableDeclaration': {
      if (node.kind !== 'var') return node;
      const expression = assigns(node);
      return expression ? { type: 'ExpressionStatement', expression } : { type: 'EmptyStatement' };
    }
    case 'BlockStatement': node.body = node.body.map(vmStatement); return node;
    case 'IfStatement':
      node.consequent = vmStatement(node.consequent);
      if (node.alternate) node.alternate = vmStatement(node.alternate);
      return node;
    case 'ForStatement':
      if (node.init?.type === 'VariableDeclaration' && node.init.kind === 'var') node.init = assigns(node.init);
      node.body = vmStatement(node.body);
      return node;
    case 'ForInStatement':
    case 'ForOfStatement':
      if (node.left.type === 'VariableDeclaration' && node.left.kind === 'var') node.left = node.left.declarations[0].id;
      node.body = vmStatement(node.body);
      return node;
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'LabeledStatement':
    case 'WithStatement':
      node.body = vmStatement(node.body);
      return node;
    case 'TryStatement':
      node.block = vmStatement(node.block);
      if (node.handler) node.handler.body = vmStatement(node.handler.body);
      if (node.finalizer) node.finalizer = vmStatement(node.finalizer);
      return node;
    case 'SwitchStatement':
      for (const x of node.cases) x.consequent = x.consequent.map(vmStatement);
      return node;
  }
  return node;
};
const bindingNames = (node, out) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { for (const x of node) bindingNames(x, out); return out; }
  if (node.type === 'VariableDeclarator') patternNames(node.id, out);
  if (isFunc(node)) for (const x of node.params) patternNames(x, out);
  if ((isFunc(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') && node.id) out.push(node.id.name);
  if (node.type === 'CatchClause') patternNames(node.param, out);
  for (const key in node) if (key !== 'start' && key !== 'end') bindingNames(node[key], out);
  return out;
};
const vmTypeofs = (node, bound) => {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(x => vmTypeofs(x, bound));
  if (node.type === 'UnaryExpression' && node.operator === 'typeof' && node.argument.type === 'Identifier' && !bound.has(node.argument.name)) {
    const inside = right => ({ type: 'BinaryExpression', operator: 'in', left: literal(node.argument.name), right: ident(right) });
    return { type: 'ConditionalExpression', test: { type: 'LogicalExpression', operator: '||',
      left: inside('#g'), right: { type: 'UnaryExpression', operator: '!', prefix: true, argument: inside('#scope') } }, consequent: node, alternate: literal('undefined') };
  }
  for (const key in node) if (key !== 'start' && key !== 'end') node[key] = vmTypeofs(node[key], bound);
  return node;
};
const hasTopLevelAwait = node => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasTopLevelAwait);
  if (isFunc(node) || node.type === 'ClassExpression' || node.type === 'ClassDeclaration') return false;
  if (node.type === 'AwaitExpression' || (node.type === 'ForOfStatement' && node.await) || (node.type === 'VariableDeclaration' && node.kind === 'await using')) return true;
  for (const key in node) if (key !== 'start' && key !== 'end' && hasTopLevelAwait(node[key])) return true;
  return false;
};

// sloppy functions called without a receiver see the context's global as this
const vmThis = (node, inFunction) => {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(x => vmThis(x, inFunction));
  if (node.type === 'ThisExpression' && inFunction) return { type: 'ConditionalExpression', test: { type: 'BinaryExpression', operator: '===', left: node, right: ident('globalThis') }, consequent: ident('#g'), alternate: { type: 'ThisExpression' } };
  // the context is the script's global object
  if (node.type === 'Identifier' && node.name === 'globalThis') return ident('#g');
  if (node.type === 'ClassBody') return node;
  const fn = node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression';
  for (const key in node) {
    if (key === 'start' || key === 'end' || ((key === 'property' || key === 'key') && !node.computed)) continue;
    node[key] = vmThis(node[key], inFunction || fn);
  }
  return node;
};
const vmDynamicImports = node => {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(vmDynamicImports);
  if (node.type === 'ImportExpression') return { type: 'CallExpression', optional: false, callee: ident('#dynamic'), arguments: [ vmDynamicImports(node.source), ...(node.options ? [ vmDynamicImports(node.options) ] : []) ] };
  for (const key in node) if (key !== 'start' && key !== 'end') node[key] = vmDynamicImports(node[key]);
  return node;
};
const vmWrapper = (code, params, id) => {
  let body;
  try {
    body = params ? [ { type: 'ReturnStatement', argument: parse(`(function (${params.join(',')}) {\n${code}\n})`, { module: false }).body[0].expression } ] : parse(code, { module: false }).body;
  } catch (e) {
    if (e.name !== 'SyntaxError') throw e;
    return { type: 'NewExpression', callee: ident('SyntaxError'), arguments: [ literal(e.message) ] };
  }

  const strict = !params && body.some(x => x.directive === 'use strict');
  const declares = [];
  if (!params) {
    const funcs = body.filter(x => x.type === 'FunctionDeclaration');
    // vars are non-configurable global properties
    for (const name of new Set(varNames(body, []))) declares.push({ type: 'IfStatement', alternate: null,
      test: { type: 'UnaryExpression', operator: '!', prefix: true, argument: { type: 'BinaryExpression', operator: 'in', left: literal(name), right: ident('#g') } },
      consequent: { type: 'ExpressionStatement', expression: { type: 'CallExpression', optional: false, callee: member(ident('Object'), 'defineProperty'),
        arguments: [ ident('#g'), literal(name), jsonToAst({ writable: true, enumerable: true, configurable: false }) ] } } });
    body = [ ...funcs.map(x => assign(ident(x.id.name), { ...x, type: 'FunctionExpression' })), ...body.filter(x => x.type !== 'FunctionDeclaration').map(vmStatement) ];
  }
  body = vmTypeofs(vmThis(vmDynamicImports(body), false), new Set(bindingNames(body, [])));

  // sloppy like a script, whatever the program is, with strict code's failed assignments thrown by its scope
  const fn = { type: 'FunctionExpression', id: null, params: [ ident('#scope'), ident('#g'), ident('#dynamic') ], async: false, generator: false, expression: false, strict: false, body: { type: 'BlockStatement', body: [
    varDecl('let', '#c', null), ...declares,
    // start names the with's object slot
    { type: 'WithStatement', start: -id, object: ident('#scope'), body: { type: 'BlockStatement', body } },
    { type: 'ReturnStatement', argument: ident('#c') }
  ] } };
  return strict ? { type: 'CallExpression', optional: false, callee: member(ident('Object'), 'assign'), arguments: [ fn, jsonToAst({ strict }) ] } : fn;
};

// vm SourceTextModule: instantiate() declares its bindings in the context, giving export getters and evaluate
const vmModule = (code, id) => {
  let body;
  try {
    body = parse(code, { module: true }).body;
  } catch (e) {
    if (e.name !== 'SyntaxError') throw e;
    return { type: 'NewExpression', callee: ident('SyntaxError'), arguments: [ literal(e.message) ] };
  }

  const requests = [], imports = new Map(), imported = [], exports = [], stars = [], names = [], lexical = [], funcs = [], stmts = [];
  const request = node => {
    const attributes = Object.fromEntries((node.attributes ?? []).map(x => [ x.key.name ?? x.key.value, x.value.value ]));
    const key = JSON.stringify([ node.source.value, attributes ]);
    let i = requests.findIndex(x => x.key === key);
    if (i === -1) i = requests.push({ key, specifier: node.source.value, attributes }) - 1;
    return i;
  };
  // named imports are checked against the namespaces when linking
  const ref = (i, name) => {
    const ns = { type: 'MemberExpression', object: ident('#imp'), property: literal(i), computed: true, optional: false };
    return name == null ? ns : { type: 'MemberExpression', object: ns, property: literal(name), computed: true, optional: false };
  };
  const binding = (i, name) => {
    if (name != null) imported.push([ i, name ]);
    return [ i, name ];
  };
  const declare = decl => {
    if (decl.type === 'FunctionDeclaration') {
      names.push(decl.id.name);
      funcs.push(assign(ident(decl.id.name), { ...decl, type: 'FunctionExpression' }));
      return [ decl.id.name ];
    }
    if (decl.type === 'ClassDeclaration') {
      names.push(decl.id.name);
      lexical.push(decl.id.name);
      stmts.push(assign(ident(decl.id.name), { ...decl, type: 'ClassExpression' }));
      return [ decl.id.name ];
    }
    const out = [];
    for (const d of decl.declarations) {
      patternNames(d.id, out);
      if (d.init || decl.kind !== 'var') stmts.push(assign(d.id, d.init ?? ident('undefined')));
    }
    names.push(...out);
    if (decl.kind !== 'var') lexical.push(...out);
    return out;
  };

  for (const node of body) {
    switch (node.type) {
      case 'ImportDeclaration': {
        const i = request(node);
        for (const x of node.specifiers) imports.set(x.local.name, binding(i, x.type === 'ImportNamespaceSpecifier' ? null : x.type === 'ImportDefaultSpecifier' ? 'default' : exportName(x.imported)));
        break;
      }
      case 'ExportNamedDeclaration':
        if (node.source) {
          const i = request(node);
          for (const x of node.specifiers) exports.push([ exportName(x.exported), ref(...binding(i, exportName(x.local))) ]);
        } else if (node.declaration) {
          for (const name of declare(node.declaration)) exports.push([ name, ident(name) ]);
        } else for (const x of node.specifiers) exports.push([ exportName(x.exported), ident(exportName(x.local)) ]);
        break;
      case 'ExportDefaultDeclaration': {
        const decl = node.declaration;
        if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) exports.push([ 'default', ident(declare(decl)[0]) ]);
        else {
          names.push('#default');
          (decl.type === 'FunctionDeclaration' ? funcs : stmts).push(assign(ident('#default'), decl.type.endsWith('Declaration') ? { ...decl, type: decl.type.replace('Declaration', 'Expression') } : decl));
          exports.push([ 'default', ident('#default') ]);
        }
        break;
      }
      case 'ExportAllDeclaration':
        if (node.exported) exports.push([ exportName(node.exported), ref(request(node), null) ]);
          else stars.push(request(node));
        break;
      case 'VariableDeclaration':
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        declare(node);
        break;
      default:
        stmts.push(node);
    }
  }

  // let, const and class bindings hold #uninit until evaluated, reading them before throws like their tdz
  const tdz = value => value.type === 'Identifier' && lexical.includes(value.name) ? [ { type: 'IfStatement', alternate: null,
    test: { type: 'BinaryExpression', operator: '===', left: ident(value.name), right: ident('#uninit') },
    consequent: throwNew('ReferenceError', `Cannot access '${value.name}' before initialization`) } ] : [];
  const getters = { type: 'ObjectExpression', properties: exports.map(([ name, value ]) => property(literal(name),
    { type: 'FunctionExpression', id: null, params: [], async: false, generator: false, expression: false, body: { type: 'BlockStatement', body: [ ...tdz(value), { type: 'ReturnStatement', argument: value } ] } }, 'get')) };
  const evaluate = { type: 'FunctionExpression', id: null, params: [], async: hasTopLevelAwait(stmts), generator: false, expression: false, body: { type: 'BlockStatement', body: stmts } };
  let inner = [ ...(names.length ? [ { type: 'VariableDeclaration', kind: 'let', declarations: names.map(x => ({ type: 'VariableDeclarator', id: ident(x), init: lexical.includes(x) ? ident('#uninit') : null })) } ] : []), ...funcs,
    { type: 'ReturnStatement', argument: { type: 'ObjectExpression', properties: [ property(ident('getters'), getters), property(ident('evaluate'), evaluate) ] } } ];

  // imported bindings read the dependency's namespace, import.meta and import() go through the module
  const rewrite = node => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(rewrite);
    if (node.type === 'Identifier') return imports.has(node.name) ? ref(...imports.get(node.name)) : node;
    if (node.type === 'MetaProperty' && node.meta.name === 'import') return ident('#meta');
    if (node.type === 'MemberExpression' && !node.computed) { node.object = rewrite(node.object); return node; }
    if (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') {
      if (node.shorthand && imports.has(node.key.name)) node.shorthand = false;
      if (node.computed) node.key = rewrite(node.key);
      node.value = rewrite(node.value);
      return node;
    }
    if (node.type === 'LabeledStatement' || node.type === 'BreakStatement' || node.type === 'ContinueStatement') { if (node.body) node.body = rewrite(node.body); return node; }
    for (const key in node) if (key !== 'start' && key !== 'end') node[key] = rewrite(node[key]);
    return node;
  };
  inner = vmTypeofs(vmDynamicImports(rewrite(inner)), new Set(bindingNames(inner, [ ...names ])));

  const instantiate = { type: 'FunctionExpression', id: null, params: [ ident('#scope'), ident('#g'), ident('#imp'), ident('#meta'), ident('#dynamic'), ident('#uninit') ], async: false, generator: false, expression: false, strict: false,
    body: { type: 'BlockStatement', body: [ { type: 'WithStatement', start: -id, object: ident('#scope'), body: { type: 'BlockStatement', body: inner } } ] } };
  return { type: 'ObjectExpression', properties: [
    property(ident('requests'), jsonToAst(requests.map(x => ({ specifier: x.specifier, attributes: x.attributes })))),
    property(ident('exports'), jsonToAst(exports.map(x => x[0]))),
    property(ident('stars'), jsonToAst(stars)),
    property(ident('imports'), jsonToAst(imported)),
    property(ident('async'), literal(evaluate.async)),
    property(ident('instantiate'), instantiate)
  ] };
};

export default (entrySource, entryFile, opts = {}) => {
  const modules = new Map();
  const vmSources = new Map();
  const requireSites = [];
  const runtimeImportSites = [];
  const runtime = opts.runtimeImports ?? null;
  const entryDir = dirname(entryFile);
  // --define:process.env.X=value (like esbuild) replaces reads of that path with the value
  const defines = { 'process.env.NODE_ENV': JSON.stringify(Prefs.d ? 'development' : 'production') };
  for (const k in Prefs) if (k.startsWith('define:')) defines[k.slice(7)] = String(Prefs[k]);
  let anyTs = false;

  const load = (file, source = null, kind = null, entry = false) => {
    let mod = modules.get(file);
    if (mod) return mod;

    source ??= file.startsWith('data:') ? dataSource(file) : (runtime && file in runtime) ? runtime[file] : fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(entryDir + '/') ? file.slice(entryDir.length + 1) : file;
    mod = { file, rel, src: source, id: hashId(rel), entry, esm: true, exports: new Map(), stars: [], imports: [], deps: [], body: null, nsUsed: false };

    if (kind === 'json' || kind === 'text') {
      modules.set(file, mod);
      mod.json = kind === 'json';
      mod.body = [ varDecl('const', 'default', kind === 'json' ? jsonToAst(JSON.parse(source)) : literal(source)) ];
      mod.exports.set('default', { local: 'default' });
      return mod;
    }

    const ts = /\.[cm]?tsx?$/.test(file) || !!(entry ? opts.ts : Prefs.parseTypes || Prefs.t);
    anyTs ||= ts;
    mod.esm = entry ? !opts.script && !opts.cjs && !/\.c[jt]s$/.test(file) : isEsmSource(file, source);
    // cjs code is a function body to node
    mod.body = parse(source, { module: mod.esm, ts, topReturn: !mod.esm && !(entry && opts.script) }).body;
    literalImports(mod.body);
    modules.set(file, mod);
    if (mod.esm) collectModule(mod);
    // function declarations lead the block, as they do the function body node runs
    else if (topReturns(mod.body, `#cjs#m${mod.id}`)) mod.body = [ { type: 'LabeledStatement', label: ident(`#cjs#m${mod.id}`), body: { type: 'BlockStatement', body: [
      ...mod.body.filter(x => x.type === 'FunctionDeclaration'), ...mod.body.filter(x => x.type !== 'FunctionDeclaration')
    ] } } ];
    if (!mod.esm) {
      mod.cjsExports = cjsExports(mod.body, { names: new Set([ 'default', 'module.exports' ]), reexports: [] });
      // becomes a real Module once the program uses node's module system
      mod.moduleDecl = varDecl('const', 'module', { type: 'ObjectExpression', properties: [ property(ident('exports'), { type: 'ObjectExpression', properties: [] }) ] });
      mod.moduleDecl.declarations[0].id._plainModule = true;
      // a cjs module's own module variable is the wrapper's parameter: node's loader keeps the module object apart
      const ownModule = varNames(mod.body, []).includes('module') || mod.body.some(x => x.type === 'FunctionDeclaration' && x.id?.name === 'module');
      if (ownModule) renameUnshadowed(mod.body, 'module', '#module');
      mod.body.unshift(mod.moduleDecl, varDecl('let', 'exports', member(ident('module'), 'exports')), ...(ownModule ? [ varDecl('var', '#module', ident('module')) ] : []));
    }
    return mod;
  };

  // 'dynamic'/'deferred' targets are evaluated when first needed unless something imports them normally
  const dep = (mod, node, lazy = false, as = null) => {
    const attrs = node.attributes ?? [];
    const type = attrs.find(x => (x.key.name ?? x.key.value) === 'type')?.value.value;
    let file;
    try {
      file = resolve(node.source.value, mod.file, !mod.esm, runtime);
    } catch (e) {
      // dynamic import() and require() of something unresolvable fail when they run
      if (!lazy) throw Object.assign(e, { unresolved: true });
      return { error: e.message, notFound: e.notFound };
    }
    // data: urls are javascript or json, esm imports check their type attribute against the module's format
    const mime = file.startsWith('data:') ? file.slice(5, file.search(/[,;]/)) : null;
    const json = file.endsWith('.json') || mime === 'application/json';
    const url = file.startsWith('data:') ? file : 'file://' + file;
    const formatError = mime != null && mime !== 'text/javascript' && mime !== 'application/json' ? { error: `Unknown module format: ${mime} for URL ${file}`, errorType: 'TypeError', code: 'ERR_UNKNOWN_MODULE_FORMAT' } :
      !node.attributes || file.startsWith(RUNTIME_ROOT) ? null :
      type != null && type !== 'json' && type !== 'text' ? { error: `Import attribute "type" with value "${type}" is not supported`, errorType: 'TypeError', code: 'ERR_IMPORT_ATTRIBUTE_UNSUPPORTED' } :
      json && type == null ? { error: `Module "${url}" needs an import attribute of "type: json"`, errorType: 'TypeError', code: 'ERR_IMPORT_ATTRIBUTE_MISSING' } :
      !json && type === 'json' ? { error: `Module "${url}" is not of type "json"`, errorType: 'TypeError', code: 'ERR_IMPORT_ATTRIBUTE_TYPE_INCOMPATIBLE' } : null;
    if (formatError) {
      if (lazy) return formatError;
      throw Object.assign(new TypeError(formatError.error), { code: formatError.code });
    }

    const kind = type === 'json' || type === 'text' ? type : (json ? 'json' : null);
    let d;
    try {
      d = load(file, null, kind);
    } catch (e) {
      // so do ones that do not parse or import something unresolvable
      if (!lazy || (e.name !== 'SyntaxError' && !e.unresolved)) throw e;
      modules.delete(file);
      return { error: e.message, errorType: e.name };
    }
    if (as) d[as] = true;
      else if (!mod.deps.includes(d)) mod.deps.push(d);
    return d;
  };
  const asyncGraph = (mod, seen = new Set()) => {
    if (seen.has(mod)) return false;
    seen.add(mod);
    return mod.esm && (hasTopLevelAwait(mod.body) || mod.deps.some(d => asyncGraph(d, seen)));
  };
  // names node's cjs-module-lexer finds, through reexported modules too
  const cjsReexported = mod => mod.cjsExports.reexports.flatMap(spec => {
    try {
      const d = load(resolve(spec, mod.file, true, runtime));
      return d.esm || d.cjsExports ? [ d ] : [];
    } catch {
      return [];
    }
  });
  const cjsHasExport = (mod, name, seen) => {
    if (mod.cjsExports.names.has(name)) return true;
    const key = mod.id + ':' + name;
    if (seen[key]) return false;
    seen[key] = true;
    for (const d of cjsReexported(mod)) if (d.esm ? resolveExport(d, name, seen) : cjsHasExport(d, name, seen)) return true;
    return false;
  };
  const throwExpr = (message, error = 'Error', props) => ({ type: 'CallExpression', optional: false, arguments: [], callee: { type: 'ArrowFunctionExpression', params: [], async: false, generator: false, expression: false, body: { type: 'BlockStatement', body: [ throwNew(error, message, props) ] } } });

  // import/export syntax becomes binding records, the rest of the body stays
  const collectModule = mod => {
    const body = [];
    for (const node of mod.body) {
      switch (node.type) {
        case 'ImportDeclaration': {
          if (node.importKind === 'type') break;
          const deferred = node.phase === 'defer';
          const d = dep(mod, node, false, deferred ? 'deferred' : null);
          if (node.specifiers.length === 0) (mod.sideDeps ??= []).push(d);
          for (const spec of node.specifiers) {
            if (spec.importKind === 'type') continue;
            const name = spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : exportName(spec.imported);
            mod.imports.push({ local: spec.local.name, dep: d, name, spec: node.source.value, deferred });
          }
          break;
        }

        case 'ExportAllDeclaration': {
          const d = dep(mod, node);
          if (node.exported) mod.exports.set(exportName(node.exported), { ns: d });
          else mod.stars.push(d);
          break;
        }

        case 'ExportNamedDeclaration': {
          if (node.exportKind === 'type') break;
          if (node.declaration) {
            const decl = node.declaration;
            body.push(decl);
            if (decl.type.startsWith('TS') && decl.type !== 'TSEnumDeclaration') break;
            if (decl.type === 'VariableDeclaration') {
              for (const d of decl.declarations) for (const name of patternNames(d.id, [])) mod.exports.set(name, { local: name });
            } else mod.exports.set(decl.id.name, { local: decl.id.name });
            break;
          }
          const d = node.source ? dep(mod, node) : null;
          for (const spec of node.specifiers) {
            if (spec.exportKind === 'type') continue;
            const local = exportName(spec.local);
            mod.exports.set(exportName(spec.exported), d ? { from: d, name: local } : { local });
          }
          break;
        }

        case 'ExportDefaultDeclaration': {
          const decl = node.declaration;
          if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
            decl.id ??= ident('default');
            body.push(decl);
            mod.exports.set('default', { local: decl.id.name });
          } else if (!decl.type.startsWith('TS')) {
            body.push(varDecl('const', 'default', decl));
            mod.exports.set('default', { local: 'default' });
          }
          break;
        }

        case 'TSExportAssignment':
          body.push(varDecl('const', 'default', node.expression));
          mod.exports.set('default', { local: 'default' });
          break;

        case 'TSImportEqualsDeclaration':
          if (node.moduleReference.type !== 'TSExternalModuleReference') break;
          body.push(varDecl('const', node.id.name, call('require', [ node.moduleReference.expression ])));
          if (node.isExport) mod.exports.set(node.id.name, { local: node.id.name });
          break;

        default:
          body.push(node);
      }
    }
    mod.body = body;
  };

  const globalName = (mod, name) => `${name}#m${mod.id}`;
  const nsName = mod => { mod.nsUsed = true; return `#ns#m${mod.id}`; };
  const exportsOf = mod => member(ident(globalName(mod, 'module')), 'exports');

  // where an export lives: { global } renamed esm binding, { ns } a namespace, { cjs, prop } a property of module.exports
  const resolveExport = (mod, name, seen = Object.create(null)) => {
    // cjs builtins export every property like node's
    if (!mod.esm) return mod.file.startsWith(RUNTIME_ROOT) || cjsHasExport(mod, name, seen) ? { cjs: mod, prop: name === 'default' || name === 'module.exports' ? null : name } : null;
    const key = mod.id + ':' + name;
    if (seen[key]) return null;
    seen[key] = true;

    const own = mod.exports.get(name);
    if (own) {
      if (own.ns) return { ns: own.ns };
      if (own.local == null) return resolveExport(own.from, own.name, seen);
      // exporting an import binding forwards to where it came from
      const imp = mod.imports.find(x => x.local === own.local);
      if (!imp) return { global: globalName(mod, own.local) };
      if (imp.name === '*') return { ns: imp.dep };
      return resolveExport(imp.dep, imp.name, seen);
    }
    // a builtin's module.exports is its namespace when it has no default export
    if (name === 'default') return mod.file.startsWith(RUNTIME_ROOT) ? { ns: mod } : null;
    // star exports: the same binding through several stars is fine, different ones are ambiguous
    let found = null;
    for (const star of mod.stars) {
      const r = resolveExport(star, name, seen);
      if (!r) continue;
      if (r.ambiguous) return r;
      if (found && (found.global !== r.global || found.ns !== r.ns || found.cjs !== r.cjs || found.prop !== r.prop)) return { ambiguous: true };
      found ??= r;
    }
    return found;
  };
  const exportNames = (mod, out = Object.create(null), seen = Object.create(null)) => {
    if (seen[mod.id]) return out;
    seen[mod.id] = true;
    for (const name of mod.esm ? mod.exports.keys() : mod.cjsExports.names) out[name] = true;
    for (const star of mod.esm ? mod.stars : cjsReexported(mod)) for (const name in exportNames(star, Object.create(null), seen)) if (name !== 'default' && name !== 'module.exports') out[name] = true;
    return out;
  };
  const exportExpr = r => r.global ? ident(r.global) : r.ns ? ident(nsName(r.ns)) : r.prop != null ? member(exportsOf(r.cjs), r.prop) : exportsOf(r.cjs);

  // a cjs module's namespace has its detected names, default and 'module.exports' being module.exports, like node's
  const namespaceExpr = (mod, evaluate = null) => {
    const names = [], properties = [];
    for (const name of Object.keys(exportNames(mod)).sort()) {
      const r = resolveExport(mod, name);
      if (!r || r.ambiguous) continue;
      names.push(literal(name));
      properties.push(property(literal(name), { type: 'FunctionExpression', id: null, params: [], async: false, generator: false, body: { type: 'BlockStatement', body: [ { type: 'ReturnStatement', argument: exportExpr(r) } ] } }, 'get'));
    }
    return call('__Porffor_module_namespace', [
      { type: 'ArrayExpression', elements: names }, { type: 'ObjectExpression', properties }, evaluate ?? ident('undefined')
    ]);
  };
  const dnsName = mod => { mod.dnsUsed = true; return `#dns#m${mod.id}`; };

  // map: original name -> new name or replacement node
  const rename = (mod, map, imported) => {
    const scopes = [];
    const shadowed = name => scopes.some(s => s.has(name));
    const firstRef = new Map();
    // what an esm module imports, which stays evaluated before it even if it also requires it
    const importDeps = mod.esm ? new Set(mod.deps) : null;
    // cjs using node's module system (past its module/exports decls) requires through it
    const moduleRuntime = !mod.esm && runtime && !mod.file.startsWith(RUNTIME_ROOT) && usesModuleSystem(mod.body.slice(2)) && dep(mod, { source: literal('node:module') });
    const requireLinked = (d, key) => {
      if (!d.file.startsWith(RUNTIME_ROOT)) {
        mod.deps.splice(mod.deps.indexOf(d), 1);
        (mod.cjsDeps ??= new Set()).add(d);
        d.required = true;
      }
      return call(resolveExport(moduleRuntime, 'requireLinked').global, [ ident(globalName(mod, 'module')), literal(key) ]);
    };
    const requireTarget = node => {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'require' || shadowed('require') || node.arguments.length !== 1 || typeof node.arguments[0].value !== 'string') return null;
      const d = dep(mod, { source: node.arguments[0] }, true);
      if (moduleRuntime && !d.error && !d.json && !(d.esm && asyncGraph(d))) return requireLinked(d, d.file.startsWith(RUNTIME_ROOT) ? node.arguments[0].value : d.file);
      // cjs fails like node, at runtime with its module system's error (a missing module's is the one below)
      if (d.error && !d.notFound && !d.errorType && !mod.esm && runtime) return null;
      if (d.error) return d.notFound ? throwExpr(`Cannot find module '${node.arguments[0].value}'\nRequire stack:\n- ${mod.file}`, 'Error', { code: 'MODULE_NOT_FOUND', requireStack: [ mod.file ] }) : throwExpr(d.error, d.errorType, d.code && { code: d.code });
      if (d.json) return ident(globalName(d, 'default'));
      // node builtins' module.exports is their default export
      if (d.esm && d.file.startsWith(RUNTIME_ROOT) && d.exports.has('default')) return exportExpr(resolveExport(d, 'default'));
      if (d.esm && asyncGraph(d)) {
        // node only requires synchronous esm graphs, this one is not evaluated
        mod.deps.splice(mod.deps.indexOf(d), 1);
        return throwExpr(`require() cannot be used on an ESM graph with top-level await. Use import() instead. To see where the top-level await comes from, use --experimental-print-required-tla.\n  From ${mod.file} \n  Requiring ${d.file} `, 'Error', { code: 'ERR_REQUIRE_ASYNC_MODULE', requireStack: [ mod.file ] });
      }
      if (d.esm) {
        // require(esm) gives its 'module.exports' export when it has one
        const r = resolveExport(d, 'module.exports');
        return r && !r.ambiguous ? exportExpr(r) : ident(nsName(d));
      }
      // evaluated in place if it ends up lazy, eg as part of a require cycle
      (mod.cjsDeps ??= new Set()).add(d);
      if (importDeps?.has(d)) (mod.importedDeps ??= new Set()).add(d);
      const site = { type: 'SequenceExpression', expressions: [ call(`#eval#m${d.id}`), exportsOf(d) ], _required: true };
      requireSites.push([ site, d ]);
      return site;
    };
    // process.getBuiltinModule('x') links the builtin like require, undefined when there is none
    const builtinModuleTarget = node => {
      const callee = node.callee, spec = node.arguments[0]?.value;
      if (callee.type !== 'MemberExpression' || callee.computed || callee.object.name !== 'process' || shadowed('process') || callee.property.name !== 'getBuiltinModule' || typeof spec !== 'string') return null;
      const key = runtime && builtinKey(spec.replace(/^node:/, ''), mod.file, spec.startsWith('node:'));
      if (!key || !(key in runtime)) return ident('undefined');
      const d = dep(mod, { source: node.arguments[0] });
      return d.exports.has('default') ? exportExpr(resolveExport(d, 'default')) : ident(nsName(d));
    };
    const scoped = (names, fn) => { scopes.push(new Set(names)); fn(); scopes.pop(); };
    let thisDepth = 0;
    const strings = !mod.file.startsWith(RUNTIME_ROOT) && /\b(?:Script|createScript|runIn\w*Context|compileFunction|SourceTextModule)\b/.test(mod.src) ? stringConsts(mod.body, Object.create(null)) : null;
    const vmSource = node => {
      const callee = node.callee;
      const name = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : callee.name;
      if (!strings || !VM_CALLS.has(name) || node.arguments.length === 0) return;
      const code = constString(node.arguments[0], strings);
      const params = name !== 'compileFunction' ? null : node.arguments[1] == null ? [] : node.arguments[1].type === 'ArrayExpression' ? node.arguments[1].elements.map(x => x && constString(x, strings)) : [ null ];
      if (code == null || params?.includes(null)) return;
      const key = params ? params.join(',') + '\x00' + code : name === 'SourceTextModule' ? 'module\x00' + code : code;
      if (!vmSources.has(key)) vmSources.set(key, name === 'SourceTextModule' ? vmModule(code, vmSources.size + 1) : vmWrapper(code, params, vmSources.size + 1));
    };
    const walkKeys = node => {
      for (const key in node) {
        if (SKIP_KEYS.has(key)) continue;
        const v = node[key];
        if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (v[i] && typeof v[i] === 'object') v[i] = walk(v[i]); }
        else if (v && typeof v === 'object' && v.type) node[key] = walk(v);
      }
      return node;
    };
    const walk = node => {
      switch (node.type) {
        case 'Identifier': {
          if (node.name === '__porffor_entry_file' && mod.file.startsWith(RUNTIME_ROOT)) return literal(entryFile);
          if (node.name === '__porffor_bundle' && mod.file.startsWith(RUNTIME_ROOT)) return ident('#bundle');
          if (node.name === '__porffor_vm_code' && mod.file.startsWith(RUNTIME_ROOT)) return ident('#vmcode');
          // require as a value and module beyond module.exports need node's module system
          if (!mod.esm && runtime && !shadowed(node.name)) {
            if (node.name === 'require' && !map.has('require')) {
              mod.requireUsed = true;
              return ident(globalName(mod, 'require'));
            }
            if (node.name === 'module' && !node._plainModule) mod.moduleUsed = true;
          }
          // a local binding, which the linker's reachability leaves alone
          if (shadowed(node.name)) {
            node._local = true;
            return node;
          }
          const to = map.get(node.name);
          if (to === undefined) return node;
          if (node.start < (firstRef.get(node.name) ?? Infinity)) firstRef.set(node.name, node.start);
          if (typeof to === 'string') { node.name = to; return node; }
          if (to.ns) { node.name = nsName(to.ns); return node; }
          return to;
        }

        case 'MemberExpression': {
          const path = node._target ? null : dottedPath(node);
          if (path in defines && !shadowed(path.slice(0, path.indexOf('.')))) return parse(`(${defines[path]})`, { module: false }).body[0].expression;
          // ns.name reads the export directly: the namespace object only exists for other uses
          const ns = node.object.type === 'Identifier' && !shadowed(node.object.name) ? map.get(node.object.name)?.ns : null;
          if (ns && !node.computed) {
            const r = resolveExport(ns, node.property.name);
            if (r) return exportExpr(r);
          }
          if (!node.computed && node.property.name === 'exports' && node.object.type === 'Identifier' && node.object.name === 'module') node.object._plainModule = true;
          // import.meta.resolve needs the module system, so only escaping import.meta or .resolve() gets it
          if (!node.computed && node.object.type === 'MetaProperty' && [ 'url', 'filename', 'dirname', 'main' ].includes(node.property.name)) node.object._plainMeta = true;
          node.object = walk(node.object);
          if (node.computed) node.property = walk(node.property);
          return node;
        }

        // a cjs module runs with module.exports as this
        case 'ThisExpression':
          return !mod.esm && !(mod.entry && opts.script) && thisDepth === 0 ? ident(globalName(mod, 'exports')) : node;

        case 'MetaProperty':
          if (node.meta.name === 'import') {
            mod.metaUsed = true;
            if (!node._plainMeta && runtime) mod.metaResolve = true;
            return ident(`#meta#m${mod.id}`);
          }
          return node;

        case 'ImportExpression': {
          node.source = walk(node.source);
          if (node.options) node.options = walk(node.options);

          // wrapped in an async arrow so abrupt completions reject like the spec's import()
          let result;
          if (node.source.type === 'Literal' && typeof node.source.value === 'string' && node.phase !== 'source') {
            const attrs = node.options?.type === 'ObjectExpression' ? node.options.properties.find(x => (x.key?.name ?? x.key?.value) === 'with')?.value : null;
            const d = dep(mod, { source: node.source, attributes: attrs?.type === 'ObjectExpression' ? attrs.properties : [] }, true, 'dynamic');
            if (d.error) result = d.errorType ? d : d.notFound ? { error: `Cannot find module '${/^[./]/.test(node.source.value) ? joinPath(dirname(mod.file), node.source.value) : node.source.value}' imported from ${mod.file}`, errorType: 'Error', code: 'ERR_MODULE_NOT_FOUND' } : { error: d.error };
              else { nsName(d); result = { ns: call(`#import#m${d.id}`) }; }
          } else if (node.phase === 'source') {
            result = { error: 'Source phase import is not available for source text modules', errorType: 'SyntaxError' };
          } else {
            if (!mod.runtimeImports) {
              mod.runtimeImports = true;
              // module paths written as literals in the source are likely targets too
              for (const m of mod.src.matchAll(/(['"`])(\.\.?\/[^'"`\n]+?\.m?[jt]s)\1/g)) dep(mod, { source: literal(m[2]) }, true, 'dynamic');
              requireCandidates(mod);
            }
            const site = call('#import_any', [ call('__Porffor_module_resolve', [ literal(dirname(mod.file)), ident('#import_s') ]) ]);
            runtimeImportSites.push([ site, mod.file ]);
            result = { runtime: { type: 'ReturnStatement', argument: site } };
          }

          const s = ident('#import_s'), o = ident('#import_o');
          const typeofIs = (x, t) => ({ type: 'BinaryExpression', operator: '===', left: { type: 'UnaryExpression', operator: 'typeof', prefix: true, argument: x }, right: literal(t) });
          const not = x => ({ type: 'UnaryExpression', operator: '!', prefix: true, argument: x });
          const and = (a, b) => ({ type: 'LogicalExpression', operator: '&&', left: a, right: b });
          const or = (a, b) => ({ type: 'LogicalExpression', operator: '||', left: a, right: b });
          const body = [
            assign(ident('#import_s'), { type: 'TemplateLiteral', quasis: [ { type: 'TemplateElement', value: { raw: '', cooked: '' }, tail: false }, { type: 'TemplateElement', value: { raw: '', cooked: '' }, tail: true } ], expressions: [ s ] }),
            { type: 'IfStatement', test: and(not(typeofIs(o, 'undefined')), not(or(typeofIs(o, 'function'), and(typeofIs(o, 'object'), { type: 'BinaryExpression', operator: '!==', left: o, right: literal(null) })))),
              consequent: throwNew('TypeError', 'import() options must be an object'), alternate: null },
            result.error ? throwNew(result.errorType ?? 'TypeError', result.error, result.code && { code: result.code }) : result.runtime ?? { type: 'ReturnStatement', argument: result.ns }
          ];
          return {
            type: 'CallExpression', optional: false,
            callee: { type: 'ArrowFunctionExpression', params: [ s, o ], async: true, generator: false, expression: false, body: { type: 'BlockStatement', body } },
            arguments: [ node.source, node.options ?? ident('undefined') ]
          };
        }

        case 'CallExpression': {
          vmSource(node);
          // eval of a lone identifier reads that binding, so it links like one (eval('require'))
          const code = node.callee.type === 'Identifier' && node.callee.name === 'eval' && !shadowed('eval') && node.arguments.length === 1 ? constString(node.arguments[0], {}) : null;
          if (code != null && /^\s*[A-Za-z_$][\w$]*\s*$/.test(code)) return walk(ident(code.trim()));
          // a created require (bundlers' __require) loading a builtin at runtime needs it linked
          const spec = node.callee.type === 'Identifier' && /require$/i.test(node.callee.name) && typeof node.arguments[0]?.value === 'string' ? node.arguments[0].value : null;
          if (spec && runtime && builtinKey(spec.replace(/^node:/, ''), mod.file, spec.startsWith('node:')) in runtime) dep(mod, { source: literal(spec) }, true, 'required');
          return requireTarget(node) ?? builtinModuleTarget(node) ?? walkKeys(node);
        }
        case 'NewExpression':
          vmSource(node);
          return walkKeys(node);

        case 'AssignmentExpression':
        case 'UpdateExpression': {
          const target = node.left ?? node.argument;
          if (target.type === 'Identifier' && imported[target.name] && !shadowed(target.name)) return throwExpr('Assignment to constant variable.', 'TypeError');
          // written, so not folded like a read of process.env.NODE_ENV
          target._target = true;
          return walkKeys(node);
        }

        case 'Property':
        case 'MethodDefinition':
        case 'PropertyDefinition':
          if (node.computed) node.key = walk(node.key);
          if (node.value) node.value = walk(node.value);
          if (node.shorthand && (node.value.name ?? node.value.left?.name) !== node.key.name) node.shorthand = false;
          return node;

        case 'LabeledStatement':
          node.body = walk(node.body);
          return node;
        case 'BreakStatement':
        case 'ContinueStatement':
        case 'PrivateIdentifier':
          return node;

        case 'IfStatement':
        case 'ConditionalExpression': {
          node.test = walk(node.test);
          const v = constValue(node.test);
          if (v === undefined) return walkKeys(node);
          const branch = v ? node.consequent : node.alternate;
          const kept = branch ? walk(branch) : { type: 'EmptyStatement' };
          // keep the dropped branch's vars declared
          const vars = varNames(v ? node.alternate : node.consequent, []);
          if (vars.length === 0) return kept;
          const decl = { type: 'VariableDeclaration', kind: 'var', declarations: vars.map(x => ({ type: 'VariableDeclarator', id: ident(x), init: null })) };
          return { type: 'BlockStatement', body: [ walk(decl), kept ] };
        }

        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
          if (node.id && node.type === 'FunctionDeclaration') node.id = walk(node.id);
          if (node.type !== 'ArrowFunctionExpression') thisDepth++;
          scoped(funcScopeNames(node).concat(node.type === 'FunctionExpression' && node.id ? [ node.id.name ] : []), () => walkKeys(node));
          if (node.type !== 'ArrowFunctionExpression') thisDepth--;
          return node;

        case 'ClassDeclaration':
        case 'ClassExpression':
          if (node.id && node.type === 'ClassDeclaration') node.id = walk(node.id);
          if (node.superClass) node.superClass = walk(node.superClass);
          thisDepth++;
          scoped(node.id ? [ node.id.name ] : [], () => { node.body = walk(node.body); });
          thisDepth--;
          return node;

        case 'BlockStatement':
        case 'StaticBlock':
          scoped(lexicalNames(node.body, []), () => walkKeys(node));
          return node;
        case 'SwitchStatement':
          node.discriminant = walk(node.discriminant);
          scoped(lexicalNames(node.cases.flatMap(x => x.consequent), []), () => { node.cases = node.cases.map(walk); });
          return node;
        case 'ForStatement':
        case 'ForInStatement':
        case 'ForOfStatement': {
          const head = node.init ?? node.left;
          scoped(head?.type === 'VariableDeclaration' && head.kind !== 'var' ? lexicalNames([ head ], []) : [], () => walkKeys(node));
          return node;
        }
        case 'CatchClause':
          scoped(patternNames(node.param, []), () => walkKeys(node));
          return node;

        case 'TSEnumDeclaration':
          node.id = walk(node.id);
          for (const m of node.members) if (m.initializer) m.initializer = walk(m.initializer);
          return node;

        default:
          if (node.type.startsWith('TS')) {
            if (TS_EXPR.has(node.type)) node.expression = walk(node.expression);
            return node;
          }
          return walkKeys(node);
      }
    };
    const classes = mod.body.filter(x => x.type === 'ClassDeclaration').map(x => [ x, x.id.name ]);
    const createRequire = new Set(mod.imports.filter(x => (x.spec === 'module' || x.spec === 'node:module') && x.name === 'createRequire').map(x => x.local));
    const dynamicRequire = mod.esm && mod.imports.some(x => x.spec === 'module' || x.spec === 'node:module') && requiresDynamically(mod.body, createdRequires(mod.body, createRequire, new Set()));
    for (let i = 0; i < mod.body.length; i++) mod.body[i] = walk(mod.body[i]);
    if (mod.requireUsed || mod.moduleUsed || mod.metaResolve) dep(mod, { source: literal('node:module') });
    if (mod.requireUsed || dynamicRequire) requireCandidates(mod);

    // classes used before their declaration become hoisted vars
    for (const [ decl, name ] of classes) {
      if (!(firstRef.get(name) < decl.start)) continue;
      mod.body[mod.body.indexOf(decl)] = varDecl('var', decl.id.name, { ...decl, type: 'ClassExpression' });
    }
  };

  // files a runtime require() may reach: literals naming files near the module or in dirs its literals name
  const literalsOf = mod => mod.literals ??= [ ...new Set(Array.from(mod.src.matchAll(/(['"`])([^'"`\n\\]{1,200})\1/g), m => m[2])) ];
  const plainPath = x => /^[\w@+-][\w@.+/-]*$/.test(x) && !x.split('/').some(s => s === '..' || s === '.');
  const badCandidates = new Set();
  // a directory's entries, read once, rule out most candidates without a stat each
  const dirEntries = new Map();
  const mayExist = p => {
    const dir = dirname(p), base = p.slice(p.lastIndexOf('/') + 1), stem = base.replace(/\.[cm]?js$/, '');
    if (!base) return true;
    let entries = dirEntries.get(dir);
    if (!entries) {
      try { entries = fs.readdirSync(dir); } catch { entries = []; }
      dirEntries.set(dir, entries);
    }
    return entries.some(e => e === base || e.startsWith(base + '.') || e.startsWith(stem + '.'));
  };
  const requireCandidates = mod => {
    // the module and what it depends on, in its package when it is a dependency
    const inPackage = mod.file.includes('/node_modules/') ? nearestPackage(dirname(mod.file)) : null, scope = [ mod ];
    for (const m of scope) for (const d of [ ...m.deps, ...(m.cjsDeps ?? []) ]) {
      if (d.file.startsWith(RUNTIME_ROOT) || scope.includes(d)) continue;
      if (inPackage ? nearestPackage(dirname(d.file)) === inPackage : !d.file.includes('/node_modules/')) scope.push(d);
    }
    const dirs = new Set(scope.flatMap(m => [ dirname(m.file), dirname(dirname(m.file)) ]));
    const names = scope.flatMap(literalsOf).filter(plainPath);
    for (const dir of dirs) {
      if (dirs.size > 256) break;
      for (const x of names) if (mayExist(joinPath(dir, x)) && isDir(joinPath(dir, x))) dirs.add(joinPath(dir, x));
    }

    for (const x of literalsOf(mod)) {
      // '/x' is absolute, or joined onto a directory (path.join(dir, '/x'))
      const paths = x[0] === '.' ? [ joinPath(dirname(mod.file), x) ] : [];
      if (x[0] === '/') paths.push(x);
      // a template like `./commands/${name}.js` may name any matching file in its directory
      const hole = x.indexOf('${');
      if (x[0] === '.' && hole !== -1 && x.lastIndexOf('/', hole) !== -1) {
        const dir = joinPath(dirname(mod.file), x.slice(0, x.lastIndexOf('/', hole) + 1)), suffix = x.slice(x.lastIndexOf('}') + 1);
        if (isDir(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(suffix) && /\.[cm]?[jt]s$/.test(f)) paths.push(joinPath(dir, f));
      }
      // a builtin's name means the builtin
      const name = x.replace(/^\//, '');
      if (plainPath(name) && !(runtime && (RUNTIME_ROOT + '/node/' + name + '.js') in runtime)) for (const dir of dirs) paths.push(joinPath(dir, name));
      for (const p of paths) {
        const file = mayExist(p) && resolveFile(p);
        if (!file || file.endsWith('.json') || modules.has(file) || badCandidates.has(file)) continue;
        // candidates that do not load are left out, with what they pulled in
        const before = new Set(modules.keys());
        let failed;
        try {
          failed = dep(mod, { source: literal(file) }, true, 'required').error;
        } catch {
          failed = true;
        }
        if (failed) {
          badCandidates.add(file);
          for (const k of modules.keys()) if (!before.has(k)) modules.delete(k);
        }
      }
    }
  };

  const entryMod = load(entryFile, entrySource, null, true);

  // --include=dir,...: files only a computed require reaches (eg build output), plain scripts also as vm sources
  for (const dir of Prefs.include ? String(Prefs.include).split(',') : []) {
    const root = joinPath(process.cwd(), dir);
    for (const f of fs.readdirSync(root, { recursive: true })) {
      if (!/\.[cm]?js$/.test(f)) continue;
      const file = joinPath(root, f);
      dep(entryMod, { source: literal(file) }, true, 'required');
      const code = fs.readFileSync(file, 'utf8');
      if (!/\b(?:require|module|exports)\b/.test(code) && !vmSources.has(code)) vmSources.set(code, vmWrapper(code, null, vmSources.size + 1));
    }
  }

  // evaluation order: dependencies first
  const order = [];
  const visitPost = mod => {
    if (mod.ordered) return;
    mod.ordered = true;
    for (const d of mod.deps) if (cycles.has(d)) visitDeps(d); else visitPost(d);
    for (const d of mod.cjsDeps ?? []) if (!mod.deps.includes(d)) visitDeps(d);
    order.push(mod);
  };
  // modules required in place stay lazy, but their builtins are ordered before anything that may run them
  const visitDeps = mod => {
    if (mod.depsVisited) return;
    mod.depsVisited = true;
    for (const d of [ ...mod.deps, ...(mod.cjsDeps ?? []) ]) if (d.file.startsWith(RUNTIME_ROOT)) visitPost(d); else visitDeps(d);
  };

  // cjs require() targets are discovered while renaming, so rename in load order first
  const renamePending = () => {
    for (;;) {
      const pending = [ ...modules.values() ].filter(m => !m.renamed);
      if (pending.length === 0) break;
      for (const mod of pending) {
        mod.renamed = true;
        const map = new Map();
        // a script entry's top-level names are globals, so they keep their names
        if (!(mod.entry && opts.script)) for (const name of lexicalNames(mod.body, varNames(mod.body, []))) {
          map.set(name, globalName(mod, name));
        }
        if (!mod.esm) {
          map.set('__filename', literal(mod.file));
          map.set('__dirname', literal(dirname(mod.file)));
        }
        const snapshots = [];
        const imported = Object.create(null);
        for (const imp of mod.imports) {
          imported[imp.local] = true;
          const r = imp.name === '*' ? { ns: imp.dep } : resolveExport(imp.dep, imp.name);
          // node builtins also export each property of their module.exports
          if (!r && imp.dep.file.startsWith(RUNTIME_ROOT) && imp.dep.exports.has('default')) {
            const name = globalName(mod, imp.local);
            map.set(imp.local, name);
            snapshots.push(varDecl('const', name, member(exportExpr(resolveExport(imp.dep, 'default')), imp.name)));
            continue;
          }
          if (!r && imp.dep.file === EMPTY_MODULE) { map.set(imp.local, 'undefined'); continue; }
          if (!r || r.ambiguous) {
            // only fatal if the module is evaluated eagerly, see below
            mod.linkError ??= imp.dep.esm ? `The requested module '${imp.spec}' does not provide an export named '${imp.name}'` :
              `Named export '${imp.name}' not found. The requested module '${imp.spec}' is a CommonJS module, which may not support all module.exports as named exports.\nCommonJS modules can always be imported via the default export, for example using:\n\nimport pkg from '${imp.spec}';\nconst { ${imp.name} } = pkg;\n`;
            continue;
          }
          if (r.global) { map.set(imp.local, r.global); continue; }
          if (imp.deferred && imp.name === '*') { map.set(imp.local, dnsName(imp.dep)); continue; }
          if (r.ns) { map.set(imp.local, r.ns.esm ? { ns: r.ns } : nsName(r.ns)); continue; }
          // cjs exports are read once after the module ran
          const name = globalName(mod, imp.local);
          map.set(imp.local, name);
          snapshots.push(varDecl('const', name, exportExpr(r)));
        }
        rename(mod, map, imported);
        mod.body.unshift(...snapshots);
      }
    }
  };
  renamePending();

  // free node globals (process, Buffer, ...) in user code get a prelude installing them first
  const globals = Prefs.exposeGc ? { ...opts.runtimeGlobals, gc: [ 'internal/host', 'gc' ] } : opts.runtimeGlobals;
  if (runtime && globals) {
    const names = new Set(Object.keys(globals)), used = new Set();
    for (const mod of modules.values()) if (!mod.file.startsWith(RUNTIME_ROOT)) usedNames(mod.body, names, used);
    usedNames([ ...vmSources.values() ], names, used);
    if (used.size > 0) {
      let src = '';
      // dotted names (process.send) assign into globals, which are defined first
      for (const name of [ ...used ].sort((a, b) => a.includes('.') - b.includes('.'))) {
        const [ spec, exported, enumerable = false ] = globals[name];
        const local = '$' + name.replace('.', '$');
        // the globalThis.x assignment also binds free references, over engine builtins of the same name (atob, performance)
        src += `import { ${exported} as ${local} } from 'node:${spec}';\n` + (name.includes('.') ? `${name} = ${local};\n` :
          `Object.defineProperty(globalThis, '${name}', { value: ${local}, writable: true, enumerable: ${enumerable}, configurable: true });\nglobalThis.${name} = ${local};\n`);
      }
      entryMod.deps.unshift(load(RUNTIME_ROOT + '/node/internal/globals.js', src));
      renamePending();
    }
  }


  // `export default { fetch }` entries serve it once they ran
  if (runtime && entryMod.esm && entryMod.exports.has('default') && entrySource.includes('fetch')) {
    const serveMod = load(RUNTIME_ROOT + '/node/internal/serve.js');
    entryMod.deps.push(serveMod);
    renamePending();
    entryMod.body.push({ type: 'ExpressionStatement', expression: {
      type: 'CallExpression', optional: false, callee: exportExpr(resolveExport(serveMod, 'serveDefault')), arguments: [ exportExpr(resolveExport(entryMod, 'default')) ]
    } });
  }

  // node's module system: cjs modules get Module objects and runtime require() finds compiled modules in #bundle
  const moduleMod = modules.get(RUNTIME_ROOT + '/node/module.js');
  if (moduleMod) {
    entryMod.deps.unshift(moduleMod);
    const moduleExport = name => resolveExport(moduleMod, name).global;
    const parents = new Map();
    for (const mod of modules.values()) for (const d of [ ...mod.deps, ...(mod.cjsDeps ?? []) ]) if (!parents.has(d)) parents.set(d, mod);
    for (const mod of modules.values()) {
      if (mod.esm) continue;
      const self = () => ident(globalName(mod, 'module'));
      if (!mod.file.startsWith(RUNTIME_ROOT)) {
        const parent = parents.get(mod);
        mod.moduleDecl.declarations[0].init = call(moduleExport('enterModule'), [ literal(mod.file), literal(parent && !parent.esm && !parent.file.startsWith(RUNTIME_ROOT) ? parent.file : null) ]);
        mod.body.push(assign(member(self(), 'loaded'), literal(true)));
      }
      if (mod.requireUsed) mod.body.splice(mod.body.indexOf(mod.moduleDecl) + 1, 0, varDecl('const', globalName(mod, 'require'), call(moduleExport('makeRequire'), [ self() ])));
    }
    if (!entryMod.esm) moduleMod.body.push({ type: 'ExpressionStatement', expression: call(moduleExport('setMainModule'), [ literal(entryFile) ]) });
  }

  // timers and process exit events run once the entry finishes
  if (modules.has(RUNTIME_ROOT + '/node/internal/loop.js')) entryMod.body.push({
    type: 'ExpressionStatement',
    expression: { type: 'ChainExpression', expression: { type: 'CallExpression', optional: true, arguments: [], callee: member(ident('globalThis'), '__porffor_node_loop') } }
  });

  // indirect exports must resolve too
  for (const mod of modules.values()) {
    if (!mod.esm) continue;
    for (const [ name, x ] of mod.exports) {
      if (x.from == null) continue;
      const r = resolveExport(mod, name);
      if (!r || r.ambiguous) mod.linkError ??= `The requested module '${x.from.rel}' does not provide an export named '${x.name}'`;
    }
  }

  // modules in require cycles run in place like node, seeing the partial exports of those still running
  const cycles = new Set(), index = new Map(), low = new Map(), stack = [];
  const strongConnect = mod => {
    index.set(mod, index.size);
    low.set(mod, index.get(mod));
    stack.push(mod);
    for (const d of mod.cjsDeps ?? []) {
      if (!index.has(d)) {
        strongConnect(d);
        low.set(mod, Math.min(low.get(mod), low.get(d)));
      } else if (stack.includes(d)) low.set(mod, Math.min(low.get(mod), index.get(d)));
    }
    if (low.get(mod) !== index.get(mod)) return;
    const component = stack.splice(stack.indexOf(mod));
    if (component.length > 1 || mod.cjsDeps?.has(mod)) for (const x of component) cycles.add(x);
  };
  for (const mod of modules.values()) if (!index.has(mod)) strongConnect(mod);
  // with node's module system any cjs module is requirable at runtime (#bundle), so it runs where first required
  const inPlace = d => cycles.has(d) || (moduleMod && !d.esm && !d.file.startsWith(RUNTIME_ROOT));
  for (const mod of modules.values()) if (mod.cjsDeps) mod.deps = mod.deps.filter(d => mod.importedDeps?.has(d) || !(inPlace(d) && mod.cjsDeps.has(d)));
  for (const mod of modules.values()) if (mod.cjsDeps) for (const d of mod.cjsDeps) if (inPlace(d)) d.required = true;

  visitPost(entryMod);
  for (const mod of order) if (mod.linkError) throw new SyntaxError(mod.linkError);
  const eagerCount = order.length;
  for (const mod of modules.values()) if (mod.dynamic || mod.deferred || mod.required) visitPost(mod);
  for (let i = eagerCount; i < order.length; i++) order[i].lazy = true;
  for (const [ site, d ] of requireSites) if (!d.lazy) site.expressions.shift();

  // top-level await anywhere in a lazy module's graph makes its evaluation async
  const lazyAsync = (mod, seen = new Set()) => {
    if (mod.async != null) return mod.async;
    if (seen.has(mod)) return false;
    seen.add(mod);
    return mod.async = hasTopLevelAwait(mod.body) || mod.deps.some(d => d.lazy && lazyAsync(d, seen));
  };

  // runtime require() of compiled modules by filename and of linked builtins by node: id
  let bundleFn = null;
  if (moduleMod) {
    const cases = [];
    for (const mod of order) {
      const builtin = mod.file.startsWith(RUNTIME_ROOT) && mod.file.slice(RUNTIME_ROOT.length + 6, -3);
      if (mod.json || (builtin && builtinKey(builtin, '', true) == null)) continue;
      const stmts = mod.lazy ? [ { type: 'ExpressionStatement', expression: call(`#eval#m${mod.id}`) } ] : [];
      let value;
      if (!mod.esm) value = exportsOf(mod);
        else if (builtin && mod.exports.has('default')) value = exportExpr(resolveExport(mod, 'default'));
        else if (mod.lazy && lazyAsync(mod)) { stmts.length = 0; value = literal(null); }
        else {
          const r = resolveExport(mod, 'module.exports');
          value = r && !r.ambiguous ? exportExpr(r) : ident(nsName(mod));
        }
      cases.push({ type: 'SwitchCase', test: literal(builtin ? 'node:' + builtin : mod.file), consequent: [ ...stmts, { type: 'ReturnStatement', argument: value } ] });
    }
    // its body is generated last, once every module it evaluates is declared
    bundleFn = { type: 'FunctionDeclaration', id: ident('#bundle'), params: [ ident('#key') ], async: false, generator: false, expression: false, _lateBody: true,
      body: { type: 'BlockStatement', body: [ { type: 'SwitchStatement', discriminant: ident('#key'), cases } ] } };
  }


  let importAnyFn = null;
  if (runtimeImportSites.length > 0) {
    for (const mod of order) {
      mod.dynamic = true;
      nsName(mod);
    }
    // with node's module system linked, specifiers resolve like node's import()
    if (moduleMod) for (const [ site, from ] of runtimeImportSites) site.arguments[0] = call(resolveExport(moduleMod, 'importResolve').global, [ literal(from), ident('#import_s') ]);
    const cases = [];
    for (const mod of order) {
      const builtin = mod.file.startsWith(RUNTIME_ROOT) && mod.file.slice(RUNTIME_ROOT.length + 6, -3);
      if (builtin && builtinKey(builtin, '', true) == null) continue;
      if (builtin) cases.push({ type: 'SwitchCase', test: literal(builtin), consequent: [] });
      cases.push({ type: 'SwitchCase', test: literal(builtin ? 'node:' + builtin : mod.file), consequent: [ { type: 'ReturnStatement', argument: call(`#import#m${mod.id}`) } ] });
    }
    importAnyFn = { type: 'FunctionDeclaration', id: ident('#import_any'), params: [ ident('#key') ], async: false, generator: false, expression: false, body: { type: 'BlockStatement', body: [
      { type: 'SwitchStatement', discriminant: ident('#key'), cases }, throwNew('TypeError', 'porffor: import() target is not part of the bundle')
    ] } };
  }
  for (let more = true; more;) {
    more = false;
    for (const mod of order) {
      if (!mod.nsUsed || mod.nsExpr) continue;
      mod.nsExpr = namespaceExpr(mod);
      more = true;
    }
  }
  // imported lazy modules evaluate before the importer's body, required ones in place
  const lazyDeps = mod => mod.deps.filter(d => d.lazy && (!mod.cjsDeps?.has(d) || mod.importedDeps?.has(d))).map(d => ({ type: 'ExpressionStatement', expression: lazyAsync(d) ? { type: 'AwaitExpression', argument: call(`#eval#m${d.id}`) } : call(`#eval#m${d.id}`) }));
  const lazyBody = mod => {
    const names = [], hoisted = [], stmts = [];
    for (const x of mod.body) {
      if (x.type === 'FunctionDeclaration') { hoisted.push(x); continue; }
      if (x.type === 'ClassDeclaration') {
        names.push(x.id.name);
        stmts.push(assign(ident(x.id.name), { ...x, type: 'ClassExpression' }));
        continue;
      }
      if (x.type === 'VariableDeclaration') {
        for (const d of x.declarations) {
          patternNames(d.id, names);
          if (d.init) stmts.push(assign(d.id, d.init));
            else if (x.kind !== 'var') stmts.push(assign(d.id, ident('undefined')));
        }
        continue;
      }
      stmts.push(x);
    }

    // state: 0 not evaluated, 1 evaluating, 2 threw, 3 evaluated
    const state = ident(`#state#m${mod.id}`), error = ident(`#error#m${mod.id}`);
    const bin = (operator, left, right) => ({ type: 'BinaryExpression', operator, left, right });
    const isAsync = lazyAsync(mod);
    const evalDeps = lazyDeps(mod);
    const run = mod.linkError ? [ throwNew('SyntaxError', mod.linkError) ] : [ ...evalDeps, ...stmts, assign(state, literal(3)) ];
    const evalFn = { type: 'FunctionDeclaration', id: ident(`#eval#m${mod.id}`), params: [], async: isAsync, generator: false, expression: false, body: { type: 'BlockStatement', body: [
      { type: 'IfStatement', test: bin('===', state, literal(2)), consequent: { type: 'ThrowStatement', argument: error }, alternate: null },
      { type: 'IfStatement', test: bin('!==', state, literal(0)), consequent: { type: 'ReturnStatement', argument: null }, alternate: null },
      assign(state, literal(1)),
      { type: 'TryStatement', block: { type: 'BlockStatement', body: run }, handler: { type: 'CatchClause', param: ident('#e'), body: { type: 'BlockStatement', body: [
        assign(state, literal(2)), assign(error, ident('#e')), { type: 'ThrowStatement', argument: ident('#e') }
      ] } }, finalizer: null }
    ] } };

    // a deferred namespace evaluates synchronously, never re-entrantly
    const deferFn = mod.dnsUsed && { type: 'FunctionDeclaration', id: ident(`#defer#m${mod.id}`), params: [], async: false, generator: false, expression: false, body: { type: 'BlockStatement', body: [
      { type: 'IfStatement', test: bin('===', state, literal(1)), consequent: throwNew('TypeError', 'Deferred module is being evaluated'), alternate: null },
      { type: 'ExpressionStatement', expression: call(`#eval#m${mod.id}`) }
    ] } };

    return [
      { type: 'VariableDeclaration', kind: 'var', declarations: [ ...names, error.name ].map(x => ({ type: 'VariableDeclarator', id: ident(x), init: null })) },
      varDecl('var', state.name, literal(0)),
      ...hoisted, evalFn, ...(deferFn ? [ deferFn ] : [])
    ];
  };

  const body = [];
  // host scripts define globals, so they stay unrenamed and run first
  for (let i = 0; i < (opts.scripts ?? []).length; i++) {
    for (const x of parse(opts.scripts[i], { module: false }).body) { x._unit = 'script' + i; body.push(x); }
  }
  if (bundleFn) body.push(bundleFn);
  if (importAnyFn) body.push(importAnyFn);
  if (modules.has(RUNTIME_ROOT + '/node/vm.js')) body.push({ type: 'FunctionDeclaration', id: ident('#vmcode'), params: [ ident('#key') ], async: false, generator: false, expression: false,
    body: { type: 'BlockStatement', body: [ { type: 'SwitchStatement', discriminant: ident('#key'), cases: Array.from(vmSources, ([ key, fn ]) => ({ type: 'SwitchCase', test: literal(key), consequent: [ { type: 'ReturnStatement', argument: fn } ] })) } ] } });
  // namespaces declared up front for cycles, filled after the module's last class
  for (const mod of order) {
    if (mod.nsExpr) body.push(varDecl('let', nsName(mod), null));
    if (mod.dnsUsed) body.push(varDecl('let', dnsName(mod), null));
  }
  // file scope C and its links go first in dependency order, lazy modules' C can need eager ones'
  const native = (x, name) => x.type === 'ExpressionStatement' && x.expression.type === 'TaggedTemplateExpression' &&
    x.expression.tag.type === 'MemberExpression' && x.expression.tag.object.name === 'Porffor' && x.expression.tag.property.name === name;
  const isFileC = x => native(x, 'c') || native(x, 'link');
  for (const mod of order) {
    for (const x of mod.body) if (isFileC(x)) {
      x._nativeUnit = mod.id;
      body.push(x);
    }
    mod.body = mod.body.filter(x => !isFileC(x));
  }
  const functionsAt = body.length, functions = [];
  // lazy modules only declare things so go first
  for (const mod of [ ...order.slice(eagerCount), ...order.slice(0, eagerCount) ]) {
    if (mod.nsExpr) {
      const at = mod.body.findLastIndex(x => x.type === 'ClassDeclaration') + 1;
      mod.body.splice(at, 0, assign(ident(nsName(mod)), mod.nsExpr));
    }
    // data: modules have no file
    const data = mod.file.startsWith('data:');
    const url = data ? mod.file : 'file://' + encodeURI(mod.file).replace(/[?#]/g, encodeURIComponent);
    if (mod.metaUsed) mod.body.unshift(varDecl('var', `#meta#m${mod.id}`, { type: 'ObjectExpression', properties: [
      property(ident('__proto__'), literal(null)),
      ...(data ? [] : [ property(ident('dirname'), literal(dirname(mod.file))), property(ident('filename'), literal(mod.file)) ]),
      property(ident('main'), literal(mod.entry)),
      ...(mod.metaResolve ? [ property(ident('resolve'), call(resolveExport(moduleMod, 'metaResolve').global, [ literal(url) ])) ] : []),
      property(ident('url'), literal(url))
    ] }));
    const out = mod.lazy ? lazyBody(mod) : [ ...lazyDeps(mod), ...mod.body ];
    if (mod.dynamic) {
      const ns = ident(nsName(mod));
      const evalStmts = mod.lazy ? [ { type: 'ExpressionStatement', expression: { type: 'AwaitExpression', argument: call(`#eval#m${mod.id}`) } } ] : [];
      out.unshift({ type: 'FunctionDeclaration', id: ident(`#import#m${mod.id}`), params: [], async: true, generator: false, expression: false,
        body: { type: 'BlockStatement', body: [ ...evalStmts, { type: 'ReturnStatement', argument: ns } ] } });
    }
    if (mod.dnsUsed) out.push(assign(ident(dnsName(mod)), namespaceExpr(mod, mod.lazy ? ident(`#defer#m${mod.id}`) : { type: 'ArrowFunctionExpression', params: [], async: false, generator: false, expression: true, body: ident('undefined') })));
    // a script entry stays global code
    for (const x of out) {
      if (mod.entry && opts.script) body.push(x);
        else if (x.type === 'FunctionDeclaration') {
          x._hoistedUnit = mod.id;
          functions.push(x);
        } else {
          x._unit = mod.id;
          body.push(x);
        }
    }
  }
  // all functions are declared before any module runs, so cycles and lazy modules can call later ones
  body.splice(functionsAt, 0, ...functions);

  // tree shaking: renamed names are unique program-wide, so one ref count covers all modules
  const srcs = Object.create(null);
  for (const mod of order) srcs[mod.id] = mod.src;

  // cjs export shaking: drop unread top-level exports.x writes
  const cjsIds = new Set(order.filter(mod => !mod.esm).map(mod => mod.id));
  const moduleOf = name => name.startsWith('module#m') && cjsIds.has(name.slice(8)) ? name.slice(8) : null;
  const baseRef = node => node._required ? baseRef(node.expressions.at(-1)) : node.type === 'MemberExpression' && !node.computed && node.property.name === 'exports' && node.object.type === 'Identifier' ? moduleOf(node.object.name) : null;
  const shakeExports = () => {
    const alias = Object.create(null), forward = Object.create(null), rebound = [];
    const collect = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const x of node) collect(x); return; }
      const assign = node.type === 'AssignmentExpression' && node.operator === '=';
      const name = node.type === 'VariableDeclarator' ? node.id.name : assign ? node.left.name : null;
      const value = node.type === 'VariableDeclarator' ? node.init : assign ? node.right : null;
      const x = value && name?.includes('#m') && baseRef(value);
      if (assign && name?.includes('#m') && (!x || alias[name] != null)) rebound.push(name);
      if (x) alias[name] = alias[name] == null || alias[name] === x ? x : false;

      const from = assign && baseRef(node.left);
      const to = from && baseRef(node.right);
      if (to) forward[from] = forward[from] == null || forward[from] === to ? to : false;
      for (const key in node) if (key !== 'start' && key !== 'end') collect(node[key]);
    };
    collect(body);
    const follow = x => forward[x] ? follow(forward[x]) : x;
    const rawRef = node => node.type === 'Identifier' ? alias[node.name] || null : baseRef(node);
    const refOf = node => {
      const x = rawRef(node);
      // exports keeps the object module.exports had before being replaced
      return node.name === `exports#m${x}` ? x : follow(x);
    };

    const used = Object.create(null), escaped = Object.create(null);
    for (const name of rebound) if (alias[name]) escaped[alias[name]] = escaped[follow(alias[name])] = true;
    const visit = (node, parent) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const x of node) visit(x, parent); return; }
      const x = refOf(node);
      if (x) {
        if (parent.type === 'MemberExpression' && parent.object === node && !parent.computed) {
          (used[x] ??= new Set()).add(parent.property.name);
          return;
        }
        const aliased = parent.type === 'VariableDeclarator'
          ? alias[parent.id.name] === rawRef(node)
          : parent.type === 'AssignmentExpression' && parent.operator === '=' && alias[parent.left.name] === rawRef(node);
        if (!aliased) escaped[x] = true;
        return;
      }
      if (node.type === 'Identifier') {
        if (moduleOf(node.name) && parent.id !== node) escaped[moduleOf(node.name)] = true;
        return;
      }
      // method calls expose exports as this
      const callee = node.type === 'CallExpression' ? node.callee : node.tag;
      if (callee?.type === 'MemberExpression' && refOf(callee.object)) escaped[refOf(callee.object)] = true;
      if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left.type === 'MemberExpression' && !node.left.computed && refOf(node.left.object)) return visit(node.right, node);
      if (node.type === 'AssignmentExpression' && node.operator === '=' && forward[baseRef(node.left)] && parent.type === 'ExpressionStatement') return;
      for (const key in node) if (key !== 'start' && key !== 'end') visit(node[key], node);
    };
    visit(body, null);

    let dropped = false;
    for (let i = body.length - 1; i >= 0; i--) {
      const e = body[i].expression;
      if (body[i].type !== 'ExpressionStatement' || e.type !== 'AssignmentExpression' || e.operator !== '=' || e.left.type !== 'MemberExpression' || e.left.computed) continue;
      const x = refOf(e.left.object);
      if (!x || escaped[x] || used[x]?.has(e.left.property.name)) continue;
      const readsExport = e.right.type === 'MemberExpression' && !e.right.computed && refOf(e.right.object) && !escaped[refOf(e.right.object)];
      if (!readsExport && !pure(e.right, srcs[body[i]._unit] ?? '')) continue;
      body.splice(i, 1);
      dropped = true;
    }
    return dropped;
  };

  const runtimeUnits = new Set(order.filter(mod => mod.file.startsWith(RUNTIME_ROOT)).map(mod => mod.id));
  const GLOBAL_OBJECTS = new Set([ 'globalThis', 'self', 'global', 'window' ]);
  const globalsUnit = order.find(mod => mod.file === RUNTIME_ROOT + '/node/internal/globals.js')?.id;
  for (let dropped = true; dropped;) {
    dropped = shakeExports();
    const refs = Object.create(null);
    countRefs(body, refs);
    for (let i = body.length - 1; i >= 0; i--) {
      const x = body[i], name = declName(x, srcs[x._unit] ?? '');
      const self = x.declarations?.[0].init?.id?.name === name ? 2 : 1;
      if (!name?.includes('#m') || refs[name] > self) continue;
      body.splice(i, 1);
      dropped = true;
    }
  }

  // runtime code kept by reachability: decls wait for a reference, modules for a read of their names, members for their key
  const droppable = new Set(order.filter(mod => runtimeUnits.has(mod.id) && mod.exports.size > 0 && !mod.lazy && !mod.dynamic).map(mod => mod.id));
  const sideDeps = new Map(order.map(mod => [ mod.id, (mod.sideDeps ?? []).map(d => d.id) ]));
  const unitOf = x => x._unit ?? x._hoistedUnit;
  const liveNames = new Set(IMPLICIT_NAMES), liveIds = new Set(), liveUnits = new Set();
  const waitingNames = new Map(), waitingIds = new Map(), waitingUnits = new Map();
  const queue = [];
  const wait = (map, key, item) => {
    item.node._dead = true;
    if (map.has(key)) map.get(key).push(item);
      else map.set(key, [ item ]);
  };
  const wake = (map, key) => {
    if (!map.has(key)) return;
    queue.push(...map.get(key));
    map.delete(key);
  };
  // a runtime class is only constructed once it is used as a value, not just for C.x or instanceof C
  const liveCtors = new Set(), waitingCtors = new Map();
  const liveCtor = n => { if (!liveCtors.has(n)) { liveCtors.add(n); wake(waitingCtors, n); liveInst(n); } };
  // and only has instances once constructed or its prototype is read, reading .constructor constructs those
  let ctorRead = false;
  const liveInsts = new Set(), waitingInsts = new Map();
  const liveInst = n => {
    if (liveInsts.has(n)) return;
    liveInsts.add(n);
    wake(waitingInsts, n);
    if (ctorRead) liveCtor(n);
  };
  // runtime classes, and those a static call could construct through this (eg inherited Promise.resolve)
  const classIds = new Set(), derivedIds = new Set();
  for (const x of body) if (x.type === 'ClassDeclaration' && x.id.name.includes('#m') && runtimeUnits.has(unitOf(x))) {
    classIds.add(x.id.name);
    if (x.superClass) derivedIds.add(x.id.name);
  }
  const guard = x => x.type === 'BinaryExpression' && x.operator === 'instanceof' && x.right.type === 'Identifier' && classIds.has(x.right.name) && !liveInsts.has(x.right.name) ? x :
    x.type === 'LogicalExpression' && x.operator === '&&' ? guard(x.left) : null;
  const liveName = n => {
    if (n === 'constructor' && !ctorRead) {
      ctorRead = true;
      for (const id of [ ...liveInsts ]) liveCtor(id);
    }
    if (liveNames.has(n)) return;
    liveNames.add(n);
    wake(waitingNames, n);
  };
  // free names and members of the global object, for the node globals prelude
  const liveGlobals = new Set(), waitingGlobals = new Map();
  const liveGlobal = n => { if (!liveGlobals.has(n)) { liveGlobals.add(n); wake(waitingGlobals, n); } };
  const liveId = n => { if (!liveIds.has(n)) { liveIds.add(n); wake(waitingIds, n); } };
  const liveUnit = u => {
    if (liveUnits.has(u)) return;
    liveUnits.add(u);
    wake(waitingUnits, u);
    for (const d of sideDeps.get(u) ?? []) liveUnit(d);
  };

  const shakeable = x => x.key && !x.computed && (x.type === 'MethodDefinition' ? x.kind !== 'constructor' :
    x.type === 'Property' && (isFunc(x.value) || x.value.type === 'Identifier' || (x.value.type === 'ObjectExpression' && pure(x.value, ''))));
  // C.prototype: defining members on it makes no instances of C, reading them or passing it on may
  const protoOf = x => x?.type === 'MemberExpression' && !x.computed && x.property.name === 'prototype' && x.object.type === 'Identifier' ? x : null;
  const setup = x => x.callee.type === 'MemberExpression' && x.callee.object.name === 'Object' && [ 'defineProperty', 'defineProperties', 'assign' ].includes(x.callee.property.name);
  // x.constructor, which only constructs once it escapes: not for its name, typeof, comparisons, instanceof or a && test
  const ctorOf = x => x?.type === 'MemberExpression' && !x.computed && x.property.name === 'constructor' ? x : null;
  // a use of a binding that can't construct it
  const classUse = (id, unit) => {
    if (id._local) return;
    const name = id.name, at = name.lastIndexOf('#m');
    if (at === -1) return liveGlobal(name);
    liveId(name);
    if (name.slice(at + 2) !== unit) liveUnit(name.slice(at + 2));
  };
  const shakeMember = (x, unit) => {
    const key = shakeable(x) && (x.key.name ?? x.key.value);
    if (key && !liveNames.has(key)) wait(waitingNames, key, { node: x, unit });
      else scan(x, unit);
  };
  const scan = (node, unit) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) scan(x, unit); return; }
    switch (node.type) {
      case 'Identifier':
        classUse(node, unit);
        if (node.name.includes('#m')) liveCtor(node.name);
        return;
      case 'Literal':
        if (typeof node.value === 'string') liveName(node.value);
        return;
      // a member's name is no reference to a binding or global of that name
      case 'MemberExpression':
        if (!node.computed) liveName(node.property.name);
          else scan(node.property, unit);
        if (!node.computed && GLOBAL_OBJECTS.has(node.object.name)) liveGlobal(node.property.name);
        if (!node.computed && node.object.type === 'Identifier') {
          classUse(node.object, unit);
          if (node.property.name === 'prototype') liveInst(node.object.name);
            else if (derivedIds.has(node.object.name)) liveCtor(node.object.name);
          return;
        }
        if (!node.computed && node.property.name === 'name' && ctorOf(node.object)) return scan(node.object.object, unit);
        if (protoOf(node.object)) {
          liveName('prototype');
          classUse(node.object.object, unit);
          liveInst(node.object.object.name);
          return;
        }
        return scan(node.object, unit);
      case 'Property': case 'MethodDefinition': case 'PropertyDefinition':
        if (node.computed) scan(node.key, unit);
        return scan(node.value, unit);
      case 'CallExpression':
        if (!setup(node) || !protoOf(node.arguments[0])) break;
        liveName('prototype');
        classUse(node.arguments[0].object, unit);
        scan(node.callee, unit);
        return scan(node.arguments.slice(1), unit);
      case 'BinaryExpression':
        if ([ '===', '!==', '==', '!=', 'in' ].includes(node.operator) || (node.operator === 'instanceof' && ctorOf(node.right))) {
          for (const x of [ node.left, node.right ]) scan(ctorOf(x)?.object ?? x, unit);
          return;
        }
        if (node.operator !== 'instanceof' || node.right.type !== 'Identifier') break;
        scan(node.left, unit);
        if (guard(node)) return wait(waitingInsts, node.right.name, { node, unit, cls: node.right });
        return classUse(node.right, unit);
      case 'UnaryExpression':
        if (node.operator !== 'typeof' || !ctorOf(node.argument)) break;
        return scan(node.argument.object, unit);
      case 'AssignmentExpression':
        if (protoOf(node.left.object)) {
          liveName('prototype');
          classUse(node.left.object.object, unit);
          if (node.left.computed) scan(node.left.property, unit);
          return scan(node.right, unit);
        }
        if (!ctorOf(node.left)) break;
        scan(node.left.object, unit);
        return scan(node.right, unit);
      case 'LogicalExpression':
        if (node.operator !== '&&' || !ctorOf(node.left)) break;
        scan(node.left.object, unit);
        return scan(node.right, unit);
      case 'IfStatement': {
        const test = guard(node.test);
        if (!test) break;
        scan(node.test, unit);
        wait(waitingInsts, test.right.name, { node: node.consequent, unit });
        return scan(node.alternate, unit);
      }
      case 'ClassDeclaration':
        if (!node.id.name.includes('#m')) break;
        node.body._cls = node.id.name;
        scan(node.superClass, unit);
        return scan(node.body, unit);
      case 'ObjectPattern':
        for (const x of node.properties) if (x.key && !x.computed) { liveName(x.key.name ?? x.key.value); liveGlobal(x.key.name ?? x.key.value); }
        break;
      case 'ObjectExpression': case 'ClassBody':
        if (!runtimeUnits.has(unit)) break;
        for (const x of node.type === 'ObjectExpression' ? node.properties : node.body) {
          if (node._cls && !liveCtors.has(node._cls) && (x.kind === 'constructor' || (x.type === 'PropertyDefinition' && !x.static && x.key.type !== 'PrivateIdentifier'))) wait(waitingCtors, node._cls, { node: x, unit });
            else if (node._cls && !liveInsts.has(node._cls) && x.type === 'MethodDefinition' && !x.static) wait(waitingInsts, node._cls, { node: x, unit, member: true });
            else shakeMember(x, unit);
        }
        return;
    }
    for (const key in node) if (key !== 'start' && key !== 'end') scan(node[key], unit);
  };
  const stmt = x => {
    const unit = unitOf(x), src = srcs[unit] ?? '';
    const decl = declName(x, src);
    if (decl?.includes('#m') && !liveIds.has(decl)) return wait(waitingIds, decl, { node: x, unit, stmt: true });

    // runtime setup of a member (X.y = f) waits for y to be read, of a binding (Object.defineProperty(X, ...)) for X
    const e = runtimeUnits.has(unit) && x.type === 'ExpressionStatement' ? x.expression : null;
    // the node globals prelude installs each x (defineProperty(globalThis, 'x', ...), globalThis.x = ...) once x is read
    const installed = unit === globalsUnit && e ? (e.type === 'CallExpression' ? e.arguments[1]?.value : e.left?.object?.name === 'globalThis' ? e.left.property.name : null) : null;
    if (installed && !liveGlobals.has(installed)) return wait(waitingGlobals, installed, { node: x, unit, stmt: true });
    if (e?.type === 'AssignmentExpression' && e.operator === '=' && e.left.type === 'MemberExpression' && (!e.left.computed || pure(e.left.property, src) || dottedPath(e.left.property)) &&
      (pure(e.right, src) || (protoOf(e.right.object) && !e.right.computed))) {
      let root = e.left.object;
      while (root.type === 'MemberExpression' && !root.computed) root = root.object;
      if (root.type === 'Identifier' && root.name.includes('#m') && !liveIds.has(root.name)) return wait(waitingIds, root.name, { node: x, unit, stmt: true });
      if (root.type === 'Identifier' && !e.left.computed && !liveNames.has(e.left.property.name)) return wait(waitingNames, e.left.property.name, { node: x, unit });
    }
    const target = e?.type === 'CallExpression' && e.callee.type === 'MemberExpression' && e.callee.object.name === 'Object' &&
      [ 'defineProperty', 'defineProperties', 'setPrototypeOf', 'assign' ].includes(e.callee.property.name) && e.arguments.every(a => pure(a, src)) ? (protoOf(e.arguments[0])?.object ?? e.arguments[0])?.name : null;
    if (target?.includes('#m') && !liveIds.has(target)) return wait(waitingIds, target, { node: x, unit });

    x._dead = false;
    scan(x, unit);
  };

  for (const x of body) {
    if (droppable.has(unitOf(x)) && !liveUnits.has(unitOf(x))) wait(waitingUnits, unitOf(x), { node: x, unit: unitOf(x), stmt: true });
      else stmt(x);
    while (queue.length > 0) {
      const item = queue.pop();
      if (item.stmt) stmt(item.node);
        else if (item.cls) { item.node._dead = false; classUse(item.cls, item.unit); }
        else if (item.member) { item.node._dead = false; shakeMember(item.node, item.unit); }
        else { item.node._dead = false; scan(item.node, item.unit); }
    }
  }

  // a native library links only while other code of its module is kept, else just its headers
  const usedUnits = new Set(body.filter(x => !x._dead && !isFileC(x)).map(unitOf));
  for (const x of body) {
    if (!native(x, 'link') || usedUnits.has(x._nativeUnit)) continue;
    const quasi = x.expression.quasi.quasis[0].value;
    quasi.raw = 'headers ' + quasi.raw;
    quasi.cooked = 'headers ' + quasi.cooked;
  }

  const prune = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) prune(x); return; }
    if (node.type === 'ObjectExpression') node.properties = node.properties.filter(x => !x._dead);
    if (node.type === 'ClassBody') node.body = node.body.filter(x => !x._dead);
    if (node.type === 'IfStatement' && node.consequent._dead) node.consequent = { type: 'EmptyStatement' };
    if (node.type === 'BinaryExpression' && node._dead) {
      Object.assign(node, { type: 'SequenceExpression', expressions: [ node.left, { type: 'Literal', value: false } ] });
      delete node.operator; delete node.left; delete node.right;
    }
    for (const key in node) if (key !== 'start' && key !== 'end') prune(node[key]);
  };
  for (let i = body.length - 1; i >= 0; i--) {
    if (body[i]._dead) body.splice(i, 1);
      else prune(body[i]);
  }

  return {
    type: 'Program', sourceType: opts.script ? 'script' : 'module', body,
    _ts: anyTs,
    _units: order.map(mod => ({ id: mod.id, name: mod.rel }))
  };
};
