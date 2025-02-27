export default ({ TYPES, TYPE_NAMES }) => {
  let out = `// @porf --valtype=i32
export const __Porffor_object_getPrototypeWithHidden = (obj: any, trueType: i32): any => {
  const objectProto: any = __Porffor_object_getPrototype(obj);
  if (Porffor.type(objectProto) == Porffor.TYPES.empty) {
    if (Porffor.comptime.flag\`hasFunc.#get___String_prototype\`) {
      if (Porffor.fastOr(
        trueType == Porffor.TYPES.string,
        trueType == Porffor.TYPES.bytestring,
        trueType == Porffor.TYPES.stringobject
      )) return __String_prototype;
    }

    if (Porffor.comptime.flag\`hasFunc.#get___Number_prototype\`) {
      if (Porffor.fastOr(
        trueType == Porffor.TYPES.number,
        trueType == Porffor.TYPES.numberobject
      )) return __Number_prototype;
    }

    if (Porffor.comptime.flag\`hasFunc.#get___Boolean_prototype\`) {
      if (Porffor.fastOr(
        trueType == Porffor.TYPES.boolean,
        trueType == Porffor.TYPES.booleanobject
      )) return __Boolean_prototype;
    }`;

  for (const x in TYPES) {
    if (['empty', 'undefined', 'string', 'bytestring', 'stringobject', 'number', 'numberobject', 'boolean', 'booleanobject'].includes(x)) continue;

    const name = TYPE_NAMES[TYPES[x]];
    out += `
    if (Porffor.comptime.flag\`hasFunc.#get___${name}_prototype\`) {
      if (trueType == Porffor.TYPES.${x}) return __${name}_prototype;
    }`;
  }

  // if (trueType == Porffor.TYPES.function) return __Function_prototype;
  out += `
    return __Object_prototype;
  }

  return objectProto;
};`;

  return out;
};