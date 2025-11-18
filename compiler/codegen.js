import { Blocktype, Opcodes, Valtype, ValtypeSize } from './wasmSpec.js';
import { number, ieee754_binary64, signedLEB128, unsignedLEB128, encodeVector } from './encoding.js';
import { operatorOpcode } from './expression.js';
import { BuiltinFuncs, BuiltinVars, importedFuncs, NULL, UNDEFINED } from './builtins.js';
import { TYPES, TYPE_FLAGS, TYPE_NAMES } from './types.js';
import semantic from './semantic.js';
import parse from './parse.js';
import { log } from './log.js';
import './prefs.js';

const pagePtr = ind => {
  if (ind === 0) return 16;
  return ind * pageSize;
};

const allocPage = (scope, name) => {
  if (!name.startsWith('#')) {
    name = `${scope.name}/${name}`;
    if (globalThis.precompile) name = `${globalThis.precompile}/${name}`;
  }

  if (pages.has(name)) {
    return pagePtr(pages.get(name));
  }

  const ind = pages.size;
  pages.set(name, ind);

  scope.pages ??= new Map();
  scope.pages.set(name, ind);

  return pagePtr(ind);
};

const allocBytes = (scope, reason, bytes) => {
  bytes += 2; // overallocate by 2 bytes to ensure null termination

  const allocs = pages.allocs ??= new Map();
  const bins = pages.bins ??= [];

  if (allocs.has(reason)) {
    return allocs.get(reason);
  }

  let startingPtr = 0;
  while (bytes > 0) {
    const alloc = Math.min(bytes, pageSize);
    bytes -= alloc;

    let bin = bins.find(x => (pageSize - x.used) >= alloc);
    if (!bin) {
      // new bin
      const page = pages.size;
      bin = {
        used: 0,
        page
      };

      const id = bins.push(bin);
      pages.set(`#bin: ${id}`, page);
    }

    if (!startingPtr) startingPtr = pagePtr(bin.page) + bin.used;
    bin.used += alloc;
  }

  allocs.set(reason, startingPtr);
  return startingPtr;
};

export const allocStr = (scope, str, bytestring) => {
  // basic string interning for ~free
  const bytes = 4 + str.length * (bytestring ? 1 : 2);
  return allocBytes(scope, str, bytes);
};


const isFuncType = type =>
  type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression' ||
  type === 'ClassDeclaration' || type === 'ClassExpression';
const hasFuncWithName = name =>
  name in funcIndex || name in builtinFuncs || name in importedFuncs;

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

  const wrapperArgc = Prefs.indirectWrapperArgc ?? 16;
  if (!func.wrapperFunc) {
    const locals = {
      ['#length']: { idx: 0, type: Valtype.i32 }
    }, params = [
      Valtype.i32
    ];

    for (let i = 0; i < wrapperArgc + 2; i++) {
      params.push(valtypeBinary, Valtype.i32);
      locals[`#${i}`] = { idx: 1 + i * 2, type: valtypeBinary };
      locals[`#${i}#type`] = { idx: 2 + i * 2, type: Valtype.i32 };
    }
    let localInd = 1 + (wrapperArgc + 2) * 2;

    if (indirectFuncs.length === 0) {
      // add empty indirect func
      const emptyFunc = {
        constr: true, internal: true, indirect: true,
        name: '#indirect#empty',
        params,
        locals: { ...locals }, localInd,
        returns: [ valtypeBinary, Valtype.i32 ],
        wasm: [
          number(0),
          number(0, Valtype.i32)
        ],
        wrapperOf: {
          name: '',
          jsLength: 0
        },
        indirectIndex: 0
      };

      // check not being constructed
      emptyFunc.wasm.unshift(
        [ Opcodes.local_get, 1 ], // new.target value
        Opcodes.i32_to_u,
        [ Opcodes.if, Blocktype.void ], // if value is non-zero
          ...internalThrow(emptyFunc, 'TypeError', `Function is not a constructor`), // throw type error
        [ Opcodes.end ]
      );

      // have empty func as indirect funcs 0 and 1
      indirectFuncs.push(emptyFunc, emptyFunc);
    }

    const wasm = [];
    const name = '#indirect_' + func.name;
    const wrapperFunc = {
      constr: true, internal: true, indirect: true,
      name, params, locals, localInd,
      returns: [ valtypeBinary, Valtype.i32 ],
      wasm,
      wrapperOf: func,
      indirectIndex: indirectFuncs.length
    };

    indirectFuncs.push(wrapperFunc);

    wrapperFunc.jsLength = countLength(func);
    func.wrapperFunc = wrapperFunc;

    const paramCount = countParams(func, name);
    const args = [];
    for (let i = 0; i < paramCount - (func.hasRestArgument ? 1 : 0); i++) {
      args.push({
        type: 'Identifier',
        name: `#${i + 2}`
      });
    }

    if (func.hasRestArgument) {
      const array = (wrapperFunc.localInd += 2) - 2;
      locals['#array#i32'] = { idx: array, type: Valtype.i32 };
      locals['#array'] = { idx: array + 1, type: valtypeBinary };

      wasm.push(
        [ Opcodes.call, includeBuiltin(wrapperFunc, '__Porffor_allocate').index ],
        [ Opcodes.local_tee, array ],
        Opcodes.i32_from_u,
        [ Opcodes.local_set, array + 1 ],

        [ Opcodes.local_get, array ],
        [ Opcodes.local_get, 0 ],
        number(paramCount - 1, Valtype.i32),
        [ Opcodes.i32_sub ],
        [ Opcodes.i32_store, 0, 0 ]
      );

      let offset = 4;
      for (let i = paramCount - 1; i < wrapperArgc; i++) {
        wasm.push(
          [ Opcodes.local_get, array ],
          [ Opcodes.local_get, 5 + i * 2 ],
          [ Opcodes.f64_store, 0, ...unsignedLEB128(offset) ],

          [ Opcodes.local_get, array ],
          [ Opcodes.local_get, 6 + i * 2 ],
          [ Opcodes.i32_store8, 0, ...unsignedLEB128(offset + 8) ],
        );
        offset += 9;
      }

      args.push({
        type: 'SpreadElement',
        argument: {
          type: 'Identifier',
          name: '#array',
          _type: TYPES.array
        }
      });
    }

    wasm.push(...generate(wrapperFunc, {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: func.name
      },
      _funcIdx: func.index,
      arguments: args,
      _insideIndirect: true,
      _newTargetWasm: [
        [ Opcodes.local_get, 1 ],
        [ Opcodes.local_get, 2 ]
      ],
      _thisWasm: [
        [ Opcodes.local_get, 3 ],
        [ Opcodes.local_get, 4 ]
      ]
    }));

    if (func.returns[0] === Valtype.i32) {
      if (func.returns.length === 2) {
        const localIdx = wrapperFunc.localInd++;
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

    if (!func.constr) {
      // check not being constructed
      wasm.unshift(
        [ Opcodes.local_get, 1 ], // new.target value
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
      // ignore body-less function definitions, likely ts overload signatures
      if (!decl.body) {
        return cacheAst(decl, [ number(UNDEFINED) ]);
      }
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
      if (!decl.declaration) return internalThrow(scope, 'Error', 'porffor: unsupported export declaration', true);

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

    case 'WithStatement':
      if (Prefs.d) log.warning('codegen', 'with is not supported, treating as expression');
      return cacheAst(decl, generate(scope, decl.body));

    case 'PrivateIdentifier':
      return cacheAst(decl, generate(scope, {
        type: 'Literal',
        value: privateIDName(decl.name)
      }));

    case 'TSEnumDeclaration':
      return cacheAst(decl, generateEnum(scope, decl));

    default:
      // ignore typescript nodes
      if (decl.type.startsWith('TS') ||
          decl.type === 'ImportDeclaration' && decl.importKind === 'type') {
        return cacheAst(decl, [ number(UNDEFINED) ]);
      }

      return cacheAst(decl, internalThrow(scope, 'Error', `porffor: no generation for ${decl.type}`, true));
  }
};

const generateEnum = (scope, decl) => {
  // todo: opt const enum into compile-time values

  if (decl.body) decl = decl.body; // non-standard ast node :)

  const properties = [];

  let value = -1;
  for (const x of decl.members) {
    if (x.initializer) {
      value = x.initializer;
    } else {
      if (typeof value === 'number') {
        value = {
          type: 'Literal',
          value: value + 1
        };
      } else {
        value = {
          type: 'Identifier',
          value: undefined
        };
      }
    }

    // enum.key = value
    properties.push({
      key: x.id,
      value,
      kind: 'init'
    });

    // enum[value] = key
    properties.push({
      key: value,
      value: {
        type: 'Literal',
        value: x.id.name
      },
      computed: true,
      kind: 'init'
    });

    value = value?.value;
  }

  return [
    ...generateVarDstr(scope, decl.const ? 'const' : 'let', decl.id, {
      type: 'ObjectExpression',
      properties
    }),
    number(UNDEFINED)
  ];
};

const optional = (op, clause = op.at(-1)) => clause || clause === 0 ? (Array.isArray(op[0]) ? op : [ op ]) : [];

const lookupName = (scope, name) => {
  if (name in scope.locals) return [ scope.locals[name], false ];
  if (name in globals) return [ globals[name], true ];

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

  if (name in builtinVars) {
    let wasm = builtinVars[name];
    if (wasm.usesImports) scope.usesImports = true;

    if (typeof wasm === 'function') wasm = asmFuncToAsm(scope, wasm);
    return wasm.slice();
  }

  if (name in builtinFuncs) {
    if (!(name in funcIndex)) includeBuiltin(scope, name);
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

      return [
        [ Opcodes.local_get, localTmp(scope, '#arguments') ],
        ...Opcodes.eqz,
        [ Opcodes.if, Blocktype.void ],
          ...generateObject(scope, {
            properties: [
              {
                key: { type: 'Literal', value: 'length' },
                value: { type: 'Literal', value: len },
                kind: 'init'
              },
              ...names.map((x, i) => ({
                key: { type: 'Literal', value: i },
                value: { type: 'Identifier', name: x },
                kind: 'init'
              }))
            ]
          }, '#arguments', false),
          [ Opcodes.local_set, localTmp(scope, '#arguments') ],
        [ Opcodes.end ],

        [ Opcodes.local_get, localTmp(scope, '#arguments') ]
      ];
    }

    // no local var with name
    if (name in globals) return [ [ Opcodes.global_get, globals[name].idx ] ];
    if (name in funcIndex) return funcRef(funcByName(name));
    if (name in importedFuncs) return [ number(importedFuncs[name] - importedFuncs.length) ];

    if (name.startsWith('__')) {
      // return undefined if unknown key in already known var
      let parent = name.slice(2).split('_').slice(0, -1).join('_');
      if (parent.includes('_')) parent = '__' + parent;

      if ((name + '$get') in builtinFuncs) {
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

const generateIdent = (scope, decl) =>
  lookupOrError(scope, decl.name, scope.identFailEarly);

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

  const out = generate(scope, arg);
  if (scope.returns[0] === Valtype.f64 && valtypeBinary === Valtype.i32 && out[out.length - 1][0] !== Opcodes.f64_const && out[out.length - 1] !== Opcodes.i32_to_u)
    out.push([ Opcodes.f64_convert_i32_s ]);

  if (scope.returnType == null) out.push(...getNodeType(scope, arg));

  out.push([ Opcodes.return ]);
  return out;
};

const localTmp = (scope, name, type = valtypeBinary) => {
  if (name in scope.locals) return scope.locals[name].idx;

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
    ...checks[op](scope, [], leftType),
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

const concatStrings = (scope, left, right, leftType, rightType) => ((knownType(scope, leftType) | TYPE_FLAGS.parity) === TYPES.bytestring && (knownType(scope, rightType) | TYPE_FLAGS.parity) === TYPES.bytestring) ? [
  // known types, use strcat direct
  ...left,
  Opcodes.i32_to_u,
  ...leftType,

  ...right,
  Opcodes.i32_to_u,
  ...rightType,

  [ Opcodes.call, includeBuiltin(scope, '__Porffor_strcat').index ],
  ...setLastType(scope),
  Opcodes.i32_from_u
] : [
  // unknown types, check if need to coerce
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

const truthy = (scope, wasm, type, nonbinary = true, intIn = false) => {
  if (valtypeBinary === Valtype.i32) intIn = true;

  // nonbinary = true: int output, 0 or non-0
  // nonbinary = false: float output, 0 or 1

  const truthyMode = nonbinary ? (Prefs.truthy ?? 'full') : 'full';
  if (isIntToFloatOp(wasm[wasm.length - 1])) return [
    ...wasm,
    ...(truthyMode === 'full' ? [
      [ Opcodes.f64_const, 0 ],
      [ Opcodes.f64_ne ],
      ...(!nonbinary ? [ Opcodes.i32_from_u ] : [])
    ] : (!intIn && nonbinary ? [ Opcodes.i32_to_u ] : []))
  ];

  if (isIntOp(wasm[wasm.length - 1])) return [
    ...wasm,
    ...(truthyMode === 'full' ? [
      [ Opcodes.i32_eqz ],
      [ Opcodes.i32_eqz ]
    ] : []),
    ...(nonbinary ? [] : [ Opcodes.i32_from ])
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

      ...(nonbinary ? [] : [ Opcodes.i32_from ]),
    ];

    if (truthyMode === 'no_negative') return [
      // if value != 0 or NaN, non-binary output. negative numbers not truthy :/
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [] : [ Opcodes.i32_to ]),
      ...(nonbinary ? [] : [ Opcodes.i32_from ])
    ];

    if (truthyMode === 'no_nan_negative') return [
      // simpler and faster but makes NaN truthy and negative numbers not truthy,
      // plus non-binary output
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(!nonbinary || (intIn && nonbinary) ? [] : [ Opcodes.i32_to_u ])
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
        ...(nonbinary ? [] : [
          [ Opcodes.i32_eqz ],
          [ Opcodes.i32_eqz ],
          Opcodes.i32_from_u
        ])
      ] ],

      ...(truthyMode === 'full' ? [ [ [ TYPES.booleanobject, TYPES.numberobject ], [
        // always truthy :))
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(1, nonbinary ? Valtype.i32 : valtypeBinary)
      ] ] ] : []),

      [ 'default', def ]
    ], nonbinary ? Valtype.i32 : valtypeBinary)
  ];
};

const falsy = (scope, wasm, type, nonbinary = true, intIn = false) => {
  // nonbinary = true: int output, 0 or non-0
  // nonbinary = false: float output, 0 or 1

  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);

  const truthyMode = Prefs.truthy ?? 'full';
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

      ...(nonbinary ? [] : [ Opcodes.i32_from ]),
    ];

    if (truthyMode === 'no_negative') return [
      // if value == 0 or NaN, non-binary output. negative numbers not truthy :/
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [] : [ Opcodes.i32_to ]),
      [ Opcodes.i32_eqz ],
      ...(nonbinary ? [] : [ Opcodes.i32_from ])
    ];

    if (truthyMode === 'no_nan_negative') return [
      // simpler and faster but makes NaN truthy and negative numbers not truthy,
      // plus non-binary output
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [ [ Opcodes.i32_eqz ] ] : Opcodes.eqz),
      ...(nonbinary ? [] : [ Opcodes.i32_from_u ])
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
        ...(nonbinary ? [] : [ Opcodes.i32_from_u ])
      ] ],

      ...(truthyMode === 'full' ? [ [ [ TYPES.booleanobject, TYPES.numberobject ], [
        // always truthy :))
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(0, nonbinary ? Valtype.i32 : valtypeBinary)
      ] ] ] : []),

      [ 'default', def ]
    ], nonbinary ? Valtype.i32 : valtypeBinary)
  ];
};

const nullish = (scope, wasm, type, nonbinary = true, intIn = false) => {
  // nonbinary = true: int output, 0 or non-0
  // nonbinary = false: float output, 0 or 1

  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);

  return [
    ...wasm,
    ...(!useTmp ? [] : [ [ Opcodes.local_set, tmp ] ]),

    ...typeSwitch(scope, type, [
      [ TYPES.undefined, [
        // empty
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(1, nonbinary ? Valtype.i32 : valtypeBinary)
      ] ],
      [ TYPES.object, [
        // object, null if == 0
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),

        ...(intIn ? [ [ Opcodes.i32_eqz ] ] : Opcodes.eqz),
        ...(nonbinary ? [] : [ Opcodes.i32_from_u ])
      ] ],
      [ 'default', [
        // not
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        number(0, nonbinary ? Valtype.i32 : valtypeBinary)
      ] ]
    ], nonbinary ? Valtype.i32 : valtypeBinary)
  ];
};

const eitherStringType = (leftType, rightType) => [
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

  [ Opcodes.i32_or ]
];

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
      ...eitherStringType(leftType, rightType),
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
      ...eitherStringType(leftType, rightType),
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
      const out = nullish(scope, generate(scope, decl.left), getNodeType(scope, decl.left));
      if (decl.operator === '!=') out.push([ Opcodes.i32_eqz ]);
      out.push(Opcodes.i32_from_u);
      return out;
    }

    if (knownNullish(decl.left)) {
      const out = nullish(scope, generate(scope, decl.right), getNodeType(scope, decl.right));
      if (decl.operator === '!=') out.push([ Opcodes.i32_eqz ]);
      out.push(Opcodes.i32_from_u);
      return out;
    }
  }

  const out = performOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right), getNodeType(scope, decl.left), getNodeType(scope, decl.right));
  if (valtype !== 'i32' && ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(decl.operator)) out.push(Opcodes.i32_from_u);

  return out;
};

const asmFuncToAsm = (scope, func, extra) => func(scope, {
  Valtype, Opcodes, TYPES, TYPE_NAMES, usedTypes, typeSwitch, makeString, internalThrow, funcs,
  getNodeType, generate, generateIdent,
  builtin: (name, offset = false) => {
    let idx = importedFuncs[name] ?? includeBuiltin(scope, name)?.index;
    if (idx == null) throw new Error(`builtin('${name}') failed: could not find func (from ${scope.name})`);
    if (offset) idx -= importedFuncs.length;

    return idx;
  },
  hasFunc: x => funcIndex[x] != null,
  funcRef: name => {
    const func = includeBuiltin(scope, name);
    return funcRef(func);
  },
  glbl: (opcode, name, type) => {
    const globalName = '#porf#' + name; // avoid potential name clashing with user js
    if (!(globalName in globals)) {
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
      if (scope.globalInits?.[name]) {
        if (typeof scope.globalInits[name] === 'function') {
          out.unshift(
            [ Opcodes.global_get, globals[globalName + '#glbl_inited'].idx ],
            [ Opcodes.i32_eqz ],
            [ Opcodes.if, Blocktype.void ],
            ...asmFuncToAsm(scope, scope.globalInits[name]),
            number(1, Valtype.i32),
            [ Opcodes.global_set, globals[globalName + '#glbl_inited'].idx ],
            [ Opcodes.end ]
          );
        } else {
          globals[globalName].init = scope.globalInits[name];
        }
      }
    }

    return out;
  },
  loc: (name, type) => {
    if (!(name in scope.locals)) {
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
  allocPage,
  allocLargePage: (scope, name) => {
    const _ = allocPage(scope, name);
    allocPage(scope, name + '#2');

    return _;
  }
}, extra);

const asmFunc = (name, func) => {
  func = { ...func };
  let { wasm, params = [], locals: localTypes = [], localNames = [], table, usesTag, returnTypes, returnType } = func;
  if (wasm == null) { // called with no built-in
    if (!func.comptime) log.warning('codegen', `${name} has no built-in!`);
    wasm = () => [];
  }

  const existing = builtinFuncByName(name);
  if (existing) return existing;

  const allLocals = params.concat(localTypes);
  const locals = Object.create(null);
  for (let i = 0; i < allLocals.length; i++) {
    locals[localNames[i] ?? `l${i}`] = { idx: i, type: allLocals[i] };
  }

  func.internal = true;
  func.name = name;
  func.locals = locals;
  func.localInd = allLocals.length;
  func.index = currentFuncIndex++;

  funcs.push(func);
  funcIndex[name] = func.index;

  if (globalThis.precompile) wasm = [];
    else wasm = asmFuncToAsm(func, wasm);

  if (table) funcs.table = true;
  if (usesTag) {
    if (Prefs.wasmExceptions === false) {
      for (let i = 0; i < wasm.length; i++) {
        const inst = wasm[i];
        if (inst[0] === Opcodes.throw) {
          wasm.splice(i, 1, ...generateThrow(func, {}));
        }
      }
    } else {
      ensureTag();
    }
  }

  if (returnTypes) {
    for (const x of returnTypes) typeUsed(func, x);
  } else if (returnType != null) {
    typeUsed(func, returnType);
  }

  if (func.jsLength == null) func.jsLength = countLength(func);
  func.wasm = wasm;

  return func;
};

const includeBuiltin = (scope, builtin) => {
  scope.includes ??= new Set();
  scope.includes.add(builtin);

  return asmFunc(builtin, builtinFuncs[builtin]);
};

const generateLogicExp = (scope, decl) =>
  performLogicOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right), getNodeType(scope, decl.left), getNodeType(scope, decl.right));

const getInferred = (scope, name, global = false) => {
  const isConst = getVarMetadata(scope, name, global)?.kind === 'const';
  if (global) {
    if (name in globalInfer && (isConst || inferLoopPrev.length === 0)) return globalInfer[name];
  } else if (scope.inferTree) {
    for (let i = scope.inferTree.length - 1; i >= 0; i--) {
      const x = scope.inferTree[i];
      if (name in x) return x[name];
    }
  }

  return null;
};

const setInferred = (scope, name, type, global = false) => {
  const isConst = getVarMetadata(scope, name, global)?.kind === 'const';
  scope.inferTree ??= [ Object.create(null) ];

  if (global) {
    // set inferred type in global if not already and not in a loop, else make it null
    globalInfer[name] = name in globalInfer || (!isConst && inferLoopPrev.length > 0) ? null : type;
  } else {
    // set inferred type in top
    const top = scope.inferTree.at(-1);
    top[name] = type;

    // invalidate inferred type above if mismatched
    for (let i = scope.inferTree.length - 2; i >= 0; i--) {
      const x = scope.inferTree[i];
      if (name in x && x[name] !== type) x[name] = null;
    }
  }
};

const getType = (scope, name, failEarly = false) => {
  const fallback = failEarly ? [
    number(TYPES.undefined, Valtype.i32)
  ] : [
    [ null, () => hoistLookupType(scope, name) ]
  ];

  if (name in builtinVars) return [ number(builtinVars[name].type ?? TYPES.number, Valtype.i32) ];

  let metadata, typeLocal, global = null;
  if (name in scope.locals) {
    metadata = scope.locals[name].metadata;
    typeLocal = scope.locals[name + '#type'];
    global = false;
  } else if (name in globals) {
    metadata = globals[name].metadata;
    typeLocal = globals[name + '#type'];
    global = true;
  }

  if (global !== false && name === 'arguments' && !scope.arrow) {
    return [ number(TYPES.object, Valtype.i32) ];
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

  return fallback;
};

const setType = (scope, name, type, noInfer = false) => {
  typeUsed(scope, knownType(scope, type));

  const out = typeof type === 'number' ? [ number(type, Valtype.i32) ] : type;

  let metadata, typeLocal, global = false;
  if (name in scope.locals) {
    metadata = scope.locals[name].metadata;
    typeLocal = scope.locals[name + '#type'];
  } else if (name in globals) {
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

const setLastType = (scope, type = [], doNotMarkAsUsed = false) => {
  if (!doNotMarkAsUsed) typeUsed(scope, knownType(scope, type));
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

      if (name in builtinFuncs && builtinFuncs[name].returnType != null) return builtinFuncs[name].returnType;

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

      if (knownLeft === TYPES.bytestring && knownRight === TYPES.bytestring) return TYPES.bytestring;

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

      // todo: non-static bigint support
      const type = getNodeType(scope, node.argument);
      const known = knownType(scope, type);
      if (known === TYPES.bigint) return TYPES.bigint;

      return TYPES.number;
    }

    if (node.type === 'UpdateExpression') {
      // todo: bigint support
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

      return getNodeType(scope, {
        type: 'CallExpression',
        callee: node.tag,
        arguments: []
      });
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

    if (node.type === 'PrivateIdentifier') {
      return getNodeType(scope, {
        type: 'Literal',
        value: privateIDName(node.name)
      });
    }

    if (node.type.endsWith('Statement') || node.type.endsWith('Declaration')) {
      return TYPES.undefined;
    }

    return getLastType(scope);
  })();

  const out = typeof ret === 'number' ? [ number(ret, Valtype.i32) ] : ret;
  if (guess != null) out.guess = typeof guess === 'number' ? [ number(guess, Valtype.i32) ] : guess;

  if (!node._doNotMarkTypeUsed) typeUsed(scope, knownType(scope, out));
  return out;
};

const generateLiteral = (scope, decl, global, name) => {
  if (decl.value === null) return [ number(NULL) ];

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
  }

  if (decl.regex) {
    // todo/opt: separate aot compiling regex engine for compile-time known regex (literals, known RegExp args)
    return generate(scope, {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: 'RegExp'
      },
      arguments: [
        {
          type: 'Literal',
          value: decl.regex.pattern
        },
        {
          type: 'Literal',
          value: decl.regex.flags
        }
      ]
    });
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
  number(TYPES.uint8clampedarray, Valtype.i32),
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
    if (!decl._forceCreateThis && (globalThis.precompile || name in builtinFuncs)) return [
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

      // hack: default this value for primitives, do here instead of inside funcs via ToObject/etc
      // todo: Object should not be included
      const obj = name.slice(2, name.indexOf('_', 2));
      if (name.includes('_prototype_') && ['Object', 'String', 'Boolean', 'Number'].includes(obj)) {
        node = {
          type: 'NewExpression',
          callee: {
            type: 'Identifier',
            name: obj
          },
          arguments: []
        };
      } else {
        node = {
          type: 'Identifier',
          name: obj
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

  if (!decl._funcIdx && !decl._new && (name === 'eval' || (decl.callee.type === 'SequenceExpression' && decl.callee.expressions.at(-1)?.name === 'eval'))) {
    const known = knownValue(scope, decl.arguments[0]);
    if (known !== unknownValue) {
      // eval('with known/literal string')
      const code = String(known);

      let parsed;
      try {
        parsed = {
          type: 'BlockStatement',
          body: semantic(objectHack(parse(code)), decl._semanticScopes).body
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

  if (!decl._funcIdx && name === 'Function') {
    const knowns = decl.arguments.map(x => knownValue(scope, x));
    if (knowns.every(x => x !== unknownValue)) {
      // new Function('with known/literal strings')
      const code = String(knowns[knowns.length - 1]);
      const args = knowns.slice(0, -1).map(x => String(x));

      let parsed;
      try {
        parsed = semantic(objectHack(parse(`(function(${args.join(',')}){${code}})`)), decl._semanticScopes);
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
      else if (lookupName(scope, target.name)[0] == null && !(target.name in builtinFuncs)) {
        if (lookupName(scope, '__' + target.name)[0] != null || builtinFuncs['__' + target.name]) target.name = '__' + target.name;
          else protoName = null;
      }
  }

  // literal.func()
  if (!decl._new && !name && (decl.callee.type === 'MemberExpression' || decl.callee.type === 'ChainExpression')) {
    const prop = (decl.callee.expression ?? decl.callee).property;
    const object = (decl.callee.expression ?? decl.callee).object;

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
          [ Opcodes.local_tee, typeTmp ]
        ],
        _thisWasmComponents: {
          _callValue: [
            ...generate(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
            [ Opcodes.local_tee, valTmp ],
            ...getNodeType(scope, decl.arguments[0] ?? DEFAULT_VALUE()),
            [ Opcodes.local_set, typeTmp ]
          ],
          _callType: [ [ Opcodes.local_get, typeTmp ] ]
        }
      });
    }

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

      const protoBC = {};
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

      protoBC.default = decl.optional ?
        withType(scope, [ number(UNDEFINED) ], TYPES.undefined) :
        (Prefs.neverFallbackBuiltinProto ?
          internalThrow(scope, 'TypeError', `'${protoName}' proto func tried to be called on a type without an impl`, true) :
          generate(scope, {
            ...decl,
            _protoInternalCall: true
          }));

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
  if (decl._funcIdx) {
    idx = decl._funcIdx;
  } else if (name in funcIndex) {
    idx = funcIndex[name];
  } else if (scope.name === name) {
    // fallback for own func but with a different var/id name
    idx = scope.index;
  } else if (name in importedFuncs) {
    idx = importedFuncs[name];
    scope.usesImports = true;
  } else if (name in builtinFuncs) {
    if (decl._new && !builtinFuncs[name].constr) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`, true);
    if (builtinFuncs[name].comptime && !decl._noComptime) return builtinFuncs[name].comptime(scope, decl, { generate, getNodeType, knownType, knownTypeWithGuess, makeString, printStaticStr });

    includeBuiltin(scope, name);
    idx = funcIndex[name];
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
      // pointer, align, offset
      i32_load16_s: { imms: 2, args: [ true ], returns: 1 },
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
    if (!wasmOps[opName]) throw new Error('Unimplemented Porffor.wasm op: ' + opName);

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
  } else {
    if (!Prefs.indirectCalls) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`, true);

    funcs.table = true;
    scope.table = true;

    const wrapperArgc = Prefs.indirectWrapperArgc ?? 16;
    const underflow = wrapperArgc - args.length;
    for (let i = 0; i < underflow; i++) args.push(DEFAULT_VALUE());
    if (args.length > wrapperArgc) args = args.slice(0, wrapperArgc);

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      out = out.concat(generate(scope, arg), valtypeBinary === Valtype.i32 && scope.locals[arg.name]?.type !== Valtype.f64 ? [ [ Opcodes.f64_convert_i32_s ] ] : [], getNodeType(scope, arg));
    }

    const tmpName = '#indirect' + uniqId() + '_';
    const calleeLocal = localTmp(scope, tmpName + 'callee');
    let callee = decl.callee, callAsNew = decl._new, sup = false, knownThis = undefined;

    // hack: this should be more thorough, Function.bind, etc
    if (!callAsNew && (callee.type === 'MemberExpression' || callee.type === 'ChainExpression')) {
      const { property, object, computed, optional } = callee.expression ?? callee;
      if (object && property) {
        const thisLocal = localTmp(scope, tmpName + 'caller');
        const thisLocalType = localTmp(scope, tmpName + 'caller#type', Valtype.i32);

        knownThis = [
          [ Opcodes.local_get, thisLocal ],
          [ Opcodes.local_get, thisLocalType ]
        ];
        callee = {
          type: 'MemberExpression',
          object: {
            type: 'Wasm',
            wasm: () => [
              ...generate(scope, object),
              [ Opcodes.local_tee, thisLocal ],
              ...getNodeType(scope, object),
              [ Opcodes.local_set, thisLocalType ]
            ],
            _type: [
              [ Opcodes.local_get, thisLocalType ]
            ]
          },
          property,
          computed,
          optional
        };
      }
    }

    if (callee.type === 'Super') {
      // call super constructor with direct super() call
      callee = getObjProp(callee, 'constructor');
      callAsNew = true;
      knownThis = [
        ...generate(scope, { type: 'ThisExpression' }),
        ...getNodeType(scope, { type: 'ThisExpression' })
      ];
      sup = true;
    }

    const newTargetWasm = decl._newTargetWasm ?? createNewTarget(scope, decl, [
      [ Opcodes.local_get, calleeLocal ]
    ], callAsNew);
    const thisWasm = decl._thisWasm ?? knownThis ?? createThisArg(scope, decl);

    out = [
      ...generate(scope, callee),
      [ Opcodes.local_set, calleeLocal ],

      ...typeSwitch(scope, getNodeType(scope, callee), {
        [TYPES.function]: () => [
          number(wrapperArgc - underflow, Valtype.i32),
          ...forceDuoValtype(scope, newTargetWasm, Valtype.f64),
          ...forceDuoValtype(scope, thisWasm, Valtype.f64),
          ...out,

          [ Opcodes.local_get, calleeLocal ],
          Opcodes.i32_to_u,
          [ Opcodes.call_indirect, args.length + 2, 0 ],
          ...setLastType(scope)
        ],

        default: () => decl.optional ? withType(scope, [ number(UNDEFINED, Valtype.f64) ], TYPES.undefined)
          : internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`, Valtype.f64)
      }, Valtype.f64)
    ];

    if (valtypeBinary === Valtype.i32) out.push(Opcodes.i32_trunc_sat_f64_s);
    if (sup) out.push([ null, 'super marker' ]);
    return out;
  }

  const func = funcByIndex(idx);
  if (func && !decl._new && !decl._insideIndirect) func.onlyNew = false;

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
    out.push(
      ...forceDuoValtype(scope, decl._newTargetWasm ?? createNewTarget(scope, decl, idx - importedFuncs.length), func.params[0]),
      ...forceDuoValtype(scope, decl._thisWasm ?? createThisArg(scope, decl), func.params[2])
    );
    paramOffset += 4;
  }

  if (func && func.method) {
    out.push(...forceDuoValtype(scope, decl._thisWasm ?? createThisArg(scope, decl), func.params[0]));
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
        elements: restArgs,
        _doNotMarkTypeUsed: true,
        _staticAlloc: func.internal
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
  if (decl._insideIndirect) return out;

  if (typedReturns) out.push(...setLastType(scope));

  if (
    func?.returns?.length === 0 ||
    (idx === importedFuncs[name] && importedFuncs[importedFuncs[name]]?.returns?.length === 0)
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
    return generate(scope, { type: 'Identifier', name: 'globalThis' });
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

const unhackName = name => {
  if (!name) return name;

  if (name.startsWith('__')) return name.slice(2).replaceAll('_', '.');
  return name;
};

const knownType = (scope, type) => {
  if (typeof type === 'number') return type;

  if (type.length === 1 && type[0][0] === Opcodes.i32_const) {
    return type[0][1];
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

  if (bc.length === 2 && (bc[0][0] === 'default' || bc[1][0] === 'default')) {
    let trueCase, falseCase;
    if (bc[0][0] === 'default') {
      trueCase = bc[1];
      falseCase = bc[0];
    } else {
      trueCase = bc[0];
      falseCase = bc[1];
    }

    if (!Array.isArray(trueCase[0])) {
      depth.push('if');
      const out = [
        ...type,
        number(trueCase[0], Valtype.i32),
        [ Opcodes.i32_eq ],
        [ Opcodes.if, returns ],
          ...typeof trueCase[1] === 'function' ? trueCase[1]() : trueCase[1],
        [ Opcodes.else ],
          ...typeof falseCase[1] === 'function' ? falseCase[1]() : falseCase[1],
        [ Opcodes.end ],
      ];
      depth.pop();

      return out;
    }
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
      if (scope.usedTypes && types.some(x => scope.usedTypes.has(x))) {
        add();
      } else {
        // just magic precompile things™
        out.push([ null, 'typeswitch case start', types ]);
        add();
        out.push([ null, 'typeswitch case end' ]);
      }
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

const allocVar = (scope, name, global = false, type = true, i32 = false, redecl = false) => {
  const target = global ? globals : scope.locals;

  // already declared
  if (name in target) {
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

const getVarMetadata = (scope, name, global = false) => {
  const target = global ? globals : scope.locals;
  return target[name]?.metadata;
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

  let types = null, type = null, elementType = null;
  if (a.typeName) {
    type = a.typeName.name;
  } else if (a.type.endsWith('Keyword')) {
    type = a.type.slice(2, -7).toLowerCase();
    if (type === 'void') type = 'undefined';
  } else if (a.type === 'TSArrayType') {
    type = 'array';
    elementType = extractTypeAnnotation(a.elementType).type;
  } else if (a.type === 'TSUnionType') {
    types = a.types.map(x => extractTypeAnnotation(x).type);
  }

  const typeName = type;
  type = typeAnnoToPorfType(type);

  if (!types && type != null) types = [ type ];

  return { type, types, typeName, elementType };
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

  name = name.split('#')[0];
  decl.id = { name };
};

const generateVarDstr = (scope, kind, pattern, init, defaultValue, global) => {
  // statically analyzed ffi dlopen hack to let 2c handle it
  if (init && init.type === 'CallExpression' && init.callee.name === '__Porffor_dlopen') {
    if (Prefs.secure) throw new Error('Porffor.dlopen is not allowed in --secure');
    if (Prefs.target !== 'native' && Prefs.target !== 'c' && !Prefs.native) throw new Error('Porffor.dlopen is only supported for native target (use --native)');

    // disable pgo if using ffi (lol)
    Prefs.pgo = false;

    try {
      let usedNames = [];
      for (const x of pattern.properties) {
        usedNames.push(x.key.name);
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
          wasm: () => [],
          params: parameters.map(x => Valtype.i32),
          returns: result ? [ Valtype.i32 ] : [],
          returnType: TYPES.number
        });
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
      if (name !== funcName && funcName in funcIndex) {
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
    if (topLevel && name in builtinVars) {
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
          ...typeIsOneOf(getType(scope, name), [ TYPES.undefined ]),
          [ Opcodes.if, Blocktype.void ],
            ...generate(scope, defaultValue, global, name),
            [ global ? Opcodes.global_set : Opcodes.local_set, idx ],
            ...setType(scope, name, getNodeType(scope, defaultValue), true),
          [ Opcodes.end ],
        );
      }

      if (globalThis.precompile && global) {
        scope.globalInits ??= Object.create(null);
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
      }
    }

    out = out.concat([
      // check tmp is valid object
      // not undefined or empty type
      ...typeIsOneOf(getType(scope, tmpName), [ TYPES.undefined ]),

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

// todo: generate this array procedurally
const builtinPrototypeGets = ['size', 'description', 'byteLength', 'byteOffset', 'buffer', 'detached', 'resizable', 'growable', 'maxByteLength', 'name', 'message', 'constructor', 'source', 'flags', 'global', 'ignoreCase', 'multiline', 'dotAll', 'unicode', 'sticky', 'hasIndices', 'unicodeSets', 'lastIndex'];

const ctHash = prop => {
  if (!Prefs.ctHash || !prop ||
    prop.computed || prop.optional ||
    prop.property.type === 'PrivateIdentifier'
  ) return null;

  prop = prop.property.name;
  if (!prop || prop === '__proto__' || !byteStringable(prop)) return null;

  let i = 0;
  const len = prop.length;
  let hash = 374761393 + len;

  const rotl = (n, k) => (n << k) | (n >>> (32 - k));
  const read = () => (prop.charCodeAt(i + 3) << 24 | prop.charCodeAt(i + 2) << 16 | prop.charCodeAt(i + 1) << 8 | prop.charCodeAt(i));

  // hash in chunks of i32 (4 bytes)
  for (; i <= len; i += 4) {
    hash = Math.imul(rotl(hash + Math.imul(read(), 3266489917), 17), 668265263);
  }

  // final avalanche
  hash = Math.imul(hash ^ (hash >>> 15), 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489917);
  return (hash ^ (hash >>> 16));
};

// COCTC: cross-object compile-time (inline) cache
const coctcOffset = prop => {
  if (!Prefs.coctc || !prop ||
    prop.computed || prop.optional ||
    prop.property.type === 'PrivateIdentifier'
  ) return 0;

  prop = prop.property.name;
  if (!prop || builtinPrototypeGets.includes(prop) ||
    prop === 'prototype' || prop === 'length' || prop === '__proto__'
  ) return 0;

  let offset = coctc.get(prop);
  if (offset == null) {
    offset = (coctc.lastOffset ?? Prefs.coctcOffset ?? (globalThis.pageSize - 128)) - 9;
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

  // short-circuit behavior for logical assignment operators
  if (op === '||' || op === '&&' || op === '??') {
    // for logical assignment ops, it is not left @= right -> left = left @ right
    // instead, left @ (left = right)
    // eg, x &&= y -> x && (x = y)
    if (local !== undefined) {
      // fast path: just assigning to a local
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
    } else if (type === 'MemberExpression' && decl.left.computed) {
      // special path: cache properties for computed members so they are not evaluated twice
      // eg, x[y] &&= z -> (a = y, x[a] = (x[a] = z))
      const propTmp = localTmp(scope, '#logical_prop');
      const propTypeTmp = localTmp(scope, '#logical_prop#type', Valtype.i32);

      const member = {
        type: 'MemberExpression',
        object: decl.left.object,
        property: { type: 'Identifier', name: '#logical_prop' },
        computed: true
      };

      return [
        ...generate(scope, decl.left.property),
        [ Opcodes.local_set, propTmp ],
        ...getNodeType(scope, decl.left.property),
        [ Opcodes.local_set, propTypeTmp ],

        ...generate(scope, {
          type: 'LogicalExpression',
          operator: op,
          left: member,
          right: {
            type: 'AssignmentExpression',
            operator: '=',
            left: member,
            right: decl.right
          }
        }, _global, _name, valueUnused)
      ];
    } else {
      // other: generate as LogicalExpression
      return generate(scope, {
        type: 'LogicalExpression',
        operator: op,
        left: decl.left,
        right: {
          type: 'AssignmentExpression',
          operator: '=',
          left: decl.left,
          right: decl.right
        }
      }, _global, _name, valueUnused);
    }
  }

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

    const hash = ctHash(decl.left);
    const coctc = coctcOffset(decl.left);
    if (coctc > 0) valueUnused = false;

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
            [TYPES.bigint64array]: () => [
              number(8, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? [
                ...generate(scope, decl.right),
                ...getNodeType(scope, decl.right),
                [ Opcodes.call, includeBuiltin(scope, '__ecma262_ToBigInt').index ]
              ] : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i64_load, 0, 4 ],
                [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_fromS64').index ]
              ], [
                ...generate(scope, decl.right),
                ...getNodeType(scope, decl.right),
                [ Opcodes.call, includeBuiltin(scope, '__ecma262_ToBigInt').index ]
              ], [ number(TYPES.bigint, Valtype.i32) ], [ number(TYPES.bigint, Valtype.i32) ])),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_toI64').index ],
              [ Opcodes.i64_store, 0, 4 ],
              setLastType(scope, TYPES.bigint, true)
            ],
            [TYPES.biguint64array]: () => [
              number(8, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_add ],
              ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

              ...(op === '=' ? [
                ...generate(scope, decl.right),
                ...getNodeType(scope, decl.right),
                [ Opcodes.call, includeBuiltin(scope, '__ecma262_ToBigInt').index ]
              ] : performOp(scope, op, [
                [ Opcodes.local_get, pointerTmp ],
                [ Opcodes.i64_load, 0, 4 ],
                [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_fromS64').index ]
              ], [
                ...generate(scope, decl.right),
                ...getNodeType(scope, decl.right),
                [ Opcodes.call, includeBuiltin(scope, '__ecma262_ToBigInt').index ]
              ], [ number(TYPES.bigint, Valtype.i32) ], [ number(TYPES.bigint, Valtype.i32) ])),
              ...optional([ Opcodes.local_tee, newValueTmp ]),

              [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_toI64').index ],
              [ Opcodes.i64_store, 0, 4 ],
              setLastType(scope, TYPES.bigint, true)
            ]
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

        [TYPES.undefined]: () => internalThrow(scope, 'TypeError', 'Cannot set property of undefined', !valueUnused),

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

            ...(hash != null ? [
              number(hash, Valtype.i32),
              number(TYPES.number, Valtype.i32),
              [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_get_withHash').index ]
            ] : [
              [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_get').index ]
            ]),
            ...setLastType(scope)
          ], generate(scope, decl.right), getLastType(scope), getNodeType(scope, decl.right))),
          ...(valtypeBinary === Valtype.i32 ? [ [ Opcodes.f64_convert_i32_s ] ] : []),
          ...getNodeType(scope, decl),

          ...(hash != null ? [
            number(hash, Valtype.i32),
            number(TYPES.number, Valtype.i32),
            [ Opcodes.call, includeBuiltin(scope, scope.strict ? '__Porffor_object_setStrict_withHash' : '__Porffor_object_set_withHash').index ],
          ] : [
            [ Opcodes.call, includeBuiltin(scope, scope.strict ? '__Porffor_object_setStrict' : '__Porffor_object_set').index ],
          ]),
          [ Opcodes.drop ],
          ...(valueUnused ? [ [ Opcodes.drop ] ] : [])
          // ...setLastType(scope, getNodeType(scope, decl)),
        ]
      }, valueUnused ? Blocktype.void : valtypeBinary),
      ...optional(number(UNDEFINED), valueUnused)
    ];

    if (coctc > 0) {
      // set COCTC
      const valueTmp = localTmp(scope, '#coctc_value');
      const objectTmp = localTmp(scope, '#coctc_object', Valtype.i32);

      out.push(
        [ Opcodes.local_tee, valueTmp ],
        ...coctcSetup(scope, object, objectTmp, null, [ objectGet ]),

        [ Opcodes.local_get, objectTmp ],
        [ Opcodes.local_get, valueTmp ],
        [ Opcodes.f64_store, 0, ...unsignedLEB128(coctc) ],

        [ Opcodes.local_get, objectTmp ],
        ...getNodeType(scope, decl),
        [ Opcodes.i32_store8, 0, ...unsignedLEB128(coctc + 8) ]
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

    if (name in builtinVars) {
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
        [ Opcodes.i32_const, -1 ],
        [ Opcodes.i32_xor ],
        Opcodes.i32_from
      ];


    case '!':
      const arg = decl.argument;
      if (arg.type === 'UnaryExpression' && arg.operator === '!') {
        // opt: !!x -> is x truthy
        return truthy(scope, generate(scope, arg.argument), getNodeType(scope, arg.argument), false);
      }

      // !=
      return falsy(scope, generate(scope, arg), getNodeType(scope, arg), false);

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
        const coctc = coctcOffset(decl.argument);
        const objectTmp = coctc > 0 && localTmp(scope, '#coctc_object', Valtype.i32);

        const out = [
          ...generate(scope, object),
          Opcodes.i32_to_u,
          ...optional([ Opcodes.local_tee, objectTmp ]),
          ...getNodeType(scope, object),

          ...toPropertyKey(scope, generate(scope, property), getNodeType(scope, property), decl.argument.computed, true),

          [ Opcodes.call, includeBuiltin(scope, scope.strict ? '__Porffor_object_deleteStrict' : '__Porffor_object_delete').index ],
          Opcodes.i32_from_u
        ];

        if (coctc > 0) {
          // set COCTC
          out.push(
            ...coctcSetup(scope, object, objectTmp, null, [ [ Opcodes.local_get, objectTmp ] ], false),

            [ Opcodes.local_get, objectTmp ],
            number(0),
            [ Opcodes.f64_store, 0, ...unsignedLEB128(coctc) ],

            [ Opcodes.local_get, objectTmp ],
            number(0, Valtype.i32),
            [ Opcodes.i32_store8, 0, ...unsignedLEB128(coctc + 8) ]
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
        [ TYPES.undefined, () => makeString(scope, 'undefined') ],
        [ TYPES.function, () => makeString(scope, 'function') ],
        [ TYPES.symbol, () => makeString(scope, 'symbol') ],

        // object and internal types
        [ 'default', () => makeString(scope, 'object') ],
      ]));

      return out;
    }
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

const inferBranchStart = scope => {
  scope.inferTree ??= [ Object.create(null) ];
  scope.inferTree.push(Object.create(null));
};

const inferBranchEnd = scope => {
  scope.inferTree.pop();
};

const inferBranchElse = scope => {
  // todo/opt: at end of else, find inferences in common and keep them?
  inferBranchEnd(scope);
  inferBranchStart(scope);
};

const inferLoopPrev = [];
const inferLoopStart = scope => {
  // todo/opt: do not just wipe the infer tree for loops
  inferLoopPrev.push(scope.inferTree ?? [ Object.create(null) ]);
  scope.inferTree = [ Object.create(null) ];
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

  const out = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test));
  out.push([ Opcodes.if, Blocktype.void ]);
  depth.push('if');
  inferBranchStart(scope);

  out.push(
    ...generate(scope, decl.consequent),
    [ Opcodes.drop ]
  );


  if (decl.alternate) {
    inferBranchElse(scope);
    out.push(
      [ Opcodes.else ],
      ...generate(scope, decl.alternate),
      [ Opcodes.drop ]
    );
    inferBranchEnd(scope);
  } else inferBranchEnd(scope);

  out.push(
    [ Opcodes.end ],
    number(UNDEFINED)
  );
  depth.pop();

  return out;
};

const generateConditional = (scope, decl) => {
  const out = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test));

  out.push([ Opcodes.if, valtypeBinary ]);
  depth.push('if');
  inferBranchStart(scope);

  out.push(
    ...generate(scope, decl.consequent),
    ...setLastType(scope, getNodeType(scope, decl.consequent))
  );

  out.push([ Opcodes.else ]);
  inferBranchElse(scope);

  out.push(
    ...generate(scope, decl.alternate),
    ...setLastType(scope, getNodeType(scope, decl.alternate))
  );

  out.push([ Opcodes.end ]);
  depth.pop();
  inferBranchEnd(scope);

  return out;
};

const generateFor = (scope, decl) => {
  const out = [];

  if (decl.init) out.push(
    ...generate(scope, decl.init, false, undefined, true),
    [ Opcodes.drop ]
  );

  inferLoopStart(scope);
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
  inferLoopStart(scope);

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
  inferLoopStart(scope);

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

  inferLoopStart(scope);
  depth.push('forof');
  depth.push('block');

  out.push([ Opcodes.loop, Blocktype.void ]);
  out.push([ Opcodes.block, Blocktype.void ]);

  const prevDepth = depth.length;

  const makeTypedArrayNext = (getOp, elementSize, type = TYPES.number) => [
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

    // set last type to number or specified
    ...setLastType(scope, type, true)
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
    [ TYPES.bigint64array, () => makeTypedArrayNext([
      [ Opcodes.i64_load, 0, 4 ],
      [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_fromS64').index ]
    ], 8, TYPES.bigint) ],
    [ TYPES.biguint64array, () => makeTypedArrayNext([
      [ Opcodes.i64_load, 0, 4 ],
      [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_fromU64').index ]
    ], 8, TYPES.bigint) ],
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
    const global = scope.name === '#main';
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

  inferLoopStart(scope);
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
    const global = scope.name === '#main';
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
        [ Opcodes.i32_const, TYPES.string ],
        [ Opcodes.i32_const, TYPES.symbol ],
        [ Opcodes.local_get, tmp ],
        number(0x40000000, Valtype.i32),
        [ Opcodes.i32_and ],
        [ Opcodes.select ],
      [ Opcodes.else ], // bytestring
        [ Opcodes.i32_const, TYPES.bytestring ],
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

      // temporarily stub scope used types to have none always included for these cases
      const usedTypes = scope.usedTypes;
      scope.usedTypes = { add: () => {}, has: () => false };

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

      scope.usedTypes = usedTypes;

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
  } else {
    // make empty default case
    cases.push({ test: null, consequent: [] });
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
  if (Prefs.unreachableExceptions) {
    return [
      ...generate(scope, {
        type: 'CallExpression',
        callee: {
          type: 'Identifier',
          name: '__console_log'
        },
        arguments: [ decl.argument ]
      }),
      [ Opcodes.unreachable ]
    ];
  }

  if (Prefs.wasmExceptions === false) {
    return [
      ...(scope.returns.length === 0 ? [] : [ number(0, scope.returns[0]) ]),
      ...(scope.returns.length === 0 || scope.returnType != null ? [] : [ number(0, scope.returns[1]) ]),
      [ Opcodes.return ]
    ];
  }

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

const generateEmpty = (scope, decl) => [ number(UNDEFINED) ];

const generateMeta = (scope, decl) => {
  if (decl.meta.name === 'new' && decl.property.name === 'target') {
    // new.target
    if (scope.constr) return [
      [ Opcodes.local_get, scope.locals['#newtarget'].idx ]
    ];

    // todo: access upper-scoped new.target
    return [ number(UNDEFINED) ];
  }

  // todo: import.meta
  return internalThrow(scope, 'Error', `porffor: meta property ${decl.meta.name}.${decl.property.name} is not supported yet`, true);
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
  if (page) {
    data.existsForPage ??= new Map();
    if (data.existsForPage.has(page)) return;
    data.existsForPage.set(page, true);
  }

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

const printStaticStr = (scope, str) => {
  scope.usesImports = true;
  const out = [];

  for (let i = 0; i < str.length; i++) {
    out.push(
      number(str.charCodeAt(i)),
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

const makeString = (scope, str, bytestring = true) => {
  if (str.length === 0) return [ number(0) ];

  if (globalThis.precompile) return [
    [ 'str', Opcodes.const, str, bytestring ]
  ];

  const elements = new Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    elements[i] = c;

    if (c > 0xFF) bytestring = false;
  }

  const ptr = allocStr(scope, str, bytestring);
  makeData(scope, elements, str, bytestring ? 'i8' : 'i16');

  return [ number(ptr) ];
};

const generateArray = (scope, decl, global = false, name = '$undeclared', staticAlloc = false) => {
  const elements = decl.elements;
  const length = elements.length;

  const out = [];
  let pointer;

  if (staticAlloc || decl._staticAlloc) {
    const uniqueName = name === '$undeclared' ? name + uniqId() : name;

    const ptr = allocPage(scope, uniqueName);
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

  typeUsed(scope, TYPES.array);
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
    if (name in importedFuncs) {
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
  if (!func.internal || func.typedParams) params = Math.floor(params / 2);

  return func.argc = params;
};

const countLength = (func, name = undefined) => {
  if (func && func.jsLength != null) return func.jsLength;
  return countParams(func, name ?? func.name);
};

const generateMember = (scope, decl, _global, _name) => {
  let final = [], finalEnd, extraBC = {};
  let name = decl.object.name;

  // todo: handle globalThis.foo efficiently

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

  if (builtinPrototypeGets.includes(decl.property.name)) {
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

  const hash = ctHash(decl);
  const coctc = coctcOffset(decl);
  const coctcObjTmp = coctc > 0 && localTmp(scope, '#coctc_obj' + uniqId(), Valtype.i32);

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
        ]
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

      ...wrapBC({
        [TYPES.bigint64array]: () => [
          [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_fromS64').index ]
        ],
        [TYPES.biguint64array]: () => [
          [ Opcodes.call, includeBuiltin(scope, '__Porffor_bigint_fromU64').index ]
        ]
      }, {
        prelude: [
          objectGet,
          Opcodes.i32_to_u,
          [ Opcodes.i32_load, 0, 4 ],

          propertyGet,
          Opcodes.i32_to_u,

          number(8, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],

          [ Opcodes.i64_load, 0, 4 ]
        ],
        postlude: setLastType(scope, TYPES.bigint, true)
      })
    } : {}),

    [TYPES.undefined]: () => internalThrow(scope, 'TypeError', `Cannot read property of undefined`, true),

    default: () => [
      ...(coctc > 0 && known === TYPES.object ? [
        [ Opcodes.local_get, coctcObjTmp ],
        number(TYPES.object, Valtype.i32)
      ] : [
        objectGet,
        Opcodes.i32_to,
        ...type
      ]),

      ...toPropertyKey(scope, [ propertyGet ], getNodeType(scope, property), decl.computed, true),

      ...(hash != null ? [
        number(hash, Valtype.i32),
        number(TYPES.number, Valtype.i32),
        [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_get_withHash').index ]
      ] : [
        [ Opcodes.call, includeBuiltin(scope, '__Porffor_object_get').index ]
      ]),
      ...setLastType(scope),
      ...(valtypeBinary === Valtype.i32 ? [ Opcodes.i32_trunc_sat_f64_s ] : [])
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

      ...nullish(scope, [], type),
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
    if (coctc > 0) {
      // fast path: COCTC
      out.unshift(
        ...generate(scope, decl.object),
        [ Opcodes.local_set, objectTmp ],
        ...coctcSetup(scope, decl.object, coctcObjTmp, 'get', [ [ Opcodes.local_get, objectTmp ] ]),

        [ Opcodes.local_get, coctcObjTmp ],
        [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(coctc + 8) ],
        [ Opcodes.local_tee, localTmp(scope, '#coctc_tmp', Valtype.i32) ],
        [ Opcodes.if, Valtype.f64 ],
          [ Opcodes.local_get, coctcObjTmp ],
          [ Opcodes.f64_load, 0, ...unsignedLEB128(coctc) ],

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

  if (!decl.id) decl.id = { type: 'Identifier', name: `#anonymous${uniqId()}` };
  const name = decl.id.name;
  if (!expr) hoist(scope, name, 2, true);

  const body = decl.body.body;
  const root = {
    type: 'Identifier',
    name
  };
  const proto = getObjProp(root, 'prototype');

  const [ func, out ] = generateFunc(scope, {
    ...(body.find(x => x.kind === 'constructor')?.value ?? (decl.superClass ? {
      type: 'FunctionExpression',
      params: [
        {
          type: 'RestElement',
          argument: { type: 'Identifier', name: 'args' }
        }
      ],
      body: {
        type: 'ExpressionStatement',
        expression: {
          type: 'CallExpression',
          callee: { type: 'Super' },
          arguments: [ {
            type: 'SpreadElement',
            argument: { type: 'Identifier', name: 'args' }
          } ]
        }
      }
    }: {
      type: 'FunctionExpression',
      params: [],
      body: {
        type: 'BlockStatement',
        body: []
      }
    })),
    id: root,
    strict: true,
    type: expr ? 'FunctionExpression' : 'FunctionDeclaration',
    _onlyConstr: true,
    _subclass: !!decl.superClass
  });

  // always generate class constructor funcs
  func.generate();

  if (decl.superClass) {
    const superTmp = localTmp(scope, '#superclass');
    const superTypeTmp = localTmp(scope, '#superclass#type', Valtype.i32);

    out.push(
      // class Foo {}
      // class Bar extends Foo {}
      ...generate(scope, decl.superClass),
      [ Opcodes.local_set, superTmp ],
      ...getNodeType(scope, decl.superClass),
      [ Opcodes.local_tee, superTypeTmp ],

      // check if Foo is null, if so special case
      // see also: https://github.com/tc39/ecma262/pull/1321
      number(TYPES.object, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.local_get, superTmp ],
      ...Opcodes.eqz,
      [ Opcodes.i32_and ],
      [ Opcodes.if, Blocktype.void ],
        // Bar.prototype.__proto__ = null
        ...generate(scope, {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: '__Porffor_object_setPrototype' },
          arguments: [
            proto,
            { type: 'Literal', value: null }
          ]
        }),
        [ Opcodes.drop ],
      [ Opcodes.else ],
        // Bar.__proto__ = Foo
        ...generate(scope, {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: '__Porffor_object_setPrototype' },
          arguments: [
            root,
            { type: 'Identifier', name: '#superclass' }
          ]
        }),
        [ Opcodes.drop ],

        // Bar.prototype.__proto__ = Foo.prototype
        ...generate(scope, {
          type: 'CallExpression',
          callee: { type: 'Identifier', name: '__Porffor_object_setPrototype' },
          arguments: [
            proto,
            getObjProp(
              { type: 'Identifier', name: '#superclass' },
              'prototype'
            )
          ]
        }),
        [ Opcodes.drop ],
      [ Opcodes.end ]
    );
  }

  // opt: avoid mass generate calls for many class fields
  const rootWasm = scope.overrideThis = generate(scope, root);
  const rootType = scope.overrideThisType = [ [ Opcodes.i32_const, TYPES.function ] ];
  const protoWasm = generate(scope, proto);
  const protoType = getNodeType(scope, proto);
  const thisWasm = generate(func, { type: 'ThisExpression', _noGlobalThis: true });
  const thisType = getNodeType(func, { type: 'ThisExpression', _noGlobalThis: true });

  const batchedNonStaticPropWasm = [];
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

    value ??= {
      type: 'Identifier',
      name: 'undefined'
    };

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
      if (computed) {
        // compute key now, reference in construction
        const computedTmp = allocVar(scope, `#class_computed_prop${uniqId()}`, true, true, true);

        out.push(
          ...toPropertyKey(scope, generate(scope, key), getNodeType(scope, key), computed, true),
          [ Opcodes.global_set, computedTmp + 1 ],
          [ Opcodes.global_set, computedTmp ]
        );

        batchedNonStaticPropWasm.push(
          ...thisWasm,
          Opcodes.i32_to_u,
          ...thisType,

          [ Opcodes.global_get, computedTmp ],
          [ Opcodes.global_get, computedTmp + 1 ],

          ...generate(func, value),
          ...getNodeType(func, value),

          [ Opcodes.call, includeBuiltin(func, `__Porffor_object_class_value`).index ]
        );
      } else {
        batchedNonStaticPropWasm.push(
          ...thisWasm,
          Opcodes.i32_to_u,
          ...thisType,

          ...generate(func, key),
          Opcodes.i32_to_u,
          ...getNodeType(func, key),

          ...generate(func, value),
          ...getNodeType(func, value),

          [ Opcodes.call, includeBuiltin(func, `__Porffor_object_class_value`).index ]
        );
      }
    } else {
      let initKind = type === 'MethodDefinition' ? 'method' : 'value';
      if (kind === 'get' || kind === 'set') initKind = kind;

      out.push(
        ...(_static ? rootWasm : protoWasm),
        Opcodes.i32_to_u,
        ...(_static ? rootType : protoType),

        ...toPropertyKey(scope, generate(scope, key), getNodeType(scope, key), computed, true),

        ...generate(scope, value),
        ...(initKind !== 'value' && initKind !== 'method' ? [ Opcodes.i32_to_u ] : []),
        ...getNodeType(scope, value),

        [ Opcodes.call, includeBuiltin(scope, `__Porffor_object_class_${initKind}`).index ]
      );
    }
  }

  const constrInsertIndex = func.wasm.findIndex(x => x.at(-1) === 'super marker');
  if (constrInsertIndex != -1) {
    func.wasm.splice(constrInsertIndex, 1);
    func.wasm.splice(constrInsertIndex, 0, ...batchedNonStaticPropWasm);
  } else {
    func.wasm = batchedNonStaticPropWasm.concat(func.wasm);
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
    __proto__: null,
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

        let inst = Opcodes[asm[0].replaceAll('.', '_')];
        if (inst == null) throw new Error(`inline asm: inst ${asm[0]} not found`);
        if (!Array.isArray(inst)) inst = [ inst ];

        const immediates = asm.slice(1).map(x => {
          const n = parseFloat(x);
          if (Number.isNaN(n) && x !== 'NaN') {
            if (x in builtinFuncs) {
              if (funcIndex[x] == null) includeBuiltin(scope, x);
              return funcIndex[x];
            }

            if (x in importedFuncs) {
              scope.usesImports = true;
              return importedFuncs[x];
            }

            return scope.locals[x]?.idx ?? globals[x]?.idx ?? (log.warning('codegen', `unknown immediate in Porffor.wasm: ${x}`) || 0);
          }

          return n;
        });

        const encodeFunc = ({
          [Opcodes.f64_const]: x => x,
          [Opcodes.i32_const]: x => x,
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

    __Porffor_c: str => {
      if (Prefs.secure) throw new Error('Porffor.c is not allowed in --secure');
      return [
        [ null, 'c', str ]
      ];
    },

    __Porffor_bs: str => makeString(scope, str, true),
    __Porffor_s: str => makeString(scope, str, false)
  };

  const { quasis, expressions } = decl.quasi;
  if (decl.tag.name in intrinsics) {
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

  const tmp = localTmp(scope, '#tagged_template_strings');
  const tmpIdent = {
    type: 'Identifier',
    name: '#tagged_template_strings',
    _type: TYPES.array
  };

  return [
    ...generate(scope, {
      type: 'ArrayExpression',
      elements: quasis.map(x => ({
        type: 'Literal',
        value: x.value.cooked
      }))
    }),
    [ Opcodes.local_set, tmp ],

    ...generate(scope, setObjProp(tmpIdent, 'raw', {
      type: 'ArrayExpression',
      elements: quasis.map(x => ({
        type: 'Literal',
        value: x.value.raw
      }))
    })),
    [ Opcodes.drop ],

    ...generate(scope, {
      type: 'CallExpression',
      callee: decl.tag,
      arguments: [
        tmpIdent,
        ...expressions
      ]
    })
  ];
};

globalThis._uniqId = 0;
const uniqId = () => '_' + globalThis._uniqId++;

let objectHackers = [];
const objectHack = node => {
  if (!node) return node;

  if (node.type === 'MemberExpression') {
    const out = (() => {
      const abortOut = { ...node, object: objectHack(node.object) };
      if (node.computed || node.optional || node.property.type === 'PrivateIdentifier') return;

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
      if ((!hasFuncWithName(name) && !(name in builtinVars) && !hasFuncWithName(name + '$get')) && (hasFuncWithName(objectName) || objectName in builtinVars || hasFuncWithName('__' + objectName) || ('__' + objectName) in builtinVars)) return abortOut;

      if (Prefs.codeLog) log('codegen', `object hack! ${node.object.name}.${node.property.name} -> ${name}`);

      return {
        type: 'Identifier',
        name
      };
    })();

    if (out) return out;
  }

  for (const x in node) {
    if (node[x] != null && typeof node[x] === 'object' && x[0] !== '_') {
      if (node[x].type) node[x] = objectHack(node[x]);
      if (Array.isArray(node[x])) {
        for (let i = 0; i < node[x].length; i++) {
          node[x][i] = objectHack(node[x][i]);
        }
      }
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

const builtinFuncByName = name => {
  const normal = funcByName(name);
  if (!normal || normal.internal) return normal;

  return funcs.find(x => x.name === name && x.internal);
};

const generateFunc = (scope, decl, forceNoExpr = false) => {
  doNotMarkFuncRef = false;

  if (!decl.id) decl.id = { type: 'Identifier', name: `#anonymous${uniqId()}` };
  const name = decl.id.name;
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
    locals: Object.create(null),
    localInd: 0,
    returns: [ valtypeBinary, Valtype.i32 ], // value, type
    name,
    index: currentFuncIndex++,
    arrow,
    constr: !arrow && !decl.generator && !decl.async && !decl._method, // constructable
    method: !arrow && (decl._method || decl.generator || decl.async), // has this but not constructable
    async: decl.async,
    subclass: decl._subclass, _onlyConstr: decl._onlyConstr, _onlyThisMethod: decl._onlyThisMethod,
    strict: scope.strict || decl.strict,

    generate() {
      if (func.wasm) return func.wasm;

      // generating, stub _wasm
      let wasm = func.wasm = [];

      let body = decl.body;
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
        allocVar(func, name, false, true, false, true);

        func.localInd = localInd;
        if (type) {
          const typeAnno = extractTypeAnnotation(type);
          addVarMetadata(func, name, false, typeAnno);

          if (typeAnno.types) for (const x of typeAnno.types) typeUsed(func, x);

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

            if (typeAnno.type === TYPES.string) {
              wasm.push(
                [ Opcodes.local_get, func.locals[name].idx + 1 ],
                number(TYPES.string, Valtype.i32),
                [ Opcodes.i32_ne ],
                [ Opcodes.if, Blocktype.void ],
                  [ Opcodes.local_get, func.locals[name].idx + 1 ],
                  number(TYPES.undefined, Valtype.i32),
                  [ Opcodes.i32_eq ],

                  [ Opcodes.local_get, func.locals[name].idx + 1 ],
                  number(TYPES.object, Valtype.i32),
                  [ Opcodes.i32_eq ],
                  [ Opcodes.local_get, func.locals[name].idx ],
                  ...Opcodes.eqz,
                  [ Opcodes.i32_and ],

                  [ Opcodes.i32_or ],
                  [ Opcodes.if, Blocktype.void ],
                    ...internalThrow(func, 'TypeError', `${unhackName(func.name)} expects 'this' to be non-nullish`),
                  [ Opcodes.end ],

                  [ Opcodes.local_get, func.locals[name].idx ],
                  ...(valtypeBinary === Valtype.i32 ? [ [ Opcodes.f64_convert_i32_s ] ] : []),
                  [ Opcodes.local_get, func.locals[name].idx + 1 ],
                  [ Opcodes.call, includeBuiltin(scope, '__ecma262_ToString').index ],
                  [ Opcodes.local_set, func.locals[name].idx + 1 ],
                  ...(valtypeBinary === Valtype.i32 ? [ Opcodes.i32_trunc_sat_f64_s ] : []),
                  [ Opcodes.local_set, func.locals[name].idx ],

                  [ Opcodes.local_get, func.locals[name].idx + 1 ],
                  number(TYPES.bytestring, Valtype.i32),
                  [ Opcodes.i32_eq ],
                  [ Opcodes.if, Blocktype.void ],
                    [ Opcodes.local_get, func.locals[name].idx ],
                    Opcodes.i32_to_u,
                    [ Opcodes.call, includeBuiltin(scope, '__Porffor_bytestringToString').index ],
                    Opcodes.i32_from_u,
                    [ Opcodes.local_set, func.locals[name].idx ],
                  [ Opcodes.end ],
                [ Opcodes.end ]
              );
            }

            if ([
              TYPES.number, TYPES.promise, TYPES.symbol, TYPES.function,
              TYPES.set, TYPES.map, TYPES.weakref, TYPES.weakset, TYPES.weakmap,
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
        if (func.async) typeUsed(func, TYPES.promise);
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
        if (('Promise' in funcIndex) || ('__Promise_resolve' in funcIndex) || ('__Promise_reject' in funcIndex)) {
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
    const { type, types } = extractTypeAnnotation(decl.returnType);

    if (type != null) {
      typeUsed(func, type);
      func.returnType = type;
      func.returns = func.returnType === TYPES.undefined && !func.async && !func.generator ? [] : [ valtypeBinary ];
    } else if (types != null) {
      func.returnTypes = types;
      for (const x of types) typeUsed(func, x);
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

    args.push({ name, def, destr, type: typedInput && x.typeAnnotation });
  }

  // custom built-in length changes
  if (globalThis.precompile) {
    if (name.includes('_prototype_')) jsLength--;
    jsLength = ({
      Array: 1,
      String: 1,
      __Object_assign: 2,
      __String_fromCharCode: 1,
      __String_fromCodePoint: 1,
      __Array_prototype_concat: 1,
      __Array_prototype_push: 1,
      __Array_prototype_unshift: 1,
      __String_prototype_concat: 1,
      __ByteString_prototype_concat: 1,
      __Atomics_wait: 4,
      __Atomics_notify: 3,
      Date: 7
    })[name] ?? jsLength;
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

  inferBranchStart(scope);

  let len = decl.body.length, j = 0;
  for (let i = 0; i < len; i++) {
    const x = decl.body[i];
    if (isEmptyNode(x)) continue;

    if (j++ > 0) out.push([ Opcodes.drop ]);
    out = out.concat(generate(scope, x));
  }

  inferBranchEnd(scope);

  if (out.length === 0) out.push(number(UNDEFINED));
  return out;
};

let globals, tags, exceptions, funcs, indirectFuncs, funcIndex, currentFuncIndex, depth, pages, data, typeswitchDepth, usedTypes, coctc, globalInfer, builtinFuncs, builtinVars, lastValtype;
export default program => {
  globals = Object.create(null);
  globals['#ind'] = 0;
  tags = [];
  exceptions = [];
  funcs = []; indirectFuncs = [];
  funcs.bytesPerFuncLut = () => {
    return indirectFuncs._bytesPerFuncLut ??=
      Math.min(Math.floor((pageSize * 2) / indirectFuncs.length), indirectFuncs.reduce((acc, x) => x.name.length > acc ? x.name.length : acc, 0) + 8);
  };
  funcIndex = Object.create(null);
  depth = [];
  pages = new Map();
  data = [];
  currentFuncIndex = importedFuncs.length;
  typeswitchDepth = 0;
  usedTypes = new Set([ TYPES.undefined, TYPES.number, TYPES.boolean, TYPES.function ]);
  coctc = new Map();
  globalInfer = Object.create(null);

  // set generic opcodes for current valtype
  Opcodes.const = valtypeBinary === Valtype.i32 ? Opcodes.i32_const : Opcodes.f64_const;
  Opcodes.eq = valtypeBinary === Valtype.i32 ? Opcodes.i32_eq : Opcodes.f64_eq;
  Opcodes.eqz = valtypeBinary === Valtype.i32 ? [ [ Opcodes.i32_eqz ] ] : [ number(0), [ Opcodes.f64_eq ] ];
  Opcodes.mul = valtypeBinary === Valtype.i32 ? Opcodes.i32_mul : Opcodes.f64_mul;
  Opcodes.add = valtypeBinary === Valtype.i32 ? Opcodes.i32_add : Opcodes.f64_add;
  Opcodes.sub = valtypeBinary === Valtype.i32 ? Opcodes.i32_sub : Opcodes.f64_sub;
  Opcodes.i32_to = valtypeBinary === Valtype.i32 ? [] : Opcodes.i32_trunc_sat_f64_s;
  Opcodes.i32_to_u = valtypeBinary === Valtype.i32 ? [] : Opcodes.i32_trunc_sat_f64_u;
  Opcodes.i32_from = valtypeBinary === Valtype.i32 ? [] : [ Opcodes.f64_convert_i32_s ];
  Opcodes.i32_from_u = valtypeBinary === Valtype.i32 ? [] : [ Opcodes.f64_convert_i32_u ];
  Opcodes.load = valtypeBinary === Valtype.i32 ? Opcodes.i32_load : Opcodes.f64_load;
  Opcodes.store = valtypeBinary === Valtype.i32 ? Opcodes.i32_store : Opcodes.f64_store;

  // keep builtins between compiles as much as possible
  if (lastValtype !== valtypeBinary) {
    lastValtype = valtypeBinary;
    builtinFuncs = BuiltinFuncs();
    builtinVars = BuiltinVars({ builtinFuncs });

    const getObjectName = x => x.startsWith('__') && x.slice(2, x.indexOf('_', 2));
    objectHackers = ['assert', 'compareArray', 'Test262Error', ...new Set(Object.keys(builtinFuncs).map(getObjectName).concat(Object.keys(builtinVars).map(getObjectName)).filter(x => x))];
  }

  // todo/perf: make this lazy per func (again)
  program = objectHack(program);
  if (Prefs.closures) program = semantic(program);

  generateFunc({}, {
    type: 'Program',
    id: { name: '#main' },
    body: {
      type: 'BlockStatement',
      body: program.body
    }
  });

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