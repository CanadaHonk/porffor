import type {} from './porffor.d.ts';

export const __Porffor_printString = (arg: bytestring|string): void => {
  const ptr: i32 = Porffor.IR.ptr(arg);
  const len: i32 = arg.length;
  if (Porffor.type(arg) == Porffor.TYPES.bytestring) { // latin-1 -> utf-8
    Porffor.c`
    const u8* s = MEM + ptr + 4;
    i32 i = 0;
    while (i < len && s[i] < 0x80) i++;
    fwrite(s, 1, i, stdout);
    for (; i < len; i++) {
      if (s[i] < 0x80) putchar(s[i]);
        else { putchar(0xc0 | s[i] >> 6); putchar(0x80 | (s[i] & 0x3f)); }
    }
    `;
  } else { // utf-16 -> utf-8
    Porffor.c`
    const u16* s = (const u16*)(MEM + ptr + 4);
    for (i32 i = 0; i < len; i++) {
      u32 c = s[i];
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < len && s[i + 1] >= 0xdc00 && s[i + 1] < 0xe000) c = 0x10000 + ((c - 0xd800) << 10) + (s[++i] - 0xdc00);
        else if (c >= 0xd800 && c < 0xe000) c = 0xfffd;
      if (c < 0x80) putchar(c);
        else if (c < 0x800) { putchar(0xc0 | c >> 6); putchar(0x80 | (c & 0x3f)); }
        else if (c < 0x10000) { putchar(0xe0 | c >> 12); putchar(0x80 | (c >> 6 & 0x3f)); putchar(0x80 | (c & 0x3f)); }
        else { putchar(0xf0 | c >> 18); putchar(0x80 | (c >> 12 & 0x3f)); putchar(0x80 | (c >> 6 & 0x3f)); putchar(0x80 | (c & 0x3f)); }
    }
    `;
  }
};

export const __Porffor_printHexDigit = (arg: number): void => {
  switch (arg) {
    case 0xf: Porffor.printStatic('f'); return;
    case 0xe: Porffor.printStatic('e'); return;
    case 0xd: Porffor.printStatic('d'); return;
    case 0xc: Porffor.printStatic('c'); return;
    case 0xb: Porffor.printStatic('b'); return;
    case 0xa: Porffor.printStatic('a'); return;

    default: Porffor.c`printf("%.15g", arg.val);`;
  }
};

// colors only when the stream printed to is a terminal
let consoleColors: i32 = -1;
let consoleErrColors: i32 = -1;
let consoleErr: boolean = false;
export const __Porffor_consoleColors = (): boolean => {
  let tty: i32 = 0;
  if (consoleErr) {
    if (consoleErrColors == -1) {
      Porffor.c`tty = isatty(2);`;
      consoleErrColors = tty;
    }
    return consoleErrColors == 1;
  }

  if (consoleColors == -1) {
    Porffor.c`tty = isatty(1);`;
    consoleColors = tty;
  }
  return consoleColors == 1;
};

export const __Porffor_print = (arg: any, colors: boolean = __Porffor_consoleColors(), depth: number = 0): void => {
  const __Porffor_printArray = (arg: any[]|Uint8Array|Int8Array|Uint8ClampedArray|Uint16Array|Int16Array|Uint32Array|Int32Array|Float32Array|Float64Array, colors: boolean, length: boolean = false) => {
    const arrLen: i32 = arg.length;
    if (length) {
      Porffor.printStatic('(');
      Porffor.c`printf("%d", arrLen);`;
      Porffor.printStatic(') ');
    }

    if (arrLen == 0) {
      Porffor.printStatic('[]');
    } else {
      Porffor.printStatic('[ ');
      for (let i: i32 = 0; i < arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen - 1) Porffor.printStatic(', ');
      }
      Porffor.printStatic(' ]');
    }
  };

  // todo: Symbol.toStringTag could reduce duplication here
  switch (Porffor.type(arg)) {
    case Porffor.TYPES.number:
      if (colors) Porffor.printStatic('\x1b[33m'); // yellow
      Porffor.c`
      if (arg.val == 0 && signbit(arg.val)) fputs("-0", stdout);
        else {
          const jsval s = porf_num_to_str(arg.val);
          fwrite(MEM + (u32)s.val + 4, 1, *(u32*)(MEM + (u32)s.val), stdout);
        }
      `;
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.bigint:
      if (colors) Porffor.printStatic('\x1b[33m'); // yellow
      __Porffor_printString(__Porffor_bigint_toString(arg, 10));
      Porffor.printStatic('n');
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.boolean:
    case Porffor.TYPES.booleanobject:
      if (colors) Porffor.printStatic('\x1b[33m'); // yellow
      if (Porffor.IR.ptr(arg) != 0) {
        Porffor.printStatic('true');
      } else {
        Porffor.printStatic('false');
      }
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.bytestring:
    case Porffor.TYPES.string:
      if (colors) Porffor.printStatic('\x1b[32m'); // green
      Porffor.printStatic("'");

      __Porffor_printString(arg);

      Porffor.printStatic("'");
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.undefined:
      if (colors) Porffor.printStatic('\x1b[2m'); // dim
      Porffor.printStatic('undefined');
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.object:
      if (arg) {
        const keys: any[] = Object.keys(arg);
        if (keys.length == 0) {
          Porffor.printStatic('{}');
          return;
        }

        Porffor.printStatic('{\n');
        const len: i32 = keys.length - 1;
        for (let i: i32 = 0; i <= len; i++) {
          const x: any = keys[i];

          for (let j: i32 = 0; j <= depth; j++) Porffor.printStatic('  ');
          __Porffor_printString(x);

          Porffor.printStatic(': ');
          __Porffor_print(Porffor.object.get(arg, ecma262.ToPropertyKey(x)), colors, depth + 1);

          if (i != len) Porffor.printStatic(',\n');
        }

        Porffor.printStatic('\n');
        for (let j: i32 = 0; j < depth; j++) Porffor.printStatic('  ');
        Porffor.printStatic('}');
      } else {
        if (colors) Porffor.printStatic('\x1b[1m'); // bold
        Porffor.printStatic('null');
      }

      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.function:
      Porffor.printStatic('[Function ');
      __Porffor_printString(__Porffor_funcLut_name(arg) || '(anonymous)');
      Porffor.printStatic(']');
      return;

    case Porffor.TYPES.promise: {
      const state: i32 = __Porffor_promise_state(arg);

      if (colors) Porffor.printStatic('\x1b[36m'); // cyan
      Porffor.printStatic('Promise');
      if (colors) Porffor.printStatic('\x1b[0m');
      Porffor.printStatic(' (state: ');

      if (colors) {
        if (state == 0) Porffor.printStatic('\x1b[93m'); // yellow
          else if (state == 1) Porffor.printStatic('\x1b[32m'); // green
          else Porffor.printStatic('\x1b[31m'); // red
      }
      if (state == 0) Porffor.printStatic('<pending>');
        else if (state == 1) Porffor.printStatic('<fulfilled>');
        else Porffor.printStatic('<rejected>');
      if (colors) Porffor.printStatic('\x1b[0m');

      Porffor.printStatic(', result: ');
      __Porffor_print(__Porffor_promise_result(arg), colors, depth + 1);
      Porffor.printStatic(')');
      return;
    }

    case Porffor.TYPES.date:
      if (colors) Porffor.printStatic('\x1b[35m'); // purple
      __Porffor_printString(Porffor.callThis(__Date_prototype_toISOString, arg));
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.symbol:
      if (colors) Porffor.printStatic('\x1b[32m'); // green
      __Porffor_printString(Porffor.callThis(__Symbol_prototype_toString, arg));
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.array:
      __Porffor_printArray(arg, colors, false);
      return;

    case Porffor.TYPES.uint8array:
      Porffor.printStatic('Uint8Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.int8array:
      Porffor.printStatic('Int8Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.uint8clampedarray:
      Porffor.printStatic('Uint8ClampedArray');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.uint16array:
      Porffor.printStatic('Uint16Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.int16array:
      Porffor.printStatic('Int16Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.uint32array:
      Porffor.printStatic('Uint32Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.int32array:
      Porffor.printStatic('Int32Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.float32array:
      Porffor.printStatic('Float32Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.float64array:
      Porffor.printStatic('Float64Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.sharedarraybuffer:
    case Porffor.TYPES.arraybuffer:
      if (Porffor.type(arg) == Porffor.TYPES.sharedarraybuffer) Porffor.printStatic('SharedArrayBuffer');
        else Porffor.printStatic('ArrayBuffer');
      Porffor.printStatic(' {\n');

      if (colors) Porffor.printStatic('\x1b[34m'); // blue
      Porffor.printStatic('  [Uint8Contents]');
      if (colors) Porffor.printStatic('\x1b[0m');
      Porffor.printStatic('): <');

      const bufferPtr: i32 = Porffor.IR.ptr(arg);
      const bufferLen: i32 = Porffor.IR.loadI32(bufferPtr, 0) - 1;
      for (let i: i32 = 0; i <= bufferLen; i++) {
        const ele: i32 = Porffor.IR.loadU8(bufferPtr + 8 + i, 0);
        __Porffor_printHexDigit((ele & 0xF0) / 16);
        __Porffor_printHexDigit(ele & 0xF);
        if (i != bufferLen) Porffor.printStatic(' ');
      }

      Porffor.printStatic('>,\n  byteLength: ');
      if (colors) Porffor.printStatic('\x1b[33m'); // yellow
      const byteLength: number = arg.byteLength;
      Porffor.c`printf("%.15g", byteLength);`;
      if (colors) Porffor.printStatic('\x1b[0m');
      Porffor.printStatic('\n}');
      return;

    case Porffor.TYPES.dataview:
      Porffor.printStatic('DataView {\n');
      Porffor.printStatic('  byteLength: ');
      __Porffor_print(Porffor.callThis(__DataView_prototype_byteLength$get, arg), colors);
      Porffor.printStatic(',\n  byteOffset: ');
      __Porffor_print(Porffor.callThis(__DataView_prototype_byteOffset$get, arg), colors);
      Porffor.printStatic(',\n  buffer: ');
      __Porffor_print(Porffor.callThis(__DataView_prototype_buffer$get, arg), colors);
      Porffor.printStatic('\n}');
      return;

    case Porffor.TYPES.weakmap:
    case Porffor.TYPES.map:
    case Porffor.TYPES.weakset:
    case Porffor.TYPES.set:
      if (Porffor.fastOr(Porffor.type(arg) == Porffor.TYPES.weakmap, Porffor.type(arg) == Porffor.TYPES.weakset)) Porffor.printStatic('Weak');
      if (Porffor.fastOr(Porffor.type(arg) == Porffor.TYPES.map, Porffor.type(arg) == Porffor.TYPES.weakmap)) Porffor.printStatic('Map');
        else Porffor.printStatic('Set');
      Porffor.printStatic('(');

      const keys: any[] = Porffor.IR.loadI32(arg, 0);
      const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
      const vals: any[] = Porffor.IR.loadI32(arg, 4);
      const size: i32 = keys.length - Porffor.IR.loadI32(arg, 16);
      Porffor.c`printf("%d", size);`;
      Porffor.printStatic(') { ');

      let first: boolean = true;
      for (let i: i32 = 0; i < keys.length; i++) {
        if (Porffor.IR.loadU64(keysEntries + i * 8, 0) == -1) continue;
        if (!first) Porffor.printStatic(', ');
        first = false;

        __Porffor_print(keys[i], colors);
        if (Porffor.fastOr(Porffor.type(arg) == Porffor.TYPES.map, Porffor.type(arg) == Porffor.TYPES.weakmap)) {
          Porffor.printStatic(' => ');
          __Porffor_print(vals[i], colors);
        }
      }

      Porffor.printStatic(' }');
      return;

    case Porffor.TYPES.weakref:
      Porffor.printStatic('WeakRef {}');
      return;

    case Porffor.TYPES.error:
    case Porffor.TYPES.aggregateerror:
    case Porffor.TYPES.typeerror:
    case Porffor.TYPES.referenceerror:
    case Porffor.TYPES.syntaxerror:
    case Porffor.TYPES.rangeerror:
    case Porffor.TYPES.evalerror:
    case Porffor.TYPES.urierror:
    case Porffor.TYPES.suppressederror:
      __Porffor_printString(Porffor.callThis(__Error_prototype_toString, arg));
      return;

    default: {
      const tag: any = arg[Symbol.toStringTag];
      if (Porffor.fastOr(Porffor.type(tag) == Porffor.TYPES.bytestring, Porffor.type(tag) == Porffor.TYPES.string)) {
        Porffor.printStatic('Object [');
        __Porffor_printString(tag);
        Porffor.printStatic('] {}');
      }
      return;
    }
  }
};

let tabLevel: i32 = 0;
export const __Porffor_consoleIndent = (): void => {
  for (let i: i32 = 0; i < tabLevel; i++) {
    Porffor.printStatic('\t');
  }
};

export const __console_clear = (): void => {
  Porffor.printStatic('\x1b[1;1H\x1b[J');
  tabLevel = 0;
};

export const __Porffor_consolePrint = (arg: any): void => {
  if (Porffor.fastOr(Porffor.type(arg) == Porffor.TYPES.bytestring, Porffor.type(arg) == Porffor.TYPES.string)) {
    __Porffor_printString(arg);
    return;
  }
  __Porffor_print(arg);
};

export const __console_group = (label: bytestring): void => {
  if (Porffor.type(label) != Porffor.TYPES.undefined) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(label);
  }

  tabLevel++;
};

export const __console_groupCollapsed = (label: bytestring): void => __console_group(label);

export const __console_groupEnd = (): void => {
  tabLevel--;
  if (tabLevel < 0) tabLevel = 0;
};

// a leading string formats like node's util.format: %s %d %i %f %j %o %O %c %%
export const __Porffor_consolePrintArgs = (args: any[]): void => {
  __Porffor_consoleIndent();
  const argLen: i32 = args.length;
  let i: i32 = 0;
  const first: any = args[0];
  if (Porffor.fastAnd(argLen > 1, Porffor.fastOr(Porffor.type(first) == Porffor.TYPES.bytestring, Porffor.type(first) == Porffor.TYPES.string))) {
    i = 1;
    const len: i32 = first.length;
    let last: i32 = 0;
    for (let j: i32 = 0; j < len - 1; j++) {
      if (first.charCodeAt(j) != 37) continue;
      const c: i32 = first.charCodeAt(j + 1);
      if (c == 37) {
        __Porffor_printString(first.slice(last, j + 1));
        last = j + 2;
        j++;
        continue;
      }
      if (i >= argLen) continue;
      if (Porffor.fastAnd(c != 115, c != 100, c != 105, c != 102, c != 106, c != 111, c != 79, c != 99)) continue;

      __Porffor_printString(first.slice(last, j));
      last = j + 2;
      j++;
      const arg: any = args[i++];
      if (c == 115) {
        if (Porffor.fastOr(Porffor.type(arg) == Porffor.TYPES.bytestring, Porffor.type(arg) == Porffor.TYPES.string)) __Porffor_printString(arg);
          else __Porffor_print(arg, false);
      } else if (Porffor.fastOr(c == 100, c == 105, c == 102)) {
        if (Porffor.type(arg) == Porffor.TYPES.bigint) __Porffor_print(arg, false);
          else if (Porffor.type(arg) == Porffor.TYPES.symbol) Porffor.printStatic('NaN');
          else if (c == 100) __Porffor_print(Number(arg), false);
          else if (c == 105) __Porffor_print(parseInt(arg), false);
          else __Porffor_print(parseFloat(arg), false);
      } else if (c == 106) {
        let json: any = '[Circular]';
        try {
          json = JSON.stringify(arg);
        } catch (e) {
          if (!(e instanceof TypeError) || e.message != 'Converting circular structure to JSON') throw e;
        }
        __Porffor_consolePrint(json);
      } else if (c != 99) {
        __Porffor_print(arg);
      }
    }
    __Porffor_printString(first.slice(last));
    if (i < argLen) Porffor.printStatic(' ');
  }

  for (; i < argLen; i++) {
    __Porffor_consolePrint(args[i]);
    if (i != argLen - 1) Porffor.printStatic(' ');
  }
  Porffor.printStatic('\n');
};

export const __console_log = (...args: any[]): void => __Porffor_consolePrintArgs(args);
export const __console_debug = (...args: any[]): void => __Porffor_consolePrintArgs(args);
export const __console_info = (...args: any[]): void => __Porffor_consolePrintArgs(args);
export const __Porffor_consolePrintErr = (args: any[]): void => {
  // stdout is const on some libcs, so fd 1 points at stderr meanwhile
  Porffor.c`fflush(stdout); const int porf_out = dup(1); dup2(2, 1);`;
  consoleErr = true;
  __Porffor_consolePrintArgs(args);
  consoleErr = false;
  Porffor.c`fflush(stdout); dup2(porf_out, 1); close(porf_out);`;
};

export const __console_warn = (...args: any[]): void => __Porffor_consolePrintErr(args);
export const __console_error = (...args: any[]): void => __Porffor_consolePrintErr(args);

// no stack, only the message
export const __console_trace = (...args: any[]): void => {
  if (Porffor.fastOr(Porffor.type(args[0]) == Porffor.TYPES.bytestring, Porffor.type(args[0]) == Porffor.TYPES.string)) args[0] = 'Trace: ' + args[0];
    else args.unshift('Trace:');
  __Porffor_consolePrintErr(args);
};

export const __console_assert = (assertion: any, ...args: any[]): void => {
  if (assertion) return;

  __Porffor_consoleIndent();
  Porffor.printStatic('Assertion failed');
  if (args.length != 0) {
    Porffor.printStatic(': ');
  }

  const argLen: i32 = args.length - 1;
  for (let i: i32 = 0; i <= argLen; i++) {
    __Porffor_consolePrint(args[i]);
    if (i != argLen) Porffor.printStatic(' ');
  }

  Porffor.printStatic('\n');
};

export const __Porffor_dirObject = (obj: any, colors: boolean, depth: i32, showHidden: boolean): void => {
  if (Porffor.type(obj) != Porffor.TYPES.object || depth == 0) {
    __Porffor_print(obj, colors);
    return;
  }

  Porffor.printStatic('{ ');

  const keys = __Object_keys(obj);
  const keysLen = keys.length - 1;
  for (let i: i32 = 0; i <= keysLen; i++) {
    const key = keys[i];
    __Porffor_consolePrint(key);
    Porffor.printStatic(': ');

    const value = __Porffor_object_get(obj, key);
    __Porffor_dirObject(value, colors, depth - 1, showHidden);

    if (i != keysLen) Porffor.printStatic(', ');
  }

  Porffor.printStatic(' }');
};

export const __console_dir = (obj: any, options: any): void => {
  let colors: boolean = __Porffor_consoleColors();
  let depth: i32 = 2;

  // todo: we currently have no concept of enumerable or nonenumerable properties, so this does nothing
  let showHidden: boolean = false;

  if (options) {
    colors = options.colors;
    depth = options.depth;
    showHidden = options.showHidden;
  }

  __Porffor_consoleIndent();
  __Porffor_dirObject(obj, colors, depth, showHidden);
  Porffor.printStatic('\n');
};

export const __console_dirxml = (obj: any): void => __console_dir(obj);

const countMap = new Map();
export const __console_count = (label: any): void => {
  label ??= 'default';
  const val = (countMap.get(label) ?? 0) + 1;
  countMap.set(label, val);

  __Porffor_consoleIndent();
  __Porffor_consolePrint(label);
  Porffor.printStatic(': ');
  Porffor.c`printf("%.15g", val.val);`;
  Porffor.printStatic('\n');
};

export const __console_countReset = (label: any): void => {
  label ??= 'default';
  countMap.set(label, -1);
  __console_count(label);
};

const timeMap = new Map();
export const __console_time = (label: any): void => {
  label ??= 'default';

  // warn if label already exists
  if (timeMap.has(label)) {
    Porffor.printStatic("Warning: Timer '");
    __Porffor_consolePrint(label);
    Porffor.printStatic("' already exists for console.time()\n");
  }

  timeMap.set(label, performance.now());
};

export const __console_timeLog = (label: any): void => {
  label ??= 'default';
  __Porffor_consoleIndent();

  const val = timeMap.get(label);
  if (val === undefined) {
    Porffor.printStatic("Timer '");
    __Porffor_consolePrint(label);
    Porffor.printStatic("' does not exist\n");
    return;
  }

  __Porffor_consolePrint(label);
  Porffor.printStatic(': ');

  const elapsed: number = performance.now() - val;
  Porffor.c`printf("%.15g", elapsed);`;
  Porffor.printStatic(' ms\n');
};

export const __console_timeEnd = (label: any): void => {
  label ??= 'default';

  __console_timeLog(label);
  timeMap.delete(label);
};
