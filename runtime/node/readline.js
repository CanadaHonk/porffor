import process from './process.js';
import { EventEmitter } from './events.js';
import { StringDecoder } from './string_decoder.js';
import { setTimeout, clearTimeout } from './timers.js';
import { stripVTControlCharacters } from './internal/inspect.js';
import { abortError, errUseAfterClose } from './internal/errors.js';
import { clearLine, clearScreenDown, cursorTo, moveCursor } from './internal/readline/callbacks.js';

// \r\n, \n, \r not followed by \n, line separator or paragraph separator
const lineEnding = /\r?\n|\r(?!\n)|\u2028|\u2029/g;

// escape sequence codes (xterm, gnome, rxvt, putty, cygwin) -> key names
const keyNames = {
  __proto__: null,
  '[P': 'f1', '[Q': 'f2', '[R': 'f3', '[S': 'f4', 'OP': 'f1', 'OQ': 'f2',
  'OR': 'f3', 'OS': 'f4', '[11~': 'f1', '[12~': 'f2', '[13~': 'f3', '[14~': 'f4',
  '[200~': 'paste-start', '[201~': 'paste-end', '[[A': 'f1', '[[B': 'f2', '[[C': 'f3', '[[D': 'f4',
  '[[E': 'f5', '[15~': 'f5', '[17~': 'f6', '[18~': 'f7', '[19~': 'f8', '[20~': 'f9',
  '[21~': 'f10', '[23~': 'f11', '[24~': 'f12', '[A': 'up', '[B': 'down', '[C': 'right',
  '[D': 'left', '[E': 'clear', '[F': 'end', '[H': 'home', 'OA': 'up', 'OB': 'down',
  'OC': 'right', 'OD': 'left', 'OE': 'clear', 'OF': 'end', 'OH': 'home', '[1~': 'home',
  '[2~': 'insert', '[3~': 'delete', '[4~': 'end', '[5~': 'pageup', '[6~': 'pagedown', '[[5~': 'pageup',
  '[[6~': 'pagedown', '[7~': 'home', '[8~': 'end'
};
const shiftKeyNames = {
  __proto__: null,
  '[a': 'up', '[b': 'down', '[c': 'right', '[d': 'left', '[e': 'clear', '[2$': 'insert',
  '[3$': 'delete', '[5$': 'pageup', '[6$': 'pagedown', '[7$': 'home', '[8$': 'end', '[Z': 'tab'
};
const ctrlKeyNames = {
  __proto__: null,
  'Oa': 'up', 'Ob': 'down', 'Oc': 'right', 'Od': 'left', 'Oe': 'clear', '[2^': 'insert',
  '[3^': 'delete', '[5^': 'pageup', '[6^': 'pagedown', '[7^': 'home', '[8^': 'end'
};

const charLengthAt = (str, i) => str.length <= i || str.codePointAt(i) < 0x10000 ? 1 : 2;
const charLengthLeft = (str, i) => i <= 0 ? 0 : (i > 1 && str.codePointAt(i - 2) >= 0x10000) || str.codePointAt(i - 1) >= 0x10000 ? 2 : 1;

// terminal key escape codes, modifier is 1 + shift + left_alt * 2 + ctrl * 4 + right_alt * 8
function* emitKeys(stream) {
  while (true) {
    let ch = yield;
    let s = ch;
    let escaped = false;
    const key = { sequence: null, name: undefined, ctrl: false, meta: false, shift: false };

    if (ch === '\x1b') {
      escaped = true;
      s += (ch = yield);
      if (ch === '\x1b') s += (ch = yield);
    }

    if (escaped && (ch === 'O' || ch === '[')) {
      let code = ch;
      let modifier = 0;

      if (ch === 'O') {
        s += (ch = yield);
        if (ch >= '0' && ch <= '9') {
          modifier = (ch >> 0) - 1;
          s += (ch = yield);
        }
        code += ch;
      } else {
        s += (ch = yield);
        if (ch === '[') {
          code += ch;
          s += (ch = yield);
        }

        // buffer just enough for \x1b[24;5~ or \x1b[1;5H style sequences
        const cmdStart = s.length - 1;
        if (ch >= '0' && ch <= '9') {
          s += (ch = yield);
          if (ch >= '0' && ch <= '9') {
            s += (ch = yield);
            if (ch >= '0' && ch <= '9') s += (ch = yield);
          }
        }

        if (ch === ';') {
          s += (ch = yield);
          if (ch >= '0' && ch <= '9') s += yield;
        }

        const cmd = s.slice(cmdStart);
        let match;
        if ((match = /^(?:(\d\d?)(?:;(\d))?([~^$])|(\d{3}~))$/.exec(cmd))) {
          if (match[4]) {
            code += match[4];
          } else {
            code += match[1] + match[3];
            modifier = (match[2] || 1) - 1;
          }
        } else if ((match = /^((\d;)?(\d))?([A-Za-z])$/.exec(cmd))) {
          code += match[4];
          modifier = (match[3] || 1) - 1;
        } else {
          code += cmd;
        }
      }

      key.ctrl = !!(modifier & 4);
      key.meta = !!(modifier & 10);
      key.shift = !!(modifier & 1);
      key.code = code;

      if (code in shiftKeyNames) {
        key.name = shiftKeyNames[code];
        key.shift = true;
      } else if (code in ctrlKeyNames) {
        key.name = ctrlKeyNames[code];
        key.ctrl = true;
      } else {
        key.name = keyNames[code] ?? 'undefined';
      }
    } else if (ch === '\r' || ch === '\n' || ch === '\t' || ch === '\b' || ch === '\x7f' || ch === '\x1b' || ch === ' ') {
      key.name = ch === '\r' ? 'return' : ch === '\n' ? 'enter' : ch === '\t' ? 'tab' : ch === '\x1b' ? 'escape' : ch === ' ' ? 'space' : 'backspace';
      key.meta = escaped;
    } else if (!escaped && ch <= '\x1a') {
      // ctrl+letter
      key.name = String.fromCharCode(ch.charCodeAt(0) + 96);
      key.ctrl = true;
    } else if (/^[0-9A-Za-z]$/.test(ch)) {
      key.name = ch.toLowerCase();
      key.shift = /^[A-Z]$/.test(ch);
      key.meta = escaped;
    } else if (escaped) {
      // escape sequence timeout
      key.name = ch.length ? undefined : 'escape';
      key.meta = true;
    }

    key.sequence = s;

    if (s.length !== 0 && (key.name !== undefined || escaped)) stream.emit('keypress', escaped ? undefined : s, key);
      else if (charLengthAt(s, 0) === s.length) stream.emit('keypress', s, key);
  }
}

const kKeypressDecoder = Symbol('keypress-decoder');

export function emitKeypressEvents(stream, iface = {}) {
  if (stream[kKeypressDecoder]) return;

  const decoder = stream[kKeypressDecoder] = new StringDecoder('utf8');
  let keys = emitKeys(stream);
  keys.next();
  let timeoutId;

  const onData = input => {
    if (stream.listenerCount('keypress') === 0) {
      stream.removeListener('data', onData);
      stream.on('newListener', onNewListener);
      return;
    }

    const string = decoder.write(input);
    if (!string) return;
    clearTimeout(timeoutId);
    // all but the last character of a chunk are pasted, not typed
    iface.isCompletionEnabled = false;
    let length = 0;
    for (const character of string) {
      length += character.length;
      if (length === string.length) iface.isCompletionEnabled = true;
      try {
        keys.next(character);
        // a lone escape at the end is the escape key unless more follows in time
        if (length === string.length && character === '\x1b') timeoutId = setTimeout(() => keys.next(''), iface.escapeCodeTimeout ?? 500);
      } catch (err) {
        // a throwing keypress listener kills the generator, restart it
        keys = emitKeys(stream);
        keys.next();
        throw err;
      }
    }
  };

  const onNewListener = event => {
    if (event !== 'keypress') return;
    stream.on('data', onData);
    stream.removeListener('newListener', onNewListener);
  };

  if (stream.listenerCount('keypress') > 0) stream.on('data', onData);
    else stream.on('newListener', onNewListener);
}

// east asian wide ranges, as node without icu
const isFullWidth = code => code >= 0x1100 && (
  code <= 0x115f || code === 0x2329 || code === 0x232a ||
  (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f) ||
  (code >= 0x3250 && code <= 0x4dbf) ||
  (code >= 0x4e00 && code <= 0xa4c6) ||
  (code >= 0xa960 && code <= 0xa97c) ||
  (code >= 0xac00 && code <= 0xd7a3) ||
  (code >= 0xf900 && code <= 0xfaff) ||
  (code >= 0xfe10 && code <= 0xfe19) ||
  (code >= 0xfe30 && code <= 0xfe6b) ||
  (code >= 0xff01 && code <= 0xff60) ||
  (code >= 0xffe0 && code <= 0xffe6) ||
  (code >= 0x1b000 && code <= 0x1b001) ||
  (code >= 0x1f200 && code <= 0x1f251) ||
  (code >= 0x1f300 && code <= 0x1f64f) ||
  (code >= 0x20000 && code <= 0x3fffd)
);

const isZeroWidth = code => code <= 0x1f ||
  (code >= 0x7f && code <= 0x9f) ||
  (code >= 0x300 && code <= 0x36f) ||
  (code >= 0x200b && code <= 0x200f) ||
  (code >= 0x20d0 && code <= 0x20ff) ||
  (code >= 0xfe00 && code <= 0xfe0f) ||
  (code >= 0xfe20 && code <= 0xfe2f) ||
  (code >= 0xe0100 && code <= 0xe01ef);

const charWidth = code => isFullWidth(code) ? 2 : isZeroWidth(code) ? 0 : 1;
const stringWidth = str => {
  let width = 0;
  for (const char of stripVTControlCharacters(str).normalize('NFC')) width += charWidth(char.codePointAt(0));
  return width;
};

// words are matched on the reversed string to avoid quadratic time
const wordLeftLength = str => /^\s*(?:[^\w\s]+|\w+)?/.exec(Array.from(str).reverse().join(''))[0].length;
const wordRightLength = str => /^(?:\s+|[^\w\s]+|\w+)\s*/.exec(str)[0].length;

export class Interface extends EventEmitter {
  constructor(input, output, completer, terminal) {
    super();
    let prompt = '> ', crlfDelay, historySize = 30;
    this.tabSize = 8;
    this.escapeCodeTimeout = 500;
    if (input?.input) {
      // an options object
      ({ output, completer, terminal } = input);
      if (input.prompt !== undefined) prompt = input.prompt;
      if (input.historySize !== undefined) historySize = input.historySize;
      if (input.tabSize !== undefined) this.tabSize = input.tabSize;
      if (input.escapeCodeTimeout !== undefined) this.escapeCodeTimeout = input.escapeCodeTimeout;
      crlfDelay = input.crlfDelay;
      input = input.input;
    }

    this.input = input;
    this.output = output;
    this.completer = completer;
    this.terminal = !!(terminal ?? output?.isTTY);
    this.crlfDelay = crlfDelay ? Math.max(100, crlfDelay) : 100;
    this.history = [];
    this.historySize = historySize;
    this.historyIndex = -1;
    this.line = '';
    this.cursor = 0;
    this.closed = false;
    this.paused = false;
    this._prompt = prompt;
    this._line_buffer = '';
    this._sawReturnAt = 0;
    this._previousKey = null;
    this._substringSearch = null;
    this.isCompletionEnabled = true;

    const onError = err => this.emit('error', err);
    input.on('error', onError);
    if (this.terminal) {
      const onKeypress = (s, key) => this._ttyWrite(s, key);
      const onEnd = () => {
        if (this.line.length > 0) this.emit('line', this.line);
        this.close();
      };
      const onResize = () => this._refreshLine();
      emitKeypressEvents(input, this);
      input.on('keypress', onKeypress);
      input.on('end', onEnd);
      output?.on('resize', onResize);
      this._setRawMode(true);
      this.once('close', () => {
        input.removeListener('keypress', onKeypress);
        input.removeListener('error', onError);
        input.removeListener('end', onEnd);
        output?.removeListener('resize', onResize);
      });
    } else {
      this._decoder = new StringDecoder('utf8');
      const onData = data => this._normalWrite(data);
      const onEnd = () => {
        if (this._line_buffer.length > 0) this.emit('line', this._line_buffer);
        this.close();
      };
      input.on('data', onData);
      input.on('end', onEnd);
      this.once('close', () => {
        input.removeListener('data', onData);
        input.removeListener('error', onError);
        input.removeListener('end', onEnd);
      });
    }
    input.resume();
  }

  get columns() {
    return this.output?.columns || Infinity;
  }

  setPrompt(prompt) {
    this._prompt = prompt;
  }

  getPrompt() {
    return this._prompt;
  }

  _setRawMode(mode) {
    if (typeof this.input.setRawMode === 'function') this.input.setRawMode(mode);
  }

  prompt(preserveCursor) {
    if (this.paused) this.resume();
    if (this.terminal && process.env.TERM !== 'dumb') {
      if (!preserveCursor) this.cursor = 0;
      this._refreshLine();
    } else {
      this._writeToOutput(this._prompt);
    }
  }

  question(query, options, cb) {
    this._question(query, typeof options === 'function' ? options : cb);
  }

  _question(query, cb) {
    if (this.closed) throw errUseAfterClose('readline');
    if (!this._questionCallback) {
      this._oldPrompt = this._prompt;
      this.setPrompt(query);
      this._questionCallback = cb;
    }
    this.prompt();
  }

  _onLine(line) {
    const cb = this._questionCallback;
    if (!cb) return this.emit('line', line);
    this._questionCallback = null;
    this.setPrompt(this._oldPrompt);
    cb(line);
  }

  _writeToOutput(string) {
    this.output?.write(string);
  }

  close() {
    if (this.closed) return;
    this.pause();
    if (this.terminal) this._setRawMode(false);
    this.closed = true;
    this.emit('close');
  }

  pause() {
    if (this.paused) return;
    this.input.pause();
    this.paused = true;
    this.emit('pause');
    return this;
  }

  resume() {
    if (!this.paused) return;
    this.input.resume();
    this.paused = false;
    this.emit('resume');
    return this;
  }

  write(data, key) {
    if (this.closed) throw errUseAfterClose('readline');
    if (this.paused) this.resume();
    if (this.terminal) this._ttyWrite(data, key);
      else this._normalWrite(data);
  }

  _normalWrite(data) {
    if (data === undefined) return;
    let string = this._decoder.write(data);
    if (this._sawReturnAt && Date.now() - this._sawReturnAt <= this.crlfDelay) {
      if (string[0] === '\n') string = string.slice(1);
      this._sawReturnAt = 0;
    }

    const lines = string.split(lineEnding);
    if (lines.length === 1) {
      // no line endings, save it for next time
      this._line_buffer += string;
      return;
    }
    this._sawReturnAt = string.endsWith('\r') ? Date.now() : 0;
    lines[0] = this._line_buffer + lines[0];
    this._line_buffer = lines.pop();
    for (const line of lines) this._onLine(line);
  }

  // display position of the end of str
  _getDisplayPos(str) {
    const columns = this.columns;
    let offset = 0, rows = 0;
    for (const char of stripVTControlCharacters(str)) {
      if (char === '\n') {
        rows += Math.ceil(offset / columns) || 1;
        offset = 0;
      } else if (char === '\t') {
        offset += this.tabSize - (offset % this.tabSize);
      } else {
        const width = charWidth(char.codePointAt(0));
        if (width === 2 && (offset + 1) % columns === 0) offset++;
        offset += width;
      }
    }
    const cols = offset % columns;
    return { cols, rows: rows + (offset - cols) / columns };
  }

  getCursorPos() {
    return this._getDisplayPos(this._prompt + this.line.slice(0, this.cursor));
  }

  _refreshLine() {
    const line = this._prompt + this.line;
    const end = this._getDisplayPos(line);
    const cursor = this.getCursorPos();

    if (this.prevRows > 0) moveCursor(this.output, 0, -this.prevRows);
    cursorTo(this.output, 0);
    clearScreenDown(this.output);
    this._writeToOutput(line);
    // force the terminal to allocate a new line
    if (end.cols === 0) this._writeToOutput(' ');

    cursorTo(this.output, cursor.cols);
    if (end.rows > cursor.rows) moveCursor(this.output, 0, cursor.rows - end.rows);
    this.prevRows = cursor.rows;
  }

  _insertString(c) {
    if (!this.isCompletionEnabled || this.cursor < this.line.length) {
      this.line = this.line.slice(0, this.cursor) + c + this.line.slice(this.cursor);
      this.cursor += c.length;
      if (this.isCompletionEnabled) this._refreshLine();
        else this._writeToOutput(c);
      return;
    }
    const oldRows = this.getCursorPos().rows;
    this.line += c;
    this.cursor += c.length;
    if (oldRows < this.getCursorPos().rows) this._refreshLine();
      else this._writeToOutput(c);
  }

  // moves the cursor dx places right (left for negative)
  _moveCursor(dx) {
    if (dx === 0) return;
    const oldPos = this.getCursorPos();
    this.cursor = Math.max(0, Math.min(this.line.length, this.cursor + dx));
    const newPos = this.getCursorPos();
    if (oldPos.rows === newPos.rows) moveCursor(this.output, newPos.cols - oldPos.cols, 0);
      else this._refreshLine();
  }

  _setLineAndCursor(line, cursor) {
    this.line = line;
    this.cursor = cursor;
    this._refreshLine();
  }

  _deleteLeft(n = charLengthLeft(this.line, this.cursor)) {
    if (this.cursor === 0) return;
    this._setLineAndCursor(this.line.slice(0, this.cursor - n) + this.line.slice(this.cursor), this.cursor - n);
  }

  _deleteRight(n = charLengthAt(this.line, this.cursor)) {
    if (this.cursor === this.line.length) return;
    this._setLineAndCursor(this.line.slice(0, this.cursor) + this.line.slice(this.cursor + n), this.cursor);
  }

  // only entries starting with what was before the cursor when browsing began
  _historyMove(dir) {
    if (this.history.length === 0 || this.historyIndex === (dir < 0 ? -1 : this.history.length)) return;
    const search = this._substringSearch ?? '';
    let index = this.historyIndex + dir;
    while (index >= 0 && index < this.history.length && (!this.history[index].startsWith(search) || this.history[index] === this.line)) index += dir;
    this.historyIndex = index;
    const line = index === -1 || index === this.history.length ? search : this.history[index];
    this._setLineAndCursor(line, line.length);
  }

  clearLine() {
    this._moveCursor(Infinity);
    this._writeToOutput('\r\n');
    this.line = '';
    this.cursor = 0;
    this.prevRows = 0;
  }

  _line() {
    const line = this.line;
    if (line.trim().length > 0 && this.historySize > 0 && line !== this.history[0]) {
      this.history.unshift(line);
      if (this.history.length > this.historySize) this.history.pop();
    }
    this.historyIndex = -1;
    this.clearLine();
    this._onLine(line);
  }

  async _tabComplete(lastKeypressWasTab) {
    this.pause();
    const string = this.line.slice(0, this.cursor);
    let completions, completeOn;
    try {
      [ completions, completeOn ] = await (this.completer.length === 2 ? new Promise((resolve, reject) => this.completer(string, (err, value) => err ? reject(err) : resolve(value))) : this.completer(string));
    } catch (err) {
      return this._writeToOutput(`Tab completion error: ${err}`);
    } finally {
      this.resume();
    }
    if (!completions || completions.length === 0) return;

    // apply the common prefix of all matches
    const sorted = completions.filter(x => x !== '').sort();
    const last = sorted.at(-1) ?? '';
    let prefix = sorted[0] ?? '';
    while (!last.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (prefix.length > completeOn.length && prefix.startsWith(completeOn)) return this._insertString(prefix.slice(completeOn.length));
    if (!completeOn.startsWith(prefix)) return this._setLineAndCursor(this.line.slice(0, this.cursor - completeOn.length) + prefix + this.line.slice(this.cursor), this.cursor - completeOn.length + prefix.length);
    if (!lastKeypressWasTab) return;

    // show completions in columns with 2 spaces of padding
    const widths = completions.map(stringWidth);
    const width = Math.max(...widths) + 2;
    let maxColumns = Math.floor(this.columns / width) || 1;
    if (maxColumns === Infinity) maxColumns = 1;
    let output = '\r\n', column = 0, whitespace = 0;
    for (let i = 0; i < completions.length; i++) {
      if (completions[i] === '' || column === maxColumns) {
        output += '\r\n';
        column = whitespace = 0;
      } else {
        output += ' '.repeat(whitespace);
      }
      if (completions[i] === '') {
        output += '\r\n';
        continue;
      }
      output += completions[i];
      whitespace = width - widths[i];
      column++;
    }
    if (column !== 0) output += '\r\n\r\n';
    this._writeToOutput(output);
    this._refreshLine();
  }

  _ttyWrite(s, key) {
    key ||= {};
    const previousKey = this._previousKey;
    this._previousKey = key;
    if ((key.name === 'up' || key.name === 'down') && !key.ctrl && !key.meta && !key.shift) {
      this._substringSearch ??= this.line.slice(0, this.cursor);
    } else if (this._substringSearch !== null) {
      this._substringSearch = null;
      if (this.historyIndex === this.history.length) this.historyIndex = -1;
    }
    if (key.name === 'escape') return;

    if (key.ctrl && key.shift) {
      if (key.name === 'backspace') this._deleteLeft(this.cursor);
        else if (key.name === 'delete') this._deleteRight(this.line.length - this.cursor);
    } else if (key.ctrl) {
      switch (key.name) {
        case 'c':
          if (this.listenerCount('SIGINT') > 0) return this.emit('SIGINT');
          this.close();
          this._questionReject?.(abortError(undefined, 'Aborted with Ctrl+C'));
          break;
        case 'd':
          // delete right or eof
          if (this.line.length !== 0) return this._deleteRight();
          this.close();
          this._questionReject?.(abortError(undefined, 'Aborted with Ctrl+D'));
          break;
        case 'h': this._deleteLeft(); break;
        case 'u': this._deleteLeft(this.cursor); break;
        case 'k': this._deleteRight(this.line.length - this.cursor); break;
        case 'a': this._moveCursor(-Infinity); break;
        case 'e': this._moveCursor(Infinity); break;
        case 'b': this._moveCursor(-charLengthLeft(this.line, this.cursor)); break;
        case 'f': this._moveCursor(charLengthAt(this.line, this.cursor)); break;
        case 'n': this._historyMove(-1); break;
        case 'p': this._historyMove(1); break;
        case 'w': case 'backspace': this._deleteLeft(wordLeftLength(this.line.slice(0, this.cursor))); break;
        case 'delete': this._deleteRight(wordRightLength(this.line.slice(this.cursor))); break;
        case 'left': this._moveCursor(-wordLeftLength(this.line.slice(0, this.cursor))); break;
        case 'right': this._moveCursor(wordRightLength(this.line.slice(this.cursor))); break;
        case 'l':
          cursorTo(this.output, 0, 0);
          clearScreenDown(this.output);
          this._refreshLine();
          break;
      }
    } else if (key.meta) {
      switch (key.name) {
        case 'b': this._moveCursor(-wordLeftLength(this.line.slice(0, this.cursor))); break;
        case 'f': this._moveCursor(wordRightLength(this.line.slice(this.cursor))); break;
        case 'd': case 'delete': this._deleteRight(wordRightLength(this.line.slice(this.cursor))); break;
        case 'backspace': this._deleteLeft(wordLeftLength(this.line.slice(0, this.cursor))); break;
      }
    } else {
      // \r bookkeeping only matters if a \n comes right after
      if (this._sawReturnAt && key.name !== 'enter') this._sawReturnAt = 0;
      switch (key.name) {
        case 'return':
          this._sawReturnAt = Date.now();
          this._line();
          break;
        case 'enter':
          if (this._sawReturnAt === 0 || Date.now() - this._sawReturnAt > this.crlfDelay) this._line();
          this._sawReturnAt = 0;
          break;
        case 'backspace': this._deleteLeft(); break;
        case 'delete': this._deleteRight(); break;
        case 'left': this._moveCursor(-charLengthLeft(this.line, this.cursor)); break;
        case 'right': this._moveCursor(charLengthAt(this.line, this.cursor)); break;
        case 'home': this._moveCursor(-Infinity); break;
        case 'end': this._moveCursor(Infinity); break;
        case 'up': this._historyMove(1); break;
        case 'down': this._historyMove(-1); break;
        case 'tab':
          if (typeof this.completer === 'function' && this.isCompletionEnabled) {
            this._tabComplete(previousKey?.name === 'tab');
            break;
          }
          // falls through
        default:
          if (typeof s === 'string' && s) this._insertLines(s);
      }
    }
  }

  // pasted text can hold whole lines
  _insertLines(s) {
    let lastIndex = 0;
    for (const match of s.matchAll(lineEnding)) {
      this._insertString(s.slice(lastIndex, match.index));
      lastIndex = match.index + match[0].length;
      this._line();
    }
    this._insertString(s.slice(lastIndex));
  }

  [Symbol.asyncIterator]() {
    const queue = [], waiting = [];
    let error = null, done = false;
    const settle = () => {
      done = true;
      while (waiting.length > 0) waiting.shift().resolve({ value: undefined, done: true });
    };
    this.on('line', line => {
      if (waiting.length > 0) return waiting.shift().resolve({ value: line, done: false });
      // stop reading while too many lines wait
      if (queue.push(line) > 1024) this.pause();
    });
    this.on('error', err => {
      if (waiting.length > 0) waiting.shift().reject(err);
        else error = err;
      settle();
    });
    this.on('close', settle);

    return {
      next: () => {
        if (queue.length > 0) {
          const value = queue.shift();
          if (queue.length === 0 && !this.closed) this.resume();
          return Promise.resolve({ value, done: false });
        }
        if (error) {
          const err = error;
          error = null;
          return Promise.reject(err);
        }
        if (done) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
}

export const createInterface = (input, output, completer, terminal) => new Interface(input, output, completer, terminal);

export { clearLine, clearScreenDown, cursorTo, moveCursor };

export default { Interface, createInterface, clearLine, clearScreenDown, cursorTo, emitKeypressEvents, moveCursor };
