import type {} from './porffor.d.ts';

const underlyingKeys: any[] = [];
const underlyingVals: any[] = [];
export const __Porffor_object_underlying = (obj: any): any => {
  if (Porffor.rawType(obj) == Porffor.TYPES.object) return obj;

  if (Porffor.fastAnd(
    Porffor.rawType(obj) >= Porffor.TYPES.error,
    Porffor.rawType(obj) < 0x40
  )) {
    return obj as object;
  }

  if (Porffor.fastAnd(Porffor.rawType(obj) > 0x05, Porffor.rawType(obj) != Porffor.TYPES.undefined)) {
    let idx: i32 = Porffor.array.fastIndexOf(underlyingKeys, obj);
    if (idx == -1) {
      const underlying: object = {};
      if (Porffor.rawType(obj) == Porffor.TYPES.function) {
        if (ecma262.IsConstructor(obj)) {
          // set prototype and prototype.constructor if function and constructor
          const proto: object = {};
          __Porffor_object_expr_initWithFlags(underlying, 'prototype', proto, 0b1000);
          __Porffor_object_expr_initWithFlags(proto, 'constructor', obj, 0b1010);
        }

        __Porffor_object_expr_initWithFlags(underlying, 'name', __Porffor_funcLut_name(obj), 0b0010);
        __Porffor_object_expr_initWithFlags(underlying, 'length', __Porffor_funcLut_length(obj), 0b0010);
      }

      if (Porffor.rawType(obj) == Porffor.TYPES.array) {
        const len: i32 = (obj as any[]).length;

        __Porffor_object_expr_initWithFlags(underlying, 'length', len, 0b1000);

        // todo: this should somehow be kept in sync?
        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), (obj as any[])[i], 0b1110);
        }
      }

      if (Porffor.fastOr(
        Porffor.rawType(obj) == Porffor.TYPES.string,
        Porffor.rawType(obj) == Porffor.TYPES.stringobject)
      ) {
        const len: i32 = (obj as string).length;
        __Porffor_object_expr_initWithFlags(underlying, 'length', len, 0b0000);

        for (let i: i32 = 0; i < len; i++) {
          __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), (obj as string)[i], 0b0100);
        }

        if (Porffor.rawType(obj) == Porffor.TYPES.string) Porffor.object.preventExtensions(underlying);
      }

      if (Porffor.rawType(obj) == Porffor.TYPES.bytestring) {
        const len: i32 = (obj as bytestring).length;
        __Porffor_object_expr_initWithFlags(underlying, 'length', len, 0b0000);

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