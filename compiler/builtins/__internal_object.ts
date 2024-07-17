const underlyingFuncObjs: Map = new Map();
export const __Porffor_object_getObject = (obj: any): any => {
  if (Porffor.rawType(obj) == Porffor.TYPES.function) {
    const funcI32: i32 = Porffor.wasm`local.get ${obj}`;
    let underlying: object = underlyingFuncObjs.get(funcI32);
    if (underlying == null) {
      underlying = Porffor.allocate();
      underlyingFuncObjs.set(funcI32, underlying);
    }

    return underlying;
  }

  return obj;
};