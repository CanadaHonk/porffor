let a = 0, b = 1;
console.log(a); console.log(b);

for (let i = 2; i <= 45; i++) {
  let t = b + a;
  a = b;
  b = t;

  console.log(t);
}