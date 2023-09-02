let beer = 99;
while (beer > 0) {
  printStr(beer + ' bottles of beer on the wall,\n' + beer + ' bottles of beer!\nTake one down, pass it around\n' + (beer - 1) + ' bottles of beer on the wall\n');
  beer--;
}