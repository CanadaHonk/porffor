export type i32 = number;
export type i64 = number;
export type f64 = number;
export type bytestring = string;

export type BooleanObject = Boolean;
export type NumberObject = Number;
export type StringObject = String;

type PorfforGlobal = {
  malloc(bytes?: i32): any;
  memorySize(): i32;
  gc(): void;
  c(strings: TemplateStringsArray, ...values: any[]): void;

  // coroutines (render.js runtime): resume delivers value to the suspend point
  // (mode 0 = next, 1 = throw, 2 = return), returns done. value = last yielded/returned
  coroutine: {
    resume(gen: any, value: any, mode: i32): boolean;
    value(gen: any): any;
  }

  IR: {
    loadU8(ptr: any, offset?: i32): i32;   loadI8(ptr: any, offset?: i32): i32;
    loadU16(ptr: any, offset?: i32): i32;  loadI16(ptr: any, offset?: i32): i32;
    loadI32(ptr: any, offset?: i32): i32;  loadU32(ptr: any, offset?: i32): i32;
    loadI64(ptr: any, offset?: i32): i64;  loadU64(ptr: any, offset?: i32): i64;
    loadF32(ptr: any, offset?: i32): f64;  loadF64(ptr: any, offset?: i32): f64;
    loadJv(ptr: any, offset?: i32): any;
    loadUnF64(ptr: any, offset?: i32): f64;
    storeU8(ptr: any, offset: i32, value: i32): void;   storeI8(ptr: any, offset: i32, value: i32): void;
    storeU16(ptr: any, offset: i32, value: i32): void;  storeI16(ptr: any, offset: i32, value: i32): void;
    storeI32(ptr: any, offset: i32, value: i32): void;  storeU32(ptr: any, offset: i32, value: i32): void;
    storeI64(ptr: any, offset: i32, value: i64): void;  storeU64(ptr: any, offset: i32, value: i64): void;
    storeF32(ptr: any, offset: i32, value: f64): void;  storeF64(ptr: any, offset: i32, value: f64): void;
    storeJv(ptr: any, offset: i32, value: any): void;
    storeUnF64(ptr: any, offset: i32, value: f64): void;
    copy(dst: any, src: any, bytes: i32): void;
    fill(dst: any, byte: i32, bytes: i32): void;
    ptr(value: any): i32;
    gcBarrier(ptr: any, type: i32): void;
    gcBarrierValue(ptr: any, type: i32, value: any): void;
    bitsToF32(value: i32): f64;
    f32ToBits(value: f64): i32;
    bitsToF64(value: i64): f64;
    f64ToBits(value: f64): i64;
  }

  array: {
    new(capacity: i32): any[];
    fastPush(arr: any[], el: any): i32;
  }

  arraybuffer: {
    detach(buffer: any): void;
  }

  object: {
    new(capacity?: i32): object;
    entriesPtr(obj: object): i32;
    ensureCapacity(obj: object, needed: i32): i32;

    preventExtensions(obj: object): void;
    isInextensible(obj: object): boolean;

    overrideAllFlags(obj: object, overrideOr: i32, overrideAnd: i32): void;
    checkAllFlags(obj: object, dataAnd: i32, accessorAnd: i32, dataExpected: i32, accessorExpected: i32): boolean;

    accessorGet(entryPtr: i32): Function;
    accessorSet(entryPtr: i32): Function;

    lookup(obj: object, target: any): i32;
    get(obj: any, key: any): any;

    writeKey(ptr: i32, key: any, hash: i32): void;
    set(obj: object, key: any, value: any): any;
    define(obj: object, key: any, value: any, flags: i32): void;
    defineAccessor(obj: object, key: any, get: any, set: any, flags: i32): void;
    delete(obj: object, key: any): boolean;

    isEnumerable(entryPtr: i32): boolean;

    isObject(arg: any): boolean;
    isObjectOrNull(arg: any): boolean;
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
    appendStr(str: bytestring, appendage: bytestring): i32;
    appendChar(str: bytestring, char: i32): i32;
    append2Char(str: bytestring, char1: i32, char2: i32): i32;
    appendPadNum(str: bytestring, num: number, len: number): i32;
  }

  number: {
    getExponent(v: f64): i32;
  }

  printStatic(str: string): void;

  type(x: any): i32;
  as<T = any>(value: any, type: i32): T;
  typeName(type: i32): bytestring;
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

  call(func: any, argArray: any[], thisArg: any, newTarget: any): any;
  callThis(func: any, thisArg: any, ...args: any[]): any;

  fastOr(...args: any): boolean;
  fastAnd(...args: any): boolean;

  s(...args: any): string;
  bs(...args: any): bytestring;
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
    IsConstructor(argument: unknown): boolean;
  }

  const threadSpawn: (fn: any, fnType: i32, args: any, argsType: i32, promise: any, promiseType: i32) => void;
  const threadYield: () => void;
  const threadFence: () => void;
  const threadLockNew: () => number;
  const threadTryLock: (lock: number) => number;
  const threadUnlock: (lock: number) => void;
  const threadAvailable: () => number;
  const threadParkPrepare: (key: number) => number;
  const threadPark: (key: number, gen: number) => void;
  const threadWake: (key: number) => void;
  const threadWakeOne: (key: number) => void;

  const __Porffor_promise_create: () => any[];
  const __Promise_resolve: (value: any) => Promise<any>;
  const __Porffor_mallocShared: (bytes: i32) => i32;
  const __Porffor_object_newShared: (capacity?: i32) => object;

  type i32 = number;
  type i64 = number;
  type f64 = number;
  type bytestring = string;

  type BooleanObject = Boolean;
  type NumberObject = Number;
  type StringObject = String;
}
