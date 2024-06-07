type i32 = number;
type bytestring = string;

const interpret = (str: bytestring) => {
  let ptr: i32 = 0;
  let memory: i32[] = new Array(8000);
  memory.fill(0);

  let starts: i32[] = [];

  for (let i: i32 = 0; i < str.length; i++) {
    const c: i32 = str.charCodeAt(i);

    if (c == 62) ptr++;
    if (c == 60) ptr--;

    if (c == 43) memory[ptr] += 1;
    if (c == 45) memory[ptr] -= 1;

    if (c == 46) printChar(memory[ptr]);

    if (c == 91) {
      starts.push(i);
      if (!memory[ptr]) {
        let depth: i32 = 1;
        while (depth != 0) {
          const c2: i32 = str.charCodeAt(++i);
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

let file = Porffor.allocatePage<bytestring>();
if (Porffor.readArgv(1, file) == -1) {
  console.log('usage: [brainf file to interpret]\n');

  const code: bytestring = '>++++++++[-<+++++++++>]<.>>+>-[+]++>++>+++[>[->+++<<+++>]<<]>-----.>->+++..+++.>-.<<+[>[+>+]>>]<--------------.>>.+++.------.--------.>+.>+.';
  console.log('here is a hello world for example:');
  console.log(code);

  interpret(code);
} else {
  let contents = Porffor.allocatePage<bytestring>();
  if (Porffor.readFile(file, contents) == -1) {
    console.log('error reading file:', file);
  } else {
    interpret(contents);
  }
}