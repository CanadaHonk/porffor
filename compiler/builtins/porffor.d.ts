export type i32 = number;
export type i64 = number;
export type f64 = number;
export type bytestring = string;

type PorfforGlobal = {
  wasm: {
    (...args: any[]): any;
    i32: {
      load(pointer: any, align: i32, offset: i32): i32;
      store(pointer: any, value: i32, align: i32, offset: i32): i32;
      load8_u(pointer: any, align: i32, offset: i32): i32;
      store8(pointer: any, value: i32, align: i32, offset: i32): i32;
      load16_u(pointer: any, align: i32, offset: i32): i32;
      store16(pointer: any, value: i32, align: i32, offset: i32): i32;
      const(value: i32): i32;
    }

    f64: {
      load(pointer: any, align: i32, offset: i32): i32;
      store(pointer: any, value: f64, align: i32, offset: i32): f64;
    }
  }

  allocate(): any;
  allocateBytes(bytes: i32): any;

  set: {
    read(ptr: any, index: number): i32;
    write(ptr: any, index: number, value: any): boolean;
  }

  array: {
    fastPush(arr: any[], el: any): i32;
  }

  arraybuffer: {
    detach(buffer: any): void;
  }

  object: {
    preventExtensions(obj: object): void;
    isInextensible(obj: object): boolean;

    overrideAllFlags(obj: object, overrideOr: i32, overrideAnd: i32): void;
    checkAllFlags(obj: object, dataAnd: i32, accessorAnd: i32, dataExpected: i32, accessorExpected: i32): boolean;

    packAccessor(get: any, set: any): f64;
    accessorGet(entryPtr: i32): Function;
    accessorSet(entryPtr: i32): Function;

    lookup(obj: object, target: any): i32;
    get(obj: any, key: any): any;

    writeKey(ptr: i32, key: any): void;
    set(obj: object, key: any, value: any): any;
    define(obj: object, key: any, value: any, flags: i32): void;
    delete(obj: object, key: any): boolean;

    isEnumerable(entryPtr: i32): boolean;

    isObject(arg: any): boolean;
    isObjectOrSymbol(arg: any): boolean;

    expr: {
      init(obj: object, key: any, value: any): void;
      get(obj: object, key: any, value: any): void;
      set(obj: object, key: any, value: any): void;
    }
  }

  funcLut: {
    flags(func: Function): i32;
    length(func: Function): i32;
    name(func: Function): bytestring;
  }

  bytestring: {
    // defined in date.ts
    appendStr(str: bytestring, appendage: bytestring): i32;
    appendChar(str: bytestring, char: i32): i32;
    appendPadNum(str: bytestring, num: number, len: number): i32;
  }

  print(x: any): i32;

  randomByte(): i32;

  type(x: any): bytestring;
  rawType(x: any): i32;
  TYPES: {
    number: i32;
    boolean: i32;
    string: i32;
    undefined: i32;
    object: i32;
    function: i32;
    symbol: i32;
    bigint: i32;

    array: i32;
    regexp: i32;
    bytestring: i32;
    date: i32;
    set: i32;

    [key: string]: i32;
  }

  clone(source: any, destination: any): void;

  fastOr(...args: any): boolean;
  fastAnd(...args: any): boolean;

  s(...args: any): string;
  bs(...args: any): bytestring;

  printStatic(str: string): void;
  readArgv(index: i32, out: bytestring): i32;
  readFile(path: bytestring, out: bytestring): i32;
};

declare global {
  const Porffor: PorfforGlobal;

  const ecma262: {
    ToIntegerOrInfinity(argument: unknown): number;
    ToIndex(value: unknown): number;
    ToString(argument: unknown): bytestring;
    ToNumber(argument: unknown): number;
    ToNumeric(argument: unknown): number;
    ToPropertyKey(argument: unknown): any;
  }

  const print: (arg: any) => void;
  const printChar: (char: number) => void;

  type i32 = number;
  type i64 = number;
  type f64 = number;
  type bytestring = string;
}