const underlyingKeys: any[] = new Array(0);
const underlyingVals: any[] = new Array(0);
export const __Porffor_object_underlying = (obj: any): any => {
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) return obj;

  if (Porffor.fastAnd(t > 0x05, t != Porffor.TYPES.undefined)) {
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

      if (t == Porffor.TYPES.array) {
        const arr: any[] = obj;
        const len: i32 = arr.length;

        const key3: bytestring = 'length';
        __Porffor_object_expr_initWithFlags(underlying, key3, len, 0b1000);

        // todo: this should somehow be kept in sync?
        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), arr[i], 0b1110);
        }
      }

      if (t == Porffor.TYPES.string) {
        const str: string = obj;
        const len: i32 = str.length;

        const key3: bytestring = 'length';
        __Porffor_object_expr_initWithFlags(underlying, key1, len, 0b0000);

        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), str[i], 0b0100);
        }

        Porffor.object.preventExtensions(underlying);
      }

      if (t == Porffor.TYPES.bytestring) {
        const str: bytestring = obj;
        const len: i32 = str.length;

        const key3: bytestring = 'length';
        __Porffor_object_expr_initWithFlags(underlying, key1, len, 0b0000);

        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), str[i], 0b0100);
        }

        Porffor.object.preventExtensions(underlying);
      }

      Porffor.array.fastPush(underlyingVals, underlying);
      idx = Porffor.array.fastPush(underlyingKeys, obj) - 1;
    }

    return underlyingVals[idx];
  }

  return obj;
};