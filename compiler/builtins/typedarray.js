export default () => {
  let out = '';

  const constr = name => out += `export const ${name} = () => {
  throw new TypeError("Constructor ${name} requires 'new'");
};

export const ${name}$constructor = (arg: any): ${name} => {
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