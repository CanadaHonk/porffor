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
// - oxc-parser

globalThis.parser = '';
let parse;
const loadParser = async (fallbackParser = 'acorn', forceParser) => {
  parser = forceParser ?? Prefs.parser ?? fallbackParser;
  const mod = (await import((globalThis.document ? 'https://esm.sh/' : '') + parser));
  if (mod.parseSync) parse = mod.parseSync;
    else parse = mod.parse;
};
globalThis._porf_loadParser = loadParser;
await loadParser(types ? '@babel/parser' : undefined);

if (types && !['@babel/parser', 'hermes-parser', 'oxc-parser'].includes(parser)) log.warning('parse', `passed -parse-types with a parser (${parser}) which does not support`);

export default input => {
  try {
    const options = {
      // acorn
      ecmaVersion: 'latest',

      // meriyah
      next: true,
      module: Prefs.module,
      webcompat: true,
      raw: true,

      // babel
      plugins: types ? ['estree', 'typescript'] : ['estree'],

      // multiple
      sourceType: Prefs.module ? 'module' : 'script',
      locations: false,
      ranges: false,
      tokens: false,
      comments: false,
      preserveParens: false,

      // oxc
      lang: types ? 'ts' : 'js',
      showSemanticErrors: true
    };

    let ast = parser === 'oxc-parser' ? parse('js', input, options) : parse(input, options);
    if (ast.program) ast = ast.program;

    return ast;
  } catch (e) {
    // normalize error class thrown by 3rd party parsers
    throw new SyntaxError(e.message, { cause: e });
  }
};