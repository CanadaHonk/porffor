const start = Date.now();
let total = 0;
for (let i = 0; i < 1_000_000; i++) {
  try {
    throw i;
  } catch (e) {
  }
}

console.log(Date.now() - start);
