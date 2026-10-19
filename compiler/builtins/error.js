export default ({ ERROR_NAMES }) => {
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

  for (const x of ERROR_NAMES) error(x);

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

export const __Error_prototype_stack$get = function (this: any) {
  if (!Porffor.object.isObject(this)) throw new TypeError('Error.prototype.stack getter called on non-object');
  if (!__Error_isError(this)) return undefined;
  return Porffor.callThis(__Error_prototype_toString, this);
};

export const __Error_prototype_stack$set = function (this: any, _argc: i32, value: any) {
  if (!Porffor.object.isObject(this)) throw new TypeError('Error.prototype.stack setter called on non-object');
  if (_argc == 0) throw new TypeError('Error.prototype.stack setter requires a value');
  if (this === Error.prototype) throw new TypeError('Cannot set stack on Error.prototype');
  if (Porffor.comptime.flag\`hasFunc.Proxy\`) {
    if (Porffor.type(this) == Porffor.TYPES.proxy) {
      if (__Reflect_getOwnPropertyDescriptor(this, 'stack') === undefined) {
        if (!__Reflect_defineProperty(this, 'stack', { value, writable: true, enumerable: true, configurable: true })) throw new TypeError('Cannot define stack');
      } else if (!__Reflect_set(this, 'stack', value)) throw new TypeError('Cannot set stack');
      return;
    }
  }

  const obj: object = __Porffor_object_underlying(this);
  if (__Porffor_object_lookup(obj, 'stack', __Porffor_object_hash('stack')) != 0) {
    __Porffor_object_setStrict(this, 'stack', value);
    return;
  }

  if (!__Object_isExtensible(this)) throw new TypeError('Cannot define stack');
  __Porffor_object_define(obj, 'stack', value, 0b1110);
};

export const __Error_isError = (x: unknown): boolean => Porffor.fastAnd(Porffor.type(x) >= Porffor.TYPES.error, Porffor.type(x) <= Porffor.TYPES.suppressederror);`;

  return out;
};
