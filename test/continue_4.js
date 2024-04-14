// "013401340134"

let i = -1;
while (i < 4) {
  i++;
  if (true) if (i == 2) continue;
  print(i);
}

for (let i = 0; i < 5; i++) {
  if (true) if (i == 2) continue;
  print(i);
}

for (let i of [ 0, 1, 2, 3, 4 ]) {
  if (true) if (i == 2) continue;
  print(i);
}