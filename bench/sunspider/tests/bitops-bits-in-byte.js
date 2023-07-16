const start = performance.now();

function bitsinbyte(b) {
  let m = 1, c = 0;

  while (m < 0x100) {
    if (b & m) c++;
    m <<= 1;
  }

  return c;
}

function TimeFunc() {
  var sum = 0;
  for (let x = 0; x < 350; x++)
    for (let y = 0; y < 256; y++) sum += bitsinbyte(y);

  return sum;
}

let result = TimeFunc();
if (result != 358400) throw 'ERROR: bad result';

console.log(performance.now() - start);