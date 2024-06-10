import type {} from './porffor.d.ts';

export const ArrayBuffer = function (length: number): ArrayBuffer {
  if (!new.target) throw new TypeError("Constructor ArrayBuffer requires 'new'");

  if (length < 0) throw new RangeError('Invalid ArrayBuffer length (negative)');
  if (length > 34359738368) throw new RangeError('Invalid ArrayBuffer length (>32GiB)');

  length |= 0;

  const out: ArrayBuffer = Porffor.allocateBytes(length + 4);
  Porffor.wasm.i32.store(out, length, 0, 0);

  return out;
};

export const __ArrayBuffer_prototype_byteLength$get = (_this: ArrayBuffer) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};