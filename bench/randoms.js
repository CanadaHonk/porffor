function randoms(max) {
  let sum = 0;
  for (let i = 0; i < max; i++) {
    sum += Math.random();
  }

  return sum;
}

let t = performance.now();
randoms(1_000_000_000);
console.log(performance.now() - t);