export default ({ TYPES, TYPE_NAMES }) => {
  let out = `export const __Porffor_object_getHiddenPrototype = (trueType: i32): any => {
  if (Porffor.comptime.flag\`hasFunc.#get___String_prototype\`) {
    if (Porffor.fastOr(
      (trueType | 0b10000000) == Porffor.TYPES.bytestring,
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
    if (['object', 'undefined', 'string', 'bytestring', 'stringobject', 'number', 'numberobject', 'boolean', 'booleanobject'].includes(x)) continue;

    const proto = (TYPE_NAMES[TYPES[x]].startsWith('__') ? '' : '__') + TYPE_NAMES[TYPES[x]] + '_prototype';
    out += `
  if (Porffor.comptime.flag\`hasFunc.#get_${proto}\`) {
    if (trueType == Porffor.TYPES.${x}) return ${proto};
  }`;
  }

  // if (trueType == Porffor.TYPES.function) return __Function_prototype;
  out += `
  return __Object_prototype;
};

export const __Porffor_object_builtinPrototype = (f: any): any => {`;

  const ctors = new Set([ 'Object', 'Function', 'Symbol', 'BigInt' ]);
  for (const x in TYPES) {
    if (x === 'object' || x === 'undefined' || x.startsWith('__')) continue;
    ctors.add(TYPE_NAMES[TYPES[x]].replace('Object', ''));
  }
  for (const x of ctors) {
    out += `
  if (Porffor.comptime.flag\`hasFunc.${x}\`) {
    if (f == ${x}) return __${x}_prototype;
  }`;
  }

  out += `
  return undefined;
};`;

  return out;
};
