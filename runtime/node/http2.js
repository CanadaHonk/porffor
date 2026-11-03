import { STATUS_CODES } from './internal/status.js';

const headers = [
  ':status', ':method', ':authority', ':scheme', ':path', ':protocol', 'accept-encoding', 'accept-language', 'accept-ranges', 'accept',
  'access-control-allow-credentials', 'access-control-allow-headers', 'access-control-allow-methods', 'access-control-allow-origin',
  'access-control-expose-headers', 'access-control-request-headers', 'access-control-request-method', 'age', 'authorization', 'cache-control',
  'connection', 'content-disposition', 'content-encoding', 'content-length', 'content-type', 'cookie', 'date', 'etag', 'forwarded', 'host',
  'if-modified-since', 'if-none-match', 'if-range', 'last-modified', 'link', 'location', 'range', 'referer', 'server', 'set-cookie',
  'strict-transport-security', 'transfer-encoding', 'te', 'upgrade-insecure-requests', 'upgrade', 'user-agent', 'vary', 'x-content-type-options',
  'x-frame-options', 'keep-alive', 'proxy-connection', 'x-xss-protection', 'alt-svc', 'content-security-policy', 'early-data', 'expect-ct', 'origin',
  'purpose', 'timing-allow-origin', 'x-forwarded-for', 'priority', 'accept-charset', 'access-control-max-age', 'allow', 'content-language',
  'content-location', 'content-md5', 'content-range', 'dnt', 'expect', 'expires', 'from', 'if-match', 'if-unmodified-since', 'max-forwards', 'prefer',
  'proxy-authenticate', 'proxy-authorization', 'refresh', 'retry-after', 'trailer', 'tk', 'via', 'warning', 'www-authenticate', 'http2-settings'
];

const methods = [
  'ACL', 'BASELINE-CONTROL', 'BIND', 'CHECKIN', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LABEL', 'LINK', 'LOCK', 'MERGE', 'MKACTIVITY',
  'MKCALENDAR', 'MKCOL', 'MKREDIRECTREF', 'MKWORKSPACE', 'MOVE', 'OPTIONS', 'ORDERPATCH', 'PATCH', 'POST', 'PRI', 'PROPFIND', 'PROPPATCH', 'PUT',
  'REBIND', 'REPORT', 'SEARCH', 'TRACE', 'UNBIND', 'UNCHECKOUT', 'UNLINK', 'UNLOCK', 'UPDATE', 'UPDATEREDIRECTREF', 'VERSION-CONTROL'
];

const errors = [
  'NO_ERROR', 'PROTOCOL_ERROR', 'INTERNAL_ERROR', 'FLOW_CONTROL_ERROR', 'SETTINGS_TIMEOUT', 'STREAM_CLOSED', 'FRAME_SIZE_ERROR', 'REFUSED_STREAM',
  'CANCEL', 'COMPRESSION_ERROR', 'CONNECT_ERROR', 'ENHANCE_YOUR_CALM', 'INADEQUATE_SECURITY', 'HTTP_1_1_REQUIRED'
];

export const constants = {
  NGHTTP2_ERR_FRAME_SIZE_ERROR: -522, NGHTTP2_SESSION_SERVER: 0, NGHTTP2_SESSION_CLIENT: 1,
  NGHTTP2_STREAM_STATE_IDLE: 1, NGHTTP2_STREAM_STATE_OPEN: 2, NGHTTP2_STREAM_STATE_RESERVED_LOCAL: 3, NGHTTP2_STREAM_STATE_RESERVED_REMOTE: 4,
  NGHTTP2_STREAM_STATE_HALF_CLOSED_LOCAL: 5, NGHTTP2_STREAM_STATE_HALF_CLOSED_REMOTE: 6, NGHTTP2_STREAM_STATE_CLOSED: 7,
  NGHTTP2_FLAG_NONE: 0, NGHTTP2_FLAG_END_STREAM: 1, NGHTTP2_FLAG_END_HEADERS: 4, NGHTTP2_FLAG_ACK: 1, NGHTTP2_FLAG_PADDED: 8, NGHTTP2_FLAG_PRIORITY: 32,
  DEFAULT_SETTINGS_HEADER_TABLE_SIZE: 4096, DEFAULT_SETTINGS_ENABLE_PUSH: 1, DEFAULT_SETTINGS_MAX_CONCURRENT_STREAMS: 4294967295,
  DEFAULT_SETTINGS_INITIAL_WINDOW_SIZE: 65535, DEFAULT_SETTINGS_MAX_FRAME_SIZE: 16384, DEFAULT_SETTINGS_MAX_HEADER_LIST_SIZE: 65535,
  DEFAULT_SETTINGS_ENABLE_CONNECT_PROTOCOL: 0, MAX_MAX_FRAME_SIZE: 16777215, MIN_MAX_FRAME_SIZE: 16384, MAX_INITIAL_WINDOW_SIZE: 2147483647,
  NGHTTP2_SETTINGS_HEADER_TABLE_SIZE: 1, NGHTTP2_SETTINGS_ENABLE_PUSH: 2, NGHTTP2_SETTINGS_MAX_CONCURRENT_STREAMS: 3, NGHTTP2_SETTINGS_INITIAL_WINDOW_SIZE: 4,
  NGHTTP2_SETTINGS_MAX_FRAME_SIZE: 5, NGHTTP2_SETTINGS_MAX_HEADER_LIST_SIZE: 6, NGHTTP2_SETTINGS_ENABLE_CONNECT_PROTOCOL: 8,
  PADDING_STRATEGY_NONE: 0, PADDING_STRATEGY_ALIGNED: 1, PADDING_STRATEGY_MAX: 2, PADDING_STRATEGY_CALLBACK: 1, NGHTTP2_DEFAULT_WEIGHT: 16
};
errors.forEach((name, i) => constants['NGHTTP2_' + name] = i);
for (const name of headers) constants['HTTP2_HEADER_' + name.replace(':', '').replaceAll('-', '_').toUpperCase()] = name;
for (const method of methods) constants['HTTP2_METHOD_' + method.replaceAll('-', '_')] = method;
for (const code in STATUS_CODES) constants['HTTP_STATUS_' + (code === '418' ? 'TEAPOT' : STATUS_CODES[code].toUpperCase().replace(/[^A-Z]+/g, '_'))] = +code;

// for instanceof checks (@hono/node-server): there is no http2 server to make one
export class Http2ServerRequest {}

export default { constants, Http2ServerRequest };
