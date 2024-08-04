const underlyingFuncObjs: Map = new Map();
export const __Porffor_object_getObject = (obj: any): any => {
  if (Porffor.rawType(obj) == Porffor.TYPES.function) {
    const funcI32: i32 = Porffor.wasm`local.get ${obj}`;
    let underlying: object = underlyingFuncObjs.get(funcI32);
    if (underlying == null) {
      underlying = {};

      // set prototype and prototype.constructor if constructor
      const flags: i32 = __Porffor_funcLut_flags(funcI32);
      if (flags & 0b10) { // constructor
        const proto = {};
        const key1: bytestring = 'prototype';
        __Porffor_object_expr_initWithFlags(underlying, key1, proto, 0b1000);

        const key2: bytestring = 'constructor';
        __Porffor_object_expr_initWithFlags(proto, key2, obj, 0b1010);
      }

      underlyingFuncObjs.set(funcI32, underlying);
    }

    return underlying;
  }

  return obj;
};