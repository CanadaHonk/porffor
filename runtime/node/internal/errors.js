// node's internal error codes, which print as "Name [CODE]: message"

// inspect registers itself when a program includes it, else values print plainly
let inspectHook = value => typeof value === 'string' ? `'${value}'` : String(value);
export const setInspect = fn => { inspectHook = fn; };
export const inspect = (value, opts) => inspectHook(value, opts);

function codeToString() {
  return `${this.name} [${this.code}]: ${this.message}`;
}

const make = (Base, code, message) => {
  const err = new Base(message);
  err.code = code;
  Object.defineProperty(err, 'toString', { value: codeToString, writable: true, configurable: true });
  return err;
};

// node's errors thrown from c++, which print without the code
export const codedError = (Base, code, message) => {
  const err = new Base(message);
  err.code = code;
  return err;
};

// node's determineSpecificType
const describeType = value => {
  if (value == null) return String(value);
  switch (typeof value) {
    case 'bigint': return `type bigint (${value}n)`;
    case 'number': return `type number (${Object.is(value, -0) ? '-0' : value})`;
    case 'boolean': case 'symbol': return `type ${typeof value} (${String(value)})`;
    case 'function': return `function ${value.name}`;
    case 'object': return value.constructor && 'name' in value.constructor ? `an instance of ${value.constructor.name}` : inspect(value, { depth: -1 });
  }
  if (value.length > 28) value = value.slice(0, 25) + '...';
  return `type string (${value.includes("'") ? JSON.stringify(value) : `'${value}'`})`;
};

// a phrase ("of type string", "an instance of Buffer") or a list of type and class names
const describeExpected = expected => {
  if (typeof expected === 'string' && /^(of type|an? |one of)/.test(expected)) return expected;
  return [ expected ].flat().map(x => /^[A-Z]/.test(x) && x !== 'Function' && x !== 'Object' ? `an instance of ${x}` : `of type ${x.toLowerCase()}`).join(' or ');
};

const argLabel = name => name.endsWith(' argument') ? name : `"${name}" ${name.includes('.') ? 'property' : 'argument'}`;

export const errInvalidArgType = (name, expected, actual) => make(TypeError, 'ERR_INVALID_ARG_TYPE', `The ${argLabel(name)} must be ${describeExpected(expected)}. Received ${describeType(actual)}`);
export const errInvalidArgValue = (name, value, reason = 'is invalid', Base = TypeError) => {
  let inspected = inspect(value);
  if (inspected.length > 128) inspected = `${inspected.slice(0, 128)}...`;
  return make(Base, 'ERR_INVALID_ARG_VALUE', `The ${name.includes('.') ? 'property' : 'argument'} '${name}' ${reason}. Received ${inspected}`);
};

export const errOutOfRange = (name, range, value) => make(RangeError, 'ERR_OUT_OF_RANGE', `The value of "${name}" is out of range. It must be ${range}. Received ${typeof value === 'bigint' ? `${value}n` : value}`);
export const errInvalidUri = () => make(URIError, 'ERR_INVALID_URI', 'URI malformed');
export const errEventRecursion = type => make(Error, 'ERR_EVENT_RECURSION', `The event "${type}" is already being dispatched`);
export const errUnknownEncoding = encoding => make(TypeError, 'ERR_UNKNOWN_ENCODING', `Unknown encoding: ${encoding}`);
export const errStringTooLong = () => make(Error, 'ERR_STRING_TOO_LONG', 'Cannot create a string longer than 0x1fffffe8 characters');
export const errMissingArgs = (...names) => {
  names = names.map(x => Array.isArray(x) ? x.map(y => `"${y}"`).join(' or ') : `"${x}"`);
  const list = names.length === 1 ? `${names[0]} argument` : names.length === 2 ? `${names[0]} and ${names[1]} arguments` : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} arguments`;
  return make(TypeError, 'ERR_MISSING_ARGS', `The ${list} must be specified`);
};
export const errMethodNotImplemented = method => make(Error, 'ERR_METHOD_NOT_IMPLEMENTED', `The ${method} method is not implemented`);
export const errMultipleCallback = () => make(Error, 'ERR_MULTIPLE_CALLBACK', 'Callback called multiple times');
export const errStreamPushAfterEof = () => make(Error, 'ERR_STREAM_PUSH_AFTER_EOF', 'stream.push() after EOF');
export const errStreamUnshiftAfterEnd = () => make(Error, 'ERR_STREAM_UNSHIFT_AFTER_END_EVENT', 'stream.unshift() after end event');
export const errStreamWriteAfterEnd = (Base = Error) => make(Base, 'ERR_STREAM_WRITE_AFTER_END', 'write after end');
export const errStreamDestroyed = method => make(Error, 'ERR_STREAM_DESTROYED', `Cannot call ${method} after a stream was destroyed`);
export const errStreamNullValues = () => make(TypeError, 'ERR_STREAM_NULL_VALUES', 'May not write null values to stream');
export const errStreamPrematureClose = () => make(Error, 'ERR_STREAM_PREMATURE_CLOSE', 'Premature close');
export const errStreamAlreadyFinished = method => make(Error, 'ERR_STREAM_ALREADY_FINISHED', `Cannot call ${method} after a stream was finished`);
export const errStreamCannotPipe = () => make(Error, 'ERR_STREAM_CANNOT_PIPE', 'Cannot pipe, not readable');
export const errStreamUnableToPipe = () => make(Error, 'ERR_STREAM_UNABLE_TO_PIPE', 'Cannot pipe to a closed or destroyed stream');
export const errInvalidReturnValue = (input, name, value) => make(TypeError, 'ERR_INVALID_RETURN_VALUE',
  `Expected ${input} to be returned from the "${name}" function but got ${describeType(value)}.`);
export const errSocketClosed = () => make(Error, 'ERR_SOCKET_CLOSED', 'Socket is closed');
const errSocketBadPort = (name, port, allowZero = true) => make(RangeError, 'ERR_SOCKET_BAD_PORT', `${name} should be ${allowZero ? '>=' : '>'} 0 and < 65536. Received ${describeType(port)}.`);
export const validatePort = (port, name = 'Port', allowZero = true) => {
  if ((typeof port !== 'number' && typeof port !== 'string') || (typeof port === 'string' && port.trim().length === 0) || +port !== (+port >>> 0) || port > 0xffff || (port === 0 && !allowZero)) throw errSocketBadPort(name, port, allowZero);
  return port | 0;
};
export const errInvalidIpAddress = ip => make(TypeError, 'ERR_INVALID_IP_ADDRESS', `Invalid IP address: ${ip}`);
export const errBufferOutOfBounds = name => make(RangeError, 'ERR_BUFFER_OUT_OF_BOUNDS', name ? `"${name}" is outside of buffer bounds` : 'Attempt to access memory outside buffer bounds');
// info is { errno, code, message, syscall } of the failed call
export const systemError = (code, prefix, info) => {
  const err = make(Error, code, `${prefix}: ${info.syscall} returned ${info.code} (${info.message})${info.path !== undefined ? ` ${info.path}` : ''}${info.dest !== undefined ? ` => ${info.dest}` : ''}`);
  Object.defineProperty(err, 'name', { value: 'SystemError', writable: true, configurable: true });
  err.info = info;
  err.errno = info.errno;
  err.syscall = info.syscall;
  if (info.path !== undefined) err.path = info.path;
  if (info.dest !== undefined) err.dest = info.dest;
  return err;
};
export const errServerNotRunning = () => make(Error, 'ERR_SERVER_NOT_RUNNING', 'Server is not running.');
export const errServerAlreadyListen = () => make(Error, 'ERR_SERVER_ALREADY_LISTEN', 'Listen method has been called more than once without closing.');
export const errHttpHeadersSent = action => make(Error, 'ERR_HTTP_HEADERS_SENT', `Cannot ${action} headers after they are sent to the client`);
export const errHttpInvalidHeaderValue = (value, name) => make(TypeError, 'ERR_HTTP_INVALID_HEADER_VALUE', `Invalid value "${value}" for header "${name}"`);
export const errInvalidHttpToken = (label, name) => make(TypeError, 'ERR_INVALID_HTTP_TOKEN', `${label} must be a valid HTTP token ["${name}"]`);
export const errInvalidChar = (label, field) => make(TypeError, 'ERR_INVALID_CHAR', `Invalid character in ${label}${field ? ` ["${field}"]` : ''}`);
export const errUnescapedCharacters = prefix => make(TypeError, 'ERR_UNESCAPED_CHARACTERS', `${prefix} contains unescaped characters`);
export const errHttpRequestTimeout = () => make(Error, 'ERR_HTTP_REQUEST_TIMEOUT', 'Request timeout');
export const errHttpInvalidStatusCode = code => make(RangeError, 'ERR_HTTP_INVALID_STATUS_CODE', `Invalid status code: ${code}`);
export const errInvalidProtocol = (protocol, expected) => make(TypeError, 'ERR_INVALID_PROTOCOL', `Protocol "${protocol}" not supported. Expected "${expected}"`);
export const errIpcChannelClosed = () => make(Error, 'ERR_IPC_CHANNEL_CLOSED', 'Channel closed');
export const errUnknownSignal = signal => make(TypeError, 'ERR_UNKNOWN_SIGNAL', `Unknown signal: ${signal}`);
export const errInvalidState = (message, Base = Error) => make(Base, 'ERR_INVALID_STATE', `Invalid state: ${message}`);
export const errIllegalConstructor = () => make(TypeError, 'ERR_ILLEGAL_CONSTRUCTOR', 'Illegal constructor');
export const errUnhandledError = err => make(Error, 'ERR_UNHANDLED_ERROR', `Unhandled error.${err === undefined ? '' : ` (${err})`}`);
export const errParseArgsInvalidOptionValue = message => make(TypeError, 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE', message);
export const errParseArgsUnexpectedPositional = value => make(TypeError, 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL', `Unexpected argument '${value}'. This command does not take positional arguments`);
export const errParseArgsUnknownOption = (option, allowPositionals) => make(TypeError, 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
  `Unknown option '${option}'${allowPositionals ? `. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- ${JSON.stringify(option)}` : ''}`);
export const errUseAfterClose = name => make(Error, 'ERR_USE_AFTER_CLOSE', `${name} was closed`);
export const errSocketClosedBeforeConnection = () => make(Error, 'ERR_SOCKET_CLOSED_BEFORE_CONNECTION', 'Socket closed before the connection was established');
export const errUnhandledRejection = reason => make(Error, 'ERR_UNHANDLED_REJECTION', `This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). The promise rejected with the reason "${reason}".`);
export const errWorkerUnserializableError = () => make(Error, 'ERR_WORKER_UNSERIALIZABLE_ERROR', 'Serializing an uncaught exception failed');
export const errNotBuildingSnapshot = () => make(Error, 'ERR_NOT_BUILDING_SNAPSHOT', 'Operation cannot be invoked when not building startup snapshot');
export const errPorfforDynamicCode = message => make(Error, 'ERR_PORFFOR_DYNAMIC_CODE', message);
export const errInvalidUrl = (input, base) => Object.assign(codedError(TypeError, 'ERR_INVALID_URL', 'Invalid URL'), base == null ? { input } : { input, base });
export const errInvalidUrlScheme = expected => make(TypeError, 'ERR_INVALID_URL_SCHEME', `The URL must be of scheme ${expected}`);
export const errInvalidFileUrlHost = platform => make(TypeError, 'ERR_INVALID_FILE_URL_HOST', `File URL host must be "localhost" or empty on ${platform}`);
export const errInvalidFileUrlPath = (reason, input) => Object.assign(make(TypeError, 'ERR_INVALID_FILE_URL_PATH', `File URL path ${reason}`), { input });
export const errInvalidTuple = (name, tuple) => make(TypeError, 'ERR_INVALID_TUPLE', `${name} must be an iterable ${tuple} tuple`);
export const errEncodingNotSupported = encoding => make(RangeError, 'ERR_ENCODING_NOT_SUPPORTED', `The "${encoding}" encoding is not supported`);
export const errEncodingInvalidEncodedData = encoding => codedError(TypeError, 'ERR_ENCODING_INVALID_ENCODED_DATA', `The encoded data was not valid for encoding ${encoding}`);
export const errZlibInitializationFailed = (message = 'Initialization failed') => make(Error, 'ERR_ZLIB_INITIALIZATION_FAILED', message);

export const abortError = (cause, message = 'The operation was aborted') => {
  const err = new Error(message);
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  if (cause !== undefined) err.cause = cause;
  return err;
};

export const aggregateTwoErrors = (innerError, outerError) => {
  if (innerError && outerError && innerError !== outerError) {
    if (Array.isArray(outerError.errors)) {
      outerError.errors.push(innerError);
      return outerError;
    }
    const err = new AggregateError([ outerError, innerError ], outerError.message);
    err.code = outerError.code;
    return err;
  }
  return innerError || outerError;
};

