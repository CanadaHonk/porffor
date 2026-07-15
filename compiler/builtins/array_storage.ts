import type {} from './porffor.d.ts';

export const __Porffor_mallocShared = (bytes: i32): i32 => Porffor.malloc(bytes);

export const __Porffor_array_ensure = (arr: i32, needed: i32): i32 => {
  let capacity: i32 = Porffor.IR.loadI32(arr, 8);
  const entries: i32 = Porffor.IR.loadI32(arr, 4);
  if (needed <= capacity) return entries;

  let copyLength: i32 = Porffor.IR.loadI32(arr, 0);
  if (copyLength > capacity) copyLength = capacity;
  if (capacity == 0) capacity = 1;
  while (capacity < needed) capacity *= 2;

  const newEntries: i32 = Porffor.malloc(capacity * 8);
  Porffor.IR.copy(newEntries, entries, copyLength * 8);
  Porffor.IR.fill(newEntries + copyLength * 8, 0, (capacity - copyLength) * 8);

  Porffor.IR.storeI32(arr, 4, newEntries);
  Porffor.IR.storeI32(arr, 8, capacity);
  Porffor.IR.gcBarrier(arr, Porffor.TYPES.array);
  return newEntries;
};

export const __Porffor_array_new = (capacity: i32): any[] => {
  const arr: any[] = Porffor.malloc(16 + capacity * 8);
  Porffor.IR.storeI32(arr, 0, 0);
  Porffor.IR.storeI32(arr, 4, Porffor.IR.ptr(arr) + 16);
  Porffor.IR.storeI32(arr, 8, capacity);
  Porffor.IR.fill(Porffor.IR.ptr(arr) + 16, 0, capacity * 8);
  return arr;
};

export const __Porffor_array_has = (arr: any[], index: i32): boolean => {
  if (Porffor.fastOr(index < 0, index >= arr.length)) return false;
  const entries: i32 = Porffor.IR.loadI32(arr, 4);
  return Porffor.IR.loadU64(entries + index * 8, 0) != 0;
};

export const __Porffor_array_delete = (arr: any[], index: i32): void => {
  if (Porffor.fastOr(index < 0, index >= arr.length)) return;
  const entries: i32 = __Porffor_array_ensure(arr, 0);
  Porffor.IR.storeU64(entries + index * 8, 0, 0);
};

export const __Porffor_array_setLength = (arr: any[], newLen: any): void => {
  const arrPtr: i32 = Porffor.IR.ptr(arr);
  Porffor.c`
  const u32 new_len = (u32)newLen.val;
  const u32 old_len = *(u32*)(MEM + arrPtr);
  if (new_len < old_len) {
    const u32 entries = *(u32*)(MEM + arrPtr + 4);
    const u32 capacity = *(u32*)(MEM + arrPtr + 8);
    const u32 clear_end = old_len < capacity ? old_len : capacity;
    if (new_len < clear_end) memset(MEM + entries + ((u64)new_len << 3), 0, ((size_t)clear_end - new_len) << 3);
  }
  *(u32*)(MEM + arrPtr) = new_len;
`;
};
