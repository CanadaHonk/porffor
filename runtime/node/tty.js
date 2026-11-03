import './c-helpers.js';
import process, { isTTY, windowSize } from './process.js';
import { Socket } from './net.js';
import { cursorTo, moveCursor, clearLine, clearScreenDown } from './internal/readline/callbacks.js';
import { errnoError } from './internal/bytes.js';

Porffor.c`
#include <termios.h>
`;

export const isatty = fd => Number.isInteger(fd) && fd >= 0 && isTTY(fd);

// original termios per fd, restored when raw mode ends
Porffor.c`static struct termios porf_tty_orig[3];`;
const setRaw = (fd, raw) => {
  let err = 0;
  Porffor.c`{
  i32 f = (i32)porf_jv_val(fd);
  struct termios t;
  if (tcgetattr(f, &t) != 0) err = errno;
  else {
    if (porf_jv_val(raw) != 0) {
      if (f < 3) porf_tty_orig[f] = t;
      t.c_iflag &= ~(BRKINT | ICRNL | INPCK | ISTRIP | IXON);
      t.c_oflag |= ONLCR;
      t.c_cflag |= CS8;
      t.c_lflag &= ~(ECHO | ICANON | IEXTEN | ISIG);
      t.c_cc[VMIN] = 1;
      t.c_cc[VTIME] = 0;
    } else if (f < 3) t = porf_tty_orig[f];
    if (tcsetattr(f, TCSADRAIN, &t) != 0) err = errno;
  }
}`;
  return err;
};

export function ReadStream(fd, options) {
  if (!(this instanceof ReadStream)) return new ReadStream(fd, options);
  Socket.call(this, { ...options, fd, readable: true, writable: false });
  this.isRaw = false;
  this.isTTY = true;
}
Object.setPrototypeOf(ReadStream.prototype, Socket.prototype);
Object.setPrototypeOf(ReadStream, Socket);

ReadStream.prototype.setRawMode = function (flag) {
  flag = !!flag;
  // like libuv, an unchanged mode keeps the saved settings
  if (flag === this.isRaw) return this;
  const err = setRaw(this.fd ?? this._handle?.fd, flag);
  if (err) {
    this.emit('error', errnoError(err, 'setRawMode'));
    return this;
  }
  this.isRaw = flag;
  return this;
};

export function WriteStream(fd) {
  if (!(this instanceof WriteStream)) return new WriteStream(fd);
  Socket.call(this, { fd, readable: false, writable: true });
  this.fd = fd;
  this.isTTY = true;
  [ this.columns, this.rows ] = windowSize(fd);
}
Object.setPrototypeOf(WriteStream.prototype, Socket.prototype);
Object.setPrototypeOf(WriteStream, Socket);

const W = WriteStream.prototype;
W.cursorTo = function (x, y, callback) { return cursorTo(this, x, y, callback); };
W.moveCursor = function (dx, dy, callback) { return moveCursor(this, dx, dy, callback); };
W.clearLine = function (dir, callback) { return clearLine(this, dir, callback); };
W.clearScreenDown = function (callback) { return clearScreenDown(this, callback); };

// node's lib/internal/tty.js color detection
const COLORS_2 = 1, COLORS_16 = 4, COLORS_256 = 8, COLORS_16m = 24;
const TERM_ENVS = [ 'eterm', 'cons25', 'console', 'cygwin', 'dtterm', 'gnome', 'hurd', 'jfbterm', 'konsole', 'kterm', 'mlterm', 'mosh', 'putty', 'st', 'terminator', 'tmux', 'vt100', 'xterm' ];
const TERM_ENVS_REG_EXP = [ /ansi/, /color/, /linux/, /direct/, /^con[0-9]*x[0-9]/, /^rxvt/, /^screen/, /^xterm/, /^vt100/, /^vt220/ ];

W.getColorDepth = function (env = process.env) {
  if (env.FORCE_COLOR !== undefined) {
    switch (env.FORCE_COLOR) {
      case '': case '1': case 'true': return COLORS_16;
      case '2': return COLORS_256;
      case '3': return COLORS_16m;
      default: return COLORS_2;
    }
  }
  if (env.NODE_DISABLE_COLORS !== undefined || env.NO_COLOR !== undefined || env.TERM === 'dumb') return COLORS_2;
  if (env.TMUX) return COLORS_16m;
  if (env.CI) {
    if ([ 'APPVEYOR', 'BUILDKITE', 'CIRCLECI', 'DRONE', 'GITEA_ACTIONS', 'GITHUB_ACTIONS', 'GITLAB_CI', 'TRAVIS' ].some(name => name in env) || env.CI_NAME === 'codeship') return COLORS_256;
    return COLORS_2;
  }
  if ('TEAMCITY_VERSION' in env) return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? COLORS_16 : COLORS_2;
  switch (env.TERM_PROGRAM) {
    case 'iTerm.app':
      return !env.TERM_PROGRAM_VERSION || /^[0-2]\./.test(env.TERM_PROGRAM_VERSION) ? COLORS_256 : COLORS_16m;
    case 'HyperTerm': case 'MacTerm': return COLORS_16m;
    case 'Apple_Terminal': return COLORS_256;
  }
  if (env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return COLORS_16m;
  if (env.TERM) {
    if (/truecolor/.test(env.TERM)) return COLORS_16m;
    if (/^xterm-256/.test(env.TERM)) return COLORS_256;
    const term = env.TERM.toLowerCase();
    if (TERM_ENVS.includes(term) || TERM_ENVS_REG_EXP.some(x => x.test(term))) return COLORS_16;
  }
  return env.COLORTERM ? COLORS_16 : COLORS_2;
};

W.hasColors = function (count, env) {
  if (env === undefined && (count === undefined || (typeof count === 'object' && count !== null))) {
    env = count;
    count = 16;
  }
  return count <= 2 ** this.getColorDepth(env);
};

export default { isatty, ReadStream, WriteStream };
