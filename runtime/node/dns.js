import * as uv from './internal/uv.js';
import { nextTick } from './internal/loop.js';
import { isIP } from './internal/ip.js';
import { errInvalidArgValue } from './internal/errors.js';
import { validateString, validateFunction } from './internal/validators.js';

export const ADDRCONFIG = 1024;
export const NODATA = 'ENODATA', NOTFOUND = 'ENOTFOUND', NOTIMP = 'ENOTIMP', SERVFAIL = 'ESERVFAIL', CONNREFUSED = 'ECONNREFUSED', REFUSED = 'EREFUSED', TIMEOUT = 'ETIMEOUT';

const dnsException = (err, syscall, hostname) => {
  let code = uv.errName(err);
  if (code === 'EAI_NONAME' || code === 'EAI_NODATA') code = NOTFOUND;
  const error = new Error(`${syscall} ${code} ${hostname}`);
  error.errno = err;
  error.code = code;
  error.syscall = syscall;
  error.hostname = hostname;
  return error;
};

// [ { address, family } ] in getaddrinfo's order
const getaddrinfo = (hostname, family, hints, syscall, callback) => {
  const id = uv.register((kind, status, data) => {
    if (status < 0) return callback(dnsException(status, syscall, hostname));
    const addresses = [];
    for (const line of data.split('\n')) if (line) addresses.push({ address: line.slice(2), family: +line[0] });
    callback(null, addresses);
  });
  const err = uv.getaddrinfo(id, hostname, family, hints);
  if (err) {
    uv.release(id);
    nextTick(callback, dnsException(err, syscall, hostname));
  }
};

export const lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else if (typeof options === 'number') options = { family: options };
  validateFunction(callback, 'callback');
  if (!hostname) throw errInvalidArgValue('hostname', hostname, 'must be a non-empty string');
  validateString(hostname, 'hostname');
  const family = options?.family === 'IPv4' ? 4 : options?.family === 'IPv6' ? 6 : options?.family ?? 0;
  const all = !!options?.all;

  const literal = isIP(hostname);
  if (literal) {
    if (all) nextTick(callback, null, [ { address: hostname, family: literal } ]);
      else nextTick(callback, null, hostname, literal);
    return {};
  }
  getaddrinfo(hostname, family, options?.hints ?? 0, 'getaddrinfo', (err, addresses) => {
    if (err) callback(err);
      else if (all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
  });
  return {};
};

// answered by the system resolver rather than straight from dns servers
const resolve = (family, syscall) => function (hostname, callback) {
  validateString(hostname, 'hostname');
  validateFunction(callback, 'callback');
  getaddrinfo(hostname, family, 0, syscall, (err, addresses) => callback(err, err ? undefined : addresses.map(x => x.address)));
  return {};
};

export class Resolver {}
Resolver.prototype.resolve4 = resolve(4, 'queryA');
Resolver.prototype.resolve6 = resolve(6, 'queryAaaa');

export const getDefaultResultOrder = () => 'verbatim';

export const promises = {
  lookup: (hostname, options) => new Promise((resolve, reject) => lookup(hostname, options, (err, address, family) => {
    if (err) reject(err);
      else resolve(options?.all ? address : { address, family });
  })),
  getDefaultResultOrder
};

export default { ADDRCONFIG, NODATA, NOTFOUND, NOTIMP, SERVFAIL, CONNREFUSED, REFUSED, TIMEOUT, Resolver, lookup, getDefaultResultOrder, promises };
