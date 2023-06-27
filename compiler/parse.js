import { parse } from 'acorn';

export default (input, flags) => {
  return parse(input, {
    ecmaVersion: 'latest',
    sourceType: 'module' // flags.includes('module') ? 'module' : 'script'
  });
};