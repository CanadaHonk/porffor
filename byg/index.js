import fs from 'node:fs';

const noAnsi = s => s.replace(/\u001b\[[0-9]+m/g, '');
const printLine = (line, number, breakpoint = false, current = false, selected = false) => {
  console.log(`\x1b[${breakpoint ? (selected ? '43' : '103') : (selected ? '47' : '100')}m\x1b[${selected || breakpoint ? '30' : '97'}m${number.toFixed(0).padStart(4, ' ')}\x1b[${breakpoint ? (selected ? '33' : '93') : (selected ? '37' : '90')}m\x1b[${current ? '47' : '40'}m▌ \x1b[${current ? '47' : '40'}m\x1b[${current ? '30' : '37'}m${current ? noAnsi(line) : line}\x1b[0K`);
};

const box = (x, y, width, height, title = '', content = [], color = ['90', '100', '37', '35', '45'], padding = true) => {
  if (padding) {
    width += 1;
    height += 1;

    // top
    process.stdout.write(`\x1b[48m\x1b[${y + 1};${x + 1}H\x1b[${color[0]}m` + '▄'.repeat(width));
    // bottom
    process.stdout.write(`\x1b[${y + height + 1};${x + 1}H▝` + '▀'.repeat(width - 1) + '▘');
    // left
    process.stdout.write(`\x1b[${y + 1};${x + 1}H▗` + '\x1b[1B\x1b[1D▐'.repeat(height - 1));
    // right
    process.stdout.write(`\x1b[${y + 1};${x + width + 1}H▖` + '\x1b[1B\x1b[1D▌'.repeat(height - 1));

    x += 1;
    y += 1;
    width -= 1;
    height -= 1;
  }

  // bg
  process.stdout.write(`\x1b[${y + 1};${x + 1}H\x1b[${color[1]}m` + ' '.repeat(width) + (`\x1b[1B\x1b[${width}D` + ' '.repeat(width)).repeat(Math.max(0, height - 1)));

  // title
  if (title) process.stdout.write(`\x1b[${y};${x}H\x1b[0m\x1b[${color[3]}m▐\x1b[${color[4]}m\x1b[${color[2]}m\x1b[1m${' '.repeat((width - title.length) / 2 | 0)}${title}${' '.repeat(width - (((width - title.length) / 2 | 0)) - title.length)}\x1b[0m\x1b[${color[3]}m▌`);

  // content
  process.stdout.write(`\x1b[${y + (title ? 1 : 1)};${x + 1}H\x1b[${color[1]}m\x1b[${color[2]}m${content.join(`\x1b[1B\x1b[${x + 1}G`)}`);
};

const controls = {
  'ret': 'resume  ',
  'b': 'breakpoint  ',
  's': 'step over',
  'i': 'step in',
  'o': 'step out  ',
};

const controlInfo = Object.keys(controls).reduce((acc, x, i) => acc + `\x1B[45m\x1B[97m${x}\x1b[105m\x1b[37m ${controls[x]}  `, '');
const plainControlInfo = noAnsi(controlInfo);

globalThis.termWidth = process.stdout.columns || 80;
globalThis.termHeight = process.stdout.rows || 24;

export default ({ lines, pause, breakpoint }) => {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', s => {
    // ctrl c
    if (s === '\u0003') {
      process.exit();
    }

    if (!paused) pause();
  });

  const stdin = fs.openSync('/dev/stdin', 'r+');
  const readCharSync = () => {
    const buffer = Buffer.alloc(1);
    fs.readSync(stdin, buffer, 0, 1);
    return buffer.toString('utf8');
  };

  const tooManyLines = lines.length > (termHeight - 1);
  const breakpoints = {};

  process.on('exit', () => {
    process.stdout.write('\x1b[0m');
  });

  console.clear();

  let paused = true;
  return (_paused, currentLine, text, boxes = []) => {
    paused = _paused;

    let scrollOffset = 0;
    let currentLinePos = currentLine;

    const draw = () => {
      console.clear();
      process.stdout.write(`\x1b[1;1H`);

      if (tooManyLines) {
        const edgePadding = (termHeight / 2) - 1;
        let beforePadding = currentLine - edgePadding;
        let afterPadding = currentLine + edgePadding + 1;

        if (beforePadding < 0) {
          afterPadding += Math.abs(beforePadding);
          beforePadding = 0;
        }

        beforePadding += scrollOffset;
        afterPadding += scrollOffset;

        if (afterPadding > lines.length) {
          beforePadding -= afterPadding - lines.length;
          afterPadding = lines.length;
        }

        for (let i = Math.max(0, beforePadding); i < Math.max(0, beforePadding) + (termHeight - 1); i++) {
          printLine(lines[i], i + 1, !!breakpoints[i], currentLine === i, currentLine + scrollOffset === i);
        }

        currentLinePos = currentLine - beforePadding;
      } else {
        for (let i = 0; i < lines.length; i++) {
          printLine(lines[i], i + 1, !!breakpoints[i], currentLine === i, currentLine + scrollOffset === i);
        }
      }

      for (const x of boxes) {
        const y = x.y({ currentLinePos });
        if (y < 0 || y >= termHeight) continue;

        box(x.x, y, x.width, x.height, x.title, x.content);
      }

      // text += ` | rss: ${(process.memoryUsage.rss() / 1024 / 1024).toFixed(2)}mb`;

      process.stdout.write(`\x1b[${termHeight};1H\x1b[105m\x1b[37m${text}${' '.repeat(termWidth - plainControlInfo.length - noAnsi(text).length - 1)}${controlInfo} \x1b[0m`);
    };

    draw();

    let lastSpecial = false;
    while (true) {
      const char = readCharSync();

      if (char === '[') {
        lastSpecial = true;
        continue;
      }

      switch (char.toLowerCase()) {
        case '\r': {
          paused = false;
          return 'resume';
        }

        case 's': {
          return 'stepOver';
        }

        case 'i': {
          return 'stepIn';
        }

        case 'o': {
          return 'stepOut';
        }

        case 'b': {
          if (!lastSpecial) {
            // b pressed normally
            breakpoints[currentLine + scrollOffset] = !breakpoints[currentLine + scrollOffset];
            draw();

            breakpoint(currentLine + scrollOffset, breakpoints[currentLine + scrollOffset]);
            break;
          }

          // arrow down
          if (scrollOffset < lines.length - currentLine - 1) scrollOffset++;
          draw();
          break;
        }

        case 'a': {
          if (!lastSpecial) break;

          // arrow up
          if (scrollOffset > -currentLine) scrollOffset--;
          draw();

          break;
        }

        case '5': {
          if (!lastSpecial) break;

          // page up
          scrollOffset -= Math.min(scrollOffset + currentLine, termHeight - 1);
          draw();
          break;
        }

        case '6': {
          if (!lastSpecial) break;

          // page down
          scrollOffset += Math.min(lines.length - (scrollOffset + currentLine) - 1, termHeight - 1);
          draw();
          break;
        }

        case 'q':
        case '\u0003': {
          process.exit();
        }
      }

      lastSpecial = false;
    }
  };
};