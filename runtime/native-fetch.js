import fs from 'node:fs';
import path from 'node:path';
import compile from '../compiler/index.js';

const FETCH_GLOBALS = fs.readFileSync(new URL('./fetch-globals.js', import.meta.url), 'utf8');
const NATIVE_FETCH_RESPONSE_FINALIZER = `
export function __porffor_native_fetch_response_finalize(response) {
  const status = response.status | 0;
  const body = response.body == null ? '' : String(response.body);
  const headersEntries = response.headers._entries;

  Porffor.c\`porf_native_fetch_response_parts_out->status = (i32)status;
porf_native_fetch_response_parts_out->body = body;
porf_native_fetch_response_parts_out->headers = headersEntries;\`;
}`;

const makeNativeFetchVirtualEntry = filename => `
import __porffor_native_server from ${JSON.stringify(path.resolve(filename))};

const __porffor_native_fetch = __porffor_native_server.fetch;
const __porffor_native_fetch_port = Number(__porffor_native_server.port ?? 3000);

export function __Porffor_fetch_native_handle(method, url, headerEntries, body) {
  const request = Object.create(Request.prototype);
  request.url = url;
  request.method = method;
  request.headers = Object.create(Headers.prototype);
  request.headers._entries = headerEntries;
  request.body = body;
  return Porffor.callThis(__porffor_native_fetch, __porffor_native_server, request);
}
`;

export default file => {
  Prefs.nativeFetch = true;
  if (Prefs.eventLoop == null) Prefs.eventLoop = true;
  Prefs.gc = true;

  const resolved = path.resolve(file);
  compile(makeNativeFetchVirtualEntry(resolved) + NATIVE_FETCH_RESPONSE_FINALIZER, true, {
    file: path.join(path.dirname(resolved), '__porffor_fetch_entry.mjs'),
    scripts: [ FETCH_GLOBALS ]
  });
};
