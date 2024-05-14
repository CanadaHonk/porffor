export const TYPES = {
  number: 0x00,
  boolean: 0x01,
  string: 0x02,
  undefined: 0x03,
  object: 0x04,
  function: 0x05,
  symbol: 0x06,
  bigint: 0x07
};

export const TYPE_NAMES = {
  [TYPES.number]: 'Number',
  [TYPES.boolean]: 'Boolean',
  [TYPES.string]: 'String',
  [TYPES.undefined]: 'undefined',
  [TYPES.object]: 'Object',
  [TYPES.function]: 'Function',
  [TYPES.symbol]: 'Symbol',
  [TYPES.bigint]: 'BigInt'
};

export const INTERNAL_TYPE_BASE = 0x10;
let internalTypeIndex = INTERNAL_TYPE_BASE;
const registerInternalType = name => {
  const n = internalTypeIndex++;
  TYPES[name.toLowerCase()] = n;
  TYPE_NAMES[n] = name;
};

// note: when adding a new internal type, please also add a deserializer to wrap.js
// (it is okay to add a throw todo deserializer for wips)

registerInternalType('Array');
registerInternalType('RegExp');
registerInternalType('ByteString');
registerInternalType('Date');
registerInternalType('Set');