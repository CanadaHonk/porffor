let t = performance.now();

let i = 0;
while (i < 100_000) {
  'abc'.isWellFormed() // true
  '🔥'.isWellFormed() // true
  '\uD83D'.isWellFormed() // false

  i += 1;
}

console.log(performance.now() - t);