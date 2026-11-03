import { setImmediate } from './timers.js';

const perf = performance;
const timeOrigin = Date.now() - perf.now();

// marks go to the observers of their entry type, in a batch once the current work is done
const observers = new Set();

class PerformanceObserverEntryList {
  constructor(entries) {
    this._entries = entries;
  }

  getEntries() {
    return this._entries.slice();
  }

  getEntriesByType(type) {
    return this._entries.filter(entry => entry.entryType === type);
  }

  getEntriesByName(name, type) {
    return this._entries.filter(entry => entry.name === name && (type === undefined || entry.entryType === type));
  }
}

export class PerformanceObserver {
  constructor(callback) {
    this._callback = callback;
    this._types = [];
    this._buffer = [];
  }

  static get supportedEntryTypes() {
    return [ 'mark' ];
  }

  observe({ entryTypes, type }) {
    this._types = entryTypes ?? [ type ];
    observers.add(this);
  }

  disconnect() {
    observers.delete(this);
    this._buffer = [];
  }

  takeRecords() {
    const list = this._buffer;
    this._buffer = [];
    return list;
  }
}

let dispatchQueued = false;
const enqueue = entry => {
  let observed = false;
  for (const observer of observers) {
    if (!observer._types.includes(entry.entryType)) continue;
    observer._buffer.push(entry);
    observed = true;
  }
  if (!observed || dispatchQueued) return;
  dispatchQueued = true;
  setImmediate(() => {
    dispatchQueued = false;
    for (const observer of [ ...observers ]) if (observer._buffer.length > 0) observer._callback.call(observer, new PerformanceObserverEntryList(observer.takeRecords()), observer);
  });
};

// node's performance is the global one, extended
export { perf as performance };
Object.assign(perf, {
  timeOrigin,
  mark: (name, options) => {
    const entry = { name: `${name}`, entryType: 'mark', startTime: options?.startTime ?? perf.now(), duration: 0, detail: options?.detail ?? null };
    enqueue(entry);
    return entry;
  }
});

export default { performance: perf, PerformanceObserver };
