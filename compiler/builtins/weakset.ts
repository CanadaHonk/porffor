import type {} from './porffor.d.ts';

export const __WeakSet_prototype_has = function (this: WeakSet, value: any) {
  return Porffor.callThis(__Set_prototype_has, this as Set, value);
};

export const __WeakSet_prototype_add = function (this: WeakSet, value: any) {
  if (!Porffor.object.isObjectOrSymbol(value)) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  Porffor.callThis(__Set_prototype_add, this as Set, value);
  return this;
};

export const __WeakSet_prototype_delete = function (this: WeakSet, value: any) {
  return Porffor.callThis(__Set_prototype_delete, this as Set, value);
};

export const WeakSet = function (iterable: any): WeakSet {
  if (!new.target) throw new TypeError("Constructor WeakSet requires 'new'");

  const out: WeakSet = __Porffor_hashtableNew(false);
  Porffor.IR.gcBarrier(out, Porffor.TYPES.weakset);
  if (iterable != null) for (const x of iterable) {
    Porffor.callThis(__WeakSet_prototype_add, out, x);
  }

  return out;
};

export const __WeakSet_prototype_toString = function (this: WeakSet) { return '[object WeakSet]'; };
export const __WeakSet_prototype_toLocaleString = function (this: WeakSet) { return Porffor.callThis(__WeakSet_prototype_toString, this); };
