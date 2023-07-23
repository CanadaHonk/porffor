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

export function factorial(n) {
  if (n === 0) return 1;

  return n * factorial(n - 1);
}

export function arrayAccess() {
  let test = [ 1, 2, 3, 4, 5 ];
  return test[2];
}

export function arithmetic() {
  return ((2 + 2) * 3 / 100 - 5 * -1000) * 2 + 100 - 8;
}

export function mathFuncs() {
  return Math.round(1.2) + Math.fround(5.05) + Math.floor(1.9) + Math.ceil(1.1) + Math.trunc(1.6) + Math.abs(-2) + Math.sqrt(4) + Math.sign(1) + Math.clz32(5);
}