export type i32 = number;
export type i64 = number;
export type f64 = number;
export type bytestring = string;

type PorfforGlobal = {
  wasm: {
    (...args: any[]): any;
    i32: {
      load(pointer: i32, align: i32, offset: i32): i32;
      store(pointer: i32, value: i32, align: i32, offset: i32): i32;
      load8_u(pointer: i32, align: i32, offset: i32): i32;
      store8(pointer: i32, value: i32, align: i32, offset: i32): i32;
      load16_u(pointer: i32, align: i32, offset: i32): i32;
      store16(pointer: i32, value: i32, align: i32, offset: i32): i32;
      const(value: i32): i32;
    }

    f64: {
      load(pointer: i32, align: i32, offset: i32): i32;
      store(pointer: i32, value: f64, align: i32, offset: i32): f64;
    }
  }

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

    _array: i32;
    _regexp: i32;
    _bytestring: i32;
    _date: i32;
  }

  fastOr(...args: any): boolean;
  fastAnd(...args: any): boolean;

  s(...args: any): string;
  bs(...args: any): bytestring;
};

declare global {
  const Porffor: PorfforGlobal;

  type i32 = number;
  type i64 = number;
  type f64 = number;
  type bytestring = string;
}