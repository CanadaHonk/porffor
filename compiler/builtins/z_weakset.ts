import type {} from './porffor.d.ts';

export const __WeakSet_prototype_has = (_this: WeakSet, value: any) => {
  const set: Set = _this;
  return __Set_prototype_has(set, value);
};

export const __WeakSet_prototype_add = (_this: WeakSet, value: any) => {
  if (!Porffor.object.isObjectOrSymbol(value)) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  const set: Set = _this;
  __Set_prototype_add(set, value);
  return _this;
};

export const __WeakSet_prototype_delete = (_this: WeakSet, value: any) => {
  const set: Set = _this;
  return __Set_prototype_delete(set, value);
};

export const WeakSet = function (iterable: any): WeakSet {
  if (!new.target) throw new TypeError("Constructor WeakSet requires 'new'");

  const out: WeakSet = __Porffor_allocate();

  if (iterable != null) for (const x of iterable) {
    __WeakSet_prototype_add(out, x);
  }

  return out;
};

export const __WeakSet_prototype_toString = (_this: WeakSet) => '[object WeakSet]';
export const __WeakSet_prototype_toLocaleString = (_this: WeakSet) => __WeakSet_prototype_toString(_this);