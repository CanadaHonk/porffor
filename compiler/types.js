import './prefs.js';

export const TYPE_FLAGS = {
  parity:    0b10000000,
  length:    0b01000000,
};

export const TYPES = {
  undefined: 0x00,
  number: 0x01,
  boolean: 0x02,
  string: 0x03 | TYPE_FLAGS.length,
  bigint: 0x04,
  symbol: 0x05,
  function: 0x06,
  object: 0x07
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

let internalTypeIndex = TYPES.object + 1;
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

for (const x of [ 'Uint8Clamped', 'Uint8', 'Int8', 'Uint16', 'Int16', 'Uint32', 'Int32', 'BigUint64', 'BigInt64', 'Float32', 'Float64' ])
  registerInternalType(`${x}Array`, ['iterable', 'length']);

registerInternalType('WeakRef');
registerInternalType('WeakSet');
registerInternalType('WeakMap');

registerInternalType('Promise');

registerInternalType('BooleanObject');
registerInternalType('NumberObject');
registerInternalType('StringObject');

registerInternalType('__Porffor_Generator');
registerInternalType('__Porffor_AsyncGenerator');

for (const x of [ '', 'Aggregate', 'Type', 'Reference', 'Syntax', 'Range', 'Eval', 'URI', 'Test262' ])
  registerInternalType(`${x}Error`);

if (Prefs.largestTypes) {
  const typeKeys = Object.keys(TYPES);
  const typeVals = Object.values(TYPES);

  const largestType = (vals, keys) => {
    const val = Math.max(...vals);
    const key = keys[vals.indexOf(val)];
    return [ val, key ];
  };

  const logType = (label, val, key) => console.log(`${label}    ${key} - ${val} (0x${val.toString(16)}, 0b${val.toString(2).padStart(8, '0')})`);

  const largestUnflagged = largestType(typeVals.map(x => x & 0b00111111), typeKeys);
  logType(`largest type:         `, ...largestUnflagged);
  logType(`largest type w/ flags:`, ...largestType(typeVals, typeKeys));
  console.log('types left:', 0b00111111 - largestUnflagged[0]);
  console.log();
}