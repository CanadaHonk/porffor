export default () => {
  let out = `// @porf --funsafe-no-unlikely-proto-checks --valtype=i32
`;

  const annexB_noArgs = (a0, a1) => out += `
export const __String_prototype_${a0} = (_this: string) => {
  let out: string = Porffor.s\`<${a1}>\`;

  let outPtr: i32 = Porffor.wasm\`local.get \${out}\` + ${(2 + a1.length) * 2};

  let thisPtr: i32 = Porffor.wasm\`local.get \${_this}\`;
  let thisLen: i32 = _this.length;
  let endPtr: i32 = thisPtr + thisLen * 2;

  while (thisPtr < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load16_u(thisPtr, 0, 4);
    Porffor.wasm.i32.store16(outPtr, chr, 0, 4);

    thisPtr += 2;
    outPtr += 2;
  }

  Porffor.wasm.i32.store16(outPtr, 60, 0, 4); // <
  Porffor.wasm.i32.store16(outPtr, 47, 0, 6); // /

${[...a1].map((x, i) => `  Porffor.wasm.i32.store16(outPtr, ${x.charCodeAt(0)}, 0, ${8 + i * 2}); // ${x}`).join('\n')}

  Porffor.wasm.i32.store16(outPtr, 62, 0, ${8 + a1.length * 2}); // >

  out.length = thisLen + ${a1.length * 2 + 2 + 3};

  return out;
};
export const ___bytestring_prototype_${a0} = (_this: bytestring) => {
  let out: bytestring = Porffor.bs\`<${a1}>\`;

  let outPtr: i32 = Porffor.wasm\`local.get \${out}\` + ${2 + a1.length};

  let thisPtr: i32 = Porffor.wasm\`local.get \${_this}\`;
  let thisLen: i32 = _this.length;
  let endPtr: i32 = thisPtr + thisLen;

  while (thisPtr < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr++, 0, 4);
    Porffor.wasm.i32.store8(outPtr++, chr, 0, 4);
  }

  Porffor.wasm.i32.store8(outPtr, 60, 0, 4); // <
  Porffor.wasm.i32.store8(outPtr, 47, 0, 5); // /

${[...a1].map((x, i) => `  Porffor.wasm.i32.store8(outPtr, ${x.charCodeAt(0)}, 0, ${6 + i}); // ${x}`).join('\n')}

  Porffor.wasm.i32.store8(outPtr, 62, 0, ${6 + a1.length}); // >

  out.length = thisLen + ${a1.length * 2 + 2 + 3};

  return out;
};
`;

  annexB_noArgs('big', 'big');
  annexB_noArgs('blink', 'blink');
  annexB_noArgs('bold', 'b');
  annexB_noArgs('fixed', 'tt');
  annexB_noArgs('italics', 'i');
  annexB_noArgs('small', 'small');
  annexB_noArgs('strike', 'strike');
  annexB_noArgs('sub', 'sub');
  annexB_noArgs('sup', 'sup');

  return out;
};