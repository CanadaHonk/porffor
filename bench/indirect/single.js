const run = (func) => {
  for (let i = 0; i < 10_000_000; i++) {
    func(i);
  }
}

let t = performance.now();
run((b) => b);
let t2 = performance.now()

console.log("single arg indirect", (t2 - t).toFixed(2) + "ms")