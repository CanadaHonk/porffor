export const __Porffor_Generator = (values: any[]): __Porffor_Generator => {
  const gen: __Porffor_Generator = values;
  return gen;
};

export const __Porffor_Generator_yield = (vals: any[], value: any): void => {
  const len: i32 = Porffor.array.fastPush(vals, value);

  // add 1 to length so done is not true until after yields
  vals.length = len + 1;
};

export const __Porffor_Generator_prototype_next = (vals: any[]): object => {
  const obj: object = {};
  obj.next = vals.shift();
  obj.done = vals.length == 0;

  return obj;
};

export const __Porffor_Generator_prototype_return = (vals: any[], value: any): object => {
  vals.length = 1;
  vals[0] = value;

  return __Porffor_Generator_prototype_next(vals);
};

export const __Porffor_Generator_prototype_throw = (vals: any[], value: any): object => {
  vals.length = 0;
  throw value;
};


export const __Porffor_AsyncGenerator = (values: any[]): __Porffor_AsyncGenerator => {
  const gen: __Porffor_AsyncGenerator = values;
  return gen;
};

export const __Porffor_AsyncGenerator_yield = (vals: any[], value: any): void => {
  const len: i32 = Porffor.array.fastPush(vals, value);

  // add 1 to length so done is not true until after yields
  vals.length = len + 1;
};

export const __Porffor_AsyncGenerator_prototype_next = async (vals: any[]): object => {
  const obj: object = {};
  obj.next = await vals.shift();
  obj.done = vals.length == 0;

  return obj;
};

export const __Porffor_AsyncGenerator_prototype_return = async (vals: any[], value: any): object => {
  vals.length = 1;
  vals[0] = await value;

  return await __Porffor_AsyncGenerator_prototype_next(vals);
};

export const __Porffor_AsyncGenerator_prototype_throw = async (vals: any[], value: any): object => {
  vals.length = 0;
  throw await value;
};