// "0002101230324042"
for (let i = 0; i < 5; i++) {
  if (i === 2) continue;

  for (let j = 0; j < 3; j++) {
    if (j === 1) continue;
    print(i);
    print(j);
  }
}