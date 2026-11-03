import './prefs.js';
import parse from './parser/index.js';
import link, { usedNames } from './modules.js';

const dynamicIntl = node => {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(dynamicIntl);
  if (node.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.object.name === 'Intl') return false;
  if (node.type === 'Identifier') return node.name === 'Intl';

  for (const key in node) {
    if (key[0] === '_' || key === 'start' || key === 'end') continue;
    if (dynamicIntl(node[key])) return true;
  }

  return false;
};

const INTL_SERVICES = [ 'NumberFormat', 'PluralRules', 'Collator', 'DateTimeFormat', 'RelativeTimeFormat', 'ListFormat', 'DisplayNames', 'Segmenter', 'DurationFormat' ];
const INTL_HOOKS = {
  toLocaleString: [ 'number', 'bigint', 'date', 'temporal', 'array' ],
  toLocaleDateString: [ 'dateDate' ],
  toLocaleTimeString: [ 'dateTime' ],
  localeCompare: [ 'localeCompare' ],
  toLocaleUpperCase: [ 'upper' ],
  toLocaleLowerCase: [ 'lower' ]
};
const POLYFILL_NAMES = new Set([ 'Temporal', 'Intl', ...INTL_SERVICES.map(x => 'Intl.' + x), ...Object.keys(INTL_HOOKS).flatMap(x => [ x, '.' + x ]) ]);

// x!, x satisfies T and f<T> are just their expression, as are casts assigned to
const TS_TRANSPARENT = new Set([ 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSInstantiationExpression' ]);
const TS_CAST = new Set([ 'TSAsExpression', 'TSTypeAssertion' ]);
const stripTsWrappers = node => {
  if (node == null || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = stripTsWrappers(node[i]);
    return node;
  }
  if (TS_TRANSPARENT.has(node.type)) return stripTsWrappers(node.expression);
  // f(this: T) declares this's type, it is not a parameter
  if (node.params?.[0]?.type === 'Identifier' && node.params[0].name === 'this') node.params.shift();
  if (node.type === 'AssignmentExpression') while (TS_CAST.has(node.left.type)) node.left = node.left.expression;
  if (node.type === 'UpdateExpression') while (TS_CAST.has(node.argument.type)) node.argument = node.argument.expression;
  for (const key in node) {
    if (key[0] !== '_' && key !== 'start' && key !== 'end') node[key] = stripTsWrappers(node[key]);
  }
  return node;
};

// entry: link options for a program entry ({ file?, scripts? }), null for a lone source
const parseProgram = (input, entry = null, evalContext = null) => {
  const types = Prefs.parseTypes || Prefs.t || globalThis.file?.endsWith('.ts');
  globalThis.typedInput = types && Prefs.optTypes;

  const file = entry?.file ?? globalThis.file;
  // cjs links as modules with a cjs entry
  const cjs = !!entry && !globalThis.precompile && !Prefs.module && (entry.cjs || /\.c[jt]s$/.test(file) || /\brequire\s*(?:[(.;,)\]}]|$)|\bmodule\.exports\b|\bexports\.[\w$]|\b__(?:file|dir)name\b/m.test(input));
  if (cjs) Prefs.module = true;
  // scripts only for what import() pulls in and runtime globals the linker provides (process, Buffer)
  const globals = entry?.runtimeGlobals;
  const usesGlobals = !!globals && new RegExp(`\\b(?:${Object.keys(globals).join('|').replaceAll('.', '\\.')})\\b`).test(input);
  const linked = entry && !globalThis.precompile && (Prefs.module || usesGlobals || /\bimport\s*\(/.test(input));
  let ast;
  try {
    ast = linked ? link(input, file[0] === '/' ? file : process.cwd() + '/' + file, { ts: types, scripts: entry.scripts, script: !Prefs.module, cjs, runtimeImports: entry.runtimeImports, runtimeGlobals: globals }) : parse(input, { module: !!Prefs.module, ts: types, eval: evalContext });
  } catch (e) {
    // like node, a script file with a top-level return is cjs ([eval] and [stdin] are not)
    if (!entry?.file || entry.file.endsWith(']') || Prefs.module || !e.message.startsWith("'return' outside of function")) throw e;
    return parseProgram(input, { ...entry, cjs: true }, evalContext);
  }
  if (ast._ts) globalThis.typedInput = Prefs.optTypes;
  if (!globalThis.precompile && (ast._ts || types)) stripTsWrappers(ast);
  const used = usedNames(ast, POLYFILL_NAMES);
  if (used.has('Temporal')) ast._usesTemporal = true;
  const usedHooks = Object.keys(INTL_HOOKS).filter(x => used.has(x) || used.has('.' + x));
  if (!globalThis.precompile && (used.has('Intl') || usedHooks.length > 0)) {
    ast._usesIntl = dynamicIntl(ast) ? true : {
      services: new Set(INTL_SERVICES.filter(x => used.has('Intl.' + x))),
      hooks: new Set(usedHooks.flatMap(x => INTL_HOOKS[x]))
    };
  }
  return ast;
};
export default parseProgram;
