export const rgb = (r, g, b, x) => `\x1b[38;2;${r};${g};${b}m${x}\u001b[0m`;
export const underline = x => `\u001b[4m${x}\u001b[0m`;
export const bold = x => `\u001b[1m${x}\u001b[0m`;

const areaColors = {
  codegen: [ 20, 80, 250 ],
  opt: [ 250, 20, 80 ],
  assemble: [ 20, 250, 80 ],
  alloc: [ 250, 250, 20 ],
  parse: [ 240, 240, 240 ],
  '2c': [ 20, 250, 250 ],
  wrap: [ 250, 100, 20 ]
};

export const log = (area, ...args) => console.log(`\u001b[90m[\u001b[0m${rgb(...areaColors[area] ?? areaColors.parse, area)}\u001b[90m]\u001b[0m`, ...args);
log.warning = (area, ...args) => log(area, '\u001b[93m' + args[0], ...args.slice(1), '\u001b[0m');