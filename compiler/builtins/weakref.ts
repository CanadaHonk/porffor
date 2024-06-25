import type {} from './porffor.d.ts';

export const WeakRef = function (target: any): WeakRef {
  if (!new.target) throw new TypeError("Constructor WeakRef requires 'new'");

  if (!Porffor.object.isObjectOrSymbol(target)) throw new TypeError('Target for WeakRef needs to be an object or symbol');

  const out: WeakRef = Porffor.allocateBytes(9);

  Porffor.wasm`local.get ${out}
i32.to_u
local.get ${target}
f64.store 0 0

local.get ${out}
i32.to_u
local.get ${target+1}
i32.store8 0 8`;

  return out;
};

export const __WeakRef_prototype_deref = (_this: WeakRef) => {
  Porffor.wasm`local.get ${_this}
i32.to_u
f64.load 0 0

local.get ${_this}
i32.to_u
i32.load8_u 0 8
return`;
};

export const __WeakRef_prototype_toString = (_this: WeakRef) => {
  const out: bytestring = '[object WeakRef]';
  return out;
};

export const __WeakRef_prototype_toLocaleString = (_this: WeakRef) => __WeakRef_prototype_toString(_this);