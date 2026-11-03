import { nextTick } from '../loop.js';
import { addAbortListener } from '../../events.js';
import { AbortController } from '../event_target.js';
import { eos } from './end-of-stream.js';
import { destroyer } from './destroy.js';
import { PassThrough } from './transform.js';
import {
  abortError, aggregateTwoErrors, errInvalidArgType, errInvalidReturnValue, errMissingArgs, errStreamDestroyed, errStreamPrematureClose, errStreamUnableToPipe
} from '../errors.js';
import { isIterable, isNodeStream, isReadable, isReadableFinished, isReadableNodeStream, isTransformStream, isWritableStream } from './utils.js';

const pipeDestroyer = (stream, reading, writing) => {
  let finished = false;
  stream.on('close', () => {
    finished = true;
  });
  const cleanup = eos(stream, { readable: reading, writable: writing }, err => {
    finished = !err;
  });
  return {
    destroy: err => {
      if (finished) return;
      finished = true;
      destroyer(stream, err || errStreamDestroyed('pipe'));
    },
    cleanup
  };
};

// node readables, web readables and iterables are all async iterable
const toIterable = val => {
  if (isTransformStream(val)) val = val.readable;
  if (isIterable(val)) return val;
  throw errInvalidArgType('val', [ 'Readable', 'Iterable', 'AsyncIterable' ], val);
};

const pumpToNode = async (iterable, writable, finish, end) => {
  let error;
  let onresolve = null;

  const resume = err => {
    if (err) error = err;
    if (onresolve) {
      const callback = onresolve;
      onresolve = null;
      callback();
    }
  };

  const wait = () => new Promise((resolve, reject) => {
    if (error) {
      reject(error);
    } else {
      onresolve = () => {
        if (error) reject(error);
          else resolve();
      };
    }
  });

  writable.on('drain', resume);
  const cleanup = eos(writable, { readable: false }, resume);

  try {
    if (writable.writableNeedDrain) await wait();
    for await (const chunk of iterable) {
      if (!writable.write(chunk)) await wait();
    }
    if (end) {
      writable.end();
      await wait();
    }
    finish();
  } catch (err) {
    finish(error !== err ? aggregateTwoErrors(error, err) : err);
  } finally {
    cleanup();
    writable.off('drain', resume);
  }
};

const pumpToWeb = async (iterable, writable, finish, end) => {
  if (isTransformStream(writable)) writable = writable.writable;
  const writer = writable.getWriter();
  try {
    for await (const chunk of iterable) {
      await writer.ready;
      writer.write(chunk).catch(() => {});
    }
    await writer.ready;
    if (end) await writer.close();
    finish();
  } catch (err) {
    try {
      await writer.abort(err);
    } catch {}
    finish(err);
  }
};

// src is piped to dst with the ending done here, so errors and premature closes can be told apart
const pipe = (src, dst, finish, finishOnlyHandleError, end) => {
  let ended = false;
  dst.on('close', () => {
    if (!ended) finishOnlyHandleError(errStreamPrematureClose());
  });

  src.pipe(dst, { end: false });
  if (end) {
    const endFn = () => {
      ended = true;
      dst.end();
    };
    if (isReadableFinished(src)) nextTick(endFn);
      else src.once('end', endFn);
  } else {
    finish();
  }

  eos(src, { readable: true, writable: false }, err => {
    const r = src._readableState;
    if (err?.code === 'ERR_STREAM_PREMATURE_CLOSE' && r?.ended && !r.errored && !r.errorEmitted) src.once('end', finish).once('error', finish);
      else finish(err);
  });
  return eos(dst, { readable: false, writable: true }, finish);
};

export function pipeline(...streams) {
  const callback = streams.pop();
  if (typeof callback !== 'function') throw errInvalidArgType('streams[stream.length - 1]', 'Function', callback);
  let called = false;
  return pipelineImpl(streams, (err, value) => {
    if (called) return;
    called = true;
    callback(err, value);
  });
}

export function pipelineImpl(streams, callback, opts) {
  if (streams.length === 1 && Array.isArray(streams[0])) streams = streams[0];
  if (streams.length < 2) throw errMissingArgs('streams');

  const ac = new AbortController();
  const signal = ac.signal;
  const outerSignal = opts?.signal;
  const abort = () => {
    finishImpl(abortError(outerSignal.reason));
  };
  const disposable = outerSignal && addAbortListener(outerSignal, abort);

  let error;
  let value;
  const destroys = [];
  const lastStreamCleanup = [];
  let finishCount = 0;

  const finish = err => {
    finishImpl(err, --finishCount === 0);
  };

  const finishOnlyHandleError = err => {
    finishImpl(err, false);
  };

  const finishImpl = (err, final) => {
    if (err && (!error || error.code === 'ERR_STREAM_PREMATURE_CLOSE' || error.name === 'AbortError')) error = err;
    if (!error && !final) return;

    while (destroys.length) destroys.shift()(error);
    disposable?.[Symbol.dispose]();
    ac.abort();

    if (final) {
      if (!error) lastStreamCleanup.forEach(fn => fn());
      nextTick(callback, error, value);
    }
  };

  let ret;
  for (let i = 0; i < streams.length; i++) {
    const stream = streams[i];
    const reading = i < streams.length - 1;
    const writing = i > 0;
    const end = reading || opts?.end !== false;
    const isLastStream = i === streams.length - 1;

    if (isNodeStream(stream)) {
      const next = streams[i + 1];
      if (next?.closed || next?.destroyed) throw errStreamUnableToPipe();

      if (end) {
        const { destroy, cleanup } = pipeDestroyer(stream, reading, writing);
        destroys.push(destroy);
        if (isReadable(stream) && isLastStream) lastStreamCleanup.push(cleanup);
      }

      const onError = err => {
        if (err && err.name !== 'AbortError' && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') finishOnlyHandleError(err);
      };
      stream.on('error', onError);
      if (isReadable(stream) && isLastStream) lastStreamCleanup.push(() => stream.removeListener('error', onError));
    }

    if (i === 0) {
      if (typeof stream === 'function') {
        ret = stream({ signal });
        if (!isIterable(ret)) throw errInvalidReturnValue('Iterable, AsyncIterable or Stream', 'source', ret);
      } else if (isIterable(stream) || isReadableNodeStream(stream) || isTransformStream(stream)) {
        ret = stream;
      } else {
        throw errInvalidArgType('source', [ 'Stream', 'Iterable', 'AsyncIterable', 'Function' ], stream);
      }
    } else if (typeof stream === 'function') {
      ret = stream(toIterable(ret), { signal });

      if (reading) {
        if (!isIterable(ret, true)) throw errInvalidReturnValue('AsyncIterable', `transform[${i - 1}]`, ret);
      } else {
        // the last function's result is read through a passthrough, and its promise is the pipeline's value
        const pt = new PassThrough({ objectMode: true });
        finishCount++;
        if (typeof ret?.then === 'function') {
          ret.then(val => {
            value = val;
            if (val != null) pt.write(val);
            if (end) pt.end();
            nextTick(finish);
          }, err => {
            pt.destroy(err);
            nextTick(finish, err);
          });
        } else if (isIterable(ret, true) || isTransformStream(ret)) {
          pumpToNode(ret.readable || ret, pt, finish, end);
        } else {
          throw errInvalidReturnValue('AsyncIterable or Promise', 'destination', ret);
        }
        ret = pt;

        const { destroy, cleanup } = pipeDestroyer(ret, false, true);
        destroys.push(destroy);
        if (isLastStream) lastStreamCleanup.push(cleanup);
      }
    } else if (isNodeStream(stream)) {
      if (isReadableNodeStream(ret)) {
        finishCount += 2;
        const cleanup = pipe(ret, stream, finish, finishOnlyHandleError, end);
        if (isReadable(stream) && isLastStream) lastStreamCleanup.push(cleanup);
      } else {
        finishCount++;
        pumpToNode(toIterable(ret), stream, finish, end);
      }
      ret = stream;
    } else if (isWritableStream(stream) || isTransformStream(stream)) {
      finishCount++;
      pumpToWeb(toIterable(ret), stream, finish, end);
      ret = stream;
    } else {
      throw errInvalidArgType('destination', [ 'Stream', 'WritableStream', 'TransformStream', 'Function' ], stream);
    }
  }

  if (outerSignal?.aborted) nextTick(abort);
  return ret;
}
