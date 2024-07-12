let file = '';
if (Porffor.readArgv(1, file) == -1) {
  Porffor.printStatic('please specify a file to read as an argument');
} else {
  let out = '';
  if (Porffor.readFile(file, out) == -1) {
    Porffor.printStatic('error reading file');
  } else {
    Porffor.printString(out);
  }
}