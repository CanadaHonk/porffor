let a = 'very long bytestring with matching length but mismatching content very long bytestring with matching length but mismatching content very long bytestring with matching length but mismatching content';
let b = 'very long bytestring with matching length but mismatching content very long bytestring with matchinG length but mismatching content very long bytestring with matching length but mismatching content';

// let a = Porffor.s`very long bytestring with matching length but mismatching content very long bytestring with matching length but mismatching content very long bytestring with matching length but mismatching content`;
// let b = Porffor.s`very long bytestring with matching length but mismatching content very long bytestring with matchinG length but mismatching content very long bytestring with matching length but mismatching content`;


let t = performance.now();

for (let i = 0; i < 10000000; i++) {
  a == b;
}

console.log(performance.now() - t);
