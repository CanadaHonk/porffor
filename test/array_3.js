// "2461327901"
let [a, b, c] = [ 2, 4, 6 ];
print(a);
print(b);
print(c);
let [d, e, , ...f] = [ 1, 3, 5, 7, 9 ];
print(d);
print(e);
print(f.length);
print(f[0]);
print(f[1]);

let [g, h = 1] = [0];
print(g)
print(h)