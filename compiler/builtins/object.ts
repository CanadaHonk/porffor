import type {} from './porffor.d.ts';

export const Object = function (value: any): any {
  if (value == null) {
    // if nullish, return new empty object
    return Porffor.object.new();
  }

  // primitives into primitive objects
  if ((Porffor.type(value) | 0b10000000) == Porffor.TYPES.bytestring) return new String(value);
  if (Porffor.type(value) == Porffor.TYPES.number) return new Number(value);
  if (Porffor.type(value) == Porffor.TYPES.boolean) return new Boolean(value);

  // return input
  return value;
};

// proxies enumerate through their ownKeys and getOwnPropertyDescriptor traps
export const __Porffor_proxy_keys = (proxy: any, kind: i32): any[] => {
  const keys: any[] = __Porffor_proxy_ownKeys(proxy);
  const out: any[] = Porffor.array.new(4);
  for (let i: i32 = 0; i < keys.length; i++) {
    const key: any = keys[i];
    const isSymbol: boolean = Porffor.type(key) == Porffor.TYPES.symbol;
    if (kind == 2) {
      if (isSymbol) Porffor.array.fastPush(out, key);
      continue;
    }
    if (isSymbol) continue;
    if (kind == 0) {
      const desc: any = __Porffor_proxy_getOwnPropertyDescriptor(proxy, key);
      if (desc === undefined || !desc.enumerable) continue;
    }
    Porffor.array.fastPush(out, key);
  }
  return out;
};

export const __Object_keys = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_keys(obj, 0);
  }
  const out: any[] = Porffor.array.new(4);

  let i: i32 = 0;
  let arrayLen: i32 = -1;
  const taType: i32 = Porffor.type(obj);
  if (Porffor.fastAnd(taType >= Porffor.TYPES.uint8clampedarray, taType <= Porffor.TYPES.float64array)) {
    const taLen: i32 = __Porffor_typedArray_length(obj);
    for (let j: i32 = 0; j < taLen; j++) out[i++] = Porffor.callThis(__Number_prototype_toString, j);
  }

  if (Porffor.type(obj) == Porffor.TYPES.array) {
    const arrayObj: any[] = obj as any[];
    arrayLen = arrayObj.length;
    obj = __Porffor_object_underlying(obj);
    const objectEntries: i32 = Porffor.type(obj) == Porffor.TYPES.object ? Porffor.IR.loadU16(obj, 0) : 0;
    for (let j: i32 = 0; j < arrayLen; j++) {
      const key: any = Porffor.callThis(__Number_prototype_toString, j);
      if (objectEntries != 0) {
        const entryPtr: i32 = Porffor.object.lookup(obj, key, __Porffor_object_hash(key));
        if (entryPtr != 0) {
          if (Porffor.object.isEnumerable(entryPtr)) out[i++] = key;
          continue;
        }
      }
      if (!__Porffor_array_has(arrayObj, j)) continue;
      out[i++] = key;
    }
  } else {
    obj = __Porffor_object_underlying(obj);
  }

  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.object.entriesPtr(obj);
    const endPtr: i32 = ptr + Porffor.IR.loadU16(obj, 0) * 20;

    for (; ptr < endPtr; ptr += 20) {
      if (!Porffor.object.isEnumerable(ptr)) continue;

      // if key is a symbol skip it
      if (Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol) continue;

      let key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));
      if (arrayLen != -1) {
        const idx: i32 = __Porffor_array_propertyKeyIndex(key);
        if (Porffor.fastAnd(idx != -1, idx < arrayLen)) continue;
      }

      out[i++] = key;
    }
  }

  out.length = i;
  return out;
};

export const __Object_values = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');

  const keys: any[] = __Object_keys(obj);
  const size: i32 = keys.length;
  const out: any[] = Porffor.array.new(size);

  out.length = size;
  for (let i: i32 = 0; i < size; i++) out[i] = __Porffor_object_get(obj, keys[i]);
  return out;
};

export const __Object_entries = (obj: any): any[] => {
  const keys: any[] = __Object_keys(obj);
  const size: i32 = keys.length;
  const out: any[] = Porffor.array.new(size);

  out.length = size;

  for (let i: i32 = 0; i < size; i++) {
    const entry: any[] = Porffor.array.new(2);

    entry.length = 2;
    entry[0] = keys[i];
    entry[1] = __Porffor_object_get(obj, keys[i]);

    out[i] = entry;
  }

  return out;
};

export const __Object_fromEntries = (iterable: any): object => {
  const out: object = {};

  for (const x of iterable) {
    if (!Porffor.object.isObject(x)) throw new TypeError('Iterator contains non-object');
    out[x[0]] = x[1];
  }

  return out;
};


export const __Object_prototype_hasOwnProperty = function (this: any, prop: any) {
  if (this == null) throw new TypeError('Argument is nullish, expected object');
  const p: any = ecma262.ToPropertyKey(prop);
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(this) == Porffor.TYPES.proxy) return __Porffor_proxy_getOwnPropertyDescriptor(this, p) !== undefined;
  }

  if (Porffor.type(this) == Porffor.TYPES.object) {
    return Porffor.object.lookup(this, p, __Porffor_object_hash(p)) != 0;
  }

  if (Porffor.fastAnd(Porffor.type(this) >= Porffor.TYPES.uint8clampedarray, Porffor.type(this) <= Porffor.TYPES.float64array)) {
    const n: any = __Porffor_typedArray_numericKey(p);
    if (Porffor.type(n) == Porffor.TYPES.number) return __Porffor_typedArray_validIndex(this, n);
  }

  if (Porffor.type(this) == Porffor.TYPES.array) {
    const idx: i32 = __Porffor_array_propertyKeyIndex(p);
    if (idx != -1) {
      const obj: any = __Porffor_object_underlying(this);
      if (Porffor.type(obj) == Porffor.TYPES.object) {
        if (Porffor.object.lookup(obj, p, __Porffor_object_hash(p)) != 0) return true;
      }
      return __Porffor_array_has(this as any[], idx);
    }
  }

  const obj: any = __Porffor_object_underlying(this);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    if (Porffor.object.lookup(obj, p, __Porffor_object_hash(p)) != 0) return true;
  }

  const keys: any[] = __Object_keys(this);
  return Porffor.callThis(__Array_prototype_includes, keys, p);
};

export const __Object_hasOwn = (obj: any, prop: any): boolean => {
  return Porffor.callThis(__Object_prototype_hasOwnProperty, obj, prop);
};

export const __Porffor_object_in = (obj: any, prop: any): boolean => {
  // todo: throw if obj is not an object
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_has(obj, ecma262.ToPropertyKey(prop));
  }

  if (Porffor.fastAnd(Porffor.type(obj) >= Porffor.TYPES.uint8clampedarray, Porffor.type(obj) <= Porffor.TYPES.float64array)) {
    const n: any = __Porffor_typedArray_numericKey(ecma262.ToPropertyKey(prop));
    if (Porffor.type(n) == Porffor.TYPES.number) return __Porffor_typedArray_validIndex(obj, n);
  }

  if (Porffor.callThis(__Object_prototype_hasOwnProperty, obj, prop)) {
    return true;
  }

  let lastProto: any = obj;
  while (true) {
    obj = Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
    if (Porffor.comptime.flag`hasFunc.Proxy`) {
      if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_has(obj, ecma262.ToPropertyKey(prop));
    }
    if (Porffor.fastOr(obj == null, Porffor.IR.ptr(obj) == Porffor.IR.ptr(lastProto))) break;

    if (Porffor.callThis(__Object_prototype_hasOwnProperty, obj, prop)) return true;
    lastProto = obj;
  }

  return false;
};

export const __Porffor_object_instanceof = (obj: any, constr: any, checkProto: any): boolean => {
  if (Porffor.type(constr) != Porffor.TYPES.function) {
    throw new TypeError('instanceof right-hand side is not a function');
  }

  if (!Porffor.object.isObject(checkProto)) {
    return false;
  }

  let lastProto: any = obj;
  while (true) {
    obj = Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
    if (Porffor.fastOr(obj == null, Porffor.IR.ptr(obj) == Porffor.IR.ptr(lastProto))) break;

    if (obj === checkProto) return true;
    lastProto = obj;
  }

  return false;
};


export const __Object_assign = (target: any, ...sources: any[]): any => {
  if (target == null) throw new TypeError('Argument is nullish, expected object');

  for (let src of sources) {
    if (src == null) continue;

    if (Porffor.comptime.flag`hasFunc.Proxy`) {
      if (Porffor.type(src) == Porffor.TYPES.proxy) {
        for (const key of __Porffor_proxy_ownKeys(src)) {
          const desc: any = __Porffor_proxy_getOwnPropertyDescriptor(src, key);
          if (desc !== undefined && desc.enumerable) target[key] = __Porffor_proxy_get(src, key, src);
        }
        continue;
      }
    }

    if (Porffor.type(src) == Porffor.TYPES.array) {
      const arrayLen: i32 = (src as any[]).length;
      for (let j: i32 = 0; j < arrayLen; j++) {
        if (!__Porffor_array_has(src as any[], j)) continue;
        target[Porffor.callThis(__Number_prototype_toString, j)] = (src as any[])[j];
      }
    }

    src = __Porffor_object_underlying(src);
    if (Porffor.type(src) == Porffor.TYPES.object) {
      let ptr: i32 = Porffor.object.entriesPtr(src);
      const endPtr: i32 = ptr + Porffor.IR.loadU16(src, 0) * 20;

      for (; ptr < endPtr; ptr += 20) {
        const tail: i32 = Porffor.IR.loadU16(ptr, 16);
        if (!(tail & 0b0100)) continue; // not enumerable

        let key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));

        let value: any;
        if (tail & 0b0001) {
          // accessor - call getter
          const get: Function = Porffor.object.accessorGet(ptr);
          if (Porffor.IR.ptr(get) == 0) {
            value = undefined;
          } else {
            value = get.call(src);
          }
        } else {
          value = Porffor.object.readValue(ptr);
        }

        target[key] = value;
      }
    }
  }

  return target;
};

export const __Object_prototype_propertyIsEnumerable = function (this: any, prop: any) {
  if (this == null) throw new TypeError('Argument is nullish, expected object');

  const p: any = ecma262.ToPropertyKey(prop);

  if (Porffor.type(this) == Porffor.TYPES.object) {
    const entryPtr: i32 = Porffor.object.lookup(this, p, __Porffor_object_hash(p));
    if (entryPtr == 0) return false;

    return Porffor.object.isEnumerable(entryPtr);
  }

  if (Porffor.type(this) == Porffor.TYPES.array) {
    const idx: i32 = __Porffor_array_propertyKeyIndex(p);
    if (idx != -1) {
      const obj: any = __Porffor_object_underlying(this);
      if (Porffor.type(obj) == Porffor.TYPES.object) {
        const entryPtr: i32 = Porffor.object.lookup(obj, p, __Porffor_object_hash(p));
        if (entryPtr != 0) return Porffor.object.isEnumerable(entryPtr);
      }
      return __Porffor_array_has(this as any[], idx);
    }
  }

  const obj: any = __Porffor_object_underlying(this);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    const entryPtr: i32 = Porffor.object.lookup(obj, p, __Porffor_object_hash(p));
    if (entryPtr != 0) return Porffor.object.isEnumerable(entryPtr);
  }

  const keys: any[] = __Object_keys(this);
  return Porffor.callThis(__Array_prototype_includes, keys, p);
};


export const __Object_is = (x: any, y: any): boolean => {
  if (x === y) {
    if (x === 0) {
      // check +0 vs -0
      return 1 / x == 1 / y;
    }

    return true;
  }

  // check NaN
  if (Porffor.type(x) == Porffor.TYPES.number && Number.isNaN(x)) {
    return Number.isNaN(y);
  }

  return false;
};


export const __Object_preventExtensions = (obj: any): any => {
  Porffor.object.preventExtensions(obj);
  return obj;
};

export const __Object_isExtensible = (obj: any): boolean => {
  if (!Porffor.object.isObject(obj)) {
    return false;
  }

  return !Porffor.object.isInextensible(obj);
};


export const __Object_freeze = (obj: any): any => {
  // make inextensible
  Porffor.object.preventExtensions(obj);

  // make all properties non-configurable and non-writable (if data descriptor)
  Porffor.object.overrideAllFlags(obj, 0b0000, 0b0101);

  return obj;
};

export const __Object_isFrozen = (obj: any): boolean => {
  if (!Porffor.object.isObject(obj)) {
    return true;
  }

  // check obj is inextensible
  if (!Porffor.object.isInextensible(obj)) {
    return false;
  }

  // check all properties are non-configurable and non-writable (if data descriptor)
  return Porffor.object.checkAllFlags(obj, 0b1010, 0b0010, 0, 0);
};


export const __Object_seal = (obj: any): any => {
  // make inextensible
  Porffor.object.preventExtensions(obj);

  // make all properties non-configurable
  Porffor.object.overrideAllFlags(obj, 0b0000, 0b1101);

  return obj;
};

export const __Object_isSealed = (obj: any): boolean => {
  if (!Porffor.object.isObject(obj)) {
    return true;
  }

  // check obj is inextensible
  if (!Porffor.object.isInextensible(obj)) {
    return false;
  }

  // check all properties are non-configurable
  return Porffor.object.checkAllFlags(obj, 0b0010, 0b0010, 0, 0);
};


export const __Object_getOwnPropertyDescriptor = (obj: any, prop: any): object|undefined => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  const p: any = ecma262.ToPropertyKey(prop);
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_getOwnPropertyDescriptor(obj, p);
  }
  if (Porffor.fastAnd(Porffor.type(obj) >= Porffor.TYPES.uint8clampedarray, Porffor.type(obj) <= Porffor.TYPES.float64array)) {
    const n: any = __Porffor_typedArray_numericKey(p);
    if (Porffor.type(n) == Porffor.TYPES.number) {
      if (!__Porffor_typedArray_validIndex(obj, n)) return undefined;
      const out: object = {};
      out.value = obj[n];
      out.writable = true;
      out.enumerable = true;
      out.configurable = true;
      return out;
    }
  }

  const arr: any[] = obj as any[];
  let idx: i32 = -1;

  if (Porffor.type(obj) == Porffor.TYPES.array) {
    idx = __Porffor_array_propertyKeyIndex(p);
  }

  if (Porffor.type(obj) == Porffor.TYPES.array) if (__Porffor_array_isLengthKey(p)) __Porffor_array_lengthEntry(arr);
  obj = __Porffor_object_underlying(obj);
  const entryPtr: i32 = Porffor.object.lookup(obj, p, __Porffor_object_hash(p));
  if (entryPtr == 0) {
    if (idx != -1) {
      if (!__Porffor_array_has(arr, idx)) return undefined;
      const out: object = {};
      out.configurable = true;
      out.enumerable = true;
      out.writable = true;
      out.value = arr[idx];
      return out;
    }

    if (Porffor.type(obj) == Porffor.TYPES.function) {
      // hack: function .name and .length
      const v: any = obj[p];
      if (v != null) {
        const out: object = {};
        out.writable = false;
        out.enumerable = false;
        out.configurable = true;

        out.value = v;
        return out;
      }
    }

    return undefined;
  }

  const tail: i32 = Porffor.IR.loadU16(entryPtr, 16);
  const out: object = {};
  out.configurable = !!(tail & 0b0010);
  out.enumerable = !!(tail & 0b0100);

  if (tail & 0b0001) {
    out.get = Porffor.object.accessorGet(entryPtr);
    out.set = Porffor.object.accessorSet(entryPtr);

    return out;
  }

  // data descriptor
  const value: any = Porffor.object.readValue(entryPtr);

  out.writable = !!(tail & 0b1000);
  out.value = value;

  return out;
};

export const __Object_getOwnPropertyDescriptors = (obj: any): object => {
  const out: object = {};

  if (Porffor.fastAnd(Porffor.type(obj) != Porffor.TYPES.object, Porffor.type(obj) != Porffor.TYPES.proxy)) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.type(obj) != Porffor.TYPES.object) return out;
  }

  const keys: any[] = Reflect.ownKeys(obj);
  for (const x of keys) {
    out[x] = __Object_getOwnPropertyDescriptor(obj, x);
  }

  return out;
};


export const __Object_getOwnPropertyNames = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_keys(obj, 1);
  }
  const out: any[] = Porffor.array.new(4);

  let i: i32 = 0;
  const taType: i32 = Porffor.type(obj);
  if (Porffor.fastAnd(taType >= Porffor.TYPES.uint8clampedarray, taType <= Porffor.TYPES.float64array)) {
    const taLen: i32 = __Porffor_typedArray_length(obj);
    for (let j: i32 = 0; j < taLen; j++) out[i++] = Porffor.callThis(__Number_prototype_toString, j);
  }

  if (Porffor.type(obj) == Porffor.TYPES.array) {
    const arrayLen: i32 = (obj as any[]).length;
    for (let j: i32 = 0; j < arrayLen; j++) {
      if (!__Porffor_array_has(obj as any[], j)) continue;
      out[i++] = Porffor.callThis(__Number_prototype_toString, j);
    }
  }

  obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.object.entriesPtr(obj);
    const endPtr: i32 = ptr + Porffor.IR.loadU16(obj, 0) * 20;

    for (; ptr < endPtr; ptr += 20) {
      if (Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol) continue;

      let key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));
      out[i++] = key;
    }
  }

  out.length = i;
  return out;
};

export const __Object_getOwnPropertySymbols = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(obj) == Porffor.TYPES.proxy) return __Porffor_proxy_keys(obj, 2);
  }
  const out: any[] = Porffor.array.new(4);

  obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.object.entriesPtr(obj);
    const endPtr: i32 = ptr + Porffor.IR.loadU16(obj, 0) * 20;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 20) {
      if (Porffor.IR.loadU8(ptr, 18) != Porffor.TYPES.symbol) continue;

      let key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));
      out[i++] = key;
    }

    out.length = i;
  }

  return out;
};


export const __Object_defineProperty = (target: any, prop: any, desc: any): any => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (!Porffor.object.isObject(desc)) throw new TypeError('Descriptor is a non-object');
  const p: any = ecma262.ToPropertyKey(prop);
  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(target) == Porffor.TYPES.proxy) {
      if (!__Porffor_proxy_defineProperty(target, p, desc)) throw new TypeError('Proxy defineProperty trap returned false');
      return target;
    }
  }
  if (Porffor.fastAnd(Porffor.type(target) >= Porffor.TYPES.uint8clampedarray, Porffor.type(target) <= Porffor.TYPES.float64array)) {
    const n: any = __Porffor_typedArray_numericKey(p);
    if (Porffor.type(n) == Porffor.TYPES.number) {
      if (!__Porffor_typedArray_defineIndex(target, n, desc)) throw new TypeError('Cannot redefine typed array element');
      return target;
    }
  }

  let arrayIndex: i32 = -1;

  if (Porffor.type(target) == Porffor.TYPES.array) {
    // 10.4.2.1 [[DefineOwnProperty]] (P, Desc) of array exotic objects
    if (__Porffor_array_isLengthKey(p)) {
      __Porffor_array_defineLength(target as any[], desc);
      return target;
    }

    arrayIndex = __Porffor_array_propertyKeyIndex(p);
    if (arrayIndex != -1) if (arrayIndex >= (target as any[]).length) {
      const lengthEntry: i32 = __Porffor_array_lengthEntry(target as any[]);
      if (lengthEntry != 0) if ((Porffor.IR.loadU8(lengthEntry, 16) & 0b1000) == 0) throw new TypeError('Cannot define array index past non-writable length');
    }
  }

  // base keys
  let configurable: any = desc.configurable;
  let enumerable: any = desc.enumerable;

  // data descriptor keys
  let value: any = desc.value;
  let writable: any = desc.writable;

  let get: any = desc.get;
  let set: any = desc.set;

  let accessor: boolean = false;

  const existingDesc: any = __Object_getOwnPropertyDescriptor(target, prop);

  // todo: should check if has attributes not if undefined
  if (get !== undefined || set !== undefined) {
    if (get !== undefined && Porffor.type(get) != Porffor.TYPES.function) throw new TypeError('Getter must be a function');
    if (set !== undefined && Porffor.type(set) != Porffor.TYPES.function) throw new TypeError('Setter must be a function');

    if (value !== undefined || writable !== undefined) {
      throw new TypeError('Descriptor cannot define both accessor and data descriptor attributes');
    }

    accessor = true;
  } else if (existingDesc && value === undefined && writable === undefined) {
    // all undefined, check if past accessor
    if ('get' in existingDesc || 'set' in existingDesc) accessor = true;
  }

  if (existingDesc) {
    // probably slow due to excessive in's but needs to have them to be spec compliant handling explicit undefined vs non-existent
    if (configurable == null && !('configurable' in desc)) configurable = existingDesc.configurable;
    if (enumerable == null && !('enumerable' in desc)) enumerable = existingDesc.enumerable;

    if (accessor) {
      if (get == null && !('get' in desc)) get = existingDesc.get;
      if (set == null && !('set' in desc)) set = existingDesc.set;
    } else {
      if (value == null && !('value' in desc)) value = existingDesc.value;
      if (writable == null && !('writable' in desc)) writable = existingDesc.writable;
    }
  }

  let flags: i32 = 0b0000;
  if (accessor) flags |= 0b0001;
  if (!!configurable) flags |= 0b0010;
  if (!!enumerable) flags |= 0b0100;
  if (!!writable) flags |= 0b1000;

  if (arrayIndex != -1) if (Porffor.fastAnd(!accessor, flags == 0b1110)) {
    // a default data property is kept as a dense element
    const u: any = __Porffor_object_underlying(target);
    const entryPtr: i32 = Porffor.object.lookup(u, p, __Porffor_object_hash(p));
    if (entryPtr != 0) {
      if ((Porffor.IR.loadU8(entryPtr, 16) & 0b0010) == 0) throw new TypeError('Cannot redefine property');
      __Porffor_object_delete(u, p);
    } else if (!__Porffor_array_has(target as any[], arrayIndex)) {
      if (Porffor.object.isInextensible(u)) throw new TypeError('Cannot define property, object is inextensible');
    }

    (target as any[])[arrayIndex] = value;
    return target;
  }

  if (arrayIndex != -1) if (!__Porffor_array_has(target as any[], arrayIndex)) if (__Porffor_object_isInextensible(target)) {
    if (Porffor.object.lookup(__Porffor_object_underlying(target), p, __Porffor_object_hash(p)) == 0) throw new TypeError('Cannot define property, object is inextensible');
  }

  if (accessor) Porffor.object.defineAccessor(target, p, get, set, flags);
    else Porffor.object.define(target, p, value, flags);

  if (arrayIndex != -1) {
    if (arrayIndex >= (target as any[]).length) __Porffor_array_setLength(target as any[], arrayIndex + 1);
    __Porffor_array_delete(target as any[], arrayIndex);
  }

  return target;
};

export const __Object_defineProperties = (target: any, props: any): any => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (!Porffor.object.isObjectOrSymbol(props)) throw new TypeError('Props needs to be an object or symbol');

  for (const x in props) {
    __Object_defineProperty(target, x, props[x]);
  }

  return target;
};

export const __Object_create = (proto: any, props: any): object => {
  if (!Porffor.object.isObjectOrNull(proto)) throw new TypeError('Prototype should be an object or null');

  const out: object = {};
  Porffor.object.setPrototype(out, proto);

  if (props !== undefined) __Object_defineProperties(out, props);

  return out;
};


export const __Object_groupBy = (items: any, callbackFn: any): object => {
  const out: object = {};

  let i: i32 = 0;
  for (const x of items) {
    const k: any = callbackFn(x, i++);
    if (!__Object_hasOwn(out, k)) {
      const arr: any[] = Porffor.array.new(4);
      out[k] = arr;
    }

    Porffor.array.fastPush(out[k], x);
  }

  return out;
};


export const __Object_getPrototypeOf = (obj: any): any => {
  if (obj == null) throw new TypeError('Object is nullish, expected object');
  return Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
};

export const __Object_setPrototypeOf = (obj: any, proto: any): any => {
  if (obj == null) throw new TypeError('Object is nullish, expected object');
  if (!Porffor.object.isObjectOrNull(proto)) throw new TypeError('Prototype should be an object or null');

  // inextensible: only the current proto is allowed
  if (Porffor.object.isObject(obj) && Porffor.object.isInextensible(obj)) {
    const currentProto: any = Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
    if (proto !== currentProto) throw new TypeError('Cannot set prototype of non-extensible object');
  }

  Porffor.object.setPrototype(obj, proto);
  return obj;
};

export const __Object_prototype_isPrototypeOf = function (this: any, obj: any) {
  if (!Porffor.object.isObject(obj)) return false;
  if (this == null) throw new TypeError('This is nullish, expected object');

  let proto: any = Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
  while (proto != null) {
    if (this == proto) return true;
    proto = Porffor.object.getPrototypeWithHidden(proto, Porffor.type(proto));
  }

  return false;
};


export const __Object_prototype_toString = function (this: any) {
  // 1. If the this value is undefined, return "[object Undefined]".
  if (this === undefined) return '[object Undefined]';

  // 2. If the this value is null, return "[object Null]".
  if (this === null) return '[object Null]';

  const t: i32 = Porffor.type(this);
  let builtinTag: any = 'Object';
  if (t == Porffor.TYPES.array) builtinTag = 'Array';
    else if (t == Porffor.TYPES.function) builtinTag = 'Function';
    else if (Porffor.fastAnd(t >= Porffor.TYPES.error, t <= Porffor.TYPES.suppressederror)) builtinTag = 'Error';
    else if (Porffor.fastOr(t == Porffor.TYPES.boolean, t == Porffor.TYPES.booleanobject)) builtinTag = 'Boolean';
    else if (Porffor.fastOr(t == Porffor.TYPES.number, t == Porffor.TYPES.numberobject)) builtinTag = 'Number';
    else if (Porffor.fastOr((t | 0b10000000) == Porffor.TYPES.bytestring, t == Porffor.TYPES.stringobject)) builtinTag = 'String';
    else if (t == Porffor.TYPES.date) builtinTag = 'Date';
    else if (t == Porffor.TYPES.regexp) builtinTag = 'RegExp';

  const tag: any = this[Symbol.toStringTag];
  if (Porffor.type(tag) == Porffor.TYPES.bytestring) builtinTag = tag;
    else if (Porffor.type(tag) == Porffor.TYPES.string) builtinTag = tag;
    else if (Porffor.fastAnd(tag === undefined, __Porffor_object_getPrototypeWithHidden(this, t) === __Porffor_object_getHiddenPrototype(Porffor.TYPES.object))) {
      // builtin prototypes are built lazily: use their own toStringTag
      if (t == Porffor.TYPES.map) builtinTag = 'Map';
        else if (t == Porffor.TYPES.set) builtinTag = 'Set';
        else if (t == Porffor.TYPES.weakmap) builtinTag = 'WeakMap';
        else if (t == Porffor.TYPES.weakset) builtinTag = 'WeakSet';
        else if (t == Porffor.TYPES.weakref) builtinTag = 'WeakRef';
        else if (t == Porffor.TYPES.promise) builtinTag = 'Promise';
        else if (t == Porffor.TYPES.symbol) builtinTag = 'Symbol';
        else if (t == Porffor.TYPES.bigint) builtinTag = 'BigInt';
        else if (t == Porffor.TYPES.arraybuffer) builtinTag = 'ArrayBuffer';
        else if (t == Porffor.TYPES.sharedarraybuffer) builtinTag = 'SharedArrayBuffer';
        else if (t == Porffor.TYPES.dataview) builtinTag = 'DataView';
        else if (t == Porffor.TYPES.finalizationregistry) builtinTag = 'FinalizationRegistry';
        else if (t == Porffor.TYPES.disposablestack) builtinTag = 'DisposableStack';
        else if (t == Porffor.TYPES.asyncdisposablestack) builtinTag = 'AsyncDisposableStack';
    }

  return '[object ' + builtinTag + ']';
};

export const __Object_prototype_toLocaleString = function (this: any) {
  if (this == null) throw new TypeError('Object.prototype.toLocaleString called on null or undefined');
  return Porffor.callThis(__Object_prototype_toString, this);
};

// 20.1.3.7 Object.prototype.valueOf ()
// https://tc39.es/ecma262/#sec-object.prototype.valueof
export const __Object_prototype_valueOf = function (this: any) {
  // 1. Return ? ToObject(this value).
  return ecma262.ToObject(this);
};

// B.2.2.2/3 Object.prototype.__defineGetter__/__defineSetter__ (P, getter)
export const __Porffor_object_defineGetterSetter = (_this: any, P: any, fn: any, setter: boolean): void => {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(_this);

  // 2. If IsCallable(getter) is false, throw a TypeError exception.
  if (Porffor.type(fn) != Porffor.TYPES.function) {
    if (setter) throw new TypeError('Setter must be a function');
    throw new TypeError('Getter must be a function');
  }

  // 3. Let desc be PropertyDescriptor { [[Get]] (or [[Set]]): getter, [[Enumerable]]: true, [[Configurable]]: true }.
  const desc: object = {};
  if (setter) desc.set = fn;
    else desc.get = fn;
  desc.enumerable = true;
  desc.configurable = true;

  // 4. Let key be ? ToPropertyKey(P).
  // 5. Perform ? DefinePropertyOrThrow(O, key, desc).
  __Object_defineProperty(O, ecma262.ToPropertyKey(P), desc);
};

// B.2.2.2 Object.prototype.__defineGetter__ (P, getter)
// https://tc39.es/ecma262/#sec-object.prototype.__defineGetter__
export const __Object_prototype___defineGetter__ = function (this: any, P: any, getter: any) {
  __Porffor_object_defineGetterSetter(this, P, getter, false);
};

// B.2.2.3 Object.prototype.__defineSetter__ (P, setter)
// https://tc39.es/ecma262/#sec-object.prototype.__defineSetter__
export const __Object_prototype___defineSetter__ = function (this: any, P: any, setter: any) {
  __Porffor_object_defineGetterSetter(this, P, setter, true);
};

// B.2.2.4/5 Object.prototype.__lookupGetter__/__lookupSetter__ (P)
export const __Porffor_object_lookupAccessor = (_this: any, P: any, setter: boolean): any => {
  // 1. Let O be ? ToObject(this value).
  let O: any = ecma262.ToObject(_this);

  // 2. Let key be ? ToPropertyKey(P).
  const key: any = ecma262.ToPropertyKey(P);

  // 3. Repeat,
  while (true) {
    // a. Let desc be ? O.[[GetOwnProperty]](key).
    const desc: any = __Object_getOwnPropertyDescriptor(O, key);

    // b. If desc is not undefined, then
    if (desc !== undefined) {
      // i. If IsAccessorDescriptor(desc) is true, return desc.[[Get]] (or [[Set]]).
      // ii. Return undefined.
      if (setter) return desc.set;
      return desc.get;
    }

    // c. Set O to ? O.[[GetPrototypeOf]]().
    O = __Object_getPrototypeOf(O);

    // d. If O is null, return undefined.
    if (O == null) return undefined;
  }
};

// B.2.2.4 Object.prototype.__lookupGetter__ (P)
// https://tc39.es/ecma262/#sec-object.prototype.__lookupGetter__
export const __Object_prototype___lookupGetter__ = function (this: any, P: any) {
  return __Porffor_object_lookupAccessor(this, P, false);
};

// B.2.2.5 Object.prototype.__lookupSetter__ (P)
// https://tc39.es/ecma262/#sec-object.prototype.__lookupSetter__
export const __Object_prototype___lookupSetter__ = function (this: any, P: any) {
  return __Porffor_object_lookupAccessor(this, P, true);
};


export const __Porffor_object_spread = (dst: object, src: any): object => {
  if (src == null) return dst;

  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(src) == Porffor.TYPES.proxy) {
      for (const key of __Porffor_proxy_ownKeys(src)) {
        const desc: any = __Porffor_proxy_getOwnPropertyDescriptor(src, key);
        if (desc !== undefined && desc.enumerable) Porffor.object.expr.init(dst, key, __Porffor_proxy_get(src, key, src));
      }
      return dst;
    }
  }

  if (Porffor.type(src) == Porffor.TYPES.array) {
    const arrayLen: i32 = (src as any[]).length;
    for (let j: i32 = 0; j < arrayLen; j++) {
      if (!__Porffor_array_has(src as any[], j)) continue;
      Porffor.object.expr.init(dst, Porffor.callThis(__Number_prototype_toString, j), (src as any[])[j]);
    }
  }

  src = __Porffor_object_underlying(src);
  if (Porffor.type(src) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.object.entriesPtr(src);
    const endPtr: i32 = ptr + Porffor.IR.loadU16(src, 0) * 20;

    for (; ptr < endPtr; ptr += 20) {
      const tail: i32 = Porffor.IR.loadU16(ptr, 16);
      if (!(tail & 0b0100)) continue; // not enumerable

      let key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));

      let value: any;
      if (tail & 0b0001) {
        const get: any = Porffor.object.accessorGet(ptr);
        if (Porffor.IR.ptr(get) == 0) value = undefined;
          else value = get.call(src);
      } else {
        value = Porffor.object.readValue(ptr);
      }

      Porffor.object.expr.init(dst, key, value);
    }
  }

  return dst;
};

export const __Porffor_object_rest = (dst: object, src: any, ...blocklist: any[]): object => {
  if (src == null) return dst;

  if (Porffor.comptime.flag`hasFunc.Proxy`) {
    if (Porffor.type(src) == Porffor.TYPES.proxy) {
      for (const key of __Porffor_proxy_ownKeys(src)) {
        if (Porffor.callThis(__Array_prototype_includes, blocklist, key)) continue;
        const desc: any = __Porffor_proxy_getOwnPropertyDescriptor(src, key);
        if (desc !== undefined && desc.enumerable) Porffor.object.expr.init(dst, key, __Porffor_proxy_get(src, key, src));
      }
      return dst;
    }
  }

  if (Porffor.type(src) == Porffor.TYPES.array) {
    const arrayLen: i32 = (src as any[]).length;
    for (let j: i32 = 0; j < arrayLen; j++) {
      if (!__Porffor_array_has(src as any[], j)) continue;
      const indexKey: any = Porffor.callThis(__Number_prototype_toString, j);
      if (Porffor.callThis(__Array_prototype_includes, blocklist, indexKey)) continue;
      Porffor.object.expr.init(dst, indexKey, (src as any[])[j]);
    }
  }

  // todo: use ToPropertyKey on blocklist?
  src = __Porffor_object_underlying(src);
  if (Porffor.type(src) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.object.entriesPtr(src);
    const endPtr: i32 = ptr + Porffor.IR.loadU16(src, 0) * 20;
    const blocklistLen: i32 = blocklist.length;

    for (; ptr < endPtr; ptr += 20) {
      const tail: i32 = Porffor.IR.loadU16(ptr, 16);
      if (!(tail & 0b0100)) continue; // not enumerable

      // if key is a symbol skip it, matching __Object_keys
      if (Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol) continue;

      let key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));

      let blocked: boolean = false;
      for (let i: i32 = 0; i < blocklistLen; i++) {
        if (blocklist[i] === key) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      let value: any;
      if (tail & 0b0001) {
        const get: any = Porffor.object.accessorGet(ptr);
        if (Porffor.IR.ptr(get) == 0) value = undefined;
          else value = get.call(src);
      } else {
        value = Porffor.object.readValue(ptr);
      }

      Porffor.object.expr.init(dst, key, value);
    }
  }

  return dst;
};
