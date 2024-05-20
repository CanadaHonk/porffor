import type {} from './porffor.d.ts';

export const __console_clear = (): void => {
  const clear: bytestring = '\x1b[1;1H\x1b[J';
  Porffor.print(clear);
};