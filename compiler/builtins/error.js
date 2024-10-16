export default () => {
  let out = '';

  const error = name => out += `export const ${name} = function (message: any) {
  if (message === undefined) message = '';
    else message = ecma262.ToString(message);

  const obj: object = Porffor.allocate();

  obj.name = '${name.split('_').pop()}';
  obj.message = message;
  obj.constructor = ${name};

  const out: ${name} = obj;
  return out;
};

export const __${name.startsWith('__') ? name.slice(2) : name}_prototype_toString = (_this: ${name}) => {
  const obj: object = _this;

  const message: any = obj.message;
  if (message.length === 0) {
    return obj.name;
  }

  return obj.name + ': ' + message;
};`;

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

  out += `\nexport const __Test262Error_thrower = message => { throw new Test262Error(message); };`;

  return out;
};