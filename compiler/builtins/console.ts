import type {} from './porffor.d.ts';

export const __Porffor_printString = (arg: bytestring|string) => {
  let ptr: i32 = Porffor.wasm`local.get ${arg}`;
  if (Porffor.rawType(arg) == Porffor.TYPES.bytestring) {
    const end: i32 = ptr + arg.length;
    while (ptr < end) {
      printChar(Porffor.wasm.i32.load8_u(ptr++, 0, 4));
    }
  } else { // regular string
    const end: i32 = ptr + arg.length * 2;
    while (ptr < end) {
      printChar(Porffor.wasm.i32.load16_u(ptr, 0, 4));
      ptr += 2;
    }
  }
};

export const __Porffor_printHexDigit = (arg: number) => {
  switch (arg) {
    case 0xf: printStatic('f'); return;
    case 0xe: printStatic('e'); return;
    case 0xd: printStatic('d'); return;
    case 0xc: printStatic('c'); return;
    case 0xb: printStatic('b'); return;
    case 0xa: printStatic('a'); return;

    default: print(arg);
  }
};

export const __Porffor_numberLog = (arg: number) => {
  print(arg);
  printStatic('\n');
};

export const __Porffor_miniLog = (arg: any) => {
  switch (Porffor.rawType(arg)) {
    case Porffor.TYPES.number:
      print(arg);
      break;

    case Porffor.TYPES.boolean:
      if (arg) {
        printStatic('true');
      } else {
        printStatic('false');
      }
      break;

    case Porffor.TYPES.bytestring:
    case Porffor.TYPES.string:
      printStatic("'");
      __Porffor_printString(arg);
      printStatic("'");
      break;

    case Porffor.TYPES.array:
      const arrLen: i32 = arg.length - 1;
      if (arrLen == -1) {
        printStatic('[]');
      } else {
        printStatic('[ ');
        for (let i: i32 = 0; i <= arrLen; i++) {
          __Porffor_miniLog(arg[i]);
          if (i != arrLen) printStatic(', ');
        }
        printStatic(' ]');
      }
      break;

    case Porffor.TYPES.empty:
    case Porffor.TYPES.undefined:
      printStatic('undefined');
      break;

    case Porffor.TYPES.object:
      if (arg) {
        printStatic('[Object]');
      } else {
        printStatic('null');
      }
      break;
  }

  printStatic('\n');
};

export const __Porffor_print = (arg: any, colors: boolean = true) => {
  // todo: Symbol.toStringTag could reduce duplication here

  // note: this doesn't have access to the upper scope!! do not use any variables from up there
  const __Porffor_printArray = (arg: any, colors: boolean, length: boolean = false) => {
    const arrLen: i32 = arg.length - 1;

    if (length) {
      printStatic('(');
      print(arrLen + 1);
      printStatic(') ');
    }

    if (arrLen == -1) {
      printStatic('[]');
    } else {
      printStatic('[ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
    }
  };

  switch (Porffor.rawType(arg)) {
    case Porffor.TYPES.number:
      if (colors) printStatic('\x1b[33m'); // yellow
      print(arg);
      if (colors) printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.boolean:
      if (colors) printStatic('\x1b[33m'); // yellow
      if (arg) {
        printStatic('true');
      } else {
        printStatic('false');
      }
      if (colors) printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.bytestring:
    case Porffor.TYPES.string:
      if (colors) printStatic('\x1b[32m'); // green
      printStatic("'");

      __Porffor_printString(arg);

      printStatic("'");
      if (colors) printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.empty:
    case Porffor.TYPES.undefined:
      if (colors) printStatic('\x1b[2m'); // dim
      printStatic('undefined');
      if (colors) printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.object:
      if (arg) {
        printStatic('{\n');

        const keys = Object.keys(arg);
        const len = keys.length - 1;
        for (let i: i32 = 0; i <= len; i++) {
          const x = keys[i];

          printStatic('  ');
          __Porffor_printString(x);

          printStatic(': ');
          __Porffor_print(Porffor.object.get(arg, x));

          if (i != len) printStatic(',\n');
        }

        printStatic('\n}');
      } else {
        if (colors) printStatic('\x1b[1m'); // bold
        printStatic('null');
      }

      if (colors) printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.function:
      printStatic('[Function ');
      __Porffor_printString(__Porffor_funcLut_name(arg));
      printStatic(']');
      return;

    case Porffor.TYPES.date:
      if (colors) printStatic('\x1b[35m'); // purple
      __Porffor_printString(__Date_prototype_toISOString(arg));
      if (colors) printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.symbol:
      if (colors) printStatic('\x1b[32m'); // green
      __Porffor_printString(__Symbol_prototype_toString(arg));
      if (colors) printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.array:
      __Porffor_printArray(arg, colors, false);
      return;

    case Porffor.TYPES.uint8array:
      printStatic('Uint8Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.int8array:
      printStatic('Int8Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.uint8clampedarray:
      printStatic('Uint8ClampedArray');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.uint16array:
      printStatic('Uint16Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.int16array:
      printStatic('Int16Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.uint32array:
      printStatic('Uint32Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.int32array:
      printStatic('Int32Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.float32array:
      printStatic('Float32Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.float64array:
      printStatic('Float64Array');
      __Porffor_printArray(arg, colors, true);
      return;

    case Porffor.TYPES.sharedarraybuffer:
    case Porffor.TYPES.arraybuffer:
      if (Porffor.rawType(arg) == Porffor.TYPES.sharedarraybuffer) printStatic('SharedArrayBuffer');
        else printStatic('ArrayBuffer');
      printStatic(' {\n');

      if (colors) printStatic('\x1b[34m'); // blue
      printStatic('  [Uint8Contents]');
      if (colors) printStatic('\x1b[0m');
      printStatic('): <');

      const buffer = new Uint8Array(arg);
      const bufferLen = buffer.length - 1;
      for (let i = 0; i <= bufferLen; i++) {
        const ele = buffer[i];
        __Porffor_printHexDigit((ele & 0xF0) / 16);
        __Porffor_printHexDigit(ele & 0xF);
        if (i != bufferLen) printStatic(' ');
      }

      printStatic('>,\n  byteLength: ');
      if (colors) printStatic('\x1b[33m'); // yellow
      print(arg.byteLength);
      if (colors) printStatic('\x1b[0m');
      printStatic('\n}');
      return;

    case Porffor.TYPES.dataview:
      printStatic('DataView {\n');
      printStatic('  byteLength: ');
      __Porffor_print(__DataView_prototype_byteLength$get(arg), colors);
      printStatic(',\n  byteOffset: ');
      __Porffor_print(__DataView_prototype_byteOffset$get(arg), colors);
      printStatic(',\n  buffer: ');
      __Porffor_print(__DataView_prototype_buffer$get(arg), colors);
      printStatic('\n}');
      return;

    case Porffor.TYPES.weakmap:
    case Porffor.TYPES.map:
      if (Porffor.rawType(arg) == Porffor.TYPES.weakmap) printStatic('WeakMap');
        else printStatic('Map');
      printStatic('(');

      const map = __Map_prototype_keys(arg);
      const mapLen: i32 = map.length - 1;
      print(mapLen + 1);
      printStatic(') { ');

      for (let i: i32 = 0; i < mapLen; i++) {
        const key = map[i];
        __Porffor_print(key);
        printStatic(' => ');
        __Porffor_print(__Map_prototype_get(arg, key), colors);
        if (i != mapLen) printStatic(', ');
      }

      printStatic(' }');
      return;

    case Porffor.TYPES.weakset:
    case Porffor.TYPES.set:
      if (Porffor.rawType(arg) == Porffor.TYPES.weakset) printStatic('WeakSet');
        else printStatic('Set');
      printStatic('(');

      const set = __Set_prototype_values(arg);
      const setLen: i32 = set.length - 1;
      print(setLen + 1);
      printStatic(') { ');

      for (let i: i32 = 0; i <= setLen; i++) {
        __Porffor_print(Porffor.set.read(set, i), colors);
        if (i != setLen) printStatic(', ');
      }

      printStatic(' }');
      return;

    case Porffor.TYPES.weakref:
      printStatic('WeakRef {}');
      return;

    // case Porffor.TYPES.regexp:
    //   // todo: we currently have no way of getting the source text, so this falls back

    // default:
    //   __Porffor_printString(arg.toString());
    //   return;
  }
};

let tabLevel = 0;
export const __Porffor_consoleIndent = () => {
  for (let i = 0; i < tabLevel; i++) {
    printStatic('\t');
  }
};

export const __console_clear = () => {
  printStatic('\x1b[1;1H\x1b[J');
  tabLevel = 0;
};

export const __Porffor_consolePrint = (arg: any) => {
  if (Porffor.fastOr(Porffor.rawType(arg) == Porffor.TYPES.bytestring, Porffor.rawType(arg) == Porffor.TYPES.string)) {
    __Porffor_printString(arg);
    return;
  }
  __Porffor_print(arg);
};

export const __console_group = (label: bytestring) => {
  if (Porffor.rawType(label) != Porffor.TYPES.undefined) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(label);
  }

  tabLevel++;
};

export const __console_groupCollapsed = (label: bytestring) => __console_group(label);

export const __console_groupEnd = () => {
  tabLevel--;
  if (tabLevel < 0) tabLevel = 0;
};

export const __console_log = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) printStatic(' ');
  }

  printStatic('\n');
};

export const __console_debug = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) printStatic(' ');
  }

  printStatic('\n');
};

export const __console_info = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) printStatic(' ');
  }

  printStatic('\n');
};

export const __console_warn = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) printStatic(' ');
  }

  printStatic('\n');
};

export const __console_error = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) printStatic(' ');
  }

  printStatic('\n');
};

export const __console_assert = (assertion: any, ...args: any[]) => {
  if (assertion) return;

  __Porffor_consoleIndent();
  printStatic('Assertion failed');
  if (args.length != 0) {
    printStatic(': ');
  }

  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consolePrint(args[i]);
    if (i != argLen) printStatic(' ');
  }

  printStatic('\n');
};

export const __Porffor_dirObject = (obj: any, colors: boolean, depth: i32, showHidden: boolean) => {
  if (Porffor.rawType(obj) != Porffor.TYPES.object || depth == 0) {
    __Porffor_print(obj, colors);
    return;
  }

  printStatic('{ ');

  const keys = __Object_keys(obj);
  const keysLen = keys.length - 1;
  for (let i = 0; i <= keysLen; i++) {
    const key = keys[i];
    __Porffor_consolePrint(key);
    printStatic(': ');

    const value = __Porffor_object_get(obj, key);
    __Porffor_dirObject(value, colors, depth - 1, showHidden);

    if (i != keysLen) printStatic(', ');
  }

  printStatic(' }');
};

export const __console_dir = (obj: any, options: any) => {
  let colors: boolean = true;
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
  printStatic('\n');
};

export const __console_dirxml = (obj: any) => __console_dir(obj);

const countMap = new Map();
export const __console_count = (label: any) => {
  label ??= 'default';
  const val = (countMap.get(label) ?? 0) + 1;
  countMap.set(label, val);

  __Porffor_consoleIndent();
  __Porffor_consolePrint(label);
  printStatic(': ');
  print(val);
  printStatic('\n');
};

export const __console_countReset = (label: any) => {
  label ??= 'default';
  countMap.set(label, -1);
  __console_count(label);
};

const timeMap = new Map();
export const __console_time = (label: any) => {
  label ??= 'default';

  // warn if label already exists
  if (timeMap.has(label)) {
    printStatic("Warning: Timer '");
    __Porffor_consolePrint(label);
    printStatic("' already exists for console.time()\n");
  }

  timeMap.set(label, performance.now());
};

export const __console_timeLog = (label: any) => {
  label ??= 'default';
  __Porffor_consoleIndent();

  const val = timeMap.get(label);
  if (!val) {
    printStatic("Timer '");
    __Porffor_consolePrint(label);
    printStatic("' does not exist\n");
    return;
  }

  __Porffor_consolePrint(label);
  printStatic(': ');

  print(performance.now() - val);
  printStatic(' ms\n');
};

export const __console_timeEnd = (label: any) => {
  label ??= 'default';

  __console_timeLog(label);
  timeMap.delete(label);
};