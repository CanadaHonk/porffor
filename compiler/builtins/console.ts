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

export const __Porffor_print = (arg: any) => {
  switch (Porffor.rawType(arg)) {
    case Porffor.TYPES.number:
      print(arg);
      return;
    case Porffor.TYPES.boolean:
      if (arg) {
        printChar(116); // t
        printChar(114); // r
        printChar(117); // u
        printChar(101); // e
      } else {
        printChar(102); // f
        printChar(97);  // a
        printChar(108); // l
        printChar(115); // s
        printChar(101); // e
      }
      return;
    case Porffor.TYPES.bytestring:
      __Porffor_printBytestring(arg);
      return;
    case Porffor.TYPES.string:
      __Porffor_printString(arg);
      return;
    case Porffor.TYPES.array:
      printChar(91); // [
      printChar(32); // space
      const arrLen: i32 = arg.length;
      for (let i: i32 = 0; i < arrLen; i++) {
        __Porffor_printString(arg[i]);
        if (i != arrLen) {
          printChar(44); // comma
          printChar(32); // space
        }
      }
      printChar(32); // space
      printChar(91); // ]
      return;
    case Porffor.TYPES.empty:
    case Porffor.TYPES.undefined:
      printChar(117); // u
      printChar(110); // n
      printChar(100); // d
      printChar(101); // e
      printChar(102); // f
      printChar(105); // i
      printChar(110); // n
      printChar(101); // e
      printChar(100); // d
      return;
    case Porffor.TYPES.object:
      if (arg) {
        // todo: print keys and vals
        printChar(123); // {
        printChar(125); // }
      } else {
        printChar(110); // n
        printChar(117); // u
        printChar(108); // l
        printChar(108); // l
      }
      return;
    default:
      __Porffor_printBytestring(ecma262.ToString(arg));
      return
  }
}

export const __console_clear = () => {
  const clear: bytestring = '\x1b[1;1H\x1b[J';
  __Porffor_printBytestring(clear);
}

export const __console_log = (...args: any[]) => {
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printChar(32); // space
  }
  printChar(10); // newline
}

export const __console_assert = (assertion: any, ...args: any[]) => {
  if (assertion) return;
  const str: bytestring = 'Assertion failed';
  __Porffor_printBytestring(str);
  if (args.length != 0) {
    printChar(58); // :
    printChar(32); // space
  }
  const argLen: i32 = args.length - 1;
  for (let i = 0; i <= argLen; i++) {
    __Porffor_print(args[i]);
    if (i != argLen) printChar(32); // space
  }
  printChar(10); // newline
}
