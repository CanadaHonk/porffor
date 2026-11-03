import { EventEmitter } from './events.js';
import * as http from './http.js';
import * as tls from './tls.js';
import { URL } from './url.js';
import * as uwsSsl from './internal/uws-ssl.js';

export function Agent(options) {
  if (!(this instanceof Agent)) return new Agent(options);
  http.Agent.call(this, options);
  this.defaultPort = 443;
  this.protocol = 'https:';
}
Object.setPrototypeOf(Agent.prototype, http.Agent.prototype);
Object.setPrototypeOf(Agent, http.Agent);

// (options), (port[, host][, options]) or (port, options)
Agent.prototype.createConnection = function (port, host, options) {
  if (port !== null && typeof port === 'object') options = port;
    else if (host !== null && typeof host === 'object') options = { ...host };
    else options = { ...options };
  if (typeof port === 'number') options.port = port;
  if (typeof host === 'string') options.host = host;
  return tls.connect(options);
};

// sockets are only shared between requests with the same tls settings
const nameKeys = [
  'ca', 'cert', 'clientCertEngine', 'ciphers', 'key', 'pfx', 'rejectUnauthorized', 'servername', 'minVersion', 'maxVersion', 'secureProtocol', 'crl',
  'honorCipherOrder', 'ecdhCurve', 'dhparam', 'secureOptions', 'sessionIdContext', 'sigalgs', 'privateKeyIdentifier', 'privateKeyEngine'
];

Agent.prototype.getName = function (options = {}) {
  let name = http.Agent.prototype.getName.call(this, options);
  for (const key of nameKeys) {
    const value = options[key];
    name += ':';
    if (key === 'servername' ? value && value !== options.host : key === 'rejectUnauthorized' || key === 'honorCipherOrder' || key === 'secureOptions' ? value !== undefined : value) name += value;
  }
  return name;
};

export const globalAgent = new Agent({ keepAlive: true, scheduling: 'lifo', timeout: 5000 });

// (url[, options][, callback]) or (options[, callback])
export const request = (input, options, callback) => {
  if (typeof input !== 'string' && !(input instanceof URL)) return new http.ClientRequest({ ...input, _defaultAgent: globalAgent }, options);
  if (typeof options === 'function') return new http.ClientRequest(input, { _defaultAgent: globalAgent }, options);
  return new http.ClientRequest(input, { ...options, _defaultAgent: globalAgent }, callback);
};

export const get = (input, options, callback) => {
  const req = request(input, options, callback);
  req.end();
  return req;
};

// http's server over tls: node makes it a tls.Server with http.Server's methods
export function Server(options, requestListener) {
  if (!(this instanceof Server)) return new Server(options, requestListener);
  if (typeof options === 'function') {
    requestListener = options;
    options = {};
  }
  options ??= {};
  EventEmitter.call(this);
  http._storeHttpOptions(this, options, requestListener);
  this._secure = true;
  this._app = uwsSsl.createApp(this, options);
}
Object.setPrototypeOf(Server.prototype, tls.Server.prototype);
Object.setPrototypeOf(Server, tls.Server);

for (const name of Object.getOwnPropertyNames(http.Server.prototype)) {
  if (name !== 'constructor') Object.defineProperty(Server.prototype, name, Object.getOwnPropertyDescriptor(http.Server.prototype, name));
}

export const createServer = (options, requestListener) => new Server(options, requestListener);

export default { Agent, globalAgent, Server, createServer, get, request };
