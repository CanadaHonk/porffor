import bytes from "./test-bytes.data" with { type: "bytes" };

console.log(typeof bytes);
console.log(bytes instanceof Uint8Array);
console.log(bytes.length);
console.log(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);