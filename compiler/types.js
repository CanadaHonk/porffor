import {} from './prefs.js';

export const TYPE_FLAGS = {
  parity:    0b10000000,
  length:    0b01000000,
};

export const TYPES = {
  empty: 0x00,
  number: 0x01,
  boolean: 0x02,
  string: 0x03 | TYPE_FLAGS.length,
  bigint: 0x04,
  symbol: 0x05,
  function: 0x06,
  object: 0x07,

  undefined: 0x00 | TYPE_FLAGS.parity,
};

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

registerInternalType('Promise');

registerInternalType('BooleanObject');
registerInternalType('NumberObject');
registerInternalType('StringObject');

registerInternalType('Error');
registerInternalType('AggregateError');
registerInternalType('TypeError');
registerInternalType('ReferenceError');
registerInternalType('SyntaxError');
registerInternalType('RangeError');
registerInternalType('EvalError');
registerInternalType('URIError');
registerInternalType('Test262Error');
registerInternalType('__Porffor_TodoError');

registerInternalType('__Porffor_generator');

if (Prefs.largestTypes) {
  const typeKeys = Object.keys(TYPES);
  const typeVals = Object.values(TYPES);

  const largestType = (vals, keys) => {
    const val = Math.max(...vals);
    const key = keys[vals.indexOf(val)];
    return [ val, key ];
  };

  const unflag = val => val & 0b00111111;

  const logType = (label, val, key) => console.log(`${label}    ${key} - ${val} (0x${val.toString(16)}, 0b${val.toString(2).padStart(8, '0')})`);

  logType(`largest type:         `, ...largestType(typeVals.map(unflag), typeKeys));
  logType(`largest type w/ flags:`, ...largestType(typeVals, typeKeys));
  console.log();
}