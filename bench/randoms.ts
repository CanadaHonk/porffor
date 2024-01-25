type i32 = number;
function randoms(max: i32) {
  let sum: i32 = 0;
  for (let i: i32 = 0; i < max; i++) {
    sum += Math.random();
  }

  return sum;
}

let t = performance.now();
randoms(1_000_000_000);
console.log(performance.now() - t);