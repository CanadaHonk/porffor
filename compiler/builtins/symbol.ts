import type {} from './porffor.d.ts';

// 20.4.1.1 Symbol ([ description ])
// https://tc39.es/ecma262/#sec-symbol-description
export const Symbol = (description: any): Symbol => {
  // 1. If NewTarget is not undefined, throw a TypeError exception.
  // This is an arrow function so happens implicitly

  // 2. If description is undefined, let descString be undefined.
  let descString: any = undefined;

  // 3. Else, let descString be ? ToString(description).
  if (Porffor.type(description) != Porffor.TYPES.undefined) {
    descString = ecma262.ToString(description);
  }

  // 4. Return a new Symbol whose [[Description]] is descString.
  const symbol: Symbol = Porffor.malloc(8);
  Porffor.IR.storeJv(symbol, 0, descString);
  return symbol;
};

export const __Symbol_prototype_description$get = function (this: Symbol) {
  return Porffor.IR.loadJv(this, 0);
};

export const __Symbol_prototype_toString = function (this: Symbol) {
  const out: bytestring = Porffor.malloc();

  // Symbol(
  Porffor.IR.storeU8(out, 4, 83);
  Porffor.IR.storeU8(out, 5, 121);
  Porffor.IR.storeU8(out, 6, 109);
  Porffor.IR.storeU8(out, 7, 98);
  Porffor.IR.storeU8(out, 8, 111);
  Porffor.IR.storeU8(out, 9, 108);
  Porffor.IR.storeU8(out, 10, 40);

  const description: any = this.description;
  let descLen: i32 = 0;
  if (description !== undefined) {
    descLen = description.length;

    // todo: support regular string
    let outPtr: i32 = Porffor.IR.ptr(out) + 7;
    let descPtr: i32 = Porffor.IR.ptr(description);
    const descPtrEnd: i32 = descPtr + descLen;
    while (descPtr < descPtrEnd) {
      Porffor.IR.storeU8(outPtr++, 4, Porffor.IR.loadU8(descPtr++, 4));
    }
  }

  // )
  Porffor.IR.storeU8(Porffor.IR.ptr(out) + descLen, 11, 41);

  out.length = 8 + descLen;
  return out;
};

export const __Symbol_prototype_toLocaleString = function (this: Symbol) { return Porffor.callThis(__Symbol_prototype_toString, this); };

export const __Symbol_prototype_valueOf = function (this: Symbol) {
  return this;
};

const forStore: Map = new Map();
export const __Symbol_for = (key: any): Symbol => {
  key = ecma262.ToString(key);

  if (forStore.has(key)) return forStore.get(key);

  const out: Symbol = Symbol(key);
  forStore.set(key, out);

  return out;
};

export const __Symbol_keyFor = (arg: any): any => {
  if (Porffor.type(arg) != Porffor.TYPES.symbol) throw new TypeError('Symbol.keyFor argument should be a Symbol');

  const sym: Symbol = arg;
  const desc: any = sym.description;

  const stored: Symbol = forStore.get(desc);
  if (sym == stored) return desc;

  return undefined;
};
