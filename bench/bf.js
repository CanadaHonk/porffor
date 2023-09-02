// const print = i => process.stdout.write((i || 0).toString());
// const printChar = i => process.stdout.write(String.fromCharCode(i || 0));

const interpret = str => {
  str ??= '';

  let ptr = 0;
  let memory = [];

  let starts = [];

  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);

    if (c === 62) ptr++;
    if (c === 60) ptr--;

    if (c === 43) memory[ptr] = (memory[ptr] ?? 0) + 1;
    if (c === 45) memory[ptr] = (memory[ptr] ?? 0) - 1;

    if (c === 46) printChar(memory[ptr]);

    if (c === 91) {
      if (!memory[ptr]) {
        // skip to end of loop
        let depth = 1;
        while (depth !== 0) {
          const c2 = str.charCodeAt(++i);
          if (c2 === 91) depth++;
          if (c2 === 93) depth--;
        }

        i--;
        continue;
      }

      starts.push(i);
    }

    if (c === 93) {
      if (!memory[ptr]) {
        starts.pop();
        continue;
      }

      i = starts[starts.length - 1];
    }
  }
};

const t = performance.now();
interpret('++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.');
console.log(performance.now() - t);