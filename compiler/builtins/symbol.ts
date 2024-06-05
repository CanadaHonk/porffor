import type {} from './porffor.d.ts';

export const __Porffor_symbol_descStore = (op: boolean, value: any): any => {
  const ptr = Porffor.allocatePage<Symbol>();

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
  const symPtr: Symbol = __Porffor_symbol_descStore(true, description) + 1;
  return symPtr;
};

export const __Symbol_prototype_description$get = (_this: Symbol) => {
  const description: bytestring =
    __Porffor_symbol_descStore(false, Porffor.wasm`local.get ${_this}` - 1);
  return description;
};

export const __Symbol_prototype_toString = (_this: Symbol) => {
  const description: bytestring = __Porffor_symbol_descStore(false, Porffor.wasm`local.get ${_this}` - 1);
  const descLen: i32 = description.length;
  
  let out = Porffor.allocateBytes<bytestring>(4 + 8 + descLen);
  Porffor.bytestring.spliceString(out, 0, 'Symbol(')
  Porffor.bytestring.spliceString(out, 7, description)
  Porffor.bytestring.spliceString(out, 7 + descLen, ')')
  out.length = 8 + descLen;
  
  return out;
};

export const __Symbol_prototype_valueOf = (_this: Symbol) => {
  return _this;
};