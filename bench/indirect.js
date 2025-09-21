const run = (func) => {
  for (let i = 0; i < 10_000_000; i++) {
    // func(i);
    func(i,i,i,i,i,i,i,i,i,i,i,i,i,i,i,i);
  }
};

const zero = () => {};
const single = (a) => {};
const two = (a,b) => {};
const four = (a,b,c,d) => {};
const eight = (a,b,c,d,e,f,g,h) => {};
const sixteen = (a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p) => {};

console.log("argcount,direct,indirect");

let t17 = performance.now();
for (let i = 0; i < 10_000_000; i++) {
  // noop
}
let t18 = performance.now();
console.log("-1," + (t18 - t17).toFixed(2) + ",0");

let t21 = performance.now();
for (let i = 0; i < 10_000_000; i++) {
  zero();
}
let t22 = performance.now();

let t19 = performance.now();
run(zero);
let t20 = performance.now();
console.log("0," + (t22 - t21).toFixed(2) + "," + (t20 - t19).toFixed(2));

let t1 = performance.now();
for (let i = 0; i < 10_000_000; i++) {
  single(i);
}
let t2 = performance.now();

let t9 = performance.now();
run(single);
let t10 = performance.now();
console.log("1," + (t2 - t1).toFixed(2) + "," + (t10 - t9).toFixed(2));


let t3 = performance.now();
for (let i = 0; i < 10_000_000; i++) {
  two(i,i);
}
let t4 = performance.now();

let t11 = performance.now();
run(two);
let t12 = performance.now();
console.log("2," + (t4 - t3).toFixed(2) + "," + (t12 - t11).toFixed(2));

let t5 = performance.now();
for (let i = 0; i < 10_000_000; i++) {
  four(i,i,i,i);
}
let t6 = performance.now();

let t13 = performance.now();
run(four);
let t14 = performance.now();
console.log("4," + (t6 - t5).toFixed(2) + "," + (t14 - t13).toFixed(2));


let t7 = performance.now();
for (let i = 0; i < 10_000_000; i++) {
  eight(i,i,i,i,i,i,i,i);
}
let t8 = performance.now();

let t15 = performance.now();
run(eight);
let t16 = performance.now();
console.log("8," + (t8 - t7).toFixed(2) + "," + (t16 - t15).toFixed(2));


let t23 = performance.now();
for (let i = 0; i < 10_000_000; i++) {
  sixteen(i,i,i,i,i,i,i,i,i,i,i,i,i,i,i,i);
}
let t24 = performance.now();

let t25 = performance.now();
run(sixteen);
let t26 = performance.now();
console.log("16," + (t24 - t23).toFixed(2) + "," + (t26 - t25).toFixed(2));