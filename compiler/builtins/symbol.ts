import type {} from './porffor.d.ts';

export const __Porffor_symbol_descStore = (op: boolean, value: any): any => {
  const ptr: bytestring = '';

  if (op) { // write
    const size: number = Porffor.wasm.i32.load(ptr, 0, 0);
    Porffor.wasm.i32.store(ptr, size + 1, 0, 0)

    // reuse set internals to store description
    Porffor.set.write(ptr, size, value);
    return size;
  } else { // read
    return Porffor.set.read(ptr, value);
  }
};

export const Symbol = (description: any): Symbol => {
  // 1-based so always truthy as numeric value
  return __Porffor_symbol_descStore(true, description) + 1;
};

export const __Symbol_prototype_description$get = (_this: Symbol) => {
  const description: bytestring =
    __Porffor_symbol_descStore(false, Porffor.wasm`local.get ${_this}` - 1);
  return description;
};

export const __Symbol_prototype_toString = (_this: Symbol) => {
  let out: bytestring = '';

  // Symbol(
  Porffor.wasm.i32.store8(out, 83, 0, 4);
  Porffor.wasm.i32.store8(out, 121, 0, 5);
  Porffor.wasm.i32.store8(out, 109, 0, 6);
  Porffor.wasm.i32.store8(out, 98, 0, 7);
  Porffor.wasm.i32.store8(out, 111, 0, 8);
  Porffor.wasm.i32.store8(out, 108, 0, 9);
  Porffor.wasm.i32.store8(out, 40, 0, 10);

  const description: bytestring =
    __Porffor_symbol_descStore(false, Porffor.wasm`local.get ${_this}` - 1);

  const descLen: i32 = description.length;
  let outPtr: i32 = Porffor.wasm`local.get ${out}` + 7;
  let descPtr: i32 = Porffor.wasm`local.get ${description}`;
  const descPtrEnd: i32 = descPtr + descLen;
  while (descPtr < descPtrEnd) {
    Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(descPtr++, 0, 4), 0, 4);
  }

  // )
  Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + descLen, 41, 0, 11);

  out.length = 8 + descLen;

  return out;
};

export const __Symbol_prototype_valueOf = (_this: Symbol) => {
  return _this;
};