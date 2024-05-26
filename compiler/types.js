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

// flags
export const TYPE_FLAGS = {
  // iterable:  0b10000000,
  length:    0b01000000,
};

// TYPES.string |= TYPE_FLAGS.iterable;
TYPES.string |= TYPE_FLAGS.length;

export const typeHasFlag = (type, flag) => (type & flag) !== 0;

export const INTERNAL_TYPE_BASE = 0x10;
let internalTypeIndex = INTERNAL_TYPE_BASE;
const registerInternalType = (name, flags = []) => {
  let n = internalTypeIndex++;

  for (const x of flags) {
    if (TYPE_FLAGS[x]) n |= TYPE_FLAGS[x];
  }

  TYPES[name.toLowerCase()] = n;
  TYPE_NAMES[n] = name;
};

// note: when adding a new internal type, please also add a deserializer to wrap.js
// (it is okay to add a throw todo deserializer for wips)

registerInternalType('Array', ['iterable', 'length']);
registerInternalType('RegExp');
registerInternalType('ByteString', ['iterable', 'length']);
registerInternalType('Date');
registerInternalType('Set', ['iterable']);

registerInternalType('Uint8Array', ['iterable', 'length']);
registerInternalType('Int8Array', ['iterable', 'length']);
registerInternalType('Uint8ClampedArray', ['iterable', 'length']);
registerInternalType('Uint16Array', ['iterable', 'length']);
registerInternalType('Int16Array', ['iterable', 'length']);
registerInternalType('Uint32Array', ['iterable', 'length']);
registerInternalType('Int32Array', ['iterable', 'length']);
registerInternalType('Float32Array', ['iterable', 'length']);
registerInternalType('Float64Array', ['iterable', 'length']);