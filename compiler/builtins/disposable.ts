// @porf --closures
import type {} from './porffor.d.ts';

// resource lists are flat [ value, method, hint ] triples (hint: 0 sync-dispose, 1 async-dispose)

export const __Porffor_using_method = (value: any, hint: i32): any => {
  if (hint == 1) {
    const asyncMethod: any = value[Symbol.asyncDispose];
    if (asyncMethod != null) {
      if (Porffor.type(asyncMethod) != Porffor.TYPES.function) throw new TypeError('Symbol.asyncDispose is not a function');
      return asyncMethod;
    }

    const syncMethod: any = value[Symbol.dispose];
    if (syncMethod == null) throw new TypeError('Value has no Symbol.asyncDispose or Symbol.dispose method');
    if (Porffor.type(syncMethod) != Porffor.TYPES.function) throw new TypeError('Symbol.dispose is not a function');

    return function (this: any): Promise {
      try {
        syncMethod.call(this);
      } catch (e) {
        return Promise.reject(e);
      }
      return Promise.resolve(undefined);
    };
  }

  const method: any = value[Symbol.dispose];
  if (method == null) throw new TypeError('Value has no Symbol.dispose method');
  if (Porffor.type(method) != Porffor.TYPES.function) throw new TypeError('Symbol.dispose is not a function');
  return method;
};

export const __Porffor_using_push = (resources: any[], value: any, method: any, hint: i32): void => {
  const len: i32 = resources.length;
  resources[len] = value;
  resources[len + 1] = method;
  resources[len + 2] = hint;
};

export const __Porffor_using_add = (resources: any[], value: any, hint: i32): any => {
  if (value == null) {
    // await using of null/undefined still awaits on disposal
    if (hint == 1) __Porffor_using_push(resources, undefined, undefined, 1);
    return value;
  }

  if (!Porffor.object.isObject(value)) throw new TypeError('Disposable resource is not an object');
  __Porffor_using_push(resources, value, __Porffor_using_method(value, hint), hint);
  return value;
};

export const __Porffor_using_suppress = (error: any, hasError: boolean, newError: any): any => {
  if (!hasError) return newError;
  return new SuppressedError(newError, error, '');
};

export const __Porffor_using_dispose = (resources: any[], hasError: boolean, error: any): void => {
  for (let i: i32 = resources.length - 3; i >= 0; i -= 3) {
    const method: any = resources[i + 1];
    if (method === undefined) continue;

    try {
      method.call(resources[i]);
    } catch (e) {
      error = __Porffor_using_suppress(error, hasError, e);
      hasError = true;
    }
  }

  resources.length = 0;
  if (hasError) throw error;
};

export const __Porffor_using_disposeAsync = async (resources: any[], hasError: boolean, error: any): Promise => {
  let needsAwait: boolean = false;
  let hasAwaited: boolean = false;
  for (let i: i32 = resources.length - 3; i >= 0; i -= 3) {
    const method: any = resources[i + 1];
    const hint: i32 = resources[i + 2];
    if (method === undefined) {
      if (hint == 1) needsAwait = true;
      continue;
    }

    if (Porffor.fastAnd(needsAwait, !hasAwaited)) {
      await undefined;
      hasAwaited = true;
    }
    needsAwait = false;

    try {
      const result: any = method.call(resources[i]);
      if (hint == 1) {
        await result;
        hasAwaited = true;
      }
    } catch (e) {
      error = __Porffor_using_suppress(error, hasError, e);
      hasError = true;
    }
  }

  if (Porffor.fastAnd(needsAwait, !hasAwaited)) await undefined;

  resources.length = 0;
  if (hasError) throw error;
};

// [ resources @0, state u8 @8 (0 pending, 1 disposed) ]
export const __Porffor_disposable_new = (): DisposableStack => {
  const obj: DisposableStack = Porffor.malloc(16);
  Porffor.IR.storeJv(obj, 0, Porffor.array.new(0));
  Porffor.IR.storeU8(obj, 8, 0);
  return obj;
};

export const __Porffor_disposable_newAsync = (): AsyncDisposableStack => {
  const obj: AsyncDisposableStack = Porffor.malloc(16);
  Porffor.IR.storeJv(obj, 0, Porffor.array.new(0));
  Porffor.IR.storeU8(obj, 8, 0);
  return obj;
};

export const __Porffor_disposable_resources = (stack: any): any[] => Porffor.IR.loadJv(stack, 0);
export const __Porffor_disposable_disposed = (stack: any): boolean => Porffor.IR.loadU8(stack, 8) == 1;

export const __Porffor_disposable_this = (stack: any, type: i32): void => {
  if (Porffor.type(stack) != type) throw new TypeError(type == Porffor.TYPES.disposablestack ? 'this is not a DisposableStack' : 'this is not an AsyncDisposableStack');
};

export const __Porffor_disposable_usable = (stack: any, type: i32): void => {
  __Porffor_disposable_this(stack, type);
  if (__Porffor_disposable_disposed(stack)) throw new ReferenceError(type == Porffor.TYPES.disposablestack ? 'DisposableStack already disposed' : 'AsyncDisposableStack already disposed');
};

export const __Porffor_disposable_defer = (stack: any, type: i32, onDispose: any, method: any): void => {
  __Porffor_disposable_usable(stack, type);
  const sync: boolean = type == Porffor.TYPES.disposablestack;
  if (Porffor.type(onDispose) != Porffor.TYPES.function) throw new TypeError(sync ? 'onDispose is not a function' : 'onDisposeAsync is not a function');

  __Porffor_using_push(__Porffor_disposable_resources(stack), undefined, method, sync ? 0 : 1);
};

export const __Porffor_disposable_move = (stack: any, out: any): any => {
  Porffor.IR.storeJv(out, 0, __Porffor_disposable_resources(stack));
  Porffor.IR.storeJv(stack, 0, Porffor.array.new(0));
  Porffor.IR.storeU8(stack, 8, 1);
  return out;
};

export const DisposableStack = function (): DisposableStack {
  if (!new.target) throw new TypeError("Constructor DisposableStack requires 'new'");
  return __Porffor_disposable_new();
};

export const __DisposableStack_prototype_disposed$get = function (this: any): boolean {
  __Porffor_disposable_this(this, Porffor.TYPES.disposablestack);
  return __Porffor_disposable_disposed(this);
};

export const __DisposableStack_prototype_dispose = function (this: any): void {
  __Porffor_disposable_this(this, Porffor.TYPES.disposablestack);
  if (__Porffor_disposable_disposed(this)) return;
  Porffor.IR.storeU8(this, 8, 1);
  __Porffor_using_dispose(__Porffor_disposable_resources(this), false, undefined);
};

export const __DisposableStack_prototype_Symbol_dispose = function (this: any): void {
  return Porffor.callThis(__DisposableStack_prototype_dispose, this);
};

export const __DisposableStack_prototype_use = function (this: any, value: any): any {
  __Porffor_disposable_usable(this, Porffor.TYPES.disposablestack);
  return __Porffor_using_add(__Porffor_disposable_resources(this), value, 0);
};

export const __DisposableStack_prototype_adopt = function (this: any, value: any, onDispose: any): any {
  __Porffor_disposable_defer(this, Porffor.TYPES.disposablestack, onDispose, (): any => onDispose(value));
  return value;
};

export const __DisposableStack_prototype_defer = function (this: any, onDispose: any): void {
  __Porffor_disposable_defer(this, Porffor.TYPES.disposablestack, onDispose, onDispose);
};

export const __DisposableStack_prototype_move = function (this: any): DisposableStack {
  __Porffor_disposable_usable(this, Porffor.TYPES.disposablestack);
  return __Porffor_disposable_move(this, __Porffor_disposable_new());
};

export const AsyncDisposableStack = function (): AsyncDisposableStack {
  if (!new.target) throw new TypeError("Constructor AsyncDisposableStack requires 'new'");
  return __Porffor_disposable_newAsync();
};

export const __AsyncDisposableStack_prototype_disposed$get = function (this: any): boolean {
  __Porffor_disposable_this(this, Porffor.TYPES.asyncdisposablestack);
  return __Porffor_disposable_disposed(this);
};

export const __AsyncDisposableStack_prototype_disposeAsync = function (this: any): Promise {
  if (Porffor.type(this) != Porffor.TYPES.asyncdisposablestack) return Promise.reject(new TypeError('this is not an AsyncDisposableStack'));
  if (__Porffor_disposable_disposed(this)) return Promise.resolve(undefined);

  Porffor.IR.storeU8(this, 8, 1);
  return __Porffor_using_disposeAsync(__Porffor_disposable_resources(this), false, undefined);
};

export const __AsyncDisposableStack_prototype_Symbol_asyncDispose = function (this: any): Promise {
  return Porffor.callThis(__AsyncDisposableStack_prototype_disposeAsync, this);
};

export const __AsyncDisposableStack_prototype_use = function (this: any, value: any): any {
  __Porffor_disposable_usable(this, Porffor.TYPES.asyncdisposablestack);
  return __Porffor_using_add(__Porffor_disposable_resources(this), value, 1);
};

export const __AsyncDisposableStack_prototype_adopt = function (this: any, value: any, onDisposeAsync: any): any {
  __Porffor_disposable_defer(this, Porffor.TYPES.asyncdisposablestack, onDisposeAsync, (): any => onDisposeAsync(value));
  return value;
};

export const __AsyncDisposableStack_prototype_defer = function (this: any, onDisposeAsync: any): void {
  __Porffor_disposable_defer(this, Porffor.TYPES.asyncdisposablestack, onDisposeAsync, onDisposeAsync);
};

export const __AsyncDisposableStack_prototype_move = function (this: any): AsyncDisposableStack {
  __Porffor_disposable_usable(this, Porffor.TYPES.asyncdisposablestack);
  return __Porffor_disposable_move(this, __Porffor_disposable_newAsync());
};
