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
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

export const hashId = str => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
};

const EXTENSIONS = [ '.ts', '.tsx', '.js', '.mjs', '.mts', '.cjs', '.json' ];
const resolveFile = p => {
  if (isFile(p)) return p;
  for (const ext of EXTENSIONS) if (isFile(p + ext)) return p + ext;
  // ts sources import their siblings as .js
  const stripped = p.replace(/\.[cm]?js$/, '');
  if (stripped !== p) for (const ext of EXTENSIONS) if (isFile(stripped + ext)) return stripped + ext;
  for (const ext of EXTENSIONS) if (isFile(p + '/index' + ext)) return p + '/index' + ext;
  return null;
};

const findPackage = (dir, name) => {
  for (;;) {
    const pkgDir = dir + '/node_modules/' + name;
    if (isFile(pkgDir + '/package.json')) return pkgDir;
    if (dir === '/') return null;
    dir = dirname(dir);
  }
};

// package.json "exports": subpath map with conditions, "*" patterns and array fallbacks
const resolveTarget = (target, conditions, star) => {
  if (typeof target === 'string') return star != null ? target.replace('*', star) : target;
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

const resolve = (spec, from, cjs) => {
  if (spec.startsWith('node:')) throw new Error(`porffor: node builtin modules are not supported (${spec})`);
  const conditions = [ 'porffor', 'worker', cjs ? 'require' : 'import', 'module', 'default', ...(Prefs.conditions ? String(Prefs.conditions).split(',') : []) ];
  let out = null;
  if (spec[0] === '.' || spec[0] === '/') out = resolveFile(joinPath(dirname(from), spec));
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
      const pkg = readJson(pkgDir + '/package.json');
      if (pkg.exports != null) {
        const target = resolveExports(pkg.exports, subpath, conditions);
        out = target ? resolveFile(joinPath(pkgDir, target)) : null;
      } else if (subpath === '.') out = resolveFile(joinPath(pkgDir, pkg.module ?? pkg.main ?? 'index.js'));
      else out = resolveFile(joinPath(pkgDir, subpath));
    }
  }
  if (!out) throw new Error(`porffor: cannot resolve '${spec}' from ${from}`);
  return out;
};

const isEsmSource = (file, src) => {
  if (/\.m[jt]s$/.test(file)) return true;
  if (/\.c[jt]s$/.test(file)) return false;
  const pkgDir = nearestPackage(dirname(file));
  if (pkgDir && readJson(pkgDir + '/package.json').type === 'module') return true;
  return /^\s*(?:import|export)\b/m.test(src);
};

const ident = name => ({ type: 'Identifier', name });
const literal = value => ({ type: 'Literal', value });
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

const patternNames = (node, out) => {
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
const isHostHook = name => /^__porffor_/i.test(name);

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
const countRefs = (node, refs) => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) countRefs(x, refs); return; }
  if (node.type === 'Identifier') { if (node.name.includes('#m')) refs[node.name] = (refs[node.name] ?? 0) + 1; return; }
  for (const key in node) if (key !== 'start' && key !== 'end') countRefs(node[key], refs);
};

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

export default (entrySource, entryFile, opts = {}) => {
  const modules = new Map();
  const entryDir = dirname(entryFile);
  const nodeEnv = Prefs.d ? 'development' : 'production';
  let anyTs = false;

  const load = (file, source = null, kind = null, entry = false) => {
    let mod = modules.get(file);
    if (mod) return mod;

    source ??= fs.readFileSync(file, 'utf8');
    const rel = file.startsWith(entryDir + '/') ? file.slice(entryDir.length + 1) : file;
    mod = { file, rel, src: source, id: hashId(rel), entry, esm: true, exports: new Map(), stars: [], imports: [], deps: [], body: null, nsUsed: false };
    modules.set(file, mod);

    if (kind === 'json' || kind === 'text') {
      mod.body = [ varDecl('const', 'default', kind === 'json' ? jsonToAst(JSON.parse(source)) : literal(source)) ];
      mod.exports.set('default', { local: 'default' });
      return mod;
    }

    const ts = /\.[cm]?tsx?$/.test(file) || !!(entry ? opts.ts : Prefs.parseTypes || Prefs.t);
    anyTs ||= ts;
    mod.esm = entry || isEsmSource(file, source);
    mod.body = parse(source, { module: mod.esm, ts }).body;
    if (mod.esm) collectModule(mod);
    else mod.body.unshift(
      varDecl('const', 'module', { type: 'ObjectExpression', properties: [ property(ident('exports'), { type: 'ObjectExpression', properties: [] }) ] }),
      varDecl('let', 'exports', member(ident('module'), 'exports'))
    );
    return mod;
  };

  const dep = (mod, node, lazy = false) => {
    const attrs = node.attributes ?? [];
    const type = attrs.find(x => (x.key.name ?? x.key.value) === 'type')?.value.value;
    let file;
    try {
      file = resolve(node.source.value, mod.file, !mod.esm);
    } catch (e) {
      // dynamic import() and require() of something unresolvable fail when they run
      if (!lazy) throw e;
      return { error: e.message };
    }
    const kind = type === 'json' || type === 'text' ? type : (file.endsWith('.json') ? 'json' : null);
    const d = load(file, null, kind);
    if (!mod.deps.includes(d)) mod.deps.push(d);
    return d;
  };
  const exportName = node => node.name ?? node.value;
  const throwExpr = (message, error = 'Error') => ({ type: 'CallExpression', optional: false, arguments: [], callee: { type: 'ArrowFunctionExpression', params: [], async: false, generator: false, expression: false, body: { type: 'BlockStatement', body: [
    { type: 'ThrowStatement', argument: { type: 'NewExpression', callee: ident(error), arguments: [ literal(message) ] } }
  ] } } });

  // import/export syntax becomes binding records, the rest of the body stays
  const collectModule = mod => {
    const body = [];
    for (const node of mod.body) {
      switch (node.type) {
        case 'ImportDeclaration': {
          if (node.importKind === 'type') break;
          const d = dep(mod, node);
          for (const spec of node.specifiers) {
            if (spec.importKind === 'type') continue;
            const name = spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : exportName(spec.imported);
            mod.imports.push({ local: spec.local.name, dep: d, name, spec: node.source.value });
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
            // entry __porffor_ names are host hooks the runtime looks up by name (native fetch): kept as exports
            body.push(mod.entry && decl.id && isHostHook(decl.id.name) ? node : decl);
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
          body.push(varDecl('const', node.id.name, { type: 'CallExpression', callee: ident('require'), arguments: [ node.moduleReference.expression ], optional: false }));
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
    if (!mod.esm) return { cjs: mod, prop: name === 'default' ? null : name };
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
      if (imp.name === '*') return imp.dep.esm ? { ns: imp.dep } : { cjs: imp.dep, prop: null };
      return resolveExport(imp.dep, imp.name, seen);
    }
    if (name === 'default') return null;
    for (const star of mod.stars) {
      const r = resolveExport(star, name, seen);
      if (r) return r;
    }
    return null;
  };
  const exportNames = (mod, out = Object.create(null), seen = Object.create(null)) => {
    if (seen[mod.id]) return out;
    seen[mod.id] = true;
    for (const name of mod.exports.keys()) out[name] = true;
    for (const star of mod.stars) for (const name in exportNames(star, Object.create(null), seen)) if (name !== 'default') out[name] = true;
    return out;
  };
  const exportExpr = r => r.global ? ident(r.global) : r.ns ? ident(nsName(r.ns)) : r.prop != null ? member(exportsOf(r.cjs), r.prop) : exportsOf(r.cjs);

  // esm namespace: live getters. cjs: module.exports itself
  const namespaceExpr = mod => {
    if (!mod.esm) return exportsOf(mod);
    const properties = [];
    for (const name of Object.keys(exportNames(mod)).sort()) {
      const r = resolveExport(mod, name);
      if (!r) continue;
      properties.push(property(literal(name), { type: 'FunctionExpression', id: null, params: [], async: false, generator: false, body: { type: 'BlockStatement', body: [ { type: 'ReturnStatement', argument: exportExpr(r) } ] } }, 'get'));
    }
    return { type: 'ObjectExpression', properties };
  };

  // map: original name -> new name or replacement node
  const rename = (mod, map, imported) => {
    const scopes = [];
    const shadowed = name => scopes.some(s => s.includes(name));
    const firstRef = new Map();
    const requireTarget = node => {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'require' || shadowed('require') || node.arguments.length !== 1 || typeof node.arguments[0].value !== 'string') return null;
      const d = dep(mod, { source: node.arguments[0] }, true);
      return d.error ? throwExpr(d.error) : d.esm ? ident(nsName(d)) : exportsOf(d);
    };
    const scoped = (names, fn) => { scopes.push(names); fn(); scopes.pop(); };
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
          const to = map.get(node.name);
          if (to === undefined || shadowed(node.name)) return node;
          if (node.start < (firstRef.get(node.name) ?? Infinity)) firstRef.set(node.name, node.start);
          if (typeof to === 'string') { node.name = to; return node; }
          if (to.ns) { node.name = nsName(to.ns); return node; }
          return to;
        }

        case 'MemberExpression': {
          if (!node.computed && node.property.name === 'NODE_ENV' && node.object.type === 'MemberExpression' && !node.object.computed &&
              node.object.property.name === 'env' && node.object.object.type === 'Identifier' && node.object.object.name === 'process' && !shadowed('process')) return literal(nodeEnv);
          // ns.name reads the export directly: the namespace object only exists for other uses
          const ns = node.object.type === 'Identifier' && !shadowed(node.object.name) ? map.get(node.object.name)?.ns : null;
          if (ns && !node.computed) {
            const r = resolveExport(ns, node.property.name);
            if (r) return exportExpr(r);
          }
          node.object = walk(node.object);
          if (node.computed) node.property = walk(node.property);
          return node;
        }

        case 'MetaProperty':
          if (node.meta.name === 'import') return { type: 'ObjectExpression', properties: [ property(ident('url'), literal('file://' + mod.file)) ] };
          return node;

        case 'ImportExpression': {
          if (node.source.type !== 'Literal') return node;
          const d = dep(mod, { source: node.source }, true);
          if (d.error) return { type: 'CallExpression', callee: member(ident('Promise'), 'reject'), arguments: [ { type: 'NewExpression', callee: ident('Error'), arguments: [ literal(d.error) ] } ], optional: false };
          return { type: 'CallExpression', callee: member(ident('Promise'), 'resolve'), arguments: [ d.esm ? ident(nsName(d)) : exportsOf(d) ], optional: false };
        }

        case 'CallExpression':
          return requireTarget(node) ?? walkKeys(node);

        case 'AssignmentExpression':
        case 'UpdateExpression': {
          const target = node.left ?? node.argument;
          if (target.type === 'Identifier' && imported[target.name] && !shadowed(target.name)) return throwExpr('Assignment to constant variable.', 'TypeError');
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
          scoped(funcScopeNames(node).concat(node.type === 'FunctionExpression' && node.id ? [ node.id.name ] : []), () => walkKeys(node));
          return node;

        case 'ClassDeclaration':
        case 'ClassExpression':
          if (node.id && node.type === 'ClassDeclaration') node.id = walk(node.id);
          if (node.superClass) node.superClass = walk(node.superClass);
          scoped(node.id ? [ node.id.name ] : [], () => { node.body = walk(node.body); });
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
    for (let i = 0; i < mod.body.length; i++) mod.body[i] = walk(mod.body[i]);

    // classes used before their declaration become hoisted vars
    for (const [ decl, name ] of classes) {
      if (!(firstRef.get(name) < decl.start)) continue;
      mod.body[mod.body.indexOf(decl)] = varDecl('var', decl.id.name, { ...decl, type: 'ClassExpression' });
    }
  };

  const entryMod = load(entryFile, entrySource, null, true);

  // evaluation order: dependencies first
  const order = [];
  const visitPost = mod => {
    if (mod.ordered) return;
    mod.ordered = true;
    for (const d of mod.deps) visitPost(d);
    order.push(mod);
  };

  // cjs require() targets are discovered while renaming, so rename in load order first
  for (;;) {
    const pending = [ ...modules.values() ].filter(m => !m.renamed);
    if (pending.length === 0) break;
    for (const mod of pending) {
      mod.renamed = true;
      const map = new Map();
      for (const name of lexicalNames(mod.body, varNames(mod.body, []))) {
        if (!(mod.entry && isHostHook(name))) map.set(name, globalName(mod, name));
      }
      if (!mod.esm) {
        map.set('__filename', literal(mod.file));
        map.set('__dirname', literal(dirname(mod.file)));
      }
      const snapshots = [];
      const imported = Object.create(null);
      for (const imp of mod.imports) {
        imported[imp.local] = true;
        const r = imp.name === '*' ? (imp.dep.esm ? { ns: imp.dep } : { cjs: imp.dep, prop: null }) : resolveExport(imp.dep, imp.name);
        if (!r) throw new SyntaxError(`The requested module '${imp.spec}' does not provide an export named '${imp.name}'`);
        if (r.global) { map.set(imp.local, r.global); continue; }
        if (r.ns) { map.set(imp.local, r.ns.esm ? { ns: r.ns } : nsName(r.ns)); continue; }
        // cjs exports are read once after the module ran. default follows __esModule interop
        const value = imp.name === 'default' ? {
          type: 'ConditionalExpression', test: member(exportsOf(r.cjs), '__esModule'), consequent: member(exportsOf(r.cjs), 'default'), alternate: exportsOf(r.cjs)
        } : exportExpr(r);
        const name = globalName(mod, imp.local);
        map.set(imp.local, name);
        snapshots.push(varDecl('const', name, value));
      }
      rename(mod, map, imported);
      mod.body.unshift(...snapshots);
    }
  }

  visitPost(entryMod);
  for (let more = true; more;) {
    more = false;
    for (const mod of order) {
      if (!mod.nsUsed || mod.nsExpr) continue;
      mod.nsExpr = namespaceExpr(mod);
      more = true;
    }
  }
  const body = [];
  // host scripts define globals, so they stay unrenamed and run first
  for (let i = 0; i < (opts.scripts ?? []).length; i++) {
    for (const x of parse(opts.scripts[i], { module: false }).body) { x._unit = 'script' + i; body.push(x); }
  }
  // namespaces declared up front for cycles, filled after the module's last class
  for (const mod of order) {
    if (mod.nsExpr) body.push(varDecl('let', nsName(mod), null));
  }
  for (const mod of order) {
    if (mod.nsExpr) {
      const at = mod.body.findLastIndex(x => x.type === 'ClassDeclaration') + 1;
      mod.body.splice(at, 0, { type: 'ExpressionStatement', expression: { type: 'AssignmentExpression', operator: '=', left: ident(nsName(mod)), right: mod.nsExpr } });
    }
    for (const x of mod.body) { x._unit = mod.id; body.push(x); }
  }

  // tree shaking: renamed names are unique program-wide, so one ref count covers all modules
  const srcs = Object.create(null);
  for (const mod of order) srcs[mod.id] = mod.src;

  // cjs export shaking: drop unread top-level exports.x writes
  const cjsIds = new Set(order.filter(mod => !mod.esm).map(mod => mod.id));
  const moduleOf = name => name.startsWith('module#m') && cjsIds.has(name.slice(8)) ? name.slice(8) : null;
  const baseRef = node => node.type === 'MemberExpression' && !node.computed && node.property.name === 'exports' && node.object.type === 'Identifier' ? moduleOf(node.object.name) : null;
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

  for (let dropped = true; dropped;) {
    dropped = shakeExports();
    const refs = Object.create(null);
    countRefs(body, refs);
    for (let i = body.length - 1; i >= 0; i--) {
      const x = body[i], src = srcs[x._unit] ?? '';
      let name, self = 1;
      if (x.type === 'FunctionDeclaration' || (x.type === 'ClassDeclaration' && pureClass(x, src))) name = x.id.name;
      else if (x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'Identifier' && (!x.declarations[0].init || pure(x.declarations[0].init, src))) {
        name = x.declarations[0].id.name;
        if (x.declarations[0].init?.id?.name === name) self = 2;
      }
      if (!name?.includes('#m') || refs[name] > self) continue;
      body.splice(i, 1);
      dropped = true;
    }
  }

  return {
    type: 'Program', sourceType: 'module', body,
    _ts: anyTs,
    _units: order.map(mod => ({ id: mod.id, name: mod.rel }))
  };
};
