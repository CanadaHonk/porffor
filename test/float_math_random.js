// ""

for (let i = 0; i < 100000; i++) {
  let x = Math.random();
  if (!(x > 0 && x < 1)) throw new Error('Math.random() out of range');
}