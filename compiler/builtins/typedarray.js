export default async () => {
  let out = '';

  const arrayCode = (await import('node:fs')).readFileSync(globalThis.precompileCompilerPath + '/builtins/array.ts', 'utf8');
  // a block either closes on its own opening line (single-line body, e.g. toLocaleString's
  // `{ return ...; };`) or spans multiple lines down to a standalone "};" - try the
  // single-line shape first, since for a multi-line body its own opening line never ends in
  // "};" so it falls through to the multi-line alternative
  const typedArrayFuncs = [...arrayCode.matchAll(/\/\/ @porf-typed-array\n(?:export const \w+ = function \([^)]*\)[^\n]*\{[^\n]*\};\n|export const \w+ = function \([^)]*\)[^\n]*\{\n[\s\S]*?^\};\n)/gm)].map(x => x[0]);

  // loud guard: a future reformat of array.ts (e.g. changed blank-line spacing around the
  // marker, or the closing brace no longer alone on its own line) would make this regex
  // silently match fewer blocks than intended, quietly dropping methods (and their
  // ValidateTypedArray detached-buffer check below) from every typed array prototype with a
  // green build. Cross-check against a plain marker count so that class of drift throws instead.
  // (this guard caught a real pre-existing bug: the previous single-alternative regex treated
  // toLocaleString's single-line body as unterminated and swallowed everything up to join's
  // closing brace, so __<Type>_prototype_join was never generated for any typed array type.)
  const markerCount = [...arrayCode.matchAll(/\/\/ @porf-typed-array\n/g)].length;
  if (typedArrayFuncs.length !== markerCount) {
    throw new Error(`typedarray.js: expected to extract ${markerCount} @porf-typed-array blocks from array.ts, got ${typedArrayFuncs.length} - the extraction regex likely no longer matches array.ts's current formatting`);
  }

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
  if (this.buffer.detached) throw new TypeError('Method %TypedArray%.prototype.at called on a typed array with a detached buffer');

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
  if (this.buffer.detached) throw new TypeError('Method %TypedArray%.prototype.slice called on a typed array with a detached buffer');

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

  // spec order (23.2.3.26 / 23.2.3.26.1): ToIntegerOrInfinity(offset) -> RangeError if
  // offset < 0 -> detached-buffer TypeError (inside ValidateTypedArrayBounds, called by
  // SetTypedArrayFromArrayLike/FromTypedArray) -> RangeError if offset is out of bounds
  offset = Math.trunc(offset);
  if (offset < 0) throw new RangeError('Offset out of bounds');
  if (this.buffer.detached) throw new TypeError('Method %TypedArray%.prototype.set called on a typed array with a detached buffer');
  if (offset > len) throw new RangeError('Offset out of bounds');

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

  if (this.buffer.detached) throw new TypeError('Method %TypedArray%.prototype.subarray called on a typed array with a detached buffer');

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

${typedArrayFuncs.reduce((acc, x) => {
  let body = x.replace('// @porf-typed-array\n', '').replaceAll('Array', name).replaceAll('any[]', name);
  // ValidateTypedArray runs before the rest of the algorithm for every one of these
  // shared methods per spec - detached buffers must throw TypeError, not read stale memory.
  // matches up through the opening "{" regardless of whether the body continues on the same
  // line (e.g. toLocaleString's single-line "{ return ...; };") or the next (multi-line case)
  const beforeInject = body;
  body = body.replace(/^(export const \w+ = function \([^)]*\)[^\n]*\{)/, `$1\n  if (this.buffer.detached) throw new TypeError('Method called on a typed array with a detached buffer');\n`);
  // loud guard: if the opening-line shape ever stops matching, .replace() is a silent no-op -
  // the detached-buffer check would quietly vanish from this method with a green build.
  // Fail the build instead of shipping a method with no ValidateTypedArray check.
  if (body === beforeInject) {
    throw new Error(`typedarray.js: failed to inject the detached-buffer check into ${name}'s "${x.match(/__Array_prototype_(\w+)/)?.[1] ?? '?'}" method - its opening line no longer matches the expected "export const ... = function (...) {" shape`);
  }
  return acc + body + '\n\n';
}, '')}`;
  };

  return out;
};
