export type i32 = number;
export type i64 = number;
export type bytestring = string;

type PorfforGlobal = {
  wasm: {
    (...args: any[]): unknown;
    i32: {
      load8_u: (pointer: i32, align: i32, offset: i32) => i32;
      store8: (pointer: i32, value: i32, align: i32, offset: i32) => i32;
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
};

declare global {
  const Porffor: PorfforGlobal;
}