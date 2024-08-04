import { Opcodes, PageSize, Valtype } from './wasmSpec.js';
import { number } from './embedding.js';
import {} from './prefs.js';

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
    if (ind === 0) return 16;
    return ind * PageSize;
  }

  alloc({ scope, pages }, name, { itemType }) {
    let scopeName = scope.name;
    if (globalThis.precompile && scopeName === 'main') scopeName = globalThis.precompile;
    const reason = `${this.allocType(itemType)}: ${Prefs.scopedPageNames ? (scopeName + '/') : ''}${name}`;

    this.lastName = reason;
    if (pages.has(reason)) {
      const ptr = this.lastPtr = this.ptr(pages.get(reason).ind);
      return number(ptr, Valtype.i32);
    }

    if (reason.startsWith('array:')) pages.hasArray = true;
    if (reason.startsWith('string:')) pages.hasString = true;
    if (reason.startsWith('bytestring:')) pages.hasByteString = true;
    if (reason.includes('string:')) pages.hasAnyString = true;

    let ind = pages.size;
    pages.set(reason, { ind, type: itemType });

    scope.pages ??= new Map();
    scope.pages.set(reason, { ind, type: itemType });

    const ptr = this.lastPtr = this.ptr(ind);
    return number(ptr, Valtype.i32);
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