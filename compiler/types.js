export const TYPES = {
  empty: 0x00,
  number: 0x01,
  boolean: 0x02,
  string: 0x03,
  undefined: 0x04,
  object: 0x05,
  function: 0x06,
  symbol: 0x07,
  bigint: 0x08
};

// flags
export const TYPE_FLAGS = {
  // iterable:  0b10000000,
  parity:    0b10000000,
  length:    0b01000000,
};

// TYPES.string |= TYPE_FLAGS.iterable;
TYPES.string |= TYPE_FLAGS.length;

TYPES.undefined = TYPES.empty | TYPE_FLAGS.parity;

export const TYPE_NAMES = {
  [TYPES.empty]: 'empty',
  [TYPES.number]: 'Number',
  [TYPES.boolean]: 'Boolean',
  [TYPES.string]: 'String',
  [TYPES.undefined]: 'undefined',
  [TYPES.object]: 'Object',
  [TYPES.function]: 'Function',
  [TYPES.symbol]: 'Symbol',
  [TYPES.bigint]: 'BigInt'
};

export const typeHasFlag = (type, flag) => (type & flag) !== 0;

export const INTERNAL_TYPE_BASE = 0x10;
let internalTypeIndex = INTERNAL_TYPE_BASE;
const registerInternalType = (name, flags = [], overrideType = undefined) => {
  let n = overrideType ?? internalTypeIndex++;

  if (!overrideType) for (const x of flags) {
    if (TYPE_FLAGS[x]) n |= TYPE_FLAGS[x];
  }

  TYPES[name.toLowerCase()] = n;
  TYPE_NAMES[n] = name;
};

// note: when adding a new internal type, please also add a deserializer to wrap.js
registerInternalType('ByteString', ['iterable', 'length'], TYPES.string | TYPE_FLAGS.parity);

registerInternalType('Array', ['iterable', 'length']);
registerInternalType('RegExp');
registerInternalType('Date');

registerInternalType('Set', ['iterable']);
registerInternalType('Map');

registerInternalType('ArrayBuffer');
registerInternalType('SharedArrayBuffer');
registerInternalType('DataView');
registerInternalType('Uint8Array', ['iterable', 'length']);
registerInternalType('Int8Array', ['iterable', 'length']);
registerInternalType('Uint8ClampedArray', ['iterable', 'length']);
registerInternalType('Uint16Array', ['iterable', 'length']);
registerInternalType('Int16Array', ['iterable', 'length']);
registerInternalType('Uint32Array', ['iterable', 'length']);
registerInternalType('Int32Array', ['iterable', 'length']);
registerInternalType('Float32Array', ['iterable', 'length']);
registerInternalType('Float64Array', ['iterable', 'length']);

registerInternalType('WeakRef');
registerInternalType('WeakSet');
registerInternalType('WeakMap');