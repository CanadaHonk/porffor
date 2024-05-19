import type {} from './porffor.d.ts';

// radix: number|any for rawType check
// export const parseInt = (input: string|bytestring, radix: number|any): f64 => {
export const parseInt = (input: string|bytestring, radix: number): f64 => {
  // todo/perf: optimize this instead of doing a naive algo (https://kholdstare.github.io/technical/2020/05/26/faster-integer-parsing.html)
  // todo/perf: use i32s here once that becomes not annoying

  if (Porffor.rawType(radix) != Porffor.TYPES.number) {
    // todo: string to number
    radix = 10;
  }

  if (radix == 0) radix = 10;
  if (radix < 2 || radix > 36) return NaN;

  let nMax: f64 = 58;
  if (radix < 10) nMax = 48 + radix;

  // if (Porffor.rawType(input) == Porffor.TYPES.bytestring) input = __ByteString_prototype_trimStart(input);
  //   else input = __String_prototype_trimStart(input);

  let n: f64 = NaN;

  const inputPtr: f64 = Porffor.wasm`local.get ${input}`;
  const len: f64 = Porffor.wasm.i32.load(inputPtr, 0, 0);
  let i: f64 = inputPtr;

  let negative: boolean = false;

  if (Porffor.rawType(input) == Porffor.TYPES.bytestring) {
    const endPtr: f64 = i + len;

    // check start of string
    const startChr: f64 = Porffor.wasm.i32.load8_u(i, 0, 4);

    // +, ignore
    if (startChr == 43) i++;

    // -, switch to negative
    if (startChr == 45) {
      negative = true;
      i++;
    }

    // 0, potential start of hex
    if (startChr == 48) {
      const second: f64 = Porffor.wasm.i32.load8_u(i + 1, 0, 4);
      // 0x or 0X
      if (second == 120 || second == 88) {
        // set radix to 16 and skip leading 2 chars
        i += 2;
        radix = 16;
      }
    }

    while (i < endPtr) {
      const chr: f64 = Porffor.wasm.i32.load8_u(i++, 0, 4);

      if (chr >= 48 && chr < nMax) {
        if (Number.isNaN(n)) n = 0;

        n *= radix;
        n += chr - 48;
      } else if (radix > 10) {
        if (chr >= 97 && chr < (87 + radix)) {
          if (Number.isNaN(n)) n = 0;

          n *= radix;
          n += chr - 87;
        } else if (chr >= 65 && chr < (55 + radix)) {
          if (Number.isNaN(n)) n = 0;

          n *= radix;
          n += chr - 55;
        } else {
          if (negative) return -n;
          return n;
        }
      } else {
        if (negative) return -n;
        return n;
      }
    }

    if (negative) return -n;
    return n;
  }

  const endPtr: f64 = i + len * 2;

  // check start of string
  const startChr: f64 = Porffor.wasm.i32.load16_u(i, 0, 4);

  // +, ignore
  if (startChr == 43) i += 2;

  // -, switch to negative
  if (startChr == 45) {
    negative = true;
    i += 2;
  }

  // 0, potential start of hex
  if (startChr == 48) {
    const second: f64 = Porffor.wasm.i32.load16_u(i + 2, 0, 4);
    // 0x or 0X
    if (second == 120 || second == 88) {
      // set radix to 16 and skip leading 2 chars
      i += 4;
      radix = 16;
    }
  }

  while (i < endPtr) {
    const chr: f64 = Porffor.wasm.i32.load16_u(i, 0, 4);
    i += 2;

    if (chr >= 48 && chr < nMax) {
      if (Number.isNaN(n)) n = 0;

      n *= radix;
      n += chr - 48;
    } else if (radix > 10) {
      if (chr >= 97 && chr < (87 + radix)) {
        if (Number.isNaN(n)) n = 0;

        n *= radix;
        n += chr - 87;
      } else if (chr >= 65 && chr < (55 + radix)) {
        if (Number.isNaN(n)) n = 0;

        n *= radix;
        n += chr - 55;
      } else {
        if (negative) return -n;
        return n;
      }
    } else {
      if (negative) return -n;
      return n;
    }
  }

  if (negative) return -n;
  return n;
};