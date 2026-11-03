import { errInvalidState } from '../errors.js';
import { ReadableStream, readableWantsMore } from './readablestream.js';
import { WritableStream } from './writablestream.js';

export class TransformStream {
  #readable;
  #writable;

  constructor(transformer = {}, writableStrategy = {}, readableStrategy = {}) {
    let readableController, writableController, controller, wakeWrite = null;
    const { promise: started, resolve: resolveStarted } = Promise.withResolvers();

    // errors from the transformer error both sides
    const fail = e => {
      controller.error(e);
      throw e;
    };

    this.#readable = new ReadableStream({
      start(c) {
        readableController = c;
        return started;
      },
      pull() {
        wakeWrite?.();
        wakeWrite = null;
      },
      cancel(reason) {
        writableController.error(reason);
        wakeWrite?.(Promise.reject(reason));
        wakeWrite = null;
        return transformer.cancel?.(reason);
      }
    }, { highWaterMark: readableStrategy.highWaterMark ?? 0, size: readableStrategy.size });

    this.#writable = new WritableStream({
      start(c) {
        writableController = c;
        return started;
      },
      write(chunk) {
        // wait for the readable side to want more
        const ready = readableWantsMore(readableController) ? Promise.resolve() : new Promise(resolve => wakeWrite = resolve);
        return ready.then(() => transformer.transform ? transformer.transform(chunk, controller) : controller.enqueue(chunk)).catch(fail);
      },
      close() {
        return new Promise(resolve => resolve(transformer.flush?.(controller))).then(() => {
          if (readableController.desiredSize !== null) readableController.close();
        }, fail);
      },
      abort(reason) {
        readableController.error(reason);
        return transformer.cancel?.(reason);
      }
    }, writableStrategy);

    controller = new TransformStreamDefaultController(readableController, writableController);
    resolveStarted(transformer.start?.(controller));
  }

  get readable() {
    return this.#readable;
  }

  get writable() {
    return this.#writable;
  }
}

export class TransformStreamDefaultController {
  #readable;
  #writable;

  constructor(readableController, writableController) {
    this.#readable = readableController;
    this.#writable = writableController;
  }

  get desiredSize() {
    return this.#readable.desiredSize;
  }

  enqueue(chunk) {
    this.#readable.enqueue(chunk);
  }

  error(e) {
    this.#readable.error(e);
    this.#writable.error(e);
  }

  terminate() {
    this.#readable.close();
    this.#writable.error(errInvalidState('TransformStream terminated', TypeError));
  }
}
