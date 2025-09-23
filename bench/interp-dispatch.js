// taken mostly from hermes

function bench (lc, fc) {
  var n, fact;
  var res = 0;
  while (--lc >= 0) {
      n = fc;
      fact = n;
      while (--n > 1)
          fact *= n;
      res += fact;
  }
  return res;
}

let t1 = Date.now();
var res = bench(4e6, 100);
var t2 = Date.now();
print(t2 - t1);