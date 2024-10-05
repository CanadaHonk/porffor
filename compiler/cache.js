// simple generic node-like-only compiler cache internal api
import './prefs.js';
import fs from 'node:fs';

// import crypto from 'node:crypto';
// const hash = x => crypto.createHash('sha1').update(x).digest('hex');

export default name => {
  const cacheDir =
    (process.env.XDG_CACHE_HOME || (process.env.HOME + '/.cache')) +
    '/porffor/cache/' + name;

  fs.mkdirSync(cacheDir, { recursive: true });

  const read = key => {
    try {
      return JSON.parse(fs.readFileSync(cacheDir + `/${key}.json`));
    } catch {
      return null;
    }
  };
  const write = (key, value) => fs.writeFileSync(cacheDir + `/${key}.json`, JSON.stringify(value));

  const memory = new Map();
  const keys = new Map();
  return {
    get(key) {
      if (key == null) return undefined;

      if (memory.has(key)) return memory.get(key);

      const value = read(key);
      memory.set(key, value);
      return value;
    },

    set(key, value) {
      if (key == null) return;

      memory.set(key, value);
      write(key, value);
    }
  };
};