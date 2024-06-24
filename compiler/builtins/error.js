export default () => {
  let out = '';

  const error = name => out += `export const ${name} = function (message: bytestring) {
  new.target; // trick compiler into allowing as constructor
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