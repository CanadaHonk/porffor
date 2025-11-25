const obj = {};
obj.wow = 1337;

const start = Date.now();
let total = 0;
for (let i = 0; i < 100_000_000; i++) {
  total += obj.wow;
}

console.log(Date.now() - start);