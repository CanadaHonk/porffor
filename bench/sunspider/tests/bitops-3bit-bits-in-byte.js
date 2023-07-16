const start = performance.now();

function fast3bitlookup(b) {
  let bi3b = 0xE994; // 0b1110 1001 1001 0100; // 3 2 2 1  2 1 1 0
  let c  = 3 & (bi3b >> ((b << 1) & 14));
  c += 3 & (bi3b >> ((b >> 2) & 14));
  c += 3 & (bi3b >> ((b >> 5) & 6));
  return c;
}

function TimeFunc() {
  let sum = 0;

  for (let x = 0; x < 500; x++)
    for (let y = 0; y < 256; y++) sum += fast3bitlookup(y);

  return sum;
}

let result = TimeFunc();
if (result != 512000) throw 'ERROR: bad result';

console.log(performance.now() - start);