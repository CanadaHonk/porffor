let t = performance.now();

let a = 'hello, world!';
let b = 'hello, nope!';

for (let i = 0; i < 1000; i++) {
  a === b;
}

console.log(performance.now() - t);