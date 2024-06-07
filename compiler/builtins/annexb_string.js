export default () => {
  let out = `// @porf --funsafe-no-unlikely-proto-checks --valtype=i32
`;

  const noArgs = (a0, a1) => out += `
export const __String_prototype_${a0} = (_this: string) => {
  const thisLen: i32 = _this.length;
  const outLen: i32 = ${5 + 2*a1.length} + thisLen; // '<${a1}>'.length + '</${a1}>'.length + _this.length
  let out = Porffor.allocateBytes<string>(4 + outLen*2);
  __Porffor_string_spliceString(out, 0, '<${a1}>');
  __Porffor_string_spliceString(out, ${(2 + a1.length) * 2}, _this); // '<${a1}>'.length
  __Porffor_string_spliceString(out, ${(2 + a1.length) * 2} + thisLen*2, '</${a1}>');  // '<${a1}>'.length + _this.length
  out.length = outLen; 
  return out;
};
export const __ByteString_prototype_${a0} = (_this: bytestring) => {
  const thisLen: i32 = _this.length;
  const outLen: i32 = ${5 + 2*a1.length} + thisLen;
  let out = Porffor.allocateBytes<bytestring>(4 + outLen); // '<${a1}>'.length + '</${a1}>'.length + _this.length
  __Porffor_bytestring_spliceString(out, 0, '<${a1}>');
  __Porffor_bytestring_spliceString(out, ${2 + a1.length}, _this); // '<${a1}>'.length
  __Porffor_bytestring_spliceString(out, ${2 + a1.length} + thisLen, '</${a1}>');  // '<${a1}>'.length + _this.length
  out.length = outLen; 
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

  return out;
};