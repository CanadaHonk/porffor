// @porf -funsafe-no-unlikely-proto-checks -valtype=i32

export const __String_fromCharCode = (code: i32) => {
  // todo: support >1 arg
  if (code < 256) {
    let out: bytestring = '.';
    Porffor.wasm.i32.store8(out, code, 0, 4);
    return out;
  }

  let out: string = '.';
  Porffor.wasm.i32.store16(out, code, 0, 4);
  return out;
};

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

  const endPtr: i32 = i + len;
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

  const endPtr: i32 = i + len;
  while (i < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

    if (chr >= 65 && chr <= 90) chr += 32;

    Porffor.wasm.i32.store8(j++, chr, 0, 4);
  }

  return out;
};


export const __String_prototype_startsWith = (_this: string, searchString: string, position: number) => {
  // todo/perf: investigate whether for counter vs while ++s are faster

  const thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  // todo: handle non-integer and non-finite position
  let i: i32 = 0;
  i += position * 2;

  const searchLen: i32 = searchString.length * 2;
  for (; i < searchLen; i += 2) {
    let chr: i32 = Porffor.wasm.i32.load16_u(thisPtr + i, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load16_u(searchPtr + i, 0, 4);

    if (chr != expected) return false;
  }

  return true;
};

export const ___bytestring_prototype_startsWith = (_this: bytestring, searchString: bytestring, position: number) => {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES._bytestring) return false;

  // todo/perf: investigate whether for counter vs while ++s are faster

  const thisPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const searchPtr: i32 = Porffor.wasm`local.get ${searchString}`;

  // todo: handle non-integer and non-finite position
  let i: i32 = 0;
  i += position;

  const searchLen: i32 = searchString.length;
  for (; i < searchLen; i++) {
    let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr + i, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load8_u(searchPtr + i, 0, 4);

    if (chr != expected) return false;
  }

  return true;
};


export const __String_prototype_endsWith = (_this: bytestring, searchString: bytestring, endPosition: number) => {
  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

  i += ((endPosition ?? _this.length) - searchLen) * 2;

  const endPtr: i32 = j + searchLen * 2;
  while (j < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load16_u(j, 0, 4);

    i += 2;
    j += 2;

    if (chr != expected) return false;
  }

  return true;
};

export const ___bytestring_prototype_endsWith = (_this: bytestring, searchString: bytestring, endPosition: number) => {
  // if searching non-bytestring, bytestring will not start with it
  // todo: change this to just check if = string and ToString others
  if (Porffor.wasm`local.get ${searchString+1}` != Porffor.TYPES._bytestring) return false;

  let i: i32 = Porffor.wasm`local.get ${_this}`,
      j: i32 = Porffor.wasm`local.get ${searchString}`;

  const searchLen: i32 = searchString.length;

  i += (endPosition ?? _this.length) - searchLen;

  const endPtr: i32 = j + searchLen;
  while (j < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);
    let expected: i32 = Porffor.wasm.i32.load8_u(j++, 0, 4);

    if (chr != expected) return false;
  }

  return true;
};