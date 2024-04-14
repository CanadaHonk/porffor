// @porf -funsafe-no-unlikely-proto-checks -valtype=i32

// while (len >= 8) {
//   Porffor.wasm`
// local tmp i64
// local.get ${i}
// i64.load 0 4
// local.set tmp

// local k i64
// i64.const 0
// local.set k

// loop 64
// local.get ${j}

// local.get ${keyStrPtr}

// local.get tmp

// ;; k * 6
// i64.const 58

// local.get k
// i64.const 6
// i64.mul

// i64.sub

// ;; tmp >> (58 - (k * 6))
// i64.shr_u

// ;; (tmp >> (58 - (k * 6))) & 0x3f
// i64.const 63
// i64.and

// i32.wrap_i64

// ;; keyStrPtr + ...
// i32.add

// ;; load character from keyStr
// i32.load8_u 0 4

// ;; store in output at j
// i32.store8 0 4

// local.get ${j}
// i32.const 1
// i32.add
// local.set ${j}

// local.get k
// i64.const 1
// i64.add
// local.tee k

// i64.const 8
// i64.lt_s
// br_if 0
// end

// `;

//   // len -= 6;
//   i += 6;
// }

//     // while (k < 8) {
//     //   Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + Porffor.wasm.i32.wrap_i64(Porffor.wasm.i64.and(
//     //     Porffor.wasm.i64.shr_u(tmp, Porffor.wasm.i64.extend_i32_u(58 - k * 6)),
//     //     Porffor.wasm.i64.const(0x3f)
//     //   )), 0, 4), 0, 4);
//     //   k += 1;
//     // }

//     i += 6;
//     len -= 6;
//   }

export const btoa = (input: bytestring): bytestring => {
  const keyStr: bytestring = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  const keyStrPtr: i32 = Porffor.i32.ptrUnsafe(keyStr);

  let len: i32 = input.length;
  let output: bytestring = '';
  output.length = 4 * (len / 3 + !!(len % 3));

  let i: i32 = Porffor.i32.ptrUnsafe(input),
      j: i32 = Porffor.i32.ptrUnsafe(output);

  const endPtr = i + len;
  while (i < endPtr) {
    const chr1: i32 = Porffor.wasm.i32.load8_u(i++, 0, 4);
    const chr2: i32 = i < endPtr ? Porffor.wasm.i32.load8_u(i++, 0, 4) : -1;
    const chr3: i32 = i < endPtr ? Porffor.wasm.i32.load8_u(i++, 0, 4) : -1;

    const enc1: i32 = chr1 >> 2;
    const enc2: i32 = ((chr1 & 3) << 4) | (chr2 == -1 ? 0 : (chr2 >> 4));
    let enc3: i32 = ((chr2 & 15) << 2) | (chr3 == -1 ? 0 : (chr3 >> 6));
    let enc4: i32 = chr3 & 63;

    if (chr2 == -1) {
      enc3 = 64;
      enc4 = 64;
    } else if (chr3 == -1) {
      enc4 = 64;
    }

    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc1, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc2, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc3, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(keyStrPtr + enc4, 0, 4), 0, 4);
  }

  return output;
};

/* var atob = function (input) {
  const keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

  let output = "";
  let chr1, chr2, chr3;
  let enc1, enc2, enc3, enc4;
  let i = 0;

  while (i < input.length) {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    // output += String.fromCharCode(chr1);
    Porffor.bytestring.appendCharCode(output, chr1);

    if (enc3 != 64) {
      // output += String.fromCharCode(chr2);
      Porffor.bytestring.appendCharCode(output, chr2);
    }
    if (enc4 != 64) {
      // output += String.fromCharCode(chr3);
      Porffor.bytestring.appendCharCode(output, chr3);
    }
  }

  return output;
}; */