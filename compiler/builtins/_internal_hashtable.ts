import type {} from './porffor.d.ts';

// shared ordered hash table core (Map/Set/WeakMap/WeakSet)
// container: { keys array @0, vals array or 0 @4, buckets @8, bucket capacity @12, tombstones @16 }
// buckets: i32 slots, lazily allocated, 0 = empty, -1 = deleted, else key index + 1
// deleted dense entries: key type byte 0xff (value 0)

export const __Porffor_hashIdentity = (key: any): i32 => {
  let hash: i32 = Porffor.IR.ptr(key);
  hash = hash >>> 3;
  hash ^= hash >>> 16;
  hash *= 0x7feb352d;
  hash ^= hash >>> 15;
  return hash;
};

export const __Porffor_hashSvz = (key: any): i32 => {
  const t: i32 = Porffor.type(key);
  if (Porffor.fastOr(t == Porffor.TYPES.string, t == Porffor.TYPES.bytestring)) {
    return __Porffor_object_hash(key);
  }

  if (t == Porffor.TYPES.number) {
    if (key != key) return 0x7ff8;
    if (key == 0) return 0;
  }

  return __Porffor_hashIdentity(key);
};

export const __Porffor_hashtableFindSlot = (container: any, key: any, hash: any): i32 => {
  const keys: any[] = Porffor.IR.loadI32(container, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const buckets: i32 = Porffor.IR.loadI32(container, 8);
  const capacity: i32 = Porffor.IR.loadI32(container, 12);

  let slot: i32 = hash & (capacity - 1);
  while (true) {
    const entry: i32 = Porffor.IR.loadI32(buckets + slot * 4, 0);
    if (entry == 0) return -1;

    if (entry != -1) {
      const keyPtr: i32 = keysEntries + (entry - 1) * 8;
      let existing: any = Porffor.IR.loadJv(keyPtr, 0);

      if (__ecma262_SameValueZero(existing, key)) return slot;
    }

    slot = (slot + 1) & (capacity - 1);
  }
};

export const __Porffor_hashtableInsert = (container: any, hash: any, index: any): void => {
  const buckets: i32 = Porffor.IR.loadI32(container, 8);
  const capacity: i32 = Porffor.IR.loadI32(container, 12);

  let slot: i32 = hash & (capacity - 1);
  while (true) {
    const entry: i32 = Porffor.IR.loadI32(buckets + slot * 4, 0);
    if (Porffor.fastOr(entry == 0, entry == -1)) {
      Porffor.IR.storeI32(buckets + slot * 4, 0, index + 1);
      return;
    }

    slot = (slot + 1) & (capacity - 1);
  }
};

export const __Porffor_hashtableRebuild = (container: any, newCapacity: any): void => {
  const capacity: i32 = newCapacity;
  const buckets: i32 = Porffor.malloc(capacity * 4);
  Porffor.IR.fill(buckets, 0, capacity * 4);
  Porffor.IR.storeI32(container, 8, buckets);
  Porffor.IR.storeI32(container, 12, capacity);
  Porffor.IR.gcBarrier(container, Porffor.type(container));

  const keys: any[] = Porffor.IR.loadI32(container, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const len: i32 = keys.length;
  for (let i: i32 = 0; i < len; i++) {
    const keyPtr: i32 = keysEntries + i * 8;
    if (Porffor.IR.loadU64(keyPtr, 0) == -1) continue;

    let key: any = Porffor.IR.loadJv(keyPtr, 0);

    __Porffor_hashtableInsert(container, __Porffor_hashSvz(key), i);
  }
};

export const __Porffor_hashtableCompact = (container: any): void => {
  const keys: any[] = Porffor.IR.loadI32(container, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const vals: i32 = Porffor.IR.loadI32(container, 4);
  let valsEntries: i32 = 0;
  if (vals != 0) valsEntries = Porffor.IR.loadI32(vals, 4);

  const len: i32 = keys.length;
  let out: i32 = 0;
  for (let i: i32 = 0; i < len; i++) {
    const keyPtr: i32 = keysEntries + i * 8;
    if (Porffor.IR.loadU64(keyPtr, 0) == -1) continue;

    if (out != i) {
      const outPtr: i32 = keysEntries + out * 8;
      Porffor.IR.copy(outPtr, keyPtr, 8);

      if (vals != 0) {
        const valPtr: i32 = valsEntries + i * 8;
        const valOutPtr: i32 = valsEntries + out * 8;
        Porffor.IR.copy(valOutPtr, valPtr, 8);
      }
    }
    out += 1;
  }

  keys.length = out;
  if (vals != 0) {
    const valsArr: any[] = vals;
    valsArr.length = out;
  }
  Porffor.IR.storeI32(container, 16, 0);

  const capacity: i32 = Porffor.IR.loadI32(container, 12);
  __Porffor_hashtableRebuild(container, capacity);
};

export const __Porffor_hashtableLookup = (container: any, key: any): i32 => {
  const buckets: i32 = Porffor.IR.loadI32(container, 8);
  if (buckets == 0) return -1;

  const slot: i32 = __Porffor_hashtableFindSlot(container, key, __Porffor_hashSvz(key));
  if (slot == -1) return -1;
  return Porffor.IR.loadI32(buckets + slot * 4, 0) - 1;
};

export const __Porffor_hashtableAppend = (container: any, key: any): i32 => {
  const keys: any[] = Porffor.IR.loadI32(container, 0);
  const index: i32 = keys.length;
  Porffor.array.fastPush(keys, key);

  let buckets: i32 = Porffor.IR.loadI32(container, 8);
  if (buckets == 0) {
    __Porffor_hashtableRebuild(container, 8);
    return index;
  }

  const capacity: i32 = Porffor.IR.loadI32(container, 12);
  // grow at 0.75 load (tombstones occupy slots)
  if ((index + 1) * 4 > capacity * 3) {
    __Porffor_hashtableCompact(container);
    const live: i32 = keys.length;
    if (live * 4 > capacity * 3) __Porffor_hashtableRebuild(container, capacity * 2);
    return keys.length - 1;
  }

  __Porffor_hashtableInsert(container, __Porffor_hashSvz(key), index);
  return index;
};

export const __Porffor_hashtableTombstone = (container: any, key: any, index: any): void => {
  const keys: any[] = Porffor.IR.loadI32(container, 0);
  const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
  const buckets: i32 = Porffor.IR.loadI32(container, 8);

  const slot: i32 = __Porffor_hashtableFindSlot(container, key, __Porffor_hashSvz(key));
  Porffor.IR.storeI32(buckets + slot * 4, 0, -1);

  const keyPtr: i32 = keysEntries + index * 8;
  Porffor.IR.storeU64(keyPtr, 0, -1);

  const vals: i32 = Porffor.IR.loadI32(container, 4);
  if (vals != 0) {
    const valPtr: i32 = Porffor.IR.loadI32(vals, 4) + index * 8;
    Porffor.IR.storeJv(valPtr, 0, undefined);
  }

  const tombstones: i32 = Porffor.IR.loadI32(container, 16) + 1;
  Porffor.IR.storeI32(container, 16, tombstones);

  if (tombstones * 2 > keys.length) __Porffor_hashtableCompact(container);
};

export const __Porffor_hashtableNew = (withVals: boolean): any => {
  const out: any = Porffor.malloc(20);

  const keys: any[] = Porffor.array.new(4);
  Porffor.IR.storeI32(out, 0, keys);
  if (withVals) {
    const vals: any[] = Porffor.array.new(4);
    Porffor.IR.storeI32(out, 4, vals);
  } else {
    Porffor.IR.storeI32(out, 4, 0);
  }
  Porffor.IR.storeI32(out, 8, 0);
  Porffor.IR.storeI32(out, 12, 0);
  Porffor.IR.storeI32(out, 16, 0);

  return out;
};
