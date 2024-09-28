import type {} from './porffor.d.ts';

export const __Porffor_json_serialize = (value: any): bytestring|undefined => {
  // todo: many niche things (toJSON, prim objects, etc) are not implemented yet
  // somewhat modelled after 25.5.2.2 SerializeJSONProperty: https://tc39.es/ecma262/#sec-serializejsonproperty
  let out: bytestring = Porffor.allocate();

  const nullString: bytestring = 'null';

  if (value === null) return nullString;
  if (value === true) return out = 'true';
  if (value === false) return out = 'false';

  const t: i32 = Porffor.rawType(value);
  if ((t | 0b10000000) == Porffor.TYPES.bytestring) { // string
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
    if (Number.isFinite(value)) return out = __Number_prototype_toString(value, 10);
    return nullString;
  }

  if (t == Porffor.TYPES.array) {
    Porffor.bytestring.appendChar(out, 91); // [

    const arr: any[] = value;
    for (const x of arr) {
      Porffor.bytestring.appendStr(out, __Porffor_json_serialize(x) ?? nullString);

      Porffor.bytestring.appendChar(out, 44); // ,
    }

    // swap trailing , with ]
    Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + out.length, 93, 0, 3);

    return out;
  }

  if (t > 0x06) {
    // non-function object
    // hack: just return empty object for now
    Porffor.bytestring.appendChar(out, 123); // {
    Porffor.bytestring.appendChar(out, 125); // }
    return out;
  }

  return undefined;
};

export const __JSON_stringify = (value: any, replacer: any, space: any) => {
  // todo: replacer
  // todo: space

  return __Porffor_json_serialize(value);
};