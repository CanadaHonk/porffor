import './c-helpers.js';
import { Buffer } from './buffer.js';
import { Transform, finished } from './stream.js';
import { nextTick, queueWork } from './internal/loop.js';
import { setImmediate } from './timers.js';
import { errZlibInitializationFailed } from './internal/errors.js';
import { validateFunction } from './internal/validators.js';

Porffor.link`zlib`;
Porffor.link`static libbrotlienc`;
Porffor.link`static libbrotlidec`;
Porffor.link`static libzstd`;

Porffor.c`
#include <zlib.h>
#include <brotli/encode.h>
#include <brotli/decode.h>
#include <zstd.h>
#include <zstd_errors.h>

enum {
  PORF_Z_DEFLATE = 1, PORF_Z_INFLATE, PORF_Z_GZIP, PORF_Z_GUNZIP, PORF_Z_DEFLATERAW, PORF_Z_INFLATERAW, PORF_Z_UNZIP,
  PORF_Z_BROTLI_DECODE, PORF_Z_BROTLI_ENCODE, PORF_Z_ZSTD_DECOMPRESS = 11
};

typedef struct {
  i32 mode, flush, err;
  const u8 *in;
  u8 *out;
  size_t in_len, out_len;
  u8 *dict;
  size_t dict_len;
  z_stream z;
  BrotliEncoderState *benc;
  BrotliDecoderState *bdec;
  ZSTD_DCtx *dctx;
  size_t result;
  const char *msg, *code;
} porf_z;

static i32 porf_z_deflating(porf_z *s) {
  return s->mode == PORF_Z_DEFLATE || s->mode == PORF_Z_GZIP || s->mode == PORF_Z_DEFLATERAW;
}

// deflate and raw inflate take the dictionary up front, zlib inflate once it asks
static i32 porf_z_dict(porf_z *s) {
  if (!s->dict_len) return Z_OK;
  if (s->mode == PORF_Z_DEFLATE || s->mode == PORF_Z_DEFLATERAW) return deflateSetDictionary(&s->z, s->dict, (uInt)s->dict_len);
  if (s->mode == PORF_Z_INFLATERAW) return inflateSetDictionary(&s->z, s->dict, (uInt)s->dict_len);
  return Z_OK;
}

static void porf_z_brotli_init(porf_z *s) {
  if (s->mode == PORF_Z_BROTLI_ENCODE) {
    if (s->benc) BrotliEncoderDestroyInstance(s->benc);
    s->benc = BrotliEncoderCreateInstance(NULL, NULL, NULL);
  } else {
    if (s->bdec) BrotliDecoderDestroyInstance(s->bdec);
    s->bdec = BrotliDecoderCreateInstance(NULL, NULL, NULL);
  }
}

static void porf_z_reset(porf_z *s) {
  if (s->mode == PORF_Z_ZSTD_DECOMPRESS) {
    ZSTD_DCtx_reset(s->dctx, ZSTD_reset_session_only);
  } else if (s->mode >= PORF_Z_BROTLI_DECODE) {
    porf_z_brotli_init(s);
  } else {
    if (porf_z_deflating(s)) deflateReset(&s->z);
      else inflateReset(&s->z);
    porf_z_dict(s);
  }
}

static void porf_z_run(void *arg) {
  porf_z *s = arg;
  if (s->mode <= PORF_Z_UNZIP) {
    z_stream *z = &s->z;
    z->next_in = (Bytef*)s->in;
    z->avail_in = (uInt)s->in_len;
    z->next_out = s->out;
    z->avail_out = (uInt)s->out_len;
    if (porf_z_deflating(s)) {
      s->err = deflate(z, s->flush);
    } else {
      s->err = inflate(z, s->flush);
      if (s->err == Z_NEED_DICT && s->dict_len && s->mode != PORF_Z_INFLATERAW) {
        s->err = inflateSetDictionary(z, s->dict, (uInt)s->dict_len);
        if (s->err == Z_OK) s->err = inflate(z, s->flush);
          else if (s->err == Z_DATA_ERROR) s->err = Z_NEED_DICT;
      }
      // more gzip members, unless what follows is zero padding
      while (s->err == Z_STREAM_END && z->avail_in > 0 && (s->mode == PORF_Z_GUNZIP ? z->next_in[0] != 0x00 : s->mode == PORF_Z_UNZIP && z->next_in[0] == 0x1f)) {
        inflateReset(z);
        s->err = inflate(z, s->flush);
      }
    }
    s->in_len = z->avail_in;
    s->out_len = z->avail_out;
  } else if (s->mode == PORF_Z_ZSTD_DECOMPRESS) {
    // between frames with no input left
    if (s->result == 0 && s->in_len == 0) return;
    ZSTD_inBuffer in = { s->in, s->in_len, 0 };
    ZSTD_outBuffer out = { s->out, s->out_len, 0 };
    // a finished frame stops decoding, carry on into the next
    do s->result = ZSTD_decompressStream(s->dctx, &out, &in);
    while (s->result == 0 && in.pos < in.size && out.pos < out.size);
    s->in_len = in.size - in.pos;
    s->out_len = out.size - out.pos;
  } else {
    size_t avail_in = s->in_len, avail_out = s->out_len;
    const u8 *next_in = s->in;
    u8 *next_out = s->out;
    if (s->mode == PORF_Z_BROTLI_ENCODE) s->result = BrotliEncoderCompressStream(s->benc, (BrotliEncoderOperation)s->flush, &avail_in, &next_in, &avail_out, &next_out, NULL);
      else s->result = BrotliDecoderDecompressStream(s->bdec, &avail_in, &next_in, &avail_out, &next_out, NULL);
    s->in_len = avail_in;
    s->out_len = avail_out;
  }
}

static i32 porf_z_fail(porf_z *s, const char *msg, const char *code, i32 err) {
  s->msg = msg;
  s->code = code;
  return err;
}

static i32 porf_z_eof(porf_z *s) {
  return porf_z_fail(s, "unexpected end of file", "Z_BUF_ERROR", Z_BUF_ERROR);
}

static const char *porf_z_code(i32 err) {
  switch (err) {
    case Z_ERRNO: return "Z_ERRNO";
    case Z_STREAM_ERROR: return "Z_STREAM_ERROR";
    case Z_DATA_ERROR: return "Z_DATA_ERROR";
    case Z_MEM_ERROR: return "Z_MEM_ERROR";
    case Z_BUF_ERROR: return "Z_BUF_ERROR";
    case Z_VERSION_ERROR: return "Z_VERSION_ERROR";
  }
  return "Z_UNKNOWN_ERROR";
}

// the last run's errno with msg and code set, 0 without an error
static i32 porf_z_error(porf_z *s) {
  if (s->mode <= PORF_Z_UNZIP) {
    switch (s->err) {
      case Z_OK: case Z_BUF_ERROR:
        return s->out_len != 0 && s->flush == Z_FINISH ? porf_z_eof(s) : 0;
      case Z_STREAM_END:
        return 0;
      case Z_NEED_DICT:
        return porf_z_fail(s, s->dict_len ? "Bad dictionary" : "Missing dictionary", "Z_NEED_DICT", Z_NEED_DICT);
    }
    return porf_z_fail(s, s->z.msg ? s->z.msg : "Zlib error", porf_z_code(s->err), s->err);
  }

  if (s->mode == PORF_Z_BROTLI_ENCODE) return s->result ? 0 : porf_z_fail(s, "Compression failed", "ERR_BROTLI_COMPRESSION_FAILED", -1);
  if (s->mode == PORF_Z_BROTLI_DECODE) {
    if (s->result == BROTLI_DECODER_RESULT_ERROR) return porf_z_fail(s, "Decompression failed", "ERR_BROTLI_DECOMPRESSION_FAILED", BrotliDecoderGetErrorCode(s->bdec));
    return s->flush == BROTLI_OPERATION_FINISH && s->result == BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT ? porf_z_eof(s) : 0;
  }

  if (ZSTD_isError(s->result)) return porf_z_fail(s, ZSTD_getErrorName(s->result), "ERR_ZSTD_DECOMPRESSION_FAILED", ZSTD_getErrorCode(s->result));
  return s->flush == ZSTD_e_end && s->result != 0 && s->in_len == 0 && s->out_len != 0 ? porf_z_eof(s) : 0;
}

static void porf_z_close(porf_z *s) {
  if (s->mode <= PORF_Z_UNZIP) {
    if (porf_z_deflating(s)) deflateEnd(&s->z);
      else inflateEnd(&s->z);
  }
  if (s->benc) BrotliEncoderDestroyInstance(s->benc);
  if (s->bdec) BrotliDecoderDestroyInstance(s->bdec);
  if (s->dctx) ZSTD_freeDCtx(s->dctx);
  free(s->dict);
  free(s);
}
`;

export const constants = {
  Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5,
  Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_MEM_ERROR: -4, Z_BUF_ERROR: -5, Z_VERSION_ERROR: -6,
  Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9, Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0,
  DEFLATE: 1, INFLATE: 2, GZIP: 3, GUNZIP: 4, DEFLATERAW: 5, INFLATERAW: 6, UNZIP: 7, BROTLI_DECODE: 8, BROTLI_ENCODE: 9, ZSTD_DECOMPRESS: 11,
  Z_MIN_WINDOWBITS: 8, Z_MAX_WINDOWBITS: 15, Z_DEFAULT_WINDOWBITS: 15, Z_MIN_CHUNK: 64, Z_MAX_CHUNK: Infinity, Z_DEFAULT_CHUNK: 16384,
  Z_MIN_MEMLEVEL: 1, Z_MAX_MEMLEVEL: 9, Z_DEFAULT_MEMLEVEL: 8, Z_MIN_LEVEL: -1, Z_MAX_LEVEL: 9, Z_DEFAULT_LEVEL: -1,
  BROTLI_OPERATION_PROCESS: 0, BROTLI_OPERATION_FLUSH: 1, BROTLI_OPERATION_FINISH: 2, BROTLI_OPERATION_EMIT_METADATA: 3,
  BROTLI_PARAM_MODE: 0, BROTLI_MODE_GENERIC: 0, BROTLI_MODE_TEXT: 1, BROTLI_MODE_FONT: 2, BROTLI_DEFAULT_MODE: 0,
  BROTLI_PARAM_QUALITY: 1, BROTLI_MIN_QUALITY: 0, BROTLI_MAX_QUALITY: 11, BROTLI_DEFAULT_QUALITY: 11,
  BROTLI_PARAM_LGWIN: 2, BROTLI_MIN_WINDOW_BITS: 10, BROTLI_MAX_WINDOW_BITS: 24, BROTLI_DEFAULT_WINDOW: 22, BROTLI_PARAM_SIZE_HINT: 5,
  ZSTD_e_continue: 0, ZSTD_e_flush: 1, ZSTD_e_end: 2, ZSTD_d_windowLogMax: 100
};
Object.freeze(constants);

const { Z_FINISH, Z_FULL_FLUSH, DEFLATE, INFLATE, GZIP, GUNZIP, DEFLATERAW, INFLATERAW, UNZIP, BROTLI_DECODE, BROTLI_ENCODE, ZSTD_DECOMPRESS } = constants;

// strings, views and array buffers as a Buffer
const toBuffer = data => typeof data === 'string' ? Buffer.from(data) : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data);

const setParam = (ctx, key, value) => {
  let ok = 0;
  Porffor.c`{
  porf_z *s = (porf_z*)(u64)porf_jv_val(ctx);
  if (s->mode == PORF_Z_ZSTD_DECOMPRESS) ok = !ZSTD_isError(ZSTD_DCtx_setParameter(s->dctx, (ZSTD_dParameter)porf_jv_val(key), (i32)porf_jv_val(value)));
    else if (s->mode == PORF_Z_BROTLI_ENCODE) ok = BrotliEncoderSetParameter(s->benc, (BrotliEncoderParameter)porf_jv_val(key), porf_jv_ptr(value));
    else ok = BrotliDecoderSetParameter(s->bdec, (BrotliDecoderParameter)porf_jv_val(key), porf_jv_ptr(value));
}`;
  return ok === 1;
};

// brotli and zstd parameters by numeric key
const applyParams = (ctx, params) => {
  for (const key of Object.keys(params)) {
    if (!setParam(ctx, +key, +params[key])) throw errZlibInitializationFailed();
  }
};

const newContext = (mode, opts) => {
  let windowBits = opts?.windowBits || (mode === INFLATE || mode === GUNZIP || mode === UNZIP ? 0 : 15);
  // zlib rejects 8 for raw deflate
  if (mode === DEFLATERAW && windowBits === 8) windowBits = 9;
  const level = opts?.level ?? -1, memLevel = opts?.memLevel ?? 8, strategy = opts?.strategy ?? 0;
  const dictionary = opts?.dictionary === undefined ? Buffer.alloc(0) : toBuffer(opts.dictionary), length = dictionary.byteLength;
  let ctx = 0;
  Porffor.c`{
  porf_z *s = calloc(1, sizeof(porf_z));
  s->mode = (i32)porf_jv_val(mode);
  s->dict_len = (size_t)porf_jv_val(length);
  s->dict = malloc(s->dict_len + 1);
  memcpy(s->dict, porf_node_u8(dictionary), s->dict_len);
  if (s->mode == PORF_Z_ZSTD_DECOMPRESS) {
    s->dctx = ZSTD_createDCtx();
  } else if (s->mode >= PORF_Z_BROTLI_DECODE) {
    porf_z_brotli_init(s);
  } else {
    i32 bits = (i32)porf_jv_val(windowBits);
    if (s->mode == PORF_Z_GZIP || s->mode == PORF_Z_GUNZIP) bits += 16;
    if (s->mode == PORF_Z_UNZIP) bits += 32;
    if (s->mode == PORF_Z_DEFLATERAW || s->mode == PORF_Z_INFLATERAW) bits = -bits;
    s->err = porf_z_deflating(s) ? deflateInit2(&s->z, (i32)porf_jv_val(level), Z_DEFLATED, bits, (i32)porf_jv_val(memLevel), (i32)porf_jv_val(strategy)) : inflateInit2(&s->z, bits);
    if (s->err == Z_OK) s->err = porf_z_dict(s);
    if (s->err != Z_OK) {
      porf_z_close(s);
      s = NULL;
    }
  }
  ctx = (f64)(u64)s;
}`;
  if (!ctx) throw errZlibInitializationFailed();
  applyParams(ctx, opts?.params ?? {});
  return ctx;
};

const setBuffers = (ctx, flush, input, inOff, inLen, output, outOff, outLen) => {
  Porffor.c`{
  porf_z *s = (porf_z*)(u64)porf_jv_val(ctx);
  s->flush = (i32)porf_jv_val(flush);
  s->in = (const u8*)porf_node_u8(input) + (size_t)porf_jv_val(inOff);
  s->in_len = (size_t)porf_jv_val(inLen);
  s->out = (u8*)porf_node_u8(output) + (size_t)porf_jv_val(outOff);
  s->out_len = (size_t)porf_jv_val(outLen);
}`;
};

const runContext = ctx => {
  Porffor.c`porf_z_run((porf_z*)(u64)porf_jv_val(ctx));`;
};

const resetContext = ctx => {
  Porffor.c`porf_z_reset((porf_z*)(u64)porf_jv_val(ctx));`;
};

const closeContext = ctx => {
  Porffor.c`porf_z_close((porf_z*)(u64)porf_jv_val(ctx));`;
};

const getRunPointer = () => {
  let p = 0;
  Porffor.c`p = (f64)(u64)&porf_z_run;`;
  return p;
};
const runPointer = getRunPointer();

// the run's error, else null with the input and output space left stored
const readResult = self => {
  const ctx = self._handle.ctx;
  let errnum = 0, message, code, availIn = 0, availOut = 0;
  Porffor.c`{
  porf_z *s = (porf_z*)(u64)porf_jv_val(ctx);
  errnum = porf_z_error(s);
  if (errnum) {
    message = porf_bstr_of(s->msg, strlen(s->msg));
    code = porf_bstr_of(s->code, strlen(s->code));
  }
  availIn = (f64)s->in_len;
  availOut = (f64)s->out_len;
}`;
  self._availIn = availIn;
  self._availOut = availOut;
  if (!errnum) return null;
  const err = new Error(message);
  err.errno = errnum;
  err.code = code;
  return err;
};

const kFlushFlag = Symbol('kFlushFlag');

// empty buffers tagged with a flush kind, written to flush
const flushBuffers = [];
for (let flag = 0; flag <= 5; flag++) {
  flushBuffers[flag] = Buffer.alloc(0);
  flushBuffers[flag][kFlushFlag] = flag;
}

// rank of each flush flag, from no flush up to finish
const flushiness = [ 0, 2, 3, 4, 5, 1 ];

class ZlibBase extends Transform {
  constructor(opts, mode) {
    const ctx = newContext(mode, opts);
    super({ autoDestroy: true, ...opts, encoding: null, objectMode: false, writableObjectMode: false, decodeStrings: true });
    const zlib = mode <= UNZIP;
    this.bytesWritten = 0;
    // like node's native handle: minizlib swaps its close out around sync writes
    this._handle = {
      ctx,
      close() {
        if (this.ctx) closeContext(this.ctx);
        this.ctx = 0;
      }
    };
    this._params = opts?.params ?? {};
    this._chunkSize = opts?.chunkSize ?? 16384;
    this._outBuffer = Buffer.allocUnsafe(this._chunkSize);
    this._outOffset = 0;
    this._defaultFlushFlag = opts?.flush ?? 0;
    this._finishFlushFlag = opts?.finishFlush ?? (zlib ? Z_FINISH : 2);
    this._defaultFullFlushFlag = zlib ? Z_FULL_FLUSH : 1;
    this._writing = false;
    this._pendingClose = false;
  }

  reset() {
    resetContext(this._handle.ctx);
    applyParams(this._handle.ctx, this._params);
  }

  flush(kind, callback) {
    if (typeof kind === 'function') {
      callback = kind;
      kind = undefined;
    }
    kind ??= this._defaultFullFlushFlag;
    if (this.writableFinished) {
      if (callback) nextTick(callback);
    } else if (this.writableEnded) {
      if (callback) this.once('end', callback);
    } else {
      this.write(flushBuffers[kind], '', callback);
    }
  }

  close(callback) {
    if (callback) finished(this, callback);
    this.destroy();
  }

  _destroy(err, callback) {
    closeEngine(this);
    callback(err);
  }

  _final(callback) {
    callback();
  }

  _flush(callback) {
    this._transform(Buffer.alloc(0), '', callback);
  }

  _transform(chunk, encoding, callback) {
    let flushFlag = chunk[kFlushFlag] ?? this._defaultFlushFlag;
    // the last chunk of an ended stream gets at least the finish flush
    if (this.writableEnded && this.writableLength === chunk.byteLength && flushiness[this._finishFlushFlag] > flushiness[flushFlag]) flushFlag = this._finishFlushFlag;
    processChunk(this, chunk, flushFlag, callback);
  }

  _processChunk(chunk, flushFlag, callback) {
    if (typeof callback === 'function') processChunk(this, chunk, flushFlag, callback);
      else return processChunkSync(this, chunk, flushFlag);
  }
}

const closeEngine = self => {
  if (self._writing) {
    self._pendingClose = true;
    return;
  }
  self._handle?.close();
  self._handle = null;
};

const processChunk = (self, chunk, flushFlag, callback) => {
  if (!self._handle) return nextTick(callback);
  self._chunk = chunk;
  self._callback = callback;
  self._flushFlag = flushFlag;
  self._inOff = 0;
  write(self, chunk.byteLength);
};

// runs the context on the thread pool over the rest of the chunk
const write = (self, availIn) => {
  const ctx = self._handle.ctx;
  self._availInBefore = availIn;
  self._availOutBefore = self._chunkSize - self._outOffset;
  setBuffers(ctx, self._flushFlag, self._chunk, self._inOff, availIn, self._outBuffer, self._outOffset, self._availOutBefore);
  self._writing = true;
  if (!queueWork(runPointer, ctx, () => afterWrite(self))) {
    setImmediate(() => {
      runContext(ctx);
      afterWrite(self);
    });
  }
};

const afterWrite = self => {
  self._writing = false;
  const err = readResult(self);
  if (err) self.destroy(err);
    else processResult(self);
  if (self._pendingClose) closeEngine(self);
};

const processResult = self => {
  const callback = self._callback;
  if (self.destroyed) {
    self._chunk = null;
    return callback();
  }

  const inDelta = self._availInBefore - self._availIn;
  self.bytesWritten += inDelta;
  const have = self._availOutBefore - self._availOut;
  let full = false;
  if (have > 0) {
    full = !self.push(self._outBuffer.slice(self._outOffset, self._outOffset + have));
    self._outOffset += have;
  }
  if (self.destroyed) return callback();

  if (self._availOut === 0 || self._outOffset >= self._chunkSize) {
    self._outOffset = 0;
    self._outBuffer = Buffer.allocUnsafe(self._chunkSize);
  }

  if (self._availOut === 0) {
    // more output to come: write again now, or once the readable side wants more
    self._inOff += inDelta;
    if (!full) {
      write(self, self._availIn);
    } else {
      const read = self._read;
      self._read = n => {
        self._read = read;
        write(self, self._availIn);
        self._read(n);
      };
    }
    return;
  }

  // input left over after the end of the stream
  if (self._availIn > 0) self.push(null);
  self._chunk = null;
  callback();
};

const processChunkSync = (self, chunk, flushFlag) => {
  const ctx = self._handle.ctx, chunkSize = self._chunkSize, buffers = [];
  let buffer = self._outBuffer, offset = self._outOffset, inOff = 0, availIn = chunk.byteLength;
  for (;;) {
    const availOutBefore = chunkSize - offset;
    setBuffers(ctx, flushFlag, chunk, inOff, availIn, buffer, offset, availOutBefore);
    runContext(ctx);
    const err = readResult(self);
    if (err) {
      closeEngine(self);
      throw err;
    }

    const have = availOutBefore - self._availOut;
    if (have > 0) {
      buffers.push(buffer.slice(offset, offset + have));
      offset += have;
    }
    inOff += availIn - self._availIn;
    availIn = self._availIn;
    if (self._availOut !== 0) break;
    buffer = Buffer.allocUnsafe(chunkSize);
    offset = 0;
  }
  self.bytesWritten = inOff;
  closeEngine(self);
  return buffers.length === 1 ? buffers[0] : Buffer.concat(buffers);
};

const zlibClass = (name, mode) => {
  const cls = class extends ZlibBase {
    constructor(opts) {
      super(opts, mode);
    }
  };
  Object.defineProperty(cls, 'name', { value: name });
  return cls;
};

export const Deflate = zlibClass('Deflate', DEFLATE);
export const Inflate = zlibClass('Inflate', INFLATE);
export const Gzip = zlibClass('Gzip', GZIP);
export const Gunzip = zlibClass('Gunzip', GUNZIP);
export const DeflateRaw = zlibClass('DeflateRaw', DEFLATERAW);
export const InflateRaw = zlibClass('InflateRaw', INFLATERAW);
export const Unzip = zlibClass('Unzip', UNZIP);
export const BrotliCompress = zlibClass('BrotliCompress', BROTLI_ENCODE);
export const BrotliDecompress = zlibClass('BrotliDecompress', BROTLI_DECODE);
export const ZstdDecompress = zlibClass('ZstdDecompress', ZSTD_DECOMPRESS);

const zlibAsync = (ctor, buffer, opts, callback) => {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  validateFunction(callback, 'callback');
  const engine = new ctor(opts), buffers = [];
  engine.on('data', chunk => buffers.push(chunk));
  engine.on('error', callback);
  engine.on('end', () => {
    engine.close();
    callback(null, Buffer.concat(buffers));
  });
  engine.end(toBuffer(buffer));
};

const zlibSync = (ctor, buffer, opts) => {
  const engine = new ctor(opts);
  return processChunkSync(engine, toBuffer(buffer), engine._finishFlushFlag);
};

export const crc32 = (data, value = 0) => {
  const bytes = toBuffer(data), length = bytes.byteLength;
  let out = 0;
  Porffor.c`out = (f64)crc32((uLong)porf_jv_val(value), (const Bytef*)porf_node_u8(bytes), (uInt)porf_jv_val(length));`;
  return out;
};

export const deflate = (buffer, opts, callback) => zlibAsync(Deflate, buffer, opts, callback);
export const inflate = (buffer, opts, callback) => zlibAsync(Inflate, buffer, opts, callback);
export const deflateRaw = (buffer, opts, callback) => zlibAsync(DeflateRaw, buffer, opts, callback);
export const inflateRaw = (buffer, opts, callback) => zlibAsync(InflateRaw, buffer, opts, callback);
export const gzip = (buffer, opts, callback) => zlibAsync(Gzip, buffer, opts, callback);
export const gunzip = (buffer, opts, callback) => zlibAsync(Gunzip, buffer, opts, callback);
export const unzip = (buffer, opts, callback) => zlibAsync(Unzip, buffer, opts, callback);
export const brotliCompress = (buffer, opts, callback) => zlibAsync(BrotliCompress, buffer, opts, callback);
export const brotliDecompress = (buffer, opts, callback) => zlibAsync(BrotliDecompress, buffer, opts, callback);
export const zstdDecompress = (buffer, opts, callback) => zlibAsync(ZstdDecompress, buffer, opts, callback);
export const deflateSync = (buffer, opts) => zlibSync(Deflate, buffer, opts);
export const inflateSync = (buffer, opts) => zlibSync(Inflate, buffer, opts);
export const deflateRawSync = (buffer, opts) => zlibSync(DeflateRaw, buffer, opts);
export const inflateRawSync = (buffer, opts) => zlibSync(InflateRaw, buffer, opts);
export const gzipSync = (buffer, opts) => zlibSync(Gzip, buffer, opts);
export const gunzipSync = (buffer, opts) => zlibSync(Gunzip, buffer, opts);
export const unzipSync = (buffer, opts) => zlibSync(Unzip, buffer, opts);
export const brotliCompressSync = (buffer, opts) => zlibSync(BrotliCompress, buffer, opts);
export const brotliDecompressSync = (buffer, opts) => zlibSync(BrotliDecompress, buffer, opts);
export const zstdDecompressSync = (buffer, opts) => zlibSync(ZstdDecompress, buffer, opts);

export const createDeflate = options => new Deflate(options);
export const createInflate = options => new Inflate(options);
export const createDeflateRaw = options => new DeflateRaw(options);
export const createInflateRaw = options => new InflateRaw(options);
export const createGzip = options => new Gzip(options);
export const createGunzip = options => new Gunzip(options);
export const createUnzip = options => new Unzip(options);
export const createBrotliCompress = options => new BrotliCompress(options);
export const createBrotliDecompress = options => new BrotliDecompress(options);
export const createZstdDecompress = options => new ZstdDecompress(options);

const zlib = {
  constants, crc32, Deflate, Inflate, Gzip, Gunzip, DeflateRaw, InflateRaw, Unzip, BrotliCompress, BrotliDecompress, ZstdDecompress,
  deflate, inflate, deflateRaw, inflateRaw, gzip, gunzip, unzip, brotliCompress, brotliDecompress, zstdDecompress,
  deflateSync, inflateSync, deflateRawSync, inflateRawSync, gzipSync, gunzipSync, unzipSync, brotliCompressSync, brotliDecompressSync, zstdDecompressSync,
  createDeflate, createInflate, createDeflateRaw, createInflateRaw,
  createGzip, createGunzip, createUnzip, createBrotliCompress, createBrotliDecompress, createZstdDecompress
};
for (const key of Object.keys(constants)) {
  if (key.startsWith('Z_')) Object.defineProperty(zlib, key, { value: constants[key] });
}

export default zlib;
