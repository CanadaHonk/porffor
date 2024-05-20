let file = '';
Porffor.readArgv(1, file);

let out = '';
Porffor.readFile(file, out);
Porffor.print(out);