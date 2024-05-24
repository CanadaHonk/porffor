const onByDefault = [ 'bytestring', 'treeshakeWasmImports', 'alwaysMemory', 'indirectCalls', 'optUnused', 'data', 'rmUnusedTypes' ];

let cache = {};
const obj = new Proxy({}, {
  get(_, p) {
    if (cache[p] != null) return cache[p];

    const ret = (() => {
      // fooBar -> foo-bar
      const name = p[0] === '_' ? p : p.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      const prefix = name.length === 1 ? '-' : '--';
      if (process.argv.includes(prefix + name)) return true;
      if (process.argv.includes(prefix + 'no-' + name)) return false;

      const valArg = process.argv.find(x => x.startsWith(`${prefix}${name}=`));
      if (valArg) return valArg.slice(name.length + 1 + prefix.length);

      if (onByDefault.includes(p)) return true;
      return undefined;
    })();

    // do not cache in web demo as args are changed live
    if (!globalThis.document) cache[p] = ret;
    return ret;
  },

  set(_, p, v) {
    cache[p] = v;
    return true;
  }
});

export const uncache = () => cache = {};

export default obj;