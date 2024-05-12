// // @porf --funsafe-no-unlikely-proto-checks --valtype=i32

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