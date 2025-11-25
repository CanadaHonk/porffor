let t = performance.now();
for (let i = 0; i < 100_000; i++) {
  new ArrayBuffer(8192);
}
console.log(performance.now() - t);