import { Blocktype, Opcodes, Valtype, ValtypeSize } from './wasmSpec.js';
import { number, ieee754_binary64, signedLEB128, unsignedLEB128, encodeVector, read_signedLEB128 } from './encoding.js';
import { operatorOpcode } from './expression.js';
import { BuiltinFuncs, BuiltinVars, importedFuncs, NULL, UNDEFINED } from './builtins.js';
import { PrototypeFuncs } from './prototype.js';
import { TYPES, TYPE_FLAGS, TYPE_NAMES } from './types.js';
import * as Rhemyn from '../rhemyn/compile.js';
import parse from './parse.js';
import { log } from './log.js';
import { allocPage, allocStr } from './allocator.js';
import './prefs.js';

class TodoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TodoError';
  }
}
const todo = (scope, msg, expectsValue = undefined) => {
  switch (Prefs.todoTime ?? 'runtime') {
    case 'compile':
      throw new TodoError(msg);

    case 'runtime':
      return internalThrow(scope, 'TodoError', msg, expectsValue);
  }
};

const isFuncType = type =>
  type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression' ||
  type === 'ClassDeclaration' || type === 'ClassExpression';
const hasFuncWithName = name =>
  Object.hasOwn(funcIndex, name) || Object.hasOwn(builtinFuncs, name) || Object.hasOwn(importedFuncs, name) || Object.hasOwn(internalConstrs, name);

const astCache = new WeakMap();
const cacheAst = (decl, wasm) => {
  astCache.set(decl, wasm);
  return wasm;
};

let doNotMarkFuncRef = false;
const funcRef = func => {
  if (!doNotMarkFuncRef) func.referenced = true;

  if (globalThis.precompile) return [
    [ 'funcref', Opcodes.const, func.name ]
  ];

  func.generate?.();

  const wrapperArgc = Prefs.indirectWrapperArgc ?? 10;
  if (!func.wrapperFunc) {
    const locals = {}, params = [];
    for (let i = 0; i < wrapperArgc + 2; i++) {
      params.push(valtypeBinary, Valtype.i32);
      locals[i * 2] = { idx: i * 2, type: valtypeBinary };
      locals[i * 2 + 1] = { idx: i * 2 + 1, type: Valtype.i32 };
    }
    let localInd = (wrapperArgc + 2) * 2;

    if (indirectFuncs.length === 0) {
      // add empty indirect func
      const emptyFunc = {
        name: '#indirect#empty',
        params,
        locals: { ...locals }, localInd,
        returns: [ valtypeBinary, Valtype.i32 ],
        wasm: [
          number(0),
          number(0, Valtype.i32)
        ],
        constr: true,
        internal: true,
        indirect: true,
        wrapperOf: {
          name: '',
          jsLength: 0
        },
        indirectIndex: 0
      };

      // check not being constructed
      emptyFunc.wasm.unshift(
        [ Opcodes.local_get, 0 ], // new.target value
        Opcodes.i32_to_u,
        [ Opcodes.if, Blocktype.void ], // if value is non-zero
          ...internalThrow(emptyFunc, 'TypeError', `Function is not a constructor`), // throw type error
        [ Opcodes.end ]
      );

      // have empty func as indirect funcs 0 and 1
      indirectFuncs.push(emptyFunc, emptyFunc);
    }

    const wasm = [];
    const offset = func.constr ? 0 : (func.method ? 2 : 4);
    for (let i = 0; i < func.params.length; i++) {
      if (func.internal && func.name.includes('_prototype_') && i < 2) {
        // special case: use real this for prototype internals
        wasm.push(
          [ Opcodes.local_get, 2 + i ],
          ...(i % 2 === 0 && func.params[i] === Valtype.i32 ? [ Opcodes.i32_to ]: [])
        );
      } else {
        wasm.push(
          [ Opcodes.local_get, offset + (!func.internal || func.typedParams ? i : i * 2) ],
          ...(i % 2 === 0 && func.params[i] === Valtype.i32 ? [ Opcodes.i32_to ]: [])
        );
      }
    }

    wasm.push([ Opcodes.call, func.index ]);

    if (func.returns[0] === Valtype.i32) {
      if (func.returns.length === 2) {
        const localIdx = localInd++;
        locals[localIdx] = { idx: localIdx, type: Valtype.i32 };

        wasm.push(
          [ Opcodes.local_set, localIdx ],
          Opcodes.i32_from,
          [ Opcodes.local_get, localIdx ]
        );
      } else {
        wasm.push(Opcodes.i32_from);
      }
    }

    if (func.returns.length === 0) {
      // add to stack if returns nothing
      wasm.push(number(UNDEFINED));
    }

    if (func.returns.length < 2) {
      // add built-in returnType if only returns a value
      wasm.push(number(func.returnType ?? TYPES.number, Valtype.i32));
    }

    const name = '#indirect_' + func.name;
    const wrapperFunc = {
      name,
      params,
      locals, localInd,
      returns: [ valtypeBinary, Valtype.i32 ],
      wasm,
      constr: true,
      internal: true,
      indirect: true,
      wrapperOf: func,
      indirectIndex: indirectFuncs.length
    };

    indirectFuncs.push(wrapperFunc);

    wrapperFunc.jsLength = countLength(func);
    func.wrapperFunc = wrapperFunc;

    if (!func.constr) {
      // check not being constructed
      wasm.unshift(
        [ Opcodes.local_get, 0 ], // new.target value
        Opcodes.i32_to_u,
        [ Opcodes.if, Blocktype.void ], // if value is non-zero
          // ...internalThrow(wrapperFunc, 'TypeError', `${unhackName(func.name)} is not a constructor`), // throw type error
          ...internalThrow(wrapperFunc, 'TypeError', `Function is not a constructor`), // throw type error
        [ Opcodes.end ]
      );
    }
  }

  return [
    [ Opcodes.const, func.wrapperFunc.indirectIndex ]
  ];
};

const forceDuoValtype = (scope, wasm, forceValtype) => [
  ...wasm,
  ...(valtypeBinary === Valtype.i32 && forceValtype === Valtype.f64 ? [
    [ Opcodes.local_set, localTmp(scope, '#swap', Valtype.i32) ],
    [ Opcodes.f64_convert_i32_s ],
    [ Opcodes.local_get, localTmp(scope, '#swap', Valtype.i32) ]
  ] : []),
  ...(valtypeBinary === Valtype.f64 && forceValtype === Valtype.i32 ? [
    [ Opcodes.local_set, localTmp(scope, '#swap', Valtype.i32) ],
    Opcodes.i32_trunc_sat_f64_s,
    [ Opcodes.local_get, localTmp(scope, '#swap', Valtype.i32) ]
  ] : [])
];

const generate = (scope, decl, global = false, name = undefined, valueUnused = false) => {
  if (valueUnused && !Prefs.optUnused) valueUnused = false;
  if (astCache.has(decl)) return astCache.get(decl);

  switch (decl.type) {
    case 'Wasm':
      if (typeof decl.wasm === 'function') {
        return cacheAst(decl, decl.wasm(scope, valueUnused));
      }
      return cacheAst(decl, decl.wasm);

    case 'BinaryExpression':
      return cacheAst(decl, generateBinaryExp(scope, decl, global, name));

    case 'LogicalExpression':
      return cacheAst(decl, generateLogicExp(scope, decl));

    case 'Identifier':
      return cacheAst(decl, generateIdent(scope, decl));

    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      return cacheAst(decl, generateFunc(scope, decl)[1]);

    case 'BlockStatement':
      return cacheAst(decl, generateBlock(scope, decl));

    case 'ReturnStatement':
      return cacheAst(decl, generateReturn(scope, decl));

    case 'ExpressionStatement':
      return cacheAst(decl, generateExp(scope, decl));

    case 'SequenceExpression':
      return cacheAst(decl, generateSequence(scope, decl));

    case 'ChainExpression':
      return cacheAst(decl, generateChain(scope, decl));

    case 'CallExpression':
    case 'NewExpression':
      return cacheAst(decl, generateCall(scope, decl, global, name, valueUnused));

    case 'ThisExpression':
      return cacheAst(decl, generateThis(scope, decl));

    case 'Super':
      return cacheAst(decl, generateSuper(scope, decl));

    case 'Literal':
      return cacheAst(decl, generateLiteral(scope, decl, global, name));

    case 'VariableDeclaration':
      return cacheAst(decl, generateVar(scope, decl));

    case 'AssignmentExpression':
      return cacheAst(decl, generateAssign(scope, decl, global, name, valueUnused));

    case 'UnaryExpression':
      return cacheAst(decl, generateUnary(scope, decl));

    case 'UpdateExpression':
      return cacheAst(decl, generateUpdate(scope, decl, global, name, valueUnused));

    case 'IfStatement':
      return cacheAst(decl, generateIf(scope, decl));

    case 'ForStatement':
      return cacheAst(decl, generateFor(scope, decl));

    case 'WhileStatement':
      return cacheAst(decl, generateWhile(scope, decl));

    case 'DoWhileStatement':
      return cacheAst(decl, generateDoWhile(scope, decl));

    case 'ForOfStatement':
      return cacheAst(decl, generateForOf(scope, decl));

    case 'ForInStatement':
      return cacheAst(decl, generateForIn(scope, decl));

    case 'SwitchStatement':
      return cacheAst(decl, generateSwitch(scope, decl));

    case 'BreakStatement':
      return cacheAst(decl, generateBreak(scope, decl));

    case 'ContinueStatement':
      return cacheAst(decl, generateContinue(scope, decl));

    case 'LabeledStatement':
      return cacheAst(decl, generateLabel(scope, decl));

    case 'EmptyStatement':
      return cacheAst(decl, generateEmpty(scope, decl));

    case 'MetaProperty':
      return cacheAst(decl, generateMeta(scope, decl));

    case 'ConditionalExpression':
      return cacheAst(decl, generateConditional(scope, decl));

    case 'ThrowStatement':
      return cacheAst(decl, generateThrow(scope, decl));

    case 'TryStatement':
      return cacheAst(decl, generateTry(scope, decl));

    case 'DebuggerStatement':
      return cacheAst(decl, [
        // [ Opcodes.call, importedFuncs.debugger ],
        number(UNDEFINED)
      ]);

    case 'ArrayExpression':
      return cacheAst(decl, generateArray(scope, decl, global, name, globalThis.precompile));

    case 'ObjectExpression':
      return cacheAst(decl, generateObject(scope, decl, global, name));

    case 'MemberExpression':
      return cacheAst(decl, generateMember(scope, decl, global, name));

    case 'ClassExpression':
    case 'ClassDeclaration':
      return cacheAst(decl, generateClass(scope, decl));

    case 'AwaitExpression':
      return cacheAst(decl, generateAwait(scope, decl));

    case 'YieldExpression':
      return cacheAst(decl, generateYield(scope, decl));

    case 'TemplateLiteral':
      return cacheAst(decl, generateTemplate(scope, decl));

    case 'TaggedTemplateExpression':
      return cacheAst(decl, generateTaggedTemplate(scope, decl, global, name, valueUnused));

    case 'ExportNamedDeclaration':
      if (!decl.declaration) return todo(scope, 'unsupported export declaration', true);

      const funcsBefore = funcs.map(x => x.name);
      generate(scope, decl.declaration);

      // set new funcs as exported
      if (funcsBefore.length !== funcs.length) {
        const newFuncs = funcs.filter(x => !funcsBefore.includes(x.name)).filter(x => !x.internal);

        for (const x of newFuncs) {
          x.export = true;

          // generate func
          x.generate?.();
        }
      }

      return cacheAst(decl, [ number(UNDEFINED) ]);

    case 'TSAsExpression':
      return cacheAst(decl, generate(scope, decl.expression));

    default:
      // ignore typescript nodes
      if (decl.type.startsWith('TS') ||
          decl.type === 'ImportDeclaration' && decl.importKind === 'type') {
        return cacheAst(decl, [ number(UNDEFINED) ]);
      }

      return cacheAst(decl, todo(scope, `no generation for ${decl.type}!`, true));
  }
};

const optional = (op, clause = op.at(-1)) => clause || clause === 0 ? (Array.isArray(op[0]) ? op : [ op ]) : [];

const lookupName = (scope, name) => {
  if (Object.hasOwn(scope.locals, name)) return [ scope.locals[name], false ];
  if (Object.hasOwn(globals, name)) return [ globals[name], true ];

  return [ undefined, undefined ];
};

const internalThrow = (scope, constructor, message, expectsValue = Prefs.alwaysValueInternalThrows) => {
  const out = generate(scope, {
    type: 'ThrowStatement',
    argument: {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: constructor
      },
      arguments: [
        {
          type: 'Literal',
          value: Prefs.d ? `${message} (in ${scope.name})` : message
        }
      ]
    }
  });

  if (expectsValue) out.push(number(UNDEFINED, typeof expectsValue === 'number' ? expectsValue : valtypeBinary));
  return out;
};

// enum hoistType { value = 0, decl = 1, pdz = 2 }
// let globalHoist = new Map();
const hoist = (scope, name, hoistType, global) => {
  scope.hoists ??= new Map();
  // if (global) globalHoist.set(name, hoistType);
  //   else scope.hoists.set(name, hoistType);

  scope.hoists.set(name, hoistType);
};

const hoistLookup = (scope, name) => {
  const hoistType = scope.hoists?.get(name) ?? 0;
  switch (hoistType) {
    case 0: // value
      return lookupOrError(scope, name, true);

    case 1: // decl
      return [ number(UNDEFINED) ];

    case 2: // pdz
      return internalThrow(scope, 'ReferenceError', 'Cannot access before initialization');
  }
};

const hoistLookupType = (scope, name) => {
  const hoistType = scope.hoists?.get(name) ?? 0;
  switch (hoistType) {
    case 0: // value
      return getType(scope, name, true);

    case 1: // decl
    case 2: // pdz
      return [ number(TYPES.undefined, Valtype.i32) ];
  }
};

const lookup = (scope, name, failEarly = false) => {
  let local = scope.locals[name];

  if (Object.hasOwn(builtinVars, name)) {
    if (builtinVars[name].floatOnly && valtype[0] === 'i') throw new Error(`Cannot use ${unhackName(name)} with integer valtype`);

    let wasm = builtinVars[name];
    if (wasm.usesImports) scope.usesImports = true;

    if (typeof wasm === 'function') wasm = asmFuncToAsm(scope, wasm);
    return wasm.slice();
  }

  if (!Object.hasOwn(funcIndex, name) && Object.hasOwn(builtinFuncs, name)) {
    includeBuiltin(scope, name);
  }

  if (isExistingProtoFunc(name) || Object.hasOwn(internalConstrs, name)) {
    // todo: return an actual something
    return [ number(1) ];
  }

  if (local?.idx === undefined) {
    if (name === 'arguments' && !scope.arrow) {
      // todo: not compliant
      let len = countLength(scope);
      const names = new Array(len);
      const off = scope.constr ? 4 : (scope.method ? 2 : 0);
      for (const x in scope.locals) {
        const i = scope.locals[x].idx - off;
        if (i >= 0 && i % 2 === 0 && i < len * 2) {
          names[i / 2] = x;
        }
      }

      return generateArray(scope, {
        elements: names.map(x => ({ type: 'Identifier', name: x }))
      }, false, '#arguments', true);
    }

    // no local var with name
    if (Object.hasOwn(globals, name)) return [ [ Opcodes.global_get, globals[name].idx ] ];
    if (Object.hasOwn(funcIndex, name)) return funcRef(funcByName(name));
    if (Object.hasOwn(importedFuncs, name)) return [ number(importedFuncs[name] - importedFuncs.length) ];

    if (name.startsWith('__')) {
      // return undefined if unknown key in already known var
      let parent = name.slice(2).split('_').slice(0, -1).join('_');
      if (parent.includes('_')) parent = '__' + parent;

      if (Object.hasOwn(builtinFuncs, name + '$get')) {
        // hack: force error as accessors should only be used with objects anyway
        return internalThrow(scope, 'TypeError', 'Accessor called without object');
      }

      const parentLookup = lookup(scope, parent, true);
      if (parentLookup != null) return [ number(UNDEFINED) ];
    }

    if (scope.name === name) {
      // fallback for own func but with a different var/id name
      return funcRef(funcByIndex(scope.index));
    }

    if (failEarly) return null;

    return [ [ null, () => hoistLookup(scope, name) ] ];
  }

  return [
    [ Opcodes.local_get, local.idx ],
    ...(valtypeBinary === Valtype.f64 && local.type === Valtype.i32 ? [ Opcodes.i32_from_u ] : []),
    ...(valtypeBinary === Valtype.i32 && local.type === Valtype.f64 ? [ Opcodes.i32_to_u ] : [])
  ];
};

const lookupOrError = (scope, name, failEarly) => lookup(scope, name, failEarly)
  ?? internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`, true);

const generateIdent = (scope, decl) => {
  return lookupOrError(scope, decl.name, scope.identFailEarly);
};

const generateYield = (scope, decl) => {
  let arg = decl.argument ?? DEFAULT_VALUE();

  if (!scope.generator) {
    // todo: access upper-scoped generator
    return [
      ...generate(scope, arg),
      [ Opcodes.drop ],

      // use undefined as yield expression value
      number(0),
      ...setLastType(scope, TYPES.undefined)
    ];
  }

  // hack: `yield* foo` -> `yielf foo[0]`
  if (decl.delegate) arg = {
    type: 'MemberExpression',
    object: arg,
    property: {
      type: 'Literal',
      value: 0
    },
    computed: true
  };

  // just support a single yield like a return for now
  return [
    // return value in generator
    [ Opcodes.local_get, scope.locals['#generator_out'].idx ],
    number(scope.async ? TYPES.__porffor_asyncgenerator : TYPES.__porffor_generator, Valtype.i32),

    ...generate(scope, arg),
    ...getNodeType(scope, arg),

    [ Opcodes.call, includeBuiltin(scope, scope.async ? '__Porffor_AsyncGenerator_yield' : '__Porffor_Generator_yield').index ],

    // return generator
    [ Opcodes.local_get, scope.locals['#generator_out'].idx ],
    ...(scope.returnType != null ? [] : [ number(scope.async ? TYPES.__porffor_asyncgenerator : TYPES.__porffor_generator, Valtype.i32) ]),
    [ Opcodes.return ],

    // use undefined as yield expression value
    number(0),
    ...setLastType(scope, TYPES.undefined)
  ];
};

const generateReturn = (scope, decl) => {
  const arg = decl.argument ?? DEFAULT_VALUE();

  if (scope.generator) {
    return [
      // return value in generator
      [ Opcodes.local_get, scope.locals['#generator_out'].idx ],
      number(scope.async ? TYPES.__porffor_asyncgenerator : TYPES.__porffor_generator, Valtype.i32),

      ...generate(scope, arg),
      ...getNodeType(scope, arg),

      // return generator
      [ Opcodes.call, includeBuiltin(scope, scope.async ? '__Porffor_AsyncGenerator_return' : '__Porffor_Generator_return').index ],
      ...(scope.returnType != null ? [] : [ number(scope.async ? TYPES.__porffor_asyncgenerator : TYPES.__porffor_generator, Valtype.i32) ]),
      [ Opcodes.return ]
    ];
  }

  if (scope.async) {
    return [
      // resolve promise with return value
      ...generate(scope, arg),
      ...getNodeType(scope, arg),

      [ Opcodes.local_get, scope.locals['#async_out_promise'].idx ],
      number(TYPES.promise, Valtype.i32),

      [ Opcodes.call, includeBuiltin(scope, '__Porffor_promise_resolve').index ],

      // return promise
      [ Opcodes.local_get, scope.locals['#async_out_promise'].idx ],
      ...(scope.returnType != null ? [] : [ number(TYPES.promise, Valtype.i32) ]),
      [ Opcodes.return ]
    ];
  }

  if (scope.returns.length === 0) return [
    ...(arg.type !== 'Identifier' ? generate(scope, arg) : []),
    [ Opcodes.return ]
  ];

  if (
    scope.constr && // only do this in constructors
    !globalThis.precompile // skip in precompiled built-ins, we should not require this and handle it ourselves
  ) {
    // perform return value checks for constructors and (sub)classes

    // just return this if `return undefined` or `return this`
    if ((arg.type === 'Identifier' && arg.name === 'undefined') || (arg.type === 'ThisExpression')) {
      return [
        ...(scope._onlyConstr ? [] : [
          [ Opcodes.local_get, scope.locals['#newtarget'].idx ],
          Opcodes.i32_to_u,
          [ Opcodes.if, Blocktype.void ]
        ]),
          [ Opcodes.local_get, scope.locals['#this'].idx ],
          ...(scope.returnType != null ? [] : [ [ Opcodes.local_get, scope.locals['#this#type'].idx ] ]),
          [ Opcodes.return ],
        ...(scope._onlyConstr ? [] : [
          [ Opcodes.end ],
          ...generate(scope, arg),
          ...(scope.returnType != null ? [] : getNodeType(scope, arg)),
          [ Opcodes.return ],
        ])
      ];
    }

    return [
      ...generate(scope, arg),
      [ Opcodes.local_set, localTmp(scope, '#return') ],
      ...(scope.returnType != null ? [] : getNodeType(scope, arg)),
      [ Opcodes.local_set, localTmp(scope, '#return#type', Valtype.i32) ],

      ...(scope._onlyConstr ? [] : [
        [ Opcodes.local_get, scope.locals['#newtarget'].idx ],
        Opcodes.i32_to_u,
        [ Opcodes.if, Blocktype.void ]
      ]),
        ...(scope.subclass ? [
          // if subclass and returning undefined, return this
          [ Opcodes.local_get, localTmp(scope, '#return#type', Valtype.i32) ],
          number(TYPE_FLAGS.parity, Valtype.i32),
          [ Opcodes.i32_or ],
          number(TYPES.undefined, Valtype.i32),
          [ Opcodes.i32_eq ],
          [ Opcodes.if, Blocktype.void ],
            [ Opcodes.local_get, scope.locals['#this'].idx ],
            ...(scope.returnType != null ? [] : [ [ Opcodes.local_get, scope.locals['#this#type'].idx ] ]),
            [ Opcodes.return ],
          [ Opcodes.end ]
        ] : []),

        // if not object, then...
        ...generate(scope, {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: '__Porffor_object_isObject'
          },
          arguments: [
            { type: 'Identifier', name: '#return' }
          ]
        }),
        Opcodes.i32_to_u,
        [ Opcodes.i32_eqz ],
        [ Opcodes.if, Blocktype.void ],
          ...(scope.subclass ? [
            // throw if subclass
            ...internalThrow(scope, 'TypeError', 'Subclass can only return an object or undefined'),
          ] : [
            // return this if not subclass
            [ Opcodes.local_get, scope.locals['#this'].idx ],
            ...(scope.returnType != null ? [] : [ [ Opcodes.local_get, scope.locals['#this#type'].idx ] ]),
            [ Opcodes.return ],
          ]),
        [ Opcodes.end ],
      ...(scope._onlyConstr ? [] : [
        [ Opcodes.end ]
      ]),

      [ Opcodes.local_get, localTmp(scope, '#return') ],
      ...(scope.returnType != null ? [] : [ [ Opcodes.local_get, localTmp(scope, '#return#type', Valtype.i32) ] ]),
      [ Opcodes.return ]
    ];
  }

  return [
    ...generate(scope, arg),
    ...(scope.returnType != null ? [] : getNodeType(scope, arg)),
    [ Opcodes.return ]
  ];
};

const localTmp = (scope, name, type = valtypeBinary) => {
  if (scope.locals[name]) return scope.locals[name].idx;

  let idx = scope.localInd++;
  scope.locals[name] = { idx, type };

  return idx;
};

const isIntOp = op => op && ((op[0] >= 0x45 && op[0] <= 0x4f) || (op[0] >= 0x67 && op[0] <= 0x78) || op[0] === 0x41);
const isIntToFloatOp = op => op && (op[0] >= 0xb7 && op[0] <= 0xba);

const performLogicOp = (scope, op, left, right, leftType, rightType) => {
  const checks = {
    '||': falsy,
    '&&': truthy,
    '??': nullish
  };

  if (!checks[op]) return todo(scope, `logic operator ${op} not implemented yet`, true);

  // generic structure for {a} OP {b}
  // _ = {a}; if (OP_CHECK) {b} else _

  // if we can, use int tmp and convert at the end to help prevent unneeded conversions
  // (like if we are in an if condition - very common)
  const leftWasInt = isIntToFloatOp(left[left.length - 1]);
  const rightWasInt = isIntToFloatOp(right[right.length - 1]);

  const canInt = leftWasInt && rightWasInt;

  if (canInt) {
    // remove int -> float conversions from left and right
    left.pop();
    right.pop();

    return [
      ...left,
      [ Opcodes.local_tee, localTmp(scope, 'logictmpi', Valtype.i32) ],
      ...checks[op](scope, [], leftType, true, true),
      [ Opcodes.if, Valtype.i32 ],
      ...right,
      // note type
      ...setLastType(scope, rightType),
      [ Opcodes.else ],
      [ Opcodes.local_get, localTmp(scope, 'logictmpi', Valtype.i32) ],
      // note type
      ...setLastType(scope, leftType),
      [ Opcodes.end ],
      Opcodes.i32_from
    ];
  }

  return [
    ...left,
    [ Opcodes.local_tee, localTmp(scope, 'logictmp') ],
    ...checks[op](scope, [], leftType, false, true),
    [ Opcodes.if, valtypeBinary ],
    ...right,
    // note type
    ...setLastType(scope, rightType),
    [ Opcodes.else ],
    [ Opcodes.local_get, localTmp(scope, 'logictmp') ],
    // note type
    ...setLastType(scope, leftType),
    [ Opcodes.end ]
  ];
};

const concatStrings = (scope, left, right, leftType, rightType) => {
  return [
    ...left,
    ...(valtypeBinary === Valtype.i32 ? [ [ Opcodes.f64_convert_i32_s ] ] : []),
    ...leftType,

    ...right,
    ...(valtypeBinary === Valtype.i32 ? [ [ Opcodes.f64_convert_i32_s ] ] : []),
    ...rightType,

    [ Opcodes.call, includeBuiltin(scope, '__Porffor_concatStrings').index ],
    ...setLastType(scope),
    ...(valtypeBinary === Valtype.i32 ? [ Opcodes.i32_trunc_sat_f64_u ] : []),
  ];
};

const compareStrings = (scope, left, right, leftType, rightType, noConv = false) => {
  if (noConv) return [
    ...left,
    Opcodes.i32_to_u,
    ...leftType,

    ...right,
    Opcodes.i32_to_u,
    ...rightType,

    [ Opcodes.call, includeBuiltin(scope, '__Porffor_strcmp').index ]
  ];

  return [
    ...left,
    ...(valtypeBinary === Valtype.i32 ? [ [ Opcodes.f64_convert_i32_s ] ] : []),
    ...leftType,

    ...right,
    ...(valtypeBinary === Valtype.i32 ? [ [ Opcodes.f64_convert_i32_s ] ] : []),
    ...rightType,

    [ Opcodes.call, includeBuiltin(scope, '__Porffor_compareStrings').index ],

    // convert valtype result to i32 as i32 output expected
    Opcodes.i32_trunc_sat_f64_u
  ];
};

const truthy = (scope, wasm, type, intIn = false, intOut = false, forceTruthyMode = undefined) => {
  const truthyMode = forceTruthyMode ?? Prefs.truthy ?? 'full';
  if (isIntToFloatOp(wasm[wasm.length - 1])) return [
    ...wasm,
    ...(truthyMode === 'full' ? [
      [ Opcodes.f64_const, 0 ],
      [ Opcodes.f64_ne ],
      ...(!intOut ? [ Opcodes.i32_from_u ] : [])
    ] : [
      ...(!intIn && intOut ? [ Opcodes.i32_to_u ] : [])
    ])
  ];
  if (isIntOp(wasm[wasm.length - 1])) return [
    ...wasm,
    ...(truthyMode === 'full' ? [
      [ Opcodes.i32_eqz ],
      [ Opcodes.i32_eqz ]
    ] : []),
    ...(intOut ? [] : [ Opcodes.i32_from ]),
  ];

  // todo/perf: use knownType and custom bytecode here instead of typeSwitch

  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);
  const def = (() => {
    if (truthyMode === 'full') return [
      // if value != 0 or NaN
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [
        number(0, Valtype.i32),
        [ Opcodes.i32_ne ]
      ] : [
        [ Opcodes.f64_abs ],
        [ Opcodes.f64_const, 0 ],
        [ Opcodes.f64_gt ]
      ]),

      ...(intOut ? [] : [ Opcodes.i32_from ]),
    ];

    if (truthyMode === 'no_negative') return [
      // if value != 0 or NaN, non-binary output. negative numbers not truthy :/
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [] : [ Opcodes.i32_to ]),
      ...(intOut ? [] : [ Opcodes.i32_from ])
    ];

    if (truthyMode === 'no_nan_negative') return [
      // simpler and faster but makes NaN truthy and negative numbers not truthy,
      // plus non-binary output
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(!intOut || (intIn && intOut) ? [] : [ Opcodes.i32_to_u ])
    ];
  })();

  return [
    ...wasm,
    ...(!useTmp ? [] : [ [ Opcodes.local_set, tmp ] ]),

    ...typeSwitch(scope, type, [
      [ [ TYPES.string, TYPES.bytestring ], () => [
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
        ...(intIn ? [] : [ Opcodes.i32_to_u ]),

        // get length
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

        // if length != 0
        /* [ Opcodes.i32_eqz ],
        [ Opcodes.i32_eqz ], */
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ] ],

      ...(truthyMode === 'full' ? [ [ [ TYPES.booleanobject, TYPES.numberobject ], [
        // always truthy :))
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(1, intOut ? Valtype.i32 : valtypeBinary)
      ] ] ] : []),

      [ 'default', def ]
    ], intOut ? Valtype.i32 : valtypeBinary)
  ];
};

const falsy = (scope, wasm, type, intIn = false, intOut = false, forceTruthyMode = undefined) => {
  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);

  const truthyMode = forceTruthyMode ?? Prefs.truthy ?? 'full';
  const def = (() => {
    if (truthyMode === 'full') return [
      // if value == 0 or NaN
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [
        [ Opcodes.i32_eqz ]
      ] : [
        [ Opcodes.f64_abs ],
        [ Opcodes.f64_const, 0 ],
        [ Opcodes.f64_gt ],
        [ Opcodes.i32_eqz ]
      ]),

      ...(intOut ? [] : [ Opcodes.i32_from ]),
    ];

    if (truthyMode === 'no_negative') return [
      // if value == 0 or NaN, non-binary output. negative numbers not truthy :/
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [] : [ Opcodes.i32_to ]),
      [ Opcodes.i32_eqz ],
      ...(intOut ? [] : [ Opcodes.i32_from ])
    ];

    if (truthyMode === 'no_nan_negative') return [
      // simpler and faster but makes NaN truthy and negative numbers not truthy,
      // plus non-binary output
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [ [ Opcodes.i32_eqz ] ] : [ ...Opcodes.eqz ]),
      ...(intOut ? [] : [ Opcodes.i32_from_u ])
    ];
  })();

  return [
    ...wasm,
    ...(!useTmp ? [] : [ [ Opcodes.local_set, tmp ] ]),

    ...typeSwitch(scope, type, [
      [ [ TYPES.string, TYPES.bytestring ], () => [
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
        ...(intIn ? [] : [ Opcodes.i32_to_u ]),

        // get length
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

        // if length == 0
        [ Opcodes.i32_eqz ],
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ] ],

      ...(truthyMode === 'full' ? [ [ [ TYPES.booleanobject, TYPES.numberobject ], [
        // always truthy :))
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(0, intOut ? Valtype.i32 : valtypeBinary)
      ] ] ] : []),

      [ 'default', def ]
    ], intOut ? Valtype.i32 : valtypeBinary)
  ];
};

const nullish = (scope, wasm, type, intIn = false, intOut = false) => {
  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);

  return [
    ...wasm,
    ...(!useTmp ? [] : [ [ Opcodes.local_set, tmp ] ]),

    ...typeSwitch(scope, type, [
      [ [ TYPES.empty, TYPES.undefined ], [
        // empty
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(1, intOut ? Valtype.i32 : valtypeBinary)
      ] ],
      [ TYPES.object, [
        // object, null if == 0
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),

        ...(intIn ? [ [ Opcodes.i32_eqz ] ] : [ ...Opcodes.eqz ]),
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ] ],
      [ 'default', [
        // not
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(0, intOut ? Valtype.i32 : valtypeBinary)
      ] ]
    ], intOut ? Valtype.i32 : valtypeBinary)
  ];
};

const performOp = (scope, op, left, right, leftType, rightType) => {
  if (op === '||' || op === '&&' || op === '??') {
    return performLogicOp(scope, op, left, right, leftType, rightType);
  }

  const knownLeft = knownTypeWithGuess(scope, leftType);
  const knownRight = knownTypeWithGuess(scope, rightType);

  const eqOp = ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(op);
  const strictOp = op === '===' || op === '!==';

  const startOut = [], endOut = [];
  const finalize = out => startOut.concat(out, endOut);

  // if strict (in)equal check types match, skip if known
  if (strictOp) {
    if (knownLeft != null && knownRight != null) {
      if ((knownLeft | TYPE_FLAGS.parity) !== (knownRight | TYPE_FLAGS.parity)) endOut.push(
        number(op === '===' ? 0 : 1, Valtype.i32),
        [ op === '===' ? Opcodes.i32_and : Opcodes.i32_or ]
      );
    } else {
      endOut.push(
        ...leftType,
        number(TYPE_FLAGS.parity, Valtype.i32),
        [ Opcodes.i32_or ],
        ...rightType,
        number(TYPE_FLAGS.parity, Valtype.i32),
        [ Opcodes.i32_or ],
        ...(op === '===' ? [
          [ Opcodes.i32_eq ],
          [ Opcodes.i32_and ]
        ] : [
          [ Opcodes.i32_ne ],
          [ Opcodes.i32_or ]
        ])
      );
    }
  }

  if (!eqOp && (knownLeft === TYPES.bigint || knownRight === TYPES.bigint) && !(knownLeft === TYPES.bigint && knownRight === TYPES.bigint)) {
    const unknownType = knownLeft === TYPES.bigint ? rightType : leftType;
    startOut.push(
      ...unknownType,
      number(TYPES.bigint, Valtype.i32),
      [ Opcodes.i32_ne ],
      [ Opcodes.if, Blocktype.void ],
        ...internalThrow(scope, 'TypeError', 'Cannot mix BigInts and non-BigInts in numeric expressions'),
      [ Opcodes.end ]
    );
  }

  // todo: if equality op and an operand is undefined, return false
  // todo: niche null hell with 0

  const knownLeftStr = knownLeft === TYPES.string || knownLeft === TYPES.bytestring || knownLeft === TYPES.stringobject;
  const knownRightStr = knownRight === TYPES.string || knownRight === TYPES.bytestring || knownRight === TYPES.stringobject;
  if (knownLeftStr || knownRightStr) {
    if (op === '+') {
      // string concat (a + b)
      return concatStrings(scope, left, right, leftType, rightType);
    }

    // not an equality op, NaN
    if (!eqOp) return [ number(NaN) ];

    // string comparison
    if (op === '===' || op === '==' || op === '!==' || op === '!=') {
      return finalize([
        ...compareStrings(scope, left, right, leftType, rightType, knownLeftStr && knownRightStr),
        ...(op === '!==' || op === '!=' ? [ [ Opcodes.i32_eqz ] ] : [])
      ]);
    }

    // todo: proper >|>=|<|<=
  }

  let ops = operatorOpcode[valtype][op];

  // some complex ops are implemented in funcs
  if (typeof ops === 'function') return finalize(asmFuncToAsm(scope, ops, { left, right }));
  if (!ops) return todo(scope, `operator ${op} not implemented yet`, true);
  if (!Array.isArray(ops)) ops = [ ops ];
  ops = [ ops ];

  let tmpLeft, tmpRight;
  // if equal op, check if strings for compareStrings
  // todo: intelligent partial skip later
  // if neither known are string, stop this madness
  // we already do known checks earlier, so don't need to recheck

  if (op === '+' && (knownLeft == null && knownRight == null)) {
    tmpLeft = localTmp(scope, '__tmpop_left');
    tmpRight = localTmp(scope, '__tmpop_right');

    ops.unshift(
      // if left or right are string or bytestring
      ...leftType,
      number(TYPE_FLAGS.parity, Valtype.i32),
      [ Opcodes.i32_or ],
      number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      ...rightType,
      number(TYPE_FLAGS.parity, Valtype.i32),
      [ Opcodes.i32_or ],
      number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      [ Opcodes.i32_or ],
      [ Opcodes.if, Blocktype.void ],
      ...concatStrings(scope, [ [ Opcodes.local_get, tmpLeft ] ], [ [ Opcodes.local_get, tmpRight ] ], leftType, rightType),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      ...setLastType(scope, TYPES.number)
    );

    // add a surrounding block
    startOut.push([ Opcodes.block, Valtype.f64 ]);
    endOut.unshift([ Opcodes.end ]);
  }

  if ((op === '===' || op === '==' || op === '!==' || op === '!=') && (knownLeft == null && knownRight == null)) {
    tmpLeft = localTmp(scope, '__tmpop_left');
    tmpRight = localTmp(scope, '__tmpop_right');

    ops.unshift(
      // if left or right are string or bytestring
      ...leftType,
      number(TYPE_FLAGS.parity, Valtype.i32),
      [ Opcodes.i32_or ],
      number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      ...rightType,
      number(TYPE_FLAGS.parity, Valtype.i32),
      [ Opcodes.i32_or ],
      number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      [ Opcodes.i32_or ],
      [ Opcodes.if, Blocktype.void ],
      ...compareStrings(scope, [ [ Opcodes.local_get, tmpLeft ] ], [ [ Opcodes.local_get, tmpRight ] ], leftType, rightType),
      ...(op === '!==' || op === '!=' ? [ [ Opcodes.i32_eqz ] ] : []),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ]
    );

    // add a surrounding block
    startOut.push([ Opcodes.block, Valtype.i32 ]);
    endOut.unshift([ Opcodes.end ]);
  }

  return finalize([
    ...left,
    ...(tmpLeft != null ? [ [ Opcodes.local_tee, tmpLeft ] ] : []),
    ...right,
    ...(tmpRight != null ? [ [ Opcodes.local_tee, tmpRight ] ] : []),
    ...ops
  ]);
};

const knownNullish = decl => {
  if (decl.type === 'Literal' && decl.value === null) return true;
  if (decl.type === 'Identifier' && decl.name === 'undefined') return true;

  return false;
};

const generateBinaryExp = (scope, decl) => {
  if (decl.operator === 'instanceof') {
    // try hacky version for built-ins first
    const rightName = decl.right.name;
    if (rightName) {
      let checkType = TYPES[rightName.toLowerCase()];
      if (checkType != null && rightName === TYPE_NAMES[checkType] && !rightName.endsWith('Error')) {
        const out = generate(scope, decl.left);
        out.push([ Opcodes.drop ]);

        // switch primitive types to primitive object types
        if (checkType === TYPES.number) checkType = TYPES.numberobject;
        if (checkType === TYPES.boolean) checkType = TYPES.booleanobject;
        if (checkType === TYPES.string) checkType = TYPES.stringobject;

        // currently unsupported types
        if ([TYPES.string].includes(checkType)) {
          out.push(number(0));
        } else {
          out.push(
            ...getNodeType(scope, decl.left),
            number(checkType, Valtype.i32),
            [ Opcodes.i32_eq ],
            Opcodes.i32_from_u
          );
        }

        return out;
      }
    }

    return generate(scope, {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: '__Porffor_object_instanceof'
      },
      arguments: [
        decl.left,
        decl.right,
        getObjProp(decl.right, 'prototype')
      ]
    });
  }

  if (decl.operator === 'in') {
    return generate(scope, {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: '__Porffor_object_in'
      },
      arguments: [
        decl.right,
        decl.left
      ]
    });
  }

  // opt: == null|undefined -> nullish
  if (decl.operator === '==' || decl.operator === '!=') {
    if (knownNullish(decl.right)) {
      const out = nullish(scope, generate(scope, decl.left), getNodeType(scope, decl.left), false, true);
      if (decl.operator === '!=') out.push([ Opcodes.i32_eqz ]);
      out.push(Opcodes.i32_from_u);
      return out;
    }

    if (knownNullish(decl.left)) {
      const out = nullish(scope, generate(scope, decl.right), getNodeType(scope, decl.right), false, true);
      if (decl.operator === '!=') out.push([ Opcodes.i32_eqz ]);
      out.push(Opcodes.i32_from_u);
      return out;
    }
  }

  const out = performOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right), getNodeType(scope, decl.left), getNodeType(scope, decl.right));
  if (valtype !== 'i32' && ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(decl.operator)) out.push(Opcodes.i32_from_u);

  return out;
};

const asmFuncToAsm = (scope, func, extra) => {
  return func(scope, {
    Valtype, Opcodes, TYPES, TYPE_NAMES, usedTypes, typeSwitch, makeString, internalThrow,
    getNodeType, generate, generateIdent,
    builtin: (n, offset = false) => {
      let idx = funcIndex[n] ?? importedFuncs[n];
      if (idx == null && builtinFuncs[n]) {
        includeBuiltin(scope, n);
        idx = funcIndex[n];
      }

      scope.includes ??= new Set();
      scope.includes.add(n);

      if (idx == null) throw new Error(`builtin('${n}') failed: could not find func (from ${scope.name})`);
      if (offset) idx -= importedFuncs.length;

      return idx;
    },
    hasFunc: x => funcIndex[x] != null,
    funcRef: name => {
      if (funcIndex[name] == null && builtinFuncs[name]) {
        includeBuiltin(scope, name);
      }

      const func = funcByName(name);
      return funcRef(func);
    },
    glbl: (opcode, name, type) => {
      const globalName = '#porf#' + name; // avoid potential name clashing with user js
      if (!globals[globalName]) {
        const idx = globals['#ind']++;
        globals[globalName] = { idx, type };

        const tmpIdx = globals['#ind']++;
        globals[globalName + '#glbl_inited'] = { idx: tmpIdx, type: Valtype.i32 };
      }

      const out = [
        [ opcode, globals[globalName].idx ]
      ];

      scope.initedGlobals ??= new Set();
      if (!scope.initedGlobals.has(name)) {
        scope.initedGlobals.add(name);
        if (scope.globalInits[name]) out.unshift(
          [ Opcodes.global_get, globals[globalName + '#glbl_inited'].idx ],
          [ Opcodes.i32_eqz ],
          [ Opcodes.if, Blocktype.void ],
          ...asmFuncToAsm(scope, scope.globalInits[name]),
          number(1, Valtype.i32),
          [ Opcodes.global_set, globals[globalName + '#glbl_inited'].idx ],
          [ Opcodes.end ]
        );
      }

      return out;
    },
    loc: (name, type) => {
      if (!scope.locals[name]) {
        const idx = scope.localInd++;
        scope.locals[name] = { idx, type };
      }

      return scope.locals[name].idx;
    },
    t: (types, wasm) => {
      if (types.some(x => usedTypes.has(x))) {
        return wasm();
      } else {
        return [ [ null, () => {
          if (types.some(x => usedTypes.has(x))) return wasm();
          return [];
        } ] ];
      }
    },
    i32ify: wasm => {
      wasm.push(Opcodes.i32_to_u);
      return wasm;
    },
    allocPage: (scope, name) => allocPage({ scope, pages }, name)
  }, extra);
};

const asmFunc = (name, { wasm, params = [], typedParams = false, locals: localTypes = [], globals: globalTypes = [], globalInits = [], returns = [], returnType, localNames = [], globalNames = [], table = false, constr = false, hasRestArgument = false, usesTag = false, usesImports = false, usedTypes = [] } = {}) => {
  if (wasm == null) { // called with no built-in
    log.warning('codegen', `${name} has no built-in!`);
    wasm = [];
  }

  const existing = funcByName(name);
  if (existing) return existing;

  const allLocals = params.concat(localTypes);
  const locals = {};
  for (let i = 0; i < allLocals.length; i++) {
    locals[localNames[i] ?? `l${i}`] = { idx: i, type: allLocals[i] };
  }

  const func = {
    name,
    params,
    typedParams,
    locals,
    localInd: allLocals.length,
    returns,
    returnType,
    internal: true,
    index: currentFuncIndex++,
    globalInits,
    constr, table, usesImports, hasRestArgument
  };

  funcs.push(func);
  funcIndex[name] = func.index;

  if (typeof wasm === 'function') {
    if (globalThis.precompile) wasm = [];
      else wasm = asmFuncToAsm(func, wasm);
  }

  if (globalTypes.length !== 0) {
    // offset global ops for base global idx
    let baseGlobalIdx, i = 0;
    for (const type of globalTypes) {
      if (baseGlobalIdx === undefined) baseGlobalIdx = globals['#ind'];

      globals[globalNames[i] ?? `${name}_global_${i}`] = { idx: globals['#ind']++, type, init: globalInits[i] ?? 0 };
      i++;
    }

    for (let i = 0; i < wasm.length; i++) {
      const inst = wasm[i];
      if (inst[0] === Opcodes.global_get || inst[0] === Opcodes.global_set) {
        inst[1] += baseGlobalIdx;
      }
    }
  }

  if (table) funcs.table = true;
  if (usesTag) ensureTag();
  for (const x of usedTypes) typeUsed(func, x);

  func.wasm = wasm;
  return func;
};

const includeBuiltin = (scope, builtin) => {
  scope.includes ??= new Set();
  scope.includes.add(builtin);

  return asmFunc(builtin, builtinFuncs[builtin]);
};

const generateLogicExp = (scope, decl) => {
  return performLogicOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right), getNodeType(scope, decl.left), getNodeType(scope, decl.right));
};

const isExistingProtoFunc = name => {
  if (name.startsWith('__Array_prototype')) return !!prototypeFuncs[TYPES.array][name.slice(18)];
  if (name.startsWith('__String_prototype_')) return !!prototypeFuncs[TYPES.string][name.slice(19)];

  return false;
};

const getInferred = (scope, name, global = false) => {
  if (global) {
    if (globalInfer.has(name)) return globalInfer.get(name);
  } else if (scope.inferTree) {
    for (let i = scope.inferTree.length - 1; i >= 0; i--) {
      const x = scope.inferTree[i];
      if (x._infer?.has(name)) return x._infer.get(name);
    }
  }

  return null;
};

const setInferred = (scope, name, type, global = false) => {
  scope.inferTree ??= [];

  if (global) {
    // set inferred type in global if not already and not in a loop, else make it null
    globalInfer.set(name, globalInfer.has(name) || inferLoopPrev.length > 0 ? null : type);
  } else {
    // set inferred type in top
    const top = scope.inferTree.at(-1);
    top._infer ??= new Map();
    top._infer.set(name, type);

    // invalidate inferred type above if mismatched
    for (let i = scope.inferTree.length - 2; i >= 0; i--) {
      const x = scope.inferTree[i];
      if (x._infer && x._infer.get(name) !== type) x._infer.set(name, null);
    }
  }
};

const getType = (scope, name, failEarly = false) => {
  const fallback = failEarly ? [
    number(TYPES.undefined, Valtype.i32)
  ] : [
    [ null, () => hoistLookupType(scope, name) ]
  ];

  if (Object.hasOwn(builtinVars, name)) return [ number(builtinVars[name].type ?? TYPES.number, Valtype.i32) ];

  let metadata, typeLocal, global = null;
  if (Object.hasOwn(scope.locals, name)) {
    metadata = scope.locals[name].metadata;
    typeLocal = scope.locals[name + '#type'];
    global = false;
  } else if (Object.hasOwn(globals, name)) {
    metadata = globals[name].metadata;
    typeLocal = globals[name + '#type'];
    global = true;
  }

  if (global !== false && name === 'arguments' && !scope.arrow) {
    return [ number(TYPES.array, Valtype.i32) ];
  }

  if (metadata?.type != null) {
    return [ number(metadata.type, Valtype.i32) ];
  }

  const inferred = getInferred(scope, name, global);
  if (metadata?.type === undefined && inferred != null) return [ number(inferred, Valtype.i32) ];

  if (typeLocal) return [
    [ global ? Opcodes.global_get : Opcodes.local_get, typeLocal.idx ]
  ];

  if (hasFuncWithName(name)) {
    return [ number(TYPES.function, Valtype.i32) ];
  }

  if (isExistingProtoFunc(name)) return [ number(TYPES.function, Valtype.i32) ];

  return fallback;
};

const setType = (scope, name, type, noInfer = false) => {
  typeUsed(scope, knownType(scope, type));

  const out = typeof type === 'number' ? [ number(type, Valtype.i32) ] : type;

  let metadata, typeLocal, global = false;
  if (Object.hasOwn(scope.locals, name)) {
    metadata = scope.locals[name].metadata;
    typeLocal = scope.locals[name + '#type'];
  } else if (Object.hasOwn(globals, name)) {
    metadata = globals[name].metadata;
    typeLocal = globals[name + '#type'];
    global = true;
  }

  if (metadata?.type != null) {
    return [];
  }

  if (!noInfer) {
    const newInferred = knownType(scope, type);
    setInferred(scope, name, newInferred, global);

    // todo/opt: skip setting if already matches previous
  }

  if (typeLocal) return [
    ...out,
    [ global ? Opcodes.global_set : Opcodes.local_set, typeLocal.idx ]
  ];

  // todo: warn or error here
  return [];
};

const getLastType = scope => {
  if (!scope.locals['#last_type']) return [
    [ null, () => {
      if (scope.locals['#last_type']) {
        scope.gotLastType = true;
        return [
          [ Opcodes.local_get, localTmp(scope, '#last_type', Valtype.i32) ]
        ];
      }

      return [ number(TYPES.number, Valtype.i32) ];
    } ]
  ];

  scope.gotLastType = true;
  return [
    [ Opcodes.local_get, localTmp(scope, '#last_type', Valtype.i32) ]
  ];
};

const setLastType = (scope, type = []) => {
  typeUsed(scope, knownType(scope, type));
  return [
    ...(typeof type === 'number' ? [ number(type, Valtype.i32) ] : type),
    [ Opcodes.local_set, localTmp(scope, '#last_type', Valtype.i32) ]
  ];
};

const getNodeType = (scope, node) => {
  let guess = null;
  const ret = (() => {
    if (node._type) return node._type;

    if (node.type === 'TSAsExpression') {
      return extractTypeAnnotation(node).type;
    }

    if (node.type === 'Literal') {
      if (node.regex) return TYPES.regexp;

      if (typeof node.value === 'string' && byteStringable(node.value)) return TYPES.bytestring;

      return TYPES[typeof node.value];
    }

    if (isFuncType(node.type)) {
      if (node.type.endsWith('Declaration')) return TYPES.undefined;
      return TYPES.function;
    }

    if (node.type === 'Identifier') {
      return getType(scope, node.name);
    }

    if (node.type === 'ObjectExpression' || node.type === 'Super') {
      return TYPES.object;
    }

    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      let name = node.callee.name;

      // hack: special primitive object types
      if (node.type === 'NewExpression') {
        if (name === 'Number') return TYPES.numberobject;
        if (name === 'Boolean') return TYPES.booleanobject;
        if (name === 'String') return TYPES.stringobject;
      }

      // hack: try reading from member if call
      if (name == null && node.callee.type === 'MemberExpression' && node.callee.property.name === 'call') {
        name = node.callee.object.name;
      }

      if (name == null) {
        // unknown name
        return getLastType(scope);
      }

      const func = funcByName(name);
      if (func) {
        if (func.returnType != null) return func.returnType;
      }

      if (Object.hasOwn(builtinFuncs, name) && builtinFuncs[name].returnType != null) return builtinFuncs[name].returnType;
      if (Object.hasOwn(internalConstrs, name) && internalConstrs[name].type != null) return internalConstrs[name].type;

      if (name.startsWith('__Porffor_wasm_')) {
        // todo: return undefined for non-returning ops
        return TYPES.number;
      }

      return getLastType(scope);
    }

    if (node.type === 'ExpressionStatement') {
      return getNodeType(scope, node.expression);
    }

    if (node.type === 'AssignmentExpression') {
      const op = node.operator.slice(0, -1) || '=';
      if (op === '=') return getNodeType(scope, node.right);

      return getNodeType(scope, {
        type: ['||', '&&', '??'].includes(op) ? 'LogicalExpression' : 'BinaryExpression',
        left: node.left,
        right: node.right,
        operator: op
      });
    }

    if (node.type === 'ArrayExpression') {
      return TYPES.array;
    }

    if (node.type === 'BinaryExpression') {
      if (['==', '===', '!=', '!==', '>', '>=', '<', '<=', 'instanceof', 'in'].includes(node.operator)) return TYPES.boolean;

      const leftType = getNodeType(scope, node.left);
      const rightType = getNodeType(scope, node.right);
      const knownLeft = knownTypeWithGuess(scope, leftType);
      const knownRight = knownTypeWithGuess(scope, rightType);

      if (knownLeft === TYPES.bigint || knownRight === TYPES.bigint) return TYPES.bigint;
      if (node.operator !== '+') return TYPES.number;

      if ((knownLeft != null || knownRight != null) && !(
        (knownLeft === TYPES.string || knownRight === TYPES.string) ||
        (knownLeft === TYPES.bytestring || knownRight === TYPES.bytestring) ||
        (knownLeft === TYPES.stringobject || knownRight === TYPES.stringobject)
      )) return TYPES.number;

      if (
        (knownLeft === TYPES.string || knownRight === TYPES.string) ||
        (knownLeft === TYPES.stringobject || knownRight === TYPES.stringobject)
      ) return TYPES.string;

      // guess bytestring, could really be bytestring or string
      if (knownLeft === TYPES.bytestring || knownRight === TYPES.bytestring)
        guess = TYPES.bytestring;

      return getLastType(scope);
    }

    if (node.type === 'UnaryExpression') {
      if (node.operator === '!') return TYPES.boolean;
      if (node.operator === 'void') return TYPES.undefined;
      if (node.operator === 'delete') return TYPES.boolean;
      if (node.operator === 'typeof') return TYPES.bytestring;

      // todo: proper bigint support
      const type = getNodeType(scope, node.argument);
      const known = knownType(scope, type);
      if (known === TYPES.bigint) return TYPES.bigint;

      return TYPES.number;
    }

    if (node.type === 'UpdateExpression') {
      return TYPES.number;
    }

    if (node.type === 'MemberExpression') {
      const name = node.property.name;

      if (name === 'length') {
        if (hasFuncWithName(node.object.name)) return TYPES.number;
        if (Prefs.fastLength) return TYPES.number;
      }

      const objectKnownType = knownType(scope, getNodeType(scope, node.object));
      if (objectKnownType != null) {
        if (name === 'length' && (objectKnownType & TYPE_FLAGS.length) !== 0) return TYPES.number;

        if (node.computed) {
          if (objectKnownType === TYPES.string) return TYPES.string;
          if (objectKnownType === TYPES.bytestring) return TYPES.bytestring;
        }
      }

      return getLastType(scope);
    }

    if (node.type === 'TemplateLiteral') {
      // could be normal string but shrug
      return TYPES.bytestring;
    }

    if (node.type === 'TaggedTemplateExpression') {
      // hack
      switch (node.tag.name) {
        case '__Porffor_wasm': return TYPES.number;
        case '__Porffor_bs': return TYPES.bytestring;
        case '__Porffor_s': return TYPES.string;
      }
    }

    if (node.type === 'ThisExpression') {
      if (scope.overrideThisType) return scope.overrideThisType;
      if (!scope.constr && !scope.method) return getType(scope, 'globalThis');
      return [ [ Opcodes.local_get, scope.locals['#this#type'].idx ] ];
    }

    if (node.type === 'MetaProperty') {
      if (scope.constr && node.meta.name === 'new' && node.property.name === 'target') {
        // new.target
        return [ [ Opcodes.local_get, scope.locals['#newtarget#type'].idx ] ];
      }

      return TYPES.undefined;
    }

    if (node.type === 'SequenceExpression') {
      return getNodeType(scope, node.expressions.at(-1));
    }

    if (node.type === 'ChainExpression') {
      return getNodeType(scope, node.expression);
    }

    if (node.type === 'BlockStatement') {
      return getNodeType(scope, getLastNode(node.body));
    }

    if (node.type === 'LabeledStatement') {
      return getNodeType(scope, node.body);
    }

    if (node.type.endsWith('Statement') || node.type.endsWith('Declaration')) {
      return TYPES.undefined;
    }

    return getLastType(scope);
  })();

  const out = typeof ret === 'number' ? [ number(ret, Valtype.i32) ] : ret;
  if (guess != null) out.guess = typeof guess === 'number' ? [ number(guess, Valtype.i32) ] : guess;

  typeUsed(scope, knownType(scope, out));
  return out;
};

const generateLiteral = (scope, decl, global, name) => {
  if (decl.value === null) return [ number(NULL) ];

  // hack: just return 1 for regex literals
  if (decl.regex) {
    return [ number(1) ];
  }

  switch (typeof decl.value) {
    case 'number':
      return [ number(decl.value) ];

    case 'boolean':
      return [ number(decl.value ? 1 : 0) ];

    case 'string':
      return makeString(scope, decl.value);

    case 'bigint':
      let n = decl.value;

      // inline if small enough
      if ((n < 0 ? -n : n) < 0x8000000000000n) {
        return [ number(Number(n)) ];
      }

      // todo/opt: calculate and statically store digits
      return generate(scope, {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: '__Porffor_bigint_fromString'
        },
        arguments: [
          {
            type: 'Literal',
            value: decl.value.toString()
          }
        ]
      });

    default:
      return todo(scope, `cannot generate literal of type ${typeof decl.value}`, true);
  }
};

const generateExp = (scope, decl) => {
  if (decl.directive === 'use strict') {
    scope.strict = true;
    return [ number(UNDEFINED) ];
  }

  return generate(scope, decl.expression, undefined, undefined, !scope.inEval);
};

const generateSequence = (scope, decl) => {
  let out = [];

  const exprs = decl.expressions;
  for (let i = 0; i < exprs.length; i++) {
    out.push(...generate(scope, exprs[i]));
    if (i !== exprs.length - 1) out.push([ Opcodes.drop ]);
  }

  return out;
};

const generateChain = (scope, decl) => {
  scope.chainMembers = 0;
  const out = generate(scope, decl.expression);
  scope.chainMembers = null;

  return out;
};

const ArrayUtil = {
  getLengthI32: pointer => [
    ...pointer,
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ]
  ],

  getLength: pointer => [
    ...pointer,
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
    Opcodes.i32_from_u
  ],

  setLengthI32: (pointer, value) => [
    ...pointer,
    ...value,
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ]
  ],

  setLength: (pointer, value) => [
    ...pointer,
    ...value,
    Opcodes.i32_to_u,
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ]
  ]
};

const createNewTarget = (scope, decl, idx = 0, force = false) => {
  if (decl._new || force) {
    return [
      ...(typeof idx === 'number' ? [ number(idx) ] : idx),
      number(TYPES.function, Valtype.i32)
    ];
  }

  return [
    number(UNDEFINED),
    number(TYPES.undefined, Valtype.i32)
  ];
};

const getObjProp = (obj, prop) => {
  if (typeof obj === 'string') obj = {
    type: 'Identifier',
    name: obj
  };

  if (typeof prop === 'string') prop = {
    type: 'Identifier',
    name: prop
  };

  return objectHack({
    type: 'MemberExpression',
    object: obj,
    property: prop,
    computed: false,
    optional: false
  });
};

const setObjProp = (obj, prop, value) => {
  if (typeof obj === 'string') obj = {
    type: 'Identifier',
    name: obj
  };

  if (typeof prop === 'string') prop = {
    type: 'Identifier',
    name: prop
  };

  return objectHack({
    type: 'AssignmentExpression',
    operator: '=',
    left: {
      type: 'MemberExpression',
      object: obj,
      property: prop,
      computed: false,
      optional: false
    },
    right: value
  });
};

const aliasPrimObjsBC = bc => {
  const add = (x, y) => {
    if (bc[x] == null) return;

    // intentionally duplicate to avoid extra bc for prim objs as rarely used
    bc[y] = bc[x];
  };

  add(TYPES.boolean, TYPES.booleanobject);
  add(TYPES.number, TYPES.numberobject);
  add(TYPES.string, TYPES.stringobject);
};

const typeIsIterable = wasm => [
  // array, set, map, string, bytestring, generator
  ...typeIsOneOf(wasm, [ TYPES.array, TYPES.set, TYPES.map, TYPES.string, TYPES.bytestring, TYPES.__porffor_generator ]),
  // typed array
  ...wasm,
  number(TYPES.uint8array, Valtype.i32),
  [ Opcodes.i32_ge_s ],
  ...wasm,
  number(TYPES.float64array, Valtype.i32),
  [ Opcodes.i32_le_s ],
  [ Opcodes.i32_and ],
  [ Opcodes.i32_or ],
  [ Opcodes.i32_eqz ],
];

const createThisArg = (scope, decl) => {
  const name = decl.callee?.name;
  if (decl._new) {
    // if precompiling or builtin func, just make it null as unused
    if (!decl._forceCreateThis && (globalThis.precompile || Object.hasOwn(builtinFuncs, name))) return [
      number(NULL),
      number(TYPES.object, Valtype.i32)
    ];

    // create new object with prototype set to callee prototype
    const tmp = localTmp(scope, '#this_create_tmp');
    const proto = getObjProp(decl.callee, 'prototype');

    return [
      [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocate').index ],
      Opcodes.i32_from_u,
      [ Opcodes.local_tee, tmp ],
      Opcodes.i32_to_u,
      number(TYPES.object, Valtype.i32),

      ...generate(scope, proto),
      Opcodes.i32_to_u,
      ...getNodeType(scope, proto),

      [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_setPrototype').index ],

      [ Opcodes.local_get, tmp ],
      number(TYPES.object, Valtype.i32)
    ];
  } else {
    if (name && name.startsWith('__')) {
      let node = null;

      if (name.includes('_prototype_')) {
        node = {
          type: 'NewExpression',
          callee: {
            type: 'Identifier',
            name: name.slice(2, name.indexOf('_', 2))
          },
          arguments: [],
          _new: true
        };
      } else {
        node = {
          type: 'Identifier',
          name: name.slice(2, name.lastIndexOf('_'))
        };

        if (ifIdentifierErrors(scope, node)) node = null;
      }

      if (node) return [
        ...generate(scope, node),
        ...getNodeType(scope, node)
      ];
    }

    // undefined do not generate globalThis now,
    // do it dynamically in generateThis in the func later
    // (or not for strict mode)
    return [
      number(UNDEFINED),
      number(TYPES.undefined, Valtype.i32)
    ];
  }
};

const isEmptyNode = x => x && (x.type === 'EmptyStatement' || (x.type === 'BlockStatement' && x.body.length === 0));
const getLastNode = body => {
  let offset = 1, node = body[body.length - offset];
  while (isEmptyNode(node)) node = body[body.length - ++offset];

  return node ?? { type: 'EmptyStatement' };
};

const generateCall = (scope, decl, _global, _name, unusedValue = false) => {
  if (decl.type === 'NewExpression') decl._new = true;

  let out = [];
  let name = decl.callee.name;

  // opt: virtualize iifes
  if (isFuncType(decl.callee.type)) {
    const [ func ] = generateFunc(scope, decl.callee, true);
    name = func.name;
  }

  if (!decl._new && (name === 'eval' || (decl.callee.type === 'SequenceExpression' && decl.callee.expressions.at(-1)?.name === 'eval'))) {
    const known = knownValue(scope, decl.arguments[0]);
    if (known !== unknownValue) {
      // eval('with known/literal string')
      const code = String(known);

      let parsed;
      try {
        parsed = {
          type: 'BlockStatement',
          body: parse(code).body.map(objectHack)
        };
      } catch (e) {
        if (e.name === 'SyntaxError') {
          // throw syntax errors of evals at runtime instead
          return internalThrow(scope, 'SyntaxError', e.message, true);
        }

        throw e;
      }

      if (decl.callee.type === 'SequenceExpression' || decl.optional) {
        // indirect, use separate func+scope
        const [ func ] = generateFunc({}, {
          type: 'ArrowFunctionExpression',
          body: parsed,
          expression: true
        }, true);

        func.generate();

        return [
          [ Opcodes.call, func.index ],
          ...setLastType(scope)
        ];
      }

      scope.inEval = true;
      const out = generate(scope, parsed);
      scope.inEval = false;

      out.push(...setLastType(scope, getNodeType(scope, getLastNode(parsed.body))));
      return out;
    }
  }

  if (name === 'Function') {
    const knowns = decl.arguments.map(x => knownValue(scope, x));
    if (knowns.every(x => x !== unknownValue)) {
      // new Function('with known/literal strings')
      const code = String(knowns[knowns.length - 1]);
      const args = knowns.slice(0, -1).map(x => String(x));

      let parsed;
      try {
        parsed = objectHack(parse(`(function(${args.join(',')}){${code}})`));
      } catch (e) {
        if (e.name === 'SyntaxError') {
          // throw syntax errors of evals at runtime instead
          return internalThrow(scope, 'SyntaxError', e.message, true);
        }

        throw e;
      }

      return [
        ...generate(scope, parsed.body[0].expression),
        ...setLastType(scope, TYPES.function)
      ];
    }
  }

  let protoName, target;
  // ident.func()
  if (!decl._new && name && name.startsWith('__')) {
    const spl = name.slice(2).split('_');

    protoName = spl[spl.length - 1];

    target = { ...decl.callee };
    target.name = spl.slice(0, -1).join('_');

    if (builtinFuncs['__' + target.name + '_' + protoName]) protoName = null;
      else if (lookupName(scope, target.name)[0] == null && !builtinFuncs[target.name]) {
        if (lookupName(scope, '__' + target.name)[0] != null || builtinFuncs['__' + target.name]) target.name = '__' + target.name;
          else protoName = null;
      }
  }

  // literal.func()
  if (!decl._new && !name && (decl.callee.type === 'MemberExpression' || decl.callee.type === 'ChainExpression')) {
    const prop = (decl.callee.expression ?? decl.callee).property;
    const object = (decl.callee.expression ?? decl.callee).object;

    // megahack for /regex/.func()
    if (object?.regex && ['test'].includes(prop.name)) {
      const regex = object.regex.pattern;
      const rhemynName = `regex_${prop.name}_${sanitize(regex)}`;

      if (!funcIndex[rhemynName]) {
        const func = Rhemyn[prop.name](regex, currentFuncIndex++, rhemynName);
        func.internal = true;

        funcIndex[func.name] = func.index;
        funcs.push(func);
      }

      const arg = decl.arguments[0] ?? DEFAULT_VALUE();
      const idx = funcIndex[rhemynName];
      return [
        // make string arg
        ...generate(scope, arg),
        Opcodes.i32_to_u,
        ...getNodeType(scope, arg),

        // call regex func
        [ Opcodes.call, idx ],
        Opcodes.i32_from_u,

        ...setLastType(scope, Rhemyn.types[prop.name])
      ];
    }

    protoName = prop?.name;
    target = object;
  }

  if (protoName && target) {
    if (protoName === 'call') {
      const valTmp = localTmp(scope, '#call_val');
      const typeTmp = localTmp(scope, '#call_type', Valtype.i32);

      return generate(scope, {
        type: 'CallExpression',
        callee: target,
        arguments: decl.arguments.slice(1),
        optional: decl.optional,
        _thisWasm: [
          ...generate(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
          [ Opcodes.local_tee, valTmp ],
          ...getNodeType(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
          [ Opcodes.local_tee, typeTmp ],

          // check not undefined or null if not in precompile
          // todo: technically this should be allowed sometimes but for now, never
          ...(globalThis.precompile ? [] : [
            ...nullish(scope,
              [ [ Opcodes.local_get, valTmp ] ],
              [ [ Opcodes.local_get, typeTmp ] ],
              false, true),
            [ Opcodes.if, Blocktype.void ],
            ...internalThrow(scope, 'TypeError', `Cannot use undefined or null as 'this'`),
            [ Opcodes.end ]
          ])
        ],
        _thisWasmComponents: {
          _callValue: [
            ...generate(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
            [ Opcodes.local_tee, valTmp ],
            ...getNodeType(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
            [ Opcodes.local_set, typeTmp ],

            // check not undefined or null if not in precompile
            // todo: technically this should be allowed sometimes but for now, never
            ...(globalThis.precompile ? [] : [
              ...nullish(scope,
                [ [ Opcodes.local_get, valTmp ] ],
                [ [ Opcodes.local_get, typeTmp ] ],
                false, true),
              [ Opcodes.if, Blocktype.void ],
              ...internalThrow(scope, 'TypeError', `Cannot use undefined or null as 'this'`),
              [ Opcodes.end ]
            ])
          ],
          _callType: [ [ Opcodes.local_get, typeTmp ] ]
        }
      });
    }

    if (['search'].includes(protoName)) {
      const regex = decl.arguments[0]?.regex?.pattern;
      if (!regex) return [
        // no/bad regex arg, return -1/0 for now
        ...generate(scope, target),
        [ Opcodes.drop ],

        number(Rhemyn.types[protoName] === TYPES.number ? -1 : 0),
        ...setLastType(scope, Rhemyn.types[protoName])
      ];

      const rhemynName = `regex_${protoName}_${sanitize(regex)}`;

      if (!funcIndex[rhemynName]) {
        const func = Rhemyn[protoName](regex, currentFuncIndex++, rhemynName);
        func.internal = true;

        funcIndex[func.name] = func.index;
        funcs.push(func);
      }

      const idx = funcIndex[rhemynName];
      return [
        // make string arg
        ...generate(scope, target),
        Opcodes.i32_to_u,
        ...getNodeType(scope, target),

        // call regex func
        [ Opcodes.call, idx ],
        Opcodes.i32_from,

        ...setLastType(scope, Rhemyn.types[protoName])
      ];
    }

    const protoBC = {};
    const builtinProtoCands = Object.keys(builtinFuncs).filter(x => x.startsWith('__') && x.endsWith('_prototype_' + protoName));

    if (!decl._protoInternalCall && builtinProtoCands.length > 0) {
      out.push(
        ...generate(scope, target),
        [ Opcodes.local_set, localTmp(scope, '#proto_target') ],

        ...getNodeType(scope, target),
        [ Opcodes.local_set, localTmp(scope, '#proto_target#type', Valtype.i32) ],
      );

      if (decl._thisWasm) {
        // after to still generate original target
        out.push(
          ...decl._thisWasm,
          [ Opcodes.local_set, localTmp(scope, '#proto_target#type', Valtype.i32) ],
          [ Opcodes.local_set, localTmp(scope, '#proto_target') ]
        );
      }

      for (const x of builtinProtoCands) {
        const name = x.split('_prototype_')[0].toLowerCase();
        const type = TYPES[name.slice(2)] ?? TYPES[name];
        if (type == null) continue;

        protoBC[type] = () => generate(scope, {
          type: 'CallExpression',
          optional: decl.optional,
          callee: {
            type: 'Identifier',
            name: x
          },
          arguments: [
            {
              type: 'Identifier',
              name: '#proto_target'
            },

            ...decl.arguments
          ],
          _protoInternalCall: true
        });
      }
    }

    const protoCands = Object.keys(prototypeFuncs).reduce((acc, x) => {
      if (Object.hasOwn(prototypeFuncs[x], protoName)) acc[x] = prototypeFuncs[x][protoName];
      return acc;
    }, {});

    if (Object.keys(protoCands).length > 0) {
      // use local for cached i32 length as commonly used
      const lengthLocal = localTmp(scope, '__proto_length_cache', Valtype.i32);
      const pointerLocal = localTmp(scope, '__proto_pointer_cache', Valtype.i32);

      // TODO: long-term, prototypes should be their individual separate funcs

      const rawPointer = [
        ...generate(scope, target),
        Opcodes.i32_to_u
      ];

      const usePointerCache = !Object.values(protoCands).every(x => x.noPointerCache === true);
      const getPointer = usePointerCache ? [ [ Opcodes.local_get, pointerLocal ] ] : rawPointer;

      const useLengthCache = true; // basically every prototype uses it
      for (const x in protoCands) {
        const protoFunc = protoCands[x];
        if (protoFunc.noArgRetLength && decl.arguments.length === 0) {
          protoBC[x] = [
            ...ArrayUtil.getLength(getPointer),
            ...setLastType(scope, TYPES.number)
          ];
          continue;
        }

        protoBC[x] = () => {
          const protoLocal = protoFunc.local ? localTmp(scope, `__${protoName}_tmp`, protoFunc.local) : -1;
          const protoLocal2 = protoFunc.local2 ? localTmp(scope, `__${protoName}_tmp2`, protoFunc.local2) : -1;

          let optUnused = false;
          const protoOut = protoFunc({
            pointer: getPointer,
            length: {
              getCachedI32: () => [ [ Opcodes.local_get, lengthLocal ] ],
              setCachedI32: () => [ [ Opcodes.local_set, lengthLocal ] ],
              get: () => ArrayUtil.getLength(getPointer),
              getI32: () => ArrayUtil.getLengthI32(getPointer),
              set: value => ArrayUtil.setLength(getPointer, value),
              setI32: value => ArrayUtil.setLengthI32(getPointer, value)
            },
            arg: generate(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
            argType: getNodeType(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
            iTmp: protoLocal,
            iTmp2: protoLocal2,
            alloc: bytes => [
              number(bytes, Valtype.i32),
              [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocateBytes').index ]
            ],
            unusedValue: () => {
              optUnused = true;
              return unusedValue;
            },
            setType: type => setLastType(scope, type)
          });

          return [
            [ Opcodes.block, unusedValue ? Blocktype.void : valtypeBinary ],
              ...protoOut,
              ...(unusedValue && !optUnused ? [ [ Opcodes.drop ] ] : []),
            [ Opcodes.end ]
          ];
        };
      }

      // alias primitive prototype with primitive object types
      aliasPrimObjsBC(protoBC);

      return [
        ...(usePointerCache ? [
          ...rawPointer,
          [ Opcodes.local_set, pointerLocal ],
        ] : []),

        ...(useLengthCache ? [
          ...ArrayUtil.getLengthI32(getPointer),
          [ Opcodes.local_set, lengthLocal ],
        ] : []),

        ...typeSwitch(scope, getNodeType(scope, target), {
          ...protoBC,

          // TODO: error better
          default: decl.optional ? withType(scope, [ number(UNDEFINED) ], TYPES.undefined)
            : internalThrow(scope, 'TypeError', `'${protoName}' proto func tried to be called on a type without an impl`, !unusedValue)
        }, unusedValue ? Blocktype.void : valtypeBinary),
        ...(unusedValue ? [ number(UNDEFINED) ] : [])
      ];
    }

    if (Object.keys(protoBC).length > 0) {
      protoBC.default = decl.optional ?
        withType(scope, [ number(UNDEFINED) ], TYPES.undefined) :
        internalThrow(scope, 'TypeError', `'${protoName}' proto func tried to be called on a type without an impl`, true);

      // fallback to object prototype impl as a basic prototype chain hack
      if (protoBC[TYPES.object]) {
        protoBC[TYPES.undefined] = protoBC[TYPES.null] = protoBC.default;
        protoBC.default = protoBC[TYPES.object];
      }

      // alias primitive prototype with primitive object types
      aliasPrimObjsBC(protoBC);

      return [
        ...out,
        ...typeSwitch(scope, getNodeType(scope, target), protoBC, valtypeBinary)
      ];
    }
  }

  let args = decl.arguments.slice();
  if (args.at(-1)?.type === 'SpreadElement') {
    // hack: support spread element if last by doing essentially:
    // const foo = () => ...;
    // foo(a, b, ...c) -> _ = c; foo(a, b, _[0], _[1], ...)
    const arg = args.at(-1).argument;
    out.push(
      ...generate(scope, arg),
      [ Opcodes.local_set, localTmp(scope, '#spread') ],
      ...getNodeType(scope, arg),
      [ Opcodes.local_set, localTmp(scope, '#spread#type', Valtype.i32) ],

      ...typeIsIterable([ [ Opcodes.local_get, localTmp(scope, '#spread#type', Valtype.i32) ] ]),
      [ Opcodes.if, Blocktype.void ],
        ...internalThrow(scope, 'TypeError', 'Cannot spread a non-iterable'),
      [ Opcodes.end ]
    );

    args.pop();
    for (let i = 0; i < 8; i++) {
      args.push({
        type: 'MemberExpression',
        object: { type: 'Identifier', name: '#spread' },
        property: { type: 'Literal', value: i },
        computed: true,
        optional: false
      });
    }
  }

  let idx;
  if (Object.hasOwn(funcIndex, name)) {
    idx = funcIndex[name];
  } else if (scope.name === name) {
    // fallback for own func but with a different var/id name
    idx = scope.index;
  } else if (Object.hasOwn(importedFuncs, name)) {
    idx = importedFuncs[name];
    scope.usesImports = true;
  } else if (Object.hasOwn(builtinFuncs, name)) {
    if (builtinFuncs[name].floatOnly && valtype !== 'f64') throw new Error(`Cannot use built-in ${unhackName(name)} with integer valtype`);
    if (decl._new && !builtinFuncs[name].constr) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`, true);

    includeBuiltin(scope, name);
    idx = funcIndex[name];
  } else if (Object.hasOwn(internalConstrs, name)) {
    if (decl._new && internalConstrs[name].notConstr) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`, true);
    return internalConstrs[name].generate(scope, decl, _global, _name);
  } else if (!decl._new && name && name.startsWith('__Porffor_wasm_')) {
    const wasmOps = {
      // pointer, align, offset
      i32_load: { imms: 2, args: [ true ], returns: 1 },
      // pointer, value, align, offset
      i32_store: { imms: 2, args: [ true, true ], returns: 0, addValue: true },
      // pointer, align, offset
      i32_load8_u: { imms: 2, args: [ true ], returns: 1 },
      // pointer, value, align, offset
      i32_store8: { imms: 2, args: [ true, true ], returns: 0, addValue: true },
      // pointer, align, offset
      i32_load16_u: { imms: 2, args: [ true ], returns: 1 },
      // pointer, value, align, offset
      i32_store16: { imms: 2, args: [ true, true ], returns: 0, addValue: true },

      // pointer, align, offset
      f64_load: { imms: 2, args: [ true ], returns: 0 }, // 0 due to not i32
      // pointer, value, align, offset
      f64_store: { imms: 2, args: [ true, false ], returns: 0, addValue: true },

      // value
      i32_const: { imms: 1, args: [], returns: 0 },

      // dst, src, size, _, _
      memory_copy: { imms: 2, args: [ true, true, true ], returns: 0, addValue: true },

      // a, b
      f64_eq: { imms: 0, args: [ false, false ], returns: 1 }
    };

    const opName = name.slice('__Porffor_wasm_'.length);

    if (wasmOps[opName]) {
      const op = wasmOps[opName];

      const argOut = [];
      for (let i = 0; i < op.args.length; i++) {
        if (!op.args[i]) globalThis.noi32F64CallConv = true;

        argOut.push(
          ...generate(scope, decl.arguments[i]),
          ...(op.args[i] ? [ Opcodes.i32_to ] : [])
        );

        globalThis.noi32F64CallConv = false;
      }

      // literals only
      const imms = decl.arguments.slice(op.args.length).map(x => x.value);

      let opcode = Opcodes[opName];
      if (!Array.isArray(opcode)) opcode = [ opcode ];

      return [
        ...argOut,
        [ ...opcode, ...imms ],
        ...(new Array(op.returns).fill(Opcodes.i32_from)),
        ...(op.addValue ? [ number(UNDEFINED) ] : [])
      ];
    }
  } else {
    if (!Prefs.indirectCalls) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`, true);

    funcs.table = true;
    scope.table = true;

    const wrapperArgc = Prefs.indirectWrapperArgc ?? 10;
    const underflow = wrapperArgc - args.length;
    for (let i = 0; i < underflow; i++) args.push(DEFAULT_VALUE());

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      out = out.concat(generate(scope, arg), valtypeBinary === Valtype.i32 && scope.locals[arg.name]?.type !== Valtype.f64 ? [ [ Opcodes.f64_convert_i32_s ] ] : [], getNodeType(scope, arg));
    }

    let knownThis = undefined, getCallee = undefined;

    const tmpName = '#indirect' + uniqId() + '_';
    const calleeLocal = localTmp(scope, tmpName + 'callee');

    // hack: this should be more thorough, Function.bind, etc
    if (!decl._new && (decl.callee.type === 'MemberExpression' || decl.callee.type === 'ChainExpression')) {
      const { property, object, computed, optional } = decl.callee.expression ?? decl.callee;
      if (object && property) {
        const thisLocal = localTmp(scope, tmpName + 'caller');
        const thisLocalType = localTmp(scope, tmpName + 'caller#type', Valtype.i32);

        knownThis = [
          [ Opcodes.local_get, thisLocal ],
          [ Opcodes.local_get, thisLocalType ]
        ];
        getCallee = [
          ...generate(scope, object),
          [ Opcodes.local_set, thisLocal ],
          ...getNodeType(scope, object),
          [ Opcodes.local_set, thisLocalType ],

          ...generate(scope, {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: tmpName + 'caller' },
            property,
            computed,
            optional
          })
        ];
      }
    }

    let callee = decl.callee, callAsNew = decl._new;
    if (callee.type === 'Super') {
      // call super constructor with direct super() call
      callee = getObjProp(callee, 'constructor');
      callAsNew = true;
      knownThis = [
        ...generate(scope, { type: 'ThisExpression' }),
        ...getNodeType(scope, { type: 'ThisExpression' })
      ];
    }

    const newTargetWasm = decl._newTargetWasm ?? createNewTarget(scope, decl, [
      [ Opcodes.local_get, calleeLocal ]
    ], callAsNew);
    const thisWasm = decl._thisWasm ?? knownThis ?? createThisArg(scope, decl);

    return [
      ...(getCallee ? getCallee : generate(scope, callee)),
      [ Opcodes.local_set, calleeLocal ],

      ...typeSwitch(scope, getNodeType(scope, callee), {
        [TYPES.function]: () => [
          ...forceDuoValtype(scope, newTargetWasm, Valtype.f64),
          ...forceDuoValtype(scope, thisWasm, Valtype.f64),
          ...out,

          [ Opcodes.local_get, calleeLocal ],
          Opcodes.i32_to_u,
          [ Opcodes.call_indirect, args.length + 2, 0 ],
          ...setLastType(scope)
        ],

        default: decl.optional ? withType(scope, [ number(UNDEFINED) ], TYPES.undefined)
          : internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`, Valtype.f64)
      }, Valtype.f64),
      ...(valtypeBinary === Valtype.i32 && scope.returns[0] !== Valtype.f64 ? [ [ Opcodes.f64_convert_i32_s ] ] : [])
    ];
  }

  const func = funcByIndex(idx);

  if (func && !decl._new) func.onlyNew = false;

  // generate func
  if (func) func.generate?.();

  const userFunc = func && !func.internal;
  const typedParams = userFunc || func?.typedParams;
  const typedReturns = func && func.returnType == null;
  let paramCount = countParams(func, name);

  let paramOffset = 0;
  if (decl._new && func && !func.constr) {
    return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`, true);
  }

  const internalProtoFunc = func && func.internal && func.name.includes('_prototype_');
  if (!globalThis.precompile && internalProtoFunc && !decl._protoInternalCall) {
    // just function called, not as prototype, add this to start
    args.unshift(decl._thisWasmComponents ?? decl._thisWasm ?? createThisArg(scope, decl));
  }

  if (func && func.constr) {
    out.push(...(decl._newTargetWasm ?? createNewTarget(scope, decl, idx - importedFuncs.length)));
    out.push(...(decl._thisWasm ?? createThisArg(scope, decl)));
    paramOffset += 4;
  }

  if (func && func.method) {
    out.push(...(decl._thisWasm ?? createThisArg(scope, decl)));
    paramOffset += 2;
  }

  if (func && args.length < paramCount) {
    // too little args, push undefineds
    const underflow = paramCount - (func.hasRestArgument ? 1 : 0) - args.length;
    for (let i = 0; i < underflow; i++) args.push(DEFAULT_VALUE());
  }

  if (func && func.hasRestArgument) {
    // hack: spread + rest special handling
    if (decl.arguments.at(-1)?.type === 'SpreadElement') {
      // just use the array being spread
      args = args.slice(0, args.length - 8);
      args.push(decl.arguments.at(-1).argument);
    } else {
      const restArgs = args.slice(paramCount - 1);
      args = args.slice(0, paramCount - 1);
      args.push({
        type: 'ArrayExpression',
        elements: restArgs
      });
    }
  }

  if (func && args.length > paramCount) {
    // too many args, slice extras off
    args = args.slice(0, paramCount);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (Array.isArray(arg)) {
      // if wasm, just append it
      out = out.concat(arg);

      if (valtypeBinary !== Valtype.i32 &&
        (func && func.params[paramOffset + i * (typedParams ? 2 : 1)] === Valtype.i32)
      ) {
        out.push(...forceDuoValtype(scope, [], Valtype.i32));
      }

      continue;
    }

    out = out.concat(arg._callValue ?? generate(scope, arg));

    // todo: this should be used instead of the too many args thing above (by removing that)
    if (i >= paramCount) {
      // over param count of func, drop arg
      out.push([ Opcodes.drop ]);
      continue;
    }

    const argType = func ? func.params[paramOffset + i * (typedParams ? 2 : 1)] : valtypeBinary;
    const localType = scope.locals[arg.name]?.type;
    if ((valtypeBinary !== argType && localType !== argType) || (localType && localType !== argType && valtypeBinary !== Valtype.f64)) {
      out.push(argType === Valtype.i32 ? Opcodes.i32_trunc_sat_f64_s : [ Opcodes.f64_convert_i32_s ]);
    }

    if (typedParams) out = out.concat(arg._callType ?? getNodeType(scope, arg));
  }

  out.push([ Opcodes.call, idx ]);
  if (typedReturns) out.push(...setLastType(scope));

  if (
    func?.returns?.length === 0 ||
    (idx === importedFuncs[name] && importedFuncs[importedFuncs[name]]?.returns === 0)
  ) {
    out.push(number(UNDEFINED));
  }

  if (func?.returns?.[0] === Valtype.i32 && valtypeBinary !== Valtype.i32) {
    out.push(Opcodes.i32_from);
  }

  if (func?.returns?.[0] === Valtype.f64 && valtypeBinary === Valtype.i32 && !globalThis.noi32F64CallConv) {
    out.push(Opcodes.i32_trunc_sat_f64_s);
  }

  return out;
};

const generateThis = (scope, decl) => {
  if (scope.overrideThis) return scope.overrideThis;

  if (!scope.constr && !scope.method) {
    // this in a non-constructor context is a reference to globalThis
    return [
      ...generate(scope, { type: 'Identifier', name: 'globalThis' })
    ];
  }

  // opt: do not check for pure constructors or strict mode
  if ((!globalThis.precompile && scope.strict) || scope._onlyConstr || scope._onlyThisMethod || decl._noGlobalThis) return [
    [ Opcodes.local_get, scope.locals['#this'].idx ]
  ];

  return [
    // default this to globalThis unless only new func
    [ null, () => {
      if (scope.onlyNew !== false && !scope.referenced) return [];

      return [
        [ Opcodes.local_get, scope.locals['#this#type'].idx ],
        number(TYPES.undefined, Valtype.i32),
        [ Opcodes.i32_eq ],
        [ Opcodes.if, Blocktype.void ],
          ...generate(scope, { type: 'Identifier', name: 'globalThis' }),
          [ Opcodes.local_set, scope.locals['#this'].idx ],
          ...getType(scope, 'globalThis'),
          [ Opcodes.local_set, scope.locals['#this#type'].idx ],
        [ Opcodes.end ]
      ];
    } ],

    [ Opcodes.local_get, scope.locals['#this'].idx ]
  ];
};

const generateSuper = (scope, decl) => generate(scope, {
  type: 'CallExpression',
  callee: { type: 'Identifier', name: '__Porffor_object_getPrototype' },
  arguments: [
    {
      type: 'CallExpression',
      callee: { type: 'Identifier', name: '__Porffor_object_getPrototype' },
      arguments: [
        { type: 'ThisExpression', _noGlobalThis: true }
      ]
    }
  ]
});

// bad hack for undefined and null working without additional logic
const DEFAULT_VALUE = () => ({
  type: 'Identifier',
  name: 'undefined'
});

const codeToSanitizedStr = code => {
  let out = '';
  while (code > 0) {
    out += String.fromCharCode(97 + code % 26);
    code -= 26;
  }
  return out;
};
const sanitize = str => str.replace(/[^0-9a-zA-Z_]/g, _ => codeToSanitizedStr(_.charCodeAt(0)));

const unhackName = name => {
  if (!name) return name;

  if (name.startsWith('__')) return name.slice(2).replaceAll('_', '.');
  return name;
};

const knownType = (scope, type) => {
  if (typeof type === 'number') return type;

  if (type.length === 1 && type[0][0] === Opcodes.i32_const) {
    return read_signedLEB128(type[0].slice(1));
  }

  if (typedInput && type.length === 1 && type[0][0] === Opcodes.local_get) {
    const idx = type[0][1];

    // type idx = var idx + 1
    const name = Object.values(scope.locals).find(x => x.idx === idx)?.name;
    if (scope.locals[name]?.metadata?.type != null) return scope.locals[name].metadata.type;
  }

  return null;
};
const knownTypeWithGuess = (scope, type) => {
  let known = knownType(scope, type);
  if (known != null) return known;

  if (type.guess != null) return knownType(scope, type.guess);
  return known;
};

const unknownValue = Symbol('Porffor.unknownValue');
const knownValue = (scope, node) => {
  if (!node) return undefined;

  // very limited and rarely used for now
  if (node.type === 'Literal') {
    return node.value;
  }

  if (node.type === 'BinaryExpression') {
    const left = knownValue(scope, node.left);
    if (left === unknownValue) return unknownValue;

    const right = knownValue(scope, node.right);
    if (right === unknownValue) return unknownValue;

    switch (node.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '==': return left == right;
      case '===': return left === right;
      case '!=': return left != right;
      case '!==': return left !== right;
    }
  }

  return unknownValue;
};

const brTable = (input, bc, returns) => {
  const out = [];
  const keys = Object.keys(bc);
  const count = keys.length;

  if (count === 1) {
    // return [
    //   ...input,
    //   ...bc[keys[0]]
    // ];
    return bc[keys[0]];
  }

  if (count === 2) {
    // just use if else
    const other = keys.find(x => x !== 'default');
    return [
      ...input,
      number(other, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.if, returns ],
      ...bc[other],
      [ Opcodes.else ],
      ...bc.default,
      [ Opcodes.end ]
    ];
  }

  for (let i = 0; i < count; i++) {
    if (i === 0) out.push([ Opcodes.block, returns ]);
      else out.push([ Opcodes.block, Blocktype.void ]);
  }

  const nums = keys.filter(x => +x >= 0);
  const offset = Math.min(...nums);
  const max = Math.max(...nums);

  const table = [];
  let br = 0;

  for (let i = offset; i <= max; i++) {
    // if branch for this num, go to that block
    if (bc[i]) {
      table.push(br++);
      continue;
    }

    // else default
    table.push(0);
  }

  out.push(
    [ Opcodes.block, Blocktype.void ],
    ...input,
    ...(offset > 0 ? [
      number(offset, Valtype.i32),
      [ Opcodes.i32_sub ]
    ] : []),
    [ Opcodes.br_table, ...encodeVector(table), 0 ]
  );

  // sort the wrong way and then reverse
  // so strings ('default') are at the start before any numbers
  const orderedBc = keys.sort((a, b) => b - a).reverse();

  br = count - 1;
  for (const x of orderedBc) {
    out.push(
      [ Opcodes.end ],
      ...bc[x],
      ...(br === 0 ? [] : [ [ Opcodes.br, br ] ])
    );
    br--;
  }

  out.push([ Opcodes.end ]);

  return out;
};

const typeUsed = (scope, x) => {
  if (x == null) return;
  usedTypes.add(x);

  scope.usedTypes ??= new Set();
  scope.usedTypes.add(x);
};

const typeSwitch = (scope, type, bc, returns = valtypeBinary, fallthrough = false) => {
  if (typeof bc === 'function') bc = bc();

  let def;
  if (!Array.isArray(bc)) {
    def = bc.default;
    bc = Object.entries(bc);

    // turn keys back into numbers from keys
    for (const x of bc) {
      const k = x[0];
      if (k === 'default') continue;
      x[0] = +k;
    }
  }

  const known = knownType(scope, type);
  if (known != null) {
    for (const [ type, wasm ] of bc) {
      if (type === 'default') {
        def = wasm;
        continue;
      }

      if (type === known || (Array.isArray(type) && type.includes(known))) {
        return typeof wasm === 'function' ? wasm() : wasm;
      }
    }

    return typeof def === 'function' ? def() : def;
  }

  if (Prefs.typeswitchBrtable) {
    if (fallthrough) throw new Error(`Fallthrough is not currently supported with --typeswitch-brtable`);
    return brTable(type, bc, returns);
  }

  const tmp = localTmp(scope, `#typeswitch_tmp${++typeswitchDepth}${Prefs.typeswitchUniqueTmp ? uniqId() : ''}`, Valtype.i32);
  let out = [
    ...type,
    [ Opcodes.local_set, tmp ],
    [ Opcodes.block, returns ]
  ];
  // typeswitch via switch doesn't require an additional depth frame
  if (depth.at(-1) !== 'switch_typeswitch') {
    depth.push('typeswitch');
  }

  for (let i = 0; i < bc.length; i++) {
    let [ types, wasm ] = bc[i];
    if (types === 'default') {
      def = typeof wasm === 'function' ? wasm() : wasm;
      continue;
    }
    if (!Array.isArray(types)) types = [ types ];

    const add = () => {
      // handle depth
      depth.push('if');
      if (typeof wasm === 'function') wasm = wasm();
      depth.pop();

      for (let j = 0; j < types.length; j++) {
        out.push(
          [ Opcodes.local_get, tmp ],
          number(types[j], Valtype.i32),
          [ Opcodes.i32_eq ]
        );

        if (j > 0) out.push([ Opcodes.i32_or ]);
      }

      out.push(
        [ Opcodes.if, Blocktype.void ],
          ...wasm,
          ...(fallthrough ? [] : [ [ Opcodes.br, 1 ] ]),
        [ Opcodes.end ]
      );
    };

    if (globalThis.precompile) {
      // just magic precompile things™
      out.push([ null, 'typeswitch case start', types ]);
      add();
      out.push([ null, 'typeswitch case end' ]);
    } else {
      if (types.some(x => usedTypes.has(x))) {
        // type already used, just add it now
        add();
      } else {
        // type not used, add callback
        const depthClone = [...depth];
        out.push([ null, () => {
          out = [];
          if (types.some(x => usedTypes.has(x))) {
            let oldDepth = depth;
            depth = depthClone;
            add();
            depth = oldDepth;
          }
          return out;
        } ]);
      }
    }
  }

  // default
  if (def) out.push(...def);
    else if (returns !== Blocktype.void) out.push(number(0, returns));

  out.push([ Opcodes.end ]);

  // todo: sometimes gets stuck?
  if (depth.at(-1) === 'typeswitch') {
    depth.pop();
  }

  typeswitchDepth--;

  return out;
};

const typeIsOneOf = (type, types, valtype = Valtype.i32) => {
  const out = [];

  for (let i = 0; i < types.length; i++) {
    out.push(...type, number(types[i], valtype), valtype === Valtype.f64 ? [ Opcodes.f64_eq ] : [ Opcodes.i32_eq ]);
    if (i !== 0) out.push([ Opcodes.i32_or ]);
  }

  return out;
};

const typeIsNotOneOf = (type, types, valtype = Valtype.i32) => {
  const out = [];

  for (let i = 0; i < types.length; i++) {
    out.push(...type, number(types[i], valtype), valtype === Valtype.f64 ? [ Opcodes.f64_ne ] : [ Opcodes.i32_ne ]);
    if (i !== 0) out.push([ Opcodes.i32_and ]);
  }

  return out;
};

const allocVar = (scope, name, global = false, type = true, redecl = false, i32 = false) => {
  const target = global ? globals : scope.locals;

  // already declared
  if (Object.hasOwn(target, name)) {
    if (redecl) {
      // force change old local name(s)
      target['#redecl_' + name + uniqId()] = target[name];
      if (type) target['#redecl_' + name + '#type' + uniqId()] = target[name + '#type'];
    } else {
      return target[name].idx;
    }
  }

  let idx = global ? globals['#ind']++ : scope.localInd++;
  target[name] = { idx, type: i32 ? Valtype.i32 : valtypeBinary };

  if (type) {
    let typeIdx = global ? globals['#ind']++ : scope.localInd++;
    target[name + '#type'] = { idx: typeIdx, type: Valtype.i32, name };
  }

  return idx;
};

const setVarMetadata = (scope, name, global = false, metadata = {}) => {
  const target = global ? globals : scope.locals;
  target[name].metadata = metadata;
};

const addVarMetadata = (scope, name, global = false, metadata = {}) => {
  const target = global ? globals : scope.locals;

  target[name].metadata ??= {};
  for (const x in metadata) {
    if (metadata[x] != null) target[name].metadata[x] = metadata[x];
  }
};

const typeAnnoToPorfType = x => {
  if (!x) return null;
  if (TYPES[x.toLowerCase()] != null) return TYPES[x.toLowerCase()];

  switch (x) {
    case 'i32':
    case 'i64':
    case 'f64':
      return TYPES.number;
  }

  return null;
};

const extractTypeAnnotation = decl => {
  let a = decl;
  while (a.typeAnnotation) a = a.typeAnnotation;

  let type = null, elementType = null;
  if (a.typeName) {
    type = a.typeName.name;
  } else if (a.type.endsWith('Keyword')) {
    type = a.type.slice(2, -7).toLowerCase();
    if (type === 'void') type = 'undefined';
  } else if (a.type === 'TSArrayType') {
    type = 'array';
    elementType = extractTypeAnnotation(a.elementType).type;
  }

  const typeName = type;
  type = typeAnnoToPorfType(type);

  return { type, typeName, elementType };
};

const setLocalWithType = (scope, name, isGlobal, decl, tee = false, overrideType = undefined) => {
  const local = isGlobal ? globals[name] : (scope.locals[name] ?? { idx: name });
  const out = Array.isArray(decl) ? decl : generate(scope, decl, isGlobal, name);

  // optimize away last type usage
  // todo: detect last type then i32 conversion op
  const lastOp = out.at(-1);
  if (lastOp[0] === Opcodes.local_set && lastOp[1] === scope.locals['#last_type']?.idx) {
    // set last type -> tee last type
    lastOp[0] = Opcodes.local_tee;

    // still set last type due to side effects or type of decl gotten later
    const setOut = setType(scope, name, []);
    out.push(
      // drop if setType is empty
      ...(setOut.length === 0 ? [ [ Opcodes.drop ] ] : setOut),

      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],
      ...(tee ? [ [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ] ] : [])
    );
  } else {
    out.push(
      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],
      ...(tee ? [ [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ] ] : []),

      ...setType(scope, name, overrideType ?? getNodeType(scope, decl))
    );
  }

  return out;
};

const setDefaultFuncName = (decl, name) => {
  if (decl.id) return;

  if (decl.type === 'ClassExpression') {
    // check if it has a name definition
    for (const x of decl.body.body) {
      if (x.static && x.key.name === 'name') return;
    }
  }

  decl.id = { name };
};

const generateVarDstr = (scope, kind, pattern, init, defaultValue, global) => {
  // statically analyzed ffi dlopen hack to let 2c handle it
  if (init && init.type === 'CallExpression' && init.callee.name === '__Porffor_dlopen') {
    if (Prefs.target !== 'native' && !Prefs.native) throw new Error('Porffor.dlopen is only supported for native target (use --native)');

    // disable pgo if using ffi (lol)
    Prefs.pgo = false;

    try {
      let usedNames = [];
      for (const x of pattern.properties) {
        const name = x.key.name;
        usedNames.push(name);
      }

      let path = init.arguments[0].value;
      let symbols = {};

      for (const x of init.arguments[1].properties) {
        const name = x.key.name || x.key.value;
        if (!usedNames.includes(name)) continue;

        let parameters, result;
        for (const y of x.value.properties) {
          switch (y.key.name || y.key.value) {
            case 'parameters':
              parameters = y.value.elements.map(z => z.value);
              break;

            case 'result':
              result = y.value.value;
              break;
          }
        }

        symbols[name] = { parameters, result };

        // mock ffi function
        asmFunc(name, {
          wasm: [],
          params: parameters.map(x => Valtype.i32),
          returns: result ? [ Valtype.i32 ] : [],
          returnType: TYPES.number
        })
      }

      return [ [ null, 'dlopen', path, symbols ] ];
    } catch (e) {
      console.error('bad Porffor.dlopen syntax');
      throw e;
    }
  }

  if (typeof pattern === 'string') {
    pattern = { type: 'Identifier', name: pattern };
  }

  // todo: handle globalThis.foo = ...

  const topLevel = scope.name === '#main';
  if (pattern.type === 'Identifier') {
    const name = pattern.name;

    hoist(scope, name, kind === 'var' ? 1 : 2, global);

    if (init && isFuncType(init.type)) {
      // opt: make decl with func expression like declaration
      setDefaultFuncName(init, name);
      const [ _func, out ] = generateFunc(scope, init, true);

      const funcName = init.id?.name;
      if (name !== funcName && funcIndex[funcName]) {
        funcIndex[name] = funcIndex[funcName];
        delete funcIndex[funcName];
      }

      out.push([ Opcodes.drop ]);
      return out;
    }

    if (defaultValue && isFuncType(defaultValue.type)) {
      // set id as name, but do not use it as it is only default value
      setDefaultFuncName(defaultValue, name);
    }

    let out = [];
    if (topLevel && Object.hasOwn(builtinVars, name)) {
      // cannot redeclare
      if (kind !== 'var') return internalThrow(scope, 'SyntaxError', `Identifier '${unhackName(name)}' has already been declared`);

      return out; // always ignore
    }

    // // generate init before allocating var
    // let generated;
    // if (init) generated = generate(scope, init, global, name);

    const typed = typedInput && pattern.typeAnnotation && extractTypeAnnotation(pattern);
    let idx = allocVar(scope, name, global, !(typed && typed.type != null));

    const metadata = { kind };
    setVarMetadata(scope, name, global, metadata);
    if (typed) Object.assign(metadata, typed);

    if (init) {
      const alreadyArray = scope.arrays?.get(name) != null;

      let newOut = generate(scope, init, global, name);
      if (!alreadyArray && scope.arrays?.get(name) != null) {
        // hack to set local as pointer before
        newOut.unshift(number(scope.arrays.get(name)), [ global ? Opcodes.global_set : Opcodes.local_set, idx ]);
        if (newOut.at(-1) == Opcodes.i32_from_u) newOut.pop();
        newOut.push(
          [ Opcodes.drop ],
          ...setType(scope, name, getNodeType(scope, init))
        );
      } else {
        newOut = setLocalWithType(scope, name, global, newOut, false, getNodeType(scope, init));
      }

      out = out.concat(newOut);

      if (defaultValue) {
        out.push(
          ...typeIsOneOf(getType(scope, name), [ TYPES.undefined, TYPES.empty ]),
          [ Opcodes.if, Blocktype.void ],
            ...generate(scope, defaultValue, global, name),
            [ global ? Opcodes.global_set : Opcodes.local_set, idx ],
            ...setType(scope, name, getNodeType(scope, defaultValue), true),
          [ Opcodes.end ],
        );
      }

      if (globalThis.precompile && global) {
        scope.globalInits ??= {};
        scope.globalInits[name] = newOut;
      }
    } else {
      setInferred(scope, name, null, global);
    }

    return out;
  }

  if (pattern.type === 'ArrayPattern') {
    const decls = [];
    const tmpName = '#destructure' + uniqId();
    let out = generateVarDstr(scope, 'const', tmpName, init, defaultValue, false);

    let i = 0;
    const elements = pattern.elements.slice();
    for (const e of elements) {
      if (!e) {
        i++;
        continue;
      }

      if (e.type === 'RestElement') { // let [ ...foo ] = []
        if (e.argument.type === 'ArrayPattern') {
          // let [ ...[a, b, c] ] = []
          elements.push(...e.argument.elements);
        } else {
          decls.push(
            ...generateVarDstr(scope, kind, e.argument, {
              type: 'CallExpression',
              callee: {
                type: 'Identifier',
                name: '__Array_prototype_slice'
              },
              arguments: [
                { type: 'Identifier', name: tmpName },
                { type: 'Literal', value: i }
              ],
              _protoInternalCall: true
            }, undefined, global)
          );
        }

        continue; // skip i++
      } else if (e.type === 'AssignmentPattern') { // let [ foo = defaultValue ] = []
        decls.push(
          ...generateVarDstr(scope, kind, e.left, {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: tmpName },
            property: { type: 'Literal', value: i },
            computed: true
          }, e.right, global)
        );
      } else {
        // let [ [ foo, bar ] ] = [ [ 2, 4 ] ]
        // let [ foo ] = []
        // let [ { foo } ] = [ { foo: true } ]
        // etc

        decls.push(
          ...generateVarDstr(scope, kind, e, {
            type: 'MemberExpression',
            object: { type: 'Identifier', name: tmpName },
            property: { type: 'Literal', value: i },
            computed: true
          }, undefined, global)
        );
      }

      i++;
    }

    out = out.concat([
      // check tmp is iterable
      ...typeIsIterable(getType(scope, tmpName)),
      [ Opcodes.if, Blocktype.void ],
        ...internalThrow(scope, 'TypeError', 'Cannot array destructure a non-iterable'),
      [ Opcodes.end ],
    ], decls);

    return out;
  }

  if (pattern.type === 'ObjectPattern') {
    const decls = [];
    const tmpName = '#destructure' + uniqId();
    let out = generateVarDstr(scope, 'const', tmpName, init, defaultValue, false);

    const properties = pattern.properties.slice();
    const usedProps = [];
    for (const prop of properties) {
      if (prop.type == 'Property') { // let { foo } = {}
        usedProps.push(getProperty(prop));

        const memberComputed = prop.computed || prop.key.type === 'Literal';
        if (prop.value.type === 'AssignmentPattern') { // let { foo = defaultValue } = {}
          decls.push(
            ...generateVarDstr(scope, kind, prop.value.left, {
              type: 'MemberExpression',
              object: { type: 'Identifier', name: tmpName },
              property: prop.key,
              computed: memberComputed
            }, prop.value.right, global)
          );
        } else {
          decls.push(
            ...generateVarDstr(scope, kind, prop.value, {
              type: 'MemberExpression',
              object: { type: 'Identifier', name: tmpName },
              property: prop.key,
              computed: memberComputed
            }, undefined, global)
          );
        }
      } else if (prop.type === 'RestElement') { // let { ...foo } = {}
        decls.push(
          ...generateVarDstr(scope, kind, prop.argument, {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: '__Porffor_object_rest'
            },
            arguments: [
              { type: 'ObjectExpression', properties: [] },
              { type: 'Identifier', name: tmpName },
              ...usedProps
            ]
          }, undefined, global)
        );
      } else {
        return todo(scope, `${prop.type} is not supported in object patterns`);
      }
    }

    out = out.concat([
      // check tmp is valid object
      // not undefined or empty type
      ...typeIsOneOf(getType(scope, tmpName), [ TYPES.undefined, TYPES.empty ]),

      // not null
      ...getType(scope, tmpName),
      number(TYPES.object, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.local_get, scope.locals[tmpName].idx ],
      number(0),
      [ Opcodes.eq ],
      [ Opcodes.i32_and ],

      [ Opcodes.i32_or ],
      [ Opcodes.if, Blocktype.void ],
        ...internalThrow(scope, 'TypeError', 'Cannot object destructure undefined or null'),
      [ Opcodes.end ]
    ], decls);

    return out;
  }

  if (pattern.type === 'MemberExpression') return [
    ...generate(scope, {
      type: 'AssignmentExpression',
      operator: '=',
      left: pattern,
      right: !defaultValue ? init : {
        type: 'LogicalExpression',
        operator: '??',
        left: init,
        right: defaultValue
      }
    }),
    [ Opcodes.drop ]
  ];

  return todo(scope, `variable declarators of type ${pattern.type} are not supported yet`);
}

const generateVar = (scope, decl) => {
  let out = [];

  // global variable if in top scope (main) or if internally wanted
  const topLevel = scope.name === '#main';
  const global = decl._global ?? (topLevel || decl._bare);

  for (const x of decl.declarations) {
    out = out.concat(generateVarDstr(scope, decl.kind, x.id, x.init, undefined, global));
  }

  out.push(number(UNDEFINED));
  return out;
};

const privateIDName = name => '__#' + name;
const getProperty = (decl, forceValueStr = false) => {
  const prop = decl.property ?? decl.key;
  if (decl.computed) return prop;

  // identifier -> literal
  if (prop.name != null) return {
    type: 'Literal',
    value: prop.type === 'PrivateIdentifier' ? privateIDName(prop.name) : prop.name,
  };

  // force literal values to be string (eg 0 -> '0')
  if (forceValueStr && prop.value != null) return {
    ...prop,
    value: prop.value.toString()
  };

  return prop;
};

const isIdentAssignable = (scope, name, op = '=') => {
  // not in strict mode and op is =, so ignore
  if (!scope.strict && op === '=') return true;

  // local exists
  if (lookupName(scope, name)[0] != null) return true;

  // function with name exists and is not current function
  if (hasFuncWithName(name) && scope.name !== name) return true;

  return false;
};

const memberTmpNames = scope => {
  const id = uniqId();

  const objectTmpName = '#member_obj' + id;
  const objectTmp = localTmp(scope, objectTmpName);

  const propTmpName = '#member_prop' + id;
  const propertyTmp = localTmp(scope, propTmpName);

  return {
    objectTmpName, propTmpName,
    objectTmp, propertyTmp,
    objectGet: [ Opcodes.local_get, localTmp(scope, objectTmpName) ],
    propertyGet: [ Opcodes.local_get, localTmp(scope, propTmpName) ]
  };
};

// COCTC: cross-object compile-time cache
const coctcOffset = prop => {
  if (!Prefs.coctc) return 0;

  if (typeof prop === 'object') {
    if (
      prop.computed || prop.optional ||
      ['prototype', 'size', 'description', 'byteLength', 'byteOffset', 'buffer', 'detached', 'resizable', 'growable', 'maxByteLength', 'length', '__proto__'].includes(prop.property.name)
    ) return 0;

    prop = prop.property.name;
  }

  let offset = coctc.get(prop);
  if (offset == null) {
    offset = (coctc.lastOffset ?? Prefs.coctcOffset ?? 16300) - 9;
    if (offset < 0) return 0;

    coctc.lastOffset = offset;
    coctc.set(prop, offset);
  }

  return offset;
};
const coctcSetup = (scope, object, tmp, msg, wasm = generate(scope, object), wasmConv = true) => {
  const type = getNodeType(scope, object);
  const known = knownType(scope, type);

  return [
    ...wasm,
    ...(wasmConv ? [ Opcodes.i32_to ] : []),
    [ Opcodes.local_set, tmp ],

    ...(known === TYPES.object ? [] : [
      ...(known != null ? [] : [
        ...type,
        [ Opcodes.local_tee, localTmp(scope, '#coctc_type', Valtype.i32) ],
        number(TYPES.object, Valtype.i32),
        [ Opcodes.i32_ne ],
        [ Opcodes.if, Blocktype.void ],
      ]),

      [ Opcodes.local_get, tmp ],
      Opcodes.i32_from_u,
      ...(known != null ? type : [
        [ Opcodes.local_get, localTmp(scope, '#coctc_type', Valtype.i32) ]
      ]),

      [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_underlying').index ],
      [ Opcodes.drop ],

      [ Opcodes.local_set, tmp ],

      ...(known != null ? [] : [
        [ Opcodes.end ]
      ])
    ]),

    ...(msg == null ? [] : [
      [ Opcodes.local_get, tmp ],
      [ Opcodes.i32_eqz ],
      [ Opcodes.if, Blocktype.void ],
        ...internalThrow(scope, 'TypeError', `Cannot ${msg} property of nullish value`),
      [ Opcodes.end ]
    ])
  ];
};

const generateAssign = (scope, decl, _global, _name, valueUnused = false) => {
  const { type, name } = decl.left;
  const [ local, isGlobal ] = lookupName(scope, name);

  const op = decl.operator.slice(0, -1) || '=';

  // hack: .length setter
  if (type === 'MemberExpression' && decl.left.property.name === 'length' && !decl._internalAssign) {
    const newValueTmp = !valueUnused && localTmp(scope, '__length_setter_tmp');
    let pointerTmp = op !== '=' && localTmp(scope, '__member_setter_ptr_tmp', Valtype.i32);

    const out = [
      ...generate(scope, decl.left.object),
      Opcodes.i32_to_u
    ];

    const lengthTypeWasm = [
      ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
        [ Opcodes.local_get, pointerTmp ],
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        Opcodes.i32_from_u
      ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
      ...optional([ Opcodes.local_tee, newValueTmp ]),

      Opcodes.i32_to_u,
      [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ],

      ...optional([ Opcodes.local_get, newValueTmp ])
    ];

    const type = getNodeType(scope, decl.left.object);
    const known = knownType(scope, type);
    if (known != null && (known & TYPE_FLAGS.length) !== 0) return [
      ...out,
      ...optional([ Opcodes.local_tee, pointerTmp ]),

      ...lengthTypeWasm,
      ...optional(number(UNDEFINED), valueUnused)
    ];

    pointerTmp ||= localTmp(scope, '__member_setter_ptr_tmp', Valtype.i32);

    const slow = generate(scope, {
      ...decl,
      _internalAssign: true
    });
    if (valueUnused) slow.push([ Opcodes.drop ]);

    return [
      ...out,
      [ Opcodes.local_set, pointerTmp ],

      ...type,
      number(TYPE_FLAGS.length, Valtype.i32),
      [ Opcodes.i32_and ],
      [ Opcodes.if, valueUnused ? Blocktype.void : valtypeBinary ],
        [ Opcodes.local_get, pointerTmp ],
        ...lengthTypeWasm,
      [ Opcodes.else ],
        ...slow,
      [ Opcodes.end ],
      ...optional(number(UNDEFINED), valueUnused)
    ];
  }

  // arr[i]
  if (type === 'MemberExpression') {
    const object = decl.left.object;
    const newValueTmp = !valueUnused && localTmp(scope, '#member_setter_val_tmp');
    const pointerTmp = localTmp(scope, '#member_setter_ptr_tmp', Valtype.i32);
    const property = getProperty(decl.left);

    // todo/perf: use i32 object (and prop?) locals
    const { objectTmp, propertyTmp, objectGet, propertyGet } = memberTmpNames(scope);

    const useCoctc = coctcOffset(decl.left) > 0;
    if (useCoctc) valueUnused = false;

    // opt: do not mark prototype funcs as referenced to optimize this in them
    if (object?.property?.name === 'prototype' && isFuncType(decl.right.type)) decl.right._doNotMarkFuncRef = true;

    const out = [
      ...generate(scope, object),
      [ Opcodes.local_set, objectTmp ],

      ...generate(scope, property),
      [ Opcodes.local_set, propertyTmp ],

      // todo: review last type usage here
      ...typeSwitch(scope, getNodeType(scope, object), {
        ...(decl.left.computed ? {
          [TYPES.array]: () => [
            objectGet,
            Opcodes.i32_to_u,

            // get index as valtype
            propertyGet,
            Opcodes.i32_to_u,

            // turn into byte offset by * valtypeSize + 1
            number(ValtypeSize[valtype] + 1, Valtype.i32),
            [ Opcodes.i32_mul ],
            [ Opcodes.i32_add ],
            [ Opcodes.local_tee, pointerTmp ],

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.load, 0, ValtypeSize.i32 ]
            ], generate(scope, decl.right), [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 + ValtypeSize[valtype] ]
            ], getNodeType(scope, decl.right))),
            ...optional([ Opcodes.local_tee, newValueTmp ]),
            [ Opcodes.store, 0, ValtypeSize.i32 ],

            [ Opcodes.local_get, pointerTmp ],
            ...getNodeType(scope, decl),
            [ Opcodes.i32_store8, 0, ValtypeSize.i32 + ValtypeSize[valtype] ],

            ...optional([ Opcodes.local_get, newValueTmp ])
          ],

          ...wrapBC({
            [TYPES.uint8array]: () => [
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i32_load8_u, 0, 4 ],
                Opcodes.i32_from_u
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              Opcodes.i32_to_u,
              [ Opcodes.i32_store8, 0, 4 ]
            ],
            [TYPES.uint8clampedarray]: () => [
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i32_load8_u, 0, 4 ],
                Opcodes.i32_from_u
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              number(0),
              [ Opcodes.f64_max ],
              number(255),
              [ Opcodes.f64_min ],
              Opcodes.i32_to_u,
              [ Opcodes.i32_store8, 0, 4 ]
            ],
            [TYPES.int8array]: () => [
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i32_load8_s, 0, 4 ],
                Opcodes.i32_from
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              Opcodes.i32_to,
              [ Opcodes.i32_store8, 0, 4 ]
            ],
            [TYPES.uint16array]: () => [
              number(2, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i32_load16_u, 0, 4 ],
                Opcodes.i32_from_u
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              Opcodes.i32_to_u,
              [ Opcodes.i32_store16, 0, 4 ]
            ],
            [TYPES.int16array]: () => [
              number(2, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i32_load16_s, 0, 4 ],
                Opcodes.i32_from
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              Opcodes.i32_to,
              [ Opcodes.i32_store16, 0, 4 ]
            ],
            [TYPES.uint32array]: () => [
              number(4, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i32_load, 0, 4 ],
                Opcodes.i32_from_u
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              Opcodes.i32_to_u,
              [ Opcodes.i32_store, 0, 4 ]
            ],
            [TYPES.int32array]: () => [
              number(4, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i32_load, 0, 4 ],
                Opcodes.i32_from
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              Opcodes.i32_to,
              [ Opcodes.i32_store, 0, 4 ]
            ],
            [TYPES.float32array]: () => [
              number(4, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.f32_load, 0, 4 ],
                [ Opcodes.f64_promote_f32 ]
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              [ Opcodes.f32_demote_f64 ],
              [ Opcodes.f32_store, 0, 4 ]
            ],
            [TYPES.float64array]: () => [
              number(8, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.f64_load, 0, 4 ]
              ], generate(scope, decl.right), [ number(TYPES.number, Valtype.i32) ], getNodeType(scope, decl.right))),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              [ Opcodes.f64_store, 0, 4 ]
            ],
          }, {
            prelude: [
              objectGet,
              Opcodes.i32_to_u,
              [ Opcodes.i32_load, 0, 4 ],

              propertyGet,
              Opcodes.i32_to_u,
            ],
            postlude: [
              // setLastType(scope, TYPES.number)
              ...optional([ Opcodes.local_get, newValueTmp ])
            ]
          }),
        } : {}),

        [TYPES.undefined]: internalThrow(scope, 'TypeError', 'Cannot set property of undefined', !valueUnused),

        // default: internalThrow(scope, 'TypeError', `Cannot assign member with this type`)
        default: () => [
          objectGet,
          Opcodes.i32_to,
          ...(op === '=' ? [] : [ [ Opcodes.local_tee, localTmp(scope, '#objset_object', Valtype.i32) ] ]),
          ...getNodeType(scope, object),

          ...toPropertyKey(scope, [ propertyGet ], getNodeType(scope, property), decl.left.computed, op === '='),
          ...(op === '=' ? [] : [ [ Opcodes.local_set, localTmp(scope, '#objset_property_type', Valtype.i32) ] ]),
          ...(op === '=' ? [] : [
            Opcodes.i32_to_u,
            [ Opcodes.local_tee, localTmp(scope, '#objset_property', Valtype.i32) ]
          ]),
          ...(op === '=' ? [] : [ [ Opcodes.local_get, localTmp(scope, '#objset_property_type', Valtype.i32) ] ]),

          ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
            [ Opcodes.local_get, localTmp(scope, '#objset_object', Valtype.i32) ],
            ...getNodeType(scope, object),

            [ Opcodes.local_get, localTmp(scope, '#objset_property', Valtype.i32) ],
            [ Opcodes.local_get, localTmp(scope, '#objset_property_type', Valtype.i32) ],

            [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_get').index ],
            ...setLastType(scope)
          ], generate(scope, decl.right), getLastType(scope), getNodeType(scope, decl.right))),
          ...getNodeType(scope, decl),

          [ Opcodes.call, includeBuiltin(scope, scope.strict ? '__Porffor_object_setStrict' : '__Porffor_object_set').index ],
          [ Opcodes.drop ],
          ...(valueUnused ? [ [ Opcodes.drop ] ] : [])
          // ...setLastType(scope, getNodeType(scope, decl)),
        ]
      }, valueUnused ? Blocktype.void : valtypeBinary),
      ...optional(number(UNDEFINED), valueUnused)
    ];

    if (useCoctc) {
      // set COCTC
      const offset = coctcOffset(decl.left.property.name);
      const valueTmp = localTmp(scope, '#coctc_value');
      const objectTmp = localTmp(scope, '#coctc_object', Valtype.i32);

      out.push(
        [ Opcodes.local_tee, valueTmp ],
        ...coctcSetup(scope, object, objectTmp, null, [ objectGet ]),

        [ Opcodes.local_get, objectTmp ],
        [ Opcodes.local_get, valueTmp ],
        [ Opcodes.f64_store, 0, ...unsignedLEB128(offset) ],

        [ Opcodes.local_get, objectTmp ],
        ...getNodeType(scope, decl),
        [ Opcodes.i32_store8, 0, ...unsignedLEB128(offset + 8) ]
      );
    }

    return out;
  }

  if (local === undefined) {
    // only allow = for this, or if in strict mode always throw
    if (!isIdentAssignable(scope, name, op)) return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`, true);

    if (type !== 'Identifier') {
      const tmpName = '#rhs' + uniqId();
      return [
        ...generateVarDstr(scope, 'const', tmpName, decl.right, undefined, true),
        ...generateVarDstr(scope, 'var', decl.left, { type: 'Identifier', name: tmpName }, undefined, true),
        ...generate(scope, { type: 'Identifier', name: tmpName }),
        ...setLastType(scope, getNodeType(scope, decl.right))
      ];
    }

    if (Object.hasOwn(builtinVars, name)) {
      if (scope.strict) return internalThrow(scope, 'TypeError', `Cannot assign to non-writable global ${name}`, true);

      // just return rhs (eg `NaN = 2`)
      return generate(scope, decl.right);
    }

    // set global and return (eg a = 2)
    return [
      ...generateVarDstr(scope, 'var', name, decl.right, undefined, true),
      ...optional(generate(scope, decl.left), !valueUnused),
      ...optional(number(UNDEFINED), valueUnused)
    ];
  }

  // check not const
  if (local.metadata?.kind === 'const') return internalThrow(scope, 'TypeError', `Cannot assign to constant variable ${name}`, true);

  if (op === '=') {
    const out = setLocalWithType(scope, name, isGlobal, decl.right, !valueUnused);

    if (valueUnused) out.push(number(UNDEFINED));
    return out;
  }

  if (op === '||' || op === '&&' || op === '??') {
    // todo: is this needed?
    // for logical assignment ops, it is not left @= right ~= left = left @ right
    // instead, left @ (left = right)
    // eg, x &&= y ~= x && (x = y)

    setInferred(scope, name, knownType(scope, getNodeType(scope, decl)), isGlobal);

    return [
      ...performOp(scope, op, [
        [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ]
      ], [
        ...generate(scope, decl.right, isGlobal, name),
        [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],
        [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ]
      ], getType(scope, name), getNodeType(scope, decl.right)),

      ...setType(scope, name, getLastType(scope), true)
    ];
  }

  const out = setLocalWithType(
    scope, name, isGlobal,
    performOp(scope, op, [
      [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ]
    ], generate(scope, decl.right), getType(scope, name), getNodeType(scope, decl.right)),
    !valueUnused,
    getNodeType(scope, decl)
  );

  setInferred(scope, name, knownType(scope, getNodeType(scope, decl)), isGlobal);

  if (valueUnused) out.push(number(UNDEFINED));
  return out;
};

const ifIdentifierErrors = (scope, decl) => {
  if (decl.type === 'Identifier') {
    if (lookup(scope, decl.name, true) == null) return true;
  }

  return false;
};

const generateUnary = (scope, decl) => {
  const toNumeric = () => {
    // opt: skip if already known as number type
    generate(scope, decl.argument); // hack: fix last type not being defined for getNodeType before generation
    const known = knownType(scope, getNodeType(scope, decl.argument));
    if (known === TYPES.number) return generate(scope, decl.argument);

    return generate(scope, {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: '__ecma262_ToNumeric'
      },
      arguments: [
        decl.argument
      ]
    });
  };

  switch (decl.operator) {
    case '+':
      // opt: skip ToNumber if already known as number type
      generate(scope, decl.argument); // hack: fix last type not being defined for getNodeType before generation
      const known = knownType(scope, getNodeType(scope, decl.argument));
      if (known === TYPES.number) return generate(scope, decl.argument);

      // 13.5.4 Unary + Operator, 13.5.4.1 Runtime Semantics: Evaluation
      // https://tc39.es/ecma262/#sec-unary-plus-operator-runtime-semantics-evaluation
      // 1. Let expr be ? Evaluation of UnaryExpression.
      // 2. Return ? ToNumber(? GetValue(expr)).
      return generate(scope, {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: '__ecma262_ToNumber'
        },
        arguments: [
          decl.argument
        ]
      });

    case '-':
      // +x * -1

      if (decl.prefix && decl.argument.type === 'Literal' && (typeof decl.argument.value === 'number' || typeof decl.argument.value === 'bigint')) {
        // if -n, just return that as a literal
        return generate(scope, {
          type: 'Literal',
          value: -decl.argument.value
        });
      }

      // todo: proper bigint support
      return [
        ...toNumeric(),
        ...(valtype === 'f64' ? [ [ Opcodes.f64_neg ] ] : [ number(-1), [ Opcodes.mul ] ])
      ];

    case '~':
      // todo: proper bigint support
      return [
        ...toNumeric(),
        Opcodes.i32_to,
        [ Opcodes.i32_const, ...signedLEB128(-1) ],
        [ Opcodes.i32_xor ],
        Opcodes.i32_from
      ];


    case '!':
      const arg = decl.argument;
      if (arg.type === 'UnaryExpression' && arg.operator === '!') {
        // opt: !!x -> is x truthy
        return truthy(scope, generate(scope, arg.argument), getNodeType(scope, arg.argument), false, false, 'full');
      }

      // !=
      return falsy(scope, generate(scope, arg), getNodeType(scope, arg), false, false);

    case 'void': {
      // drop current expression value after running, give undefined
      const out = generate(scope, decl.argument);
      out.push([ Opcodes.drop ]);

      out.push(number(UNDEFINED));
      return out;
    }

    case 'delete': {
      if (decl.argument.type === 'MemberExpression') {
        const object = decl.argument.object;

        // disallow `delete super.*`
        if (object.type === 'Super') return internalThrow(scope, 'ReferenceError', 'Cannot delete super property', true);

        const property = getProperty(decl.argument);
        if (property.value === 'length' || property.value === 'name') scope.noFastFuncMembers = true;

        const useCoctc = coctcOffset(decl.argument) > 0;
        const objectTmp = useCoctc && localTmp(scope, '#coctc_object', Valtype.i32);

        const out = [
          ...generate(scope, object),
          Opcodes.i32_to_u,
          ...optional([ Opcodes.local_tee, objectTmp ]),
          ...getNodeType(scope, object),

          ...toPropertyKey(scope, generate(scope, property), getNodeType(scope, property), decl.argument.computed, true),

          [ Opcodes.call, includeBuiltin(scope, scope.strict ? '__Porffor_object_deleteStrict' : '__Porffor_object_delete').index ],
          Opcodes.i32_from_u
        ];

        if (useCoctc) {
          // set COCTC
          const offset = coctcOffset(decl.argument.property.name);

          out.push(
            ...coctcSetup(scope, object, objectTmp, null, [ [ Opcodes.local_get, objectTmp ] ], false),

            [ Opcodes.local_get, objectTmp ],
            number(0),
            [ Opcodes.f64_store, 0, ...unsignedLEB128(offset) ],

            [ Opcodes.local_get, objectTmp ],
            number(0, Valtype.i32),
            [ Opcodes.i32_store8, 0, ...unsignedLEB128(offset + 8) ]
          );
        }

        return out;
      }

      let toReturn = true, toGenerate = true;

      if (decl.argument.type === 'Identifier') {
        // if ReferenceError (undeclared var), ignore and return true. otherwise false
        if (ifIdentifierErrors(scope, decl.argument)) {
          // does not exist (2 ops from throw)
          toReturn = true;
          toGenerate = false;
        } else {
          // exists
          toReturn = false;
        }
      }

      const out = toGenerate ? generate(scope, decl.argument) : [];
      if (toGenerate) out.push([ Opcodes.drop ]);

      out.push(number(toReturn ? 1 : 0));
      return out;
    }

    case 'typeof': {
      let overrideType, toGenerate = true;
      if (ifIdentifierErrors(scope, decl.argument)) {
        overrideType = [ number(TYPES.undefined, Valtype.i32) ];
        toGenerate = false;
      }

      const out = toGenerate ? generate(scope, decl.argument) : [];
      if (toGenerate) out.push([ Opcodes.drop ]);

      out.push(...typeSwitch(scope, overrideType ?? getNodeType(scope, decl.argument), [
        [ TYPES.number, () => makeString(scope, 'number') ],
        [ TYPES.boolean, () => makeString(scope, 'boolean') ],
        [ [ TYPES.string, TYPES.bytestring ], () => makeString(scope, 'string') ],
        [ [ TYPES.undefined, TYPES.empty ], () => makeString(scope, 'undefined') ],
        [ TYPES.function, () => makeString(scope, 'function') ],
        [ TYPES.symbol, () => makeString(scope, 'symbol') ],

        // object and internal types
        [ 'default', () => makeString(scope, 'object') ],
      ]));

      return out;
    }

    default:
      return todo(scope, `unary operator ${decl.operator} not implemented yet`, true);
  }
};

const generateUpdate = (scope, decl, _global, _name, valueUnused = false) => {
  const { name } = decl.argument;
  const [ local, isGlobal ] = lookupName(scope, name);
  if (local != null) {
    // fast path: just a local
    // todo: not as compliant as slow path (non numbers)
    const idx = local.idx;
    const out = [];

    out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);
    if (!decl.prefix && !valueUnused) out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);

    switch (decl.operator) {
      case '++':
        out.push(number(1), [ Opcodes.add ]);
        break;

      case '--':
        out.push(number(1), [ Opcodes.sub ]);
        break;
    }

    out.push([ isGlobal ? Opcodes.global_set : Opcodes.local_set, idx ]);
    if (decl.prefix && !valueUnused) out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);

    if (valueUnused) out.push(number(UNDEFINED));
    return out;
  }

  // ++x: tmp = +x; x = tmp + 1
  // x++: tmp = +x; x = tmp + 1; tmp
  const tmp = localTmp(scope, '#updatetmp');
  addVarMetadata(scope, '#updatetmp', false, { type: TYPES.number });

  return [
    // tmp = +x
    // if postfix, tee to keep on stack as return value
    ...generate(scope, {
      type: 'UnaryExpression',
      operator: '+',
      prefix: true,
      argument: decl.argument
    }),
    [ decl.prefix || valueUnused ? Opcodes.local_set : Opcodes.local_tee, tmp ],

    // x = tmp + 1
    ...generate(scope, {
      type: 'AssignmentExpression',
      operator: '=',
      left: decl.argument,
      right: {
        type: 'BinaryExpression',
        operator: decl.operator[0],
        left: { type: 'Identifier', name: '#updatetmp' },
        right: { type: 'Literal', value: 1 }
      }
    }, _global, _name, valueUnused),
    ...(decl.prefix || valueUnused ? [] : [ [ Opcodes.drop ] ])
  ];
};

const inferBranchStart = (scope, decl) => {
  scope.inferTree ??= [];
  scope.inferTree.push(decl);
};

const inferBranchEnd = scope => {
  scope.inferTree.pop();
};

const inferBranchElse = (scope, decl) => {
  inferBranchEnd(scope);
  inferBranchStart(scope, decl);
};

const inferLoopPrev = [];
const inferLoopStart = (scope, decl) => {
  scope.inferTree ??= [];

  // todo/opt: do not just wipe the infer tree for loops
  inferLoopPrev.push(scope.inferTree);
  scope.inferTree = [ decl ];
};

const inferLoopEnd = scope => {
  scope.inferTree = inferLoopPrev.pop();
};

const generateIf = (scope, decl) => {
  if (globalThis.precompile && decl.test?.tag?.name === '__Porffor_comptime_flag') {
    const flag = decl.test.quasi.quasis[0].value.raw;
    return [
      [ null, 'comptime_flag', flag, decl.consequent, '#', decl.alternate ?? { type: 'EmptyStatement' }, '#', Prefs ],
      number(UNDEFINED)
    ];
  }

  const out = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test), false, true);
  out.push([ Opcodes.if, Blocktype.void ]);
  depth.push('if');
  inferBranchStart(scope, decl.consequent);

  out.push(
    ...generate(scope, decl.consequent),
    [ Opcodes.drop ]
  );

  inferBranchEnd(scope);
  if (decl.alternate) {
    inferBranchStart(scope, decl.alternate);
    out.push(
      [ Opcodes.else ],
      ...generate(scope, decl.alternate),
      [ Opcodes.drop ]
    );
    inferBranchEnd(scope);
  }

  out.push(
    [ Opcodes.end ],
    number(UNDEFINED)
  );
  depth.pop();

  return out;
};

const generateConditional = (scope, decl) => {
  const out = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test), false, true);

  out.push([ Opcodes.if, valtypeBinary ]);
  depth.push('if');
  inferBranchStart(scope, decl.consequent);

  out.push(
    ...generate(scope, decl.consequent),
    ...setLastType(scope, getNodeType(scope, decl.consequent))
  );

  out.push([ Opcodes.else ]);
  inferBranchElse(scope, decl.alternate);

  out.push(
    ...generate(scope, decl.alternate),
    ...setLastType(scope, getNodeType(scope, decl.alternate))
  );

  out.push([ Opcodes.end ]);
  inferBranchEnd(scope);

  return out;
};

const generateFor = (scope, decl) => {
  const out = [];

  if (decl.init) out.push(
    ...generate(scope, decl.init, false, undefined, true),
    [ Opcodes.drop ]
  );

  inferLoopStart(scope, decl);
  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('for');

  if (decl.test) out.push(...generate(scope, decl.test), Opcodes.i32_to);
    else out.push(number(1, Valtype.i32));

  out.push(
    [ Opcodes.if, Blocktype.void ],
    [ Opcodes.block, Blocktype.void ]
  );
  depth.push('if', 'block');

  out.push(
    ...generate(scope, decl.body),
    [ Opcodes.drop ],
    [ Opcodes.end ]
  );
  depth.pop();

  if (decl.update) out.push(
    ...generate(scope, decl.update, false, undefined, true),
    [ Opcodes.drop ]
  );

  out.push(
    [ Opcodes.br, 1 ],
    [ Opcodes.end ],
    [ Opcodes.end ],
    number(UNDEFINED)
  );
  depth.pop(); depth.pop();

  inferLoopEnd(scope);
  return out;
};

const generateWhile = (scope, decl) => {
  const out = [];
  inferLoopStart(scope, decl);

  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('while');

  out.push(
    ...generate(scope, decl.test),
    Opcodes.i32_to,
    [ Opcodes.if, Blocktype.void ]
  );
  depth.push('if');

  out.push(
    ...generate(scope, decl.body),
    [ Opcodes.drop ],
    [ Opcodes.br, 1 ],
    [ Opcodes.end ],
    [ Opcodes.end ],
    number(UNDEFINED)
  );
  depth.pop(); depth.pop();

  inferLoopEnd(scope);
  return out;
};

const generateDoWhile = (scope, decl) => {
  const out = [];
  inferLoopStart(scope, decl);

  out.push([ Opcodes.loop, Blocktype.void ]);

  // block for break (includes all)
  out.push([ Opcodes.block, Blocktype.void ]);

  // block for continue
  // includes body but not test+loop so we can exit body at anytime
  // and still test+loop after
  out.push([ Opcodes.block, Blocktype.void ]);
  depth.push('dowhile', 'block', 'block');

  out.push(
    ...generate(scope, decl.body),
    [ Opcodes.drop ],
    [ Opcodes.end ]
  );
  depth.pop();

  out.push(
    ...generate(scope, decl.test),
    Opcodes.i32_to,
    [ Opcodes.br_if, 1 ],
    [ Opcodes.end ],
    [ Opcodes.end ],
    number(UNDEFINED)
  );
  depth.pop(); depth.pop();

  inferLoopEnd(scope);
  return out;
};

const generateForOf = (scope, decl) => {
  const out = [];

  let count = 0;
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] === 'forof') count++;
  }

  const pointer = localTmp(scope, '#forof_base_pointer' + count, Valtype.i32);
  const length = localTmp(scope, '#forof_length' + count, Valtype.i32);
  const counter = localTmp(scope, '#forof_counter' + count, Valtype.i32);

  const iterType = [ [ Opcodes.local_get, localTmp(scope, '#forof_itertype' + count, Valtype.i32) ] ];

  out.push(
    // set pointer as right
    ...generate(scope, decl.right),
    Opcodes.i32_to_u,
    [ Opcodes.local_set, pointer ],

    ...getNodeType(scope, decl.right),
    [ Opcodes.local_set, localTmp(scope, '#forof_itertype' + count, Valtype.i32) ],

    // set counter as 0 (could be already used)
    number(0, Valtype.i32),
    [ Opcodes.local_set, counter ],

    // check tmp is iterable
    ...typeIsIterable(iterType),
    [ Opcodes.if, Blocktype.void ],
      ...internalThrow(scope, 'TypeError', `Tried for..of on non-iterable type`),
    [ Opcodes.end ],

    // get length
    [ Opcodes.local_get, pointer ],
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
    [ Opcodes.local_set, length ]
  );

  inferLoopStart(scope, decl);
  depth.push('forof');
  depth.push('block');

  out.push([ Opcodes.loop, Blocktype.void ]);
  out.push([ Opcodes.block, Blocktype.void ]);

  const prevDepth = depth.length;

  const makeTypedArrayNext = (getOp, elementSize) => [
    // if counter == length then break
    [ Opcodes.local_get, counter ],
    [ Opcodes.local_get, length ],
    [ Opcodes.i32_eq ],
    [ Opcodes.br_if, depth.length - prevDepth ],

    // get TypedArray.buffer
    [ Opcodes.local_get, pointer ],
    [ Opcodes.i32_load, 0, 4 ],

    // calculate address
    [ Opcodes.local_get, counter ],
    ...(elementSize === 1 ? [] : [
      number(elementSize, Valtype.i32),
      [ Opcodes.i32_mul ]
    ]),
    [ Opcodes.i32_add ],

    // get value and cast
    ...getOp,

    // increment counter
    [ Opcodes.local_get, counter ],
    number(1, Valtype.i32),
    [ Opcodes.i32_add ],
    [ Opcodes.local_set, counter ],

    // set last type to number
    ...setLastType(scope, TYPES.number)
  ];

  // Wasm to get next element
  const nextWasm = () => typeSwitch(scope, iterType, [
    // arrays and sets work the same currently
    [ [ TYPES.array, TYPES.set ], () => [
      // if remaining length == 0 then break
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_eqz ],
      [ Opcodes.br_if, depth.length - prevDepth ],

      // get value
      [ Opcodes.local_get, pointer ],
      [ Opcodes.load, 0, ...unsignedLEB128(ValtypeSize.i32) ],

      // get type
      [ Opcodes.local_get, pointer ],
      [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(ValtypeSize.i32 + ValtypeSize[valtype]) ],

      // increment iter pointer by valtype size + 1
      [ Opcodes.local_get, pointer ],
      number(ValtypeSize[valtype] + 1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, pointer ],

      // decrement remaining length by 1
      [ Opcodes.local_get, length ],
      number(1, Valtype.i32),
      [ Opcodes.i32_sub ],
      [ Opcodes.local_set, length ],

      // set type
      ...setLastType(scope)
    ] ],

    [ TYPES.string, () => [
      // if remaining length == 0 then break
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_eqz ],
      [ Opcodes.br_if, depth.length - prevDepth ],

      // allocate out string
      number(8, Valtype.i32),
      [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocateBytes').index ],
      [ Opcodes.local_tee, localTmp(scope, '#forof_allocd', Valtype.i32) ],

      // set length to 1
      number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      // use as pointer for store later
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],

      // load current string ind {arg}
      [ Opcodes.local_get, pointer ],
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16), ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16), ValtypeSize.i32 ],

      // increment iter pointer by valtype size
      [ Opcodes.local_get, pointer ],
      number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, pointer ],

      // decrement remaining length by 1
      [ Opcodes.local_get, length ],
      number(1, Valtype.i32),
      [ Opcodes.i32_sub ],
      [ Opcodes.local_set, length ],

      // get new string (page)
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],
      Opcodes.i32_from_u,

      // set type to string
      ...setLastType(scope, TYPES.string)
    ] ],
    [ TYPES.bytestring, () => [
      // if remaining length == 0 then break
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_eqz ],
      [ Opcodes.br_if, depth.length - prevDepth ],

      // allocate out string
      number(8, Valtype.i32),
      [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocateBytes').index ],
      [ Opcodes.local_tee, localTmp(scope, '#forof_allocd', Valtype.i32) ],

      // set length to 1
      number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      // use as pointer for store later
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],

      // load current string ind {arg}
      [ Opcodes.local_get, pointer ],
      [ Opcodes.i32_load8_u, Math.log2(ValtypeSize.i8), ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store8, Math.log2(ValtypeSize.i8), ValtypeSize.i32 ],

      // increment iter pointer by valtype size
      [ Opcodes.local_get, pointer ],
      number(ValtypeSize.i8, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, pointer ],

      // decrement remaining length by 1
      [ Opcodes.local_get, length ],
      number(1, Valtype.i32),
      [ Opcodes.i32_sub ],
      [ Opcodes.local_set, length ],

      // get new string (page)
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],
      Opcodes.i32_from_u,

      // set type to string
      ...setLastType(scope, TYPES.bytestring)
    ] ],

    [ [ TYPES.uint8array, TYPES.uint8clampedarray ], () => makeTypedArrayNext([
      [ Opcodes.i32_load8_u, 0, 4 ],
      Opcodes.i32_from_u
    ], 1) ],
    [ TYPES.int8array, () => makeTypedArrayNext([
      [ Opcodes.i32_load8_s, 0, 4 ],
      Opcodes.i32_from
    ], 1) ],
    [ TYPES.uint16array, () => makeTypedArrayNext([
      [ Opcodes.i32_load16_u, 0, 4 ],
      Opcodes.i32_from_u
    ], 2) ],
    [ TYPES.int16array, () => makeTypedArrayNext([
      [ Opcodes.i32_load16_u, 0, 4 ],
      Opcodes.i32_from_u
    ], 2) ],
    [ TYPES.uint32array, () => makeTypedArrayNext([
      [ Opcodes.i32_load, 0, 4 ],
      Opcodes.i32_from_u
    ], 4) ],
    [ TYPES.int32array, () => makeTypedArrayNext([
      [ Opcodes.i32_load, 0, 4 ],
      Opcodes.i32_from
    ], 4) ],
    [ TYPES.float32array, () => makeTypedArrayNext([
      [ Opcodes.f32_load, 0, 4 ],
      [ Opcodes.f64_promote_f32 ]
    ], 4) ],
    [ TYPES.float64array, () => makeTypedArrayNext([
      [ Opcodes.f64_load, 0, 4 ]
    ], 8) ],

    [ TYPES.__porffor_generator, () => [
      // just break?! TODO: actually implement this
      [ Opcodes.br, depth.length - prevDepth ]
    ] ],

    [ TYPES.map, () => [
      // length is actually keys pointer
      // if counter == length then break
      [ Opcodes.local_get, counter ],
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
      [ Opcodes.i32_eq ],
      [ Opcodes.br_if, depth.length - prevDepth ],

      // allocate out array
      number(128, Valtype.i32),
      [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocateBytes').index ],
      [ Opcodes.local_tee, localTmp(scope, '#forof_allocd', Valtype.i32) ],

      // set length to 2
      number(2, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      // use as pointer for stores later
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],

      // set [0] as key
      [ Opcodes.local_get, length ],
      [ Opcodes.local_get, counter ],
      [ Opcodes.i32_const, 9 ],
      [ Opcodes.i32_mul ],
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, localTmp(scope, '#forof_mapptr', Valtype.i32) ],

      [ Opcodes.local_get, localTmp(scope, '#forof_mapptr', Valtype.i32) ],
      [ Opcodes.f64_load, 0, 4 ],
      [ Opcodes.f64_store, 0, 4 ],

      [ Opcodes.local_get, localTmp(scope, '#forof_mapptr', Valtype.i32) ],
      [ Opcodes.i32_load8_u, 0, 12 ],
      [ Opcodes.i32_store8, 0, 12 ],

      // set [1] as value
      [ Opcodes.local_get, pointer ],
      [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 4 ],
      [ Opcodes.local_get, counter ],
      [ Opcodes.i32_const, 9 ],
      [ Opcodes.i32_mul ],
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, localTmp(scope, '#forof_mapptr', Valtype.i32) ],

      [ Opcodes.local_get, localTmp(scope, '#forof_mapptr', Valtype.i32) ],
      [ Opcodes.f64_load, 0, 4 ],
      [ Opcodes.f64_store, 0, 13 ],

      [ Opcodes.local_get, localTmp(scope, '#forof_mapptr', Valtype.i32) ],
      [ Opcodes.i32_load8_u, 0, 12 ],
      [ Opcodes.i32_store8, 0, 21 ],

      // increment counter
      [ Opcodes.local_get, counter ],
      number(1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, counter ],

      // get new array (page)
      [ Opcodes.local_get, localTmp(scope, '#forof_allocd', Valtype.i32) ],
      Opcodes.i32_from_u,

      // set type to array
      ...setLastType(scope, TYPES.array)
    ] ],

    // note: should be impossible to reach?
    [ 'default', [ [ Opcodes.unreachable ] ] ]
  ], valtypeBinary);

  // setup local for left
  let setVar;
  if (decl.left.type === 'Identifier') {
    if (!isIdentAssignable(scope, decl.left.name)) return internalThrow(scope, 'ReferenceError', `${decl.left.name} is not defined`);
    setVar = generateVarDstr(scope, 'var', decl.left, { type: 'Wasm', wasm: nextWasm }, undefined, true);
  } else {
    // todo: verify this is correct
    const global = scope.name === '#main' && decl.left.kind === 'var';
    setVar = generateVarDstr(scope, decl.left.kind, decl.left?.declarations?.[0]?.id ?? decl.left, { type: 'Wasm', wasm: nextWasm }, undefined, global);
  }

  // next and set local
  out.push(
    ...setVar,
    ...generate(scope, decl.body),
    [ Opcodes.drop ],
    [ Opcodes.br, 1 ], // continue
    [ Opcodes.end ], // end block
    [ Opcodes.end ], // end loop
    number(UNDEFINED)
  );

  depth.pop(); depth.pop();

  inferLoopEnd(scope);
  return out;
};

const generateForIn = (scope, decl) => {
  const out = [];

  let count = 0;
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] === 'forin') count++;
  }

  const pointer = localTmp(scope, '#forin_base_pointer' + count, Valtype.i32);
  const length = localTmp(scope, '#forin_length' + count, Valtype.i32);
  const counter = localTmp(scope, '#forin_counter' + count, Valtype.i32);

  out.push(
    // set pointer as right
    ...generate(scope, decl.right),
    Opcodes.i32_to_u,
    [ Opcodes.local_set, pointer ],

    // set counter as 0 (could be already used)
    number(0, Valtype.i32),
    [ Opcodes.local_set, counter ],

    // get length
    [ Opcodes.local_get, pointer ],
    [ Opcodes.i32_load16_u, 0, 0 ],
    [ Opcodes.local_tee, length ],

    [ Opcodes.if, Blocktype.void ]
  );

  inferLoopStart(scope, decl);
  depth.push('if');
  depth.push('forin');
  depth.push('block');
  depth.push('if');

  const tmpName = '#forin_tmp' + count;
  const tmp = localTmp(scope, tmpName, Valtype.i32);
  localTmp(scope, tmpName + '#type', Valtype.i32);

  let setVar;
  if (decl.left.type === 'Identifier') {
    if (!isIdentAssignable(scope, decl.left.name)) return internalThrow(scope, 'ReferenceError', `${decl.left.name} is not defined`);
    setVar = generateVarDstr(scope, 'var', decl.left, { type: 'Identifier', name: tmpName }, undefined, true);
  } else {
    // todo: verify this is correct
    const global = scope.name === '#main' && decl.left.kind === 'var';
    setVar = generateVarDstr(scope, decl.left.kind, decl.left?.declarations?.[0]?.id ?? decl.left, { type: 'Identifier', name: tmpName }, undefined, global);
  }

  // set type for local
  // todo: optimize away counter and use end pointer
  out.push(
    [ Opcodes.loop, Blocktype.void ],

    // read key
    [ Opcodes.local_get, pointer ],
    [ Opcodes.i32_load, 0, 12 ],
    [ Opcodes.local_tee, tmp ],

    ...setType(scope, tmpName, [
      [ Opcodes.i32_const, 31 ],
      [ Opcodes.i32_shr_u ],
      [ Opcodes.if, Valtype.i32 ],
        // unset MSB 1&2 in tmp
        [ Opcodes.local_get, tmp ],
        number(0x3fffffff, Valtype.i32),
        [ Opcodes.i32_and ],
        [ Opcodes.local_set, tmp ],

        // symbol is MSB 2 is set
        [ Opcodes.i32_const, ...unsignedLEB128(TYPES.string) ],
        [ Opcodes.i32_const, ...unsignedLEB128(TYPES.symbol) ],
        [ Opcodes.local_get, tmp ],
        number(0x40000000, Valtype.i32),
        [ Opcodes.i32_and ],
        [ Opcodes.select ],
      [ Opcodes.else ], // bytestring
        [ Opcodes.i32_const, ...unsignedLEB128(TYPES.bytestring) ],
      [ Opcodes.end ]
    ]),

    ...setVar,

    [ Opcodes.block, Blocktype.void ],

    // todo/perf: do not read key for non-enumerables
    // only run body if entry is enumerable
    [ Opcodes.local_get, pointer ],
    [ Opcodes.i32_load8_u, 0, 24 ],
    [ Opcodes.i32_const, 0b0100 ],
    [ Opcodes.i32_and ],
    [ Opcodes.if, Blocktype.void ],
    ...generate(scope, decl.body),
    [ Opcodes.drop ],
    [ Opcodes.end ],

    // increment pointer by 18
    [ Opcodes.local_get, pointer ],
    number(18, Valtype.i32),
    [ Opcodes.i32_add ],
    [ Opcodes.local_set, pointer ],

    // increment counter by 1
    [ Opcodes.local_get, counter ],
    number(1, Valtype.i32),
    [ Opcodes.i32_add ],
    [ Opcodes.local_tee, counter ],

    // loop if counter != length
    [ Opcodes.local_get, length ],
    [ Opcodes.i32_ne ],
    [ Opcodes.br_if, 1 ],

    [ Opcodes.end ],
    [ Opcodes.end ]
  );

  out.push([ Opcodes.end ]); // end if

  depth.pop();
  depth.pop();
  depth.pop();
  depth.pop();

  inferLoopEnd(scope);

  const final = typeSwitch(scope, getNodeType(scope, decl.right), {
    // fast path for objects
    [TYPES.object]: out,

    // wrap for of object.keys
    default: () => {
      const out = generate(scope, {
        type: 'ForOfStatement',
        left: decl.left,
        body: decl.body,
        right: {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: '__Object_keys'
          },
          arguments: [ {
            type: 'LogicalExpression',
            left: decl.right,
            operator: '??',
            right: {
              type: 'Literal',
              value: 0
            }
          } ]
        }
      });

      out.push([ Opcodes.drop ]);
      return out;
    }
  }, Blocktype.void);

  final.push(number(UNDEFINED));
  return final;
};

const generateSwitch = (scope, decl) => {
  // special fast path just for `switch (Porffor.type(...))`
  if (decl.discriminant.type === 'CallExpression' && decl.discriminant.callee.type === 'Identifier' && decl.discriminant.callee.name === '__Porffor_type') {
    const cases = []
    let canTypeCheck = true;
    for (const x of decl.cases) {
      let type;
      if (!x.test) {
        type = 'default';
      } else if (x.test.type === 'Literal') {
        type = x.test.value;
      } else if (x.test.type === 'Identifier' && x.test.name.startsWith('__Porffor_TYPES_')) {
        type = TYPES[x.test.name.slice('__Porffor_TYPES_'.length)];
      }

      if (type !== undefined) {
        cases.push([ type, x.consequent ]);
      } else {
        canTypeCheck = false;
        break;
      }
    }

    if (canTypeCheck) {
      depth.push('switch_typeswitch');

      const out = typeSwitch(scope, getNodeType(scope, decl.discriminant.arguments[0]), () => {
        const bc = [];
        let types = [];
        for (const [ type, consequent ] of cases) {
          types.push(type);

          if (consequent.length !== 0) {
            bc.push([ types, () => generate(scope, { type: 'BlockStatement', body: consequent }) ]);
            types = [];
          }
        }

        return bc;
      }, Blocktype.void, true);

      depth.pop();
      out.push(number(UNDEFINED));
      return out;
    }
  }

  const tmpName = '#switch' + uniqId();
  const tmp = localTmp(scope, tmpName);
  localTmp(scope, tmpName + '#type', Valtype.i32);

  const out = [
    ...generate(scope, decl.discriminant),
    [ Opcodes.local_set, tmp ],
    ...setType(scope, tmpName, getNodeType(scope, decl.discriminant)),

    [ Opcodes.block, Blocktype.void ]
  ];

  depth.push('switch');

  const cases = decl.cases.slice();
  const defaultCase = cases.findIndex(x => x.test == null);
  if (defaultCase != -1) {
    // move default case to last
    cases.push(cases.splice(defaultCase, 1)[0]);
  }

  for (let i = 0; i < cases.length; i++) {
    out.push([ Opcodes.block, Blocktype.void ]);
    depth.push('block');
  }

  for (let i = 0; i < cases.length; i++) {
    const x = cases[i];
    if (x.test) {
      // todo: this should use same value zero
      out.push(
        ...generate(scope, {
          type: 'BinaryExpression',
          operator: '===',
          left: {
            type: 'Identifier',
            name: tmpName
          },
          right: x.test
        }),
        Opcodes.i32_to_u,
        [ Opcodes.br_if, i ]
      );
    } else {
      out.push(
        [ Opcodes.br, i ]
      );
    }
  }

  for (let i = 0; i < cases.length; i++) {
    depth.pop();
    out.push(
      [ Opcodes.end ],
      ...generate(scope, { type: 'BlockStatement', body: cases[i].consequent }),
      [ Opcodes.drop ]
    );
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  out.push(number(UNDEFINED));
  return out;
};

// find the nearest loop in depth map by type
const getNearestLoop = () => {
  for (let i = depth.length - 1; i >= 0; i--) {
    if (['while', 'dowhile', 'for', 'forof', 'forin', 'switch', 'switch_typeswitch'].includes(depth[i])) return i;
  }

  return -1;
};

const generateBreak = (scope, decl) => {
  const target = decl.label ? scope.labels.get(decl.label.name) : getNearestLoop();
  const type = depth[target];

  // different loop types have different branch offsets
  // as they have different wasm block/loop/if structures
  // we need to use the right offset by type to branch to the one we want
  // for a break: exit the loop without executing anything else inside it
  const offset = ({
    for: 2, // loop > if (wanted branch) > block (we are here)
    while: 2, // loop > if (wanted branch) (we are here)
    dowhile: 2, // loop > block (wanted branch) > block (we are here)
    forof: 1, // loop > block (wanted branch) (we are here)
    forin: 2, // loop > block (wanted branch) > if (we are here)
    if: 1, // break inside if, branch 0 to skip the rest of the if
    switch: 1,
    switch_typeswitch: 1
  })[type];

  return [
    [ Opcodes.br, ...unsignedLEB128(depth.length - target - offset) ]
  ];
};

const generateContinue = (scope, decl) => {
  const target = decl.label ? scope.labels.get(decl.label.name) : getNearestLoop();
  const type = depth[target];

  // different loop types have different branch offsets
  // as they have different wasm block/loop/if structures
  // we need to use the right offset by type to branch to the one we want
  // for a continue: do test for the loop, and then loop depending on that success
  const offset = ({
    for: 3, // loop (wanted branch) > if > block (we are here)
    while: 1, // loop (wanted branch) > if (we are here)
    dowhile: 3, // loop > block > block (wanted branch) (we are here)
    forof: 2, // loop (wanted branch) > block (we are here)
    forin: 3 // loop > block > if (wanted branch) (we are here)
  })[type];

  return [
    [ Opcodes.br, ...unsignedLEB128(depth.length - target - offset) ]
  ];
};

const generateLabel = (scope, decl) => {
  scope.labels ??= new Map();

  const name = decl.label.name;
  scope.labels.set(name, depth.length);

  const out = generate(scope, decl.body);

  // if block statement, wrap in block to allow for breaking
  if (decl.body.type === 'BlockStatement') {
    out.unshift([ Opcodes.block, Blocktype.void ]);
    out.push(
      [ Opcodes.drop ],
      [ Opcodes.end ],
      number(UNDEFINED)
    );
  }

  return out;
};

const ensureTag = (exceptionMode = Prefs.exceptionMode ?? 'stack') => {
  if (tags.length !== 0) return;

  tags.push({
    params: exceptionMode === 'lut' ? [ Valtype.i32 ] : [ valtypeBinary, Valtype.i32 ],
    results: [],
    idx: tags.length
  });
};

const generateThrow = (scope, decl) => {
  let exceptionMode = Prefs.exceptionMode ?? 'stack';
  if (globalThis.precompile) exceptionMode = decl.argument.callee != null ? 'lut' : 'stack';
  ensureTag(exceptionMode);

  if (exceptionMode === 'lut') {
    let message = decl.argument.value, constructor = null;

    // support `throw (new)? Error(...)`
    if (!message && (decl.argument.type === 'NewExpression' || decl.argument.type === 'CallExpression')) {
      constructor = decl.argument.callee.name;
      message = decl.argument.arguments[0]?.value ?? '';
    }

    if (constructor && constructor.startsWith('__')) constructor = constructor.split('_').pop();

    let exceptId = exceptions.findIndex(x => x.constructor === constructor && x.message === message);
    if (exceptId === -1) exceptId = exceptions.push({ constructor, message }) - 1;

    scope.exceptions ??= [];
    scope.exceptions.push(exceptId);

    return [
      number(exceptId, Valtype.i32),
      [ Opcodes.throw, 0 ]
    ];
  }

  const out = generate(scope, decl.argument);
  const lastOp = out.at(-1);
  if (lastOp[0] === Opcodes.local_set && lastOp[1] === scope.locals['#last_type']?.idx) {
    out.pop();
  } else {
    out.push(...getNodeType(scope, decl.argument));
  }

  out.push([ Opcodes.throw, globalThis.precompile ? 1 : 0 ]);
  return out;
};

const generateTry = (scope, decl) => {
  // todo: handle control-flow pre-exit for finally
  // "Immediately before a control-flow statement (return, throw, break, continue) is executed in the try block or catch block."

  const out = [];

  const finalizer = decl.finalizer ? [
    ...generate(scope, decl.finalizer),
    [ Opcodes.drop ]
  ]: [];

  out.push([ Opcodes.try, Blocktype.void ]);
  depth.push('try');

  out.push(
    ...generate(scope, decl.block),
    [ Opcodes.drop ],
    ...finalizer
  );

  if (decl.handler) {
    depth.pop();
    depth.push('catch');

    const param = decl.handler.param;

    if (param) {
      let count = 0;
      for (let i = 0; i < depth.length; i++) {
        if (depth[i] === 'catch') count++;
      }

      const tmpName = '#catch_tmp' + count;
      const tmp = localTmp(scope, tmpName, valtypeBinary);
      localTmp(scope, tmpName + "#type", Valtype.i32);

      // setup local for param
      out.push(
        [ Opcodes.catch, 0 ],
        ...setType(scope, tmpName, []),
        [ Opcodes.local_set, tmp ],

        ...generateVarDstr(scope, 'let', param, { type: 'Identifier', name: tmpName }, undefined, false)
      );

      // ensure tag exists for specific catch
      ensureTag();
    } else {
      out.push([ Opcodes.catch_all ]);
    }

    out.push(
      ...generate(scope, decl.handler.body),
      [ Opcodes.drop ],
      ...finalizer
    );
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  out.push(number(UNDEFINED));
  return out;
};

const generateEmpty = (scope, decl) => {
  return [ number(UNDEFINED) ];
};

const generateMeta = (scope, decl) => {
  if (decl.meta.name === 'new' && decl.property.name === 'target') {
    // new.target
    if (scope.constr) return [
      [ Opcodes.local_get, scope.locals['#newtarget'].idx ]
    ];

    // todo: access upper-scoped new.target
    return [ number(UNDEFINED) ];
  }

  return todo(scope, `meta property object ${decl.meta.name} is not supported yet`, true);
};

const compileBytes = (val, itemType) => {
  switch (itemType) {
    case 'i8': return [ val % 256 ];
    case 'i16': return [ val % 256, (val / 256 | 0) % 256 ];
    case 'i32': return [...new Uint8Array(new Int32Array([ val ]).buffer)];
    // todo: i64

    case 'f64': return ieee754_binary64(val);
  }
};

const makeData = (scope, elements, page = null, itemType = 'i8') => {
  // if data for page already exists, abort
  if (page && data.find(x => x.page === page)) return;

  const length = elements.length;

  // if length is 0, memory/data will just be 0000... anyway
  if (length === 0) return false;

  let bytes = compileBytes(length, 'i32');
  if (itemType === 'i8') {
    bytes = bytes.concat(elements);
  } else {
    for (let i = 0; i < length; i++) {
      if (elements[i] == null) continue;
      bytes.push(...compileBytes(elements[i], itemType));
    }
  }

  const obj = { bytes, page };
  const idx = data.push(obj) - 1;

  scope.data ??= [];
  scope.data.push(idx);

  return { idx, size: bytes.length };
};

const printStaticStr = str => {
  const out = [];

  for (let i = 0; i < str.length; i++) {
    out.push(
      // number(str.charCodeAt(i)),
      number(str.charCodeAt(i), Valtype.i32),
      [ Opcodes.f64_convert_i32_u ],
      [ Opcodes.call, importedFuncs.printChar ]
    );
  }

  return out;
};

const byteStringable = str => {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0xFF) return false;
  }

  return true;
};

const makeString = (scope, str, forceBytestring = undefined) => {
  if (str.length === 0) return [ number(0) ];

  const elements = new Array(str.length);
  let bytestring = forceBytestring !== false;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    elements[i] = c;

    if (bytestring && c > 0xFF) bytestring = false;
  }

  if (globalThis.precompile) return [
    [ 'str', Opcodes.const, str, forceBytestring ]
  ];

  const ptr = allocStr({ scope, pages }, str, bytestring);
  makeData(scope, elements, str, bytestring ? 'i8' : 'i16');

  return [ number(ptr) ];
};

const generateArray = (scope, decl, global = false, name = '$undeclared', staticAlloc = false) => {
  const elements = decl.elements;
  const length = elements.length;

  const out = [];
  let pointer;

  if (staticAlloc) {
    const uniqueName = name === '$undeclared' ? name + uniqId() : name;

    const ptr = allocPage({ scope, pages }, uniqueName);
    pointer = number(ptr, Valtype.i32);

    scope.arrays ??= new Map();
    scope.arrays.set(uniqueName, ptr);
  } else {
    const tmp = localTmp(scope, '#create_array' + uniqId(), Valtype.i32);
    out.push(
      [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocate').index ],
      [ Opcodes.local_set, tmp ]
    );

    pointer = [ Opcodes.local_get, tmp ];
  }

  // fast path: no spread elements, just store direct
  let i = 0;
  for (; i < length; i++) {
    if (elements[i] == null) continue;
    if (elements[i].type === 'SpreadElement') break;

    const offset = ValtypeSize.i32 + i * (ValtypeSize[valtype] + 1);
    out.push(
      pointer,
      ...generate(scope, elements[i]),
      [ Opcodes.store, 0, ...unsignedLEB128(offset) ],

      pointer,
      ...getNodeType(scope, elements[i]),
      [ Opcodes.i32_store8, 0, ...unsignedLEB128(offset + ValtypeSize[valtype]) ]
    );
  }

  // store direct length
  if (i !== 0) out.push(
    pointer,
    number(i, Valtype.i32),
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ]
  );

  // push remaining (non-direct) elements
  for (; i < length; i++) {
    out.push(
      ...generate(scope, {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: '__Array_prototype_push'
        },
        arguments: [
          [
            pointer,
            Opcodes.i32_from_u,
            number(TYPES.array, Valtype.i32)
          ],
          elements[i]
        ],
        _protoInternalCall: true
      }),
      [ Opcodes.drop ]
    );
  }

  // return array pointer
  out.push(
    pointer,
    Opcodes.i32_from_u
  );

  return out;
};

// opt: do not call ToPropertyKey for non-computed properties as unneeded
const toPropertyKey = (scope, wasm, type, computed = false, i32Conv = false) => computed ? [
  ...wasm,
  ...type,
  [ Opcodes.call, includeBuiltin(scope, '__ecma262_ToPropertyKey').index ],
  ...(i32Conv ? forceDuoValtype(scope, [], Valtype.i32) : [])
] : [
  ...wasm,
  ...(i32Conv ? [ Opcodes.i32_to_u ] : []),
  ...type
];

const generateObject = (scope, decl, global = false, name = '$undeclared') => {
  const out = [
    [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocate').index ]
  ];

  if (decl.properties.length > 0) {
    const tmpName = `#objectexpr${uniqId()}`;
    const tmp = localTmp(scope, tmpName, Valtype.i32);
    addVarMetadata(scope, tmpName, false, { type: TYPES.object });

    out.push([ Opcodes.local_tee, tmp ]);

    for (const x of decl.properties) {
      // method, shorthand are made into useful values by parser for us :)
      let { type, argument, computed, kind, value, method } = x;

      // tag function as not a constructor
      if (method) value._method = true;

      if (type === 'SpreadElement') {
        out.push(
          ...generate(scope, {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: '__Porffor_object_spread'
            },
            arguments: [
              { type: 'Identifier', name: tmpName },
              argument
            ]
          }),
          [ Opcodes.drop ]
        );
        continue;
      }

      const key = getProperty(x, true);
      if (isFuncType(value.type)) {
        let id = value.id;

        // todo: support computed names properly
        if (typeof key.value === 'string') id ??= {
          type: 'Identifier',
          name: key.value
        };

        value = { ...value, id };
      }

      out.push(
        [ Opcodes.local_get, tmp ],
        number(TYPES.object, Valtype.i32),

        ...toPropertyKey(scope, generate(scope, key), getNodeType(scope, key), computed, true),

        ...generate(scope, value),
        ...(kind !== 'init' ? [ Opcodes.i32_to_u ] : []),
        ...getNodeType(scope, value),

        [ Opcodes.call, includeBuiltin(scope, `__Porffor_object_expr_${kind}`).index ]
      );
    }
  }

  out.push(Opcodes.i32_from_u);

  return out;
};

const withType = (scope, wasm, type) => [
  ...wasm,
  ...setLastType(scope, type)
];

const wrapBC = (bc, { prelude = [], postlude = [] } = {}) => {
  const out = {};
  for (const x in bc) {
    if (typeof bc[x] === 'function') {
      out[x] = () => [
        ...prelude,
        ...bc[x](),
        ...postlude
      ];
    } else {
      out[x] = [
        ...prelude,
        ...bc[x],
        ...postlude
      ];
    }
  }

  return out;
};

const countParams = (func, name = undefined) => {
  if (!func) {
    if (Object.hasOwn(importedFuncs, name)) {
      // reverse lookup then normal lookup
      func = importedFuncs[importedFuncs[name]];
      if (func) return func.params?.length ?? func.params;
    }
    return;
  }
  if (func.argc) return func.argc;

  name ??= func.name;
  let params = func.params.length;
  if (func.constr) params -= 4;
  if (func.method) params -= 2;
  if (!func.internal || builtinFuncs[name]?.typedParams) params = Math.floor(params / 2);

  return func.argc = params;
};

const countLength = (func, name = undefined) => {
  if (func && func.jsLength != null) return func.jsLength;

  name ??= func.name;

  let count = countParams(func, name);
  if (builtinFuncs[name] && name.includes('_prototype_')) count--;

  return count;
};

const generateMember = (scope, decl, _global, _name) => {
  let final = [], finalEnd, extraBC = {};
  let name = decl.object.name;

  // todo: handle globalThis.foo

  // hack: .name
  if (decl.property.name === 'name' && hasFuncWithName(name) && !scope.noFastFuncMembers) {
    // function name can mismatch variable/access name
    name = funcByName(name)?.name ?? name;

    // eg: __String_prototype_toLowerCase -> toLowerCase
    if (name.startsWith('__')) name = name.split('_').pop();
    if (name.startsWith('#')) name = '';

    return withType(scope, makeString(scope, name, true), TYPES.bytestring);
  }

  const object = decl.object;
  const property = getProperty(decl);

  let chainCount = scope.chainMembers != null ? ++scope.chainMembers : 0;

  doNotMarkFuncRef = true;

  // generate now so type is gotten correctly later (it gets cached)
  generate(scope, object);

  doNotMarkFuncRef = false;

  // hack: .length
  if (decl.property.name === 'length') {
    // todo: support optional

    if (!scope.noFastFuncMembers) {
      const func = funcByName(name);
      if (func) return withType(scope, [ number(countLength(func, name)) ], TYPES.number);

      if (Object.hasOwn(builtinFuncs, name)) return withType(scope, [ number(countLength(builtinFuncs[name], name)) ], TYPES.number);
      if (Object.hasOwn(importedFuncs, name)) return withType(scope, [ number(importedFuncs[name].params.length ?? importedFuncs[name].params) ], TYPES.number);
      if (Object.hasOwn(internalConstrs, name)) return withType(scope, [ number(internalConstrs[name].length ?? 0) ], TYPES.number);
    }

    const out = [
      ...generate(scope, object),
      Opcodes.i32_to_u
    ];

    if (Prefs.fastLength) {
      // presume valid length object
      return [
        ...out,

        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        Opcodes.i32_from_u
      ];
    }

    const type = getNodeType(scope, object);
    const known = knownType(scope, type);
    if (known != null && (known & TYPE_FLAGS.length) !== 0) return [
      ...out,

      [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
      Opcodes.i32_from_u
    ];

    const tmp = localTmp(scope, '#length_tmp', Valtype.i32);
    final = [
      ...out,
      [ Opcodes.local_set, tmp ],

      ...type,
      number(TYPE_FLAGS.length, Valtype.i32),
      [ Opcodes.i32_and ],
      [ Opcodes.if, valtypeBinary ],
        [ Opcodes.local_get, tmp ],
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        Opcodes.i32_from_u,

        ...setLastType(scope, TYPES.number),
      [ Opcodes.else ],
      [ Opcodes.end ]
    ];

    if (known != null) {
      final = [];
    } else {
      finalEnd = final.pop();
    }
  }

  // todo/perf: use i32 object (and prop?) locals
  const { objectTmp, propertyTmp, objectGet, propertyGet } = memberTmpNames(scope);
  const type = getNodeType(scope, object);
  const known = knownType(scope, type);

  // todo: generate this array procedurally during builtinFuncs creation
  if (['size', 'description', 'byteLength', 'byteOffset', 'buffer', 'detached', 'resizable', 'growable', 'maxByteLength'].includes(decl.property.name)) {
    // todo: support optional
    const bc = {};
    const cands = Object.keys(builtinFuncs).filter(x => x.startsWith('__') && x.endsWith('_prototype_' + decl.property.name + '$get'));

    if (cands.length > 0) {
      for (const x of cands) {
        const type = TYPES[x.split('_prototype_')[0].slice(2).toLowerCase()];
        if (type == null) continue;

        if (type === known) return generate(scope, {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: x
          },
          arguments: [ object ],
          _protoInternalCall: true
        });

        bc[type] = () => generate(scope, {
          type: 'CallExpression',
          callee: {
            type: 'Identifier',
            name: x
          },
          arguments: [
            [
              objectGet,
              number(type, Valtype.i32)
            ]
          ],
          _protoInternalCall: true
        });
      }
    }

    if (known == null) extraBC = bc;
  }

  const useCoctc = coctcOffset(decl) > 0;
  const coctcObjTmp = useCoctc && localTmp(scope, '#coctc_obj' + uniqId(), Valtype.i32);

  const out = typeSwitch(scope, type, {
    ...(decl.computed ? {
      [TYPES.array]: () => [
        propertyGet,
        Opcodes.i32_to_u,
        number(ValtypeSize[valtype] + 1, Valtype.i32),
        [ Opcodes.i32_mul ],

        objectGet,
        Opcodes.i32_to_u,
        [ Opcodes.i32_add ],
        [ Opcodes.local_tee, localTmp(scope, '#loadArray_offset', Valtype.i32) ],
        [ Opcodes.load, 0, ValtypeSize.i32 ],

        ...setLastType(scope, [
          [ Opcodes.local_get, localTmp(scope, '#loadArray_offset', Valtype.i32) ],
          [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 + ValtypeSize[valtype] ],
        ])
      ],

      [TYPES.string]: () => [
        // allocate out string
        number(8, Valtype.i32),
        [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocateBytes').index ],
        [ Opcodes.local_tee, localTmp(scope, '#member_allocd', Valtype.i32) ],

        // set length to 1
        number(1, Valtype.i32),
        [ Opcodes.i32_store, 0, 0 ],

        // use as pointer for store later
        [ Opcodes.local_get, localTmp(scope, '#member_allocd', Valtype.i32) ],

        propertyGet,
        Opcodes.i32_to_u,

        number(ValtypeSize.i16, Valtype.i32),
        [ Opcodes.i32_mul ],

        objectGet,
        Opcodes.i32_to_u,
        [ Opcodes.i32_add ],

        // load current string ind {arg}
        [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

        // store to new string ind 0
        [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

        // return new string (page)
        [ Opcodes.local_get, localTmp(scope, '#member_allocd', Valtype.i32) ],
        Opcodes.i32_from_u,
        ...setLastType(scope, TYPES.string)
      ],

      [TYPES.bytestring]: () => [
        // allocate out string
        number(8, Valtype.i32),
        [ Opcodes.call, includeBuiltin(scope, '__Porffor_allocateBytes').index ],
        [ Opcodes.local_tee, localTmp(scope, '#member_allocd', Valtype.i32) ],

        // set length to 1
        number(1, Valtype.i32),
        [ Opcodes.i32_store, 0, 0 ],

        // use as pointer for store later
        [ Opcodes.local_get, localTmp(scope, '#member_allocd', Valtype.i32) ],

        propertyGet,
        Opcodes.i32_to_u,

        objectGet,
        Opcodes.i32_to_u,
        [ Opcodes.i32_add ],

        // load current string ind {arg}
        [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ],

        // store to new string ind 0
        [ Opcodes.i32_store8, 0, ValtypeSize.i32 ],

        // return new string (page)
        [ Opcodes.local_get, localTmp(scope, '#member_allocd', Valtype.i32) ],
        Opcodes.i32_from_u,
        ...setLastType(scope, TYPES.bytestring)
      ],

      ...wrapBC({
        [TYPES.uint8array]: [
          [ Opcodes.i32_add ],

          [ Opcodes.i32_load8_u, 0, 4 ],
          Opcodes.i32_from_u
        ],
        [TYPES.uint8clampedarray]: [
          [ Opcodes.i32_add ],

          [ Opcodes.i32_load8_u, 0, 4 ],
          Opcodes.i32_from_u
        ],
        [TYPES.int8array]: [
          [ Opcodes.i32_add ],

          [ Opcodes.i32_load8_s, 0, 4 ],
          Opcodes.i32_from
        ],
        [TYPES.uint16array]: [
          number(2, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],

          [ Opcodes.i32_load16_u, 0, 4 ],
          Opcodes.i32_from_u
        ],
        [TYPES.int16array]: [
          number(2, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],

          [ Opcodes.i32_load16_s, 0, 4 ],
          Opcodes.i32_from
        ],
        [TYPES.uint32array]: [
          number(4, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],

          [ Opcodes.i32_load, 0, 4 ],
          Opcodes.i32_from_u
        ],
        [TYPES.int32array]: [
          number(4, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],

          [ Opcodes.i32_load, 0, 4 ],
          Opcodes.i32_from
        ],
        [TYPES.float32array]: [
          number(4, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],

          [ Opcodes.f32_load, 0, 4 ],
          [ Opcodes.f64_promote_f32 ]
        ],
        [TYPES.float64array]: [
          number(8, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],

          [ Opcodes.f64_load, 0, 4 ]
        ],
      }, {
        prelude: [
          objectGet,
          Opcodes.i32_to_u,
          [ Opcodes.i32_load, 0, 4 ],

          propertyGet,
          Opcodes.i32_to_u
        ],
        postlude: setLastType(scope, TYPES.number)
      }),
    } : {}),

    [TYPES.undefined]: internalThrow(scope, 'TypeError', `Cannot read property of undefined`, true),

    default: () => [
      ...(useCoctc && known === TYPES.object ? [
        [ Opcodes.local_get, coctcObjTmp ],
        number(TYPES.object, Valtype.i32)
      ] : [
        objectGet,
        Opcodes.i32_to,
        ...type
      ]),

      ...toPropertyKey(scope, [ propertyGet ], getNodeType(scope, property), decl.computed, true),

      [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_get').index ],
      ...setLastType(scope)
    ],

    ...extraBC
  });

  if (decl.optional) {
    out.unshift(
      ...generate(scope, property),
      [ Opcodes.local_set, propertyTmp ],

      [ Opcodes.block, valtypeBinary ],
      ...generate(scope, object),
      [ Opcodes.local_tee, objectTmp ],

      ...nullish(scope, [], type, false, true),
      [ Opcodes.if, Blocktype.void ],
        ...setLastType(scope, TYPES.undefined),
        number(0),
        [ Opcodes.br, chainCount ],
      [ Opcodes.end ]
    );

    out.push(
      [ Opcodes.end ]
    );
  } else {
    if (useCoctc) {
      // fast path: COCTC
      const offset = coctcOffset(decl.property.name);

      out.unshift(
        ...generate(scope, decl.object),
        [ Opcodes.local_set, objectTmp ],
        ...coctcSetup(scope, decl.object, coctcObjTmp, 'get', [ [ Opcodes.local_get, objectTmp ] ]),

        [ Opcodes.local_get, coctcObjTmp ],
        [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(offset + 8) ],
        [ Opcodes.local_tee, localTmp(scope, '#coctc_tmp', Valtype.i32) ],
        [ Opcodes.if, Valtype.f64 ],
          [ Opcodes.local_get, coctcObjTmp ],
          [ Opcodes.f64_load, 0, ...unsignedLEB128(offset) ],

          ...setLastType(scope, [
            [ Opcodes.local_get, localTmp(scope, '#coctc_tmp', Valtype.i32) ],
          ]),
        [ Opcodes.else ],
          ...generate(scope, property),
          [ Opcodes.local_set, propertyTmp ]
      );

      out.push(
        [ Opcodes.end ]
      );
    } else {
      out.unshift(
        ...generate(scope, property),
        [ Opcodes.local_set, propertyTmp ],
        ...generate(scope, object),
        [ Opcodes.local_set, objectTmp ]
      );
    }

    // todo: maybe this just needs 1 block?
    if (chainCount > 0) {
      out.unshift(
        [ Opcodes.block, valtypeBinary ]
      );

      out.push(
        [ Opcodes.end ]
      );
    }
  }

  if (final.length > 0) {
    final = final.concat(out);
    final.push(finalEnd);
    return final;
  }

  return out;
};

const generateAwait = (scope, decl) => {
  // hack: implement as ~peeking value `await foo` -> `Porffor.promise.await(foo)`
  return generate(scope, {
    type: 'CallExpression',
    callee: {
      type: 'Identifier',
      name: '__Porffor_promise_await'
    },
    arguments: [
      decl.argument
    ]
  });
};

const generateClass = (scope, decl) => {
  const expr = decl.type === 'ClassExpression';

  const name = decl.id ? decl.id.name : `#anonymous${uniqId()}`;
  if (!expr) hoist(scope, name, 2, true);

  const body = decl.body.body;
  const root = {
    type: 'Identifier',
    name
  };
  const proto = getObjProp(root, 'prototype');

  const [ func, out ] = generateFunc(scope, {
    ...(body.find(x => x.kind === 'constructor')?.value ?? {
      type: 'FunctionExpression',
      params: [],
      body: {
        type: 'BlockStatement',
        body: []
      }
    }),
    id: root,
    strict: true,
    type: expr ? 'FunctionExpression' : 'FunctionDeclaration',
    _onlyConstr: true,
    _subclass: !!decl.superClass
  });

  // always generate class constructor funcs
  func.generate();

  if (decl.superClass) {
    out.push(
      // class Foo {}
      // class Bar extends Foo {}
      // Bar.__proto__ = Foo
      ...generate(scope, {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '__Porffor_object_setPrototype' },
        arguments: [
          root,
          decl.superClass
        ]
      }),
      [ Opcodes.drop ],

      // Bar.prototype.__proto__ = Foo.prototype
      ...generate(scope, {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '__Porffor_object_setPrototype' },
        arguments: [
          proto,
          getObjProp(decl.superClass, 'prototype')
        ]
      }),
      [ Opcodes.drop ]
    );
  }

  scope.overrideThis = generate(scope, root);
  scope.overrideThisType = TYPES.function;

  for (const x of body) {
    let { type, value, kind, static: _static, computed } = x;
    if (kind === 'constructor') continue;

    // tag function as not a constructor
    if (type === 'MethodDefinition') value._method = true;

    if (type === 'StaticBlock') {
      // todo: make this more compliant
      out.push(
        ...generate(scope, {
          type: 'BlockStatement',
          body: x.body
        }),
        [ Opcodes.drop ]
      );
      continue;
    }

    const key = getProperty(x, true);
    let object = _static ? root : proto;

    let initKind = type === 'MethodDefinition' ? 'method' : 'value';
    if (kind === 'get' || kind === 'set') initKind = kind;

    // default value to undefined
    value ??= DEFAULT_VALUE();

    if (isFuncType(value.type)) {
      let id = value.id;

      // todo: support computed names properly
      if (typeof key.value === 'string') id ??= {
        type: 'Identifier',
        name: key.value
      };

      value = {
        ...value,
        id,
        strict: true,
        _onlyThisMethod: true
      };
    }

    if (type === 'PropertyDefinition' && !_static) {
      // define in construction instead
      object = {
        type: 'ThisExpression',
        _noGlobalThis: true
      };

      let computedTmp;
      if (computed) {
        // compute now, reference in construction
        computedTmp = allocVar(scope, `#class_computed_prop${uniqId()}`, true, true, false, true);

        out.push(
          ...toPropertyKey(scope, generate(scope, key), getNodeType(scope, key), computed, true),
          [ Opcodes.global_set, computedTmp + 1 ],
          [ Opcodes.global_set, computedTmp ]
        );
      }

      func.wasm.unshift(
        ...generate(func, object),
        Opcodes.i32_to_u,
        ...getNodeType(func, object),

        ...(computed ? [
          [ Opcodes.global_get, computedTmp ],
          [ Opcodes.global_get, computedTmp + 1 ],
        ] : [
          ...generate(func, key),
          Opcodes.i32_to_u,
          ...getNodeType(func, key)
        ]),

        ...generate(func, value),
        ...(initKind !== 'value' && initKind !== 'method' ? [ Opcodes.i32_to_u ] : []),
        ...getNodeType(func, value),

        [ Opcodes.call, includeBuiltin(func, `__Porffor_object_class_${initKind}`).index ]
      );
    } else {
      out.push(
        ...generate(scope, object),
        Opcodes.i32_to_u,
        ...getNodeType(scope, object),

        ...toPropertyKey(scope, generate(scope, key), getNodeType(scope, key), computed, true),

        ...generate(scope, value),
        ...(initKind !== 'value' && initKind !== 'method' ? [ Opcodes.i32_to_u ] : []),
        ...getNodeType(scope, value),

        [ Opcodes.call, includeBuiltin(scope, `__Porffor_object_class_${initKind}`).index ]
      );
    }
  }

  delete scope.overrideThis;
  delete scope.overrideThisType;

  // error if not being constructed
  func.wasm.unshift(
    [ Opcodes.local_get, func.locals['#newtarget'].idx ],
    Opcodes.i32_to_u,
    [ Opcodes.i32_eqz ],
    [ Opcodes.if, Blocktype.void ],
      ...internalThrow(func, 'TypeError', `Class constructor ${name} requires 'new'`),
    [ Opcodes.end ]
  );

  return out;
};

const generateTemplate = (scope, decl) => {
  let current = null;
  const append = val => {
    if (!current) {
      current = val;
      return;
    }

    current = {
      type: 'BinaryExpression',
      operator: '+',
      left: current,
      right: val
    };
  };

  const { expressions, quasis } = decl;
  for (let i = 0; i < quasis.length; i++) {
    append({
      type: 'Literal',
      value: quasis[i].value.cooked
    });

    if (i < expressions.length) {
      append(expressions[i]);
    }
  }

  return generate(scope, current);
};

const generateTaggedTemplate = (scope, decl, global = false, name = undefined, valueUnused = false) => {
  const intrinsics = {
    __Porffor_wasm: str => {
      let out = [];

      str = str.replaceAll('\\n', '\n');
      for (const line of str.split('\n')) {
        const asm = line.trim().split(';;')[0].split(' ').filter(x => x);
        if (!asm[0]) continue; // blank

        if (asm[0] === 'local') {
          const [ name, type ] = asm.slice(1);
          scope.locals[name] = { idx: scope.localInd++, type: Valtype[type] };
          continue;
        }

        if (asm[0] === 'returns') {
          scope.returns = asm.slice(1).map(x => Valtype[x]);
          continue;
        }

        let inst = Opcodes[asm[0].replace('.', '_')];
        if (inst == null) throw new Error(`inline asm: inst ${asm[0]} not found`);
        if (!Array.isArray(inst)) inst = [ inst ];

        const immediates = asm.slice(1).map(x => {
          const n = parseFloat(x);
          if (Number.isNaN(n) && x !== 'NaN') {
            if (builtinFuncs[x]) {
              if (funcIndex[x] == null) includeBuiltin(scope, x);
              return funcIndex[x];
            }

            return scope.locals[x]?.idx ?? globals[x]?.idx ?? (log.warning('codegen', `unknown immediate in Porffor.wasm: ${x}`) || 0);
          }

          return n;
        });

        const encodeFunc = ({
          [Opcodes.f64_const]: x => x,
          [Opcodes.if]: unsignedLEB128,
          [Opcodes.loop]: unsignedLEB128
        })[inst[0]] ?? signedLEB128;
        out.push([ ...inst, ...immediates.flatMap(x => encodeFunc(x)) ]);
      }

      // add value to stack if value unused as 99% typically means
      // no value on stack at end of wasm
      // unless final op is return
      if (valueUnused && out.at(-1)[0] !== Opcodes.return) out.push(number(UNDEFINED));

      return out;
    },

    __Porffor_bs: str => makeString(scope, str, true),
    __Porffor_s: str => makeString(scope, str, false)
  };

  const { quasis, expressions } = decl.quasi;
  if (intrinsics[decl.tag.name]) {
    let str = quasis[0].value.raw;

    for (let i = 0; i < expressions.length; i++) {
      const e = expressions[i];
      if (!e.name) {
        if (e.type === 'BinaryExpression' && e.operator === '+' && e.left.type === 'Identifier' && e.right.type === 'Literal') {
          str += lookupName(scope, e.left.name)[0].idx + e.right.value;
        }
      } else str += lookupName(scope, e.name)[0].idx;

      str += quasis[i + 1].value.raw;
    }

    return cacheAst(decl, intrinsics[decl.tag.name](str));
  }

  return generate(scope, {
    type: 'CallExpression',
    callee: decl.tag,
    arguments: [
      { // strings
        type: 'ArrayExpression',
        elements: quasis.map(x => ({
          type: 'Literal',
          value: x.value.cooked
        }))
      },
      ...expressions
    ]
  });
};

globalThis._uniqId = 0;
const uniqId = () => '_' + globalThis._uniqId++;

let objectHackers = [];
const objectHack = node => {
  if (!node) return node;

  if (node.type === 'MemberExpression') {
    const out = (() => {
      const abortOut = { ...node, object: objectHack(node.object) };
      if (node.computed || node.optional) return;

      // hack: block these properties as they can be accessed on functions
      if (node.object.name !== 'Porffor' && (node.property.name === 'length' || node.property.name === 'name' || node.property.name === 'call')) return abortOut;
      if (node.property.name === '__proto__') return abortOut;

      let objectName = node.object.name;

      // if object is not identifier or another member exp, give up
      if (node.object.type !== 'Identifier' && node.object.type !== 'MemberExpression') return abortOut;
      if (objectName && ['undefined', 'null', 'NaN', 'Infinity'].includes(objectName)) return abortOut;

      if (!objectName) objectName = objectHack(node.object)?.name?.slice?.(2);
      if (!objectName || (!objectHackers.includes(objectName) && !objectHackers.some(x => objectName.startsWith(`${x}_`)))) {
        return abortOut;
      }

      if (objectName !== 'Object_prototype' && (node.property.name === 'propertyIsEnumerable' || node.property.name === 'hasOwnProperty' || node.property.name === 'isPrototypeOf')) return abortOut;

      const name = '__' + objectName + '_' + node.property.name;
      if ((!hasFuncWithName(name) && !Object.hasOwn(builtinVars, name) && !isExistingProtoFunc(name) && !hasFuncWithName(name + '$get')) && (hasFuncWithName(objectName) || Object.hasOwn(builtinVars, objectName) || hasFuncWithName('__' + objectName) || Object.hasOwn(builtinVars, '__' + objectName))) return abortOut;

      if (Prefs.codeLog) log('codegen', `object hack! ${node.object.name}.${node.property.name} -> ${name}`);

      return {
        type: 'Identifier',
        name
      };
    })();

    if (out) return out;
  }

  for (const x in node) {
    if (node[x] != null && typeof node[x] === 'object') {
      if (node[x].type) node[x] = objectHack(node[x]);
      if (Array.isArray(node[x])) node[x] = node[x].map(objectHack);
    }
  }

  return node;
};

const funcByIndex = idx => {
  if (idx == null ||
      idx < importedFuncs.length) return null;

  const func = funcs[idx - importedFuncs.length];
  if (func && func.index === idx) return func;

  return funcs.find(x => x.index === idx);
};
const funcByName = name => funcByIndex(funcIndex[name]);

const generateFunc = (scope, decl, forceNoExpr = false) => {
  doNotMarkFuncRef = false;

  const name = decl.id ? decl.id.name : `#anonymous${uniqId()}`;
  if (decl.type.startsWith('Class')) {
    const out = generateClass(scope, {
      ...decl,
      id: { name }
    });

    const func = funcByName(name);
    astCache.set(decl, out);
    return [ func, out ];
  }

  const params = decl.params ?? [];

  // TODO: share scope/locals between !!!
  const arrow = decl.type === 'ArrowFunctionExpression' || decl.type === 'Program';
  const func = {
    start: decl.start,
    locals: {},
    localInd: 0,
    returns: [ valtypeBinary, Valtype.i32 ], // value, type
    name,
    index: currentFuncIndex++,
    arrow,
    constr: !arrow && !decl.generator && !decl.async && !decl._method, // constructable
    method: decl._method || decl.generator || decl.async, // has this but not constructable
    async: decl.async,
    subclass: decl._subclass, _onlyConstr: decl._onlyConstr, _onlyThisMethod: decl._onlyThisMethod,
    strict: scope.strict || decl.strict,
    inferTree: [ decl ],

    generate() {
      if (func.wasm) return func.wasm;

      // generating, stub _wasm
      let wasm = func.wasm = [];

      let body = objectHack(decl.body);
      if (decl.type === 'ArrowFunctionExpression' && decl.expression) {
        // hack: () => 0 -> () => return 0
        body = {
          type: 'ReturnStatement',
          argument: decl.body
        };
      }

      if (globalThis.precompile) {
        globalThis.funcBodies ??= {};
        globalThis.funcBodies[name] = body;
      }

      if (body.type === 'BlockStatement') {
        // hoist function declarations to the top of AST pre-codegen so
        // we can optimize function calls so calls before decl are not indirect
        // (without more post-codegen jank)
        // plus, more spec-compliant hoisting!

        let b = body.body, j = 0;

        // append after directive if it exists
        if (b[0]?.directive) j++;

        for (let i = 0; i < b.length; i++) {
          if (b[i].type === 'FunctionDeclaration') {
            b.splice(j++, 0, b.splice(i, 1)[0]);
          }
        }
      }

      func.identFailEarly = true;
      let localInd = args.length * 2;
      for (let i = 0; i < args.length; i++) {
        const { name, def, destr, type } = args[i];

        func.localInd = i * 2;
        allocVar(func, name, false, true, true);

        func.localInd = localInd;
        if (type) {
          const typeAnno = extractTypeAnnotation(type);
          addVarMetadata(func, name, false, typeAnno);

          // automatically add throws if unexpected this type to builtins
          if (globalThis.precompile && i === 0 && func.name.includes('_prototype_') && !func.name.startsWith('__Porffor_')) {
            if (typeAnno.type === TYPES.array) {
              // Array.from
              wasm.push(
                [ Opcodes.local_get, func.locals[name].idx + 1 ],
                number(TYPES.array, Valtype.i32),
                [ Opcodes.i32_ne ],
                [ Opcodes.if, Blocktype.void ],
                  [ Opcodes.local_get, func.locals[name].idx ],
                  [ Opcodes.local_get, func.locals[name].idx + 1 ],
                  number(0),
                  number(TYPES.undefined, Valtype.i32),
                  [ Opcodes.call, includeBuiltin(scope, '__Array_from').index ],
                  [ Opcodes.local_set, func.locals[name].idx ],

                  number(TYPES.array, Valtype.i32),
                  [ Opcodes.local_set, func.locals[name].idx + 1 ],
                [ Opcodes.end ]
              );
            }

            if ([
              TYPES.date, TYPES.number, TYPES.promise, TYPES.symbol, TYPES.function,
              TYPES.set, TYPES.map,
              TYPES.weakref, TYPES.weakset, TYPES.weakmap,
              TYPES.arraybuffer, TYPES.sharedarraybuffer, TYPES.dataview
            ].includes(typeAnno.type)) {
              let types = [ typeAnno.type ];
              if (typeAnno.type === TYPES.number) types.push(TYPES.numberobject);
              if (typeAnno.type === TYPES.string) types.push(TYPES.stringobject);

              wasm.push(
                ...typeIsNotOneOf([ [ Opcodes.local_get, func.locals[name].idx + 1 ] ], types),
                [ Opcodes.if, Blocktype.void ],
                  ...internalThrow(func, 'TypeError', `${unhackName(func.name)} expects 'this' to be a ${TYPE_NAMES[typeAnno.type]}`),
                [ Opcodes.end ]
              );
            }
          }

          // todo: if string, try converting to it to one
        }

        if (def) wasm.push(
          ...getType(func, name),
          number(TYPES.undefined, Valtype.i32),
          [ Opcodes.i32_eq ],
          [ Opcodes.if, Blocktype.void ],
            ...generate(func, def, false, name),
            [ Opcodes.local_set, func.locals[name].idx ],

            ...setType(func, name, getNodeType(func, def), true),
          [ Opcodes.end ]
        );

        if (destr) wasm.push(
          ...generateVarDstr(func, 'var', destr, { type: 'Identifier', name }, undefined, false)
        );

        localInd = func.localInd;
      }

      func.identFailEarly = false;

      if (globalThis.valtypeOverrides) {
        if (globalThis.valtypeOverrides.returns[name]) func.returns = globalThis.valtypeOverrides.returns[name];
        if (globalThis.valtypeOverrides.params[name]) {
          func.params = globalThis.valtypeOverrides.params[name];

          const localsVals = Object.values(func.locals);
          for (let i = 0; i < func.params.length; i++) {
            localsVals[i].type = func.params[i];
          }
        }
      }

      if (decl.generator) {
        func.generator = true;

        // make out generator local
        allocVar(func, '#generator_out', false, false);
        typeUsed(func, func.async ? TYPES.__porffor_asyncgenerator : TYPES.__porffor_generator);
      }

      if (func.async && !func.generator) {
        // make out promise local
        allocVar(func, '#async_out_promise', false, false);
        typeUsed(func, TYPES.promise);
      }

      const preface = wasm;
      wasm = generate(func, body);
      wasm.unshift(...preface);

      if (name === '#main') {
        func.gotLastType = true;
        func.export = true;

        wasm.push(...getNodeType(func, getLastNode(decl.body.body)));

        // inject promise job runner func at the end of main if promises are made
        if (Object.hasOwn(funcIndex, 'Promise') || Object.hasOwn(funcIndex, '__Promise_resolve') || Object.hasOwn(funcIndex, '__Promise_reject')) {
          wasm.push(
            [ Opcodes.call, includeBuiltin(func, '__Porffor_promise_runJobs').index ]
          );
        }
      } else {
        // add end empty return if not found
        if (wasm[wasm.length - 1]?.[0] !== Opcodes.return) {
          wasm.push(
            [ Opcodes.drop ],
            ...generateReturn(func, {})
          );
        }
      }

      if (func.generator) {
        // make generator at the start
        wasm.unshift(
          [ Opcodes.call, includeBuiltin(func, '__Porffor_allocate').index ],
          Opcodes.i32_from_u,
          number(TYPES.array, Valtype.i32),

          [ Opcodes.call, includeBuiltin(func, func.async ? '__Porffor_AsyncGenerator' : '__Porffor_Generator').index ],
          [ Opcodes.local_set, func.locals['#generator_out'].idx ]
        );
      } else if (func.async) {
        // make promise at the start
        wasm.unshift(
          [ Opcodes.call, includeBuiltin(func, '__Porffor_promise_create').index ],
          [ Opcodes.local_set, func.locals['#async_out_promise'].idx ],

          // wrap in try for later catch
          [ Opcodes.try, Blocktype.void ]
        );

        // reject with thrown value if caught error
        wasm.push(
          [ Opcodes.catch, 0 ],
            [ Opcodes.local_get, func.locals['#async_out_promise'].idx ],
            number(TYPES.promise, Valtype.i32),

            [ Opcodes.call, includeBuiltin(func, '__Porffor_promise_reject').index ],
          [ Opcodes.end ],

          // return promise at the end of func
          [ Opcodes.local_get, func.locals['#async_out_promise'].idx ],
          ...(scope.returnType != null ? [] : [ number(TYPES.promise, Valtype.i32) ]),
          [ Opcodes.return ]
        );

        // ensure tag exists for specific catch
        ensureTag();
      }

      return func.wasm = wasm;
    }
  };

  funcIndex[name] = func.index;
  funcs.push(func);

  if (typedInput && decl.returnType) {
    const { type } = extractTypeAnnotation(decl.returnType);
    if (type != null) {
      typeUsed(func, type);
      func.returnType = type;
      func.returns = func.returnType === TYPES.undefined && !func.async && !func.generator ? [] : [ valtypeBinary ];
    }
  }

  const args = [];
  if (func.constr) args.push({ name: '#newtarget' }, { name: '#this' });
  if (func.method) args.push({ name: '#this' });

  let jsLength = 0;
  for (let i = 0; i < params.length; i++) {
    let name, def, destr;
    const x = params[i];
    switch (x.type) {
      case 'Identifier': {
        name = x.name;
        jsLength++;
        break;
      }

      case 'AssignmentPattern': {
        def = x.right;
        if (x.left.name) {
          name = x.left.name;
        } else {
          name = '#arg_dstr' + i;
          destr = x.left;
        }

        break;
      }

      case 'RestElement': {
        name = x.argument.name;
        func.hasRestArgument = true;
        break;
      }

      default:
        name = '#arg_dstr' + i;
        destr = x;
        jsLength++;
        break;
    }

    args.push({ name, def, destr, type: typedInput && params[i].typeAnnotation });
  }

  func.params = new Array((params.length + (func.constr ? 2 : (func.method ? 1 : 0))) * 2).fill(0).map((_, i) => i % 2 ? Valtype.i32 : valtypeBinary);
  func.jsLength = jsLength;

  // force generate for main
  if (name === '#main') func.generate();

  // force generate all for precompile
  if (globalThis.precompile) func.generate();

  if (decl._doNotMarkFuncRef) doNotMarkFuncRef = true;
  const out = decl.type.endsWith('Expression') && !forceNoExpr ? funcRef(func) : [ number(UNDEFINED) ];
  doNotMarkFuncRef = false;

  astCache.set(decl, out);
  return [ func, out ];
};

const generateBlock = (scope, decl) => {
  let out = [];

  scope.inferTree ??= [];
  scope.inferTree.push(decl);

  let len = decl.body.length, j = 0;
  for (let i = 0; i < len; i++) {
    const x = decl.body[i];
    if (isEmptyNode(x)) continue;

    if (j++ > 0) out.push([ Opcodes.drop ]);
    out = out.concat(generate(scope, x));
  }

  scope.inferTree.pop();

  if (out.length === 0) out.push(number(UNDEFINED));
  return out;
};

const internalConstrs = {
  __Array_of: {
    // this is not a constructor but best fits internal structure here
    generate: (scope, decl, global, name) => {
      // Array.of(i0, i1, ...)
      return generateArray(scope, {
        elements: decl.arguments
      }, global, name);
    },
    type: TYPES.array,
    notConstr: true,
    length: 0
  },

  __Porffor_fastOr: {
    generate: (scope, decl) => {
      const out = [];

      for (let i = 0; i < decl.arguments.length; i++) {
        out.push(
          ...generate(scope, decl.arguments[i]),
          Opcodes.i32_to_u,
          ...(i > 0 ? [ [ Opcodes.i32_or ] ] : [])
        );
      }

      out.push(Opcodes.i32_from_u);

      return out;
    },
    type: TYPES.boolean,
    notConstr: true
  },

  __Porffor_fastAnd: {
    generate: (scope, decl) => {
      const out = [];

      for (let i = 0; i < decl.arguments.length; i++) {
        out.push(
          ...generate(scope, decl.arguments[i]),
          Opcodes.i32_to_u,
          ...(i > 0 ? [ [ Opcodes.i32_and ] ] : [])
        );
      }

      out.push(Opcodes.i32_from_u);

      return out;
    },
    type: TYPES.boolean,
    notConstr: true
  },

  __Math_max: {
    generate: (scope, decl) => {
      const out = [
        number(-Infinity)
      ];

      for (let i = 0; i < decl.arguments.length; i++) {
        out.push(
          ...generate(scope, decl.arguments[i]),
          [ Opcodes.f64_max ]
        );
      }

      return out;
    },
    type: TYPES.number,
    notConstr: true,
    length: 2
  },

  __Math_min: {
    generate: (scope, decl) => {
      const out = [
        number(Infinity)
      ];

      for (let i = 0; i < decl.arguments.length; i++) {
        out.push(
          ...generate(scope, decl.arguments[i]),
          [ Opcodes.f64_min ]
        );
      }

      return out;
    },
    type: TYPES.number,
    notConstr: true,
    length: 2
  },

  __Porffor_printStatic: {
    generate: (scope, decl) => {
      scope.usesImports = true;

      const str = decl.arguments[0].value;
      const out = printStaticStr(str);
      out.push(number(UNDEFINED));
      return out;
    },
    type: TYPES.undefined,
    notConstr: true,
    length: 1
  },

  __Porffor_type: {
    generate: (scope, decl) => [
      ...getNodeType(scope, decl.arguments[0]),
      Opcodes.i32_from_u
    ],
    type: TYPES.number,
    notConstr: true,
    length: 1
  },

  __Porffor_compileType: {
    generate: (scope, decl) => makeString(scope, TYPE_NAMES[knownType(scope, getNodeType(scope, decl.arguments[0]))] ?? 'unknown'),
    type: TYPES.bytestring,
    notConstr: true,
    length: 1
  },

  __Porffor_call: {
    // Porffor.call(func, argArray, this, newTarget)
    generate: (scope, decl) => generate(scope, {
      type: 'CallExpression',
      callee: decl.arguments[0],
      arguments: [ {
        type: 'SpreadElement',
        argument: decl.arguments[1],
      } ],
      _thisWasm: decl.arguments[2].value === null ? null : [
        ...generate(scope, decl.arguments[2]),
        ...getNodeType(scope, decl.arguments[2])
      ],
      _newTargetWasm: decl.arguments[3].value === null ? null : [
        ...generate(scope, decl.arguments[3]),
        ...getNodeType(scope, decl.arguments[3])
      ],
      _new: decl.arguments[3].value !== null,
      _forceCreateThis: true
    }),
    notConstr: true,
    length: 1
  }
};

let globals, tags, exceptions, funcs, indirectFuncs, funcIndex, currentFuncIndex, depth, pages, data, typeswitchDepth, usedTypes, coctc, globalInfer, builtinFuncs, builtinVars, prototypeFuncs;
export default program => {
  globals = { ['#ind']: 0 };
  tags = [];
  exceptions = [];
  funcs = []; indirectFuncs = [];
  funcIndex = {};
  depth = [];
  pages = new Map();
  data = [];
  currentFuncIndex = importedFuncs.length;
  typeswitchDepth = 0;
  usedTypes = new Set([ TYPES.empty, TYPES.undefined, TYPES.number, TYPES.boolean, TYPES.function ]);
  coctc = new Map();
  globalInfer = new Map();

  // set generic opcodes for current valtype
  const valtypeInd = ['i32', 'i64', 'f64'].indexOf(valtype);
  Opcodes.const = [ Opcodes.i32_const, Opcodes.i64_const, Opcodes.f64_const ][valtypeInd];
  Opcodes.eq = [ Opcodes.i32_eq, Opcodes.i64_eq, Opcodes.f64_eq ][valtypeInd];
  Opcodes.eqz = [ [ [ Opcodes.i32_eqz ] ], [ [ Opcodes.i64_eqz ] ], [ number(0), [ Opcodes.f64_eq ] ] ][valtypeInd];
  Opcodes.mul = [ Opcodes.i32_mul, Opcodes.i64_mul, Opcodes.f64_mul ][valtypeInd];
  Opcodes.add = [ Opcodes.i32_add, Opcodes.i64_add, Opcodes.f64_add ][valtypeInd];
  Opcodes.sub = [ Opcodes.i32_sub, Opcodes.i64_sub, Opcodes.f64_sub ][valtypeInd];
  Opcodes.i32_to = [ [], [ Opcodes.i32_wrap_i64 ], Opcodes.i32_trunc_sat_f64_s ][valtypeInd];
  Opcodes.i32_to_u = [ [], [ Opcodes.i32_wrap_i64 ], Opcodes.i32_trunc_sat_f64_u ][valtypeInd];
  Opcodes.i32_from = [ [], [ Opcodes.i64_extend_i32_s ], [ Opcodes.f64_convert_i32_s ] ][valtypeInd];
  Opcodes.i32_from_u = [ [], [ Opcodes.i64_extend_i32_u ], [ Opcodes.f64_convert_i32_u ] ][valtypeInd];
  Opcodes.load = [ Opcodes.i32_load, Opcodes.i64_load, Opcodes.f64_load ][valtypeInd];
  Opcodes.store = [ Opcodes.i32_store, Opcodes.i64_store, Opcodes.f64_store ][valtypeInd];

  builtinFuncs = new BuiltinFuncs();
  builtinVars = new BuiltinVars({ builtinFuncs });
  prototypeFuncs = new PrototypeFuncs();

  const getObjectName = x => x.startsWith('__') && x.slice(2, x.indexOf('_', 2));
  objectHackers = ['assert', 'compareArray', 'Test262Error', ...new Set(Object.keys(builtinFuncs).map(getObjectName).concat(Object.keys(builtinVars).map(getObjectName)).filter(x => x))];

  const [ main ] = generateFunc({}, {
    type: 'Program',
    id: { name: '#main' },
    body: {
      type: 'BlockStatement',
      body: program.body
    }
  });

  // if wanted and blank main func and other exports, remove it
  if (Prefs.rmBlankMain && main.wasm.length === 0 && funcs.some(x => x.export)) funcs.splice(main.index - importedFuncs.length, 1);

  for (let i = 0; i < funcs.length; i++) {
    const f = funcs[i];

    const wasm = f.wasm;
    if (wasm) {
      // func was generated, run callback ops
      for (let j = 0; j < wasm.length; j++) {
        const o = wasm[j];
        if (o[0] === null && typeof o[1] === 'function') {
          wasm.splice(j--, 1, ...o[1]());
        }
      }

      continue;
    }

    // func was never generated, make wasm just return 0s for expected returns
    f.wasm = f.returns.map(x => number(0, x));
  }

  // add indirect funcs to end of funcs
  for (let i = 0; i < indirectFuncs.length; i++) {
    const f = indirectFuncs[i];
    f.index = currentFuncIndex++;
    funcs.push(f);
  }

  delete globals['#ind'];

  return { funcs, globals, tags, exceptions, pages, data };
};