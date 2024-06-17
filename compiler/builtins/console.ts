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

export const __Porffor_print = (arg: any, colors: boolean = true) => {
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
      __Porffor_printBytestring(arg);
      return;
    case Porffor.TYPES.string:
      __Porffor_printString(arg);
      return;
    case Porffor.TYPES.array:
      printStatic('[ ')
      const arrLen: i32 = arg.length;
      for (let i: i32 = 0; i < arrLen; i++) {
        __Porffor_print(arg[i]);
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
    default:
      __Porffor_printBytestring(ecma262.ToString(arg));
      return
  }
}

export const __console_clear = () => {
  printStatic('\x1b[1;1H\x1b[J');
}

export const __console_log = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printStatic(' ');
  }
  printStatic('\n');
}

export const __console_debug = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printStatic(' '); // space
  }
  printStatic('\n'); // newline
}

export const __console_info = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printStatic(' '); // space
  }
  printStatic('\n'); // newline
}

export const __console_warn = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printStatic(' '); // space
  }
  printStatic('\n'); // newline
}

export const __console_error = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printStatic(' '); // space
  }
  printStatic('\n'); // newline
}

export const __console_assert = (assertion: any, ...args: any[]) => {
  if (assertion) return;
  printStatic('Assertion failed');
  if (args.length != 0) {
    printStatic(': ');
  }
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printStatic(' '); // space
  }
  printStatic('\n'); // newline
}
