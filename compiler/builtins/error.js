export default () => {
  let out = '';

  const error = name => out += `export const ${name} = (message: bytestring) => {
  return {};
};

export const ${name}$constructor = (message: bytestring) => {
  return {};
};`;

  error('Error');
  error('AggregateError');
  error('TypeError');
  error('ReferenceError');
  error('SyntaxError');
  error('RangeError');
  error('EvalError');
  error('URIError');

  return out;
};