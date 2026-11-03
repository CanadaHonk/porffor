// undici over porffor's own fetch since its http parser is wasm, dispatchers only keep their options
import { EventEmitter } from '../events.js';
import { fetch } from './fetch-client.js';
import { Headers, Request, Response, FormData } from './fetch.js';

export class Dispatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.closed = false;
    this.destroyed = false;
  }

  close() {
    this.closed = true;
    return Promise.resolve();
  }

  destroy() {
    this.destroyed = true;
    return Promise.resolve();
  }
}

export class Client extends Dispatcher {
  constructor(origin, options) {
    super(options);
    this.origin = origin;
  }
}

export class Pool extends Client {}
export class Agent extends Dispatcher {}
export class ProxyAgent extends Dispatcher {}
export class EnvHttpProxyAgent extends Dispatcher {}

let globalDispatcher = new Agent();
export const setGlobalDispatcher = dispatcher => { globalDispatcher = dispatcher; };
export const getGlobalDispatcher = () => globalDispatcher;

// fetch and its classes already are the globals
export const install = () => {};

export { fetch, Headers, Request, Response, FormData };

export default {
  Dispatcher, Client, Pool, Agent, ProxyAgent, EnvHttpProxyAgent, setGlobalDispatcher, getGlobalDispatcher, install,
  fetch, Headers, Request, Response, FormData
};
