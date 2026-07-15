import './prefs.js';
import parse from './parser/index.js';

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
    if (key[0] === '_' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    if (usesTemporal(node[key])) return true;
  }

  return false;
};

const normalizeBigIntLiterals = (node, input) => {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) normalizeBigIntLiterals(x, input);
    return;
  }

  if (node.type === 'Literal' && node.bigint != null && typeof node.start === 'number' && typeof node.end === 'number') {
    node.bigint = input.slice(node.start, node.end - 1).replace(/_/g, '');
  }

  for (const key in node) {
    if (key[0] === '_' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    normalizeBigIntLiterals(node[key], input);
  }
};

export default input => {
  const types = Prefs.parseTypes || Prefs.t || globalThis.file?.endsWith('.ts');
  globalThis.typedInput = types && Prefs.optTypes;

  const ast = parse(input, { module: !!Prefs.module, ts: types });
  normalizeBigIntLiterals(ast, input);
  if (usesTemporal(ast)) ast._usesTemporal = true;
  return ast;
};
