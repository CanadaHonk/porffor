// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const escape = (input: string|bytestring): bytestring => {
  // we have no byte array yet so use bytestring with 0x00 and 0x01 via escape characters
  // 0 = should escape, 1 = should not escape
  // aka if in set 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_@*+-./'
  const lut: bytestring = '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x01\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x01\x00\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00';

  const len: i32 = input.length;
  let outLength: i32 = len; // at minimum, output length = input length

  let i: i32 = Porffor.wasm`local.get ${input}`;

  if (Porffor.wasm`local.get ${input+1}` == Porffor.TYPES.bytestring) {
    const endPtr: i32 = i + len;
    while (i < endPtr) {
      const chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

      if (chr < 128) {
        if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${lut}` + chr, 0, 4)) {
          continue;
        }
      }

      outLength += 2;
    }

    if (outLength == len) return input;

    let output: bytestring = Porffor.allocate();
    output.length = outLength;

    i = Porffor.wasm`local.get ${input}`;
    let j: i32 = Porffor.wasm`local.get ${output}`;
    while (i < endPtr) {
      const chr: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);

      if (chr < 128) {
        if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${lut}` + chr, 0, 4)) {
          // append just character
          Porffor.wasm.i32.store8(j++, chr, 0, 4);
          continue;
        }
      }

      // %
      Porffor.wasm.i32.store8(j++, 37, 0, 4);

      // 8 bit integer to hex (0x12)
      let lower: i32 = (chr & 0x0f) + 48;
      if (lower > 57) lower += 7;

      let upper: i32 = (chr >> 4) + 48;
      if (upper > 57) upper += 7;

      Porffor.wasm.i32.store8(j++, upper, 0, 4);
      Porffor.wasm.i32.store8(j++, lower, 0, 4);
    }

    return output;
  }

  const endPtr: i32 = i + len * 2;
  while (i < endPtr) {
    const chr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);
    i += 2;

    if (chr < 128) {
      if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${lut}` + chr, 0, 4)) {
        continue;
      }
    }

    if (chr < 256) {
      outLength += 2;
    } else {
      outLength += 5;
    }
  }

  if (outLength == len) return input;

  let output: bytestring = Porffor.allocate();
  output.length = outLength;

  i = Porffor.wasm`local.get ${input}`;
  let j: i32 = Porffor.wasm`local.get ${output}`;

  while (i < endPtr) {
    const chr: i32 = Porffor.wasm.i32.load16_u(i, 0, 4);
    i += 2;

    if (chr < 128) {
      if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${lut}` + chr, 0, 4)) {
        // append just character
        Porffor.wasm.i32.store8(j++, chr, 0, 4);
        continue;
      }
    }

    if (chr < 256) {
      // %
      Porffor.wasm.i32.store8(j++, 37, 0, 4);

      // 8 bit integer to hex (0x12)
      let lower: i32 = (chr & 0x0f) + 48;
      if (lower > 57) lower += 7;

      let upper: i32 = (chr >> 4) + 48;
      if (upper > 57) upper += 7;

      Porffor.wasm.i32.store8(j++, upper, 0, 4);
      Porffor.wasm.i32.store8(j++, lower, 0, 4);
    } else {
      // %u
      Porffor.wasm.i32.store16(j, 29989, 0, 4);
      j += 2;

      // 16 bit integer to hex (0x1234)
      let nibble: i32 = ((chr >> 12) & 0x0f) + 48;
      if (nibble > 57) nibble += 7;
      Porffor.wasm.i32.store8(j++, nibble, 0, 4);

      nibble = ((chr >> 8) & 0x0f) + 48;
      if (nibble > 57) nibble += 7;
      Porffor.wasm.i32.store8(j++, nibble, 0, 4);

      nibble = ((chr >> 4) & 0x0f) + 48;
      if (nibble > 57) nibble += 7;
      Porffor.wasm.i32.store8(j++, nibble, 0, 4);

      nibble = (chr & 0x0f) + 48;
      if (nibble > 57) nibble += 7;
      Porffor.wasm.i32.store8(j++, nibble, 0, 4);
    }
  }

  return output;
};