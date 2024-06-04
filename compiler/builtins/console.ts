import type {} from './porffor.d.ts';

export const __console_clear = () => {
  Porffor.print('\x1b[1;1H\x1b[J');
};