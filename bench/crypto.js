let t = performance.now();

let i = 0;
while (i++ < 10_000_000) {
  crypto.randomUUID();
}

console.log(performance.now() - t);