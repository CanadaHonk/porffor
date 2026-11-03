import type {} from './porffor.d.ts';

// __memory layout__
// per object (16):
//  size (u16, 2)
//  capacity (u16, 2)
//  root flags (u8, 1):
//   inextensible - 0b0001
//   raw JSON - 0b0100
//   key index - 0b1000
//   on a cached prototype chain - 0b10000
//   key index stale - 0b100000
//   made an object as its prototype - 0b1000000
//  prototype type (u8, 1)
//  shape (u16, 2): id of the keys (0 = none: a dictionary of entries)
//  prototype (u32, 4)
//  values pointer (u32, 4): see __Porffor_object_valuesBytes, or for dictionaries the entries
// dictionaries have entries of 20:
//  key - hash (u32, 4)
//  key - value (u32, 4)
//  value (f64, 8) or accessor pair (u32, 4 each)
//  flags (u8, 1):
//   accessor - 0b0001
//   configurable - 0b0010
//   enumerable - 0b0100
//   writable - 0b1000
//  value - type (u8, 1)
//  key - type (u8, 1)
//  padding (u8, 1)
// 20-byte stride means the value payload is only 8-aligned every other entry: it needs unaligned loads/stores
// objects with a capacity of 16+ (a power of 2) keep a key index after their entries:
//  capacity * 2 u16 slots of entry index + 1 (0 empty), open addressed by key hash
//  packed 8 per 20 bytes so the gc, which scans whole entries blocks, reads zero flags/types

// hash key for hashmap
export const __Porffor_object_hashMix = (hash: i32, word: i32): i32 => {
  hash += word * 3266489917;
  hash = (hash << 17) | (hash >>> 15);
  return hash * 668265263;
};

export const __Porffor_object_hashAvalanche = (hash: i32): i32 => {
  hash = (hash ^ (hash >>> 15)) * 2246822519;
  hash = (hash ^ (hash >>> 13)) * 3266489917;
  return hash ^ (hash >>> 16);
};

export const __Porffor_object_hash = (key: any): i32 => {
  if (Porffor.comptime.flag`hasType.symbol`) {
    if (Porffor.type(key) == Porffor.TYPES.symbol) {
      // symbol, hash is unused so just return 0
      return 0;
    }
  }

  // bytestring or string, xxh32-based hash
  let p: i32 = Porffor.IR.ptr(key);
  const len: i32 = Porffor.IR.loadI32(key, 0);
  let hash: i32 = 374761393;

  if (Porffor.type(key) == Porffor.TYPES.string) {
    const stringEnd: i32 = p + len * 2;
    let word: i32 = 0;
    let shift: i32 = 0;

    while (p < stringEnd) {
      const chr: i32 = Porffor.IR.loadU16(p, 4);
      p += 2;

      word |= (chr & 0xFF) << shift;
      shift += 8;
      if (shift == 32) {
        hash = __Porffor_object_hashMix(hash, word);
        word = 0;
        shift = 0;
      }

      const high: i32 = chr >> 8;
      if (high != 0) {
        word |= high << shift;
        shift += 8;
        if (shift == 32) {
          hash = __Porffor_object_hashMix(hash, word);
          word = 0;
          shift = 0;
        }
      }
    }

    if (shift != 0) hash = __Porffor_object_hashMix(hash, word);
    return __Porffor_object_hashAvalanche(hash);
  }

  const end: i32 = p + len;
  while (p + 4 <= end) {
    hash = __Porffor_object_hashMix(hash, Porffor.IR.loadI32(p, 4));
    p += 4;
  }

  if (p != end) {
    const mask: i32 = (1 << ((end - p) * 8)) - 1;
    hash = __Porffor_object_hashMix(hash, Porffor.IR.loadI32(p, 4) & mask);
  }

  return __Porffor_object_hashAvalanche(hash);
};

export const __Porffor_object_writeKey = (ptr: i32, key: any, hash: i32): void => {
  Porffor.IR.storeI32(ptr, 0, hash);

  Porffor.IR.storeI32(ptr, 4, key);
  Porffor.IR.storeU8(ptr, 18, Porffor.type(key));
};

// capacity rounded up for a key index, 0 if too small or large for one
export const __Porffor_object_indexedCapacity = (capacity: i32): i32 => {
  if (Porffor.fastOr(capacity < 16, capacity > 32768)) return 0;
  let out: i32 = 16;
  while (out < capacity) out *= 2;
  return out;
};

export const __Porffor_object_new = (capacity: i32 = 4): object => {
  if (capacity > 8) capacity = ((capacity + 7) >> 3) << 3;
  const obj: object = Porffor.malloc(16 + __Porffor_object_valuesBytes(capacity));
  Porffor.IR.storeU16(obj, 0, 0);
  Porffor.IR.storeU16(obj, 2, capacity);
  Porffor.IR.storeU8(obj, 4, 0);
  Porffor.IR.storeU16(obj, 6, 1);
  Porffor.IR.storeU8(obj, 5, 0);
  Porffor.IR.storeI32(obj, 8, 0);
  Porffor.IR.storeI32(obj, 12, Porffor.IR.ptr(obj) + 16);
  return obj;
};

export const __Porffor_object_entriesPtr = (obj: any): i32 => {
  return Porffor.IR.loadI32(obj, 12);
};

export const __Porffor_object_ensureCapacity = (obj: any, needed: i32): i32 => {
  let capacity: i32 = Porffor.IR.loadU16(obj, 2);
  const entriesPtr: i32 = Porffor.IR.loadI32(obj, 12);
  if (needed <= capacity) return entriesPtr;

  if (capacity == 0) capacity = 1;
  while (capacity < needed) capacity *= 2;
  if (Porffor.IR.loadU16(obj, 6) != 0) {
    // copied slot by slot so slots past the size stay zero for the gc's whole-block scans
    if (capacity > 8) capacity = ((capacity + 7) >> 3) << 3;
    const values: i32 = Porffor.malloc(__Porffor_object_valuesBytes(capacity));
    const count: i32 = Porffor.IR.loadU16(obj, 0);
    for (let i: i32 = 0; i < count; i++) {
      Porffor.IR.storeF64(__Porffor_object_valueAt(values, i), 0, Porffor.IR.loadF64(__Porffor_object_valueAt(entriesPtr, i), 0));
      Porffor.IR.storeU8(__Porffor_object_typeAt(values, i), 0, Porffor.IR.loadU8(__Porffor_object_typeAt(entriesPtr, i), 0));
    }
    Porffor.IR.storeU16(obj, 2, capacity);
    Porffor.IR.storeI32(obj, 12, values);
    Porffor.IR.gcBarrier(obj, Porffor.TYPES.object);
    return values;
  }
  const indexed: i32 = __Porffor_object_indexedCapacity(capacity);
  if (indexed != 0) capacity = indexed;

  const newEntriesPtr: i32 = Porffor.malloc(capacity * (indexed != 0 ? 25 : 20));
  const size: i32 = Porffor.IR.loadU16(obj, 0);
  if (size > 0) {
    Porffor.IR.copy(newEntriesPtr, entriesPtr, size * 20);
  }

  Porffor.IR.storeU16(obj, 2, capacity);
  Porffor.IR.storeI32(obj, 12, newEntriesPtr);
  if (indexed != 0) {
    Porffor.IR.storeU8(obj, 4, Porffor.IR.loadU8(obj, 4) | 0b1000);
    __Porffor_object_rebuildIndex(obj);
  } else if (Porffor.IR.loadU8(obj, 4) & 0b1000) {
    Porffor.IR.storeU8(obj, 4, Porffor.IR.loadU8(obj, 4) & 0b11010111);
  }
  Porffor.IR.gcBarrier(obj, Porffor.TYPES.object);
  return newEntriesPtr;
};

// set once Object.prototype or Array.prototype (flag 0b0010) may have index keys: until then holes skip prototype lookups
let indexKeysUsed: i32 = 0;
export const __Porffor_object_indexKeysUsed = (): i32 => indexKeysUsed;

// shaped objects keep only values, their shape's descriptors hold the keys
// shape node (24):
//  key hash (i32, 4), parent (u16, 2), key count (u16, 2), descriptors (u32, 4), key index (u32, 4, 0 until built),
//  key (u32, 4), flags (u8, 1), key type (u8, 1)
// roots: 1 empty, 2 object prototypes (keyed by the prototype ptr), 3 other prototypes
// descriptors (shared down a chain, children append): used (u32, 4), capacity (u32, 4), then per key (12):
//  hash (i32, 4), key (u32, 4), flags (u8, 1), key type (u8, 1)
let shapeTable: i32 = 0;
let shapeCount: i32 = 0;
// number of roots given to prototypes without a constructor
let plainProtoRoots: i32 = 0;
let shapeCap: i32 = 0;

// transitions in an open addressed table of child ids (u16), keyed by (parent, key hash, flags)
let shapeHash: i32 = 0;
let shapeHashCap: i32 = 0;

export const __Porffor_object_shapeHashSlot = (shape: i32, hash: i32, flags: i32): i32 => {
  return __Porffor_object_hashAvalanche(hash ^ (shape << 16) ^ (flags << 8)) & (shapeHashCap - 1);
};

export const __Porffor_object_shapeDescriptors = (shape: i32): i32 => Porffor.IR.loadI32(shapeTable + shape * 24, 8);

// child of shape adding key with flags (the prototype for roots 2 and 3), 0 when out of shapes, symbols by pointer
export const __Porffor_object_shapeTransition = (shape: i32, key: any, hash: i32, flags: i32): i32 => {
  let id: i32 = hash;
  if (Porffor.type(key) == Porffor.TYPES.symbol) id = Porffor.IR.ptr(key);
  if (shapeTable == 0) {
    shapeCap = 1024;
    shapeCount = 4;
    shapeTable = Porffor.malloc(shapeCap * 24);
    shapeHashCap = 4096;
    shapeHash = Porffor.malloc(shapeHashCap * 2);
  }

  let slot: i32 = __Porffor_object_shapeHashSlot(shape, id, flags);
  while (true) {
    const child: i32 = Porffor.IR.loadU16(shapeHash + slot * 2, 0);
    if (child == 0) break;
    const node: i32 = shapeTable + child * 24;
    if (Porffor.fastAnd(Porffor.IR.loadU16(node, 4) == shape, Porffor.IR.loadI32(node, 0) == id, Porffor.IR.loadU8(node, 20) == flags)) {
      if (Porffor.fastOr(shape == 2, shape == 3, Porffor.IR.loadI32(node, 16) == Porffor.IR.ptr(key))) return child;
      const keyType: i32 = Porffor.IR.loadU8(node, 21);
      if (Porffor.fastAnd(Porffor.type(key) != Porffor.TYPES.symbol, keyType != Porffor.TYPES.symbol)) if (Porffor.strcmp(key, Porffor.as(Porffor.IR.loadI32(node, 16), keyType))) return child;
    }
    slot = (slot + 1) & (shapeHashCap - 1);
  }

  if (shapeCount >= 65535) return 0;
  // prototypes without a constructor get a root from their second object, capped so Object.create(obj) can't exhaust shapes
  if (shape == 2) if (Porffor.IR.ptr(key) != 0) if (__Porffor_object_find(key, 'constructor', __Porffor_object_hash('constructor')) == 0) {
    const protoFlags: i32 = Porffor.IR.loadU8(key, 4);
    if ((protoFlags & 0b1000000) == 0) {
      Porffor.IR.storeU8(key, 4, protoFlags | 0b1000000);
      return 0;
    }
    if (plainProtoRoots >= 2048) return 0;
    plainProtoRoots++;
  }
  if (shapeCount >= shapeCap) {
    const newTable: i32 = Porffor.malloc(shapeCap * 48);
    Porffor.IR.copy(newTable, shapeTable, shapeCap * 24);
    shapeTable = newTable;
    shapeCap *= 2;
  }

  const parent: i32 = shapeTable + shape * 24;
  const child: i32 = shapeCount++;
  const node: i32 = shapeTable + child * 24;
  Porffor.IR.storeI32(node, 0, id);
  Porffor.IR.storeU16(node, 4, shape);
  Porffor.IR.storeU8(node, 20, flags);
  Porffor.IR.storeU16(shapeHash + slot * 2, 0, child);

  if (Porffor.fastAnd(shape != 2, shape != 3)) {
    const count: i32 = Porffor.IR.loadU16(parent, 6);
    Porffor.IR.storeI32(node, 16, Porffor.IR.ptr(key));
    Porffor.IR.storeU8(node, 21, Porffor.type(key));
    Porffor.IR.storeU16(node, 6, count + 1);

    // append to the parent's descriptors while they end at it, else copy its prefix
    let desc: i32 = Porffor.IR.loadI32(parent, 8);
    if (Porffor.fastOr(desc == 0, Porffor.IR.loadI32(desc, 0) != count, Porffor.IR.loadI32(desc, 4) == count)) {
      let cap: i32 = count * 2;
      if (cap < 4) cap = 4;
      const newDesc: i32 = Porffor.malloc(8 + cap * 12);
      if (count > 0) Porffor.IR.copy(newDesc + 8, desc + 8, count * 12);
      Porffor.IR.storeI32(newDesc, 4, cap);
      desc = newDesc;
    }

    const d: i32 = desc + 8 + count * 12;
    Porffor.IR.storeI32(d, 0, hash);
    Porffor.IR.storeI32(d, 4, Porffor.IR.ptr(key));
    Porffor.IR.storeU8(d, 8, flags);
    Porffor.IR.storeU8(d, 9, Porffor.type(key));
    Porffor.IR.storeI32(desc, 0, count + 1);
    Porffor.IR.storeI32(node, 8, desc);
  }


  // keep under half full: rehash every shape but the roots
  if (shapeCount * 2 > shapeHashCap) {
    shapeHashCap *= 2;
    shapeHash = Porffor.malloc(shapeHashCap * 2);
    for (let i: i32 = 4; i < shapeCount; i++) {
      const base: i32 = shapeTable + i * 24;
      let s2: i32 = __Porffor_object_shapeHashSlot(Porffor.IR.loadU16(base, 4), Porffor.IR.loadI32(base, 0), Porffor.IR.loadU8(base, 20));
      while (Porffor.IR.loadU16(shapeHash + s2 * 2, 0) != 0) s2 = (s2 + 1) & (shapeHashCap - 1);
      Porffor.IR.storeU16(shapeHash + s2 * 2, 0, i);
    }
  }
  return child;
};

// index + 1 of hash in a shape's keys, 0 if absent, 12+ keys via a lazily built index
export const __Porffor_object_shapeFind = (shape: i32, hash: i32): i32 => {
  // no keys, and no table before the first transition
  if (shape == 1) return 0;
  const node: i32 = shapeTable + shape * 24;
  const count: i32 = Porffor.IR.loadU16(node, 6);
  if (count >= 12) return __Porffor_object_shapeFindIndexed(node, count, hash);
  const desc: i32 = Porffor.IR.loadI32(node, 8) + 8;
  for (let i: i32 = 0; i < count; i++) {
    if (Porffor.IR.loadI32(desc + i * 12, 0) == hash) return i + 1;
  }
  return 0;
};

export const __Porffor_object_shapeFindIndexed = (node: i32, count: i32, hash: i32): i32 => {
  const desc: i32 = Porffor.IR.loadI32(node, 8);
  let index: i32 = Porffor.IR.loadI32(node, 12);
  let mask: i32 = 32;
  while (mask < count * 2) mask *= 2;
  mask -= 1;
  if (index == 0) {
    index = Porffor.malloc((mask + 1) * 2);
    for (let i: i32 = 0; i < count; i++) {
      let s: i32 = Porffor.IR.loadI32(desc + 8 + i * 12, 0) & mask;
      while (Porffor.IR.loadU16(index + s * 2, 0) != 0) s = (s + 1) & mask;
      Porffor.IR.storeU16(index + s * 2, 0, i + 1);
    }
    Porffor.IR.storeI32(node, 12, index);
  }

  let s: i32 = hash & mask;
  while (true) {
    const i: i32 = Porffor.IR.loadU16(index + s * 2, 0);
    if (i == 0) return 0;
    if (Porffor.IR.loadI32(desc + 8 + (i - 1) * 12, 0) == hash) return i;
    s = (s + 1) & mask;
  }
};

// values: groups of 8 slots, 8 types (u8) then 8 values (f64), up to 8 slots as one partial group
export const __Porffor_object_valuesBytes = (capacity: i32): i32 => {
  if (capacity <= 8) return 8 + capacity * 8;
  return capacity * 9;
};

export const __Porffor_object_valueAt = (values: i32, i: i32): i32 => values + 8 + i * 8 + ((i >> 3) << 3);
export const __Porffor_object_typeAt = (values: i32, i: i32): i32 => values + i + ((i >> 3) << 6);

// accessor slots hold their getter and setter (u32 each) as their value, with this type
export const __Porffor_object_accessorType = (): i32 => 255;

// to 20 byte entries (shape 0), for anything shapes do not describe
export const __Porffor_object_dictionary = (obj: any): void => {
  const shape: i32 = Porffor.IR.loadU16(obj, 6);
  if (shape == 0) return;
  __Porffor_object_icInvalidate(obj);

  const size: i32 = Porffor.IR.loadU16(obj, 0);
  const desc: i32 = __Porffor_object_shapeDescriptors(shape);
  const entries: i32 = __Porffor_object_valuesToEntries(obj);
  for (let i: i32 = 0; i < size; i++) {
    const entryPtr: i32 = entries + i * 20;
    const d: i32 = desc + 8 + i * 12;
    Porffor.IR.storeI32(entryPtr, 0, Porffor.IR.loadI32(d, 0));
    Porffor.IR.storeI32(entryPtr, 4, Porffor.IR.loadI32(d, 4));
    Porffor.IR.storeU8(entryPtr, 16, Porffor.IR.loadU8(d, 8));
    Porffor.IR.storeU8(entryPtr, 18, Porffor.IR.loadU8(d, 9));
  }
  Porffor.IR.gcBarrier(obj, Porffor.TYPES.object);
};

// shaped values to entries without keys or flags, which the caller writes before its gc barrier
export const __Porffor_object_valuesToEntries = (obj: any): i32 => {
  const size: i32 = Porffor.IR.loadU16(obj, 0);
  const values: i32 = Porffor.IR.loadI32(obj, 12);
  let capacity: i32 = 4;
  while (capacity < size) capacity *= 2;
  const indexed: i32 = __Porffor_object_indexedCapacity(capacity);
  if (indexed != 0) capacity = indexed;

  const entries: i32 = Porffor.malloc(capacity * (indexed != 0 ? 25 : 20));
  for (let i: i32 = 0; i < size; i++) {
    const entryPtr: i32 = entries + i * 20;
    Porffor.IR.storeUnF64(entryPtr, 8, Porffor.IR.loadF64(__Porffor_object_valueAt(values, i), 0));
    Porffor.IR.storeU8(entryPtr, 17, Porffor.IR.loadU8(__Porffor_object_typeAt(values, i), 0));
  }

  Porffor.IR.storeU16(obj, 2, capacity);
  Porffor.IR.storeI32(obj, 12, entries);
  Porffor.IR.storeU16(obj, 6, 0);
  if (indexed != 0) Porffor.IR.storeU8(obj, 4, Porffor.IR.loadU8(obj, 4) | 0b101000);
  return entries;
};

// slot index + 1 of a key in either layout, 0 if absent
export const __Porffor_object_find = (obj: any, key: any, hash: i32): i32 => {
  if (Porffor.IR.ptr(obj) == 0) return 0;
  const shape: i32 = Porffor.IR.loadU16(obj, 6);
  if (shape == 0) {
    const entryPtr: i32 = __Porffor_object_lookupEntry(obj, key, hash);
    if (entryPtr == 0) return 0;
    return (entryPtr - Porffor.IR.loadI32(obj, 12)) / 20 + 1;
  }

  if (Porffor.comptime.flag`hasType.symbol`) {
    if (Porffor.type(key) == Porffor.TYPES.symbol) {
      const count: i32 = Porffor.IR.loadU16(obj, 0);
      const desc: i32 = __Porffor_object_shapeDescriptors(shape);
      for (let i: i32 = 0; i < count; i++) {
        const d: i32 = desc + 8 + i * 12;
        if (Porffor.fastAnd(Porffor.IR.loadI32(d, 4) == Porffor.IR.ptr(key), Porffor.IR.loadU8(d, 9) == Porffor.TYPES.symbol)) return i + 1;
      }
      return 0;
    }
  }
  return __Porffor_object_shapeFind(shape, hash);
};

export const __Porffor_object_slotFlags = (obj: any, i: i32): i32 => {
  const shape: i32 = Porffor.IR.loadU16(obj, 6);
  if (shape == 0) return Porffor.IR.loadU8(Porffor.IR.loadI32(obj, 12) + i * 20, 16);
  return Porffor.IR.loadU8(__Porffor_object_shapeDescriptors(shape) + 8 + i * 12, 8);
};

export const __Porffor_object_slotHash = (obj: any, i: i32): i32 => {
  const shape: i32 = Porffor.IR.loadU16(obj, 6);
  if (shape == 0) return Porffor.IR.loadI32(Porffor.IR.loadI32(obj, 12) + i * 20, 0);
  return Porffor.IR.loadI32(__Porffor_object_shapeDescriptors(shape) + 8 + i * 12, 0);
};

export const __Porffor_object_slotKey = (obj: any, i: i32): any => {
  const shape: i32 = Porffor.IR.loadU16(obj, 6);
  if (shape == 0) {
    const entryPtr: i32 = Porffor.IR.loadI32(obj, 12) + i * 20;
    return Porffor.as(Porffor.IR.loadI32(entryPtr, 4), Porffor.IR.loadU8(entryPtr, 18));
  }
  const d: i32 = __Porffor_object_shapeDescriptors(shape) + 8 + i * 12;
  return Porffor.as(Porffor.IR.loadI32(d, 4), Porffor.IR.loadU8(d, 9));
};

// address of a slot's value (or accessor pair), its type at +9 for entries
export const __Porffor_object_slotPtr = (obj: any, i: i32): i32 => {
  if (Porffor.IR.loadU16(obj, 6) == 0) return Porffor.IR.loadI32(obj, 12) + i * 20 + 8;
  return __Porffor_object_valueAt(Porffor.IR.loadI32(obj, 12), i);
};

export const __Porffor_object_slotValue = (obj: any, i: i32): any => {
  if (Porffor.IR.loadU16(obj, 6) == 0) return __Porffor_object_readValue(Porffor.IR.loadI32(obj, 12) + i * 20);
  const values: i32 = Porffor.IR.loadI32(obj, 12);
  return Porffor.as(Porffor.IR.loadF64(__Porffor_object_valueAt(values, i), 0), Porffor.IR.loadU8(__Porffor_object_typeAt(values, i), 0));
};

export const __Porffor_object_slotWrite = (obj: any, i: i32, value: any): void => {
  if (Porffor.IR.loadU16(obj, 6) == 0) {
    const entryPtr: i32 = Porffor.IR.loadI32(obj, 12) + i * 20;
    Porffor.IR.storeUnF64(entryPtr, 8, value);
    Porffor.IR.storeU8(entryPtr, 17, Porffor.type(value));
  } else {
    const values: i32 = Porffor.IR.loadI32(obj, 12);
    Porffor.IR.storeF64(__Porffor_object_valueAt(values, i), 0, value);
    Porffor.IR.storeU8(__Porffor_object_typeAt(values, i), 0, Porffor.type(value));
  }
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, value);
};

export const __Porffor_object_slotGetter = (obj: any, i: i32): Function|undefined => {
  const out: Function = Porffor.IR.loadI32(__Porffor_object_slotPtr(obj, i), 0);
  if (Porffor.IR.ptr(out) == 0) return undefined;
  return out;
};

export const __Porffor_object_slotSetter = (obj: any, i: i32): Function|undefined => {
  const out: Function = Porffor.IR.loadI32(__Porffor_object_slotPtr(obj, i), 4);
  if (Porffor.IR.ptr(out) == 0) return undefined;
  return out;
};

export const __Porffor_object_slotRead = (obj: any, i: i32, receiver: any): any => {
  if (__Porffor_object_slotFlags(obj, i) & 0b0001) {
    const get: Function = __Porffor_object_slotGetter(obj, i);
    if (Porffor.IR.ptr(get) == 0) return undefined;
    return Porffor.callThis(get, receiver);
  }
  return __Porffor_object_slotValue(obj, i);
};

// adds an absent key with flags, returns its index (the caller writes the value or accessor pair)
export const __Porffor_object_add = (obj: any, key: any, hash: i32, flags: i32): i32 => {
  __Porffor_object_icInvalidate(obj);
  if (Porffor.IR.loadU8(obj, 4) & 0b0010) {
    const keyType: i32 = Porffor.type(key);
    if (Porffor.fastOr(keyType == Porffor.TYPES.string, keyType == Porffor.TYPES.bytestring)) {
      const keyPtr: i32 = Porffor.IR.ptr(key);
      if (Porffor.IR.loadI32(keyPtr, 0) > 0) {
        let c: i32 = Porffor.IR.loadU8(keyPtr, 4);
        if (keyType == Porffor.TYPES.string) c = Porffor.IR.loadU16(keyPtr, 4);
        if (Porffor.fastAnd(c >= 48, c <= 57)) indexKeysUsed = 1;
      }
    }
  }

  const size: i32 = Porffor.IR.loadU16(obj, 0);
  const shape: i32 = Porffor.IR.loadU16(obj, 6);
  if (shape != 0) {
    // objects grown key by key past 64 are used as dictionaries
    let next: i32 = 0;
    if (size < 64) next = __Porffor_object_shapeTransition(shape, key, hash, flags);
    if (next != 0) {
      const values: i32 = __Porffor_object_ensureCapacity(obj, size + 1);
      Porffor.IR.storeU8(__Porffor_object_typeAt(values, size), 0, 0);
      Porffor.IR.storeU16(obj, 0, size + 1);
      Porffor.IR.storeU16(obj, 6, next);
      return size;
    }
    __Porffor_object_dictionary(obj);
  }

  const entryPtr: i32 = __Porffor_object_ensureCapacity(obj, size + 1) + size * 20;
  Porffor.IR.storeU16(obj, 0, size + 1);
  __Porffor_object_writeKey(entryPtr, key, hash);
  Porffor.IR.storeU8(entryPtr, 16, flags);
  Porffor.IR.storeU8(entryPtr, 17, 0);
  __Porffor_object_indexAppend(obj, size, hash);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, key);
  return size;
};

// changed flags make a shaped object a dictionary
export const __Porffor_object_setSlotFlags = (obj: any, i: i32, flags: i32): void => {
  if (Porffor.IR.loadU16(obj, 6) != 0) {
    if (__Porffor_object_slotFlags(obj, i) == flags) return;
    __Porffor_object_dictionary(obj);
  }
  __Porffor_object_icInvalidate(obj);
  Porffor.IR.storeU8(Porffor.IR.loadI32(obj, 12) + i * 20, 16, flags);
};

// object literal sites: values were stored directly, the shape of their keys is cached per site
export const __Porffor_object_literalShape = (obj: any, slot: i32, keys: any[]): void => {
  let shape: i32 = 1;
  for (let i: i32 = 0; i < keys.length; i++) {
    const key: any = keys[i];
    shape = __Porffor_object_shapeTransition(shape, key, __Porffor_object_hash(key), 0b1110);
    if (shape == 0) break;
  }

  if (shape != 0) {
    Porffor.IR.storeI32(slot, 0, shape);
    Porffor.IR.storeU16(obj, 6, shape);
    return;
  }

  // out of shapes: entries from the stored values
  const size: i32 = Porffor.IR.loadU16(obj, 0);
  const entries: i32 = __Porffor_object_valuesToEntries(obj);
  for (let i: i32 = 0; i < size; i++) {
    const entryPtr: i32 = entries + i * 20;
    const key: any = keys[i];
    __Porffor_object_writeKey(entryPtr, key, __Porffor_object_hash(key));
    Porffor.IR.storeU8(entryPtr, 16, 0b1110);
  }
  Porffor.IR.gcBarrier(obj, Porffor.TYPES.object);
};

// bumped by key, accessor or prototype changes to objects flagged as on a cached chain
let icEpoch: i32 = 0;

export const __Porffor_object_icEpoch = (): i32 => icEpoch;

export const __Porffor_object_icInvalidate = (obj: any): void => {
  if (Porffor.IR.loadU8(obj, 4) & 0b10000) icEpoch += 1;
};

export const __Porffor_object_icFlagProto = (obj: any): void => {
  const flags: i32 = Porffor.IR.loadU8(obj, 4);
  if ((flags & 0b10000) == 0) {
    Porffor.IR.storeU8(obj, 4, flags | 0b10000);
    icEpoch += 1;
  }
};

// flags every prototype of a plain object, false if the chain has anything but objects
export const __Porffor_object_icFlagChain = (obj: any): boolean => {
  const protoType: i32 = Porffor.IR.loadU8(obj, 5);
  if (Porffor.fastAnd(protoType != Porffor.TYPES.object, protoType != Porffor.TYPES.undefined)) return false;
  let proto: any = protoType == Porffor.TYPES.undefined ? __Object_prototype : Porffor.as(Porffor.IR.loadI32(obj, 8), Porffor.TYPES.object);
  let last: any = proto;
  while (true) {
    if (Porffor.fastOr(Porffor.type(proto) != Porffor.TYPES.object, Porffor.IR.ptr(proto) == 0)) return Porffor.IR.ptr(proto) == 0;
    __Porffor_object_icFlagProto(proto);
    proto = __Porffor_object_getPrototype(proto);
    if (Porffor.type(proto) == Porffor.TYPES.undefined) proto = __Object_prototype;
    if (Porffor.IR.ptr(proto) == Porffor.IR.ptr(last)) return true;
    last = proto;
  }
};

export const __Porffor_object_indexSlot = (index: i32, n: i32): i32 => index + (n >> 3) * 20 + (n & 7) * 2;

export const __Porffor_object_rebuildIndex = (obj: any): void => {
  const size: i32 = Porffor.IR.loadU16(obj, 0);
  const capacity: i32 = Porffor.IR.loadU16(obj, 2);
  const entriesPtr: i32 = Porffor.IR.loadI32(obj, 12);
  const index: i32 = entriesPtr + capacity * 20;
  const mask: i32 = capacity * 2 - 1;
  Porffor.IR.fill(index, 0, capacity * 5);
  for (let i: i32 = 0; i < size; i++) {
    let slot: i32 = Porffor.IR.loadI32(entriesPtr + i * 20, 0) & mask;
    while (Porffor.IR.loadU16(__Porffor_object_indexSlot(index, slot), 0) != 0) slot = (slot + 1) & mask;
    Porffor.IR.storeU16(__Porffor_object_indexSlot(index, slot), 0, i + 1);
  }
  Porffor.IR.storeU8(obj, 4, Porffor.IR.loadU8(obj, 4) & 0b11011111);
};

// entry i was just added: index it if the index is current
export const __Porffor_object_indexAppend = (obj: any, i: i32, hash: i32): void => {
  if ((Porffor.IR.loadU8(obj, 4) & 0b101000) != 0b1000) return;
  const capacity: i32 = Porffor.IR.loadU16(obj, 2);
  const index: i32 = Porffor.IR.loadI32(obj, 12) + capacity * 20;
  const mask: i32 = capacity * 2 - 1;
  let slot: i32 = hash & mask;
  while (Porffor.IR.loadU16(__Porffor_object_indexSlot(index, slot), 0) != 0) slot = (slot + 1) & mask;
  Porffor.IR.storeU16(__Porffor_object_indexSlot(index, slot), 0, i + 1);
};

// internal adds (builtin objects, string index props) of an absent key and its value
export const __Porffor_object_fastAdd = (obj: any, key: any, value: any, flags: i32): void => {
  const i: i32 = __Porffor_object_add(obj, key, __Porffor_object_hash(key), flags);
  __Porffor_object_slotWrite(obj, i, value);
};

export const __Porffor_object_readValue = (entryPtr: i32): any => {
  return Porffor.as(Porffor.IR.loadUnF64(entryPtr, 8), Porffor.IR.loadU8(entryPtr, 17));
};

// store underlying (real) objects for hidden types
let underlyingStore: i32 = 0;
let underlyingBuckets: i32 = 0;
let underlyingBucketsCap: i32 = 0;

export const __Porffor_underlyingInsertEntry = (base: i32, index: i32): void => {
  let hash: i32 = Porffor.IR.ptr(Porffor.IR.loadJv(base, 0));
  hash = hash >>> 3;
  hash ^= hash >>> 16;
  hash *= 0x7feb352d;
  hash ^= hash >>> 15;
  hash ^= Porffor.IR.loadU8(base, 12);

  let slot: i32 = hash & (underlyingBucketsCap - 1);
  while (true) {
    if (Porffor.IR.loadI32(underlyingBuckets + slot * 4, 0) == 0) {
      Porffor.IR.storeI32(underlyingBuckets + slot * 4, 0, index + 1);
      return;
    }

    slot = (slot + 1) & (underlyingBucketsCap - 1);
  }
};

export const __Porffor_underlyingRebuild = (): void => {
  let len: i32 = Porffor.IR.loadI32(underlyingStore, 0);
  // room to double before inserts rebuild again
  let cap: i32 = 16;
  while (cap * 3 < (len + 1) * 8) cap *= 2;

  underlyingBuckets = Porffor.malloc(cap * 4);
  Porffor.IR.fill(underlyingBuckets, 0, cap * 4);
  underlyingBucketsCap = cap;

  len = Porffor.IR.loadI32(underlyingStore, 0);

  for (let i: i32 = 0; i < len; i++) {
    __Porffor_underlyingInsertEntry(underlyingStore + 8 + i * 16, i);
  }
};

export const __Porffor_object_underlyingPtr = (_obj: any): i32 => {
  // arrays cache their underlying object in header slot 12
  if (Porffor.type(_obj) == Porffor.TYPES.array) return Porffor.IR.loadI32(_obj, 12);
  if (underlyingStore == 0) return 0;
  if (Porffor.IR.loadI32(underlyingStore, 0) == 0) return 0;
  if (underlyingBuckets == 0) __Porffor_underlyingRebuild();

  const objType: i32 = Porffor.type(_obj);
  let lookupHash: i32 = Porffor.IR.ptr(_obj);
  lookupHash = lookupHash >>> 3;
  lookupHash ^= lookupHash >>> 16;
  lookupHash *= 0x7feb352d;
  lookupHash ^= lookupHash >>> 15;
  lookupHash ^= objType;

  let slot: i32 = lookupHash & (underlyingBucketsCap - 1);
  while (true) {
    const entry: i32 = Porffor.IR.loadI32(underlyingBuckets + slot * 4, 0);
    if (entry == 0) return 0;

    const base: i32 = underlyingStore + 8 + (entry - 1) * 16;
    if (Porffor.fastAnd(
      Porffor.IR.ptr(Porffor.IR.loadJv(base, 0)) == Porffor.IR.ptr(_obj),
      Porffor.IR.loadU8(base, 12) == objType
    ))
      return Porffor.IR.loadI32(base, 8);

    slot = (slot + 1) & (underlyingBucketsCap - 1);
  }
};

// these types materialize own props into their underlying object, reads of other types need not create one
export const __Porffor_object_underlyingToRead = (_obj: any, t: i32): any => {
  if (Porffor.fastOr(
    t == Porffor.TYPES.function, t == Porffor.TYPES.regexp,
    t == Porffor.TYPES.string, t == Porffor.TYPES.stringobject, t == Porffor.TYPES.bytestring,
    Porffor.fastAnd(t >= Porffor.TYPES.error, t <= Porffor.TYPES.suppressederror),
    t == Porffor.TYPES.__porffor_generator, t == Porffor.TYPES.__porffor_asyncgenerator
  )) return __Porffor_object_underlying(_obj);
  return __Porffor_object_underlyingIfAny(_obj);
};

export const __Porffor_object_underlyingIfAny = (_obj: any): any => {
  const objType: i32 = Porffor.type(_obj);
  if (objType == Porffor.TYPES.object) return _obj;
  if (objType <= 0x05) return null;

  const ptr: i32 = __Porffor_object_underlyingPtr(_obj);
  if (ptr == 0) return null;
  return ptr as object;
};

export const __Porffor_object_coroutinePrototype = (gen: any, underlying: object): void => {
  const callee: any = Porffor.coroutine.callee(gen);
  if (Porffor.type(callee) != Porffor.TYPES.function) return;

  const proto: any = callee.prototype;
  if (Porffor.object.isObject(proto)) Porffor.object.setPrototype(underlying, proto);
};

// regexp lastIndex lives in the header (i32 at 8) until an underlying object holds it as a real prop (header byte 20 set)
export const __Porffor_object_regexLiKey = (_obj: any, key: any): boolean => {
  if (Porffor.IR.loadU8(_obj, 20) != 0) return false;
  if ((Porffor.type(key) | 0b10000000) != Porffor.TYPES.bytestring) return false;
  return Porffor.strcmp(key, 'lastIndex');
};

export const __Porffor_object_regexLiStore = (_obj: any, value: any): boolean => {
  if (Porffor.type(value) != Porffor.TYPES.number) return false;
  const n: number = value;
  if (n != Math.trunc(n)) return false;
  if (Porffor.fastOr(n > 2147483647, n < -2147483648)) return false;
  if (n == 0) if (1 / n < 0) return false;
  const v: i32 = n;
  Porffor.IR.storeI32(_obj, 8, v);
  return true;
};

export const __Porffor_object_underlying = (_obj: any): any => {
  const objType: i32 = Porffor.type(_obj);
  if (objType == Porffor.TYPES.object) return _obj;

  if (objType > 0x05) {
    if (objType == Porffor.TYPES.array) {
      const cached: i32 = Porffor.IR.loadI32(_obj, 12);
      if (cached != 0) return cached as object;
    }

    if (underlyingStore == 0) {
      underlyingStore = Porffor.malloc();
      Porffor.IR.storeI32(underlyingStore, 0, 0);
      Porffor.IR.storeI32(underlyingStore, 4, 1023);
    }

    let underlyingLength: i32 = Porffor.IR.loadI32(underlyingStore, 0);
    if (Porffor.fastAnd(underlyingBuckets == 0, underlyingLength > 0)) __Porffor_underlyingRebuild();

    if (underlyingBuckets != 0) {
      let lookupHash: i32 = Porffor.IR.ptr(_obj);
      lookupHash = lookupHash >>> 3;
      lookupHash ^= lookupHash >>> 16;
      lookupHash *= 0x7feb352d;
      lookupHash ^= lookupHash >>> 15;
      lookupHash ^= objType;

      let slot: i32 = lookupHash & (underlyingBucketsCap - 1);
      while (true) {
        const entry: i32 = Porffor.IR.loadI32(underlyingBuckets + slot * 4, 0);
        if (entry == 0) break;

        const base: i32 = underlyingStore + 8 + (entry - 1) * 16;
        if (Porffor.fastAnd(
          Porffor.IR.ptr(Porffor.IR.loadJv(base, 0)) == Porffor.IR.ptr(_obj),
          Porffor.IR.loadU8(base, 12) == objType
        ))
          return Porffor.IR.loadI32(base, 8) as object;

        slot = (slot + 1) & (underlyingBucketsCap - 1);
      }
    }

    // grow the weak store before allocating the underlying object: this malloc
    // could otherwise collect the not-yet-registered object
    const capacity: i32 = Porffor.IR.loadI32(underlyingStore, 4);
    if (underlyingLength >= capacity) {
      const newCapacity: i32 = capacity * 2;
      const newStore: i32 = Porffor.malloc(8 + newCapacity * 16);

      underlyingLength = Porffor.IR.loadI32(underlyingStore, 0);
      const copyBytes: i32 = 8 + underlyingLength * 16;
      for (let i: i32 = 0; i < copyBytes; i += 4) {
        Porffor.IR.storeI32(newStore + i, 0, Porffor.IR.loadI32(underlyingStore + i, 0));
      }

      // a stale conservative root to the old store must not mark its dead keys
      Porffor.IR.storeI32(underlyingStore, 0, 0);
      underlyingStore = newStore;
      Porffor.IR.storeI32(underlyingStore, 4, newCapacity);
    }

    let obj: any = _obj;

    let underlyingCapacity: i32 = 4;
    if (Porffor.fastOr(
      objType == Porffor.TYPES.string,
      objType == Porffor.TYPES.stringobject
    )) {
      underlyingCapacity = (obj as string).length + 1;
      if (underlyingCapacity > 4097) underlyingCapacity = 4;
    } else if (objType == Porffor.TYPES.bytestring) {
      underlyingCapacity = (obj as bytestring).length + 1;
      if (underlyingCapacity > 4097) underlyingCapacity = 4;
    }

    const underlying: object = __Porffor_object_new(underlyingCapacity);

    // publish before initialization can allocate, so the GC's underlying-store scanner sees both
    underlyingLength = Porffor.IR.loadI32(underlyingStore, 0);
    Porffor.IR.storeI32(underlyingStore, 0, underlyingLength + 1);
    const base: i32 = underlyingStore + 8 + underlyingLength * 16;
    Porffor.IR.storeJv(base, 0, _obj);
    Porffor.IR.storeI32(base, 8, underlying);
    Porffor.IR.storeU8(base, 12, objType);

    if (objType == Porffor.TYPES.function) {
      __Porffor_object_fastAdd(underlying, 'length', __Porffor_funcLut_length(obj), 0b0010);
      __Porffor_object_fastAdd(underlying, 'name', __Porffor_funcLut_name(obj), 0b0010);

      if (ecma262.IsConstructor(_obj)) { // constructor
        const proto: object = __Porffor_object_new(1);
        __Porffor_object_fastAdd(underlying, 'prototype', proto, 0b1000);
        __Porffor_object_fastAdd(proto, 'constructor', _obj, 0b1010);
      } else {
        if (Porffor.comptime.flag`hasType.__porffor_generator`) {
          if (__Porffor_funcLut_coroKind(_obj) == 2) {
            Porffor.object.setPrototype(underlying, __Porffor_GeneratorFunction_prototype);
            const proto: object = __Porffor_object_new(0);
            Porffor.object.setPrototype(proto, __Porffor_Generator_prototype);
            __Porffor_object_fastAdd(underlying, 'prototype', proto, 0b1000);
          }
        }
        if (Porffor.comptime.flag`hasType.__porffor_asyncgenerator`) {
          if (__Porffor_funcLut_coroKind(_obj) == 4) {
            Porffor.object.setPrototype(underlying, __Porffor_AsyncGeneratorFunction_prototype);
            const proto: object = __Porffor_object_new(0);
            Porffor.object.setPrototype(proto, __Porffor_AsyncGenerator_prototype);
            __Porffor_object_fastAdd(underlying, 'prototype', proto, 0b1000);
          }
        }
      }
    }

    if (Porffor.fastAnd(objType >= Porffor.TYPES.error, objType <= Porffor.TYPES.suppressederror)) {
      // the message slot is the own message property, if any
      const message: any = Porffor.IR.loadJv(obj, 0);
      if (message !== undefined) __Porffor_object_fastAdd(underlying, 'message', message, 0b1010);
    }

    if (Porffor.comptime.flag`hasType.__porffor_generator`) {
      if (objType == Porffor.TYPES.__porffor_generator) __Porffor_object_coroutinePrototype(obj, underlying);
    }
    if (Porffor.comptime.flag`hasType.__porffor_asyncgenerator`) {
      if (objType == Porffor.TYPES.__porffor_asyncgenerator) __Porffor_object_coroutinePrototype(obj, underlying);
    }

    if (objType == Porffor.TYPES.regexp) {
      __Porffor_object_fastAdd(underlying, 'lastIndex', Porffor.IR.loadI32(obj, 8), 0b1000);
      Porffor.IR.storeU8(obj, 20, 1);
    }

    if (objType == Porffor.TYPES.array) {
      // index props are not materialized (the live array is the source of truth), only expando props and length live here
      const len: i32 = Porffor.IR.loadI32(obj, 0);
      __Porffor_object_fastAdd(underlying, 'length', len, 0b1000);
    }

    if (Porffor.fastOr(
      objType == Porffor.TYPES.string,
      objType == Porffor.TYPES.stringobject
    )) {
      const len: i32 = (obj as string).length;
      __Porffor_object_fastAdd(underlying, 'length', len, 0b0000);

      // size/capacity are u16: skip per-index props for huge strings
      const matLen: i32 = len > 4096 ? 0 : len;
      for (let i: i32 = 0; i < matLen; i++) {
        __Porffor_object_fastAdd(underlying, Porffor.callThis(__Number_prototype_toString, i), (obj as string)[i], 0b0100);
      }

      if (objType == Porffor.TYPES.string) {
        Porffor.IR.storeU8(underlying, 4, Porffor.IR.loadU8(underlying, 4) | 0b0001);
      }
    }

    if (objType == Porffor.TYPES.bytestring) {
      const len: i32 = (obj as bytestring).length;
      __Porffor_object_fastAdd(underlying, 'length', len, 0b0000);

      const matLen: i32 = len > 4096 ? 0 : len;
      for (let i: i32 = 0; i < matLen; i++) {
        __Porffor_object_fastAdd(underlying, Porffor.callThis(__Number_prototype_toString, i), (obj as bytestring)[i], 0b0100);
      }

      Porffor.IR.storeU8(underlying, 4, Porffor.IR.loadU8(underlying, 4) | 0b0001);
    }

    if (objType == Porffor.TYPES.array) Porffor.IR.storeI32(obj, 12, Porffor.IR.ptr(underlying));
    if (Porffor.fastOr(underlyingBuckets == 0, (underlyingLength + 2) * 4 > underlyingBucketsCap * 3)) {
      __Porffor_underlyingRebuild();
    } else {
      __Porffor_underlyingInsertEntry(base, underlyingLength);
    }

    return underlying;
  }

  return _obj;
};

export const __Porffor_object_isObject = (arg: any): boolean => {
  const t: i32 = Porffor.type(arg);
  return Porffor.fastAnd(
    arg !== null,
    t > 0x05,
    t != Porffor.TYPES.string,
    t != Porffor.TYPES.bytestring
  );
};

// HasBinding of a with statement's object environment
export const __Porffor_with_has = (obj: any, key: any): boolean => {
  if (!(key in obj)) return false;
  const unscopables: any = obj[Symbol.unscopables];
  return !__Porffor_object_isObject(unscopables) || !unscopables[key];
};

// GetValue of an unresolvable reference
export const __Porffor_global_get = (key: any, hash: i32): any => {
  const entryPtr: i32 = __Porffor_object_lookup(globalThis, key, hash);
  if (Porffor.fastAnd(entryPtr != 0, (Porffor.IR.loadU16(entryPtr, 16) & 0b0001) == 0)) return __Porffor_object_readValue(entryPtr);

  if (!(key in globalThis)) throw new ReferenceError(key + ' is not defined');
  return globalThis[key];
};

export const __Porffor_object_isObjectOrNull = (arg: any): boolean => {
  const t: i32 = Porffor.type(arg);
  return Porffor.fastAnd(
    t > 0x05,
    t != Porffor.TYPES.string,
    t != Porffor.TYPES.bytestring
  );
};

export const __Porffor_object_isObjectOrSymbol = (arg: any): boolean => {
  const t: i32 = Porffor.type(arg);
  return Porffor.fastAnd(
    arg !== null,
    t > 0x04,
    t != Porffor.TYPES.string,
    t != Porffor.TYPES.bytestring
  );
};


export const __Porffor_object_preventExtensions = (obj: any): void => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) {
      if (!__Porffor_proxy_preventExtensions(obj)) throw new TypeError('Proxy preventExtensions trap returned false');
      return;
    }
  }
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return;
  }

  Porffor.IR.storeU8(obj, 4, Porffor.IR.loadU8(obj, 4) | 0b0001);
};

export const __Porffor_object_isInextensible = (obj: any): boolean => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) return !__Porffor_proxy_isExtensible(obj);
  }
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return false;
  }

  return (Porffor.IR.loadU8(obj, 4) & 0b0001) != 0;
};

export const __Porffor_object_setPrototype = (obj: any, proto: any): void => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) {
      if (!__Porffor_proxy_setPrototypeOf(obj, proto)) throw new TypeError('Proxy setPrototypeOf trap returned false');
      return;
    }
  }
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return;
  }

  if (__Porffor_object_isObjectOrNull(proto)) {
    // a custom prototype for Array.prototype may have index props
    if (Porffor.IR.loadU8(obj, 4) & 0b0010) {
      if (Porffor.fastAnd(Porffor.IR.ptr(obj) != Porffor.IR.ptr(__Object_prototype), Porffor.IR.ptr(proto) != Porffor.IR.ptr(__Object_prototype))) indexKeysUsed = 1;
    }
    __Porffor_object_icInvalidate(obj);
    const old: i32 = Porffor.IR.loadU16(obj, 6);
    if (old != 0) {
      // the same keys from the new prototype's root
      let shape: i32 = __Porffor_object_shapeTransition(Porffor.type(proto) == Porffor.TYPES.object ? 2 : 3, proto, Porffor.IR.ptr(proto), 0);
      const size: i32 = Porffor.IR.loadU16(obj, 0);
      const desc: i32 = __Porffor_object_shapeDescriptors(old);
      for (let i: i32 = 0; i < size; i++) {
        if (shape == 0) break;
        const d: i32 = desc + 8 + i * 12;
        shape = __Porffor_object_shapeTransition(shape, Porffor.as(Porffor.IR.loadI32(d, 4), Porffor.IR.loadU8(d, 9)), Porffor.IR.loadI32(d, 0), Porffor.IR.loadU8(d, 8));
      }
      if (shape == 0) __Porffor_object_dictionary(obj);
        else Porffor.IR.storeU16(obj, 6, shape);
    }
    Porffor.IR.storeI32(obj, 8, proto);
    Porffor.IR.storeU8(obj, 5, Porffor.type(proto));
    Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, proto);
  }
};

// GetPrototypeFromConstructor
export const __Porffor_object_setPrototypeFromConstructor = (obj: any, newTarget: any): void => {
  const proto: any = newTarget.prototype;
  if (Porffor.object.isObject(proto)) __Porffor_object_setPrototype(obj, proto);
};

export const __Porffor_object_getPrototype = (obj: any): any => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_getPrototypeOf(obj);
  }
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) {
      return undefined;
    }
  }

  return Porffor.as(Porffor.IR.loadI32(obj, 8), Porffor.IR.loadU8(obj, 5));
};

export const __Porffor_object_getPrototypeWithHidden = (obj: any, trueType: i32): any => {
  const objectProto: any = __Porffor_object_getPrototype(obj);
  if (Porffor.type(objectProto) != Porffor.TYPES.undefined) return objectProto;

  return __Porffor_object_getHiddenPrototype(trueType);
};


export const __Porffor_object_overrideAllFlags = (obj: any, overrideOr: i32, overrideAnd: i32): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return;
  }

  __Porffor_object_dictionary(obj);
  __Porffor_object_icInvalidate(obj);
  let ptr: i32 = __Porffor_object_entriesPtr(obj);
  const size: i32 = Porffor.IR.loadU16(obj, 0);
  const endPtr: i32 = ptr + size * 20;

  for (; ptr < endPtr; ptr += 20) {
    let flags: i32 = Porffor.IR.loadU8(ptr, 16);
    flags = (flags | overrideOr) & overrideAnd;
    Porffor.IR.storeU8(ptr, 16, flags);
  }
};

export const __Porffor_object_checkAllFlags = (obj: any, dataAnd: i32, accessorAnd: i32, dataExpected: i32, accessorExpected: i32): boolean => {
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return false;
  }

  const size: i32 = Porffor.IR.loadU16(obj, 0);
  for (let i: i32 = 0; i < size; i++) {
    const flags: i32 = __Porffor_object_slotFlags(obj, i);
    if (flags & 0b0001) {
      // accessor
      if ((flags & accessorAnd) != accessorExpected) return false;
    } else {
      // data
      if ((flags & dataAnd) != dataExpected) return false;
    }

  }

  return true;
};

// keys that can intercept or block assignments up a prototype chain: accessors and non-writable data
export const __Porffor_object_markSetKey = (hash: i32): void => {
  Porffor.c`porf_accessor_keys[((u32)hash >> 5) & 63] |= 1u << ((u32)hash & 31);`;
};

export const __Porffor_object_markAllSetKeys = (obj: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) != Porffor.TYPES.object) return;
  const size: i32 = Porffor.IR.loadU16(obj, 0);
  for (let i: i32 = 0; i < size; i++) __Porffor_object_markSetKey(__Porffor_object_slotHash(obj, i));
};

export const __Porffor_object_slotWriteAccessor = (obj: any, i: i32, get: i32, set: i32): void => {
  __Porffor_object_icInvalidate(obj);
  const ptr: i32 = __Porffor_object_slotPtr(obj, i);
  Porffor.IR.storeI32(ptr, 0, get);
  Porffor.IR.storeI32(ptr, 4, set);
  if (Porffor.IR.loadU16(obj, 6) != 0) Porffor.IR.storeU8(__Porffor_object_typeAt(Porffor.IR.loadI32(obj, 12), i), 0, __Porffor_object_accessorType());
  __Porffor_object_markSetKey(__Porffor_object_slotHash(obj, i));
};

// a setter, read-only prop or proxy up a prototype chain is only possible for marked keys
export const __Porffor_object_mayHaveSetter = (hash: i32): boolean => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) return true;
  let bit: i32 = 0;
  Porffor.c`bit = (porf_accessor_keys[((u32)hash >> 5) & 63] >> ((u32)hash & 31)) & 1;`;
  return bit != 0;
};

// the entry of a key, converting obj to a dictionary
export const __Porffor_object_lookup = (obj: any, target: any, targetHash: i32): i32 => {
  if (Porffor.IR.ptr(obj) == 0) return 0;
  __Porffor_object_dictionary(obj);
  return __Porffor_object_lookupEntry(obj, target, targetHash);
};

export const __Porffor_object_lookupEntry = (obj: any, target: any, targetHash: i32): i32 => {
  let ptr: i32 = __Porffor_object_entriesPtr(obj);
  const endPtr: i32 = ptr + Porffor.IR.loadU16(obj, 0) * 20;

  if (Porffor.comptime.flag`hasType.symbol`) {
    if (Porffor.type(target) == Porffor.TYPES.symbol) {
      // symbols are equal by pointer
      const targetPtr: i32 = Porffor.IR.ptr(target);
      for (; ptr < endPtr; ptr += 20) {
        if (Porffor.fastAnd(Porffor.IR.loadI32(ptr, 4) == targetPtr, Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol)) return ptr;
      }

      return 0;
    }
  }

  if (Porffor.IR.loadU8(obj, 4) & 0b1000) {
    if (Porffor.IR.loadU8(obj, 4) & 0b100000) __Porffor_object_rebuildIndex(obj);
    const capacity: i32 = Porffor.IR.loadU16(obj, 2);
    const index: i32 = ptr + capacity * 20;
    const mask: i32 = capacity * 2 - 1;
    let slot: i32 = targetHash & mask;
    while (true) {
      const i: i32 = Porffor.IR.loadU16(__Porffor_object_indexSlot(index, slot), 0);
      if (i == 0) return 0;
      const entryPtr: i32 = ptr + (i - 1) * 20;
      if (Porffor.IR.loadI32(entryPtr, 0) == targetHash) return entryPtr;
      slot = (slot + 1) & mask;
    }
  }

  for (; ptr < endPtr; ptr += 20) {
    if (Porffor.IR.loadI32(ptr, 0) == targetHash) {
      return ptr;
    }
  }

  return 0;
};

export const __Porffor_array_propertyKeyIndex = (key: any): i32 => {
  const keyType: i32 = Porffor.type(key);
  if (Porffor.fastAnd(keyType != Porffor.TYPES.string, keyType != Porffor.TYPES.bytestring)) return -1;

  const len: i32 = key.length;
  if (len == 0) return -1;

  let digit: i32 = key.charCodeAt(0) - 48;
  if (Porffor.fastOr(digit < 0, digit > 9)) return -1;
  if (Porffor.fastAnd(len > 1, digit == 0)) return -1;

  let out: i32 = digit;
  for (let i: i32 = 1; i < len; i++) {
    digit = key.charCodeAt(i) - 48;
    if (Porffor.fastOr(digit < 0, digit > 9)) return -1;
    if (Porffor.fastOr(out > 214748364, Porffor.fastAnd(out == 214748364, digit > 6))) return -1;

    out = out * 10 + digit;
  }

  return out;
};

export const __Porffor_array_isLengthKey = (key: any): boolean => {
  if (Porffor.type(key) != Porffor.TYPES.bytestring) return false;
  if (Porffor.IR.loadI32(key, 0) != 6) return false;
  return Porffor.strcmp(key, 'length');
};

export const __Porffor_object_get = (_obj: any, key: any): any => {
  let obj: any = _obj;
  const trueType: i32 = Porffor.type(obj);
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (trueType == Porffor.TYPES.proxy) return __Porffor_proxy_get(_obj, ecma262.ToPropertyKey(key), _obj);
  }
  if (trueType == Porffor.TYPES.regexp) if (__Porffor_object_regexLiKey(_obj, key)) return Porffor.IR.loadI32(_obj, 8);
  if (trueType == Porffor.TYPES.object) {
    if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot get property of null');
  } else {
    if (trueType == Porffor.TYPES.undefined) throw new TypeError('Cannot get property of null');
    obj = __Porffor_object_underlyingToRead(obj, trueType);
  }

  key = ecma262.ToPropertyKey(key);

  // integer-indexed exotic objects never look numeric keys up on the prototype chain
  if (Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array)) {
    const n: any = __Porffor_typedArray_numericKey(key);
    if (Porffor.type(n) == Porffor.TYPES.number) return __Porffor_typedArray_validIndex(_obj, n) ? _obj[n] : undefined;
  }
  if (trueType == Porffor.TYPES.array) {
    const index: i32 = __Porffor_array_propertyKeyIndex(key);
    if (index != -1) {
      if (__Porffor_array_has(_obj as any[], index)) return (_obj as any[])[index];
    } else if (__Porffor_array_isLengthKey(key)) return (_obj as any[]).length;
  }

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = 0;
  if (Porffor.type(obj) == Porffor.TYPES.object) if (Porffor.IR.ptr(obj) != 0) slot = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    // check prototype chain
    if (trueType == Porffor.TYPES.object) {
      obj = __Porffor_object_getPrototype(obj);
      // if undefined, prototype is object.prototype
      if (Porffor.type(obj) == Porffor.TYPES.undefined) obj = __Object_prototype;
    } else if (obj == null) obj = __Porffor_object_getHiddenPrototype(trueType);
      else obj = __Porffor_object_getPrototypeWithHidden(obj, trueType);
    if (obj == null) return undefined;

    // todo/opt: put this behind comptime flag if only __proto__ is used
    if (hash == 212292208) if (Porffor.strcmp(key, '__proto__')) {
      // get prototype
      return obj;
    }

    if (Porffor.comptime.flag`hasFunc.Proxy`) {
      if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_get(obj, key, _obj);
    }
    let proto: any = obj;
    while (true) {
      if (Porffor.type(obj) != Porffor.TYPES.object) {
        // array prototypes: own dense elements and length are not in the underlying object
        if (Porffor.type(obj) == Porffor.TYPES.array) {
          const index: i32 = __Porffor_array_propertyKeyIndex(key);
          if (index != -1) {
            if (__Porffor_array_has(obj as any[], index)) return (obj as any[])[index];
          } else if (__Porffor_array_isLengthKey(key)) return (obj as any[]).length;
        }
        obj = __Porffor_object_underlying(obj);
      }
      if (obj == null) break;
      if ((slot = __Porffor_object_find(obj, key, hash)) != 0) break;

      // inline get prototype
      obj = __Porffor_object_getPrototype(obj);
      if (Porffor.type(obj) == Porffor.TYPES.undefined) {
        obj = __Porffor_object_getHiddenPrototype(Porffor.type(proto));
        if (Porffor.IR.ptr(obj) == Porffor.IR.ptr(proto)) obj = __Object_prototype;
      }
      if (Porffor.comptime.flag`hasFunc.Proxy`) {
        if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_get(obj, key, _obj);
      }
      if (Porffor.IR.ptr(obj) == Porffor.IR.ptr(proto)) break;
      proto = obj;
    }

    if (slot == 0) return undefined;
  }

  return __Porffor_object_slotRead(obj, slot - 1, _obj);
};

// [[Get]] with a receiver
export const __Porffor_object_getWithReceiver = (obj: any, key: any, receiver: any): any => {
  key = ecma262.ToPropertyKey(key);
  const hash: i32 = __Porffor_object_hash(key);
  let proto: any = obj;
  while (proto != null) {
    if (Porffor.comptime.flag`hasFunc.Proxy`) {
      if (Porffor.type(proto) == Porffor.TYPES.proxy) return __Porffor_proxy_get(proto, key, receiver);
    }

    const holder: any = __Porffor_object_underlying(proto);
    const slot: i32 = __Porffor_object_find(holder, key, hash);
    if (slot != 0) {
      if ((__Porffor_object_slotFlags(holder, slot - 1) & 0b0001) == 0) break;

      const get: Function = __Porffor_object_slotGetter(holder, slot - 1);
      if (Porffor.IR.ptr(get) == 0) return undefined;
      return Porffor.callThis(get, receiver);
    }

    const next: any = __Porffor_object_getPrototypeWithHidden(proto, Porffor.type(proto));
    if (Porffor.IR.ptr(next) == Porffor.IR.ptr(proto)) break;
    proto = next;
  }

  return obj[key];
};

// per-site get caches, 12 words, empty words 0 (dictionaries never cache):
//  0-3: own data hits, direct mapped by shape & 3, each (shape << 16) | slot index
//  4-7, 8-11: prototype hits [receiver shape, holder (0: absent), (holder shape << 16) | holder slot index, epoch]
//   holder shape only for data slots of shaped holders, epoch -1 for the receiver's own prototype, else icEpoch
// icMega: misses shared by all sites, the same 4 words (epoch -2: own) then the key hash
let icMega: i32 = 0;

// a cached read's slot index + 1 in its holder (p + 4, else obj for own), -1 when absent, 0 when stale
export const __Porffor_object_icEntry = (obj: i32, p: i32, hash: i32): i32 => {
  const holder: i32 = Porffor.IR.loadI32(p, 4);
  const i: i32 = Porffor.IR.loadI32(p, 8) & 0xffff;
  const epoch: i32 = Porffor.IR.loadI32(p, 12);
  const proto: i32 = Porffor.IR.loadI32(obj, 8);
  if (epoch < 0) {
    let owner: i32 = holder;
    if (epoch == -2) owner = obj;
      // 0: Object.prototype, fixed by the shape
      else if (Porffor.fastAnd(holder != proto, proto != 0)) return 0;
    if (i >= Porffor.IR.loadU16(owner, 0)) return 0;
    if (__Porffor_object_slotHash(Porffor.as(owner, Porffor.TYPES.object), i) != hash) return 0;
    return i + 1;
  }

  if (epoch != icEpoch) return 0;
  // the shape fixes the prototype, which stays flagged unless its memory was reused (0: Object.prototype)
  if (Porffor.fastAnd(proto != 0, (Porffor.IR.loadU8(proto, 4) & 0b10000) == 0)) return 0;
  if (holder == 0) return -1;
  return i + 1;
};

// own hits, data on the receiver's own prototype and absent keys: small enough to need no saved registers
export const __Porffor_object_get_ic = (_obj: any, key: any, hash: i32, slot: i32): any => {
  if (Porffor.fastAnd(Porffor.type(_obj) == Porffor.TYPES.object, Porffor.IR.ptr(_obj) != 0)) {
    const shape: i32 = Porffor.IR.loadU16(_obj, 6);
    const own: i32 = Porffor.IR.loadI32(slot + (shape & 3) * 4, 0);
    if (Porffor.fastAnd(shape != 0, ((own >> 16) & 0xffff) == shape)) {
      const values: i32 = Porffor.IR.loadI32(_obj, 12);
      const i: i32 = own & 0xffff;
      return Porffor.as(Porffor.IR.loadF64(__Porffor_object_valueAt(values, i), 0), Porffor.IR.loadU8(__Porffor_object_typeAt(values, i), 0));
    }

    let p: i32 = slot + 16;
    if (Porffor.IR.loadI32(p, 0) != shape) p = slot + 32;
    if (Porffor.fastAnd(shape != 0, Porffor.IR.loadI32(p, 0) == shape)) {
      const holder: i32 = Porffor.IR.loadI32(p, 4);
      const at: i32 = Porffor.IR.loadI32(p, 8);
      const epoch: i32 = Porffor.IR.loadI32(p, 12);
      const proto: i32 = Porffor.IR.loadI32(_obj, 8);
      if (Porffor.fastAnd(epoch == -1, at > 0xffff, Porffor.fastOr(holder == proto, proto == 0), Porffor.IR.loadU16(holder, 6) == ((at >> 16) & 0xffff))) {
        const values: i32 = Porffor.IR.loadI32(holder, 12);
        const i: i32 = at & 0xffff;
        return Porffor.as(Porffor.IR.loadF64(__Porffor_object_valueAt(values, i), 0), Porffor.IR.loadU8(__Porffor_object_typeAt(values, i), 0));
      }
      // absent from the whole chain while no prototype on it changed
      if (Porffor.fastAnd(holder == 0, epoch == icEpoch, Porffor.fastOr(proto == 0, (Porffor.IR.loadU8(proto, 4) & 0b10000) != 0))) return undefined;
    }
  }

  return __Porffor_object_get_icSlow(_obj, key, hash, slot);
};

// function props live in their underlying object, whose shape doesn't fix the prototype: their shape keys are tagged
export const __Porffor_object_get_icSlow = (_obj: any, key: any, hash: i32, slot: i32): any => {
  let obj: i32 = 0;
  let tag: i32 = 0;
  if (Porffor.type(_obj) == Porffor.TYPES.object) obj = Porffor.IR.ptr(_obj);
    else if (Porffor.type(_obj) == Porffor.TYPES.function) {
      obj = __Porffor_object_underlyingPtr(_obj);
      tag = 0x10000;
    }

  if (obj != 0) {
    const shape: i32 = Porffor.IR.loadU16(obj, 6);
    if (shape != 0) {
      const values: i32 = Porffor.IR.loadI32(obj, 12);
      const own: i32 = Porffor.IR.loadI32(slot + (shape & 3) * 4, 0);
      if (((own >> 16) & 0xffff) == shape) {
        const i: i32 = own & 0xffff;
        return Porffor.as(Porffor.IR.loadF64(__Porffor_object_valueAt(values, i), 0), Porffor.IR.loadU8(__Porffor_object_typeAt(values, i), 0));
      }

      const shapeKey: i32 = shape | tag;
      for (let p: i32 = slot + 16; p < slot + 48; p += 16) {
        if (Porffor.IR.loadI32(p, 0) != shapeKey) continue;

        // the receiver's own prototype, still of the shape holding a data value there
        const holder: i32 = Porffor.IR.loadI32(p, 4);
        const at: i32 = Porffor.IR.loadI32(p, 8);
        if (Porffor.fastAnd(Porffor.IR.loadI32(p, 12) == -1, at > 0xffff, Porffor.fastOr(holder == Porffor.IR.loadI32(obj, 8), Porffor.IR.loadI32(obj, 8) == 0))) {
          if (Porffor.IR.loadU16(holder, 6) == ((at >> 16) & 0xffff)) {
            const i: i32 = at & 0xffff;
            const values: i32 = Porffor.IR.loadI32(holder, 12);
            return Porffor.as(Porffor.IR.loadF64(__Porffor_object_valueAt(values, i), 0), Porffor.IR.loadU8(__Porffor_object_typeAt(values, i), 0));
          }
        }

        const found: i32 = __Porffor_object_icEntry(obj, p, hash);
        if (found == -1) return undefined;
        if (found != 0) return __Porffor_object_slotRead(Porffor.as(holder, Porffor.TYPES.object), found - 1, _obj);
        break;
      }

      if (icMega != 0) {
        const p: i32 = icMega + (__Porffor_object_hashAvalanche(hash ^ (shapeKey << 15)) & 4095) * 20;
        if (Porffor.fastAnd(Porffor.IR.loadI32(p, 0) == shapeKey, Porffor.IR.loadI32(p, 16) == hash)) {
          const i: i32 = __Porffor_object_icEntry(obj, p, hash);
          if (i != 0) {
            // warm this site too
            const epoch: i32 = Porffor.IR.loadI32(p, 12);
            let holder: i32 = Porffor.IR.loadI32(p, 4);
            if (epoch == -2) {
              holder = obj;
              if ((__Porffor_object_slotFlags(Porffor.as(obj, Porffor.TYPES.object), i - 1) & 0b0001) == 0) Porffor.IR.storeI32(slot + (shape & 3) * 4, 0, (shape << 16) | (i - 1));
            } else __Porffor_object_icStoreProto(slot, shapeKey, holder, Porffor.IR.loadI32(p, 8), epoch);
            if (i == -1) return undefined;
            return __Porffor_object_slotRead(Porffor.as(holder, Porffor.TYPES.object), i - 1, _obj);
          }
        }
      }

      // megamorphic sites: objects of other shapes often have the key where the cached ones do
      const size: i32 = Porffor.IR.loadU16(obj, 0);
      const desc: i32 = __Porffor_object_shapeDescriptors(shape);
      for (let n: i32 = 0; n < 4; n++) {
        const word: i32 = Porffor.IR.loadI32(slot + n * 4, 0);
        if (word == 0) continue;
        const i: i32 = word & 0xffff;
        if (i >= size) continue;
        const d: i32 = desc + 8 + i * 12;
        if (Porffor.fastAnd(Porffor.IR.loadI32(d, 0) == hash, (Porffor.IR.loadU8(d, 8) & 0b0001) == 0))
          return Porffor.as(Porffor.IR.loadF64(__Porffor_object_valueAt(values, i), 0), Porffor.IR.loadU8(__Porffor_object_typeAt(values, i), 0));
      }
    }
  }

  return __Porffor_object_get_icMiss(_obj, key, hash, slot);
};

export const __Porffor_object_get_icMiss = (_obj: any, key: any, hash: i32, slot: i32): any => {
  let o: any = _obj;
  let tag: i32 = 0;
  if (Porffor.type(_obj) == Porffor.TYPES.function) {
    o = __Porffor_object_underlying(_obj);
    tag = 0x10000;
  } else if (Porffor.fastOr(Porffor.type(_obj) != Porffor.TYPES.object, Porffor.IR.ptr(_obj) == 0)) return __Porffor_object_get_withHash(_obj, key, hash);

  const shape: i32 = Porffor.IR.loadU16(o, 6);
  const shapeKey: i32 = shape | tag;
  const own: i32 = __Porffor_object_find(o, key, hash);
  if (own != 0) {
    if (shape != 0) {
      if ((__Porffor_object_slotFlags(o, own - 1) & 0b0001) == 0) Porffor.IR.storeI32(slot + (shape & 3) * 4, 0, (shape << 16) | (own - 1));
      __Porffor_object_icStoreMega(shapeKey, hash, 0, own - 1, -2);
    }
    return __Porffor_object_slotRead(o, own - 1, _obj);
  }

  // own miss: walk the chain, flagging it, and cache where the key was found
  if (shape == 0) return __Porffor_object_get_withHash(_obj, key, hash);
  let obj: any = undefined;
  if (tag != 0) obj = __Porffor_object_getPrototypeWithHidden(_obj, Porffor.TYPES.function);
    else {
      const protoType: i32 = Porffor.IR.loadU8(_obj, 5);
      if (protoType == Porffor.TYPES.undefined) obj = __Object_prototype;
        else if (protoType == Porffor.TYPES.object) obj = Porffor.as(Porffor.IR.loadI32(_obj, 8), Porffor.TYPES.object);
    }
  if (Porffor.fastOr(Porffor.type(obj) != Porffor.TYPES.object, Porffor.IR.ptr(obj) == 0)) return __Porffor_object_get_withHash(_obj, key, hash);

  const first: any = obj;
  let lastProto: any = obj;
  while (true) {
    const found: i32 = __Porffor_object_find(obj, key, hash);
    if (found != 0) {
      let epoch: i32 = -1;
      if (Porffor.IR.ptr(obj) != Porffor.IR.ptr(first)) {
        __Porffor_object_icFlagChainTo(first, obj);
        epoch = icEpoch;
      }
      let at: i32 = found - 1;
      const holderShape: i32 = Porffor.IR.loadU16(obj, 6);
      if (Porffor.fastAnd(holderShape != 0, (__Porffor_object_slotFlags(obj, found - 1) & 0b0001) == 0)) at |= holderShape << 16;
      __Porffor_object_icStoreMega(shapeKey, hash, Porffor.IR.ptr(obj), at, epoch);
      __Porffor_object_icStoreProto(slot, shapeKey, Porffor.IR.ptr(obj), at, epoch);
      return __Porffor_object_slotRead(obj, found - 1, _obj);
    }

    obj = __Porffor_object_getPrototype(obj);
    if (Porffor.type(obj) == Porffor.TYPES.undefined) obj = __Object_prototype;
    if (Porffor.type(obj) != Porffor.TYPES.object) return __Porffor_object_get_withHash(_obj, key, hash);
    if (Porffor.fastOr(Porffor.IR.ptr(obj) == 0, Porffor.IR.ptr(obj) == Porffor.IR.ptr(lastProto))) {
      __Porffor_object_icFlagChainTo(first, lastProto);
      __Porffor_object_icStoreMega(shapeKey, hash, 0, 0, icEpoch);
      __Porffor_object_icStoreProto(slot, shapeKey, 0, 0, icEpoch);
      return undefined;
    }
    lastProto = obj;
  }
};

// flags each prototype from the receiver's first up to the holder
export const __Porffor_object_icFlagChainTo = (obj: any, holder: any): void => {
  while (true) {
    __Porffor_object_icFlagProto(obj);
    if (Porffor.IR.ptr(obj) == Porffor.IR.ptr(holder)) return;
    let next: any = __Porffor_object_getPrototype(obj);
    if (Porffor.type(next) == Porffor.TYPES.undefined) next = __Object_prototype;
    if (Porffor.fastOr(Porffor.type(next) != Porffor.TYPES.object, Porffor.IR.ptr(next) == 0, Porffor.IR.ptr(next) == Porffor.IR.ptr(obj))) return;
    obj = next;
  }
};

export const __Porffor_object_icStoreMega = (shape: i32, hash: i32, holder: i32, i: i32, epoch: i32): void => {
  if (icMega == 0) {
    icMega = Porffor.malloc(4096 * 20);
    Porffor.IR.fill(icMega, 0, 4096 * 20);
  }
  const p: i32 = icMega + (__Porffor_object_hashAvalanche(hash ^ (shape << 15)) & 4095) * 20;
  Porffor.IR.storeI32(p, 0, shape);
  Porffor.IR.storeI32(p, 4, holder);
  Porffor.IR.storeI32(p, 8, i);
  Porffor.IR.storeI32(p, 12, epoch);
  Porffor.IR.storeI32(p, 16, hash);
};

// the first entry if it is the receiver shape's or empty, else the second
export const __Porffor_object_icStoreProto = (slot: i32, shape: i32, holder: i32, i: i32, epoch: i32): void => {
  let p: i32 = slot + 16;
  if (Porffor.fastAnd(Porffor.IR.loadI32(p, 0) != shape, Porffor.IR.loadI32(p, 0) != 0)) p = slot + 32;
  Porffor.IR.storeI32(p, 0, shape);
  Porffor.IR.storeI32(p, 4, holder);
  Porffor.IR.storeI32(p, 8, i);
  Porffor.IR.storeI32(p, 12, epoch);
};

export const __Porffor_object_get_withHash = (_obj: any, key: any, hash: i32): any => {
  let obj: any = _obj;
  const trueType: i32 = Porffor.type(obj);
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (trueType == Porffor.TYPES.proxy) return __Porffor_proxy_get(_obj, key, _obj);
  }
  if (trueType == Porffor.TYPES.object) {
    if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot get property of null');
  } else {
    if (trueType == Porffor.TYPES.undefined) throw new TypeError('Cannot get property of null');
    if (trueType == Porffor.TYPES.regexp) if (__Porffor_object_regexLiKey(_obj, key)) return Porffor.IR.loadI32(_obj, 8);
    if (Porffor.fastOr(trueType == Porffor.TYPES.array, Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array))) return __Porffor_object_get(_obj, key);
    obj = __Porffor_object_underlyingToRead(obj, trueType);
  }

  let slot: i32 = 0;
  if (Porffor.type(obj) == Porffor.TYPES.object) if (Porffor.IR.ptr(obj) != 0) slot = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    // check prototype chain
    if (trueType == Porffor.TYPES.object) {
      obj = __Porffor_object_getPrototype(obj);
      // if undefined, prototype is object.prototype
      if (Porffor.type(obj) == Porffor.TYPES.undefined) obj = __Object_prototype;
    } else if (obj == null) obj = __Porffor_object_getHiddenPrototype(trueType);
      else obj = __Porffor_object_getPrototypeWithHidden(obj, trueType);

    if (Porffor.comptime.flag`hasFunc.Proxy`) {
      if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_get(obj, key, _obj);
    }
    let proto: any = obj;
    while (true) {
      if (Porffor.type(obj) != Porffor.TYPES.object) {
        // array prototypes: own dense elements and length are not in the underlying object
        if (Porffor.type(obj) == Porffor.TYPES.array) {
          const index: i32 = __Porffor_array_propertyKeyIndex(key);
          if (index != -1) {
            if (__Porffor_array_has(obj as any[], index)) return (obj as any[])[index];
          } else if (__Porffor_array_isLengthKey(key)) return (obj as any[]).length;
        }
        obj = __Porffor_object_underlying(obj);
      }
      if (obj == null) break;
      if ((slot = __Porffor_object_find(obj, key, hash)) != 0) break;

      // inline get prototype
      obj = __Porffor_object_getPrototype(obj);
      if (Porffor.type(obj) == Porffor.TYPES.undefined) {
        obj = __Porffor_object_getHiddenPrototype(Porffor.type(proto));
        if (Porffor.IR.ptr(obj) == Porffor.IR.ptr(proto)) obj = __Object_prototype;
      }
      if (Porffor.comptime.flag`hasFunc.Proxy`) {
        if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_get(obj, key, _obj);
      }
      if (Porffor.IR.ptr(obj) == Porffor.IR.ptr(proto)) break;
      proto = obj;
    }

    if (slot == 0) return undefined;
  }

  return __Porffor_object_slotRead(obj, slot - 1, _obj);
};

export const __Porffor_object_set = (_obj: any, key: any, value: any): any => {
  let obj: any = _obj;
  const trueType: i32 = Porffor.type(obj);
  if (Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array)) {
    key = ecma262.ToPropertyKey(key);
    const n: any = __Porffor_typedArray_numericKey(key);
    if (Porffor.type(n) == Porffor.TYPES.number) return __Porffor_typedArray_setIndex(_obj, n, value);
  }
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (trueType == Porffor.TYPES.proxy) {
      __Porffor_proxy_set(_obj, ecma262.ToPropertyKey(key), value, _obj);
      return value;
    }
  }
  if (trueType == Porffor.TYPES.regexp) if (__Porffor_object_regexLiKey(_obj, key)) if (__Porffor_object_regexLiStore(_obj, value)) return value;
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return value;
  }

  if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot set property of null');

  key = ecma262.ToPropertyKey(key);
  const hash: i32 = __Porffor_object_hash(key);
  if (trueType == Porffor.TYPES.array) {
    if (__Porffor_array_isLengthKey(key)) {
      __Porffor_array_setLengthValue(_obj as any[], value, false);
      return value;
    }

    const index: i32 = __Porffor_array_propertyKeyIndex(key);
    if (Porffor.fastAnd(index != -1, __Porffor_object_find(obj, key, hash) == 0)) {
      // a new index may hit setters or read-only props on the prototype chain
      if (Porffor.fastOr(indexKeysUsed != 0, Porffor.IR.loadU8(obj, 5) != 0)) if (!__Porffor_array_has(_obj as any[], index)) if (__Porffor_object_setIndexProto(_obj, key, hash, value, false)) return value;

      if (!__Porffor_array_has(_obj as any[], index)) if (__Porffor_object_isInextensible(obj)) return value;
      let arr: i32 = Porffor.IR.ptr(_obj);
      const needed: i32 = index + 1;
      const entries: i32 = __Porffor_array_ensure(arr, needed);
      if (needed > Porffor.IR.loadI32(arr, 0)) Porffor.IR.storeI32(arr, 0, needed);

      const entry: i32 = entries + index * 8;
      if (Porffor.fastAnd(Porffor.type(value) == Porffor.TYPES.number, value === 0, 1 / value == Infinity)) {
        Porffor.IR.storeU64(entry, 0, -2243003720663040);
      } else {
        Porffor.IR.storeJv(entry, 0, value);
      }
      Porffor.IR.gcBarrierValue(arr, Porffor.TYPES.array, value);
      return value;
    }
  }

  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    // builtin-typed values inherit setters and getter-only accessors from their hidden prototype
    let proto: any = trueType == Porffor.TYPES.object ? __Porffor_object_getPrototype(obj) : __Porffor_object_getPrototypeWithHidden(obj, trueType);
    if (hash == 212292208) if (Porffor.fastAnd(Porffor.strcmp(key, '__proto__'), proto !== null)) {
      // set prototype
      if (Porffor.object.isObjectOrNull(value)) __Object_setPrototypeOf(_obj, value);
      return value;
    }

    // check prototype chain for setter
    if (Porffor.fastAnd(proto != null, __Porffor_object_mayHaveSetter(hash))) {
      if (Porffor.comptime.flag`hasFunc.Proxy`) {
        if (Porffor.type(proto) == Porffor.TYPES.proxy) {
          __Porffor_proxy_set(proto, key, value, _obj);
          return value;
        }
      }
      if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);
      let lastProto: any = proto;
      while (true) {
        if ((slot = __Porffor_object_find(proto, key, hash)) != 0) break;

        proto = __Porffor_object_getPrototype(proto);
        if (Porffor.comptime.flag`hasFunc.Proxy`) {
          if (Porffor.type(proto) == Porffor.TYPES.proxy) {
            __Porffor_proxy_set(proto, key, value, _obj);
            return value;
          }
        }
        if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);
        if (Porffor.fastOr(proto == null, Porffor.IR.ptr(proto) == Porffor.IR.ptr(lastProto))) break;
        lastProto = proto;
      }

      if (slot != 0) {
        // found possible setter
        const tail: i32 = __Porffor_object_slotFlags(proto, slot - 1);
        if (tail & 0b0001) {
          // accessor descriptor
          const set: Function = __Porffor_object_slotSetter(proto, slot - 1);
          if (Porffor.IR.ptr(set) == 0) return value;

          Porffor.callThis(set, _obj, value);
          return value;
        }
        // read-only data
        if ((tail & 0b1000) == 0) return value;
      }
    }

    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(obj)) {
      return value;
    }

    slot = __Porffor_object_add(obj, key, hash, 0b1110) + 1;
  } else {
    // existing entry, modify it
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);

    if (tail & 0b0001) {
      // accessor descriptor
      const set: Function = __Porffor_object_slotSetter(obj, slot - 1);
      if (Porffor.IR.ptr(set) == 0) return value;

      Porffor.callThis(set, _obj, value);
      return value;
    }

    // data descriptor
    if (!(tail & 0b1000)) {
      // not writable, return now
      return value;
    }
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);

  return value;
};

export const __Porffor_object_set_withHash = (_obj: any, key: any, value: any, hash: i32): any => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(_obj) == Porffor.TYPES.proxy) {
      __Porffor_proxy_set(_obj, key, value, _obj);
      return value;
    }
  }
  let obj: any = _obj;
  const trueType: i32 = Porffor.type(obj);
  if (trueType == Porffor.TYPES.regexp) if (__Porffor_object_regexLiKey(_obj, key)) if (__Porffor_object_regexLiStore(_obj, value)) return value;
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    // integer-indexed exotic objects take numeric keys without the prototype chain
    if (Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array)) return __Porffor_object_set(_obj, key, value);
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return value;
  }

  if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot set property of null');

  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    // check prototype chain for setter
    // builtin-typed values inherit setters and getter-only accessors from their hidden prototype
    let proto: any = trueType == Porffor.TYPES.object ? __Porffor_object_getPrototype(obj) : __Porffor_object_getPrototypeWithHidden(obj, trueType);
    if (Porffor.fastAnd(proto != null, __Porffor_object_mayHaveSetter(hash))) {
      if (Porffor.comptime.flag`hasFunc.Proxy`) {
        if (Porffor.type(proto) == Porffor.TYPES.proxy) {
          __Porffor_proxy_set(proto, key, value, _obj);
          return value;
        }
      }
      if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);
      let lastProto: any = proto;
      while (true) {
        if ((slot = __Porffor_object_find(proto, key, hash)) != 0) break;

        proto = __Porffor_object_getPrototype(proto);
        if (Porffor.comptime.flag`hasFunc.Proxy`) {
          if (Porffor.type(proto) == Porffor.TYPES.proxy) {
            __Porffor_proxy_set(proto, key, value, _obj);
            return value;
          }
        }
        if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);
        if (Porffor.fastOr(proto == null, Porffor.IR.ptr(proto) == Porffor.IR.ptr(lastProto))) break;
        lastProto = proto;
      }

      if (slot != 0) {
        // found possible setter
        const tail: i32 = __Porffor_object_slotFlags(proto, slot - 1);
        if (tail & 0b0001) {
          // accessor descriptor
          const set: Function = __Porffor_object_slotSetter(proto, slot - 1);
          if (Porffor.IR.ptr(set) == 0) return value;

          Porffor.callThis(set, _obj, value);
          return value;
        }
        // read-only data
        if ((tail & 0b1000) == 0) return value;
      }
    }

    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(obj)) {
      return value;
    }

    slot = __Porffor_object_add(obj, key, hash, 0b1110) + 1;
  } else {
    // existing entry, modify it
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);

    if (tail & 0b0001) {
      // accessor descriptor
      const set: Function = __Porffor_object_slotSetter(obj, slot - 1);
      if (Porffor.IR.ptr(set) == 0) return value;

      Porffor.callThis(set, _obj, value);
      return value;
    }

    // data descriptor
    if (!(tail & 0b1000)) {
      // not writable, return now
      return value;
    }
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);

  return value;
};

export const __Porffor_object_setIndexProto = (_obj: any, key: any, hash: i32, value: any, strict: boolean): boolean => {
  let proto: any = __Porffor_object_getPrototypeWithHidden(_obj, Porffor.type(_obj));
  for (let depth: i32 = 0; depth < 10000; depth++) {
    if (proto == null) break;
    if (Porffor.comptime.flag`hasFunc.Proxy`) {
      if (Porffor.type(proto) == Porffor.TYPES.proxy) break;
    }

    const o: any = Porffor.type(proto) == Porffor.TYPES.object ? proto : __Porffor_object_underlying(proto);
    if (Porffor.type(o) != Porffor.TYPES.object) break;
    const slot: i32 = __Porffor_object_find(o, key, hash);
    if (slot != 0) {
      const tail: i32 = __Porffor_object_slotFlags(o, slot - 1);
      if (tail & 0b0001) {
        const set: Function = __Porffor_object_slotSetter(o, slot - 1);
        if (Porffor.IR.ptr(set) != 0) {
          Porffor.callThis(set, _obj, value);
          return true;
        }
      } else if (tail & 0b1000) return false;

      if (strict) throw new TypeError('Cannot assign to read only property');
      return true;
    }

    let next: any = __Porffor_object_getPrototype(o);
    if (Porffor.type(next) == Porffor.TYPES.undefined) next = Porffor.IR.ptr(o) == Porffor.IR.ptr(__Object_prototype) ? null : __Object_prototype;
    if (next != null) if (Porffor.IR.ptr(next) == Porffor.IR.ptr(proto)) break;
    proto = next;
  }

  return false;
};

export const __Porffor_object_setStrict = (_obj: any, key: any, value: any): any => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(_obj) == Porffor.TYPES.proxy) {
      if (!__Porffor_proxy_set(_obj, ecma262.ToPropertyKey(key), value, _obj)) throw new TypeError('Cannot assign to read only property of proxy');
      return value;
    }
  }
  let obj: any = _obj;
  const trueType: i32 = Porffor.type(obj);
  if (trueType == Porffor.TYPES.regexp) if (__Porffor_object_regexLiKey(_obj, key)) if (__Porffor_object_regexLiStore(_obj, value)) return value;
  if (Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array)) {
    key = ecma262.ToPropertyKey(key);
    const n: any = __Porffor_typedArray_numericKey(key);
    if (Porffor.type(n) == Porffor.TYPES.number) return __Porffor_typedArray_setIndex(_obj, n, value);
  }
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return value;
  }

  if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot set property of null');

  key = ecma262.ToPropertyKey(key);
  const hash: i32 = __Porffor_object_hash(key);
  if (trueType == Porffor.TYPES.array) {
    if (__Porffor_array_isLengthKey(key)) {
      __Porffor_array_setLengthValue(_obj as any[], value, true);
      return value;
    }

    const index: i32 = __Porffor_array_propertyKeyIndex(key);
    if (Porffor.fastAnd(index != -1, __Porffor_object_find(obj, key, hash) == 0)) {
      // a new index may hit setters or read-only props on the prototype chain
      if (Porffor.fastOr(indexKeysUsed != 0, Porffor.IR.loadU8(obj, 5) != 0)) if (!__Porffor_array_has(_obj as any[], index)) if (__Porffor_object_setIndexProto(_obj, key, hash, value, true)) return value;

      if (!__Porffor_array_has(_obj as any[], index)) if (__Porffor_object_isInextensible(obj)) throw new TypeError('Cannot add property to inextensible object');
      let arr: i32 = Porffor.IR.ptr(_obj);
      const needed: i32 = index + 1;
      const entries: i32 = __Porffor_array_ensure(arr, needed);
      if (needed > Porffor.IR.loadI32(arr, 0)) Porffor.IR.storeI32(arr, 0, needed);

      const entry: i32 = entries + index * 8;
      if (Porffor.fastAnd(Porffor.type(value) == Porffor.TYPES.number, value === 0, 1 / value == Infinity)) {
        Porffor.IR.storeU64(entry, 0, -2243003720663040);
      } else {
        Porffor.IR.storeJv(entry, 0, value);
      }
      Porffor.IR.gcBarrierValue(arr, Porffor.TYPES.array, value);
      return value;
    }
  }

  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    // builtin-typed values inherit setters and getter-only accessors from their hidden prototype
    let proto: any = trueType == Porffor.TYPES.object ? __Porffor_object_getPrototype(obj) : __Porffor_object_getPrototypeWithHidden(obj, trueType);
    if (hash == 212292208) if (Porffor.fastAnd(Porffor.strcmp(key, '__proto__'), proto !== null)) {
      // set prototype
      if (Porffor.object.isObjectOrNull(value)) __Object_setPrototypeOf(_obj, value);
      return value;
    }

    // check prototype chain for setter
    if (Porffor.fastAnd(proto != null, __Porffor_object_mayHaveSetter(hash))) {
      if (Porffor.comptime.flag`hasFunc.Proxy`) {
        if (Porffor.type(proto) == Porffor.TYPES.proxy) {
          __Porffor_proxy_set(proto, key, value, _obj);
          return value;
        }
      }
      if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);

      let lastProto: any = proto;
      while (true) {
        if ((slot = __Porffor_object_find(proto, key, hash)) != 0) break;

        proto = __Porffor_object_getPrototype(proto);
        if (Porffor.comptime.flag`hasFunc.Proxy`) {
          if (Porffor.type(proto) == Porffor.TYPES.proxy) {
            __Porffor_proxy_set(proto, key, value, _obj);
            return value;
          }
        }
        if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);
        if (Porffor.fastOr(proto == null, Porffor.IR.ptr(proto) == Porffor.IR.ptr(lastProto))) break;
        lastProto = proto;
      }

      if (slot != 0) {
        // found possible setter
        const tail: i32 = __Porffor_object_slotFlags(proto, slot - 1);
        if (tail & 0b0001) {
          // accessor descriptor
          const set: Function = __Porffor_object_slotSetter(proto, slot - 1);
          if (Porffor.IR.ptr(set) == 0) throw new TypeError('Cannot set property with only getter');

          Porffor.callThis(set, _obj, value);
          return value;
        }
        // read-only data
        if ((tail & 0b1000) == 0) throw new TypeError('Cannot assign to read only property');
      }
    }

    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot add property to inextensible object');
    }

    slot = __Porffor_object_add(obj, key, hash, 0b1110) + 1;
  } else {
    // existing entry, modify it
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);

    if (tail & 0b0001) {
      // accessor descriptor
      const set: Function = __Porffor_object_slotSetter(obj, slot - 1);
      if (Porffor.IR.ptr(set) == 0) throw new TypeError('Cannot set property with only getter');

      Porffor.callThis(set, _obj, value);
      return value;
    }

    // data descriptor
    if (!(tail & 0b1000)) {
      // not writable, return now
      throw new TypeError('Cannot modify read-only property of object');
    }
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);

  return value;
};

export const __Porffor_object_setStrict_withHash = (_obj: any, key: any, value: any, hash: i32): any => {
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(_obj) == Porffor.TYPES.proxy) {
      if (!__Porffor_proxy_set(_obj, key, value, _obj)) throw new TypeError('Cannot assign to read only property of proxy');
      return value;
    }
  }
  let obj: any = _obj;
  const trueType: i32 = Porffor.type(obj);
  if (trueType == Porffor.TYPES.regexp) if (__Porffor_object_regexLiKey(_obj, key)) if (__Porffor_object_regexLiStore(_obj, value)) return value;
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    // integer-indexed exotic objects take numeric keys without the prototype chain
    if (Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array)) return __Porffor_object_setStrict(_obj, key, value);
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return value;
  }

  if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot set property of null');

  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    // check prototype chain for setter
    // builtin-typed values inherit setters and getter-only accessors from their hidden prototype
    let proto: any = trueType == Porffor.TYPES.object ? __Porffor_object_getPrototype(obj) : __Porffor_object_getPrototypeWithHidden(obj, trueType);
    if (Porffor.fastAnd(proto != null, __Porffor_object_mayHaveSetter(hash))) {
      if (Porffor.comptime.flag`hasFunc.Proxy`) {
        if (Porffor.type(proto) == Porffor.TYPES.proxy) {
          __Porffor_proxy_set(proto, key, value, _obj);
          return value;
        }
      }
      if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);

      let lastProto: any = proto;
      while (true) {
        if ((slot = __Porffor_object_find(proto, key, hash)) != 0) break;

        proto = __Porffor_object_getPrototype(proto);
        if (Porffor.comptime.flag`hasFunc.Proxy`) {
          if (Porffor.type(proto) == Porffor.TYPES.proxy) {
            __Porffor_proxy_set(proto, key, value, _obj);
            return value;
          }
        }
        if (Porffor.type(proto) != Porffor.TYPES.object) proto = __Porffor_object_underlying(proto);
        if (Porffor.fastOr(proto == null, Porffor.IR.ptr(proto) == Porffor.IR.ptr(lastProto))) break;
        lastProto = proto;
      }

      if (slot != 0) {
        // found possible setter
        const tail: i32 = __Porffor_object_slotFlags(proto, slot - 1);
        if (tail & 0b0001) {
          // accessor descriptor
          const set: Function = __Porffor_object_slotSetter(proto, slot - 1);
          if (Porffor.IR.ptr(set) == 0) throw new TypeError('Cannot set property with only getter');

          Porffor.callThis(set, _obj, value);
          return value;
        }
        // read-only data
        if ((tail & 0b1000) == 0) throw new TypeError('Cannot assign to read only property');
      }
    }

    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot add property to inextensible object');
    }

    slot = __Porffor_object_add(obj, key, hash, 0b1110) + 1;
  } else {
    // existing entry, modify it
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);

    if (tail & 0b0001) {
      // accessor descriptor
      const set: Function = __Porffor_object_slotSetter(obj, slot - 1);
      if (Porffor.IR.ptr(set) == 0) throw new TypeError('Cannot set property with only getter');

      Porffor.callThis(set, _obj, value);
      return value;
    }

    // data descriptor
    if (!(tail & 0b1000)) {
      // not writable, return now
      throw new TypeError('Cannot modify read-only property of object');
    }
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);

  return value;
};

// OrdinarySet with a receiver
export const __Porffor_object_setWithReceiver = (obj: any, key: any, value: any, receiver: any): boolean => {
  key = ecma262.ToPropertyKey(key);
  const hash: i32 = __Porffor_object_hash(key);
  let proto: any = obj;
  while (proto != null) {
    if (Porffor.comptime.flag`hasFunc.Proxy`) {
      if (Porffor.type(proto) == Porffor.TYPES.proxy) return __Porffor_proxy_set(proto, key, value, receiver);
    }

    const holder: any = __Porffor_object_underlying(proto);
    const slot: i32 = __Porffor_object_find(holder, key, hash);
    if (slot != 0) {
      const tail: i32 = __Porffor_object_slotFlags(holder, slot - 1);
      if ((tail & 0b0001) == 0) {
        if ((tail & 0b1000) == 0) return false;
        break;
      }

      const set: Function = __Porffor_object_slotSetter(holder, slot - 1);
      if (Porffor.IR.ptr(set) == 0) return false;
      Porffor.callThis(set, receiver, value);
      return true;
    }

    const next: any = __Porffor_object_getPrototypeWithHidden(proto, Porffor.type(proto));
    if (Porffor.IR.ptr(next) == Porffor.IR.ptr(proto)) break;
    proto = next;
  }

  if (!Porffor.object.isObject(receiver)) return false;
  const existing: any = __Reflect_getOwnPropertyDescriptor(receiver, key);
  if (existing !== undefined) {
    if (existing.writable !== true) return false;
    return __Reflect_defineProperty(receiver, key, { value });
  }

  return __Reflect_defineProperty(receiver, key, { value, writable: true, enumerable: true, configurable: true });
};

// per-site set caches, 12 words, empty words 0:
//  0-3: own writable data hits, direct mapped by shape & 3, each (shape << 16) | slot index
//  4-6, 7-9: appends [from shape, to shape, epoch], held while the prototype chain stays flagged
export const __Porffor_object_set_ic = (_obj: any, key: any, value: any, hash: i32, slot: i32, strict: i32): any => {
  if (Porffor.type(_obj) == Porffor.TYPES.object) {
    if (Porffor.IR.ptr(_obj) != 0) {
      const shape: i32 = Porffor.IR.loadU16(_obj, 6);
      if (shape != 0) {
        const values: i32 = Porffor.IR.loadI32(_obj, 12);
        const own: i32 = Porffor.IR.loadI32(slot + (shape & 3) * 4, 0);
        if (((own >> 16) & 0xffff) == shape) {
          const i: i32 = own & 0xffff;
          Porffor.IR.storeF64(__Porffor_object_valueAt(values, i), 0, value);
          Porffor.IR.storeU8(__Porffor_object_typeAt(values, i), 0, Porffor.type(value));
          Porffor.IR.gcBarrierValue(_obj, Porffor.TYPES.object, value);
          return value;
        }

        for (let p: i32 = slot + 16; p < slot + 40; p += 12) {
          if (Porffor.fastOr(Porffor.IR.loadI32(p, 0) != shape, Porffor.IR.loadI32(p, 8) != icEpoch)) continue;
          const proto: i32 = Porffor.IR.loadI32(_obj, 8);
          const size: i32 = Porffor.IR.loadU16(_obj, 0);
          if (Porffor.fastAnd(
            Porffor.IR.loadU8(_obj, 4) == 0, size < Porffor.IR.loadU16(_obj, 2),
            Porffor.fastOr(proto == 0, (Porffor.IR.loadU8(proto, 4) & 0b10000) != 0)
          )) {
            Porffor.IR.storeF64(__Porffor_object_valueAt(values, size), 0, value);
            Porffor.IR.storeU8(__Porffor_object_typeAt(values, size), 0, Porffor.type(value));
            Porffor.IR.storeU16(_obj, 0, size + 1);
            Porffor.IR.storeU16(_obj, 6, Porffor.IR.loadI32(p, 4));
            Porffor.IR.gcBarrierValue(_obj, Porffor.TYPES.object, value);
            return value;
          }
          break;
        }
      }
    }
  }

  return __Porffor_object_set_icMiss(_obj, key, value, hash, slot, strict);
};

export const __Porffor_object_set_icMiss = (_obj: any, key: any, value: any, hash: i32, slot: i32, strict: i32): any => {
  let shape: i32 = 0;
  let size: i32 = 0;
  if (Porffor.type(_obj) == Porffor.TYPES.object) if (Porffor.IR.ptr(_obj) != 0) {
    shape = Porffor.IR.loadU16(_obj, 6);
    size = Porffor.IR.loadU16(_obj, 0);
  }

  let out: any;
  if (strict) out = __Porffor_object_setStrict_withHash(_obj, key, value, hash);
    else out = __Porffor_object_set_withHash(_obj, key, value, hash);

  if (shape != 0) {
    const after: i32 = Porffor.IR.loadU16(_obj, 6);
    if (after != 0) {
      const found: i32 = __Porffor_object_find(_obj, key, hash);
      if (found == size + 1) {
        // appended without a setter: cache the transition while the chain stays flagged
        if (!__Porffor_object_mayHaveSetter(hash) && __Porffor_object_icFlagChain(_obj)) {
          let p: i32 = slot + 16;
          if (Porffor.fastAnd(Porffor.IR.loadI32(p, 0) != shape, Porffor.IR.loadI32(p, 0) != 0)) p = slot + 28;
          Porffor.IR.storeI32(p, 0, shape);
          Porffor.IR.storeI32(p, 4, after);
          Porffor.IR.storeI32(p, 8, icEpoch);
        }
      } else if (found != 0) {
        if ((__Porffor_object_slotFlags(_obj, found - 1) & 0b1001) == 0b1000) Porffor.IR.storeI32(slot + (after & 3) * 4, 0, (after << 16) | (found - 1));
      }
    }
  }

  return out;
};

export const __Porffor_object_define = (obj: any, key: any, value: any, flags: i32): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return;
  }

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot define property, object is inextensible');
    }

    slot = __Porffor_object_add(obj, key, hash, flags) + 1;
  } else {
    // existing entry, check and maybe modify it
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);

    if ((tail & 0b0010) == 0) {
      // not already configurable, check to see if we can redefine
      let err: boolean = false;

      // descriptor type (accessor/data) and/or flags (other than writable) have changed
      if ((tail & 0b0111) != (flags & 0b0111)) {
        err = true;
      } else if ((tail & 0b1000) == 0) {
        // already non-writable only checks
        // trying to change writable false -> true
        if (flags & 0b1000) {
          err = true;
        } else {
          // if already non-writable, check value isn't being changed
          err = !__Object_is(__Porffor_object_slotValue(obj, slot - 1), value);
        }
      }

      if (err) throw new TypeError('Cannot redefine property');
    }
    __Porffor_object_setSlotFlags(obj, slot - 1, flags);
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);
  if ((flags & 0b1000) == 0) __Porffor_object_markSetKey(hash);
};

export const __Porffor_object_defineAccessor = (obj: any, key: any, get: any, set: any, flags: i32): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return;
  }

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  const getRaw: i32 = Porffor.IR.ptr(get);
  const setRaw: i32 = Porffor.IR.ptr(set);

  if (slot == 0) {
    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot define property, object is inextensible');
    }

    slot = __Porffor_object_add(obj, key, hash, flags) + 1;
  } else {
    // existing entry, check and maybe modify it
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);

    if ((tail & 0b0010) == 0) {
      // not already configurable, check to see if we can redefine
      let err: boolean = false;

      // descriptor type (accessor/data) and/or flags (other than writable) have changed
      if ((tail & 0b0111) != (flags & 0b0111)) {
        err = true;
      } else if ((tail & 0b1000) == 0) {
        // trying to change writable false -> true
        if (flags & 0b1000) err = true;
        if (Porffor.IR.loadI32(__Porffor_object_slotPtr(obj, slot - 1), 0) != getRaw) err = true;
        if (Porffor.IR.loadI32(__Porffor_object_slotPtr(obj, slot - 1), 4) != setRaw) err = true;
      }

      if (err) throw new TypeError('Cannot redefine property');
    }
    __Porffor_object_setSlotFlags(obj, slot - 1, flags);
  }

  __Porffor_object_slotWriteAccessor(obj, slot - 1, getRaw, setRaw);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, get);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, set);
};

export const __Porffor_object_delete = (obj: any, key: any): boolean => {
  if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot delete property of null');

  const trueType: i32 = Porffor.type(obj);
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (trueType == Porffor.TYPES.proxy) return __Porffor_proxy_delete(obj, ecma262.ToPropertyKey(key));
  }
  if (Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array)) {
    const n: any = __Porffor_typedArray_numericKey(ecma262.ToPropertyKey(key));
    if (Porffor.type(n) == Porffor.TYPES.number) return !__Porffor_typedArray_validIndex(obj, n);
  }

  if (trueType == Porffor.TYPES.array) {
    key = ecma262.ToPropertyKey(key);
    const index: i32 = __Porffor_array_propertyKeyIndex(key);
    if (index != -1) {
      if (__Porffor_array_has(obj as any[], index)) {
        __Porffor_array_delete(obj as any[], index);
        return true;
      }

      if (__Porffor_object_underlyingPtr(obj) == 0) return true;
    }
  }

  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return true;
  }

  const entryPtr: i32 = __Porffor_object_lookup(obj, key, __Porffor_object_hash(key));
  if (entryPtr == 0) {
    // not found, stop
    return true;
  }

  const tail: i32 = Porffor.IR.loadU16(entryPtr, 16);
  if (!(tail & 0b0010)) {
    // not configurable
    return false;
  }

  __Porffor_object_removeEntry(obj, entryPtr);
  return true;
};

export const __Porffor_object_deleteStrict = (obj: any, key: any): boolean => {
  if (Porffor.IR.ptr(obj) == 0) throw new TypeError('Cannot delete property of null');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) {
      if (!__Porffor_proxy_delete(obj, ecma262.ToPropertyKey(key))) throw new TypeError('Cannot delete proxy property');
      return true;
    }
  }

  const trueType: i32 = Porffor.type(obj);
  if (Porffor.fastAnd(trueType >= Porffor.TYPES.uint8clampedarray, trueType <= Porffor.TYPES.float64array)) {
    const n: any = __Porffor_typedArray_numericKey(ecma262.ToPropertyKey(key));
    if (Porffor.type(n) == Porffor.TYPES.number) {
      if (!__Porffor_typedArray_validIndex(obj, n)) return true;
      throw new TypeError('Cannot delete typed array element');
    }
  }

  if (trueType == Porffor.TYPES.array) {
    key = ecma262.ToPropertyKey(key);
    const index: i32 = __Porffor_array_propertyKeyIndex(key);
    if (index != -1) {
      if (__Porffor_array_has(obj as any[], index)) {
        __Porffor_array_delete(obj as any[], index);
        return true;
      }

      if (__Porffor_object_underlyingPtr(obj) == 0) return true;
    }
  }

  if (Porffor.type(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return true;
  }

  const entryPtr: i32 = __Porffor_object_lookup(obj, key, __Porffor_object_hash(key));
  if (entryPtr == 0) {
    // not found, stop
    return true;
  }

  const tail: i32 = Porffor.IR.loadU16(entryPtr, 16);
  if (!(tail & 0b0010)) {
    // not configurable
    throw new TypeError('Cannot delete non-configurable property of object');
  }

  __Porffor_object_removeEntry(obj, entryPtr);
  return true;
};

export const __Porffor_object_removeEntry = (obj: any, entryPtr: i32): void => {
  const ind: i32 = (entryPtr - __Porffor_object_entriesPtr(obj)) / 20;

  // decrement size
  __Porffor_object_icInvalidate(obj);
  let size: i32 = Porffor.IR.loadU16(obj, 0);
  Porffor.IR.storeU16(obj, 0, --size);
  // a key index rebuilds on its next lookup
  if (Porffor.IR.loadU8(obj, 4) & 0b1000) Porffor.IR.storeU8(obj, 4, Porffor.IR.loadU8(obj, 4) | 0b100000);

  if (size > ind) {
    Porffor.IR.copy(entryPtr, entryPtr + 20, (size - ind) * 20);
  }
};


// used for { foo: 5 }
export const __Porffor_object_expr_init = (obj: any, key: any, value: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    slot = __Porffor_object_add(obj, key, hash, 0b1110) + 1;
  } else {
    __Porffor_object_setSlotFlags(obj, slot - 1, 0b1110);
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);
};

// used for { get foo() {} }
export const __Porffor_object_expr_get = (obj: any, key: any, get: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  let set: any = undefined;
  if (slot == 0) {
    slot = __Porffor_object_add(obj, key, hash, 0b1111) + 1;
  } else {
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);
    // keep the other half of an existing accessor
    if (tail & 0b0001) set = __Porffor_object_slotSetter(obj, slot - 1);
    __Porffor_object_setSlotFlags(obj, slot - 1, 0b1111);
  }

  __Porffor_object_slotWriteAccessor(obj, slot - 1, get, set);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, get);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, set);
};

// used for { set foo(v) {} }
export const __Porffor_object_expr_set = (obj: any, key: any, set: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  let get: any = undefined;
  if (slot == 0) {
    slot = __Porffor_object_add(obj, key, hash, 0b1111) + 1;
  } else {
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);
    // keep the other half of an existing accessor
    if (tail & 0b0001) get = __Porffor_object_slotGetter(obj, slot - 1);
    __Porffor_object_setSlotFlags(obj, slot - 1, 0b1111);
  }

  __Porffor_object_slotWriteAccessor(obj, slot - 1, get, set);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, get);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, set);
};


// used for { foo: 5 }
export const __Porffor_object_class_value = (obj: any, key: any, value: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot define property, object is inextensible');
    }
    slot = __Porffor_object_add(obj, key, hash, 0b1110) + 1;
  } else {
    if ((__Porffor_object_slotFlags(obj, slot - 1) & 0b0010) == 0) throw new TypeError('Cannot redefine property');
    __Porffor_object_setSlotFlags(obj, slot - 1, 0b1110);
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);
};

// used for { foo() {} }
export const __Porffor_object_class_method = (obj: any, key: any, value: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  if (slot == 0) {
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot define property, object is inextensible');
    }
    slot = __Porffor_object_add(obj, key, hash, 0b1010) + 1;
  } else {
    if ((__Porffor_object_slotFlags(obj, slot - 1) & 0b0010) == 0) throw new TypeError('Cannot redefine property');
    __Porffor_object_setSlotFlags(obj, slot - 1, 0b1010);
  }

  __Porffor_object_slotWrite(obj, slot - 1, value);
};

// used for { get foo() {} }
export const __Porffor_object_class_get = (obj: any, key: any, get: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  let set: any = undefined;
  if (slot == 0) {
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot define property, object is inextensible');
    }
    slot = __Porffor_object_add(obj, key, hash, 0b1011) + 1;
  } else {
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);
    if ((tail & 0b0010) == 0) throw new TypeError('Cannot redefine property');
    // keep the other half of an existing accessor
    if (tail & 0b0001) set = __Porffor_object_slotSetter(obj, slot - 1);
    __Porffor_object_setSlotFlags(obj, slot - 1, 0b1011);
  }

  __Porffor_object_slotWriteAccessor(obj, slot - 1, get, set);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, get);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, set);
};

// used for { set foo(v) {} }
export const __Porffor_object_class_set = (obj: any, key: any, set: any): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object) obj = __Porffor_object_underlying(obj);

  const hash: i32 = __Porffor_object_hash(key);
  let slot: i32 = __Porffor_object_find(obj, key, hash);
  let get: any = undefined;
  if (slot == 0) {
    if (__Porffor_object_isInextensible(obj)) {
      throw new TypeError('Cannot define property, object is inextensible');
    }
    slot = __Porffor_object_add(obj, key, hash, 0b1011) + 1;
  } else {
    const tail: i32 = __Porffor_object_slotFlags(obj, slot - 1);
    if ((tail & 0b0010) == 0) throw new TypeError('Cannot redefine property');
    // keep the other half of an existing accessor
    if (tail & 0b0001) get = __Porffor_object_slotGetter(obj, slot - 1);
    __Porffor_object_setSlotFlags(obj, slot - 1, 0b1011);
  }

  __Porffor_object_slotWriteAccessor(obj, slot - 1, get, set);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, get);
  Porffor.IR.gcBarrierValue(obj, Porffor.TYPES.object, set);
};
