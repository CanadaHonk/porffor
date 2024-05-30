// "246132790"
const [ a, b, c ] = [ 2, 4, 6 ];
print(a);
print(b);
print(c);

const [ d, e, , ...f ] = [ 1, 3, 5, 7, 9 ];
print(d);
print(e);
print(f.length);
print(f[0]);
print(f[1]);

const [ g, h = 1 ] = [ 0 ];
print(g);
// print(h); // https://github.com/CanadaHonk/porffor/issues/53