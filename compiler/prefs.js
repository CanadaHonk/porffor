const onByDefault = [ 'treeshakeWasmImports', 'alwaysMemory', 'indirectCalls', 'optUnused', 'data', 'passiveData', 'rmUnusedTypes' ];

const nameToKey = x => x.replace(/[a-z]\-[a-z]/g, y => `${y[0]}${y[2].toUpperCase()}`);

let prefs = {};
const getPrefs = () => {
  prefs = {};
  for (const x of onByDefault) prefs[x] = true;

  for (const x of process.argv) {
    if (x[0] !== '-') continue;

    let flag = x.slice(x[1] === '-' ? 2 : 1);
    if (flag.startsWith('no-')) {
      prefs[nameToKey(flag.slice(3))] = false;
    } else {
      const [ name, value ] = flag.split('=');
      prefs[nameToKey(name)] = value ?? true;
    }
  }

  globalThis.Prefs = prefs;
};
getPrefs();

// export default prefs;

export const uncache = () => getPrefs();
globalThis.argvChanged = uncache;