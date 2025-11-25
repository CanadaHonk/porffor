export default () => {
  let out = '';

  const errors = [];
  const error = name => {
    errors.push(name);
    out += `export const ${name} = function (message: any): ${name} {
  if (message === undefined) message = '';
    else message = ecma262.ToString(message);

  const obj: ${name} = Porffor.malloc(8);
  Porffor.wasm.i32.store(obj, message, 0, 0);
  Porffor.wasm.i32.store8(obj, Porffor.type(message), 0, 4);

  return obj;
};

export const __${name}_prototype_constructor$get = (_this: ${name}) => {
  return ${name};
};

export const __${name}_prototype_name$get = (_this: ${name}) => {
  return '${name}';
};

export const __${name}_prototype_message$get = (_this: ${name}) => {
  Porffor.wasm\`
local.get \${_this}
i32.trunc_sat_f64_u
i32.load 0 0
f64.convert_i32_u

local.get \${_this}
i32.trunc_sat_f64_u
i32.load8_u 0 4
return\`;
};

export const __${name}_prototype_toString = (_this: ${name}) => {
  const name: any = _this.name;
  const message: any = _this.message;
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
  error('Test262Error');

  out += `
export const __Test262Error_thrower = message => {
  throw new Test262Error(message);
};

export const __Error_isError = (x: unknown): boolean => Porffor.fastAnd(Porffor.type(x) >= Porffor.TYPES.error, Porffor.type(x) <= Porffor.TYPES.test262error);`;

  return out;
};