import { nextTick } from '../loop.js';

const write = (stream, data, callback) => {
  if (stream == null || data === '') {
    if (typeof callback === 'function') nextTick(callback, null);
    return true;
  }
  return stream.write(data, callback);
};

export const cursorTo = (stream, x, y, callback) => {
  if (typeof y === 'function') {
    callback = y;
    y = undefined;
  }
  if (typeof x !== 'number') return write(null, '', callback);
  return write(stream, typeof y === 'number' ? `\x1b[${y + 1};${x + 1}H` : `\x1b[${x + 1}G`, callback);
};

export const moveCursor = (stream, dx, dy, callback) => {
  let data = '';
  if (dx < 0) data += `\x1b[${-dx}D`;
    else if (dx > 0) data += `\x1b[${dx}C`;
  if (dy < 0) data += `\x1b[${-dy}A`;
    else if (dy > 0) data += `\x1b[${dy}B`;
  return write(stream, data, callback);
};

// dir -1 clears left of the cursor, 1 right of it, 0 the whole line
export const clearLine = (stream, dir, callback) => write(stream, dir < 0 ? '\x1b[1K' : dir > 0 ? '\x1b[0K' : '\x1b[2K', callback);

export const clearScreenDown = (stream, callback) => write(stream, '\x1b[0J', callback);
