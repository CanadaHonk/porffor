// @porf --valtype=i32
import type {} from './porffor.d.ts';

let underlyingStore: i32 = 0;
export const __Porffor_object_underlying = (_obj: any): any => {
  if (Porffor.rawType(_obj) == Porffor.TYPES.object) {
    Porffor.wasm`
local.get ${_obj}
i32.trunc_sat_f64_u
i32.const 7 ;; object
return`;
  }

  if (Porffor.fastAnd(
    Porffor.rawType(_obj) >= Porffor.TYPES.error,
    Porffor.rawType(_obj) < 0x40
  )) {
    Porffor.wasm`
local.get ${_obj}
i32.trunc_sat_f64_u
i32.const 7 ;; object
return`;
  }

  if (Porffor.fastAnd(
    Porffor.rawType(_obj) > 0x05,
    Porffor.rawType(_obj) != Porffor.TYPES.undefined
  )) {
    if (underlyingStore == 0) underlyingStore = Porffor.allocate();

    // check if underlying object already exists for obj
    const underlyingLength: i32 = Porffor.wasm.i32.load(underlyingStore, 0, 0);
    const end: i32 = underlyingLength * 12;
    for (let i: i32 = 0; i < end; i += 12) {
      if (Porffor.wasm.f64.eq(Porffor.wasm.f64.load(underlyingStore + i, 0, 4), _obj))
        return Porffor.wasm.i32.load(underlyingStore + i, 0, 12) as object;
    }

    let obj;
    Porffor.wasm`
local.get ${_obj}
i32.trunc_sat_f64_u
local.set ${obj}`;

    // it does not, make it
    const underlying: object = {};
    if (Porffor.rawType(_obj) == Porffor.TYPES.function) {
      if (ecma262.IsConstructor(_obj)) { // constructor
        // set prototype and prototype.constructor if function and constructor
        const proto: object = {};
        __Porffor_object_expr_initWithFlags(underlying, 'prototype', proto, 0b1000);
        __Porffor_object_expr_initWithFlags(proto, 'constructor', _obj, 0b1010);
      }

      __Porffor_object_expr_initWithFlags(underlying, 'name', __Porffor_funcLut_name(obj), 0b0010);
      __Porffor_object_expr_initWithFlags(underlying, 'length', __Porffor_funcLut_length(obj), 0b0010);
    }

    if (Porffor.rawType(_obj) == Porffor.TYPES.array) {
      const len: i32 = Porffor.wasm.i32.load(obj, 0, 0);
      __Porffor_object_expr_initWithFlags(underlying, 'length', len, 0b1000);

      // todo: this should somehow be kept in sync?
      for (let i: i32 = 0; i < len; i++) {
        let ptr: i32 = obj + i * 9;
        Porffor.wasm`
local x f64
local x#type i32
local.get ${ptr}
f64.load 0 4
local.set x

local.get ${ptr}
i32.load8_u 0 12
local.set x#type`;
        __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), x, 0b1110);
      }
    }

    if (Porffor.fastOr(
      Porffor.rawType(_obj) == Porffor.TYPES.string,
      Porffor.rawType(_obj) == Porffor.TYPES.stringobject)
    ) {
      const len: i32 = (obj as string).length;
      __Porffor_object_expr_initWithFlags(underlying, 'length', len, 0b0000);

      for (let i: i32 = 0; i < len; i++) {
        __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), (obj as string)[i], 0b0100);
      }

      if (Porffor.rawType(_obj) == Porffor.TYPES.string) Porffor.object.preventExtensions(underlying);
    }

    if (Porffor.rawType(_obj) == Porffor.TYPES.bytestring) {
      const len: i32 = (obj as bytestring).length;
      __Porffor_object_expr_initWithFlags(underlying, 'length', len, 0b0000);

      for (let i: i32 = 0; i < len; i++) {
        __Porffor_object_expr_initWithFlags(underlying, __Number_prototype_toString(i), (obj as bytestring)[i], 0b0100);
      }

      Porffor.object.preventExtensions(underlying);
    }

    // store new underlying obj
    Porffor.wasm.i32.store(underlyingStore, underlyingLength + 1, 0, 0);
    Porffor.wasm.f64.store(underlyingStore + underlyingLength * 12, _obj, 0, 4);
    Porffor.wasm.i32.store(underlyingStore + underlyingLength * 12, underlying, 0, 12);
    return underlying;
  }

  Porffor.wasm`
local.get ${_obj}
i32.trunc_sat_f64_u
local.get ${_obj+1}
return`;
};