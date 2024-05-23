import process from 'node:process';
import fs from 'node:fs';

const printChar = i => process.stdout.write(String.fromCharCode(i));

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

let file = process.argv[2];
if (!file) {
  console.log('usage: [brainf file to interpret]\n');

  const code = '>++++++++[-<+++++++++>]<.>>+>-[+]++>++>+++[>[->+++<<+++>]<<]>-----.>->+++..+++.>-.<<+[>[+>+]>>]<--------------.>>.+++.------.--------.>+.>+.';
  console.log('here is a hello world for example:');
  console.log(code);

  interpret(code);
} else {
  let contents;
  try {
    contents = fs.readFileSync(file, 'utf8');
  } catch {
    console.log('error reading file:', file);
  }

  interpret(contents);
}