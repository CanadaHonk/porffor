// const printChar = i => process.stdout.write(String.fromCharCode(i || 0));

const interpret = str => {
  let ptr = 0;
  let memory = new Array(8000);
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

// const t = performance.now();

let file = '';
Porffor.readArgv(1, file);

let contents = '';
Porffor.readFile(file, contents);
interpret(contents);

// printChar(10);
// console.log(performance.now() - t);