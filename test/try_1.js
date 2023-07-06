// "1"
try {
  throw new Error("caught");
  print(0);
} catch {
  print(1);
}