// "4122344"
const x = v => {
  switch (v) {
    case 1:
      print(1);

    case 2:
      print(2);
      break;

    case 3:
      print(3);

    default:
      print(4);
      break;
  }
};

x(0);
x(1);
x(2);
x(3);
x(4);