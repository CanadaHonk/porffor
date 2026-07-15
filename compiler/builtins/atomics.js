export default () => {
  let out = `
export const __Atomics_isLockFree = (x: number): boolean => {
  switch (x) {
    case 1:
    case 2:
    case 4:
    case 8:
      return true;
  }

  return false;
};`;

  const stub = (name, args, retType) => {
    out += `
export const __Atomics_${name} = (${args}): ${retType} => {
  throw new TypeError('Atomics.${name} is not implemented');
};
`;
  };

  stub('load', 'ta: any, index: any', 'any');
  stub('store', 'ta: any, index: any, value: any', 'any');

  for (const x of ['add', 'sub', 'and', 'or', 'xor']) {
    stub(x, 'ta: any, index: any, value: any', 'any');
  }

  stub('exchange', 'ta: any, index: any, value: any', 'any');
  stub('compareExchange', 'ta: any, index: any, expected: any, replacement: any', 'any');
  stub('wait', 'ta: any, index: any, value: any, timeout: any = Infinity', 'bytestring');
  stub('notify', 'ta: any, index: any, count: any = Infinity', 'f64');

  return out;
};
