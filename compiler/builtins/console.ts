export const __console_clear = (): void => {
  const clear: bytestring = '\x1b[2J';
  console.log(clear);
};
