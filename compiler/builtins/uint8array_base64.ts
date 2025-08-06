// @porf --valtype=i32
import type {} from './porffor.d.ts';

export const __Porffor_uint8array_validate = (ta: any) => {
  if (Porffor.type(ta) != Porffor.TYPES.uint8array) {
    throw new TypeError('Method called on incompatible receiver');
  }

  if (Porffor.wasm.i32.load(Porffor.wasm.i32.load(Porffor.wasm`local.get ${ta}`, 0, 4), 0, 0) == 4294967295) {
    throw new TypeError('Uint8Array has a detached ArrayBuffer');
  }
};

export const __Uint8Array_prototype_toBase64 = (_this: Uint8Array, options: any = undefined) => {
  let alphabet: string = 'base64';
  let omitPadding: boolean = false;

  if (Porffor.type(options) != Porffor.TYPES.undefined) {
    if (Porffor.type(options) != Porffor.TYPES.object) {
      throw new TypeError('Options must be an object');
    }

    const alphabetProp: any = options.alphabet;
    if (Porffor.type(alphabetProp) != Porffor.TYPES.undefined) {
      alphabet = alphabetProp;
    }

    const paddingProp: any = options.omitPadding;
    if (Porffor.type(paddingProp) != Porffor.TYPES.undefined) {
      omitPadding = !!paddingProp;
    }
  }

  if (!Porffor.strcmp(alphabet, 'base64') && !Porffor.strcmp(alphabet, 'base64url')) {
    throw new TypeError('Invalid alphabet');
  }

  __Porffor_uint8array_validate(_this);
  const taPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const len: i32 = Porffor.wasm.i32.load(taPtr, 0, 0);
  const bufferPtr: i32 = Porffor.wasm.i32.load(taPtr, 0, 4);

  const output: bytestring = Porffor.allocate();
  const outPtr: i32 = Porffor.wasm`local.get ${output}`;

  let alphabetStr: bytestring;
  if (Porffor.strcmp(alphabet, 'base64url')) {
    alphabetStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  } else {
    alphabetStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  }
  const alphabetPtr: i32 = Porffor.wasm`local.get ${alphabetStr}`;

  let i: i32 = 0;
  let j: i32 = outPtr;

  const fullChunks: i32 = (len / 3) * 3;
  while (i < fullChunks) {
    const b1: i32 = Porffor.wasm.i32.load8_u(bufferPtr + i++, 0, 4);
    const b2: i32 = Porffor.wasm.i32.load8_u(bufferPtr + i++, 0, 4);
    const b3: i32 = Porffor.wasm.i32.load8_u(bufferPtr + i++, 0, 4);

    const enc1: i32 = b1 >> 2;
    const enc2: i32 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3: i32 = ((b2 & 15) << 2) | (b3 >> 6);
    const enc4: i32 = b3 & 63;

    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc1, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc2, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc3, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc4, 0, 4), 0, 4);
  }

  const remaining: i32 = len - i;
  if (remaining == 1) {
    const b1: i32 = Porffor.wasm.i32.load8_u(bufferPtr + i, 0, 4);
    const enc1: i32 = b1 >> 2;
    const enc2: i32 = (b1 & 3) << 4;

    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc1, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc2, 0, 4), 0, 4);
    if (!omitPadding) {
    Porffor.wasm.i32.store8(j++, 61, 0, 4); // '='
    Porffor.wasm.i32.store8(j++, 61, 0, 4); // '='
    }
  } else if (remaining == 2) {
    const b1: i32 = Porffor.wasm.i32.load8_u(bufferPtr + i, 0, 4);
    const b2: i32 = Porffor.wasm.i32.load8_u(bufferPtr + i + 1, 0, 4);
    const enc1: i32 = b1 >> 2;
    const enc2: i32 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3: i32 = (b2 & 15) << 2;

    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc1, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc2, 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(alphabetPtr + enc3, 0, 4), 0, 4);
    if (!omitPadding) {
    Porffor.wasm.i32.store8(j++, 61, 0, 4); // '='
    }
  }

  output.length = j - Porffor.wasm`local.get ${output}`;
  return output;
};

export const __Uint8Array_prototype_toHex = (_this: Uint8Array) => {
  __Porffor_uint8array_validate(_this);
  const taPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const len: i32 = Porffor.wasm.i32.load(taPtr, 0, 0);
  const bufferPtr: i32 = Porffor.wasm.i32.load(taPtr, 0, 4);

  const output: bytestring = Porffor.allocate();
  const outPtr: i32 = Porffor.wasm`local.get ${output}`;

  const hexChars: bytestring = '0123456789abcdef';
  const hexPtr: i32 = Porffor.wasm`local.get ${hexChars}`;

  let i: i32 = 0;
  let j: i32 = outPtr;
  while (i < len) {
    const byte: i32 = Porffor.wasm.i32.load8_u(bufferPtr + i++, 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(hexPtr + (byte >> 4), 0, 4), 0, 4);
    Porffor.wasm.i32.store8(j++, Porffor.wasm.i32.load8_u(hexPtr + (byte & 15), 0, 4), 0, 4);
  }

  output.length = j - Porffor.wasm`local.get ${output}`;
  return output;
};

// Returns packed: (charsRead << 16) | bytesWritten
export const __Porffor_fromBase64 = (str: any, alphabet: any, lastChunkHandling: any, destPtr: i32, maxLength: i32) => {
  const strPtr: i32 = Porffor.wasm`local.get ${str}`;
  const strLen: i32 = str.length;

  if (!Porffor.strcmp(alphabet, 'base64') && !Porffor.strcmp(alphabet, 'base64url')) {
    throw new TypeError('Invalid alphabet');
  }

  const isBase64Url: boolean = Porffor.strcmp(alphabet, 'base64url');

  let j: i32 = destPtr;

  let i: i32 = 0;
  while (i < strLen) {
    let c1: i32 = 0, c2: i32 = 0, c3: i32 = 0, c4: i32 = 0;
    let chunkLength: i32 = 0;
    let chunkStartPos: i32 = i;

    while (i < strLen) {
      const ch: i32 = Porffor.wasm.i32.load8_u(strPtr + i++, 0, 4);
      if (ch >= 65 && ch <= 90) { // A-Z
        c1 = ch - 65;
        chunkLength = 1;
        break;
      }
      if (ch >= 97 && ch <= 122) { // a-z
        c1 = ch - 71;
        chunkLength = 1;
        break;
      }
      if (ch >= 48 && ch <= 57) { // 0-9
        c1 = ch + 4;
        chunkLength = 1;
        break;
      }
      if (ch == 43) { // +
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c1 = 62;
        chunkLength = 1;
        break;
      }
      if (ch == 47) { // /
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c1 = 63;
        chunkLength = 1;
        break;
      }
      if (ch == 45) { // -
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c1 = 62;
        chunkLength = 1;
        break;
      }
      if (ch == 95) { // _
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c1 = 63;
        chunkLength = 1;
        break;
      }
      if (ch == 61) { // =
        return (i << 16) | (j - destPtr);
      }
    }

    while (i < strLen) {
      const ch: i32 = Porffor.wasm.i32.load8_u(strPtr + i++, 0, 4);
      if (ch >= 65 && ch <= 90) { // A-Z
        c2 = ch - 65;
        chunkLength = 2;
        break;
      }
      if (ch >= 97 && ch <= 122) { // a-z
        c2 = ch - 71;
        chunkLength = 2;
        break;
      }
      if (ch >= 48 && ch <= 57) { // 0-9
        c2 = ch + 4;
        chunkLength = 2;
        break;
      }
      if (ch == 43) { // +
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c2 = 62;
        chunkLength = 2;
        break;
      }
      if (ch == 47) { // /
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c2 = 63;
        chunkLength = 2;
        break;
      }
      if (ch == 45) { // -
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c2 = 62;
        chunkLength = 2;
        break;
      }
      if (ch == 95) { // _
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c2 = 63;
        chunkLength = 2;
        break;
      }
      if (ch == 61) { // =
        return (i << 16) | (j - destPtr);
      }
    }

    while (i < strLen) {
      const ch: i32 = Porffor.wasm.i32.load8_u(strPtr + i++, 0, 4);
      if (ch >= 65 && ch <= 90) { // A-Z
        c3 = ch - 65;
        chunkLength = 3;
        break;
      }
      if (ch >= 97 && ch <= 122) { // a-z
        c3 = ch - 71;
        chunkLength = 3;
        break;
      }
      if (ch >= 48 && ch <= 57) { // 0-9
        c3 = ch + 4;
        chunkLength = 3;
        break;
      }
      if (ch == 43) { // +
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c3 = 62;
        chunkLength = 3;
        break;
      }
      if (ch == 47) { // /
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c3 = 63;
        chunkLength = 3;
        break;
      }
      if (ch == 45) { // -
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c3 = 62;
        chunkLength = 3;
        break;
      }
      if (ch == 95) { // _
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c3 = 63;
        chunkLength = 3;
        break;
      }
      if (ch == 61) { // =
        if (j - destPtr + 1 > maxLength) {
          return (chunkStartPos << 16) | (j - destPtr); // Not enough space
        }
        if (Porffor.strcmp(lastChunkHandling, 'strict') && (c2 & 15) != 0) {
          throw new SyntaxError('Invalid base64 padding');
        }
        const b1: i32 = (c1 << 2) | (c2 >> 4);
        Porffor.wasm.i32.store8(j++, b1, 0, 4);

        // Check if there's a second padding character and consume it
        if (i < strLen && Porffor.wasm.i32.load8_u(strPtr + i, 0, 4) == 61) {
          i++;
        }

        return (i << 16) | (j - destPtr);
      }
    }

    while (i < strLen) {
      const ch: i32 = Porffor.wasm.i32.load8_u(strPtr + i++, 0, 4);
      if (ch >= 65 && ch <= 90) { // A-Z
        c4 = ch - 65;
        chunkLength = 4;
        break;
      }
      if (ch >= 97 && ch <= 122) { // a-z
        c4 = ch - 71;
        chunkLength = 4;
        break;
      }
      if (ch >= 48 && ch <= 57) { // 0-9
        c4 = ch + 4;
        chunkLength = 4;
        break;
      }
      if (ch == 43) { // +
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c4 = 62;
        chunkLength = 4;
        break;
      }
      if (ch == 47) { // /
        if (isBase64Url) {
          throw new SyntaxError('Invalid base64url character');
        }
        c4 = 63;
        chunkLength = 4;
        break;
      }
      if (ch == 45) { // -
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c4 = 62;
        chunkLength = 4;
        break;
      }
      if (ch == 95) { // _
        if (!isBase64Url) {
          throw new SyntaxError('Invalid base64 character');
        }
        c4 = 63;
        chunkLength = 4;
        break;
      }
      if (ch == 61) { // =
        if (j - destPtr + 2 > maxLength) {
          return (chunkStartPos << 16) | (j - destPtr); // Not enough space
        }
        if (Porffor.strcmp(lastChunkHandling, 'strict') && (c3 & 3) != 0) {
          throw new SyntaxError('Invalid base64 padding');
        }
        const b1: i32 = (c1 << 2) | (c2 >> 4);
        const b2: i32 = ((c2 & 15) << 4) | (c3 >> 2);
        Porffor.wasm.i32.store8(j++, b1, 0, 4);
        Porffor.wasm.i32.store8(j++, b2, 0, 4);
        return (i << 16) | (j - destPtr);
      }
    }

    // Only check if we have space for 3 bytes if we actually have a complete 4-character chunk
    if (chunkLength == 4) {
      if (j - destPtr + 3 > maxLength) {
        return (chunkStartPos << 16) | (j - destPtr); // Stop if not enough space
      }

    const b1: i32 = (c1 << 2) | (c2 >> 4);
    const b2: i32 = ((c2 & 15) << 4) | (c3 >> 2);
    const b3: i32 = ((c3 & 3) << 6) | c4;

    Porffor.wasm.i32.store8(j++, b1, 0, 4);
    Porffor.wasm.i32.store8(j++, b2, 0, 4);
    Porffor.wasm.i32.store8(j++, b3, 0, 4);
    }
  }

  // Handle end-of-string with partial chunk according to lastChunkHandling
  if (chunkLength > 0) {
    if (Porffor.strcmp(lastChunkHandling, 'stop-before-partial')) {
      return (chunkStartPos << 16) | (j - destPtr); // Don't decode partial chunk
    }

    if (Porffor.strcmp(lastChunkHandling, 'strict')) {
      throw new SyntaxError('Invalid base64 string');
    }

    // 'loose' handling - decode partial chunk
    if (chunkLength == 1) {
      throw new SyntaxError('Invalid base64 string'); // 1 char is always invalid
    }

    if (chunkLength == 2) {
      if (j - destPtr + 1 > maxLength) {
        return (chunkStartPos << 16) | (j - destPtr); // Not enough space for 1 byte
      }
      if (Porffor.strcmp(lastChunkHandling, 'strict') && (c2 & 15) != 0) {
        throw new SyntaxError('Invalid base64 padding');
      }
      const b1: i32 = (c1 << 2) | (c2 >> 4);
      Porffor.wasm.i32.store8(j++, b1, 0, 4);
    } else if (chunkLength == 3) {
      if (j - destPtr + 2 > maxLength) {
        return (chunkStartPos << 16) | (j - destPtr); // Not enough space for 2 bytes
      }
      if (Porffor.strcmp(lastChunkHandling, 'strict') && (c3 & 3) != 0) {
        throw new SyntaxError('Invalid base64 padding');
      }
      const b1: i32 = (c1 << 2) | (c2 >> 4);
      const b2: i32 = ((c2 & 15) << 4) | (c3 >> 2);
      Porffor.wasm.i32.store8(j++, b1, 0, 4);
      Porffor.wasm.i32.store8(j++, b2, 0, 4);
    }
  }

  return (strLen << 16) | (j - destPtr);
};

export const __Uint8Array_fromBase64 = (str: any, options: any = undefined) => {
  if (Porffor.type(str) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  let alphabet: string = 'base64';
  let lastChunkHandling: string = 'loose';

  if (Porffor.type(options) != Porffor.TYPES.undefined) {
    if (Porffor.type(options) != Porffor.TYPES.object) {
      throw new TypeError('Options must be an object');
    }

    const alphabetProp: any = options.alphabet;
    if (Porffor.type(alphabetProp) != Porffor.TYPES.undefined) {
      alphabet = alphabetProp;
    }

    const lastChunkProp: any = options.lastChunkHandling;
    if (Porffor.type(lastChunkProp) != Porffor.TYPES.undefined) {
      lastChunkHandling = lastChunkProp;
    }
  }

  if (!Porffor.strcmp(alphabet, 'base64') && !Porffor.strcmp(alphabet, 'base64url')) {
    throw new TypeError('Invalid alphabet');
  }

  if (!Porffor.strcmp(lastChunkHandling, 'loose') && !Porffor.strcmp(lastChunkHandling, 'strict') && !Porffor.strcmp(lastChunkHandling, 'stop-before-partial')) {
    throw new TypeError('Invalid lastChunkHandling');
  }

  // Calculate exact output size based on input length and padding
  let exactSize: i32 = 0;
  const strLen: i32 = str.length;

  if (strLen == 0) {
    exactSize = 0;
  } else {
    // Count padding characters from the end
    let paddingCount: i32 = 0;
    const strPtr: i32 = Porffor.wasm`local.get ${str}`;
    let i: i32 = strLen - 1;
    while (i >= 0 && Porffor.wasm.i32.load8_u(strPtr + i, 0, 4) == 61) {
      paddingCount++;
      i--;
    }

    // Calculate exact size: 4 chars -> 3 bytes, minus padding
    const nonPaddingChars: i32 = strLen - paddingCount;
    exactSize = (nonPaddingChars * 3) / 4;
  }

  const ta: Uint8Array = new Uint8Array(exactSize);
  const taPtr: i32 = Porffor.wasm`local.get ${ta}`;
  const bufferPtr: i32 = Porffor.wasm.i32.load(taPtr, 0, 4);

  __Porffor_fromBase64(str, alphabet, lastChunkHandling, bufferPtr, exactSize);

  return ta;
};

export const __Uint8Array_prototype_setFromBase64 = (_this: Uint8Array, str: any, options: any = undefined) => {
  if (Porffor.type(str) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  let alphabet: string = 'base64';
  let lastChunkHandling: string = 'loose';

  if (Porffor.type(options) != Porffor.TYPES.undefined) {
    if (Porffor.type(options) != Porffor.TYPES.object) {
      throw new TypeError('Options must be an object');
    }

    const alphabetProp: any = options.alphabet;
    if (Porffor.type(alphabetProp) != Porffor.TYPES.undefined) {
      alphabet = alphabetProp;
    }

    const lastChunkProp: any = options.lastChunkHandling;
    if (Porffor.type(lastChunkProp) != Porffor.TYPES.undefined) {
      lastChunkHandling = lastChunkProp;
    }
  }

  if (!Porffor.strcmp(alphabet, 'base64') && !Porffor.strcmp(alphabet, 'base64url')) {
    throw new TypeError('Invalid alphabet');
  }

  if (!Porffor.strcmp(lastChunkHandling, 'loose') && !Porffor.strcmp(lastChunkHandling, 'strict') && !Porffor.strcmp(lastChunkHandling, 'stop-before-partial')) {
    throw new TypeError('Invalid lastChunkHandling');
  }

  __Porffor_uint8array_validate(_this);
  const taPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const byteLength: i32 = Porffor.wasm.i32.load(taPtr, 0, 0);
  const bufferPtr: i32 = Porffor.wasm.i32.load(taPtr, 0, 4);

  const result: i32 = __Porffor_fromBase64(str, alphabet, lastChunkHandling, bufferPtr, byteLength);
  const charsRead: i32 = result >> 16;
  const bytesWritten: i32 = result & 0xFFFF;

  const resultObj: object = {};
  resultObj.read = charsRead;
  resultObj.written = bytesWritten;

  return resultObj;
};

// Returns packed: (charsRead << 16) | bytesWritten
export const __Porffor_fromHex = (str: bytestring, destPtr: i32, maxLength: i32) => {
  const strPtr: i32 = Porffor.wasm`local.get ${str}`;
  const strLen: i32 = str.length;

  if ((strLen & 1) != 0) {
    throw new SyntaxError('Hex string must have even length');
  }

  let j: i32 = destPtr;

  let i: i32 = 0;
  const maxBytes: i32 = strLen / 2;
  const limit: i32 = maxBytes < maxLength ? maxBytes : maxLength;

  while (i < limit) {
    const h1: i32 = Porffor.wasm.i32.load8_u(strPtr + i * 2, 0, 4);
    const h2: i32 = Porffor.wasm.i32.load8_u(strPtr + i * 2 + 1, 0, 4);

    let v1: i32 = -1;
    let v2: i32 = -1;

    if (h1 >= 48 && h1 <= 57) v1 = h1 - 48; // 0-9
    else if (h1 >= 97 && h1 <= 102) v1 = h1 - 87; // a-f
    else if (h1 >= 65 && h1 <= 70) v1 = h1 - 55; // A-F

    if (h2 >= 48 && h2 <= 57) v2 = h2 - 48; // 0-9
    else if (h2 >= 97 && h2 <= 102) v2 = h2 - 87; // a-f
    else if (h2 >= 65 && h2 <= 70) v2 = h2 - 55; // A-F

    if (v1 == -1 || v2 == -1) {
      throw new SyntaxError('Invalid hex character');
    }

    const byte: i32 = (v1 << 4) | v2;
    Porffor.wasm.i32.store8(j++, byte, 0, 4);

    i++;
  }

  const charsRead: i32 = i * 2;
  return (charsRead << 16) | (j - destPtr);
};

export const __Uint8Array_fromHex = (str: any) => {
  if (Porffor.type(str) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  // Hex decoding: 2 chars -> 1 byte exactly
  const exactSize: i32 = str.length / 2;
  const ta: Uint8Array = new Uint8Array(exactSize);
  const taPtr: i32 = Porffor.wasm`local.get ${ta}`;
  const bufferPtr: i32 = Porffor.wasm.i32.load(taPtr, 0, 4);

  __Porffor_fromHex(str, bufferPtr, exactSize);

  return ta;
};

export const __Uint8Array_prototype_setFromHex = (_this: Uint8Array, str: any) => {
  if (Porffor.type(str) != Porffor.TYPES.bytestring) {
    throw new TypeError('First argument must be a string');
  }

  __Porffor_uint8array_validate(_this);
  const taPtr: i32 = Porffor.wasm`local.get ${_this}`;
  const byteLength: i32 = Porffor.wasm.i32.load(taPtr, 0, 0);
  const bufferPtr: i32 = Porffor.wasm.i32.load(taPtr, 0, 4);

  const result: i32 = __Porffor_fromHex(str, bufferPtr, byteLength);
  const charsRead: i32 = result >> 16;
  const bytesWritten: i32 = result & 0xFFFF;

  const resultObj: object = {};
  resultObj.read = charsRead;
  resultObj.written = bytesWritten;

  return resultObj;
};