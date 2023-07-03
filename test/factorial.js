// "479001600\n"
const factorial = n => n === 0 ? 1 : (n * factorial(n - 1));
console.log(factorial(12));