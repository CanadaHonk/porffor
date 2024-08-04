import { log } from './log.js';
import {} from './prefs.js';

const file = process.argv.slice(2).find(x => x[0] !== '-' && !['run', 'wasm', 'native', 'c', 'profile', 'debug', 'debug-wasm'].includes(x));

// should we try to support types (while parsing)
const types = Prefs.parseTypes || Prefs.t || file?.endsWith('.ts');
globalThis.typedInput = types && Prefs.optTypes;

// todo: review which to use by default
// supported parsers:
// - acorn
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