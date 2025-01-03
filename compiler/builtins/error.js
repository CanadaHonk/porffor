export default () => {
  let out = '';

  const errors = [];
  const error = name => {
    errors.push(name);
    out += `export const ${name} = function (message: any) {
  if (message === undefined) message = '';
    else message = ecma262.ToString(message);

  const obj: object = Porffor.allocateBytes(128);

  obj.name = '${name}';
  obj.message = message;
  obj.constructor = ${name};

  const out: ${name} = obj;
  return out;
};

export const __${name}_prototype_toString = (_this: ${name}) => {
  const obj: object = _this;

  const message: any = obj.message;
  if (message.length == 0) {
    return obj.name;
  }

  return obj.name + ': ' + message;
};`;
  };

  error('Error');
  error('AggregateError');
  error('TypeError');
  error('ReferenceError');
  error('SyntaxError');
  error('RangeError');
  error('EvalError');
  error('URIError');

  error('Test262Error');
  error('TodoError');

  out += `
export const __Test262Error_thrower = message => {
  throw new Test262Error(message);
};

export const __Error_isError = (x: unknown): boolean => Porffor.fastOr(${errors.map(x => `Porffor.rawType(x) == Porffor.TYPES.${x.toLowerCase()}`).join(', ')});`;

  return out;
};