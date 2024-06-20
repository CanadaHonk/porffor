import type {} from './porffor.d.ts';

const descStore: any[] = new Array(0);

// 20.4.1.1 Symbol ([ description ])
// https://tc39.es/ecma262/#sec-symbol-description
export const Symbol = (description: any): Symbol => {
  // 1. If NewTarget is not undefined, throw a TypeError exception.
  // This is an arrow function so happens implicitly

  // 2. If description is undefined, let descString be undefined.
  let descString: any = undefined;

  // 3. Else, let descString be ? ToString(description).
  if (Porffor.rawType(description) != Porffor.TYPES.undefined) {
    descString = ecma262.ToString(description);
  }

  // 4. Return a new Symbol whose [[Description]] is descString.
  const sym: Symbol = Porffor.fastPush(descStore, descString);
  return sym;
};

export const __Symbol_prototype_description$get = (_this: Symbol) => {
  return descStore[Porffor.wasm`local.get ${_this}` - 1];
};

export const __Symbol_prototype_toString = (_this: Symbol) => {
  let out: bytestring = Porffor.allocate();

  // Symbol(
  Porffor.wasm.i32.store8(out, 83, 0, 4);
  Porffor.wasm.i32.store8(out, 121, 0, 5);
  Porffor.wasm.i32.store8(out, 109, 0, 6);
  Porffor.wasm.i32.store8(out, 98, 0, 7);
  Porffor.wasm.i32.store8(out, 111, 0, 8);
  Porffor.wasm.i32.store8(out, 108, 0, 9);
  Porffor.wasm.i32.store8(out, 40, 0, 10);

  const description: any = _this.description;
  let descLen: i32 = 0;
  if (description !== undefined) {
    descLen = description.length;

    // todo: support regular string
    let outPtr: i32 = Porffor.wasm`local.get ${out}` + 7;
    let descPtr: i32 = Porffor.wasm`local.get ${description}`;
    const descPtrEnd: i32 = descPtr + descLen;
    while (descPtr < descPtrEnd) {
      Porffor.wasm.i32.store8(outPtr++, Porffor.wasm.i32.load8_u(descPtr++, 0, 4), 0, 4);
    }
  }

  // )
  Porffor.wasm.i32.store8(Porffor.wasm`local.get ${out}` + descLen, 41, 0, 11);

  out.length = 8 + descLen;

  return out;
};

export const __Symbol_prototype_toLocaleString = (_this: Symbol) => __Symbol_prototype_toString(_this);

export const __Symbol_prototype_valueOf = (_this: Symbol) => {
  return _this;
};

const forStore: Map = new Map();
export const __Symbol_for = (key: any): Symbol => {
  if (forStore.has(key)) return forStore.get(key);

  const out: Symbol = Symbol(key);
  forStore.set(key, out);

  return out;
};

export const __Symbol_keyFor = (arg: any): any => {
  if (Porffor.rawType(arg) != Porffor.TYPES.symbol) throw new TypeError('Symbol.keyFor argument should be a Symbol');

  const sym: Symbol = arg;
  const desc: any = sym.description;

  const stored: Symbol = forStore.get(desc);
  if (sym == stored) return desc;

  return undefined;
};