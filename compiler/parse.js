import './prefs.js';
import parse from './parser/index.js';
import link from './modules.js';

const usesTemporal = node => {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(usesTemporal);

  if (node.type === 'Identifier') return node.name === 'Temporal';
  if (node.type === 'Literal') return false;
  if (node.type === 'TemplateLiteral') return usesTemporal(node.expressions);
  if (node.type === 'TemplateElement') return false;

  if (node.type === 'Property' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') {
    return (node.computed && usesTemporal(node.key)) || usesTemporal(node.value);
  }

  if (node.type === 'VariableDeclarator') return usesTemporal(node.init);
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return usesTemporal(node.params) || usesTemporal(node.body);
  if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return usesTemporal(node.superClass) || usesTemporal(node.body);

  for (const key in node) {
    if (key[0] === '_' || key === 'start' || key === 'end') continue;
    if (usesTemporal(node[key])) return true;
  }

  return false;
};

// entry: link options for a program entry ({ file?, scripts? }), null for a lone source
export default (input, entry = null) => {
  const types = Prefs.parseTypes || Prefs.t || globalThis.file?.endsWith('.ts');
  globalThis.typedInput = types && Prefs.optTypes;

  const file = entry?.file ?? globalThis.file;
  // scripts only need linking for the modules their import() calls pull in
  const linked = entry && !globalThis.precompile && (Prefs.module || /\bimport\s*\(/.test(input));
  const ast = linked ? link(input, file[0] === '/' ? file : process.cwd() + '/' + file, { ts: types, scripts: entry.scripts, script: !Prefs.module }) : parse(input, { module: !!Prefs.module, ts: types });
  if (ast._ts) globalThis.typedInput = Prefs.optTypes;
  if (usesTemporal(ast)) ast._usesTemporal = true;
  return ast;
};
