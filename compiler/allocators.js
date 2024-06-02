import { Opcodes, PageSize, Valtype } from './wasmSpec.js';
import { number } from './embedding.js';
import Prefs from './prefs.js';

// we currently have 3 allocators:
// - static (default): a static/compile-time allocator. fast (no grow/run-time alloc needed) but can break some code
// - grow: perform a memory.grow every allocation. simple but maybe slow?
// - chunk: perform large memory.grow's in chunks when needed. needs investigation

export default name => {
  switch (name) {
    case 'static': return new StaticAllocator();
    case 'grow': return new GrowAllocator();
    case 'chunk': return new ChunkAllocator();
    default: throw new Error(`unknown allocator: ${name}`);
  }
};

export class StaticAllocator {
  constructor() {
  }

  allocType(itemType) {
    switch (itemType) {
      case 'i8': return 'bytestring';
      case 'i16': return 'string';

      default: return 'array';
    }
  }

  ptr(ind) {
    if (ind === 0) return 4;
    return ind * PageSize;
  }

  alloc({ scope, pages }, name, { itemType }) {
    const reason = `${this.allocType(itemType)}: ${Prefs.scopedPageNames ? (scope.name + '/') : ''}${name}`;
    if (Prefs.allocLog) console.log(reason)

    if (pages.has(reason)) return number(this.ptr(pages.get(reason).ind), Valtype.i32);

    if (reason.startsWith('array:')) pages.hasArray = true;
    if (reason.startsWith('string:')) pages.hasString = true;
    if (reason.startsWith('bytestring:')) pages.hasByteString = true;
    if (reason.includes('string:')) pages.hasAnyString = true;

    let ind = pages.size;
    pages.set(reason, { ind, type: itemType });

    scope.pages ??= new Map();
    scope.pages.set(reason, { ind, type: itemType });

    return number(this.ptr(ind), Valtype.i32);
  }

  stringPageIndex = 0;

  allocString(pages, str) {
    let page = { ind: -1, strs: [], strIndex: new Map(), byteSize: 0 }
    let size = Prefs.bytestring ? 1 : 2;
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 0xFF) {
        size = 2;
        break;
      }
    }
    pages.hasAnyString = true;
    if (size == 1) pages.hasByteString = true;
    else pages.hasString = true;
    
    for (let i = 0; i < this.stringPageIndex; i++) {
      if (pages.has(`strings${i}`)) {
        const p = pages.get(`strings${i}`);
        const index = p.strIndex.get(str);
        if (index) {
          if (Prefs.allocLog) console.log("cstr/ref: "+ str)
          return [p.strs[index].ptr, true];
        }
        if ((p.byteSize + (4 + str.length * size)) >= pageSize) {
          page = p;
          break;
        }
      }
    }
    if (page.ind == -1) {
      const ind = pages.size;
      page.ind = ind;
      pages.set(`strings${this.stringPageIndex}`, page);
      this.stringPageIndex++;
    }

    let ptr = this.ptr(page.ind) + page.byteSize;
    page.byteSize += 4 + str.length * size; // u32 + u16[len] (or u8)
    const index = page.strs.push({ str, ptr, size }) - 1;
    page.strIndex.set(str, index);

    if (Prefs.allocLog) console.log("cstr/init: "+ str)
    return [ptr, false];
  }
}

export class GrowAllocator {
  constructor() {
    Prefs.rmUnusedTypes = false;
  }

  alloc() {
    return [
      // grow by 1 page
      [ Opcodes.i32_const, 1 ],
      [ Opcodes.memory_grow, 0 ], // returns old page count

      // get ptr (page count * page size)
      number(65536, Valtype.i32)[0],
      [ Opcodes.i32_mul ]
    ];
  }
}

export class ChunkAllocator {
  constructor(chunkSize) {
    Prefs.rmUnusedTypes = false;

    // 64KiB * chunk size each growth
    // 16: 1MiB chunks
    this.chunkSize = chunkSize ?? Prefs.chunkAllocatorSize ?? 16;
  }

  alloc({ asmFunc, funcIndex }) {
    const func = funcIndex['#chunkallocator_alloc'] ?? asmFunc('#chunkallocator_alloc', {
      wasm: [
        [ Opcodes.global_get, 0 ],
        [ Opcodes.global_get, 1 ],
        [ Opcodes.i32_ge_s ],
        [ Opcodes.if, Valtype.i32 ], // ptr >= next
          // grow by chunk size pages
          [ Opcodes.i32_const, this.chunkSize ],
          [ Opcodes.memory_grow, 0 ],

          // ptr = prev memory size * PageSize
          number(65536, Valtype.i32)[0],
          [ Opcodes.i32_mul ],
          [ Opcodes.global_set, 0 ],

          // next = ptr + ((chunkSize - 1) * PageSize)
          [ Opcodes.global_get, 0 ],
          number(65536 * (this.chunkSize - 1), Valtype.i32)[0],
          [ Opcodes.i32_add ],
          [ Opcodes.global_set, 1 ],

          // return ptr
          [ Opcodes.global_get, 0 ],
        [ Opcodes.else ],
          // return ptr = ptr + PageSize
          [ Opcodes.global_get, 0 ],
          number(65536, Valtype.i32)[0],
          [ Opcodes.i32_add ],
          [ Opcodes.global_set, 0 ],
          [ Opcodes.global_get, 0 ],
        [ Opcodes.end ],
      ],
      params: [],
      locals: [],
      globals: [ Valtype.i32, Valtype.i32 ],
      globalNames: ['#chunkallocator_ptr', '#chunkallocator_next'],
      returns: [ Valtype.i32 ],
    }).index;

    return [
      [ Opcodes.call, func ]
    ];
  }
}