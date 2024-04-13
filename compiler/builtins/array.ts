// @porf -funsafe-no-unlikely-proto-checks -valtype=i32

export const __Array_isArray = (x: unknown): boolean => Porffor.wasm`local.get ${x+1}` == Porffor.TYPES._array;