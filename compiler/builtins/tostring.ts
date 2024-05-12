// // @porf --funsafe-no-unlikely-proto-checks --valtype=i32

export const __String_prototype_toString = (_this: string) => {
  let out: string = Porffor.s``;
  Porffor.clone(_this, out);
  return out;
};

export const __ByteString_prototype_toString = (_this: bytestring) => {
  let out: bytestring = Porffor.bs``;
  Porffor.clone(_this, out);
  return out;
};

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


// // export const __Array_prototype_toString = (_this: any[]) => {
// //   return _this.join();
// // };

// // export const __RegExp_prototype_toString = (_this: number) => {

// // };