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
    case 0xf: Porffor.printStatic('f'); return;
    case 0xe: Porffor.printStatic('e'); return;
    case 0xd: Porffor.printStatic('d'); return;
    case 0xc: Porffor.printStatic('c'); return;
    case 0xb: Porffor.printStatic('b'); return;
    case 0xa: Porffor.printStatic('a'); return;

    default: print(arg);
  }
};

export const __Porffor_numberLog = (arg: number) => {
  print(arg);
  Porffor.printStatic('\n');
};

export const __Porffor_miniLog = (arg: any) => {
  switch (Porffor.rawType(arg)) {
    case Porffor.TYPES.number:
      print(arg);
      break;

    case Porffor.TYPES.boolean:
      if (arg) {
        Porffor.printStatic('true');
      } else {
        Porffor.printStatic('false');
      }
      break;

    case Porffor.TYPES.bytestring:
    case Porffor.TYPES.string:
      Porffor.printStatic("'");
      __Porffor_printString(arg);
      Porffor.printStatic("'");
      break;

    case Porffor.TYPES.array:
      const arrLen: i32 = arg.length - 1;
      if (arrLen == -1) {
        Porffor.printStatic('[]');
      } else {
        Porffor.printStatic('[ ');
        for (let i: i32 = 0; i <= arrLen; i++) {
          __Porffor_miniLog(arg[i]);
          if (i != arrLen) Porffor.printStatic(', ');
        }
        Porffor.printStatic(' ]');
      }
      break;

    case Porffor.TYPES.empty:
    case Porffor.TYPES.undefined:
      Porffor.printStatic('undefined');
      break;

    case Porffor.TYPES.object:
      if (arg) {
        Porffor.printStatic('[Object]');
      } else {
        Porffor.printStatic('null');
      }
      break;
  }

  Porffor.printStatic('\n');
};

export const __Porffor_print = (arg: any, colors: boolean = true) => {
  // todo: Symbol.toStringTag could reduce duplication here

  // note: this doesn't have access to the upper scope!! do not use any variables from up there
  const __Porffor_printArray = (arg: any, colors: boolean, length: boolean = false) => {
    const arrLen: i32 = arg.length - 1;

    if (length) {
      Porffor.printStatic('(');
      print(arrLen + 1);
      Porffor.printStatic(') ');
    }

    if (arrLen == -1) {
      Porffor.printStatic('[]');
    } else {
      Porffor.printStatic('[ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) Porffor.printStatic(', ');
      }
      Porffor.printStatic(' ]');
    }
  };

  switch (Porffor.rawType(arg)) {
    case Porffor.TYPES.number:
      if (colors) Porffor.printStatic('\x1b[33m'); // yellow
      print(arg);
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.boolean:
      if (colors) Porffor.printStatic('\x1b[33m'); // yellow
      if (arg) {
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

    case Porffor.TYPES.empty:
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

        Porffor.printStatic('{ ');
        const len: i32 = keys.length - 1;
        for (let i: i32 = 0; i <= len; i++) {
          const x: any = keys[i];

          Porffor.printStatic('  ');
          __Porffor_printString(x);

          Porffor.printStatic(': ');
          __Porffor_print(Porffor.object.get(arg, ecma262.ToPropertyKey(x)));

          if (i != len) Porffor.printStatic(',\n');
        }

        Porffor.printStatic(' }');
      } else {
        if (colors) Porffor.printStatic('\x1b[1m'); // bold
        Porffor.printStatic('null');
      }

      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.function:
      Porffor.printStatic('[Function ');
      __Porffor_printString(__Porffor_funcLut_name(arg));
      Porffor.printStatic(']');
      return;

    case Porffor.TYPES.date:
      if (colors) Porffor.printStatic('\x1b[35m'); // purple
      __Porffor_printString(__Date_prototype_toISOString(arg));
      if (colors) Porffor.printStatic('\x1b[0m');
      return;

    case Porffor.TYPES.symbol:
      if (colors) Porffor.printStatic('\x1b[32m'); // green
      __Porffor_printString(__Symbol_prototype_toString(arg));
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
      if (Porffor.rawType(arg) == Porffor.TYPES.sharedarraybuffer) Porffor.printStatic('SharedArrayBuffer');
        else Porffor.printStatic('ArrayBuffer');
      Porffor.printStatic(' {\n');

      if (colors) Porffor.printStatic('\x1b[34m'); // blue
      Porffor.printStatic('  [Uint8Contents]');
      if (colors) Porffor.printStatic('\x1b[0m');
      Porffor.printStatic('): <');

      const buffer = new Uint8Array(arg);
      const bufferLen = buffer.length - 1;
      for (let i = 0; i <= bufferLen; i++) {
        const ele = buffer[i];
        __Porffor_printHexDigit((ele & 0xF0) / 16);
        __Porffor_printHexDigit(ele & 0xF);
        if (i != bufferLen) Porffor.printStatic(' ');
      }

      Porffor.printStatic('>,\n  byteLength: ');
      if (colors) Porffor.printStatic('\x1b[33m'); // yellow
      print(arg.byteLength);
      if (colors) Porffor.printStatic('\x1b[0m');
      Porffor.printStatic('\n}');
      return;

    case Porffor.TYPES.dataview:
      Porffor.printStatic('DataView {\n');
      Porffor.printStatic('  byteLength: ');
      __Porffor_print(__DataView_prototype_byteLength$get(arg), colors);
      Porffor.printStatic(',\n  byteOffset: ');
      __Porffor_print(__DataView_prototype_byteOffset$get(arg), colors);
      Porffor.printStatic(',\n  buffer: ');
      __Porffor_print(__DataView_prototype_buffer$get(arg), colors);
      Porffor.printStatic('\n}');
      return;

    case Porffor.TYPES.weakmap:
    case Porffor.TYPES.map:
      if (Porffor.rawType(arg) == Porffor.TYPES.weakmap) Porffor.printStatic('WeakMap');
        else Porffor.printStatic('Map');
      Porffor.printStatic('(');

      const map: any[] = __Map_prototype_keys(arg);
      const mapLen: i32 = map.length - 1;
      print(mapLen + 1);
      Porffor.printStatic(') { ');

      for (let i: i32 = 0; i < mapLen; i++) {
        const key: any = map[i];
        __Porffor_print(key);
        Porffor.printStatic(' => ');
        __Porffor_print(__Map_prototype_get(arg, key), colors);
        if (i != mapLen) Porffor.printStatic(', ');
      }

      Porffor.printStatic(' }');
      return;

    case Porffor.TYPES.weakset:
    case Porffor.TYPES.set:
      if (Porffor.rawType(arg) == Porffor.TYPES.weakset) Porffor.printStatic('WeakSet');
        else Porffor.printStatic('Set');
      Porffor.printStatic('(');

      const set: any[] = __Set_prototype_values(arg);
      const setLen: i32 = set.length - 1;
      print(setLen + 1);
      Porffor.printStatic(') { ');

      for (let i: i32 = 0; i <= setLen; i++) {
        __Porffor_print(set[i], colors);
        if (i != setLen) Porffor.printStatic(', ');
      }

      Porffor.printStatic(' }');
      return;

    case Porffor.TYPES.weakref:
      Porffor.printStatic('WeakRef {}');
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
    Porffor.printStatic('\t');
  }
};

export const __console_clear = () => {
  Porffor.printStatic('\x1b[1;1H\x1b[J');
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

    if (i != argLen) Porffor.printStatic(' ');
  }

  Porffor.printStatic('\n');
};

export const __console_debug = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) Porffor.printStatic(' ');
  }

  Porffor.printStatic('\n');
};

export const __console_info = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) Porffor.printStatic(' ');
  }

  Porffor.printStatic('\n');
};

export const __console_warn = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) Porffor.printStatic(' ');
  }

  Porffor.printStatic('\n');
};

export const __console_error = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consoleIndent();
    __Porffor_consolePrint(args[i]);

    if (i != argLen) Porffor.printStatic(' ');
  }

  Porffor.printStatic('\n');
};

export const __console_assert = (assertion: any, ...args: any[]) => {
  if (assertion) return;

  __Porffor_consoleIndent();
  Porffor.printStatic('Assertion failed');
  if (args.length != 0) {
    Porffor.printStatic(': ');
  }

  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_consolePrint(args[i]);
    if (i != argLen) Porffor.printStatic(' ');
  }

  Porffor.printStatic('\n');
};

export const __Porffor_dirObject = (obj: any, colors: boolean, depth: i32, showHidden: boolean) => {
  if (Porffor.rawType(obj) != Porffor.TYPES.object || depth == 0) {
    __Porffor_print(obj, colors);
    return;
  }

  Porffor.printStatic('{ ');

  const keys = __Object_keys(obj);
  const keysLen = keys.length - 1;
  for (let i = 0; i <= keysLen; i++) {
    const key = keys[i];
    __Porffor_consolePrint(key);
    Porffor.printStatic(': ');

    const value = __Porffor_object_get(obj, key);
    __Porffor_dirObject(value, colors, depth - 1, showHidden);

    if (i != keysLen) Porffor.printStatic(', ');
  }

  Porffor.printStatic(' }');
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
  Porffor.printStatic('\n');
};

export const __console_dirxml = (obj: any) => __console_dir(obj);

const countMap = new Map();
export const __console_count = (label: any) => {
  label ??= 'default';
  const val = (countMap.get(label) ?? 0) + 1;
  countMap.set(label, val);

  __Porffor_consoleIndent();
  __Porffor_consolePrint(label);
  Porffor.printStatic(': ');
  print(val);
  Porffor.printStatic('\n');
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
    Porffor.printStatic("Warning: Timer '");
    __Porffor_consolePrint(label);
    Porffor.printStatic("' already exists for console.time()\n");
  }

  timeMap.set(label, performance.now());
};

export const __console_timeLog = (label: any) => {
  label ??= 'default';
  __Porffor_consoleIndent();

  const val = timeMap.get(label);
  if (!val) {
    Porffor.printStatic("Timer '");
    __Porffor_consolePrint(label);
    Porffor.printStatic("' does not exist\n");
    return;
  }

  __Porffor_consolePrint(label);
  Porffor.printStatic(': ');

  print(performance.now() - val);
  Porffor.printStatic(' ms\n');
};

export const __console_timeEnd = (label: any) => {
  label ??= 'default';

  __console_timeLog(label);
  timeMap.delete(label);
};