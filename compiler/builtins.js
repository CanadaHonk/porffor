import * as PrecompiledBuiltins from './builtins_precompiled.js';
import { TYPES, TYPE_NAMES } from './types.js';
import { Bin, Un, T, K, Const, JvConst, Box, JvType, JvNum, JvPtr, Convert, Reinterpret, CONVERT_SIGNED, N_KIND, N_TYPE, N_A, N_B, Local, DeclLocal, Assign, Call, CallDynamic, If, TypeSwitch, Return, RawC, BlockStmt } from './ir.js';
import './prefs.js';

const f64FromBytes = bytes => {
  const floats = new Float64Array(1);
  const raw = new Uint8Array(floats.buffer);
  for (let i = 0; i < 8; i++) raw[i] = bytes[i];
  return floats[0];
};

export const BuiltinVars = ({ builtinFuncs }) => {
  const _ = Object.create(null);
  _.undefined = () => JvConst(TYPES.undefined, 0);
  _.undefined.type = TYPES.undefined;

  _.null = () => JvConst(TYPES.object, 0);
  _.null.type = TYPES.object;

  _.NaN = () => Box(Const(T.f64, NaN), Const(T.i32, TYPES.number));
  _.Infinity = () => Box(Const(T.f64, Infinity), Const(T.i32, TYPES.number));

  for (const x in TYPES) {
   _['__Porffor_TYPES_' + x] = () => Const(T.i32, TYPES[x]);
  }

  _.__performance_timeOrigin = () => Box(Call('porf_performance_time_origin', [], T.f64), Const(T.i32, TYPES.number));
  _.__performance_timeOrigin.type = TYPES.number;

  // builtin objects
  const makePrefix = name => (name.startsWith('__') ? '' : '__') + name + '_';

  const done = new Set();
  const object = (name, props) => {
    done.add(name);
    const prefix = name === 'globalThis' ? '' : makePrefix(name);
    const lazyKind = name === 'globalThis' ? 'global'
      : name.startsWith('__') && name.endsWith('_prototype') ? 'proto' : null;

    const existingFunc = builtinFuncs[name];

    const getName = '#get_' + name;
    builtinFuncs[getName] = existingFunc ? {
      params: [],
      retType: T.ptr,
      returnType: TYPES.function,
      body: ({ funcRefPtr }) => [
        Return(globalThis.precompile ? Const(T.ptr, 0) : funcRefPtr(name))
      ]
    } : {
      params: [],
      retType: T.ptr,
      returnType: TYPES.object,
      body: ({ includeBuiltin, funcRefPtr, global, makeString, globalThisUserSync, onFinalize, hasFunc }) => {
        if (globalThis.precompile) return [ Return(Const(T.ptr, 0)) ];

        includeBuiltin('__Porffor_object_new');

        const getPtr = global(`getptr_${name}`, T.ptr);
        const obj = Local('obj', T.jsval);

        // globalThis: user top-level decls are own props, re-synced from bindings on access (globalThisUserSync)
        const sync = [];
        if (name === 'globalThis') globalThisUserSync(Box(getPtr, Const(T.i32, TYPES.object)), sync);

        const out = [
          If(getPtr, [ BlockStmt(sync), Return(getPtr) ]),
          DeclLocal(T.jsval, 'obj', Call('__Porffor_object_new', [ Const(T.i32, Object.keys(props).length) ])),
          Assign(getPtr, JvPtr(obj))
        ];

        const funcValue = name => Box(funcRefPtr(name), Const(T.i32, TYPES.function));
        const propValue = (key, d) => {
          if (key === name) return obj;
          if (key in builtinFuncs) return funcValue(key);
          if (key === 'undefined') return JvConst(TYPES.undefined, 0);
          if (key === 'null') return JvConst(TYPES.object, 0);
          if (key === 'NaN') return Box(Const(T.f64, NaN), Const(T.i32, TYPES.number));
          if (key === 'Infinity') return Box(Const(T.f64, Infinity), Const(T.i32, TYPES.number));
          const getter = '#get_' + key;
          if (getter in builtinFuncs) {
            includeBuiltin(getter);
            return Box(Call(getter, [], T.ptr), Const(T.i32, _[key]?.type ?? TYPES.object));
          }
          if ('value' in d) {
            const value = d.value;
            if (typeof value === 'function') return value(_, { includeBuiltin, funcRefPtr, makeString });
            if (typeof value === 'number') return Box(Const(T.f64, value), Const(T.i32, TYPES.number));
            if (typeof value === 'string') return makeString(value);
            if (value === null) return JvConst(TYPES.object, 0);
          }

          throw new Error(`unsupported builtin object property ${name}.${key}`);
        };

        includeBuiltin('__Porffor_object_fastAdd');
        const emitProp = (out, x, d) => {
          const key = prefix + x;
          const value = propValue(key, d);

          if (x === '__proto__') {
            includeBuiltin('__Porffor_object_setPrototype');
            out.push(Call('__Porffor_object_setPrototype', [ obj, value ], T.none));
            return;
          }

          let flags = 0b0000;
          if (d.configurable) flags |= 0b0010;
          if (d.enumerable) flags |= 0b0100;
          if (d.writable) flags |= 0b1000;

          out.push(Call('__Porffor_object_fastAdd', [ obj, makeString(x), value, Const(T.i32, flags) ], T.none));
        };

        if (lazyKind && Prefs.lazyObjects) {
          // entries only for included methods/globals, explicit X.prototype marks __full -> everything
          const ctorName = lazyKind === 'proto' ? name.slice(2, name.indexOf('_prototype')) : null;
          const adds = [];
          onFinalize(() => {
            adds.length = 0;
            for (const x in props) {
              const key = prefix + x;
              if (lazyKind === 'proto') {
                if (key in builtinFuncs) {
                  if (builtinFuncs[getName].__full) includeBuiltin(key);
                    else if (!hasFunc(key)) continue;
                }
                if (x === 'constructor') {
                  if (builtinFuncs[getName].__full) includeBuiltin(ctorName);
                    else if (!hasFunc(ctorName)) continue;
                }
              } else {
                if (key in builtinFuncs) {
                  if (!hasFunc(key)) continue;
                } else if (('#get_' + key) in builtinFuncs) {
                  if (!hasFunc('#get_' + key)) continue;
                }
              }
              emitProp(adds, x, props[x]);
            }
          });
          out.push(BlockStmt(adds));
        } else {
          for (const x in props) emitProp(out, x, props[x]);
        }

        out.push(BlockStmt(sync));
        out.push(Return(getPtr));
        return out;
      }
    };

   _[name] = (_scope, { includeBuiltin }) => {
      if (lazyKind === 'proto') builtinFuncs[getName].__full = true;
      includeBuiltin('#get_' + name);
      return Box(Call('#get_' + name, [], T.ptr), Const(T.i32, existingFunc ? TYPES.function : TYPES.object));
    };
    _[name].type = existingFunc ? TYPES.function : TYPES.object;

    for (const x in props) {
      const d = props[x];
      const k = prefix + x;

      if ('value' in d && !(k in builtinFuncs) && !(k in _)) {
        if (Array.isArray(d.value) || typeof d.value === 'function') {
         _[k] = d.value;
          continue;
        }

        if (typeof d.value === 'number') {
         _[k] = () => Box(Const(T.f64, d.value), Const(T.i32, TYPES.number));
         _[k].type = TYPES.number;
          continue;
        }

        if (typeof d.value === 'string') {
         _[k] = (_scope, { makeString }) => makeString(d.value);
         _[k].type = TYPES.bytestring;
          continue;
        }

        if (d.value === null) {
         _[k] = _.null;
          continue;
        }

        throw new Error(`unsupported value type (${typeof d.value})`);
      }
    }
  };

  const props = (base, vals) => {
    const out = {};

    if (Array.isArray(vals)) {
      for (const x of vals) {
        out[x] = {
          ...base
        };
      }
    } else for (const x in vals) {
      out[x] = {
        ...base,
        value: vals[x]
      };
    }

    return out;
  };

  const builtinFuncKeys = Object.keys(builtinFuncs);
  const autoFuncKeys = name => {
    const prefix = makePrefix(name);
    return builtinFuncKeys.filter(x => x.startsWith(prefix)).map(x => x.slice(prefix.length)).filter(x => !x.startsWith('prototype_'));
  };
  const autoFuncs = name => ({
    ...props({
      writable: true,
      enumerable: false,
      configurable: true
    }, autoFuncKeys(name)),
    ...(_[`__${name}_prototype`] ? {
      prototype: {
        writable: false,
        enumerable: false,
        configurable: false
      }
    } : {})
  });

  object('Math', {
    ...props({
      writable: false,
      enumerable: false,
      configurable: false
    }, {
      E: Math.E,
      LN10: Math.LN10,
      LN2: Math.LN2,
      LOG10E: Math.LOG10E,
      LOG2E: Math.LOG2E,
      PI: Math.PI,
      SQRT1_2: Math.SQRT1_2,
      SQRT2: Math.SQRT2,

      // https://github.com/rwaldron/proposal-math-extensions/issues/10
      RAD_PER_DEG: Math.PI / 180,
      DEG_PER_RAD: 180 / Math.PI
    }),

    ...autoFuncs('Math')
  });

  const typedArrayBytesPerElement = {
    Uint8Array: 1,
    Int8Array: 1,
    Uint8ClampedArray: 1,
    Uint16Array: 2,
    Int16Array: 2,
    Uint32Array: 4,
    Int32Array: 4,
    Float32Array: 4,
    Float64Array: 8,
    BigInt64Array: 8,
    BigUint64Array: 8
  };

  const wellKnownSymbols = [
    'asyncIterator', 'hasInstance',
    'isConcatSpreadable', 'iterator',
    'match', 'matchAll', 'replace',
    'search', 'species', 'split',
    'toPrimitive', 'toStringTag', 'unscopables',
    'dispose', 'asyncDispose'
  ];

  const wellKnownSymbolProps = props({
    writable: false,
    enumerable: false,
    configurable: false
  }, Object.fromEntries(wellKnownSymbols.map(x => [x, (_scope, { includeBuiltin, makeString, global }) => {
    includeBuiltin('Symbol');
    return global(`#wellknown_${x}`, T.jsval, Call('Symbol', [ makeString(`Symbol.${x}`) ], T.jsval));
  }])));

  for (const x of wellKnownSymbols) {
    wellKnownSymbolProps[x].value.type = TYPES.symbol;
  }

  // automatically generate objects for prototypes
  for (const x of builtinFuncKeys.reduce((acc, x) => {
    const ind = x.indexOf('_prototype_');
    if (ind === -1) return acc;

    acc.add(x.slice(0, ind + 10));
    return acc;
  }, new Set())) {
    const props = autoFuncs(x);

    // special case: Object.prototype.__proto__ = null
    if (x === '__Object_prototype') {
      Object.defineProperty(props, '__proto__', { value: { value: null, configurable: true }, enumerable: true });
    }

    // special case: Function.prototype.length = 0
    // special case: Function.prototype.name = ''
    if (x === '__Function_prototype') {
      props.length = { value: 0, configurable: true };
      props.name = { value: '', configurable: true };
    }

    // per spec Array.prototype is an array exotic object with length = 0
    if (x === '__Array_prototype') {
      props.length = { value: 0, writable: true, configurable: false };
    }

    // add constructor for constructors
    const name = x.slice(2, x.indexOf('_', 2));
    if (builtinFuncs[name]?.constr) {
      const value = (_scope, { funcRefPtr }) => Box(funcRefPtr(name), Const(T.i32, TYPES.function));
      value.type = TYPES.function;

      props.constructor = {
        value,
        writable: true,
        enumerable: false,
        configurable: true
      };
    }

    object(x, props);
  }


  object('Number', {
    ...props({
      writable: false,
      enumerable: false,
      configurable: false
    }, {
      NaN: NaN,
      POSITIVE_INFINITY: Infinity,
      NEGATIVE_INFINITY: -Infinity,
      MAX_VALUE: f64FromBytes([ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xef, 0x7f ]),
      MIN_VALUE: f64FromBytes([ 1, 0, 0, 0, 0, 0, 0, 0 ]),
      MAX_SAFE_INTEGER: 9007199254740991,
      MIN_SAFE_INTEGER: -9007199254740991,
      EPSILON: f64FromBytes([ 0, 0, 0, 0, 0, 0, 0xb0, 0x3c ])
    }),

    ...autoFuncs('Number')
  });

  // these technically not spec compliant as it should be classes or non-enumerable but eh
  object('navigator', {
    ...props({
      writable: false,
      enumerable: true,
      configurable: false
    }, {
      userAgent: `Porffor/${globalThis.version}`
    })
  });

  for (const x of [
    'console',
    'performance',
  ]) {
    object(x, props({
      writable: true,
      enumerable: true,
      configurable: true
    }, autoFuncKeys(x).slice(0, 12)));
  }

  for (const x of [ 'Array', 'ArrayBuffer', 'Atomics', 'Date', 'Error', 'JSON', 'Object', 'Promise', 'Reflect', 'String', 'Symbol', 'Uint8Array', 'Int8Array', 'Uint8ClampedArray', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'SharedArrayBuffer', 'BigInt', 'Boolean', 'DataView', 'AggregateError', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'EvalError', 'URIError', 'Function', 'Map', 'RegExp', 'Set', 'WeakMap', 'WeakRef', 'WeakSet' ]) {
    object(x, {
      ...(typedArrayBytesPerElement[x] == null ? {} : props({
        writable: false,
        enumerable: false,
        configurable: false
      }, {
        BYTES_PER_ELEMENT: typedArrayBytesPerElement[x]
      })),
      ...(x === 'Symbol' ? wellKnownSymbolProps : {}),
      ...autoFuncs(x)
    });
  }

  const enumerableGlobals = [ 'atob', 'btoa', 'performance', 'navigator' ];
  object('globalThis', {
    // 19.1 Value Properties of the Global Object
    // https://tc39.es/ecma262/#sec-value-properties-of-the-global-object
    // 19.1.1 globalThis
    globalThis: {
      writable: true,
      enumerable: false,
      configurable: true
    },

    // 19.1.2 Infinity
    // 19.1.3 NaN
    // 19.1.4 undefined
    ...props({
      writable: false,
      enumerable: false,
      configurable: false
    }, [ 'Infinity', 'NaN', 'undefined' ]),

    // 19.2 Function Properties of the Global Object
    // https://tc39.es/ecma262/#sec-function-properties-of-the-global-object
    // 19.3 Constructor Properties of the Global Object
    // https://tc39.es/ecma262/#sec-constructor-properties-of-the-global-object
    ...props({
      writable: true,
      enumerable: false,
      configurable: true
    }, builtinFuncKeys.filter(x => !x.startsWith('__') && !enumerableGlobals.includes(x) && !x.startsWith('f64') && !x.startsWith('i32'))),

    ...props({
      writable: true,
      enumerable: true,
      configurable: true
    }, enumerableGlobals)
  });

  return _;
};

export const BuiltinFuncs = () => {
  const _ = Object.create(null);
  _.isNaN = {
    params: [ { name: 'x', type: T.f64 } ],
    retType: T.jsval,
    returnType: TYPES.boolean,
    body: [ Return(Box(Bin('!=', T.f64, Local('x', T.f64), Local('x', T.f64)), Const(T.i32, TYPES.boolean))) ]
  };
  _.__Number_isNaN = _.isNaN;

  _.isFinite = {
    params: [ { name: 'x', type: T.f64 } ],
    retType: T.jsval,
    returnType: TYPES.boolean,
    body: [ Return(Box(Bin('==', T.f64, Bin('-', T.f64, Local('x', T.f64), Local('x', T.f64)), Bin('-', T.f64, Local('x', T.f64), Local('x', T.f64))), Const(T.i32, TYPES.boolean))) ]
  };
  _.__Number_isFinite = _.isFinite;

  // libm-backed Math: jsval params so public methods do ToNumber, boxed returns for builtin callers
  const nativeMathArg = name => JvNum(Call('__ecma262_ToNumber', [ Local(name, T.jsval) ]));
  const nativeMathUnary = name => {
    _[`__Math_${name}`] = {
      params: [ { name: 'x', type: T.jsval } ],
      retType: T.jsval,
      returnType: TYPES.number,
      body: [
        DeclLocal(T.f64, 'n', nativeMathArg('x')),
        RawC(`return porf_box_num(${name}(n));`, false)
      ]
    };
  };

  for (const name of [
    'exp', 'log2', 'log', 'log10', 'expm1', 'log1p', 'sqrt', 'cbrt',
    'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh',
    'atanh', 'asin', 'acos', 'atan'
  ]) nativeMathUnary(name);

  _.__Math_atan2 = {
    params: [ { name: 'y', type: T.jsval }, { name: 'x', type: T.jsval } ],
    retType: T.jsval,
    returnType: TYPES.number,
    body: [
      DeclLocal(T.f64, 'yNum', nativeMathArg('y')),
      DeclLocal(T.f64, 'xNum', nativeMathArg('x')),
      RawC('return porf_box_num(atan2(yNum, xNum));', false)
    ]
  };

  // C pow() returns 1 where JS requires NaN
  _.__Math_pow = {
    params: [ { name: 'base', type: T.jsval }, { name: 'exponent', type: T.jsval } ],
    retType: T.jsval,
    returnType: TYPES.number,
    body: [
      DeclLocal(T.f64, 'baseNum', nativeMathArg('base')),
      DeclLocal(T.f64, 'exponentNum', nativeMathArg('exponent')),
      RawC(`if (exponentNum != exponentNum) return porf_box_num(NAN);
if ((baseNum == 1.0 || baseNum == -1.0) && isinf(exponentNum)) return porf_box_num(NAN);
return porf_box_num(pow(baseNum, exponentNum));`, false)
    ]
  };

  for (const [ name, op ] of [
    [ 'abs', 'abs' ],
    [ 'floor', 'floor' ],
    [ 'ceil', 'ceil' ],
    [ 'round', 'nearest' ],
    [ 'trunc', 'trunc' ]
  ]) {
   _[`__Math_${name}`] = {
      params: [ { name: 'x', type: T.jsval } ],
      retType: T.jsval,
      returnType: TYPES.number,
      body: [
        DeclLocal(T.f64, 'n', nativeMathArg('x')),
        Return(Box(Un(op, T.f64, Local('n', T.f64)), Const(T.i32, TYPES.number)))
      ]
    };
  }

  _.__Math_sign = {
    params: [ { name: 'x', type: T.jsval } ],
    retType: T.jsval,
    returnType: TYPES.number,
    body: [
      DeclLocal(T.f64, 'n', nativeMathArg('x')),
      RawC('if (n != n || n == 0.0) return porf_box_num(n);\nreturn porf_box_num(copysign(1.0, n));', false)
    ]
  };

  // todo: does not follow spec with +-Infinity and values >2**32
  _.__Math_clz32 = {
    params: [ { name: 'x', type: T.jsval } ],
    retType: T.jsval,
    returnType: TYPES.number,
    body: [
      DeclLocal(T.f64, 'n', nativeMathArg('x')),
      RawC('return porf_box_num((f64)porf_clz32(porf_f64_to_u32(n)));', false)
    ]
  };

  _.__Math_fround = {
    params: [ { name: 'x', type: T.jsval } ],
    retType: T.jsval,
    returnType: TYPES.number,
    body: [
      DeclLocal(T.f64, 'n', nativeMathArg('x')),
      RawC('return porf_box_num((f64)(f32)n);', false)
    ]
  };

  _.__Math_imul = {
    params: [ { name: 'x', type: T.jsval }, { name: 'y', type: T.jsval } ],
    retType: T.jsval,
    returnType: TYPES.number,
    body: [
      DeclLocal(T.f64, 'xNum', nativeMathArg('x')),
      DeclLocal(T.f64, 'yNum', nativeMathArg('y')),
      RawC(`f64 xd = trunc(xNum);
xd -= floor(xd / 4294967296.0) * 4294967296.0;
if (xd < 0.0) xd += 4294967296.0;
f64 yd = trunc(yNum);
yd -= floor(yd / 4294967296.0) * 4294967296.0;
if (yd < 0.0) yd += 4294967296.0;
return porf_box_num((f64)(i32)((u32)xd * (u32)yd));`, false)
    ]
  };

  _.__Porffor_prng = {
    params: [],
    retType: T.u64,
    body: ({ global }) => {
      const state0 = global('state0', T.u64);
      const state1 = global('state1', T.u64);
      const s1 = Local('s1', T.u64);
      const s0 = Local('s0', T.u64);
      const result = Local('result', T.u64);

      return [
        If(Bin('==', T.u64, Bin('|', T.u64, state0, state1), Const(T.u64, 0)), [
          Assign(state0, Const(T.u64, 0x7b1dcdaf)),
          Assign(state1, Const(T.u64, 0x21b965f5))
        ]),
        DeclLocal(T.u64, 's1', state1),
        DeclLocal(T.u64, 's0', state0),
        DeclLocal(T.u64, 'result', Bin('+', T.u64, s0, s1)),
        Assign(s1, Bin('^', T.u64, s1, s0)),
        Assign(state0, Bin('^', T.u64,
          Bin('^', T.u64, Bin('rotl', T.u64, s0, Const(T.u64, 24)), s1),
          Bin('<<', T.u64, s1, Const(T.u64, 16)))),
        Assign(state1, Bin('rotl', T.u64, s1, Const(T.u64, 37))),
        Return(result)
      ];
    }
  };

  _.__Math_random = {
    params: [],
    retType: T.f64,
    returnType: TYPES.number,
    body: [ Return(Bin('*', T.f64, Convert(T.f64, Bin('>>', T.u64, Call('__Porffor_prng', [], T.u64), Const(T.u64, 11)), 0), Const(T.f64, 2 ** -53))) ]
  };

  _.__performance_now = {
    params: [],
    retType: T.jsval,
    returnType: TYPES.number,
    body: [ Return(Box(Call('porf_performance_now', [], T.f64), Const(T.i32, TYPES.number))) ]
  };

  _.__Porffor_typeName = {
    params: [ { name: 'type', type: T.i32 } ],
    retType: T.jsval,
    returnType: TYPES.bytestring,
    body: ({ makeString }) => [
      TypeSwitch(Local('type', T.i32),
        Object.entries(TYPE_NAMES).map(([ type, name ]) => [ [ +type ], [ Return(makeString(name)) ] ]),
        [ Return(makeString('unknown')) ])
    ]
  };

  _.__Porffor_bytestringToString = {
    params: [ { name: 'src', type: T.ptr } ],
    retType: T.jsval,
    returnType: TYPES.string,
    body: [ RawC(`u32 len = *(u32*)(MEM + src);
u32 dst = porf_alloc(6u + len * 2u, ${TYPES.string});
*(u32*)(MEM + dst) = len;
for (u32 i = 0; i < len; i++) *(u16*)(MEM + dst + 4u + i * 2u) = *(u8*)(MEM + src + 4u + i);
return porf_box((f64)dst, ${TYPES.string});`, false) ]
  };

  // Function.prototype.length/flags/name from render-emitted tables (porf_fnlen/fnflags/fnname),
  // indexed by fn index: `*(u32*)(MEM + (u32)fn.val)`, same decode as porf_call_dynamic
  const lutFn = (returnType, body) => ({ params: [ { name: 'fn', type: T.jsval } ], retType: T.jsval, returnType, body: [ RawC(body, false) ] });
  const lutRead = table => `${table}[*(u32*)(MEM + (u32)fn.val)]`;

  _.__Porffor_funcLut_length = lutFn(TYPES.number, `return porf_box_num((f64)${lutRead('porf_fnlen')});`);

  _.__Porffor_funcLut_flags = lutFn(TYPES.number, `return porf_box_num((f64)((${lutRead('porf_fnflags')} >> 3) & 3));`);

  _.__Porffor_funcLut_name = lutFn(TYPES.bytestring, `return porf_box((f64)${lutRead('porf_fnname')}, ${TYPES.bytestring});`);

  _.__Porffor_number_getExponent = {
    params: [ { name: 'x', type: T.f64 } ],
    retType: T.i32,
    returnType: TYPES.number,
    body: [ Return(Bin('-', T.i32, Convert(T.i32, Bin('&', T.u64, Bin('>>', T.u64, Reinterpret(T.u64, Local('x', T.f64)), Const(T.u64, 52)), Const(T.u64, 0x7ff))), Const(T.i32, 1023))) ]
  };

  _.__Porffor_bigint_fromU64 = {
    params: [ { name: 'x', type: T.i64 } ],
    retType: T.jsval,
    returnType: TYPES.bigint,
    body: [ RawC(`u64 ux = (u64)x;
u32 hi = (u32)(ux >> 32);
u32 lo = (u32)ux;
if (hi < 0x80000u) return porf_box((f64)ux, ${TYPES.bigint});
u32 ptr = porf_alloc(16, ${TYPES.bigint});
*(u8*)(MEM + ptr) = 0;
*(u16*)(MEM + ptr + 2) = 2;
*(u32*)(MEM + ptr + 4) = hi;
*(u32*)(MEM + ptr + 8) = lo;
return porf_box((f64)ptr + 2251799813685248.0, ${TYPES.bigint});`, false) ]
  };

  _.__Porffor_bigint_fromS64 = {
    params: [ { name: 'x', type: T.i64 } ],
    retType: T.jsval,
    returnType: TYPES.bigint,
    body: [ RawC(`i64 signBits = x >> 63;
u64 ax = (u64)((x ^ signBits) - signBits);
u32 hi = (u32)(ax >> 32);
u32 lo = (u32)ax;
if (hi < 0x80000u) return porf_box((f64)x, ${TYPES.bigint});
u32 ptr = porf_alloc(16, ${TYPES.bigint});
*(u8*)(MEM + ptr) = x != (i64)ax;
*(u16*)(MEM + ptr + 2) = 2;
*(u32*)(MEM + ptr + 4) = hi;
*(u32*)(MEM + ptr + 8) = lo;
return porf_box((f64)ptr + 2251799813685248.0, ${TYPES.bigint});`, false) ]
  };

  _.__Porffor_bigint_toI64 = {
    params: [ { name: 'x', type: T.jsval } ],
    retType: T.i64,
    returnType: TYPES.bigint,
    body: [ RawC(`f64 d = x.val;
if (fabs(d) < 2251799813685248.0) return (i64)d;
u32 ptr = (u32)(d - 2251799813685248.0);
i64 sign = *(u8*)(MEM + ptr) ? -1 : 1;
u32 digits = *(u16*)(MEM + ptr + 2);
if (digits == 0) return 0;
if (digits == 1) return sign * (i64)(u64)*(u32*)(MEM + ptr + 4);
if (digits > 2) ptr += (digits - 2) * 4;
return sign * (i64)((((u64)*(u32*)(MEM + ptr + 4)) << 32) + (u64)*(u32*)(MEM + ptr + 8));`, false) ]
  };

  _.__Porffor_memorySize = {
    params: [],
    retType: T.i32,
    returnType: TYPES.number,
    body: [ RawC('return (i32)porf_heap_committed;', false) ]
  };

  _.__Porffor_gc = {
    params: [],
    retType: T.none,
    returnType: TYPES.undefined,
    body: [ RawC('porf_gc_collect_impl(0);', false) ]
  };

  // allow non-comptime redefinition later in precompiled
  const comptime = (name, returnType, comptime, jsLength = 0) => {
    let v = {
      returnType,
      comptime,
      jsLength,
      params: [],
      locals: [],
      returns: []
    };

    Object.defineProperty(_, name, {
      get() {
        return v;
      },
      set(x) {
        x.comptime = comptime;
        x.returnType = returnType;
        v = x;
      }
    });
  };

  comptime('__Array_of', TYPES.array, (scope, decl, { generate }) => generate(scope, {
    type: 'ArrayExpression',
    elements: decl.arguments
  }));

  const fastBoolArg = x => x[N_TYPE] === T.i32 ? x :
    x[N_KIND] === K.Box && x[N_B][N_KIND] === K.Const && x[N_B][N_A] === TYPES.boolean && (x[N_A][N_TYPE] === T.i32 || x[N_A][N_TYPE] === T.u32) ? Un('!', T.i32, Un('!', T.i32, x[N_A])) :
    Convert(T.i32, JvNum(x), CONVERT_SIGNED);
  const fastBool = x => Box(x, Const(T.i32, TYPES.boolean));

  comptime('__Porffor_fastOr', TYPES.boolean, (scope, decl, { generate }) =>
    fastBool(decl.arguments.map(a => fastBoolArg(generate(scope, a))).reduce((x, y) => Bin('|', T.i32, x, y))));

  comptime('__Porffor_fastAnd', TYPES.boolean, (scope, decl, { generate }) =>
    fastBool(decl.arguments.map(a => fastBoolArg(generate(scope, a))).reduce((x, y) => Bin('&', T.i32, x, y))));

  comptime('__Porffor_printStatic', TYPES.undefined, (scope, decl, { printStaticStr }) => {
    const str = decl.arguments[0].value;
    const out = printStaticStr(scope, str);
    out.push(JvConst(TYPES.undefined, 0));
    return out;
  });

  comptime('__Porffor_type', TYPES.number, (scope, decl, { generate, getNodeType, knownType }) => {
    const type = knownType(scope, getNodeType(scope, decl.arguments[0]));
    if (type != null) return Const(T.i32, type);
    return JvType(generate(scope, decl.arguments[0]));
  });

  comptime('__Porffor_as', undefined, (scope, decl, { generate }) => {
    const typeArg = decl.arguments[1];
    if (typeArg?.type === 'Identifier' && typeArg.name.startsWith('__Porffor_TYPES_')) {
      return Box(generate(scope, decl.arguments[0]), Const(T.i32, TYPES[typeArg.name.slice('__Porffor_TYPES_'.length)]));
    }

    return Box(generate(scope, decl.arguments[0]), generate(scope, typeArg));
  });

  // Porffor.call(func, argArray, this, newTarget)
  comptime('__Porffor_call', undefined, (scope, decl, { generate, createThisArg }) => {
    const noNewTarget = decl.arguments[3].value === null ||
      (decl.arguments[3].type === 'Identifier' && decl.arguments[3].name === 'undefined');
    const newTarget = noNewTarget ? null : generate(scope, decl.arguments[3]);
    const thisArg = decl.arguments[2].value === null
      ? createThisArg(scope, noNewTarget
        ? { type: 'CallExpression', callee: decl.arguments[0], arguments: [] }
        : { type: 'NewExpression', callee: decl.arguments[3], arguments: [], _new: true, _forceCreateThis: true })
      : generate(scope, decl.arguments[2]);

    return CallDynamic(generate(scope, decl.arguments[0]), thisArg, [], newTarget, generate(scope, decl.arguments[1]));
  });

  // Porffor.callThis(func, this, ...args)
  comptime('__Porffor_callThis', undefined, (scope, decl, { generate }) => generate(scope, {
    type: 'CallExpression',
    callee: decl.arguments[0],
    arguments: decl.arguments.slice(2),
    _thisArg: decl.arguments[1]
  }));

  // compile-time aware console.log to optimize fast paths
  // todo: this breaks console.group, etc - disable this if those are used but edge case for now
  comptime('__console_log', TYPES.undefined, (scope, decl, { generate, getNodeType, knownType, printStaticStr, exprStmt }) => {
    const slow = () => {
      decl._noComptime = true;
      return generate(scope, decl);
    };
    const fast = (name, before = '', after = '\n') => {
      if (before) for (const x of printStaticStr(scope, before)) exprStmt(scope, x);
      if (name) exprStmt(scope, generate(scope, {
          ...decl,
          callee: {
            type: 'Identifier',
            name
          }
        }));
      if (after) for (const x of printStaticStr(scope, after)) exprStmt(scope, x);
      return JvConst(TYPES.undefined, 0);
    };

    if (decl.arguments.length === 0) return fast();
    if (decl.arguments.length !== 1) return slow();

    const type = knownType(scope, getNodeType(scope, decl.arguments[0]));

    // if we know the type skip the entire print logic, use type's func directly
    if (type === TYPES.string || type === TYPES.bytestring) {
      return fast('__Porffor_printString');
    } else if (type === TYPES.number) {
      return fast('__Porffor_print');
    }

    // one arg, skip most of console to avoid rest arg etc
    return fast('__Porffor_consolePrint');
  });

  PrecompiledBuiltins.BuiltinFuncs(_);
  _.__Math_hypot.jsLength = 2;

  return _;
};
