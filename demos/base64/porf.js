let arg1 = '';
let decode = false;
let file = 0;
if (Porffor.readArgv(1, arg1) == -1) {
  // no argv[1], read from stdin and encode
} else {
  if (arg1 == '-d' || arg1 == '--decode') {
    decode = true;

    Porffor.readArgv(2, file);
  } else {
    file = arg1;

    let arg2 = '';
    Porffor.readArgv(2, arg2);
    if (arg2 == '-d' || arg2 == '--decode') {
      decode = true;
    }
  }
}

let out = '';
if (Porffor.readFile(file, out) == -1) {
  console.log('error reading file:', file);
} else {
  if (decode) {
    // no trailing newline for decode
    Porffor.print(atob(file == 0 ? out.slice(0, -1) : out));
  } else {
    console.log(btoa(out));
  }
}