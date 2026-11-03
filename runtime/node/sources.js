// runtime builtin sources, embedded by text import and keyed by the paths node:* resolves to
import assert from './assert.js' with { type: 'text' };
import assertStrict from './assert/strict.js' with { type: 'text' };
import asyncHooks from './async_hooks.js' with { type: 'text' };
import buffer from './buffer.js' with { type: 'text' };
import cHelpers from './c-helpers.js' with { type: 'text' };
import childProcess from './child_process.js' with { type: 'text' };
import nodeConsole from './console.js' with { type: 'text' };
import constants from './constants.js' with { type: 'text' };
import crypto from './crypto.js' with { type: 'text' };
import diagnosticsChannel from './diagnostics_channel.js' with { type: 'text' };
import dns from './dns.js' with { type: 'text' };
import dnsPromises from './dns/promises.js' with { type: 'text' };
import events from './events.js' with { type: 'text' };
import fs from './fs.js' with { type: 'text' };
import fsPromises from './fs/promises.js' with { type: 'text' };
import http from './http.js' with { type: 'text' };
import http2 from './http2.js' with { type: 'text' };
import https from './https.js' with { type: 'text' };
import inspector from './inspector.js' with { type: 'text' };
import internalBlob from './internal/blob.js' with { type: 'text' };
import internalBytes from './internal/bytes.js' with { type: 'text' };
import internalDeepEqual from './internal/deep-equal.js' with { type: 'text' };
import internalDomexception from './internal/domexception.js' with { type: 'text' };
import internalEncoding from './internal/encoding.js' with { type: 'text' };
import internalErrors from './internal/errors.js' with { type: 'text' };
import internalEventTarget from './internal/event_target.js' with { type: 'text' };
import internalFetch from './internal/fetch.js' with { type: 'text' };
import internalFetchClient from './internal/fetch-client.js' with { type: 'text' };
import internalFsBinding from './internal/fs/binding.js' with { type: 'text' };
import internalFsStreams from './internal/fs/streams.js' with { type: 'text' };
import internalFsUtils from './internal/fs/utils.js' with { type: 'text' };
import internalFsWatchers from './internal/fs/watchers.js' with { type: 'text' };
import internalFileUrl from './internal/file-url.js' with { type: 'text' };
import internalHost from './internal/host.js' with { type: 'text' };
import internalHttpParser from './internal/http-parser.js' with { type: 'text' };
import internalInspect from './internal/inspect.js' with { type: 'text' };
import internalIp from './internal/ip.js' with { type: 'text' };
import internalIpc from './internal/ipc.js' with { type: 'text' };
import internalIpcChild from './internal/ipc-child.js' with { type: 'text' };
import internalLoop from './internal/loop.js' with { type: 'text' };
import internalReadlineCallbacks from './internal/readline/callbacks.js' with { type: 'text' };
import internalServe from './internal/serve.js' with { type: 'text' };
import internalStatus from './internal/status.js' with { type: 'text' };
import internalStdin from './internal/stdin.js' with { type: 'text' };
import internalStreamsDestroy from './internal/streams/destroy.js' with { type: 'text' };
import internalStreamsDuplex from './internal/streams/duplex.js' with { type: 'text' };
import internalStreamsEndOfStream from './internal/streams/end-of-stream.js' with { type: 'text' };
import internalStreamsLegacy from './internal/streams/legacy.js' with { type: 'text' };
import internalStreamsPipeline from './internal/streams/pipeline.js' with { type: 'text' };
import internalStreamsReadable from './internal/streams/readable.js' with { type: 'text' };
import internalStreamsTransform from './internal/streams/transform.js' with { type: 'text' };
import internalStreamsUtils from './internal/streams/utils.js' with { type: 'text' };
import internalStreamsWritable from './internal/streams/writable.js' with { type: 'text' };
import internalUndici from './internal/undici.js' with { type: 'text' };
import internalUv from './internal/uv.js' with { type: 'text' };
import internalUws from './internal/uws.js' with { type: 'text' };
import internalUwsSsl from './internal/uws-ssl.js' with { type: 'text' };
import internalValidators from './internal/validators.js' with { type: 'text' };
import internalWeb from './internal/web.js' with { type: 'text' };
import internalWebstreamsAdapters from './internal/webstreams/adapters.js' with { type: 'text' };
import internalWebstreamsCompression from './internal/webstreams/compression.js' with { type: 'text' };
import internalWebstreamsReadablestream from './internal/webstreams/readablestream.js' with { type: 'text' };
import internalWebstreamsTransformstream from './internal/webstreams/transformstream.js' with { type: 'text' };
import internalWebstreamsWritablestream from './internal/webstreams/writablestream.js' with { type: 'text' };
import module from './module.js' with { type: 'text' };
import net from './net.js' with { type: 'text' };
import os from './os.js' with { type: 'text' };
import path from './path.js' with { type: 'text' };
import pathPosix from './path/posix.js' with { type: 'text' };
import pathWin32 from './path/win32.js' with { type: 'text' };
import perfHooks from './perf_hooks.js' with { type: 'text' };
import process from './process.js' with { type: 'text' };
import querystring from './querystring.js' with { type: 'text' };
import readline from './readline.js' with { type: 'text' };
import readlinePromises from './readline/promises.js' with { type: 'text' };
import stream from './stream.js' with { type: 'text' };
import streamPromises from './stream/promises.js' with { type: 'text' };
import streamWeb from './stream/web.js' with { type: 'text' };
import stringDecoder from './string_decoder.js' with { type: 'text' };
import test from './test.js' with { type: 'text' };
import timers from './timers.js' with { type: 'text' };
import timersPromises from './timers/promises.js' with { type: 'text' };
import tls from './tls.js' with { type: 'text' };
import tty from './tty.js' with { type: 'text' };
import url from './url.js' with { type: 'text' };
import util from './util.js' with { type: 'text' };
import utilTypes from './util/types.js' with { type: 'text' };
import v8 from './v8.js' with { type: 'text' };
import vm from './vm.js' with { type: 'text' };
import workerThreads from './worker_threads.js' with { type: 'text' };
import zlib from './zlib.js' with { type: 'text' };

const root = '/@porffor-runtime/node/';
export default {
  [root + 'assert.js']: assert,
  [root + 'assert/strict.js']: assertStrict,
  [root + 'async_hooks.js']: asyncHooks,
  [root + 'buffer.js']: buffer,
  [root + 'c-helpers.js']: cHelpers,
  [root + 'child_process.js']: childProcess,
  [root + 'console.js']: nodeConsole,
  [root + 'constants.js']: constants,
  [root + 'crypto.js']: crypto,
  [root + 'diagnostics_channel.js']: diagnosticsChannel,
  [root + 'dns.js']: dns,
  [root + 'dns/promises.js']: dnsPromises,
  [root + 'events.js']: events,
  [root + 'fs.js']: fs,
  [root + 'fs/promises.js']: fsPromises,
  [root + 'http.js']: http,
  [root + 'http2.js']: http2,
  [root + 'https.js']: https,
  [root + 'inspector.js']: inspector,
  [root + 'internal/blob.js']: internalBlob,
  [root + 'internal/bytes.js']: internalBytes,
  [root + 'internal/deep-equal.js']: internalDeepEqual,
  [root + 'internal/domexception.js']: internalDomexception,
  [root + 'internal/encoding.js']: internalEncoding,
  [root + 'internal/errors.js']: internalErrors,
  [root + 'internal/event_target.js']: internalEventTarget,
  [root + 'internal/fetch.js']: internalFetch,
  [root + 'internal/fetch-client.js']: internalFetchClient,
  [root + 'internal/fs/binding.js']: internalFsBinding,
  [root + 'internal/fs/streams.js']: internalFsStreams,
  [root + 'internal/fs/utils.js']: internalFsUtils,
  [root + 'internal/fs/watchers.js']: internalFsWatchers,
  [root + 'internal/file-url.js']: internalFileUrl,
  [root + 'internal/host.js']: internalHost,
  [root + 'internal/http-parser.js']: internalHttpParser,
  [root + 'internal/inspect.js']: internalInspect,
  [root + 'internal/ip.js']: internalIp,
  [root + 'internal/ipc.js']: internalIpc,
  [root + 'internal/ipc-child.js']: internalIpcChild,
  [root + 'internal/loop.js']: internalLoop,
  [root + 'internal/readline/callbacks.js']: internalReadlineCallbacks,
  [root + 'internal/serve.js']: internalServe,
  [root + 'internal/status.js']: internalStatus,
  [root + 'internal/stdin.js']: internalStdin,
  [root + 'internal/streams/destroy.js']: internalStreamsDestroy,
  [root + 'internal/streams/duplex.js']: internalStreamsDuplex,
  [root + 'internal/streams/end-of-stream.js']: internalStreamsEndOfStream,
  [root + 'internal/streams/legacy.js']: internalStreamsLegacy,
  [root + 'internal/streams/pipeline.js']: internalStreamsPipeline,
  [root + 'internal/streams/readable.js']: internalStreamsReadable,
  [root + 'internal/streams/transform.js']: internalStreamsTransform,
  [root + 'internal/streams/utils.js']: internalStreamsUtils,
  [root + 'internal/streams/writable.js']: internalStreamsWritable,
  [root + 'internal/undici.js']: internalUndici,
  [root + 'internal/uv.js']: internalUv,
  [root + 'internal/uws.js']: internalUws,
  [root + 'internal/uws-ssl.js']: internalUwsSsl,
  [root + 'internal/validators.js']: internalValidators,
  [root + 'internal/web.js']: internalWeb,
  [root + 'internal/webstreams/adapters.js']: internalWebstreamsAdapters,
  [root + 'internal/webstreams/compression.js']: internalWebstreamsCompression,
  [root + 'internal/webstreams/readablestream.js']: internalWebstreamsReadablestream,
  [root + 'internal/webstreams/transformstream.js']: internalWebstreamsTransformstream,
  [root + 'internal/webstreams/writablestream.js']: internalWebstreamsWritablestream,
  [root + 'module.js']: module,
  [root + 'net.js']: net,
  [root + 'os.js']: os,
  [root + 'path.js']: path,
  [root + 'path/posix.js']: pathPosix,
  [root + 'path/win32.js']: pathWin32,
  [root + 'perf_hooks.js']: perfHooks,
  [root + 'process.js']: process,
  [root + 'querystring.js']: querystring,
  [root + 'readline.js']: readline,
  [root + 'readline/promises.js']: readlinePromises,
  [root + 'stream.js']: stream,
  [root + 'stream/promises.js']: streamPromises,
  [root + 'stream/web.js']: streamWeb,
  [root + 'string_decoder.js']: stringDecoder,
  [root + 'test.js']: test,
  [root + 'timers.js']: timers,
  [root + 'timers/promises.js']: timersPromises,
  [root + 'tls.js']: tls,
  [root + 'tty.js']: tty,
  [root + 'url.js']: url,
  [root + 'util.js']: util,
  [root + 'util/types.js']: utilTypes,
  [root + 'v8.js']: v8,
  [root + 'vm.js']: vm,
  [root + 'worker_threads.js']: workerThreads,
  [root + 'zlib.js']: zlib
};

// free globals that pull in a runtime module: name -> [ module, export, enumerable ]
export const globals = {
  process: [ 'process', 'default' ],
  Buffer: [ 'buffer', 'Buffer' ],
  global: [ 'internal/web', 'global', true ],
  setTimeout: [ 'timers', 'setTimeout', true ],
  setInterval: [ 'timers', 'setInterval', true ],
  setImmediate: [ 'timers', 'setImmediate', true ],
  clearTimeout: [ 'timers', 'clearTimeout', true ],
  clearInterval: [ 'timers', 'clearInterval', true ],
  clearImmediate: [ 'timers', 'clearImmediate', true ],
  queueMicrotask: [ 'internal/web', 'queueMicrotask', true ],
  structuredClone: [ 'internal/web', 'structuredClone', true ],
  TextEncoder: [ 'internal/encoding', 'TextEncoder' ],
  TextDecoder: [ 'internal/encoding', 'TextDecoder' ],
  Event: [ 'internal/event_target', 'Event' ],
  EventTarget: [ 'internal/event_target', 'EventTarget' ],
  CustomEvent: [ 'internal/event_target', 'CustomEvent' ],
  MessageEvent: [ 'internal/event_target', 'MessageEvent' ],
  AbortController: [ 'internal/event_target', 'AbortController' ],
  AbortSignal: [ 'internal/event_target', 'AbortSignal' ],
  URL: [ 'url', 'URL' ],
  URLSearchParams: [ 'url', 'URLSearchParams' ],
  Headers: [ 'internal/fetch', 'Headers' ],
  Request: [ 'internal/fetch', 'Request' ],
  Response: [ 'internal/fetch', 'Response' ],
  FormData: [ 'internal/fetch', 'FormData' ],
  fetch: [ 'internal/fetch-client', 'fetch', true ],
  Blob: [ 'internal/blob', 'Blob' ],
  File: [ 'internal/blob', 'File' ],
  atob: [ 'buffer', 'atob', true ],
  btoa: [ 'buffer', 'btoa', true ],
  crypto: [ 'crypto', 'webcrypto', true ],
  CryptoKey: [ 'crypto', 'CryptoKey' ],
  DOMException: [ 'internal/domexception', 'DOMException' ],
  performance: [ 'perf_hooks', 'performance', true ],
  PerformanceObserver: [ 'perf_hooks', 'PerformanceObserver' ],
  'Error.captureStackTrace': [ 'internal/web', 'captureStackTrace' ],
  ReadableStream: [ 'internal/webstreams/readablestream', 'ReadableStream' ],
  ReadableStreamDefaultReader: [ 'internal/webstreams/readablestream', 'ReadableStreamDefaultReader' ],
  WritableStream: [ 'internal/webstreams/writablestream', 'WritableStream' ],
  WritableStreamDefaultWriter: [ 'internal/webstreams/writablestream', 'WritableStreamDefaultWriter' ],
  TransformStream: [ 'internal/webstreams/transformstream', 'TransformStream' ],
  CompressionStream: [ 'internal/webstreams/compression', 'CompressionStream' ],
  MessageChannel: [ 'worker_threads', 'MessageChannel' ],
  // a forked child's ipc channel
  'process.send': [ 'internal/ipc-child', 'send' ],
  'process.channel': [ 'internal/ipc-child', 'channel' ],
  'process.connected': [ 'internal/ipc-child', 'connected' ],
  'process.disconnect': [ 'internal/ipc-child', 'disconnect' ],
  'process.stdin': [ 'internal/stdin', 'stdin' ]
};
