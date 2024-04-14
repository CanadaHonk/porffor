export type i32 = number;
export type i64 = number;
export type bytestring = string;

type PorfforGlobal = {
  wasm: {
    (...args: any[]): any;
    i32: {
      or: (a: i32, b: i32) => i32;

      load: (pointer: i32, align: i32, offset: i32) => i32;
      store: (pointer: i32, value: i32, align: i32, offset: i32) => i32;
      load8_u: (pointer: i32, align: i32, offset: i32) => i32;
      store8: (pointer: i32, value: i32, align: i32, offset: i32) => i32;
      load16_u: (pointer: i32, align: i32, offset: i32) => i32;
      store16: (pointer: i32, value: i32, align: i32, offset: i32) => i32;
    }
  }
  ptr: (obj: any) => i32;

  i32: {
    ptr: (obj: any) => i32;
    ptrUnsafe: (obj: any) => i32;

    random: () => i32;
    randomByte: () => i32;
  }

  type: (x: any) => bytestring;
  rawType: (x: any) => i32;
  TYPES: Record<string, i32>;

  fastOr: (...args: any) => boolean;
  fastAnd: (...args: any) => boolean;
};

declare global {
  const Porffor: PorfforGlobal;

  type i32 = number;
  type i64 = number;
  type bytestring = string;
}