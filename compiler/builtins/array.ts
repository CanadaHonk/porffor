import type {} from './porffor.d.ts';

export const Array = function (...args: any[]): any[] {
  const argsLen: number = args.length;
  if (argsLen == 0) {
    // no args: empty array
    const out: any[] = Porffor.array.new(4);
    return out;
  }

  if (argsLen == 1) {
    // 1 arg, length (number) or first element (non-number)
    const arg: any = args[0];
    if (Porffor.type(arg) == Porffor.TYPES.number) {
      // number so use as length
      const n: number = args[0];
      if (Porffor.fastOr(
        n < 0, // negative
        n > 4294967295, // over 2**32 - 1
        !Number.isInteger(n) // non-integer/non-finite
      )) throw new RangeError('Invalid array length');

      const out: any[] = Porffor.array.new(n);
      out.length = n;
      return out;
    }

    // not number, leave to fallthrough as same as >1
  }

  // >1 arg, just return args array
  return args;
};

export const __Array_isArray = (x: unknown): boolean =>
  Porffor.type(x) == Porffor.TYPES.array;

// 23.1.2.5 get Array [ @@species ]
// https://tc39.es/ecma262/#sec-get-array-@@species
export const __Array_Symbol_species$get = function (this: any) {
  // 1. Return the this value.
  return this;
};

// 23.1.2.3 Array.of (...items)
// https://tc39.es/ecma262/#sec-array.of
// direct calls are lowered to an array literal by a comptime builtin
export const __Array_of = function (this: any, ...items: any[]): any {
  // 1. Let len be the number of elements in items.
  const len: i32 = items.length;

  // 2. Let lenNumber be 𝔽(len).
  // 3. Let C be the this value.
  // 4. If IsConstructor(C) is true, then
  //   a. Let A be ? Construct(C, « lenNumber »).
  // 5. Else,
  //   a. Let A be ? ArrayCreate(len).
  if (Porffor.fastOr(!ecma262.IsConstructor(this), this === Array)) return items;
  const A: any = Porffor.call(this, [ len ], null, this);

  // 6. Let k be 0.
  // 7. Repeat, while k < len,
  for (let k: i32 = 0; k < len; k++) {
    // a. Let kValue be items[k].
    // b. Let Pk be ! ToString(𝔽(k)).
    // c. Perform ? CreateDataPropertyOrThrow(A, Pk, kValue).
    // d. Set k to k + 1.
    __Porffor_array_createDataProperty(A, k, items[k]);
  }

  // 8. Perform ? Set(A, "length", lenNumber, true).
  __Porffor_array_setLengthOf(A, len);

  // 9. Return A.
  return A;
};

export const __Porffor_array_iteratorCloseThrow = (iterator: any): void => {
  try {
    const ret: any = iterator.return;
    if (ret != null) ret.call(iterator);
  } catch {}
};

// 23.1.2.1 Array.from (items [, mapper [, thisArg]])
// https://tc39.es/ecma262/#sec-array.from
export const __Array_from = function (this: any, items: any, mapper: any = undefined, thisArg: any = undefined): any {
  // 1. Let C be the this value.
  const C: any = this;
  const custom: boolean = Porffor.fastAnd(C !== Array, ecma262.IsConstructor(C));

  // 2. If mapper is undefined, let mapping be false.
  // 3. Else, if IsCallable(mapper) is false, throw a TypeError exception; else let mapping be true.
  const mapping: boolean = Porffor.type(mapper) != Porffor.TYPES.undefined;
  if (mapping) if (Porffor.type(mapper) != Porffor.TYPES.function) throw new TypeError('Called Array.from with a non-function mapper');
  if (items == null) throw new TypeError('Argument cannot be nullish');

  if (!custom) if (__Porffor_iterator_inPlace(Porffor.type(items))) {
    const out: any[] = Porffor.array.new(4);
    let i: i32 = 0;
    if (mapping) {
      for (const x of items) {
        out[i] = mapper.call(thisArg, x, i);
        i++;
      }
    } else {
      for (const x of items) out[i++] = x;
    }

    out.length = i;
    return out;
  }

  // 4. Let usingIterator be ? GetMethod(items, %Symbol.iterator%).
  const usingIterator: any = items[Symbol.iterator];

  // 5. If usingIterator is not undefined, then
  if (usingIterator != null) {
    if (Porffor.type(usingIterator) != Porffor.TYPES.function) throw new TypeError('Symbol.iterator is not a function');

    // a. If IsConstructor(C) is true, let A be ? Construct(C); else let A be ! ArrayCreate(0).
    const A: any = custom ? Porffor.call(C, [], null, C) : Porffor.array.new(4);

    // b. Let iteratorRecord be ? GetIteratorFromMethod(items, usingIterator).
    const iterator: any = usingIterator.call(items);
    if (!Porffor.object.isObject(iterator)) throw new TypeError('Iterator is not an object');
    const next: any = iterator.next;

    // c. Let k be 0.
    // d. Repeat,
    let k: number = 0;
    while (true) {
      // iii. Let next be ? IteratorStepValue(iteratorRecord).
      const result: any = next.call(iterator);
      if (!Porffor.object.isObject(result)) throw new TypeError('Iterator result is not an object');

      // iv. If next is done, then
      if (result.done) {
        // 1. Perform ? Set(A, "length", 𝔽(k), true).
        __Porffor_array_setLengthOf(A, k);

        // 2. Return A.
        return A;
      }

      // v-viii. Map and define the value, closing the iterator on abrupt completions
      let value: any = result.value;
      try {
        if (mapping) value = mapper.call(thisArg, value, k);
        __Porffor_array_createDataProperty(A, k, value);
      } catch (e) {
        __Porffor_array_iteratorCloseThrow(iterator);
        throw e;
      }

      // ix. Set k to k + 1.
      k++;
    }
  }

  // 6. NOTE: items is not an Iterable so assume it is an array-like object.
  // 7. Let arrayLike be ! ToObject(items).
  const arrayLike: any = ecma262.ToObject(items);

  // 8. Let len be ? LengthOfArrayLike(arrayLike).
  const len: number = __Porffor_array_lengthOf(arrayLike);

  // 9. If IsConstructor(C) is true, let A be ? Construct(C, « 𝔽(len) »); else let A be ? ArrayCreate(len).
  const A: any = custom ? Porffor.call(C, [ len ], null, C) : __Porffor_array_create(len);

  // 10. Let k be 0.
  // 11. Repeat, while k < len,
  for (let k: number = 0; k < len; k++) {
    // a-b. Let kValue be ? Get(arrayLike, Pk).
    let value: any = __Porffor_array_get(arrayLike, k);

    // c-d. Let mappedValue be ? Call(mapper, thisArg, « kValue, 𝔽(k) ») if mapping.
    if (mapping) value = mapper.call(thisArg, value, k);

    // e. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
    __Porffor_array_createDataProperty(A, k, value);
  }

  // 12. Perform ? Set(A, "length", 𝔽(len), true).
  __Porffor_array_setLengthOf(A, len);

  // 13. Return A.
  return A;
};

// 23.1.2.2 Array.fromAsync (items [, mapper [, thisArg]])
// https://tc39.es/proposal-array-from-async/
export const __Array_fromAsync = async function (this: any, items: any, mapper: any = undefined, thisArg: any = undefined) {
  // 1. Let C be the this value.
  const C: any = this;
  const custom: boolean = Porffor.fastAnd(C !== Array, ecma262.IsConstructor(C));

  // 3.a. If mapper is undefined, let mapping be false.
  // 3.b. Else, if IsCallable(mapper) is false, throw a TypeError exception; else let mapping be true.
  const mapping: boolean = Porffor.type(mapper) != Porffor.TYPES.undefined;
  if (mapping) if (Porffor.type(mapper) != Porffor.TYPES.function) throw new TypeError('Called Array.fromAsync with a non-function mapper');
  if (items == null) throw new TypeError('Argument cannot be nullish');

  // c. Let usingAsyncIterator be ? GetMethod(asyncItems, %Symbol.asyncIterator%).
  const usingAsyncIterator: any = items[Symbol.asyncIterator];
  if (usingAsyncIterator != null) if (Porffor.type(usingAsyncIterator) != Porffor.TYPES.function) throw new TypeError('Symbol.asyncIterator is not a function');

  // d. If usingAsyncIterator is undefined, then
  //   i. Let usingSyncIterator be ? GetMethod(asyncItems, %Symbol.iterator%).
  let usingSyncIterator: any = undefined;
  if (usingAsyncIterator == null) {
    usingSyncIterator = items[Symbol.iterator];
    if (usingSyncIterator != null) if (Porffor.type(usingSyncIterator) != Porffor.TYPES.function) throw new TypeError('Symbol.iterator is not a function');
  }

  // f. If iteratorRecord is not undefined, then
  if (Porffor.fastOr(usingAsyncIterator != null, usingSyncIterator != null)) {
    // i. If IsConstructor(C) is true, let A be ? Construct(C); else let A be ! ArrayCreate(0).
    const A: any = custom ? Porffor.call(C, [], null, C) : Porffor.array.new(4);

    // e. Let iteratorRecord be GetIteratorFromMethod (sync iterators act as CreateAsyncFromSyncIterator).
    const isAsync: boolean = usingAsyncIterator != null;
    const iterator: any = isAsync ? usingAsyncIterator.call(items) : usingSyncIterator.call(items);
    if (!Porffor.object.isObject(iterator)) throw new TypeError('Iterator is not an object');
    const next: any = iterator.next;

    // ii. Let k be 0.
    // iii. Repeat,
    let k: number = 0;
    while (true) {
      // 3. Let nextResult be ? Call(iteratorRecord.[[NextMethod]], iteratorRecord.[[Iterator]]).
      // 4. Set nextResult to ? Await(nextResult).
      let result: any = next.call(iterator);
      if (isAsync) result = await result;

      // 5. If nextResult is not an Object, throw a TypeError exception.
      if (!Porffor.object.isObject(result)) throw new TypeError('Iterator result is not an object');

      // 6. Let done be ? IteratorComplete(nextResult).
      // 7. If done is true, then
      if (result.done) {
        // a. Perform ? Set(A, "length", 𝔽(k), true).
        __Porffor_array_setLengthOf(A, k);

        // b. Return A.
        return A;
      }

      // 8. Let nextValue be ? IteratorValue(nextResult).
      let value: any = result.value;

      try {
        // async-from-sync iterators await each value
        if (!isAsync) value = await value;

        // 9. If mapping is true, then
        //   a. Let mappedValue be Call(mapper, thisArg, « nextValue, 𝔽(k) »).
        //   c. Set mappedValue to Await(mappedValue).
        if (mapping) value = await mapper.call(thisArg, value, k);

        // 11. Let defineStatus be CreateDataPropertyOrThrow(A, Pk, mappedValue).
        __Porffor_array_createDataProperty(A, k, value);
      } catch (e) {
        // 12. If defineStatus is an abrupt completion, return ? AsyncIteratorClose(iteratorRecord, defineStatus).
        try {
          const ret: any = iterator.return;
          if (ret != null) {
            const r: any = ret.call(iterator);
            if (isAsync) await r;
          }
        } catch {}
        throw e;
      }

      // 13. Set k to k + 1.
      k++;
    }
  }

  // g. Else,
  //   i. NOTE: asyncItems is neither an AsyncIterable nor an Iterable so assume it is an array-like object.
  //   ii. Let arrayLike be ! ToObject(asyncItems).
  const arrayLike: any = ecma262.ToObject(items);

  //   iii. Let len be ? LengthOfArrayLike(arrayLike).
  const len: number = __Porffor_array_lengthOf(arrayLike);

  //   iv. If IsConstructor(C) is true, let A be ? Construct(C, « 𝔽(len) »); else let A be ? ArrayCreate(len).
  const A: any = custom ? Porffor.call(C, [ len ], null, C) : __Porffor_array_create(len);

  //   v. Let k be 0.
  //   vi. Repeat, while k < len,
  for (let k: number = 0; k < len; k++) {
    // 2. Let kValue be ? Get(arrayLike, Pk).
    // 3. Set kValue to ? Await(kValue).
    let value: any = await __Porffor_array_get(arrayLike, k);

    // 4. If mapping is true, then
    //   a. Let mappedValue be ? Call(mapper, thisArg, « kValue, 𝔽(k) »).
    //   b. Set mappedValue to ? Await(mappedValue).
    if (mapping) value = await mapper.call(thisArg, value, k);

    // 6. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
    __Porffor_array_createDataProperty(A, k, value);
  }

  //   vii. Perform ? Set(A, "length", 𝔽(len), true).
  __Porffor_array_setLengthOf(A, len);

  //   viii. Return A.
  return A;
};


// present dense slots are plain data props, others live in the underlying object

export const __Porffor_array_lengthOf = (O: any): number => {
  if (Porffor.type(O) == Porffor.TYPES.array) return (O as any[]).length;
  if (__Porffor_array_isTyped(O)) return O.length;
  return ecma262.ToLength(O['length']);
};

export const __Porffor_array_isTyped = (O: any): boolean => {
  const t: i32 = Porffor.type(O);
  return Porffor.fastAnd(t >= Porffor.TYPES.uint8clampedarray, t <= Porffor.TYPES.float64array);
};

// true if a hole in arr cannot be shadowed by anything: no own props beyond the dense ones
// and no index-like keys added to any object (so none on its prototype chain)
export const __Porffor_array_holeEmpty = (arr: any[]): boolean => {
  if (__Porffor_object_indexKeysUsed() != 0) return false;
  return __Porffor_object_underlyingPtr(arr) == 0;
};

export const __Porffor_array_holeGet = (arr: any[], k: i32): any => {
  if (__Porffor_array_holeEmpty(arr)) return undefined;
  return __Porffor_object_get(arr, k);
};

export const __Porffor_array_hasProperty = (O: any, k: number): boolean => {
  if (Porffor.type(O) == Porffor.TYPES.array) {
    if (__Porffor_array_has(O as any[], k)) return true;
    if (__Porffor_array_holeEmpty(O as any[])) return false;
  } else if (__Porffor_array_isTyped(O)) {
    return k < O.length;
  }

  return __Porffor_object_in(O, ecma262.ToPropertyKey(k));
};

export const __Porffor_array_get = (O: any, k: number): any => {
  if (Porffor.type(O) == Porffor.TYPES.array) {
    if (__Porffor_array_has(O as any[], k)) return (O as any[])[k];
    if (__Porffor_array_holeEmpty(O as any[])) return undefined;
    return __Porffor_object_get(O, k);
  }

  return O[k];
};

export const __Porffor_array_set = (O: any, k: number, V: any): void => {
  if (Porffor.type(O) == Porffor.TYPES.array) {
    if (__Porffor_array_has(O as any[], k)) {
      (O as any[])[k] = V;
      return;
    }

    if (__Porffor_object_underlyingPtr(O) == 0) {
      // no own props other than dense ones and the array is extensible
      if (k <= 2147483646) {
        (O as any[])[k] = V;
        return;
      }
    }
  } else if (__Porffor_array_isTyped(O)) {
    O[k] = V;
    return;
  }

  __Porffor_object_setStrict(O, k, V);
};

export const __Porffor_array_deleteProperty = (O: any, k: number): void => {
  if (Porffor.type(O) == Porffor.TYPES.array) {
    if (__Porffor_array_has(O as any[], k)) {
      __Porffor_array_delete(O as any[], k);
      return;
    }

    if (__Porffor_object_underlyingPtr(O) == 0) return;
  }

  __Porffor_object_deleteStrict(O, ecma262.ToPropertyKey(k));
};

export const __Porffor_array_lengthEntry = (arr: any[]): i32 => {
  const u: any = __Porffor_object_underlying(arr);
  const entryPtr: i32 = __Porffor_object_lookup(u, 'length', __Porffor_object_hash('length'));
  if (entryPtr != 0) {
    const len: number = arr.length;
    Porffor.IR.storeUnF64(entryPtr, 8, len);
    Porffor.IR.storeU8(entryPtr, 17, Porffor.TYPES.number);
  }

  return entryPtr;
};

export const __Porffor_array_truncate = (arr: any[], newLen: number): number => {
  let finalLen: number = newLen;
  const u: any = __Porffor_object_underlyingPeek(arr);
  if (u != null) {
    const entriesPtr: i32 = Porffor.object.entriesPtr(u);
    let ptr: i32 = entriesPtr + Porffor.IR.loadU16(u, 0) * 20;
    while (ptr > entriesPtr) {
      ptr -= 20;
      if (Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol) continue;

      const index: i32 = __Porffor_array_propertyKeyIndex(Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18)));
      if (index >= finalLen) if ((Porffor.IR.loadU8(ptr, 16) & 0b0010) == 0) finalLen = index + 1;
    }

    ptr = entriesPtr + Porffor.IR.loadU16(u, 0) * 20;
    while (ptr > entriesPtr) {
      ptr -= 20;
      if (Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol) continue;

      const key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));
      if (__Porffor_array_propertyKeyIndex(key) >= finalLen) __Porffor_object_delete(u, key);
    }
  }

  __Porffor_array_setLength(arr, finalLen);
  return finalLen;
};

export const __Porffor_array_toLength = (value: any): number => {
  // 3. Let newLen be ? ToUint32(Desc.[[Value]]).
  // 4. Let numberLen be ? ToNumber(Desc.[[Value]]).
  // 5. If SameValueZero(newLen, numberLen) is false, throw a RangeError exception.
  const numberLen: number = ecma262.ToNumber(value);
  if (Porffor.type(value) == Porffor.TYPES.object) ecma262.ToNumber(value);
  if (Porffor.fastOr(
    numberLen != numberLen,
    Math.trunc(numberLen) != numberLen,
    numberLen < 0,
    numberLen > 4294967295
  )) throw new RangeError('Invalid array length');

  return numberLen;
};

export const __Porffor_array_setLengthValue = (arr: any[], value: any, strict: boolean): void => {
  let newLen: number;
  if (Porffor.fastAnd(Porffor.type(value) == Porffor.TYPES.number, value >= 0, value <= 2147483647, Math.trunc(value) == value)) {
    newLen = value;
    if (__Porffor_object_underlyingPtr(arr) == 0) {
      __Porffor_array_setLength(arr, newLen);
      return;
    }
  } else {
    newLen = __Porffor_array_toLength(value);
  }

  const entryPtr: i32 = __Porffor_array_lengthEntry(arr);
  if (entryPtr != 0) if ((Porffor.IR.loadU8(entryPtr, 16) & 0b1000) == 0) {
    if (strict) throw new TypeError('Cannot assign to read only property \'length\'');
    return;
  }

  if (__Porffor_array_truncate(arr, newLen) != newLen) {
    if (strict) throw new TypeError('Cannot delete non-configurable array element');
  }
};

// https://tc39.es/ecma262/#sec-arraysetlength
export const __Porffor_array_defineLength = (A: any[], desc: any): void => {
  const hasValue: boolean = 'value' in desc;
  let newLen: number = 0;
  if (hasValue) newLen = __Porffor_array_toLength(desc.value);

  const entryPtr: i32 = __Porffor_array_lengthEntry(A);
  const flags: i32 = Porffor.IR.loadU8(entryPtr, 16);
  const oldWritable: boolean = (flags & 0b1000) != 0;

  if ('configurable' in desc) if (!!desc.configurable) throw new TypeError('Cannot redefine property: length');
  if ('enumerable' in desc) if (!!desc.enumerable) throw new TypeError('Cannot redefine property: length');
  if (Porffor.fastOr('get' in desc, 'set' in desc)) throw new TypeError('Cannot redefine property: length');

  let newWritable: boolean = oldWritable;
  if ('writable' in desc) {
    newWritable = !!desc.writable;
    if (Porffor.fastAnd(newWritable, !oldWritable)) throw new TypeError('Cannot redefine property: length');
  }

  const oldLen: number = A.length;
  if (hasValue) if (newLen != oldLen) {
    if (!oldWritable) throw new TypeError('Cannot redefine property: length');

    if (newLen > oldLen) __Porffor_array_setLength(A, newLen);
      else if (__Porffor_array_truncate(A, newLen) != newLen) {
        if (!newWritable) Porffor.IR.storeU8(__Porffor_array_lengthEntry(A), 16, flags & 0b0111);
        throw new TypeError('Cannot delete non-configurable array element');
      }
  }

  if (!newWritable) Porffor.IR.storeU8(__Porffor_array_lengthEntry(A), 16, flags & 0b0111);
};

export const __Porffor_array_setLengthOf = (O: any, len: number): void => {
  if (Porffor.type(O) == Porffor.TYPES.array) {
    if (len > 4294967295) throw new RangeError('Invalid array length');

    const u: any = __Porffor_object_underlyingPeek(O);
    if (u != null) {
      const entryPtr: i32 = __Porffor_object_lookup(u, 'length', __Porffor_object_hash('length'));
      if (entryPtr != 0) if ((Porffor.IR.loadU8(entryPtr, 16) & 0b1000) == 0) throw new TypeError('Cannot assign to read only property \'length\'');
    }

    __Porffor_array_setLength(O as any[], len);
    return;
  }

  __Porffor_object_setStrict(O, 'length', len);
};

export const __Porffor_array_createDataProperty = (A: any, k: number, V: any): void => {
  if (Porffor.type(A) == Porffor.TYPES.array) {
    const u: any = __Porffor_object_underlyingPeek(A);
    if (u == null) {
      (A as any[])[k] = V;
      return;
    }

    const P: any = ecma262.ToPropertyKey(k);
    const entryPtr: i32 = __Porffor_object_lookup(u, P, __Porffor_object_hash(P));
    if (entryPtr == 0) {
      if (__Porffor_array_has(A as any[], k)) {
        (A as any[])[k] = V;
        return;
      }

      if (Porffor.object.isInextensible(u)) throw new TypeError('Cannot add property to inextensible array');
      (A as any[])[k] = V;
      return;
    }

    if ((Porffor.IR.loadU8(entryPtr, 16) & 0b0010) == 0) throw new TypeError('Cannot redefine property');
    __Porffor_object_delete(u, P);
    (A as any[])[k] = V;
    return;
  }

  __Porffor_object_define(A, ecma262.ToPropertyKey(k), V, 0b1110);
};

export const __Porffor_array_create = (len: number): any[] => {
  if (len > 2147483647) throw new RangeError('Invalid array length');

  let cap: i32 = len;
  if (cap > 65536) cap = 4;
  const out: any[] = Porffor.array.new(cap);
  out.length = len;
  return out;
};

export const __Porffor_array_speciesCreate = (O: any, len: number): any => {
  // 1. Let isArray be ? IsArray(originalArray).
  // 2. If isArray is false, return ? ArrayCreate(length).
  if (Porffor.type(O) != Porffor.TYPES.array) return __Porffor_array_create(len);

  // 3. Let C be ? Get(originalArray, "constructor").
  let C: any;
  if (__Porffor_object_underlyingPtr(O) == 0) {
    // avoid materializing the underlying object
    const proto: any = __Porffor_object_getHiddenPrototype(Porffor.TYPES.array);
    if (proto == __Object_prototype) return __Porffor_array_create(len);
    C = __Porffor_object_get(proto, 'constructor');
  } else {
    C = __Porffor_object_get(O, 'constructor');
  }

  if (C === Array) return __Porffor_array_create(len);

  // 4. If IsConstructor(C) is true, then (realms are not supported)
  // 5. If C is an Object, then
  if (Porffor.object.isObject(C)) {
    // a. Set C to ? Get(C, @@species).
    C = C[Symbol.species];

    // b. If C is null, set C to undefined.
    if (C === null) C = undefined;
  }

  // 6. If C is undefined, return ? ArrayCreate(length).
  if (C === undefined) return __Porffor_array_create(len);
  if (C === Array) return __Porffor_array_create(len);

  // 7. If IsConstructor(C) is false, throw a TypeError exception.
  if (!ecma262.IsConstructor(C)) throw new TypeError('Species is not a constructor');

  // 8. Return ? Construct(C, « 𝔽(length) »).
  return Porffor.call(C, [ len ], null, C);
};

export const __Porffor_array_clampIndex = (arg: any, len: number): number => {
  let n: number = ecma262.ToIntegerOrInfinity(arg);
  if (n < 0) {
    n = len + n;
    if (n < 0) n = 0;
  } else if (n > len) n = len;

  return n;
};

// 23.1.3.1 Array.prototype.at (index)
// https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.at
export const __Array_prototype_at = function (this: any, index: any) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. Let relativeIndex be ? ToIntegerOrInfinity(index).
  let k: number = ecma262.ToIntegerOrInfinity(index);

  // 4. If relativeIndex ≥ 0, then
  //        a. Let k be relativeIndex.
  // 5. Else,
  //        a. Let k be len + relativeIndex.
  if (k < 0) k = len + k;

  // 6. If k < 0 or k ≥ len, return undefined.
  if (Porffor.fastOr(k < 0, k >= len)) return undefined;

  // 7. Return ? Get(O, ! ToString(𝔽(k))).
  return __Porffor_array_get(O, k);
};

// 23.1.3.23 Array.prototype.push (...items)
// https://tc39.es/ecma262/#sec-array.prototype.push
export const __Array_prototype_push = function (this: any, ...items: any[]) {
  const itemsLen: i32 = items.length;
  if (Porffor.type(this) == Porffor.TYPES.array) {
    const arr: any[] = this;
    const arrLen: i32 = arr.length;
    const u: any = __Porffor_object_underlyingPeek(arr);
    if (Porffor.fastAnd(arrLen + itemsLen <= 2147483647, Porffor.fastOr(u == null, !Porffor.object.isInextensible(u)))) {
      if (u != null) __Porffor_array_setLengthOf(arr, arrLen); // throws for non-writable length

      for (let i: i32 = 0; i < itemsLen; i++) {
        arr[arrLen + i] = items[i];
      }

      return arrLen + itemsLen;
    }
  }

  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  let len: number = __Porffor_array_lengthOf(O);

  // 4. If len + argCount > 2**53 - 1, throw a TypeError exception.
  if (len + itemsLen > 9007199254740991) throw new TypeError('Array length exceeds max safe integer');

  // 5. For each element E of items, do
  for (let i: i32 = 0; i < itemsLen; i++) {
    // a. Perform ? Set(O, ! ToString(𝔽(len)), E, true).
    __Porffor_array_set(O, len, items[i]);

    // b. Set len to len + 1.
    len++;
  }

  // 6. Perform ? Set(O, "length", 𝔽(len), true).
  __Porffor_array_setLengthOf(O, len);

  // 7. Return 𝔽(len).
  return len;
};

export const __Porffor_array_spread = (arr: any[], src: any) => {
  let len: i32 = arr.length;

  if (Porffor.type(src) != Porffor.TYPES.array) switch (Porffor.type(src)) {
    case Porffor.TYPES.set:
    case Porffor.TYPES.map:
      const keys: any[] = Porffor.IR.loadI32(src, 0);
      const keysEntries: i32 = Porffor.IR.loadI32(keys, 4);
      const vals: any[] = Porffor.IR.loadI32(src, 4);
      for (let i: i32 = 0; i < keys.length; i++) {
        if (Porffor.IR.loadU64(keysEntries + i * 8, 0) == -1) continue;
        if (Porffor.type(src) == Porffor.TYPES.set) {
          arr[len] = keys[i];
        } else {
          const entry: any[] = Porffor.array.new(2);
          entry[0] = keys[i];
          entry[1] = vals[i];
          arr[len] = entry;
        }
        len++;
      }

      return len;

    case Porffor.TYPES.__porffor_generator:
      while (!Porffor.coroutine.resume(src, undefined, 0 as i32)) {
        const value: any = Porffor.coroutine.value(src);
        arr[len] = Porffor.coroutine.raw(src) ? value.value : value;
        len++;
      }

      return len;

    // strings iterate code points
    case Porffor.TYPES.string:
      return __Porffor_array_spread(arr, __Porffor_iterator_rest(__Porffor_iterator_get(src)));

    case Porffor.TYPES.bytestring:
      break;

    default:
      const t: i32 = Porffor.type(src);
      if (Porffor.fastOr(t < Porffor.TYPES.uint8clampedarray, t > Porffor.TYPES.float64array))
        return __Porffor_array_spread(arr, __Porffor_iterator_rest(__Porffor_iterator_get(src)));
  }

  const srcLen: i32 = src.length;
  const newLen: i32 = len + srcLen;
  arr.length = newLen;

  for (let i: i32 = 0; i < srcLen; i++) {
    arr[i + len] = src[i];
  }

  return newLen;
};
export const __Porffor_array_fastMutable = (arr: any[]): boolean => {
  const u: any = __Porffor_object_underlyingPeek(arr);
  if (u == null) return true;
  if (Porffor.object.isInextensible(u)) return false;

  let ptr: i32 = Porffor.object.entriesPtr(u);
  const endPtr: i32 = ptr + Porffor.IR.loadU16(u, 0) * 20;
  for (; ptr < endPtr; ptr += 20) {
    if (Porffor.IR.loadU8(ptr, 18) == Porffor.TYPES.symbol) continue;

    const key: any = Porffor.as(Porffor.IR.loadI32(ptr, 4), Porffor.IR.loadU8(ptr, 18));
    if (__Porffor_array_propertyKeyIndex(key) != -1) return false;
    if ((Porffor.IR.loadU8(ptr, 16) & 0b1000) == 0) if (key == 'length') return false;
  }

  return true;
};

export const __Porffor_array_dense = (arr: any[], start: i32, end: i32): boolean => {
  for (let i: i32 = start; i < end; i++) {
    if (!__Porffor_array_has(arr, i)) return false;
  }

  return true;
};

export const __Porffor_array_fastMove = (arr: any[], start: i32, end: i32): boolean => {
  if (__Porffor_array_holeEmpty(arr)) return true;
  return Porffor.fastAnd(__Porffor_array_fastMutable(arr), __Porffor_array_dense(arr, start, end));
};

// 23.1.3.22 Array.prototype.pop ()
// https://tc39.es/ecma262/#sec-array.prototype.pop
export const __Array_prototype_pop = function (this: any) {
  if (Porffor.type(this) == Porffor.TYPES.array) {
    const arr: any[] = this;
    const arrLen: i32 = arr.length;
    if (arrLen > 0) if (__Porffor_array_has(arr, arrLen - 1)) if (__Porffor_object_underlyingPtr(arr) == 0) {
      const element: any = arr[arrLen - 1];
      __Porffor_array_setLength(arr, arrLen - 1);
      return element;
    }
  }

  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If len = 0, then
  if (len == 0) {
    // a. Perform ? Set(O, "length", +0𝔽, true).
    __Porffor_array_setLengthOf(O, 0);

    // b. Return undefined.
    return undefined;
  }

  // 4. Else,
  // a. Assert: len > 0.
  // b. Let newLen be 𝔽(len - 1).
  const newLen: number = len - 1;

  // c. Let index be ! ToString(newLen).
  // d. Let element be ? Get(O, index).
  const element: any = __Porffor_array_get(O, newLen);

  // e. Perform ? DeletePropertyOrThrow(O, index).
  __Porffor_array_deleteProperty(O, newLen);

  // f. Perform ? Set(O, "length", newLen, true).
  __Porffor_array_setLengthOf(O, newLen);

  // g. Return element.
  return element;
};

// 23.1.3.27 Array.prototype.shift ()
// https://tc39.es/ecma262/#sec-array.prototype.shift
export const __Array_prototype_shift = function (this: any) {
  if (Porffor.type(this) == Porffor.TYPES.array) {
    const arr: any[] = this;
    const arrLen: i32 = arr.length;
    if (arrLen > 0) if (__Porffor_array_fastMove(arr, 0, arrLen)) {
      const element: any = arr[0];
      const entries: i32 = __Porffor_array_ensure(arr, arrLen);
      Porffor.IR.copy(entries, entries + 8, (arrLen - 1) * 8);
      Porffor.IR.gcBarrier(arr, Porffor.TYPES.array);
      __Porffor_array_setLength(arr, arrLen - 1);
      return element;
    }
  }

  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If len = 0, then
  if (len == 0) {
    // a. Perform ? Set(O, "length", +0𝔽, true).
    __Porffor_array_setLengthOf(O, 0);

    // b. Return undefined.
    return undefined;
  }

  // 4. Let first be ? Get(O, "0").
  const first: any = __Porffor_array_get(O, 0);

  // 5. Let k be 1.
  // 6. Repeat, while k < len,
  for (let k: number = 1; k < len; k++) {
    // a. Let from be ! ToString(𝔽(k)).
    // b. Let to be ! ToString(𝔽(k - 1)).
    // c. Let fromPresent be ? HasProperty(O, from).
    // d. If fromPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let fromValue be ? Get(O, from).
      // ii. Perform ? Set(O, to, fromValue, true).
      __Porffor_array_set(O, k - 1, __Porffor_array_get(O, k));
    } else {
      // e. Else,
      // i. Assert: fromPresent is false.
      // ii. Perform ? DeletePropertyOrThrow(O, to).
      __Porffor_array_deleteProperty(O, k - 1);
    }
    // f. Set k to k + 1.
  }

  // 7. Perform ? DeletePropertyOrThrow(O, ! ToString(𝔽(len - 1))).
  __Porffor_array_deleteProperty(O, len - 1);

  // 8. Perform ? Set(O, "length", 𝔽(len - 1), true).
  __Porffor_array_setLengthOf(O, len - 1);

  // 9. Return first.
  return first;
};

// 23.1.3.37 Array.prototype.unshift (...items)
// https://tc39.es/ecma262/#sec-array.prototype.unshift
export const __Array_prototype_unshift = function (this: any, ...items: any[]) {
  const argCount: i32 = items.length;
  if (Porffor.type(this) == Porffor.TYPES.array) {
    const arr: any[] = this;
    const arrLen: i32 = arr.length;
    if (arrLen + argCount <= 2147483647) if (__Porffor_array_fastMove(arr, 0, arrLen)) {
      const newLen: i32 = arrLen + argCount;
      if (argCount > 0) {
        const entries: i32 = __Porffor_array_ensure(arr, newLen);
        Porffor.IR.copy(entries + argCount * 8, entries, arrLen * 8);
        Porffor.IR.copy(entries, __Porffor_array_ensure(items, 0), argCount * 8);
        Porffor.IR.gcBarrier(arr, Porffor.TYPES.array);
      }

      __Porffor_array_setLength(arr, newLen);
      return newLen;
    }
  }

  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. Let argCount be the number of elements in items.
  // 4. If argCount > 0, then
  if (argCount > 0) {
    // a. If len + argCount > 2**53 - 1, throw a TypeError exception.
    if (len + argCount > 9007199254740991) throw new TypeError('Array length exceeds max safe integer');

    // b. Let k be len.
    // c. Repeat, while k > 0,
    for (let k: number = len; k > 0; k--) {
      // i. Let from be ! ToString(𝔽(k - 1)).
      // ii. Let to be ! ToString(𝔽(k + argCount - 1)).
      // iii. Let fromPresent be ? HasProperty(O, from).
      // iv. If fromPresent is true, then
      if (__Porffor_array_hasProperty(O, k - 1)) {
        // 1. Let fromValue be ? Get(O, from).
        // 2. Perform ? Set(O, to, fromValue, true).
        __Porffor_array_set(O, k + argCount - 1, __Porffor_array_get(O, k - 1));
      } else {
        // v. Else,
        // 1. Assert: fromPresent is false.
        // 2. Perform ? DeletePropertyOrThrow(O, to).
        __Porffor_array_deleteProperty(O, k + argCount - 1);
      }
      // vi. Set k to k - 1.
    }

    // d. Let j be +0𝔽.
    // e. For each element E of items, do
    for (let j: i32 = 0; j < argCount; j++) {
      // i. Perform ? Set(O, ! ToString(j), E, true).
      // ii. Set j to j + 1𝔽.
      __Porffor_array_set(O, j, items[j]);
    }
  }

  // 5. Perform ? Set(O, "length", 𝔽(len + argCount), true).
  __Porffor_array_setLengthOf(O, len + argCount);

  // 6. Return 𝔽(len + argCount).
  return len + argCount;
};

// 23.1.3.28 Array.prototype.slice (start, end)
// https://tc39.es/ecma262/#sec-array.prototype.slice
export const __Array_prototype_slice = function (this: any, start: any, end: any) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3-5. Let k be the clamped relativeStart.
  let k: number = __Porffor_array_clampIndex(start, len);

  // 6-8. Let final be the clamped relativeEnd (len if end is undefined).
  let final: number = len;
  if (Porffor.type(end) != Porffor.TYPES.undefined) final = __Porffor_array_clampIndex(end, len);

  // 9. Let count be max(final - k, 0).
  let count: number = final - k;
  if (count < 0) count = 0;

  // 10. Let A be ? ArraySpeciesCreate(O, count).
  const A: any = __Porffor_array_speciesCreate(O, count);

  // 11. Let n be 0.
  let n: number = 0;

  // 12. Repeat, while k < final,
  if (Porffor.fastAnd(Porffor.type(O) == Porffor.TYPES.array, Porffor.type(A) == Porffor.TYPES.array)) if (__Porffor_object_underlyingPtr(A) == 0) {
    const src: any[] = O;
    const out: any[] = A;
    for (; k < final; k++) {
      if (__Porffor_array_has(src, k)) out[n] = src[k];
        else if (__Porffor_array_hasProperty(src, k)) out[n] = __Porffor_object_get(src, k);
      n++;
    }

    __Porffor_array_setLength(out, n);
    return out;
  }

  for (; k < final; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let kValue be ? Get(O, Pk).
      // ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), kValue).
      __Porffor_array_createDataProperty(A, n, __Porffor_array_get(O, k));
    }

    // d. Set k to k + 1.
    // e. Set n to n + 1.
    n++;
  }

  // 13. Perform ? Set(A, "length", 𝔽(n), true).
  __Porffor_array_setLengthOf(A, n);

  // 14. Return A.
  return A;
};

export const __Porffor_array_spliceCount = (argc: i32, count: any, len: number, actualStart: number): number => {
  if (argc == 0) return 0;
  if (argc == 1) return len - actualStart;

  let n: number = ecma262.ToIntegerOrInfinity(count);
  if (n < 0) n = 0;
  if (n > len - actualStart) n = len - actualStart;
  return n;
};

// 23.1.3.31 Array.prototype.splice (start, deleteCount, ...items)
// https://tc39.es/ecma262/#sec-array.prototype.splice
export const __Array_prototype_splice = function (this: any, _argc: i32, start: any, deleteCount: any, ...items: any[]) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3-4. Let actualStart be the clamped relativeStart.
  const actualStart: number = __Porffor_array_clampIndex(start, len);

  // 5. Let itemCount be the number of elements in items.
  const itemCount: i32 = items.length;

  // 6-8. Let actualDeleteCount be 0, len - actualStart or deleteCount clamped between 0 and len - actualStart.
  const actualDeleteCount: number = __Porffor_array_spliceCount(_argc, deleteCount, len, actualStart);

  // 9. If len + itemCount - actualDeleteCount > 2**53 - 1, throw a TypeError exception.
  const newLen: number = len + itemCount - actualDeleteCount;
  if (newLen > 9007199254740991) throw new TypeError('Array length exceeds max safe integer');

  // 10. Let A be ? ArraySpeciesCreate(O, actualDeleteCount).
  const A: any = __Porffor_array_speciesCreate(O, actualDeleteCount);

  if (Porffor.fastAnd(
    Porffor.type(O) == Porffor.TYPES.array,
    Porffor.type(A) == Porffor.TYPES.array,
    newLen <= 2147483647
  )) if (__Porffor_object_underlyingPtr(A) == 0) if (__Porffor_array_fastMove(O as any[], actualStart, len)) {
    const arr: any[] = O;
    const out: any[] = A;
    const s: i32 = actualStart;
    const dc: i32 = actualDeleteCount;
    const tailLen: i32 = len - s - dc;
    const entries: i32 = __Porffor_array_ensure(arr, newLen);

    if (dc > 0) {
      Porffor.IR.copy(__Porffor_array_ensure(out, dc), entries + s * 8, dc * 8);
      Porffor.IR.gcBarrier(out, Porffor.TYPES.array);
    }

    if (itemCount != dc) Porffor.IR.copy(entries + (s + itemCount) * 8, entries + (s + dc) * 8, tailLen * 8);
    if (itemCount > 0) Porffor.IR.copy(entries + s * 8, __Porffor_array_ensure(items, 0), itemCount * 8);
    Porffor.IR.gcBarrier(arr, Porffor.TYPES.array);

    __Porffor_array_setLength(arr, newLen);
    return out;
  }

  // 11. Let k be 0.
  // 12. Repeat, while k < actualDeleteCount,
  for (let k: number = 0; k < actualDeleteCount; k++) {
    // a. Let from be ! ToString(𝔽(actualStart + k)).
    // b. If ? HasProperty(O, from) is true, then
    if (__Porffor_array_hasProperty(O, actualStart + k)) {
      // i. Let fromValue be ? Get(O, from).
      // ii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(k)), fromValue).
      __Porffor_array_createDataProperty(A, k, __Porffor_array_get(O, actualStart + k));
    }
    // c. Set k to k + 1.
  }

  // 13. Perform ? Set(A, "length", 𝔽(actualDeleteCount), true).
  __Porffor_array_setLengthOf(A, actualDeleteCount);

  // 14. If itemCount < actualDeleteCount, then
  if (itemCount < actualDeleteCount) {
    // a. Set k to actualStart.
    // b. Repeat, while k < (len - actualDeleteCount),
    for (let k: number = actualStart; k < len - actualDeleteCount; k++) {
      // i. Let from be ! ToString(𝔽(k + actualDeleteCount)).
      // ii. Let to be ! ToString(𝔽(k + itemCount)).
      // iii. If ? HasProperty(O, from) is true, then
      if (__Porffor_array_hasProperty(O, k + actualDeleteCount)) {
        // 1. Let fromValue be ? Get(O, from).
        // 2. Perform ? Set(O, to, fromValue, true).
        __Porffor_array_set(O, k + itemCount, __Porffor_array_get(O, k + actualDeleteCount));
      } else {
        // iv. Else,
        // 1. Perform ? DeletePropertyOrThrow(O, to).
        __Porffor_array_deleteProperty(O, k + itemCount);
      }
      // v. Set k to k + 1.
    }

    // c. Set k to len.
    // d. Repeat, while k > (len - actualDeleteCount + itemCount),
    for (let k: number = len; k > newLen; k--) {
      // i. Perform ? DeletePropertyOrThrow(O, ! ToString(𝔽(k - 1))).
      // ii. Set k to k - 1.
      __Porffor_array_deleteProperty(O, k - 1);
    }
  } else if (itemCount > actualDeleteCount) {
    // 15. Else if itemCount > actualDeleteCount, then
    // a. Set k to (len - actualDeleteCount).
    // b. Repeat, while k > actualStart,
    for (let k: number = len - actualDeleteCount; k > actualStart; k--) {
      // i. Let from be ! ToString(𝔽(k + actualDeleteCount - 1)).
      // ii. Let to be ! ToString(𝔽(k + itemCount - 1)).
      // iii. If ? HasProperty(O, from) is true, then
      if (__Porffor_array_hasProperty(O, k + actualDeleteCount - 1)) {
        // 1. Let fromValue be ? Get(O, from).
        // 2. Perform ? Set(O, to, fromValue, true).
        __Porffor_array_set(O, k + itemCount - 1, __Porffor_array_get(O, k + actualDeleteCount - 1));
      } else {
        // iv. Else,
        // 1. Perform ? DeletePropertyOrThrow(O, to).
        __Porffor_array_deleteProperty(O, k + itemCount - 1);
      }
      // v. Set k to k - 1.
    }
  }

  // 16. Set k to actualStart.
  // 17. For each element E of items, do
  for (let i: i32 = 0; i < itemCount; i++) {
    // a. Perform ? Set(O, ! ToString(𝔽(k)), E, true).
    // b. Set k to k + 1.
    __Porffor_array_set(O, actualStart + i, items[i]);
  }

  // 18. Perform ? Set(O, "length", 𝔽(len - actualDeleteCount + itemCount), true).
  __Porffor_array_setLengthOf(O, newLen);

  // 19. Return A.
  return A;
};

// 23.1.3.7 Array.prototype.fill (value [, start [, end]])
// https://tc39.es/ecma262/#sec-array.prototype.fill
export const __Array_prototype_fill = function (this: any, value: any, start: any = undefined, end: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3-5. Let k be the clamped relativeStart.
  let k: number = __Porffor_array_clampIndex(start, len);

  // 6-8. Let final be the clamped relativeEnd.
  let final: number = len;
  if (Porffor.type(end) != Porffor.TYPES.undefined) final = __Porffor_array_clampIndex(end, len);

  // 9. Repeat, while k < final,
  if (Porffor.type(O) == Porffor.TYPES.array) if (__Porffor_array_fastMutable(O as any[])) {
    const arr: any[] = O;
    for (; k < final; k++) arr[k] = value;
    return O;
  }

  for (; k < final; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Perform ? Set(O, Pk, value, true).
    // c. Set k to k + 1.
    __Porffor_array_set(O, k, value);
  }

  // 10. Return O.
  return O;
};

// 23.1.3.17 Array.prototype.indexOf (searchElement [, fromIndex])
// https://tc39.es/ecma262/#sec-array.prototype.indexof
export const __Array_prototype_indexOf = function (this: any, searchElement: any, fromIndex: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If len = 0, return -1𝔽.
  if (len == 0) return -1;

  // 4. Let n be ? ToIntegerOrInfinity(fromIndex).
  let n: number = ecma262.ToIntegerOrInfinity(fromIndex);

  // 5. Assert: If fromIndex is undefined, then n is 0.
  // 6. If n = +∞, return -1𝔽.
  if (n == Infinity) return -1;

  // 7. Else if n = -∞, set n to 0.
  if (n == -Infinity) n = 0;

  // 8. If n ≥ 0, then
  //   a. Let k be n.
  // 9. Else,
  //   a. Let k be len + n.
  //   b. If k < 0, set k to 0.
  let k: number = n;
  if (k < 0) {
    k = len + k;
    if (k < 0) k = 0;
  }

  // 10. Repeat, while k < len,
  if (Porffor.type(O) == Porffor.TYPES.array) {
    const arr: any[] = O;
    for (; k < len; k++) {
      if (__Porffor_array_has(arr, k)) {
        if (arr[k] === searchElement) return k;
      } else if (__Porffor_array_hasProperty(arr, k)) {
        if (__Porffor_object_get(arr, k) === searchElement) return k;
      }
    }

    return -1;
  }

  for (; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let elementK be ? Get(O, Pk).
      // ii. If IsStrictlyEqual(searchElement, elementK) is true, return 𝔽(k).
      if (O[k] === searchElement) return k;
    }
    // d. Set k to k + 1.
  }

  // 11. Return -1𝔽.
  return -1;
};

// 23.1.3.20 Array.prototype.lastIndexOf (searchElement [, fromIndex])
// https://tc39.es/ecma262/#sec-array.prototype.lastindexof
export const __Array_prototype_lastIndexOf = function (this: any, _argc: i32, searchElement: any, fromIndex: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If len = 0, return -1𝔽.
  if (len == 0) return -1;

  // 4. If fromIndex is present, let n be ? ToIntegerOrInfinity(fromIndex); else let n be len - 1.
  let n: number = len - 1;
  if (_argc > 1) n = ecma262.ToIntegerOrInfinity(fromIndex);

  // 5. If n = -∞, return -1𝔽.
  if (n == -Infinity) return -1;

  // 6. If n ≥ 0, then
  //   a. Let k be min(n, len - 1).
  // 7. Else,
  //   a. Let k be len + n.
  let k: number = n;
  if (k >= 0) {
    if (k > len - 1) k = len - 1;
  } else {
    k = len + k;
  }

  // 8. Repeat, while k ≥ 0,
  for (; k >= 0; k--) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let elementK be ? Get(O, Pk).
      // ii. If IsStrictlyEqual(searchElement, elementK) is true, return 𝔽(k).
      if (__Porffor_array_get(O, k) === searchElement) return k;
    }
    // d. Set k to k - 1.
  }

  // 9. Return -1𝔽.
  return -1;
};

// 23.1.3.16 Array.prototype.includes (searchElement [, fromIndex])
// https://tc39.es/ecma262/#sec-array.prototype.includes
export const __Array_prototype_includes = function (this: any, searchElement: any, fromIndex: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If len = 0, return false.
  if (len == 0) return false;

  // 4. Let n be ? ToIntegerOrInfinity(fromIndex).
  let n: number = ecma262.ToIntegerOrInfinity(fromIndex);

  // 6. If n = +∞, return false.
  if (n == Infinity) return false;

  // 7. Else if n = -∞, set n to 0.
  if (n == -Infinity) n = 0;

  // 8-9. Let k be n, or len + n clamped to 0 if n is negative.
  let k: number = n;
  if (k < 0) {
    k = len + k;
    if (k < 0) k = 0;
  }

  // 10. Repeat, while k < len,
  for (; k < len; k++) {
    // a. Let elementK be ? Get(O, ! ToString(𝔽(k))).
    // b. If SameValueZero(searchElement, elementK) is true, return true.
    // c. Set k to k + 1.
    if (__ecma262_SameValueZero(__Porffor_array_get(O, k), searchElement)) return true;
  }

  // 11. Return false.
  return false;
};

// 23.1.3.39 Array.prototype.with (index, value)
// https://tc39.es/ecma262/#sec-array.prototype.with
export const __Array_prototype_with = function (this: any, index: any, value: any) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. Let relativeIndex be ? ToIntegerOrInfinity(index).
  // 4. If relativeIndex ≥ 0, let actualIndex be relativeIndex.
  // 5. Else, let actualIndex be len + relativeIndex.
  let actualIndex: number = ecma262.ToIntegerOrInfinity(index);
  if (actualIndex < 0) actualIndex = len + actualIndex;

  // 6. If actualIndex ≥ len or actualIndex < 0, throw a RangeError exception.
  if (Porffor.fastOr(actualIndex >= len, actualIndex < 0)) throw new RangeError('Invalid index');

  // 7. Let A be ? ArrayCreate(len).
  const A: any[] = __Porffor_array_create(len);

  // 8. Let k be 0.
  // 9. Repeat, while k < len,
  for (let k: i32 = 0; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. If k = actualIndex, let fromValue be value.
    // c. Else, let fromValue be ? Get(O, Pk).
    // d. Perform ! CreateDataPropertyOrThrow(A, Pk, fromValue).
    // e. Set k to k + 1.
    if (k == actualIndex) A[k] = value;
      else A[k] = __Porffor_array_get(O, k);
  }

  // 10. Return A.
  return A;
};

// 23.1.3.4 Array.prototype.copyWithin (target, start [, end])
// https://tc39.es/ecma262/#sec-array.prototype.copywithin
export const __Array_prototype_copyWithin = function (this: any, target: any, start: any, end: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3-5. Let to be the clamped relativeTarget.
  let to: number = __Porffor_array_clampIndex(target, len);

  // 6-8. Let from be the clamped relativeStart.
  let from: number = __Porffor_array_clampIndex(start, len);

  // 9-11. Let final be the clamped relativeEnd.
  let final: number = len;
  if (Porffor.type(end) != Porffor.TYPES.undefined) final = __Porffor_array_clampIndex(end, len);

  // 12. Let count be min(final - from, len - to).
  let count: number = final - from;
  if (count > len - to) count = len - to;

  // 13. If from < to and to < from + count, then
  let direction: i32 = 1;
  if (Porffor.fastAnd(from < to, to < from + count)) {
    // a. Let direction be -1.
    direction = -1;

    // b. Set from to from + count - 1.
    from += count - 1;

    // c. Set to to to + count - 1.
    to += count - 1;
  }

  // 15. Repeat, while count > 0,
  while (count > 0) {
    // a. Let fromKey be ! ToString(𝔽(from)).
    // b. Let toKey be ! ToString(𝔽(to)).
    // c. Let fromPresent be ? HasProperty(O, fromKey).
    // d. If fromPresent is true, then
    if (__Porffor_array_hasProperty(O, from)) {
      // i. Let fromValue be ? Get(O, fromKey).
      // ii. Perform ? Set(O, toKey, fromValue, true).
      __Porffor_array_set(O, to, __Porffor_array_get(O, from));
    } else {
      // e. Else,
      // i. Assert: fromPresent is false.
      // ii. Perform ? DeletePropertyOrThrow(O, toKey).
      __Porffor_array_deleteProperty(O, to);
    }

    // f. Set from to from + direction.
    // g. Set to to to + direction.
    // h. Set count to count - 1.
    from += direction;
    to += direction;
    count--;
  }

  // 16. Return O.
  return O;
};

// 23.1.3.2.1 IsConcatSpreadable (O)
// https://tc39.es/ecma262/#sec-isconcatspreadable
export const __Porffor_array_isConcatSpreadable = (O: any): boolean => {
  // 1. If O is not an Object, return false.
  if (!Porffor.object.isObject(O)) return false;

  // 2. Let spreadable be ? Get(O, @@isConcatSpreadable).
  let spreadable: any;
  if (Porffor.type(O) == Porffor.TYPES.array) {
    if (__Porffor_object_underlyingPtr(O) == 0) {
      // avoid materializing the underlying object
      spreadable = __Porffor_object_get(__Porffor_object_getHiddenPrototype(Porffor.TYPES.array), Symbol.isConcatSpreadable);
    } else spreadable = __Porffor_object_get(O, Symbol.isConcatSpreadable);
  } else spreadable = O[Symbol.isConcatSpreadable];

  // 3. If spreadable is not undefined, return ToBoolean(spreadable).
  if (spreadable !== undefined) return !!spreadable;

  // 4. Return ? IsArray(O).
  return Porffor.type(O) == Porffor.TYPES.array;
};

// 23.1.3.2 Array.prototype.concat (...items)
// https://tc39.es/ecma262/#sec-array.prototype.concat
export const __Array_prototype_concat = function (this: any, ...items: any[]) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let A be ? ArraySpeciesCreate(O, 0).
  const A: any = __Porffor_array_speciesCreate(O, 0);
  const fresh: boolean = Porffor.fastAnd(Porffor.type(A) == Porffor.TYPES.array, __Porffor_object_underlyingPtr(A) == 0);

  // 3. Let n be 0.
  let n: number = 0;

  // 4. Prepend O to items.
  // 5. For each element E of items, do
  const itemsLen: i32 = items.length;
  for (let i: i32 = -1; i < itemsLen; i++) {
    const E: any = i == -1 ? O : items[i];

    // a. Let spreadable be ? IsConcatSpreadable(E).
    // b. If spreadable is true, then
    if (__Porffor_array_isConcatSpreadable(E)) {
      // i. Let len be ? LengthOfArrayLike(E).
      const len: number = __Porffor_array_lengthOf(E);

      // ii. If n + len > 2**53 - 1, throw a TypeError exception.
      if (n + len > 9007199254740991) throw new TypeError('Array length exceeds max safe integer');

      // iii. Let k be 0.
      // iv. Repeat, while k < len,
      if (Porffor.fastAnd(fresh, Porffor.type(E) == Porffor.TYPES.array)) {
        const src: any[] = E;
        const out: any[] = A;
        for (let j: i32 = 0; j < len; j++) {
          if (__Porffor_array_has(src, j)) out[n] = src[j];
            else if (__Porffor_array_hasProperty(src, j)) out[n] = __Porffor_object_get(src, j);
          n++;
        }
        continue;
      }

      for (let k: number = 0; k < len; k++) {
        // 1. Let P be ! ToString(𝔽(k)).
        // 2. Let exists be ? HasProperty(E, P).
        // 3. If exists is true, then
        if (__Porffor_array_hasProperty(E, k)) {
          // a. Let subElement be ? Get(E, P).
          // b. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), subElement).
          __Porffor_array_createDataProperty(A, n, __Porffor_array_get(E, k));
        }

        // 4. Set n to n + 1.
        // 5. Set k to k + 1.
        n++;
      }
    } else {
      // c. Else,
      // i. NOTE: E is added as a single item rather than spread.
      // ii. If n ≥ 2**53 - 1, throw a TypeError exception.
      if (n >= 9007199254740991) throw new TypeError('Array length exceeds max safe integer');

      // iii. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(n)), E).
      __Porffor_array_createDataProperty(A, n, E);

      // iv. Set n to n + 1.
      n++;
    }
  }

  // 6. Perform ? Set(A, "length", 𝔽(n), true).
  __Porffor_array_setLengthOf(A, n);

  // 7. Return A.
  return A;
};

// 23.1.3.26 Array.prototype.reverse ()
// https://tc39.es/ecma262/#sec-array.prototype.reverse
export const __Array_prototype_reverse = function (this: any) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. Let middle be floor(len / 2).
  const middle: number = Math.floor(len / 2);

  if (Porffor.type(O) == Porffor.TYPES.array) if (__Porffor_array_fastMove(O as any[], 0, len)) {
    // swap raw entries so holes stay holes
    const entries: i32 = __Porffor_array_ensure(O as any[], len);
    let lo: i32 = entries;
    let hi: i32 = entries + (len - 1) * 8;
    while (lo < hi) {
      const tmp: i64 = Porffor.IR.loadI64(lo, 0);
      Porffor.IR.storeI64(lo, 0, Porffor.IR.loadI64(hi, 0));
      Porffor.IR.storeI64(hi, 0, tmp);
      lo += 8;
      hi -= 8;
    }

    return O;
  }

  // 4. Let lower be 0.
  // 5. Repeat, while lower ≠ middle,
  for (let lower: number = 0; lower != middle; lower++) {
    // a. Let upper be len - lower - 1.
    const upper: number = len - lower - 1;

    // b. Let upperP be ! ToString(𝔽(upper)).
    // c. Let lowerP be ! ToString(𝔽(lower)).
    // d. Let lowerExists be ? HasProperty(O, lowerP).
    const lowerExists: boolean = __Porffor_array_hasProperty(O, lower);

    // e. If lowerExists is true, then
    //   i. Let lowerValue be ? Get(O, lowerP).
    let lowerValue: any;
    if (lowerExists) lowerValue = __Porffor_array_get(O, lower);

    // f. Let upperExists be ? HasProperty(O, upperP).
    const upperExists: boolean = __Porffor_array_hasProperty(O, upper);

    // g. If upperExists is true, then
    //   i. Let upperValue be ? Get(O, upperP).
    let upperValue: any;
    if (upperExists) upperValue = __Porffor_array_get(O, upper);

    if (lowerExists) {
      if (upperExists) {
        // h. If lowerExists is true and upperExists is true, then
        // i. Perform ? Set(O, lowerP, upperValue, true).
        // ii. Perform ? Set(O, upperP, lowerValue, true).
        __Porffor_array_set(O, lower, upperValue);
        __Porffor_array_set(O, upper, lowerValue);
      } else {
        // j. Else if lowerExists is true and upperExists is false, then
        // i. Perform ? DeletePropertyOrThrow(O, lowerP).
        // ii. Perform ? Set(O, upperP, lowerValue, true).
        __Porffor_array_deleteProperty(O, lower);
        __Porffor_array_set(O, upper, lowerValue);
      }
    } else if (upperExists) {
      // i. Else if lowerExists is false and upperExists is true, then
      // i. Perform ? Set(O, lowerP, upperValue, true).
      // ii. Perform ? DeletePropertyOrThrow(O, upperP).
      __Porffor_array_set(O, lower, upperValue);
      __Porffor_array_deleteProperty(O, upper);
    }

    // l. Set lower to lower + 1.
  }

  // 6. Return O.
  return O;
};

// 23.1.3.15 Array.prototype.forEach (callbackfn [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.foreach
export const __Array_prototype_forEach = function (this: any, callbackFn: any, thisArg: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. Let k be 0.
  // 5. Repeat, while k < len,
  if (Porffor.type(O) == Porffor.TYPES.array) {
    const arr: any[] = O;
    for (let i: i32 = 0; i < len; i++) {
      if (__Porffor_array_has(arr, i)) callbackFn.call(thisArg, arr[i], i, O);
        else if (__Porffor_array_hasProperty(arr, i)) callbackFn.call(thisArg, __Porffor_object_get(arr, i), i, O);
    }

    return undefined;
  }

  for (let k: number = 0; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    //   i. Let kValue be ? Get(O, Pk).
    //   ii. Perform ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
    // d. Set k to k + 1.
    if (__Porffor_array_hasProperty(O, k)) callbackFn.call(thisArg, O[k], k, O);
  }

  // 6. Return undefined.
};

// 23.1.3.8 Array.prototype.filter (callbackfn [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.filter
export const __Array_prototype_filter = function (this: any, callbackFn: any, thisArg: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. Let A be ? ArraySpeciesCreate(O, 0).
  const A: any = __Porffor_array_speciesCreate(O, 0);

  // 5. Let k be 0.
  // 6. Let to be 0.
  let to: number = 0;

  // 7. Repeat, while k < len,
  if (Porffor.fastAnd(Porffor.type(O) == Porffor.TYPES.array, Porffor.type(A) == Porffor.TYPES.array)) if (__Porffor_object_underlyingPtr(A) == 0) {
    const arr: any[] = O;
    const out: any[] = A;
    for (let i: i32 = 0; i < len; i++) {
      let kValue: any;
      if (__Porffor_array_has(arr, i)) kValue = arr[i];
        else if (__Porffor_array_hasProperty(arr, i)) kValue = __Porffor_object_get(arr, i);
        else continue;

      if (!!callbackFn.call(thisArg, kValue, i, O)) out[to++] = kValue;
    }

    return out;
  }

  for (let k: number = 0; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let kValue be ? Get(O, Pk).
      const kValue: any = __Porffor_array_get(O, k);

      // ii. Let selected be ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
      // iii. If selected is true, then
      if (!!callbackFn.call(thisArg, kValue, k, O)) {
        // 1. Perform ? CreateDataPropertyOrThrow(A, ! ToString(𝔽(to)), kValue).
        // 2. Set to to to + 1.
        __Porffor_array_createDataProperty(A, to++, kValue);
      }
    }
    // d. Set k to k + 1.
  }

  // 8. Return A.
  return A;
};

// 23.1.3.21 Array.prototype.map (callbackfn [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.map
export const __Array_prototype_map = function (this: any, callbackFn: any, thisArg: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. Let A be ? ArraySpeciesCreate(O, len).
  const A: any = __Porffor_array_speciesCreate(O, len);

  // 5. Let k be 0.
  // 6. Repeat, while k < len,
  if (Porffor.fastAnd(Porffor.type(O) == Porffor.TYPES.array, Porffor.type(A) == Porffor.TYPES.array)) if (__Porffor_object_underlyingPtr(A) == 0) {
    const arr: any[] = O;
    const out: any[] = A;
    for (let i: i32 = 0; i < len; i++) {
      if (__Porffor_array_has(arr, i)) out[i] = callbackFn.call(thisArg, arr[i], i, O);
        else if (__Porffor_array_hasProperty(arr, i)) out[i] = callbackFn.call(thisArg, __Porffor_object_get(arr, i), i, O);
    }

    return out;
  }

  for (let k: number = 0; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let kValue be ? Get(O, Pk).
      // ii. Let mappedValue be ? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »).
      // iii. Perform ? CreateDataPropertyOrThrow(A, Pk, mappedValue).
      __Porffor_array_createDataProperty(A, k, callbackFn.call(thisArg, __Porffor_array_get(O, k), k, O));
    }
    // d. Set k to k + 1.
  }

  // 7. Return A.
  return A;
};

// 23.1.3.6 Array.prototype.every (callbackfn [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.every
export const __Array_prototype_every = function (this: any, callbackFn: any, thisArg: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. Let k be 0.
  // 5. Repeat, while k < len,
  if (Porffor.type(O) == Porffor.TYPES.array) {
    const arr: any[] = O;
    for (let i: i32 = 0; i < len; i++) {
      let kValue: any;
      if (__Porffor_array_has(arr, i)) kValue = arr[i];
        else if (__Porffor_array_hasProperty(arr, i)) kValue = __Porffor_object_get(arr, i);
        else continue;

      if (!callbackFn.call(thisArg, kValue, i, O)) return false;
    }

    return true;
  }

  for (let k: number = 0; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let kValue be ? Get(O, Pk).
      // ii. Let testResult be ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
      // iii. If testResult is false, return false.
      if (!callbackFn.call(thisArg, O[k], k, O)) return false;
    }
    // d. Set k to k + 1.
  }

  // 6. Return true.
  return true;
};

// 23.1.3.29 Array.prototype.some (callbackfn [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.some
export const __Array_prototype_some = function (this: any, callbackFn: any, thisArg: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. Let k be 0.
  // 5. Repeat, while k < len,
  if (Porffor.type(O) == Porffor.TYPES.array) {
    const arr: any[] = O;
    for (let i: i32 = 0; i < len; i++) {
      let kValue: any;
      if (__Porffor_array_has(arr, i)) kValue = arr[i];
        else if (__Porffor_array_hasProperty(arr, i)) kValue = __Porffor_object_get(arr, i);
        else continue;

      if (!!callbackFn.call(thisArg, kValue, i, O)) return true;
    }

    return false;
  }

  for (let k: number = 0; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    if (__Porffor_array_hasProperty(O, k)) {
      // i. Let kValue be ? Get(O, Pk).
      // ii. Let testResult be ToBoolean(? Call(callbackfn, thisArg, « kValue, 𝔽(k), O »)).
      // iii. If testResult is true, return true.
      if (!!callbackFn.call(thisArg, O[k], k, O)) return true;
    }
    // d. Set k to k + 1.
  }

  // 6. Return false.
  return false;
};

// 23.1.3.12.1 FindViaPredicate (O, len, direction, predicate, thisArg)
export const __Porffor_array_findViaPredicate = (O: any, predicate: any, thisArg: any, ascending: boolean, index: boolean): any => {
  const len: number = __Porffor_array_lengthOf(O);

  if (Porffor.type(predicate) != Porffor.TYPES.function) throw new TypeError('Predicate must be a function');
  for (let i: number = 0; i < len; i++) {
    const k: number = ascending ? i : len - 1 - i;
    const kValue: any = __Porffor_array_get(O, k);
    if (!!predicate.call(thisArg, kValue, k, O)) {
      if (index) return k;
      return kValue;
    }
  }

  if (index) return -1;
  return undefined;
};

// 23.1.3.9 Array.prototype.find (predicate [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.find
export const __Array_prototype_find = function (this: any, predicate: any, thisArg: any = undefined) {
  return __Porffor_array_findViaPredicate(ecma262.ToObject(this), predicate, thisArg, true, false);
};

// 23.1.3.10 Array.prototype.findIndex (predicate [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.findindex
export const __Array_prototype_findIndex = function (this: any, predicate: any, thisArg: any = undefined) {
  return __Porffor_array_findViaPredicate(ecma262.ToObject(this), predicate, thisArg, true, true);
};

// 23.1.3.11 Array.prototype.findLast (predicate [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.findlast
export const __Array_prototype_findLast = function (this: any, predicate: any, thisArg: any = undefined) {
  return __Porffor_array_findViaPredicate(ecma262.ToObject(this), predicate, thisArg, false, false);
};

// 23.1.3.12 Array.prototype.findLastIndex (predicate [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.findlastindex
export const __Array_prototype_findLastIndex = function (this: any, predicate: any, thisArg: any = undefined) {
  return __Porffor_array_findViaPredicate(ecma262.ToObject(this), predicate, thisArg, false, true);
};

// 23.1.3.24 Array.prototype.reduce (callbackfn [, initialValue])
// https://tc39.es/ecma262/#sec-array.prototype.reduce
export const __Array_prototype_reduce = function (this: any, _argc: i32, callbackFn: any, initialValue: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. If len = 0 and initialValue is not present, throw a TypeError exception.
  if (Porffor.fastAnd(len == 0, _argc < 2)) throw new TypeError('Reduce of empty array with no initial value');

  // 5. Let k be 0.
  let k: number = 0;

  // 6. Let accumulator be undefined.
  let acc: any = initialValue;

  // 7. If initialValue is present, then
  //   a. Set accumulator to initialValue.
  // 8. Else,
  if (_argc < 2) {
    // a. Let kPresent be false.
    let kPresent: boolean = false;

    // b. Repeat, while kPresent is false and k < len,
    while (Porffor.fastAnd(!kPresent, k < len)) {
      // i. Let Pk be ! ToString(𝔽(k)).
      // ii. Set kPresent to ? HasProperty(O, Pk).
      kPresent = __Porffor_array_hasProperty(O, k);

      // iii. If kPresent is true, then
      //   1. Set accumulator to ? Get(O, Pk).
      if (kPresent) acc = __Porffor_array_get(O, k);

      // iv. Set k to k + 1.
      k++;
    }

    // c. If kPresent is false, throw a TypeError exception.
    if (!kPresent) throw new TypeError('Reduce of empty array with no initial value');
  }

  // 9. Repeat, while k < len,
  if (Porffor.type(O) == Porffor.TYPES.array) {
    const arr: any[] = O;
    for (; k < len; k++) {
      if (__Porffor_array_has(arr, k)) acc = callbackFn(acc, arr[k], k, O);
        else if (__Porffor_array_hasProperty(arr, k)) acc = callbackFn(acc, __Porffor_object_get(arr, k), k, O);
    }

    return acc;
  }

  for (; k < len; k++) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    //   i. Let kValue be ? Get(O, Pk).
    //   ii. Set accumulator to ? Call(callbackfn, undefined, « accumulator, kValue, 𝔽(k), O »).
    // d. Set k to k + 1.
    if (__Porffor_array_hasProperty(O, k)) acc = callbackFn(acc, O[k], k, O);
  }

  // 10. Return accumulator.
  return acc;
};

// 23.1.3.25 Array.prototype.reduceRight (callbackfn [, initialValue])
// https://tc39.es/ecma262/#sec-array.prototype.reduceright
export const __Array_prototype_reduceRight = function (this: any, _argc: i32, callbackFn: any, initialValue: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(callbackfn) is false, throw a TypeError exception.
  if (Porffor.type(callbackFn) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. If len = 0 and initialValue is not present, throw a TypeError exception.
  if (Porffor.fastAnd(len == 0, _argc < 2)) throw new TypeError('Reduce of empty array with no initial value');

  // 5. Let k be len - 1.
  let k: number = len - 1;

  // 6. Let accumulator be undefined.
  let acc: any = initialValue;

  // 7. If initialValue is present, then
  //   a. Set accumulator to initialValue.
  // 8. Else,
  if (_argc < 2) {
    // a. Let kPresent be false.
    let kPresent: boolean = false;

    // b. Repeat, while kPresent is false and k ≥ 0,
    while (Porffor.fastAnd(!kPresent, k >= 0)) {
      // i. Let Pk be ! ToString(𝔽(k)).
      // ii. Set kPresent to ? HasProperty(O, Pk).
      kPresent = __Porffor_array_hasProperty(O, k);

      // iii. If kPresent is true, then
      //   1. Set accumulator to ? Get(O, Pk).
      if (kPresent) acc = __Porffor_array_get(O, k);

      // iv. Set k to k - 1.
      k--;
    }

    // c. If kPresent is false, throw a TypeError exception.
    if (!kPresent) throw new TypeError('Reduce of empty array with no initial value');
  }

  // 9. Repeat, while k ≥ 0,
  for (; k >= 0; k--) {
    // a. Let Pk be ! ToString(𝔽(k)).
    // b. Let kPresent be ? HasProperty(O, Pk).
    // c. If kPresent is true, then
    //   i. Let kValue be ? Get(O, Pk).
    //   ii. Set accumulator to ? Call(callbackfn, undefined, « accumulator, kValue, 𝔽(k), O »).
    // d. Set k to k - 1.
    if (__Porffor_array_hasProperty(O, k)) acc = callbackFn(acc, __Porffor_array_get(O, k), k, O);
  }

  // 10. Return accumulator.
  return acc;
};

// a < b for strings
export const __Porffor_strlt = (a: string|bytestring, b: string|bytestring) => {
  const aLen: i32 = a.length;
  const bLen: i32 = b.length;
  const len: i32 = aLen < bLen ? aLen : bLen;
  for (let i: i32 = 0; i < len; i++) {
    const ac: i32 = a.charCodeAt(i);
    const bc: i32 = b.charCodeAt(i);

    if (ac < bc) return true;
    if (ac > bc) return false;
  }

  return aLen < bLen;
};

// 23.1.3.30.2 CompareArrayElements (x, y, comparefn)
// https://tc39.es/ecma262/#sec-comparearrayelements
export const __ecma262_CompareArrayElements = (x: any, y: any, comparefn: any): number => {
  // 1. If x and y are both undefined, return +0𝔽.
  // 2. If x is undefined, return 1𝔽.
  if (Porffor.type(x) == Porffor.TYPES.undefined) {
    if (Porffor.type(y) == Porffor.TYPES.undefined) return 0;
    return 1;
  }
  // 3. If y is undefined, return -1𝔽.
  if (Porffor.type(y) == Porffor.TYPES.undefined) return -1;
  // 4. a. Let v be ? ToNumber(? Call(comparefn, undefined, « x, y »)).
  // perf: ToNumber and the NaN check are unneeded as callers just check < 0
  const v: number = comparefn(x, y);
  return v;
};

export const __Porffor_array_mergeSort = (items: any[], len: i32, comparefn: any): void => {
  const left: any[] = Porffor.array.new(len);
  left.length = len;
  for (let width: i32 = 1; width < len; width *= 2) {
    for (let lo: i32 = 0; lo < len; lo += width * 2) {
      let mid: i32 = lo + width;
      if (mid > len) mid = len;
      let hi: i32 = lo + width * 2;
      if (hi > len) hi = len;
      if (mid == hi || !(ecma262.CompareArrayElements(items[mid], items[mid - 1], comparefn) < 0)) continue;

      const leftLen: i32 = mid - lo;
      for (let k: i32 = 0; k < leftLen; k++) left[k] = items[lo + k];

      let i: i32 = 0;
      let j: i32 = mid;
      let k: i32 = lo;
      while (i < leftLen && j < hi) {
        if (ecma262.CompareArrayElements(items[j], left[i], comparefn) < 0) items[k++] = items[j++];
          else items[k++] = left[i++];
      }
      while (i < leftLen) items[k++] = left[i++];
    }
  }
};

export const __Porffor_array_sortItems = (O: any, len: number, comparefn: any, skipHoles: boolean): any[] => {
  // 1. Let items be a new empty List.
  const items: any[] = Porffor.array.new(len > 65536 ? 4 : len);
  let n: i32 = 0;

  // 2. Let k be 0.
  // 3. Repeat, while k < len,
  if (Porffor.type(O) == Porffor.TYPES.array) {
    const arr: any[] = O;
    for (let i: i32 = 0; i < len; i++) {
      if (__Porffor_array_has(arr, i)) items[n++] = arr[i];
        else if (Porffor.fastOr(!skipHoles, __Porffor_array_hasProperty(arr, i))) items[n++] = __Porffor_object_get(arr, i);
    }
  } else {
    for (let k: number = 0; k < len; k++) {
      // a. Let Pk be ! ToString(𝔽(k)).
      // b. If holes is skip-holes, then
      //   i. Let kRead be ? HasProperty(obj, Pk).
      // c. Else,
      //   i. Let kRead be true.
      // d. If kRead is true, then
      //   i. Let kValue be ? Get(obj, Pk).
      //   ii. Append kValue to items.
      // e. Set k to k + 1.
      if (Porffor.fastOr(!skipHoles, __Porffor_array_hasProperty(O, k))) items[n++] = O[k];
    }
  }

  // 4. Sort items using an implementation-defined sequence of calls to SortCompare.
  __Porffor_array_mergeSort(items, n, comparefn);

  // 5. Return items.
  return items;
};

export const __Porffor_array_defaultCompare = (x: any, y: any): number => {
  // 23.1.3.30.2 CompareArrayElements (x, y, comparefn)
  // https://tc39.es/ecma262/#sec-comparearrayelements
  // 5. Let xString be ? ToString(x).
  const xString: any = ecma262.ToString(x);

  // 6. Let yString be ? ToString(y).
  const yString: any = ecma262.ToString(y);

  // 7. Let xSmaller be ! IsLessThan(xString, yString, true).
  // 8. If xSmaller is true, return -1𝔽.
  if (__Porffor_strlt(xString, yString)) return -1;

  // 9. Let ySmaller be ! IsLessThan(yString, xString, true).
  // 10. If ySmaller is true, return 1𝔽.
  if (__Porffor_strlt(yString, xString)) return 1;

  // 11. Return +0𝔽.
  return 0;
};

// 23.1.3.30 Array.prototype.sort (comparefn)
// https://tc39.es/ecma262/#sec-array.prototype.sort
export const __Array_prototype_sort = function (this: any, comparefn: any) {
  // 1. If comparefn is not undefined and IsCallable(comparefn) is false, throw a TypeError exception.
  if (comparefn === undefined) comparefn = __Porffor_array_defaultCompare;
    else if (Porffor.type(comparefn) != Porffor.TYPES.function) throw new TypeError('Comparator must be a function');

  // 2. Let obj be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 3. Let len be ? LengthOfArrayLike(obj).
  const len: number = __Porffor_array_lengthOf(O);

  // 4-5. Let sortedList be ? SortIndexedProperties(obj, len, SortCompare, skip-holes).
  const items: any[] = __Porffor_array_sortItems(O, len, comparefn, true);

  // 6. Let itemCount be the number of elements in sortedList.
  const itemCount: i32 = items.length;

  // 7. Let j be 0.
  // 8. Repeat, while j < itemCount,
  //   a. Perform ? Set(obj, ! ToString(𝔽(j)), sortedList[j], true).
  //   b. Set j to j + 1.
  let j: number = 0;
  if (Porffor.type(O) == Porffor.TYPES.array) if (__Porffor_array_fastMutable(O as any[])) {
    const arr: any[] = O;
    for (; j < itemCount; j++) arr[j] = items[j];
  }

  for (; j < itemCount; j++) __Porffor_array_set(O, j, items[j]);

  // 9. NOTE: The call to SortIndexedProperties in step 5 uses skip-holes. The remaining indices are deleted to preserve the number of holes that were detected and excluded from the sort.
  // 10. Repeat, while j < len,
  //   a. Perform ? DeletePropertyOrThrow(obj, ! ToString(𝔽(j))).
  //   b. Set j to j + 1.
  for (; j < len; j++) __Porffor_array_deleteProperty(O, j);

  // 11. Return obj.
  return O;
};

// 23.1.3.34 Array.prototype.toSorted (comparefn)
// https://tc39.es/ecma262/#sec-array.prototype.tosorted
export const __Array_prototype_toSorted = function (this: any, comparefn: any) {
  // 1. If comparefn is not undefined and IsCallable(comparefn) is false, throw a TypeError exception.
  if (comparefn === undefined) comparefn = __Porffor_array_defaultCompare;
    else if (Porffor.type(comparefn) != Porffor.TYPES.function) throw new TypeError('Comparator must be a function');

  // 2. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 3. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 4. Let A be ? ArrayCreate(len).
  if (len > 2147483647) throw new RangeError('Invalid array length');

  // 5-6. Let sortedList be ? SortIndexedProperties(O, len, SortCompare, read-through-holes).
  // 7-8. Write sortedList into A (sortedList is already a fresh array of length len).
  // 9. Return A.
  return __Porffor_array_sortItems(O, len, comparefn, false);
};

// 23.1.3.33 Array.prototype.toReversed ()
// https://tc39.es/ecma262/#sec-array.prototype.toreversed
export const __Array_prototype_toReversed = function (this: any) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. Let A be ? ArrayCreate(len).
  const A: any[] = __Porffor_array_create(len);

  // 4. Let k be 0.
  // 5. Repeat, while k < len,
  for (let k: i32 = 0; k < len; k++) {
    // a. Let from be ! ToString(𝔽(len - k - 1)).
    // b. Let Pk be ! ToString(𝔽(k)).
    // c. Let fromValue be ? Get(O, from).
    // d. Perform ! CreateDataPropertyOrThrow(A, Pk, fromValue).
    // e. Set k to k + 1.
    A[k] = __Porffor_array_get(O, len - k - 1);
  }

  // 6. Return A.
  return A;
};

// 23.1.3.35 Array.prototype.toSpliced (start, skipCount, ...items)
// https://tc39.es/ecma262/#sec-array.prototype.tospliced
export const __Array_prototype_toSpliced = function (this: any, _argc: i32, start: any, skipCount: any, ...items: any[]) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3-4. Let actualStart be the clamped relativeStart.
  const actualStart: number = __Porffor_array_clampIndex(start, len);

  // 5. Let insertCount be the number of elements in items.
  const insertCount: i32 = items.length;

  // 6-8. Let actualSkipCount be 0, len - actualStart or skipCount clamped between 0 and len - actualStart.
  const actualSkipCount: number = __Porffor_array_spliceCount(_argc, skipCount, len, actualStart);

  // 9. Let newLen be len + insertCount - actualSkipCount.
  const newLen: number = len + insertCount - actualSkipCount;

  // 10. If newLen > 2**53 - 1, throw a TypeError exception.
  if (newLen > 9007199254740991) throw new TypeError('Array length exceeds max safe integer');

  // 11. Let A be ? ArrayCreate(newLen).
  const A: any[] = __Porffor_array_create(newLen);

  // 12. Let i be 0.
  let i: i32 = 0;

  // 13. Let r be actualStart + actualSkipCount.
  let r: number = actualStart + actualSkipCount;

  // 14. Repeat, while i < actualStart,
  //   a. Let Pi be ! ToString(𝔽(i)).
  //   b. Let iValue be ? Get(O, Pi).
  //   c. Perform ! CreateDataPropertyOrThrow(A, Pi, iValue).
  //   d. Set i to i + 1.
  for (; i < actualStart; i++) A[i] = __Porffor_array_get(O, i);

  // 15. For each element E of items, do
  //   a. Let Pi be ! ToString(𝔽(i)).
  //   b. Perform ! CreateDataPropertyOrThrow(A, Pi, E).
  //   c. Set i to i + 1.
  for (let j: i32 = 0; j < insertCount; j++) A[i++] = items[j];

  // 16. Repeat, while i < newLen,
  //   a. Let Pi be ! ToString(𝔽(i)).
  //   b. Let from be ! ToString(𝔽(r)).
  //   c. Let fromValue be ? Get(O, from).
  //   d. Perform ! CreateDataPropertyOrThrow(A, Pi, fromValue).
  //   e. Set i to i + 1.
  //   f. Set r to r + 1.
  for (; i < newLen; i++) A[i] = __Porffor_array_get(O, r++);

  // 17. Return A.
  return A;
};

// 23.1.3.13.1 FlattenIntoArray (target, source, sourceLen, start, depth [, mapperFunction [, thisArg]])
// https://tc39.es/ecma262/#sec-flattenintoarray
export const __Porffor_array_flattenInto = (target: any, source: any, sourceLen: number, start: number, depth: number, mapperFunction: any, thisArg: any): number => {
  // 2. Let targetIndex be start.
  let targetIndex: number = start;

  // 3. Let sourceIndex be +0𝔽.
  // 4. Repeat, while ℝ(sourceIndex) < sourceLen,
  for (let sourceIndex: number = 0; sourceIndex < sourceLen; sourceIndex++) {
    // a. Let P be ! ToString(sourceIndex).
    // b. Let exists be ? HasProperty(source, P).
    // c. If exists is true, then
    if (__Porffor_array_hasProperty(source, sourceIndex)) {
      // i. Let element be ? Get(source, P).
      let element: any = __Porffor_array_get(source, sourceIndex);

      // ii. If mapperFunction is present, then
      //   1. Set element to ? Call(mapperFunction, thisArg, « element, sourceIndex, source »).
      if (Porffor.type(mapperFunction) == Porffor.TYPES.function) element = mapperFunction.call(thisArg, element, sourceIndex, source);

      // iii. Let shouldFlatten be false.
      // iv. If depth > 0, then
      //   1. Set shouldFlatten to ? IsArray(element).
      // v. If shouldFlatten is true, then
      if (Porffor.fastAnd(depth > 0, Porffor.type(element) == Porffor.TYPES.array)) {
        // 1. If depth = +∞, let newDepth be +∞.
        // 2. Else, let newDepth be depth - 1.
        // 3. Let elementLen be ? LengthOfArrayLike(element).
        // 4. Set targetIndex to ? FlattenIntoArray(target, element, elementLen, targetIndex, newDepth).
        targetIndex = __Porffor_array_flattenInto(target, element, (element as any[]).length, targetIndex, depth - 1, undefined, undefined);
      } else {
        // vi. Else,
        // 1. If targetIndex ≥ 2**53 - 1, throw a TypeError exception.
        if (targetIndex >= 9007199254740991) throw new TypeError('Array length exceeds max safe integer');

        // 2. Perform ? CreateDataPropertyOrThrow(target, ! ToString(𝔽(targetIndex)), element).
        __Porffor_array_createDataProperty(target, targetIndex, element);

        // 3. Set targetIndex to targetIndex + 1.
        targetIndex++;
      }
    }
    // d. Set sourceIndex to sourceIndex + 1𝔽.
  }

  // 5. Return targetIndex.
  return targetIndex;
};

// 23.1.3.13 Array.prototype.flat ([depth])
// https://tc39.es/ecma262/#sec-array.prototype.flat
export const __Array_prototype_flat = function (this: any, depth: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let sourceLen be ? LengthOfArrayLike(O).
  const sourceLen: number = __Porffor_array_lengthOf(O);

  // 3. Let depthNum be 1.
  let depthNum: number = 1;

  // 4. If depth is not undefined, then
  if (Porffor.type(depth) != Porffor.TYPES.undefined) {
    // a. Set depthNum to ? ToIntegerOrInfinity(depth).
    depthNum = ecma262.ToIntegerOrInfinity(depth);

    // b. If depthNum < 0, set depthNum to 0.
    if (depthNum < 0) depthNum = 0;
  }

  // 5. Let A be ? ArraySpeciesCreate(O, 0).
  const A: any = __Porffor_array_speciesCreate(O, 0);

  // 6. Perform ? FlattenIntoArray(A, O, sourceLen, 0, depthNum).
  __Porffor_array_flattenInto(A, O, sourceLen, 0, depthNum, undefined, undefined);

  // 7. Return A.
  return A;
};

// 23.1.3.14 Array.prototype.flatMap (mapperFunction [, thisArg])
// https://tc39.es/ecma262/#sec-array.prototype.flatmap
export const __Array_prototype_flatMap = function (this: any, mapperFunction: any, thisArg: any = undefined) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let sourceLen be ? LengthOfArrayLike(O).
  const sourceLen: number = __Porffor_array_lengthOf(O);

  // 3. If IsCallable(mapperFunction) is false, throw a TypeError exception.
  if (Porffor.type(mapperFunction) != Porffor.TYPES.function) throw new TypeError('Callback must be a function');

  // 4. Let A be ? ArraySpeciesCreate(O, 0).
  const A: any = __Porffor_array_speciesCreate(O, 0);

  // 5. Perform ? FlattenIntoArray(A, O, sourceLen, 0, 1, mapperFunction, thisArg).
  __Porffor_array_flattenInto(A, O, sourceLen, 0, 1, mapperFunction, thisArg);

  // 6. Return A.
  return A;
};

// 23.1.3.18 Array.prototype.join (separator)
// https://tc39.es/ecma262/#sec-array.prototype.join
export const __Array_prototype_join = function (this: any, _separator: any) {
  // 1. Let O be ? ToObject(this value).
  const O: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(O).
  const len: number = __Porffor_array_lengthOf(O);

  // 3. If separator is undefined, let sep be ",".
  // 4. Else, let sep be ? ToString(separator).
  let separator: any = ',';
  if (Porffor.type(_separator) != Porffor.TYPES.undefined)
    separator = ecma262.ToString(_separator);

  if (len == 0) return '';
  if (len > 2147483647) throw new RangeError('Invalid string length');

  const separatorLen: i32 = separator.length;
  let outLen: i32 = len > 1 ? separatorLen * (len - 1) : 0;
  let bytesOnly: boolean = Porffor.type(separator) == Porffor.TYPES.bytestring;
  const parts: any[] = Porffor.array.new(len);
  const partLens: i32 = Porffor.malloc(len * 4);

  // 7. Repeat, while k < len,
  let i: i32 = 0;
  while (i < len) {
    // b. Let element be ? Get(O, ! ToString(𝔽(k))).
    const element: any = __Porffor_array_get(O, i++);

    // c. If element is either undefined or null, let next be the empty String; otherwise, let next be ? ToString(element).
    const elementType: i32 = Porffor.type(element);
    let partLen: i32 = 0;
    if (Porffor.fastAnd(elementType != Porffor.TYPES.undefined, Porffor.fastOr(
      elementType != Porffor.TYPES.object,
      Porffor.IR.ptr(element) != 0
    ))) {
      const part: any = ecma262.ToString(element);
      parts[i - 1] = part;
      partLen = part.length;
      outLen += partLen;
      if (Porffor.type(part) != Porffor.TYPES.bytestring) bytesOnly = false;
    }

    Porffor.IR.storeI32(partLens + (i - 1) * 4, 0, partLen);
  }

  if (bytesOnly) {
    const out: bytestring = Porffor.malloc(outLen + 6);
    Porffor.IR.storeI32(out, 0, outLen);

    let outPtr: i32 = Porffor.IR.ptr(out);
    i = 0;
    while (i < len) {
      if (i > 0) {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(separator) + 4, separatorLen);
        outPtr += separatorLen;
      }

      const part: bytestring = parts[i];
      const partLen: i32 = Porffor.IR.loadI32(partLens + i * 4, 0);
      i++;
      if (partLen != 0) {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(part) + 4, partLen);
        outPtr += partLen;
      }
    }

    return out;
  }

  const out: string = Porffor.malloc(outLen * 2 + 6);
  Porffor.IR.storeI32(out, 0, outLen);

  let outPtr: i32 = Porffor.IR.ptr(out);
  i = 0;
  while (i < len) {
    if (i > 0) {
      if (Porffor.type(separator) == Porffor.TYPES.bytestring) {
        for (let j: i32 = 0; j < separatorLen; j++)
          Porffor.IR.storeU16(outPtr + j * 2, 4, Porffor.IR.loadU8(Porffor.IR.ptr(separator) + j, 4));
      } else {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(separator) + 4, separatorLen * 2);
      }
      outPtr += separatorLen * 2;
    }

    const part: any = parts[i];
    const partLen: i32 = Porffor.IR.loadI32(partLens + i * 4, 0);
    i++;
    if (partLen != 0) {
      if (Porffor.type(part) == Porffor.TYPES.bytestring) {
        for (let j: i32 = 0; j < partLen; j++)
          Porffor.IR.storeU16(outPtr + j * 2, 4, Porffor.IR.loadU8(Porffor.IR.ptr(part) + j, 4));
      } else {
        Porffor.IR.copy(outPtr + 4, Porffor.IR.ptr(part) + 4, partLen * 2);
      }
      outPtr += partLen * 2;
    }
  }

  return out;
};

// 23.1.3.36 Array.prototype.toString ()
// https://tc39.es/ecma262/#sec-array.prototype.tostring
export const __Array_prototype_toString = function (this: any) {
  // 1. Let array be ? ToObject(this value).
  const array: any = ecma262.ToObject(this);

  if (Porffor.type(array) == Porffor.TYPES.array) if (__Porffor_object_underlyingPtr(array) == 0) {
    if (__Porffor_object_getHiddenPrototype(Porffor.TYPES.array) == __Object_prototype) return Porffor.callThis(__Array_prototype_join, array);
  }

  // 2. Let func be ? Get(array, "join").
  const func: any = array['join'];

  // 3. If IsCallable(func) is false, set func to the intrinsic function %Object.prototype.toString%.
  // 4. Return ? Call(func, array).
  if (Porffor.type(func) == Porffor.TYPES.function) return func.call(array);
  return Porffor.callThis(__Object_prototype_toString, array);
};

// 23.1.3.32 Array.prototype.toLocaleString ([reserved1 [, reserved2]])
// https://tc39.es/ecma262/#sec-array.prototype.tolocalestring
export const __Array_prototype_toLocaleString = function (this: any) {
  // 1. Let array be ? ToObject(this value).
  const array: any = ecma262.ToObject(this);

  // 2. Let len be ? LengthOfArrayLike(array).
  const len: number = __Porffor_array_lengthOf(array);

  // 3. Let separator be the implementation-defined list-separator String appropriate for the host environment's current locale (such as ", ").
  // 4. Let R be the empty String.
  let R: any = '';

  // 5. Let k be 0.
  // 6. Repeat, while k < len,
  for (let k: number = 0; k < len; k++) {
    // a. If k > 0, set R to the string-concatenation of R and separator.
    if (k > 0) R = R + ',';

    // b. Let nextElement be ? Get(array, ! ToString(k)).
    const nextElement: any = __Porffor_array_get(array, k);

    // c. If nextElement is neither undefined nor null, then
    if (nextElement != null) {
      // i. Let S be ? ToString(? Invoke(nextElement, "toLocaleString")).
      // ii. Set R to the string-concatenation of R and S.
      if (Porffor.type(nextElement) == Porffor.TYPES.object) {
        const func: any = nextElement['toLocaleString'];
        if (Porffor.type(func) != Porffor.TYPES.function) throw new TypeError('toLocaleString is not a function');
        R = R + ecma262.ToString(func.call(nextElement));
      } else {
        R = R + ecma262.ToString(nextElement.toLocaleString());
      }
    }

    // d. Set k to k + 1.
  }

  // 7. Return R.
  return R;
};

export const __Array_prototype_valueOf = function (this: any) {
  return ecma262.ToObject(this);
};

export const __Array_prototype_values = function (this: any) {
  return __Porffor_ArrayIterator_new(this, 0);
};

export const __Array_prototype_Symbol_iterator = function (this: any) {
  return __Porffor_ArrayIterator_new(this, 0);
};

export const __Array_prototype_keys = function (this: any) {
  return __Porffor_ArrayIterator_new(this, 1);
};

export const __Array_prototype_entries = function (this: any) {
  return __Porffor_ArrayIterator_new(this, 3);
};



export const __Porffor_array_fastPush = (arr: any[], el: any): i32 => {
  let len: i32 = arr.length;
  arr[len] = el;
  arr.length = ++len;
  return len;
};
