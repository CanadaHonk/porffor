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

export const Proxy = function (target: any, handler: any): any {
  if (target == null) throw new TypeError('Cannot create proxy with a non-object as target');
  if (handler == null) throw new TypeError('Cannot create proxy with a non-object as handler');
  return target;
};

export const __Object_keys = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  const out: any[] = Porffor.array.new(4);

  let i: i32 = 0;
  let arrayLen: i32 = -1;
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
    const endPtr: i32 = ptr + Porffor.IR.loadU16(obj, 0) * 24;

    for (; ptr < endPtr; ptr += 24) {
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

  if (Porffor.type(this) == Porffor.TYPES.object) {
    return Porffor.object.lookup(this, p, __Porffor_object_hash(p)) != 0;
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

  if (Porffor.callThis(__Object_prototype_hasOwnProperty, obj, prop)) {
    return true;
  }

  let lastProto: any = obj;
  while (true) {
    obj = Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
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
      const endPtr: i32 = ptr + Porffor.IR.loadU16(src, 0) * 24;

      for (; ptr < endPtr; ptr += 24) {
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
  const arr: any[] = obj as any[];
  let idx: i32 = -1;

  if (Porffor.type(obj) == Porffor.TYPES.array) {
    idx = __Porffor_array_propertyKeyIndex(p);
  }

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

  if (Porffor.type(obj) != Porffor.TYPES.object) {
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
  const out: any[] = Porffor.array.new(4);

  let i: i32 = 0;
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
    const endPtr: i32 = ptr + Porffor.IR.loadU16(obj, 0) * 24;

    for (; ptr < endPtr; ptr += 24) {
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
  const out: any[] = Porffor.array.new(4);

  obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.object.entriesPtr(obj);
    const endPtr: i32 = ptr + Porffor.IR.loadU16(obj, 0) * 24;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 24) {
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
  let arrayIndex: i32 = -1;

  if (Porffor.type(target) == Porffor.TYPES.array) {
    arrayIndex = __Porffor_array_propertyKeyIndex(p);
    if (prop == 'length' && __Object_hasOwn(desc, 'value')) {
      const v: any = desc.value;
      const n: number = ecma262.ToNumber(v);
      if (Porffor.fastOr(
        Number.isNaN(n), // NaN
        Math.floor(n) != n, // non integer
        n < 0, // negative
        n >= 4294967296, // > 2**32 - 1
      )) throw new RangeError('Invalid array length');

      // set real array length
      __Porffor_array_setLength(target as any[], n);
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

  // todo: toStringTag support
  if (Porffor.type(this) == Porffor.TYPES.array) return '[object Array]';
  if (Porffor.type(this) == Porffor.TYPES.function) return '[object Function]';
  if (Porffor.fastOr(
    Porffor.type(this) == Porffor.TYPES.boolean,
    Porffor.type(this) == Porffor.TYPES.booleanobject)) return '[object Boolean]';
  if (Porffor.fastOr(
    Porffor.type(this) == Porffor.TYPES.number,
    Porffor.type(this) == Porffor.TYPES.numberobject)) return '[object Number]';
  if (Porffor.fastOr(
    (Porffor.type(this) | 0b10000000) == Porffor.TYPES.bytestring,
    Porffor.type(this) == Porffor.TYPES.stringobject)) return '[object String]';
  if (Porffor.type(this) == Porffor.TYPES.date) return '[object Date]';
  if (Porffor.type(this) == Porffor.TYPES.regexp) return '[object RegExp]';

  return '[object Object]';
};

export const __Object_prototype_toLocaleString = function (this: any) { return Porffor.callThis(__Object_prototype_toString, this); };

export const __Object_prototype_valueOf = function (this: any) {
  // todo: ToObject
  return this;
};


export const __Porffor_object_spread = (dst: object, src: any): object => {
  if (src == null) return dst;

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
    const endPtr: i32 = ptr + Porffor.IR.loadU16(src, 0) * 24;

    for (; ptr < endPtr; ptr += 24) {
      const tail: i32 = Porffor.IR.loadU16(ptr, 16);
      if (!(tail & 0b0100)) continue; // not enumerable

      // if key is a symbol skip it, matching __Object_keys
      if (Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol) continue;

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
    const endPtr: i32 = ptr + Porffor.IR.loadU16(src, 0) * 24;
    const blocklistLen: i32 = blocklist.length;

    for (; ptr < endPtr; ptr += 24) {
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
