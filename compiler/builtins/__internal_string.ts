// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const __Porffor_strcmp = (a: any, b: any): boolean => {
  // a and b must be string or bytestring
  // fast path: check if pointers are equal
  if (Porffor.wasm`local.get ${a}` == Porffor.wasm`local.get ${b}`) return true;

  const al: i32 = Porffor.wasm.i32.load(a, 0, 0);
  const bl: i32 = Porffor.wasm.i32.load(b, 0, 0);

  // fast path: check if lengths are inequal
  if (al != bl) return false;

  if (Porffor.wasm`local.get ${a+1}` == Porffor.TYPES.bytestring) {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // bytestring, bytestring
      for (let i: i32 = 0; i < al; i++) {
        if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${a}` + i, 0, 4) !=
            Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${b}` + i, 0, 4)) return false;
      }
      return true;
    } else {
      // bytestring, string
      for (let i: i32 = 0; i < al; i++) {
        if (Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${a}` + i, 0, 4) !=
            Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${b}` + i*2, 0, 4)) return false;
      }
      return true;
    }
  } else {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // string, bytestring
      for (let i: i32 = 0; i < al; i++) {
        if (Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${a}` + i*2, 0, 4) !=
            Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${b}` + i, 0, 4)) return false;
      }
      return true;
    } else {
      // string, string
      for (let i: i32 = 0; i < al; i++) {
        if (Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${a}` + i*2, 0, 4) !=
            Porffor.wasm.i32.load16_u(Porffor.wasm`local.get ${b}` + i*2, 0, 4)) return false;
      }
      return true;
    }
  }
};