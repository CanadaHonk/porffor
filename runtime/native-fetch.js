import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import compile from '../compiler/index.js';

const FETCH_GLOBALS = fs.readFileSync(new URL('./fetch-globals.js', import.meta.url), 'utf8');
const NATIVE_FETCH_RESPONSE_FINALIZER = `
export function __porffor_native_fetch_response_finalize(response) {
  const status = response.status | 0;
  const body = String(response.body);
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

const autoBundleNativeFetchModule = filename => {
  const cwd = path.dirname(path.resolve(filename));

  try {
    return execFileSync('esbuild', [
      '--bundle',
      '--format=esm',
      '--platform=neutral',
      '--target=es2022',
      '--conditions=worker',
      '--main-fields=browser,module,main',
      '--loader=ts',
      `--banner:js=${FETCH_GLOBALS}`,
      '--sourcefile=porffor-native-fetch-entry.ts',
      `--define:process.env.NODE_ENV="${Prefs.d ? 'development' : 'production'}"`
    ], {
      cwd,
      input: makeNativeFetchVirtualEntry(filename),
      stdio: 'pipe'
    }).toString();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('Auto-bundling fetch modules requires the `esbuild` command to be available on PATH');
    }

    const stderr = error?.stderr?.toString?.().trim?.();
    const stdout = error?.stdout?.toString?.().trim?.();
    throw new Error(stderr || stdout || `esbuild failed while auto-bundling ${filename}`);
  }
};

export default (file, source) => {
  Prefs.nativeFetch = true;
  Prefs.gc = true;
  globalThis.file = 'fetch.mjs';

  const bundledSource = autoBundleNativeFetchModule(file, source) + NATIVE_FETCH_RESPONSE_FINALIZER;

  compile(bundledSource, true);
};
