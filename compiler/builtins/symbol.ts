import type {} from './porffor.d.ts';

// todo: growing behavior, currently we are limited to 16384 symbols 
export const __Porffor_symbol_create = (value: any): any => {
  const ptr: number = Porffor.allocateNamedPage<any>("symbol");
  const size: i32 = Porffor.wasm.i32.load(ptr, 0, 0) + 1;
  // increment size
  Porffor.wasm.i32.store(ptr, size, 0, 0); 
  // store description ptr
  Porffor.wasm.i32.store(ptr + size * 4, value, 0, 0);
  
  return size;
}

export const __Porffor_symbol_readDesc = (sym: any): bytestring => {
  const ptr: number = Porffor.allocateNamedPage<any>("symbol");
  const desc: bytestring = Porffor.wasm.i32.load(ptr + sym * 4, 0, 0);
  return desc;
}

export const Symbol = (description: any): Symbol => {
  if (Porffor.rawType(description) == Porffor.TYPES.undefined) {
    const symPtr: Symbol = __Porffor_symbol_create('');
    return symPtr;
  }
  const symPtr: Symbol = __Porffor_symbol_create(description);
  return symPtr;
};

export const __Symbol_prototype_description$get = (_this: Symbol) => {
  const description: bytestring = __Porffor_symbol_readDesc(_this);
  return description;
};

export const __Symbol_prototype_toString = (_this: Symbol) => {
  const description: bytestring =  __Porffor_symbol_readDesc(_this);
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