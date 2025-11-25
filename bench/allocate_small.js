let t = performance.now();
for (let i = 0; i < 4_000_000; i++) {
  new ArrayBuffer(128);
}
console.log(performance.now() - t);