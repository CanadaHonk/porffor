// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const btoa = (input: bytestring): bytestring => {
  // todo: throw on invalid chars

  const keyStr: bytestring = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const keyStrPtr: i32 = Porffor.wasm`local.get ${keyStr}`;

  let len: i32 = input.length;
  let output: bytestring = Porffor.allocate();

  let i: i32 = Porffor.wasm`local.get ${input}`,
      j: i32 = Porffor.wasm`local.get ${output}`;

  // todo/perf: add some per 6 char variant using bitwise magic?

  const endPtr = i + len;
  while (i < endPtr) {
    const chr1: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);
    const chr2: i32 = i < endPtr ? Porffor.wasm.i32.load8_u(i++, 0, 4) : -1;
    const chr3: i32 = i < endPtr ? Porffor.wasm.i32.load8_u(i++, 0, 4) : -1;

    const enc1: i32 = chr1 >> 2;
    const enc2: i32 = ((chr1 & 3) << 4) | (chr2 == -1 ? 0 : (chr2 >> 4));
    let enc3: i32 = ((chr2 & 15) << 2) | (chr3 == -1 ? 0 : (chr3 >> 6));
    let enc4: i32 = chr3 & 63;

    if (chr2 == -1) {
      enc3 = 64;
      enc4 = 64;
    } else if (chr3 == -1) {
      enc4 = 64;
    }

    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc1, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc2, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc3, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc4, 0, 4), 0, 4);
  }

  output.length = j - Porffor.wasm`local.get ${output}`;
  return output;
};

export const atob = (input: bytestring): bytestring => {
  // todo: throw on non-base64 chars

  const lut: bytestring = '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@>@@@?456789:;<=@@@@@@@\x00\x01\x02\x03\x04\x05\x06\x07\b\t\n\x0B\f\r\x0E\x0F\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19@@@@@@\x1A\x1B\x1C\x1D\x1E\x1F !"#$%&\'()*+,-./0123';
  const lutPtr: i32 = Porffor.wasm`local.get ${lut}`;

  let output: bytestring = Porffor.allocate();

  let i: i32 = Porffor.wasm`local.get ${input}`,
      j: i32 = Porffor.wasm`local.get ${output}`;

  const endPtr = i + input.length;
  while (i < endPtr) {
    const enc1: i32 = Porffor.wasm.i32.load8_u(lutPtr + Porffor.wasm.i32.load8_u(i++, 0, 4), 0, 4);
    const enc2: i32 = i < endPtr ? Porffor.wasm.i32.load8_u(lutPtr + Porffor.wasm.i32.load8_u(i++, 0, 4), 0, 4) : -1;
    const enc3: i32 = i < endPtr ? Porffor.wasm.i32.load8_u(lutPtr + Porffor.wasm.i32.load8_u(i++, 0, 4), 0, 4) : -1;
    const enc4: i32 = i < endPtr ? Porffor.wasm.i32.load8_u(lutPtr + Porffor.wasm.i32.load8_u(i++, 0, 4), 0, 4) : -1;

    const chr1: i32 = (enc1 << 2) | (enc2 == -1 ? 0 : (enc2 >> 4));
    const chr2: i32 = ((enc2 & 15) << 4) | (enc3 == -1 ? 0 : (enc3 >> 2));
    const chr3: i32 = ((enc3 & 3) << 6) | (enc4 == -1 ? 0 : enc4);

    Porffor.wasm.i32.store8(j++, chr1, 0, 4);

    if (enc3 != 64) {
      Porffor.wasm.i32.store8(j++, chr2, 0, 4);
    }

    if (enc4 != 64) {
      Porffor.wasm.i32.store8(j++, chr3, 0, 4);
    }
  }

  output.length = j - Porffor.wasm`local.get ${output}`;
  return output;
};