// node's ipc channel over a libuv ipc pipe: newline-delimited json messages
import process from '../process.js';
import { Buffer } from '../buffer.js';
import { nextTick } from './loop.js';
import { errIpcChannelClosed } from './errors.js';
import { encodeClone, decodeClone } from '../v8.js';
import * as uv from './uv.js';

// gives target (a ChildProcess, or process in a child) send/disconnect/connected/channel and 'message' events, NODE_* cmds as 'internalMessage'
export const setupChannel = (target, handle, serialization) => {
  const advanced = serialization === 'advanced';
  let pending = [], writes = 0, closeAfterWrites = false, refs = 0, refSet = false;
  const writeCallbacks = [];

  // the channel keeps the process alive while message/disconnect listeners want it
  const channel = {
    ref() {
      refSet = true;
      uv.ref(handle);
    },
    unref() {
      refSet = true;
      uv.unref(handle);
    },
    refCounted() {
      if (++refs === 1 && !refSet && target.channel) uv.ref(handle);
    },
    unrefCounted() {
      if (--refs === 0 && !refSet && target.channel) uv.unref(handle);
    }
  };

  const close = () => {
    target.channel = null;
    uv.readStop(handle);
    uv.close(handle);
  };

  const finishDisconnect = () => {
    target.connected = false;
    if (writes > 0) closeAfterWrites = true;
      else if (target.channel) close();
    nextTick(() => target.emit('disconnect'));
  };

  const onMessage = line => {
    let message = JSON.parse(line);
    if (advanced) message = decodeClone(message, [], [], true);
    const internal = typeof message?.cmd === 'string' && message.cmd.startsWith('NODE_');
    nextTick(() => target.emit(internal ? 'internalMessage' : 'message', message));
  };

  uv.setId(handle, uv.register((kind, status, data) => {
    if (kind === uv.READ) {
      if (status < 0) {
        if (target.connected) finishDisconnect();
        return;
      }
      // a message can span many reads
      for (let end; (end = data.indexOf(10)) !== -1;) {
        pending.push(data.subarray(0, end));
        const line = Buffer.concat(pending).toString();
        pending = [];
        data = data.subarray(end + 1);
        if (target.channel) onMessage(line);
      }
      if (data.length > 0) pending.push(data);
    } else if (kind === uv.WRITE) {
      writes--;
      writeCallbacks.shift()?.(status < 0 ? uv.uvException(status, 'write') : null);
      if (writes === 0 && closeAfterWrites && target.channel) close();
    }
  }));

  target.channel = channel;
  target.connected = true;

  target.send = (message, sendHandle, options, callback) => {
    if (typeof sendHandle === 'function') callback = sendHandle;
      else if (typeof options === 'function') callback = options;
    if (sendHandle != null && typeof sendHandle === 'object') throw new Error('porffor: sending handles over ipc is not supported');

    if (!target.connected) {
      const err = errIpcChannelClosed();
      if (typeof callback === 'function') nextTick(callback, err);
        else nextTick(() => target.emit('error', err));
      return false;
    }

    const bytes = Buffer.from(JSON.stringify(advanced ? encodeClone(message) : message) + '\n');
    const status = uv.write(handle, bytes, 0, bytes.length);
    if (status === 1) {
      writes++;
      writeCallbacks.push(callback);
    } else if (typeof callback === 'function') nextTick(callback, status < 0 ? uv.uvException(status, 'write') : null);
      else if (status < 0) nextTick(() => target.emit('error', uv.uvException(status, 'write')));
    return true;
  };

  target.disconnect = () => {
    if (target.connected) finishDisconnect();
  };

  uv.readStart(handle);
  return channel;
};
