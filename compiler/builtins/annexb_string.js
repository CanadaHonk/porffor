export default () => {
  let out = '';
  const noArgs = (a0, a1) => out += `
export const __String_prototype_${a0} = function (this: string) {
  return Porffor.concatStrings(
    Porffor.concatStrings('<${a1}>', this),
    '</${a1}>');
};
export const __ByteString_prototype_${a0} = function (this: bytestring) {
  return Porffor.callThis(__String_prototype_${a0}, this);
};`;

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
export const __String_prototype_${name} = function (this: string, arg: any) {
  arg = ecma262.ToString(arg);
  const len: i32 = arg.length;
  const escaped: bytestring = Porffor.malloc(6 + len * 6); // overallocate in case of &quot;s
  Porffor.IR.storeI32(escaped, 0, 0);
  for (let i: i32 = 0; i < len; i++) {
    const c: i32 = arg.charCodeAt(i);
    if (c != 34) {
      __Porffor_bytestring_appendChar(escaped, c);
    } else {
      __Porffor_bytestring_appendStr(escaped, '&quot;');
    }
  }

  return Porffor.concatStrings(
    Porffor.concatStrings(
      Porffor.concatStrings(
        Porffor.concatStrings('<${s1} ${s2}="', escaped),
        '">'),
      this),
    '</${s1}>');
}
export const __ByteString_prototype_${name} = function (this: bytestring, arg: any) {
  return Porffor.callThis(__String_prototype_${name}, this, arg);
};`;

  arg('fontcolor', 'font', 'color');
  arg('fontsize', 'font', 'size');
  arg('anchor', 'a', 'name');
  arg('link', 'a', 'href');

  const prototypeAlias = (regular, annex) => out += `
export const __String_prototype_${annex} = function (this: any) {
  return Porffor.callThis(__String_prototype_${regular}, this);
};
export const __ByteString_prototype_${annex} = function (this: any) {
  return Porffor.callThis(__ByteString_prototype_${regular}, this);
};`;

  prototypeAlias('trimStart', 'trimLeft');
  prototypeAlias('trimEnd', 'trimRight');

  return out;
};
