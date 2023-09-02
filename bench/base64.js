let t = performance.now();

var x = 0;
while (x < 100_000) { btoa("hello, world!"); x += 1 }

console.log(performance.now() - t);