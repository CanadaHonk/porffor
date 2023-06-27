import compile from '../compiler/index.js';

export default async source => {
  const wasm = compile(source, []);

  const { instance } = await WebAssembly.instantiate(wasm, {
    '': {
      p: i => print(Number(i).toString()),
      c: i => print(String.fromCharCode(Number(i))),
      a: c => { if (!Number(c)) throw new Error(`assert failed`); }
    }
  });

  instance.exports.main = instance.exports.m;
  delete instance.exports.m;

  return instance.exports;
};