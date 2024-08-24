export default () => {
  let out = '';

  const error = name => out += `export const ${name} = function (message: any) {
  new.target; // trick compiler into allowing as constructor

  const _empty: bytestring = '';
  if (message === undefined) message = _empty;
    else message = ecma262.ToString(message);

  const obj: object = Porffor.allocate();

  const _name: bytestring = '${name.split('_').pop()}';

  obj.name = _name;
  obj.message = message;

  const out: ${name} = obj;
  return out;
};

export const __${name.startsWith('__') ? name.slice(2) : name}_prototype_toString = (_this: ${name}) => {
  const obj: object = _this;

  const message: any = obj.message;
  if (message.length === 0) {
    return obj.name;
  }

  const bridge: bytestring = ': ';
  return obj.name + bridge + message;
};`;

  error('Error');
  error('AggregateError');
  error('TypeError');
  error('ReferenceError');
  error('SyntaxError');
  error('RangeError');
  error('EvalError');
  error('URIError');

  error('__Porffor_TodoError');
  error('Test262Error');

  return out;
};