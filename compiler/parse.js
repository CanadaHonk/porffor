import './prefs.js';
import parse from './parser/index.js';
import link from './modules.js';

// whether node references any identifier in names (for on-demand polyfills)
const usesName = (node, names) => {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(x => usesName(x, names));

  if (node.type === 'Identifier') return names.has(node.name);
  if (node.type === 'Literal') return false;
  if (node.type === 'TemplateLiteral') return usesName(node.expressions, names);
  if (node.type === 'TemplateElement') return false;

  if (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') {
    return (node.computed && usesName(node.key, names)) || usesName(node.value, names);
  }

  if (node.type === 'VariableDeclarator') return usesName(node.init, names);
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return usesName(node.params, names) || usesName(node.body, names);
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return usesName(node.superClass, names) || usesName(node.body, names);

  for (const key in node) {
    if (key[0] === '_' || key === 'start' || key === 'end') continue;
    if (usesName(node[key], names)) return true;
  }

  return false;
};

const TEMPORAL_NAMES = new Set([ 'Temporal' ]);
// Intl, and the locale-sensitive methods ECMA-402 redefines on other builtins
const INTL_NAMES = new Set([ 'Intl', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'localeCompare', 'toLocaleUpperCase', 'toLocaleLowerCase' ]);

// entry: link options for a program entry ({ file?, scripts? }), null for a lone source
export default (input, entry = null) => {
  const types = Prefs.parseTypes || Prefs.t || globalThis.file?.endsWith('.ts');
  globalThis.typedInput = types && Prefs.optTypes;

  const file = entry?.file ?? globalThis.file;
  // scripts only need linking for the modules their import() calls pull in
  const linked = entry && !globalThis.precompile && (Prefs.module || /\bimport\s*\(/.test(input));
  const ast = linked ? link(input, file[0] === '/' ? file : process.cwd() + '/' + file, { ts: types, scripts: entry.scripts, script: !Prefs.module }) : parse(input, { module: !!Prefs.module, ts: types });
  if (ast._ts) globalThis.typedInput = Prefs.optTypes;
  if (usesName(ast, TEMPORAL_NAMES)) ast._usesTemporal = true;
  if (!globalThis.precompile && usesName(ast, INTL_NAMES)) ast._usesIntl = true;
  return ast;
};
