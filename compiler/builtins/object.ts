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

  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 4;
    const endPtr: i32 = ptr + Porffor.wasm.i32.load(obj, 0, 0) * 14;

    let i: i32 = 0;
    for (; ptr < endPtr; ptr += 14) {
      if (!Porffor.object.isEnumerable(ptr)) continue;

      let key: any;
      Porffor.wasm`local raw i32
local.get ${ptr}
i32.to_u
i32.load 0 0
local.set raw

local.get raw
i32.const 31
i32.shr_u
if 127
  i32.const 67
  local.set ${key+1}

  local.get raw
  i32.const 2147483647
  i32.and
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
  } else if (Porffor.fastOr(
    t == Porffor.TYPES.array,
    t == Porffor.TYPES.bytestring,
    t == Porffor.TYPES.string
  )) {
    const len: i32 = obj.length;
    out.length = len;

    for (let i: i32 = 0; i < len; i++) {
      out[i] = __Number_prototype_toString(i);
    }
  }

  return out;
};

export const __Object_values = (obj: any): any[] => {
  if (obj == null) throw new TypeError('Argument is nullish, expected object');

  const out: any[] = Porffor.allocate();

  const t: i32 = Porffor.rawType(obj);
  if (t == Porffor.TYPES.object) {
    let ptr: i32 = Porffor.wasm`local.get ${obj}` + 4;
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
  } else if (Porffor.fastOr(
    t == Porffor.TYPES.array,
    t == Porffor.TYPES.bytestring,
    t == Porffor.TYPES.string
  )) {
    const len: i32 = obj.length;
    out.length = len;

    for (let i: i32 = 0; i < len; i++) {
      out[i] = obj[i];
    }
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
    if (Porffor.rawType(x) < 0x06) throw new TypeError('Iterator contains non-object');
    out[ecma262.ToPropertyKey(x[0])] = x[1];
  }

  return out;
};


export const __Object_prototype_hasOwnProperty = (_this: any, prop: any) => {
  const p: any = ecma262.ToPropertyKey(prop);

  const t: i32 = Porffor.rawType(_this);
  if (t == Porffor.TYPES.object) {
    return Porffor.object.lookup(_this, prop) != -1;
  }

  const keys: any[] = __Object_keys(_this);
  return __Array_prototype_includes(keys, p);
};

export const __Object_hasOwn = (obj: any, prop: any) => {
  // todo: not spec compliant lol
  return __Object_prototype_hasOwnProperty(obj, prop);
};


export const __Object_assign = (target: any, ...sources: any[]) => {
  if (target == null) throw new TypeError('Argument is nullish, expected object');

  for (const x of sources) {
    const keys: any[] = __Object_keys(x);
    const vals: any[] = __Object_values(x);

    const len: i32 = keys.length;
    for (let i: i32 = 0; i < len; i++) {
      target[keys[i]] = vals[i];
    }
  }

  return target;
};


export const __Object_prototype_toString = (_this: object) => {
  let out: bytestring = '[object Object]';
  return out;
};

export const __Object_prototype_toLocaleString = (_this: object) => __Object_prototype_toLocaleString(_this);

export const __Object_prototype_valueOf = (_this: object) => {
  return _this;
};