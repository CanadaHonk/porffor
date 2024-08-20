import { Blocktype, Opcodes, PageSize, Valtype } from './wasmSpec.js';
import { TYPES } from './types.js';
import { number } from './embedding.js';

export default function({ builtinFuncs }, Prefs) {
  const makePrefix = name => (name.startsWith('__') ? '' : '__') + name + '_';

  const done = new Set();
  const object = (name, props) => {
    done.add(name);
    const prefix = name === 'globalThis' ? '' : makePrefix(name);

    // already a func
    const existingFunc = builtinFuncs[name];

    builtinFuncs['#get_' + name] = {
      params: [],
      locals: [],
      returns: [ Valtype.i32 ],
      returnType: TYPES.object,
      wasm: (scope, { allocPage, makeString, generate, getNodeType, builtin, glbl }) => {
        if (globalThis.precompile) return [ [ 'get object', name ] ];

        // todo/perf: precompute bytes here instead of calling real funcs if we really care about perf later

        let ptr;
        if (existingFunc) {
          ptr = builtin(name, true);
        } else {
          ptr = allocPage(scope, `builtin object: ${name}`);
        }

        const getPtr = glbl(Opcodes.global_get, `getptr_${name}`, Valtype.i32)[0];
        const out = [
          // check if already made/cached
          getPtr,
          [ Opcodes.if, Blocktype.void ],
            getPtr,
            [ Opcodes.return ],
          [ Opcodes.end ],

          // set cache & ptr for use
          ...number(ptr, Valtype.i32),
          glbl(Opcodes.global_set, `getptr_${name}`, Valtype.i32)[0]
        ];

        for (const x in props) {
          let value = {
            type: 'Identifier',
            name: prefix + x
          };

          let flags = 0b0000;

          const d = props[x];
          if (d.configurable) flags |= 0b0010;
          if (d.enumerable) flags |= 0b0100;
          if (d.writable) flags |= 0b1000;

          // hack: do not generate objects inside of objects as it causes issues atm
          if (this[prefix + x]?.type === TYPES.object && this[prefix + x] !== this.null) value = { type: 'ObjectExpression', properties: [] };

          out.push(
            getPtr,
            ...number(existingFunc ? TYPES.function : TYPES.object, Valtype.i32),

            ...makeString(scope, x, false, `#builtin_object_${name}_${x}`),
            Opcodes.i32_to_u,
            ...number(TYPES.bytestring, Valtype.i32),

            ...generate(scope, value),
            ...getNodeType(scope, value),

            ...number(flags, Valtype.i32),
            ...number(TYPES.number, Valtype.i32),

            [ Opcodes.call, builtin('__Porffor_object_expr_initWithFlags') ],
            [ Opcodes.drop ],
            [ Opcodes.drop ]
          );
        }

        // return ptr
        out.push(getPtr);
        return out;
      }
    };

    if (existingFunc) {
      this[name] = (scope, { builtin, funcRef }) => [
        [ Opcodes.call, builtin('#get_' + name) ],
        [ Opcodes.drop ],
        ...funcRef(name)
      ];
      this[name].type = TYPES.function;
    } else {
      this[name] = (scope, { builtin }) => [
        [ Opcodes.call, builtin('#get_' + name) ],
        Opcodes.i32_from_u
      ];
      this[name].type = TYPES.object;
    }

    for (const x in props) {
      const d = props[x];
      const k = prefix + x;

      if (Object.hasOwn(d, 'value') && !Object.hasOwn(builtinFuncs, k) && !Object.hasOwn(this, k)) {
        if (Array.isArray(d.value) || typeof d.value === 'function') {
          this[k] = d.value;
          continue;
        }

        if (typeof d.value === 'number') {
          this[k] = number(d.value);
          this[k].type = TYPES.number;
          continue;
        }

        if (typeof d.value === 'string') {
          this[k] = (scope, { makeString }) => makeString(scope, d.value, false, k);
          this[k].type = TYPES.bytestring;
          continue;
        }

        if (d.value === null) {
          this[k] = this.null;
          continue;
        }

        throw new Error(`unsupported value type (${typeof d.value})`);
      }
    }
  };

  const props = (base, vals) => {
    const out = {};

    if (Array.isArray(vals)) {
      // array of keys with no value
      for (const x of vals) {
        out[x] = {
          ...base
        };
      }
    } else for (const x in vals) {
      // object of key values
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
  const autoFuncs = name => props({
    writable: true,
    enumerable: false,
    configurable: true
  }, autoFuncKeys(name));

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

  // automatically generate objects for prototypes
  for (const x of builtinFuncKeys.reduce((acc, x) => {
    const ind = x.indexOf('_prototype_');
    if (ind === -1) return acc;

    acc.add(x.slice(0, ind + 10));
    return acc;
  }, new Set())) {
    const props = autoFuncs(x);

    // special case: Object.prototype.__proto__ = null
    if (x === '__Object_prototype') Object.defineProperty(props, '__proto__', { value: { value: null }, enumerable: true });

    // add constructor for constructors
    const name = x.slice(2, x.indexOf('_', 2));
    if (builtinFuncs[name]?.constr) {
      const value = (scope, { funcRef }) => funcRef(name);
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

      MAX_VALUE: valtype === 'i32' ? 2147483647 : 1.7976931348623157e+308,
      MIN_VALUE: valtype === 'i32' ? -2147483648 : 5e-324,

      MAX_SAFE_INTEGER: valtype === 'i32' ? 2147483647 : 9007199254740991,
      MIN_SAFE_INTEGER: valtype === 'i32' ? -2147483648 : -9007199254740991,

      EPSILON: 2.220446049250313e-16
    }),

    ...autoFuncs('Number')
  });

  object('Reflect', autoFuncs('Reflect'));
  object('Object', autoFuncs('Object'));
  object('JSON', autoFuncs('JSON'));


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
    'crypto',
    'performance',
  ]) {
    object(x, {
      ...props({
        writable: true,
        enumerable: true,
        configurable: true
      }, autoFuncKeys(x).slice(0, 12))
    });
  }

  const enumerableGlobals = [ 'atob', 'btoa', 'performance', 'crypto', 'navigator' ];
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

  if (Prefs.logMissingObjects) for (const x of Object.keys(builtinFuncs).concat(Object.keys(this))) {
    if (!x.startsWith('__')) continue;

    const name = x.split('_').slice(2, -1).join('_');

    let t = globalThis;
    for (const x of name.split('_')) {
      t = t[x];
      if (!t) break;
    }
    if (!t) continue;

    if (!done.has(name) && !done.has('__' + name)) {
      console.log(name, !!builtinFuncs[name]);
      done.add(name);
    }
  }
};