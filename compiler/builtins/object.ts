import type {} from './porffor.d.ts';

export const Object = function (value: any): any {
  if (value == null) {
    // if nullish, return new empty object
    return Porffor.allocate() as object;
  }

  // primitives into primitive objects
  if ((Porffor.type(value) | 0b10000000) == Porffor.TYPES.bytestring) return new String(value);
  if (Porffor.type(value) == Porffor.TYPES.number) return new Number(value);
  if (Porffor.type(value) == Porffor.TYPES.boolean) return new Boolean(value);

  // return input
  return value;
};

export const __Object_keys = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  const out: any[] = Porffor.allocate();

  obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 8;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load16_u(obj, 0, 0) * 18;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 18) {
      if (!Porffor.object.isEnumerable(ptr)) continue;

      let key: any;
      Porffor.wasm`local raw i32
local msb i32
local.get ${ptr}
i32.to_u
i32.load 0 4
local.set raw

local.get raw
i32.const 30
i32.shr_u
local.tee msb
if 127
  i32.const 5 ;; symbol
  i32.const 67 ;; string
  local.get msb
  i32.const 3
  i32.eq
  select
  local.set ${key+1}

  local.get raw
  i32.const 1073741823
  i32.and ;; unset 2 MSBs
else
  i32.const 195
  local.set ${key+1}

  local.get raw
end
i32.from_u
local.set ${key}`;

      out[i++] = key;
    }

    out.length = i;
  }

  return out;
};

export const __Object_values = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  const out: any[] = Porffor.allocate();

  obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 8;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load16_u(obj, 0, 0) * 18;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 18) {
      if (!Porffor.object.isEnumerable(ptr)) continue;

      let val: any;

      const tail: i32 = Porffor.wasm.i32.load16_u(ptr, 0, 16);
      if (tail & 0b0001) {
        const get: Function = Porffor.object.accessorGet(ptr);

        if (Porffor.wasm`local.get ${get}` != 0) {
          val = get.call(obj);
        }
      } else {
        Porffor.wasm`
local.get ${ptr}
i32.to_u

f64.load 0 8
local.set ${val}

local.get ${tail}
i32_to_u
i32.const 8 
i32.shr_u
local.set ${val+1}`;
      }

      out[i++] = val;
    }

    out.length = i;
  }

  return out;
};

export const __Object_entries = (obj: any): any[] => {
  const out: any[] = Porffor.allocate();

  const keys: any[] = __Object_keys(obj);
  const vals: any[] = __Object_values(obj);

  const size: i32 = keys.length;
  out.length = size;

  for (let i: i32 = 0; i < size; i++) {
    // what is memory efficiency anyway?
    const entry: any[] = Porffor.allocate();

    entry.length = 2;
    entry[0] = keys[i];
    entry[1] = vals[i];

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


export const __Object_prototype_hasOwnProperty = (_this: any, prop: any) => {
  if (_this == null) throw new TypeError('Argument is nullish, expected object');
  const p: any = ecma262.ToPropertyKey(prop);

  if (Porffor.type(_this) == Porffor.TYPES.object) {
    return Porffor.object.lookup(_this, p, __Porffor_object_hash(p)) != -1;
  }

  const obj: any = __Porffor_object_underlying(_this);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    if (Porffor.object.lookup(obj, p, __Porffor_object_hash(p)) != -1) return true;
  }

  const keys: any[] = __Object_keys(_this);
  return __Array_prototype_includes(keys, p);
};

export const __Object_hasOwn = (obj: any, prop: any): boolean => {
  return __Object_prototype_hasOwnProperty(obj, prop);
};

export const __Porffor_object_in = (obj: any, prop: any): boolean => {
  // todo: throw if obj is not an object

  if (__Object_prototype_hasOwnProperty(obj, prop)) {
    return true;
  }

  let lastProto: any = obj;
  while (true) {
    obj = Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
    if (Porffor.fastOr(obj == null, Porffor.wasm`local.get ${obj}` == Porffor.wasm`local.get ${lastProto}`)) break;

    if (__Object_prototype_hasOwnProperty(obj, prop)) return true;
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
    if (Porffor.fastOr(obj == null, Porffor.wasm`local.get ${obj}` == Porffor.wasm`local.get ${lastProto}`)) break;

    if (obj === checkProto) return true;
    lastProto = obj;
  }

  return false;
};


export const __Object_assign = (target: any, ...sources: any[]): any => {
  if (target == null) throw new TypeError('Argument is nullish, expected object');

  for (const x of sources) {
    // todo: switch to for..in once it supports non-pure-object
    const keys: any[] = __Object_keys(x);
    const vals: any[] = __Object_values(x);

    const len: i32 = keys.length;
    for (let i: i32 = 0; i < len; i++) {
      target[keys[i]] = vals[i];
    }
  }

  return target;
};

// Object.assign but also non enumerable properties and 1 source
export const __Porffor_object_assignAll = (target: any, source: any): any => {
  if (target == null) throw new TypeError('Argument is nullish, expected object');

  const keys: any[] = Reflect.ownKeys(source);
  for (const x of keys) {
    target[x] = source[x];
  }

  return target;
};


export const __Object_prototype_propertyIsEnumerable = (_this: any, prop: any) => {
  if (_this == null) throw new TypeError('Argument is nullish, expected object');

  const p: any = ecma262.ToPropertyKey(prop);

  if (Porffor.type(_this) == Porffor.TYPES.object) {
    const entryPtr: i32 = Porffor.object.lookup(_this, p, __Porffor_object_hash(p));
    if (entryPtr == -1) return false;

    return Porffor.object.isEnumerable(entryPtr);
  }

  const obj: any = __Porffor_object_underlying(_this);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    const entryPtr: i32 = Porffor.object.lookup(obj, p, __Porffor_object_hash(p));
    if (entryPtr != -1) return Porffor.object.isEnumerable(entryPtr);
  }

  const keys: any[] = __Object_keys(_this);
  return __Array_prototype_includes(keys, p);
};


export const __Object_is = (x: any, y: any): boolean => {
  if (x === y) {
    if (x == 0) {
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

  obj = __Porffor_object_underlying(obj);
  const entryPtr: i32 = Porffor.object.lookup(obj, p, __Porffor_object_hash(p));
  if (entryPtr == -1) {
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

  const tail: i32 = Porffor.wasm.i32.load16_u(entryPtr, 0, 16);
  const out: object = {};
  out.configurable = !!(tail & 0b0010);
  out.enumerable = !!(tail & 0b0100);

  if (tail & 0b0001) {
    out.get = Porffor.object.accessorGet(entryPtr);
    out.set = Porffor.object.accessorSet(entryPtr);

    return out;
  }

  // data descriptor
  const value: any = Porffor.wasm.f64.load(entryPtr, 0, 8);
  Porffor.wasm`
local.get ${tail}
i32.to_u
i32.const 8
i32.shr_u
local.set ${value+1}`;

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
  const out: any[] = Porffor.allocate();

  obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 8;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load16_u(obj, 0, 0) * 18;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 18) {
      let key: any;
      Porffor.wasm`local raw i32
local msb i32
local.get ${ptr}
i32.to_u
i32.load 0 4
local.set raw

local.get raw
i32.const 30
i32.shr_u
local.tee msb
if 127
  i32.const 5 ;; symbol
  i32.const 67 ;; string
  local.get msb
  i32.const 3
  i32.eq
  select
  local.set ${key+1}

  local.get raw
  i32.const 1073741823
  i32.and ;; unset 2 MSBs
else
  i32.const 195
  local.set ${key+1}

  local.get raw
end
i32.from_u
local.set ${key}`;

      if (Porffor.type(key) == Porffor.TYPES.symbol) continue;
      out[i++] = key;
    }

    out.length = i;
  }

  return out;
};

export const __Object_getOwnPropertySymbols = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  const out: any[] = Porffor.allocate();

  obj = __Porffor_object_underlying(obj);
  if (Porffor.type(obj) == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 8;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load16_u(obj, 0, 0) * 18;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 18) {
      let key: any;
      Porffor.wasm`local raw i32
local msb i32
local.get ${ptr}
i32.to_u
i32.load 0 4
local.set raw

local.get raw
i32.const 30
i32.shr_u
local.tee msb
if 127
  i32.const 5 ;; symbol
  i32.const 67 ;; string
  local.get msb
  i32.const 3
  i32.eq
  select
  local.set ${key+1}

  local.get raw
  i32.const 1073741823
  i32.and ;; unset 2 MSBs
else
  i32.const 195
  local.set ${key+1}

  local.get raw
end
i32.from_u
local.set ${key}`;

      if (Porffor.type(key) != Porffor.TYPES.symbol) continue;
      out[i++] = key;
    }

    out.length = i;
  }

  return out;
};


export const __Object_defineProperty = (target: any, prop: any, desc: any): any => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (!Porffor.object.isObject(desc)) throw new TypeError('Descriptor is a non-object');

  if (Porffor.type(target) == Porffor.TYPES.array) {
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
      Porffor.wasm.i32.store(target, n, 0, 0);
    }
  }

  const p: any = ecma262.ToPropertyKey(prop);

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

  if (accessor) value = Porffor.object.packAccessor(get, set);

  Porffor.object.define(target, p, value, flags);
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
      const arr: any[] = Porffor.allocate();
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

  // todo: if inextensible, throw if proto != current prototype

  Porffor.object.setPrototype(obj, proto);
  return obj;
};

export const __Object_prototype_isPrototypeOf = (_this: any, obj: any) => {
  if (_this == null) throw new TypeError('This is nullish, expected object');

  if (!Porffor.object.isObject(obj)) return false;
  return _this == Porffor.object.getPrototypeWithHidden(obj, Porffor.type(obj));
};


export const __Object_prototype_toString = (_this: any) => {
  if (Porffor.type(_this) == Porffor.TYPES.object) {
    // todo: breaks with Foo.prototype
    const obj: object = _this;
    if (obj != null) {
      let ovr: any = obj.toString;
      if (Porffor.type(ovr) == Porffor.TYPES.function && ovr != __Object_prototype_toString) return ovr.call(_this);

      const entryPtr: i32 = Porffor.object.lookup(obj, 'toString', __Porffor_object_hash('toString')); // todo: comptime
      if (entryPtr != -1) {
        ovr = Porffor.object.readValue(entryPtr);
        if (Porffor.type(ovr) == Porffor.TYPES.function) return ovr.call(_this);
          else return undefined;
      }
    }
  }

  // 1. If the this value is undefined, return "[object Undefined]".
  if (_this === undefined) return '[object Undefined]';

  // 2. If the this value is null, return "[object Null]".
  if (_this === null) return '[object Null]';

  // todo: toStringTag support
  if (Porffor.type(_this) == Porffor.TYPES.array) return '[object Array]';
  if (Porffor.type(_this) == Porffor.TYPES.function) return '[object Function]';
  if (Porffor.fastOr(
    Porffor.type(_this) == Porffor.TYPES.boolean,
    Porffor.type(_this) == Porffor.TYPES.booleanobject)) return '[object Boolean]';
  if (Porffor.fastOr(
    Porffor.type(_this) == Porffor.TYPES.number,
    Porffor.type(_this) == Porffor.TYPES.numberobject)) return '[object Number]';
  if (Porffor.fastOr(
    Porffor.type(_this) == Porffor.TYPES.string,
    Porffor.type(_this) == Porffor.TYPES.bytestring,
    Porffor.type(_this) == Porffor.TYPES.stringobject)) return '[object String]';
  if (Porffor.type(_this) == Porffor.TYPES.date) return '[object Date]';
  if (Porffor.type(_this) == Porffor.TYPES.regexp) return '[object RegExp]';

  return '[object Object]';
};

export const __Object_prototype_toLocaleString = (_this: any) => __Object_prototype_toString(_this);

export const __Object_prototype_valueOf = (_this: any) => {
  // todo: ToObject
  if (Porffor.type(_this) == Porffor.TYPES.object) {
    // todo: breaks with Foo.prototype
    const obj: object = _this;
    if (obj != null) {
      let ovr: any = obj.valueOf;
      if (Porffor.type(ovr) == Porffor.TYPES.function && ovr != __Object_prototype_valueOf) return ovr.call(_this);

      const entryPtr: i32 = Porffor.object.lookup(obj, 'valueOf', __Porffor_object_hash('valueOf')); // todo: comptime
      if (entryPtr != -1) {
        ovr = Porffor.object.readValue(entryPtr);
        if (Porffor.type(ovr) == Porffor.TYPES.function) return ovr.call(_this);
          else return undefined;
      }
    }
  }

  return _this;
};


export const __Porffor_object_spread = (dst: object, src: any): object => {
  if (src == null) return dst;

  // todo/perf: optimize this (and assign) for object instead of reading over object 2x
  const keys: any[] = __Object_keys(src);
  const vals: any[] = __Object_values(src);

  const len: i32 = keys.length;
  for (let i: i32 = 0; i < len; i++) {
    // target[keys[i]] = vals[i];
    Porffor.object.expr.init(dst, keys[i], vals[i]);
  }

  return dst;
};

export const __Porffor_object_rest = (dst: object, src: any, ...blocklist: any[]): object => {
  if (src == null) return dst;

  // todo: use ToPropertyKey on blocklist?

  // todo/perf: optimize this (and assign) for object instead of reading over object 2x
  const keys: any[] = __Object_keys(src);
  const vals: any[] = __Object_values(src);

  const len: i32 = keys.length;
  for (let i: i32 = 0; i < len; i++) {
    const k: any = keys[i];
    if (blocklist.includes(k)) continue;

    Porffor.object.expr.init(dst, k, vals[i]);
  }

  return dst;
};