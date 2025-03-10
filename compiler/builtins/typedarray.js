export default async () => {
  let out = '';

  const arrayCode = (await import('node:fs')).readFileSync(globalThis.precompileCompilerPath + '/builtins/array.ts', 'utf8');
  const typedArrayFuncs = [...arrayCode.matchAll(/\/\/ @porf-typed-array[\s\S]+?^};$/gm)].map(x => x[0]);

  // TypedArrays are stored like this in memory:
  // length (i32)
  // bufferPtr (i32) - buffer + byteOffset
  // byteOffset (i32) - only used for getter

  const constr = name => out += `export const ${name} = function (arg: any, byteOffset: any, length: any): ${name} {
  if (!new.target) throw new TypeError("Constructor ${name} requires 'new'");

  const out: ${name} = Porffor.allocateBytes(12);
  const outPtr: i32 = Porffor.wasm\`local.get \${out}\`;

  let len: i32 = 0;
  let bufferPtr: i32;

  if (Porffor.fastOr(
    Porffor.type(arg) == Porffor.TYPES.arraybuffer,
    Porffor.type(arg) == Porffor.TYPES.sharedarraybuffer
  )) {
    bufferPtr = Porffor.wasm\`local.get \${arg}\`;

    if (arg.detached) throw new TypeError('Constructed ${name} with a detached ArrayBuffer');

    let offset: i32 = 0;
    if (Porffor.type(byteOffset) != Porffor.TYPES.undefined) offset = Math.trunc(byteOffset);
    if (offset < 0) throw new RangeError('Invalid DataView byte offset (negative)');

    Porffor.wasm.i32.store(outPtr, offset, 0, 8);
    Porffor.wasm.i32.store(outPtr, bufferPtr + offset, 0, 4);

    if (Porffor.type(length) == Porffor.TYPES.undefined) {
      const bufferLen: i32 = Porffor.wasm.i32.load(bufferPtr, 0, 0);
      len = (bufferLen - byteOffset) / ${name}.BYTES_PER_ELEMENT;

      if (!Number.isInteger(len)) throw new RangeError('Byte length of ${name} should be divisible by BYTES_PER_ELEMENT');
    } else len = Math.trunc(length);
  } else {
    bufferPtr = Porffor.allocate();
    Porffor.wasm.i32.store(outPtr, bufferPtr, 0, 4);

    if (Porffor.fastOr(
      Porffor.type(arg) == Porffor.TYPES.array,
      Porffor.type(arg) == Porffor.TYPES.string, Porffor.type(arg) == Porffor.TYPES.bytestring,
      Porffor.type(arg) == Porffor.TYPES.set,
      Porffor.fastAnd(Porffor.type(arg) >= Porffor.TYPES.uint8array, Porffor.type(arg) <= Porffor.TYPES.float64array)
    )) {
      let i: i32 = 0;
      for (const x of arg) {
        out[i++] = x;
      }
      len = i;
    } else if (Porffor.type(arg) == Porffor.TYPES.number) {
      len = Math.trunc(arg);
    }

    Porffor.wasm.i32.store(bufferPtr, len * ${name}.BYTES_PER_ELEMENT, 0, 0);
  }

  if (len < 0) throw new RangeError('Invalid TypedArray length (negative)');
  if (len > 4294967295) throw new RangeError('Invalid ArrayBuffer length (over 32 bit address space)');

  Porffor.wasm.i32.store(outPtr, len, 0, 0);
  return out;
};

export const __${name}_of = (...items: any[]): ${name} => new ${name}(items);

export const __${name}_from = (arg: any, mapFn: any): ${name} => {
  const arr: any[] = Porffor.allocate();
  let len: i32 = 0;

  if (Porffor.fastOr(
    Porffor.type(arg) == Porffor.TYPES.array,
    Porffor.type(arg) == Porffor.TYPES.string, Porffor.type(arg) == Porffor.TYPES.bytestring,
    Porffor.type(arg) == Porffor.TYPES.set,
    Porffor.fastAnd(Porffor.type(arg) >= Porffor.TYPES.uint8array, Porffor.type(arg) <= Porffor.TYPES.float64array)
  )) {
    let i: i32 = 0;
    if (Porffor.type(mapFn) != Porffor.TYPES.undefined) {
      if (Porffor.type(mapFn) != Porffor.TYPES.function) throw new TypeError('Called Array.from with a non-function mapFn');

      for (const x of arg) {
        arr[i] = mapFn(x, i);
        i++;
      }
    } else {
      for (const x of arg) {
        arr[i++] = x;
      }
    }
    len = i;
  }

  arr.length = len;

  return new ${name}(arr);
};

export const __${name}_prototype_buffer$get = (_this: ${name}) => {
  const out: ArrayBuffer = Porffor.wasm.i32.load(_this, 0, 4) - Porffor.wasm.i32.load(_this, 0, 8);
  return out;
};

export const __${name}_prototype_byteLength$get = (_this: ${name}) => {
  return Porffor.wasm.i32.load(_this, 0, 0) * ${name}.BYTES_PER_ELEMENT;
};

export const __${name}_prototype_byteOffset$get = (_this: ${name}) => {
  return Porffor.wasm.i32.load(_this, 0, 8);
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

  const out: ${name} = Porffor.allocate();

  if (start > end) return out;

  let i: i32 = start;
  let j: i32 = 0;
  while (i < end) {
    out[j++] = _this[i++];
  }

  out.length = end - start;
  return out;
};

export const __${name}_prototype_set = (_this: ${name}, array: any, offset: number) => {
  const len: i32 = _this.length;

  offset |= 0;
  if (Porffor.fastOr(offset < 0, offset > len)) throw new RangeError('Offset out of bounds');

  if (Porffor.fastOr(
    Porffor.type(array) == Porffor.TYPES.array,
    Porffor.type(array) == Porffor.TYPES.string, Porffor.type(array) == Porffor.TYPES.bytestring,
    Porffor.type(array) == Porffor.TYPES.set,
    Porffor.fastAnd(Porffor.type(array) >= Porffor.TYPES.uint8array, Porffor.type(array) <= Porffor.TYPES.float64array)
  )) {
    let i: i32 = offset;
    for (const x of array) {
      _this[i++] = Porffor.type(x) == Porffor.TYPES.number ? x : 0;
      if (i > len) throw new RangeError('Array is too long for given offset');
    }
  }
};

export const __${name}_prototype_subarray = (_this: ${name}, start: number, end: any) => {
  const len: i32 = _this.length;
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;

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

  const out: ${name} = Porffor.allocateBytes(12);
  Porffor.wasm.i32.store(out, end - start, 0, 0);
  Porffor.wasm.i32.store(out, Porffor.wasm.i32.load(_this, 0, 4) + start * ${name}.BYTES_PER_ELEMENT, 0, 4);
  Porffor.wasm.i32.store(out, Porffor.wasm.i32.load(_this, 0, 8) + start * ${name}.BYTES_PER_ELEMENT, 0, 8);

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