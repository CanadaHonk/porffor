import { Valtype, FuncType, ExportDesc, Section, Magic, Opcodes, PageSize, Reftype } from './wasmSpec.js';
import { unsignedLEB128_length, signedLEB128_length } from './encoding.js';
import { importedFuncs } from './builtins.js';
import { log } from './log.js';
import './prefs.js';

export default (funcs, globals, tags, pages, data, noTreeshake = false) => {
  let t = performance.now();
  const time = msg => {
    if (!Prefs.profileAssemble) return;

    console.log(`${' '.repeat(50)}\r[${(performance.now() - t).toFixed(2)}ms] ${msg}`);
    t = performance.now();
  };

  let importFuncs = globalThis.importFuncs = [];
  globalThis.importDelta = 0;
  if (!Prefs.treeshakeWasmImports || noTreeshake) {
    importFuncs = Array.from(importedFuncs);
  } else {
    // tree shake imports
    const remap = new WeakMap();
    for (let i = 0; i < funcs.length; i++) {
      const f = funcs[i];
      if (f.usesImports) for (let j = 0; j < f.wasm.length; j++) {
        const x = f.wasm[j];
        if (x[0] === Opcodes.call && x[1] < importedFuncs.length) {
          const func = importedFuncs[x[1]];
          if (!remap.has(func)) {
            remap.set(func, importFuncs.length);
            importFuncs.push(func);
          }
          f.wasm[j] = [ x[0], remap.get(func) ];
        }
      }
    }

    globalThis.importDelta = importedFuncs.length - importFuncs.length;
  }

  if (Prefs.optLog) log('assemble', `treeshake: using ${importFuncs.length}/${importedFuncs.length} imports`);
  time('import treeshake');

  // todo: this will just break if it is too small
  let bufferSize = 1024 * 1024; // 1MB
  let buffer = new Uint8Array(bufferSize);
  let offset = 0;

  const ensureBufferSize = added => {
    if (offset + added >= bufferSize - 64) {
      const newBuffer = new Uint8Array(bufferSize *= 2);
      newBuffer.set(buffer);
      buffer = null; // help gc
      buffer = newBuffer;
    }
  };

  const byte = byte => {
    ensureBufferSize(1);
    buffer[offset++] = byte;
  };

  const array = array => {
    ensureBufferSize(array.length);
    buffer.set(array, offset);
    offset += array.length;
  };

  const unsigned = n => {
    if (n === Infinity) return unsigned(4294967295);
    if (n === -Infinity) return unsigned(0);

    n |= 0;
    if (n >= 0 && n <= 127) return byte(n);

    do {
      let x = n & 0x7f;
      n >>>= 7;
      if (n !== 0) {
        x |= 0x80;
      }

      byte(x);
    } while (n !== 0);
  };

  const signed = n => {
    if (n === Infinity) return signed(2147483647);
    if (n === -Infinity) return signed(-2147483648);

    n |= 0;
    if (n >= 0 && n <= 63) return byte(n);

    while (true) {
      let x = n & 0x7f;
      n >>= 7;

      if ((n === 0 && (x & 0x40) === 0) || (n === -1 && (x & 0x40) !== 0)) {
        byte(x);
        break;
      } else {
        x |= 0x80;
      }

      byte(x);
    }
  };

  const ieee754 = n => {
    ensureBufferSize(8);
    array(new Uint8Array(new Float64Array([ n ]).buffer));
  };

  const string = str => {
    unsigned(str.length);
    for (let i = 0; i < str.length; i++) {
      byte(str.charCodeAt(i));
    }
  };

  const section = (id, bytes) => {
    byte(id);
    unsigned(bytes);
  };

  const unsignedPost = () => {
    const o = offset;
    offset += 5;
    return n => {
      const o2 = offset;
      offset = o;
      unsigned(n);

      buffer.set(buffer.subarray(o + 5, o2), offset);
      offset = o2 - (5 - (offset - o));
    };
  };

  array(Magic, Magic.length);
  time('setup');

  const types = [], typeCache = new Map();
  const getType = (params, returns) => {
    const hash = `${params.join()}_${returns.join()}`;
    if (typeCache.has(hash)) return typeCache.get(hash);

    const type = [ FuncType, params.length, ...params, returns.length, ...returns ];
    const idx = types.length;

    types.push(type);
    typeCache.set(hash, idx);
    return idx;
  };

  // precache all types to be used
  for (let i = 0; i < funcs.length; i++) {
    const func = funcs[i];
    getType(func.params, func.returns);
  }

  for (let i = 0; i < importFuncs.length; i++) {
    const func = importFuncs[i];
    getType(func.params, func.returns);
  }

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    getType(tag.params, tag.results);
  }

  section(Section.type, unsignedLEB128_length(types.length) + types.reduce((acc, x) => acc + x.length, 0));
  unsigned(types.length);
  for (let i = 0; i < types.length; i++) {
    array(types[i]);
  }
  time('type section');

  if (importFuncs.length > 0) {
    section(Section.import, unsignedLEB128_length(importFuncs.length) + importFuncs.length * 5);
    unsigned(importFuncs.length);
    for (let i = 0; i < importFuncs.length; i++) {
      const x = importFuncs[i];
      byte(0); byte(1);
      byte(x.import.charCodeAt(0));
      byte(ExportDesc.func);
      byte(getType(x.params, x.returns));
    }
  }
  time('import section');

  const indirectFuncs = [], exportFuncs = [];

  section(Section.func, unsignedLEB128_length(funcs.length) + funcs.length);
  unsigned(funcs.length);
  for (let i = 0; i < funcs.length; i++) {
    const x = funcs[i];
    byte(getType(x.params, x.returns));

    if (x.indirect) indirectFuncs.push(x);
    if (x.export) exportFuncs.push(x);
  }
  time('func section');

  if (pages.has('#func lut')) {
    if (data.addedFuncArgcLut) {
      // remove existing data
      data = data.filter(x => x.page !== '#func lut');
    }

    // generate func lut data
    const bytes = [];
    const bytesPerFunc = funcs.bytesPerFuncLut();
    for (let i = 0; i < indirectFuncs.length; i++) {
      const func = indirectFuncs[i].wrapperOf;

      // userland exposed .length
      const length = func.jsLength;
      bytes.push(length % 256, (length / 256 | 0) % 256);

      let flags = 0b00000000; // 8 flag bits
      if (func.returnType != null) flags |= 0b01;
      if (func.constr) flags |= 0b10;
      bytes.push(flags);

      let name = func.name;
      if (name.startsWith('#')) name = '';
      // eg: __String_prototype_toLowerCase -> toLowerCase
      if (name.startsWith('__')) name = name.split('_').pop();

      bytes.push(...new Uint8Array(new Int32Array([ Math.min(name.length, bytesPerFunc - 3 - 4) ]).buffer));
      for (let i = 0; i < (bytesPerFunc - 3 - 4); i++) {
        const c = name.charCodeAt(i);
        bytes.push((c || 0) % 256);
      }
    }

    if (Prefs.debugFuncLut) log('assemble', `func lut using ${bytes.length}/${pageSize * 2} (${bytesPerFunc} bytes per func)`);

    data.push({
      page: '#func lut',
      bytes
    });
    data.addedFuncArgcLut = true;
  }
  time('func lut');

  if (funcs.table) {
    section(Section.table, unsignedLEB128_length(indirectFuncs.length) + 3);
    byte(1); // table count
    byte(Reftype.funcref); byte(0); // table type
    unsigned(indirectFuncs.length); // table size
    time('table section');
  }

  if (Prefs.alwaysMemory && pages.size === 0) pages.set('--always-memory', 0);
  const usesMemory = pages.size > 0;
  if (usesMemory) {
    const pageCount = Math.ceil((pages.size * pageSize) / PageSize);
    section(Section.memory, unsignedLEB128_length(pageCount) + 2);
    byte(1); // memory count
    byte(0); // memory type
    unsigned(pageCount); // memory size
    time('memory section');
  }

  const usesTags = tags.length > 0;
  if (usesTags) {
    section(Section.tag, unsignedLEB128_length(tags.length) + tags.length * 2);
    unsigned(tags.length);
    for (let i = 0; i < tags.length; i++) {
      const x = tags[i];
      byte(0); // tag type
      byte(getType(x.params, x.results)); // tag signature
    }
    time('tag section');
  }

  const globalsValues = Object.values(globals);
  if (globalsValues.length > 0) {
    section(Section.global, unsignedLEB128_length(globalsValues.length) + globalsValues.length * 4
      + globalsValues.reduce((acc, x) => acc + (x.type === Valtype.f64 ? 8 : signedLEB128_length(x.init ?? 0)), 0));
    unsigned(globalsValues.length);
    for (let i = 0; i < globalsValues.length; i++) {
      const x = globalsValues[i];
      switch (x.type) {
        case Valtype.i32:
          byte(Valtype.i32);
          byte(0x01);
          byte(Opcodes.i32_const);
          signed(x.init ?? 0);
          break;

        case Valtype.i64:
          byte(Valtype.i64);
          byte(0x01);
          byte(Opcodes.i64_const);
          signed(x.init ?? 0);
          break;

        case Valtype.f64:
          byte(Valtype.f64);
          byte(0x01);
          byte(Opcodes.f64_const);
          ieee754(x.init ?? 0);
          break;
      }

      byte(Opcodes.end);
    }
    time('global section');
  }

  if (exportFuncs.length > 0 || usesMemory || usesTags) {
    byte(Section.export);
    const sizeOffset = offset, setSize = unsignedPost();

    unsigned(exportFuncs.length + usesMemory + usesTags);
    if (usesMemory) {
      string('$');
      byte(ExportDesc.mem); byte(0);
    }
    if (usesTags) {
      string('0');
      byte(ExportDesc.tag); byte(0);
    }

    for (let i = 0; i < exportFuncs.length; i++) {
      const x = exportFuncs[i];
      string(x.name === '#main' ? 'm' : x.name);
      byte(ExportDesc.func);
      unsigned(x.index - importDelta);
    }

    setSize(offset - sizeOffset - 5);
    time('export section');
  }

  if (funcs.table) {
    section(Section.element, unsignedLEB128_length(indirectFuncs.length) + 5 + indirectFuncs.reduce((acc, x) => acc + unsignedLEB128_length(x.index - importDelta), 0));
    byte(1); // table index
    byte(0); // element type
    byte(Opcodes.i32_const); byte(0); byte(Opcodes.end); // offset

    unsigned(indirectFuncs.length);
    for (let i = 0; i < indirectFuncs.length; i++) {
      const x = indirectFuncs[i];
      unsigned(x.index - importDelta);
    }
    time('element section');
  }

  if (data.length > 0) {
    section(Section.data_count, unsignedLEB128_length(data.length));
    unsigned(data.length);
    time('data count section');
  }

  byte(Section.code);
  const codeSectionSizeOffset = offset, setCodeSectionSize = unsignedPost();

  unsigned(funcs.length);
  for (let i = 0; i < funcs.length; i++) {
    const funcSizeOffset = offset, setFuncSize = unsignedPost();

    const x = funcs[i];
    const locals = Object.values(x.locals).sort((a, b) => a.idx - b.idx);

    const paramCount = x.params.length;
    let declCount = 0, lastType, typeCount = 0;
    for (let i = paramCount; i <= locals.length; i++) {
      const local = locals[i];
      if (lastType && local?.type !== lastType) {
        declCount++;
      }

      lastType = local?.type;
    }
    unsigned(declCount);

    lastType = undefined;
    for (let i = paramCount; i <= locals.length; i++) {
      const local = locals[i];
      if (lastType && local?.type !== lastType) {
        unsigned(typeCount);
        byte(lastType);
        typeCount = 0;
      }

      typeCount++;
      lastType = local?.type;
    }

    for (let i = 0; i < x.wasm.length; i++) {
      let o = x.wasm[i];
      const op = o[0];

      // encode local/global ops as unsigned leb128 from raw number
      if (
        (op >= Opcodes.local_get && op <= Opcodes.global_set) &&
        o[1] > 127
      ) {
        byte(op);
        unsigned(o[1]);
        continue;
      }

      // encode i32.const/i64.const ops as signed leb128 from raw number
      if (op === Opcodes.i32_const || op === Opcodes.i64_const) {
        byte(op);
        signed(o[1]);
        continue;
      }

      // encode f64.const ops as ieee754 from raw number
      if (op === Opcodes.f64_const) {
        byte(op);
        ieee754(o[1]);
        continue;
      }

      // encode call ops as unsigned leb128 from raw number
      if ((op === Opcodes.call /* || o[0] === Opcodes.return_call */) && o[1] >= importedFuncs.length) {
        byte(op);
        unsigned(o[1] - importDelta);
        continue;
      }

      // encode call indirect ops as types from info
      if (op === Opcodes.call_indirect) {
        const params = [ Valtype.i32 ];
        for (let i = 0; i < o[1]; i++) {
          params.push(valtypeBinary, Valtype.i32);
        }

        byte(op);
        byte(getType(params, [ valtypeBinary, Valtype.i32 ]));
        byte(o[2]);
        continue;
      }

      for (let j = 0; j < o.length; j++) {
        const x = o[j];
        if (x == null || !(x <= 0xff)) continue;
        buffer[offset++] = x;
      }
    }

    byte(Opcodes.end);
    setFuncSize(offset - funcSizeOffset - 5);
  }

  setCodeSectionSize(offset - codeSectionSizeOffset - 5);
  time('code section');

  section(Section.data, unsignedLEB128_length(data.length) + data.reduce((acc, x) =>
    acc + (x.page != null ? (3 + signedLEB128_length(pages.allocs.get(x.page) ?? (pages.get(x.page) * pageSize))) : 1)
    + unsignedLEB128_length(x.bytes.length) + x.bytes.length, 0));

  unsigned(data.length);
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    if (x.page != null) { // active
      let offset = pages.allocs.get(x.page) ?? (pages.get(x.page) * pageSize);
      if (offset === 0) offset = 16;

      byte(0x00);
      byte(Opcodes.i32_const);
      signed(offset);
      byte(Opcodes.end);
    } else { // passive
      byte(0x01);
    }

    unsigned(x.bytes.length);
    array(x.bytes);
  }
  time('data section');

  if (Prefs.d) {
    byte(Section.custom);
    const totalSizeOffset = offset, setTotalSize = unsignedPost();
    string('name');

    const section = (id, cb) => {
      byte(id);
      const sizeOffset = offset, setSize = unsignedPost();
      cb();
      setSize(offset - sizeOffset - 5);
    };

    section(0, () => { // module
      string('js'); // todo: filename?
    });

    section(1, () => { // funcs
      unsigned(funcs.length);
      for (let i = 0; i < funcs.length; i++) {
        const x = funcs[i];
        unsigned(x.index - importDelta);
        string(x.name);
      }
    });

    section(2, () => { // locals
      unsigned(funcs.length);
      for (let i = 0; i < funcs.length; i++) {
        const x = funcs[i];
        unsigned(x.index - importDelta);

        const locals = Object.keys(x.locals);
        unsigned(locals.length);
        for (let j = 0; j < locals.length; j++) {
          const name = locals[j];
          unsigned(x.locals[name]);
          string(name);
        }
      }
    });

    setTotalSize(offset - totalSizeOffset - 5);
    time('name section');
  }

  buffer = buffer.subarray(0, offset);
  return buffer;
};