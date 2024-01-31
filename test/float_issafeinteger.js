// "true\ntrue\ntrue\ntrue\ntrue\nfalse\nfalse\n"

console.log(Number.isSafeInteger(0));
console.log(Number.isSafeInteger(1));
console.log(Number.isSafeInteger(-1));

console.log(Number.isSafeInteger(Number.MAX_SAFE_INTEGER));
console.log(Number.isSafeInteger(Number.MIN_SAFE_INTEGER));

console.log(Number.isSafeInteger(Number.MAX_SAFE_INTEGER + 1));
console.log(Number.isSafeInteger(Number.MIN_SAFE_INTEGER - 1));