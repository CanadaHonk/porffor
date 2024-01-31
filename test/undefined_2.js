// "0123"
// todo: it should be below but we broke it
// see: "hack: this follows spec properly but is mostly unneeded"
// "01234"

let a;
let b = undefined;
let c = null;

if (!a) print(0);
if (b === undefined) print(1);
if (b == null) print(2);
if (c === null) print(3);
if (a === b) print(4);