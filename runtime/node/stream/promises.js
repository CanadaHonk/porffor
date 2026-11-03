import { pipelineImpl } from '../internal/streams/pipeline.js';
import { finished } from '../internal/streams/end-of-stream.js';
import { isIterable, isNodeStream, isTransformStream, isWritableStream } from '../internal/streams/utils.js';

export const pipeline = (...streams) => new Promise((resolve, reject) => {
  let options;
  const last = streams[streams.length - 1];
  if (last && typeof last === 'object' && !isNodeStream(last) && !isIterable(last) && !isWritableStream(last) && !isTransformStream(last)) options = streams.pop();
  const stages = streams.length === 1 && Array.isArray(streams[0]) ? streams[0] : streams;

  const stream = pipelineImpl(stages, (err, value) => err ? reject(err) : resolve(value), options);
  // a function as the last stage leaves nothing to consume the passthrough
  if (typeof stages[stages.length - 1] === 'function' && stream.readable) stream.resume();
});

export { finished };
export default { finished, pipeline };
