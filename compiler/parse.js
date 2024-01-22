import { log } from "./log.js";

// deno compat
if (typeof process === 'undefined' && typeof Deno !== 'undefined') {
  const textEncoder = new TextEncoder();
  globalThis.process = { argv: ['', '', ...Deno.args], stdout: { write: str => Deno.writeAllSync(Deno.stdout, textEncoder.encode(str)) } };
}

// import { parse } from 'acorn';

// todo: review which to use by default
const parser = process.argv.find(x => x.startsWith('-parser='))?.split('=')?.[1] ?? 'acorn';
const { parse } = (await import((globalThis.document ? 'https://esm.sh/' : '') + parser));

// supported parsers:
// - acorn
// - meriyah
// - hermes-parser
// - @babel/parser

// should we try to support types (while parsing)
const types = process.argv.includes('-types');

if (types && !['@babel/parser', 'hermes-parser'].includes(parser)) log.warning('parser', `passed -types with a parser (${parser}) which does not support`);

export default (input, flags) => {
  return parse(input, {
    ecmaVersion: 'latest',
    sourceType: flags.includes('module') ? 'module' : 'script'
  });
};