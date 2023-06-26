function isPrime(number) {
  if (number === 1) {
    return true;
  }

  if (number > 1) {
    let isPrime = true;

    for (let i = 2; i < number; i++) {
      if (number % i == 0) {
        isPrime = false;
        break;
      }
    }

    return isPrime;
  }
}

let counter = 0;
while (counter <= 1000) {
  if (isPrime(counter)) {
    console.log(counter);
  }
  counter++;
}