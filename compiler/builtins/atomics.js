export default () => {
  let out = `
export const __Atomics_isLockFree = (x: number): boolean => {
  switch (x) {
    case 1:
    case 2:
    case 4:
    case 8:
      return true;
  }

  return false;
};`;

  const func = (name, op, args, retType, wasm, only3264 = false) => {
    const signed = type => {
      switch (type) {
        case 'uint8array':
        case 'uint8clampedarray':
        case 'uint16array':
        case 'uint32array':
        case 'biguint64array':
          return false;

        case 'int8array':
        case 'int16array':
        case 'int32array':
        case 'bigint64array':
          return true;
      }
    };

    const getOp = (type, ret = true) => {
      if (op === 'memory.atomic.notify') return `${op} 2 4\ni32.from_u`;

      switch (type) {
        case 'uint8array':
        case 'uint8clampedarray':
        case 'int8array':
          return `${op}8 0 4${ret ? `\ni32.from${signed(type) ? '' : '_u'}` : ''}`;

        case 'uint16array':
        case 'int16array':
          return `${op}16 1 4${ret ? `\ni32.from${signed(type) ? '' : '_u'}` : ''}`;

        case 'uint32array':
        case 'int32array':
          return `${op} 2 4${ret ? `\ni32.from${signed(type) ? '' : '_u'}` : ''}`;

        case 'biguint64array':
        case 'bigint64array':
          return `${op.replace('32', '64')} 3 4${ret ? `\ncall __Porffor_bigint_from${signed(type) ? 'S' : 'U'}64` : ''}`;
      }
    };

    const bytes = type => {
      switch (type) {
        case 'uint8array':
        case 'uint8clampedarray':
        case 'int8array':
          return 1;

        case 'uint16array':
        case 'int16array':
          return 2;

        case 'uint32array':
        case 'int32array':
          return 4;

        case 'biguint64array':
        case 'bigint64array':
          return 8;
      }
    };

    const getArg = (type, name, value = false) => {
      if (!value) return `local.get ${name}
i32.to_u`;

      switch (type) {
        case 'biguint64array':
        case 'bigint64array':
          return `local.get ${name}
call __Porffor_bigint_toI64`;
      }

      return `local.get ${name}
i32.to${signed(type) ? '' : '_u'}`;
    };

    out += `export const __Atomics_${name} = (ta: any, index: any, ${args}): ${retType} => {
${only3264 ? `
  if (Porffor.fastAnd(Porffor.type(ta) != Porffor.TYPES.int32array, Porffor.type(ta) != Porffor.TYPES.bigint64array))
    throw new TypeError('Atomics.${name} can only be used with a Int32Array or BigInt64Array');

  if (Porffor.type(ta.buffer) != Porffor.TYPES.sharedarraybuffer)
    throw new TypeError('Atomics.${name} can only be used with a shared typed arrays');` : `
  if (Porffor.fastOr(Porffor.type(ta) < Porffor.TYPES.uint8array, Porffor.type(ta) > Porffor.TYPES.bigint64array))
    throw new TypeError('Atomics can only be used with an integer typed array');`}

  index = ecma262.ToIntegerOrInfinity(index);
  if (Porffor.fastOr(index < 0, index > ta.length))
    throw new RangeError('Index out of bounds');

  ${args.split(',').map(arg => {
    const [ name, _ ] = arg.split(':');
    if (!_) return;

    const [ type, value ] = _.split('=');
    const nonfinite = value && value.includes('Infinity');

    return `
${name} = ecma262.ToIntegerOrInfinity(${name});
${nonfinite ? `if (${name} == Infinity) ${name} = -1;` : ''}`;
  }).join('')}

  ${(only3264 ? ['int32array', 'bigint64array'] : ['uint8array', 'uint8clampedarray', 'uint16array', 'int16array', 'uint32array', 'int32array', 'biguint64array', 'bigint64array']).map(x => `if (Porffor.type(ta) == Porffor.TYPES.${x}) {
    Porffor.wasm\`
local.get ta
i32.to_u
i32.load 0 4
local.get index
i32.to_u
i32.const ${bytes(x)}
i32.mul
i32.add
${wasm({ arg: (name, value) => getArg(x, name, value), op: y => getOp(x, y) })}
return\`;
  }`).join('\n')}
};\n`;
  };

  func('load', 'i32.atomic.load', '', 'f64', ({ op }) => `${op()}`);
  func('store', 'i32.atomic.store', 'value: any', 'f64', ({ arg, op }) => `
${arg('value', true)}
${op(false)}
local.get value`);

  for (const x of ['add', 'sub', 'and', 'or', 'xor'])
    func(x, `i32.atomic.rmw.${x}`, 'value: any', 'f64', ({ arg, op }) => `
${arg('value', true)}
${op()}`);

  func('exchange', 'i32.atomic.rmw.xchg', 'value: any', 'f64', ({ arg, op }) => `
${arg('value', true)}
${op()}`);
  func('compareExchange', 'i32.atomic.rmw.cmpxchg', 'expected: any, replacement: any', 'f64', ({ arg, op }) => `
${arg('expected', true)}
${arg('replacement', true)}
${op()}`);

  // todo: int -> string (0 = ok, 1 = not-equal, 2 = timed-out)
  func('wait', 'memory.atomic.wait32', 'value: any, timeout: any = Infinity', 'bytestring', ({ arg, op }) => `
${arg('value', true)}
${arg('timeout')}
i64_extend_i32_u
i64.const 1000000 ;; ms -> ns
i64.mul
${op(false)}
i32.from_u`, true);
  // todo: waitAsync

  func('notify', 'memory.atomic.notify', 'count: any = Infinity', 'f64', ({ arg, op }) => `
${arg('count')}
${op()}`);

  return out;
};