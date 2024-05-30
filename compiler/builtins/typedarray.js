export default async () => {
  let out = '';

  const arrayCode = (await import('node:fs')).readFileSync(globalThis.precompileCompilerPath + '/builtins/array.ts', 'utf8');
  const typedArrayFuncs = [...arrayCode.matchAll(/\/\/ @porf-typed-array[\s\S]+?^};$/gm)].map(x => x[0]);

  const constr = name => out += `export const ${name} = function (arg: any): ${name} {
  if (!new.target) throw new TypeError("Constructor ${name} requires 'new'");

  const out: ${name} = Porffor.allocate();
  let len: i32 = 0;

  const type: i32 = Porffor.rawType(arg);
  if (Porffor.fastOr(
    type == Porffor.TYPES.array,
    type == Porffor.TYPES.string, type == Porffor.TYPES.bytestring,
    type == Porffor.TYPES.set
  )) {
    let i: i32 = 0;
    for (const x of arg) {
      out[i++] = x;
    }
    len = i;
  } else if (type == Porffor.TYPES.number) {
    len = arg;
  }

  out.length = len;
  return out;
};

export const __${name}_prototype_byteLength$get = (_this: ${name}) => {
  return _this.length * ${name}.BYTES_PER_ELEMENT;
};

export const __${name}_prototype_at = (_this: ${name}, index: number) => {
  const len: i32 = _this.length;
  index |= 0;
  if (index < 0) {
    index = len + index;
    if (index < 0) return undefined;
  }
  if (index >= len) return undefined;

  return _this[index];
};

export const __${name}_prototype_slice = (_this: ${name}, start: number, end: number) => {
  const len: i32 = _this.length;
  if (Porffor.rawType(end) == Porffor.TYPES.undefined) end = len;

  start |= 0;
  end |= 0;

  if (start < 0) {
    start = len + start;
    if (start < 0) start = 0;
  }
  if (start > len) start = len;
  if (end < 0) {
    end = len + end;
    if (end < 0) end = 0;
  }
  if (end > len) end = len;

  let out: ${name} = Porffor.allocate();

  if (start > end) return out;

  let i: i32 = start;
  let j: i32 = 0;
  while (i < end) {
    out[j++] = _this[i++];
  }

  out.length = end - start;
  return out;
};

${typedArrayFuncs.reduce((acc, x) => acc + x.replace('// @porf-typed-array\n', '').replaceAll('Array', name).replaceAll('any[]', name) + '\n\n', '')}
`;

  constr('Uint8Array');
  constr('Int8Array');
  constr('Uint8ClampedArray');
  constr('Uint16Array');
  constr('Int16Array');
  constr('Uint32Array');
  constr('Int32Array');
  constr('Float32Array');
  constr('Float64Array');

  return out;
};