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

export const __Porffor_canBeHeldWeakly = (v: any): boolean => {
  if (Porffor.type(v) == Porffor.TYPES.symbol) return __Symbol_keyFor(v) === undefined;
  return Porffor.object.isObject(v);
};

// [ cells @0 ]: [ cleanupCallback, (target, heldValue, unregisterToken)... ]
// cleanup callbacks are never called: targets are held strongly
export const FinalizationRegistry = function (cleanupCallback: any): FinalizationRegistry {
  if (!new.target) throw new TypeError("Constructor FinalizationRegistry requires 'new'");
  if (Porffor.type(cleanupCallback) != Porffor.TYPES.function) throw new TypeError('FinalizationRegistry cleanup callback is not a function');

  const cells: any[] = Porffor.array.new(1);
  cells[0] = cleanupCallback;

  const out: FinalizationRegistry = Porffor.malloc(8);
  Porffor.IR.storeJv(out, 0, cells);
  return out;
};

export const __FinalizationRegistry_prototype_register = function (this: any, target: any, heldValue: any, unregisterToken: any): void {
  if (Porffor.type(this) != Porffor.TYPES.finalizationregistry) throw new TypeError('this is not a FinalizationRegistry');
  if (!__Porffor_canBeHeldWeakly(target)) throw new TypeError('FinalizationRegistry target cannot be held weakly');
  if (target === heldValue) throw new TypeError('FinalizationRegistry target and held value cannot be the same');
  if (!__Porffor_canBeHeldWeakly(unregisterToken)) {
    if (unregisterToken !== undefined) throw new TypeError('FinalizationRegistry unregister token cannot be held weakly');
  }

  const cells: any[] = Porffor.IR.loadJv(this, 0);
  const len: i32 = cells.length;
  cells[len] = target;
  cells[len + 1] = heldValue;
  cells[len + 2] = unregisterToken;
};

export const __FinalizationRegistry_prototype_unregister = function (this: any, unregisterToken: any): boolean {
  if (Porffor.type(this) != Porffor.TYPES.finalizationregistry) throw new TypeError('this is not a FinalizationRegistry');
  if (!__Porffor_canBeHeldWeakly(unregisterToken)) throw new TypeError('FinalizationRegistry unregister token cannot be held weakly');

  const cells: any[] = Porffor.IR.loadJv(this, 0);
  let removed: boolean = false;
  let j: i32 = 1;
  for (let i: i32 = 1; i < cells.length; i += 3) {
    if (cells[i + 2] === unregisterToken) {
      removed = true;
      continue;
    }

    cells[j] = cells[i];
    cells[j + 1] = cells[i + 1];
    cells[j + 2] = cells[i + 2];
    j += 3;
  }

  cells.length = j;
  return removed;
};
