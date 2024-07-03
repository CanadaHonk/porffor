// @porf --valtype=i32
import type {} from './porffor.d.ts';

// todo: padding for memory alignment?
// memory layout:
//  size (u32, 4)
//  root flags (u32, 1):
//   inextensible - 0b0001
// per entry (14):
//  key - value, type MSB encoded (u32, 4)
//  value - value (f64, 8)
//  value - type + obj flag (u16, 2)
//  flags:
//   accessor - 0b0001
//   configurable - 0b0010
//   enumerable - 0b0100
//   writable - 0b1000

export const __Porffor_object_preventExtensions = (ptr: object) => {
  let rootFlags: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 4);
  rootFlags |= 0b0001;
  Porffor.wasm.i32.store8(ptr, rootFlags, 0, 4);
};

export const __Porffor_object_isInextensible = (ptr: object): boolean => {
  const out: boolean = Porffor.wasm.i32.load8_u(ptr, 0, 4) & 0b0001;
  return out;
};


export const __Porffor_object_overrideAllFlags = (_this: object, overrideOr: i32, overrideAnd: i32) => {
  let ptr: i32 = Porffor.wasm`local.get ${_this}` + 5;

  const size: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  const endPtr: i32 = ptr + size * 14;

  for (; ptr < endPtr; ptr += 14) {
    let flags: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 12);
    flags = (flags | overrideOr) & overrideAnd;
    Porffor.wasm.i32.store8(ptr, flags, 0, 12);
  }
};

export const __Porffor_object_checkAllFlags = (_this: object, dataAnd: i32, accessorAnd: i32, dataExpected: i32, accessorExpected: i32): boolean => {
  let ptr: i32 = Porffor.wasm`local.get ${_this}` + 5;

  const size: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  const endPtr: i32 = ptr + size * 14;

  for (; ptr < endPtr; ptr += 14) {
    const flags: i32 = Porffor.wasm.i32.load8_u(ptr, 0, 12);
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

export const __Porffor_object_packAccessor = (get: any, set: any): f64 => {
  // pack i32s get & set into a single f64 (i64)
  Porffor.wasm`
local.get ${set}
i64.extend_i32_u
i64.const 32
i64.shl
local.get ${get}
i64.extend_i32_u
i64.or

f64.reinterpret_i64
i32.const 1
return`;
};

export const __Porffor_object_accessorGet = (entryPtr: i32): Function => {
  const out: Function = Porffor.wasm.i32.load(entryPtr, 0, 4);

  // no getter, return undefined
  if (Porffor.wasm`local.get ${out}` == 0) {
    return undefined;
  }

  return out;
};

export const __Porffor_object_accessorSet = (entryPtr: i32): Function => {
  const out: Function = Porffor.wasm.i32.load(entryPtr, 0, 8);

  // no setter, return undefined
  if (Porffor.wasm`local.get ${out}` == 0) {
    return undefined;
  }

  return out;
};


export const __Porffor_object_lookup = (_this: object, target: any): i32 => {
  const targetType: i32 = Porffor.wasm`local.get ${target+1}`;

  let ptr: i32 = Porffor.wasm`local.get ${_this}` + 5;

  const size: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  const endPtr: i32 = ptr + size * 14;

  if (targetType == Porffor.TYPES.bytestring) {
    const targetStr: bytestring = target;
    for (; ptr < endPtr; ptr += 14) {
      const keyRaw: i32 = Porffor.wasm.i32.load(ptr, 0, 0);
      if (keyRaw == 0) break; // ran out of keys
      if (keyRaw >>> 31) continue; // MSB 1 set, not a bytestring

      const keyStr: bytestring = keyRaw;
      if (keyStr == targetStr) return ptr;
    }
  } else if (targetType == Porffor.TYPES.string) {
    const targetStr: string = target;
    for (; ptr < endPtr; ptr += 14) {
      const keyRaw: i32 = Porffor.wasm.i32.load(ptr, 0, 0);
      if (keyRaw == 0) break; // ran out of keys
      if (keyRaw >>> 30 == 2) { // MSB 1 set and 2 unset, regular string type
        const keyStr: string = keyRaw & 0x7FFFFFFF; // unset MSB
        if (keyStr == targetStr) return ptr;
      }
    }
  } else { // symbol
    const targetSym: symbol = target;
    for (; ptr < endPtr; ptr += 14) {
      const keyRaw: i32 = Porffor.wasm.i32.load(ptr, 0, 0);
      if (keyRaw == 0) break; // ran out of keys
      if (keyRaw >>> 30 == 3) { // MSB 1 and 2 set, symbol
          const keySym: symbol = keyRaw & 0x3FFFFFFF; // unset MSB
          if (keySym == targetSym) return ptr;
        }
      }
    }


  return -1;
};

export const __Porffor_object_get = (_this: any, key: any): any => {
  if (Porffor.wasm`local.get ${_this+1}` == Porffor.TYPES.function) {
    let tmp: bytestring = '';
    tmp = 'name';
    if (key == tmp) {
      const o: bytestring = __Porffor_funcLut_name(_this);
      const t: i32 = Porffor.TYPES.bytestring;
      Porffor.wasm`
local.get ${o}
f64.convert_i32_u
local.get ${t}
return`;
    }

    tmp = 'length';
    if (key == tmp) {
      const o: i32 = __Porffor_funcLut_length(_this);
      Porffor.wasm`
local.get ${o}
f64.convert_i32_u
i32.const 1
return`;
    }

    // undefined
    Porffor.wasm`
f64.const 0
i32.const 128
return`;
  }

  const entryPtr: i32 = __Porffor_object_lookup(_this, key);
  if (entryPtr == -1) {
    Porffor.wasm`
f64.const 0
i32.const 128
return`;
  }

  const tail: i32 = Porffor.wasm.i32.load16_u(entryPtr, 0, 12);

  if (tail & 0b0001) {
    // accessor descriptor
    const get: Function = __Porffor_object_accessorGet(entryPtr);

    // no getter, return undefined
    if (Porffor.wasm`local.get ${get}` == 0) {
      Porffor.wasm`
f64.const 0
i32.const 128
return`;
    }

    const funcFlags: i32 = Porffor.funcLut.flags(get);
    if (funcFlags & 0b10) {
      // constructor func, add new.target, this args
      Porffor.wasm`
f64.const 0
i32.const 0
local.get ${_this}
f64.convert_i32_u
local.get ${_this+1}
local.get ${get}
call_indirect 2 0
return`;
    } else {
      Porffor.wasm`
local.get ${get}
call_indirect 0 0
return`;
    }
  }

  // data descriptor
  Porffor.wasm`
local.get ${entryPtr}
f64.load 0 4
local.get ${tail}
i32.const 8
i32.shr_u
return`;
};

export const __Porffor_object_writeKey = (ptr: i32, key: any) => {
  // encode key type
  let keyEnc: i32 = Porffor.wasm`local.get ${key}`;

  // set MSB 1 if regular string
  if (Porffor.wasm`local.get ${key+1}` == Porffor.TYPES.string) keyEnc |= 0x80000000;
    // set MSB 1&2 if symbol
    else if (Porffor.wasm`local.get ${key+1}` == Porffor.TYPES.symbol) keyEnc |= 0xc0000000;

  // write encoded key to ptr
  Porffor.wasm.i32.store(ptr, keyEnc, 0, 0);
};

export const __Porffor_object_set = (_this: object, key: any, value: any): any => {
  let entryPtr: i32 = __Porffor_object_lookup(_this, key);
  let flags: i32;
  if (entryPtr == -1) {
    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(_this)) {
      return value;
    }

    // bump size +1
    const size: i32 = Porffor.wasm.i32.load(_this, 0, 0);
    Porffor.wasm.i32.store(_this, size + 1, 0, 0);

    // entryPtr = current end of object
    entryPtr = Porffor.wasm`local.get ${_this}` + 5 + size * 14;

    __Porffor_object_writeKey(entryPtr, key);

    // flags = writable, enumerable, configurable, not accessor
    flags = 0b1110;
  } else {
    // existing entry, modify it
    const tail: i32 = Porffor.wasm.i32.load16_u(entryPtr, 0, 12);

    if (tail & 0b0001) {
      // accessor descriptor
      const set: Function = __Porffor_object_accessorSet(entryPtr);

      // no setter, return early
      if (Porffor.wasm`local.get ${set}` == 0) {
        // todo: throw in strict mode?
        return value;
      }

      const funcFlags: i32 = Porffor.funcLut.flags(set);
    if (funcFlags & 0b10) {
      // constructor func, add new.target, this args
      Porffor.wasm`
f64.const 0
i32.const 0
local.get ${_this}
f64.convert_i32_u
i32.const 7
local.get ${value}
local.get ${value+1}
local.get ${set}
call_indirect 3 0`;
    } else {
      Porffor.wasm`
local.get ${value}
local.get ${value+1}
local.get ${set}
call_indirect 1 0`;
    }

      return value;
    }

    // data descriptor
    if (!(tail & 0b1000)) {
      // not writable, return now
      return value;
    }

    // flags = same flags as before
    flags = tail & 0xff;
  }

  // write new value value (lol)
  Porffor.wasm.f64.store(entryPtr, value, 0, 4);

  // write new tail (value type + flags)
  Porffor.wasm.i32.store16(entryPtr,
    flags + (Porffor.wasm`local.get ${value+1}` << 8),
    0, 12);

  return value;
};

export const __Porffor_object_define = (_this: object, key: any, value: any, flags: any): any => {
  let entryPtr: i32 = __Porffor_object_lookup(_this, key);
  if (entryPtr == -1) {
    // add new entry
    // check if object is inextensible
    if (__Porffor_object_isInextensible(_this)) {
      throw new TypeError('Cannot define property, object is inextensible');
    }

    // bump size +1
    const size: i32 = Porffor.wasm.i32.load(_this, 0, 0);
    Porffor.wasm.i32.store(_this, size + 1, 0, 0);

    // entryPtr = current end of object
    entryPtr = Porffor.wasm`local.get ${_this}` + 5 + size * 14;

    __Porffor_object_writeKey(entryPtr, key);
  } else {
    // existing entry, check and maybe modify it
    const tail: i32 = Porffor.wasm.i32.load16_u(entryPtr, 0, 12);

    if ((tail & 0b0010) == 0) {
      // not already configurable, check to see if we can redefine
      if ((tail & 0b1111) != flags) {
        // flags have changed, perform checks
        let err: boolean = false;

        // descriptor type (accessor/data) and/or flags (other than writable) have changed
        if ((tail & 0b0111) != flags) err = true;
          else if (!(tail & 0b0001) && !(tail & 0b1000)) {
          // data descriptor and already non-writable only checks
          // trying to change writable false -> true
          if (flags & 0b1000) {
            err = true;
          } else {
            // if already non-writable, check value isn't being changed
            Porffor.wasm`
local.get ${entryPtr}
f64.load 0 4
local.get ${value}
f64.ne

local.get ${entryPtr}
i32.load8_u 0 13
local.get ${value+1}
i32.ne
i32.or
local.set ${err}`;
          }
        }

        if (err) throw new TypeError('Cannot redefine property');
      }
    }
  }

  // write new value value (lol)
  Porffor.wasm.f64.store(entryPtr, value, 0, 4);

  // write new tail (value type + flags)
  Porffor.wasm.i32.store16(entryPtr,
    flags + (Porffor.wasm`local.get ${value+1}` << 8),
    0, 12);
};

export const __Porffor_object_delete = (_this: object, key: any): boolean => {
  const entryPtr: i32 = __Porffor_object_lookup(_this, key);
  if (entryPtr == -1) {
    // not found, stop
    return true;
  }

  const tail: i32 = Porffor.wasm.i32.load16_u(entryPtr, 0, 12);
  if (!(tail & 0b0010)) {
    // not configurable
    // todo: throw in strict mode
    return false;
  }

  const ind: i32 = (entryPtr - Porffor.wasm`local.get ${_this}`) / 14;

  // decrement size
  let size: i32 = Porffor.wasm.i32.load(_this, 0, 0);
  Porffor.wasm.i32.store(_this, --size, 0, 0);

  if (size > ind) {
    // offset all elements after by -1 ind
    Porffor.wasm`
;; dst = entryPtr
local.get ${entryPtr}

;; src = entryPtr + 14 (+ 1 entry)
local.get ${entryPtr}
i32.const 14
i32.add

;; size = (size - ind) * 14
local.get ${size}
local.get ${ind}
i32.sub
i32.const 14
i32.mul

memory.copy 0 0`;
  }

  return true;
};


export const __Porffor_object_isEnumerable = (entryPtr: i32): boolean => {
  const out: boolean = Porffor.wasm.i32.load8_u(entryPtr, 0, 12) & 0b0100;
  return out;
};


export const __Porffor_object_isObject = (arg: any): boolean => {
  const t: i32 = Porffor.wasm`local.get ${arg+1}`;
  return Porffor.fastAnd(
    arg != 0, // null
    t > 0x05,
    t != Porffor.TYPES.string,
    t != Porffor.TYPES.bytestring,
  );
};

export const __Porffor_object_isObjectOrSymbol = (arg: any): boolean => {
  const t: i32 = Porffor.wasm`local.get ${arg+1}`;
  return Porffor.fastAnd(
    arg != 0, // null
    t > 0x04,
    t != Porffor.TYPES.string,
    t != Porffor.TYPES.bytestring,
  );
};