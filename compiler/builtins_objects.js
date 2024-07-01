import { Opcodes, PageSize, Valtype } from './wasmSpec.js';
import { TYPES } from './types.js';
import { number } from './embedding.js';

export default function({ builtinFuncs }, Prefs) {
  const done = new Set();
  const object = (name, props) => {
    done.add(name);

    let cached;
    this[name] = (scope, { allocPage, makeString, generateIdent, getNodeType, builtin }) => {
      if (cached) {
        return number(cached);
      }

      // todo: precompute bytes here instead of calling real funcs if we really care about perf later

      const page = allocPage(scope, `builtin object: ${name}`);
      const ptr = page === 0 ? 4 : page * PageSize;
      cached = ptr;

      const out = [];

      for (const x in props) {
        const value = {
          type: 'Identifier',
          name: '__' + name + '_' + x
        };

        let flags = 0b0000;

        const d = props[x];
        if (d.configurable) flags |= 0b0010;
        if (d.enumerable) flags |= 0b0100;
        if (d.writable) flags |= 0b1000;

        out.push(
          ...number(ptr, Valtype.i32),
          ...number(TYPES.object, Valtype.i32),

          ...makeString(scope, x, false, `#builtin_object_${name}_${x}`),
          Opcodes.i32_to_u,
          ...number(TYPES.bytestring, Valtype.i32),

          ...generateIdent(scope, value),
          ...getNodeType(scope, value),

          ...number(flags, Valtype.i32),
          ...number(TYPES.number, Valtype.i32),

          [ Opcodes.call, ...builtin('__Porffor_object_define') ],
          [ Opcodes.drop ],
          [ Opcodes.drop ]
        );
      }

      out.push(...number(ptr));
      return out;
    };
    this[name].type = TYPES.object;

    for (const x in props) {
      const d = props[x];

      if (d.value) {
        const k = '__' + name + '_' + x;

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
  const autoFuncKeys = name => builtinFuncKeys.filter(x => x.startsWith('__' + name + '_')).map(x => x.slice(name.length + 3));
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

  object('Reflect', autoFuncs('Reflect'));


  // todo: support when existing func
  // object('Number', {
  //   NaN: NaN,
  //   POSITIVE_INFINITY: Infinity,
  //   NEGATIVE_INFINITY: -Infinity,

  //   MAX_VALUE: valtype === 'i32' ? 2147483647 : 1.7976931348623157e+308,
  //   MIN_VALUE: valtype === 'i32' ? -2147483648 : 5e-324,

  //   MAX_SAFE_INTEGER: valtype === 'i32' ? 2147483647 : 9007199254740991,
  //   MIN_SAFE_INTEGER: valtype === 'i32' ? -2147483648 : -9007199254740991,

  //   EPSILON: 2.220446049250313e-16
  // });


  // technically not spec compliant as it should be a navigator class but bleh
  object('navigator', {
    ...props({
      writable: false,
      enumerable: true,
      configurable: false
    }, {
      userAgent: `Porffor/${globalThis.version}`
    })
  });

  if (Prefs.logMissingObjects) for (const x of Object.keys(builtinFuncs).concat(Object.keys(this))) {
    if (!x.startsWith('__')) continue;

    const name = x.split('_').slice(2, -1).join('_').replaceAll('_', '.');

    let t = globalThis;
    for (const x of name.split('.')) {
      t = t[x];
      if (!t) break;
    }
    if (!t) continue;

    if (!done.has(name)) {
      console.log(name, !!builtinFuncs[name]);
      done.add(name);
    }
  }
};