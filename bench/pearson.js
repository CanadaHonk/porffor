const start = performance.now();

// Define your two arrays of numbers
const array1 = [1, 2, 3, 4, 5];
const array2 = [5, 4, 3, 2, 1];

const mean = arr => {
  arr ??= [];

  let sum = 0;
  for (const x of arr) {
    sum += x;
  }

  return sum / arr.length;
};

// Calculate the mean of each array
// const mean1 = array1.reduce((acc, val) => acc + val, 0) / array1.length;
// const mean2 = array2.reduce((acc, val) => acc + val, 0) / array2.length;
const mean1 = mean(array1);
const mean2 = mean(array2);

// Calculate the numerator and denominators for Pearson correlation
let numerator = 0;
let denominator1 = 0;
let denominator2 = 0;

for (let i = 0; i < array1.length; i++) {
  const diff1 = array1[i] - mean1;
  const diff2 = array2[i] - mean2;
  numerator += diff1 * diff2;
  denominator1 += diff1 * diff1;
  denominator2 += diff2 * diff2;
}

// Calculate the correlation coefficient
const correlationCoefficient = numerator / Math.sqrt(denominator1 * denominator2);

console.log(correlationCoefficient);
console.log(performance.now() - start);