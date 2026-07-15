import type {} from './porffor.d.ts';

// legacy escape
export const escape = (input: any): bytestring => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  let outLength: i32 = 0;

  let i: i32 = Porffor.IR.ptr(input);

  if (Porffor.type(input) == Porffor.TYPES.bytestring) {
    const endPtr: i32 = i + len;

    // first pass: output length
    while (i < endPtr) {
      const chr: i32 = Porffor.IR.loadU8(i++, 4);

      // unescaped: A-Z a-z 0-9 @ * + - . / _
      if ((chr >= 48 && chr <= 57) ||  // 0-9
          (chr >= 65 && chr <= 90) ||  // A-Z
          (chr >= 97 && chr <= 122) || // a-z
          chr == 42 || chr == 43 || chr == 45 || chr == 46 || chr == 47 || chr == 64 || chr == 95) {
        outLength += 1;
      } else {
        outLength += 3; // %XX
      }
    }

    // second pass: encode
    let output: bytestring = Porffor.malloc();
    output.length = outLength;

    i = Porffor.IR.ptr(input);
    let j: i32 = Porffor.IR.ptr(output);

    while (i < endPtr) {
      const chr: i32 = Porffor.IR.loadU8(i++, 4);

      if ((chr >= 48 && chr <= 57) ||  // 0-9
          (chr >= 65 && chr <= 90) ||  // A-Z
          (chr >= 97 && chr <= 122) || // a-z
          chr == 42 || chr == 43 || chr == 45 || chr == 46 || chr == 47 || chr == 64 || chr == 95) {
        Porffor.IR.storeU8(j++, 4, chr);
      } else {
        Porffor.IR.storeU8(j++, 4, 37); // %

        let nibble: i32 = chr >> 4;
        if (nibble < 10) {
          Porffor.IR.storeU8(j++, 4, nibble + 48);
        } else {
          Porffor.IR.storeU8(j++, 4, nibble + 55);
        }

        nibble = chr & 0x0F;
        if (nibble < 10) {
          Porffor.IR.storeU8(j++, 4, nibble + 48);
        } else {
          Porffor.IR.storeU8(j++, 4, nibble + 55);
        }
      }
    }

    return output;
  }

  // string input (utf-16)
  const endPtr: i32 = i + len * 2;

  // first pass: output length
  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    // unescaped: A-Z a-z 0-9 @ * + - . / _
    if ((chr >= 48 && chr <= 57) ||  // 0-9
        (chr >= 65 && chr <= 90) ||  // A-Z
        (chr >= 97 && chr <= 122) || // a-z
        chr == 42 || chr == 43 || chr == 45 || chr == 46 || chr == 47 || chr == 64 || chr == 95) {
      outLength += 1;
    } else if (chr < 256) {
      outLength += 3; // %XX
    } else {
      outLength += 6; // %uXXXX
    }
  }

  // second pass: encode
  let output: bytestring = Porffor.malloc();
  output.length = outLength;

  i = Porffor.IR.ptr(input);
  let j: i32 = Porffor.IR.ptr(output);

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    if ((chr >= 48 && chr <= 57) ||  // 0-9
        (chr >= 65 && chr <= 90) ||  // A-Z
        (chr >= 97 && chr <= 122) || // a-z
        chr == 42 || chr == 43 || chr == 45 || chr == 46 || chr == 47 || chr == 64 || chr == 95) {
      Porffor.IR.storeU8(j++, 4, chr);
    } else if (chr < 256) {
      Porffor.IR.storeU8(j++, 4, 37); // %

      let nibble: i32 = chr >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      nibble = chr & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    } else {
      // %uXXXX
      Porffor.IR.storeU8(j++, 4, 37); // %
      Porffor.IR.storeU8(j++, 4, 117); // u

      let nibble: i32 = (chr >> 12) & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      nibble = (chr >> 8) & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      nibble = (chr >> 4) & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      nibble = chr & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    }
  }

  return output;
};

// legacy unescape
export const unescape = (input: any): string => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  let outLength: i32 = 0;

  // first pass: output length
  let i: i32 = Porffor.IR.ptr(input);
  const endPtr: i32 = i + len;

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU8(i++, 4);
    if (chr == 37) { // %
      if (i + 4 < endPtr && Porffor.IR.loadU8(i, 4) == 117) { // u
        i += 5;
      } else if (i + 1 < endPtr) {
        i += 2;
      }
    }
    outLength += 1;
  }

  // second pass: decode
  let output: string = Porffor.malloc();
  output.length = outLength;

  i = Porffor.IR.ptr(input);
  let j: i32 = Porffor.IR.ptr(output);

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU8(i++, 4);

    if (chr == 37) { // %
      if (i + 4 < endPtr && Porffor.IR.loadU8(i, 4) == 117) { // u
        // %uXXXX
        const d1: i32 = Porffor.IR.loadU8(i + 1, 4);
        const d2: i32 = Porffor.IR.loadU8(i + 2, 4);
        const d3: i32 = Porffor.IR.loadU8(i + 3, 4);
        const d4: i32 = Porffor.IR.loadU8(i + 4, 4);

        let n1: i32 = d1 - 48;
        if (n1 > 9) {
          n1 = d1 - 55;
          if (n1 > 15) n1 = d1 - 87;
        }

        let n2: i32 = d2 - 48;
        if (n2 > 9) {
          n2 = d2 - 55;
          if (n2 > 15) n2 = d2 - 87;
        }

        let n3: i32 = d3 - 48;
        if (n3 > 9) {
          n3 = d3 - 55;
          if (n3 > 15) n3 = d3 - 87;
        }

        let n4: i32 = d4 - 48;
        if (n4 > 9) {
          n4 = d4 - 55;
          if (n4 > 15) n4 = d4 - 87;
        }

        if (n1 >= 0 && n1 <= 15 && n2 >= 0 && n2 <= 15 && n3 >= 0 && n3 <= 15 && n4 >= 0 && n4 <= 15) {
          i += 5;
          const value: i32 = (n1 << 12) | (n2 << 8) | (n3 << 4) | n4;
          Porffor.IR.storeU16(j, 4, value);
        } else {
          Porffor.IR.storeU16(j, 4, chr);
        }
      } else if (i + 1 < endPtr) {
        // %XX
        const d1: i32 = Porffor.IR.loadU8(i, 4);
        const d2: i32 = Porffor.IR.loadU8(i + 1, 4);

        let n1: i32 = d1 - 48;
        if (n1 > 9) {
          n1 = d1 - 55;
          if (n1 > 15) n1 = d1 - 87;
        }

        let n2: i32 = d2 - 48;
        if (n2 > 9) {
          n2 = d2 - 55;
          if (n2 > 15) n2 = d2 - 87;
        }

        if (n1 >= 0 && n1 <= 15 && n2 >= 0 && n2 <= 15) {
          i += 2;
          const value: i32 = (n1 << 4) | n2;
          Porffor.IR.storeU16(j, 4, value);
        } else {
          Porffor.IR.storeU16(j, 4, chr);
        }
      } else {
        Porffor.IR.storeU16(j, 4, chr);
      }
    } else {
      Porffor.IR.storeU16(j, 4, chr);
    }

    j += 2;
  }

  return output;
};

export const encodeURI = (input: any): bytestring => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  let outLength: i32 = 0;

  let i: i32 = Porffor.IR.ptr(input);

  if (Porffor.type(input) == Porffor.TYPES.bytestring) {
    const endPtr: i32 = i + len;

    // first pass: output length
    while (i < endPtr) {
      const chr: i32 = Porffor.IR.loadU8(i++, 4);

      // not encoded for encodeURI
      if ((chr >= 48 && chr <= 57) ||  // 0-9
          (chr >= 65 && chr <= 90) ||  // A-Z
          (chr >= 97 && chr <= 122) || // a-z
          chr == 33 || chr == 35 || chr == 36 || chr == 38 || chr == 39 ||
          chr == 40 || chr == 41 || chr == 42 || chr == 43 || chr == 44 ||
          chr == 45 || chr == 46 || chr == 47 || chr == 58 || chr == 59 ||
          chr == 61 || chr == 63 || chr == 64 || chr == 91 || chr == 93 ||
          chr == 95 || chr == 126) {
        outLength += 1;
      } else {
        outLength += 3; // %XX
      }
    }

    // second pass: encode
    let output: bytestring = Porffor.malloc();
    output.length = outLength;

    i = Porffor.IR.ptr(input);
    let j: i32 = Porffor.IR.ptr(output);

    while (i < endPtr) {
      const chr: i32 = Porffor.IR.loadU8(i++, 4);

      if ((chr >= 48 && chr <= 57) ||  // 0-9
          (chr >= 65 && chr <= 90) ||  // A-Z
          (chr >= 97 && chr <= 122) || // a-z
          chr == 33 || chr == 35 || chr == 36 || chr == 38 || chr == 39 ||
          chr == 40 || chr == 41 || chr == 42 || chr == 43 || chr == 44 ||
          chr == 45 || chr == 46 || chr == 47 || chr == 58 || chr == 59 ||
          chr == 61 || chr == 63 || chr == 64 || chr == 91 || chr == 93 ||
          chr == 95 || chr == 126) {
        Porffor.IR.storeU8(j++, 4, chr);
      } else {
        Porffor.IR.storeU8(j++, 4, 37); // %

        let nibble: i32 = chr >> 4;
        if (nibble < 10) {
          Porffor.IR.storeU8(j++, 4, nibble + 48);
        } else {
          Porffor.IR.storeU8(j++, 4, nibble + 55);
        }

        nibble = chr & 0x0F;
        if (nibble < 10) {
          Porffor.IR.storeU8(j++, 4, nibble + 48);
        } else {
          Porffor.IR.storeU8(j++, 4, nibble + 55);
        }
      }
    }

    return output;
  }

  // string input (utf-16)
  const endPtr: i32 = i + len * 2;

  // first pass: output length

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    // not encoded for encodeURI
    if ((chr >= 48 && chr <= 57) ||  // 0-9
        (chr >= 65 && chr <= 90) ||  // A-Z
        (chr >= 97 && chr <= 122) || // a-z
        chr == 33 || chr == 35 || chr == 36 || chr == 38 || chr == 39 ||
        chr == 40 || chr == 41 || chr == 42 || chr == 43 || chr == 44 ||
        chr == 45 || chr == 46 || chr == 47 || chr == 58 || chr == 59 ||
        chr == 61 || chr == 63 || chr == 64 || chr == 91 || chr == 93 ||
        chr == 95 || chr == 126) {
      outLength += 1;
    } else if (chr < 128) {
      outLength += 3; // %XX
    } else if (chr < 0x800) {
      outLength += 6; // %XX%XX
    } else {
      outLength += 9; // %XX%XX%XX
    }
  }

  // second pass: encode
  let output: bytestring = Porffor.malloc();
  output.length = outLength;

  i = Porffor.IR.ptr(input);
  let j: i32 = Porffor.IR.ptr(output);

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    if ((chr >= 48 && chr <= 57) ||  // 0-9
        (chr >= 65 && chr <= 90) ||  // A-Z
        (chr >= 97 && chr <= 122) || // a-z
        chr == 33 || chr == 35 || chr == 36 || chr == 38 || chr == 39 ||
        chr == 40 || chr == 41 || chr == 42 || chr == 43 || chr == 44 ||
        chr == 45 || chr == 46 || chr == 47 || chr == 58 || chr == 59 ||
        chr == 61 || chr == 63 || chr == 64 || chr == 91 || chr == 93 ||
        chr == 95 || chr == 126) {
      Porffor.IR.storeU8(j++, 4, chr);
    } else if (chr < 128) {
      // 1-byte utf-8
      Porffor.IR.storeU8(j++, 4, 37); // %

      let nibble: i32 = chr >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      nibble = chr & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    } else if (chr < 0x800) {
      // 2-byte utf-8
      const byte1: i32 = 0xC0 | (chr >> 6);
      const byte2: i32 = 0x80 | (chr & 0x3F);

      Porffor.IR.storeU8(j++, 4, 37); // %
      let nibble: i32 = byte1 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte1 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      Porffor.IR.storeU8(j++, 4, 37); // %
      nibble = byte2 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte2 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    } else {
      // 3-byte utf-8
      const byte1: i32 = 0xE0 | (chr >> 12);
      const byte2: i32 = 0x80 | ((chr >> 6) & 0x3F);
      const byte3: i32 = 0x80 | (chr & 0x3F);

      Porffor.IR.storeU8(j++, 4, 37); // %
      let nibble: i32 = byte1 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte1 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      Porffor.IR.storeU8(j++, 4, 37); // %
      nibble = byte2 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte2 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      Porffor.IR.storeU8(j++, 4, 37); // %
      nibble = byte3 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte3 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    }
  }

  return output;
};

export const encodeURIComponent = (input: any): bytestring => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  let outLength: i32 = 0;

  let i: i32 = Porffor.IR.ptr(input);

  if (Porffor.type(input) == Porffor.TYPES.bytestring) {
    const endPtr: i32 = i + len;

    // first pass: output length
    while (i < endPtr) {
      const chr: i32 = Porffor.IR.loadU8(i++, 4);

      // not encoded for encodeURIComponent
      if ((chr >= 48 && chr <= 57) ||  // 0-9
          (chr >= 65 && chr <= 90) ||  // A-Z
          (chr >= 97 && chr <= 122) || // a-z
          chr == 33 || chr == 39 || chr == 40 || chr == 41 || chr == 42 ||
          chr == 45 || chr == 46 || chr == 95 || chr == 126) {
        outLength += 1;
      } else {
        outLength += 3; // %XX
      }
    }

    // second pass: encode
    let output: bytestring = Porffor.malloc();
    output.length = outLength;

    i = Porffor.IR.ptr(input);
    let j: i32 = Porffor.IR.ptr(output);

    while (i < endPtr) {
      const chr: i32 = Porffor.IR.loadU8(i++, 4);

      if ((chr >= 48 && chr <= 57) ||  // 0-9
          (chr >= 65 && chr <= 90) ||  // A-Z
          (chr >= 97 && chr <= 122) || // a-z
          chr == 33 || chr == 39 || chr == 40 || chr == 41 || chr == 42 ||
          chr == 45 || chr == 46 || chr == 95 || chr == 126) {
        Porffor.IR.storeU8(j++, 4, chr);
      } else {
        Porffor.IR.storeU8(j++, 4, 37); // %

        let nibble: i32 = chr >> 4;
        if (nibble < 10) {
          Porffor.IR.storeU8(j++, 4, nibble + 48);
        } else {
          Porffor.IR.storeU8(j++, 4, nibble + 55);
        }

        nibble = chr & 0x0F;
        if (nibble < 10) {
          Porffor.IR.storeU8(j++, 4, nibble + 48);
        } else {
          Porffor.IR.storeU8(j++, 4, nibble + 55);
        }
      }
    }

    return output;
  }

  // string input (utf-16)
  const endPtr: i32 = i + len * 2;

  // first pass: output length

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    // not encoded for encodeURIComponent
    if ((chr >= 48 && chr <= 57) ||  // 0-9
        (chr >= 65 && chr <= 90) ||  // A-Z
        (chr >= 97 && chr <= 122) || // a-z
        chr == 33 || chr == 39 || chr == 40 || chr == 41 || chr == 42 ||
        chr == 45 || chr == 46 || chr == 95 || chr == 126) {
      outLength += 1;
    } else if (chr < 128) {
      outLength += 3; // %XX
    } else if (chr < 0x800) {
      outLength += 6; // %XX%XX
    } else {
      outLength += 9; // %XX%XX%XX
    }
  }

  // second pass: encode
  let output: bytestring = Porffor.malloc();
  output.length = outLength;

  i = Porffor.IR.ptr(input);
  let j: i32 = Porffor.IR.ptr(output);

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU16(i, 4);
    i += 2;

    if ((chr >= 48 && chr <= 57) ||  // 0-9
        (chr >= 65 && chr <= 90) ||  // A-Z
        (chr >= 97 && chr <= 122) || // a-z
        chr == 33 || chr == 39 || chr == 40 || chr == 41 || chr == 42 ||
        chr == 45 || chr == 46 || chr == 95 || chr == 126) {
      Porffor.IR.storeU8(j++, 4, chr);
    } else if (chr < 128) {
      // 1-byte utf-8
      Porffor.IR.storeU8(j++, 4, 37); // %

      let nibble: i32 = chr >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      nibble = chr & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    } else if (chr < 0x800) {
      // 2-byte utf-8
      const byte1: i32 = 0xC0 | (chr >> 6);
      const byte2: i32 = 0x80 | (chr & 0x3F);

      Porffor.IR.storeU8(j++, 4, 37); // %
      let nibble: i32 = byte1 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte1 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      Porffor.IR.storeU8(j++, 4, 37); // %
      nibble = byte2 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte2 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    } else {
      // 3-byte utf-8
      const byte1: i32 = 0xE0 | (chr >> 12);
      const byte2: i32 = 0x80 | ((chr >> 6) & 0x3F);
      const byte3: i32 = 0x80 | (chr & 0x3F);

      Porffor.IR.storeU8(j++, 4, 37); // %
      let nibble: i32 = byte1 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte1 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      Porffor.IR.storeU8(j++, 4, 37); // %
      nibble = byte2 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte2 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }

      Porffor.IR.storeU8(j++, 4, 37); // %
      nibble = byte3 >> 4;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
      nibble = byte3 & 0x0F;
      if (nibble < 10) {
        Porffor.IR.storeU8(j++, 4, nibble + 48);
      } else {
        Porffor.IR.storeU8(j++, 4, nibble + 55);
      }
    }
  }

  return output;
};

export const decodeURI = (input: any): string => {
  input = __ecma262_ToString(input);
  const len: i32 = input.length;
  let outLength: i32 = 0;

  // first pass: output length
  let i: i32 = Porffor.IR.ptr(input);
  const endPtr: i32 = i + len;

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU8(i++, 4);
    if (chr == 37 && i + 1 < endPtr) { // %
      const h1: i32 = Porffor.IR.loadU8(i, 4);
      const h2: i32 = Porffor.IR.loadU8(i + 1, 4);

      let n1: i32 = h1 - 48;
      if (n1 > 9) n1 = h1 - 55;
      if (n1 > 15) n1 = h1 - 87;

      let n2: i32 = h2 - 48;
      if (n2 > 9) n2 = h2 - 55;
      if (n2 > 15) n2 = h2 - 87;

      if (n1 >= 0 && n1 <= 15 && n2 >= 0 && n2 <= 15) {
        i += 2;
        const byte: i32 = (n1 << 4) | n2;
        // continuation bytes count nothing
        if ((byte & 0x80) == 0) {
          outLength += 1;
        } else if ((byte & 0xE0) == 0xC0) {
          outLength += 1;
        } else if ((byte & 0xF0) == 0xE0) {
          outLength += 1;
        }
      } else {
        outLength += 1;
      }
    } else {
      outLength += 1;
    }
  }

  // second pass: decode
  let output: string = Porffor.malloc();
  output.length = outLength;

  i = Porffor.IR.ptr(input);
  let j: i32 = Porffor.IR.ptr(output);

  while (i < endPtr) {
    const chr: i32 = Porffor.IR.loadU8(i++, 4);

    if (chr == 37 && i + 1 < endPtr) { // %
      const h1: i32 = Porffor.IR.loadU8(i, 4);
      const h2: i32 = Porffor.IR.loadU8(i + 1, 4);

      let n1: i32 = h1 - 48;
      if (n1 > 9) {
        n1 = h1 - 55;
        if (n1 > 15) n1 = h1 - 87;
      }

      let n2: i32 = h2 - 48;
      if (n2 > 9) {
        n2 = h2 - 55;
        if (n2 > 15) n2 = h2 - 87;
      }

      if (n1 >= 0 && n1 <= 15 && n2 >= 0 && n2 <= 15) {
        i += 2;
        const byte1: i32 = (n1 << 4) | n2;

        if ((byte1 & 0x80) == 0) {
          // 1 byte
          Porffor.IR.storeU16(j, 4, byte1);
          j += 2;
        } else if ((byte1 & 0xE0) == 0xC0 && i + 2 < endPtr && Porffor.IR.loadU8(i, 4) == 37) {
          // 2-byte utf-8
          const h3: i32 = Porffor.IR.loadU8(i + 1, 4);
          const h4: i32 = Porffor.IR.loadU8(i + 2, 4);

          let n3: i32 = h3 - 48;
          if (n3 > 9) {
            n3 = h3 - 55;
            if (n3 > 15) n3 = h3 - 87;
          }

          let n4: i32 = h4 - 48;
          if (n4 > 9) {
            n4 = h4 - 55;
            if (n4 > 15) n4 = h4 - 87;
          }

          if (n3 >= 0 && n3 <= 15 && n4 >= 0 && n4 <= 15) {
            i += 3;
            const byte2: i32 = (n3 << 4) | n4;
            const codepoint: i32 = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
            Porffor.IR.storeU16(j, 4, codepoint);
            j += 2;
          } else {
            Porffor.IR.storeU16(j, 4, chr);
            j += 2;
            i -= 2;
          }
        } else if ((byte1 & 0xF0) == 0xE0 && i + 5 < endPtr && Porffor.IR.loadU8(i, 4) == 37 && Porffor.IR.loadU8(i + 3, 4) == 37) {
          // 3-byte utf-8
          const h3: i32 = Porffor.IR.loadU8(i + 1, 4);
          const h4: i32 = Porffor.IR.loadU8(i + 2, 4);
          const h5: i32 = Porffor.IR.loadU8(i + 4, 4);
          const h6: i32 = Porffor.IR.loadU8(i + 5, 4);

          let n3: i32 = h3 - 48;
          if (n3 > 9) {
            n3 = h3 - 55;
            if (n3 > 15) n3 = h3 - 87;
          }

          let n4: i32 = h4 - 48;
          if (n4 > 9) {
            n4 = h4 - 55;
            if (n4 > 15) n4 = h4 - 87;
          }

          let n5: i32 = h5 - 48;
          if (n5 > 9) {
            n5 = h5 - 55;
            if (n5 > 15) n5 = h5 - 87;
          }

          let n6: i32 = h6 - 48;
          if (n6 > 9) {
            n6 = h6 - 55;
            if (n6 > 15) n6 = h6 - 87;
          }

          if (n3 >= 0 && n3 <= 15 && n4 >= 0 && n4 <= 15 && n5 >= 0 && n5 <= 15 && n6 >= 0 && n6 <= 15) {
            i += 6;
            const byte2: i32 = (n3 << 4) | n4;
            const byte3: i32 = (n5 << 4) | n6;
            const codepoint: i32 = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
            Porffor.IR.storeU16(j, 4, codepoint);
            j += 2;
          } else {
            Porffor.IR.storeU16(j, 4, chr);
            j += 2;
            i -= 2;
          }
        } else {
          Porffor.IR.storeU16(j, 4, byte1);
          j += 2;
        }
      } else {
        Porffor.IR.storeU16(j, 4, chr);
        j += 2;
        i -= 2;
      }
    } else {
      Porffor.IR.storeU16(j, 4, chr);
      j += 2;
    }
  }

  return output;
};

export const decodeURIComponent = (input: any): string => {
  // todo: should differ from decodeURI in reserved character/error handling
  return decodeURI(input);
};
