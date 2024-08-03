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

export const __Porffor_strcat = (a: any, b: any): any => {
  // a and b must be string or bytestring

  const al: i32 = Porffor.wasm.i32.load(a, 0, 0);
  const bl: i32 = Porffor.wasm.i32.load(b, 0, 0);

  if (Porffor.wasm`local.get ${a+1}` == Porffor.TYPES.bytestring) {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // bytestring, bytestring
      const out: bytestring = Porffor.allocateBytes(4 + al + bl);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4, Porffor.wasm`local.get ${a}` + 4, al, 0, 0);

      // copy right (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4 + al, Porffor.wasm`local.get ${b}` + 4, bl, 0, 0);

      return out;
    } else {
      // bytestring, string
      const out: string = Porffor.allocateBytes(4 + (al + bl) * 2);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (slow bytestring -> string)
      for (let i: i32 = 0; i < al; i++) {
        Porffor.wasm.i32.store16(Porffor.wasm`local.get ${out}` + i*2, Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${a}` + i, 0, 4), 0, 4);
      }

      // copy right (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4 + al*2, Porffor.wasm`local.get ${b}` + 4, bl * 2, 0, 0);

      return out;
    }
  } else {
    if (Porffor.wasm`local.get ${b+1}` == Porffor.TYPES.bytestring) {
      // string, bytestring
      const out: string = Porffor.allocateBytes(4 + (al + bl) * 2);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4, Porffor.wasm`local.get ${a}` + 4, al * 2, 0, 0);

      // copy right (slow bytestring -> string)
      let ptr: i32 = Porffor.wasm`local.get ${out}` + al*2;
      for (let i: i32 = 0; i < bl; i++) {
        Porffor.wasm.i32.store16(ptr + i*2, Porffor.wasm.i32.load8_u(Porffor.wasm`local.get ${b}` + i, 0, 4), 0, 4);
      }

      return out;
    } else {
      // string, string
      const out: string = Porffor.allocateBytes(4 + (al + bl) * 2);

      // out.length = a.length + b.length
      Porffor.wasm.i32.store(out, al + bl, 0, 0);

      // copy left (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4, Porffor.wasm`local.get ${a}` + 4, al * 2, 0, 0);

      // copy right (fast memcpy)
      Porffor.wasm.memory.copy(Porffor.wasm`local.get ${out}` + 4 + al*2, Porffor.wasm`local.get ${b}` + 4, bl * 2, 0, 0);

      return out;
    }
  }
};