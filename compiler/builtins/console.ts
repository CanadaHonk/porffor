import type {} from './porffor.d.ts';

export const __Porffor_printBytestring = (arg: bytestring) => {
  let argPtr: i32 = Porffor.wasm`local.get ${arg}`;
  const numPtrEnd: i32 = argPtr + arg.length;
  while (argPtr < numPtrEnd) {
    printChar(Porffor.wasm.i32.load8_u(argPtr++, 0, 4))
  }
}

export const __Porffor_printString = (arg: string) => {
  let argPtr: i32 = Porffor.wasm`local.get ${arg}`;
  const numPtrEnd: i32 = argPtr + arg.length;
  while (argPtr < numPtrEnd) {
    printChar(Porffor.wasm.i32.load16_u(argPtr, 0, 4))
    argPtr += 2;
  }
}

export const __Porffor_printHexDigit = (arg: number) => {
  switch (arg) {
    case 0xf: printStatic('f'); return;
    case 0xe: printStatic('e'); return;
    case 0xd: printStatic('d'); return;
    case 0xc: printStatic('c'); return;
    case 0xb: printStatic('b'); return;
    case 0xa: printStatic('a'); return;
    default:  print(arg);
  }
}

export const __Porffor_print = (arg: any, colors: boolean = true) => {
  // todo: Symbol.toStringTag could reduce lots of duplication here
  // typed arrays, weakmap/weakset, (shared)arraybuffer

  switch (Porffor.rawType(arg)) {
    case Porffor.TYPES.number:
      if (colors) printStatic('\x1b[33m'); // yellow
      print(arg);
      if (colors) printStatic('\x1b[m'); // yellow end
      return;
    case Porffor.TYPES.boolean:
      if (colors) printStatic('\x1b[33m'); // yellow
      if (arg) {
        printStatic('true');
      } else {
        printStatic('false');
      }
      if (colors) printStatic('\x1b[m'); // yellow end
      return;
    case Porffor.TYPES.bytestring:
      if (colors) printStatic("\x1b[32m"); // green
      printStatic("'");
      __Porffor_printBytestring(arg);
      printStatic("'");
      if (colors) printStatic("\x1b[m"); // green end
      return;
    case Porffor.TYPES.string:
      if (colors) printStatic("\x1b[32m"); // green
      printStatic("'");
      __Porffor_printString(arg);
      printStatic("'");
      if (colors) printStatic("\x1b[m"); // green end
      return;
    case Porffor.TYPES.array:
      printStatic('[ ')
      const arrLen: i32 = arg.length - 1;
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ')
      }
      printStatic(' ]')
      return;
    case Porffor.TYPES.empty:
    case Porffor.TYPES.undefined:
      if (colors) printStatic('\x1b[2m'); // dim
      printStatic('undefined')
      if (colors) printStatic('\x1b[0m'); // dim end
      return;
    case Porffor.TYPES.object:
      if (arg) {
        if (colors) printStatic('\x1b[34m'); // blue
        printStatic('[Object]')
        if (colors) printStatic('\x1b[m'); // blue end
      } else {
        if (colors) printStatic('\x1b[1m'); // bold
        printStatic('null')
        if (colors) printStatic('\x1b[m'); // bold end
      }
      return;
    case Porffor.TYPES.function:
      // todo: this actually doesn't work because we don't have function name information at runtime
      printStatic('[Function ');
      __Porffor_printBytestring(arg.name);
      printStatic(']');
      return;
    case Porffor.TYPES.date:
      if (colors) printStatic('\x1b[35m'); // purple
      __Porffor_printBytestring(__Date_prototype_toISOString(arg))
      if (colors) printStatic('\x1b[m'); // purple end
      return;
    case Porffor.TYPES.symbol:
      if (colors) printStatic("\x1b[32m"); // green
      __Porffor_printBytestring(__Symbol_prototype_toString(arg));
      if (colors) printStatic("\x1b[m"); // green end
      return
    case Porffor.TYPES.uint8array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Uint8Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.int8array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Int8Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.uint8clampedarray: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Uint8ClampedArray(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.uint16array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Uint16Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.int16array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Int16Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.uint32array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Uint32Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.int32array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Int32Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.float32array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Float32Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.float64array: {
      const arrLen: i32 = arg.length - 1;
      printStatic('Float64Array(');
      print(arrLen + 1);
      printStatic(') [ ');
      for (let i: i32 = 0; i <= arrLen; i++) {
        __Porffor_print(arg[i], colors);
        if (i != arrLen) printStatic(', ');
      }
      printStatic(' ]');
      return;
    }
    case Porffor.TYPES.sharedarraybuffer:{
      printStatic('SharedArrayBuffer {\n');
      if (colors) printStatic('\x1b[34m'); // blue
      printStatic('  [Uint8Contents]');
      if (colors) printStatic('\x1b[m'); // blue end
      printStatic(": <");
      const buffer = new Uint8Array(arg);
      const bufferLen = buffer.length - 1;
      for (let i = 0; i <= bufferLen; i++) {
        const ele = buffer[i];
        __Porffor_printHexDigit((ele & 0xF0) / 16);
        __Porffor_printHexDigit(ele & 0xF);
        if (i != bufferLen) printStatic(' ');
      }
      printStatic(">,\n  byteLength: ");
      if (colors) printStatic('\x1b[33m'); // yellow
      print(arg.byteLength);
      if (colors) printStatic('\x1b[m'); // yellow end
      printStatic('\n}');
      return;
    }
    case Porffor.TYPES.arraybuffer: {
      printStatic('ArrayBuffer { ');
      if (colors) printStatic('\x1b[34m'); // blue
      printStatic('[Uint8Contents]');
      if (colors) printStatic('\x1b[m'); // blue end
      printStatic(": <");
      const buffer = new Uint8Array(arg);
      const bufferLen = buffer.length - 1;
      for (let i = 0; i <= bufferLen; i++) {
        const ele = buffer[i];
        __Porffor_printHexDigit((ele & 0xF0) / 16);
        __Porffor_printHexDigit(ele & 0xF);
        if (i != bufferLen) printStatic(' ');
      }
      printStatic(">, byteLength: ");
      __Porffor_print(arg.byteLength, colors);
      printStatic(' }');
      return;
    }
    case Porffor.TYPES.dataview: {
      printStatic('DataView { ');
      printStatic("byteLength: ");
      __Porffor_print(arg.byteLength, colors);
      printStatic(", byteOffset: ");
      __Porffor_print(arg.byteOffset, colors);
      printStatic(", buffer: ");
      __Porffor_print(arg.buffer, colors);
      printStatic(' }');
      return;
    }
    case Porffor.TYPES.weakref:
      printStatic('WeakRef {}');
      return;
    case Porffor.TYPES.weakmap: {
      const map = __Map_prototype_keys(arg);
      const mapLen: i32 = map.length - 1;
      printStatic('WeakMap(');
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
    }
    case Porffor.TYPES.map: {
      const map = __Map_prototype_keys(arg);
      const mapLen: i32 = map.length - 1;
      printStatic('Map(');
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
    }
    case Porffor.TYPES.weakset: {
      const set = __Set_prototype_values(arg);
      const setLen: i32 = set.length - 1;
      printStatic('WeakSet(');
      print(setLen + 1);
      printStatic(') { ');
      for (let i: i32 = 0; i <= setLen; i++) {
        __Porffor_print(set[i], colors);
        if (i != setLen) printStatic(', ');
      }
      printStatic(' }');
      return;
    }
    case Porffor.TYPES.set: {
      const set = __Set_prototype_values(arg);
      const setLen: i32 = set.length - 1;
      printStatic('Set(');
      print(setLen + 1);
      printStatic(') { ');
      for (let i: i32 = 0; i <= setLen; i++) {
        __Porffor_print(set[i], colors);
        if (i != setLen) printStatic(', ');
      }
      printStatic(' }');
      return;
    }
    case Porffor.TYPES.regexp:
      // todo: we currently have no way of getting the source text, so this falls back to toString
    default:
      __Porffor_printBytestring(arg.toString());
      return
  }
}

let tabLevel = 0;

export const __Porffor_printTabs = () => {
  for (let i = 0; i < tabLevel; i++) {
    printStatic('\t');
  }
}

export const __console_clear = () => {
  printStatic('\x1b[1;1H\x1b[J');
  tabLevel = 0;
}

export const __Porffor_consolePrint = (arg: any) => {
  switch (Porffor.rawType(arg)) {
    case Porffor.TYPES.bytestring:
      __Porffor_printBytestring(arg);
      return;
    case Porffor.TYPES.string:
      __Porffor_printString(arg);
      return;
    default:
      __Porffor_print(arg);
  }
}

export const __console_group = (label: bytestring) => {
  if (Porffor.rawType(label) != Porffor.TYPES.undefined) __Porffor_consolePrint(label);
  tabLevel++;
}

export const __console_groupCollapsed = (label: bytestring) => __console_group(label);

export const __console_groupEnd = (label: bytestring) => {
  if (Porffor.rawType(label) != Porffor.TYPES.undefined) __Porffor_consolePrint(label);
  tabLevel--;
  if (tabLevel < 0) tabLevel = 0;
}

export const __console_log = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_printTabs();
    __Porffor_consolePrint(args[i]);
    if (i != argLen) printStatic(' ');
  }
  printStatic('\n');
}

export const __console_debug = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_printTabs();
    __Porffor_consolePrint(args[i]);
    if (i != argLen) printStatic(' ');
  }
  printStatic('\n');
}

export const __console_info = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_printTabs();
    __Porffor_consolePrint(args[i]);
    if (i != argLen) printStatic(' ');
  }
  printStatic('\n');
}

export const __console_warn = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_printTabs();
    __Porffor_consolePrint(args[i]);
    if (i != argLen) printStatic(' '); // space
  }
  printStatic('\n'); // newline
}

export const __console_error = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_printTabs();
    __Porffor_consolePrint(args[i]);
    if (i != argLen) printStatic(' ');
  }
  printStatic('\n');
}

export const __console_assert = (assertion: any, ...args: any[]) => {
  if (assertion) return;
  __Porffor_printTabs();
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
}

export const __Porffor_dirObject = (obj: any, colors: boolean, depth: i32, showHidden: boolean) => {
  if (Porffor.rawType(obj) != Porffor.TYPES.object || depth == 0) {
    __Porffor_print(obj, colors);
    return;
  }
  const keys = __Map_prototype_keys(obj);

  printStatic('{ ');
  const keysLen = keys.length - 1;
  for (let i = 0; i <= keysLen; i++) {
    const key = keys[i];
    const value = __Map_prototype_get(obj, key);
    if (Porffor.rawType(i) == Porffor.TYPES.bytestring) {
      __Porffor_printBytestring(key);
      } else {
      __Porffor_printString(key);
    }
    printStatic(': ');

    __Porffor_dirObject(value, colors, depth - 1, showHidden);

    if (i != keysLen) printStatic(','); // comma
  }
  printStatic(' }');
}

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

  __Porffor_printTabs();
  __Porffor_dirObject(obj, colors, depth, showHidden);
  printStatic('\n');
}

export const __console_dirxml = (obj: any) => __console_dir(obj);