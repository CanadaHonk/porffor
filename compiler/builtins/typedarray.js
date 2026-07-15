export default async () => {
  let out = '';

  const arrayCode = (await import('node:fs')).readFileSync(globalThis.precompileCompilerPath + '/builtins/array.ts', 'utf8');
  const typedArrayFuncs = [...arrayCode.matchAll(/\/\/ @porf-typed-array[\s\S]+?^};$/gm)].map(x => x[0]);

  // typedarray layout: length (i32), bufferPtr (i32, buffer + byteOffset), byteOffset (i32, getter only)

  for (const x of [ 'Uint8', 'Int8', 'Uint8Clamped', 'Uint16', 'Int16', 'Uint32', 'Int32', 'Float32', 'Float64', 'BigInt64', 'BigUint64' ]) {
    const name = x + 'Array';
    out += `export const ${name} = function (arg: any, byteOffset: any, length: any): ${name} {
  if (!new.target) throw new TypeError("Constructor ${name} requires 'new'");

  const out: ${name} = Porffor.malloc(12);
  const outPtr: i32 = Porffor.IR.ptr(out);
  Porffor.IR.storeI32(outPtr, 0, 0);
  Porffor.IR.storeI32(outPtr, 4, 0);
  Porffor.IR.storeI32(outPtr, 8, 0);

  let len: i32 = 0;
  let byteLength: number = 0;
  let bufferPtr: i32;

  if (Porffor.fastOr(
    Porffor.type(arg) == Porffor.TYPES.arraybuffer,
    Porffor.type(arg) == Porffor.TYPES.sharedarraybuffer
  )) {
    bufferPtr = Porffor.IR.ptr(arg);
    if (arg.detached) throw new TypeError('Constructed ${name} with a detached ArrayBuffer');

    let offset: i32 = 0;
    if (Porffor.type(byteOffset) != Porffor.TYPES.undefined) offset = Math.trunc(byteOffset);
    if (offset < 0) throw new RangeError('Invalid DataView byte offset (negative)');

    Porffor.IR.storeI32(outPtr, 8, offset);
    Porffor.IR.storeI32(outPtr, 4, bufferPtr + offset);

    if (Porffor.type(length) == Porffor.TYPES.undefined) {
      const bufferLen: i32 = Porffor.IR.loadI32(bufferPtr, 0);
      len = (bufferLen - offset) / ${name}.BYTES_PER_ELEMENT;

      if (!Number.isInteger(len)) throw new RangeError('Byte length of ${name} should be divisible by BYTES_PER_ELEMENT');
    } else len = Math.trunc(length);

    byteLength = len * ${name}.BYTES_PER_ELEMENT;
  } else {
    if (Porffor.fastOr(
      Porffor.type(arg) == Porffor.TYPES.array,
      (Porffor.type(arg) | 0b10000000) == Porffor.TYPES.bytestring,
      Porffor.type(arg) == Porffor.TYPES.set,
      Porffor.fastAnd(Porffor.type(arg) >= Porffor.TYPES.uint8clampedarray, Porffor.type(arg) <= Porffor.TYPES.float64array)
    )) {
      len = arg.length;
    } else if (Porffor.type(arg) == Porffor.TYPES.number) {
      len = Math.trunc(arg);
    }

    byteLength = len * ${name}.BYTES_PER_ELEMENT;

    if (len < 0) throw new RangeError('Invalid TypedArray length (negative)');
    if (byteLength > 2147483643) throw new RangeError('Invalid ArrayBuffer length (over maximum supported length)');

    bufferPtr = Porffor.malloc(4 + byteLength);
    Porffor.IR.storeI32(outPtr, 4, bufferPtr);
    Porffor.IR.storeI32(bufferPtr, 0, byteLength);
    Porffor.IR.fill(bufferPtr + 4, 0, byteLength);

    if (Porffor.fastOr(
      Porffor.type(arg) == Porffor.TYPES.array,
      (Porffor.type(arg) | 0b10000000) == Porffor.TYPES.bytestring,
      Porffor.type(arg) == Porffor.TYPES.set,
      Porffor.fastAnd(Porffor.type(arg) >= Porffor.TYPES.uint8clampedarray, Porffor.type(arg) <= Porffor.TYPES.float64array)
    )) {
      let i: i32 = 0;
      for (const x of arg) {
        out[i++] = x;
      }
    }
  }

  if (len < 0) throw new RangeError('Invalid TypedArray length (negative)');
  if (byteLength > 2147483643) throw new RangeError('Invalid ArrayBuffer length (over maximum supported length)');

  Porffor.IR.storeI32(outPtr, 0, len);
  // the buffer malloc above can run a minor that promotes out in place; the raw
  // buffer store has no barrier, so remember it before the frame's locals die
  Porffor.IR.gcBarrier(out, Porffor.type(out));
  return out;
};

export const __${name}_of = (...items: any[]): ${name} => new ${name}(items);

export const __${name}_from = (arg: any, mapFn: any): ${name} => {
  const arr: any[] = Porffor.array.new(4);
  let len: i32 = 0;

  if (Porffor.fastOr(
    Porffor.type(arg) == Porffor.TYPES.array,
    (Porffor.type(arg) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(arg) == Porffor.TYPES.set,
    Porffor.fastAnd(Porffor.type(arg) >= Porffor.TYPES.uint8clampedarray, Porffor.type(arg) <= Porffor.TYPES.float64array)
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

export const __${name}_prototype_buffer$get = function (this: ${name}): any|ArrayBuffer {
  return Porffor.IR.loadI32(this, 4) - Porffor.IR.loadI32(this, 8) as ArrayBuffer;
};

export const __${name}_prototype_byteLength$get = function (this: ${name}) {
  return Porffor.IR.loadI32(this, 0) * ${name}.BYTES_PER_ELEMENT;
};

export const __${name}_prototype_byteOffset$get = function (this: ${name}) {
  return Porffor.IR.loadI32(this, 8);
};

export const __${name}_prototype_at = function (this: ${name}, index: any) {
  index = ecma262.ToIntegerOrInfinity(index);

  const len: i32 = this.length;
  if (index < 0) {
    index = len + index;
    if (index < 0) return undefined;
  }
  if (index >= len) return undefined;

  return this[index];
};

export const __${name}_prototype_slice = function (this: ${name}, start: any, end: any) {
  const len: i32 = this.length;
  start = ecma262.ToIntegerOrInfinity(start);
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;
    else end = ecma262.ToIntegerOrInfinity(end);

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

  const outLen: i32 = start > end ? 0 : end - start;
  const out: ${name} = new ${name}(outLen);

  let i: i32 = start;
  let j: i32 = 0;
  while (j < outLen) {
    out[j++] = this[i++];
  }

  return out;
};

export const __${name}_prototype_set = function (this: ${name}, array: any, offset: number) {
  const len: i32 = this.length;

  offset = Math.trunc(offset);
  if (Porffor.fastOr(offset < 0, offset > len)) throw new RangeError('Offset out of bounds');

  if (Porffor.fastOr(
    Porffor.type(array) == Porffor.TYPES.array,
    (Porffor.type(array) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(array) == Porffor.TYPES.set,
    Porffor.fastAnd(Porffor.type(array) >= Porffor.TYPES.uint8clampedarray, Porffor.type(array) <= Porffor.TYPES.float64array)
  )) {
    let i: i32 = offset;
    for (const x of array) {
      this[i++] = Porffor.type(x) == Porffor.TYPES.number ? x : 0;
      if (i > len) throw new RangeError('Array is too long for given offset');
    }
  }
};

export const __${name}_prototype_subarray = function (this: ${name}, start: any, end: any) {
  const len: i32 = this.length;
  start = ecma262.ToIntegerOrInfinity(start);
  if (Porffor.type(end) == Porffor.TYPES.undefined) end = len;
    else end = ecma262.ToIntegerOrInfinity(end);

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

  const out: ${name} = Porffor.malloc(12);
  Porffor.IR.storeI32(out, 0, end - start);
  Porffor.IR.storeI32(out, 4, Porffor.IR.loadI32(this, 4) + start * ${name}.BYTES_PER_ELEMENT);
  Porffor.IR.storeI32(out, 8, Porffor.IR.loadI32(this, 8) + start * ${name}.BYTES_PER_ELEMENT);

  return out;
};

${typedArrayFuncs.reduce((acc, x) => acc + x.replace('// @porf-typed-array\n', '').replaceAll('Array', name).replaceAll('any[]', name) + '\n\n', '')}`;
  };

  return out;
};
