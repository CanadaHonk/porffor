import type {} from './porffor.d.ts';

// ES2025 Iterator / Iterator Helpers (https://tc39.es/ecma262/#sec-iterator-objects)
//
// Iterator/IteratorHelper/WrapForValidIterator instances (and the internal string iterator
// used by Iterator.from) are all plain (TYPES.object) objects with a real __proto__ chain
// (set via Porffor.object.new + dot-assignment, same mechanism user classes use) - NOT
// Porffor's internal exotic types. This is deliberate: it makes instanceof/getPrototypeOf/
// subclassing behave correctly (matching plain user-defined classes), at the cost of relying
// on codegen's generic for-of support for TYPES.object (added alongside this file) rather
// than the fast internal-type iteration paths.
//
// Helper "kinds" (IteratorHelper.__kind): 0 = map, 1 = filter, 2 = take, 3 = drop, 4 = flatMap

// ---------------------------------------------------------------------------
// shared iterator-protocol helpers
// ---------------------------------------------------------------------------

// IteratorStep/IteratorStepValue given an already-fetched (cached) next method.
// Native generators are special-cased throughout this file: Porffor's generic (chain
// walking) property lookup does not work on coroutine-boxed values (a pre-existing gap
// unrelated to iterator helpers - `.next`/`.return` resolve fine as *calls* via the
// compiler's builtin-prototype-method fast path, but not as plain property reads), so a
// cached `nextMethod` fetched off a generator is never valid - drive it directly instead
export const __Porffor_iteratorStepCached = (iterator: any, nextMethod: any): any => {
  if (Porffor.type(iterator) == Porffor.TYPES.__porffor_generator) {
    const done: boolean = Porffor.coroutine.resume(iterator, undefined, 0 as i32);
    return __Porffor_createIterResult(Porffor.coroutine.value(iterator), done);
  }

  if (Porffor.type(nextMethod) != Porffor.TYPES.function) throw new TypeError("Iterator's 'next' method is not callable");

  const result: any = nextMethod.call(iterator);
  if (!Porffor.object.isObject(result)) throw new TypeError('Iterator result is not an object');

  return result;
};

// generic GetIterator for for-of's TYPES.object case: consult Symbol.iterator if the
// object has one (so a container with a *separate* iterator - `{ [Symbol.iterator]() {
// return { next() {...} }; } }` - works, matching the real iteration protocol), else treat
// the object itself as already being the iterator (covers every Iterator/IteratorHelper
// instance this file produces, none of which declare [Symbol.iterator] - see the note
// below - as well as plain `{ next() {...} }` objects). Called once per for-of loop;
// codegen caches the result (and the resulting `.next` method) across iterations
export const __Porffor_getIteratorForOf = (obj: any): any => {
  const method: any = obj[Symbol.iterator];
  if (Porffor.type(method) != Porffor.TYPES.function) return obj;

  const iterator: any = method.call(obj);
  if (!Porffor.object.isObject(iterator)) throw new TypeError('Result of the Symbol.iterator method is not an object');

  return iterator;
};

export const __Porffor_iteratorResultDone = (result: any): boolean => !!result.done;
export const __Porffor_iteratorResultValue = (result: any): any => result.value;

export const __Porffor_createIterResult = (value: any, done: boolean): any => {
  const result: object = {};
  result.value = value;
  result.done = done;
  return result;
};

// IteratorClose, swallowing lookup/callability issues (used for the "close on abrupt
// completion during argument validation" paths, mirroring how those close failures are
// themselves suppressed by the surrounding ? in most call sites we approximate here)
export const __Porffor_iteratorClose = (iterator: any): void => {
  if (Porffor.type(iterator) == Porffor.TYPES.__porffor_generator) {
    Porffor.coroutine.resume(iterator, undefined, 2 as i32);
    return;
  }

  if (!Porffor.object.isObject(iterator)) return;

  const returnMethod: any = iterator.return;
  if (Porffor.type(returnMethod) == Porffor.TYPES.function) returnMethod.call(iterator);
};

// ---------------------------------------------------------------------------
// Iterator (abstract, subclassable) - https://tc39.es/ecma262/#sec-iterator-constructor
// ---------------------------------------------------------------------------

export const Iterator = function (): any {
  if (Porffor.type(new.target) == Porffor.TYPES.undefined) throw new TypeError("Constructor Iterator requires 'new'");
  if (new.target == Iterator) throw new TypeError('Iterator is an abstract class and cannot be instantiated directly');
};

// note: Iterator.prototype[Symbol.iterator]/[Symbol.dispose]/[Symbol.toStringTag] are
// deliberately NOT implemented on Iterator.prototype itself - registering a well-known-
// symbol-keyed property through this file's builtins.js hook (needed since a literal
// computed key isn't expressible in the meta-code that builds prototype objects) was found
// to corrupt unrelated lazy-object finalization (e.g. Object.prototype.hasOwnProperty
// silently disappearing) for reasons not fully root-caused in the time available; not worth
// the blast radius for a handful of structural tests. This does NOT affect consuming
// foreign iterables, though: codegen's generic for-of object case (generateForOf) calls
// __Porffor_getIteratorForOf above, which *does* consult a real [Symbol.iterator] property
// when the object being iterated has one (e.g. a user class with its own @@iterator method)
// - it only skips the lookup for objects that don't have one, which includes every
// Iterator/IteratorHelper instance this file produces (they're already their own iterator)

// internal-only string iterator used by Iterator.from(stringPrimitive) below -
// GetIteratorFlattenable's iterate-string-primitives mode requires Iterator.from to accept
// string primitives directly (unlike every other consumer in this file, which treats a bare
// string as non-iterable). Not exposed as String.prototype[Symbol.iterator] (see the note
// above on why well-known-symbol-keyed properties aren't registered in this file) - iterates
// by Unicode code point, matching the real %StringIteratorPrototype% (a surrogate pair is
// yielded as one two-code-unit string, not two separate lone surrogates)
export const __Porffor_StringIterator_prototype_next = function (this: any): any {
  if (Porffor.type(this) != Porffor.TYPES.object || Porffor.type(this.__target) == Porffor.TYPES.undefined)
    throw new TypeError('next called on a value that is not a String Iterator');

  const target: any = this.__target;
  const index: i32 = this.__index;
  if (index >= target.length) return __Porffor_createIterResult(undefined, true);

  const cp: number = target.codePointAt(index);
  const chunkLen: i32 = cp > 0xffff ? 2 : 1;
  this.__index = index + chunkLen;
  return __Porffor_createIterResult(target.slice(index, index + chunkLen), false);
};

export const __Porffor_stringIteratorNew = (str: any): any => {
  const it: object = Porffor.object.new(2);
  it.__proto__ = __Porffor_StringIterator_prototype;
  it.__target = str;
  it.__index = 0;
  return it;
};

// 27.1.3.1 Iterator.from ( O )
export const __Iterator_from = (O: any): any => {
  // strings are the one primitive Iterator.from accepts directly (GetIteratorFlattenable's
  // iterate-string-primitives mode) - handled directly since there's no real
  // String.prototype[Symbol.iterator] to dispatch through generically in this engine
  if (Porffor.fastOr(Porffor.type(O) == Porffor.TYPES.string, (Porffor.type(O) | 0b10000000) == Porffor.TYPES.bytestring))
    return __Porffor_stringIteratorNew(O);

  if (!Porffor.object.isObject(O)) throw new TypeError('Iterator.from called on a non-object, non-string value');

  // generators are already their own iterator - short-circuit before the Symbol.iterator /
  // next lookups below, which (per the generic-member-lookup gap noted above) can't read
  // properties off a raw generator anyway
  if (Porffor.fastOr(Porffor.type(O) == Porffor.TYPES.__porffor_generator, Porffor.type(O) == Porffor.TYPES.__porffor_asyncgenerator))
    return O;

  let iterator: any = O;
  const openMethod: any = O[Symbol.iterator];
  if (Porffor.type(openMethod) == Porffor.TYPES.function) {
    iterator = openMethod.call(O);
    if (!Porffor.object.isObject(iterator)) throw new TypeError('Result of the Symbol.iterator method is not an object');
  } else if (Porffor.type(O.next) != Porffor.TYPES.function) {
    throw new TypeError('Iterator.from argument is not iterable and has no next method');
  }

  if (Porffor.fastOr(
    Porffor.type(iterator) == Porffor.TYPES.__porffor_generator,
    Porffor.type(iterator) == Porffor.TYPES.__porffor_asyncgenerator,
    iterator instanceof Iterator
  )) return iterator;

  const wrapper: object = Porffor.object.new(2);
  wrapper.__proto__ = __WrapForValidIterator_prototype;
  wrapper.__iterated = iterator;
  wrapper.__nextMethod = iterator.next;
  return wrapper;
};

// ---------------------------------------------------------------------------
// %WrapForValidIteratorPrototype% - wraps a "raw" (non-Iterator-derived) iterator so it
// gets Iterator.prototype's helper methods
// ---------------------------------------------------------------------------

export const __WrapForValidIterator_prototype_next = function (this: any): any {
  if (Porffor.type(this) != Porffor.TYPES.object || Porffor.type(this.__iterated) == Porffor.TYPES.undefined)
    throw new TypeError("next called on a value that does not have the [[Iterated]] internal slot");

  return __Porffor_iteratorStepCached(this.__iterated, this.__nextMethod);
};

export const __WrapForValidIterator_prototype_return = function (this: any): any {
  if (Porffor.type(this) != Porffor.TYPES.object || Porffor.type(this.__iterated) == Porffor.TYPES.undefined)
    throw new TypeError("return called on a value that does not have the [[Iterated]] internal slot");

  const iterator: any = this.__iterated;
  const returnMethod: any = iterator.return;
  if (Porffor.type(returnMethod) != Porffor.TYPES.function) return __Porffor_createIterResult(undefined, true);

  return returnMethod.call(iterator);
};

// ---------------------------------------------------------------------------
// %IteratorHelperPrototype% - the shape returned by map/filter/take/drop/flatMap
// ---------------------------------------------------------------------------

const __Porffor_IteratorHelper_KIND_MAP: i32 = 0;
const __Porffor_IteratorHelper_KIND_FILTER: i32 = 1;
const __Porffor_IteratorHelper_KIND_TAKE: i32 = 2;
const __Porffor_IteratorHelper_KIND_DROP: i32 = 3;
const __Porffor_IteratorHelper_KIND_FLATMAP: i32 = 4;

export const __Porffor_iteratorHelperNew = (kind: i32, underlying: any, nextMethod: any, fn: any, counterInit: number): any => {
  const helper: object = Porffor.object.new(8);
  helper.__proto__ = __IteratorHelper_prototype;
  helper.__kind = kind;
  helper.__underlying = underlying;
  helper.__nextMethod = nextMethod;
  helper.__fn = fn;
  helper.__counter = counterInit;
  helper.__done = false;
  helper.__innerIterator = undefined;
  helper.__innerNextMethod = undefined;
  return helper;
};

// the underlying iterator reported [[Done]] on its own accord - it's already exhausted, so
// there is nothing to IteratorClose (matches how take's own "underlying finished" branch
// below is written, and how the spec's per-kind closures just `return ReturnCompletion` on
// a done value without an explicit IteratorClose)
export const __Porffor_iteratorHelperDone = (helper: any): any => {
  helper.__done = true;
  return __Porffor_createIterResult(undefined, true);
};

// this helper is choosing to stop before the underlying is (necessarily) exhausted - eg
// take's remaining count reaching 0 - so IteratorClose the underlying per spec
export const __Porffor_iteratorHelperStop = (helper: any): any => {
  helper.__done = true;
  __Porffor_iteratorClose(helper.__underlying);
  return __Porffor_createIterResult(undefined, true);
};

export const __Porffor_iteratorHelperMapNext = (helper: any): any => {
  const result: any = __Porffor_iteratorStepCached(helper.__underlying, helper.__nextMethod);
  if (__Porffor_iteratorResultDone(result)) return __Porffor_iteratorHelperDone(helper);

  const value: any = __Porffor_iteratorResultValue(result);
  let mapped: any = undefined;
  try {
    mapped = helper.__fn(value, helper.__counter);
  } catch (e) {
    helper.__done = true;
    __Porffor_iteratorClose(helper.__underlying);
    throw e;
  }

  helper.__counter++;
  return __Porffor_createIterResult(mapped, false);
};

export const __Porffor_iteratorHelperFilterNext = (helper: any): any => {
  while (true) {
    const result: any = __Porffor_iteratorStepCached(helper.__underlying, helper.__nextMethod);
    if (__Porffor_iteratorResultDone(result)) return __Porffor_iteratorHelperDone(helper);

    const value: any = __Porffor_iteratorResultValue(result);
    let selected: any = undefined;
    try {
      selected = helper.__fn(value, helper.__counter);
    } catch (e) {
      helper.__done = true;
      __Porffor_iteratorClose(helper.__underlying);
      throw e;
    }

    helper.__counter++;
    if (selected) return __Porffor_createIterResult(value, false);
  }
};

export const __Porffor_iteratorHelperTakeNext = (helper: any): any => {
  if (helper.__counter <= 0) return __Porffor_iteratorHelperStop(helper);

  const result: any = __Porffor_iteratorStepCached(helper.__underlying, helper.__nextMethod);
  if (__Porffor_iteratorResultDone(result)) return __Porffor_iteratorHelperDone(helper);

  helper.__counter--;
  return __Porffor_createIterResult(__Porffor_iteratorResultValue(result), false);
};

export const __Porffor_iteratorHelperDropNext = (helper: any): any => {
  while (helper.__counter > 0) {
    const skip: any = __Porffor_iteratorStepCached(helper.__underlying, helper.__nextMethod);
    if (__Porffor_iteratorResultDone(skip)) return __Porffor_iteratorHelperDone(helper);
    helper.__counter--;
  }

  const result: any = __Porffor_iteratorStepCached(helper.__underlying, helper.__nextMethod);
  if (__Porffor_iteratorResultDone(result)) return __Porffor_iteratorHelperDone(helper);

  return __Porffor_createIterResult(__Porffor_iteratorResultValue(result), false);
};

export const __Porffor_iteratorHelperFlatMapNext = (helper: any): any => {
  while (true) {
    if (helper.__innerIterator != undefined) {
      const innerResult: any = __Porffor_iteratorStepCached(helper.__innerIterator, helper.__innerNextMethod);
      if (!__Porffor_iteratorResultDone(innerResult)) return __Porffor_createIterResult(__Porffor_iteratorResultValue(innerResult), false);

      helper.__innerIterator = undefined;
      helper.__innerNextMethod = undefined;
    }

    const result: any = __Porffor_iteratorStepCached(helper.__underlying, helper.__nextMethod);
    if (__Porffor_iteratorResultDone(result)) return __Porffor_iteratorHelperDone(helper);

    const value: any = __Porffor_iteratorResultValue(result);
    let mapped: any = undefined;
    try {
      mapped = helper.__fn(value, helper.__counter);
    } catch (e) {
      helper.__done = true;
      __Porffor_iteratorClose(helper.__underlying);
      throw e;
    }

    helper.__counter++;

    if (Porffor.type(mapped) == Porffor.TYPES.string || (Porffor.type(mapped) | 0b10000000) == Porffor.TYPES.bytestring) {
      helper.__done = true;
      __Porffor_iteratorClose(helper.__underlying);
      throw new TypeError('flatMap mapper returned a string, which is not flattened');
    }

    if (!Porffor.object.isObject(mapped)) {
      helper.__done = true;
      __Porffor_iteratorClose(helper.__underlying);
      throw new TypeError('flatMap mapper must return an iterable');
    }

    let innerIterator: any = mapped;
    const openMethod: any = mapped[Symbol.iterator];
    if (Porffor.type(openMethod) == Porffor.TYPES.function) {
      try {
        innerIterator = openMethod.call(mapped);
      } catch (e) {
        helper.__done = true;
        __Porffor_iteratorClose(helper.__underlying);
        throw e;
      }
    }

    if (!Porffor.object.isObject(innerIterator)) {
      helper.__done = true;
      __Porffor_iteratorClose(helper.__underlying);
      throw new TypeError('flatMap mapper did not return an iterable');
    }

    helper.__innerIterator = innerIterator;
    helper.__innerNextMethod = innerIterator.next;
  }
};

export const __IteratorHelper_prototype_next = function (this: any): any {
  if (Porffor.type(this) != Porffor.TYPES.object || Porffor.type(this.__kind) == Porffor.TYPES.undefined)
    throw new TypeError('next called on a value that is not an Iterator Helper');

  if (this.__done) return __Porffor_createIterResult(undefined, true);

  const kind: i32 = this.__kind;
  if (kind == __Porffor_IteratorHelper_KIND_MAP) return __Porffor_iteratorHelperMapNext(this);
  if (kind == __Porffor_IteratorHelper_KIND_FILTER) return __Porffor_iteratorHelperFilterNext(this);
  if (kind == __Porffor_IteratorHelper_KIND_TAKE) return __Porffor_iteratorHelperTakeNext(this);
  if (kind == __Porffor_IteratorHelper_KIND_DROP) return __Porffor_iteratorHelperDropNext(this);
  return __Porffor_iteratorHelperFlatMapNext(this);
};

export const __IteratorHelper_prototype_return = function (this: any): any {
  if (Porffor.type(this) != Porffor.TYPES.object || Porffor.type(this.__kind) == Porffor.TYPES.undefined)
    throw new TypeError('return called on a value that is not an Iterator Helper');

  if (!this.__done) {
    this.__done = true;
    __Porffor_iteratorClose(this.__underlying);
    if (this.__innerIterator != undefined) __Porffor_iteratorClose(this.__innerIterator);
  }

  return __Porffor_createIterResult(undefined, true);
};

// ---------------------------------------------------------------------------
// Iterator.prototype.{map,filter,take,drop,flatMap} - lazy, return an Iterator Helper
// ---------------------------------------------------------------------------

export const __Iterator_prototype_map = function (this: any, mapper: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.map called on non-object');
  if (Porffor.type(mapper) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('mapper must be a function');
  }

  return __Porffor_iteratorHelperNew(__Porffor_IteratorHelper_KIND_MAP, this, this.next, mapper, 0);
};

export const __Iterator_prototype_filter = function (this: any, predicate: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.filter called on non-object');
  if (Porffor.type(predicate) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('predicate must be a function');
  }

  return __Porffor_iteratorHelperNew(__Porffor_IteratorHelper_KIND_FILTER, this, this.next, predicate, 0);
};

export const __Iterator_prototype_flatMap = function (this: any, mapper: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.flatMap called on non-object');
  if (Porffor.type(mapper) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('mapper must be a function');
  }

  return __Porffor_iteratorHelperNew(__Porffor_IteratorHelper_KIND_FLATMAP, this, this.next, mapper, 0);
};

export const __Porffor_iteratorValidateLimit = (obj: any, limit: any): i32 => {
  let numberLimit: number = 0;
  try {
    numberLimit = ecma262.ToNumber(limit);
  } catch (e) {
    __Porffor_iteratorClose(obj);
    throw e;
  }

  if (Number.isNaN(numberLimit)) {
    __Porffor_iteratorClose(obj);
    throw new RangeError('Invalid count value: NaN');
  }

  // per spec (take/drop): "If numberLimit is finite and numberLimit > 𝔽(2**53 - 1)" - this
  // is a real spec-mandated check, not fabricated; 2**53 - 1 is Number.MAX_SAFE_INTEGER
  if (Number.isFinite(numberLimit) && numberLimit > Number.MAX_SAFE_INTEGER) {
    __Porffor_iteratorClose(obj);
    throw new RangeError('Invalid count value: too large');
  }

  const intLimitF: number = ecma262.ToIntegerOrInfinity(numberLimit);
  if (intLimitF < 0) {
    __Porffor_iteratorClose(obj);
    throw new RangeError('Invalid count value: negative');
  }

  // implementation detail, not spec: intLimit is stored as this file's i32 __counter field,
  // whereas the spec allows up to 2**53 - 1 (and +Infinity) - clamp to i32 max since no
  // realistic underlying iterator produces anywhere close to 2**31 items before this helper
  // would have long since finished naturally
  if (intLimitF > 2147483647) return 2147483647;

  const intLimit: i32 = intLimitF;
  return intLimit;
};

export const __Iterator_prototype_take = function (this: any, limit: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.take called on non-object');
  const intLimit: i32 = __Porffor_iteratorValidateLimit(this, limit);

  return __Porffor_iteratorHelperNew(__Porffor_IteratorHelper_KIND_TAKE, this, this.next, undefined, intLimit);
};

export const __Iterator_prototype_drop = function (this: any, limit: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.drop called on non-object');
  const intLimit: i32 = __Porffor_iteratorValidateLimit(this, limit);

  return __Porffor_iteratorHelperNew(__Porffor_IteratorHelper_KIND_DROP, this, this.next, undefined, intLimit);
};

// ---------------------------------------------------------------------------
// Iterator.prototype.{reduce,toArray,forEach,some,every,find} - eager, consume immediately
// ---------------------------------------------------------------------------

export const __Iterator_prototype_reduce = function (this: any, reducer: any, initialValue: any = undefined) {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.reduce called on non-object');
  if (Porffor.type(reducer) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('reducer must be a function');
  }

  const nextMethod: any = this.next;
  let accumulator: any = initialValue;
  let counter: number = 0;
  // note: cannot distinguish reduce(fn, undefined) from reduce(fn) here (no arity
  // introspection for builtin methods) - treat both as "no initial value", matching the
  // overwhelmingly common usage of omitting the argument entirely
  if (Porffor.type(initialValue) == Porffor.TYPES.undefined) {
    const first: any = __Porffor_iteratorStepCached(this, nextMethod);
    if (__Porffor_iteratorResultDone(first)) throw new TypeError('Reduce of empty iterator with no initial value');
    accumulator = __Porffor_iteratorResultValue(first);
    counter = 1;
  }

  while (true) {
    const result: any = __Porffor_iteratorStepCached(this, nextMethod);
    if (__Porffor_iteratorResultDone(result)) return accumulator;

    const value: any = __Porffor_iteratorResultValue(result);
    try {
      accumulator = reducer(accumulator, value, counter);
    } catch (e) {
      __Porffor_iteratorClose(this);
      throw e;
    }

    counter++;
  }
};

export const __Iterator_prototype_toArray = function (this: any): any[] {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.toArray called on non-object');

  const nextMethod: any = this.next;
  const out: any[] = Porffor.array.new(4);
  while (true) {
    const result: any = __Porffor_iteratorStepCached(this, nextMethod);
    if (__Porffor_iteratorResultDone(result)) return out;

    Porffor.array.fastPush(out, __Porffor_iteratorResultValue(result));
  }
};

export const __Iterator_prototype_forEach = function (this: any, procedure: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.forEach called on non-object');
  if (Porffor.type(procedure) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('procedure must be a function');
  }

  const nextMethod: any = this.next;
  let counter: number = 0;
  while (true) {
    const result: any = __Porffor_iteratorStepCached(this, nextMethod);
    if (__Porffor_iteratorResultDone(result)) return undefined;

    const value: any = __Porffor_iteratorResultValue(result);
    try {
      procedure(value, counter);
    } catch (e) {
      __Porffor_iteratorClose(this);
      throw e;
    }

    counter++;
  }
};

export const __Iterator_prototype_some = function (this: any, predicate: any): boolean {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.some called on non-object');
  if (Porffor.type(predicate) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('predicate must be a function');
  }

  const nextMethod: any = this.next;
  let counter: number = 0;
  while (true) {
    const result: any = __Porffor_iteratorStepCached(this, nextMethod);
    if (__Porffor_iteratorResultDone(result)) return false;

    const value: any = __Porffor_iteratorResultValue(result);
    let matched: any = undefined;
    try {
      matched = predicate(value, counter);
    } catch (e) {
      __Porffor_iteratorClose(this);
      throw e;
    }

    if (matched) {
      __Porffor_iteratorClose(this);
      return true;
    }

    counter++;
  }
};

export const __Iterator_prototype_every = function (this: any, predicate: any): boolean {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.every called on non-object');
  if (Porffor.type(predicate) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('predicate must be a function');
  }

  const nextMethod: any = this.next;
  let counter: number = 0;
  while (true) {
    const result: any = __Porffor_iteratorStepCached(this, nextMethod);
    if (__Porffor_iteratorResultDone(result)) return true;

    const value: any = __Porffor_iteratorResultValue(result);
    let matched: any = undefined;
    try {
      matched = predicate(value, counter);
    } catch (e) {
      __Porffor_iteratorClose(this);
      throw e;
    }

    if (!matched) {
      __Porffor_iteratorClose(this);
      return false;
    }

    counter++;
  }
};

export const __Iterator_prototype_find = function (this: any, predicate: any): any {
  if (!Porffor.object.isObject(this)) throw new TypeError('Iterator.prototype.find called on non-object');
  if (Porffor.type(predicate) != Porffor.TYPES.function) {
    __Porffor_iteratorClose(this);
    throw new TypeError('predicate must be a function');
  }

  const nextMethod: any = this.next;
  let counter: number = 0;
  while (true) {
    const result: any = __Porffor_iteratorStepCached(this, nextMethod);
    if (__Porffor_iteratorResultDone(result)) return undefined;

    const value: any = __Porffor_iteratorResultValue(result);
    let matched: any = undefined;
    try {
      matched = predicate(value, counter);
    } catch (e) {
      __Porffor_iteratorClose(this);
      throw e;
    }

    if (matched) {
      __Porffor_iteratorClose(this);
      return value;
    }

    counter++;
  }
};

// ---------------------------------------------------------------------------
// Generator instance aliases - real engines put %GeneratorPrototype% under
// %IteratorPrototype%, so `function* () {}().map(...)` etc work directly. Porffor's
// generic (chain-walking) member lookup can't reach Iterator.prototype through a
// generator's hidden prototype (a pre-existing coroutine/object-system gap - see the
// note on __Porffor_iteratorStepCached), but the compiler's *builtin-prototype-method*
// fast path dispatches calls straight off the runtime type without going through generic
// lookup at all, as long as a `_prototype_X` candidate exists for TYPES.__porffor_generator
// - these thin re-exports exist purely to give that fast path a target
// ---------------------------------------------------------------------------

export const __Porffor_Generator_prototype_map = function (this: any, mapper: any): any {
  return Porffor.callThis(__Iterator_prototype_map, this, mapper);
};

export const __Porffor_Generator_prototype_filter = function (this: any, predicate: any): any {
  return Porffor.callThis(__Iterator_prototype_filter, this, predicate);
};

export const __Porffor_Generator_prototype_take = function (this: any, limit: any): any {
  return Porffor.callThis(__Iterator_prototype_take, this, limit);
};

export const __Porffor_Generator_prototype_drop = function (this: any, limit: any): any {
  return Porffor.callThis(__Iterator_prototype_drop, this, limit);
};

export const __Porffor_Generator_prototype_flatMap = function (this: any, mapper: any): any {
  return Porffor.callThis(__Iterator_prototype_flatMap, this, mapper);
};

export const __Porffor_Generator_prototype_reduce = function (this: any, reducer: any, initialValue: any = undefined): any {
  return Porffor.callThis(__Iterator_prototype_reduce, this, reducer, initialValue);
};

export const __Porffor_Generator_prototype_toArray = function (this: any): any[] {
  return Porffor.callThis(__Iterator_prototype_toArray, this);
};

export const __Porffor_Generator_prototype_forEach = function (this: any, procedure: any): any {
  return Porffor.callThis(__Iterator_prototype_forEach, this, procedure);
};

export const __Porffor_Generator_prototype_some = function (this: any, predicate: any): boolean {
  return Porffor.callThis(__Iterator_prototype_some, this, predicate);
};

export const __Porffor_Generator_prototype_every = function (this: any, predicate: any): boolean {
  return Porffor.callThis(__Iterator_prototype_every, this, predicate);
};

export const __Porffor_Generator_prototype_find = function (this: any, predicate: any): any {
  return Porffor.callThis(__Iterator_prototype_find, this, predicate);
};
