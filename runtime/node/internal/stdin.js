// a tty, pipe or socket stdin streams through libuv, a file stays process.js's
import process from '../process.js';
import { Socket } from '../net.js';
import { ReadStream } from '../tty.js';
import * as uv from './uv.js';

const type = uv.guessHandle(0);
export const stdin = type === 'TTY' ? new ReadStream(0) : type === 'PIPE' || type === 'TCP' ? new Socket({ fd: 0, readable: true, writable: false }) : process.stdin;

if (stdin !== process.stdin) {
  // like node, an unread stdin doesn't keep the process alive
  const stop = () => {
    uv.readStop(stdin._handle);
    stdin._reading = false;
    stdin._readableState.reading = false;
  };
  stop();
  stdin.fd = 0;
  const pause = stdin.pause;
  stdin.pause = function () {
    if (this._handle) stop();
    return pause.call(this);
  };
}
