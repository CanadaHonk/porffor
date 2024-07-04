import type {} from './porffor.d.ts';

export function __WeakSet_prototype_has() {
  return __Set_prototype_has.call(this, value);
}

export function __WeakSet_prototype_add(value: any) {
  if (!Porffor.object.isObjectOrSymbol(value)) throw new TypeError('Value in WeakSet needs to be an object or symbol');

  __Set_prototype_add.call(this, value);
  return this;
};

export function __WeakSet_prototype_delete() {
  return __Set_prototype_delete.call(this, value);
}

export const WeakSet = function (iterable: any): WeakSet {
  if (!new.target) throw new TypeError("Constructor WeakSet requires 'new'");

  const out: WeakSet = Porffor.allocate();

  if (iterable != null) for (const x of iterable) {
    __WeakSet_prototype_add.call(out, x);
  }

  return out;
};

export function __WeakSet_prototype_toString() {
  const out: bytestring = '[object WeakSet]';
  return out;
};

export function __WeakSet_prototype_toLocaleString() {
  return __WeakSet_prototype_toString.call(this);
}