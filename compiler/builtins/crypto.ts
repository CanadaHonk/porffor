// @porf -funsafe-no-unlikely-proto-checks -valtype=i32

import type { i32, bytestring } from './porffor.d.ts';

export const __crypto_randomUUID = (): bytestring => {
  let bytes: bytestring = '................';

  let bytesPtr: i32 = Porffor.i32.ptrUnsafe(bytes);

  let a: i32 = bytesPtr;
  let aEndPtr: i32 = a + 16;
  while (a < aEndPtr) {
    Porffor.wasm.i32.store8(a++, Porffor.i32.randomByte(), 0, 4);
  }

  // bytes[6] = (bytes[6] & 0b00001111) | 0b01000000
  Porffor.wasm.i32.store8(
    bytesPtr,
    (Porffor.wasm.i32.load8_u(bytesPtr, 0, 10) & 0b00001111) | 0b01000000,
    0,
    10 // 4 + 6
  );

  // bytes[8] = (bytes[8] & 0b00111111) | 0b10000000
  Porffor.wasm.i32.store8(
    bytesPtr,
    (Porffor.wasm.i32.load8_u(bytesPtr, 0, 12) & 0b00111111) | 0b10000000,
    0,
    12 // 4 + 8
  );

  let output: bytestring = '------------------------------------';

  let i: i32 = Porffor.i32.ptrUnsafe(output);
  let j: i32 = bytesPtr;

  // bytes[0..4]-bytes[4..6]-bytes[6..8]-bytes[8..10]-bytes[10..15]
  // 00112233-4455-6677-8899-aabbccddeeff

  // bytes[0..4]-
  let endPtr: i32 = i + 8;
  while (i < endPtr) {
    const byte = Porffor.wasm.i32.load8_u(j++, 0, 4);

    let lower = byte & 0xf;
    if (lower < 10) lower = 48 + lower;
      else lower = 97 + (lower - 10);

    let upper = byte >> 4;
    if (upper < 10) upper = 48 + upper;
      else upper = 97 + (upper - 10);

    Porffor.wasm.i32.store8(i++, upper, 0, 4);
    Porffor.wasm.i32.store8(i++, lower, 0, 4);
  }
  i++;

  // bytes[4..6]-
  endPtr = i + 4;
  while (i < endPtr) {
    const byte = Porffor.wasm.i32.load8_u(j++, 0, 4);

    let lower = byte & 0xf;
    if (lower < 10) lower = 48 + lower;
      else lower = 97 + (lower - 10);

    let upper = byte >> 4;
    if (upper < 10) upper = 48 + upper;
      else upper = 97 + (upper - 10);

    Porffor.wasm.i32.store8(i++, upper, 0, 4);
    Porffor.wasm.i32.store8(i++, lower, 0, 4);
  }
  i++;

  // bytes[6..8]-
  endPtr = i + 4;
  while (i < endPtr) {
    const byte = Porffor.wasm.i32.load8_u(j++, 0, 4);

    let lower = byte & 0xf;
    if (lower < 10) lower = 48 + lower;
      else lower = 97 + (lower - 10);

    let upper = byte >> 4;
    if (upper < 10) upper = 48 + upper;
      else upper = 97 + (upper - 10);

    Porffor.wasm.i32.store8(i++, upper, 0, 4);
    Porffor.wasm.i32.store8(i++, lower, 0, 4);
  }
  i++;

  // bytes[8..10]-
  endPtr = i + 4;
  while (i < endPtr) {
    const byte = Porffor.wasm.i32.load8_u(j++, 0, 4);

    let lower = byte & 0xf;
    if (lower < 10) lower = 48 + lower;
      else lower = 97 + (lower - 10);

    let upper = byte >> 4;
    if (upper < 10) upper = 48 + upper;
      else upper = 97 + (upper - 10);

    Porffor.wasm.i32.store8(i++, upper, 0, 4);
    Porffor.wasm.i32.store8(i++, lower, 0, 4);
  }
  i++;

  // bytes[10..15]
  endPtr = i + 12;
  while (i < endPtr) {
    const byte = Porffor.wasm.i32.load8_u(j++, 0, 4);

    let lower = byte & 0xf;
    if (lower < 10) lower = 48 + lower;
      else lower = 97 + (lower - 10);

    let upper = byte >> 4;
    if (upper < 10) upper = 48 + upper;
      else upper = 97 + (upper - 10);

    Porffor.wasm.i32.store8(i++, upper, 0, 4);
    Porffor.wasm.i32.store8(i++, lower, 0, 4);
  }
  i++;


  return output;
};