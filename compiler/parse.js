import { log } from './log.js';
import {} from './prefs.js';

// should we try to support types (while parsing)
const types = Options.parseTypes || Options.file?.endsWith('.ts');
globalThis.typedInput = types && Options.optTypes;

// todo: review which to use by default
// supported parsers:
// - acorn
// - meriyah
// - hermes-parser
// - @babel/parser

globalThis.parser = '';
let parse;
const loadParser = async (fallbackParser = 'acorn', forceParser) => {
  parser = forceParser ?? Options.parser ?? fallbackParser;
  0, { parse } = (await import((globalThis.document || globalThis.Deno ? 'https://esm.sh/' : '') + parser));
};
globalThis._porf_loadParser = loadParser;
await loadParser(types ? '@babel/parser' : undefined);

if (types && !['@babel/parser', 'hermes-parser'].includes(parser)) log.warning('parse', `passed -parse-types with a parser (${parser}) which does not support`);

export default (input, flags) => {
  try {
    const ast = parse(input, {
      // acorn
      ecmaVersion: 'latest',

      // meriyah
      next: true,
      module: flags.includes('module'),
      webcompat: true,

      // babel
      plugins: types || flags.includes('typed') ? ['estree', 'typescript'] : ['estree'],

      // multiple
      sourceType: flags.includes('module') ? 'module' : 'script',
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