import { read_ieee754_binary64, read_signedLEB128 } from './encoding.js';
import { Blocktype, Opcodes, Valtype } from './wasmSpec.js';
import { operatorOpcode } from './expression.js';
import { log } from "./log.js";

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

const removeBrackets = str => str.startsWith('(') && str.endsWith(')') ? str.slice(1, -1) : str;

export default ({ funcs, globals, tags, exceptions, pages }) => {
  const invOperatorOpcode = Object.values(operatorOpcode).reduce((acc, x) => {
    for (const k in x) {
      acc[x[k]] = k;
    }
    return acc;
  }, {});
  const invGlobals = inv(globals, x => x.idx);

  const sanitize = str => str.replace(/[^0-9a-zA-Z_]/g, _ => String.fromCharCode(97 + _.charCodeAt(0) % 32));

  for (const x in invGlobals) {
    invGlobals[x] = sanitize(invGlobals[x]);
  }

  const includes = new Map(), unixIncludes = new Map(), winIncludes = new Map();

  // TODO: make type i16
  let out = `struct ReturnValue {
  ${CValtype.f64} value;
  ${CValtype.i32} type;
};\n\n`;

  for (const x in globals) {
    const g = globals[x];

    out += `${CValtype[g.type]} ${sanitize(x)} = ${g.init ?? 0}`;
    out += ';\n';
  }

  // for (const [ x, p ] of pages) {
    // out += `${CValtype[p.type]} ${x.replace(': ', '_').replace(/[^0-9a-zA-Z_]/g, '')}[100]`;
    // out += ';\n';
  // }

  if (out) out += '\n';

  let depth = 1;
  const line = (str, semi = true) => out += `${' '.repeat(depth * 2)}${str}${semi ? ';' : ''}\n`;
  const lines = lines => {
    for (const x of lines) {
      out += `${' '.repeat(depth * 2)}${x}\n`;
    }
  };

  const platformSpecific = (win, unix, add = true) => {
    let tmp = '';

    if (win) {
      if (add) out += '#ifdef _WIN32\n';
        else tmp += '#ifdef _WIN32\n';

      if (add) lines(win.split('\n'));
        else tmp += win + (win.endsWith('\n') ? '' : '\n');
    }

    if (unix) {
      if (add) out += (win ? '#else' : '#ifndef _WIN32') + '\n';
        else tmp += (win ? '#else' : '#ifndef _WIN32') + '\n';

      if (add) lines(unix.split('\n'));
        else tmp += unix + (unix.endsWith('\n') ? '' : '\n');
    }

    if (win || unix)
      if (add) out += '#endif\n';
        else tmp += '#endif\n';

    return tmp;
  };

  for (const f of funcs) {
    depth = 1;

    const invLocals = inv(f.locals, x => x.idx);
    // if (f.returns.length > 1) todo('funcs returning >1 value unsupported');

    for (const x in invLocals) {
      invLocals[x] = sanitize(invLocals[x]);
    }

    const returns = f.returns.length > 0;

    const shouldInline = f.internal;
    out += `${f.name === 'main' ? 'int' : (f.internal ? 'double' : 'struct ReturnValue')} ${shouldInline ? 'inline ' : ''}${sanitize(f.name)}(${f.params.map((x, i) => `${CValtype[x]} ${invLocals[i]}`).join(', ')}) {\n`;

    const localKeys = Object.keys(f.locals).sort((a, b) => f.locals[a].idx - f.locals[b].idx).slice(f.params.length).sort((a, b) => f.locals[a].idx - f.locals[b].idx);
    for (const x of localKeys) {
      const l = f.locals[x];
      line(`${CValtype[l.type]} ${sanitize(x)} = 0`);
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

        // vals.push(`(${removeBrackets(a)} ${op} ${b})`);
        vals.push(`(${a} ${op} ${b})`);
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
        case Opcodes.i64_const:
          vals.push(read_signedLEB128(i.slice(1)).toString());
          break;

        case Opcodes.f64_const:
          vals.push(read_ieee754_binary64(i.slice(1)).toExponential());
          break;

        case Opcodes.local_get:
          vals.push(`${invLocals[i[1]]}`);
          break;

        case Opcodes.local_set:
          line(`${invLocals[i[1]]} = ${removeBrackets(vals.pop())}`);
          break;

        case Opcodes.local_tee:
          // line(`${invLocals[i[1]]} = ${removeBrackets(vals.pop())}`);
          // vals.push(`${invLocals[i[1]]}`);
          vals.push(`((${invLocals[i[1]]} = ${vals.pop()}))`);
          break;

        case Opcodes.global_get:
          vals.push(`${invGlobals[i[1]]}`);
          break;

        case Opcodes.global_set:
          line(`${invGlobals[i[1]]} = ${removeBrackets(vals.pop())}`);
          break;

        case Opcodes.f64_trunc:
          // vals.push(`trunc(${vals.pop()})`);
          vals.push(`(int)(${removeBrackets(vals.pop())})`); // this is ~10x faster with clang??
          break;

        case Opcodes.f64_convert_i32_u:
        case Opcodes.f64_convert_i32_s:
        case Opcodes.f64_convert_i64_u:
        case Opcodes.f64_convert_i64_s:
          // int to double
          vals.push(`(double)${vals.pop()}`);
          break;

        case Opcodes.return:
          // line(`return${returns ? ` ${removeBrackets(vals.pop())}` : ''}`);
          line(`return${returns ? ` (struct ReturnValue){ ${removeBrackets(vals.pop())}, ${removeBrackets(vals.pop())} }` : ''}`);
          break;

        case Opcodes.if:
          let cond = removeBrackets(vals.pop());
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
              case 'printChar':
                line(`printf("%c", (int)(${vals.pop()}))`);
                includes.set('stdio.h', true);
                break;

              case 'time':
                line(`double _time_out`);
                /* platformSpecific(
`FILETIME _time_filetime;
GetSystemTimeAsFileTime(&_time_filetime);

ULARGE_INTEGER _time_ularge;
_time_ularge.LowPart = _time_filetime.dwLowDateTime;
_time_ularge.HighPart = _time_filetime.dwHighDateTime;
_time_out = (_time_ularge.QuadPart - 116444736000000000i64) / 10000.;`,
`struct timespec _time;
clock_gettime(CLOCK_MONOTONIC, &_time);
_time_out = _time.tv_nsec / 1000000.;`); */
                platformSpecific(
`LARGE_INTEGER _time_freq, _time_t;
QueryPerformanceFrequency(&_time_freq);
QueryPerformanceCounter(&_time_t);
_time_out = ((double)_time_t.QuadPart / _time_freq.QuadPart) * 1000.;`,
`struct timespec _time;
clock_gettime(CLOCK_MONOTONIC, &_time);
_time_out = _time.tv_nsec / 1000000. + _time.tv_sec * 1000.;`);
                vals.push(`_time_out`);

                unixIncludes.set('time.h', true);
                winIncludes.set('windows.h', true);
                break;

              default:
                log.warning('2c', `unimplemented import: ${importFunc.name}`);
                break;
            }

            break;
          }

          let args = [];
          for (let j = 0; j < func.params.length; j++) args.unshift(removeBrackets(vals.pop()));

          if (func.returns.length > 0) {
            if (func.internal) {
              vals.push(`${sanitize(func.name)}(${args.join(', ')})`);
            } else {
              line(`const struct ReturnValue _ = ${sanitize(func.name)}(${args.join(', ')})`);
              vals.push(`_.value`);
              vals.push(`_.type`);
            }
          } else line(`${sanitize(func.name)}(${args.join(', ')})`);

          break;

        case Opcodes.drop:
          // line(vals.pop());
          vals.pop();
          break;

        case Opcodes.br:
          // ignore
          // reset "stack"
          vals = [];
          break;

        default:
          log.warning('2c', `unimplemented op: ${invOpcodes[i[0]]}`);
          // todo(`unimplemented op: ${invOpcodes[i[0]]}`);
      }

      lastCond = false;
    }

    if (vals.length === 1 && returns) {
      line(`return ${vals.pop()}`);
    }

    out += '}\n\n';
  }

  depth = 0;

  const makeIncludes = includes => [...includes.keys()].map(x => `#include <${x}>\n`).join('');

  out = platformSpecific(makeIncludes(winIncludes), makeIncludes(unixIncludes), false) + '\n' + makeIncludes(includes) + '\n' + out;

  return out;
};