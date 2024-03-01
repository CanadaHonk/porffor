import { log } from "./log.js";
import Prefs from './prefs.js';

// import { parse } from 'acorn';

// deno compat
if (typeof process === 'undefined' && typeof Deno !== 'undefined') {
  const textEncoder = new TextEncoder();
  globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };
}

// should we try to support types (while parsing)
const types = Prefs.parseTypes;
globalThis.typedInput = types && Prefs.optTypes;

// todo: review which to use by default
// supported parsers:
// - acorn
// - meriyah
// - hermes-parser
// - @babel/parser

let parser, parse;
const loadParser = async (fallbackParser = 'acorn', forceParser) => {
  parser = forceParser ?? process.argv.find(x => x.startsWith('-parser='))?.split('=')?.[1] ?? fallbackParser;
  0, { parse } = (await import((globalThis.document ? 'https://esm.sh/' : '') + parser));
};
globalThis._porf_loadParser = loadParser;
await loadParser(types ? '@babel/parser' : undefined);

if (types && !['@babel/parser', 'hermes-parser'].includes(parser)) log.warning('parser', `passed -types with a parser (${parser}) which does not support`);

export default (input, flags) => {
  const ast = parse(input, {
    // acorn
    ecmaVersion: 'latest',

    // meriyah
    next: true,
    module: flags.includes('module'),
    webcompat: true,

    // babel
    plugins: types ? ['estree', 'typescript'] : ['estree'],

    // multiple
    sourceType: flags.includes('module') ? 'module' : 'script',
    ranges: false,
    tokens: false,
    comments: false,
  });

  if (ast.type === 'File') return ast.program;

  return ast;
};