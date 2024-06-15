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
// }

// struct Map {
//   i32 live_count = 0; // +0
//   i64 table_mask = buckets - 1; // +4
//   i64 entries_length = 0; // +12
//   i64 entries_capacity = <i64>(buckets * fill_factor); // +20
//   Entry** table; // +28
//   Entry* entries; // +32
// }

// hack: throughout this entire process we smuggle i64s as f64s to make porffor happy

// todo: inline
export const __Porffor_fnv_1a_i32 = (_data: i32, hash: i64): i64 => {
  Porffor.wasm`
  local prime i64
  local data i32

  i64.const 0x100000001b3
  local.set prime

  local.get ${_data}
  i32.to_u
  local.set data

  ;; hash ^= (data >> 24) & 0xFF; hash *= prime;
  local.get ${hash}
  i64.reinterpret_f64
  local.get data
  i32.const 24
  i32.shr_u
  i32.const 255
  i32.and
  i64.extend_i32_u
  i64.xor
  local.get prime
  i64.mul

  ;; hash ^= (data >> 16) & 0xFF; hash *= prime;
  local.get data
  i32.const 16
  i32.shr_u
  i32.const 255
  i32.and
  i64.extend_i32_u
  i64.xor
  local.get prime
  i64.mul

  ;; hash ^= (data >> 8) & 0xFF; hash *= prime;
  local.get data
  i32.const 8
  i32.shr_u
  i32.const 255
  i32.and
  i64.extend_i32_u
  i64.xor
  local.get prime
  i64.mul

  ;; hash ^= (data) & 0xFF; hash *= prime;
  local.get data
  i32.const 255
  i32.and
  i64.extend_i32_u
  i64.xor
  local.get prime
  i64.mul

  f64.reinterpret_i64
  i32.const 1
  return`;
}

// todo: inline
export const __Porffor_fnv_1a_i16 = (_data: i32, hash: i64): i64 => {
	Porffor.wasm`
	local prime i64
	local data i32

	i64.const 0x100000001b3
	local.set prime

	local.get ${_data}
	i32.to_u
	local.set data

	;; hash ^= (data >> 8) & 0xFF; hash *= prime;
	local.get ${hash}
	i64.reinterpret_f64
	local.get data
	i32.const 8
	i32.shr_u
	i32.const 255
	i32.and
	i64.extend_i32_u
	i64.xor
	local.get prime
	i64.mul

	;; hash ^= (data) & 0xFF; hash *= prime;
	local.get data
	i32.const 255
	i32.and
	i64.extend_i32_u
	i64.xor
	local.get prime
	i64.mul

	f64.reinterpret_i64
  i32.const 1
	return`;
}


// todo: inline
export const __Porffor_fnv_1a_i8 = (_data: i32, hash: i64): i64 => {
	Porffor.wasm`
	local prime i64
	local data i32

	i64.const 0x100000001b3
	local.set prime

	local.get ${_data}
	i32.to_u
  local.set data

	;; hash ^= (data) & 0xFF; hash *= prime;
	local.get ${hash}
	i64.reinterpret_f64
	local.get data
	i32.const 255
	i32.and
	i64.extend_i32_u
	i64.xor
	local.get prime
	i64.mul

	f64.reinterpret_i64
  i32.const 1
	return`;
}

export const __Porffor_fnv_1a = (value: any): i64 => {
  const offsetBasis: i64 = Porffor.wasm`
  i64.const 0xcbf29ce484222325
  f64.reinterpret_i64`;
  const type: i32 = Porffor.rawType(value);

  if (type == Porffor.TYPES.bytestring) {
    let hash: i64 = offsetBasis;
    let str: bytestring = value;
    hash = __Porffor_fnv_1a_i32(str.length, hash);
    for (let i = 0; i < str.length; i += 4) {
      hash = __Porffor_fnv_1a_i8(Porffor.wasm.i32.load8_u(str + i, 0, 4), hash);
    }
    return hash;
  } else if (type == Porffor.TYPES.string) {
    let hash: i64 = offsetBasis;
    let str: bytestring = value;
    hash = __Porffor_fnv_1a_i32(str.length, hash);
    for (let i = 0; i < str.length; i += 4) {
      hash = __Porffor_fnv_1a_i16(Porffor.wasm.i32.load8_u(str + i, 0, 4), hash);
    }
    return hash;
  }

  // everything else is hashed by value
  let hash: i64 = __Porffor_fnv_1a_i32(value, offsetBasis);
  hash = __Porffor_fnv_1a_i8(type, hash);
  return hash;
};

export const __Porffor_map_lookup = (_this: Map, key: any, hash: i64): i32 => {
  Porffor.wasm`
  local entry i32
  local mask i64
  local endPtr i32
  local thisPtr i32
  local tablePtr i32

  ;; setup this ptr
  local.get ${_this}
  i32.to_u
  local.tee thisPtr

  ;; setup mask
  i64.load 0 4
  local.set mask
  ;; todo: we convert the mask to an i32 later, but this is only okay because the map can't have more than 2^32 entries, this needs to be fixed to allow that

  ;; setup table ptr
  local.get thisPtr
  i32.load 0 28
  local.set tablePtr

  ;; setup endptr
  ;; mask + 1 = size of table
  local.get mask
  i32.wrap_i64
  i32.const 1
  i32.add
  local.get tablePtr
  i32.add
  local.set endPtr

  ;; tablePtr + (hash & mask) * sizeof(i32)
  local.get ${hash}
  i64.reinterpret_f64
  local.get mask
  i64.and
  i32.wrap_i64
  i32.const 4
  i32.mul
  local.get tablePtr
  i32.add

  ;; load the first entry
  i32.load 0 0
  local.set entry

  loop void
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
      ;; return entry as a number (0x01 is TYPES.number)
      local.get entry
      i32.from_u
      i32.const 1
      return
    end

    ;; entry += sizeof(i32)
    i32.const 4
    local.get entry
    i32.add
    local.tee entry

    ;; e < endPtr
    local.get endPtr
    i32.lt_u
    if void
      br 1
    end
  end

  ;; return 0 as a number (0x01 is TYPES.number)
  i32.const 0
  i32.from_u
  i32.const 1
  return`
};

export const __Porffor_map_rehash = (_this: Map, newTableMask: i64) => {
  const newCapacity: i64 = (newTableMask + 1) * (8/3);
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 32);
  const newTablePtr: i32 = Porffor.allocateBytes(4 * (newTableMask + 1)) // sizeof(i32) * (new_table_mask + 1);
  let newEntriesPtr: i32 = Porffor.allocateBytes(18 * newCapacity) // sizeof(Entry) * new_capacity;

  const endPtr: i32 = entriesPtr + 18 * Porffor.wasm.i64.load(_this, 0, 20); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let entry = Porffor.wasm.i32.load(entriesPtr, 0, 0); entry < endPtr; entry += 18) { // sizeof(Entry)
    const key: f64 = Porffor.wasm.f64.load(entry, 0, 0);
    const keyType: i32 = Porffor.wasm.i32.load8_u(entry, 0, 8);
    if (keyType != Porffor.TYPES.empty) {
      const hash: i64 = __Porffor_fnv_1a(key);
      Porffor.wasm`
      ;; hash & newTableMask
      local.get ${hash}
      i64.reinterpret_f64
      local.get ${newTableMask}
      i64.to_u
      i64.and
      ;; newTablePtr + (hash & newTableMask) * sizeof(i32)
      i32.wrap_i64
      i32.const 4
      i32.mul
      local.get ${newTablePtr}
      i32.to_u
      i32.add
      local.get ${entry}
      i32.to_u
      i32.store 0 0`;

      Porffor.wasm.f64.store(newEntriesPtr, key, 0, 0); // entry.key
      Porffor.wasm.i32.store8(newEntriesPtr, keyType, 0, 8); // entry.keyType
      Porffor.wasm.f64.store(newEntriesPtr, Porffor.wasm.f64.load(entry, 0, 9), 0, 9); // entry.value
      Porffor.wasm.i32.store8(newEntriesPtr, Porffor.wasm.i32.load8_u(entry, 0, 17), 0, 17); // entry.valueType
      newEntriesPtr += 18; // sizeof(Entry)
    }
  }

  // todo: discard the perviously used memory, requires gc
  Porffor.wasm.i64.store(_this, newTableMask, 0, 4); // table_mask
  Porffor.wasm.i64.store(_this, newCapacity, 0, 20); // entries_capacity
  Porffor.wasm.i32.store(_this, newTablePtr, 0, 28); // table
  Porffor.wasm.i32.store(_this, entriesPtr, 0, 32); // entries

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
  let hash: i64 = __Porffor_fnv_1a(key);
  let entry: i32 = __Porffor_map_lookup(_this, key, hash);
  if (entry != 0) {
    Porffor.wasm.f64.store(entry, value, 0, 9); // entry.value
    Porffor.wasm.i32.store(entry, Porffor.rawType(value), 0, 17); // entry.valType
  } else {
    const entries_capacity: i64 = Porffor.wasm.i64.load(_this, 0, 20);
    const entries_length: i64 = Porffor.wasm.i64.load(_this, 0, 12);
    const table_mask: i64 = Porffor.wasm.i64.load(_this, 0, 4);

    const entries: i32 = Porffor.wasm.i32.load(_this, 0, 32);

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
    entry = entries + 18 * entries_length; // entry = entries + sizeof(Entry) * entries_length;
    Porffor.wasm.i32.store(_this, entries_length + 1, 0, 12); // entries_length++

    Porffor.wasm.f64.store(entry, key, 0, 0); // entry.key
    Porffor.wasm.i32.store(entry, Porffor.rawType(key), 0, 8); // entry.keyType
    Porffor.wasm.f64.store(entry, value, 0, 9); // entry.value
    Porffor.wasm.i32.store(entry, Porffor.rawType(value), 0, 17); // entry.valueType

    Porffor.wasm`
    ;; get table ptr
    local.get ${_this}
    i32.to_u
    i32.load 0 28
    ;; (hash & table_mask) * sizeof(i32)
    local.get ${hash}
    i64.reinterpret_f64
    local.get ${table_mask}
    i64.to_u
    i64.and
    i32.wrap_i64
    i32.const 4
    i32.mul
    i32.add
    ;; table[...] = entry
    local.get ${entry}
    i32.to_u
    i32.store 0 0`
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
  Porffor.wasm.f64.store(entry, 0, 0, 9); // entry.value = 0;
  Porffor.wasm.i32.store8(entry, 0, 0, 17); // entry.valType = 0;
  const table_mask: i64 = Porffor.wasm.i64.load(_this, 0, 4);
  const entries_length: i64 = Porffor.wasm.i64.load(_this, 0, 12);

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
  // todo: discard the perviously used memory, requires gc
  Porffor.wasm.i32.store(_this, 0, 0, 0); // live_count
  Porffor.wasm.i64.store(_this, 3, 0, 4); // table_mask
  Porffor.wasm.i64.store(_this, 0, 0, 12); // entries_length
  const entries_capacity = (4*(8/3)) | 0;
  Porffor.wasm.i64.store(_this, entries_capacity, 0, 20); // entries_capacity

  const tablePtr: i32 = Porffor.allocateBytes(4 * 4) // sizeof(i32) * buckets;
  Porffor.wasm.i32.store(_this, tablePtr, 0, 28); // table
  const entriesPtr: i32 = Porffor.allocateBytes(18 * entries_capacity) // sizeof(Entry) * entries_capacity;
  Porffor.wasm.i32.store(_this, entriesPtr, 0, 32); // entries

  return;
};

export const Map = function (iterable: any): Map {
  if (!new.target) throw new TypeError("Constructor Map requires 'new' ");

  const _this: Map = Porffor.allocateBytes(36); // sizeof(Map)

  __Map_prototype_clear(_this);

  if (Porffor.fastAnd(
    Porffor.rawType(iterable) != Porffor.TYPES.undefined,
    iterable !== null
  )) for (const x of iterable) {
    __Map_prototype_set(_this, x[0], x[1]);
  }

  return _this;
};

export const __Map_prototype_forEach = (_this: Map, callbackFn: any) => {
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 32);

  const endPtr: i32 = entriesPtr + 18 * Porffor.wasm.i64.load(_this, 0, 20); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let e = entriesPtr; e < endPtr; e += 18) { // sizeof(Entry)
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
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 32);
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

  const endPtr: i32 = entriesPtr + 18 * Porffor.wasm.i64.load(_this, 0, 20); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let e = entriesPtr; e < endPtr; e += 18) { // sizeof(Entry)
    Porffor.wasm`
    local value f64
    local valType i32
    ;; get entry.value and write it
    local.get ${e}
    i32.to_u
    f64.load 0 9
    local.set value
    ;; get entry.valType and write it
    local.get ${e}
    i32.to_u
    i32.load8_u 0 17
    local.set valType
    ;; get entry.keyType
    local.get ${e}
    i32.to_u
    i32.load8_u 0 8
    ;; is key not empty (0x00 is TYPES.empty)
    i32.const 0
    i32.ne
    if void
      local.get elePtr
      local.get value
      f64.store 0 0
      local.get elePtr
      local.get valType
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
  const entriesPtr: i32 = Porffor.wasm.i32.load(_this, 0, 32);
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

  const endPtr: i32 = entriesPtr + 18 * Porffor.wasm.i64.load(_this, 0, 20); // entriesPtr + sizeof(Entry) * entries_capacity
  for (let e = entriesPtr; e < endPtr; e += 18) { // sizeof(Entry)
    Porffor.wasm`
    local key f64
    local keyType i32
    ;; get entry.key and write it
    local.get ${e}
    i32.to_u
    f64.load 0 0
    local.set key
    ;; get entry.keyType and write it
    local.get ${e}
    i32.to_u
    i32.load8_u 0 8
    local.tee keyType
    ;; is key not empty (0x00 is TYPES.empty)
    i32.const 0
    i32.ne
    if void
      local.get elePtr
      local.get key
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