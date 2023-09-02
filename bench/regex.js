let t = performance.now();

let i = 0;
while (i < 100_000) {
  /fox/.test('The quick brown fox jumps over the lazy dog');
  i += 1;
}

console.log(performance.now() - t);