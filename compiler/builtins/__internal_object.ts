const underlyingKeys: any[] = [];
const underlyingVals: any[] = [];
export const __Porffor_object_underlying = (obj: any): any => {
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) return obj;

  if (Porffor.fastAnd(
    t >= Porffor.TYPES.error,
    t < 0x40
  )) {
    return obj as object;
  }

  if (Porffor.fastAnd(t > 0x05, t != Porffor.TYPES.undefined)) {
    let idx: i32 = Porffor.array.fastIndexOf(underlyingKeys, obj);
    if (idx == -1) {
      const underlying: object = {};

      if (t == Porffor.TYPES.function) {
        if (ecma262.IsConstructor(obj)) { // constructor
          // set prototype and prototype.constructor if function and constructor
          const proto: object = {};
          const key1: bytestring = 'prototype';
          __Porffor_object_expr_initWithFlags(underlying, key1, proto, 0b1000);

          const key2: bytestring = 'constructor';
          __Porffor_object_expr_initWithFlags(proto, key2, obj, 0b1010);
        }

        const key3: bytestring = 'name';
        __Porffor_object_expr_initWithFlags(underlying, key3, __Porffor_funcLut_name(obj), 0b0010);

        const key4: bytestring = 'length';
        __Porffor_object_expr_initWithFlags(underlying, key4, __Porffor_funcLut_length(obj), 0b0010);
      }

      if (t == Porffor.TYPES.array) {
        const len: i32 = (obj as any[]).length;

        const key5: bytestring = 'length';
        __Porffor_object_expr_initWithFlags(underlying, key5, len, 0b1000);

        // todo: this should somehow be kept in sync?
        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), (obj as any[])[i], 0b1110);
        }
      }

      if (Porffor.fastOr(t == Porffor.TYPES.string, t == Porffor.TYPES.stringobject)) {
        const len: i32 = (obj as string).length;

        const key6: bytestring = 'length';
        __Porffor_object_expr_initWithFlags(underlying, key6, len, 0b0000);

        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), (obj as string)[i], 0b0100);
        }

        if (t == Porffor.TYPES.string) Porffor.object.preventExtensions(underlying);
      }

      if (t == Porffor.TYPES.bytestring) {
        const len: i32 = (obj as bytestring).length;

        const key7: bytestring = 'length';
        __Porffor_object_expr_initWithFlags(underlying, key7, len, 0b0000);

        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), (obj as bytestring)[i], 0b0100);
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