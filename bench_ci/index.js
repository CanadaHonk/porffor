export function countPrimes(max) {
  function isPrime(number) {
    if (number < 2) return false;

    for (let i = 2; i < number; i++) {
      if (number % i == 0) return false;
    }

    return true;
  }

  let counter = 0, primes = 0;
  while (counter <= max) {
    if (isPrime(counter)) primes++;
    counter++;
  }

  return primes;
}

export function randoms(max) {
  let sum = 0;
  for (let i = 0; i < max; i++) {
    sum += Math.random();
  }

  return sum;
}

export const factorial = n => n === 0 ? 1 : (n * factorial(n - 1));

export function recursiveFib(max) {
  function fibonacci(n) {
    if (n < 2) {
      return n;
    } else {
      return fibonacci(n - 1) + fibonacci(n - 2);
    }
  }

  let sum = 0;
  for (let i = 0; i <= max; i++) {
    sum += fibonacci(i);
  }

  return sum;
}

export function iterativeFib(max) {
  let sum = 1;
  let a = 0, b = 1;

  for (let i = 2; i <= max; i++) {
    let t = b + a;
    a = b;
    b = t;

    sum += t;
  }

  return sum;
}