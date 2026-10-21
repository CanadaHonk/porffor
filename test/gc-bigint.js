// Native GC scanner regression: bit 0 is the stack root, bit 1 the untyped block.
// Bit 2 is set if a value just outside the heap-BigInt encoding marks the allocation.
function probe() {
  let stackMarked = 0;
  let blockMarked = 0;
  let falseMarked = 0;
  Porffor.c`
    u32 bigint = porf_alloc(16, 4);
    u32 holder = porf_alloc(32, 0);
    for (i32 ci = 0; ci < PORF_GC_NCLASSES; ci++) porf_gc_publish_window(ci);
    const u32 gran = porf_gc_gran(bigint);
    volatile f64 encoded = 2251799813685248.0 + (f64)bigint;
    volatile f64 outside[4] = {
      2251799813685248.0 + (f64)bigint + 0.5,
      2251804108652544.0 + (f64)bigint,
      -(2251799813685248.0 + (f64)bigint),
      2251799813685248.0
    };
    for (i32 i = 0; i < 4; i++) {
      porf_gc_bit_clear(PORF_GC_B_MARK, gran);
      f64 d = outside[i];
      u64 bits;
      memcpy(&bits, &d, 8);
      // Only the f64 decoding is under test: skip values whose 32-bit halves alias the block.
      if (porf_gc_gran((u32)bits) == gran || porf_gc_gran((u32)(bits >> 32)) == gran) continue;
      porf_gc_cons_scan_range((const u64*)&outside[i], (const u64*)&outside[i] + 1);
      if (porf_gc_bit(PORF_GC_B_MARK, gran) != 0u) falseMarked = 1;
    }
    porf_gc_bit_clear(PORF_GC_B_MARK, gran);
    porf_gc_cons_scan_range((const u64*)&encoded, (const u64*)((const char*)&encoded + sizeof(encoded)));
    stackMarked = porf_gc_bit(PORF_GC_B_MARK, gran) != 0u;
    porf_gc_bit_clear(PORF_GC_B_MARK, gran);
    *(u64*)(MEM + holder) = 0xffffffffffffffffull;
    *(f64*)(MEM + holder + 8) = encoded;
    porf_gc_bit_clear(PORF_GC_B_MARK, porf_gc_gran(holder));
    porf_gc_kinds[porf_gc_gran(holder)] = 0;
    porf_gc_cons_mark_block((i32)holder);
    blockMarked = porf_gc_bit(PORF_GC_B_MARK, gran) != 0u;
  `;
  return stackMarked + blockMarked * 2 + falseMarked * 4;
}
const marked = probe();
console.log(marked);
if (marked !== 3) throw new Error("heap BigInt was not marked, or a value outside its encoding was");
