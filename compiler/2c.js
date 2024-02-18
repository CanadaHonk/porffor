import { read_ieee754_binary64, read_signedLEB128, read_unsignedLEB128 } from './encoding.js';
import { Blocktype, Opcodes, Valtype } from './wasmSpec.js';
import { operatorOpcode } from './expression.js';
import { log } from "./log.js";

const CValtype = {
  i8: 'i8',
  i16: 'i16',
  i32: 'i32',
  u32: 'u32',
  i64: 'i64',
  u64: 'u64',

  f32: 'f32',
  f64: 'f64',

  undefined: 'void'
};

const alwaysPreface = `typedef unsigned char i8;
typedef unsigned short i16;
typedef long i32;
typedef unsigned long u32;
typedef long long i64;
typedef unsigned long long u64;
typedef float f32;
typedef double f64;

f64 NAN = 0e+0/0e+0;

struct ReturnValue {
  ${CValtype.f64} value;
  ${CValtype.i32} type;
};
\n`;

// todo: is memcpy/etc safe with host endianness?

// all:
// immediates: ['align', 'offset']
const CMemFuncs = {
  [Opcodes.i32_store]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: [CValtype.i32, CValtype.i32],
    returns: false
  },
  [Opcodes.i32_store16]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: [CValtype.i32, CValtype.i16],
    returns: false
  },
  [Opcodes.i32_store8]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: [CValtype.i32, CValtype.i8],
    returns: false
  },

  [Opcodes.i32_load]: {
    c: `${CValtype.i32} out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: [CValtype.i32],
    returns: CValtype.i32
  },
  [Opcodes.i32_load16_u]: {
    c: `${CValtype.i16} out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: [CValtype.i32],
    returns: CValtype.i32
  },
  [Opcodes.i32_load8_u]: {
    c: `${CValtype.i8} out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: [CValtype.i32],
    returns: CValtype.i32
  },

  [Opcodes.f64_store]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: [CValtype.i32, CValtype.f64],
    returns: false
  },
  [Opcodes.f64_load]: {
    c: `${CValtype.f64} out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: [CValtype.i32],
    returns: CValtype.f64
  },
};

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
const invOpcodes = inv(Opcodes);
const invValtype = inv(Valtype);

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

const removeBrackets = str => {
  // return str;
  // if (str.startsWith(`(${CValtype.i32})(${CValtype.u32})`)) return `(${CValtype.i32})(${CValtype.u32})(` + removeBrackets(str.slice(22, -1)) + ')';

  for (const x in CValtype) {
    const p = `(${x})`;
    if (str.startsWith(p)) return p + removeBrackets(str.slice(p.length));
  }

  return str.startsWith('(') && str.endsWith(')') ? str.slice(1, -1) : str;
};

export default ({ funcs, globals, tags, data, exceptions, pages }) => {
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
  const prepend = new Map(), prependMain = new Map();

  // presume all <i32 work is unsigned
  let out = ``;

  for (const x in globals) {
    const g = globals[x];

    out += `${CValtype[g.type]} ${sanitize(x)} = ${g.init ?? 0}`;
    out += ';\n';
  }

  if (pages.size > 0) {
    prepend.set('_memory', `char _memory[${pages.size * pageSize}];\n`);
    includes.set('string.h', true);
  }

  if (data.length > 0) {
    prependMain.set('_data', data.map(x => `memcpy(_memory + ${x.offset}, (char[]){${x.bytes.join(',')}}, ${x.bytes.length});`).join('\n'));
  }

  // for (const [ x, p ] of pages) {
    // out += `${CValtype[p.type]} ${x.replace(': ', '_').replace(/[^0-9a-zA-Z_]/g, '')}[100]`;
    // out += ';\n';
  // }

  if (out) out += '\n';

  let depth = 1;
  let brDepth = 0;
  const line = (str, semi = true) => out += `${' '.repeat(depth * 2 + brDepth * 2)}${str}${semi ? ';' : ''}\n`;
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

  let brId = 0;

  for (const f of funcs) {
    depth = 1;

    const invLocals = inv(f.locals, x => x.idx);
    // if (f.returns.length > 1) todo('funcs returning >1 value unsupported');

    for (const x in invLocals) {
      invLocals[x] = sanitize(invLocals[x]);
    }

    const returns = f.returns.length > 0;

    const shouldInline = f.internal;
    out += `${f.name === 'main' ? 'int' : (f.internal ? (returns ? CValtype.f64 : 'void') : 'struct ReturnValue')} ${shouldInline ? 'inline ' : ''}${sanitize(f.name)}(${f.params.map((x, i) => `${CValtype[x]} ${invLocals[i]}`).join(', ')}) {\n`;

    if (f.name === 'main') {
      out += [...prependMain.values()].join('\n');
      if (prependMain.size > 0) out += '\n\n';
    }

    const localKeys = Object.keys(f.locals).sort((a, b) => f.locals[a].idx - f.locals[b].idx).slice(f.params.length).sort((a, b) => f.locals[a].idx - f.locals[b].idx);
    for (const x of localKeys) {
      const l = f.locals[x];
      line(`${CValtype[l.type]} ${sanitize(x)} = 0`);
    }

    if (localKeys.length !== 0) out += '\n';

    const rets = [];
    const runOnEnd = [];

    let vals = [];
    const endNeedsCurly = [];
    const brs = [];
    let lastCond = false;

    // let brDepth = 0;

    const blockStart = (i, loop) => {
      // reset "stack"
      // vals = [];

      rets.push(i[1]);

      const br = brId++;
      brs.push(br);
      if (loop) {
        line(`j${br}:;`, false);
        runOnEnd.push(null);
      } else {
        runOnEnd.push(() => line(`j${br}:;`, false));
      }

      if (i[1] !== Blocktype.void) line(`${CValtype[i[1]]} _r${br}`);

      brDepth++;
    };

    const highlight = i => {
      const surrounding = 6;

      const decomp = decompile(f.wasm.slice(i - surrounding, i + surrounding + 1), '', 0, f.locals, f.params, f.returns, funcs, globals, exceptions).slice(0, -1).split('\n');

      const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');
      let longest = 0;
      for (let j = 0; j < decomp.length; j++) {
        longest = Math.max(longest, noAnsi(decomp[j]).length);
      }

      const middle = Math.floor(decomp.length / 2);
      decomp[middle] = `\x1B[47m\x1B[30m${noAnsi(decomp[middle])}${'\u00a0'.repeat(longest - noAnsi(decomp[middle]).length)}\x1B[0m`;

      console.log('\x1B[90m...\x1B[0m');
      console.log(decomp.join('\n'));
      console.log('\x1B[90m...\x1B[0m\n');
    };

    for (let _ = 0; _ < f.wasm.length; _++) {
      const i = f.wasm[_];
      if (!i || !i[0]) continue;

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
            vals.push(`(${CValtype.i32})(${vals.pop()})`);
            break;

          // i32_trunc_sat_f64_u
          case 0x03:
            vals.push(`(${CValtype.u32})(${vals.pop()})`);
            break;
        }

        lastCond = false;
        continue;
      }

      switch (i[0]) {
        case Opcodes.i32_const:
        case Opcodes.i64_const:
          // vals.push(read_signedLEB128(i.slice(1)).toString());
          vals.push(new String(read_signedLEB128(i.slice(1)).toString()));
          vals.at(-1).offset = _;
          break;

        case Opcodes.f64_const: {
          // const val = read_ieee754_binary64(i.slice(1)).toExponential();
          const val = new String(read_ieee754_binary64(i.slice(1)).toExponential());
          // vals.push(val == 'NaN' ? 'NAN' : val);
          vals.push(val == 'NaN' ? new String('NAN') : val);
          vals.at(-1).offset = _;
          break;
        }

        case Opcodes.local_get:
          vals.push(`${invLocals[i[1]]}`);
          break;

        case Opcodes.local_set:
          line(`${invLocals[i[1]]} = ${removeBrackets(vals.pop())}`);
          break;

        case Opcodes.local_tee:
          line(`${invLocals[i[1]]} = ${removeBrackets(vals.pop())}`);
          vals.push(`${invLocals[i[1]]}`);
          // vals.push(`((${invLocals[i[1]]} = ${vals.pop()}))`);
          break;

        case Opcodes.global_get:
          vals.push(`${invGlobals[i[1]]}`);
          break;

        case Opcodes.global_set:
          line(`${invGlobals[i[1]]} = ${removeBrackets(vals.pop())}`);
          break;

        case Opcodes.f64_trunc:
          // vals.push(`trunc(${vals.pop()})`);
          vals.push(`(${CValtype.i32})(${removeBrackets(vals.pop())})`); // this is ~10x faster with clang??
          break;

        case Opcodes.f64_convert_i32_u:
        case Opcodes.f64_convert_i32_s:
        case Opcodes.f64_convert_i64_u:
        case Opcodes.f64_convert_i64_s:
          // int to f64
          vals.push(`(${CValtype.f64})(${removeBrackets(vals.pop())})`);
          break;

        case Opcodes.i32_eqz:
          if (lastCond) {
            vals.push(`!(${removeBrackets(vals.pop())})`);
          } else {
            let cond = '(' + removeBrackets(vals.pop());
            if (cond.startsWith(`(${CValtype.i32})`)) cond = `${cond.slice(`(${CValtype.i32})`.length)}) == 0e+0`;
              else cond += ') == 0';
            vals.push(cond);
          }
          lastCond = true;
          continue;

        case Opcodes.return:
          // line(`return${returns ? ` ${removeBrackets(vals.pop())}` : ''}`);
          line(`return${returns ? ` (struct ReturnValue){ ${removeBrackets(vals.pop())}, ${removeBrackets(vals.pop())} }` : ''}`);
          break;

        case Opcodes.if: {
          let cond = removeBrackets(vals.pop());
          if (!lastCond) {
            if (cond.startsWith(`(${CValtype.i32})`)) cond = `(${cond.slice(`(${CValtype.i32})`.length)}) != 0e+0`;
              else cond = `(${cond}) != 0`;
          }

          line(`// if ${invValtype[i[1]] ?? ''}`, false);
          blockStart(i, false);

          line(`if (${cond}) {`, false);

          depth++;
          endNeedsCurly.push(true);
          break;
        }

        case Opcodes.else: {
          const br = brs.at(-1);
          const ret = rets.at(-1);
          if (ret && ret !== Blocktype.void) {
            // console.log(vals, ret);
            // console.log(decompile(f.wasm.slice(_ - 5, _ + 1)));
            if (vals.length > 0) line(`_r${br} = ${removeBrackets(vals.pop())}`);
            // vals.push(`_r${br}`);
          }

          depth--;
          line(`} else {`, false);
          depth++;

          // reset "stack"
          // vals = [];
          break;
        }

        case Opcodes.loop: {
          line(`// loop ${invValtype[i[1]] ?? ''}`, false);
          blockStart(i, true);
          endNeedsCurly.push(false);
          break;
        }

        case Opcodes.end: {
          const br = brs.pop();
          const ret = rets.pop();
          if (ret && ret !== Blocktype.void) {
            // console.log(vals, ret);
            // console.log(decompile(f.wasm.slice(_ - 5, _ + 1)));
            if (vals.length > 0) line(`_r${br} = ${removeBrackets(vals.pop())}`);
            vals.push(`_r${br}`);
          }

          const enc = endNeedsCurly.pop() === true;
          if (enc) {
            depth--;
            line('}', false);
          }

          brDepth--;

          line(`// end`, false);

          const roe = runOnEnd.pop();
          if (roe) roe();

          break;
        }

        case Opcodes.call:
          let func = funcs.find(x => x.index === i[1]);
          if (!func) {
            const importFunc = importFuncs[i[1]];
            switch (importFunc.name) {
              case 'print':
                // line(`printf("%f\\n", ${vals.pop()})`);
                line(`printf("${valtype === 'f64' ? '%g' : '%i'}\\n", ${vals.pop()})`);
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

        case Opcodes.block:
          line(`// block ${invValtype[i[1]] ?? ''}`, false);
          blockStart(i, false);
          endNeedsCurly.push(false);
          break;

        case Opcodes.br: {
          const ret = rets[brDepth - i[1] - 1];
          // console.log(rets, brDepth, i[1], brDepth - i[1] - 1, ret, vals);
          if (ret !== Blocktype.void) line(`_r${brs[brDepth - i[1] - 1]} = ${removeBrackets(vals.pop())}`);
          line(`goto j${brs[brDepth - i[1] - 1]}`);

          // // reset "stack"
          // vals = [];
          break;
        }

        case Opcodes.br_if: {
          const ret = rets[brDepth - i[1] - 1];
          // console.log(rets, brDepth, i[1], brDepth - i[1] - 1, ret, vals);

          let cond = removeBrackets(vals.pop());
          if (!lastCond) {
            if (cond.startsWith(`(${CValtype.i32})`)) cond = `(${cond.slice(`(${CValtype.i32})`.length)}) != 0e+0`;
              else cond = `(${cond}) != 0`;
          }

          line(`if (${cond}) {`, false);
          depth++;
          if (ret !== Blocktype.void) line(`_r${brs[brDepth - i[1] - 1]} = ${removeBrackets(vals.at(-1))}`);
          line(`goto j${brs[brDepth - i[1] - 1]}`);
          depth--;
          line(`}`, false);

          break;
        }

        case Opcodes.throw: {
          const id = vals.pop();

          line(`printf("Uncaught ${exceptions[id].constructor}: ${exceptions[id].message}\\n")`);
          line(`exit(1)`);

          includes.set('stdlib.h', true);

          break;
        }

        default:
          if (CMemFuncs[i[0]]) {
            const name = invOpcodes[i[0]];
            const func = CMemFuncs[i[0]];
            if (!prepend.has(name)) {
              prepend.set(name, `${func.returns || 'void'} ${name}(${CValtype.i32} align, ${CValtype.i32} offset, ${func.args.map((x, i) => `${func.argTypes[i]} ${x}`).join(', ')}) {\n  ${func.c.replaceAll('\n', '\n  ')}\n}\n`);
              // generate func c and prepend
            }

            const immediates = [ i[1], read_unsignedLEB128(i.slice(2)) ];

            let args = [];
            for (let j = 0; j < func.args.length; j++) args.unshift(removeBrackets(vals.pop()));

            if (func.returns !== false) {
              vals.push(`${name}(${immediates[0]}, ${immediates[1]}, ${args.join(', ')})`);
            } else line(`${name}(${immediates[0]}, ${immediates[1]}, ${args.join(', ')})`);
            break;
          }

          log.warning('2c', `unimplemented op: ${invOpcodes[i[0]]}`);
          // todo(`unimplemented op: ${invOpcodes[i[0]]}`);
      }

      lastCond = false;
    }

    if (vals.length === 1 && returns) {
      line(`return ${vals.pop()}`);
    }

    if (f.name === 'main') {
      out += '\n';
      line(`return 0`);
    }

    out += '}\n\n';
  }

  depth = 0;

  const makeIncludes = includes => [...includes.keys()].map(x => `#include <${x}>\n`).join('');

  out = alwaysPreface + platformSpecific(makeIncludes(winIncludes), makeIncludes(unixIncludes), false) + '\n' + makeIncludes(includes) + '\n' + [...prepend.values()].join('\n') + '\n\n' + out;

  return out.trim();
};