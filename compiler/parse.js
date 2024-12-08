import { log } from './log.js';
import './prefs.js';

const file = globalThis.file;

const types = Prefs.parseTypes || Prefs.t || file?.endsWith('.ts');
globalThis.typedInput = types && Prefs.optTypes;

// supported parsers:
// - acorn (default)
// - meriyah
// - hermes-parser
// - @babel/parser

globalThis.parser = '';
let parse;
const loadParser = async (fallbackParser = 'acorn', forceParser) => {
  parser = forceParser ?? Prefs.parser ?? fallbackParser;
  0, { parse } = (await import((globalThis.document || globalThis.Deno ? 'https://esm.sh/' : '') + parser));
};
globalThis._porf_loadParser = loadParser;
await loadParser(types ? '@babel/parser' : undefined);

if (types && !['@babel/parser', 'hermes-parser'].includes(parser)) log.warning('parse', `passed -parse-types with a parser (${parser}) which does not support`);

export default input => {
  try {
    const ast = parse(input, {
      // acorn
      ecmaVersion: 'latest',

      // meriyah
      next: true,
      module: Prefs.module,
      webcompat: true,

      // babel
      plugins: types ? ['estree', 'typescript'] : ['estree'],

      // multiple
      sourceType: Prefs.module ? 'module' : 'script',
      locations: false,
      ranges: false,
      tokens: false,
      comments: false,
    });

    if (ast.type === 'File') return ast.program;

    return ast;
  } catch (e) {
    // normalize error class thrown by 3rd party parsers
    throw new SyntaxError(e.message, { cause: e });
  }
};