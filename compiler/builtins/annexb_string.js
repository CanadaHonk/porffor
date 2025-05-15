export default () => {
  let out = `// @porf --valtype=i32`;
  const noArgs = (a0, a1) => out += `
export const __String_prototype_${a0} = (_this: string) =>
  Porffor.concatStrings(
    Porffor.concatStrings('<${a1}>', _this),
    '</${a1}>');
export const __ByteString_prototype_${a0} = (_this: bytestring) =>
  __String_prototype_${a0}(_this);`;

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
export const __String_prototype_${name} = (_this: string, arg: any) =>
  Porffor.concatStrings(
    Porffor.concatStrings(
      Porffor.concatStrings(
        Porffor.concatStrings('<${s1} ${s2}="', arg),
        '">'),
      _this),
    '</${s1}>');
export const __ByteString_prototype_${name} = (_this: bytestring, arg: any) =>
  __String_prototype_${name}(_this, arg);`;

  arg('fontcolor', 'font', 'color');
  arg('fontsize', 'font', 'size');
  arg('anchor', 'a', 'name');
  arg('link', 'a', 'href');

  const prototypeAlias = (regular, annex) => out += `
export const __String_prototype_${annex} = (_this: any) =>
  __String_prototype_${regular}(_this);
export const __ByteString_prototype_${annex} = (_this: any) =>
  __ByteString_prototype_${regular}(_this);`;

  prototypeAlias('trimStart', 'trimLeft');
  prototypeAlias('trimEnd', 'trimRight');

  return out;
};