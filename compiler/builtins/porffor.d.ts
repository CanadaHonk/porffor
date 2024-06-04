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

    memory: {
      copy(dest: any, source: any, bytes: i32)
    }
  }

  allocatePage<T>(): T;
  allocateBytes<T>(bytes: i32): T;

  set: {
    read(_this: any, index: number): i32;
    write(_this: any, index: number, value: any): boolean;
  }

  bytestring: {
    // defined in porffor.ts
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
  }

  fastOr(...args: any): boolean;
  fastAnd(...args: any): boolean;

  s(...args: any): string;
  bs(...args: any): bytestring;

  readArgv(index: i32, out: bytestring): i32;
  readFile(path: bytestring, out: bytestring): i32;
};

declare global {
  const Porffor: PorfforGlobal;

  type i32 = number;
  type i64 = number;
  type f64 = number;
  type bytestring = string;
}