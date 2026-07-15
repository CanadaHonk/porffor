import type {} from './porffor.d.ts';

export const WeakRef = function (target: any): WeakRef {
  if (!new.target) throw new TypeError("Constructor WeakRef requires 'new'");

  if (!Porffor.object.isObjectOrSymbol(target)) throw new TypeError('Target for WeakRef needs to be an object or symbol');

  const out: WeakRef = Porffor.malloc(8);
  Porffor.IR.storeJv(out, 0, target);

  return out;
};

export const __WeakRef_prototype_deref = function (this: WeakRef) {
  return Porffor.IR.loadJv(this, 0);
};

export const __WeakRef_prototype_toString = function (this: WeakRef) { return '[object WeakRef]'; };
export const __WeakRef_prototype_toLocaleString = function (this: WeakRef) { return Porffor.callThis(__WeakRef_prototype_toString, this); };
