// fetch() over node:http and node:https
import http from '../http.js';
import https from '../https.js';
import { Buffer } from '../buffer.js';
import { URL } from '../url.js';
import { Headers, Request, Response } from './fetch.js';
import { newReadableStreamFromStreamReadable } from './webstreams/adapters.js';

const redirectStatuses = [ 301, 302, 303, 307, 308 ];
const nullBodyStatuses = [ 101, 204, 205, 304 ];

const fetchFailed = cause => Object.assign(new TypeError('fetch failed'), { cause });

// data:[<mediatype>][;base64],<data>
const fetchData = url => {
  const href = url.href.slice(5);
  const comma = href.indexOf(',');
  if (comma === -1) throw fetchFailed(new TypeError('invalid data: URL'));
  let type = href.slice(0, comma).trim();
  const base64 = /;\s*base64$/i.test(type);
  if (base64) type = type.replace(/;\s*base64$/i, '');
  const data = href.slice(comma + 1).replace(/%([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const body = base64 ? Buffer.from(data.replace(/[\t\n\f\r ]/g, ''), 'base64') : Buffer.from(data, 'latin1');
  return new Response(body, { status: 200, statusText: 'OK', headers: { 'content-type': type || 'text/plain;charset=US-ASCII' } });
};

const send = (request, url, redirects, resolve, reject) => {
  if (url.protocol === 'data:') {
    try {
      return resolve(fetchData(url));
    } catch (err) {
      return reject(err);
    }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return reject(fetchFailed(new TypeError(`URL scheme "${url.protocol.slice(0, -1)}" is not supported.`)));

  const headers = {};
  for (const [ name, value ] of request.headers) headers[name] = value;
  const body = request._body;
  if (body !== null && headers['content-length'] === undefined) headers['content-length'] = String(Buffer.byteLength(body));
  headers['user-agent'] ??= 'node';

  const signal = request._signal;
  const req = (url.protocol === 'https:' ? https : http).request(url, { method: request.method, headers }, res => {
    const status = res.statusCode;
    if (redirectStatuses.includes(status) && res.headers.location !== undefined && request.redirect !== 'manual') {
      res.resume();
      if (request.redirect === 'error') return reject(fetchFailed(new TypeError('unexpected redirect')));
      if (redirects >= 20) return reject(fetchFailed(new TypeError('redirect count exceeded')));

      let next;
      try {
        next = new URL(res.headers.location, url);
      } catch (err) {
        return reject(fetchFailed(err));
      }
      // 303s, and 301/302 after a POST, continue as a GET without a body
      const asGet = status === 303 || ((status === 301 || status === 302) && request.method === 'POST');
      const nextRequest = new Request(next.href, {
        method: asGet ? 'GET' : request.method,
        headers: request.headers,
        body: asGet || request.method === 'GET' || request.method === 'HEAD' ? null : body,
        redirect: request.redirect,
        signal
      });
      if (asGet) nextRequest.headers.delete('content-length');
      // credentials stay with the origin they were meant for
      if (next.origin !== url.origin) for (const name of [ 'authorization', 'proxy-authorization', 'cookie' ]) nextRequest.headers.delete(name);
      return send(nextRequest, next, redirects + 1, resolve, reject);
    }

    // the body streams in after the response resolves
    const responseHeaders = new Headers();
    for (let i = 0; i < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
    const empty = nullBodyStatuses.includes(status) || request.method === 'HEAD';
    if (empty) res.resume();
    const response = new Response(empty ? null : newReadableStreamFromStreamReadable(res), { status, statusText: res.statusMessage, headers: responseHeaders });
    response.url = url.href;
    response.redirected = redirects > 0;
    resolve(response);
  });

  req.on('error', err => reject(fetchFailed(err)));
  if (signal) {
    const onAbort = () => {
      req.destroy();
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    req.once('close', () => signal.removeEventListener('abort', onAbort));
  }
  req.end(body ?? undefined);
};

export function fetch(input, init = undefined) {
  return new Promise((resolve, reject) => {
    const request = new Request(input, init);
    let url;
    try {
      url = new URL(request.url);
    } catch (err) {
      throw Object.assign(new TypeError(`Failed to parse URL from ${request.url}`), { cause: err });
    }
    if (request._signal?.aborted) throw request._signal.reason;
    send(request, url, 0, resolve, reject);
  });
}
