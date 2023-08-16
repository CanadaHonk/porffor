import { read_ieee754_binary64, read_signedLEB128 } from './encoding.js';
import { Blocktype, Opcodes, Valtype } from './wasmSpec.js';
import { operatorOpcode } from './expression.js';

const CValtype = {
  i8: 'char',
  i16: 'unsigned short', // presume all i16 stuff is unsigned
  i32: 'long',
  i32_u: 'unsigned long',
  i64: 'long long',
  i64_u: 'unsigned long long',

  f32: 'float',
  f64: 'double',

  undefined: 'void'
};

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
const invOpcodes = inv(Opcodes);

for (const x in CValtype) {
  if (Valtype[x]) CValtype[Valtype[x]] = CValtype[x];
}

const todo = msg => {
  class TodoError extends Error {
    constructor(message) {
      super(message);
      this.name = 'TodoError';
    }
  }

  throw new TodoError(`todo: ${msg}`);
};

export default ({ funcs, globals, tags, exceptions, pages }) => {
  const invOperatorOpcode = inv(operatorOpcode[valtype]);
  const invGlobals = inv(globals, x => x.idx);

  const includes = new Map();
  let out = '';

  for (const x in globals) {
    const g = globals[x];

    out += `${CValtype[g.type]} ${x}`;
    if (x.init) out += ` ${x.init}`;
    out += ';\n';
  }

  for (const [ x, p ] of pages) {
    out += `${CValtype[p.type]} ${x.replace(': ', '_').replace(/[^0-9a-zA-Z_]/g, '')}[100]`;
    out += ';\n';
  }

  if (out) out += '\n';

  for (const f of funcs) {
    const invLocals = inv(f.locals, x => x.idx);
    if (f.returns.length > 1) todo('funcs returning >1 value unsupported');

    const sanitize = str => str.replace(/[^0-9a-zA-Z_]/g, _ => String.fromCharCode(97 + _.charCodeAt(0) % 32));

    const returns = f.returns.length === 1;

    const shouldInline = ['f64_%'].includes(f.name);
    out += `${f.name === 'main' ? 'int' : CValtype[f.returns[0]]} ${shouldInline ? 'inline ' : ''}${sanitize(f.name)}(${f.params.map((x, i) => `${CValtype[x]} ${invLocals[i]}`).join(', ')}) {\n`;

    let depth = 1;
    const line = (str, semi = true) => out += `${' '.repeat(depth * 2)}${str}${semi ? ';' : ''}\n`;

    const localKeys = Object.keys(f.locals).sort((a, b) => f.locals[a].idx - f.locals[b].idx).slice(f.params.length).sort((a, b) => f.locals[a].idx - f.locals[b].idx);
    for (const x of localKeys) {
      const l = f.locals[x];
      line(`${CValtype[l.type]} ${x}`);
    }

    if (localKeys.length !== 0) out += '\n';

    let vals = [];
    const endNeedsCurly = [], ignoreEnd = [];
    let beginLoop = false, lastCond = false, ifTernary = false;
    for (let _ = 0; _ < f.wasm.length; _++) {
      const i = f.wasm[_];

      if (invOperatorOpcode[i[0]]) {
        const b = vals.pop();
        const a = vals.pop();

        let op = invOperatorOpcode[i[0]];
        if (op.length === 3) op = op.slice(0, 2);

        if (['==', '!=', '>', '>=', '<', '<='].includes(op)) lastCond = true;
          else lastCond = false;

        vals.push(`${a} ${op} ${b}`);
        continue;
      }

      // misc insts
      if (i[0] === 0xfc) {
        switch (i[1]) {
          // i32_trunc_sat_f64_s
          case 0x02:
            vals.push(`(${CValtype.i32})${vals.pop()}`);
            break;

          // i32_trunc_sat_f64_u
          case 0x03:
            vals.push(`(${CValtype.i32})(${CValtype.i32_u})${vals.pop()}`);
            break;
        }

        lastCond = false;
        continue;
      }

      switch (i[0]) {
        case Opcodes.i32_const:
          vals.push(read_signedLEB128(i.slice(1)).toString());
          break;

        case Opcodes.f64_const:
          vals.push(read_ieee754_binary64(i.slice(1)).toExponential());
          break;

        case Opcodes.local_get:
          vals.push(`${invLocals[i[1]]}`);
          break;

        case Opcodes.local_set:
          line(`${invLocals[i[1]]} = ${vals.pop()}`);
          break;

        case Opcodes.local_tee:
          vals.push(`${invLocals[i[1]]} = ${vals.pop()}`);
          break;

        case Opcodes.f64_trunc:
          // vals.push(`trunc(${vals.pop()})`);
          vals.push(`(int)(${vals.pop()})`); // this is ~10x faster with clang. what the fuck.
          break;

        case Opcodes.return:
          line(`return${returns ? ` ${vals.pop()}` : ''}`);
          break;

        case Opcodes.if:
          let cond = vals.pop();
          if (!lastCond) {
            if (cond.startsWith('(long)')) cond = `${cond.slice(6)} == 1e+0`;
              else cond += ' == 1';
          }

          ifTernary = i[1] !== Blocktype.void;
          if (ifTernary) {
            ifTernary = cond;
            break;
          }

          if (beginLoop) {
            beginLoop = false;
            line(`while (${cond}) {`, false);

            depth++;
            endNeedsCurly.push(true);
            ignoreEnd.push(false, true);
            break;
          }

          line(`if (${cond}) {`, false);

          depth++;
          endNeedsCurly.push(true);
          ignoreEnd.push(false);
          break;

        case Opcodes.else:
          if (ifTernary) break;

          depth--;
          line(`} else {`, false);
          depth++;
          break;

        case Opcodes.loop:
          // not doing properly, fake a while loop
          beginLoop = true;
          break;

        case Opcodes.end:
          if (ignoreEnd.pop()) break;

          if (ifTernary) {
            const b = vals.pop();
            const a = vals.pop();
            vals.push(`${ifTernary} ? ${a} : ${b}`);
            break;
          }

          depth--;
          if (endNeedsCurly.pop() === true) line('}', false);
          break;

        case Opcodes.call:
          let func = funcs.find(x => x.index === i[1]);
          if (!func) {
            const importFunc = importFuncs[i[1]];
            switch (importFunc.name) {
              case 'print':
                line(`printf("%f\\n", ${vals.pop()})`);
                includes.set('stdio.h', true);
                break;
            }
            break;
          }

          let args = [];
          for (let j = 0; j < func.params.length; j++) args.unshift(vals.pop());

          if (func.returns.length === 1) vals.push(`${sanitize(func.name)}(${args.join(', ')})`)
            else line(`${sanitize(func.name)}(${args.join(', ')})`);

          break;

        case Opcodes.drop:
          line(vals.pop());
          break;

        case Opcodes.br:
          // ignore
          // reset "stack"
          vals = [];
          break;

        default:
          log('2c', `unimplemented op: ${invOpcodes[i[0]]}`);
          // todo(`unimplemented op: ${invOpcodes[i[0]]}`);
      }

      lastCond = false;
    }

    if (vals.length === 1 && returns) {
      line(`return ${vals.pop()}`);
    }

    out += '}\n\n';
  }

  out = [...includes.keys()].map(x => `#include <${x}>`).join('\n') + '\n\n' + out;

  return out;
};