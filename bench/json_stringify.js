const obj = {
  a: 1337,
  b: 'hello world',
  c: [
    {
      nested: true
    }
  ]
};

let t = performance.now();
for (let i = 0; i < 8000; i++) {
  JSON.stringify(obj);
}

console.log(performance.now() - t);