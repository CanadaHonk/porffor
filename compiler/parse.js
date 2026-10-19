import './prefs.js';
import parse from './parser/index.js';
import link from './modules.js';

const usedNames = (node, names, out = new Set()) => {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const x of node) usedNames(x, names, out);
    return out;
  }

  if (node.type === 'Identifier') {
    if (names.has(node.name)) out.add(node.name);
    return out;
  }
  if (node.type === 'Literal' || node.type === 'TemplateElement') return out;
  if (node.type === 'TemplateLiteral') return usedNames(node.expressions, names, out);

  if (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') {
    if (node.computed) usedNames(node.key, names, out);
    return usedNames(node.value, names, out);
  }

  if (node.type === 'VariableDeclarator') return usedNames(node.init, names, out);
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return usedNames(node.body, names, usedNames(node.params, names, out));
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return usedNames(node.body, names, usedNames(node.superClass, names, out));

  for (const key in node) {
    if (key[0] === '_' || key === 'start' || key === 'end') continue;
    usedNames(node[key], names, out);
  }

  return out;
};

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
const POLYFILL_NAMES = new Set([ 'Temporal', 'Intl', ...INTL_SERVICES, ...Object.keys(INTL_HOOKS) ]);

// entry: link options for a program entry ({ file?, scripts? }), null for a lone source
export default (input, entry = null) => {
  const types = Prefs.parseTypes || Prefs.t || globalThis.file?.endsWith('.ts');
  globalThis.typedInput = types && Prefs.optTypes;

  const file = entry?.file ?? globalThis.file;
  // scripts only need linking for the modules their import() calls pull in
  const linked = entry && !globalThis.precompile && (Prefs.module || /\bimport\s*\(/.test(input));
  const ast = linked ? link(input, file[0] === '/' ? file : process.cwd() + '/' + file, { ts: types, scripts: entry.scripts, script: !Prefs.module }) : parse(input, { module: !!Prefs.module, ts: types });
  if (ast._ts) globalThis.typedInput = Prefs.optTypes;
  const used = usedNames(ast, POLYFILL_NAMES);
  if (used.has('Temporal')) ast._usesTemporal = true;
  if (!globalThis.precompile && (used.has('Intl') || Object.keys(INTL_HOOKS).some(x => used.has(x)))) {
    ast._usesIntl = dynamicIntl(ast) ? true : {
      services: new Set(INTL_SERVICES.filter(x => used.has(x))),
      hooks: new Set(Object.keys(INTL_HOOKS).flatMap(x => used.has(x) ? INTL_HOOKS[x] : []))
    };
  }
  return ast;
};
