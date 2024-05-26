// "0 0 0\n0 5 10\n2 5 10\n2 4 10\n2 4 6\nundefined 5 10\n9 5 10\n1 2\n0 0\n1 2\n9 2\n3 2\n1 4\n"
function foo(a, b = 5, c = 10) {
  console.log(a, b, c);
}

foo(0, 0, 0);
foo(0);
foo(2);
foo(2, 4);
foo(2, 4, 6);
foo(undefined, undefined, undefined);
foo(9, undefined, undefined);

const bar = (x = 1, y = 2) => {
  console.log(x, y);
};

bar();
bar(0, 0);
bar(undefined, undefined);
bar(9);
bar(3, undefined);
bar(undefined, 4);