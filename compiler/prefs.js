const onByDefault = [ 'bytestring' ];

const cache = {};
const obj = new Proxy({}, {
  get(_, p) {
    // intentionally misses with undefined values cached
    if (cache[p]) return cache[p];

    return cache[p] = (() => {
      // fooBar -> foo-bar
      const name = p[0] === '_' ? p : p.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      if (process.argv.includes('-' + name)) return true;
      if (process.argv.includes('-no-' + name)) return false;

      const valArg = process.argv.find(x => x.startsWith(`-${name}=`));
      if (valArg) return valArg.slice(name.length + 2);

      if (onByDefault.includes(p)) return true;
      return undefined;
    })();
  }
});

obj.uncache = () => cache = {};

export default obj;