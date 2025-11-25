const regex = /Firefox/;

const start = Date.now();
for (let i = 0; i < 1_000_000; i++) {
  if (regex != 1) regex.test('Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0');
    else /Firefox/.test('Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0');
}

console.log(Date.now() - start);