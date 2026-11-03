import './c-helpers.js';
import process from './process.js';
import { dirname, basename, resolve as resolvePath, join, normalize, isAbsolute } from './path.js';
import { URL, fileURLToPath, pathToFileURL } from './url.js';
import { codedError } from './internal/errors.js';

// 0 file, 1 directory, -2 missing, like node's internalModuleStat
const nativeStat = path => {
  let out = 0;
  Porffor.c`{
  char *p = porf_node_bytes(path, NULL);
  struct stat st;
  out = stat(p, &st) != 0 ? -2 : S_ISDIR(st.st_mode) ? 1 : 0;
  free(p);
}`;
  return out;
};

const nativeRead = path => {
  let out;
  Porffor.c`{
  char *p = porf_node_bytes(path, NULL);
  FILE *f = fopen(p, "rb");
  free(p);
  if (f) {
    size_t n;
    char *buf = porf_node_slurp(f, &n);
    fclose(f);
    out = porf_node_str(buf, n);
    free(buf);
  }
}`;
  return out;
};

const nativeRealpath = path => {
  let out = path;
  Porffor.c`{
  char *p = porf_node_bytes(path, NULL), *r = realpath(p, NULL);
  if (r) {
    out = porf_node_cstr(r);
    free(r);
  }
  free(p);
}`;
  return out;
};

export const builtinModules = [
  '_http_agent', '_http_client', '_http_common', '_http_incoming', '_http_outgoing', '_http_server', '_tls_common', '_tls_wrap',
  'assert', 'assert/strict', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram',
  'diagnostics_channel', 'dns', 'dns/promises', 'domain', 'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'inspector/promises', 'module', 'net', 'os', 'path', 'path/posix', 'path/win32', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'readline/promises', 'repl', 'stream', 'stream/consumers', 'stream/promises', 'stream/web',
  'string_decoder', 'sys', 'timers', 'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util', 'util/types', 'v8', 'vm',
  'wasi', 'worker_threads', 'zlib', 'node:ffi', 'node:sea', 'node:sqlite', 'node:test', 'node:test/reporters'
];

export const isBuiltin = id => typeof id === 'string' && (builtinModules.includes(id) || (id.startsWith('node:') && builtinModules.includes(id.slice(5))));

// builtins are compiled in, so only the ones the program links can be loaded
const loadBuiltin = id => {
  const exports = __porffor_bundle(id.startsWith('node:') ? id : 'node:' + id);
  if (exports === undefined) throw new Error(`porffor: node builtin module '${id}' is not linked into this program (require it with a literal specifier)`);
  return exports;
};

const updateChildren = (parent, child) => {
  if (parent?.children && !parent.children.includes(child)) parent.children.push(child);
};

// node's findLongestRegisteredExtension, dotfiles have no extension
const findExtension = filename => {
  const name = basename(filename);
  for (let i = name.indexOf('.', 1); i !== -1; i = name.indexOf('.', i + 1)) {
    if (Module._extensions[name.slice(i)]) return name.slice(i);
  }
  return '.js';
};

const isRelative = request => request === '.' || request === '..' || request.startsWith('./') || request.startsWith('../');

// package.json fields resolution needs, null when there is none
const packageCache = Object.create(null);
const readPackage = dir => {
  const path = dir + '/package.json';
  if (packageCache[path] !== undefined) return packageCache[path];
  let pkg = null;
  if (nativeStat(path) === 0) {
    let json;
    try {
      json = JSON.parse(nativeRead(path));
    } catch {
      throw codedError(Error, 'ERR_INVALID_PACKAGE_CONFIG', `Invalid package config ${path}.`);
    }
    pkg = { __proto__: null, path };
    for (const key of [ 'name', 'main', 'exports', 'imports' ]) if (Object.hasOwn(json, key)) pkg[key] = json[key];
  }
  return packageCache[path] = pkg;
};

const nearestPackage = dir => {
  for (;;) {
    const pkg = readPackage(dir);
    if (pkg || dir === '/' || dir === '.') return pkg;
    dir = dirname(dir);
  }
};

// package.json "exports"/"imports" targets with conditions and "*" patterns
const resolveTarget = (target, subpath, conditions) => {
  if (typeof target === 'string') return subpath == null ? target : target.replaceAll('*', () => subpath);
  if (Array.isArray(target)) {
    for (const x of target) {
      const r = resolveTarget(x, subpath, conditions);
      if (r != null) return r;
    }
    return null;
  }
  if (target !== null && typeof target === 'object') {
    for (const key in target) {
      if (key === 'default' || conditions.includes(key)) {
        const r = resolveTarget(target[key], subpath, conditions);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  }
  return null;
};

const resolveMap = (map, key, conditions) => {
  if (key in map && !key.includes('*')) return resolveTarget(map[key], null, conditions);
  let best = null;
  for (const pattern in map) {
    const i = pattern.indexOf('*');
    if (i === -1) continue;
    const pre = pattern.slice(0, i), post = pattern.slice(i + 1);
    if (key.startsWith(pre) && key !== pre && key.endsWith(post) && key.length >= pattern.length && (best === null || pre.length > best.indexOf('*'))) best = pattern;
  }
  if (best === null) return undefined;
  const i = best.indexOf('*');
  return resolveTarget(map[best], key.slice(i, key.length - (best.length - i - 1)), conditions);
};

const packageExportsResolve = (pkgDir, exports, subpath, conditions, base) => {
  const sugar = typeof exports === 'string' || Array.isArray(exports) || exports === null || typeof exports !== 'object' || !Object.keys(exports).some(x => x[0] === '.');
  const target = sugar ? (subpath === '.' ? resolveTarget(exports, null, conditions) : undefined) : resolveMap(exports, subpath, conditions);
  const from = base ? ` imported from ${base}` : '';
  if (target == null) throw codedError(Error, 'ERR_PACKAGE_PATH_NOT_EXPORTED', subpath === '.' ? `No "exports" main defined in ${pkgDir}/package.json${from}` : `Package subpath '${subpath}' is not defined by "exports" in ${pkgDir}/package.json${from}`);
  const invalidSegment = /(?:^|\/)(?:\.\.?|node_modules)(?:\/|$)/i;
  if (invalidSegment.test(subpath.slice(2))) throw codedError(TypeError, 'ERR_INVALID_MODULE_SPECIFIER', `Invalid module "${subpath}" request is not a valid match in pattern for the "exports" resolution of ${pkgDir}/package.json${from}`);
  if (!target.startsWith('./')) throw codedError(Error, 'ERR_INVALID_PACKAGE_TARGET', `Invalid "exports" target ${JSON.stringify(target)} defined for '${subpath}' in the package config ${pkgDir}/package.json${from}; targets must start with "./"`);
  if (invalidSegment.test(target.slice(2))) throw codedError(Error, 'ERR_INVALID_PACKAGE_TARGET', `Invalid "exports" target ${JSON.stringify(target)} defined for '${subpath}' in the package config ${pkgDir}/package.json${from}`);
  return resolvePath(pkgDir, target);
};

const resolveImports = (request, pkg, base, conditions) => {
  const target = request !== '#' && !request.startsWith('#/') ? resolveMap(pkg.imports, request, conditions) : undefined;
  if (target == null) throw codedError(TypeError, 'ERR_PACKAGE_IMPORT_NOT_DEFINED', `Package import specifier "${request}" is not defined in package ${pkg.path} imported from ${base}`);
  if (target.startsWith('./')) return resolvePath(dirname(pkg.path), target);
  return Module._resolveFilename(target, null, false, { paths: [ dirname(pkg.path) ] });
};

const userConditions = process.execArgv.flatMap((x, i) => x.startsWith('--conditions=') ? [ x.slice(13) ] : x === '-C' || x === '--conditions' ? [ process.execArgv[i + 1] ] : []);
const cjsConditions = [ 'require', 'node', 'module-sync', 'node-addons', ...userConditions ];
const esmConditions = [ 'import', 'node', 'module-sync', 'node-addons', ...userConditions ];

const tryFile = path => nativeStat(path) === 0 && nativeRealpath(path);
const tryExtensions = (path, exts) => {
  for (const ext of exts) {
    const filename = tryFile(path + ext);
    if (filename) return filename;
  }
  return false;
};

// a directory: its package.json "main", else its index
const tryPackage = (dir, exts) => {
  const main = readPackage(dir)?.main;
  if (typeof main === 'string' && main) {
    const filename = resolvePath(dir, main);
    const actual = tryFile(filename) || tryExtensions(filename, exts) || tryExtensions(resolvePath(filename, 'index'), exts);
    if (actual) return actual;
  }
  return tryExtensions(resolvePath(dir, 'index'), exts);
};

// "name/sub" inside a node_modules dir through the package's "exports"
const resolveNodeModulesExports = (nmPath, request) => {
  const m = /^((?:@[^/\\%]+\/)?[^./\\%][^/\\%]*)(\/.*)?$/.exec(request);
  if (!m) return false;
  const pkgDir = resolvePath(nmPath, m[1]);
  const pkg = readPackage(pkgDir);
  if (pkg?.exports == null) return false;
  return tryFile(packageExportsResolve(pkgDir, pkg.exports, '.' + (m[2] ?? ''), cjsConditions)) || notFound(request, []);
};

const notFound = (request, requireStack) => {
  let message = `Cannot find module '${request}'`;
  if (requireStack.length > 0) message += '\nRequire stack:\n- ' + requireStack.join('\n- ');
  throw Object.assign(codedError(Error, 'MODULE_NOT_FOUND', message), { requireStack });
};

export class Module {
  constructor(id = '', parent) {
    this.id = id;
    this.path = dirname(id);
    // own properties, not through setters a program may define on Object.prototype
    Object.defineProperty(this, 'exports', { value: {}, writable: true, enumerable: true, configurable: true });
    this.parent = parent;
    updateChildren(parent, this);
    this.filename = null;
    this.loaded = false;
    this.children = [];
  }

  load(filename) {
    this.filename = filename;
    this.paths = Module._nodeModulePaths(dirname(filename));
    Module._extensions[findExtension(filename)](this, filename);
    this.loaded = true;
  }

  require(id) {
    return Module._load(id, this, false);
  }

  static _cache = Object.create(null);
  static _extensions = Object.create(null);
  static _pathCache = Object.create(null);
  static globalPaths = (process.env.NODE_PATH ?? '').split(':').filter(Boolean);
  static builtinModules = builtinModules;
  static isBuiltin = isBuiltin;

  // skips dirs that are themselves node_modules
  static _nodeModulePaths(from) {
    const paths = [];
    for (let dir = resolvePath(from); dir !== '/'; dir = dirname(dir)) {
      if (basename(dir) !== 'node_modules') paths.push(dir + '/node_modules');
    }
    paths.push('/node_modules');
    return paths;
  }

  static _resolveLookupPaths(request, parent) {
    if (isBuiltin(request)) return null;
    if (request[0] !== '.' || (request.length > 1 && request[1] !== '.' && request[1] !== '/')) {
      const paths = parent?.paths?.length ? parent.paths.concat(Module.globalPaths) : Module.globalPaths;
      return paths.length > 0 ? paths : null;
    }
    if (!parent || !parent.id || !parent.filename) return [ '.' ];
    return [ dirname(parent.filename) ];
  }

  static _findPath(request, paths) {
    const absolute = isAbsolute(request);
    if (absolute) paths = [ '' ];
      else if (!paths || paths.length === 0) return false;

    const cacheKey = request + '\x00' + paths.join('\x00');
    const cached = Module._pathCache[cacheKey];
    if (cached) return cached;

    const trailingSlash = request.endsWith('/') || request === '.' || request === '..' || request.endsWith('/.') || request.endsWith('/..');
    const insidePath = !isRelative(request) || !normalize(request).startsWith('..');
    const exts = Object.keys(Module._extensions);
    for (const curPath of paths) {
      if (insidePath && curPath && nativeStat(curPath) < 1) continue;
      const exported = !absolute && resolveNodeModulesExports(curPath, request);
      if (exported) return exported;

      const basePath = resolvePath(curPath, request);
      const rc = nativeStat(basePath);
      let filename = false;
      if (!trailingSlash) filename = (rc === 0 && nativeRealpath(basePath)) || tryExtensions(basePath, exts);
      if (!filename && rc === 1) filename = tryPackage(basePath, exts);
      if (filename) return Module._pathCache[cacheKey] = filename;
    }
    return false;
  }

  static _resolveFilename(request, parent, isMain, options) {
    if (isBuiltin(request)) return request;

    let paths;
    if (options?.paths === undefined) paths = Module._resolveLookupPaths(request, parent);
      else if (isRelative(request)) paths = options.paths;
      else {
        const fake = new Module('', null);
        paths = [];
        for (const path of options.paths) {
          fake.paths = Module._nodeModulePaths(path);
          for (const x of Module._resolveLookupPaths(request, fake)) if (!paths.includes(x)) paths.push(x);
        }
      }

    const parentFile = parent?.filename ?? process.cwd() + '/';
    if (request[0] === '#') {
      const pkg = nearestPackage(dirname(parentFile));
      if (pkg?.imports != null) return resolveImports(request, pkg, parentFile, cjsConditions);
    }

    // a package can require itself by name through its "exports"
    const self = parent?.filename && nearestPackage(dirname(parent.filename));
    if (self?.exports != null && typeof self.name === 'string' && (request === self.name || request.startsWith(self.name + '/'))) {
      return packageExportsResolve(dirname(self.path), self.exports, '.' + request.slice(self.name.length), cjsConditions);
    }

    const filename = Module._findPath(request, paths, isMain);
    if (filename) return filename;

    const requireStack = [];
    for (let cursor = parent; cursor; cursor = cursor.parent) requireStack.push(cursor.filename || cursor.id);
    notFound(request, requireStack);
  }

  static _load(request, parent, isMain) {
    if (request.startsWith('node:')) {
      if (!isBuiltin(request)) throw codedError(Error, 'ERR_UNKNOWN_BUILTIN_MODULE', `No such built-in module: ${request}`);
      return loadBuiltin(request);
    }
    return loadFile(Module._resolveFilename(request, parent, isMain), parent, isMain);
  }

  static createRequire(filename) {
    const path = filename instanceof URL || filename.startsWith('file:') ? fileURLToPath(filename) : filename;
    const proxyPath = path.endsWith('/') ? join(path, 'noop.js') : path;
    const module = new Module(proxyPath);
    module.filename = proxyPath;
    module.paths = Module._nodeModulePaths(module.path);
    return makeRequire(module);
  }

  static registerHooks() {
    throw new Error('module.registerHooks is not supported: porffor resolves and links modules ahead of time');
  }

  // no compile cache or source maps at runtime
  static enableCompileCache() {
    return { status: 3, message: 'porffor compiles ahead of time' };
  }

  static flushCompileCache() {}

  static findSourceMap() {
    return undefined;
  }
}
Module.Module = Module;

Module._extensions['.js'] = (module, filename) => {
  const exports = __porffor_bundle(filename);
  if (exports === undefined) throw codedError(Error, 'ERR_PORFFOR_NOT_COMPILED', `porffor: cannot load ${filename} at runtime: it was not found when the program was compiled, and porffor cannot compile code at runtime`);
  if (exports === null) throw codedError(Error, 'ERR_REQUIRE_ASYNC_MODULE', `require() cannot be used on an ESM graph with top-level await. Use import() instead.\n  Requiring ${filename} `);
  module.exports = exports;
};
Module._extensions['.json'] = (module, filename) => {
  const content = nativeRead(filename);
  try {
    module.exports = JSON.parse(content.charCodeAt(0) === 0xfeff ? content.slice(1) : content);
  } catch (err) {
    err.message = filename + ': ' + err.message;
    throw err;
  }
};
Module._extensions['.node'] = (module, filename) => {
  throw codedError(Error, 'ERR_DLOPEN_FAILED', `porffor: cannot load native addon ${filename}, node-api addons are not supported`);
};

// node's cached load of a resolved filename (or builtin id): require() linked when compiling comes here directly
const loadFile = (filename, parent, isMain) => {
  const cached = Module._cache[filename];
  if (cached !== undefined) {
    updateChildren(parent, cached);
    return cached.exports;
  }
  if (isBuiltin(filename)) return loadBuiltin(filename);

  const module = new Module(filename, parent);
  if (isMain) {
    process.mainModule = module;
    module.id = '.';
  }
  Module._cache[filename] = module;
  let threw = true;
  try {
    module.load(filename);
    threw = false;
  } finally {
    if (threw) {
      delete Module._cache[filename];
      const i = parent?.children?.indexOf(module) ?? -1;
      if (i !== -1) parent.children.splice(i, 1);
    }
  }
  return module.exports;
};
export const requireLinked = (parent, filename) => filename.startsWith('node:') ? loadBuiltin(filename) : loadFile(filename, parent, false);

export const makeRequire = module => {
  const require = function require(path) {
    return module.require(path);
  };
  const resolve = (request, options) => Module._resolveFilename(request, module, false, options);
  resolve.paths = request => Module._resolveLookupPaths(request, module);
  require.resolve = resolve;
  Object.defineProperty(require, 'main', { value: process.mainModule, writable: true, enumerable: true, configurable: true });
  require.extensions = Module._extensions;
  require.cache = Module._cache;
  return require;
};

// bundled cjs modules get the module object Module._load made for them, or one of their own when linked statically
export const enterModule = (filename, parent) => {
  let module = Module._cache[filename];
  if (module === undefined) {
    // a parent not loaded yet stays unloaded: this module was reached from elsewhere first
    module = Module._cache[filename] = new Module(filename, parent == null ? parent : Module._cache[parent]);
    module.filename = filename;
    module.paths = Module._nodeModulePaths(dirname(filename));
  }
  return module;
};

export const setMainModule = filename => {
  const module = enterModule(filename, null);
  module.id = '.';
  process.mainModule = module;
};

// import.meta.resolve: esm resolution to a url, without checking the target exists
export const metaResolve = parentURL => (specifier, parent = parentURL) => {
  if (parent instanceof URL) parent = parent.href;
  if (isBuiltin(specifier)) return specifier.startsWith('node:') ? specifier : 'node:' + specifier;
  if (isRelative(specifier) || specifier[0] === '/' || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(specifier)) return new URL(specifier, parent).href;

  const parentPath = fileURLToPath(parent), parentDir = fileURLToPath(new URL('.', parent));
  if (specifier[0] === '#') {
    const pkg = nearestPackage(parentDir);
    if (pkg?.imports == null) throw codedError(TypeError, 'ERR_PACKAGE_IMPORT_NOT_DEFINED', `Package import specifier "${specifier}" is not defined imported from ${parentPath}`);
    return pathToFileURL(resolveImports(specifier, pkg, parentPath, esmConditions)).href;
  }

  const m = /^((?:@[^/\\%]+\/)?[^./\\%][^/\\%]*)(\/.*)?$/.exec(specifier);
  if (!m) throw codedError(TypeError, 'ERR_INVALID_MODULE_SPECIFIER', `Invalid module "${specifier}" is not a valid package name imported from ${parentPath}`);
  const self = nearestPackage(parentDir);
  if (self?.exports != null && self.name === m[1]) return pathToFileURL(packageExportsResolve(dirname(self.path), self.exports, '.' + (m[2] ?? ''), esmConditions, parentPath)).href;
  for (const nm of Module._nodeModulePaths(parentDir)) {
    const pkgDir = nm + '/' + m[1];
    if (nativeStat(pkgDir) !== 1) continue;
    const pkg = readPackage(pkgDir);
    if (pkg?.exports != null) return pathToFileURL(packageExportsResolve(pkgDir, pkg.exports, '.' + (m[2] ?? ''), esmConditions, parentPath)).href;
    return pathToFileURL(m[2] ? pkgDir + m[2] : resolvePath(pkgDir, pkg?.main ?? 'index.js')).href;
  }
  throw codedError(Error, 'ERR_MODULE_NOT_FOUND', `Cannot find package '${m[1]}' imported from ${parentPath}`);
};

// import() of a runtime specifier: the compiled module's file, or node:id for builtins
export const importResolve = (parentFile, specifier) => {
  const url = metaResolve('file://' + parentFile)(specifier);
  if (!url.startsWith('file:')) return url;
  const file = fileURLToPath(url);
  if (nativeStat(file) !== 0) throw codedError(Error, 'ERR_MODULE_NOT_FOUND', `Cannot find module '${file}' imported from ${parentFile}`);
  return nativeRealpath(file);
};

export const createRequire = Module.createRequire;
export default Module;
