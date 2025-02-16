import { read_ieee754_binary64, read_signedLEB128, read_unsignedLEB128 } from './encoding.js';
import { Blocktype, Opcodes, Valtype, PageSize } from './wasmSpec.js';
import { operatorOpcode } from './expression.js';
import { log } from './log.js';
import './prefs.js';

const CValtype = {
  i8: 'u8',
  i16: 'u16',
  i32: 'i32',
  u32: 'u32',
  i64: 'i64',
  u64: 'u64',

  f32: 'f32',
  f64: 'f64',

  undefined: 'void',

  pointer: 'void*',
  buffer: 'void*'
};

const alwaysPreface = `typedef uint8_t u8;
typedef uint16_t u16;
typedef int32_t i32;
typedef uint32_t u32;
typedef int64_t i64;
typedef uint64_t u64;
typedef float f32;
typedef double f64;

const f64 NaN = 0e+0/0e+0;
const f64 Infinity = 1e+0/0e+0;

struct ReturnValue {
  f64 value;
  i32 type;
};\n\n`;

// todo: review whether 2cMemcpy should be default or not

// all:
// immediates: ['align', 'offset']
const CMemFuncs = Prefs['2cMemcpy'] ? {
  [Opcodes.i32_store]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'i32'],
    returns: false
  },
  [Opcodes.i32_store16]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'u16'],
    returns: false
  },
  [Opcodes.i32_store8]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'u8'],
    returns: false
  },

  [Opcodes.i32_load]: {
    c: `i32 out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'i32'
  },
  [Opcodes.i32_load16_u]: {
    c: `u16 out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'i32'
  },
  [Opcodes.i32_load8_u]: {
    c: `u8 out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'i32'
  },

  [Opcodes.f64_store]: {
    c: `memcpy(_memory + offset + pointer, &value, sizeof(value));`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'f64'],
    returns: false
  },
  [Opcodes.f64_load]: {
    c: `f64 out;
memcpy(&out, _memory + offset + pointer, sizeof(out));
return out;`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'f64'
  },
} : {
  [Opcodes.i32_store]: {
    c: `*((i32*)(_memory + offset + pointer)) = value;`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'i32'],
    returns: false
  },
  [Opcodes.i32_store16]: {
    c: `*((u16*)(_memory + offset + pointer)) = value;`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'u16'],
    returns: false
  },
  [Opcodes.i32_store8]: {
    c: `*((u8*)(_memory + offset + pointer)) = value;`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'u8'],
    returns: false
  },

  [Opcodes.i32_load]: {
    c: `return *((i32*)(_memory + offset + pointer));`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'i32'
  },
  [Opcodes.i32_load16_u]: {
    c: `return *((u16*)(_memory + offset + pointer));`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'i32'
  },
  [Opcodes.i32_load8_u]: {
    c: `return *((u8*)(_memory + offset + pointer));`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'i32'
  },

  [Opcodes.f64_store]: {
    c: `*((f64*)(_memory + offset + pointer)) = value;`,
    args: ['pointer', 'value'],
    argTypes: ['i32', 'f64'],
    returns: false
  },
  [Opcodes.f64_load]: {
    c: `return *((f64*)(_memory + offset + pointer));`,
    args: ['pointer'],
    argTypes: ['i32'],
    returns: 'f64'
  },
};

const inv = (obj, keyMap = x => x) => Object.keys(obj).reduce((acc, x) => { acc[keyMap(obj[x])] = x; return acc; }, {});
const invOpcodes = inv(Opcodes);
const invValtype = inv(Valtype);

for (const x in CValtype) {
  if (Valtype[x]) CValtype[Valtype[x]] = CValtype[x];
}

const removeBrackets = str => {
  // return str;
  // if (str.startsWith('(i32)(u32)')) return '(i32)(u32)(' + removeBrackets(str.slice(22, -1)) + ')';

  for (const x in CValtype) {
    const p = `(${x})`;
    // if (str.startsWith(p)) return p + removeBrackets(str.slice(p.length));
    if (str.startsWith(p)) return str;
  }

  return str.startsWith('(') && str.endsWith(')') && !str.startsWith('(*') ? str.slice(1, -1) : str;
};

export default ({ funcs, globals, tags, data, exceptions, pages }) => {
  const invOperatorOpcode = Object.values(operatorOpcode).reduce((acc, x) => {
    for (const k in x) {
      acc[x[k]] = k;
    }
    return acc;
  }, {});
  const invGlobals = inv(globals, x => x.idx);

  const codeToSanitizedStr = code => {
    let out = '';
    while (code > 0) {
      out += String.fromCharCode(97 + code % 26);
      code -= 26;
    }
    return out;
  };
  const sanitize = str => {
    if (str === 'char' || str === 'main') return '_' + str;

    return str.replace(/[^0-9a-zA-Z_]/g, _ => codeToSanitizedStr(_.charCodeAt(0)));
  };

  for (const x in invGlobals) {
    invGlobals[x] = sanitize(invGlobals[x]);
  }

  const includes = new Map(), unixIncludes = new Map(), winIncludes = new Map();
  const prepend = new Map(), prependMain = new Map();

  includes.set('stdint.h', true);

  globalThis.out = ``;

  for (const x in globals) {
    const g = globals[x];

    out += `${CValtype[g.type]} ${sanitize(x)} = ${g.init ?? 0};\n`;
  }

  if (pages.size > 0) {
    includes.set('stdlib.h', true);
    prepend.set('_memory', `char* _memory; u32 _memoryPages = ${Math.ceil((pages.size * pageSize) / PageSize)};\n`);
    prependMain.set('_initMemory', `_memory = malloc(_memoryPages * ${PageSize});\n`);
    if (Prefs['2cMemcpy']) includes.set('string.h', true);
  }

  const activeData = data.filter(x => x.page != null);
  if (activeData.length > 0) {
    const dataOffset = x => pages.allocs.get(x.page) ?? (pages.get(x.page) * pageSize);
    if (Prefs['2cMemcpy']) {
      prependMain.set('_data', activeData.map(x => `memcpy(_memory + ${dataOffset(x)}, (unsigned char[]){${x.bytes.join(',')}}, ${x.bytes.length});`).join('\n  '));
    } else {
      prependMain.set('_data', activeData.map(x => x.bytes.reduce((acc, y, i) => acc + (y === 0 ? '' : `_memory[${dataOffset(x) + i}]=(u8)${y};`), '')).join('\n  '));
    }
  }

  if (importFuncs.find(x => x.name === '__Porffor_readArgv')) {
    prepend.set('argv', `int _argc; char** _argv;`);
    prependMain.set('argv', `_argc = argc; _argv = argv;`);
  }

  if (out) out += '\n';

  const line = (str, semi = true) => out += `${str}${semi ? ';' : ''}\n`;
  const lines = lines => {
    for (const x of lines) {
      out += x + '\n';
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

  let ffiFuncs = {};
  const cified = new Set();
  const cify = f => {
    let out = '';

    let depth = 1;
    let brDepth = 0;
    const line = (str, semi = true) => out += `${' '.repeat((depth + brDepth) * 2)}${str}${semi ? ';' : ''}\n`;
    const lines = lines => {
      for (const x of lines) {
        out += `${' '.repeat((depth + brDepth) * 2)}${x}\n`;
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

    let retTmpId = 0;
    let tmpId = 0;

    const invLocals = inv(f.locals, x => x.idx);
    const invLocalTypes = {};
    for (const x in invLocals) {
      invLocalTypes[x] = CValtype[f.locals[invLocals[x]].type];
      invLocals[x] = sanitize(invLocals[x]);
    }

    let localTmpId = 0;
    const localGet = idx => {
      if (Prefs['2cDirectLocalGet']) {
        // this just does local.get via the variable name
        // nice but does not get the value at this moment
        // so breaks some wasm principles :(
        vals.push(`${invLocals[idx]}`);
      } else {
        const id = localTmpId++;

        const line2 = out.indexOf('{\n') + 2;
        out = out.slice(0, line2) + `  ${invLocalTypes[idx]} _get${id};\n` + out.slice(line2);
        // line(`const ${invLocalTypes[idx]} _get${id} = ${invLocals[idx]}`);

        line(`_get${id} = ${invLocals[idx]}`);
        vals.push(`_get${id}`);
      }
    };

    const returns = f.returns.length > 0;
    const typedReturns = f.returnType == null;

    const shouldInline = false; // f.internal;
    if (f.name === '#main') out += `int main(${prependMain.has('argv') ? 'int argc, char* argv[]' : ''}) {\n`;
      else out += `${!typedReturns ? (returns ? CValtype[f.returns[0]] : 'void') : 'struct ReturnValue'} ${shouldInline ? 'inline ' : ''}${sanitize(f.name)}(${f.params.map((x, i) => `${CValtype[x]} ${invLocals[i]}`).join(', ')}) {\n`;

    if (f.name === '__Porffor_promise_runJobs') {
      out += '}';
      globalThis.out = globalThis.out + out;
      return;
    }

    if (f.name === '#main') {
      out += '  ' + [...prependMain.values()].join('\n  ');
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

    const blockStart = (i, loop) => {
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

    for (let _ = 0; _ < f.wasm.length; _++) {
      const i = f.wasm[_];

      if (i[0] === null && i[1] === 'dlopen') {
        // special ffi time
        const path = i[2];
        const symbols = i[3];

        includes.set('dlfcn.h', true);
        line(`void* _dl = dlopen("${path}", RTLD_LAZY)`);

        for (const name in symbols) {
          line(`*(void**)(&${name}) = dlsym(_dl, "${name}")`);
          ffiFuncs[name] = symbols[name];
        }

        continue;
      }

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
            vals.push(`(i32)(${vals.pop()})`);
            break;

          // i32_trunc_sat_f64_u
          case 0x03:
            vals.push(`(u32)(${vals.pop()})`);
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

        case Opcodes.f64_const: {
          const val = i[1];
          vals.push(val.toString());
          break;
        }

        case Opcodes.local_get: {
          localGet(i[1]);
          break;
        }

        case Opcodes.local_set:
          line(`${invLocals[i[1]]} = ${removeBrackets(vals.pop())}`);
          break;

        case Opcodes.local_tee: {
          line(`${invLocals[i[1]]} = ${removeBrackets(vals.pop())}`);
          localGet(i[1]);

          // vals.push(`((${invLocals[i[1]]} = ${vals.pop()}))`);
          break;
        }

        case Opcodes.global_get:
          vals.push(`${invGlobals[i[1]]}`);
          break;

        case Opcodes.global_set:
          line(`${invGlobals[i[1]]} = ${removeBrackets(vals.pop())}`);
          break;

        case Opcodes.f64_convert_i32_u:
        case Opcodes.f64_convert_i32_s:
        case Opcodes.f64_convert_i64_u:
        case Opcodes.f64_convert_i64_s:
          // int to f64
          vals.push(`(f64)(${removeBrackets(vals.pop())})`);
          break;

        case Opcodes.i32_eqz:
          if (lastCond) {
            vals.push(`!(${removeBrackets(vals.pop())})`);
          } else {
            let cond = '((' + removeBrackets(vals.pop());
            if (cond.startsWith(`((i32)`)) cond = `${cond.slice(5)}) == 0e+0)`;
              else cond += ') == 0)';
            vals.push(cond);
          }
          lastCond = true;
          continue;

        case Opcodes.return:
          if (!typedReturns) {
            line(`return${returns ? ` ${removeBrackets(vals.pop())}` : ''}`);
            break;
          }

          const b = returns ? vals.pop() : -1;
          const a = returns ? vals.pop() : -1;
          line(`return${returns ? ` (struct ReturnValue){ ${removeBrackets(a)}, ${removeBrackets(b)} }` : ''}`);
          break;

        case Opcodes.if: {
          let cond = removeBrackets(vals.pop());
          if (!lastCond) {
            if (cond.startsWith(`(i32)`)) cond = `${cond.slice(5)} != 0e+0`;
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
            if (vals.length > 0) line(`_r${br} = ${removeBrackets(vals.pop())}`);
            // vals.push(`_r${br}`);
          }

          depth--;
          line(`} else {`, false);
          depth++;

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
                line(`printf("${valtype === 'f64' ? '%g' : '%i'}", ${vals.pop()})`);
                includes.set('stdio.h', true);
                break;
              case 'printChar':
                line(`putchar((int)(${vals.pop()}))`);
                includes.set('stdio.h', true);
                break;

              case 'time':
                line(`double _time_out`);
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

              case '__Porffor_readArgv': {
                prepend.set('__Porffor_readArgv',
`i32 __Porffor_readArgv(u32 index, u32 outPtr) {
  if (index >= _argc) {
    return -1;
  }

  char* arg = _argv[index];

  u32 read = 0;
  char* out = _memory + outPtr + 4;
  char ch;
  while ((ch = *(arg++)) != 0) {
    out[read++] = ch;
  }

  *((i32*)(_memory + outPtr)) = (i32)read;
  return read;
}`);

                const outPtr = vals.pop();
                const index = vals.pop();
                vals.push(`(f64)__Porffor_readArgv((u32)(${index}), (u32)(${outPtr}))`);
                break;
              }

              case '__Porffor_readFile': {
                includes.set('stdio.h', true);

                prepend.set('__Porffor_readFile',
`i32 __Porffor_readFile(u32 pathPtr, u32 outPtr) {
  FILE* fp;
  if (pathPtr == 0) {
    fp = stdin;
  } else {
    char* path = _memory + pathPtr + 4;
    fp = fopen(path, "r");
    if (fp == NULL) {
      return -1;
    }
  }

  u32 read = 0;
  char* out = _memory + outPtr + 4;
  char ch;
  while ((ch = fgetc(fp)) != EOF) {
    out[read++] = ch;
  }

  fclose(fp);

  *((i32*)(_memory + outPtr)) = (i32)read;
  return read;
}`);
                const outPtr = vals.pop();
                const pathPtr = vals.pop();
                vals.push(`(f64)__Porffor_readFile((u32)(${pathPtr}), (u32)(${outPtr}))`);
                break;
              }

              default:
                log.warning('2c', `unimplemented import: ${importFunc.name}`);
                break;
            }

            break;
          }

          if (!cified.has(func.name) && func.name !== f.name) {
            cified.add(func.name);
            if (!ffiFuncs[func.name]) {
              cify(func);
            }
          }

          let args = [];
          for (let j = 0; j < func.params.length; j++) args.unshift(removeBrackets(vals.pop()));

          let name = sanitize(func.name);
          if (ffiFuncs[func.name]) {
            name = `(*` + name + ')';

            // handle ffi pointer and buffer args
            const { parameters } = ffiFuncs[func.name];
            for (let j = 0; j < parameters.length; j++) {
              if (parameters[j] === 'buffer') {
                let x = args[j];
                if (x.startsWith('(i32)')) x = x.slice(5);
                args[j] = `(void*)((u64)_memory + (u64)(${x}) + 4)`;
              }

              if (parameters[j] === 'pointer') {
                let x = args[j];
                if (x.startsWith('(i32)')) x = '(u64)' + x.slice(5);

                args[j] = `(void*)${x}`;
              }
            }
          }

          if (func.returns.length > 0) {
            if (func.returnType != null) {
              vals.push(`${name}(${args.join(', ')})`);
            } else {
              const id = retTmpId++;
              line(`const struct ReturnValue _${id} = ${name}(${args.join(', ')})`);
              vals.push(`_${id}.value`);
              vals.push(`_${id}.type`);
            }
          } else line(`${name}(${args.join(', ')})`);

          break;

        case Opcodes.call_indirect:
          // todo: stub
          if (Prefs.d) log.warning('2c', `unimplemented op: ${invOpcodes[i[0]]} \x1b[2m(${f.name})`);
          vals.pop();
          vals.push('0', '0');
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
          if (ret !== Blocktype.void) line(`_r${brs[brDepth - i[1] - 1]} = ${removeBrackets(vals.pop())}`);
          line(`goto j${brs[brDepth - i[1] - 1]}`);

          break;
        }

        case Opcodes.br_if: {
          const ret = rets[brDepth - i[1] - 1];

          let cond = removeBrackets(vals.pop());
          if (!lastCond) {
            if (cond.startsWith(`(i32)`)) cond = `${cond.slice(5)} != 0e+0`;
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

        case Opcodes.select: {
          const cond = vals.pop();
          const b = vals.pop();
          const a = vals.pop();

          vals.push(`(${cond} ? ${a} : ${b})`);
          break;
        }

        case Opcodes.throw: {
          // todo: actually print exception
          vals.pop();
          vals.pop();
          line(`printf("Uncaught exception\\n")`);
          line(`exit(1)`);

          includes.set('stdio.h', true);
          includes.set('stdlib.h', true);

          break;
        }

        case Opcodes.f64_min: {
          const b = vals.pop();
          const a = vals.pop();

          const id = tmpId++;
          line(`const f64 _tmp${id}a = ${a}`);
          line(`const f64 _tmp${id}b = ${b}`);
          vals.push(`(_tmp${id}a > _tmp${id}b ? _tmp${id}b : _tmp${id}a)`);
          break;
        }
        case Opcodes.f64_max: {
          const b = vals.pop();
          const a = vals.pop();

          const id = tmpId++;
          line(`const f64 _tmp${id}a = ${a}`);
          line(`const f64 _tmp${id}b = ${b}`);
          vals.push(`(_tmp${id}a > _tmp${id}b ? _tmp${id}a : _tmp${id}b)`);
          break;
        }

        case Opcodes.f64_abs: {
          const id = tmpId++;
          line(`const f64 _tmp${id} = ${vals.pop()}`);
          vals.push(`(_tmp${id} < 0 ? -_tmp${id} : _tmp${id})`);
          break;
        }
        case Opcodes.f64_neg: {
          vals.push(`(-${vals.pop()})`);
          break;
        }

        case Opcodes.f64_ceil:
          vals.push(`ceil(${vals.pop()})`);
          includes.set('math.h', true);
          break;
        case Opcodes.f64_floor:
          vals.push(`floor(${vals.pop()})`);
          includes.set('math.h', true);
          break;
        case Opcodes.f64_trunc:
          // vals.push(`trunc(${vals.pop()})`);
          // includes.set('math.h', true);

          vals.push(`(i32)(${removeBrackets(vals.pop())})`); // this is ~10x faster with clang??
          break;
        case Opcodes.f64_nearest:
          vals.push(`round(${vals.pop()})`);
          includes.set('math.h', true);
          break;

        // case Opcodes.f64_sqrt: {
        //   break;
        // }

        // case Opcodes.f64_copysign: {
        //   break;
        // }

        case Opcodes.memory_grow: {
          const id = localTmpId++;
          line(`const u32 _oldPages${id} = _memoryPages`);
          line(`_memoryPages += ${vals.pop()}`);
          line(`_memory = realloc(_memory, _memoryPages * ${PageSize})`);
          vals.push(`_oldPages${id}`);
          break;
        }

        default:
          if (CMemFuncs[i[0]]) {
            const name = invOpcodes[i[0]];
            const func = CMemFuncs[i[0]];
            if (!prepend.has(name)) {
              prepend.set(name, `${func.returns || 'void'} ${name}(i32 align, i32 offset, ${func.args.map((x, i) => `${func.argTypes[i]} ${x}`).join(', ')}) {\n  ${func.c.replaceAll('\n', '\n  ')}\n}\n`);
            }

            const immediates = [ i[1], read_unsignedLEB128(i.slice(2)) ];

            let args = [];
            for (let j = 0; j < func.args.length; j++) args.unshift(removeBrackets(vals.pop()));

            if (func.returns !== false) {
              vals.push(`${name}(${immediates[0]}, ${immediates[1]}, ${args.join(', ')})`);
            } else line(`${name}(${immediates[0]}, ${immediates[1]}, ${args.join(', ')})`);
            break;
          }

          if (Prefs.d) log.warning('2c', `unimplemented op: ${invOpcodes[i[0]] ?? invOpcodes[i[0] + ',' + i[1]]} \x1b[2m(${f.name})`);
      }

      lastCond = false;
    }

    if (vals.length === 1 && f.returns.length === 1) {
      line(`return ${vals.pop()}`);
    }

    if (f.name === '#main') {
      out += '\n';
      line(`return 0`);
    }

    out += '}\n\n';

    globalThis.out = globalThis.out + out;
  };

  cify(funcs.find(x => x.name === '#main'));

  const rawParams = f => {
    if (ffiFuncs[f.name]) return ffiFuncs[f.name].parameters;
    return f.params;
  };

  prepend.set('func decls', funcs.filter(x => x.name !== '#main' && cified.has(x.name)).map(f => {
    const returns = f.returns.length > 0;
    const typedReturns = f.returnType == null;

    const invLocals = inv(f.locals, x => x.idx);
    for (const x in invLocals) {
      invLocals[x] = sanitize(invLocals[x]);
    }

    const shouldInline = false;
    return `${!typedReturns ? (returns ? CValtype[f.returns[0]] : 'void') : 'struct ReturnValue'} ${shouldInline ? 'inline ' : ''}${ffiFuncs[f.name] ? '(*' : ''}${sanitize(f.name)}${ffiFuncs[f.name] ? ')' : ''}(${rawParams(f).map((x, i) => `${CValtype[x]} ${invLocals[i]}`).join(', ')});`;
  }).join('\n'));

  const makeIncludes = includes => [...includes.keys()].map(x => `#include <${x}>\n`).join('');
  out = platformSpecific(makeIncludes(winIncludes), makeIncludes(unixIncludes), false) + '\n' + makeIncludes(includes) + '\n' + alwaysPreface + [...prepend.values()].join('\n') + '\n\n' + out;

  return `// generated by porffor ${globalThis.version ?? ''}\n` + out.trim();
};