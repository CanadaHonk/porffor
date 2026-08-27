import fs from 'node:fs';
import path from 'node:path';
import parse from '../compiler/parser/index.js';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const out = path.join(root, 'selfhosted/bundle.js');
const noopPrecompiled = process.env.SELFHOST_NOOP_PRECOMPILED === '1';

const shims = new Map([
  [ 'node:fs', `const fs = globalThis.__porfforNode.fs;
export const readFileSync = fs.readFileSync;
export const writeFileSync = fs.writeFileSync;
export const statSync = fs.statSync;
export const existsSync = fs.existsSync;
export const unlinkSync = fs.unlinkSync;
export const mkdtempSync = fs.mkdtempSync;
export const rmSync = fs.rmSync;
export const mkdirSync = fs.mkdirSync;
export const readdirSync = fs.readdirSync;
export const renameSync = fs.renameSync;
export const symlinkSync = fs.symlinkSync;
export const cpSync = fs.cpSync;
export default fs;` ],
[ 'node:child_process', `export const execSync = globalThis.__porfforNode.child_process.execSync;
export const execFileSync = globalThis.__porfforNode.child_process.execFileSync;` ],
  [ 'node:path', `const normalizeParts = parts => {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '' || p === '.') continue;
    if (p === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
        else out.push(p);
      continue;
    }
    out.push(p);
  }
  return out;
};
export const join = (...args) => {
  let rooted = false;
  const parts = [];
  for (let i = 0; i < args.length; i++) {
    const s = '' + args[i];
    if (s === '') continue;
    if (parts.length === 0 && s[0] === '/') rooted = true;
    const spl = s.split('/');
    for (let j = 0; j < spl.length; j++) parts.push(spl[j]);
  }
  const out = normalizeParts(parts).join('/');
  if (rooted) return '/' + out;
  return out === '' ? '.' : out;
};
export const resolve = (...args) => {
  let acc = '';
  for (let i = 0; i < args.length; i++) {
    const s = '' + args[i];
    if (s === '') continue;
    if (s[0] === '/') acc = s;
      else acc = acc === '' ? s : acc + '/' + s;
  }
  if (acc === '' || acc[0] !== '/') acc = process.cwd() + '/' + acc;
  return '/' + normalizeParts(acc.split('/')).join('/');
};
export const dirname = p => {
  let s = '' + p;
  while (s.length > 1 && s[s.length - 1] === '/') s = s.slice(0, -1);
  const i = s.lastIndexOf('/');
  if (i === -1) return '.';
  if (i === 0) return '/';
  return s.slice(0, i);
};
export const basename = p => {
  let s = '' + p;
  while (s.length > 1 && s[s.length - 1] === '/') s = s.slice(0, -1);
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
};
export const extname = p => {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i) : '';
};
export const relative = (from, to) => {
  const a = resolve(from).split('/');
  const b = resolve(to).split('/');
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  const out = [];
  for (let i = common; i < a.length; i++) if (a[i] !== '') out.push('..');
  for (let i = common; i < b.length; i++) if (b[i] !== '') out.push(b[i]);
  return out.join('/');
};
export const sep = '/';
export default { join, resolve, dirname, basename, extname, relative, sep };` ],
  [ 'node:os', `export const homedir = () => process.env.HOME ?? '/tmp';
export const tmpdir = () => {
  const t = process.env.TMPDIR;
  if (t == null || t === '') return '/tmp';
  return t[t.length - 1] === '/' ? t.slice(0, -1) : t;
};
export const platform = () => process.platform;
export default { homedir, tmpdir, platform };` ],
  [ 'node:repl', `export function REPLServer(options = {}) {
  this.prompt = options.prompt ?? '> ';
  this.eval = options.eval;
  this.commands = {};
}
REPLServer.prototype.setupHistory = function(_path, callback) {
  if (callback) callback();
};
REPLServer.prototype.defineCommand = function(name, command) {
  this.commands[name] = command;
};
REPLServer.prototype.clearBufferedCommand = function() {};
REPLServer.prototype.displayPrompt = function() {
  process.stdout.write(this.prompt);
};
export const start = options => {
  const server = new REPLServer(options);
  server._start = () => {
    while (true) {
      server.displayPrompt();
      let line = process.stdin.readLine();
      if (line === undefined) break;
      if (line.endsWith('\\n')) line = line.slice(0, -1);
      if (line.endsWith('\\r')) line = line.slice(0, -1);
      if (line[0] === '.') {
        const name = line.slice(1).split(' ')[0];
        const command = server.commands[name];
        if (command) command.action.call(server);
          else process.stdout.write('Invalid REPL keyword\\n');
        continue;
      }
      server.eval(line, {}, 'repl', () => {});
    }
  };
  return server;
};
export default { REPLServer, start };` ]
]);

const entrySource = `import '${root}/selfhosted/native.js';
import '${root}/runtime/index.js';
`;

const modules = [];
const seen = new Map();
let nextModuleId = 0;

const normalize = file => path.normalize(file);
const prefix = id => `__m${id}_`;
const unique = (id, name) => `${prefix(id)}${name.replace(/[^A-Za-z0-9_$]/g, '_')}`;
const stripCommentText = source => source.replace(/[^\n\r]/g, '');

// find comment spans, skipping string/template literals so '//' inside them is kept
const commentRanges = source => {
  const comments = [];
  const interpDepths = []; // brace depth of each open ${}
  let i = 0;

  if (source[0] === '#' && source[1] === '!') {
    while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
    comments.push({ start: 0, end: i });
  }

  const skipTemplateText = () => {
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { i++; return; }
      if (c === '$' && source[i + 1] === '{') { interpDepths.push(0); i += 2; return; }
      i++;
    }
  };

  while (i < source.length) {
    const c = source[i], n = source[i + 1];

    if (c === '/' && n === '/') {
      const start = i;
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
      comments.push({ start, end: i });
      continue;
    }

    if (c === '/' && n === '*') {
      const start = i;
      const j = source.indexOf('*/', i + 2);
      i = j === -1 ? source.length : j + 2;
      comments.push({ start, end: i });
      continue;
    }

    if (c === '"' || c === "'") {
      i++;
      while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }

    if (c === '`') {
      i++;
      skipTemplateText();
      continue;
    }

    if (interpDepths.length > 0) {
      if (c === '{') interpDepths[interpDepths.length - 1]++;
      else if (c === '}') {
        if (interpDepths[interpDepths.length - 1] === 0) {
          interpDepths.pop();
          i++;
          skipTemplateText();
          continue;
        }
        interpDepths[interpDepths.length - 1]--;
      }
    }

    i++;
  }

  return comments;
};

const resolveImport = (from, spec) => {
  if (spec === 'node:fs' || spec === 'node:child_process' || spec === 'node:repl' || spec === 'node:path' || spec === 'node:os') return spec;
  if (!spec.startsWith('.') && !spec.startsWith('/')) return spec;

  let target = spec.startsWith('/') ? spec : path.resolve(path.dirname(from), spec);
  if (!path.extname(target)) target += '.js';
  return normalize(target);
};

const load = file => {
  if (file === '<entry>') return entrySource;
  if (shims.has(file)) return shims.get(file);
  if (noopPrecompiled && /builtins_precompiled\.js$/.test(file)) return 'export const BuiltinFuncs = () => {};';

  let source = fs.readFileSync(file, 'utf8').replace(/^#!.*\n/, '');

  if (file.endsWith('/compiler/index.js')) {
    source = source.replace(`const fs = (typeof process?.version !== 'undefined' ? (await import('node:fs')) : undefined);`, `const fs = globalThis.__porfforNode.fs;`);
    source = source.replace(`const { execSync } = (typeof process?.version !== 'undefined' ? (await import('node:child_process')) : {});`, `const { execSync } = globalThis.__porfforNode.child_process;`);
    source = `import * as uwebsockets from './uwebsockets.js';\n` + source;
    source = source.replace(`const uwebsockets = (typeof process?.version !== 'undefined' ? (await import('./uwebsockets.js')) : undefined);`, ``);
    source = source.replace(`outFile ??= file.split('/').at(-1).split('.')[0];`, `outFile ??= globalThis.file.split('/').at(-1).split('.')[0];`);
  }

  if (file.endsWith('/compiler/uwebsockets.js')) {
    // no import.meta selfhosted: embed the patch files and materialize them into a
    // content-keyed cache dir at runtime (same key as node-hosted patch hashing)
    const patchDir = path.join(root, 'compiler/uwebsockets');
    const patchData = {};
    if (fs.existsSync(patchDir)) {
      for (const f of fs.readdirSync(patchDir).filter(x => x.endsWith('.patch')).sort()) {
        patchData[f] = fs.readFileSync(path.join(patchDir, f), 'latin1');
      }
    }
    const replaced = source.replace(`const __dirname = import.meta.dirname;
const UWS_PATCH_DIR = path.join(__dirname, 'uwebsockets');`, `const __porfforUwsPatchData = ${JSON.stringify(patchData)};
const UWS_PATCH_DIR = (() => {
  const dir = path.join(os.homedir(), '.cache', 'porffor', 'uws-patches');
  fs.mkdirSync(dir, { recursive: true });
  const names = Object.keys(__porfforUwsPatchData);
  for (let i = 0; i < names.length; i++) {
    fs.writeFileSync(path.join(dir, names[i]), __porfforUwsPatchData[names[i]]);
  }
  return dir;
})();`);
    if (replaced === source) throw new Error('selfhost uwebsockets patch-dir rewrite failed');
    source = replaced;
  }

  if (file.endsWith('/runtime/native-fetch.js')) {
    const replaced = source.replace(`const FETCH_GLOBALS = fs.readFileSync(new URL('./fetch-globals.js', import.meta.url), 'utf8');`,
      `const FETCH_GLOBALS = ${JSON.stringify(fs.readFileSync(path.join(root, 'runtime/fetch-globals.js'), 'utf8'))};`);
    if (replaced === source) throw new Error('selfhost native-fetch globals rewrite failed');
    source = replaced;
  }

  if (file.endsWith('/runtime/repl.js')) {
    const replImports = [];
    source = source.replace(/^\s*import[^\n]*\n/gm, match => {
      replImports.push(match);
      return '';
    });
    source = `${replImports.join('')}export default function __porfforStartRepl() {
${source}
}
`;
  }

  if (file.endsWith('/runtime/index.js')) {
    source = `import __porfforStartRepl from './repl.js';
import __porfforCompile from '../compiler/index.js';
` + source;
    source = source.replace(/if \(typeof process === 'undefined' && typeof Deno !== 'undefined'\) \{[\s\S]*?\n\}\n/, '');

    // compiler is dynamically imported at runtime, but the selfhosted parser cannot
    // handle import() expressions, so rewrite the call sites to use the statically bundled refs
    for (const [ before, after ] of [
      [ `(await import('../compiler/index.js')).default(`, '__porfforCompile(' ]
    ]) {
      if (!source.includes(before)) throw new Error(`selfhost dynamic import rewrite failed: ${before}`);
      source = source.replaceAll(before, after);
    }
    const rewritten = source.replace(/\/\/ run repl if no file given\n\s*await import\(["']\.\/repl\.js["']\);\n\s*break entrypoint;/, `// run repl if no file given
  __porfforStartRepl();
  process.exit();`);
    if (rewritten === source) throw new Error('selfhost runtime repl rewrite failed');
    source = rewritten;
    source = `import __porfforNativeFetch from './native-fetch.js';\n` + source;
    const nativeFetch = source.replace(
      `(await import('./native-fetch.js')).default(inputFile, source);`,
      `__porfforNativeFetch(inputFile, source);`
    );
    if (nativeFetch === source) throw new Error('selfhost native-fetch rewrite failed');
    source = nativeFetch;
  }

  return source;
};

const staticImports = source => {
  const imports = [];
  source = source.replace(/^\s*import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"]\s*;?/gm, (all, clause, spec) => {
    imports.push({ clause: clause.trim(), spec });
    return '';
  });
  source = source.replace(/^\s*import\s+['"]([^'"]+)['"]\s*;?/gm, (all, spec) => {
    imports.push({ clause: '', spec });
    return '';
  });
  return { source, imports };
};

const addModule = file => {
  file = normalize(file);
  if (seen.has(file)) return seen.get(file);

  const id = nextModuleId++;
  seen.set(file, id);

  let source = load(file);
  const parsed = staticImports(source);
  source = parsed.source;
  const deps = parsed.imports
    .map(x => ({ ...x, file: resolveImport(file, x.spec) }));
  for (const dep of deps) addModule(dep.file);

  modules.push({ id, file, deps, source, exports: new Map(), topLevel: new Map() });
  return id;
};

const topLevelNames = (ast, id) => {
  const names = new Map();
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
      if (node.id) names.set(node.id.name, unique(id, node.id.name));
    } else if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) collectPatternNames(decl.id, names, id);
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration) {
      const decl = node.declaration;
      if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
        if (decl.id) names.set(decl.id.name, unique(id, decl.id.name));
      } else if (decl.type === 'VariableDeclaration') {
        for (const item of decl.declarations) collectPatternNames(item.id, names, id);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
        names.set(decl.id.name, unique(id, decl.id.name));
      }
    }
  }
  return names;
};

const collectPatternNames = (node, out, id, local = false) => {
  if (!node) return;
  if (node.type === 'Identifier') {
    if (out instanceof Map) out.set(node.name, local ? node.name : unique(id, node.name));
      else out.add(node.name);
    return;
  }
  if (node.type === 'RestElement') return collectPatternNames(node.argument, out, id, local);
  if (node.type === 'AssignmentPattern') return collectPatternNames(node.left, out, id, local);
  if (node.type === 'ArrayPattern') {
    for (const item of node.elements) collectPatternNames(item, out, id, local);
    return;
  }
  if (node.type === 'ObjectPattern') {
    for (const prop of node.properties) collectPatternNames(prop.value ?? prop.argument, out, id, local);
  }
};

const dependencyExport = (dep, name) => {
  const mod = modules.find(x => x.id === seen.get(normalize(dep.file)));
  const out = mod?.exports.get(name);
  if (!out) throw new Error(`missing export ${name} from ${dep.file}`);
  return out;
};

const importAliases = mod => {
  const aliases = new Map();
  const namespaces = new Map();
  for (const dep of mod.deps) {
    if (!dep.clause) continue;

    if (dep.clause.startsWith('* as ')) {
      namespaces.set(dep.clause.slice(5).trim(), dep);
    } else if (dep.clause.startsWith('{')) {
      for (const part of dep.clause.slice(1, -1).split(',')) {
        const item = part.trim();
        if (!item) continue;
        const [ imported, local = imported ] = item.split(/\s+as\s+/);
        aliases.set(local.trim(), dependencyExport(dep, imported.trim()));
      }
    } else {
      const comma = dep.clause.indexOf(',');
      const defaultName = (comma === -1 ? dep.clause : dep.clause.slice(0, comma)).trim();
      const named = comma === -1 ? '' : dep.clause.slice(comma + 1).trim();
      if (defaultName) aliases.set(defaultName, dependencyExport(dep, 'default'));
      if (named?.startsWith('{')) {
        for (const part of named.slice(1, -1).split(',')) {
          const item = part.trim();
          if (!item) continue;
          const [ imported, local = imported ] = item.split(/\s+as\s+/);
          aliases.set(local.trim(), dependencyExport(dep, imported.trim()));
        }
      }
    }
  }
  return { aliases, namespaces };
};

const exportName = node => node.type === 'Identifier' ? node.name : node.value;

const transformExports = (source, mod, ast, replacements) => {
  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      const decl = node.declaration;
      if (decl) {
        if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
          if (decl.id) mod.exports.set(decl.id.name, mod.topLevel.get(decl.id.name));
        } else if (decl.type === 'VariableDeclaration') {
          for (const item of decl.declarations) {
            const names = new Set();
            collectPatternNames(item.id, names, mod.id, true);
            for (const name of names) mod.exports.set(name, mod.topLevel.get(name));
          }
        }
        replacements.push({ start: node.start, end: decl.start, text: '' });
      } else {
        for (const spec of node.specifiers) {
          const local = exportName(spec.local);
          mod.exports.set(exportName(spec.exported), mod.topLevel.get(local) ?? local);
        }
        replacements.push({ start: node.start, end: node.end, text: '' });
      }
      continue;
    }

    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration;
      if ((decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
        mod.exports.set('default', mod.topLevel.get(decl.id.name));
        replacements.push({ start: node.start, end: decl.start, text: '' });
      } else {
        const name = unique(mod.id, 'default');
        mod.topLevel.set('__default', name);
        mod.exports.set('default', name);
        replacements.push({ start: node.start, end: decl.start, text: `const ${name} = ` });
      }
    }
  }
};

const replaceIdentifiers = (source, replacements) => {
  const ordered = replacements.sort((a, b) => b.start - a.start);
  for (const item of ordered) source = source.slice(0, item.start) + item.text + source.slice(item.end);
  return source;
};

const generatedTopLevelConstNames = source => {
  const names = new Map();
  const re = /^(?:export\s+)?const\s+([A-Za-z_$][0-9A-Za-z_$]*)\b/gm;
  let m;
  while ((m = re.exec(source))) {
    names.set(m[1], null);

    const lineEnd = source.indexOf('\n', m.index);
    const line = source.slice(m.index, lineEnd === -1 ? source.length : lineEnd);
    const extra = /,\s*([A-Za-z_$][0-9A-Za-z_$]*)\s*=/g;
    let x;
    while ((x = extra.exec(line))) names.set(x[1], null);
  }
  return names;
};

const rewriteGeneratedModule = (source, id) => {
  const names = generatedTopLevelConstNames(source);
  if (!names.has('BuiltinFuncs')) throw new Error('missing BuiltinFuncs export in precompiled builtins');
  for (const name of names.keys()) names.set(name, unique(id, name));

  let out = '';
  for (let i = 0; i < source.length;) {
    const c = source[i];
    const n = source[i + 1];

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === quote) { j++; break; }
        j++;
      }
      out += source.slice(i, j);
      i = j;
      continue;
    }

    if (c === '/' && n === '/') {
      const j = source.indexOf('\n', i + 2);
      if (j === -1) { out += source.slice(i); break; }
      out += stripCommentText(source.slice(i, j)) + '\n';
      i = j + 1;
      continue;
    }

    if (c === '/' && n === '*') {
      const j = source.indexOf('*/', i + 2);
      if (j === -1) { out += stripCommentText(source.slice(i)); break; }
      out += stripCommentText(source.slice(i, j + 2));
      i = j + 2;
      continue;
    }

    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_' || c === '$') {
      let j = i + 1;
      while (j < source.length) {
        const x = source[j];
        if (!((x >= 'A' && x <= 'Z') || (x >= 'a' && x <= 'z') || (x >= '0' && x <= '9') || x === '_' || x === '$')) break;
        j++;
      }

      const name = source.slice(i, j);
      if (name === 'export') {
        let k = j;
        while (source[k] === ' ' || source[k] === '\t') k++;
        if (source.startsWith('const', k) && !/[A-Za-z0-9_$]/.test(source[k + 5] ?? '')) {
          i = k;
          continue;
        }
      }

      out += source[i - 1] === '.' ? name : (names.get(name) ?? name);
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return { source: out, exports: new Map([ [ 'BuiltinFuncs', names.get('BuiltinFuncs') ] ]) };
};

const rename = (source, mod, aliases, namespaces, ast, replacements) => {
  const map = new Map([ ...mod.topLevel, ...aliases ]);

  const scoped = (scope, name) => scope.some(x => x.has(name));
  const addLocal = (scope, name) => scope.at(-1).add(name);
  const addPatternLocals = (scope, pattern) => collectPatternNames(pattern, scope.at(-1), mod.id, true);
  const walkPatternDefaults = (node, scope) => {
    if (!node) return;
    if (node.type === 'AssignmentPattern') {
      walk(node.right, scope, node, 'right');
      walkPatternDefaults(node.left, scope);
    } else if (node.type === 'ArrayPattern') {
      for (const item of node.elements) walkPatternDefaults(item, scope);
    } else if (node.type === 'ObjectPattern') {
      for (const prop of node.properties) {
        if (prop.computed) walk(prop.key, scope, prop, 'key');
        walkPatternDefaults(prop.value ?? prop.argument, scope);
      }
    } else if (node.type === 'RestElement') {
      walkPatternDefaults(node.argument, scope);
    }
  };
  const replace = (node, scope) => {
    const text = map.get(node.name);
    if (text && !scoped(scope, node.name)) replacements.push({ start: node.start, end: node.end, text });
  };

  const walk = (node, scope = [ new Set() ], parent = null, key = null) => {
    if (!node || typeof node.type !== 'string') return;

    if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.property.type === 'Identifier') {
      const dep = namespaces.get(node.object.name);
      if (dep && !scoped(scope, node.object.name)) {
        replacements.push({ start: node.start, end: node.end, text: dependencyExport(dep, node.property.name) });
        return;
      }
    }

    if (node.type === 'Identifier') {
      if (parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) return;
      if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition') && key === 'key' && !parent.computed) return;
      if (parent?.type === 'LabeledStatement' || parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement') return;
      replace(node, scope);
      return;
    }

    if (node.type === 'Property' && node.shorthand && node.key.type === 'Identifier') {
      const text = map.get(node.key.name);
      if (text && !scoped(scope, node.key.name)) {
        replacements.push({ start: node.start, end: node.end, text: `${node.key.name}: ${text}` });
        return;
      }
    }

    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      if (node.type === 'FunctionDeclaration' && node.id) replace(node.id, scope);
      const child = [ ...scope, new Set() ];
      if (node.type === 'FunctionExpression' && node.id) addLocal(child, node.id.name);
      for (const param of node.params) {
        walkPatternDefaults(param, child);
        addPatternLocals(child, param);
      }
      walk(node.body, child, node, 'body');
      return;
    }

    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      if (node.id) replace(node.id, scope);
      if (node.superClass) walk(node.superClass, scope, node, 'superClass');
      for (const item of node.body.body) walk(item, scope, node.body, 'body');
      return;
    }

    if (node.type === 'VariableDeclarator') {
      const isTop = parent?.type === 'VariableDeclaration' && parent.__top;
      walkPatternDefaults(node.id, scope);
      if (isTop) walk(node.id, scope, node, 'id');
        else addPatternLocals(scope, node.id);
      walk(node.init, scope, node, 'init');
      return;
    }

    if (node.type === 'BlockStatement') {
      const child = [ ...scope, new Set() ];
      for (const item of node.body) walk(item, child, node, 'body');
      return;
    }

    if (node.type === 'Program') {
      for (const item of node.body) {
        if (item.type === 'VariableDeclaration') item.__top = true;
        walk(item, scope, node, 'body');
      }
      return;
    }

    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') node.declaration.__top = true;
        walk(node.declaration, scope, node, 'declaration');
      }
      return;
    }

    if (node.type === 'ExportDefaultDeclaration') {
      walk(node.declaration, scope, node, 'declaration');
      return;
    }

    for (const prop in node) {
      if (prop === 'type' || prop === 'start' || prop === 'end' || prop === '__top') continue;
      const value = node[prop];
      if (Array.isArray(value)) {
        for (const item of value) walk(item, scope, node, prop);
      } else if (value && typeof value.type === 'string') {
        walk(value, scope, node, prop);
      }
    }
  };

  walk(ast);
  return replaceIdentifiers(source, replacements);
};

addModule('<entry>');

let output = `// generated by selfhosted/build.mjs
"use strict";
var Prefs, argvChanged, Buffer, process, __porfforNode;
var version, porfforFile, typedInput, precompile, noi32F64CallConv;
var pageSize, _uniqId = 0, funcBodies, precompileI32SignsFor;
var importFuncs, importDelta;
`;

for (const mod of modules) {
  const rel = mod.file.startsWith(root) ? path.relative(root, mod.file) : mod.file;

  if (!noopPrecompiled && mod.file.endsWith('/compiler/builtins_precompiled.js')) {
    const generated = rewriteGeneratedModule(mod.source, mod.id);
    mod.exports = generated.exports;
    output += `\n// ${rel}\n${generated.source}\n`;
    continue;
  }

  const comments = commentRanges(mod.source);
  try {
    mod.ast = parse(mod.source, { module: true });
  } catch (e) {
    throw new Error(`failed to parse ${mod.file}: ${e.message}`);
  }
  mod.topLevel = topLevelNames(mod.ast, mod.id);
  const replacements = comments.map(x => ({ start: x.start, end: x.end, text: stripCommentText(mod.source.slice(x.start, x.end)) }));
  transformExports(mod.source, mod, mod.ast, replacements);
  const { aliases, namespaces } = importAliases(mod);
  let source = rename(mod.source, mod, aliases, namespaces, mod.ast, replacements);

  output += `\n// ${rel}\n${source}\n`;
}

output = output.replace(
  'globalThis.pageSize = Prefs.pageSize ?? (65536 / 4);',
  'globalThis.pageSize = Prefs.pageSize ?? (65536 / 4);\n  pageSize = globalThis.pageSize;'
);
output = output.replaceAll('globalThis.file', 'porfforFile');
const optimizedGlobals = [
  'Prefs',
  'argvChanged',
  'Buffer',
  'process',
  '__porfforNode',
  'version',
  'typedInput',
  'precompile',
  'noi32F64CallConv',
  'pageSize',
  '_uniqId',
  'funcBodies',
  'precompileI32SignsFor',
  'importFuncs',
  'importDelta'
];
for (const name of optimizedGlobals) {
  output = output.replaceAll(`globalThis.${name}`, name);
}
for (const name of optimizedGlobals) {
  output = output.replaceAll(`let ${name} = ${name} =`, `${name} =`);
  output = output.replaceAll(`const ${name} = ${name} ?? [];`, `${name} ??= [];`);
}

fs.writeFileSync(out, output);
console.log(out);
console.log(`bundle ${(output.length / 1024 / 1024).toFixed(1)}MB`);
