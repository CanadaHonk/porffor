const data = new Array(5000).fill(0).map(() => Math.random());

let t1 = performance.now();
let sum1 = 0;
for (let x of data) {
  sum1 += x;
}
console.log('for..of', performance.now() - t1);

let t2 = performance.now();
let sum2 = 0;
for (let i = 0; i < data.length; i++) {
  sum2 += data[i];
}
console.log('for (let i = 0; i < data.length; i++)', performance.now() - t2);

let t3 = performance.now();
let sum3 = 0;
let len = data.length;
for (let i = 0; i < len; i++) {
  sum3 += data[i];
}
console.log('for (let i = 0; i < len; i++)', performance.now() - t3);