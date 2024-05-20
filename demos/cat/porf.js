let file = '';
if (Porffor.readArgv(1, file) == -1) {
  console.log('please specify a file to read as an argument');
} else {
  let out = '';
  if (Porffor.readFile(file, out) == -1) {
    console.log('error reading file:', file);
  } else {
    Porffor.print(out);
  }
}