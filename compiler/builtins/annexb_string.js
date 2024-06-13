export default () => {
  let out = `// @porf --funsafe-no-unlikely-proto-checks --valtype=i32
`;

  const noArgs = (a0, a1) => out += `
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
export const __ByteString_prototype_${a0} = (_this: bytestring) => {
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

  noArgs('big', 'big');
  noArgs('blink', 'blink');
  noArgs('bold', 'b');
  noArgs('fixed', 'tt');
  noArgs('italics', 'i');
  noArgs('small', 'small');
  noArgs('strike', 'strike');
  noArgs('sub', 'sub');
  noArgs('sup', 'sup');

  const arg = (name, s1, s2) => out += `
export const __String_prototype_${name} = (_this: string, arg: any) => {
  let out: string = Porffor.s\`${`<${s1} ${s2}="`}\`;
  out += arg;

  let outPtr: i32 = Porffor.wasm\`local.get \${out}\` + ${(`<${s1} ${s2}="`.length + 2) * 2} + arg.length * 2;

  Porffor.wasm.i32.store16(outPtr, 34, 0, 0); // "
  Porffor.wasm.i32.store16(outPtr, 62, 0, 2); // >

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

${[...s1].map((x, i) => `  Porffor.wasm.i32.store16(outPtr, ${x.charCodeAt(0)}, 0, ${8 + i * 2}); // ${x}`).join('\n')}

  Porffor.wasm.i32.store16(outPtr, 62, 0, ${8 + s1.length * 2}); // >

  out.length = thisLen + arg.length + ${`<${s1} ${s2}="`.length + s1.length + 5};

  return out;
};
export const __ByteString_prototype_${name} = (_this: bytestring, arg: any) => {
  let out: string = Porffor.s\`${`<${s1} ${s2}="`}\`;
  out += arg;

  let outPtr: i32 = Porffor.wasm\`local.get \${out}\` + ${(`<${s1} ${s2}="`.length + 2) * 2} + arg.length * 2;

  Porffor.wasm.i32.store16(outPtr, 34, 0, 0); // "
  Porffor.wasm.i32.store16(outPtr, 62, 0, 2); // >

  let thisPtr: i32 = Porffor.wasm\`local.get \${_this}\`;
  let thisLen: i32 = _this.length;
  let endPtr: i32 = thisPtr + thisLen;

  while (thisPtr < endPtr) {
    let chr: i32 = Porffor.wasm.i32.load8_u(thisPtr++, 0, 4);
    Porffor.wasm.i32.store16(outPtr, chr, 0, 4);

    outPtr += 2;
  }

  Porffor.wasm.i32.store16(outPtr, 60, 0, 4); // <
  Porffor.wasm.i32.store16(outPtr, 47, 0, 6); // /

${[...s1].map((x, i) => `  Porffor.wasm.i32.store16(outPtr, ${x.charCodeAt(0)}, 0, ${8 + i * 2}); // ${x}`).join('\n')}

  Porffor.wasm.i32.store16(outPtr, 62, 0, ${8 + s1.length * 2}); // >

  out.length = thisLen + arg.length + ${`<${s1} ${s2}="`.length + s1.length + 5};

  return out;
};
`;

  arg('fontcolor', 'font', 'color');
  arg('fontsize', 'font', 'size');
  arg('anchor', 'a', 'name');
  arg('link', 'a', 'href');

  return out;
};