import type {} from './porffor.d.ts';

export const __WeakSet_prototype_has = (_this: WeakSet, value: any) => __Set_prototype_has(_this, value);

export const __WeakSet_prototype_add = (_this: WeakSet, value: any) => {
  if (Porffor.rawType(value) < 0x04) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  __Set_prototype_add(_this, value);
  return _this;
};

export const __WeakSet_prototype_delete = (_this: WeakSet, value: any) => __Set_prototype_delete(_this, value);

export const WeakSet = function (iterable: any): WeakSet {
  if (!new.target) throw new TypeError("Constructor WeakSet requires 'new'");

  const out: WeakSet = __Porffor_allocate();

  if (iterable != null) for (const x of iterable) {
    __WeakSet_prototype_add(out, x);
  }

  return out;
};

export const __WeakSet_prototype_toString = (_this: WeakSet) => {
  const out: bytestring = '[object WeakSet]';
  return out;
};

export const __WeakSet_prototype_toLocaleString = (_this: WeakSet) => __WeakSet_prototype_toString(_this);