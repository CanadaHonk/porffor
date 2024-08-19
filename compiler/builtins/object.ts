import type {} from './porffor.d.ts';

export const Object = function (value: any): object {
  new.target; // trick compiler into allowing as constructor

  if (value == null) {
    // if nullish, return new empty object
    const obj: object = Porffor.allocate();
    return obj;
  }

  // todo: turn primitive args into objects
  // return input
  return value;
};

export const __Object_keys = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');
  const out: any[] = Porffor.allocate();

  obj = __Porffor_object_underlying(obj);
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 5;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load(obj, 0, 0) * 14;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 14) {
      if (!Porffor.object.isEnumerable(ptr)) continue;

      let key: any;
      Porffor.wasm`local raw i32
local msb i32
local.get ${ptr}
i32.to_u
i32.load 0 0
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
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 5;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load(obj, 0, 0) * 14;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 14) {
      if (!Porffor.object.isEnumerable(ptr)) continue;

      let val: any;
      Porffor.wasm`local ptr32 i32
local.get ${ptr}
i32.to_u
local.tee ptr32

f64.load 0 4
local.set ${val}

local.get ptr32
i32.load8_u 0 13
local.set ${val+1}`;

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
  const p: any = ecma262.ToPropertyKey(prop);

  const t: i32 = Porffor.rawType(_this);
  if (t == Porffor.TYPES.object) {
    return Porffor.object.lookup(_this, p) != -1;
  }

  if (t == Porffor.TYPES.function) {
    const tmp1: bytestring = 'name';
    if (p == tmp1) return !__Porffor_funcLut_isNameDeleted(_this);

    const tmp2: bytestring = 'length';
    if (p == tmp2) return !__Porffor_funcLut_isLengthDeleted(_this);

    return Porffor.object.lookup(_this, p) != -1;
  }

  const obj: any = __Porffor_object_underlying(_this);
  if (Porffor.rawType(obj) == Porffor.TYPES.object) {
    if (Porffor.object.lookup(obj, p) != -1) return true;
  }

  const keys: any[] = __Object_keys(_this);
  return __Array_prototype_includes(keys, p);
};

export const __Object_hasOwn = (obj: any, prop: any) => {
  return __Object_prototype_hasOwnProperty(obj, prop);
};

export const __Porffor_object_in = (obj: any, prop: any) => {
  if (__Object_prototype_hasOwnProperty(obj, prop)) {
    return true;
  }

  let lastProto = obj;
  while (true) {
    obj = obj.__proto__;
    if (Porffor.fastOr(obj == null, Porffor.wasm`local.get ${obj}` == Porffor.wasm`local.get ${lastProto}`)) break;
    lastProto = obj;

    if (__Object_prototype_hasOwnProperty(obj, prop)) return true;
  }

  return false;
};

export const __Porffor_object_instanceof = (obj: any, constr: any) => {
  if (Porffor.rawType(constr) != Porffor.TYPES.function) {
    throw new TypeError('instanceof right-hand side is not a function');
  }

  const checkProto: any = constr.prototype;
  if (!Porffor.object.isObject(checkProto)) {
    throw new TypeError('instanceof right-hand side has non-object prototype');
  }

  let lastProto = obj;
  while (true) {
    obj = obj.__proto__;
    if (Porffor.fastOr(obj == null, Porffor.wasm`local.get ${obj}` == Porffor.wasm`local.get ${lastProto}`)) break;
    lastProto = obj;

    if (obj === checkProto) return true;
  }

  return false;
};


export const __Object_assign = (target: any, ...sources: any[]) => {
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
export const __Porffor_object_assignAll = (target: any, source: any) => {
  if (target == null) throw new TypeError('Argument is nullish, expected object');

  const keys: any[] = Reflect.ownKeys(source);
  for (const x of keys) {
    target[x] = source[x];
  }

  return target;
};


export const __Object_prototype_propertyIsEnumerable = (_this: any, prop: any) => {
  const p: any = ecma262.ToPropertyKey(prop);

  if (Porffor.rawType(_this) == Porffor.TYPES.object) {
    const entryPtr: i32 = Porffor.object.lookup(_this, p);
    if (entryPtr == -1) return false;

    return Porffor.object.isEnumerable(entryPtr);
  }

  const obj: any = __Porffor_object_underlying(_this);
  if (Porffor.rawType(obj) == Porffor.TYPES.object) {
    const entryPtr: i32 = Porffor.object.lookup(obj, p);
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
  if (Porffor.rawType(x) == Porffor.TYPES.number && Number.isNaN(x)) {
    return Number.isNaN(y);
  }

  return false;
};


export const __Object_preventExtensions = (obj: any): any => {
  Porffor.object.preventExtensions(obj);

  return obj;
};

export const __Object_isExtensible = (obj: any): any => {
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

export const __Object_isFrozen = (obj: any): any => {
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

export const __Object_isSealed = (obj: any): any => {
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


export const __Object_getOwnPropertyDescriptor = (obj: any, prop: any): any => {
  const p: any = ecma262.ToPropertyKey(prop);

  const entryPtr: i32 = Porffor.object.lookup(obj, p);
  if (entryPtr == -1) {
    if (Porffor.rawType(obj) == Porffor.TYPES.function) {
      // hack: function .name and .length
      const v = obj[p];
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

  const out: object = {};

  const tail: i32 = Porffor.wasm.i32.load16_u(entryPtr, 0, 12);
  out.configurable = !!(tail & 0b0010);
  out.enumerable = !!(tail & 0b0100);

  if (tail & 0b0001) {
    out.get = Porffor.object.accessorGet(entryPtr);
    out.set = Porffor.object.accessorSet(entryPtr);

    return out;
  }

  // data descriptor
  const value: any = Porffor.wasm.f64.load(entryPtr, 0, 4);
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

export const __Object_getOwnPropertyDescriptors = (obj: any): any => {
  const out: object = {};

  if (Porffor.rawType(obj) != Porffor.TYPES.object) {
    obj = __Porffor_object_underlying(obj);
    if (Porffor.rawType(obj) != Porffor.TYPES.object) return out;
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
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 5;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load(obj, 0, 0) * 14;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 14) {
      let key: any;
      Porffor.wasm`local raw i32
local msb i32
local.get ${ptr}
i32.to_u
i32.load 0 0
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

      if (Porffor.rawType(key) == Porffor.TYPES.symbol) continue;
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
  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 5;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load(obj, 0, 0) * 14;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 14) {
      let key: any;
      Porffor.wasm`local raw i32
local msb i32
local.get ${ptr}
i32.to_u
i32.load 0 0
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

      if (Porffor.rawType(key) != Porffor.TYPES.symbol) continue;
      out[i++] = key;
    }

    out.length = i;
  }

  return out;
};


export const __Object_defineProperty = (target: any, prop: any, desc: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (!Porffor.object.isObject(desc)) throw new TypeError('Descriptor is a non-object');

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

  // todo: should check if has attributes not if undefined
  if (get !== undefined || set !== undefined) {
    if (get !== undefined && Porffor.rawType(get) != Porffor.TYPES.function) throw new TypeError('Getter must be a function');
    if (set !== undefined && Porffor.rawType(set) != Porffor.TYPES.function) throw new TypeError('Setter must be a function');

    if (value !== undefined || writable !== undefined) {
      throw new TypeError('Descriptor cannot define both accessor and data descriptor attributes');
    }

    accessor = true;
  }

  const existingDesc: any = __Object_getOwnPropertyDescriptor(target, prop);
  if (existingDesc) {
    configurable ??= existingDesc.configurable;
    enumerable ??= existingDesc.enumerable;

    if (accessor) {
      get ??= existingDesc.get;
      set ??= existingDesc.set;
    } else {
      value ??= existingDesc.value;
      writable ??= existingDesc.writable;
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

export const __Object_defineProperties = (target: any, props: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');
  if (!Porffor.object.isObjectOrSymbol(props)) throw new TypeError('Props needs to be an object or symbol');

  for (const x in props) {
    __Object_defineProperty(target, x, props[x]);
  }

  return target;
};

export const __Object_create = (proto: any, props: any) => {
  if (!Porffor.object.isObjectOrNull(proto)) throw new TypeError('Prototype should be an object or null');

  const out: object = {};

  // set prototype
  out.__proto__ = proto;

  if (props !== undefined) __Object_defineProperties(out, props);

  return out;
};


export const __Object_groupBy = (items: any, callbackFn: any) => {
  const out: object = {};

  let i = 0;
  for (const x of items) {
    const k: any = callbackFn(x, i++);
    if (!__Object_hasOwn(out, k)) {
      const arr: any[] = Porffor.allocate();
      out[k] = arr;
    }

    out[k].push(x);
  }

  return out;
};


export const __Object_getPrototypeOf = (obj: any) => {
  if (obj == null) throw new TypeError('Object is nullish, expected object');

  return obj.__proto__;
};

export const __Object_setPrototypeOf = (obj: any, proto: any) => {
  if (obj == null) throw new TypeError('Object is nullish, expected object');
  if (!Porffor.object.isObjectOrNull(proto)) throw new TypeError('Prototype should be an object or null');

  // todo: support non-pure-objects
  if (Porffor.rawType(obj) != Porffor.TYPES.object) {
    return obj;
  }

  // todo: throw when this fails?
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf#exceptions
  obj.__proto__ = proto;

  return obj;
};

export const __Object_prototype_isPrototypeOf = (_this: any, obj: any) => {
  if (_this == null) throw new TypeError('This is nullish, expected object');

  return _this == obj.__proto__;
};


export const __Object_prototype_toString = (_this: any) => {
  if (Porffor.rawType(_this) == Porffor.TYPES.object) {
    const obj: object = _this;
    const ovr: any = obj.toString;
    if (ovr != null && ovr !== __Object_prototype_toString) return ovr.call(_this);
  }

  let out: bytestring = Porffor.allocate();

  // 1. If the this value is undefined, return "[object Undefined]".
  if (_this === undefined) return out = '[object Undefined]';

  // 2. If the this value is null, return "[object Null]".
  if (_this === null) return out = '[object Null]';

  // todo: toStringTag support

  const t: i32 = Porffor.rawType(_this);
  if (t == Porffor.TYPES.array) return out = '[object Array]';
  if (t == Porffor.TYPES.function) return out = '[object Function]';
  if (Porffor.fastOr(
    t == Porffor.TYPES.boolean,
    t == Porffor.TYPES.booleanobject)) return out = '[object Boolean]';
  if (Porffor.fastOr(
    t == Porffor.TYPES.number,
    t == Porffor.TYPES.numberobject)) return out = '[object Number]';
  if (Porffor.fastOr(
    t == Porffor.TYPES.string,
    t == Porffor.TYPES.bytestring)) return out = '[object String]';
  if (t == Porffor.TYPES.date) return out = '[object Date]';
  if (t == Porffor.TYPES.regexp) return out = '[object RegExp]';

  return out = '[object Object]';
};

export const __Object_prototype_toLocaleString = (_this: any) => __Object_prototype_toString(_this);

export const __Object_prototype_valueOf = (_this: any) => {
  // todo: ToObject
  if (Porffor.rawType(_this) == Porffor.TYPES.object) {
    const obj: object = _this;
    const ovr: any = obj.valueOf;
    if (ovr != null && ovr !== __Object_prototype_valueOf) return ovr.call(_this);
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