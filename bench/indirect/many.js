const run = (func) => {
  for (let i = 0; i < 10_000_000; i++) {
    func(i,i,i,i,i);
  }
}

let t = performance.now();
run((b1,b2,b3,b4,b5) => b1);
let t2 = performance.now()

console.log("many arg indirect", (t2 - t).toFixed(2) + "ms")