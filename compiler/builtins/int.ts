// @porf -funsafe-no-unlikely-proto-checks

export const parseInt = (input: string|bytestring): f64 => {
  // todo/perf: optimize this instead of doing a naive algo (https://kholdstare.github.io/technical/2020/05/26/faster-integer-parsing.html)
  // todo/perf: use i32s here once that becomes not annoying

  let n: f64 = NaN;

  let i: f64 = Porffor.wasm`local.get ${input}`;
  const len: f64 = Porffor.wasm.i32.load(input, 0, 0);

  if (Porffor.rawType(input) == Porffor.TYPES._bytestring) {
    const endPtr: f64 = i + len;
    while (i < endPtr) {
      const chr: f64 = Porffor.wasm.i32.load8_u(i++, 0, 4);

      if (chr >= 48 && chr <= 57) {
        if (Number.isNaN(n)) n = 0;

        n *= 10;
        n += chr - 48;
      } else return n;
    }

    return n;
  }

  const endPtr: f64 = i + len * 2;
  while (i < endPtr) {
    const chr: f64 = Porffor.wasm.i32.load16_u(i, 0, 4);
    i += 2;

    if (chr >= 48 && chr <= 57) {
      if (Number.isNaN(n)) n = 0;

      n *= 10;
      n += chr - 48;
    } else return n;
  }

  return n;
};