const n1 = 0;
const n2 = 1337;

const start = Date.now();
for (let i = 0; i < 1_000_000_000; i++) {
  !(n1);
  !(n2);
}

console.log(Date.now() - start);