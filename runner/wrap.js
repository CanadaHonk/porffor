import compile from '../compiler/index.js';

export default async source => {
  const wasm = compile(source, []);

  const print = str => process.stdout.write(str);

  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => print(Number(i).toString()),
      c: i => print(String.fromCharCode(Number(i))),
      a: c => { if (!Number(c)) throw new Error(`assert failed`); }
    }
  });

  const exports = { ...instance.exports };

  exports.main = exports.m;
  delete exports.m;

  return exports;
};