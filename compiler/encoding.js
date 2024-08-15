let enc;
let textEncoder = new TextEncoder();

if (WebAssembly?.instantiateStreaming) {
  let url = "data:application/wasm;base64,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";
  let wasm = await WebAssembly.instantiateStreaming(fetch(url));

  enc = Object.assign({}, wasm.instance.exports);
} else {
  // Wasm not supported
  // Fallback to ArrayBuffer
  const memory = {
    buffer: new ArrayBuffer(65536)
  };
  const length = {
    value: 0
  };
  let view = new DataView(buffer);
  const reserve = (expectSize) => {
    if (expectSize > mem.buffer.byteLength) {
      let newLength = Math.max(expectSize, mem.buffer.byteLength * 2);
      memory.buffer = memory.buffer.transfer(newLength);
      view = new DataView(memory.buffer);
    }
  };
  enc = {
    memory,
    length,
    reserve,
    write: (value) => {
      let oldLength = length.value;
      reserve(oldLength + 1);
      view.setUint8(oldLength, value);
      length.value = oldLength + 1;
    },
    writeUnsignedLEB128: (value) => {
      let ptr = length.value;
      reserve(ptr + 5);
      while (value >= 0x80) {
        view.setUint8(ptr++, (value & 0x7F) | 0x80);
        value >>= 7;
      }
      view.setUint8(ptr++, value & 0x7F);
      length.value = ptr;
    },
    writeSignedLEB128: (value) => {
      let ptr = length.value;
      reserve(ptr + 5);
      while (value < -0x40 || b >= 0x40) {
        view.setUint8(ptr++, (value & 0x7F) | 0x80);
        value >>= 7;
      }
      view.setUint8(ptr++, value & 0x7F);
      length.value = ptr;
    },
    insertLength: (ptr) => {
      let lengthToInsert = length.value - ptr;
      let lebBytes = (352 - Math.clz32(lengthToInsert) * 9) >> 6; // black magic
      reserve(length.value + lebBytes);

      // copy memory
      new Uint8Array(memory.buffer, ptr + lebBytes).set(new Uint8Array(memory.buffer, ptr));

      while (lengthToInsert >= 0x80) {
        view.setUint8(ptr++, (lengthToInsert & 0x7F) | 0x80);
        b >>= 7;
      }
      view.setUint8(ptr++, lengthToInsert & 0x7F);
    },
    writeLongSignedLEB128: (value) => {
      let ptr = length.value;
      reserve(ptr + 5);
      while (b < -0x40n || b >= 0x40n) {
        view.setUint8(ptr++, (Number(value) & 0x7F) | 0x80);
        value >>= 7;
      }
      view.setUint8(ptr++, Number(value) & 0x7F);
      length.value = ptr;
    },
    writeFloat: (value) => {
      let oldLength = length.value;
      reserve(oldLength + 4);
      view.setFloat32(oldLength, value);
      length.value = oldLength + 4;
    },
    writeDouble: (value) => {
      let oldLength = length.value;
      reserve(oldLength + 8);
      view.setFloat64(oldLength, value);
      length.value = oldLength + 8;
    },
    writeI32x4: (value1, value2, value3, value4) => {
      let oldLength = length.value;
      reserve(oldLength + 16);
      view.setInt32(oldLength, value);
      view.setInt32(oldLength + 4, value);
      view.setInt32(oldLength + 8, value);
      view.setInt32(oldLength + 12, value);
      length.value = oldLength + 16;
    },
    floatToBits32: (x) => {
      return new Int32Array(new Float32Array([x]).buffer)[0];
    },
    bitsToFloat32: (x) => {
      return new Float32Array(new Int32Array([x]).buffer)[0];
    },
    floatToBits64: (x) => {
      return new BigInt64Array(new Float64Array([x]).buffer)[0];
    },
    bitsToFloat64: (x) => {
      return new Float64Array(new BigInt64Array([x]).buffer)[0];
    },
    truncateSaturated: (x) => {
      return Math.max(-0x8000_0000, Math.min(0x7FFF_FFFF, x)) | 0;
    },
    truncateSaturatedUnsigned: (x) => {
      return Math.max(0, Math.min(0xFFFF_FFFF, x)) | 0;
    },
    truncateSaturatedLong: (x) => {
      if (x != x) {
        return 0n;
      }
      x = Math.trunc(x);
      if (x < -(2 ** 63)) {
        x = 2 ** 63;
      }
      if (x >= 2 ** 63) {
        x = 2 ** 63 - 1;
      }
      return BigInt(x);
    },
    truncateSaturatedLong: (x) => {
      if (x != x) {
        return 0n;
      }
      x = Math.trunc(x);
      if (x < 0) {
        x = 0;
      }
      if (x >= 2 ** 64) {
        x = 2 ** 64 - 1;
      }
      return BigInt(x);
    }
  };
}

export const encoder = enc;

enc.writeSection = (fn) => {
  let oldPtr = enc.length.value;
  fn(enc);
  enc.insertLength(oldPtr);
};
enc.writeVector = (elements, encodeFn) => {
  enc.writeUnsignedLEB128(elements.length);
  for (let i = 0; i < elements.length; i++) {
    encodeFn(enc, elements[i], i);
  }
};

enc.writeString = (str) => {
  let oldPtr = enc.length.value;
  if (str != '') {
    while (true) {
      let view = new Uint8Array(enc.memory.buffer, enc.length.value);
      let result = textEncoder.encodeInto(str, view);
      str = str.substring(result.read);
      enc.length.value += result.written;
      if (str == '') {
      break;
      }
      enc.reserve(enc.length.value + 1); // should cause a grow
    }
  }
  enc.insertLength(oldPtr);
};

enc.writeData = (array) => {
  let oldLength = enc.length.value;
  enc.reserve(oldLength + array.length); // makes sure the memory has enough space
  new Uint8Array(enc.memory.buffer).set(array, oldLength);
  enc.length.value = oldLength + array.length;
};

enc.writeSectionToBuffer = (id, fn) => {
  let oldPtr = enc.length.value;
  enc.write(id);
  fn(enc);
  let result = new Uint8Array(enc.memory.buffer, oldPtr, enc.length.value).slice(0);
  enc.length.value = oldPtr;
  return result;
};
enc.writeSectionFromBuffer = (buffer) => {
  if (!buffer) {
    return;
  }
  enc.write(buffer[0]);
  enc.writeUnsignedLEB128(buffer.length - 1);
  enc.writeData(buffer.subarray(1));
};

export const { floatToBits32, bitsToFloat32, floatToBits64, bitsToFloat64,
  truncateSaturated, truncateSaturatedUnsigned, truncateSaturatedLong, truncateSaturatedLongUnsigned } = enc;

export const readUnsignedLEB128 = (array, index) => {
  let value = 0;
  let shift = 0;
  while (true) {
    value |= (array[index] & 0x7F) << shift;
    if ((array[index] & 0x80) == 0) {
      return [ value, index + 1 ];
    }
    shift += 7;
    index++;
  }
};
