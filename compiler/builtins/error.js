export default () => {
  let out = '';

  // [message jsval], an own message property once the underlying object exists so internal throws stay a bare block
  const error = name => {
    const args = name === 'AggregateError' ? 'errors: any, message: any, options: any' :
      name === 'SuppressedError' ? 'error: any, suppressed: any, message: any' :
      'message: any, options: any';

    out += `
export const ${name} = function (${args}): ${name} {
  const obj: ${name} = Porffor.malloc(8);
  if (message === undefined) Porffor.IR.storeJv(obj, 0, undefined);
    else Porffor.IR.storeJv(obj, 0, ecma262.ToString(message));

  ${name === 'SuppressedError' ? `
  __Porffor_object_fastAdd(__Porffor_object_underlying(obj), 'error', error, 0b1010);
  __Porffor_object_fastAdd(__Porffor_object_underlying(obj), 'suppressed', suppressed, 0b1010);` : `
  // InstallErrorCause
  if (Porffor.object.isObject(options)) {
    if ('cause' in options) __Porffor_object_fastAdd(__Porffor_object_underlying(obj), 'cause', options.cause, 0b1010);
  }`}

  ${name === 'AggregateError' ? `
  const errorsList: any[] = Porffor.array.new(4);
  let i: i32 = 0;
  for (const x of errors) errorsList[i++] = x;
  __Porffor_object_fastAdd(__Porffor_object_underlying(obj), 'errors', errorsList, 0b1010);` : ''}

  return obj;
};
`;
  };

  for (const x of [ 'Error', 'AggregateError', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'EvalError', 'URIError', 'SuppressedError' ]) error(x);

  out += `
export const __Error_prototype_toString = function (this: any) {
  if (!Porffor.object.isObject(this)) throw new TypeError('Error.prototype.toString called on non-object');

  let name: any = this.name;
  if (name === undefined) name = 'Error';
    else name = ecma262.ToString(name);

  let message: any = this.message;
  if (message === undefined) message = '';
    else message = ecma262.ToString(message);

  if (name.length == 0) return message;
  if (message.length == 0) return name;
  return name + ': ' + message;
};

export const __Error_isError = (x: unknown): boolean => Porffor.fastAnd(Porffor.type(x) >= Porffor.TYPES.error, Porffor.type(x) <= Porffor.TYPES.suppressederror);`;

  return out;
};
