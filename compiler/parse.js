const { parse } = (await import(globalThis.document ? 'https://esm.sh/acorn' : 'acorn'));

export default (input, flags) => {
  return parse(input, {
    ecmaVersion: 'latest',
    sourceType: 'module' // flags.includes('module') ? 'module' : 'script'
  });
};