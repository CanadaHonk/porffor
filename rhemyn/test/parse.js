import util from 'node:util';

import parse from '../parse.js';

const tests = {
  'a': {},
  'a(b)': {},
  'a(b(c))': {},
  'ab': {},
  '[ab]': {},
  '[a-z]': {},
  'a*': {},
  'a+': {},
  'a?': {},
  'a(b)+': {},
  '[^a]': {},
  '[a^]': {},
  '[^ab]': {},
  '.': {},

  // not range
  '[-]': {},
  '[0-]': {},
  '[-0]': {},
  '[\\s-\\S]': {},
  '[\\s-.]': {},

  '[\\S]': {},

  '\\c': {},
  '\\c0': {},
  '\\cJ': {},

  '\\x': {},
  '\\x0': {},
  '\\x0g': {},
  '\\x0a': {},

  '\\u': {},
  '\\u0': {},
  '\\u000': {},
  '\\u000g': {},
  '\\u000a': {},

  // email regexes
  '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$': {},

  // input type=email from HTML spec
  // https://html.spec.whatwg.org/multipage/input.html#email-state-(type=email)
  // simpler form
  '^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*$': {},
  // full/complex form
  '^[a-zA-Z0-9.!#$%&\'*+\\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$': {}
};

for (const str in tests) {
  console.log(str, util.inspect(parse(str), false, null, true));
}