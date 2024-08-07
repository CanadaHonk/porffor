const underlyingKeys: any[] = new Array(0);
const underlyingVals: any[] = new Array(0);
export const __Porffor_object_getObject = (obj: any): any => {
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) return obj;

  if (Porffor.fastAnd(t > 0x05, t != Porffor.TYPES.string, t != Porffor.TYPES.bytestring, t != Porffor.TYPES.undefined)) {
    let idx: i32 = underlyingKeys.indexOf(obj);
    if (idx == -1) {
      const underlying: object = {};

      if (t == Porffor.TYPES.function) {
        const flags: i32 = __Porffor_funcLut_flags(obj);
        if (flags & 0b10) { // constructor
          // set prototype and prototype.constructor if function and constructor
          const proto = {};
          const key1: bytestring = 'prototype';
          __Porffor_object_expr_initWithFlags(underlying, key1, proto, 0b1000);

          const key2: bytestring = 'constructor';
          __Porffor_object_expr_initWithFlags(proto, key2, obj, 0b1010);
        }
      }

      Porffor.array.fastPush(underlyingVals, underlying);
      idx = Porffor.array.fastPush(underlyingKeys, obj) - 1;
    }

    return underlyingVals[idx];
  }

  return obj;
};

export const __Porffor_object_makeObject = (obj: any): any => {
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) return obj;

  if (Porffor.fastAnd(t > 0x05, t != Porffor.TYPES.string, t != Porffor.TYPES.bytestring, t != Porffor.TYPES.undefined)) {
    let idx: i32 = underlyingKeys.indexOf(obj);
    if (idx == -1) {
      const underlying: object = {};

      if (t == Porffor.TYPES.function) {
        const flags: i32 = __Porffor_funcLut_flags(obj);
        if (flags & 0b10) { // constructor
          // set prototype and prototype.constructor if function and constructor
          const proto = {};
          const key1: bytestring = 'prototype';
          __Porffor_object_expr_initWithFlags(underlying, key1, proto, 0b1000);

          const key2: bytestring = 'constructor';
          __Porffor_object_expr_initWithFlags(proto, key2, obj, 0b1010);
        }
      }

      Porffor.array.fastPush(underlyingVals, underlying);
      idx = Porffor.array.fastPush(underlyingKeys, obj) - 1;
    }

    return underlyingVals[idx];
  }

  return obj;
};