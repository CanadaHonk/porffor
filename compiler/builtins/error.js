export default () => {
  let out = '';

  const errors = [];
  const error = name => {
    errors.push(name);
    out += `
export const ${name} = function (
  ${name === 'AggregateError' ? 'errors: any,' : ''} message: any
): ${name} {
  if (message === undefined) message = '';
    else message = ecma262.ToString(message);

  const obj: ${name} = Porffor.malloc(8);
  Porffor.IR.storeJv(obj, 0, message);

  // https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-aggregate-error
  ${name === 'AggregateError' ? `
  const errorsList: any[] = __Array_from(errors);
  // TODO: should not be enumerable
  obj.errors = errorsList;
  ` : ''}

  return obj;
};

export const __${name}_prototype_constructor$get = function (this: ${name}) {
  return ${name};
};

export const __${name}_prototype_name$get = function (this: ${name}) {
  return '${name}';
};

export const __${name}_prototype_message$get = function (this: ${name}) {
  return Porffor.IR.loadJv(this, 0);
};

export const __${name}_prototype_toString = function (this: ${name}) {
  const name: any = this.name;
  const message: any = this.message;
  if (message.length == 0) {
    return name;
  }

  return name + ': ' + message;
};\n`;
  };

  error('Error');
  error('AggregateError');
  error('TypeError');
  error('ReferenceError');
  error('SyntaxError');
  error('RangeError');
  error('EvalError');
  error('URIError');

  out += `
export const __Error_isError = (x: unknown): boolean => Porffor.fastAnd(Porffor.type(x) >= Porffor.TYPES.error, Porffor.type(x) <= Porffor.TYPES.urierror);`;

  return out;
};
