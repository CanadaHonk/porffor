// "0101"
for (let i = 0; i < 5; i++) {
  if (i === 2) break;

  let j = 0;
  do {
    if (j === 2) break;
    print(j);

    j++;
  } while (j < 5)
}