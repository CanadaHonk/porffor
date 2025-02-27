export default () => {
  let out = '';

  const errors = [];
  const error = (name, type = true) => {
    if (type) errors.push(name);
    out += `export const ${name} = function (message: any): ${type ? name : 'Error'} {
  if (message === undefined) message = '';
    else message = ecma262.ToString(message);

  const obj: object = Porffor.allocateBytes(128);
  obj.name = '${name}';
  obj.message = message;
  obj.constructor = ${name};

  return obj as ${type ? name : 'Error'};
};

${type ? `export const __${name}_prototype_toString = (_this: ${name}) => {
  const name: any = (_this as object).name;
  const message: any = (_this as object).message;
  if (message.length == 0) {
    return name;
  }

  return name + ': ' + message;
};` : ''}`;
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
  error('TodoError', false);

  out += `
export const __Test262Error_thrower = message => {
  throw new Test262Error(message);
};

export const __Error_isError = (x: unknown): boolean => Porffor.fastOr(${errors.map(x => `Porffor.type(x) == Porffor.TYPES.${x.toLowerCase()}`).join(', ')});`;

  return out;
};