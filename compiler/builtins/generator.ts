export const __Porffor_generator = (values: any[]): __Porffor_generator => {
  const gen: __Porffor_generator = values;
  return gen;
};

export const __Porffor_generator_yield = (vals: any[], value: any): void => {
  Porffor.array.fastPush(vals, value);
};

export const __Porffor_generator_prototype_next = (vals: any[]): object => {
  const obj: object = {};
  obj.next = vals.shift();
  obj.done = vals.length == 0;

  return obj;
};

export const __Porffor_generator_prototype_return = (vals: any[], value: any): object => {
  vals.length = 1;
  vals[0] = value;

  return __Porffor_generator_prototype_next(vals);
};

export const __Porffor_generator_prototype_throw = (vals: any[], value: any): object => {
  vals.length = 0;
  throw value;
};