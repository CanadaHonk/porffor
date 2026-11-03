import process from './process.js';
import assert from './assert.js';
import { inspect } from './util.js';
import { setTimeout, clearTimeout } from './timers.js';
import { AbortController } from './internal/event_target.js';

const counts = { tests: 0, suites: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
const failures = [];
const start = performance.now();

const write = line => process.stdout.write(line + '\n');

class MockFunctionContext {
  constructor(implementation, original, onceImplementations) {
    this.calls = [];
    this._implementation = implementation;
    this._original = original;
    this._once = onceImplementations;
    this._restore = null;
  }

  callCount() {
    return this.calls.length;
  }

  mockImplementation(implementation) {
    this._implementation = implementation;
  }

  mockImplementationOnce(implementation, onCall = this.calls.length) {
    this._once.set(onCall, implementation);
  }

  resetCalls() {
    this.calls = [];
  }

  restore() {
    this._restore?.();
  }
}

export class MockTracker {
  constructor() {
    this._mocks = [];
  }

  fn(original = function () {}, implementation = original, options = {}) {
    if (implementation !== null && typeof implementation === 'object') {
      options = implementation;
      implementation = original;
    }
    const context = new MockFunctionContext(implementation, original, new Map());
    const times = options.times ?? Infinity;
    const mocked = function (...args) {
      const call = context.calls.length;
      const once = context._once.get(call);
      context._once.delete(call);
      const impl = once ?? (call < times ? context._implementation : context._original);
      const record = { arguments: args, result: undefined, error: undefined, this: this, target: new.target };
      context.calls.push(record);
      try {
        record.result = new.target ? Reflect.construct(impl, args, new.target) : impl.apply(this, args);
        return record.result;
      } catch (err) {
        record.error = err;
        throw err;
      }
    };
    Object.defineProperty(mocked, 'name', { value: original.name });
    Object.defineProperty(mocked, 'length', { value: original.length });
    mocked.mock = context;
    this._mocks.push(context);
    return mocked;
  }

  method(object, name, implementation, options = {}) {
    if (implementation !== null && typeof implementation === 'object') {
      options = implementation;
      implementation = undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, name) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(object), name);
    const accessor = options.getter ? 'get' : options.setter ? 'set' : null;
    const original = accessor ? descriptor[accessor] : object[name];
    if (typeof original !== 'function') throw new TypeError(`The argument 'methodName' must be a method. Received ${String(name)}`);

    const mocked = this.fn(original, implementation ?? original, options);
    const hadOwn = Object.hasOwn(object, name);
    const ownDescriptor = Object.getOwnPropertyDescriptor(object, name);
    Object.defineProperty(object, name, accessor ? { ...descriptor, [accessor]: mocked, configurable: true } : { value: mocked, writable: true, enumerable: descriptor?.enumerable ?? true, configurable: true });
    mocked.mock._restore = () => {
      if (hadOwn) Object.defineProperty(object, name, ownDescriptor);
        else delete object[name];
    };
    return mocked;
  }

  getter(object, name, implementation, options = {}) {
    return this.method(object, name, implementation, { ...options, getter: true });
  }

  setter(object, name, implementation, options = {}) {
    return this.method(object, name, implementation, { ...options, setter: true });
  }

  reset() {
    this.restoreAll();
    this._mocks = [];
  }

  restoreAll() {
    for (const context of this._mocks) context.restore();
  }
}

export const mock = new MockTracker();

class SuiteContext {
  constructor(test) {
    this._test = test;
  }

  get name() {
    return this._test.name;
  }

  get signal() {
    return (this._test.controller ??= new AbortController()).signal;
  }
}

class TestContext extends SuiteContext {
  constructor(test) {
    super(test);
    this.mock = new MockTracker();
    // counted for plan()
    this.assert = {};
    for (const name of Object.keys(assert)) {
      const fn = assert[name];
      this.assert[name] = (...args) => {
        test.assertions++;
        return fn(...args);
      };
    }
  }

  get fullName() {
    const names = [];
    for (let test = this._test; test.parent; test = test.parent) names.unshift(test.name);
    return names.join(' > ');
  }

  diagnostic(message) {
    this._test.diagnostics.push(message);
  }

  skip(message) {
    this._test.result = 'skip';
    this._test.message = message;
  }

  todo(message) {
    this._test.todo = true;
    this._test.message = message;
  }

  plan(count) {
    this._test.plan = count;
  }

  test(name, options, fn) {
    return this._test.subtest(name, options, fn, false);
  }

  before(fn) {
    this._test.hooks.before.push(fn);
  }

  after(fn) {
    this._test.hooks.after.push(fn);
  }

  beforeEach(fn) {
    this._test.hooks.beforeEach.push(fn);
  }

  afterEach(fn) {
    this._test.hooks.afterEach.push(fn);
  }

  runOnly() {}
}

const normalize = (name, options, fn) => {
  if (typeof name === 'function') {
    fn = name;
    name = fn.name || '<anonymous>';
    options = {};
  } else if (typeof options === 'function') {
    fn = options;
    options = {};
  } else if (name !== null && typeof name === 'object') {
    fn = options;
    options = name;
    name = fn?.name || '<anonymous>';
  }
  return [ String(name ?? fn?.name ?? '<anonymous>'), options ?? {}, fn ?? (() => {}) ];
};

class Test {
  constructor(name, options, fn, parent, suite) {
    this.name = name;
    this.options = options;
    this.fn = fn;
    this.parent = parent;
    this.suite = suite;
    this.depth = parent ? parent.depth + 1 : -1;
    this.children = [];
    this.pending = [];
    this.hooks = { before: [], after: [], beforeEach: [], afterEach: [] };
    this.diagnostics = [];
    this.result = null;
    this.todo = !!options.todo;
    this.message = typeof options.todo === 'string' ? options.todo : typeof options.skip === 'string' ? options.skip : undefined;
    this.error = null;
    this.duration = 0;
    this.plan = options.plan ?? null;
    this.assertions = 0;
    this.controller = null;
    this.completion = new Promise(resolve => {
      this.complete = resolve;
    });
  }

  subtest(name, options, fn, suite) {
    [ name, options, fn ] = normalize(name, options, fn);
    const test = new Test(name, options, fn, this, suite);
    this.children.push(test);
    if (suite) test.collect();
    // tests in a suite wait their turn, a test's subtests start right away
    if (this.suite) {
      this.pending.push(test);
      if (this === root) scheduleRoot();
    } else test.run();
    return test.completion;
  }

  // a describe() body runs right away to register its tests
  collect() {
    const outer = current;
    current = this;
    try {
      const result = this.fn.call(new SuiteContext(this), new SuiteContext(this));
      if (result && typeof result.then === 'function') this.collecting = result;
    } catch (err) {
      this.error = err;
    } finally {
      current = outer;
    }
  }

  async runHooks(kind, test) {
    const context = new TestContext(test ?? this);
    if (kind === 'beforeEach' || kind === 'afterEach') {
      const chain = [];
      for (let t = this; t; t = t.parent) chain.unshift(t);
      if (kind === 'afterEach') chain.reverse();
      for (const t of chain) for (const hook of t.hooks[kind]) await hook.call(context, context);
    } else for (const hook of this.hooks[kind]) await hook.call(context, context);
  }

  async run() {
    const started = performance.now();
    const skip = this.options.skip || (onlyMode && !this.options.only && !this.hasOnly());
    if (skip) this.result = 'skip';
    else {
      try {
        if (this.suite) {
          if (this.collecting) await this.collecting;
          if (this.error) throw this.error;
          await this.runHooks('before');
          for (const test of this.pending) await test.run();
          await this.runHooks('after');
        } else {
          await this.parent.runHooks('beforeEach', this);
          const context = new TestContext(this);
          try {
            await this.withTimeout(this.call(context));
            // subtests left running are waited for
            await Promise.all(this.children.map(child => child.completion));
          } finally {
            await this.runHooks('after');
            context.mock.restoreAll();
            await this.parent.runHooks('afterEach', this);
          }
          const planned = this.children.length + this.assertions;
          if (this.plan !== null && this.plan !== planned) throw `plan expected ${this.plan} assertions but received ${planned}`;
        }
        const failed = this.children.filter(x => x.result === 'fail' && !x.todo).length;
        if (this.result === null) this.result = failed > 0 ? 'fail' : 'pass';
        if (failed > 0) {
          this.subtestsFailed = true;
          this.error = new Error(`${failed} subtest${failed === 1 ? '' : 's'} failed`);
        }
      } catch (err) {
        if (this.result !== 'cancelled') this.result = 'fail';
        this.error = err;
      }
    }
    this.duration = Math.round((performance.now() - started) * 1000) / 1000;
    report(this);
    this.complete();
  }

  call(context) {
    const fn = this.fn;
    if (fn.length >= 2) {
      return new Promise((resolve, reject) => {
        let called = false;
        const result = fn.call(context, context, err => {
          if (called) return;
          called = true;
          if (err) reject(err);
            else resolve();
        });
        if (result && typeof result.then === 'function') reject(new Error('passed a callback but also returned a Promise'));
      });
    }
    return fn.call(context, context);
  }

  withTimeout(result) {
    const timeout = this.options.timeout;
    if (!(timeout > 0 && timeout !== Infinity) || !result || typeof result.then !== 'function') return result;
    let timer;
    return Promise.race([
      result,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          this.result = 'cancelled';
          reject(`test timed out after ${timeout}ms`);
        }, timeout);
      })
    ]).finally(() => clearTimeout(timer));
  }

  hasOnly() {
    return this.options.only || this.children.some(x => x.hasOnly());
  }
}

// counted when each test completes, printed a whole top-level tree at a time
const report = test => {
  if (test.suite) counts.suites++;
  else {
    counts.tests++;
    if (test.result === 'skip') counts.skipped++;
      else if (test.todo) counts.todo++;
      else if (test.result === 'cancelled') counts.cancelled++;
      else if (test.result === 'fail') counts.fail++;
      else counts.pass++;
  }
  if ((test.result === 'fail' || test.result === 'cancelled') && !test.todo && !test.subtestsFailed) failures.push(test);
  if (test.parent === root) render(test);
};

const statusLine = test => {
  const mark = test.result === 'skip' ? '﹣' : test.result === 'fail' || test.result === 'cancelled' ? '✖' : '✔';
  const directive = test.result === 'skip' ? ` # ${test.message ?? 'SKIP'}` : test.todo ? ` # ${test.message ?? 'TODO'}` : '';
  return `${mark} ${test.name} (${test.duration}ms)${directive}`;
};

const render = test => {
  const pad = '  '.repeat(test.depth);
  const reported = test.children.filter(x => x.result !== null);
  if (reported.length > 0) {
    write(`${pad}▶ ${test.name}`);
    for (const child of reported) render(child);
  }
  write(pad + statusLine(test));
  for (const message of test.diagnostics) write(`${pad}ℹ ${message}`);
};

const root = new Test('<root>', {}, null, null, true);
let current = root;
let onlyMode = false;
let rootRunning = false;

// top-level before hooks run ahead of the first test, after hooks once the tests queued so far are done
const scheduleRoot = () => {
  if (rootRunning) return;
  rootRunning = true;
  Promise.resolve().then(async () => {
    await root.runHooks('before');
    root.hooks.before.length = 0;
    while (root.pending.length > 0) await root.pending.shift().run();
    await root.runHooks('after');
    root.hooks.after.length = 0;
    rootRunning = false;
  });
};

const summary = () => {
  if (summary.printed || counts.tests + counts.suites === 0) return;
  summary.printed = true;
  for (const key of Object.keys(counts)) write(`ℹ ${key} ${counts[key]}`);
  write(`ℹ duration_ms ${Math.round((performance.now() - start) * 1000) / 1000}`);

  if (failures.length > 0) {
    write('');
    write('✖ failing tests:');
    for (const test of failures) {
      write('');
      write(statusLine(test));
      for (const line of inspect(test.error).split('\n')) write(`  ${line}`);
    }
    process.exitCode = 1;
  }
};

process.on('beforeExit', summary);

const define = suite => {
  const fn = (name, options, body) => current.subtest(name, options, body, suite);
  const flagged = flag => (name, options, body) => {
    [ name, options, body ] = normalize(name, options, body);
    if (flag === 'only') onlyMode = true;
    return fn(name, { ...options, [flag]: true }, body);
  };
  fn.skip = flagged('skip');
  fn.todo = flagged('todo');
  fn.only = flagged('only');
  return fn;
};

export const test = define(false);
export const it = test;
export const describe = define(true);
export const suite = describe;

export const before = fn => current.hooks.before.push(fn);
export const after = fn => current.hooks.after.push(fn);
export const beforeEach = fn => current.hooks.beforeEach.push(fn);
export const afterEach = fn => current.hooks.afterEach.push(fn);

test.test = test;
test.it = it;
test.describe = describe;
test.suite = suite;
test.before = before;
test.after = after;
test.beforeEach = beforeEach;
test.afterEach = afterEach;
test.mock = mock;
test.MockTracker = MockTracker;

export default test;
