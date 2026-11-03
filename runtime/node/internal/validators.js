// node's internal/validators
import { errInvalidArgType, errInvalidArgValue, errOutOfRange } from './errors.js';

export const validateInteger = (value, name, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => {
  if (typeof value !== 'number') throw errInvalidArgType(name, 'number', value);
  if (!Number.isInteger(value)) throw errOutOfRange(name, 'an integer', value);
  if (value < min || value > max) throw errOutOfRange(name, `>= ${min} && <= ${max}`, value);
};

export const validateInt32 = (value, name, min = -2147483648, max = 2147483647) => validateInteger(value, name, min, max);

export const validateUint32 = (value, name, positive = false) => validateInteger(value, name, positive ? 1 : 0, 4294967295);

export const validateNumber = (value, name, min, max) => {
  if (typeof value !== 'number') throw errInvalidArgType(name, 'number', value);
  if ((min != null && value < min) || (max != null && value > max) || ((min != null || max != null) && Number.isNaN(value))) {
    throw errOutOfRange(name, `${min != null ? `>= ${min}` : ''}${min != null && max != null ? ' && ' : ''}${max != null ? `<= ${max}` : ''}`, value);
  }
};

export const validateString = (value, name) => {
  if (typeof value !== 'string') throw errInvalidArgType(name, 'string', value);
};

export const validateFunction = (value, name) => {
  if (typeof value !== 'function') throw errInvalidArgType(name, 'Function', value);
};

export const validateObject = (value, name, nullable = false) => {
  if ((value === null && !nullable) || Array.isArray(value) || (typeof value !== 'object' && value !== null)) throw errInvalidArgType(name, 'Object', value);
};

export const validateOneOf = (value, name, oneOf) => {
  if (!oneOf.includes(value)) throw errInvalidArgValue(name, value, `must be one of: ${oneOf.map(x => typeof x === 'string' ? `'${x}'` : String(x)).join(', ')}`);
};

export const validateBuffer = (buffer, name = 'buffer') => {
  if (!ArrayBuffer.isView(buffer)) throw errInvalidArgType(name, [ 'Buffer', 'TypedArray', 'DataView' ], buffer);
};

// mode_t values: uint32 or an octal string
export const parseFileMode = (value, name, def) => {
  value ??= def;
  if (typeof value === 'string') {
    if (!/^[0-7]+$/.test(value)) throw errInvalidArgValue(name, value, 'must be a 32-bit unsigned integer or an octal string');
    value = parseInt(value, 8);
  }
  validateUint32(value, name);
  return value + 0;
};
