import type {} from './porffor.d.ts';

export const __Porffor_json_serialize = (value: any, depth: i32, space: bytestring|undefined): bytestring|undefined => {
  // somewhat modelled after 25.5.2.2 SerializeJSONProperty: https://tc39.es/ecma262/#sec-serializejsonproperty
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';

  const t: i32 = Porffor.rawType(value);
  if (Porffor.fastOr(
    (t | 0b10000000) == Porffor.TYPES.bytestring,
    t == Porffor.TYPES.stringobject
  )) { // string
    const out: bytestring = Porffor.allocate();
    Porffor.bytestring.appendChar(out, 34); // start "

    const len: i32 = value.length;
    for (let i: i32 = 0; i < len; i++) {
      const c: i32 = value.charCodeAt(i);
      if (c < 0x20) {
        if (c == 0x08) {
          Porffor.bytestring.append2Char(out, 92, 98); // \b
          continue;
        }

        if (c == 0x09) {
          Porffor.bytestring.append2Char(out, 92, 116); // \t
          continue;
        }

        if (c == 0x0a) {
          Porffor.bytestring.append2Char(out, 92, 110); // \n
          continue;
        }

        if (c == 0x0c) {
          Porffor.bytestring.append2Char(out, 92, 102); // \f
          continue;
        }

        if (c == 0x0d) {
          Porffor.bytestring.append2Char(out, 92, 114); // \r
          continue;
        }

        // \u00FF
        Porffor.bytestring.append2Char(out, 92, 117); // \u
        Porffor.bytestring.append2Char(out, 48, 48); // 00

        Porffor.printHexDigit((c & 0xf0) / 0x10);
        Porffor.printHexDigit(c & 0x0f);
        continue;
      }

      if (c == 0x22) { // "
        Porffor.bytestring.append2Char(out, 92, 34); // \"
        continue;
      }

      if (c == 0x5c) { // \
        Porffor.bytestring.append2Char(out, 92, 92); // \\
        continue;
      }

      // todo: support non-bytestrings
      Porffor.bytestring.appendChar(out, c);
    }

    Porffor.bytestring.appendChar(out, 34); // final "
    return out;
  }

  if (Porffor.fastOr(
    t == Porffor.TYPES.number,
    t == Porffor.TYPES.numberobject
  )) { // number
    if (Number.isFinite(value)) return __Number_prototype_toString(value, 10);
    return 'null';
  }

  if (t == Porffor.TYPES.array) {
    const out: bytestring = Porffor.allocate();
    Porffor.bytestring.appendChar(out, 91); // [

    const hasSpace: boolean = space !== undefined;
    depth += 1;

    for (const x of (value as any[])) {
      if (hasSpace) {
        Porffor.bytestring.appendChar(out, 10); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space);
      }

      Porffor.bytestring.appendStr(out, __Porffor_json_serialize(x, depth, space) ?? 'null');

      Porffor.bytestring.appendChar(out, 44); // ,
    }

    depth -= 1;

    // swap trailing , with ] (or append if empty)
    if (out.length > 1) {
      if (hasSpace) {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 10, 0, 3); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space);
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 93, 0, 4); // ]
        out.length += 1;
      } else {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 93, 0, 3); // ]
      }
    } else {
      Porffor.bytestring.appendChar(out, 93); // ]
    }

    return out;
  }

  if (t > 0x06) {
    // non-function object
    const out: bytestring = Porffor.allocate();
    Porffor.bytestring.appendChar(out, 123); // {

    const hasSpace: boolean = space !== undefined;
    depth += 1;

    for (const key in (value as object)) {
      // skip symbol keys
      if (Porffor.rawType(key) == Porffor.TYPES.symbol) continue;

      // skip non-serializable values (functions, etc)
      const val: bytestring|undefined = __Porffor_json_serialize((value as object)[key], depth, space);
      if (val == null) continue;

      if (hasSpace) {
        Porffor.bytestring.appendChar(out, 10); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space);
      }

      Porffor.bytestring.appendChar(out, 34); // "
      Porffor.bytestring.appendStr(out, key);
      Porffor.bytestring.appendChar(out, 34); // "

      Porffor.bytestring.appendChar(out, 58); // :
      if (hasSpace) Porffor.bytestring.appendChar(out, 32); // space

      Porffor.bytestring.appendStr(out, val);

      Porffor.bytestring.appendChar(out, 44); // ,
    }

    depth -= 1;

    // swap trailing , with } (or append if empty)
    if (out.length > 1) {
      if (hasSpace) {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 10, 0, 3); // \n
        for (let i: i32 = 0; i < depth; i++) Porffor.bytestring.appendStr(out, space);
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 125, 0, 4); // }
        out.length += 1;
      } else {
        Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 125, 0, 3); // }
      }
    } else {
      Porffor.bytestring.appendChar(out, 125); // }
    }

    return out;
  }

  return undefined;
};

export const __JSON_stringify = (value: any, replacer: any, space: any) => {
  // todo: replacer

  if (space !== undefined) {
    if (Porffor.fastOr(
      Porffor.rawType(space) == Porffor.TYPES.number,
      Porffor.rawType(space) == Porffor.TYPES.numberobject
    )) {
      space = Math.min(Math.trunc(space), 10);
      Porffor.print(space); Porffor.printStatic('\n');

      if (space < 1) {
        space = undefined;
      } else {
        const spaceStr: bytestring = Porffor.allocate();
        for (let i: i32 = 0; i < space; i++) Porffor.bytestring.appendChar(spaceStr, 32);

        space = spaceStr;
      }
    } else if (Porffor.fastOr(
      (Porffor.rawType(space) | 0b10000000) == Porffor.TYPES.bytestring,
      Porffor.rawType(space) == Porffor.TYPES.stringobject
    )) {
      // if empty, make it undefined
      const len: i32 = space.length;
      if (len == 0) {
        space = undefined;
      } else if (len > 10) {
        space = space.slice(0, 10);
      }
    } else {
      // not a number or string, make it undefined
      space = undefined;
    }
  }

  return __Porffor_json_serialize(value, 0, space);
};