// // @porf -funsafe-no-unlikely-proto-checks -valtype=i32

export const __Boolean_prototype_toString = (_this: boolean) => {
  let out: bytestring = '';
  if (_this) out = 'true';
    else out = 'false';

  return out;
};

// // export const __String_prototype_toString = (_this: string) => {
// //   return _this.slice();
// // };

// // export const __undefined_prototype_toString = (_this: number) => {

// // };

export const __Object_prototype_toString = (_this: object) => {
  let out: bytestring = '[object Object]';
  return out;
};

export const __Function_prototype_toString = (_this: Function) => {
  // todo: actually use source
  let out: bytestring = 'function () {}';
  return out;
};


// // export const ___array_prototype_toString = (_this: any[]) => {
// //   return _this.join();
// // };

// // export const ___regexp_prototype_toString = (_this: number) => {

// // };

// // export const ___bytestring_prototype_toString = (_this: bytestring) => {
// //   return _this.slice();
// // };