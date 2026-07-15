const hashSlice = (lo, count) => {
  let acc = 0;
  for (let p = lo; p < lo + count; p++) {
    let h = p;
    for (let i = 0; i < 2000000; i++) h = (h * 31 + 7) % 2147483647;
    acc = (acc + h) % 2147483647;
  }
  return acc;
};

let t = performance.now();
let hash = 0;
for (let s = 0; s < 8; s++) hash += hashSlice(s * 16, 16);
const ms = performance.now() - t;

console.log('hash:', hash);
console.log('time:', ms.toFixed(0), 'ms');
