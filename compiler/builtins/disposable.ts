// @porf --closures
import type {} from './porffor.d.ts';

// resource lists are flat [ value, method, hint ] triples (hint: 0 sync-dispose, 1 async-dispose)

// GetDisposeMethod(V, hint)
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

    // a sync dispose method as an async one
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

// AddDisposableResource(disposeCapability, V, hint)
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

// DisposeResources(disposeCapability, completion), rethrowing the final throw completion if any
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
      // null or undefined resource of an await using
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

export const __Porffor_disposable_resources = (stack: any): any[] => Porffor.IR.loadJv(stack, 0);
export const __Porffor_disposable_disposed = (stack: any): boolean => Porffor.IR.loadU8(stack, 8) == 1;

export const DisposableStack = function (): DisposableStack {
  if (!new.target) throw new TypeError("Constructor DisposableStack requires 'new'");
  return __Porffor_disposable_new();
};

export const __Porffor_disposable_this = (stack: any): void => {
  if (Porffor.type(stack) != Porffor.TYPES.disposablestack) throw new TypeError('this is not a DisposableStack');
};

export const __Porffor_disposable_usable = (stack: any): void => {
  __Porffor_disposable_this(stack);
  if (__Porffor_disposable_disposed(stack)) throw new ReferenceError('DisposableStack already disposed');
};

export const __DisposableStack_prototype_disposed$get = function (this: any): boolean {
  __Porffor_disposable_this(this);
  return __Porffor_disposable_disposed(this);
};

export const __DisposableStack_prototype_dispose = function (this: any): void {
  __Porffor_disposable_this(this);
  if (__Porffor_disposable_disposed(this)) return;
  Porffor.IR.storeU8(this, 8, 1);
  __Porffor_using_dispose(__Porffor_disposable_resources(this), false, undefined);
};

export const __DisposableStack_prototype_Symbol_dispose = function (this: any): void {
  return Porffor.callThis(__DisposableStack_prototype_dispose, this);
};

export const __DisposableStack_prototype_use = function (this: any, value: any): any {
  __Porffor_disposable_usable(this);
  return __Porffor_using_add(__Porffor_disposable_resources(this), value, 0);
};

export const __DisposableStack_prototype_adopt = function (this: any, value: any, onDispose: any): any {
  __Porffor_disposable_usable(this);
  if (Porffor.type(onDispose) != Porffor.TYPES.function) throw new TypeError('onDispose is not a function');

  __Porffor_using_push(__Porffor_disposable_resources(this), undefined, (): void => {
    onDispose(value);
  }, 0);
  return value;
};

export const __DisposableStack_prototype_defer = function (this: any, onDispose: any): void {
  __Porffor_disposable_usable(this);
  if (Porffor.type(onDispose) != Porffor.TYPES.function) throw new TypeError('onDispose is not a function');

  __Porffor_using_push(__Porffor_disposable_resources(this), undefined, onDispose, 0);
};

export const __DisposableStack_prototype_move = function (this: any): DisposableStack {
  __Porffor_disposable_usable(this);

  const out: DisposableStack = __Porffor_disposable_new();
  Porffor.IR.storeJv(out, 0, __Porffor_disposable_resources(this));
  Porffor.IR.storeJv(this, 0, Porffor.array.new(0));
  Porffor.IR.storeU8(this, 8, 1);
  return out;
};


export const __Porffor_disposable_newAsync = (): AsyncDisposableStack => {
  const obj: AsyncDisposableStack = Porffor.malloc(16);
  Porffor.IR.storeJv(obj, 0, Porffor.array.new(0));
  Porffor.IR.storeU8(obj, 8, 0);
  return obj;
};

export const AsyncDisposableStack = function (): AsyncDisposableStack {
  if (!new.target) throw new TypeError("Constructor AsyncDisposableStack requires 'new'");
  return __Porffor_disposable_newAsync();
};

export const __Porffor_disposable_thisAsync = (stack: any): void => {
  if (Porffor.type(stack) != Porffor.TYPES.asyncdisposablestack) throw new TypeError('this is not an AsyncDisposableStack');
};

export const __Porffor_disposable_usableAsync = (stack: any): void => {
  __Porffor_disposable_thisAsync(stack);
  if (__Porffor_disposable_disposed(stack)) throw new ReferenceError('AsyncDisposableStack already disposed');
};

export const __AsyncDisposableStack_prototype_disposed$get = function (this: any): boolean {
  __Porffor_disposable_thisAsync(this);
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
  __Porffor_disposable_usableAsync(this);
  return __Porffor_using_add(__Porffor_disposable_resources(this), value, 1);
};

export const __AsyncDisposableStack_prototype_adopt = function (this: any, value: any, onDisposeAsync: any): any {
  __Porffor_disposable_usableAsync(this);
  if (Porffor.type(onDisposeAsync) != Porffor.TYPES.function) throw new TypeError('onDisposeAsync is not a function');

  __Porffor_using_push(__Porffor_disposable_resources(this), undefined, (): any => onDisposeAsync(value), 1);
  return value;
};

export const __AsyncDisposableStack_prototype_defer = function (this: any, onDisposeAsync: any): void {
  __Porffor_disposable_usableAsync(this);
  if (Porffor.type(onDisposeAsync) != Porffor.TYPES.function) throw new TypeError('onDisposeAsync is not a function');

  __Porffor_using_push(__Porffor_disposable_resources(this), undefined, onDisposeAsync, 1);
};

export const __AsyncDisposableStack_prototype_move = function (this: any): AsyncDisposableStack {
  __Porffor_disposable_usableAsync(this);

  const out: AsyncDisposableStack = __Porffor_disposable_newAsync();
  Porffor.IR.storeJv(out, 0, __Porffor_disposable_resources(this));
  Porffor.IR.storeJv(this, 0, Porffor.array.new(0));
  Porffor.IR.storeU8(this, 8, 1);
  return out;
};
