const start = performance.now();

let result = 4294967296;
for (var i = 0; i < 600000; i++)
  result = result & i;

if (result != 0) throw 'ERROR: bad result';

console.log(performance.now() - start);