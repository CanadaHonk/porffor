export const enumify = (...args) => {
  const obj = {};

  for (let i = 0; i < args.length; i++) {
    obj[i] = args[i];
    obj[args[i]] = i;
  }

  return obj;
};

// a procedural enum ;)
export const procEnum = () => {
  let n = 0;
  return new Proxy({}, {
    get(target, p) {
      return target[p] ?? (target[p] = n++);
    }
  });
};