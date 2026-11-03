// fetch-style servers ({ fetch, port }) on the uWebSockets server
import * as uws from './uws.js';
import { Response, incomingRequest } from './fetch.js';
import { STATUS_CODES } from './status.js';
import { writeFd, utf8Length } from './bytes.js';
import { ReadableStream } from './webstreams/readablestream.js';
import { setInterval, clearInterval } from '../timers.js';
import { uvExceptionWithHostPort } from './uv.js';

const HTTP_1_0 = 8, NO_HOST = 16;

const statusLines = [];
const statusLine = response => response.statusText ? `${response.status} ${response.statusText}` : statusLines[response.status] ??= `${response.status} ${STATUS_CODES[response.status] ?? ''}`;

// a stream body goes out chunked as it is read (waiting out backpressure), the slot is released once it ends
const pipeBody = async (slot, reader) => {
  let aborted = false, writable = null;
  uws.own(slot, {
    _uwsAborted() {
      aborted = true;
      reader.cancel();
      writable?.();
      uws.release(slot);
    },
    _uwsWritable() {
      writable?.();
    }
  });
  let failed = false;
  try {
    for (let chunk; !aborted && !(chunk = await reader.read()).done;) {
      if (!uws.write(slot, chunk.value, -1)) await new Promise(resolve => writable = resolve);
    }
  } catch {
    // a body that errors cuts the response off
    failed = true;
  }
  if (aborted) return;
  uws.finish(slot, '', -1, failed);
  uws.release(slot);
};

// headers to send, without the ones the server sets itself
const sendHeaders = response => {
  if (response._headers === null) return response._contentType === null ? [] : [ 'content-type', response._contentType ];
  const list = response._headers._entries(), out = [];
  for (let i = 0; i < list.length; i += 2) {
    const name = list[i];
    if (name !== 'content-length' && name !== 'transfer-encoding' && name !== 'connection') out.push(name, list[i + 1]);
  }
  return out;
};

// a pending stream body releases the slot itself
const respond = (slot, method, response) => {
  if (!(response instanceof Response)) response = new Response(`fetch handler did not return a Response (got ${typeof response})`, { status: 500 });
  const headers = sendHeaders(response);
  const body = response._body ?? '';
  const noBody = method === 'HEAD' || response.status === 204 || response.status === 304;
  if (body instanceof ReadableStream && !noBody) {
    uws.writeHead(slot, statusLine(response), headers);
    return pipeBody(slot, body.getReader());
  }
  uws.end(slot, statusLine(response), headers, body, noBody, noBody && method === 'HEAD' ? (typeof body === 'string' ? utf8Length(body) : body.byteLength) : -1, false);
};

export const serve = options => {
  const fetch = options.fetch;
  const port = Number(options.port ?? 3000);
  const host = options.hostname ?? '';
  const server = { port, hostname: host || '0.0.0.0', development: false, pendingRequests: 0 };

  const failed = (slot, err) => {
    if (typeof options.error === 'function') {
      let response;
      try {
        response = options.error.call(server, err);
      } catch {}
      if (response instanceof Response) return respond(slot, 'GET', response);
    }
    writeFd(2, `${err?.stack ?? err}\n`);
    uws.end(slot, '500 Internal Server Error', [], 'Internal Server Error', false, false);
  };

  const conns = new Set();
  const app = uws.createApp(true, {
    _uwsConnection(conn) {
      conns.add(conn);
      return { _uwsClose: () => conns.delete(conn), _uwsClientError() {} };
    },
    _uwsRequest: (socket, slot, method, url, raw, flags, body, host) => onRequest(slot, method, url, raw, flags, body, host)
  });

  const onRequest = (slot, method, url, raw, flags, body, host) => {
    if ((flags & (NO_HOST | HTTP_1_0)) === NO_HOST) {
      uws.end(slot, '400 Bad Request', [ 'connection', 'close' ], '', false, -1, true);
      return uws.release(slot);
    }
    const request = incomingRequest(method, `http://${host ?? `localhost:${server.port}`}${url}`, raw, body);
    let result;
    try {
      result = fetch.call(options, request, server);
    } catch (err) {
      if (!failed(slot, err)) uws.release(slot);
      return;
    }
    if (result === null || typeof result !== 'object' || typeof result.then !== 'function') {
      if (!respond(slot, method, result)) uws.release(slot);
      return;
    }
    // an async handler that never waited is settled already: answer now rather than from a job
    if (Object.getPrototypeOf(result) === Promise.prototype && __Porffor_promise_state(result) !== 0) {
      if (__Porffor_promise_state(result) === 1) {
        if (!respond(slot, method, __Porffor_promise_result(result))) uws.release(slot);
      } else {
        __Porffor_promise_setHandled(result);
        if (!failed(slot, __Porffor_promise_result(result))) uws.release(slot);
      }
      return;
    }

    let aborted = false;
    server.pendingRequests++;
    uws.own(slot, {
      _uwsAborted() {
        aborted = true;
        server.pendingRequests--;
        uws.release(slot);
      }
    });
    result.then(response => {
      if (aborted) return;
      server.pendingRequests--;
      if (!respond(slot, method, response)) uws.release(slot);
    }, err => {
      if (aborted) return;
      server.pendingRequests--;
      if (!failed(slot, err)) uws.release(slot);
    });
  };

  server.port = uws.listen(app, host, port);
  if (server.port < 0) throw uvExceptionWithHostPort(server.port, 'listen', host || '0.0.0.0', port);
  // connections still sending a request's headers after 10s are dropped, as uWebSockets' own timeout would
  const headersTimeout = setInterval(() => {
    for (const conn of conns) if (uws.receiving(conn) > 10000) uws.connClose(conn, 0);
  }, 1000).unref();
  server.stop = closeActiveConnections => {
    clearInterval(headersTimeout);
    uws.close(app);
    if (closeActiveConnections) for (const conn of conns) uws.connClose(conn, 0);
  };
  writeFd(2, `listening on http://${host || 'localhost'}:${server.port}\n`);
  return server;
};

// `export default { fetch }` entry modules
export const serveDefault = value => {
  if (value !== null && typeof value === 'object' && typeof value.fetch === 'function') serve(value);
};
