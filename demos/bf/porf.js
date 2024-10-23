const interpret = str => {
  let ptr = 0;
  let memory = new Array(6000);
  memory.fill(0);

  let starts = [];

  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);

    if (c == 62) ptr++;
    if (c == 60) ptr--;

    if (c == 43) memory[ptr] += 1;
    if (c == 45) memory[ptr] -= 1;

    if (c == 46) printChar(memory[ptr]);

    if (c == 91) {
      starts.push(i);
      if (!memory[ptr]) {
        let depth = 1;
        while (depth != 0) {
          const c2 = str.charCodeAt(++i);
          if (c2 == 91) depth++;
          if (c2 == 93) depth--;
        }

        i--;
        continue;
      }
    }

    if (c == 93) {
      if (!memory[ptr]) {
        starts.pop();
        continue;
      }

      i = starts[starts.length - 1];
    }
  }
};

let file = '';
if (Porffor.readArgv(1, file) == -1) {
  Porffor.printStatic('usage: [brainf file to interpret]\n\n');

  const code = '>++++++++[-<+++++++++>]<.>>+>-[+]++>++>+++[>[->+++<<+++>]<<]>-----.>->+++..+++.>-.<<+[>[+>+]>>]<--------------.>>.+++.------.--------.>+.>+.';
  Porffor.printStatic('here is a hello world for example:\n');
  Porffor.printString(code);
  Porffor.printStatic('\n');

  interpret(code);
} else {
  let contents = '';
  if (Porffor.readFile(file, contents) == -1) {
    Porffor.printStatic('error reading file');
  } else {
    interpret(contents);
  }
}