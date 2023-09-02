// "0 1 1 2 3 5 8 13 21 34 55 "
const p = x => {
  print(x);
  printChar(32);
};

let a = 0, b = 1;
p(a); p(b);

for (let i = 2; i <= 10; i++) {
  let t = b + a;
  a = b;
  b = t;

  p(t);
}