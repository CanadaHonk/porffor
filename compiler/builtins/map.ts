import type {} from './porffor.d.ts';

// Based on [CloseTable](https://github.com/jorendorff/dht/)

// buckets = 4;
// fill_factor = 8.0/3.0;
// min_vector_fill = 0.25;

// struct Entry {
//   f64 key; // +0
//   i8 keyType; // +8
//   f64 value; // +9
//   i8 valType; // +17
//   i32 chain; // +18
// }

// struct Map {
//   i32 live_count = 0; // +0
//   i32 table_mask = buckets - 1; // +4
//   i32 entries_length = 0; // +8
//   i32 entries_capacity = <i64>(buckets * fill_factor); // +12
//   Entry** table; // +16
//   Entry* entries; // +20
// }

// hack: throughout this entire process we smuggle i64s as f64s to make porffor happy
// todo: to allow for more than 2^32~ish entries, fnv_1a must use a 64 bit hash and wasm must be able to have a 64 bit address space


// todo: inline
export const __Porffor_fnv_1a_i32 = (_data: i32, hash: i64): i64 => {
  Porffor.wasm`
  local prime i32
  local data i32

  i32.const 16777619
  local.set prime

  local.get ${_data}
  i32.to_u
  local.set data

  ;; hash ^= (data >> 24) & 0xFF; hash *= prime;
  local.get ${hash}
  i64.reinterpret_f64
  i32.wrap_i64
  local.get data
  i32.const 24
  i32.shr_u
  i32.const 255
  i32.and
  i32.xor
  local.get prime
  i32.mul

  ;; hash ^= (data >> 16) & 0xFF; hash *= prime;
  local.get data
  i32.const 16
  i32.shr_u
  i32.const 255
  i32.and
  i32.xor
  local.get prime
  i32.mul

  ;; hash ^= (data >> 8) & 0xFF; hash *= prime;
  local.get data
  i32.const 8
  i32.shr_u
  i32.const 255
  i32.and
  i32.xor
  local.get prime
  i32.mul

  ;; hash ^= (data) & 0xFF; hash *= prime;
  local.get data
  i32.const 255
  i32.and
  i32.xor
  local.get prime
  i32.mul

  i64.extend_i32_u
  f64.reinterpret_i64
  i32.const 1
  return`;
}

// todo: inline
export const __Porffor_fnv_1a_i16 = (_data: i32, hash: i64): i64 => {
	Porffor.wasm`
	local prime i32
  local data i32

  i32.const 16777619
  local.set prime

	local.get ${_data}
	i32.to_u
	local.set data

	;; hash ^= (data >> 8) & 0xFF; hash *= prime;
	local.get ${hash}
	i64.reinterpret_f64
  i32.wrap_i64
	local.get data
	i32.const 8
	i32.shr_u
	i32.const 255
	i32.and
	i32.xor
	local.get prime
	i32.mul

	;; hash ^= (data) & 0xFF; hash *= prime;
	local.get data
	i32.const 255
	i32.and
	i32.xor
	local.get prime
	i32.mul

  i64.extend_i32_u
	f64.reinterpret_i64
  i32.const 1
	return`;
}


// todo: inline
export const __Porffor_fnv_1a_i8 = (_data: i32, hash: i64): i64 => {
	Porffor.wasm`
	local prime i32
  local data i32

  i32.const 16777619
  local.set prime

	local.get ${_data}
	i32.to_u
  local.set data

	;; hash ^= (data) & 0xFF; hash *= prime;
	local.get ${hash}
	i64.reinterpret_f64
  i32.wrap_i64
	local.get data
	i32.const 255
	i32.and
	i32.xor
	local.get prime
	i32.mul

  i64.extend_i32_u
	f64.reinterpret_i64
  i32.const 1
	return`;
}

export const __Porffor_fnv_1a = (value: any): i64 => {
  const offsetBasis: i64 = Porffor.wasm`
  i32.const 2166136261
  i64.extend_i32_u
  f64.reinterpret_i64`;
  const type: i32 = Porffor.rawType(value);

  if (type == Porffor.TYPES.bytestring) {
    Porffor.wasm`
    i32.const 1
    local.set ${value+1}` // cast value to number
    let hash: i32 = offsetBasis;
    let strLen: i32 = Porffor.wasm.i32.load(value, 0, 0);
    hash = __Porffor_fnv_1a_i32(strLen, hash);
    strLen *= 2;
    for (let i = 0; i < strLen; i += 2) {
      // still i16 as bytestrings and strings should hash to the same value, if they have the same contents
      hash = __Porffor_fnv_1a_i16(Porffor.wasm.i32.load8_u(value + i, 0, 4), hash);
    }
    return hash;
  } else if (type == Porffor.TYPES.string) {
    Porffor.wasm`
    i32.const 1
    local.set ${value+1}` // cast value to number
    let hash: i32 = offsetBasis;
    let strLen: i32 = Porffor.wasm.i32.load(value, 0, 0);
    hash = __Porffor_fnv_1a_i32(strLen, hash);
    strLen *= 2;
    for (let i = 0; i < strLen; i += 2) {
      hash = __Porffor_fnv_1a_i16(Porffor.wasm.i32.load16_u(value + i, 0, 4), hash);
    }
    return hash;
  }

  let hash: i32 = __Porffor_fnv_1a_i32(value, offsetBasis);
  hash = __Porffor_fnv_1a_i8(type, hash);
  return hash;
};

export const __Porffor_map_lookup = (_this: Map, key: any, hash: i64): i32 => {
  Porffor.wasm`
  local mask i32
  local thisPtr i32
  local entry i32
  local lastEntry i32

  ;; setup this ptr
  local.get ${_this}
  i32.to_u
  local.tee thisPtr

  ;; setup mask
  i32.load 0 4
  local.set mask


  ;; tablePtr + (hash & mask) * sizeof(i32)
  local.get ${hash}
  i64.reinterpret_f64
  i32.wrap_i64
  local.get mask
  i32.and
  i32.const 4
  i32.mul
  ;; get tablePtr
  local.get thisPtr
  i32.load 0 16
  i32.add
  local.set entry

  loop void
    local.get entry
    i32.load 0 0
    local.tee entry
    ;; entry != 0 && entry != lastEntry
    i32.const 0
    i32.ne
    local.get lastEntry
    local.get entry
    i32.ne
    i32.and
    if void
      ;; entry.key
      local.get entry
      f64.load 0 0
      ;; entry.keyType
      local.get entry
      i32.load8_u 0 8

      local.get ${key}
      local.get ${key+1}

      call __ecma262_SameValueZero
      if void
        local.get entry
        i32.from_u
        i32.const 1
        return
      end

      local.get entry
      local.set lastEntry

      ;; entry = entry.chain
      local.get entry
      i32.load 0 18
      local.set entry

      br 1
    end
  end`
  return 0;
};

export const __Porffor_map_rehash = (_this: Map, newTableMask: i32) => {
  const newCapacity: i32 = (newTableMask + 1) * (8/3);
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 20);
  const newTablePtr: i32 = Porffor.allocateBytes(4 * (newTableMask + 1)) // sizeof(i32) * (new_table_mask + 1);
  let newEntriesPtr: i32 = Porffor.allocateBytes(24 * newCapacity) // sizeof(Entry) * new_capacity;

  const endPtr: i32 = entriesPtr + 24 * Porffor.wasm.i32.load(_this, 0, 12); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let entry = entriesPtr; entry < endPtr; entry += 24) { // sizeof(Entry)
    const key: f64 = Porffor.wasm.f64.load(entry, 0, 0);
    const keyType: i32 = Porffor.wasm.i32.load8_u(entry, 0, 8);
    if (keyType != Porffor.TYPES.empty) {
      const hash: i32 = __Porffor_fnv_1a(key);

      Porffor.wasm.f64.store(newEntriesPtr, key, 0, 0); // entry.key
      Porffor.wasm.i32.store8(newEntriesPtr, keyType, 0, 8); // entry.keyType
      Porffor.wasm.f64.store(newEntriesPtr, Porffor.wasm.f64.load(entry, 0, 9), 0, 9); // entry.value
      Porffor.wasm.i32.store8(newEntriesPtr, Porffor.wasm.i32.load8_u(entry, 0, 17), 0, 17); // entry.valueType

      Porffor.wasm`
      local index i32
      ;; hash & newTableMask
      local.get ${hash}
      i64.reinterpret_f64
      i32.wrap_i64
      local.get ${newTableMask}
      i32.to_u
      i32.and
      ;; newTablePtr + (hash & newTableMask) * sizeof(i32)
      i32.const 4
      i32.mul
      local.tee index
      local.get ${newTablePtr}
      i32.to_u
      i32.add
      local.get ${entry}
      i32.to_u
      i32.store 0 0
      ;; set entry.chain
      local.get ${newEntriesPtr}
      i32.to_u
      local.get index
      i32.store 0 18`;

      newEntriesPtr += 24; // sizeof(Entry)
    }
  }

  // todo: discard the perviously used memory, requires gc
  Porffor.wasm.i32.store(_this, newTableMask, 0, 4); // table_mask
  Porffor.wasm`
  local.get ${_this}
  i32_to_u
  local.get ${_this}
  i32_to_u
  i32.load 0 0
  i32.store 0 8` // entries_length = live_count
  Porffor.wasm.i32.store(_this, newCapacity, 0, 12); // entries_capacity
  Porffor.wasm.i32.store(_this, newTablePtr, 0, 16); // table
  Porffor.wasm.i32.store(_this, entriesPtr, 0, 20); // entries

  return;
};

export const __Map_prototype_get = (_this: Map, key: any) => {
  const entry: i32 = __Porffor_map_lookup(_this, key, __Porffor_fnv_1a(key));
  if (entry == 0) return;
  Porffor.wasm`
  ;; entry.value
  local.get ${entry}
  i32.to_u
  f64.load 0 9
  ;; entry.valType
  local.get ${entry}
  i32.to_u
  i32.load8_u 0 17
  return`;
};

export const __Map_prototype_set = (_this: Map, key: any, value: any) => {
  let hash: i32 = __Porffor_fnv_1a(key);
  let entry: i32 = __Porffor_map_lookup(_this, key, hash);
  if (entry != 0) {
    Porffor.wasm.f64.store(entry, value, 0, 9); // entry.value
    Porffor.wasm.i32.store(entry, Porffor.rawType(value), 0, 17); // entry.valType
  } else {
    const entries_capacity: i32 = Porffor.wasm.i32.load(_this, 0, 12);
    const entries_length: i32 = Porffor.wasm.i32.load(_this, 0, 8);
    const table_mask: i32 = Porffor.wasm.i32.load(_this, 0, 4);

    const entries: i32 = Porffor.wasm.i32.load(_this, 0, 20);

    if (entries_length == entries_capacity) {
      // If the table is more than 1/4 deleted entries, simply rehash in
      // place to free up some space. Otherwise, grow the table.
      if (Porffor.wasm.i32.load(_this, 0, 0) >= entries_capacity * 0.75) {
        __Porffor_map_rehash(_this, (table_mask << 1) | 1);
      } else {
        __Porffor_map_rehash(_this, table_mask);
      }
    }


    Porffor.wasm.i32.store(_this, Porffor.wasm.i32.load(_this, 0, 0) + 1, 0, 0); // live_count++;
    entry = entries + 24 * entries_length; // entry = entries + sizeof(Entry) * entries_length;
    Porffor.wasm.i32.store(_this, entries_length + 1, 0, 8); // entries_length++

    Porffor.wasm.f64.store(entry, key, 0, 0); // entry.key
    Porffor.wasm.i32.store8(entry, Porffor.rawType(key), 0, 8); // entry.keyType
    Porffor.wasm.f64.store(entry, value, 0, 9); // entry.value
    Porffor.wasm.i32.store8(entry, Porffor.rawType(value), 0, 17); // entry.valueType

    Porffor.wasm`
    local index i32
    ;; get table ptr
    local.get ${_this}
    i32.to_u
    i32.load 0 16
    ;; (hash & table_mask) * sizeof(i32)
    local.get ${hash}
    i64.reinterpret_f64
    i32.wrap_i64
    local.get ${table_mask}
    i32.to_u
    i32.and
    i32.const 4
    i32.mul
    i32.add
    local.tee index
    ;; table[...] = entry
    local.get ${entry}
    i32.to_u
    i32.store 0 0
    ;; set entry.chain
    local.get ${entry}
    i32.to_u
    local.get index
    i32.store 0 18`
  }

  return _this;
};

export const __Map_prototype_delete = (_this: Map, key: any): boolean => {
  const entry: i32 = __Porffor_map_lookup(_this, key, __Porffor_fnv_1a(key));
  if (entry == 0) return false;
  const new_size: i32 = Porffor.wasm.i32.load(_this, 0, 0) - 1;
  Porffor.wasm.i32.store(_this, new_size, 0, 0); // live_count--;
  Porffor.wasm.f64.store(entry, 0, 0, 0); // entry.key = 0;
  Porffor.wasm.i32.store8(entry, 0, 0, 8); // entry.keyType = 0;
  const table_mask: i32 = Porffor.wasm.i32.load(_this, 0, 4);
  const entries_length: i32 = Porffor.wasm.i32.load(_this, 0, 8);

  if (table_mask > 4 && new_size < entries_length * 0.25) {
    __Porffor_map_rehash(_this, table_mask >> 1);
  }
  return true;
};

export const __Map_prototype_has = (_this: Map, key: any) => {
  return __Porffor_map_lookup(_this, key, __Porffor_fnv_1a(key)) != 0;
};

export const __Map_prototype_size$get = (_this: Map) => {
  return Porffor.wasm.i32.load(_this, 0, 0);
};

export const __Map_prototype_clear = (_this: Map) => {
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 20);

  const endPtr: i32 = entriesPtr + 24 * Porffor.wasm.i32.load(_this, 0, 12); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let e = entriesPtr; e < endPtr; e += 24) { // sizeof(Entry)
    // entry.keyType = TYPES.empty
    Porffor.wasm.i32.store8(e, Porffor.TYPES.empty, 0, 8);
  };

  return;
};

export const Map = function (iterable: any): Map {
  if (!new.target) throw new TypeError("Constructor Map requires 'new' ");

  const _this: Map = Porffor.allocateBytes(24); // sizeof(Map)

  // todo: discard the perviously used memory, requires gc
  Porffor.wasm.i32.store(_this, 0, 0, 0); // live_count
  Porffor.wasm.i32.store(_this, 3, 0, 4); // table_mask
  Porffor.wasm.i32.store(_this, 0, 0, 8); // entries_length
  const entries_capacity = (4*(8/3)) | 0;
  Porffor.wasm.i32.store(_this, entries_capacity, 0, 12); // entries_capacity

  const tablePtr: i32 = Porffor.allocateBytes(4 * 4) // sizeof(i32) * buckets;
  Porffor.wasm.i32.store(_this, tablePtr, 0, 16); // table
  const entriesPtr: i32 = Porffor.allocateBytes(24 * entries_capacity) // sizeof(Entry) * entries_capacity;
  Porffor.wasm.i32.store(_this, entriesPtr, 0, 20); // entries

  if (Porffor.fastAnd(
    Porffor.rawType(iterable) != Porffor.TYPES.undefined,
    iterable !== null
  )) for (const x of iterable) {
    __Map_prototype_set(_this, x[0], x[1]);
  }

  return _this;
};

export const __Map_prototype_forEach = (_this: Map, callbackFn: any) => {
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 20);

  const endPtr: i32 = entriesPtr + 24 * Porffor.wasm.i32.load(_this, 0, 12); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let e = entriesPtr; e < endPtr; e += 24) { // sizeof(Entry)
    let key: any = undefined;
    let value: any = undefined;
    Porffor.wasm`
    ;; get entry.key and write it
    local.get ${e}
    i32.to_u
    f64.load 0 0
    local.set ${key}
    ;; get entry.keyType and write it
    local.get ${e}
    i32.to_u
    i32.load8_u 0 8
    local.tee ${key+1}
    ;; is key empty (0x00 is TYPES.empty)
    i32.eqz
    if void
      ;; skip the key, continue the loop
      br 1
    end
    ;; get entry.value and write it
    local.get ${e}
    i32.to_u
    f64.load 0 9
    local.set ${value}
    ;; get entry.valType and write it
    local.get ${e}
    i32.to_u
    i32.load8_u 0 17
    local.set ${value+1}`;
    callbackFn(value, key, _this);
  }

  return;
};

export const __Map_prototype_values = (_this: Map) => {
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 20);
  const out: any[] = Porffor.allocate();

  Porffor.wasm`
  local len i32
  local elePtr i32
  ;; create element ptr
  local.get ${out}
  i32.to_u
  i32.const 4
  i32.add
  local.set elePtr`;

  const endPtr: i32 = entriesPtr + 24 * Porffor.wasm.i32.load(_this, 0, 12); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let e = entriesPtr; e < endPtr; e += 24) { // sizeof(Entry)
    Porffor.wasm`
    ;; get entry.keyType
    local.get ${e}
    i32.to_u
    i32.load8_u 0 8
    ;; is key not empty (0x00 is TYPES.empty)
    i32.const 0
    i32.ne
    if void
      ;; get entry.value and write it
      local.get elePtr
      local.get ${e}
      i32.to_u
      f64.load 0 9
      f64.store 0 0
      ;; get entry.valType and write it
      local.get elePtr
      local.get ${e}
      i32.to_u
      i32.load8_u 0 17
      i32.store8 0 8
      ;; increment length
      local.get len
      i32.const 1
      i32.add
      local.set len
      ;; elePtr += 9
      local.get elePtr
      i32.const 9
      i32.add
      local.set elePtr
    end`;
  }

  Porffor.wasm`
  local.get ${out}
  i32.to_u
  local.get len
  i32.store 0 0`

  return out;
};

export const __Map_prototype_keys = (_this: Map) => {
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 20);
  const out: any[] = Porffor.allocate();

  Porffor.wasm`
  local len i32
  local elePtr i32
  ;; create element ptr
  local.get ${out}
  i32.to_u
  i32.const 4
  i32.add
  local.set elePtr`;

  const endPtr: i32 = entriesPtr + 24 * Porffor.wasm.i32.load(_this, 0, 12); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let e = entriesPtr; e < endPtr; e += 24) { // sizeof(Entry)
    Porffor.wasm`
    local keyType i32
    ;; get entry.keyType and write it
    local.get ${e}
    i32.to_u
    i32.load8_u 0 8
    local.tee keyType
    ;; is key not empty (0x00 is TYPES.empty)
    i32.const 0
    i32.ne
    if void
      ;; get entry.key and write it
      local.get elePtr
      local.get ${e}
      i32.to_u
      f64.load 0 0
      f64.store 0 0
      local.get elePtr
      local.get keyType
      i32.store8 0 8
      ;; increment length
      local.get len
      i32.const 1
      i32.add
      local.set len
      ;; elePtr += 9
      local.get elePtr
      i32.const 9
      i32.add
      local.set elePtr
    end`;
  }

  Porffor.wasm`
  local.get ${out}
  i32.to_u
  local.get len
  i32.store 0 0`

  return out;
};