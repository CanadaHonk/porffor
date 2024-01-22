
#include <stdio.h>

struct ReturnValue {
  double value;
  long type;
};

double sum = 0;
long sumdtype = 0;
double counter = 0;
long counterdtype = 0;

double inline f64_f(double x, double y) {
  return (x - ((int)(x / y) * y));
}

struct ReturnValue isPrime(double number, long numberdtype) {
  double i = 0;
  long idtype = 0;
  double __tmpop_left = 0;
  double __tmpop_right = 0;
  long compare_left_pointer = 0;
  long compare_left_length = 0;
  long compare_right_pointer = 0;
  long compare_right_length = 0;
  long compare_index = 0;
  long compare_index_end = 0;

  if (number < 2e+0) {
    return (struct ReturnValue){ 1, 0e+0 };
  }
  i = 2e+0;
  idtype = 0;
  while (i < number) {
    if (f64_f(number, i) == 0e+0) {
      return (struct ReturnValue){ 1, 0e+0 };
    }
    i = i + 1e+0;
  }
  return (struct ReturnValue){ 1, 1e+0 };
}

double inline __console_log(double x) {
  printf("%f\n", x);
  printf("%c", (int)(1e+1));
}

int main() {
  long dlast_type = 0;
  double elogicinner_tmp = 0;
  long dtypeswitch_tmp = 0;

  sum = 0e+0;
  sumdtype = 0;
  counter = 0e+0;
  counterdtype = 0;
  while (counter <= 1e+5) {
    const struct ReturnValue _ = isPrime(counter, counterdtype);
    dlast_type = _.type;
    if ((unsigned long)(elogicinner_tmp = _.value) == 1e+0) {
      sum = sum + counter;
      sumdtype = 0;
    }
    counter = counter + 1e+0;
  }
  __console_log(sum);

  return 0;
}

