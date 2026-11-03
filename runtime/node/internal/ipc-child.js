// a forked child's channel to its parent, linked by programs using process.send and co
import process from '../process.js';
import { setupChannel } from './ipc.js';
import * as uv from './uv.js';

// workers have their own
if (process.env.NODE_CHANNEL_FD && !process.env.PORFFOR_WORKER) {
  const handle = uv.pipeNew(0, 1);
  uv.pipeOpen(handle, +process.env.NODE_CHANNEL_FD);
  uv.unref(handle);
  const channel = setupChannel(process, handle, process.env.NODE_CHANNEL_SERIALIZATION_MODE);
  delete process.env.NODE_CHANNEL_FD;
  delete process.env.NODE_CHANNEL_SERIALIZATION_MODE;
  process.on('newListener', name => {
    if (name === 'message' || name === 'disconnect') channel.refCounted();
  });
  process.on('removeListener', name => {
    if (name === 'message' || name === 'disconnect') channel.unrefCounted();
  });
}

export const send = process.send, connected = process.connected, channel = process.channel, disconnect = process.disconnect;
