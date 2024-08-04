let t = performance.now();

let i = 0;
while (i++ < 10_000_000) {
  crypto.randomUUID();
}

console.log("randomUUID:", performance.now() - t);

let t2 = performance.now();

i = 0;
const buf = new Uint8Array(16);
while (i++ < 10_000_000) {
  crypto.getRandomValues(buf);
}

console.log("getRandomValues:", performance.now() - t2);
