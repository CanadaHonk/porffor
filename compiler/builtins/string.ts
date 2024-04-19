// @porf -funsafe-no-unlikely-proto-checks -valtype=i32

export const __String_prototype_toUpperCase = (_this: string) => {
  // todo
  throw new TodoError('String.prototype.toUpperCase (non-bytestring)');
};

export const ___bytestring_prototype_toUpperCase = (_this: bytestring) => {
  const len: i32 = _this.length;

  let out: bytestring = '';
  Porffor.wasm.i32.store(out, len, 0, 0);

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;

  const endPtr = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

    if (chr >= 97 && chr <= 122) chr -= 32;

    Porffor.wasm.i32.store8(j++, chr, 0, 4);
  }

  return out;
};

export const __String_prototype_toLowerCase = (_this: string) => {
  // todo
  throw new TodoError('String.prototype.toLowerCase (non-bytestring)');
};

export const ___bytestring_prototype_toLowerCase = (_this: bytestring) => {
  const len: i32 = _this.length;

  let out: bytestring = '';
  Porffor.wasm.i32.store(out, len, 0, 0);

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${out}`;

  const endPtr = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

    if (chr >= 65 && chr <= 90) chr += 32;

    Porffor.wasm.i32.store8(j++, chr, 0, 4);
  }

  return out;
};