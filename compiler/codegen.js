import { Blocktype, Opcodes, Valtype, ValtypeSize } from './wasmSpec.js';
import { ieee754_binary64, signedLEB128, unsignedLEB128, encodeVector, read_signedLEB128 } from './encoding.js';
import { operatorOpcode } from './expression.js';
import { BuiltinFuncs, BuiltinVars, importedFuncs, NULL, UNDEFINED } from './builtins.js';
import { PrototypeFuncs } from './prototype.js';
import { number } from './embedding.js';
import { TYPES, TYPE_FLAGS, TYPE_NAMES, typeHasFlag } from './types.js';
import * as Rhemyn from '../rhemyn/compile.js';
import parse from './parse.js';
import { log } from './log.js';
import Prefs from './prefs.js';
import makeAllocator from './allocators.js';

let globals = {};
let tags = [];
let funcs = [];
let exceptions = [];
let funcIndex = {};
let currentFuncIndex = importedFuncs.length;
let builtinFuncs = {}, builtinVars = {}, prototypeFuncs = {};
let allocator;

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
  type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression';
const hasFuncWithName = name =>
  Object.hasOwn(funcIndex, name) != null || Object.hasOwn(builtinFuncs, name) != null || Object.hasOwn(importedFuncs, name) != null || Object.hasOwn(internalConstrs, name) != null;

const astCache = new WeakMap();
const cacheAst = (decl, wasm) => {
  astCache.set(decl, wasm);
  return wasm;
};
const generate = (scope, decl, global = false, name = undefined, valueUnused = false) => {
  if (astCache.has(decl)) return astCache.get(decl);

  switch (decl.type) {
    case 'BinaryExpression':
      return cacheAst(decl, generateBinaryExp(scope, decl, global, name));

    case 'LogicalExpression':
      return cacheAst(decl, generateLogicExp(scope, decl));

    case 'Identifier':
      return cacheAst(decl, generateIdent(scope, decl));

    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      const func = generateFunc(scope, decl);

      if (decl.type.endsWith('Expression')) {
        return cacheAst(decl, number(func.index - importedFuncs.length));
      }

      return cacheAst(decl, []);

    case 'BlockStatement':
      return cacheAst(decl, generateCode(scope, decl));

    case 'ReturnStatement':
      return cacheAst(decl, generateReturn(scope, decl));

    case 'ExpressionStatement':
      return cacheAst(decl, generateExp(scope, decl));

    case 'SequenceExpression':
      return cacheAst(decl, generateSequence(scope, decl));

    case 'ChainExpression':
      return cacheAst(decl, generateChain(scope, decl));

    case 'CallExpression':
      return cacheAst(decl, generateCall(scope, decl, global, name, valueUnused));

    case 'NewExpression':
      return cacheAst(decl, generateNew(scope, decl, global, name));

    case 'Literal':
      return cacheAst(decl, generateLiteral(scope, decl, global, name));

    case 'VariableDeclaration':
      return cacheAst(decl, generateVar(scope, decl));

    case 'AssignmentExpression':
      return cacheAst(decl, generateAssign(scope, decl));

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
      return cacheAst(decl, [[ Opcodes.call, importedFuncs.debugger ]]);

    case 'ArrayExpression':
      return cacheAst(decl, generateArray(scope, decl, global, name));

    case 'ObjectExpression':
      return cacheAst(decl, generateObject(scope, decl, global, name));

    case 'MemberExpression':
      return cacheAst(decl, generateMember(scope, decl, global, name));

    case 'ExportNamedDeclaration':
      const funcsBefore = funcs.map(x => x.name);
      generate(scope, decl.declaration);

      // set new funcs as exported
      if (funcsBefore.length !== funcs.length) {
        const newFuncs = funcs.filter(x => !funcsBefore.includes(x.name)).filter(x => !x.internal);

        for (const x of newFuncs) {
          x.export = true;
        }
      }

      return cacheAst(decl, []);

    case 'TaggedTemplateExpression': {
      const funcs = {
        __Porffor_wasm: str => {
          let out = [];

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
              const int = parseInt(x);
              if (Number.isNaN(int)) {
                if (builtinFuncs[x]) {
                  if (funcIndex[x] == null) includeBuiltin(scope, x);
                  return funcIndex[x];
                }

                return scope.locals[x]?.idx ?? globals[x].idx;
              }
              return int;
            });

            const encodeFunc = ({
              [Opcodes.f64_const]: ieee754_binary64,
              [Opcodes.if]: unsignedLEB128
            })[inst[0]] ?? signedLEB128;
            out.push([ ...inst, ...immediates.flatMap(x => encodeFunc(x)) ]);
          }

          return out;
        },

        __Porffor_bs: str => makeString(scope, str, global, name, true),
        __Porffor_s: str => makeString(scope, str, global, name, false)
      };

      const func = decl.tag.name;
      // hack for inline asm
      if (!funcs[func]) return cacheAst(decl, todo(scope, 'tagged template expressions not implemented', true));

      const { quasis, expressions } = decl.quasi;
      let str = quasis[0].value.raw;

      for (let i = 0; i < expressions.length; i++) {
        const e = expressions[i];
        if (!e.name) {
          if (e.type === 'BinaryExpression' && e.operator === '+' && e.left.type === 'Identifier' && e.right.type === 'Literal') {
            str += lookupName(scope, e.left.name)[0].idx + e.right.value;
          } else todo(scope, 'unsupported expression in intrinsic');
        } else str += lookupName(scope, e.name)[0].idx;

        str += quasis[i + 1].value.raw;
      }

      return cacheAst(decl, funcs[func](str));
    }

    default:
      // ignore typescript nodes
      if (decl.type.startsWith('TS') ||
          decl.type === 'ImportDeclaration' && decl.importKind === 'type') {
        return cacheAst(decl, []);
      }

      return cacheAst(decl, todo(scope, `no generation for ${decl.type}!`));
  }
};

const mapName = x => {
  if (!x) return x;

  if (x.startsWith('__globalThis_')) {
    const key = x.slice('__globalThis_'.length);
    // hack: this will not work properly
    return key.includes('_') ? ('__' + key) : key;
  }

  return x;
};

const lookupName = (scope, _name) => {
  const name = mapName(_name);

  if (Object.hasOwn(scope.locals, name)) return [ scope.locals[name], false ];
  if (Object.hasOwn(globals, name)) return [ globals[name], true ];

  return [ undefined, undefined ];
};

const internalThrow = (scope, constructor, message, expectsValue = Prefs.alwaysValueInternalThrows) => [
  ...generateThrow(scope, {
    argument: {
      type: 'NewExpression',
      callee: {
        type: 'Identifier',
        name: constructor
      },
      arguments: [
        {
          type: 'Literal',
          value: message
        }
      ]
    }
  }),
  ...(expectsValue ? number(UNDEFINED) : [])
];

const generateIdent = (scope, decl) => {
  const lookup = rawName => {
    const name = mapName(rawName);
    let local = scope.locals[rawName];

    if (Object.hasOwn(builtinVars, name)) {
      if (builtinVars[name].floatOnly && valtype[0] === 'i') throw new Error(`Cannot use ${unhackName(name)} with integer valtype`);

      let wasm = builtinVars[name];
      if (typeof wasm === 'function') wasm = asmFuncToAsm(scope, wasm);
      return wasm.slice();
    }

    // todo: enable this by default in future
    if (!Object.hasOwn(funcIndex, name) && Object.hasOwn(builtinFuncs, name)) {
      includeBuiltin(scope, name);
      return number(funcIndex[name] - importedFuncs.length);
    }

    if (isExistingProtoFunc(name) || Object.hasOwn(internalConstrs, name) || Object.hasOwn(builtinFuncs, name)) {
      // todo: return an actual something
      return number(1);
    }

    if (local?.idx === undefined) {
      // no local var with name
      if (Object.hasOwn(globals, name)) return [ [ Opcodes.global_get, globals[name].idx ] ];

      if (Object.hasOwn(importedFuncs, name)) return number(importedFuncs[name] - importedFuncs.length);
      if (Object.hasOwn(funcIndex, name)) return number(funcIndex[name] - importedFuncs.length);
    }

    if (local?.idx === undefined && rawName.startsWith('__')) {
      // return undefined if unknown key in already known var
      let parent = rawName.slice(2).split('_').slice(0, -1).join('_');
      if (parent.includes('_')) parent = '__' + parent;

      const parentLookup = lookup(parent);
      if (!parentLookup[1]) return number(UNDEFINED);
    }

    if (local?.idx === undefined) return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`, true);

    return [ [ Opcodes.local_get, local.idx ] ];
  };

  return lookup(decl.name);
};

const generateReturn = (scope, decl) => {
  if (decl.argument === null) {
    // just bare "return"
    return [
      ...number(UNDEFINED), // "undefined" if func returns
      ...(scope.returnType != null ? [] : [
        ...number(TYPES.undefined, Valtype.i32) // type undefined
      ]),
      [ Opcodes.return ]
    ];
  }

  return [
    ...generate(scope, decl.argument),
    ...(scope.returnType != null ? [] : getNodeType(scope, decl.argument)),
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
  // -->
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

const concatStrings = (scope, left, right, leftType, rightType, allBytestrings = false, skipTypeCheck = false) => {
  // todo: this should be rewritten into a built-in/func: String.prototype.concat
  // todo: convert left and right to strings if not
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?

  const rightPointer = localTmp(scope, 'concat_right_pointer', Valtype.i32);
  const rightLength = localTmp(scope, 'concat_right_length', Valtype.i32);
  const leftLength = localTmp(scope, 'concat_left_length', Valtype.i32);

  const leftPointer = localTmp(scope, 'concat_left_pointer', Valtype.i32);

  // alloc/assign array
  const out = localTmp(scope, 'concat_out_pointer', Valtype.i32);

  if (!skipTypeCheck && !allBytestrings) includeBuiltin(scope, '__Porffor_bytestringToString');
  return [
    // setup pointers
    ...(left.length === 0 ? [
      Opcodes.i32_to_u,
      [ Opcodes.local_set, rightPointer ],

      Opcodes.i32_to_u,
      [ Opcodes.local_set, leftPointer ],
    ] : [
      ...left,
      Opcodes.i32_to_u,
      [ Opcodes.local_set, leftPointer ],

      ...right,
      Opcodes.i32_to_u,
      [ Opcodes.local_set, rightPointer ],
    ]),

    // setup out
    [ Opcodes.i32_const, 1 ],
    [ Opcodes.memory_grow, 0 ],
    [ Opcodes.i32_const, ...signedLEB128(65536) ],
    [ Opcodes.i32_mul ],
    [ Opcodes.local_tee, out ],

    // calculate length
    [ Opcodes.local_get, leftPointer ],
    [ Opcodes.i32_load, 0, 0 ],
    [ Opcodes.local_tee, leftLength ],

    [ Opcodes.local_get, rightPointer ],
    [ Opcodes.i32_load, 0, 0 ],
    [ Opcodes.local_tee, rightLength ],

    [ Opcodes.i32_add ],

    // store length
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ],

    ...(skipTypeCheck || allBytestrings ? [] : [
      ...leftType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.if, Blocktype.void ],
      [ Opcodes.local_get, leftPointer ],
      [ Opcodes.local_get, leftLength ],
      [ Opcodes.call, ...unsignedLEB128(funcIndex.__Porffor_bytestringToString) ],
      [ Opcodes.local_set, leftPointer ],
      [ Opcodes.end ],

      ...rightType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.if, Blocktype.void ],
      [ Opcodes.local_get, rightPointer ],
      [ Opcodes.local_get, rightLength ],
      [ Opcodes.call, ...unsignedLEB128(funcIndex.__Porffor_bytestringToString) ],
      [ Opcodes.local_set, rightPointer ],
      [ Opcodes.end ]
    ]),

    // copy left
    // dst = out pointer + length size
    [ Opcodes.local_get, out ],
    ...number(ValtypeSize.i32, Valtype.i32),
    [ Opcodes.i32_add ],

    // src = left pointer + length size
    [ Opcodes.local_get, leftPointer ],
    ...number(ValtypeSize.i32, Valtype.i32),
    [ Opcodes.i32_add ],

    // size = PageSize - length size. we do not need to calculate length as init value
    ...number(pageSize - ValtypeSize.i32, Valtype.i32),
    [ ...Opcodes.memory_copy, 0x00, 0x00 ],

    // copy right
    // dst = out pointer + length size + left length * sizeof valtype
    [ Opcodes.local_get, out ],
    ...number(ValtypeSize.i32, Valtype.i32),
    [ Opcodes.i32_add ],

    [ Opcodes.local_get, leftLength ],
    ...number(allBytestrings ? ValtypeSize.i8 : ValtypeSize.i16, Valtype.i32),
    [ Opcodes.i32_mul ],
    [ Opcodes.i32_add ],

    // src = right pointer + length size
    [ Opcodes.local_get, rightPointer ],
    ...number(ValtypeSize.i32, Valtype.i32),
    [ Opcodes.i32_add ],

    // size = right length * sizeof valtype
    [ Opcodes.local_get, rightLength ],
    ...number(allBytestrings ? ValtypeSize.i8 : ValtypeSize.i16, Valtype.i32),
    [ Opcodes.i32_mul ],

    [ ...Opcodes.memory_copy, 0x00, 0x00 ],

    ...setLastType(scope, allBytestrings ? TYPES.bytestring : TYPES.string),

    // return new string (page)
    [ Opcodes.local_get, out ],
    Opcodes.i32_from_u
  ];
};

const compareStrings = (scope, left, right, leftType, rightType, allBytestrings = false, skipTypeCheck = false) => {
  // todo: this should be rewritten into a func
  // todo: convert left and right to strings if not
  // todo: optimize by looking up names in arrays and using that if exists?
  // todo: optimize this if using literals/known lengths?

  const leftPointer = localTmp(scope, 'compare_left_pointer', Valtype.i32);
  const leftLength = localTmp(scope, 'compare_left_length', Valtype.i32);
  const rightPointer = localTmp(scope, 'compare_right_pointer', Valtype.i32);

  const index = localTmp(scope, 'compare_index', Valtype.i32);
  const indexEnd = localTmp(scope, 'compare_index_end', Valtype.i32);

  if (!skipTypeCheck && !allBytestrings) includeBuiltin(scope, '__Porffor_bytestringToString');
  return [
    // setup pointers
    ...(left.length === 0 ? [
      Opcodes.i32_to_u,
      [ Opcodes.local_set, rightPointer ],

      Opcodes.i32_to_u,
      [ Opcodes.local_set, leftPointer ],

      [ Opcodes.local_get, leftPointer ],
      [ Opcodes.local_get, rightPointer ],
    ] : [
      ...left,
      Opcodes.i32_to_u,
      [ Opcodes.local_tee, leftPointer ],

      ...right,
      Opcodes.i32_to_u,
      [ Opcodes.local_tee, rightPointer ],
    ]),

    // fast path: check leftPointer == rightPointer
    // use if (block) for everything after to "return" a value early
    [ Opcodes.i32_ne ],
    [ Opcodes.if, Valtype.i32 ],

    // get lengths
    [ Opcodes.local_get, leftPointer ],
    [ Opcodes.i32_load, 0, 0 ],
    [ Opcodes.local_tee, leftLength ],

    [ Opcodes.local_get, rightPointer ],
    [ Opcodes.i32_load, 0, 0 ],

    ...(skipTypeCheck || allBytestrings ? [] : [
      ...leftType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.if, Blocktype.void ],
      [ Opcodes.local_get, leftPointer ],
      [ Opcodes.local_get, leftLength ],
      [ Opcodes.call, ...unsignedLEB128(funcIndex.__Porffor_bytestringToString) ],
      [ Opcodes.local_set, leftPointer ],
      [ Opcodes.end ],

      ...rightType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.if, Blocktype.void ],
      [ Opcodes.local_get, rightPointer ],
      [ Opcodes.local_get, rightPointer ],
      [ Opcodes.i32_load, 0, 0 ],
      [ Opcodes.call, ...unsignedLEB128(funcIndex.__Porffor_bytestringToString) ],
      [ Opcodes.local_set, rightPointer ],
      [ Opcodes.end ]
    ]),

    // fast path: check leftLength != rightLength
    [ Opcodes.i32_ne ],
    [ Opcodes.if, Blocktype.void ],
    ...number(0, Valtype.i32),
    [ Opcodes.br, 1 ],
    [ Opcodes.end ],

    // no fast path for length = 0 as it would probably be slower for most of the time?

    // tmp could have already been used
    ...number(0, Valtype.i32),
    [ Opcodes.local_set, index ],

    // setup index end as length * sizeof valtype (1 for bytestring, 2 for string)
    // we do this instead of having to do mul/div each iter for perf™
    [ Opcodes.local_get, leftLength ],
    ...(allBytestrings ? [] : [
      ...number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_mul ],
    ]),
    [ Opcodes.local_set, indexEnd ],

    // iterate over each char and check if eq
    [ Opcodes.loop, Blocktype.void ],

    // fetch left
    [ Opcodes.local_get, index ],
    [ Opcodes.local_get, leftPointer ],
    [ Opcodes.i32_add ],
    allBytestrings ?
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ] :
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

    // fetch right
    [ Opcodes.local_get, index ],
    [ Opcodes.local_get, rightPointer ],
    [ Opcodes.i32_add ],
    allBytestrings ?
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ] :
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

    // not equal, "return" false
    [ Opcodes.i32_ne ],
    [ Opcodes.if, Blocktype.void ],
    ...number(0, Valtype.i32),
    [ Opcodes.br, 2 ],
    [ Opcodes.end ],

    // index += sizeof valtype (1 for bytestring, 2 for string)
    [ Opcodes.local_get, index ],
    ...number(allBytestrings ? ValtypeSize.i8 : ValtypeSize.i16, Valtype.i32),
    [ Opcodes.i32_add ],
    [ Opcodes.local_tee, index ],

    // if index < index end (length * sizeof valtype), loop
    [ Opcodes.local_get, indexEnd ],
    [ Opcodes.i32_lt_s ],
    [ Opcodes.br_if, 0 ],
    [ Opcodes.end ],

    // no failed checks, so true!
    ...number(1, Valtype.i32),

    // pointers match, so true
    [ Opcodes.else ],
    ...number(1, Valtype.i32),
    [ Opcodes.end ],

    // convert i32 result to valtype
    // do not do as automatically added by binary exp gen for equality ops
    // Opcodes.i32_from_u
  ];
};

const truthy = (scope, wasm, type, intIn = false, intOut = false, forceTruthyMode = undefined) => {
  if (isIntToFloatOp(wasm[wasm.length - 1])) return [
    ...wasm,
    ...(!intIn && intOut ? [ Opcodes.i32_to_u ] : [])
  ];
  if (isIntOp(wasm[wasm.length - 1])) return [
    ...wasm,
    ...(intOut ? [] : [ Opcodes.i32_from ]),
  ];

  // todo/perf: use knownType and custom bytecode here instead of typeSwitch

  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);

  const def = (truthyMode => {
    if (truthyMode === 'full') return [
      // if value != 0 or NaN
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
      ...(intIn ? [] : [ Opcodes.i32_to ]),

      [ Opcodes.i32_eqz ],
      [ Opcodes.i32_eqz ],

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
  })(forceTruthyMode ?? Prefs.truthy ?? 'full');

  return [
    ...wasm,
    ...(!useTmp ? [] : [ [ Opcodes.local_set, tmp ] ]),

    ...typeSwitch(scope, type, {
      [TYPES.string]: [
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
        ...(intIn ? [] : [ Opcodes.i32_to_u ]),

        // get length
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

        // if length != 0
        /* [ Opcodes.i32_eqz ],
        [ Opcodes.i32_eqz ], */
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ],
      [TYPES.bytestring]: [ // duplicate of string
      ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
        ...(intIn ? [] : [ Opcodes.i32_to_u ]),

        // get length
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ],
      default: def
    }, intOut ? Valtype.i32 : valtypeBinary)
  ];
};

const falsy = (scope, wasm, type, intIn = false, intOut = false) => {
  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);

  return [
    ...wasm,
    ...(!useTmp ? [] : [ [ Opcodes.local_set, tmp ] ]),

    ...typeSwitch(scope, type, {
      [TYPES.string]: [
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
        ...(intIn ? [] : [ Opcodes.i32_to_u ]),

        // get length
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

        // if length == 0
        [ Opcodes.i32_eqz ],
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ],
      [TYPES.bytestring]: [ // duplicate of string
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),
        ...(intIn ? [] : [ Opcodes.i32_to_u ]),

        // get length
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],

        // if length == 0
        [ Opcodes.i32_eqz ],
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ],
      default: [
        // if value == 0
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),

        ...(intIn ? [ [ Opcodes.i32_eqz ] ] : [ ...Opcodes.eqz ]),
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ]
    }, intOut ? Valtype.i32 : valtypeBinary)
  ];
};

const nullish = (scope, wasm, type, intIn = false, intOut = false) => {
  const useTmp = knownType(scope, type) == null;
  const tmp = useTmp && localTmp(scope, `#logicinner_tmp${intIn ? '_int' : ''}`, intIn ? Valtype.i32 : valtypeBinary);

  return [
    ...wasm,
    ...(!useTmp ? [] : [ [ Opcodes.local_set, tmp ] ]),

    ...typeSwitch(scope, type, {
      [TYPES.undefined]: [
        // undefined
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        ...number(1, intOut ? Valtype.i32 : valtypeBinary)
      ],
      [TYPES.object]: [
        // object, null if == 0
        ...(!useTmp ? [] : [ [ Opcodes.local_get, tmp ] ]),

        ...(intIn ? [ [ Opcodes.i32_eqz ] ] : [ ...Opcodes.eqz ]),
        ...(intOut ? [] : [ Opcodes.i32_from_u ])
      ],
      default: [
        // not
        ...(!useTmp ? [ [ Opcodes.drop ] ] : []),
        ...number(0, intOut ? Valtype.i32 : valtypeBinary)
      ]
    }, intOut ? Valtype.i32 : valtypeBinary)
  ];
};

const stringOnly = wasm => {
  if (!Array.isArray(wasm[0])) return [ ...wasm, 'string_only' ];
  if (wasm.length === 1) return [ [ ...wasm[0], 'string_only' ] ];

  return [
    [ ...wasm[0], 'string_only|start' ],
    ...wasm.slice(1, -1),
    [ ...wasm[wasm.length - 1], 'string_only|end' ]
  ];
}

const performOp = (scope, op, left, right, leftType, rightType, _global = false, _name = '$undeclared', assign = false) => {
  if (op === '||' || op === '&&' || op === '??') {
    return performLogicOp(scope, op, left, right, leftType, rightType);
  }

  const knownLeft = knownType(scope, leftType);
  const knownRight = knownType(scope, rightType);

  const eqOp = ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(op);
  const strictOp = op === '===' || op === '!==';

  const startOut = [], endOut = [];
  const finalize = out => startOut.concat(out, endOut);

  // if strict (in)equal check types match
  if (strictOp) {
    endOut.push(
      ...leftType,
      ...number(TYPE_FLAGS.parity, Valtype.i32),
      [ Opcodes.i32_or ],
      ...rightType,
      ...number(TYPE_FLAGS.parity, Valtype.i32),
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

  // todo: if equality op and an operand is undefined, return false
  // todo: niche null hell with 0

  if (knownLeft === TYPES.string || knownRight === TYPES.string) {
    if (op === '+') {
      // string concat (a + b)
      return [
        ...left,
        ...right,
        ...concatStrings(scope, [], [], leftType, rightType, false, knownLeft === TYPES.string && knownRight === TYPES.string)
      ];
    }

    // not an equality op, NaN
    if (!eqOp) return number(NaN);

    // else leave bool ops
    // todo: convert string to number if string and number/bool
    // todo: string (>|>=|<|<=) string

    // string comparison
    if (op === '===' || op === '==' || op === '!==' || op === '!=') {
      return [
        ...left,
        ...right,
        ...compareStrings(scope, [], [], leftType, rightType, false, knownLeft === TYPES.string && knownRight === TYPES.string),
        ...(op === '!==' || op === '!=' ? [ [ Opcodes.i32_eqz ] ] : [])
      ];
    }
  }

  if (knownLeft === TYPES.bytestring || knownRight === TYPES.bytestring) {
    if (op === '+') {
      // string concat (a + b)
      return [
        ...left,
        ...right,
        ...concatStrings(scope, [], [], leftType, rightType, knownLeft === TYPES.bytestring && knownRight === TYPES.bytestring)
      ];
    }

    // not an equality op, NaN
    if (!eqOp) return number(NaN);

    // else leave bool ops
    // todo: convert string to number if string and number/bool
    // todo: string (>|>=|<|<=) string

    // string comparison
    if (op === '===' || op === '==' || op === '!==' || op === '!=') {
      return [
        ...left,
        ...right,
        ...compareStrings(scope, [], [], leftType, rightType, knownLeft === TYPES.bytestring && knownRight === TYPES.bytestring),
        ...(op === '!==' || op === '!=' ? [ [ Opcodes.i32_eqz ] ] : [])
      ];
    }
  }

  let ops = operatorOpcode[valtype][op];

  // some complex ops are implemented as builtin funcs
  const builtinName = `${valtype}_${op}`;
  if (!ops && builtinFuncs[builtinName]) {
    includeBuiltin(scope, builtinName);
    const idx = funcIndex[builtinName];

    return finalize([
      ...left,
      ...right,
      [ Opcodes.call, ...unsignedLEB128(idx) ]
    ]);
  }

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

    ops.unshift(...stringOnly([
      // if left is bytestring
      ...leftType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      // if right is bytestring
      ...rightType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      // if both are true
      [ Opcodes.i32_and ],
      [ Opcodes.if, Blocktype.void ],
      ...concatStrings(scope, [ [ Opcodes.local_get, tmpLeft ] ], [ [ Opcodes.local_get, tmpRight ] ], leftType, rightType, true),
      ...(op === '!==' || op === '!=' ? [ [ Opcodes.i32_eqz ] ] : []),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      // if left is string or bytestring
      ...leftType,
      ...number(TYPE_FLAGS.parity, Valtype.i32),
      [ Opcodes.i32_or ],
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      // if right is string or bytestring
      ...rightType,
      ...number(TYPE_FLAGS.parity, Valtype.i32),
      [ Opcodes.i32_or ],
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      // if either
      [ Opcodes.i32_or ],
      [ Opcodes.if, Blocktype.void ],
      ...concatStrings(scope, [ [ Opcodes.local_get, tmpLeft ] ], [ [ Opcodes.local_get, tmpRight ] ], leftType, rightType),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      ...setLastType(scope, TYPES.number)
    ]));

    // add a surrounding block
    startOut.push(stringOnly([ Opcodes.block, Valtype.f64 ]));
    endOut.unshift(stringOnly([ Opcodes.end ]));
  }

  if ((op === '===' || op === '==' || op === '!==' || op === '!=') && (knownLeft == null && knownRight == null)) {
    tmpLeft = localTmp(scope, '__tmpop_left');
    tmpRight = localTmp(scope, '__tmpop_right');

    ops.unshift(...stringOnly([
      // if left is bytestring
      ...leftType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      // if right is bytestring
      ...rightType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],

      // if both are true
      [ Opcodes.i32_and ],
      [ Opcodes.if, Blocktype.void ],
      ...compareStrings(scope, [ [ Opcodes.local_get, tmpLeft ] ], [ [ Opcodes.local_get, tmpRight ] ], leftType, rightType, true),
      ...(op === '!==' || op === '!=' ? [ [ Opcodes.i32_eqz ] ] : []),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      // if left is string or bytestring
      ...leftType,
      ...number(TYPES.string, Valtype.i32),
      [ Opcodes.i32_eq ],
      ...leftType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.i32_or ],

      // if right is string or bytestring
      ...rightType,
      ...number(TYPES.string, Valtype.i32),
      [ Opcodes.i32_eq ],
      ...rightType,
      ...number(TYPES.bytestring, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.i32_or ],

      // if either
      [ Opcodes.i32_or ],
      [ Opcodes.if, Blocktype.void ],
      ...compareStrings(scope, [ [ Opcodes.local_get, tmpLeft ] ], [ [ Opcodes.local_get, tmpRight ] ], leftType, rightType),
      ...(op === '!==' || op === '!=' ? [ [ Opcodes.i32_eqz ] ] : []),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ]
    ]));

    // add a surrounding block
    startOut.push(stringOnly([ Opcodes.block, Valtype.i32 ]));
    endOut.unshift(stringOnly([ Opcodes.end ]));
  }

  return finalize([
    ...left,
    ...(tmpLeft != null ? stringOnly([ [ Opcodes.local_tee, tmpLeft ] ]) : []),
    ...right,
    ...(tmpRight != null ? stringOnly([ [ Opcodes.local_tee, tmpRight ] ]) : []),
    ...ops
  ]);
};

const knownNullish = decl => {
  if (decl.type === 'Literal' && decl.value === null) return true;
  if (decl.type === 'Identifier' && decl.name === 'undefined') return true;

  return false;
};

const generateBinaryExp = (scope, decl, _global, _name) => {
  if (decl.operator === 'instanceof') {
    // very hacky basic instanceof
    // todo: support dynamic right-hand side

    const out = generate(scope, decl.left);
    disposeLeftover(out);

    const rightName = decl.right.name;
    if (!rightName) return todo(scope, 'instanceof dynamic right-hand side is not supported yet', true);

    const checkType = TYPES[rightName.toLowerCase()];
    if (checkType == null || rightName !== TYPE_NAMES[checkType] || checkType === TYPES.undefined) return todo(scope, 'instanceof right-hand side type unsupported', true);

    if ([TYPES.number, TYPES.boolean, TYPES.string, TYPES.symbol, TYPES.object].includes(checkType)) {
      out.push(...number(0));
    } else {
      out.push(
        ...getNodeType(scope, decl.left),
        ...number(checkType, Valtype.i32),
        [ Opcodes.i32_eq ],
        Opcodes.i32_from_u
      );
    }

    return out;
  }

  if (decl.operator === 'in') {
    // hack: a in b -> Object.hasOwn(b, a)
    // todo: not spec compliant, in should check prototype chain too (once we have it)

    return generate(scope, {
      type: 'CallExpression',
      callee: {
        type: 'Identifier',
        name: '__Object_hasOwn'
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

  const out = performOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right), getNodeType(scope, decl.left), getNodeType(scope, decl.right), _global, _name);
  if (valtype !== 'i32' && ['==', '===', '!=', '!==', '>', '>=', '<', '<='].includes(decl.operator)) out.push(Opcodes.i32_from_u);

  return out;
};

const asmFuncToAsm = (scope, func) => {
  return func(scope, {
    TYPES, TYPE_NAMES, typeSwitch, makeArray, makeString, allocPage, internalThrow,
    builtin: n => {
      let idx = funcIndex[n] ?? importedFuncs[n];
      if (idx == null && builtinFuncs[n]) {
        includeBuiltin(null, n);
        idx = funcIndex[n];
      }

      if (idx == null) throw new Error(`builtin('${n}') failed to find a func (inside ${scope.name})`);
      return unsignedLEB128(idx);
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
          ...number(1, Valtype.i32),
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
    }
  });
};

const asmFunc = (name, { wasm, params = [], locals: localTypes = [], globals: globalTypes = [], globalInits = [], returns = [], returnType, localNames = [], globalNames = [], data: _data = [], table = false, constr = false, hasRestArgument = false } = {}) => {
  if (wasm == null) { // called with no builtin
    log.warning('codegen', `${name} has no built-in!`);
    wasm = [];
  }

  const existing = funcs.find(x => x.name === name);
  if (existing) return existing;

  const nameParam = i => localNames[i] ?? (i >= params.length ? ['a', 'b', 'c'][i - params.length] : ['x', 'y', 'z'][i]);

  const allLocals = params.concat(localTypes);
  const locals = {};
  for (let i = 0; i < allLocals.length; i++) {
    locals[nameParam(i)] = { idx: i, type: allLocals[i] };
  }

  for (const x of _data) {
    let offset = x[0];
    if (offset != null) offset += pages.size * pageSize;

    const bytes = x[1];
    data.push({ offset, bytes });
  }

  const func = {
    name,
    params,
    locals,
    localInd: allLocals.length,
    returns,
    returnType,
    internal: true,
    index: currentFuncIndex++,
    table,
    constr,
    globalInits
  };

  funcs.push(func);
  funcIndex[name] = func.index;

  if (typeof wasm === 'function') {
    if (globalThis.precompile) wasm = [];
      else wasm = asmFuncToAsm(func, wasm);
  }

  let baseGlobalIdx, i = 0;
  for (const type of globalTypes) {
    if (baseGlobalIdx === undefined) baseGlobalIdx = globals['#ind'];

    globals[globalNames[i] ?? `${name}_global_${i}`] = { idx: globals['#ind']++, type, init: globalInits[i] ?? 0 };
    i++;
  }

  if (globalTypes.length !== 0) {
    // offset global ops for base global idx
    for (const inst of wasm) {
      if (inst[0] === Opcodes.global_get || inst[0] === Opcodes.global_set) {
        inst[1] += baseGlobalIdx;
      }
    }
  }

  if (table) {
    for (const inst of wasm) {
      if (inst.at(-1) === 'read func lut') {
        inst.splice(2, 99);
        inst.push(...unsignedLEB128(allocPage({}, 'func lut') * pageSize));
      }
    }

    funcs.table = true;
  }

  if (constr) {
    func.params = [...func.params];
    func.params.unshift(Valtype.i32);

    // move all locals +1 idx (sigh)
    func.localInd++;
    const locals = func.locals;
    for (const x in locals) {
      locals[x].idx++;
    }

    locals['#newtarget'] = { idx: 0, type: Valtype.i32 };

    for (const inst of wasm) {
      if (inst[0] === Opcodes.local_get || inst[0] === Opcodes.local_set || inst[0] === Opcodes.local_tee) {
        inst[1]++;
      }
    }
  }

  if (hasRestArgument) func.hasRestArgument = true;

  func.wasm = wasm;

  return func;
};

const includeBuiltin = (scope, builtin) => asmFunc(builtin, builtinFuncs[builtin]);

const generateLogicExp = (scope, decl) => {
  return performLogicOp(scope, decl.operator, generate(scope, decl.left), generate(scope, decl.right), getNodeType(scope, decl.left), getNodeType(scope, decl.right));
};

// potential future ideas for nan boxing (unused):
// T = JS type, V = value/pointer
// 0bTTT
// qNAN: 0 11111111111 1000000000000000000000000000000000000000000000000001
// 50 bits usable: 0 11111111111 11??????????????????????????????????????????????????
// js type: 4 bits
// internal type: ? bits
// pointer: 32 bits
// https://piotrduperas.com/posts/nan-boxing
// 0x7ffc000000000000
// budget: 50 bits
// js type: 4 bits
// internal type: ? bits
// pointer: 32 bits
// generic
// 1              23   4             5
// 0 11111111111 11TTTTIIII??????????PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
// 1: regular iEEE 754 double NaN
// 2: extra 1 bit to identify NaN box
// 3: js type
// 4: internal type
// 5: pointer

const isExistingProtoFunc = name => {
  if (name.startsWith('__Array_prototype')) return !!prototypeFuncs[TYPES.array][name.slice(18)];
  if (name.startsWith('__String_prototype_')) return !!prototypeFuncs[TYPES.string][name.slice(19)];

  return false;
};

const getType = (scope, _name) => {
  const name = mapName(_name);

  if (Object.hasOwn(builtinVars, name)) return number(builtinVars[name].type ?? TYPES.number, Valtype.i32);

  if (typedInput && scope.locals[name]?.metadata?.type != null) return number(scope.locals[name].metadata.type, Valtype.i32);
  if (Object.hasOwn(scope.locals, name)) return [ [ Opcodes.local_get, scope.locals[name + '#type'].idx ] ];

  if (typedInput && globals[name]?.metadata?.type != null) return number(globals[name].metadata.type, Valtype.i32);
  if (Object.hasOwn(globals, name)) return [ [ Opcodes.global_get, globals[name + '#type'].idx ] ];

  if (Object.hasOwn(builtinFuncs, name) || Object.hasOwn(importedFuncs, name) ||
      Object.hasOwn(funcIndex, name) || Object.hasOwn(internalConstrs, name))
        return number(TYPES.function, Valtype.i32);

  if (isExistingProtoFunc(name)) return number(TYPES.function, Valtype.i32);

  return number(TYPES.undefined, Valtype.i32);
};

const setType = (scope, _name, type) => {
  const name = mapName(_name);

  const out = typeof type === 'number' ? number(type, Valtype.i32) : type;

  if (typedInput && scope.locals[name]?.metadata?.type != null) return [];
  if (Object.hasOwn(scope.locals, name)) return [
    ...out,
    [ Opcodes.local_set, scope.locals[name + '#type'].idx ]
  ];

  if (typedInput && globals[name]?.metadata?.type != null) return [];
  if (Object.hasOwn(globals, name)) return [
    ...out,
    [ Opcodes.global_set, globals[name + '#type'].idx ]
  ];

  // throw new Error('could not find var');
  return [];
};

const getLastType = scope => {
  scope.gotLastType = true;
  return [ [ Opcodes.local_get, localTmp(scope, '#last_type', Valtype.i32) ] ];
};

const setLastType = (scope, type = []) => [
  ...(typeof type === 'number' ? number(type, Valtype.i32) : type),
  [ Opcodes.local_set, localTmp(scope, '#last_type', Valtype.i32) ]
];

const getNodeType = (scope, node) => {
  const ret = (() => {
    if (node.type === 'Literal') {
      if (node.regex) return TYPES.regexp;

      if (typeof node.value === 'string' && byteStringable(node.value)) return TYPES.bytestring;

      return TYPES[typeof node.value];
    }

    if (isFuncType(node.type)) {
      return TYPES.function;
    }

    if (node.type === 'Identifier') {
      return getType(scope, node.name);
    }

    if (node.type === 'ObjectExpression') {
      return TYPES.object;
    }

    if (node.type === 'CallExpression' || node.type === 'NewExpression') {
      const name = node.callee.name;
      if (name == null) {
        // iife
        if (scope.locals['#last_type']) return getLastType(scope);

        // presume
        // todo: warn here?
        return TYPES.number;
      }

      const func = funcs.find(x => x.name === name);
      if (func) {
        if (func.returnType != null) return func.returnType;
      }

      if (Object.hasOwn(builtinFuncs, name) && !builtinFuncs[name].typedReturns) return builtinFuncs[name].returnType ?? TYPES.number;
      if (Object.hasOwn(internalConstrs, name)) return internalConstrs[name].type;

      // check if this is a prototype function
      // if so and there is only one impl (eg charCodeAt)
      // or all impls have the same return type
      // use that return type as that is the only possibility
      // (if non-matching type it would error out)
      if (name.startsWith('__')) {
        const spl = name.slice(2).split('_');

        const func = spl[spl.length - 1];
        const protoFuncs = Object.keys(prototypeFuncs).filter(x => x != TYPES.bytestring && prototypeFuncs[x][func] != null);
        if (
          protoFuncs.length === 1 ||
          (protoFuncs.length > 1 && protoFuncs.every(x => x.returnType === protoFuncs[0].returnType))
        ) {
          if (protoFuncs[0].returnType != null) return protoFuncs[0].returnType;
        }
      }

      if (name.startsWith('__Porffor_wasm_')) {
        // todo: return undefined for non-returning ops
        return TYPES.number;
      }

      if (scope.locals['#last_type']) return getLastType(scope);

      // presume
      // todo: warn here?
      return TYPES.number;

      // let protoFunc;
      // // ident.func()
      // if (name && name.startsWith('__')) {
      //   const spl = name.slice(2).split('_');

      //   const baseName = spl.slice(0, -1).join('_');
      //   const baseType = getType(scope, baseName);

      //   const func = spl[spl.length - 1];
      //   protoFunc = prototypeFuncs[baseType]?.[func];
      // }

      // // literal.func()
      // if (!name && node.callee.type === 'MemberExpression') {
      //   if (node.callee.object.regex) {
      //     const funcName = node.callee.property.name;
      //     return Rhemyn[funcName] ? TYPES.boolean : TYPES.undefined;
      //   }

      //   const baseType = getNodeType(scope, node.callee.object);

      //   const func = node.callee.property.name;
      //   protoFunc = prototypeFuncs[baseType]?.[func];
      // }

      // if (protoFunc) return protoFunc.returnType;
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
      if (node.operator !== '+') return TYPES.number;

      const leftType = getNodeType(scope, node.left);
      const rightType = getNodeType(scope, node.right);
      const knownLeft = knownType(scope, leftType);
      const knownRight = knownType(scope, rightType);

      if (knownLeft === TYPES.string || knownRight === TYPES.string) return TYPES.string;
      if (knownLeft === TYPES.bytestring && knownRight === TYPES.bytestring) return TYPES.bytestring;
      if (knownLeft === TYPES.bytestring || knownRight === TYPES.bytestring) return TYPES.string;

      if (knownLeft != null || knownRight != null) return TYPES.number;

      if (scope.locals['#last_type']) return getLastType(scope);

      // presume
      return TYPES.number;
    }

    if (node.type === 'UnaryExpression') {
      if (node.operator === '!') return TYPES.boolean;
      if (node.operator === 'void') return TYPES.undefined;
      if (node.operator === 'delete') return TYPES.boolean;
      if (node.operator === 'typeof') return Prefs.bytestring ? TYPES.bytestring : TYPES.string;

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
        if (name === 'length') {
          if (typeHasFlag(objectKnownType, TYPE_FLAGS.length)) return TYPES.number;
            else return TYPES.undefined;
        }

        if (node.computed) {
          if (objectKnownType === TYPES.string) return TYPES.string;
          if (objectKnownType === TYPES.bytestring) return TYPES.bytestring;
        }
      }

      if (scope.locals['#last_type']) return getLastType(scope);

      // presume
      return TYPES.number;
    }

    if (node.type === 'TaggedTemplateExpression') {
      // hack
      switch (node.tag.name) {
        case '__Porffor_wasm': return TYPES.number;
        case '__Porffor_bs': return TYPES.bytestring;
        case '__Porffor_s': return TYPES.string;
      }
    }

    if (scope.locals['#last_type']) return getLastType(scope);

    // presume
    // todo: warn here?
    return TYPES.number;
  })();

  if (typeof ret === 'number') return number(ret, Valtype.i32);
  return ret;
};

const generateLiteral = (scope, decl, global, name) => {
  if (decl.value === null) return number(NULL);

  // hack: just return 1 for regex literals
  if (decl.regex) {
    return number(1);
  }

  switch (typeof decl.value) {
    case 'number':
      return number(decl.value);

    case 'boolean':
      return number(decl.value ? 1 : 0);

    case 'string':
      return makeString(scope, decl.value, global, name);

    default:
      return todo(scope, `cannot generate literal of type ${typeof decl.value}`, true);
  }
};

const countLeftover = wasm => {
  let count = 0, depth = 0;

  for (let i = 0; i < wasm.length; i++) {
    const inst = wasm[i];
    if (inst[0] == null) continue;

    if (depth === 0 && (inst[0] === Opcodes.if || inst[0] === Opcodes.block || inst[0] === Opcodes.loop)) {
      if (inst[0] === Opcodes.if) count--;
      if (inst[1] !== Blocktype.void) count++;
    }
    if ([Opcodes.if, Opcodes.try, Opcodes.loop, Opcodes.block].includes(inst[0])) depth++;
    if (inst[0] === Opcodes.end) depth--;

    if (depth === 0)
      if ([Opcodes.throw, Opcodes.drop, Opcodes.local_set, Opcodes.global_set].includes(inst[0])) count--;
        else if ([null, Opcodes.i32_eqz, Opcodes.i64_eqz, Opcodes.f64_ceil, Opcodes.f64_floor, Opcodes.f64_trunc, Opcodes.f64_nearest, Opcodes.f64_sqrt, Opcodes.local_tee, Opcodes.i32_wrap_i64, Opcodes.i64_extend_i32_s, Opcodes.i64_extend_i32_u, Opcodes.f32_demote_f64, Opcodes.f64_promote_f32, Opcodes.f64_convert_i32_s, Opcodes.f64_convert_i32_u, Opcodes.i32_clz, Opcodes.i32_ctz, Opcodes.i32_popcnt, Opcodes.f64_neg, Opcodes.end, Opcodes.i32_trunc_sat_f64_s[0], Opcodes.i32x4_extract_lane, Opcodes.i16x8_extract_lane, Opcodes.i32_load, Opcodes.i64_load, Opcodes.f64_load, Opcodes.f32_load, Opcodes.v128_load, Opcodes.i32_load16_u, Opcodes.i32_load16_s, Opcodes.i32_load8_u, Opcodes.i32_load8_s, Opcodes.memory_grow].includes(inst[0]) && (inst[0] !== 0xfc || inst[1] < 0x04)) {}
        else if ([Opcodes.local_get, Opcodes.global_get, Opcodes.f64_const, Opcodes.i32_const, Opcodes.i64_const, Opcodes.v128_const, Opcodes.memory_size].includes(inst[0])) count++;
        else if ([Opcodes.i32_store, Opcodes.i64_store, Opcodes.f64_store, Opcodes.f32_store, Opcodes.i32_store16, Opcodes.i32_store8].includes(inst[0])) count -= 2;
        else if (inst[0] === Opcodes.memory_copy[0] && (inst[1] === Opcodes.memory_copy[1] || inst[1] === Opcodes.memory_init[1])) count -= 3;
        else if (inst[0] === Opcodes.return) count = 0;
        else if (inst[0] === Opcodes.call) {
          let func = funcs.find(x => x.index === inst[1]);
          if (inst[1] < importedFuncs.length) {
            func = importedFuncs[inst[1]];
            count = count - func.params + func.returns;
          } else {
            count = count - func.params.length + func.returns.length;
          }
        } else if (inst[0] === Opcodes.call_indirect) {
          count--; // funcidx
          count -= inst[1] * 2; // params * 2 (typed)
          count += 2; // fixed return (value, type)
        } else count--;

    // console.log(count, decompile([ inst ]).slice(0, -1));
  }

  return count;
};

const disposeLeftover = wasm => {
  const leftover = countLeftover(wasm);
  for (let i = 0; i < leftover; i++) wasm.push([ Opcodes.drop ]);
};

const generateExp = (scope, decl) => {
  const expression = decl.expression;

  const out = generate(scope, expression, undefined, undefined, Prefs.optUnused);
  disposeLeftover(out);

  return out;
};

const generateSequence = (scope, decl) => {
  let out = [];

  const exprs = decl.expressions;
  for (let i = 0; i < exprs.length; i++) {
    if (i > 0) disposeLeftover(out);
    out.push(...generate(scope, exprs[i]));
  }

  return out;
};

const generateChain = (scope, decl) => {
  return generate(scope, decl.expression);
};

const CTArrayUtil = {
  getLengthI32: pointer => [
    ...number(0, Valtype.i32),
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ]
  ],

  getLength: pointer => [
    ...number(0, Valtype.i32),
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ],
    Opcodes.i32_from_u
  ],

  setLengthI32: (pointer, value) => [
    ...number(0, Valtype.i32),
    ...value,
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ]
  ],

  setLength: (pointer, value) => [
    ...number(0, Valtype.i32),
    ...value,
    Opcodes.i32_to_u,
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, ...unsignedLEB128(pointer) ]
  ]
};

const RTArrayUtil = {
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

const generateCall = (scope, decl, _global, _name, unusedValue = false) => {
  let name = mapName(decl.callee.name);
  if (isFuncType(decl.callee.type)) { // iife
    const func = generateFunc(scope, decl.callee);
    name = func.name;
  }

  if (!decl._new && name === 'eval' && decl.arguments[0]?.type === 'Literal') {
    // literal eval hack
    const code = decl.arguments[0]?.value ?? '';

    let parsed;
    try {
      parsed = parse(code, []);
    } catch (e) {
      if (e.name === 'SyntaxError') {
        // throw syntax errors of evals at runtime instead
        return internalThrow(scope, 'SyntaxError', e.message, true);
      }

      throw e;
    }

    const out = generate(scope, {
      type: 'BlockStatement',
      body: parsed.body
    });

    const lastInst = out[out.length - 1];
    if (lastInst && lastInst[0] === Opcodes.drop) {
      out.splice(out.length - 1, 1);

      const finalStatement = parsed.body[parsed.body.length - 1];
      out.push(...setLastType(scope, getNodeType(scope, finalStatement)));
    } else if (countLeftover(out) === 0) {
      out.push(...number(UNDEFINED));
      out.push(...setLastType(scope, TYPES.undefined));
    }

    // if (lastInst && lastInst[0] === Opcodes.drop) {
    //   out.splice(out.length - 1, 1);
    // } else if (countLeftover(out) === 0) {
    //   out.push(...number(UNDEFINED));
    // }

    return out;
  }

  let protoName, target;
  // ident.func()
  if (!decl._new && name && name.startsWith('__')) {
    const spl = name.slice(2).split('_');

    protoName = spl[spl.length - 1];

    target = { ...decl.callee };
    target.name = spl.slice(0, -1).join('_');

    // failed to lookup name, abort
    if (!lookupName(scope, target.name)[0]) protoName = null;
  }

  // literal.func()
  if (!decl._new && !name && decl.callee.type === 'MemberExpression') {
    // megahack for /regex/.func()
    const funcName = decl.callee.property.name;
    if (decl.callee.object.regex && ['test'].includes(funcName)) {
      const regex = decl.callee.object.regex.pattern;
      const rhemynName = `regex_${funcName}_${sanitize(regex)}`;

      if (!funcIndex[rhemynName]) {
        const func = Rhemyn[funcName](regex, currentFuncIndex++, rhemynName);
        func.internal = true;

        funcIndex[func.name] = func.index;
        funcs.push(func);
      }

      const idx = funcIndex[rhemynName];
      return [
        // make string arg
        ...generate(scope, decl.arguments[0]),
        Opcodes.i32_to_u,
        ...getNodeType(scope, decl.arguments[0]),

        // call regex func
        [ Opcodes.call, ...unsignedLEB128(idx) ],
        Opcodes.i32_from_u,

        ...setLastType(scope, Rhemyn.types[funcName])
      ];
    }

    protoName = decl.callee.property.name;

    target = decl.callee.object;
  }

  let out = [];
  if (protoName) {
    if (['search'].includes(protoName)) {
      const regex = decl.arguments[0]?.regex?.pattern;
      if (!regex) return [
        // no/bad regex arg, return -1/0 for now
        ...generate(scope, target),
        [ Opcodes.drop ],

        ...number(Rhemyn.types[protoName] === TYPES.number ? -1 : 0),
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
        [ Opcodes.call, ...unsignedLEB128(idx) ],
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

      for (const x of builtinProtoCands) {
        const type = TYPES[x.split('_prototype_')[0].slice(2).toLowerCase()];
        if (type == null) continue;

        protoBC[type] = generateCall(scope, {
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

      let allOptUnused = true;
      let lengthI32CacheUsed = false;
      for (const x in protoCands) {
        const protoFunc = protoCands[x];
        if (protoFunc.noArgRetLength && decl.arguments.length === 0) {
          protoBC[x] = [
            ...RTArrayUtil.getLength(getPointer),
            ...setLastType(scope, TYPES.number)
          ];
          continue;
        }

        const protoLocal = protoFunc.local ? localTmp(scope, `__${protoName}_tmp`, protoFunc.local) : -1;
        const protoLocal2 = protoFunc.local2 ? localTmp(scope, `__${protoName}_tmp2`, protoFunc.local2) : -1;

        let optUnused = false;
        const protoOut = protoFunc(getPointer, {
          getCachedI32: () => {
            lengthI32CacheUsed = true;
            return [ [ Opcodes.local_get, lengthLocal ] ];
          },
          setCachedI32: () => [ [ Opcodes.local_set, lengthLocal ] ],
          get: () => RTArrayUtil.getLength(getPointer),
          getI32: () => RTArrayUtil.getLengthI32(getPointer),
          set: value => RTArrayUtil.setLength(getPointer, value),
          setI32: value => RTArrayUtil.setLengthI32(getPointer, value)
        }, generate(scope, decl.arguments[0] ?? DEFAULT_VALUE), getNodeType(scope, decl.arguments[0] ?? DEFAULT_VALUE), protoLocal, protoLocal2, (length, itemType) => {
          return makeArray(scope, {
            rawElements: new Array(length)
          }, _global, _name, true, itemType, true);
        }, () => {
          optUnused = true;
          return unusedValue;
        });

        if (!optUnused) allOptUnused = false;

        protoBC[x] = [
          [ Opcodes.block, unusedValue && optUnused ? Blocktype.void : valtypeBinary ],
          ...protoOut,
          ...(unusedValue && optUnused ? [] : (protoFunc.returnType != null ? setLastType(scope, protoFunc.returnType) : setLastType(scope))),
          [ Opcodes.end ]
        ];
      }

      // todo: if some cands use optUnused and some don't, we will probably crash

      return [
        ...(usePointerCache ? [
          ...rawPointer,
          [ Opcodes.local_set, pointerLocal ],
        ] : []),

        ...(!lengthI32CacheUsed ? [] : [
          ...RTArrayUtil.getLengthI32(getPointer),
          [ Opcodes.local_set, lengthLocal ],
        ]),

        ...typeSwitch(scope, getNodeType(scope, target), {
          ...protoBC,

          // TODO: error better
          default: internalThrow(scope, 'TypeError', `'${protoName}' proto func tried to be called on a type without an impl`)
        }, allOptUnused && unusedValue ? Blocktype.void : valtypeBinary),
      ];
    }

    if (Object.keys(protoBC).length > 0) {
      return [
        ...out,

        ...typeSwitch(scope, builtinProtoCands.length > 0 ? [ [ Opcodes.local_get, localTmp(scope, '#proto_target#type', Valtype.i32) ] ] : getNodeType(scope, target), {
          ...protoBC,

          // TODO: error better
          default: internalThrow(scope, 'TypeError', `'${protoName}' proto func tried to be called on a type without an impl`)
        }, valtypeBinary)
      ];
    }
  }

  // TODO: only allows callee as identifier
  // if (!name) return todo(scope, `only identifier callees (got ${decl.callee.type})`);

  let idx;
  if (Object.hasOwn(funcIndex, name)) idx = funcIndex[name];
    else if (Object.hasOwn(importedFuncs, name)) idx = importedFuncs[name];
    else if (Object.hasOwn(builtinFuncs, name)) {
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
        i32_store: { imms: 2, args: [ true, true ], returns: 0 },
        // pointer, align, offset
        i32_load8_u: { imms: 2, args: [ true ], returns: 1 },
        // pointer, value, align, offset
        i32_store8: { imms: 2, args: [ true, true ], returns: 0 },
        // pointer, align, offset
        i32_load16_u: { imms: 2, args: [ true ], returns: 1 },
        // pointer, value, align, offset
        i32_store16: { imms: 2, args: [ true, true ], returns: 0 },

        // pointer, align, offset
        f64_load: { imms: 2, args: [ true ], returns: 0 }, // 0 due to not i32
        // pointer, value, align, offset
        f64_store: { imms: 2, args: [ true, false ], returns: 0 },

        // value
        i32_const: { imms: 1, args: [], returns: 0 },
      };

      const opName = name.slice('__Porffor_wasm_'.length);

      if (wasmOps[opName]) {
        const op = wasmOps[opName];

        const argOut = [];
        for (let i = 0; i < op.args.length; i++) argOut.push(
          ...generate(scope, decl.arguments[i]),
          ...(op.args[i] ? [ Opcodes.i32_to ] : [])
        );

        // literals only
        const imms = decl.arguments.slice(op.args.length).map(x => x.value);

        return [
          ...argOut,
          [ Opcodes[opName], ...imms ],
          ...(new Array(op.returns).fill(Opcodes.i32_from))
        ];
      }
    } else {
      if (!Prefs.indirectCalls) return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`, true);

      // todo: only works when function uses typedParams and typedReturns

      const indirectMode = Prefs.indirectCallMode ?? 'vararg';
      // options: vararg, strict
      // - strict: simpler, smaller size usage, no func lut needed.
      //   ONLY works when arg count of call == arg count of function being called
      // - vararg: large size usage, cursed.
      //   works when arg count of call != arg count of function being called*
      //   * most of the time, some edgecases

      funcs.table = true;
      scope.table = true;

      let args = decl.arguments;
      let locals = [];

      if (indirectMode === 'vararg') {
        const minArgc = Prefs.indirectCallMinArgc ?? 3;

        if (args.length < minArgc) {
          args = args.concat(new Array(minArgc - args.length).fill(DEFAULT_VALUE));
        }
      }

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        out = out.concat(generate(scope, arg));

        if (valtypeBinary !== Valtype.i32 && (
          (builtinFuncs[name] && builtinFuncs[name].params[i * (typedParams ? 2 : 1)] === Valtype.i32) ||
          (importedFuncs[name] && name.startsWith('profile'))
        )) {
          out.push(Opcodes.i32_to);
        }

        out = out.concat(getNodeType(scope, arg));

        if (indirectMode === 'vararg') {
          const typeLocal = localTmp(scope, `#indirect_arg${i}_type`, Valtype.i32);
          const valLocal = localTmp(scope, `#indirect_arg${i}_val`);

          locals.push([valLocal, typeLocal]);

          out.push(
            [ Opcodes.local_set, typeLocal ],
            [ Opcodes.local_set, valLocal ]
          );
        }
      }

      if (indirectMode === 'strict') {
        return [
          ...generate(scope, decl.callee),
          [ Opcodes.local_set, localTmp(scope, '#indirect_callee') ],

          ...typeSwitch(scope, getNodeType(scope, decl.callee), {
            [TYPES.function]: [
              ...out,

              [ Opcodes.local_get, localTmp(scope, '#indirect_callee') ],
              ...generate(scope, decl.callee),
              Opcodes.i32_to_u,
              [ Opcodes.call_indirect, args.length, 0 ],
              ...setLastType(scope)
            ],
            default: internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`, true)
          })
        ];
      }

      // hi, I will now explain how vararg mode works:
      // wasm's indirect_call instruction requires you know the func type at compile-time
      // since we have varargs (variable argument count), we do not know it.
      // we could just store args in memory and not use wasm func args,
      // but that is slow (probably) and breaks js exports.
      // instead, we generate every* possibility of argc and use different indirect_call
      // ops for each one, with type depending on argc for that branch.
      // then we load the argc for the wanted function from a memory lut,
      // and call the branch with the matching argc we require.
      // sorry, yes it is very cursed (and size inefficient), but indirect calls
      // are kind of rare anyway (mostly callbacks) so I am not concerned atm.
      // *for argc 0-3, in future (todo:) the max number should be
      // dynamically changed to the max argc of any func in the js file.

      const funcLocal = localTmp(scope, '#indirect_func', Valtype.i32);
      const flags = localTmp(scope, '#indirect_flags', Valtype.i32);

      const gen = argc => {
        const argsOut = [];
        for (let i = 0; i < argc; i++) {
          argsOut.push(
            [ Opcodes.local_get, locals[i][0] ],
            [ Opcodes.local_get, locals[i][1] ]
          );
        }

        const checkFlag = (flag, pass, fail) => [
          [ Opcodes.local_get, flags ],
          ...number(flag, Valtype.i32),
          [ Opcodes.i32_and ],
          [ Opcodes.if, valtypeBinary ],
          ...pass,
          [ Opcodes.else ],
          ...fail,
          [ Opcodes.end ]
        ];

        // pain.
        // return checkFlag(0b10, [ // constr
        //   [ Opcodes.i32_const, decl._new ? 1 : 0 ],
        //   ...argsOut,
        //   [ Opcodes.local_get, funcLocal ],
        //   [ Opcodes.call_indirect, argc, 0, 'constr' ],
        //   ...setLastType(scope),
        // ], [
        //   ...argsOut,
        //   [ Opcodes.local_get, funcLocal ],
        //   [ Opcodes.call_indirect, argc, 0 ],
        //   ...setLastType(scope),
        // ]);

        return checkFlag(0b1, // no type return
          checkFlag(0b10, [ // no type return & constr
            [ Opcodes.i32_const, decl._new ? 1 : 0 ],
            ...argsOut,
            [ Opcodes.local_get, funcLocal ],
            [ Opcodes.call_indirect, argc, 0, 'no_type_return', 'constr' ],
          ], [
            ...argsOut,
            [ Opcodes.local_get, funcLocal ],
            [ Opcodes.call_indirect, argc, 0, 'no_type_return' ]
          ]),
          checkFlag(0b10, [ // type return & constr
            [ Opcodes.i32_const, decl._new ? 1 : 0 ],
            ...argsOut,
            [ Opcodes.local_get, funcLocal ],
            [ Opcodes.call_indirect, argc, 0, 'constr' ],
            ...setLastType(scope),
          ], [
            ...argsOut,
            [ Opcodes.local_get, funcLocal ],
            [ Opcodes.call_indirect, argc, 0 ],
            ...setLastType(scope),
          ]),
        );
      };

      const tableBc = {};
      for (let i = 0; i <= args.length; i++) {
        tableBc[i] = gen(i);
      }

      // todo/perf: check if we should use br_table here or just generate our own big if..elses

      return [
        ...generate(scope, decl.callee),
        [ Opcodes.local_set, localTmp(scope, '#indirect_callee') ],

        ...typeSwitch(scope, getNodeType(scope, decl.callee), {
          [TYPES.function]: [
            ...out,

            [ Opcodes.local_get, localTmp(scope, '#indirect_callee') ],
            Opcodes.i32_to_u,
            [ Opcodes.local_set, funcLocal ],

            // get if func we are calling is a constructor or not
            [ Opcodes.local_get, funcLocal ],
            ...number(3, Valtype.i32),
            [ Opcodes.i32_mul ],
            ...number(2, Valtype.i32),
            [ Opcodes.i32_add ],
            [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(allocPage(scope, 'func lut') * pageSize), 'read func lut' ],
            [ Opcodes.local_set, flags ],

            // check if non-constructor was called with new, if so throw
            [ Opcodes.local_get, flags ],
            ...number(0b10, Valtype.i32),
            [ Opcodes.i32_and ],
            [ Opcodes.i32_eqz ],
            [ Opcodes.i32_const, decl._new ? 1 : 0 ],
            [ Opcodes.i32_and ],
            [ Opcodes.if, Blocktype.void ],
              ...internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`),
            [ Opcodes.end ],

            ...brTable([
              // get argc of func we are calling
              [ Opcodes.local_get, funcLocal ],
              ...number(3, Valtype.i32),
              [ Opcodes.i32_mul ],
              [ Opcodes.i32_load16_u, 0, ...unsignedLEB128(allocPage(scope, 'func lut') * pageSize), 'read func lut' ]
            ], tableBc, valtypeBinary)
          ],
          default: internalThrow(scope, 'TypeError', `${unhackName(name)} is not a function`, true)
        })
      ];
    }

  const func = funcs[idx - importedFuncs.length]; // idx === scope.index ? scope : funcs.find(x => x.index === idx);
  const userFunc = func && !func.internal;
  const typedParams = userFunc || builtinFuncs[name]?.typedParams;
  const typedReturns = (userFunc && func.returnType == null) || builtinFuncs[name]?.typedReturns;
  let paramCount = func && (typedParams ? Math.floor(func.params.length / 2) : func.params.length);

  let paramOffset = 0;
  if (func && func.constr) {
    // new.target arg
    if (func.internal) paramOffset = 1;
    if (!typedParams) paramCount--;
    out.push([ Opcodes.i32_const, decl._new ? 1 : 0 ]);
  } else if (decl._new)
    return internalThrow(scope, 'TypeError', `${unhackName(name)} is not a constructor`, true);

  let args = [...decl.arguments];
  if (func && !func.hasRestArgument && args.length < paramCount) {
    // too little args, push undefineds
    args = args.concat(new Array(paramCount - args.length).fill(DEFAULT_VALUE));
  }

  if (func && func.hasRestArgument) {
    if (args.length < paramCount) {
      args = args.concat(new Array(paramCount - 1 - args.length).fill(DEFAULT_VALUE));
    }

    const restArgs = args.slice(paramCount - 1);
    args = args.slice(0, paramCount - 1);
    args.push({
      type: 'ArrayExpression',
      elements: restArgs
    });
  }

  if (func && args.length > paramCount) {
    // too many args, slice extras off
    args = args.slice(0, paramCount);
  }

  if (func && func.throws) scope.throws = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    out = out.concat(generate(scope, arg));

    // todo: this should be used instead of the too many args thing above (by removing that)
    if (i >= paramCount) {
      // over param count of func, drop arg
      out.push([ Opcodes.drop ]);
      continue;
    }

    if (valtypeBinary !== Valtype.i32 &&
      (func && func.params[paramOffset + i * (typedParams ? 2 : 1)] === Valtype.i32)
    ) {
      out.push(Opcodes.i32_to);
    }

    if (valtypeBinary === Valtype.i32 &&
      (func && func.params[paramOffset + i * (typedParams ? 2 : 1)] === Valtype.f64)
    ) {
      out.push([ Opcodes.f64_convert_i32_s ]);
    }

    if (typedParams) out = out.concat(getNodeType(scope, arg));
  }

  out.push([ Opcodes.call, ...unsignedLEB128(idx) ]);

  if (!typedReturns) {
    // let type;
    // if (builtinFuncs[name]) type = TYPES[builtinFuncs[name].returnType ?? 'number'];
    // if (internalConstrs[name]) type = internalConstrs[name].type;
    // if (importedFuncs[name] && importedFuncs[]) type =

    // if (type) out.push(
    //   ...number(type, Valtype.i32),
    //   [ Opcodes.local_set, localTmp(scope, '#last_type', Valtype.i32) ]
    // );
  } else out.push(...setLastType(scope));

  if (builtinFuncs[name] && builtinFuncs[name].returns?.[0] === Valtype.i32 && valtypeBinary !== Valtype.i32) {
    out.push(Opcodes.i32_from);
  }

  if (builtinFuncs[name] && builtinFuncs[name].returns?.[0] === Valtype.f64 && valtypeBinary === Valtype.i32) {
    out.push(Opcodes.i32_trunc_sat_f64_s);
  }

  return out;
};

const generateNew = (scope, decl, _global, _name) => generateCall(scope, {
  ...decl,
  _new: true
}, _global, _name);

// bad hack for undefined and null working without additional logic
const DEFAULT_VALUE = {
  type: 'Identifier',
  name: 'undefined'
};

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
  if (type.length === 1 && type[0][0] === Opcodes.i32_const) {
    return read_signedLEB128(type[0].slice(1));
  }

  if (typedInput && type.length === 1 && type[0][0] === Opcodes.local_get) {
    const idx = type[0][1];

    // type idx = var idx + 1
    const name = Object.values(scope.locals).find(x => x.idx === idx)?.name;
    if (name) {
      const local = scope.locals[name];
      if (local.metadata?.type != null) return v.metadata.type;
    }
  }

  return null;
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
      ...number(other, Valtype.i32),
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
      table.push(br);
      br++;
      continue;
    }

    // else default
    table.push(0);
  }

  out.push(
    [ Opcodes.block, Blocktype.void ],
    ...input,
    ...(offset > 0 ? [
      ...number(offset, Valtype.i32),
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

const typeSwitch = (scope, type, bc, returns = valtypeBinary) => {
  if (!Prefs.bytestring) delete bc[TYPES.bytestring];

  const known = knownType(scope, type);
  if (known != null) {
    return bc[known] ?? bc.default;
  }

  if (Prefs.typeswitchBrtable)
    return brTable(type, bc, returns);

  const tmp = localTmp(scope, '#typeswitch_tmp' + (Prefs.typeswitchUniqueTmp ? randId() : ''), Valtype.i32);
  const out = [
    ...type,
    [ Opcodes.local_set, tmp ],
    [ Opcodes.block, returns ]
  ];

  for (const x in bc) {
    if (x === 'default') continue;

    // if type == x
    out.push([ Opcodes.local_get, tmp ]);
    out.push(...number(x, Valtype.i32));
    out.push([ Opcodes.i32_eq ]);

    out.push([ Opcodes.if, Blocktype.void, `TYPESWITCH|${TYPE_NAMES[x]}` ]);
    out.push(...bc[x]);
    out.push([ Opcodes.br, 1 ]);
    out.push([ Opcodes.end ]);
  }

  // default
  if (bc.default) out.push(...bc.default);
    else if (returns !== Blocktype.void) out.push(...number(0, returns));

  out.push([ Opcodes.end, 'TYPESWITCH_end' ]);

  return out;
};

const typeIsOneOf = (type, types, valtype = Valtype.i32) => {
  const out = [];

  for (let i = 0; i < types.length; i++) {
    out.push(...type, ...number(types[i], valtype), valtype === Valtype.f64 ? [ Opcodes.f64_eq ] : [ Opcodes.i32_eq ]);
    if (i !== 0) out.push([ Opcodes.i32_or ]);
  }

  return out;
};

const allocVar = (scope, name, global = false, type = true) => {
  const target = global ? globals : scope.locals;

  // already declared
  if (Object.hasOwn(target, name)) {
    // parser should catch this but sanity check anyway
    // if (decl.kind !== 'var') return internalThrow(scope, 'SyntaxError', `Identifier '${unhackName(name)}' has already been declared`);

    return target[name].idx;
  }

  let idx = global ? globals['#ind']++ : scope.localInd++;
  target[name] = { idx, type: valtypeBinary };

  if (type) {
    let typeIdx = global ? globals['#ind']++ : scope.localInd++;
    target[name + '#type'] = { idx: typeIdx, type: Valtype.i32, name };
  }

  return idx;
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
  } else if (a.type === 'TSArrayType') {
    type = 'array';
    elementType = extractTypeAnnotation(a.elementType).type;
  }

  const typeName = type;
  type = typeAnnoToPorfType(type);

  if (type === TYPES.bytestring && !Prefs.bytestring) type = TYPES.string;

  // if (decl.name) console.log(decl.name, { type, elementType });

  return { type, typeName, elementType };
};

const setLocalWithType = (scope, name, isGlobal, decl, tee = false, overrideType = undefined) => {
  const local = isGlobal ? globals[name] : scope.locals[name];
  const out = Array.isArray(decl) ? decl : generate(scope, decl, isGlobal, name);

  // optimize away last type usage
  // todo: detect last type then i32 conversion op
  const lastOp = out.at(-1);
  if (lastOp[0] === Opcodes.local_set && lastOp[1] === scope.locals['#last_type']?.idx) {
    out.pop();

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

const generateVar = (scope, decl) => {
  let out = [];

  const topLevel = scope.name === 'main';

  // global variable if in top scope (main) or if internally wanted
  const global = topLevel || decl._bare;

  for (const x of decl.declarations) {
    if (x.id.type === 'ArrayPattern') {
      const decls = [];
      const tmpName = '#destructure' + randId();

      let i = 0;
      const elements = [...x.id.elements];
      for (const e of elements) {
        switch (e?.type) {
          case 'RestElement': { // let [ ...foo ] = []
            if (e.argument.type === 'ArrayPattern') {
              // let [ ...[a, b, c] ] = []
              elements.push(...e.argument.elements);
            } else {
              decls.push({
                type: 'VariableDeclarator',
                id: { type: 'Identifier', name: e.argument.name },
                init: {
                  type: 'CallExpression',
                  callee: {
                    type: 'Identifier',
                    name: '__Array_prototype_slice'
                  },
                  arguments: [
                    { type: 'Identifier', name: tmpName },
                    { type: 'Literal', value: i },
                    {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: tmpName, },
                      property: { type: 'Identifier', name: 'length', }
                    }
                  ]
                }
              });
            }

            continue; // skip i++
          }

          case 'Identifier': { // let [ foo ] = []
            decls.push({
              type: 'VariableDeclarator',
              id: e,
              init: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: tmpName },
                property: { type: 'Literal', value: i }
              }
            });

            break;
          }

          case 'AssignmentPattern': { // let [ foo = defaultValue ] = []
            decls.push({
              type: 'VariableDeclarator',
              id: e.left,
              init: {
                type: 'LogicalExpression',
                operator: '??',
                left: {
                  type: 'MemberExpression',
                  object: { type: 'Identifier', name: tmpName },
                  property: { type: 'Literal', value: i }
                },
                right: e.right
              }
            });

            break;
          }

          case 'ArrayPattern': { // let [ [ foo, bar ] ] = []
            decls.push({
              type: 'VariableDeclarator',
              id: e,
              init: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: tmpName },
                property: { type: 'Literal', value: i }
              }
            });

            break;
          }

          case 'ObjectPattern':
            return todo(scope, 'object destructuring is not supported yet')
        }

        i++;
      }

      out = out.concat([
        ...generateVar(scope, {
          type: 'VariableDeclaration',
          declarations: [{
            type: 'VariableDeclarator',
            id: { type: 'Identifier', name: tmpName },
            init: x.init
          }],
          kind: decl.kind
        }),
        ...generateVar(scope, {
          type: 'VariableDeclaration',
          declarations: decls,
          kind: decl.kind
        })
      ]);

      continue;
    }

    const name = mapName(x.id.name);
    if (!name) return todo(scope, 'object destructuring is not supported yet')

    if (x.init && isFuncType(x.init.type)) {
      // hack for let a = function () { ... }
      x.init.id = { name };
      generateFunc(scope, x.init);
      continue;
    }

    if (topLevel && Object.hasOwn(builtinVars, name)) {
      // cannot redeclare
      if (decl.kind !== 'var') return internalThrow(scope, 'SyntaxError', `Identifier '${unhackName(name)}' has already been declared`);

      continue; // always ignore
    }

    // // generate init before allocating var
    // let generated;
    // if (x.init) generated = generate(scope, x.init, global, name);

    const typed = typedInput && x.id.typeAnnotation;
    let idx = allocVar(scope, name, global, !(typed && extractTypeAnnotation(x.id).type != null));

    if (typed) {
      addVarMetadata(scope, name, global, extractTypeAnnotation(x.id));
    }

    if (x.init) {
      const alreadyArray = scope.arrays?.get(name) != null;

      let newOut = generate(scope, x.init, global, name);
      if (!alreadyArray && scope.arrays?.get(name) != null) {
        // hack to set local as pointer before
        newOut.unshift(...number(scope.arrays.get(name)), [ global ? Opcodes.global_set : Opcodes.local_set, idx ]);
        if (newOut.at(-1) == Opcodes.i32_from_u) newOut.pop();
        newOut.push(
          [ Opcodes.drop ],
          ...setType(scope, name, getNodeType(scope, x.init))
        );
      } else {
        newOut = setLocalWithType(scope, name, global, newOut, false, getNodeType(scope, x.init));
      }

      out = out.concat(newOut);

      if (globalThis.precompile && global) {
        scope.globalInits ??= {};
        scope.globalInits[name] = newOut;
      }
    }

    // hack: this follows spec properly but is mostly unneeded 😅
    // out.push(...setType(scope, name, x.init ? getNodeType(scope, x.init) : TYPES.undefined));
  }

  return out;
};

// todo: optimize this func for valueUnused
const generateAssign = (scope, decl, _global, _name, valueUnused = false) => {
  const { type, name } = decl.left;
  const [ local, isGlobal ] = lookupName(scope, name);

  // if (isFuncType(decl.right.type)) {
  //   // hack for a = function () { ... }
  //   decl.right.id = { name };

  //   const func = generateFunc(scope, decl.right);

  //   return [
  //     ...number(func.index - importedFuncs.length),
  //     ...(local != null ? [
  //       [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],
  //       [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ],

  //       ...setType(scope, name, TYPES.function)
  //     ] : [])
  //   ];
  // }

  const op = decl.operator.slice(0, -1) || '=';

  // hack: .length setter
  if (decl.left.type === 'MemberExpression' && decl.left.property.name === 'length') {
    const newValueTmp = localTmp(scope, '__length_setter_tmp');
    const pointerTmp = op === '=' ? null : localTmp(scope, '__member_setter_ptr_tmp', Valtype.i32);

    return [
      ...generate(scope, decl.left.object),
      Opcodes.i32_to_u,
      ...(!pointerTmp ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

      ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
        [ Opcodes.local_get, pointerTmp ],
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        Opcodes.i32_from_u
      ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right))),
      [ Opcodes.local_tee, newValueTmp ],

      Opcodes.i32_to_u,
      [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ],

      [ Opcodes.local_get, newValueTmp ]
    ];
  }

  // arr[i]
  if (decl.left.type === 'MemberExpression') {
    const newValueTmp = localTmp(scope, '#member_setter_val_tmp');
    const pointerTmp = localTmp(scope, '#member_setter_ptr_tmp', Valtype.i32);

    const object = decl.left.object;
    const property = decl.left.computed ? decl.left.property : {
      type: 'Literal',
      value: decl.left.property.name
    };

    // todo/perf: use i32 object (and prop?) locals
    const objectWasm = [ [ Opcodes.local_get, localTmp(scope, '#member_obj') ] ];
    const propertyWasm = [ [ Opcodes.local_get, localTmp(scope, '#member_prop_assign') ] ];

    return [
      ...generate(scope, object),
      [ Opcodes.local_set, localTmp(scope, '#member_obj') ],

      ...generate(scope, property, false, '#member_prop_assign'),
      [ Opcodes.local_set, localTmp(scope, '#member_prop_assign') ],

      // todo: review last type usage here
      ...typeSwitch(scope, getNodeType(scope, decl.left.object), {
        [TYPES.array]: [
          ...objectWasm,
          Opcodes.i32_to_u,

          // get index as valtype
          ...propertyWasm,
          Opcodes.i32_to_u,

          // turn into byte offset by * valtypeSize + 1
          ...number(ValtypeSize[valtype] + 1, Valtype.i32),
          [ Opcodes.i32_mul ],
          [ Opcodes.i32_add ],
          [ Opcodes.local_tee, pointerTmp ],

          ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
            [ Opcodes.local_get, pointerTmp ],
            [ Opcodes.load, 0, ValtypeSize.i32 ]
          ], generate(scope, decl.right), [
            [ Opcodes.local_get, pointerTmp ],
            [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 + ValtypeSize[valtype] ]
          ], getNodeType(scope, decl.right), false, name, true)),
          [ Opcodes.local_tee, newValueTmp ],
          [ Opcodes.store, 0, ValtypeSize.i32 ],

          [ Opcodes.local_get, pointerTmp ],
          ...getNodeType(scope, decl),
          [ Opcodes.i32_store8, 0, ValtypeSize.i32 + ValtypeSize[valtype] ],

          [ Opcodes.local_get, newValueTmp ]
        ],

        [TYPES.object]: [
          ...objectWasm,
          Opcodes.i32_to_u,
          ...(op === '=' ? [] : [ [ Opcodes.local_tee, localTmp(scope, '#objset_object', Valtype.i32) ] ]),
          ...getNodeType(scope, object),

          ...propertyWasm,
          ...getNodeType(scope, property),
          ...toPropertyKey(scope, op === '='),
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

            [ Opcodes.call, ...unsignedLEB128(includeBuiltin(scope, '__Porffor_object_get').index) ],
            ...setLastType(scope)
          ], generate(scope, decl.right), getLastType(scope), getNodeType(scope, decl.right), false, name, true)),
          ...getNodeType(scope, decl),

          [ Opcodes.call, ...unsignedLEB128(includeBuiltin(scope, '__Porffor_object_set').index) ],
          [ Opcodes.drop ],
          // ...setLastType(scope, getNodeType(scope, decl)),
        ],

        ...wrapBC({
          [TYPES.uint8array]: [
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load8_u, 0, 4 ],
              Opcodes.i32_from_u
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            Opcodes.i32_to_u,
            [ Opcodes.i32_store8, 0, 4 ]
          ],
          [TYPES.uint8clampedarray]: [
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load8_u, 0, 4 ],
              Opcodes.i32_from_u
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            ...number(0),
            [ Opcodes.f64_max ],
            ...number(255),
            [ Opcodes.f64_min ],
            Opcodes.i32_to_u,
            [ Opcodes.i32_store8, 0, 4 ]
          ],
          [TYPES.int8array]: [
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load8_s, 0, 4 ],
              Opcodes.i32_from
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            Opcodes.i32_to,
            [ Opcodes.i32_store8, 0, 4 ]
          ],
          [TYPES.uint16array]: [
            ...number(2, Valtype.i32),
            [ Opcodes.i32_mul ],
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load16_u, 0, 4 ],
              Opcodes.i32_from_u
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            Opcodes.i32_to_u,
            [ Opcodes.i32_store16, 0, 4 ]
          ],
          [TYPES.int16array]: [
            ...number(2, Valtype.i32),
            [ Opcodes.i32_mul ],
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load16_s, 0, 4 ],
              Opcodes.i32_from
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            Opcodes.i32_to,
            [ Opcodes.i32_store16, 0, 4 ]
          ],
          [TYPES.uint32array]: [
            ...number(4, Valtype.i32),
            [ Opcodes.i32_mul ],
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load, 0, 4 ],
              Opcodes.i32_from_u
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            Opcodes.i32_to_u,
            [ Opcodes.i32_store, 0, 4 ]
          ],
          [TYPES.int32array]: [
            ...number(4, Valtype.i32),
            [ Opcodes.i32_mul ],
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.i32_load, 0, 4 ],
              Opcodes.i32_from
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            Opcodes.i32_to,
            [ Opcodes.i32_store, 0, 4 ]
          ],
          [TYPES.float32array]: [
            ...number(4, Valtype.i32),
            [ Opcodes.i32_mul ],
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.f32_load, 0, 4 ],
              [ Opcodes.f64_promote_f32 ]
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            [ Opcodes.f32_demote_f64 ],
            [ Opcodes.f32_store, 0, 4 ]
          ],
          [TYPES.float64array]: [
            ...number(8, Valtype.i32),
            [ Opcodes.i32_mul ],
            [ Opcodes.i32_add ],
            ...(op === '=' ? [] : [ [ Opcodes.local_tee, pointerTmp ] ]),

            ...(op === '=' ? generate(scope, decl.right) : performOp(scope, op, [
              [ Opcodes.local_get, pointerTmp ],
              [ Opcodes.f64_load, 0, 4 ]
            ], generate(scope, decl.right), number(TYPES.number, Valtype.i32), getNodeType(scope, decl.right), false, name, true)),
            [ Opcodes.local_tee, newValueTmp ],

            [ Opcodes.f64_store, 0, 4 ]
          ],
        }, {
          prelude: [
            ...objectWasm,
            Opcodes.i32_to_u,
            [ Opcodes.i32_load, 0, 4 ],

            ...propertyWasm,
            Opcodes.i32_to_u,
          ],
          postlude: [
            // setLastType(scope, TYPES.number)
            [ Opcodes.local_get, newValueTmp ]
          ]
        }),

        default: internalThrow(scope, 'TypeError', `Cannot assign member with non-array`)
      }, valtypeBinary)
    ];
  }

  if (!name) return todo(scope, 'destructuring is not supported yet', true);

  if (local === undefined) {
    // todo: this should be a sloppy mode only thing

    // only allow = for this
    if (op !== '=') return internalThrow(scope, 'ReferenceError', `${unhackName(name)} is not defined`);

    if (Object.hasOwn(builtinVars, name)) {
      // just return rhs (eg `NaN = 2`)
      return generate(scope, decl.right);
    }

    // set global and return (eg a = 2)
    return [
      ...generateVar(scope, { kind: 'var', _bare: true, declarations: [ { id: { name }, init: decl.right } ] }),
      ...generate(scope, decl.left)
    ];
  }

  if (op === '=') {
    return setLocalWithType(scope, name, isGlobal, decl.right, true);
  }

  if (op === '||' || op === '&&' || op === '??') {
    // todo: is this needed?
    // for logical assignment ops, it is not left @= right ~= left = left @ right
    // instead, left @ (left = right)
    // eg, x &&= y ~= x && (x = y)

    return [
      ...performOp(scope, op, [
        [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ]
      ], [
        ...generate(scope, decl.right, isGlobal, name),
        [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],
        [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ]
      ], getType(scope, name), getNodeType(scope, decl.right), isGlobal, name, true),
      [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ],

      ...setType(scope, name, getLastType(scope))
    ];
  }

  return setLocalWithType(
    scope, name, isGlobal,
    performOp(scope, op, [ [ isGlobal ? Opcodes.global_get : Opcodes.local_get, local.idx ] ], generate(scope, decl.right), getType(scope, name), getNodeType(scope, decl.right), isGlobal, name, true),
    true,
    getNodeType(scope, decl)
  );
};

const ifIdentifierErrors = (scope, decl) => {
  if (decl.type === 'Identifier') {
    const out = generateIdent(scope, decl);
    if (out[1]) return true;
  }

  return false;
};

const generateUnary = (scope, decl) => {
  switch (decl.operator) {
    case '+':
      // stub
      return generate(scope, decl.argument);

    case '-':
      // * -1

      if (decl.prefix && decl.argument.type === 'Literal' && typeof decl.argument.value === 'number') {
        // if -n, just return that as a const
        return number(-1 * decl.argument.value);
      }

      return [
        ...generate(scope, decl.argument),
        ...(valtype === 'f64' ? [ [ Opcodes.f64_neg ] ] : [ ...number(-1), [ Opcodes.mul ] ])
      ];

    case '!':
      const arg = decl.argument;
      if (arg.type === 'UnaryExpression' && arg.operator === '!') {
        // opt: !!x -> is x truthy
        return truthy(scope, generate(scope, arg.argument), getNodeType(scope, arg.argument), false, false);
      }

      // !=
      return falsy(scope, generate(scope, arg), getNodeType(scope, arg), false, false);

    case '~':
      return [
        ...generate(scope, decl.argument),
        Opcodes.i32_to,
        [ Opcodes.i32_const, ...signedLEB128(-1) ],
        [ Opcodes.i32_xor ],
        Opcodes.i32_from
      ];

    case 'void': {
      // drop current expression value after running, give undefined
      const out = generate(scope, decl.argument);
      disposeLeftover(out);

      out.push(...number(UNDEFINED));
      return out;
    }

    case 'delete': {
      let toReturn = true, toGenerate = true;

      if (decl.argument.type === 'Identifier') {
        const out = generateIdent(scope, decl.argument);

        // if ReferenceError (undeclared var), ignore and return true. otherwise false
        if (!out[1]) {
          // exists
          toReturn = false;
        } else {
          // does not exist (2 ops from throw)
          toReturn = true;
          toGenerate = false;
        }
      }

      const out = toGenerate ? generate(scope, decl.argument) : [];
      disposeLeftover(out);

      out.push(...number(toReturn ? 1 : 0));
      return out;
    }

    case 'typeof': {
      let overrideType, toGenerate = true;
      if (ifIdentifierErrors(scope, decl.argument)) {
        overrideType = number(TYPES.undefined, Valtype.i32);
        toGenerate = false;
      }

      const out = toGenerate ? generate(scope, decl.argument) : [];
      disposeLeftover(out);

      out.push(...typeSwitch(scope, overrideType ?? getNodeType(scope, decl.argument), {
        [TYPES.number]: makeString(scope, 'number', false, '#typeof_result'),
        [TYPES.boolean]: makeString(scope, 'boolean', false, '#typeof_result'),
        [TYPES.string]: makeString(scope, 'string', false, '#typeof_result'),
        [TYPES.undefined]: makeString(scope, 'undefined', false, '#typeof_result'),
        [TYPES.function]: makeString(scope, 'function', false, '#typeof_result'),
        [TYPES.symbol]: makeString(scope, 'symbol', false, '#typeof_result'),
        [TYPES.bytestring]: makeString(scope, 'string', false, '#typeof_result'),
        [TYPES.empty]: makeString(scope, 'undefined', false, '#typeof_result'),

        // object and internal types
        default: makeString(scope, 'object', false, '#typeof_result'),
      }));

      return out;
    }

    default:
      return todo(scope, `unary operator ${decl.operator} not implemented yet`, true);
  }
};

const generateUpdate = (scope, decl, _global, _name, valueUnused = false) => {
  const { name } = decl.argument;

  const [ local, isGlobal ] = lookupName(scope, name);

  if (local === undefined) {
    return todo(scope, `update expression with undefined variable`, true);
  }

  const idx = local.idx;
  const out = [];

  out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);
  if (!decl.prefix && !valueUnused) out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);

  switch (decl.operator) {
    case '++':
      out.push(...number(1), [ Opcodes.add ]);
      break;

    case '--':
      out.push(...number(1), [ Opcodes.sub ]);
      break;
  }

  out.push([ isGlobal ? Opcodes.global_set : Opcodes.local_set, idx ]);
  if (decl.prefix && !valueUnused) out.push([ isGlobal ? Opcodes.global_get : Opcodes.local_get, idx ]);

  return out;
};

const generateIf = (scope, decl) => {
  const out = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test), false, true);

  out.push([ Opcodes.if, Blocktype.void ]);
  depth.push('if');

  const consOut = generate(scope, decl.consequent);
  disposeLeftover(consOut);
  out.push(...consOut);

  if (decl.alternate) {
    out.push([ Opcodes.else ]);

    const altOut = generate(scope, decl.alternate);
    disposeLeftover(altOut);
    out.push(...altOut);
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

const generateConditional = (scope, decl) => {
  const out = truthy(scope, generate(scope, decl.test), getNodeType(scope, decl.test), false, true);

  out.push([ Opcodes.if, valtypeBinary ]);
  depth.push('if');

  out.push(
    ...generate(scope, decl.consequent),
    ...setLastType(scope, getNodeType(scope, decl.consequent))
  );

  out.push([ Opcodes.else ]);

  out.push(
    ...generate(scope, decl.alternate),
    ...setLastType(scope, getNodeType(scope, decl.alternate))
  );

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

let depth = [];
const generateFor = (scope, decl) => {
  const out = [];

  if (decl.init) {
    out.push(...generate(scope, decl.init, false, undefined, true));
    disposeLeftover(out);
  }

  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('for');

  if (decl.test) out.push(...generate(scope, decl.test), Opcodes.i32_to);
    else out.push(...number(1, Valtype.i32));

  out.push([ Opcodes.if, Blocktype.void ]);
  depth.push('if');

  out.push([ Opcodes.block, Blocktype.void ]);
  depth.push('block');
  out.push(...generate(scope, decl.body));
  out.push([ Opcodes.end ]);

  if (decl.update) out.push(...generate(scope, decl.update, false, undefined, true));

  out.push([ Opcodes.br, 1 ]);
  out.push([ Opcodes.end ], [ Opcodes.end ]);
  depth.pop(); depth.pop();

  return out;
};

const generateWhile = (scope, decl) => {
  const out = [];

  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('while');

  out.push(...generate(scope, decl.test));
  out.push(Opcodes.i32_to, [ Opcodes.if, Blocktype.void ]);
  depth.push('if');

  out.push(...generate(scope, decl.body));

  out.push([ Opcodes.br, 1 ]);
  out.push([ Opcodes.end ], [ Opcodes.end ]);
  depth.pop(); depth.pop();

  return out;
};

const generateDoWhile = (scope, decl) => {
  const out = [];

  out.push([ Opcodes.loop, Blocktype.void ]);
  depth.push('dowhile');

  // block for break (includes all)
  out.push([ Opcodes.block, Blocktype.void ]);
  depth.push('block');

  // block for continue
  // includes body but not test+loop so we can exit body at anytime
  // and still test+loop after
  out.push([ Opcodes.block, Blocktype.void ]);
  depth.push('block');

  out.push(...generate(scope, decl.body));

  out.push([ Opcodes.end ]);
  depth.pop();

  out.push(...generate(scope, decl.test), Opcodes.i32_to);
  out.push([ Opcodes.br_if, 1 ]);

  out.push([ Opcodes.end ], [ Opcodes.end ]);
  depth.pop(); depth.pop();

  return out;
};

const generateForOf = (scope, decl) => {
  const out = [];

  // todo: for of inside for of might fuck up?
  const pointer = localTmp(scope, 'forof_base_pointer', Valtype.i32);
  const length = localTmp(scope, 'forof_length', Valtype.i32);
  const counter = localTmp(scope, 'forof_counter', Valtype.i32);

  out.push(
    // set pointer as right
    ...generate(scope, decl.right),
    Opcodes.i32_to_u,
    [ Opcodes.local_set, pointer ],

    // set counter as 0 (could be already used)
    ...number(0, Valtype.i32),
    [ Opcodes.local_set, counter ],

    // get length
    [ Opcodes.local_get, pointer ],
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
    [ Opcodes.local_tee, length ],

    [ Opcodes.if, Blocktype.void ]
  );

  depth.push('if');
  depth.push('forof');
  depth.push('block');
  depth.push('block');

  // setup local for left
  generate(scope, decl.left);

  let leftName = decl.left.declarations?.[0]?.id?.name;
  if (!leftName && decl.left.name) {
    // todo: should be sloppy mode only
    leftName = decl.left.name;

    generateVar(scope, { kind: 'var', _bare: true, declarations: [ { id: { name: leftName } } ] })
  }

  const [ local, isGlobal ] = lookupName(scope, leftName);
  if (!local) return todo(scope, 'for of failed to get left local (probably destructure)');

  // // todo: we should only do this for strings but we don't know at compile-time :(
  // hack: this is naughty and will break things!
  let newOut = number(0, Valtype.i32), newPointer = number(0, Valtype.i32);

  const known = knownType(scope, getNodeType(scope, decl.right));
  if ((known === TYPES.string || known === TYPES.bytestring) || (pages.hasAnyString && known == null)) {
    // todo: we use i16 even for bytestrings which should not make a bad thing happen, just be confusing for debugging?
    0, [ newOut, newPointer ] = makeArray(scope, {
      rawElements: new Array(0)
    }, isGlobal, leftName, true, 'i16', true);
  }

  // set type for local
  // todo: optimize away counter and use end pointer
  out.push(...typeSwitch(scope, getNodeType(scope, decl.right), {
    [TYPES.array]: [
      [ Opcodes.loop, Blocktype.void ],

      [ Opcodes.local_get, pointer ],
      [ Opcodes.load, 0, ...unsignedLEB128(ValtypeSize.i32) ],

      ...setType(scope, leftName, [
        [ Opcodes.local_get, pointer ],
        [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(ValtypeSize.i32 + ValtypeSize[valtype]) ],
      ]),

      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],

      [ Opcodes.block, Blocktype.void ],
      [ Opcodes.block, Blocktype.void ],
      ...generate(scope, decl.body),
      [ Opcodes.end ],

      // increment iter pointer by valtype size + 1
      [ Opcodes.local_get, pointer ],
      ...number(ValtypeSize[valtype] + 1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, pointer ],

      // increment counter by 1
      [ Opcodes.local_get, counter ],
      ...number(1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_tee, counter ],

      // loop if counter != length
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_ne ],
      [ Opcodes.br_if, 1 ],

      [ Opcodes.end ],
      [ Opcodes.end ]
    ],

    [TYPES.string]: [
      ...setType(scope, leftName, TYPES.string),

      // setup new/out array
      ...newOut,

      // set length to 1
      ...number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      [ Opcodes.loop, Blocktype.void ],

      // use as pointer for store later
      ...newPointer,

      // load current string ind {arg}
      [ Opcodes.local_get, pointer ],
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // return new string (page)
      ...newPointer,
      Opcodes.i32_from_u,

      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],

      [ Opcodes.block, Blocktype.void ],
      [ Opcodes.block, Blocktype.void ],
      ...generate(scope, decl.body),
      [ Opcodes.end ],

      // increment iter pointer by valtype size
      [ Opcodes.local_get, pointer ],
      ...number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, pointer ],

      // increment counter by 1
      [ Opcodes.local_get, counter ],
      ...number(1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_tee, counter ],

      // loop if counter != length
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_ne ],
      [ Opcodes.br_if, 1 ],

      [ Opcodes.end ],
      [ Opcodes.end ]
    ],
    [TYPES.bytestring]: [
      ...setType(scope, leftName, TYPES.bytestring),

      // setup new/out array
      ...newOut,

      // set length to 1
      ...number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      [ Opcodes.loop, Blocktype.void ],

      // use as pointer for store later
      ...newPointer,

      // load current string ind {arg}
      [ Opcodes.local_get, pointer ],
      [ Opcodes.local_get, counter ],
      [ Opcodes.i32_add ],
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store8, 0, ValtypeSize.i32 ],

      // return new string (page)
      ...newPointer,
      Opcodes.i32_from_u,

      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],

      [ Opcodes.block, Blocktype.void ],
      [ Opcodes.block, Blocktype.void ],
      ...generate(scope, decl.body),
      [ Opcodes.end ],

      // increment counter by 1
      [ Opcodes.local_get, counter ],
      ...number(1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_tee, counter ],

      // loop if counter != length
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_ne ],
      [ Opcodes.br_if, 1 ],

      [ Opcodes.end ],
      [ Opcodes.end ]
    ],

    [TYPES.set]: [
      [ Opcodes.loop, Blocktype.void ],

      [ Opcodes.local_get, pointer ],
      [ Opcodes.load, 0, ...unsignedLEB128(ValtypeSize.i32) ],

      ...setType(scope, leftName, [
        [ Opcodes.local_get, pointer ],
        [ Opcodes.i32_load8_u, 0, ...unsignedLEB128(ValtypeSize.i32 + ValtypeSize[valtype]) ],
      ]),

      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],

      [ Opcodes.block, Blocktype.void ],
      [ Opcodes.block, Blocktype.void ],
      ...generate(scope, decl.body),
      [ Opcodes.end ],

      // increment iter pointer by valtype size + 1
      [ Opcodes.local_get, pointer ],
      ...number(ValtypeSize[valtype] + 1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, pointer ],

      // increment counter by 1
      [ Opcodes.local_get, counter ],
      ...number(1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_tee, counter ],

      // loop if counter != length
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_ne ],
      [ Opcodes.br_if, 1 ],

      [ Opcodes.end ],
      [ Opcodes.end ]
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
        ...number(2, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load16_u, 0, 4 ],
        Opcodes.i32_from_u
      ],
      [TYPES.int16array]: [
        ...number(2, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load16_s, 0, 4 ],
        Opcodes.i32_from
      ],
      [TYPES.uint32array]: [
        ...number(4, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load, 0, 4 ],
        Opcodes.i32_from_u
      ],
      [TYPES.int32array]: [
        ...number(4, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load, 0, 4 ],
        Opcodes.i32_from
      ],
      [TYPES.float32array]: [
        ...number(4, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.f32_load, 0, 4 ],
        [ Opcodes.f64_promote_f32 ]
      ],
      [TYPES.float64array]: [
        ...number(8, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.f64_load, 0, 4 ]
      ],
    }, {
      prelude: [
        ...setType(scope, leftName, TYPES.number),

        [ Opcodes.loop, Blocktype.void ],

        [ Opcodes.local_get, pointer ],
        [ Opcodes.i32_load, 0, 4 ],
        [ Opcodes.local_get, counter ]
      ],
      postlude: [
        [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],

        [ Opcodes.block, Blocktype.void ],
        [ Opcodes.block, Blocktype.void ],
        ...generate(scope, decl.body),
        [ Opcodes.end ],

        // increment counter by 1
        [ Opcodes.local_get, counter ],
        ...number(1, Valtype.i32),
        [ Opcodes.i32_add ],
        [ Opcodes.local_tee, counter ],

        // loop if counter != length
        [ Opcodes.local_get, length ],
        [ Opcodes.i32_ne ],
        [ Opcodes.br_if, 1 ],

        [ Opcodes.end ],
        [ Opcodes.end ]
      ]
    }),

    default: internalThrow(scope, 'TypeError', `Tried for..of on non-iterable type`)
  }, Blocktype.void));

  out.push([ Opcodes.end ]); // end if

  depth.pop();
  depth.pop();
  depth.pop();

  return out;
};

const generateForIn = (scope, decl) => {
  const out = [];

  // todo: for in inside for in might fuck up?
  const pointer = localTmp(scope, '#forin_base_pointer', Valtype.i32);
  const length = localTmp(scope, '#forin_length', Valtype.i32);
  const counter = localTmp(scope, '#forin_counter', Valtype.i32);

  out.push(
    // set pointer as right
    ...generate(scope, decl.right),
    Opcodes.i32_to_u,
    [ Opcodes.local_set, pointer ],

    // set counter as 0 (could be already used)
    ...number(0, Valtype.i32),
    [ Opcodes.local_set, counter ],

    // get length
    [ Opcodes.local_get, pointer ],
    [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
    [ Opcodes.local_tee, length ],

    [ Opcodes.if, Blocktype.void ]
  );

  depth.push('if');
  depth.push('forin');
  depth.push('block');
  depth.push('block');

  // setup local for left
  generate(scope, decl.left);

  let leftName = decl.left.declarations?.[0]?.id?.name;
  if (!leftName && decl.left.name) {
    // todo: should be sloppy mode only
    leftName = decl.left.name;

    generateVar(scope, { kind: 'var', _bare: true, declarations: [ { id: { name: leftName } } ] })
  }

  const [ local, isGlobal ] = lookupName(scope, leftName);
  if (!local) return todo(scope, 'for of failed to get left local (probably destructure)');

  // set type for local
  // todo: optimize away counter and use end pointer
  out.push(...typeSwitch(scope, getNodeType(scope, decl.right), {
    [TYPES.object]: [
      [ Opcodes.loop, Blocktype.void ],

      [ Opcodes.local_get, pointer ],
      [ Opcodes.i32_load, 0, 5 ],
      [ Opcodes.local_tee, localTmp(scope, '#forin_tmp', Valtype.i32) ],

      ...setType(scope, leftName, [
        [ Opcodes.i32_const, 31 ],
        [ Opcodes.i32_shr_u ],
        [ Opcodes.if, Valtype.i32 ],
          // unset MSB in tmp
          [ Opcodes.local_get, localTmp(scope, '#forin_tmp', Valtype.i32) ],
          ...number(0x7fffffff, Valtype.i32),
          [ Opcodes.i32_and ],
          [ Opcodes.local_set, localTmp(scope, '#forin_tmp', Valtype.i32) ],

          [ Opcodes.i32_const, ...unsignedLEB128(TYPES.string) ],
        [ Opcodes.else ],
          [ Opcodes.i32_const, ...unsignedLEB128(TYPES.bytestring) ],
        [ Opcodes.end ]
      ]),

      [ Opcodes.local_get, localTmp(scope, '#forin_tmp', Valtype.i32) ],
      Opcodes.i32_from_u,
      [ isGlobal ? Opcodes.global_set : Opcodes.local_set, local.idx ],

      [ Opcodes.block, Blocktype.void ],
      [ Opcodes.block, Blocktype.void ],
      ...generate(scope, decl.body),
      [ Opcodes.end ],

      // increment iter pointer by 14
      [ Opcodes.local_get, pointer ],
      ...number(14, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_set, pointer ],

      // increment counter by 1
      [ Opcodes.local_get, counter ],
      ...number(1, Valtype.i32),
      [ Opcodes.i32_add ],
      [ Opcodes.local_tee, counter ],

      // loop if counter != length
      [ Opcodes.local_get, length ],
      [ Opcodes.i32_ne ],
      [ Opcodes.br_if, 1 ],

      [ Opcodes.end ],
      [ Opcodes.end ]
    ],

    // todo: use Object.keys as fallback
    default: internalThrow(scope, 'TypeError', `Tried for..in on unsupported type`)
  }, Blocktype.void));

  out.push([ Opcodes.end ]); // end if

  depth.pop();
  depth.pop();
  depth.pop();

  return out;
};

const generateSwitch = (scope, decl) => {
  const tmp = localTmp(scope, '#switch_disc');
  const out = [
    ...generate(scope, decl.discriminant),
    [ Opcodes.local_set, tmp ],

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
      out.push(
        [ Opcodes.local_get, tmp ],
        ...generate(scope, x.test),
        [ Opcodes.eq ],
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
      ...generateCode(scope, { body: cases[i].consequent })
    );
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

// find the nearest loop in depth map by type
const getNearestLoop = () => {
  for (let i = depth.length - 1; i >= 0; i--) {
    if (['while', 'dowhile', 'for', 'forof', 'forin', 'switch'].includes(depth[i])) return i;
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
    forof: 2, // loop > block (wanted branch) > block (we are here)
    forin: 2, // loop > block (wanted branch) > block (we are here)
    if: 1, // break inside if, branch 0 to skip the rest of the if
    switch: 1
  })[type];

  return [
    [ Opcodes.br, ...signedLEB128(depth.length - target - offset) ]
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
    forof: 3, // loop > block > block (wanted branch) (we are here)
    forin: 3 // loop > block > block (wanted branch) (we are here)
  })[type];

  return [
    [ Opcodes.br, ...signedLEB128(depth.length - target - offset) ]
  ];
};

const generateLabel = (scope, decl) => {
  scope.labels ??= new Map();

  const name = decl.label.name;
  scope.labels.set(name, depth.length);

  return generate(scope, decl.body);
};

const generateThrow = (scope, decl) => {
  scope.throws = true;

  const exceptionMode = Prefs.exceptionMode ?? 'lut';
  if (exceptionMode === 'lut') {
    let message = decl.argument.value, constructor = null;

    // support `throw (new)? Error(...)`
    if (!message && (decl.argument.type === 'NewExpression' || decl.argument.type === 'CallExpression')) {
      constructor = decl.argument.callee.name;
      message = decl.argument.arguments[0]?.value ?? '';
    }

    if (tags.length === 0) tags.push({
      params: [ Valtype.i32 ],
      results: [],
      idx: tags.length
    });

    let exceptId = exceptions.findIndex(x => x.constructor === constructor && x.message === message);
    if (exceptId === -1) exceptId = exceptions.push({ constructor, message }) - 1;

    scope.exceptions ??= [];
    scope.exceptions.push(exceptId);

    return [
      ...number(exceptId, Valtype.i32),
      [ Opcodes.throw, tags[0].idx ]
    ];
  }

  if (exceptionMode === 'stack') {
    if (tags.length === 0) tags.push({
      params: [ valtypeBinary, Valtype.i32 ],
      results: [],
      idx: tags.length
    });

    return [
      ...generate(scope, decl.argument),
      ...getNodeType(scope, decl.argument),
      [ Opcodes.throw, tags[0].idx ]
    ];
  }

  if (exceptionMode === 'stackest') {
    let message = decl.argument, constructor = null;

    // support `throw (new)? Error(...)`
    if (message.type === 'NewExpression' || message.type === 'CallExpression') {
      constructor = decl.argument.callee;
      message = decl.argument.arguments[0];
    }

    message ??= DEFAULT_VALUE;

    if (tags.length === 0) tags.push({
      params: [ valtypeBinary, valtypeBinary, Valtype.i32 ],
      results: [],
      idx: tags.length
    });

    return [
      ...(constructor == null ? number(-1) : generate(scope, constructor)),
      ...generate(scope, message),
      ...getNodeType(scope, message),
      [ Opcodes.throw, tags[0].idx ]
    ];
  }

  if (exceptionMode === 'partial') {
    let message = decl.argument, constructor = null;

    // support `throw (new)? Error(...)`
    if (message.type === 'NewExpression' || message.type === 'CallExpression') {
      constructor = decl.argument.callee.name;
      message = decl.argument.arguments[0];
    }

    message ??= DEFAULT_VALUE;

    if (tags.length === 0) tags.push({
      params: [ Valtype.i32, valtypeBinary, Valtype.i32 ],
      results: [],
      idx: tags.length
    });

    let exceptId = exceptions.push({ constructor }) - 1;

    scope.exceptions ??= [];
    scope.exceptions.push(exceptId);

    return [
      ...number(exceptId, Valtype.i32),
      ...generate(scope, message),
      ...getNodeType(scope, message),
      [ Opcodes.throw, tags[0].idx ]
    ];
  }
};

const generateTry = (scope, decl) => {
  // todo: handle control-flow pre-exit for finally
  // "Immediately before a control-flow statement (return, throw, break, continue) is executed in the try block or catch block."

  const out = [];

  const finalizer = decl.finalizer ? generate(scope, decl.finalizer) : [];

  out.push([ Opcodes.try, Blocktype.void ]);
  depth.push('try');

  out.push(...generate(scope, decl.block));
  out.push(...finalizer);

  if (decl.handler) {
    depth.pop();
    depth.push('catch');

    out.push([ Opcodes.catch_all ]);
    out.push(...generate(scope, decl.handler.body));
    out.push(...finalizer);
  }

  out.push([ Opcodes.end ]);
  depth.pop();

  return out;
};

const generateEmpty = (scope, decl) => {
  return [];
};

const generateMeta = (scope, decl) => {
  if (decl.meta.name !== 'new') return todo(scope, `meta property object ${decl.meta.name} is not supported yet`, true);

  switch (`${decl.meta.name}.${decl.property.name}`) {
    case 'new.target': {
      scope.constr = true;

      return [
        [ Opcodes.local_get, -1 ],
        Opcodes.i32_from_u,
        ...setLastType(scope, TYPES.boolean)
      ];
    }
  }
};

let pages = new Map();
const allocPage = (scope, reason, type) => {
  if (pages.has(reason)) return pages.get(reason).ind;

  if (reason.startsWith('array:')) pages.hasArray = true;
  if (reason.startsWith('string:')) pages.hasString = true;
  if (reason.startsWith('bytestring:')) pages.hasByteString = true;
  if (reason.includes('string:')) pages.hasAnyString = true;

  const ind = pages.size;
  pages.set(reason, { ind, type });

  scope.pages ??= new Map();
  scope.pages.set(reason, { ind, type });

  return ind;
};

const itemTypeToValtype = {
  i32: 'i32',
  i64: 'i64',
  f64: 'f64',

  i8: 'i32',
  i16: 'i32'
};

const StoreOps = {
  i32: Opcodes.i32_store,
  i64: Opcodes.i64_store,
  f64: Opcodes.f64_store,

  // expects i32 input!
  i8: Opcodes.i32_store8,
  i16: Opcodes.i32_store16,
};

let data = [];

const compileBytes = (val, itemType) => {
  // todo: this is a mess and needs confirming / ????
  switch (itemType) {
    case 'i8': return [ val % 256 ];
    case 'i16': return [ val % 256, (val / 256 | 0) % 256 ];
    case 'i16': return [ val % 256, (val / 256 | 0) % 256 ];
    case 'i32': return [...new Uint8Array(new Int32Array([ val ]).buffer)];
    // todo: i64

    case 'f64': return ieee754_binary64(val);
  }
};

const makeData = (scope, elements, offset = null, itemType, initEmpty) => {
  const length = elements.length;

  // if length is 0 memory/data will just be 0000... anyway
  if (length === 0) return false;

  let bytes = compileBytes(length, 'i32');

  if (!initEmpty) for (let i = 0; i < length; i++) {
    if (elements[i] == null) continue;

    bytes.push(...compileBytes(elements[i], itemType));
  }

  const obj = { bytes };
  if (offset != null) obj.offset = offset;

  const idx = data.push(obj) - 1;

  scope.data ??= [];
  scope.data.push(idx);

  return { idx, size: bytes.length };
};

const printStaticStr = str => {
  const out = [];

  for (let i = 0; i < str.length; i++) {
    out.push(
      // ...number(str.charCodeAt(i)),
      ...number(str.charCodeAt(i), Valtype.i32),
      Opcodes.i32_from_u,
      [ Opcodes.call, importedFuncs.printChar ]
    );
  }

  return out;
};

const makeArray = (scope, decl, global = false, name = '$undeclared', initEmpty = false, itemType = valtype, intOut = false, typed = false) => {
  if (itemType !== 'i16' && itemType !== 'i8') {
    pages.hasArray = true;
  } else {
    pages.hasAnyString = true;
    if (itemType === 'i8') pages.hasByteString = true;
      else pages.hasString = true;
  }

  const out = [];

  const uniqueName = name === '$undeclared' ? name + randId() : name;

  const useRawElements = !!decl.rawElements;
  const elements = useRawElements ? decl.rawElements : decl.elements;

  const valtype = itemTypeToValtype[itemType];
  const length = elements.length;

  const allocated = allocator.alloc({ scope, pages, globals, asmFunc, funcIndex }, uniqueName, { itemType });

  let pointer = allocated;
  if (allocator.constructor.name !== 'StaticAllocator') {
    // const tmp = localTmp(scope, '#makearray_pointer' + uniqueName, Valtype.i32);
    const tmp = localTmp(scope, '#makearray_pointer' + name, Valtype.i32);
    out.push(
      ...allocated,
      [ Opcodes.local_set, tmp ]
    );

    if (Prefs.runtimeAllocLog) out.push(
      ...printStaticStr(`${name}: `),

      [ Opcodes.local_get, tmp ],
      Opcodes.i32_from_u,
      [ Opcodes.call, 0 ],

      ...number(10),
      [ Opcodes.call, 1 ]
    );

    pointer = [ [ Opcodes.local_get, tmp ] ];

    if (Prefs.data && useRawElements) {
      const data = makeData(scope, elements, null, itemType, initEmpty);
      if (data) {
        // init data
        out.push(
          ...pointer,
          ...number(0, Valtype.i32),
          ...number(data.size, Valtype.i32),
          [ ...Opcodes.memory_init, ...unsignedLEB128(data.idx), 0 ]
        );
      }

      // return pointer in out
      out.push(
        ...pointer,
        ...(!intOut ? [ Opcodes.i32_from_u ] : [])
      );

      return [ out, pointer ];
    }
  } else {
    const rawPtr = read_signedLEB128(pointer[0].slice(1));

    scope.arrays ??= new Map();
    const firstAssign = !scope.arrays.has(uniqueName);
    if (firstAssign) scope.arrays.set(uniqueName, rawPtr);

    const local = global ? globals[name] : scope.locals?.[name];
    if (
      Prefs.data && firstAssign && useRawElements &&
      name !== '#member_prop' && name !== '#member_prop_assign' &&
      (!globalThis.precompile || !global)
    ) {
      makeData(scope, elements, rawPtr, itemType, initEmpty);

      // local value as pointer
      return [ number(rawPtr, intOut ? Valtype.i32 : valtypeBinary), pointer ];
    }

    if (local != null) {
      // hack: handle allocation for #member_prop's here instead of in several places /shrug
      let shouldGet = true;
      if (name === '#member_prop') {
        if (!scope._allocatedMemberProp) {
          out.push(
            ...number(rawPtr),
            [ global ? Opcodes.global_set : Opcodes.local_set, local.idx ]
          );

          scope._allocatedMemberProp = true;
        }
      }

      if (name === '#member_prop_assign') {
        out.push(
          [ Opcodes.call, ...unsignedLEB128(includeBuiltin(scope, '__Porffor_allocate').index) ]
        );
        shouldGet = false;
      }

      const pointerTmp = localTmp(scope, '#makearray_pointer_tmp', Valtype.i32);
      out.push(
        ...(shouldGet ? [
          [ global ? Opcodes.global_get : Opcodes.local_get, local.idx ],
          Opcodes.i32_to_u
        ] : []),
        [ Opcodes.local_set, pointerTmp ]
      );

      pointer = [ [ Opcodes.local_get, pointerTmp ] ];
    }
  }


  // store length
  out.push(
    ...pointer,
    ...number(length, Valtype.i32),
    [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ]
  );

  const storeOp = StoreOps[itemType];
  const sizePerEl = ValtypeSize[itemType] + (typed ? 1 : 0);
  if (!initEmpty) for (let i = 0; i < length; i++) {
    if (elements[i] == null) continue;

    const offset = ValtypeSize.i32 + i * sizePerEl;
    out.push(
      ...pointer,
      ...(useRawElements ? number(elements[i], Valtype[valtype]) : generate(scope, elements[i])),
      [ storeOp, 0, ...unsignedLEB128(offset) ],
      ...(!typed ? [] : [ // typed presumes !useRawElements
        ...pointer,
        ...getNodeType(scope, elements[i]),
        [ Opcodes.i32_store8, 0, ...unsignedLEB128(offset + ValtypeSize[itemType]) ]
      ])
    );
  }

  // local value as pointer
  out.push(...pointer);
  if (!intOut) out.push(Opcodes.i32_from_u);

  return [ out, pointer ];
};

const storeArray = (scope, array, index, element) => {
  if (!Array.isArray(element)) element = generate(scope, element);
  if (typeof index === 'number') index = number(index);

  const offset = localTmp(scope, '#storeArray_offset', Valtype.i32);

  return [
    // calculate offset
    ...index,
    Opcodes.i32_to_u,
    ...number(ValtypeSize[valtype] + 1, Valtype.i32),
    [ Opcodes.i32_mul ],

    ...array,
    Opcodes.i32_to_u,
    [ Opcodes.i32_add ],
    [ Opcodes.local_set, offset ],

    // store value
    [ Opcodes.local_get, offset ],
    ...generate(scope, element),
    [ Opcodes.store, 0, ValtypeSize.i32 ],

    // store type
    [ Opcodes.local_get, offset ],
    ...getNodeType(scope, element),
    [ Opcodes.i32_store8, 0, ValtypeSize.i32 + ValtypeSize[valtype] ]
  ];
};

const loadArray = (scope, array, index) => {
  if (typeof index === 'number') index = number(index);

  const offset = localTmp(scope, '#loadArray_offset', Valtype.i32);

  return [
    // calculate offset
    ...index,
    Opcodes.i32_to_u,
    ...number(ValtypeSize[valtype] + 1, Valtype.i32),
    [ Opcodes.i32_mul ],

    ...array,
    Opcodes.i32_to_u,
    [ Opcodes.i32_add ],
    [ Opcodes.local_set, offset ],

    // load value
    [ Opcodes.local_get, offset ],
    [ Opcodes.load, 0, ValtypeSize.i32 ],

    // load type
    [ Opcodes.local_get, offset ],
    [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 + ValtypeSize[valtype] ]
  ];
};

const byteStringable = str => {
  if (!Prefs.bytestring) return false;

  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0xFF) return false;
  }

  return true;
};

const makeString = (scope, str, global = false, name = '$undeclared', forceBytestring = undefined) => {
  const rawElements = new Array(str.length);
  let byteStringable = Prefs.bytestring;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    rawElements[i] = c;

    if (byteStringable && c > 0xFF) byteStringable = false;
  }

  if (byteStringable && forceBytestring === false) byteStringable = false;

  return makeArray(scope, {
    rawElements
  }, global, name, false, byteStringable ? 'i8' : 'i16')[0];
};

const generateArray = (scope, decl, global = false, name = '$undeclared', initEmpty = false) => {
  return makeArray(scope, decl, global, name, initEmpty, valtype, false, true)[0];
};

const toPropertyKey = (scope, i32Conv = false) => [
  [ Opcodes.call, ...unsignedLEB128(includeBuiltin(scope, '__ecma262_ToPropertyKey').index) ],
  ...(i32Conv ? [
    [ Opcodes.local_set, localTmp(scope, '#swap', Valtype.i32) ],
    Opcodes.i32_to_u,
    [ Opcodes.local_get, localTmp(scope, '#swap', Valtype.i32) ]
  ] : [])
];

const generateObject = (scope, decl, global = false, name = '$undeclared') => {
  const out = [
    [ Opcodes.call, ...unsignedLEB128(includeBuiltin(scope, '__Porffor_allocate').index) ]
  ];

  if (decl.properties.length > 0) {
    const tmp = localTmp(scope, `#objectexpr${randId()}`, Valtype.i32);
    out.push([ Opcodes.local_tee, tmp ]);

    for (const x of decl.properties) {
      const { method, shorthand, computed, kind, key, value } = x;
      if (kind !== 'init') return todo(scope, 'complex objects are not supported yet', true);

      let k = key;
      if (!computed && key.type !== 'Literal') k = {
        type: 'Literal',
        value: key.name
      };

      out.push(
        [ Opcodes.local_get, tmp ],
        ...number(TYPES.object, Valtype.i32),

        ...generate(scope, k),
        ...getNodeType(scope, k),
        ...toPropertyKey(scope, true),

        ...generate(scope, value),
        ...getNodeType(scope, value),

        [ Opcodes.call, ...unsignedLEB128(includeBuiltin(scope, '__Porffor_object_set').index) ],

        [ Opcodes.drop ],
        [ Opcodes.drop ]
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
    out[x] = [
      ...prelude,
      ...bc[x],
      ...postlude
    ];
  }

  return out;
};

const generateMember = (scope, decl, _global, _name) => {
  const name = decl.object.name;

  // hack: .name
  if (decl.property.name === 'name') {
    if (hasFuncWithName(name)) {
      let nameProp = name;

      // eg: __String_prototype_toLowerCase -> toLowerCase
      if (nameProp.startsWith('__')) nameProp = nameProp.split('_').pop();

      return withType(scope, makeString(scope, nameProp, _global, _name, true), TYPES.bytestring);
    } else {
      return withType(scope, number(0), TYPES.undefined);
    }
  }

  // hack: .length
  if (decl.property.name === 'length') {
    // todo: support optional

    const func = funcs.find(x => x.name === name);
    if (func) {
      const typedParams = !func.internal || builtinFuncs[name]?.typedParams;
      return withType(scope, number(typedParams ? Math.floor(func.params.length / 2) : (func.constr ? (func.params.length - 1) : func.params.length)), TYPES.number);
    }

    if (Object.hasOwn(builtinFuncs, name)) return withType(scope, number(builtinFuncs[name].typedParams ? Math.floor(builtinFuncs[name].params.length / 2) : (builtinFuncs[name].constr ? (builtinFuncs[name].params.length - 1) : builtinFuncs[name].params.length)), TYPES.number);
    if (Object.hasOwn(importedFuncs, name)) return withType(scope, number(importedFuncs[name].params.length ?? importedFuncs[name].params), TYPES.number);
    if (Object.hasOwn(internalConstrs, name)) return withType(scope, number(internalConstrs[name].length ?? 0), TYPES.number);

    const out = [
      ...generate(scope, decl.object),
      Opcodes.i32_to_u,
    ];

    if (Prefs.fastLength) {
      // presume valid length object
      return [
        ...out,

        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        Opcodes.i32_from_u
      ];
    }

    const type = getNodeType(scope, decl.object);
    const known = knownType(scope, type);
    if (known != null) {
      if (typeHasFlag(known, TYPE_FLAGS.length)) return [
        ...out,

        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        Opcodes.i32_from_u
      ];

      return number(0);
    }

    return [
      ...out,
      [ Opcodes.local_set, localTmp(scope, '#length_tmp', Valtype.i32) ],

      ...getNodeType(scope, decl.object),
      ...number(TYPE_FLAGS.length, Valtype.i32),
      [ Opcodes.i32_and ],
      [ Opcodes.if, valtypeBinary ],
        [ Opcodes.local_get, localTmp(scope, '#length_tmp', Valtype.i32) ],
        [ Opcodes.i32_load, Math.log2(ValtypeSize.i32) - 1, 0 ],
        Opcodes.i32_from_u,

        ...setLastType(scope, TYPES.number),
      [ Opcodes.else ],
        ...number(0),
        ...setLastType(scope, TYPES.undefined),
      [ Opcodes.end ]
    ];
  }

  // todo: generate this array procedurally during builtinFuncs creation
  if (['size', 'description', 'byteLength', 'byteOffset', 'buffer', 'detached', 'resizable', 'growable', 'maxByteLength'].includes(decl.property.name)) {
    // todo: support optional
    const bc = {};
    const cands = Object.keys(builtinFuncs).filter(x => x.startsWith('__') && x.endsWith('_prototype_' + decl.property.name + '$get'));

    if (cands.length > 0) {
      for (const x of cands) {
        const type = TYPES[x.split('_prototype_')[0].slice(2).toLowerCase()];
        if (type == null) continue;

        bc[type] = generateCall(scope, {
          callee: {
            type: 'Identifier',
            name: x
          },
          arguments: [ decl.object ],
          _protoInternalCall: true
        });
      }
    }

    return typeSwitch(scope, getNodeType(scope, decl.object), {
      ...bc,
      default: withType(scope, number(0), TYPES.undefined)
    }, valtypeBinary);
  }

  const object = decl.object;
  const property = decl.computed ? decl.property : {
    type: 'Literal',
    value: decl.property.name
  };

  // todo/perf: use i32 object (and prop?) locals
  const objectWasm = [ [ Opcodes.local_get, localTmp(scope, '#member_obj') ] ];
  const propertyWasm = [ [ Opcodes.local_get, localTmp(scope, '#member_prop') ] ];

  // // todo: we should only do this for strings but we don't know at compile-time :(
  // hack: this is naughty and will break things!
  let newOut = number(0, Valtype.i32), newPointer = number(0, Valtype.i32);

  const known = knownType(scope, getNodeType(scope, object));
  if ((known === TYPES.string || known === TYPES.bytestring) || (pages.hasAnyString && known == null)) {
    // todo: we use i16 even for bytestrings which should not make a bad thing happen, just be confusing for debugging?
    0, [ newOut, newPointer ] = makeArray(scope, {
      rawElements: new Array(0)
    }, _global, _name, true, 'i16', true);
  }

  const out = typeSwitch(scope, getNodeType(scope, object), {
    [TYPES.array]: [
      ...loadArray(scope, objectWasm, propertyWasm),
      ...setLastType(scope)
    ],

    [TYPES.string]: [
      // setup new/out array
      ...newOut,

      // set length to 1
      ...number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      // use as pointer for store later
      ...newPointer,

      ...propertyWasm,
      Opcodes.i32_to_u,

      ...number(ValtypeSize.i16, Valtype.i32),
      [ Opcodes.i32_mul ],

      ...objectWasm,
      Opcodes.i32_to_u,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load16_u, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store16, Math.log2(ValtypeSize.i16) - 1, ValtypeSize.i32 ],

      // return new string (page)
      ...newPointer,
      Opcodes.i32_from_u,
      ...setLastType(scope, TYPES.string)
    ],

    [TYPES.bytestring]: [
      // setup new/out array
      ...newOut,

      // set length to 1
      ...number(1, Valtype.i32),
      [ Opcodes.i32_store, 0, 0 ],

      // use as pointer for store later
      ...newPointer,

      ...propertyWasm,
      Opcodes.i32_to_u,

      ...objectWasm,
      Opcodes.i32_to_u,
      [ Opcodes.i32_add ],

      // load current string ind {arg}
      [ Opcodes.i32_load8_u, 0, ValtypeSize.i32 ],

      // store to new string ind 0
      [ Opcodes.i32_store8, 0, ValtypeSize.i32 ],

      // return new string (page)
      ...newPointer,
      Opcodes.i32_from_u,
      ...setLastType(scope, TYPES.bytestring)
    ],

    [TYPES.object]: [
      ...objectWasm,
      Opcodes.i32_to_u,
      ...getNodeType(scope, object),

      ...propertyWasm,
      ...getNodeType(scope, property),
      ...toPropertyKey(scope, true),

      [ Opcodes.call, ...unsignedLEB128(includeBuiltin(scope, '__Porffor_object_get').index) ],
      ...setLastType(scope)
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
        ...number(2, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load16_u, 0, 4 ],
        Opcodes.i32_from_u
      ],
      [TYPES.int16array]: [
        ...number(2, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load16_s, 0, 4 ],
        Opcodes.i32_from
      ],
      [TYPES.uint32array]: [
        ...number(4, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load, 0, 4 ],
        Opcodes.i32_from_u
      ],
      [TYPES.int32array]: [
        ...number(4, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.i32_load, 0, 4 ],
        Opcodes.i32_from
      ],
      [TYPES.float32array]: [
        ...number(4, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.f32_load, 0, 4 ],
        [ Opcodes.f64_promote_f32 ]
      ],
      [TYPES.float64array]: [
        ...number(8, Valtype.i32),
        [ Opcodes.i32_mul ],
        [ Opcodes.i32_add ],

        [ Opcodes.f64_load, 0, 4 ]
      ],
    }, {
      prelude: [
        ...objectWasm,
        Opcodes.i32_to_u,
        [ Opcodes.i32_load, 0, 4 ],

        ...propertyWasm,
        Opcodes.i32_to_u
      ],
      postlude: setLastType(scope, TYPES.number)
    }),

    default: internalThrow(scope, 'TypeError', 'Unsupported member expression object', true)
  });

  if (decl.optional) {
    out.unshift(
      [ Opcodes.block, valtypeBinary ],
      ...generate(scope, object),
      [ Opcodes.local_tee, localTmp(scope, '#member_obj') ],

      ...nullish(scope, [], getNodeType(scope, object), false, true),
      [ Opcodes.if, Blocktype.void ],
      ...setLastType(scope, TYPES.undefined),
      ...number(0),
      [ Opcodes.br, 1 ],
      [ Opcodes.end ],

      ...generate(scope, property, false, '#member_prop'),
      [ Opcodes.local_set, localTmp(scope, '#member_prop') ]
    );

    out.push(
      [ Opcodes.end ]
    );
  } else {
    out.unshift(
      ...generate(scope, object),
      [ Opcodes.local_set, localTmp(scope, '#member_obj') ],

      ...generate(scope, property, false, '#member_prop'),
      [ Opcodes.local_set, localTmp(scope, '#member_prop') ]
    );
  }

  return out;
};

const randId = () => Math.random().toString(16).slice(1, -2).padEnd(12, '0');

let objectHackers = [];
const objectHack = node => {
  if (!node) return node;

  if (node.type === 'MemberExpression') {
    const out = (() => {
      if (node.computed || node.optional) return;

      // hack: block these properties as they can be accessed on functions
      if (node.property.name == "length" || node.property.name == "name") return;

      let objectName = node.object.name;

      // if object is not identifier or another member exp, give up
      if (node.object.type !== 'Identifier' && node.object.type !== 'MemberExpression') return;
      if (objectName && ['undefined', 'null', 'NaN', 'Infinity'].includes(objectName)) return;

      if (!objectName) objectName = objectHack(node.object)?.name?.slice?.(2);
      if (!objectName || (!objectHackers.includes(objectName) && !objectHackers.some(x => objectName.startsWith(`${x}_`)))) {
        return;
      }

      const name = '__' + objectName + '_' + node.property.name;
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
      if (Array.isArray(node[x])) node[x] = node[x].map(y => objectHack(y));
    }
  }

  return node;
};

const generateFunc = (scope, decl) => {
  if (decl.async) return todo(scope, 'async functions are not supported');
  if (decl.generator) return todo(scope, 'generator functions are not supported');

  const name = decl.id ? decl.id.name : `anonymous${randId()}`;
  const params = decl.params ?? [];

  // TODO: share scope/locals between !!!
  const func = {
    locals: {},
    localInd: 0,
    // value, type
    returns: [ valtypeBinary, Valtype.i32 ],
    throws: false,
    name,
    index: currentFuncIndex++
  };

  funcIndex[name] = func.index;
  funcs.push(func);

  if (typedInput && decl.returnType) {
    const { type } = extractTypeAnnotation(decl.returnType);
    if (type != null && !Prefs.indirectCalls) {
    // if (type != null) {
      func.returnType = type;
      func.returns = [ valtypeBinary ];
    }
  }

  const defaultValues = {};
  for (let i = 0; i < params.length; i++) {
    let name;
    const x = params[i];
    switch (x.type) {
      case 'Identifier': {
        name = x.name;
        break;
      }

      case 'AssignmentPattern': {
        name = x.left.name;
        defaultValues[name] = x.right;
        break;
      }

      case 'RestElement': {
        name = x.argument.name;
        func.hasRestArgument = true;
        break;
      }
    }

    // if (name == null) return todo('non-identifier args are not supported');

    allocVar(func, name, false);
    if (typedInput && params[i].typeAnnotation) {
      addVarMetadata(func, name, false, extractTypeAnnotation(params[i]));
    }
  }

  func.params = Object.values(func.locals).map(x => x.type);

  let body = objectHack(decl.body);
  if (decl.type === 'ArrowFunctionExpression' && decl.expression) {
    // hack: () => 0 -> () => return 0
    body = {
      type: 'ReturnStatement',
      argument: decl.body
    };
  }

  const prelude = [];
  for (const x in defaultValues) {
    prelude.push(
      ...getType(func, x),
      ...number(TYPES.undefined, Valtype.i32),
      [ Opcodes.i32_eq ],
      [ Opcodes.if, Blocktype.void ],
        ...generate(func, defaultValues[x], false, x),
        [ Opcodes.local_set, func.locals[x].idx ],

        ...setType(func, x, getNodeType(func, defaultValues[x])),
      [ Opcodes.end ]
    );
  }

  const wasm = func.wasm = prelude.concat(generate(func, body));

  if (name === 'main') func.gotLastType = true;

  // add end return if not found
  if (name !== 'main' && wasm[wasm.length - 1]?.[0] !== Opcodes.return && countLeftover(wasm) === 0) {
    wasm.push(
      ...number(0),
      ...(func.returnType != null ? [] : number(TYPES.undefined, Valtype.i32)),
      [ Opcodes.return ]
    );
  }

  return func;
};

const generateCode = (scope, decl) => {
  let out = [];

  for (const x of decl.body) {
    out = out.concat(generate(scope, x));
  }

  return out;
};

const internalConstrs = {
  Array: {
    generate: (scope, decl, global, name) => {
      // new Array(i0, i1, ...)
      if (decl.arguments.length > 1) return generateArray(scope, {
        elements: decl.arguments
      }, global, name);

      // new Array(n)
      const [ out, pointer ] = makeArray(scope, {
        rawElements: new Array(0)
      }, global, name, true, undefined, true, true);

      const arg = decl.arguments[0] ?? DEFAULT_VALUE;

      // todo: check in wasm instead of here
      const literalValue = arg.value ?? 0;
      if (literalValue < 0 || !Number.isFinite(literalValue) || literalValue > 4294967295) return internalThrow(scope, 'RangeError', 'Invalid array length', true);

      return [
        ...out,
        ...generate(scope, arg, global, name),
        Opcodes.i32_to_u,
        [ Opcodes.i32_store, Math.log2(ValtypeSize.i32) - 1, 0 ],

        ...pointer,
        Opcodes.i32_from_u
      ];
    },
    type: TYPES.array,
    length: 1
  },

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

  Boolean: {
    generate: (scope, decl) => {
      // todo: boolean object when used as constructor
      const arg = decl.arguments[0] ?? DEFAULT_VALUE;
      return truthy(scope, generate(scope, arg), getNodeType(scope, arg), false, false, 'full');
    },
    type: TYPES.boolean,
    length: 1
  },

  __Math_max: {
    generate: (scope, decl) => {
      const out = [
        ...number(-Infinity)
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
        ...number(Infinity)
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

  printStatic: {
    generate: (scope, decl) => {
      const str = decl.arguments[0].value;
      return printStaticStr(str);
    },
    type: TYPES.undefined,
    notConstr: true,
    length: 1
  }
};

export default program => {
  globals = {
    ['#ind']: 0
  };
  tags = [];
  exceptions = [];
  funcs = [];
  funcIndex = {};
  depth = [];
  pages = new Map();
  data = [];
  currentFuncIndex = importedFuncs.length;

  const valtypeInd = ['i32', 'i64', 'f64'].indexOf(valtype);

  // set generic opcodes for current valtype
  Opcodes.const = [ Opcodes.i32_const, Opcodes.i64_const, Opcodes.f64_const ][valtypeInd];
  Opcodes.eq = [ Opcodes.i32_eq, Opcodes.i64_eq, Opcodes.f64_eq ][valtypeInd];
  Opcodes.eqz = [ [ [ Opcodes.i32_eqz ] ], [ [ Opcodes.i64_eqz ] ], [ ...number(0), [ Opcodes.f64_eq ] ] ][valtypeInd];
  Opcodes.mul = [ Opcodes.i32_mul, Opcodes.i64_mul, Opcodes.f64_mul ][valtypeInd];
  Opcodes.add = [ Opcodes.i32_add, Opcodes.i64_add, Opcodes.f64_add ][valtypeInd];
  Opcodes.sub = [ Opcodes.i32_sub, Opcodes.i64_sub, Opcodes.f64_sub ][valtypeInd];

  Opcodes.i32_to = [ [], [ Opcodes.i32_wrap_i64 ], Opcodes.i32_trunc_sat_f64_s ][valtypeInd];
  Opcodes.i32_to_u = [ [], [ Opcodes.i32_wrap_i64 ], Opcodes.i32_trunc_sat_f64_u ][valtypeInd];
  Opcodes.i32_from = [ [], [ Opcodes.i64_extend_i32_s ], [ Opcodes.f64_convert_i32_s ] ][valtypeInd];
  Opcodes.i32_from_u = [ [], [ Opcodes.i64_extend_i32_u ], [ Opcodes.f64_convert_i32_u ] ][valtypeInd];

  Opcodes.load = [ Opcodes.i32_load, Opcodes.i64_load, Opcodes.f64_load ][valtypeInd];
  Opcodes.store = [ Opcodes.i32_store, Opcodes.i64_store, Opcodes.f64_store ][valtypeInd];

  Opcodes.lt = [ Opcodes.i32_lt_s, Opcodes.i64_lt_s, Opcodes.f64_lt ][valtypeInd];

  builtinFuncs = new BuiltinFuncs();
  builtinVars = new BuiltinVars();
  prototypeFuncs = new PrototypeFuncs();
  allocator = makeAllocator(Prefs.allocator ?? 'static');

  const getObjectName = x => x.startsWith('__') && x.slice(2, x.indexOf('_', 2));
  objectHackers = ['assert', 'compareArray', 'Test262Error', ...new Set(Object.keys(builtinFuncs).map(getObjectName).concat(Object.keys(builtinVars).map(getObjectName)).filter(x => x))];

  program.id = { name: 'main' };

  const scope = {
    locals: {},
    localInd: 0
  };

  program.body = {
    type: 'BlockStatement',
    body: program.body
  };

  if (Prefs.astLog) console.log(JSON.stringify(program.body.body, null, 2));

  const main = generateFunc(scope, program);

  main.export = true;
  main.returns = [ valtypeBinary, Valtype.i32 ];

  const lastInst = main.wasm[main.wasm.length - 1] ?? [ Opcodes.end ];
  if (lastInst[0] === Opcodes.drop) {
    main.wasm.splice(main.wasm.length - 1, 1);

    const finalStatement = program.body.body[program.body.body.length - 1];
    main.wasm.push(...getNodeType(main, finalStatement));
  }

  if (lastInst[0] === Opcodes.end || lastInst[0] === Opcodes.local_set || lastInst[0] === Opcodes.global_set) {
    if (lastInst[0] === Opcodes.local_set && lastInst[1] === main.locals['#last_type'].idx) {
      main.wasm.splice(main.wasm.length - 1, 1);
    } else {
      main.returns = [];
    }
  }

  if (lastInst[0] === Opcodes.call) {
    const func = funcs.find(x => x.index === lastInst[1]);
    if (func) main.returns = func.returns.slice();
      else main.returns = [];
  }

  delete globals['#ind'];

  // if blank main func and other exports, remove it
  if (main.wasm.length === 0 && funcs.reduce((acc, x) => acc + (x.export ? 1 : 0), 0) > 1) funcs.splice(main.index - importedFuncs.length, 1);

  return { funcs, globals, tags, exceptions, pages, data };
};