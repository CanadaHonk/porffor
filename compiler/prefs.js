const onByDefault = [ 'indirectCalls', 'optUnused', 'optTypes', 'ctHash', 'closures', 'lazyObjects', 'ic' ];

const nameToKey = x => (x === 'secure' ? 'safe' : x).replace(/[a-z]\-[a-z]/g, y => `${y[0]}${y[2].toUpperCase()}`);

const getPrefs = () => {
  const prefs = globalThis.Prefs = {};
  for (const x of onByDefault) prefs[x] = true;

  for (const x of process.argv) {
    if (x[0] !== '-') continue;
    // short numeric flags: -O3, -j8
    const num = /^-([A-Za-z])(\d+)$/.exec(x);
    if (num) { prefs[num[1]] = +num[2]; continue; }
    if (/^-O\w*$/.test(x)) { prefs.O = x.slice(2); continue; }

    let flag = x.slice(x[1] === '-' ? 2 : 1);
    if (flag.startsWith('no-')) {
      prefs[nameToKey(flag.slice(3))] = false;
    } else {
      // --define:a.b=x, --alias:pkg=path: the part after the colon is a key, and values can hold =
      const eq = flag.indexOf('=');
      const name = eq === -1 ? flag : flag.slice(0, eq);
      const colon = name.indexOf(':');
      prefs[colon === -1 ? nameToKey(name) : nameToKey(name.slice(0, colon)) + name.slice(colon)] = eq === -1 ? true : flag.slice(eq + 1);
    }
  }
};
getPrefs();

export const uncache = () => getPrefs();
globalThis.argvChanged = uncache;
