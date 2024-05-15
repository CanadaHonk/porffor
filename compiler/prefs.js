const onByDefault = [ 'bytestring', 'aotPointerOpt', 'treeshakeWasmImports', 'alwaysMemory', 'indirectCalls' ];

let cache = {};
const obj = new Proxy({}, {
  get(_, p) {
    // intentionally misses with undefined values cached
    if (cache[p]) return cache[p];

    return cache[p] = (() => {
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
  }
});

obj.uncache = () => cache = {};

export default obj;