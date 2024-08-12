export default () => {
  let out = ``;
  const noArgs = (a0, a1) => out += `
export const __String_prototype_${a0} = (_this: any) => {
  const pre: bytestring = '<${a1}>';
  const post: bytestring = '</${a1}>';

  return Porffor.concatStrings(Porffor.concatStrings(pre, _this), post);
};
export const __ByteString_prototype_${a0} = (_this: any) =>
  __String_prototype_${a0}(_this);
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
export const __String_prototype_${name} = (_this: any, arg: any) => {
  const pre1: bytestring = '<${s1} ${s2}="';
  const pre2: bytestring = '">';
  const post: bytestring = '</${s1}>';

  return Porffor.concatStrings(Porffor.concatStrings(Porffor.concatStrings(Porffor.concatStrings(pre1, arg), pre2), _this), post);
};
export const __ByteString_prototype_${name} = (_this: any, arg: any) =>
  __String_prototype_${name}(_this, arg);
`;

  arg('fontcolor', 'font', 'color');
  arg('fontsize', 'font', 'size');
  arg('anchor', 'a', 'name');
  arg('link', 'a', 'href');

  const prototypeAlias = (regular, annex) => `export const __String_prototype_${annex} = (_this: any) =>
  __String_prototype_${regular}(_this);
export const __ByteString_prototype_${annex} = (_this: any) =>
  __ByteString_prototype_${regular}(_this);
`;

  prototypeAlias('trimStart', 'trimLeft');
  prototypeAlias('trimEnd', 'trimRight');

  return out;
};