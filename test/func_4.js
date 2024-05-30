// "01112131"
function one(...a) {
  print(a.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] != 1) return 0;
  }
  return 1;
}

print(one());
print(one(1));
print(one(1, 1));
print(one(1, 1, 1));