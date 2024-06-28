import type {} from './porffor.d.ts';

// todo: support receiver
export const __Reflect_get = (target: any, property: any) => {
  if (!Porffor.object.isObject(target)) throw new TypeError('Target is a non-object');

  const p: any = ecma262.ToPropertyKey(property);

  const t: i32 = Porffor.rawType(target);
  if (t == Porffor.TYPES.object) {
    return Porffor.object.get(target, p);
  }

  const keys: any[] = Object.keys(target);
  const idx: i32 = __Array_prototype_indexOf(keys, p);
  if (idx == -1) return undefined;

  const vals: any[] = Object.values(target);
  return vals[idx];
};