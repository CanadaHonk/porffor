// @porf --closures
import type {} from './porffor.d.ts';

// regexp engine v2: pattern -> ast -> analyze -> bytecode -> backtracking interpreter
//
// regexp object (24 bytes per instance, gc: source traced, blob raw, names as array):
//   0 @ source ptr (u32)
//   4 @ flags (u16): g 1, i 2, m 4, s 8, u 16, y 32, d 64, v 128
//   6 @ capture count (u16)
//   8 @ lastIndex (i32)   - codegen stores here for `re.lastIndex = x`
//  12 @ blob ptr (u32)    - shared immutable compiled pattern
//  16 @ names ptr (u32)   - any[] of [name, groupIdx, ...] pairs, 0 if no named groups
//
// blob (shared per unique pattern+flags via cache, no heap pointers):
//   0 @ min match length in units (u16)
//   2 @ prefilter kind (u8): 0 none, 1 anchored start, 2 single unit, 3 first-unit bitmap
//   3 @ wide start (u8)    - first unit may be >255 (disables bitmap scan on utf16 input)
//   4 @ prefilter unit (u16)
//   6 @ counter slots (u8)
//   7 @ (pad)
//   8 @ first-unit bitmap (32 bytes)
//  40 @ bytecode
//
// cache entry (24 bytes, layout mirrored by porf_gc_scan_regex_cache in render.js):
//   0 next, 4 pattern (bytestring), 8 flags (bytestring), 12 blob, 16 names, 20 capCount u16, 22 padding
//
// bytecode ops (jump targets are u16 absolute offsets from bytecode start):
//   0x00 accept
//   0x01 char1 [u8]                     - unit compare
//   0x02 char2 [u16]                    - unit compare
//   0x03 charPair [u16][u16]            - unit == a || unit == b (case pair)
//   0x04 bitmap [32B]                   - unit < 256 && bit set
//   0x05 class [nR u16][32B bitmap][lo u32, hi u32]*nR
//        cp < 256: bitmap, else bsearch ranges (all >255), negation baked in
//   0x06 any1                           - consume one unit/cp unconditionally
//   0x07 runChar [backward u8][min u16][max u16][unit u16]
//   0x08 runBitmap [backward u8][min u16][max u16][32B]
//   0x09 runClass [backward u8][min u16][max u16][class payload]
//   0x0a runAny [backward u8][min u16][max u16]
//   0x0b fork [prefer u16][alt u16]
//   0x0c jump [target u16]
//   0x0d forkLoop [slot u8][prefer u16][alt u16]
//   0x0e loopEnd [slot u8][target u16]  - empty iteration -> backtrack, else jump
//   0x0f counterReset [slot u8]
//   0x10 counterFork [slot u8][lazy u8][min u16][max u16][exit u16]
//   0x11 counterInc [slot u8]
//   0x12 capWrite [idx u8][which u8]    - which: 0 start edge, 1 end edge
//   0x13 capClear [from u8][to u8]
//   0x14 backref [idx u8]
//   0x15 backrefMulti [count u8][idx u8]*count
//   0x16 assertStart
//   0x17 assertEnd
//   0x18 assertWordB
//   0x19 assertNotWordB
//   0x1a lookStart [neg u8][behind u8][after u16]
//   0x1b lookEnd
//   0x1c reject
//   0x1d charCp [u32]                   - astral code point (u mode), consumes both units
//   0x1e loopEndCounted [slot u8][min u16][target u16]
//   0x1f forkLoopLazy [slot u8][exit u16]
//   0x20 runNotChar [backward u8][min u16][max u16][unit u16]
//   0x22 assertStartM, 0x23 assertEndM  - multiline variants (m flag or modifier)
//   0x24 assertWordBI, 0x25 assertNotWordBI, 0x26 backrefI, 0x27 backrefMultiI - ignoring case
//
// backtrack entries are 5 i32s: [kind, pc, a, b, undoTop]
//   kind 0 fork: pc alt target, a sp
//   kind 1 greedy run fwd: pc resume, a low sp, b cur sp (b-- until a)
//   kind 2 greedy run bwd: pc resume, a high sp, b cur sp (b++ until a)
//          bit 2 marks code-point-aware stepping for either run kind
//   kind 3 look frame boundary: a frame index
//   kind 7 lazy loop body: pc body, a sp, b loop slot

// scratch buffers are bytestring jsvals so gc keeps them alive
let __Porffor_regex_cache: i32 = 0;
let __Porffor_regex_mruPattern: i32 = 0;
let __Porffor_regex_mruFlags: i32 = 0;
let __Porffor_regex_mruBlob: i32 = 0;
let __Porffor_regex_mruNames: any = 0;
let __Porffor_regex_mruCaps: i32 = 0;

let __Porffor_regex_bufNodes: any = 0;
let __Porffor_regex_capNodes: i32 = 0;
let __Porffor_regex_bufRanges: any = 0;
let __Porffor_regex_capRanges: i32 = 0;
let __Porffor_regex_bufBc: any = 0;
let __Porffor_regex_capBc: i32 = 0;
let __Porffor_regex_bufBt: any = 0;
let __Porffor_regex_capBt: i32 = 0;
let __Porffor_regex_bufUndo: any = 0;
let __Porffor_regex_capUndo: i32 = 0;
let __Porffor_regex_bufAux: any = 0;
let __Porffor_regex_capAux: i32 = 0;

export const __Porffor_regex_alloc = (bytes: i32): any => {
  const ptr: i32 = Porffor.malloc(bytes);
  return ptr as bytestring;
};

// decoded lazily on first use
let __Porffor_regex_ucdGcDec: any = 0; // decoded: n range starts (i32) then their gc indices (u8)
let __Porffor_regex_ucdGcN: i32 = 0;
let __Porffor_regex_ucdFoldDec: any = 0; // decoded runs of 4 i32: start, count, stride, delta
let __Porffor_regex_ucdFoldN: i32 = 0;
let __Porffor_regex_ucdCanonDec: any = 0;
let __Porffor_regex_ucdCanonN: i32 = 0;

let __Porffor_regex_vPos: i32 = 0;

// cp arrays, never exactly one cp: those go to ranges
let __Porffor_regex_vOpStrs: any = 0;

// marker: included by codegen when a string in the program could be v flags, v-mode classes are only linked in then
export const __Porffor_regex_vUsed = (): void => {};

export const __Porffor_regex_vStrsPush = (s: any[]): void => {
  if (__Porffor_regex_vOpStrs == 0) __Porffor_regex_vOpStrs = Porffor.array.new(4);
  Porffor.array.fastPush(__Porffor_regex_vOpStrs, s);
};

export const __Porffor_regex_varint = (ptr: i32): i32 => {
  // read the varint at vPos and advance it, ptr is the raw data base
  let pos: i32 = __Porffor_regex_vPos;
  let v: i32 = 0;
  let shift: i32 = 0;
  while (true) {
    const b: i32 = Porffor.IR.loadU8(ptr + pos, 0);
    pos += 1;
    v |= (b & 127) << shift;
    if ((b & 128) == 0) break;
    shift += 7;
  }
  __Porffor_regex_vPos = pos;
  return v;
};

export const __Porffor_regex_ucdInitGc = (): void => {
  if (__Porffor_regex_ucdGcDec != 0) return;
  const data: i32 = Porffor.IR.ptr(__Porffor_regex_ucdGc()) + 4;
  __Porffor_regex_vPos = 0;
  const n: i32 = __Porffor_regex_varint(data);
  const dec: any = __Porffor_regex_alloc(n * 5);
  const starts: i32 = Porffor.IR.ptr(dec);
  const gcs: i32 = starts + n * 4;
  let cp: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    Porffor.IR.storeI32(starts + i * 4, 0, cp);
    cp += __Porffor_regex_varint(data);
    Porffor.IR.storeU8(gcs + i, 0, Porffor.IR.loadU8(data + __Porffor_regex_vPos, 0));
    __Porffor_regex_vPos += 1;
  }
  __Porffor_regex_ucdGcDec = dec;
  __Porffor_regex_ucdGcN = n;
};

export const __Porffor_regex_ucdInitMap = (which: i32): void => {
  // which: 0 = iu fold, 1 = non-u canon
  if (which == 0 ? __Porffor_regex_ucdFoldDec != 0 : __Porffor_regex_ucdCanonDec != 0) return;
  const data: i32 = (which == 0 ? Porffor.IR.ptr(__Porffor_regex_ucdFold()) : Porffor.IR.ptr(__Porffor_regex_ucdCanon())) + 4;
  __Porffor_regex_vPos = 0;
  const n: i32 = __Porffor_regex_varint(data);
  const dec: any = __Porffor_regex_alloc(n * 16);
  const base: i32 = Porffor.IR.ptr(dec);
  let start: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    start += __Porffor_regex_varint(data);
    const cs: i32 = __Porffor_regex_varint(data);
    const zz: i32 = __Porffor_regex_varint(data);
    const delta: i32 = (zz & 1) ? -((zz + 1) >> 1) : (zz >> 1);
    Porffor.IR.storeI32(base + i * 16, 0, start);
    Porffor.IR.storeI32(base + i * 16, 4, cs >> 1); // count
    Porffor.IR.storeI32(base + i * 16, 8, (cs & 1) + 1); // stride
    Porffor.IR.storeI32(base + i * 16, 12, delta);
  }
  if (which == 0) {
    __Porffor_regex_ucdFoldDec = dec;
    __Porffor_regex_ucdFoldN = n;
  } else {
    __Porffor_regex_ucdCanonDec = dec;
    __Porffor_regex_ucdCanonN = n;
  }
};

export const __Porffor_regex_mapCp = (which: i32, cp: i32): i32 => {
  // map cp through fold (0) or non-u canon (1) runs, unmapped cps come back unchanged
  __Porffor_regex_ucdInitMap(which);
  const dec: any = which == 0 ? __Porffor_regex_ucdFoldDec : __Porffor_regex_ucdCanonDec;
  const n: i32 = which == 0 ? __Porffor_regex_ucdFoldN : __Porffor_regex_ucdCanonN;
  const base: i32 = Porffor.IR.ptr(dec);
  let lo: i32 = 0;
  let hi: i32 = n - 1;
  while (lo < hi) {
    const mid: i32 = (lo + hi + 1) >> 1;
    if (Porffor.IR.loadI32(base + mid * 16, 0) <= cp) lo = mid;
      else hi = mid - 1;
  }
  if (n == 0 || Porffor.IR.loadI32(base + lo * 16, 0) > cp) return cp;
  const start: i32 = Porffor.IR.loadI32(base + lo * 16, 0);
  const count: i32 = Porffor.IR.loadI32(base + lo * 16, 4);
  const stride: i32 = Porffor.IR.loadI32(base + lo * 16, 8);
  const off: i32 = cp - start;
  if (off % stride != 0) return cp;
  if (off / stride >= count) return cp;
  return cp + Porffor.IR.loadI32(base + lo * 16, 12);
};

// ranges arena: i32 (lo, hi) pairs, stack discipline: callers remember rangesTop and pass (start, count)

let __Porffor_regex_rangesTop: i32 = 0;

export const __Porffor_regex_rangesEnsure = (need: i32): void => {
  const needBytes: i32 = (__Porffor_regex_rangesTop + need) * 8;
  if (needBytes <= __Porffor_regex_capRanges) return;
  let newCap: i32 = __Porffor_regex_capRanges == 0 ? 4096 : __Porffor_regex_capRanges;
  while (newCap < needBytes) newCap *= 2;
  const nbuf: any = __Porffor_regex_alloc(newCap);
  if (__Porffor_regex_bufRanges != 0) Porffor.IR.copy(Porffor.IR.ptr(nbuf), Porffor.IR.ptr(__Porffor_regex_bufRanges), __Porffor_regex_rangesTop * 8);
  __Porffor_regex_bufRanges = nbuf;
  __Porffor_regex_capRanges = newCap;
};

export const __Porffor_regex_rangePush = (lo: i32, hi: i32): void => {
  __Porffor_regex_rangesEnsure(1);
  const p: i32 = Porffor.IR.ptr(__Porffor_regex_bufRanges) + __Porffor_regex_rangesTop * 8;
  Porffor.IR.storeI32(p, 0, lo);
  Porffor.IR.storeI32(p, 4, hi);
  __Porffor_regex_rangesTop += 1;
};

export const __Porffor_regex_rangeLo = (idx: i32): i32 => Porffor.IR.loadI32(Porffor.IR.ptr(__Porffor_regex_bufRanges) + idx * 8, 0);
export const __Porffor_regex_rangeHi = (idx: i32): i32 => Porffor.IR.loadI32(Porffor.IR.ptr(__Porffor_regex_bufRanges) + idx * 8, 4);
export const __Porffor_regex_rangeSet = (idx: i32, lo: i32, hi: i32): void => {
  const p: i32 = Porffor.IR.ptr(__Porffor_regex_bufRanges) + idx * 8;
  Porffor.IR.storeI32(p, 0, lo);
  Porffor.IR.storeI32(p, 4, hi);
};

// insertion sort, then merge overlapping ranges in place, returns new count
export const __Porffor_regex_rangesNormalize = (start: i32, count: i32): i32 => {
  for (let i: i32 = start + 1; i < start + count; i++) {
    const lo: i32 = __Porffor_regex_rangeLo(i);
    const hi: i32 = __Porffor_regex_rangeHi(i);
    let j: i32 = i - 1;
    while (j >= start && __Porffor_regex_rangeLo(j) > lo) {
      __Porffor_regex_rangeSet(j + 1, __Porffor_regex_rangeLo(j), __Porffor_regex_rangeHi(j));
      j -= 1;
    }
    __Porffor_regex_rangeSet(j + 1, lo, hi);
  }

  let out: i32 = start;
  for (let i: i32 = start; i < start + count; i++) {
    const lo: i32 = __Porffor_regex_rangeLo(i);
    const hi: i32 = __Porffor_regex_rangeHi(i);
    if (out > start && lo <= __Porffor_regex_rangeHi(out - 1) + 1) {
      if (hi > __Porffor_regex_rangeHi(out - 1)) __Porffor_regex_rangeSet(out - 1, __Porffor_regex_rangeLo(out - 1), hi);
    } else {
      __Porffor_regex_rangeSet(out, lo, hi);
      out += 1;
    }
  }
  __Porffor_regex_rangesTop = out;
  return out - start;
};

// complement within [0, max], written at top, returns count
export const __Porffor_regex_rangesComplement = (start: i32, count: i32, max: i32): i32 => {
  const outStart: i32 = __Porffor_regex_rangesTop;
  let prev: i32 = 0;
  for (let i: i32 = start; i < start + count; i++) {
    const lo: i32 = __Porffor_regex_rangeLo(i);
    if (lo > prev) __Porffor_regex_rangePush(prev, lo - 1);
    prev = __Porffor_regex_rangeHi(i) + 1;
    if (prev > max) break;
  }
  if (prev <= max) __Porffor_regex_rangePush(prev, max);
  return __Porffor_regex_rangesTop - outStart;
};

// a ∩ b written at top, returns count
export const __Porffor_regex_rangesIntersect = (aStart: i32, aCount: i32, bStart: i32, bCount: i32): i32 => {
  const outStart: i32 = __Porffor_regex_rangesTop;
  let ai: i32 = 0;
  let bi: i32 = 0;
  while (ai < aCount && bi < bCount) {
    const alo: i32 = __Porffor_regex_rangeLo(aStart + ai);
    const ahi: i32 = __Porffor_regex_rangeHi(aStart + ai);
    const blo: i32 = __Porffor_regex_rangeLo(bStart + bi);
    const bhi: i32 = __Porffor_regex_rangeHi(bStart + bi);
    const lo: i32 = alo > blo ? alo : blo;
    const hi: i32 = ahi < bhi ? ahi : bhi;
    if (lo <= hi) __Porffor_regex_rangePush(lo, hi);
    if (ahi < bhi) ai += 1;
      else bi += 1;
  }
  return __Porffor_regex_rangesTop - outStart;
};

// append ranges for every gc category in mask, returns count appended
export const __Porffor_regex_rangesFromGcMask = (mask: i32): i32 => {
  __Porffor_regex_ucdInitGc();
  const starts: i32 = Porffor.IR.ptr(__Porffor_regex_ucdGcDec);
  const n: i32 = __Porffor_regex_ucdGcN;
  const gcs: i32 = starts + n * 4;
  const outStart: i32 = __Porffor_regex_rangesTop;
  let runLo: i32 = -1;
  for (let i: i32 = 0; i < n; i++) {
    const inSet: boolean = (mask & (1 << Porffor.IR.loadU8(gcs + i, 0))) != 0;
    if (inSet) {
      if (runLo == -1) runLo = Porffor.IR.loadI32(starts + i * 4, 0);
    } else if (runLo != -1) {
      __Porffor_regex_rangePush(runLo, Porffor.IR.loadI32(starts + i * 4, 0) - 1);
      runLo = -1;
    }
  }
  if (runLo != -1) __Porffor_regex_rangePush(runLo, 0x10FFFF);
  return __Porffor_regex_rangesTop - outStart;
};

// append ranges for a binary property, stored as xor against a base gc mask
export const __Porffor_regex_rangesFromProp = (propIdx: i32): i32 => {
  const offData: i32 = Porffor.IR.ptr(__Porffor_regex_ucdPropOffsets()) + 4;
  __Porffor_regex_vPos = 0;
  for (let i: i32 = 0; i < propIdx; i++) __Porffor_regex_varint(offData);
  const off: i32 = __Porffor_regex_varint(offData);

  const data: i32 = Porffor.IR.ptr(__Porffor_regex_ucdProps()) + 4;
  __Porffor_regex_vPos = off;
  const baseMask: i32 = __Porffor_regex_varint(data);
  const nR: i32 = __Porffor_regex_varint(data);

  const xorStart: i32 = __Porffor_regex_rangesTop;
  let last: i32 = 0;
  for (let i: i32 = 0; i < nR; i++) {
    const lo: i32 = last + __Porffor_regex_varint(data);
    const hi: i32 = lo + __Porffor_regex_varint(data);
    __Porffor_regex_rangePush(lo, hi);
    last = hi + 1;
  }

  if (baseMask == 0) return nR;

  // symmetric difference with the base mask ranges
  const baseStart: i32 = __Porffor_regex_rangesTop;
  const baseCount: i32 = __Porffor_regex_rangesFromGcMask(baseMask);
  const xorCompStart: i32 = __Porffor_regex_rangesTop;
  const xorCompCount: i32 = __Porffor_regex_rangesComplement(xorStart, nR, 0x10FFFF);
  const baseCompStart: i32 = __Porffor_regex_rangesTop;
  const baseCompCount: i32 = __Porffor_regex_rangesComplement(baseStart, baseCount, 0x10FFFF);

  const p1Start: i32 = __Porffor_regex_rangesTop;
  const p1Count: i32 = __Porffor_regex_rangesIntersect(baseStart, baseCount, xorCompStart, xorCompCount);
  const p2Start: i32 = __Porffor_regex_rangesTop;
  const p2Count: i32 = __Porffor_regex_rangesIntersect(xorStart, nR, baseCompStart, baseCompCount);

  // compact both halves down to xorStart and normalize
  const total: i32 = p1Count + p2Count;
  Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + xorStart * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + p1Start * 8, total * 8);
  __Porffor_regex_rangesTop = xorStart + total;
  return __Porffor_regex_rangesNormalize(xorStart, total);
};

export const __Porffor_regex_rangesFromScript = (idx: i32, ext: boolean): i32 => {
  const outStart: i32 = __Porffor_regex_rangesTop;
  const data: i32 = Porffor.IR.ptr(__Porffor_regex_ucdSc()) + 4;
  __Porffor_regex_vPos = 0;
  const n: i32 = __Porffor_regex_varint(data);
  let cp: i32 = 0;
  for (let i: i32 = 0; i < n; i++) {
    const len: i32 = __Porffor_regex_varint(data);
    if (Porffor.IR.loadU8(data + __Porffor_regex_vPos, 0) == idx) __Porffor_regex_rangePush(cp, cp + len - 1);
    __Porffor_regex_vPos += 1;
    cp += len;
  }
  if (!ext) return __Porffor_regex_rangesTop - outStart;

  // scx table lists cps whose extensions differ from {sc}: drop them all, then add back those including idx
  const xdata: i32 = Porffor.IR.ptr(__Porffor_regex_ucdScx()) + 4;
  __Porffor_regex_vPos = 0;
  const nSets: i32 = __Porffor_regex_varint(xdata);
  const setsPos: i32 = __Porffor_regex_vPos;
  for (let i: i32 = 0; i < nSets; i++) __Porffor_regex_vPos += __Porffor_regex_varint(xdata);
  const nRuns: i32 = __Porffor_regex_varint(xdata);
  const runsPos: i32 = __Porffor_regex_vPos;

  const scCount: i32 = __Porffor_regex_rangesTop - outStart;
  const diffStart: i32 = __Porffor_regex_rangesTop;
  let last: i32 = 0;
  for (let i: i32 = 0; i < nRuns; i++) {
    const lo: i32 = last + __Porffor_regex_varint(xdata);
    const hi: i32 = lo + __Porffor_regex_varint(xdata);
    __Porffor_regex_varint(xdata);
    __Porffor_regex_rangePush(lo, hi);
    last = hi + 1;
  }
  const compStart: i32 = __Porffor_regex_rangesTop;
  const compCount: i32 = __Porffor_regex_rangesComplement(diffStart, nRuns, 0x10FFFF);
  const keepStart: i32 = __Porffor_regex_rangesTop;
  const keepCount: i32 = __Porffor_regex_rangesIntersect(outStart, scCount, compStart, compCount);
  Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + outStart * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + keepStart * 8, keepCount * 8);
  __Porffor_regex_rangesTop = outStart + keepCount;

  __Porffor_regex_vPos = runsPos;
  last = 0;
  for (let i: i32 = 0; i < nRuns; i++) {
    const lo: i32 = last + __Porffor_regex_varint(xdata);
    const hi: i32 = lo + __Porffor_regex_varint(xdata);
    const set: i32 = __Porffor_regex_varint(xdata);
    last = hi + 1;
    const runPos: i32 = __Porffor_regex_vPos;

    __Porffor_regex_vPos = setsPos;
    for (let s: i32 = 0; s < set; s++) __Porffor_regex_vPos += __Porffor_regex_varint(xdata);
    const len: i32 = __Porffor_regex_varint(xdata);
    for (let k: i32 = 0; k < len; k++) {
      if (Porffor.IR.loadU8(xdata + __Porffor_regex_vPos + k, 0) == idx) {
        __Porffor_regex_rangePush(lo, hi);
        break;
      }
    }
    __Porffor_regex_vPos = runPos;
  }
  return __Porffor_regex_rangesNormalize(outStart, __Porffor_regex_rangesTop - outStart);
};

// close a normalized slice under case folding, in place, returns new count
// which: 0 iu fold runs, 1 non-u canon runs. closure = S ∪ images ∪ preimages of images
export const __Porffor_regex_rangesFoldClose = (start: i32, count: i32, which: i32): i32 => {
  __Porffor_regex_ucdInitMap(which);
  const dec: any = which == 0 ? __Porffor_regex_ucdFoldDec : __Porffor_regex_ucdCanonDec;
  const n: i32 = which == 0 ? __Porffor_regex_ucdFoldN : __Porffor_regex_ucdCanonN;
  const base: i32 = Porffor.IR.ptr(dec);

  // pass 1: append the map images of S
  const imgStart: i32 = __Porffor_regex_rangesTop;
  for (let i: i32 = 0; i < n; i++) {
    const rStart: i32 = Porffor.IR.loadI32(base + i * 16, 0);
    const rCount: i32 = Porffor.IR.loadI32(base + i * 16, 4);
    const rStride: i32 = Porffor.IR.loadI32(base + i * 16, 8);
    const rDelta: i32 = Porffor.IR.loadI32(base + i * 16, 12);
    const rEnd: i32 = rStart + (rCount - 1) * rStride;
    for (let s: i32 = start; s < start + count; s++) {
      const lo: i32 = __Porffor_regex_rangeLo(s);
      const hi: i32 = __Porffor_regex_rangeHi(s);
      if (hi < rStart || lo > rEnd) continue;
      let from: i32 = lo > rStart ? lo : rStart;
      let to: i32 = hi < rEnd ? hi : rEnd;
      // snap from onto the run's stride
      const misalign: i32 = (from - rStart) % rStride;
      if (misalign != 0) from += rStride - misalign;
      for (let cp: i32 = from; cp <= to; cp += rStride) __Porffor_regex_rangePush(cp + rDelta, cp + rDelta);
    }
  }

  // pass 2: C = normalize(S ∪ images), then append the preimages of C
  const imgCount: i32 = __Porffor_regex_rangesTop - imgStart;
  // S goes right after the images so one normalize yields C
  __Porffor_regex_rangesEnsure(count);
  Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + __Porffor_regex_rangesTop * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + start * 8, count * 8);
  __Porffor_regex_rangesTop += count;
  const cCount: i32 = __Porffor_regex_rangesNormalize(imgStart, imgCount + count);

  const preStart: i32 = __Porffor_regex_rangesTop;
  for (let i: i32 = 0; i < n; i++) {
    const rStart: i32 = Porffor.IR.loadI32(base + i * 16, 0);
    const rCount: i32 = Porffor.IR.loadI32(base + i * 16, 4);
    const rStride: i32 = Porffor.IR.loadI32(base + i * 16, 8);
    const rDelta: i32 = Porffor.IR.loadI32(base + i * 16, 12);
    const rEnd: i32 = rStart + (rCount - 1) * rStride;
    for (let s: i32 = imgStart; s < imgStart + cCount; s++) {
      const lo: i32 = __Porffor_regex_rangeLo(s) - rDelta;
      const hi: i32 = __Porffor_regex_rangeHi(s) - rDelta;
      if (hi < rStart || lo > rEnd) continue;
      let from: i32 = lo > rStart ? lo : rStart;
      let to: i32 = hi < rEnd ? hi : rEnd;
      const misalign: i32 = (from - rStart) % rStride;
      if (misalign != 0) from += rStride - misalign;
      for (let cp: i32 = from; cp <= to; cp += rStride) __Porffor_regex_rangePush(cp, cp);
    }
  }

  // compact C + preimages down to start and normalize
  const preCount: i32 = __Porffor_regex_rangesTop - preStart;
  Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + start * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + imgStart * 8, (cCount + preCount) * 8);
  __Porffor_regex_rangesTop = start + cCount + preCount;
  return __Porffor_regex_rangesNormalize(start, cCount + preCount);
};
// ast nodes in a raw arena, 24 bytes each, addressed by index:
//   +0 kind u8, aux u8   +4 d1   +8 d2   +12 child   +16 sib   +20 capFirst u16 | capCount u16
// kinds: 0 empty, 1 char (d1 cp), 2 class (d1 ranges start, d2 count), 3 any,
//        4 assert (aux: 0 ^, 1 $, 2 \b, 3 \B), 5 backref (d1 idx, or -nameId-1),
//        6 group (aux 0 capture (d1 idx), 1 ncg), 7 look (aux: bit0 neg, bit1 behind),
//        8 alt, 9 concat, 10 quant (d1 min, d2 max -1=inf, aux bit0 greedy)

let __Porffor_regex_nodesTop: i32 = 0;
let __Porffor_regex_pSrc: any = 0;
let __Porffor_regex_pLen: i32 = 0;
let __Porffor_regex_pPos: i32 = 0;
let __Porffor_regex_pU16: boolean = false;
let __Porffor_regex_pSrcType: i32 = 0;
let __Porffor_regex_pFlags: i32 = 0;
let __Porffor_regex_pCaps: i32 = 0;
let __Porffor_regex_pTotalCaps: i32 = 0;
let __Porffor_regex_pHasNames: boolean = false;
let __Porffor_regex_pNames: any = 0; // [name, capIdx, path] triples
let __Porffor_regex_pDisj: i32 = 0; // next disjunction id
let __Porffor_regex_pPath: any = 0; // (disjId, altIdx) pairs on the current path
let __Porffor_regex_pKRefs: any = 0; // unresolved \k refs as (name, node) pairs
let __Porffor_regex_pMulti: any = 0; // capture index lists for duplicate-named backrefs

export const __Porffor_regex_node = (kind: i32, aux: i32): i32 => {
  const idx: i32 = __Porffor_regex_nodesTop;
  const needBytes: i32 = (idx + 1) * 24;
  if (needBytes > __Porffor_regex_capNodes) {
    let newCap: i32 = __Porffor_regex_capNodes == 0 ? 8192 : __Porffor_regex_capNodes;
    while (newCap < needBytes) newCap *= 2;
    const nbuf: any = __Porffor_regex_alloc(newCap);
    if (__Porffor_regex_bufNodes != 0) Porffor.IR.copy(Porffor.IR.ptr(nbuf), Porffor.IR.ptr(__Porffor_regex_bufNodes), idx * 24);
    __Porffor_regex_bufNodes = nbuf;
    __Porffor_regex_capNodes = newCap;
  }
  __Porffor_regex_nodesTop = idx + 1;

  const p: i32 = Porffor.IR.ptr(__Porffor_regex_bufNodes) + idx * 24;
  Porffor.IR.storeU8(p, 0, kind);
  Porffor.IR.storeU8(p, 1, aux);
  Porffor.IR.storeI32(p, 4, 0);
  Porffor.IR.storeI32(p, 8, 0);
  Porffor.IR.storeI32(p, 12, -1);
  Porffor.IR.storeI32(p, 16, -1);
  Porffor.IR.storeI32(p, 20, 0);
  return idx;
};

export const __Porffor_regex_nPtr = (idx: i32): i32 => Porffor.IR.ptr(__Porffor_regex_bufNodes) + idx * 24;
export const __Porffor_regex_nKind = (idx: i32): i32 => Porffor.IR.loadU8(__Porffor_regex_nPtr(idx), 0);
export const __Porffor_regex_nAux = (idx: i32): i32 => Porffor.IR.loadU8(__Porffor_regex_nPtr(idx), 1);
export const __Porffor_regex_nD1 = (idx: i32): i32 => Porffor.IR.loadI32(__Porffor_regex_nPtr(idx), 4);
export const __Porffor_regex_nD2 = (idx: i32): i32 => Porffor.IR.loadI32(__Porffor_regex_nPtr(idx), 8);
export const __Porffor_regex_nChild = (idx: i32): i32 => Porffor.IR.loadI32(__Porffor_regex_nPtr(idx), 12);
export const __Porffor_regex_nSib = (idx: i32): i32 => Porffor.IR.loadI32(__Porffor_regex_nPtr(idx), 16);

export const __Porffor_regex_err = (msg: bytestring): void => {
  throw new SyntaxError(msg);
};

export const __Porffor_regex_pAt = (i: i32): i32 => {
  if (i >= __Porffor_regex_pLen) return -1;
  if (__Porffor_regex_pU16) return Porffor.IR.loadU16(Porffor.IR.ptr(__Porffor_regex_pSrc) + i * 2, 4);
  return Porffor.IR.loadU8(Porffor.IR.ptr(__Porffor_regex_pSrc) + i, 4);
};

// current cp, a surrogate pair counts as one in u/v mode, width lands in pCpW
let __Porffor_regex_pCpW: i32 = 1;
export const __Porffor_regex_pCp = (): i32 => {
  const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
  __Porffor_regex_pCpW = 1;
  if (c >= 0xD800 && c <= 0xDBFF && (__Porffor_regex_pFlags & 0b10010000) != 0) {
    const c2: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 1);
    if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
      __Porffor_regex_pCpW = 2;
      return 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
    }
  }
  return c;
};

// count '(' captures and spot named groups before the real parse
export const __Porffor_regex_prescan = (): void => {
  let caps: i32 = 0;
  let named: boolean = false;
  let inClass: boolean = false;
  let i: i32 = 0;
  const len: i32 = __Porffor_regex_pLen;
  while (i < len) {
    const c: i32 = __Porffor_regex_pAt(i);
    if (c == 92) { // backslash
      i += 2;
      continue;
    }
    if (inClass) {
      if (c == 93) inClass = false; // ]
      i += 1;
      continue;
    }
    if (c == 91) { // [
      inClass = true;
      i += 1;
      continue;
    }
    if (c == 40) { // (
      const c1: i32 = __Porffor_regex_pAt(i + 1);
      if (c1 != 63) caps += 1; // not (?
        else {
          const c2: i32 = __Porffor_regex_pAt(i + 2);
          if (c2 == 60) { // (?<
            const c3: i32 = __Porffor_regex_pAt(i + 3);
            if (c3 != 61 && c3 != 33) { // not lookbehind
              caps += 1;
              named = true;
            }
          }
        }
    }
    i += 1;
  }
  __Porffor_regex_pTotalCaps = caps;
  __Porffor_regex_pHasNames = named;
};

export const __Porffor_regex_hexVal = (c: i32): i32 => {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
};

// \x \u escapes (atom + class), -> cp or -1 (annexB fallthrough in callers), advances pos on success
export const __Porffor_regex_parseHexEscape = (kind: i32): i32 => {
  // kind: 120 = x, 117 = u
  const uMode: boolean = (__Porffor_regex_pFlags & 0b10010000) != 0;
  const start: i32 = __Porffor_regex_pPos;
  if (kind == 120) { // \xHH
    const h1: i32 = __Porffor_regex_hexVal(__Porffor_regex_pAt(start));
    const h2: i32 = __Porffor_regex_hexVal(__Porffor_regex_pAt(start + 1));
    if (h1 < 0 || h2 < 0) return -1;
    __Porffor_regex_pPos = start + 2;
    return h1 * 16 + h2;
  }

  // \u{...} (u/v mode)
  if (uMode && __Porffor_regex_pAt(start) == 123) { // {
    let i: i32 = start + 1;
    let v: i32 = 0;
    let digits: i32 = 0;
    while (true) {
      const c: i32 = __Porffor_regex_pAt(i);
      if (c == 125) break; // }
      const h: i32 = __Porffor_regex_hexVal(c);
      if (h < 0) return -1;
      v = v * 16 + h;
      if (v > 0x10FFFF) return -1;
      digits += 1;
      i += 1;
    }
    if (digits == 0) return -1;
    __Porffor_regex_pPos = i + 1;
    return v;
  }

  // \uHHHH
  let v: i32 = 0;
  for (let i: i32 = 0; i < 4; i++) {
    const h: i32 = __Porffor_regex_hexVal(__Porffor_regex_pAt(start + i));
    if (h < 0) return -1;
    v = v * 16 + h;
  }
  __Porffor_regex_pPos = start + 4;

  // \u lead + \u trail merge into one cp in u mode
  if (uMode && v >= 0xD800 && v <= 0xDBFF &&
      __Porffor_regex_pAt(__Porffor_regex_pPos) == 92 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) == 117) {
    const save: i32 = __Porffor_regex_pPos;
    __Porffor_regex_pPos = save + 2;
    let v2: i32 = 0;
    let ok: boolean = true;
    for (let i: i32 = 0; i < 4; i++) {
      const h: i32 = __Porffor_regex_hexVal(__Porffor_regex_pAt(__Porffor_regex_pPos + i));
      if (h < 0) {
        ok = false;
        break;
      }
      v2 = v2 * 16 + h;
    }
    if (ok && v2 >= 0xDC00 && v2 <= 0xDFFF) {
      __Porffor_regex_pPos += 4;
      return 0x10000 + ((v - 0xD800) << 10) + (v2 - 0xDC00);
    }
    __Porffor_regex_pPos = save;
  }
  return v;
};

// appends ranges for \d \D \w \W \s \S \p \P, returns count, or -1 if not a set escape
export const __Porffor_regex_classSetEscape = (c: i32): i32 => {
  const outStart: i32 = __Porffor_regex_rangesTop;
  if (c == 100 || c == 68) { // d D
    __Porffor_regex_rangePush(48, 57);
    if (c == 68) return __Porffor_regex_rangesComplementInPlace(outStart, 1);
    return 1;
  }
  if (c == 119 || c == 87) { // w W
    __Porffor_regex_rangePush(48, 57);
    __Porffor_regex_rangePush(65, 90);
    __Porffor_regex_rangePush(95, 95);
    __Porffor_regex_rangePush(97, 122);
    let n: i32 = 4;
    // WordCharacters: with u/v and i, also the chars canonicalizing into [A-Za-z] (U+017F, U+212A)
    if (Porffor.fastAnd((__Porffor_regex_pFlags & 0b00000010) != 0, (__Porffor_regex_pFlags & 0b10010000) != 0)) {
      __Porffor_regex_rangePush(0x17F, 0x17F);
      __Porffor_regex_rangePush(0x212A, 0x212A);
      n = 6;
    }
    if (c == 87) return __Porffor_regex_rangesComplementInPlace(outStart, n);
    return n;
  }
  if (c == 115 || c == 83) { // s S
    __Porffor_regex_rangePush(9, 13);
    __Porffor_regex_rangePush(32, 32);
    __Porffor_regex_rangePush(160, 160);
    __Porffor_regex_rangePush(0x1680, 0x1680);
    __Porffor_regex_rangePush(0x2000, 0x200A);
    __Porffor_regex_rangePush(0x2028, 0x2029);
    __Porffor_regex_rangePush(0x202F, 0x202F);
    __Porffor_regex_rangePush(0x205F, 0x205F);
    __Porffor_regex_rangePush(0x3000, 0x3000);
    __Porffor_regex_rangePush(0xFEFF, 0xFEFF);
    if (c == 83) return __Porffor_regex_rangesComplementInPlace(outStart, 10);
    return 10;
  }
  if (c == 112 || c == 80) { // p P
    if ((__Porffor_regex_pFlags & 0b10010000) == 0) return -1; // annexB: \p literal outside u/v
    if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 123) __Porffor_regex_err('Regex parse: expected { after \\p');
    __Porffor_regex_pPos += 1;
    const count: i32 = __Porffor_regex_parseUnicodeProperty();
    if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 125) __Porffor_regex_err('Regex parse: expected } after \\p{...');
    __Porffor_regex_pPos += 1;
    if (c == 80) {
      if (__Porffor_regex_vOpStrs != 0) __Porffor_regex_err('Regex parse: negated property of strings');
      return __Porffor_regex_rangesComplementInPlace(outStart, count);
    }
    return count;
  }
  return -1;
};

// complement slice in place (lands at top, moved down), always cp-space (0x10FFFF), harmless for units
export const __Porffor_regex_rangesComplementInPlace = (start: i32, count: i32): i32 => {
  const n: i32 = __Porffor_regex_rangesNormalize(start, count);
  const compCount: i32 = __Porffor_regex_rangesComplement(start, n, 0x10FFFF);
  Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + start * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + (start + n) * 8, compCount * 8);
  __Porffor_regex_rangesTop = start + compCount;
  return compCount;
};

export const __Porffor_regex_pIndexOf = (start: i32, end: i32, list: bytestring): i32 => {
  const listLen: i32 = list.length;
  let idx: i32 = 0;
  let p: i32 = 0;
  while (p < listLen) {
    let e: i32 = p;
    while (e < listLen && list.charCodeAt(e) != 44 && list.charCodeAt(e) != 59) e += 1;
    if (e - p == end - start) {
      let same: boolean = true;
      for (let i: i32 = 0; i < e - p; i++) {
        if (list.charCodeAt(p + i) != __Porffor_regex_pAt(start + i)) {
          same = false;
          break;
        }
      }
      if (same) return idx;
    }
    if (e < listLen && list.charCodeAt(e) == 59) idx += 1;
    p = e + 1;
  }
  return -1;
};

// marker: included by codegen when a string in the program could name a script
export const __Porffor_regex_ucdScUsed = (): void => {};

// marker: included by codegen when a string in the program could name a property of strings
export const __Porffor_regex_ucdStrsUsed = (): void => {};

// base-5 code v, first slot most significant
export const __Porffor_regex_strsFill = (skel: any[], v: i32, slots: i32): any[] => {
  const out: any[] = Porffor.array.new(skel.length);
  let div: i32 = 1;
  for (let k: i32 = 1; k < slots; k++) div *= 5;
  for (let i: i32 = 0; i < skel.length; i++) {
    let c: i32 = skel[i];
    if (c == -1) {
      c = 0x1F3FB + ((v / div) | 0) % 5;
      div = (div / 5) | 0;
    }
    Porffor.array.fastPush(out, c);
  }
  return out;
};

// which: 0-5 as in the table, 6 RGI_Emoji = all
export const __Porffor_regex_decodeStrs = (which: i32): i32 => {
  const outStart: i32 = __Porffor_regex_rangesTop;
  const data: i32 = Porffor.IR.ptr(__Porffor_regex_ucdStrs()) + 4;
  __Porffor_regex_vPos = 0;
  for (let prop: i32 = 0; prop < 6; prop++) {
    const want: boolean = which == 6 || which == prop;

    // single cps, then X of X FE0F pairs
    for (let pass: i32 = 0; pass < 2; pass++) {
      const n: i32 = __Porffor_regex_varint(data);
      let last: i32 = 0;
      for (let i: i32 = 0; i < n; i++) {
        const lo: i32 = last + __Porffor_regex_varint(data);
        const hi: i32 = lo + __Porffor_regex_varint(data);
        last = hi + 1;
        if (!want) continue;
        if (pass == 0) __Porffor_regex_rangePush(lo, hi);
          else for (let c: i32 = lo; c <= hi; c++) {
            const s: any[] = Porffor.array.new(2);
            Porffor.array.fastPush(s, c);
            Porffor.array.fastPush(s, 0xFE0F);
            __Porffor_regex_vStrsPush(s);
          }
      }
    }

    const nSkel: i32 = __Porffor_regex_varint(data);
    let prev: i32 = 0;
    for (let k: i32 = 0; k < nSkel; k++) {
      const len: i32 = __Porffor_regex_varint(data);
      const skel: any[] = Porffor.array.new(len);
      let slots: i32 = 0;
      for (let j: i32 = 0; j < len; j++) {
        const code: i32 = __Porffor_regex_varint(data);
        if (code == 0) {
          Porffor.array.fastPush(skel, -1);
          slots += 1;
        } else if (code == 1) Porffor.array.fastPush(skel, 0x200D);
          else if (code == 2) Porffor.array.fastPush(skel, 0xFE0F);
          else {
            const zz: i32 = code - 3;
            prev += (zz & 1) ? -((zz + 1) >> 1) : (zz >> 1);
            Porffor.array.fastPush(skel, prev);
          }
      }
      if (slots == 0) {
        if (want) __Porffor_regex_vStrsPush(skel);
        continue;
      }

      const mode: i32 = __Porffor_regex_varint(data);
      if (mode < 2) { // all tuples, or all with distinct tones
        let total: i32 = 1;
        for (let t: i32 = 0; t < slots; t++) total *= 5;
        if (want) for (let v: i32 = 0; v < total; v++) {
          if (mode == 1) if (((v / 5) | 0) == v % 5) continue;
          __Porffor_regex_vStrsPush(__Porffor_regex_strsFill(skel, v, slots));
        }
      } else for (let t: i32 = 0; t < mode - 2; t++) {
        const v: i32 = __Porffor_regex_varint(data);
        if (want) __Porffor_regex_vStrsPush(__Porffor_regex_strsFill(skel, v, slots));
      }
    }
  }
  return __Porffor_regex_rangesTop - outStart;
};

export const __Porffor_regex_parseUnicodeProperty = (): i32 => {
  // scan to } noting any =
  const nameStart: i32 = __Porffor_regex_pPos;
  let eq: i32 = -1;
  while (true) {
    const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (c == 125 || c == -1) break;
    if (c == 61 && eq == -1) eq = __Porffor_regex_pPos;
    __Porffor_regex_pPos += 1;
  }
  const nameEnd: i32 = __Porffor_regex_pPos;

  let lookStart: i32 = nameStart;
  let lookEnd: i32 = nameEnd;
  if (eq != -1) {
    const which: i32 = __Porffor_regex_pIndexOf(nameStart, eq, 'gc,General_Category;sc,Script;scx,Script_Extensions');
    if (which == -1) __Porffor_regex_err('Regex parse: unsupported property name');
    lookStart = eq + 1;

    if (which != 0) {
      // script tables are only linked in if some string could name one
      if (Porffor.comptime.flag`hasFunc.__Porffor_regex_ucdScUsed`) {
        const script: i32 = __Porffor_regex_pIndexOf(lookStart, lookEnd, __Porffor_regex_ucdScDir());
        if (script != -1) return __Porffor_regex_rangesFromScript(script, which == 2);
      }
      __Porffor_regex_err('Regex parse: unknown property');
    }
  }

  if (eq == -1) {
    const which: i32 = __Porffor_regex_pIndexOf(nameStart, nameEnd, 'Basic_Emoji;Emoji_Keycap_Sequence;RGI_Emoji_Flag_Sequence;RGI_Emoji_Modifier_Sequence;RGI_Emoji_Tag_Sequence;RGI_Emoji_ZWJ_Sequence;RGI_Emoji');
    if (which != -1) {
      if ((__Porffor_regex_pFlags & 0b10000000) == 0) __Porffor_regex_err('Regex parse: property of strings needs the v flag');
      if (Porffor.comptime.flag`hasFunc.__Porffor_regex_ucdStrsUsed`) {
        return __Porffor_regex_decodeStrs(which);
      }
      __Porffor_regex_err('Regex parse: unknown property');
    }
  }

  // directory lookup, entries "name=code" split by ';', code is g<hexmask> or b<idx>
  const dir: bytestring = __Porffor_regex_ucdDir();
  const dirLen: i32 = dir.length;
  let d: i32 = 0;
  while (d < dirLen) {
    // name match?
    let i: i32 = 0;
    const wantLen: i32 = lookEnd - lookStart;
    let match: boolean = true;
    while (i < wantLen) {
      const dc: i32 = dir.charCodeAt(d + i);
      if (dc == 61 || dc == 59) {
        match = false;
        break;
      }
      if (dc != __Porffor_regex_pAt(lookStart + i)) {
        match = false;
        break;
      }
      i += 1;
    }
    if (match && dir.charCodeAt(d + wantLen) == 61) {
      // decode: g hex mask, b decimal idx
      let p: i32 = d + wantLen + 1;
      const kind: i32 = dir.charCodeAt(p);
      p += 1;
      let v: i32 = 0;
      while (p < dirLen) {
        const c: i32 = dir.charCodeAt(p);
        if (c == 59) break;
        if (kind == 103) v = v * 16 + __Porffor_regex_hexVal(c);
          else v = v * 10 + (c - 48);
        p += 1;
      }
      if (kind == 103) return __Porffor_regex_rangesFromGcMask(v);
      if (eq != -1) break; // gc=<binary prop>
      return __Porffor_regex_rangesFromProp(v);
    }
    // skip to next entry
    while (d < dirLen && dir.charCodeAt(d) != 59) d += 1;
    d += 1;
  }
  __Porffor_regex_err('Regex parse: unknown property');
  return 0;
};

// does cp have the binary property, used by group name parsing
export const __Porffor_regex_propHas = (propIdx: i32, cp: i32): boolean => {
  const saveTop: i32 = __Porffor_regex_rangesTop;
  const savePos: i32 = __Porffor_regex_vPos;
  const count: i32 = __Porffor_regex_rangesFromProp(propIdx);
  let found: boolean = false;
  for (let i: i32 = saveTop; i < saveTop + count; i++) {
    if (cp >= __Porffor_regex_rangeLo(i) && cp <= __Porffor_regex_rangeHi(i)) {
      found = true;
      break;
    }
  }
  __Porffor_regex_rangesTop = saveTop;
  __Porffor_regex_vPos = savePos;
  return found;
};
export const __Porffor_regex_isSyntaxChar = (c: i32): boolean =>
  Porffor.fastOr(c == 94, c == 36, c == 92, c == 46, c == 42, c == 43, c == 63, c == 40, c == 41, c == 91, c == 93, c == 123, c == 125, c == 124);

// append to parent's child list (sibling-linked)
export const __Porffor_regex_appendChild = (parent: i32, child: i32): void => {
  const pp: i32 = __Porffor_regex_nPtr(parent);
  const first: i32 = Porffor.IR.loadI32(pp, 12);
  if (first == -1) {
    Porffor.IR.storeI32(pp, 12, child);
    return;
  }
  let cur: i32 = first;
  while (Porffor.IR.loadI32(__Porffor_regex_nPtr(cur), 16) != -1) cur = Porffor.IR.loadI32(__Porffor_regex_nPtr(cur), 16);
  Porffor.IR.storeI32(__Porffor_regex_nPtr(cur), 16, child);
};

// char node, or a class node when i-folding gives more than the cp itself
export const __Porffor_regex_charNode = (cp: i32): i32 => {
  if ((__Porffor_regex_pFlags & 0b00000010) != 0) { // i
    const start: i32 = __Porffor_regex_rangesTop;
    __Porffor_regex_rangePush(cp, cp);
    const count: i32 = __Porffor_regex_rangesFoldClose(start, 1, (__Porffor_regex_pFlags & 0b10010000) != 0 ? 0 : 1);
    if (count > 1 || __Porffor_regex_rangeLo(start) != cp || __Porffor_regex_rangeHi(start) != cp) {
      const n: i32 = __Porffor_regex_node(2, 0);
      Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 4, start);
      Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 8, count);
      return n;
    }
    __Porffor_regex_rangesTop = start;
  }
  const n: i32 = __Porffor_regex_node(1, 0);
  Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 4, cp);
  return n;
};

// class node from a ranges slice, fold-closed under i, complemented if negated
export const __Porffor_regex_classNode = (start: i32, count: i32, negated: boolean): i32 => {
  let n: i32 = __Porffor_regex_rangesNormalize(start, count);
  if ((__Porffor_regex_pFlags & 0b00000010) != 0 && n > 0) {
    n = __Porffor_regex_rangesFoldClose(start, n, (__Porffor_regex_pFlags & 0b10010000) != 0 ? 0 : 1);
  }
  if (negated) n = __Porffor_regex_rangesComplementInPlace(start, n);

  if (n == 1 && __Porffor_regex_rangeLo(start) == 0 && __Porffor_regex_rangeHi(start) >= 0x10FFFF) {
    __Porffor_regex_rangesTop = start;
    return __Porffor_regex_node(3, 0); // any
  }
  const node: i32 = __Porffor_regex_node(2, 0);
  Porffor.IR.storeI32(__Porffor_regex_nPtr(node), 4, start);
  Porffor.IR.storeI32(__Porffor_regex_nPtr(node), 8, n);
  return node;
};

// decimal at pPos, advances, -1 if no digits, saturates near i32 max
export const __Porffor_regex_parseDecimal = (): i32 => {
  let v: i32 = 0;
  let any: boolean = false;
  while (true) {
    const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (c < 48 || c > 57) break;
    if (v < 0x0CCCCCCC) v = v * 10 + (c - 48);
    any = true;
    __Porffor_regex_pPos += 1;
  }
  if (!any) return -1;
  return v;
};

export const __Porffor_regex_parseGroupName = (): any => {
  if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 60) __Porffor_regex_err('Regex parse: expected <'); // <
  __Porffor_regex_pPos += 1;
  const nameStart: i32 = __Porffor_regex_pPos;
  let first: boolean = true;
  let built: any = '';
  let escaped: boolean = false;
  while (true) {
    const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (c == 62) break; // >
    if (c == -1) __Porffor_regex_err('Regex parse: unterminated group name');
    let cp: i32 = c;
    let w: i32 = 1;
    if (c >= 0xD800 && c <= 0xDBFF) {
      const c2: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 1);
      if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
        cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        w = 2;
      }
    }
    if (cp == 92) { // \u escape in name, unicode-mode syntax (\u{...}, escaped surrogate pairs) whatever the flags
      if (__Porffor_regex_pAt(__Porffor_regex_pPos + 1) != 117) __Porffor_regex_err('Regex parse: invalid group name');
      __Porffor_regex_pPos += 2;
      const flags: i32 = __Porffor_regex_pFlags;
      __Porffor_regex_pFlags = flags | 0b00010000;
      cp = __Porffor_regex_parseHexEscape(117);
      __Porffor_regex_pFlags = flags;
      if (cp < 0) __Porffor_regex_err('Regex parse: invalid group name');
      w = 0; // pos already advanced
      escaped = true;
    }
    const idOk: boolean = first
      ? Porffor.fastOr(cp == 36, cp == 95, __Porffor_regex_propHas(32, cp))
      : Porffor.fastOr(cp == 36, cp == 0x200C, cp == 0x200D, __Porffor_regex_propHas(31, cp));
    if (!idOk) __Porffor_regex_err('Regex parse: invalid group name');
    first = false;
    built = __Porffor_strcat(built, String.fromCodePoint(cp));
    __Porffor_regex_pPos += w;
  }
  const nameEnd: i32 = __Porffor_regex_pPos;
  __Porffor_regex_pPos += 1; // >
  if (nameStart == nameEnd) __Porffor_regex_err('Regex parse: empty group name');
  if (escaped) return built;
  return __Porffor_regex_inputSubstring(__Porffor_regex_pSrc, __Porffor_regex_pSrcType, nameStart, nameEnd);
};

// records a named group, duplicate names legal iff paths diverge at some disjunction alternative
export const __Porffor_regex_addName = (name: any, capIdx: i32): void => {
  const names: any[] = __Porffor_regex_pNames;
  const path: any[] = __Porffor_regex_pPath;
  const snap: any[] = Porffor.array.new(path.length);
  for (let i: i32 = 0; i < path.length; i++) Porffor.array.fastPush(snap, path[i]);

  for (let i: i32 = 0; i < names.length; i += 3) {
    if (Porffor.strcmp(names[i], name)) {
      const other: any[] = names[i + 2];
      let diverged: boolean = false;
      const minLen: i32 = other.length < snap.length ? other.length : snap.length;
      for (let k: i32 = 0; k + 1 < minLen; k += 2) {
        if (other[k] != snap[k]) break;
        if (other[k + 1] != snap[k + 1]) {
          diverged = true;
          break;
        }
      }
      if (!diverged) __Porffor_regex_err('Regex parse: duplicate group name');
    }
  }

  Porffor.array.fastPush(names, name);
  Porffor.array.fastPush(names, capIdx);
  Porffor.array.fastPush(names, snap);
};

// [...] body in non-v mode, pPos just past '['
export const __Porffor_regex_parseClass = (): i32 => {
  const uMode: boolean = (__Porffor_regex_pFlags & 0b00010000) != 0;
  let negated: boolean = false;
  if (__Porffor_regex_pAt(__Porffor_regex_pPos) == 94) { // ^
    negated = true;
    __Porffor_regex_pPos += 1;
  }
  const start: i32 = __Porffor_regex_rangesTop;

  while (true) {
    let c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (c == -1) __Porffor_regex_err('Regex parse: unterminated class');
    if (c == 93) { // ]
      __Porffor_regex_pPos += 1;
      break;
    }

    // cp, or -2 when a set escape was appended
    let aCp: i32 = __Porffor_regex_parseClassAtom();

    if (aCp == -2) {
      // \d-x is a literal dash per annexB, an error in u mode
      if (__Porffor_regex_pAt(__Porffor_regex_pPos) == 45 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) != 93 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) != -1) {
        if (uMode) __Porffor_regex_err('Regex parse: invalid class range');
        __Porffor_regex_pPos += 1;
        __Porffor_regex_rangePush(45, 45);
      }
      continue;
    }

    // a-b range?
    if (aCp >= 0 && __Porffor_regex_pAt(__Porffor_regex_pPos) == 45 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) != 93 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) != -1) {
      __Porffor_regex_pPos += 1; // -
      const bCp: i32 = __Porffor_regex_parseClassAtom();
      if (bCp == -2) {
        // [a-\d] is literals per annexB, an error in u mode
        if (uMode) __Porffor_regex_err('Regex parse: invalid class range');
        __Porffor_regex_rangePush(aCp, aCp);
        __Porffor_regex_rangePush(45, 45);
        continue;
      }
      if (aCp > bCp) __Porffor_regex_err('Regex parse: class range out of order');
      __Porffor_regex_rangePush(aCp, bCp);
      continue;
    }

    if (aCp >= 0) __Porffor_regex_rangePush(aCp, aCp);
  }

  return __Porffor_regex_classNode(start, __Porffor_regex_rangesTop - start, negated);
};

// one class atom, cp or -2 when it appended a set (\d \w \s \p)
export const __Porffor_regex_parseClassAtom = (): i32 => {
  const uMode: boolean = (__Porffor_regex_pFlags & 0b00010000) != 0;
  let c: i32 = __Porffor_regex_pCp();
  if (c != 92) { // not backslash
    __Porffor_regex_pPos += __Porffor_regex_pCpW;
    return c;
  }

  __Porffor_regex_pPos += 1;
  c = __Porffor_regex_pAt(__Porffor_regex_pPos);
  if (c == -1) __Porffor_regex_err('Regex parse: trailing backslash');

  // set escapes
  const setCount: i32 = __Porffor_regex_setEscapeAt(c);
  if (setCount >= 0) return -2;

  __Porffor_regex_pPos += 1;
  if (c == 98) return 8; // \b backspace in class
  if (c == 110) return 10;
  if (c == 114) return 13;
  if (c == 116) return 9;
  if (c == 118) return 11;
  if (c == 102) return 12;
  if (c == 120) { // \x
    const v: i32 = __Porffor_regex_parseHexEscape(120);
    if (v >= 0) return v;
    if (uMode) __Porffor_regex_err('Regex parse: invalid \\x escape');
    return 120; // annexB identity
  }
  if (c == 117) { // \u
    const v: i32 = __Porffor_regex_parseHexEscape(117);
    if (v >= 0) return v;
    if (uMode) __Porffor_regex_err('Regex parse: invalid \\u escape');
    return 117;
  }
  if (c == 99) { // \c
    const cc: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122)) {
      __Porffor_regex_pPos += 1;
      return cc & 31;
    }
    if (!uMode && ((cc >= 48 && cc <= 57) || cc == 95)) { // annexB [\c0]
      __Porffor_regex_pPos += 1;
      return cc & 31;
    }
    if (uMode) __Porffor_regex_err('Regex parse: invalid \\c escape');
    __Porffor_regex_pPos -= 1;
    return 92; // annexB: backslash itself, 'c' re-parsed as atom
  }
  if (c >= 48 && c <= 55) { // octal (annexB) / \0
    if (uMode) {
      if (c == 48 && (__Porffor_regex_pAt(__Porffor_regex_pPos) < 48 || __Porffor_regex_pAt(__Porffor_regex_pPos) > 57)) return 0;
      __Porffor_regex_err('Regex parse: invalid class escape');
    }
    // legacy octal escape (annexB), up to 3 digits
    let v: i32 = c - 48;
    let digits: i32 = 1;
    while (digits < 3) {
      const d: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
      if (d < 48 || d > 55) break;
      const nv: i32 = v * 8 + (d - 48);
      if (nv > 255) break;
      v = nv;
      __Porffor_regex_pPos += 1;
      digits += 1;
    }
    return v;
  }
  if (c == 56 || c == 57) { // \8 \9
    if (uMode) __Porffor_regex_err('Regex parse: invalid class escape');
    return c;
  }

  if (uMode) {
    // u mode only escapes syntax chars, '/' and '-'
    if (!__Porffor_regex_isSyntaxChar(c) && c != 47 && c != 45) __Porffor_regex_err('Regex parse: invalid identity escape');
  }
  // the char escapes to itself, read as a cp
  __Porffor_regex_pPos -= 1;
  const cp: i32 = __Porffor_regex_pCp();
  __Porffor_regex_pPos += __Porffor_regex_pCpW;
  return cp;
};

// if c starts a set escape: consume + append ranges, return count, else -1 with pPos untouched
export const __Porffor_regex_setEscapeAt = (c: i32): i32 => {
  if (Porffor.fastOr(c == 100, c == 68, c == 115, c == 83, c == 119, c == 87)) {
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_classSetEscape(c);
  }
  if ((c == 112 || c == 80) && (__Porffor_regex_pFlags & 0b10010000) != 0) {
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_classSetEscape(c);
  }
  return -1;
};
export const __Porffor_regex_isClassSetSyntax = (c: i32): boolean =>
  Porffor.fastOr(c == 40, c == 41, c == 91, c == 93, c == 123, c == 125, c == 47, c == 45, c == 92, c == 124);

export const __Porffor_regex_isClassSetPunct = (c: i32): boolean =>
  Porffor.fastOr(c == 33, c == 35, c == 36, c == 37, c == 38, c == 42, c == 43, c == 44, c == 46, c == 58, c == 59, c == 60, c == 61, c == 62, c == 63, c == 64, c == 94, c == 96, c == 126);

export const __Porffor_regex_cpsEq = (a: any[], b: any[]): boolean => {
  const len: i32 = a.length;
  if (len != b.length) return false;
  for (let i: i32 = 0; i < len; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
};

export const __Porffor_regex_strsHas = (strs: any, s: any[]): boolean => {
  if (strs == 0) return false;
  const list: any[] = strs;
  for (let i: i32 = 0; i < list.length; i++) {
    if (__Porffor_regex_cpsEq(list[i], s)) return true;
  }
  return false;
};

export const __Porffor_regex_strsFilter = (a: any, b: any, want: boolean): any => {
  if (a == 0) return 0;
  const list: any[] = a;
  let out: any = 0;
  for (let i: i32 = 0; i < list.length; i++) {
    if (__Porffor_regex_strsHas(b, list[i]) == want) {
      if (out == 0) out = Porffor.array.new(4);
      Porffor.array.fastPush(out, list[i]);
    }
  }
  return out;
};

export const __Porffor_regex_strsConcat = (a: any, b: any): any => {
  if (a == 0) return b;
  if (b == 0) return a;
  const out: any[] = a;
  const list: any[] = b;
  for (let i: i32 = 0; i < list.length; i++) {
    if (!__Porffor_regex_strsHas(out, list[i])) Porffor.array.fastPush(out, list[i]);
  }
  return out;
};

export const __Porffor_regex_parseClassSetChar = (): i32 => {
  const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
  if (c == 92) { // escape: no set escapes here
    __Porffor_regex_pPos += 1;
    const c1: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (Porffor.fastOr(c1 == 100, c1 == 68, c1 == 115, c1 == 83, c1 == 119, c1 == 87, c1 == 112, c1 == 80, c1 == 113)) __Porffor_regex_err('Regex parse: invalid class set escape');
    __Porffor_regex_pPos -= 1;
    return __Porffor_regex_parseClassAtom();
  }

  if (__Porffor_regex_isClassSetSyntax(c)) __Porffor_regex_err('Regex parse: reserved class set char');
  if (__Porffor_regex_isClassSetPunct(c) && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) == c) __Porffor_regex_err('Regex parse: reserved class set double punctuator');
  const cp: i32 = __Porffor_regex_pCp();
  __Porffor_regex_pPos += __Porffor_regex_pCpW;
  return cp;
};

export const __Porffor_regex_parseClassSetOperand = (): i32 => {
  __Porffor_regex_vOpStrs = 0;
  let c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
  if (c == 91) { // nested class
    __Porffor_regex_pPos += 1;
    const inner: i32 = __Porffor_regex_parseClassVBody();
    // kind any is the full cp range, vOpStrs stays as the body left it
    if (__Porffor_regex_nKind(inner) == 3) __Porffor_regex_rangePush(0, 0x10FFFF);
      else {
        const s: i32 = __Porffor_regex_nD1(inner);
        const n: i32 = __Porffor_regex_nD2(inner);
        __Porffor_regex_rangesEnsure(n);
        Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + __Porffor_regex_rangesTop * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + s * 8, n * 8);
        __Porffor_regex_rangesTop += n;
      }
    return -2;
  }

  if (c == 92) { // escape
    const c1: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 1);
    if (c1 == 113) { // \q{a|bc|...}
      __Porffor_regex_pPos += 2;
      if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 123) __Porffor_regex_err('Regex parse: expected { after \\q');
      __Porffor_regex_pPos += 1;
      let cur: any[] = Porffor.array.new(4);
      while (true) {
        const ch: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
        if (ch == -1) __Porffor_regex_err('Regex parse: unterminated \\q');
        if (ch == 124 || ch == 125) { // | }
          __Porffor_regex_pPos += 1;
          if (cur.length == 1) __Porffor_regex_rangePush(cur[0], cur[0]);
            else if (!__Porffor_regex_strsHas(__Porffor_regex_vOpStrs, cur)) __Porffor_regex_vStrsPush(cur);
          if (ch == 125) break;
          cur = Porffor.array.new(4);
          continue;
        }
        Porffor.array.fastPush(cur, __Porffor_regex_parseClassSetChar());
      }
      return -2;
    }

    __Porffor_regex_pPos += 1;
    const setCount: i32 = __Porffor_regex_setEscapeAt(c1);
    if (setCount >= 0) return -2;
    __Porffor_regex_pPos -= 1;
    // not a set escape, parse as a single-char escape
    return __Porffor_regex_parseClassAtom();
  }

  return __Porffor_regex_parseClassSetChar();
};

// pPos just past '['
export const __Porffor_regex_parseClassVBody = (): i32 => {
  let negated: boolean = false;
  if (__Porffor_regex_pAt(__Porffor_regex_pPos) == 94) { // ^
    negated = true;
    __Porffor_regex_pPos += 1;
  }
  const start: i32 = __Porffor_regex_rangesTop;

  // empty class
  if (__Porffor_regex_pAt(__Porffor_regex_pPos) == 93) {
    __Porffor_regex_pPos += 1;
    __Porffor_regex_vOpStrs = 0;
    return __Porffor_regex_classNode(start, 0, negated);
  }

  // first operand, may be a-b in union form
  let count: i32 = __Porffor_regex_parseClassVOperandOrRange();
  let strs: any = __Porffor_regex_vOpStrs;

  const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
  const c1: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 1);
  if (c == 38 && c1 == 38) { // && chain: intersect
    while (__Porffor_regex_pAt(__Porffor_regex_pPos) == 38 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) == 38) {
      __Porffor_regex_pPos += 2;
      if (__Porffor_regex_pAt(__Porffor_regex_pPos) == 38) __Porffor_regex_err('Regex parse: invalid &&&');
      const aN: i32 = __Porffor_regex_rangesNormalize(start, count);
      const bStart: i32 = __Porffor_regex_rangesTop;
      const bCp: i32 = __Porffor_regex_parseClassSetOperand();
      if (bCp >= 0) __Porffor_regex_rangePush(bCp, bCp);
      strs = __Porffor_regex_strsFilter(strs, __Porffor_regex_vOpStrs, true);
      const bN: i32 = __Porffor_regex_rangesNormalize(bStart, __Porffor_regex_rangesTop - bStart);
      const rStart: i32 = __Porffor_regex_rangesTop;
      const rN: i32 = __Porffor_regex_rangesIntersect(start, aN, bStart, bN);
      Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + start * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + rStart * 8, rN * 8);
      __Porffor_regex_rangesTop = start + rN;
      count = rN;
    }
  } else if (c == 45 && c1 == 45) { // -- chain: subtract
    while (__Porffor_regex_pAt(__Porffor_regex_pPos) == 45 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) == 45) {
      __Porffor_regex_pPos += 2;
      const aN: i32 = __Porffor_regex_rangesNormalize(start, count);
      const bStart: i32 = __Porffor_regex_rangesTop;
      const sCp: i32 = __Porffor_regex_parseClassSetOperand();
      if (sCp >= 0) __Porffor_regex_rangePush(sCp, sCp);
      strs = __Porffor_regex_strsFilter(strs, __Porffor_regex_vOpStrs, false);
      const bN: i32 = __Porffor_regex_rangesNormalize(bStart, __Porffor_regex_rangesTop - bStart);
      // a minus b = a ∩ comp(b)
      const compStart: i32 = __Porffor_regex_rangesTop;
      const compN: i32 = __Porffor_regex_rangesComplement(bStart, bN, 0x10FFFF);
      const rStart: i32 = __Porffor_regex_rangesTop;
      const rN: i32 = __Porffor_regex_rangesIntersect(start, aN, compStart, compN);
      Porffor.IR.copy(Porffor.IR.ptr(__Porffor_regex_bufRanges) + start * 8, Porffor.IR.ptr(__Porffor_regex_bufRanges) + rStart * 8, rN * 8);
      __Porffor_regex_rangesTop = start + rN;
      count = rN;
    }
  } else {
    // plain union until ]
    while (__Porffor_regex_pAt(__Porffor_regex_pPos) != 93) {
      if (__Porffor_regex_pAt(__Porffor_regex_pPos) == -1) __Porffor_regex_err('Regex parse: unterminated class');
      count += __Porffor_regex_parseClassVOperandOrRange();
      strs = __Porffor_regex_strsConcat(strs, __Porffor_regex_vOpStrs);
    }
  }

  if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 93) __Porffor_regex_err('Regex parse: unterminated class');
  __Porffor_regex_pPos += 1;
  if (negated && strs != 0) __Porffor_regex_err('Regex parse: negated class may contain strings');
  const node: i32 = __Porffor_regex_classNode(start, count, negated);
  __Porffor_regex_vOpStrs = strs;
  return node;
};

// longer continuations are tried before ending here (longest first)
export const __Porffor_regex_strsTrie = (list: any[], d: i32): i32 => {
  const alt: i32 = __Porffor_regex_node(8, 0);
  let terminal: boolean = false;
  const seen: any[] = Porffor.array.new(8);
  const n: i32 = list.length;
  for (let i: i32 = 0; i < n; i++) {
    const s: any[] = list[i];
    if (s.length == d) {
      terminal = true;
      continue;
    }
    const c: i32 = s[d];
    let dup: boolean = false;
    for (let j: i32 = 0; j < seen.length; j++) {
      if (seen[j] == c) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    Porffor.array.fastPush(seen, c);

    const sub: any[] = Porffor.array.new(4);
    for (let j: i32 = i; j < n; j++) {
      const t: any[] = list[j];
      if (t.length > d) if (t[d] == c) Porffor.array.fastPush(sub, t);
    }
    const concat: i32 = __Porffor_regex_node(9, 0);
    __Porffor_regex_appendChild(concat, __Porffor_regex_charNode(c));
    __Porffor_regex_appendChild(concat, __Porffor_regex_strsTrie(sub, d + 1));
    __Porffor_regex_appendChild(alt, concat);
  }
  if (terminal) __Porffor_regex_appendChild(alt, __Porffor_regex_node(0, 0));
  return alt;
};

// multi-cp strings first, then single cps, then the empty string
export const __Porffor_regex_withStrs = (cls: i32): i32 => {
  if (__Porffor_regex_vOpStrs == 0) return cls;
  const strs: any[] = __Porffor_regex_vOpStrs;
  __Porffor_regex_vOpStrs = 0;

  const multi: any[] = Porffor.array.new(4);
  let empty: boolean = false;
  for (let i: i32 = 0; i < strs.length; i++) {
    const s: any[] = strs[i];
    if (s.length == 0) empty = true;
      else Porffor.array.fastPush(multi, s);
  }
  const alt: i32 = __Porffor_regex_node(8, 0);
  if (multi.length > 0) __Porffor_regex_appendChild(alt, __Porffor_regex_strsTrie(multi, 0));
  __Porffor_regex_appendChild(alt, cls);
  if (empty) __Porffor_regex_appendChild(alt, __Porffor_regex_node(0, 0));
  return alt;
};

export const __Porffor_regex_parseClassV = (): i32 => __Porffor_regex_withStrs(__Porffor_regex_parseClassVBody());

// operand or a-b range in union context, appends and returns count
export const __Porffor_regex_parseClassVOperandOrRange = (): i32 => {
  const before: i32 = __Porffor_regex_rangesTop;
  const aCp: i32 = __Porffor_regex_parseClassSetOperand();
  if (aCp >= 0) {
    if (__Porffor_regex_pAt(__Porffor_regex_pPos) == 45 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) != 93 && __Porffor_regex_pAt(__Porffor_regex_pPos + 1) != 45) {
      __Porffor_regex_pPos += 1;
      const bCp: i32 = __Porffor_regex_parseClassSetOperand();
      if (bCp < 0) __Porffor_regex_err('Regex parse: invalid class range');
      if (aCp > bCp) __Porffor_regex_err('Regex parse: class range out of order');
      __Porffor_regex_rangePush(aCp, bCp);
      return __Porffor_regex_rangesTop - before;
    }
    __Porffor_regex_rangePush(aCp, aCp);
  }
  return __Porffor_regex_rangesTop - before;
};

export const __Porffor_regex_parseAtomEscape = (): i32 => {
  const uMode: boolean = (__Porffor_regex_pFlags & 0b00010000) != 0;
  const vMode: boolean = (__Porffor_regex_pFlags & 0b10000000) != 0;
  let c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
  if (c == -1) __Porffor_regex_err('Regex parse: trailing backslash');

  // \d \w \s \p become class nodes
  const rStart: i32 = __Porffor_regex_rangesTop;
  __Porffor_regex_vOpStrs = 0;
  const setCount: i32 = __Porffor_regex_setEscapeAt(c);
  if (setCount >= 0) {
    const cls: i32 = __Porffor_regex_classNode(rStart, setCount, false);
    if (Porffor.comptime.flag`hasFunc.__Porffor_regex_vUsed`) {
      return __Porffor_regex_withStrs(cls);
    }
    return cls;
  }

  // backrefs
  if (c >= 49 && c <= 57) { // 1-9
    const save: i32 = __Porffor_regex_pPos;
    const num: i32 = __Porffor_regex_parseDecimal();
    if (num <= __Porffor_regex_pTotalCaps) {
      const n: i32 = __Porffor_regex_node(5, 0);
      Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 4, num);
      Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 8, (__Porffor_regex_pFlags & 0b00000010) != 0 ? 1 : 0);
      return n;
    }
    if (uMode || vMode) __Porffor_regex_err('Regex parse: invalid backreference');
    // annexB: octal / identity
    __Porffor_regex_pPos = save;
    c = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (c <= 55) { // octal start 1-7
      let v: i32 = 0;
      let digits: i32 = 0;
      while (digits < 3) {
        const d: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
        if (d < 48 || d > 55) break;
        const nv: i32 = v * 8 + (d - 48);
        if (nv > 255) break;
        v = nv;
        __Porffor_regex_pPos += 1;
        digits += 1;
      }
      return __Porffor_regex_charNode(v);
    }
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_charNode(c); // \8 \9 identity
  }

  if (c == 48) { // \0
    __Porffor_regex_pPos += 1;
    const d: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (d >= 48 && d <= 57) {
      if (uMode || vMode) __Porffor_regex_err('Regex parse: invalid \\0 escape');
      if (d <= 55) { // octal continues
        let v: i32 = 0;
        let digits: i32 = 1;
        while (digits < 3) {
          const dd: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
          if (dd < 48 || dd > 55) break;
          const nv: i32 = v * 8 + (dd - 48);
          if (nv > 255) break;
          v = nv;
          __Porffor_regex_pPos += 1;
          digits += 1;
        }
        return __Porffor_regex_charNode(v);
      }
    }
    return __Porffor_regex_charNode(0);
  }

  if (c == 107) { // \k
    if (__Porffor_regex_pHasNames || uMode || vMode) {
      __Porffor_regex_pPos += 1;
      const name: any = __Porffor_regex_parseGroupName();
      const n: i32 = __Porffor_regex_node(5, 1); // aux 1 = named, resolve post-parse
      const krefs: any[] = __Porffor_regex_pKRefs;
      Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 4, krefs.length);
      Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 8, (__Porffor_regex_pFlags & 0b00000010) != 0 ? 1 : 0);
      Porffor.array.fastPush(krefs, name);
      Porffor.array.fastPush(krefs, n);
      return n;
    }
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_charNode(107); // annexB identity
  }

  __Porffor_regex_pPos += 1;
  if (c == 110) return __Porffor_regex_charNode(10);
  if (c == 114) return __Porffor_regex_charNode(13);
  if (c == 116) return __Porffor_regex_charNode(9);
  if (c == 118) return __Porffor_regex_charNode(11);
  if (c == 102) return __Porffor_regex_charNode(12);
  if (c == 120) {
    const v: i32 = __Porffor_regex_parseHexEscape(120);
    if (v >= 0) return __Porffor_regex_charNode(v);
    if (uMode || vMode) __Porffor_regex_err('Regex parse: invalid \\x escape');
    return __Porffor_regex_charNode(120);
  }
  if (c == 117) {
    const v: i32 = __Porffor_regex_parseHexEscape(117);
    if (v >= 0) return __Porffor_regex_charNode(v);
    if (uMode || vMode) __Porffor_regex_err('Regex parse: invalid \\u escape');
    return __Porffor_regex_charNode(117);
  }
  if (c == 99) { // \c
    const cc: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if ((cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122)) {
      __Porffor_regex_pPos += 1;
      return __Porffor_regex_charNode(cc & 31);
    }
    if (uMode || vMode) __Porffor_regex_err('Regex parse: invalid \\c escape');
    __Porffor_regex_pPos -= 1;
    return __Porffor_regex_charNode(92); // annexB: match backslash, 'c' becomes next atom
  }

  if (uMode || vMode) {
    const okV: boolean = vMode && __Porffor_regex_isClassSetPunct(c);
    if (!__Porffor_regex_isSyntaxChar(c) && c != 47 && !okV) __Porffor_regex_err('Regex parse: invalid identity escape');
  }
  // identity escape, cp-aware
  __Porffor_regex_pPos -= 1;
  const cp: i32 = __Porffor_regex_pCp();
  __Porffor_regex_pPos += __Porffor_regex_pCpW;
  return __Porffor_regex_charNode(cp);
};

// {n,m} at pPos, min/max land in qMin/qMax, false if not a brace quant
let __Porffor_regex_qMin: i32 = 0;
let __Porffor_regex_qMax: i32 = 0;
export const __Porffor_regex_tryBraceQuant = (): boolean => {
  const save: i32 = __Porffor_regex_pPos;
  __Porffor_regex_pPos += 1; // {
  const min: i32 = __Porffor_regex_parseDecimal();
  if (min < 0) {
    __Porffor_regex_pPos = save;
    return false;
  }
  let max: i32 = min;
  let c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
  if (c == 44) { // ,
    __Porffor_regex_pPos += 1;
    max = __Porffor_regex_parseDecimal();
    if (max < 0) max = -1; // open {n,}
  }
  if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 125) { // }
    __Porffor_regex_pPos = save;
    return false;
  }
  __Porffor_regex_pPos += 1;
  if (max != -1 && max < min) __Porffor_regex_err('Regex parse: numbers out of order in quantifier');
  __Porffor_regex_qMin = min;
  __Porffor_regex_qMax = max;
  return true;
};

// * + ? {n,m} after an atom becomes a quant node around it
export const __Porffor_regex_parseQuantifier = (atom: i32): i32 => {
  const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
  let min: i32 = -1;
  let max: i32 = -1;
  if (c == 42) { // *
    min = 0;
    max = -1;
    __Porffor_regex_pPos += 1;
  } else if (c == 43) { // +
      min = 1;
      max = -1;
      __Porffor_regex_pPos += 1;
    } else if (c == 63) { // ?
      min = 0;
      max = 1;
      __Porffor_regex_pPos += 1;
    } else if (c == 123) { // {
      if (__Porffor_regex_tryBraceQuant()) {
        min = __Porffor_regex_qMin;
        max = __Porffor_regex_qMax;
      } else {
        if ((__Porffor_regex_pFlags & 0b10010000) != 0) __Porffor_regex_err('Regex parse: invalid quantifier');
        return atom;
      }
    } else return atom;

  let greedy: i32 = 1;
  if (__Porffor_regex_pAt(__Porffor_regex_pPos) == 63) { // lazy ?
    greedy = 0;
    __Porffor_regex_pPos += 1;
  }

  const n: i32 = __Porffor_regex_node(10, greedy);
  Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 4, min);
  Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 8, max);
  Porffor.IR.storeI32(__Porffor_regex_nPtr(n), 12, atom);
  return n;
};

export const __Porffor_regex_parseTerm = (): i32 => {
  const uvMode: boolean = (__Porffor_regex_pFlags & 0b10010000) != 0;
  let c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);

  // asserts carry their (possibly modifier-scoped) flag in aux bit 4: m for ^ $, i for \b \B
  const mBit: i32 = (__Porffor_regex_pFlags & 0b00000100) != 0 ? 16 : 0;
  if (c == 94) { // ^
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_node(4, 0 | mBit);
  }
  if (c == 36) { // $
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_node(4, 1 | mBit);
  }

  if (c == 92) { // \b \B here, other escapes via parseAtomEscape
    const c1: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 1);
    const iBit: i32 = (__Porffor_regex_pFlags & 0b00000010) != 0 ? 16 : 0;
    if (c1 == 98) { // \b
      __Porffor_regex_pPos += 2;
      return __Porffor_regex_node(4, 2 | iBit);
    }
    if (c1 == 66) { // \B
      __Porffor_regex_pPos += 2;
      return __Porffor_regex_node(4, 3 | iBit);
    }
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_parseQuantifier(__Porffor_regex_parseAtomEscape());
  }

  if (c == 40) { // (
    const c1: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 1);
    if (c1 == 63) {
      const c2: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 2);
      if (c2 == 61 || c2 == 33) { // (?= (?!
        __Porffor_regex_pPos += 3;
        const look: i32 = __Porffor_regex_node(7, c2 == 33 ? 1 : 0);
        __Porffor_regex_appendChild(look, __Porffor_regex_parseDisjunction());
        if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 41) __Porffor_regex_err('Regex parse: unmatched (');
        __Porffor_regex_pPos += 1;
        if (!uvMode) return __Porffor_regex_parseQuantifier(look); // lookahead is quantifiable per annexB
        return look;
      }
      if (c2 == 60) { // (?<
        const c3: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos + 3);
        if (c3 == 61 || c3 == 33) { // lookbehind
          __Porffor_regex_pPos += 4;
          const look: i32 = __Porffor_regex_node(7, (c3 == 33 ? 1 : 0) | 2);
          __Porffor_regex_appendChild(look, __Porffor_regex_parseDisjunction());
          if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 41) __Porffor_regex_err('Regex parse: unmatched (');
          __Porffor_regex_pPos += 1;
          return look;
        }
        // named group
        __Porffor_regex_pPos += 2;
        const name: any = __Porffor_regex_parseGroupName();
        const capIdx: i32 = __Porffor_regex_pCaps;
        __Porffor_regex_pCaps += 1;
        __Porffor_regex_addName(name, capIdx);
        const g: i32 = __Porffor_regex_node(6, 0);
        Porffor.IR.storeI32(__Porffor_regex_nPtr(g), 4, capIdx);
        __Porffor_regex_appendChild(g, __Porffor_regex_parseDisjunction());
        if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 41) __Porffor_regex_err('Regex parse: unmatched (');
        __Porffor_regex_pPos += 1;
        return __Porffor_regex_parseQuantifier(g);
      }
      // (?: or modifiers (?ims-ims:, scoped over the body at parse time
      let add: i32 = 0;
      let remove: i32 = 0;
      let p: i32 = __Porffor_regex_pPos + 2;
      let removing: boolean = false;
      while (true) {
        const m: i32 = __Porffor_regex_pAt(p);
        if (m == 58) break; // :
        let bit: i32 = 0;
        if (m == 105) bit = 0b00000010; // i
          else if (m == 109) bit = 0b00000100; // m
          else if (m == 115) bit = 0b00001000; // s
          else if (m == 45 && !removing) { // -
            removing = true;
            p += 1;
            continue;
          } else __Porffor_regex_err('Regex parse: invalid group');
        if (((add | remove) & bit) != 0) __Porffor_regex_err('Regex parse: repeated regexp modifier');
        if (removing) remove |= bit;
          else add |= bit;
        p += 1;
      }
      if (removing && add == 0 && remove == 0) __Porffor_regex_err('Regex parse: empty regexp modifiers');
      __Porffor_regex_pPos = p + 1;

      const outerFlags: i32 = __Porffor_regex_pFlags;
      __Porffor_regex_pFlags = (outerFlags | add) & ~remove;
      const g: i32 = __Porffor_regex_node(6, 1);
      __Porffor_regex_appendChild(g, __Porffor_regex_parseDisjunction());
      __Porffor_regex_pFlags = outerFlags;
      if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 41) __Porffor_regex_err('Regex parse: unmatched (');
      __Porffor_regex_pPos += 1;
      return __Porffor_regex_parseQuantifier(g);
    }
    // capturing group
    __Porffor_regex_pPos += 1;
    const capIdx: i32 = __Porffor_regex_pCaps;
    __Porffor_regex_pCaps += 1;
    const g: i32 = __Porffor_regex_node(6, 0);
    Porffor.IR.storeI32(__Porffor_regex_nPtr(g), 4, capIdx);
    __Porffor_regex_appendChild(g, __Porffor_regex_parseDisjunction());
    if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 41) __Porffor_regex_err('Regex parse: unmatched (');
    __Porffor_regex_pPos += 1;
    return __Porffor_regex_parseQuantifier(g);
  }

  if (c == 91) { // [
    __Porffor_regex_pPos += 1;
    let cls: i32 = 0;
    if ((__Porffor_regex_pFlags & 0b10000000) != 0) {
      if (Porffor.comptime.flag`hasFunc.__Porffor_regex_vUsed`) {
        cls = __Porffor_regex_parseClassV();
      } else __Porffor_regex_err('Regex parse: v flag classes unavailable');
    } else cls = __Porffor_regex_parseClass();
    return __Porffor_regex_parseQuantifier(cls);
  }

  if (c == 46) { // .
    __Porffor_regex_pPos += 1;
    let atom: i32;
    if ((__Porffor_regex_pFlags & 0b00001000) != 0) atom = __Porffor_regex_node(3, 0); // s: any
      else {
        const start: i32 = __Porffor_regex_rangesTop;
        __Porffor_regex_rangePush(10, 10);
        __Porffor_regex_rangePush(13, 13);
        __Porffor_regex_rangePush(0x2028, 0x2029);
        const n: i32 = __Porffor_regex_rangesComplementInPlace(start, 3);
        const node: i32 = __Porffor_regex_node(2, 0);
        Porffor.IR.storeI32(__Porffor_regex_nPtr(node), 4, start);
        Porffor.IR.storeI32(__Porffor_regex_nPtr(node), 8, n);
        atom = node;
      }
    return __Porffor_regex_parseQuantifier(atom);
  }

  if (Porffor.fastOr(c == 42, c == 43, c == 63)) __Porffor_regex_err('Regex parse: nothing to repeat');
  if (c == 123) { // {
    if (uvMode) __Porffor_regex_err('Regex parse: lone quantifier brackets');
    const save: i32 = __Porffor_regex_pPos;
    if (__Porffor_regex_tryBraceQuant()) __Porffor_regex_err('Regex parse: nothing to repeat');
    __Porffor_regex_pPos = save;
  }
  if (uvMode && Porffor.fastOr(c == 93, c == 125)) __Porffor_regex_err('Regex parse: lone quantifier brackets');

  const cp: i32 = __Porffor_regex_pCp();
  __Porffor_regex_pPos += __Porffor_regex_pCpW;
  return __Porffor_regex_parseQuantifier(__Porffor_regex_charNode(cp));
};

export const __Porffor_regex_parseAlternative = (): i32 => {
  const concat: i32 = __Porffor_regex_node(9, 0);
  while (true) {
    const c: i32 = __Porffor_regex_pAt(__Porffor_regex_pPos);
    if (c == -1 || c == 124 || c == 41) break; // | )
    __Porffor_regex_appendChild(concat, __Porffor_regex_parseTerm());
  }
  return concat;
};

export const __Porffor_regex_parseDisjunction = (): i32 => {
  const disjId: i32 = __Porffor_regex_pDisj;
  __Porffor_regex_pDisj += 1;
  const path: any[] = __Porffor_regex_pPath;
  Porffor.array.fastPush(path, disjId);
  Porffor.array.fastPush(path, 0);

  const first: i32 = __Porffor_regex_parseAlternative();
  if (__Porffor_regex_pAt(__Porffor_regex_pPos) != 124) { // |
    path.length = path.length - 2;
    return first;
  }

  const alt: i32 = __Porffor_regex_node(8, 0);
  __Porffor_regex_appendChild(alt, first);
  let altIdx: i32 = 0;
  while (__Porffor_regex_pAt(__Porffor_regex_pPos) == 124) {
    __Porffor_regex_pPos += 1;
    altIdx += 1;
    path[path.length - 1] = altIdx;
    __Porffor_regex_appendChild(alt, __Porffor_regex_parseAlternative());
  }
  path.length = path.length - 2;
  return alt;
};

// entry point, returns the root node
export const __Porffor_regex_parse = (pattern: any, flags: i32): i32 => {
  __Porffor_regex_pU16 = Porffor.type(pattern) == Porffor.TYPES.string;
  let srcType: i32 = Porffor.TYPES.bytestring;
  if (__Porffor_regex_pU16) srcType = Porffor.TYPES.string;
  __Porffor_regex_pSrcType = srcType;
  __Porffor_regex_pSrc = Porffor.as(Porffor.IR.ptr(pattern), srcType);
  __Porffor_regex_pLen = pattern == 0 ? 0 : (pattern as bytestring).length;
  __Porffor_regex_pPos = 0;
  __Porffor_regex_pFlags = flags;
  __Porffor_regex_pCaps = 0;
  __Porffor_regex_pDisj = 0;
  __Porffor_regex_nodesTop = 0;
  __Porffor_regex_rangesTop = 0;
  __Porffor_regex_pNames = Porffor.array.new(8);
  __Porffor_regex_pPath = Porffor.array.new(8);
  __Porffor_regex_pKRefs = Porffor.array.new(4);
  __Porffor_regex_pMulti = Porffor.array.new(4);

  __Porffor_regex_prescan();
  const root: i32 = __Porffor_regex_parseDisjunction();
  if (__Porffor_regex_pPos < __Porffor_regex_pLen) __Porffor_regex_err('Regex parse: unmatched )');

  // patch \k<name> refs now all groups are known
  const krefs: any[] = __Porffor_regex_pKRefs;
  const names: any[] = __Porffor_regex_pNames;
  for (let i: i32 = 0; i < krefs.length; i += 2) {
    const name: any = krefs[i];
    const node: i32 = krefs[i + 1];
    const matches: any[] = Porffor.array.new(2);
    for (let j: i32 = 0; j < names.length; j += 3) {
      if (Porffor.strcmp(names[j], name)) Porffor.array.fastPush(matches, names[j + 1]);
    }
    if (matches.length == 0) __Porffor_regex_err('Regex parse: invalid named reference');
    if (matches.length == 1) {
      Porffor.IR.storeU8(__Porffor_regex_nPtr(node), 1, 0);
      Porffor.IR.storeI32(__Porffor_regex_nPtr(node), 4, (matches[0] as i32) + 1);
    } else {
      const multi: any[] = __Porffor_regex_pMulti;
      Porffor.IR.storeI32(__Porffor_regex_nPtr(node), 4, multi.length);
      Porffor.array.fastPush(multi, matches);
    }
  }

  return root;
};
// fill each node's capFirst/capCount (packed at +20) bottom-up
export const __Porffor_regex_capRangePass = (node: i32): void => {
  const kind: i32 = __Porffor_regex_nKind(node);
  let first: i32 = 0xFFFF;
  let count: i32 = 0;
  if (kind == 6 && __Porffor_regex_nAux(node) == 0) {
    first = __Porffor_regex_nD1(node);
    count = 1;
  }
  let c: i32 = __Porffor_regex_nChild(node);
  while (c != -1) {
    __Porffor_regex_capRangePass(c);
    const packed: i32 = Porffor.IR.loadI32(__Porffor_regex_nPtr(c), 20);
    const cFirst: i32 = packed & 0xFFFF;
    const cCount: i32 = packed >>> 16;
    if (cCount > 0) {
      if (cFirst < first) first = cFirst;
      const cEnd: i32 = cFirst + cCount;
      const end: i32 = count == 0 ? cEnd : (first + count > cEnd ? first + count : cEnd);
      count = end - first;
    }
    c = __Porffor_regex_nSib(c);
  }
  if (count == 0) first = 0;
  Porffor.IR.storeI32(__Porffor_regex_nPtr(node), 20, first | (count << 16));
};

// fewest input units a match can consume
export const __Porffor_regex_minLenPass = (node: i32): i32 => {
  const kind: i32 = __Porffor_regex_nKind(node);
  if (kind == 1) return __Porffor_regex_nD1(node) > 0xFFFF ? 2 : 1; // char
  if (kind == 2) { // class, 2 units if astral-only
    const start: i32 = __Porffor_regex_nD1(node);
    const count: i32 = __Porffor_regex_nD2(node);
    if (count == 0) return 0xFFFF; // never matches
    return __Porffor_regex_rangeLo(start) > 0xFFFF ? 2 : 1;
  }
  if (kind == 3) return 1; // any
  if (Porffor.fastOr(kind == 0, kind == 4, kind == 5, kind == 7)) return 0; // these consume nothing
  if (kind == 8) { // alt: cheapest child
    let m: i32 = 0xFFFF;
    let c: i32 = __Porffor_regex_nChild(node);
    while (c != -1) {
      const cm: i32 = __Porffor_regex_minLenPass(c);
      if (cm < m) m = cm;
      c = __Porffor_regex_nSib(c);
    }
    return m == 0xFFFF ? 0 : m;
  }
  if (kind == 9 || kind == 6) { // concat/group: sum of children
    let m: i32 = 0;
    let c: i32 = __Porffor_regex_nChild(node);
    while (c != -1) {
      m += __Porffor_regex_minLenPass(c);
      if (m > 0xFFFF) m = 0xFFFF;
      c = __Porffor_regex_nSib(c);
    }
    return m;
  }
  if (kind == 10) { // quant: min * child
    const min: i32 = __Porffor_regex_nD1(node);
    if (min == 0) return 0;
    let m: i32 = min * __Porffor_regex_minLenPass(__Porffor_regex_nChild(node));
    if (m > 0xFFFF) m = 0xFFFF;
    return m;
  }
  return 0;
};

// first-unit set: fills fsBitmap (32B), sets fsWide/fsUnknown, returns nullable (can match empty)
let __Porffor_regex_fsBitmap: any = 0;
let __Porffor_regex_fsWide: boolean = false;
let __Porffor_regex_fsUnknown: boolean = false;

export const __Porffor_regex_fsBit = (unit: i32): void => {
  if (unit > 255) {
    __Porffor_regex_fsWide = true;
    return;
  }
  const p: i32 = Porffor.IR.ptr(__Porffor_regex_fsBitmap) + (unit >> 3);
  Porffor.IR.storeU8(p, 0, Porffor.IR.loadU8(p, 0) | (1 << (unit & 7)));
};

export const __Porffor_regex_firstPass = (node: i32): boolean => {
  const kind: i32 = __Porffor_regex_nKind(node);
  if (kind == 1) { // char: its first unit, lead surrogate if astral
    const cp: i32 = __Porffor_regex_nD1(node);
    __Porffor_regex_fsBit(cp > 0xFFFF ? 0xD800 + ((cp - 0x10000) >> 10) : cp);
    return false;
  }
  if (kind == 2) { // class
    const start: i32 = __Porffor_regex_nD1(node);
    const count: i32 = __Porffor_regex_nD2(node);
    for (let i: i32 = start; i < start + count; i++) {
      const lo: i32 = __Porffor_regex_rangeLo(i);
      const hi: i32 = __Porffor_regex_rangeHi(i);
      if (lo > 255) {
        __Porffor_regex_fsWide = true;
        break;
      }
      const bHi: i32 = hi > 255 ? 255 : hi;
      if (hi > 255) __Porffor_regex_fsWide = true;
      for (let u: i32 = lo; u <= bHi; u++) __Porffor_regex_fsBit(u);
    }
    return count == 0;
  }
  if (kind == 3) { // any
    __Porffor_regex_fsUnknown = true;
    return false;
  }
  if (kind == 5) { // backref
    __Porffor_regex_fsUnknown = true;
    return true;
  }
  if (Porffor.fastOr(kind == 0, kind == 4, kind == 7)) return true; // zero-width
  if (kind == 8) { // alt
    let nullable: boolean = false;
    let c: i32 = __Porffor_regex_nChild(node);
    while (c != -1) {
      if (__Porffor_regex_firstPass(c)) nullable = true;
      c = __Porffor_regex_nSib(c);
    }
    return nullable;
  }
  if (kind == 9 || kind == 6) { // concat/group
    let c: i32 = __Porffor_regex_nChild(node);
    while (c != -1) {
      if (!__Porffor_regex_firstPass(c)) return false;
      c = __Porffor_regex_nSib(c);
    }
    return true;
  }
  if (kind == 10) { // quant: nullable when min 0
    const nullable: boolean = __Porffor_regex_firstPass(__Porffor_regex_nChild(node));
    return nullable || __Porffor_regex_nD1(node) == 0;
  }
  return true;
};

// true when every alternative starts with ^
export const __Porffor_regex_anchoredPass = (node: i32): boolean => {
  const kind: i32 = __Porffor_regex_nKind(node);
  if (kind == 4) return __Porffor_regex_nAux(node) == ((__Porffor_regex_pFlags & 0b00000100) != 0 ? 16 : 0);
  if (kind == 8) {
    let c: i32 = __Porffor_regex_nChild(node);
    while (c != -1) {
      if (!__Porffor_regex_anchoredPass(c)) return false;
      c = __Porffor_regex_nSib(c);
    }
    return true;
  }
  if (kind == 9 || kind == 6) {
    const c: i32 = __Porffor_regex_nChild(node);
    if (c == -1) return false;
    return __Porffor_regex_anchoredPass(c);
  }
  return false;
};

let __Porffor_regex_bcTop: i32 = 0;
let __Porffor_regex_eLabels: any = 0; // label -> bytecode pos, -1 while unbound
let __Porffor_regex_eFixups: any = 0; // (bcPos, label) pairs to patch at the end
let __Porffor_regex_eCounters: i32 = 0;

export const __Porffor_regex_bcEnsure = (need: i32): void => {
  const needBytes: i32 = __Porffor_regex_bcTop + need;
  if (needBytes <= __Porffor_regex_capBc) return;
  let newCap: i32 = __Porffor_regex_capBc == 0 ? 4096 : __Porffor_regex_capBc;
  while (newCap < needBytes) newCap *= 2;
  const nbuf: any = __Porffor_regex_alloc(newCap);
  if (__Porffor_regex_bufBc != 0) Porffor.IR.copy(Porffor.IR.ptr(nbuf), Porffor.IR.ptr(__Porffor_regex_bufBc), __Porffor_regex_bcTop);
  __Porffor_regex_bufBc = nbuf;
  __Porffor_regex_capBc = newCap;
};

export const __Porffor_regex_e8 = (v: i32): void => {
  __Porffor_regex_bcEnsure(1);
  Porffor.IR.storeU8(Porffor.IR.ptr(__Porffor_regex_bufBc) + __Porffor_regex_bcTop, 0, v);
  __Porffor_regex_bcTop += 1;
};
export const __Porffor_regex_e16 = (v: i32): void => {
  __Porffor_regex_bcEnsure(2);
  Porffor.IR.storeU16(Porffor.IR.ptr(__Porffor_regex_bufBc) + __Porffor_regex_bcTop, 0, v);
  __Porffor_regex_bcTop += 2;
};
export const __Porffor_regex_e32 = (v: i32): void => {
  __Porffor_regex_bcEnsure(4);
  Porffor.IR.storeI32(Porffor.IR.ptr(__Porffor_regex_bufBc) + __Porffor_regex_bcTop, 0, v);
  __Porffor_regex_bcTop += 4;
};

export const __Porffor_regex_eLabel = (): i32 => {
  const labels: any[] = __Porffor_regex_eLabels;
  Porffor.array.fastPush(labels, -1);
  return labels.length - 1;
};
export const __Porffor_regex_eBind = (label: i32): void => {
  const labels: any[] = __Porffor_regex_eLabels;
  labels[label] = __Porffor_regex_bcTop;
};
export const __Porffor_regex_eRef = (label: i32): void => {
  const fixups: any[] = __Porffor_regex_eFixups;
  Porffor.array.fastPush(fixups, __Porffor_regex_bcTop);
  Porffor.array.fastPush(fixups, label);
  __Porffor_regex_e16(0);
};

// [nR u16][32B bitmap][lo u32, hi u32]*, wide ranges only
export const __Porffor_regex_eClassPayload = (start: i32, count: i32): void => {
  let nWide: i32 = 0;
  for (let i: i32 = start; i < start + count; i++) {
    if (__Porffor_regex_rangeHi(i) > 255) nWide += 1;
  }
  __Porffor_regex_e16(nWide);
  const bmAt: i32 = __Porffor_regex_bcTop;
  __Porffor_regex_bcEnsure(32);
  Porffor.IR.fill(Porffor.IR.ptr(__Porffor_regex_bufBc) + bmAt, 0, 32);
  __Porffor_regex_bcTop += 32;
  for (let i: i32 = start; i < start + count; i++) {
    const lo: i32 = __Porffor_regex_rangeLo(i);
    const hi: i32 = __Porffor_regex_rangeHi(i);
    const bHi: i32 = hi > 255 ? 255 : hi;
    for (let u: i32 = lo; u <= bHi; u++) {
      if (u > 255) break;
      const p: i32 = Porffor.IR.ptr(__Porffor_regex_bufBc) + bmAt + (u >> 3);
      Porffor.IR.storeU8(p, 0, Porffor.IR.loadU8(p, 0) | (1 << (u & 7)));
    }
    if (hi > 255) {
      const wLo: i32 = lo > 256 ? lo : 256;
      __Porffor_regex_e32(wLo);
      __Porffor_regex_e32(hi);
    }
  }
};

// kind if node fits a run superinstruction (consumes exactly one unit), else 0
export const __Porffor_regex_runnable = (node: i32): i32 => {
  const kind: i32 = __Porffor_regex_nKind(node);
  if (kind == 1) return __Porffor_regex_nD1(node) > 0xFFFF ? 0 : 1;
  if (kind == 2) return __Porffor_regex_nD2(node) == 0 ? 0 : 2;
  if (kind == 3) return 3;
  return 0;
};

export const __Porffor_regex_emitNode = (node: i32, bwd: i32): void => {
  const kind: i32 = __Porffor_regex_nKind(node);

  if (kind == 0) return;

  if (kind == 1) { // char
    const cp: i32 = __Porffor_regex_nD1(node);
    if (cp <= 255) {
      __Porffor_regex_e8(0x01);
      __Porffor_regex_e8(cp);
    } else if (cp <= 0xFFFF) {
        __Porffor_regex_e8(0x02);
        __Porffor_regex_e16(cp);
      } else {
        __Porffor_regex_e8(0x1d);
        __Porffor_regex_e32(cp);
      }
    return;
  }

  if (kind == 2) { // class
    const start: i32 = __Porffor_regex_nD1(node);
    const count: i32 = __Porffor_regex_nD2(node);
    if (count == 0) { // reject
      __Porffor_regex_e8(0x1c);
      return;
    }
    // two lone cps below surrogates fit the charPair op
    if (count == 2 && __Porffor_regex_rangeLo(start) == __Porffor_regex_rangeHi(start) &&
        __Porffor_regex_rangeLo(start + 1) == __Porffor_regex_rangeHi(start + 1) &&
        __Porffor_regex_rangeHi(start + 1) < 0xD800) {
      __Porffor_regex_e8(0x03);
      __Porffor_regex_e16(__Porffor_regex_rangeLo(start));
      __Porffor_regex_e16(__Porffor_regex_rangeLo(start + 1));
      return;
    }
    if (__Porffor_regex_rangeHi(start + count - 1) <= 255) { // all < 256: bitmap op
      __Porffor_regex_e8(0x04);
      const bmAt: i32 = __Porffor_regex_bcTop;
      __Porffor_regex_bcEnsure(32);
      Porffor.IR.fill(Porffor.IR.ptr(__Porffor_regex_bufBc) + bmAt, 0, 32);
      __Porffor_regex_bcTop += 32;
      for (let i: i32 = start; i < start + count; i++) {
        for (let u: i32 = __Porffor_regex_rangeLo(i); u <= __Porffor_regex_rangeHi(i); u++) {
          const p: i32 = Porffor.IR.ptr(__Porffor_regex_bufBc) + bmAt + (u >> 3);
          Porffor.IR.storeU8(p, 0, Porffor.IR.loadU8(p, 0) | (1 << (u & 7)));
        }
      }
      return;
    }
    __Porffor_regex_e8(0x05);
    __Porffor_regex_eClassPayload(start, count);
    return;
  }

  if (kind == 3) { // any
    __Porffor_regex_e8(0x06);
    return;
  }

  if (kind == 4) { // asserts
    const aux: i32 = __Porffor_regex_nAux(node);
    __Porffor_regex_e8(((aux & 16) != 0 ? 0x22 : 0x16) + (aux & 3));
    return;
  }

  if (kind == 5) { // backref
    const d1: i32 = __Porffor_regex_nD1(node);
    if (__Porffor_regex_nAux(node) == 1) { // multiplex
      const multi: any[] = __Porffor_regex_pMulti;
      const idxs: any[] = multi[d1];
      __Porffor_regex_e8(__Porffor_regex_nD2(node) != 0 ? 0x27 : 0x15);
      __Porffor_regex_e8(idxs.length);
      for (let i: i32 = 0; i < idxs.length; i++) __Porffor_regex_e8((idxs[i] as i32) + 1);
    } else {
      __Porffor_regex_e8(__Porffor_regex_nD2(node) != 0 ? 0x26 : 0x14);
      __Porffor_regex_e8(d1);
    }
    return;
  }

  if (kind == 6) { // group
    if (__Porffor_regex_nAux(node) == 0) {
      const idx: i32 = __Porffor_regex_nD1(node);
      __Porffor_regex_e8(0x12); __Porffor_regex_e8(idx); __Porffor_regex_e8(bwd);
      if (__Porffor_regex_nChild(node) != -1) __Porffor_regex_emitNode(__Porffor_regex_nChild(node), bwd);
      __Porffor_regex_e8(0x12); __Porffor_regex_e8(idx); __Porffor_regex_e8(1 - bwd);
    } else if (__Porffor_regex_nChild(node) != -1) __Porffor_regex_emitNode(__Porffor_regex_nChild(node), bwd);
    return;
  }

  if (kind == 7) { // lookaround
    const aux: i32 = __Porffor_regex_nAux(node);
    const after: i32 = __Porffor_regex_eLabel();
    __Porffor_regex_e8(0x1a);
    __Porffor_regex_e8(aux & 1);
    __Porffor_regex_e8((aux & 2) != 0 ? 1 : 0);
    __Porffor_regex_eRef(after);
    if (__Porffor_regex_nChild(node) != -1) __Porffor_regex_emitNode(__Porffor_regex_nChild(node), (aux & 2) != 0 ? 1 : 0);
    __Porffor_regex_e8(0x1b); // lookEnd
    __Porffor_regex_eBind(after);
    return;
  }

  if (kind == 8) { // alt
    const end: i32 = __Porffor_regex_eLabel();
    let c: i32 = __Porffor_regex_nChild(node);
    while (c != -1) {
      const next: i32 = __Porffor_regex_nSib(c);
      if (next == -1) {
        __Porffor_regex_emitNode(c, bwd);
      } else {
        const alt: i32 = __Porffor_regex_eLabel();
        __Porffor_regex_e8(0x0b); // fork, prefer this alternative, alt = the next one
        const preferAt: i32 = __Porffor_regex_bcTop;
        __Porffor_regex_e16(preferAt + 4); // prefer: fall through
        __Porffor_regex_eRef(alt);
        __Porffor_regex_emitNode(c, bwd);
        __Porffor_regex_e8(0x0c); // jump end
        __Porffor_regex_eRef(end);
        __Porffor_regex_eBind(alt);
      }
      c = next;
    }
    __Porffor_regex_eBind(end);
    return;
  }

  if (kind == 9) { // concat
    if (bwd == 0) {
      let c: i32 = __Porffor_regex_nChild(node);
      while (c != -1) {
        __Porffor_regex_emitNode(c, bwd);
        c = __Porffor_regex_nSib(c);
      }
    } else {
      // lookbehind: emit children in reverse
      let n: i32 = 0;
      let c: i32 = __Porffor_regex_nChild(node);
      while (c != -1) {
        n += 1;
        c = __Porffor_regex_nSib(c);
      }
      for (let i: i32 = n - 1; i >= 0; i--) {
        c = __Porffor_regex_nChild(node);
        for (let j: i32 = 0; j < i; j++) c = __Porffor_regex_nSib(c);
        __Porffor_regex_emitNode(c, bwd);
      }
    }
    return;
  }

  // quant
  const child: i32 = __Porffor_regex_nChild(node);
  const min: i32 = __Porffor_regex_nD1(node);
  const max: i32 = __Porffor_regex_nD2(node);
  const greedy: i32 = __Porffor_regex_nAux(node) & 1;

  const runKind: i32 = __Porffor_regex_runnable(child);
  if (runKind != 0 && greedy == 1 && (max == -1 || max <= 0xFFFE) && min <= 0xFFFE) {
    // greedy runs get one run op instead of a loop
    if (runKind == 2) {
      // [^x] gets runNotChar, scannable a word at a time
      const start: i32 = __Porffor_regex_nD1(child);
      const count: i32 = __Porffor_regex_nD2(child);
      let notUnit: i32 = -1;
      if (count == 2 && __Porffor_regex_rangeLo(start) == 0 && __Porffor_regex_rangeHi(start + 1) >= 0x10FFFF &&
          __Porffor_regex_rangeLo(start + 1) - __Porffor_regex_rangeHi(start) == 2) notUnit = __Porffor_regex_rangeHi(start) + 1;
      if (count == 1 && __Porffor_regex_rangeLo(start) == 1 && __Porffor_regex_rangeHi(start) >= 0x10FFFF) notUnit = 0;
      if (notUnit != -1 && notUnit <= 0xFFFF) {
        __Porffor_regex_e8(0x20); // runNotChar
        __Porffor_regex_e8(bwd);
        __Porffor_regex_e16(min);
        __Porffor_regex_e16(max == -1 ? 0xFFFF : max);
        __Porffor_regex_e16(notUnit);
        return;
      }
    }
    if (runKind == 1) { __Porffor_regex_e8(0x07); } else if (runKind == 2) {
        const start: i32 = __Porffor_regex_nD1(child);
        const count: i32 = __Porffor_regex_nD2(child);
        if (__Porffor_regex_rangeHi(start + count - 1) <= 255) __Porffor_regex_e8(0x08);
          else __Porffor_regex_e8(0x09);
      } else __Porffor_regex_e8(0x0a);
    __Porffor_regex_e8(bwd);
    __Porffor_regex_e16(min);
    __Porffor_regex_e16(max == -1 ? 0xFFFF : max);
    if (runKind == 1) __Porffor_regex_e16(__Porffor_regex_nD1(child));
      else if (runKind == 2) {
        const start: i32 = __Porffor_regex_nD1(child);
        const count: i32 = __Porffor_regex_nD2(child);
        if (__Porffor_regex_rangeHi(start + count - 1) <= 255) {
          const bmAt: i32 = __Porffor_regex_bcTop;
          __Porffor_regex_bcEnsure(32);
          Porffor.IR.fill(Porffor.IR.ptr(__Porffor_regex_bufBc) + bmAt, 0, 32);
          __Porffor_regex_bcTop += 32;
          for (let i: i32 = start; i < start + count; i++) {
            for (let u: i32 = __Porffor_regex_rangeLo(i); u <= __Porffor_regex_rangeHi(i); u++) {
              const p: i32 = Porffor.IR.ptr(__Porffor_regex_bufBc) + bmAt + (u >> 3);
              Porffor.IR.storeU8(p, 0, Porffor.IR.loadU8(p, 0) | (1 << (u & 7)));
            }
          }
        } else __Porffor_regex_eClassPayload(start, count);
      }
    return;
  }

  // fall back to a real loop
  const packed: i32 = Porffor.IR.loadI32(__Porffor_regex_nPtr(child), 20);
  const capFirst: i32 = packed & 0xFFFF;
  const capCount: i32 = packed >>> 16;
  const exit: i32 = __Porffor_regex_eLabel();

  // max 1 is a plain fork, unless an empty-matchable optional body sets captures (needs the loop's empty check)
  if (max == 1) if (!(min == 0 && capCount > 0 && __Porffor_regex_minLenPass(child) == 0)) {
    if (min == 0) {
      __Porffor_regex_e8(0x0b); // fork
      if (greedy == 1) {
        const preferAt: i32 = __Porffor_regex_bcTop;
        __Porffor_regex_e16(preferAt + 4); // prefer the body (after operands)
        __Porffor_regex_eRef(exit); // alt: skip
      } else {
        __Porffor_regex_eRef(exit); // prefer: skip
        const altAt: i32 = __Porffor_regex_bcTop;
        __Porffor_regex_e16(altAt + 2); // alt: body
      }
    }
    if (capCount > 0) {
      __Porffor_regex_e8(0x13);
      __Porffor_regex_e8(capFirst);
      __Porffor_regex_e8(capFirst + capCount);
    }
    __Porffor_regex_emitNode(child, bwd);
    __Porffor_regex_eBind(exit);
    return;
  }

  const slot: i32 = __Porffor_regex_eCounters;
  __Porffor_regex_eCounters += 1;
  const useCounter: boolean = min > 0 || max != -1;
  const l0: i32 = __Porffor_regex_eLabel();

  if (useCounter) {
    __Porffor_regex_e8(0x0f); // counterReset
    __Porffor_regex_e8(slot);
  }

  __Porffor_regex_eBind(l0);
  if (useCounter) {
    __Porffor_regex_e8(0x10); // counterFork
    __Porffor_regex_e8(slot);
    __Porffor_regex_e8(greedy == 1 ? 0 : 1);
    __Porffor_regex_e16(min > 0xFFFE ? 0xFFFE : min);
    __Porffor_regex_e16(max == -1 || max > 0xFFFE ? 0xFFFF : max);
    __Porffor_regex_eRef(exit);
  } else if (greedy == 1) {
    __Porffor_regex_e8(0x0d); // forkLoop
    __Porffor_regex_e8(slot);
    const preferAt: i32 = __Porffor_regex_bcTop;
    __Porffor_regex_e16(preferAt + 4); // prefer the body
    __Porffor_regex_eRef(exit); // alt exits the loop
  } else {
    __Porffor_regex_e8(0x1f); // forkLoopLazy
    __Porffor_regex_e8(slot);
    __Porffor_regex_eRef(exit); // prefer exit, the body goes in as a backtrack entry
  }

  if (capCount > 0) {
    __Porffor_regex_e8(0x13);
    __Porffor_regex_e8(capFirst);
    __Porffor_regex_e8(capFirst + capCount);
  }
  __Porffor_regex_emitNode(child, bwd);

  if (useCounter) {
    __Porffor_regex_e8(0x11); // counterInc
    __Porffor_regex_e8(slot);
    __Porffor_regex_e8(0x1e); // loopEndCounted
    __Porffor_regex_e8(slot);
    __Porffor_regex_e16(min > 0xFFFE ? 0xFFFE : min);
    __Porffor_regex_eRef(l0);
  } else {
    __Porffor_regex_e8(0x0e); // loopEnd: loop back unless empty
    __Porffor_regex_e8(slot);
    __Porffor_regex_eRef(l0);
  }
  __Porffor_regex_eBind(exit);
};
// interpreter scratch (bytestring-typed module buffers, gc-rooted):
//   bufBt: backtrack entries, 5 i32 each: [kind, pc, a, b, undoTop]
//   bufUndo: undo log, 2 i32 each: [tag, oldVal], tag < 0x10000 capture slot,
//            0x10000+ counter slot, 0x20000+ loopSp slot
//   bufAux: caps (2 i32/group) | counters | loopSp | frames (6 i32: savedSp, savedDir,
//           btBoundary, undoTop, afterPc, neg) - laid out per attempt

let __Porffor_regex_mStart: i32 = 0;
let __Porffor_regex_mEnd: i32 = 0;
let __Porffor_regex_capsPtr: i32 = 0;

export const __Porffor_regex_btEnsure = (top: i32): void => {
  const needBytes: i32 = (top + 1) * 20;
  if (needBytes <= __Porffor_regex_capBt) return;
  let newCap: i32 = __Porffor_regex_capBt == 0 ? 8192 : __Porffor_regex_capBt;
  while (newCap < needBytes) newCap *= 2;
  if (newCap > 8388608) throw new RangeError('Regex backtrack stack overflow');
  const nbuf: any = __Porffor_regex_alloc(newCap);
  if (__Porffor_regex_bufBt != 0) Porffor.IR.copy(Porffor.IR.ptr(nbuf), Porffor.IR.ptr(__Porffor_regex_bufBt), top * 20);
  __Porffor_regex_bufBt = nbuf;
  __Porffor_regex_capBt = newCap;
};

export const __Porffor_regex_undoEnsure = (top: i32): void => {
  const needBytes: i32 = (top + 1) * 8;
  if (needBytes <= __Porffor_regex_capUndo) return;
  let newCap: i32 = __Porffor_regex_capUndo == 0 ? 4096 : __Porffor_regex_capUndo;
  while (newCap < needBytes) newCap *= 2;
  const nbuf: any = __Porffor_regex_alloc(newCap);
  if (__Porffor_regex_bufUndo != 0) Porffor.IR.copy(Porffor.IR.ptr(nbuf), Porffor.IR.ptr(__Porffor_regex_bufUndo), top * 8);
  __Porffor_regex_bufUndo = nbuf;
  __Porffor_regex_capUndo = newCap;
};

export const __Porffor_regex_undoTo = (target: i32, caps: i32, counters: i32, loopSp: i32, undoTop: i32): i32 => {
  while (undoTop > target) {
    undoTop -= 1;
    const ue: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
    const tag: i32 = Porffor.IR.loadI32(ue, 0);
    const old: i32 = Porffor.IR.loadI32(ue, 4);
    if (tag < 0x10000) Porffor.IR.storeI32(caps + tag * 4, 0, old);
      else if (tag < 0x20000) Porffor.IR.storeI32(counters + (tag - 0x10000) * 4, 0, old);
      else Porffor.IR.storeI32(loopSp + (tag - 0x20000) * 4, 0, old);
  }
  return undoTop;
};

// core matcher: attempt at one start position -> end or -1. pc = bytecode offset, sp = input
// position, backward = 1 inside lookbehind, caps/counters/loopSp/frames live in bufAux
export const __Porffor_regex_attempt = (code: i32, inputPtr: i32, inputLen: i32, isU16: boolean, cpMode: boolean, flags: i32, nCaps: i32, nSlots: i32, start: i32): i32 => {
  const uvFlag: boolean = (flags & 0b10010000) != 0;
  const canonMode: i32 = uvFlag ? 0 : 1;

  const aux: i32 = Porffor.IR.ptr(__Porffor_regex_bufAux);
  const caps: i32 = aux;
  const counters: i32 = caps + nCaps * 8;
  const loopSp: i32 = counters + nSlots * 4;
  const frames: i32 = loopSp + nSlots * 4;

  if (nCaps > 0) Porffor.IR.fill(caps, 0xFF, nCaps * 8);

  let pc: i32 = 0;
  let sp: i32 = start;
  let backward: i32 = 0;
  let btTop: i32 = 0;
  let undoTop: i32 = 0;
  let frameTop: i32 = 0;
  let fail: boolean = false;

  while (true) {
    const op: i32 = Porffor.IR.loadU8(code + pc, 0);

    if (op <= 0x08) {
      if (op == 0x01) { // char1
        const readPos: i32 = sp - backward;
        if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) {
          fail = true;
        } else {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
          if (unit == Porffor.IR.loadU8(code + pc, 1)) {
            if (backward == 0) sp += 1;
              else sp -= 1;
            pc += 2;
          } else {
            fail = true;
          }
        }
      } else if (op == 0x04) { // bitmap
        const readPos: i32 = sp - backward;
        if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) {
          fail = true;
        } else {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
          if (unit <= 255 && (Porffor.IR.loadU8(code + pc + 1 + (unit >> 3), 0) & (1 << (unit & 7))) != 0) {
            if (backward == 0) sp += 1;
              else sp -= 1;
            pc += 33;
          } else {
            fail = true;
          }
        }
      } else if (op == 0x07 || op == 0x08) { // runChar / runBitmap
        const runBackward: i32 = Porffor.IR.loadU8(code + pc, 1);
        const min: i32 = Porffor.IR.loadU16(code + pc, 2);
        const max: i32 = Porffor.IR.loadU16(code + pc, 4);
        const isChar: boolean = op == 0x07;
        const wanted: i32 = isChar ? Porffor.IR.loadU16(code + pc, 6) : 0;
        const bitmap: i32 = code + pc + 6;
        const afterPc: i32 = pc + (isChar ? 8 : 38);

        let runPos: i32 = sp;
        let count: i32 = 0;
        let minPos: i32 = sp;
        let limit: i32 = max;
        if (max == 0xFFFF) limit = 0x7FFFFFFF;

        if (runBackward == 0 && !(cpMode && isChar && wanted >= 0xD800 && wanted <= 0xDBFF)) {
          // forward run, one tight loop per compare kind
          let runEnd: i32 = inputLen;
          if (max != 0xFFFF && sp + max < runEnd) runEnd = sp + max;

          if (isU16) {
            if (isChar) {
              while (runPos < runEnd && Porffor.IR.loadU16(inputPtr + runPos * 2, 4) == wanted) runPos += 1;
            } else {
              while (runPos < runEnd) {
                const unit: i32 = Porffor.IR.loadU16(inputPtr + runPos * 2, 4);
                if (unit > 255) break;
                if ((Porffor.IR.loadU8(bitmap + (unit >> 3), 0) & (1 << (unit & 7))) == 0) break;
                runPos += 1;
              }
            }
          } else if (isChar) {
            if (wanted <= 255) {
              while (runPos < runEnd && Porffor.IR.loadU8(inputPtr + runPos, 4) == wanted) runPos += 1;
            }
          } else {
            while (runPos < runEnd) {
              const unit: i32 = Porffor.IR.loadU8(inputPtr + runPos, 4);
              if ((Porffor.IR.loadU8(bitmap + (unit >> 3), 0) & (1 << (unit & 7))) == 0) break;
              runPos += 1;
            }
          }

          count = runPos - sp;
          minPos = count < min ? runPos : sp + min;
        } else {
          while (count < limit) {
            const readPos: i32 = runPos - runBackward;
            if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) break;

            const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
            if (isChar) {
              if (unit != wanted) break;
              if (cpMode && unit >= 0xD800 && unit <= 0xDBFF && readPos + 1 < inputLen) { // only match a lead without its trail
                const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos + 1) * 2, 4);
                if (unit2 >= 0xDC00 && unit2 <= 0xDFFF) break;
              }
            } else {
              if (unit > 255) break;
              if ((Porffor.IR.loadU8(bitmap + (unit >> 3), 0) & (1 << (unit & 7))) == 0) break;
            }

            if (runBackward == 0) runPos += 1;
              else runPos -= 1;
            count += 1;
            if (count == min) minPos = runPos;
          }
        }

        if (count < min) {
          fail = true;
        } else {
          if (count > min) {
            if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
            const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
            Porffor.IR.storeI32(entry, 0, 1 + runBackward);
            Porffor.IR.storeI32(entry, 4, afterPc);
            Porffor.IR.storeI32(entry, 8, minPos);
            Porffor.IR.storeI32(entry, 12, runPos);
            Porffor.IR.storeI32(entry, 16, undoTop);
            btTop += 1;
          }

          sp = runPos;
          pc = afterPc;
        }
      } else if (op == 0x02) { // char2
        const readPos: i32 = sp - backward;
        if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) {
          fail = true;
        } else {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
          if (unit != Porffor.IR.loadU16(code + pc, 1)) {
            fail = true;
          } else {
            // a lead literal must not split a real pair in cp mode
            let splitsPair: boolean = false;
            if (cpMode && unit >= 0xD800 && unit <= 0xDBFF && readPos + 1 < inputLen) {
              const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos + 1) * 2, 4);
              splitsPair = unit2 >= 0xDC00 && unit2 <= 0xDFFF;
            }

            if (splitsPair) {
              fail = true;
            } else {
              if (backward == 0) sp += 1;
                else sp -= 1;
              pc += 3;
            }
          }
        }
      } else if (op == 0x03) { // charPair
        const readPos: i32 = sp - backward;
        if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) {
          fail = true;
        } else {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
          if (unit == Porffor.IR.loadU16(code + pc, 1) || unit == Porffor.IR.loadU16(code + pc, 3)) {
            if (backward == 0) sp += 1;
              else sp -= 1;
            pc += 5;
          } else {
            fail = true;
          }
        }
      } else if (op == 0x05 || op == 0x06) { // class / any1
        const readPos: i32 = sp - backward;
        if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) {
          fail = true;
        } else {
          // next cp, pairs merge in cp mode
          let cp: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
          let width: i32 = 1;
          if (cpMode) {
            if (backward == 0 && cp >= 0xD800 && cp <= 0xDBFF && readPos + 1 < inputLen) {
              const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos + 1) * 2, 4);
              if (unit2 >= 0xDC00 && unit2 <= 0xDFFF) {
                cp = 0x10000 + ((cp - 0xD800) << 10) + (unit2 - 0xDC00);
                width = 2;
              }
            } else if (backward != 0 && cp >= 0xDC00 && cp <= 0xDFFF && readPos - 1 >= 0) {
              const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos - 1) * 2, 4);
              if (unit2 >= 0xD800 && unit2 <= 0xDBFF) {
                cp = 0x10000 + ((unit2 - 0xD800) << 10) + (cp - 0xDC00);
                width = 2;
              }
            }
          }

          let ok: boolean = true;
          if (op == 0x05) {
            const rangeCount: i32 = Porffor.IR.loadU16(code + pc, 1);
            if (cp <= 255) {
              ok = (Porffor.IR.loadU8(code + pc + 3 + (cp >> 3), 0) & (1 << (cp & 7))) != 0;
            } else {
              // bsearch the wide ranges
              ok = false;
              const ranges: i32 = code + pc + 35;
              let lo: i32 = 0;
              let hi: i32 = rangeCount - 1;
              while (lo <= hi) {
                const mid: i32 = (lo + hi) >> 1;
                const rangeLo: i32 = Porffor.IR.loadI32(ranges + mid * 8, 0);
                const rangeHi: i32 = Porffor.IR.loadI32(ranges + mid * 8, 4);
                if (cp < rangeLo) {
                  hi = mid - 1;
                } else if (cp > rangeHi) {
                  lo = mid + 1;
                } else {
                  ok = true;
                  break;
                }
              }
            }
          }

          if (ok) {
            if (backward == 0) sp += width;
              else sp -= width;
            pc += op == 0x05 ? 35 + Porffor.IR.loadU16(code + pc, 1) * 8 : 1;
          } else {
            fail = true;
          }
        }
      } else if (op == 0x00) { // accept
        __Porffor_regex_mEnd = sp;
        return sp;
      } else {
        fail = true;
      }
    } else if (op <= 0x13) {
      if (op == 0x0b) { // fork
        if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
        const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
        Porffor.IR.storeI32(entry, 0, 0);
        Porffor.IR.storeI32(entry, 4, Porffor.IR.loadU16(code + pc, 3));
        Porffor.IR.storeI32(entry, 8, sp);
        Porffor.IR.storeI32(entry, 16, undoTop);
        btTop += 1;

        pc = Porffor.IR.loadU16(code + pc, 1);
      } else if (op == 0x12) { // capWrite
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1) * 2 + Porffor.IR.loadU8(code + pc, 2);

        if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
        const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
        Porffor.IR.storeI32(undoEntry, 0, slot);
        Porffor.IR.storeI32(undoEntry, 4, Porffor.IR.loadI32(caps + slot * 4, 0));
        undoTop += 1;

        Porffor.IR.storeI32(caps + slot * 4, 0, sp);
        pc += 3;
      } else if (op == 0x0c) { // jump
        pc = Porffor.IR.loadU16(code + pc, 1);
      } else if (op == 0x0e) { // loopEnd
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1);
        if (sp == Porffor.IR.loadI32(loopSp + slot * 4, 0)) fail = true; // empty iteration
          else pc = Porffor.IR.loadU16(code + pc, 2);
      } else if (op == 0x0d) { // forkLoop (greedy)
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1);

        if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
        const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
        Porffor.IR.storeI32(undoEntry, 0, 0x20000 + slot);
        Porffor.IR.storeI32(undoEntry, 4, Porffor.IR.loadI32(loopSp + slot * 4, 0));
        undoTop += 1;
        Porffor.IR.storeI32(loopSp + slot * 4, 0, sp);

        if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
        const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
        Porffor.IR.storeI32(entry, 0, 0);
        Porffor.IR.storeI32(entry, 4, Porffor.IR.loadU16(code + pc, 4));
        Porffor.IR.storeI32(entry, 8, sp);
        Porffor.IR.storeI32(entry, 16, undoTop);
        btTop += 1;

        pc = Porffor.IR.loadU16(code + pc, 2);
      } else if (op == 0x10) { // counterFork
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1);
        const lazy: boolean = Porffor.IR.loadU8(code + pc, 2) != 0;
        const min: i32 = Porffor.IR.loadU16(code + pc, 3);
        const max: i32 = Porffor.IR.loadU16(code + pc, 5);
        const exitPc: i32 = Porffor.IR.loadU16(code + pc, 7);
        const count: i32 = Porffor.IR.loadI32(counters + slot * 4, 0);

        if (count < min) {
          // below min: must iterate, nothing to backtrack to
          if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
          const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
          Porffor.IR.storeI32(undoEntry, 0, 0x20000 + slot);
          Porffor.IR.storeI32(undoEntry, 4, Porffor.IR.loadI32(loopSp + slot * 4, 0));
          undoTop += 1;
          Porffor.IR.storeI32(loopSp + slot * 4, 0, sp);

          pc += 9;
        } else if (count < max) {
          if (lazy) {
            // lazy: take exit, the body becomes the backtrack alternative
            if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
            const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
            Porffor.IR.storeI32(entry, 0, 7);
            Porffor.IR.storeI32(entry, 4, pc + 9);
            Porffor.IR.storeI32(entry, 8, sp);
            Porffor.IR.storeI32(entry, 12, slot);
            Porffor.IR.storeI32(entry, 16, undoTop);
            btTop += 1;

            pc = exitPc;
          } else {
            // greedy: take the body, exit becomes the backtrack alternative
            if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
            const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
            Porffor.IR.storeI32(undoEntry, 0, 0x20000 + slot);
            Porffor.IR.storeI32(undoEntry, 4, Porffor.IR.loadI32(loopSp + slot * 4, 0));
            undoTop += 1;
            Porffor.IR.storeI32(loopSp + slot * 4, 0, sp);

            if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
            const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
            Porffor.IR.storeI32(entry, 0, 0);
            Porffor.IR.storeI32(entry, 4, exitPc);
            Porffor.IR.storeI32(entry, 8, sp);
            Porffor.IR.storeI32(entry, 16, undoTop);
            btTop += 1;

            pc += 9;
          }
        } else {
          pc = exitPc;
        }
      } else if (op == 0x11) { // counterInc
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1);
        const old: i32 = Porffor.IR.loadI32(counters + slot * 4, 0);

        if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
        const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
        Porffor.IR.storeI32(undoEntry, 0, 0x10000 + slot);
        Porffor.IR.storeI32(undoEntry, 4, old);
        undoTop += 1;

        Porffor.IR.storeI32(counters + slot * 4, 0, old + 1);
        pc += 2;
      } else if (op == 0x0f) { // counterReset
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1);

        if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
        const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
        Porffor.IR.storeI32(undoEntry, 0, 0x10000 + slot);
        Porffor.IR.storeI32(undoEntry, 4, Porffor.IR.loadI32(counters + slot * 4, 0));
        undoTop += 1;

        Porffor.IR.storeI32(counters + slot * 4, 0, 0);
        pc += 2;
      } else if (op == 0x13) { // capClear
        const from: i32 = Porffor.IR.loadU8(code + pc, 1);
        const to: i32 = Porffor.IR.loadU8(code + pc, 2);

        for (let group: i32 = from; group < to; group++) {
          for (let half: i32 = 0; half < 2; half++) {
            const slot: i32 = group * 2 + half;
            if (Porffor.IR.loadI32(caps + slot * 4, 0) == -1) continue;

            if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
            const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
            Porffor.IR.storeI32(undoEntry, 0, slot);
            Porffor.IR.storeI32(undoEntry, 4, Porffor.IR.loadI32(caps + slot * 4, 0));
            undoTop += 1;

            Porffor.IR.storeI32(caps + slot * 4, 0, -1);
          }
        }
        pc += 3;
      } else if (op == 0x09 || op == 0x0a) { // runClass / runAny
        const runBackward: i32 = Porffor.IR.loadU8(code + pc, 1);
        const min: i32 = Porffor.IR.loadU16(code + pc, 2);
        const max: i32 = Porffor.IR.loadU16(code + pc, 4);
        const isClass: boolean = op == 0x09;
        const rangeCount: i32 = isClass ? Porffor.IR.loadU16(code + pc, 6) : 0;
        const bitmap: i32 = code + pc + 8;
        const ranges: i32 = code + pc + 40;
        const afterPc: i32 = pc + (isClass ? 40 + rangeCount * 8 : 6);

        let runPos: i32 = sp;
        let count: i32 = 0;
        let minPos: i32 = sp;
        let limit: i32 = max;
        if (max == 0xFFFF) limit = 0x7FFFFFFF;

        if (runBackward == 0 && !cpMode && !isU16) {
          // forward byte run: bitmap-only tight loop, runAny takes everything to its bound in one step
          let runEnd: i32 = inputLen;
          if (max != 0xFFFF && sp + max < runEnd) runEnd = sp + max;

          if (isClass) {
            while (runPos < runEnd) {
              const unit: i32 = Porffor.IR.loadU8(inputPtr + runPos, 4);
              if ((Porffor.IR.loadU8(bitmap + (unit >> 3), 0) & (1 << (unit & 7))) == 0) break;
              runPos += 1;
            }
          } else {
            runPos = runEnd;
          }

          count = runPos - sp;
          minPos = count < min ? runPos : sp + min;
        } else {
          while (count < limit) {
            const readPos: i32 = runPos - runBackward;
            if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) break;

            let cp: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
            let width: i32 = 1;
            if (cpMode) {
              if (runBackward == 0 && cp >= 0xD800 && cp <= 0xDBFF && readPos + 1 < inputLen) {
                const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos + 1) * 2, 4);
                if (unit2 >= 0xDC00 && unit2 <= 0xDFFF) {
                  cp = 0x10000 + ((cp - 0xD800) << 10) + (unit2 - 0xDC00);
                  width = 2;
                }
              } else if (runBackward != 0 && cp >= 0xDC00 && cp <= 0xDFFF && readPos - 1 >= 0) {
                const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos - 1) * 2, 4);
                if (unit2 >= 0xD800 && unit2 <= 0xDBFF) {
                  cp = 0x10000 + ((unit2 - 0xD800) << 10) + (cp - 0xDC00);
                  width = 2;
                }
              }
            }

            if (isClass) {
              let ok: boolean = false;
              if (cp <= 255) {
                ok = (Porffor.IR.loadU8(bitmap + (cp >> 3), 0) & (1 << (cp & 7))) != 0;
              } else {
                let lo: i32 = 0;
                let hi: i32 = rangeCount - 1;
                while (lo <= hi) {
                  const mid: i32 = (lo + hi) >> 1;
                  const rangeLo: i32 = Porffor.IR.loadI32(ranges + mid * 8, 0);
                  const rangeHi: i32 = Porffor.IR.loadI32(ranges + mid * 8, 4);
                  if (cp < rangeLo) {
                    hi = mid - 1;
                  } else if (cp > rangeHi) {
                    lo = mid + 1;
                  } else {
                    ok = true;
                    break;
                  }
                }
              }
              if (!ok) break;
            }

            if (runBackward == 0) runPos += width;
              else runPos -= width;
            count += 1;
            if (count == min) minPos = runPos;
          }
        }

        if (count < min) {
          fail = true;
        } else {
          if (count > min) {
            if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
            const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
            Porffor.IR.storeI32(entry, 0, (1 + runBackward) | (cpMode ? 4 : 0));
            Porffor.IR.storeI32(entry, 4, afterPc);
            Porffor.IR.storeI32(entry, 8, minPos);
            Porffor.IR.storeI32(entry, 12, runPos);
            Porffor.IR.storeI32(entry, 16, undoTop);
            btTop += 1;
          }

          sp = runPos;
          pc = afterPc;
        }
      } else {
        fail = true;
      }
    } else {
      if (op == 0x20) { // runNotChar: eat units other than imm
        const runBackward: i32 = Porffor.IR.loadU8(code + pc, 1);
        const min: i32 = Porffor.IR.loadU16(code + pc, 2);
        const max: i32 = Porffor.IR.loadU16(code + pc, 4);
        const excluded: i32 = Porffor.IR.loadU16(code + pc, 6);
        const afterPc: i32 = pc + 8;

        let runPos: i32 = sp;
        let count: i32 = 0;
        let minPos: i32 = sp;
        let limit: i32 = max;
        if (max == 0xFFFF) limit = 0x7FFFFFFF;

        if (runBackward == 0 && !cpMode) {
          let runEnd: i32 = inputLen;
          if (max != 0xFFFF && sp + max < runEnd) runEnd = sp + max;

          if (isU16) {
            while (runPos < runEnd && Porffor.IR.loadU16(inputPtr + runPos * 2, 4) != excluded) runPos += 1;
          } else if (excluded > 255) {
            runPos = runEnd;
          } else {
            // scan 4 bytes per step for the excluded byte
            const spread: i32 = 0x01010101 * excluded;
            while (runPos + 4 <= runEnd) {
              const word: i32 = Porffor.IR.loadU32(inputPtr + runPos, 4) ^ spread;
              if (((word - 0x01010101) & ((word & 0x80808080) ^ 0x80808080)) != 0) break;
              runPos += 4;
            }
            while (runPos < runEnd && Porffor.IR.loadU8(inputPtr + runPos, 4) != excluded) runPos += 1;
          }

          count = runPos - sp;
          minPos = count < min ? runPos : sp + min;
        } else {
          while (count < limit) {
            const readPos: i32 = runPos - runBackward;
            if (Porffor.fastOr(readPos < 0, readPos >= inputLen)) break;

            let cp: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + readPos * 2, 4) : Porffor.IR.loadU8(inputPtr + readPos, 4);
            let width: i32 = 1;
            if (cpMode) {
              // pairs can't equal the excluded unit, they just add width
              if (runBackward == 0 && cp >= 0xD800 && cp <= 0xDBFF && readPos + 1 < inputLen) {
                const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos + 1) * 2, 4);
                if (unit2 >= 0xDC00 && unit2 <= 0xDFFF) {
                  cp = 0x10000;
                  width = 2;
                }
              } else if (runBackward != 0 && cp >= 0xDC00 && cp <= 0xDFFF && readPos - 1 >= 0) {
                const unit2: i32 = Porffor.IR.loadU16(inputPtr + (readPos - 1) * 2, 4);
                if (unit2 >= 0xD800 && unit2 <= 0xDBFF) {
                  cp = 0x10000;
                  width = 2;
                }
              }
            }
            if (cp == excluded) break;

            if (runBackward == 0) runPos += width;
              else runPos -= width;
            count += 1;
            if (count == min) minPos = runPos;
          }
        }

        if (count < min) {
          fail = true;
        } else {
          if (count > min) {
            if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
            const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
            Porffor.IR.storeI32(entry, 0, (1 + runBackward) | (cpMode ? 4 : 0));
            Porffor.IR.storeI32(entry, 4, afterPc);
            Porffor.IR.storeI32(entry, 8, minPos);
            Porffor.IR.storeI32(entry, 12, runPos);
            Porffor.IR.storeI32(entry, 16, undoTop);
            btTop += 1;
          }

          sp = runPos;
          pc = afterPc;
        }
      } else if (op == 0x16 || op == 0x22) { // assert ^ (0x22 multiline)
        if (sp == 0) {
          pc += 1;
        } else if (op == 0x22) {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + (sp - 1) * 2, 4) : Porffor.IR.loadU8(inputPtr + sp - 1, 4);
          if (Porffor.fastOr(unit == 10, unit == 13, unit == 0x2028, unit == 0x2029)) pc += 1;
            else fail = true;
        } else {
          fail = true;
        }
      } else if (op == 0x17 || op == 0x23) { // assert $ (0x23 multiline)
        if (sp == inputLen) {
          pc += 1;
        } else if (op == 0x23) {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + sp * 2, 4) : Porffor.IR.loadU8(inputPtr + sp, 4);
          if (Porffor.fastOr(unit == 10, unit == 13, unit == 0x2028, unit == 0x2029)) pc += 1;
            else fail = true;
        } else {
          fail = true;
        }
      } else if (Porffor.fastOr(op == 0x14, op == 0x15, op == 0x26, op == 0x27)) { // backref / backrefMulti (0x26/0x27 ignoring case)
        const ci: boolean = op >= 0x26;
        let index: i32 = 0;
        let afterPc: i32 = 0;
        if (op == 0x14 || op == 0x26) {
          index = Porffor.IR.loadU8(code + pc, 1);
          afterPc = pc + 2;
        } else {
          // duplicate-named backref, the first candidate group that captured wins
          const candidates: i32 = Porffor.IR.loadU8(code + pc, 1);
          afterPc = pc + 2 + candidates;
          for (let k: i32 = 0; k < candidates; k++) {
            const candidate: i32 = Porffor.IR.loadU8(code + pc + 2 + k, 0);
            if (Porffor.IR.loadI32(caps + (candidate - 1) * 8, 0) != -1 &&
                Porffor.IR.loadI32(caps + (candidate - 1) * 8, 4) != -1) {
              index = candidate;
              break;
            }
          }
        }

        let ok: boolean = true;
        if (index != 0) {
          const capStart: i32 = Porffor.IR.loadI32(caps + (index - 1) * 8, 0);
          const capEnd: i32 = Porffor.IR.loadI32(caps + (index - 1) * 8, 4);
          if (capStart != -1 && capEnd != -1 && capEnd > capStart) {
            const capLen: i32 = capEnd - capStart;
            if (backward == 0 ? sp + capLen > inputLen : sp - capLen < 0) {
              ok = false;
            } else {
              // compare captured text against input, code point by code point (canonicalized under i)
              const base: i32 = backward == 0 ? sp : sp - capLen;
              let capPos: i32 = capStart;
              let inputPos: i32 = base;
              while (capPos < capEnd) {
                let capCp: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + capPos * 2, 4) : Porffor.IR.loadU8(inputPtr + capPos, 4);
                let inputCp: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + inputPos * 2, 4) : Porffor.IR.loadU8(inputPtr + inputPos, 4);
                let capWidth: i32 = 1;
                let inputWidth: i32 = 1;

                if (cpMode && capCp >= 0xD800 && capCp <= 0xDBFF && capPos + 1 < capEnd) {
                  const unit2: i32 = Porffor.IR.loadU16(inputPtr + (capPos + 1) * 2, 4);
                  if (unit2 >= 0xDC00 && unit2 <= 0xDFFF) {
                    capCp = 0x10000 + ((capCp - 0xD800) << 10) + (unit2 - 0xDC00);
                    capWidth = 2;
                  }
                }
                if (cpMode && inputCp >= 0xD800 && inputCp <= 0xDBFF && inputPos + 1 < inputLen) {
                  const unit2: i32 = Porffor.IR.loadU16(inputPtr + (inputPos + 1) * 2, 4);
                  if (unit2 >= 0xDC00 && unit2 <= 0xDFFF) {
                    inputCp = 0x10000 + ((inputCp - 0xD800) << 10) + (unit2 - 0xDC00);
                    inputWidth = 2;
                  }
                }

                if (ci) {
                  capCp = __Porffor_regex_mapCp(canonMode, capCp);
                  inputCp = __Porffor_regex_mapCp(canonMode, inputCp);
                }
                if (capCp != inputCp) {
                  ok = false;
                  break;
                }

                capPos += capWidth;
                inputPos += inputWidth;
              }

              if (ok && inputPos != base + capLen) ok = false;
              if (ok) {
                if (backward == 0) sp += capLen;
                  else sp -= capLen;
              }
            }
          }
        }

        if (ok) pc = afterPc;
          else fail = true;
      } else if (Porffor.fastOr(op == 0x18, op == 0x19, op == 0x24, op == 0x25)) { // assert \b / \B (0x24/0x25 ignoring case)
        const ci: boolean = op >= 0x24;
        let prevIsWord: boolean = false;
        if (sp > 0) {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + (sp - 1) * 2, 4) : Porffor.IR.loadU8(inputPtr + sp - 1, 4);
          prevIsWord = Porffor.fastOr(unit >= 97 && unit <= 122, unit >= 65 && unit <= 90, unit >= 48 && unit <= 57, unit == 95);
          if (!prevIsWord && ci && uvFlag) prevIsWord = Porffor.fastOr(unit == 0x17F, unit == 0x212A);
        }

        let nextIsWord: boolean = false;
        if (sp < inputLen) {
          const unit: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + sp * 2, 4) : Porffor.IR.loadU8(inputPtr + sp, 4);
          nextIsWord = Porffor.fastOr(unit >= 97 && unit <= 122, unit >= 65 && unit <= 90, unit >= 48 && unit <= 57, unit == 95);
          if (!nextIsWord && ci && uvFlag) nextIsWord = Porffor.fastOr(unit == 0x17F, unit == 0x212A);
        }

        if ((prevIsWord != nextIsWord) == (op == 0x18 || op == 0x24)) pc += 1;
          else fail = true;
      } else if (op == 0x1a) { // lookStart
        const negated: i32 = Porffor.IR.loadU8(code + pc, 1);
        const behind: boolean = Porffor.IR.loadU8(code + pc, 2) != 0;
        const afterPc: i32 = Porffor.IR.loadU16(code + pc, 3);

        const frame: i32 = frames + frameTop * 24;
        Porffor.IR.storeI32(frame, 0, sp);
        Porffor.IR.storeI32(frame, 4, backward);
        Porffor.IR.storeI32(frame, 8, btTop);
        Porffor.IR.storeI32(frame, 12, undoTop);
        Porffor.IR.storeI32(frame, 16, afterPc);
        Porffor.IR.storeI32(frame, 20, negated);

        // reaching this entry while backtracking = the sub-pattern failed
        if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
        const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
        Porffor.IR.storeI32(entry, 0, 3);
        Porffor.IR.storeI32(entry, 8, frameTop);
        Porffor.IR.storeI32(entry, 16, undoTop);
        btTop += 1;
        frameTop += 1;

        backward = behind ? 1 : 0;
        pc += 5;
      } else if (op == 0x1b) { // lookEnd: the sub-pattern matched
        const frame: i32 = frames + (frameTop - 1) * 24;
        const negated: boolean = Porffor.IR.loadI32(frame, 20) != 0;

        sp = Porffor.IR.loadI32(frame, 0);
        backward = Porffor.IR.loadI32(frame, 4);
        btTop = Porffor.IR.loadI32(frame, 8);
        frameTop -= 1;

        if (negated) {
          // negative look that matched fails the outer pattern, unwinding its captures
          undoTop = __Porffor_regex_undoTo(Porffor.IR.loadI32(frame, 12), caps, counters, loopSp, undoTop);
          fail = true;
        } else {
          pc = Porffor.IR.loadI32(frame, 16);
        }
      } else if (op == 0x1d) { // charCp: astral literal, eats both units
        const wanted: i32 = Porffor.IR.loadI32(code + pc, 1);

        let ok: boolean = false;
        if (backward == 0) {
          if (sp + 1 < inputLen) {
            const lead: i32 = Porffor.IR.loadU16(inputPtr + sp * 2, 4);
            const trail: i32 = Porffor.IR.loadU16(inputPtr + (sp + 1) * 2, 4);
            if (lead >= 0xD800 && lead <= 0xDBFF && trail >= 0xDC00 && trail <= 0xDFFF &&
                0x10000 + ((lead - 0xD800) << 10) + (trail - 0xDC00) == wanted) ok = true;
          }

          if (ok) {
            sp += 2;
            pc += 5;
          } else {
            fail = true;
          }
        } else {
          if (sp - 2 >= 0) {
            const lead: i32 = Porffor.IR.loadU16(inputPtr + (sp - 2) * 2, 4);
            const trail: i32 = Porffor.IR.loadU16(inputPtr + (sp - 1) * 2, 4);
            if (lead >= 0xD800 && lead <= 0xDBFF && trail >= 0xDC00 && trail <= 0xDFFF &&
                0x10000 + ((lead - 0xD800) << 10) + (trail - 0xDC00) == wanted) ok = true;
          }

          if (ok) {
            sp -= 2;
            pc += 5;
          } else {
            fail = true;
          }
        }
      } else if (op == 0x1e) { // loopEndCounted
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1);
        const min: i32 = Porffor.IR.loadU16(code + pc, 2);

        // empty iterations are only allowed while below min
        if (sp == Porffor.IR.loadI32(loopSp + slot * 4, 0) && Porffor.IR.loadI32(counters + slot * 4, 0) > min) fail = true;
          else pc = Porffor.IR.loadU16(code + pc, 4);
      } else if (op == 0x1f) { // forkLoopLazy
        const slot: i32 = Porffor.IR.loadU8(code + pc, 1);

        if ((btTop + 1) * 20 > __Porffor_regex_capBt) __Porffor_regex_btEnsure(btTop);
        const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + btTop * 20;
        Porffor.IR.storeI32(entry, 0, 7);
        Porffor.IR.storeI32(entry, 4, pc + 4);
        Porffor.IR.storeI32(entry, 8, sp);
        Porffor.IR.storeI32(entry, 12, slot);
        Porffor.IR.storeI32(entry, 16, undoTop);
        btTop += 1;

        pc = Porffor.IR.loadU16(code + pc, 2);
      } else { // 0x1c reject / unknown
        fail = true;
      }
    }

    if (fail) {
      fail = false;
      let exhausted: boolean = false;

      while (true) {
        if (btTop == 0) {
          exhausted = true;
          break;
        }

        const entry: i32 = Porffor.IR.ptr(__Porffor_regex_bufBt) + (btTop - 1) * 20;
        const kind: i32 = Porffor.IR.loadI32(entry, 0);

        if (kind == 0) { // fork alternative
          btTop -= 1;
          undoTop = __Porffor_regex_undoTo(Porffor.IR.loadI32(entry, 16), caps, counters, loopSp, undoTop);
          sp = Porffor.IR.loadI32(entry, 8);
          pc = Porffor.IR.loadI32(entry, 4);
          break;
        }

        if ((kind & 3) == 1 || (kind & 3) == 2) { // greedy run, forward/backward
          const minPos: i32 = Porffor.IR.loadI32(entry, 8);
          const runPos: i32 = Porffor.IR.loadI32(entry, 12);
          if (runPos == minPos) {
            btTop -= 1;
            continue;
          }

          // run+literal fusion: when the op after a forward run (skipping capture writes) is
          // a literal unit, scan backwards for it instead of stepping once per backtrack
          if ((kind & 3) == 1) {
            const resumePc: i32 = Porffor.IR.loadI32(entry, 4);
            let probePc: i32 = resumePc;
            while (Porffor.IR.loadU8(code + probePc, 0) == 0x12) probePc += 3;

            const nextOp: i32 = Porffor.IR.loadU8(code + probePc, 0);
            let wanted: i32 = -1;
            if (nextOp == 0x01) wanted = Porffor.IR.loadU8(code + probePc, 1);
              else if (nextOp == 0x02) wanted = Porffor.IR.loadU16(code + probePc, 1);

            // a trail literal could land mid-pair, step instead
            if (cpMode && wanted >= 0xDC00 && wanted <= 0xDFFF) wanted = -1;

            if (wanted != -1) {
              let scanPos: i32 = runPos - 1;
              if (isU16) {
                while (scanPos >= minPos && Porffor.IR.loadU16(inputPtr + scanPos * 2, 4) != wanted) scanPos -= 1;
              } else if (wanted > 255) {
                scanPos = minPos - 1;
              } else {
                // scan backwards 4 bytes at a time for the literal
                const spread: i32 = 0x01010101 * wanted;
                while (scanPos - 3 >= minPos) {
                  const word: i32 = Porffor.IR.loadU32(inputPtr + scanPos - 3, 4) ^ spread;
                  if (((word - 0x01010101) & ((word & 0x80808080) ^ 0x80808080)) != 0) break;
                  scanPos -= 4;
                }
                while (scanPos >= minPos && Porffor.IR.loadU8(inputPtr + scanPos, 4) != wanted) scanPos -= 1;
              }

              if (scanPos < minPos) { // literal not found, the run is exhausted
                btTop -= 1;
                continue;
              }

              Porffor.IR.storeI32(entry, 12, scanPos);
              sp = scanPos;
              pc = resumePc;
              break;
            }
          }

          // step once towards minPos, over a whole pair in cp mode
          let nextPos: i32 = (kind & 3) == 1 ? runPos - 1 : runPos + 1;
          if ((kind & 4) != 0 && isU16) {
            if ((kind & 3) == 1) {
              if (nextPos - 1 >= 0) {
                const prevUnit: i32 = Porffor.IR.loadU16(inputPtr + (nextPos - 1) * 2, 4);
                const unit: i32 = Porffor.IR.loadU16(inputPtr + nextPos * 2, 4);
                if (prevUnit >= 0xD800 && prevUnit <= 0xDBFF && unit >= 0xDC00 && unit <= 0xDFFF) nextPos -= 1;
              }
            } else {
              if (nextPos + 1 <= inputLen) {
                const unit: i32 = Porffor.IR.loadU16(inputPtr + nextPos * 2, 4);
                const prevUnit: i32 = Porffor.IR.loadU16(inputPtr + (nextPos - 1) * 2, 4);
                if (prevUnit >= 0xD800 && prevUnit <= 0xDBFF && unit >= 0xDC00 && unit <= 0xDFFF) nextPos += 1;
              }
            }
          }

          Porffor.IR.storeI32(entry, 12, nextPos);
          sp = nextPos;
          pc = Porffor.IR.loadI32(entry, 4);
          break;
        }

        if (kind == 3) { // look boundary: the sub-pattern ran out of ways to match
          btTop -= 1;
          const frameIdx: i32 = Porffor.IR.loadI32(entry, 8);
          const frame: i32 = frames + frameIdx * 24;
          const negated: boolean = Porffor.IR.loadI32(frame, 20) != 0;
          frameTop = frameIdx;

          if (negated) { // negative look with no match = success
            sp = Porffor.IR.loadI32(frame, 0);
            backward = Porffor.IR.loadI32(frame, 4);
            undoTop = __Porffor_regex_undoTo(Porffor.IR.loadI32(frame, 12), caps, counters, loopSp, undoTop);
            pc = Porffor.IR.loadI32(frame, 16);
            break;
          }

          // positive look with no match, keep backtracking outside
          backward = Porffor.IR.loadI32(frame, 4);
          continue;
        }

        // kind 7: retry via the lazy loop body
        btTop -= 1;
        undoTop = __Porffor_regex_undoTo(Porffor.IR.loadI32(entry, 16), caps, counters, loopSp, undoTop);
        sp = Porffor.IR.loadI32(entry, 8);

        const slot: i32 = Porffor.IR.loadI32(entry, 12);
        if ((undoTop + 1) * 8 > __Porffor_regex_capUndo) __Porffor_regex_undoEnsure(undoTop);
        const undoEntry: i32 = Porffor.IR.ptr(__Porffor_regex_bufUndo) + undoTop * 8;
        Porffor.IR.storeI32(undoEntry, 0, 0x20000 + slot);
        Porffor.IR.storeI32(undoEntry, 4, Porffor.IR.loadI32(loopSp + slot * 4, 0));
        undoTop += 1;
        Porffor.IR.storeI32(loopSp + slot * 4, 0, sp);

        pc = Porffor.IR.loadI32(entry, 4);
        break;
      }

      if (exhausted) return -1;
    }
  }

  return -1;
};

export const __Porffor_regex_inputSubstring = (input: bytestring|string, inputType: i32, start: i32, end: i32): bytestring|string => {
  if (inputType == Porffor.TYPES.bytestring) return Porffor.callThis(__ByteString_prototype_substring, input as bytestring, start, end);
  return Porffor.callThis(__String_prototype_substring, input as string, start, end);
};

export const __Porffor_regex_parseFlags = (flagsStr: any): i32 => {
  let flags: i32 = 0;
  const len: i32 = flagsStr == 0 ? 0 : (flagsStr as bytestring).length;
  const ptr: i32 = Porffor.IR.ptr(flagsStr);
  const wide: boolean = Porffor.type(flagsStr) == Porffor.TYPES.string;
  for (let i: i32 = 0; i < len; i++) {
    const c: i32 = wide ? Porffor.IR.loadU16(ptr + i * 2, 4) : Porffor.IR.loadU8(ptr + i, 4);
    let bit: i32 = 0;
    if (c == 103) bit = 0b00000001; // g
      else if (c == 105) bit = 0b00000010; // i
      else if (c == 109) bit = 0b00000100; // m
      else if (c == 115) bit = 0b00001000; // s
      else if (c == 117) bit = 0b00010000; // u
      else if (c == 121) bit = 0b00100000; // y
      else if (c == 100) bit = 0b01000000; // d
      else if (c == 118) bit = 0b10000000; // v
      else throw new SyntaxError('Invalid regular expression flags');
    if ((flags & bit) != 0) throw new SyntaxError('Invalid regular expression flags');
    flags |= bit;
  }
  if ((flags & 0b00010000) != 0 && (flags & 0b10000000) != 0) throw new SyntaxError('Invalid regular expression flags');
  return flags;
};

// pattern+flags -> blob ptr, the names array lands in cNames
let __Porffor_regex_cNames: any = 0;
let __Porffor_regex_cCaps: i32 = 0;

export const __Porffor_regex_compileBlob = (pattern: any, flags: i32): i32 => {
  const root: i32 = __Porffor_regex_parse(pattern, flags);
  __Porffor_regex_capRangePass(root);

  __Porffor_regex_bcTop = 0;
  __Porffor_regex_eCounters = 0;
  __Porffor_regex_eLabels = Porffor.array.new(16);
  __Porffor_regex_eFixups = Porffor.array.new(16);

  __Porffor_regex_emitNode(root, 0);
  __Porffor_regex_e8(0x00); // accept

  // apply fixups
  const labels: any[] = __Porffor_regex_eLabels;
  const fixups: any[] = __Porffor_regex_eFixups;
  for (let i: i32 = 0; i < fixups.length; i += 2) {
    const at: i32 = fixups[i];
    const target: i32 = labels[fixups[i + 1]];
    Porffor.IR.storeU16(Porffor.IR.ptr(__Porffor_regex_bufBc) + at, 0, target);
  }
  if (__Porffor_regex_bcTop > 0xFFF0) throw new SyntaxError('Regex too large');

  // analysis
  if (__Porffor_regex_fsBitmap == 0) __Porffor_regex_fsBitmap = __Porffor_regex_alloc(32);
  Porffor.IR.fill(Porffor.IR.ptr(__Porffor_regex_fsBitmap), 0, 32);
  __Porffor_regex_fsWide = false;
  __Porffor_regex_fsUnknown = false;
  const nullable: boolean = __Porffor_regex_firstPass(root);
  const minLen: i32 = __Porffor_regex_minLenPass(root);
  const anchored: boolean = __Porffor_regex_anchoredPass(root);

  let prefKind: i32 = 0;
  let prefUnit: i32 = 0;
  if (anchored) prefKind = 1;
    else if (!nullable && !__Porffor_regex_fsUnknown) {
      // one set bit means a memchr-style scan, more use the bitmap
      let bits: i32 = 0;
      let unit: i32 = -1;
      for (let i: i32 = 0; i < 256; i++) {
        if ((Porffor.IR.loadU8(Porffor.IR.ptr(__Porffor_regex_fsBitmap) + (i >> 3), 0) & (1 << (i & 7))) != 0) {
          bits += 1;
          unit = i;
        }
      }
      if (bits == 1 && !__Porffor_regex_fsWide) {
        prefKind = 2;
        prefUnit = unit;
      } else if (bits > 0 || __Porffor_regex_fsWide) prefKind = 3;
    }

  const blob: i32 = Porffor.malloc(40 + __Porffor_regex_bcTop);
  Porffor.IR.storeU16(blob, 0, minLen > 0xFFFF ? 0xFFFF : minLen);
  Porffor.IR.storeU8(blob, 2, prefKind);
  Porffor.IR.storeU8(blob, 3, __Porffor_regex_fsWide ? 1 : 0);
  Porffor.IR.storeU16(blob, 4, prefUnit);
  Porffor.IR.storeU8(blob, 6, __Porffor_regex_eCounters);
  Porffor.IR.storeU8(blob, 7, 0);
  Porffor.IR.copy(blob + 8, Porffor.IR.ptr(__Porffor_regex_fsBitmap), 32);
  Porffor.IR.copy(blob + 40, Porffor.IR.ptr(__Porffor_regex_bufBc), __Porffor_regex_bcTop);

  // [name, capIdx, ...] pairs, shared and gc-traced via the regexp objects
  const names: any[] = __Porffor_regex_pNames;
  if (names.length > 0) {
    const out: any[] = Porffor.array.new(names.length / 3 * 2);
    for (let i: i32 = 0; i < names.length; i += 3) {
      Porffor.array.fastPush(out, names[i]);
      Porffor.array.fastPush(out, names[i + 1]);
    }
    __Porffor_regex_cNames = out;
  } else __Porffor_regex_cNames = 0;
  __Porffor_regex_cCaps = __Porffor_regex_pCaps;

  return blob;
};

export const __Porffor_regex_compile = (patternStr: bytestring|string, flagsStr: bytestring|string): RegExp => {
  const flags: i32 = __Porffor_regex_parseFlags(flagsStr);

  const canCache: boolean = Porffor.type(patternStr) == Porffor.TYPES.bytestring && Porffor.type(flagsStr) == Porffor.TYPES.bytestring;
  let blob: i32 = 0;
  let names: any = 0;
  let caps: i32 = 0;

  // same interned pattern+flags pointers as last call, skip the cache walk
  if (Porffor.IR.ptr(patternStr) == __Porffor_regex_mruPattern && Porffor.IR.ptr(flagsStr) == __Porffor_regex_mruFlags && __Porffor_regex_mruBlob != 0) {
    blob = __Porffor_regex_mruBlob;
    names = __Porffor_regex_mruNames;
    caps = __Porffor_regex_mruCaps;
  } else if (canCache) {
    let entry: i32 = __Porffor_regex_cache;
    while (entry != 0) {
      if (Porffor.strcmp(patternStr, Porffor.IR.loadI32(entry, 4) as bytestring) &&
          Porffor.strcmp(flagsStr, Porffor.IR.loadI32(entry, 8) as bytestring)) {
        blob = Porffor.IR.loadI32(entry, 12);
        names = Porffor.IR.loadI32(entry, 16) == 0 ? 0 : Porffor.as(Porffor.IR.loadI32(entry, 16), Porffor.TYPES.array);
        caps = Porffor.IR.loadU16(entry, 20);
        break;
      }
      entry = Porffor.IR.loadI32(entry, 0);
    }
  }

  if (blob == 0) {
    blob = __Porffor_regex_compileBlob(patternStr, flags);
    names = __Porffor_regex_cNames;
    caps = __Porffor_regex_cCaps;

    if (canCache) {
      const entry: i32 = Porffor.malloc(24);
      Porffor.IR.storeI32(entry, 0, __Porffor_regex_cache);
      Porffor.IR.storeI32(entry, 4, patternStr);
      Porffor.IR.storeI32(entry, 8, flagsStr);
      Porffor.IR.storeI32(entry, 12, blob);
      Porffor.IR.storeI32(entry, 16, names == 0 ? 0 : Porffor.IR.ptr(names));
      Porffor.IR.storeU16(entry, 20, caps);
      __Porffor_regex_cache = entry;
    }
  }

  if (canCache) {
    __Porffor_regex_mruPattern = Porffor.IR.ptr(patternStr);
    __Porffor_regex_mruFlags = Porffor.IR.ptr(flagsStr);
    __Porffor_regex_mruBlob = blob;
    __Porffor_regex_mruNames = names;
    __Porffor_regex_mruCaps = caps;
  }

  const re: i32 = Porffor.malloc(24);
  Porffor.IR.storeI32(re, 0, patternStr);
  Porffor.IR.storeU16(re, 4, flags);
  Porffor.IR.storeU16(re, 6, caps);
  Porffor.IR.storeI32(re, 8, 0);
  Porffor.IR.storeI32(re, 12, blob);
  Porffor.IR.storeI32(re, 16, names == 0 ? 0 : Porffor.IR.ptr(names));
  Porffor.IR.storeU8(re, 20, 0);
  Porffor.IR.storeU8(re, 22, Porffor.type(patternStr));
  Porffor.IR.storeU8(re, 23, 0); // 1: [[LegacyFeaturesEnabled]] false (made by a subclass)
  return re as RegExp;
};

// match driver mode: 0 exec result, 1 test boolean, 2 positions only (returns end, sets mStart/mEnd,
// leaves capture buffer readable via __Porffor_regex_capsPtr)

export const __Porffor_regex_matchStart = (): i32 => __Porffor_regex_mStart;
export const __Porffor_regex_capsRead = (k: i32): i32 => Porffor.IR.loadI32(__Porffor_regex_capsPtr + k * 4, 0);

// annex B legacy statics (RegExp.$1-$9, input, ...) of the last builtin match, only recorded when linked in
let __Porffor_regex_legacyState: i32 = 0; // 0: no match yet (all ''), 1: valid, 2: invalidated (subclass instance matched)
let __Porffor_regex_legacySrc: any = '';
let __Porffor_regex_legacyInput: any = ''; // [[RegExpInput]], separately writable
let __Porffor_regex_legacyPos: any = 0; // i32 x 21: match start, end, capture count, then 9 capture (start, end) pairs

export const __Porffor_regex_legacyUpdate = (regexp: RegExp, input: any, start: i32, end: i32, nCaps: i32): void => {
  if (Porffor.IR.loadU8(regexp, 23) != 0) {
    __Porffor_regex_legacyState = 2;
    return;
  }
  if (__Porffor_regex_legacyPos == 0) __Porffor_regex_legacyPos = __Porffor_regex_alloc(84);
  const p: i32 = Porffor.IR.ptr(__Porffor_regex_legacyPos);
  __Porffor_regex_legacyState = 1;
  __Porffor_regex_legacySrc = input;
  __Porffor_regex_legacyInput = input;
  Porffor.IR.storeI32(p, 0, start);
  Porffor.IR.storeI32(p, 4, end);
  Porffor.IR.storeI32(p, 8, nCaps);
  const caps: i32 = __Porffor_regex_capsPtr;
  for (let k: i32 = 0; k < 9; k++) {
    let cs: i32 = -1;
    let ce: i32 = -1;
    if (k < nCaps) {
      cs = Porffor.IR.loadI32(caps + k * 8, 0);
      ce = Porffor.IR.loadI32(caps + k * 8, 4);
    }
    Porffor.IR.storeI32(p + k * 8, 12, cs);
    Porffor.IR.storeI32(p + k * 8, 16, ce);
  }
};

// a duplicate name takes its participating group
export const __Porffor_regex_groupsObj = (namesPtr: i32, caps: i32, input: any, inputType: i32, pairs: boolean): object => {
  const names: any[] = Porffor.as(namesPtr, Porffor.TYPES.array);
  const groups: object = Porffor.object.new(names.length / 2);
  __Porffor_object_setPrototype(groups, null);
  for (let i: i32 = 0; i < names.length; i += 2) {
    const gi: i32 = names[i + 1];
    const cs: i32 = Porffor.IR.loadI32(caps + gi * 8, 0);
    const ce: i32 = Porffor.IR.loadI32(caps + gi * 8, 4);
    if (cs != -1 && ce != -1) {
      let v: any;
      if (pairs) {
        const pair: any[] = Porffor.array.new(2);
        Porffor.array.fastPush(pair, cs);
        Porffor.array.fastPush(pair, ce);
        v = pair;
      } else v = __Porffor_regex_inputSubstring(input, inputType, cs, ce);
      __Porffor_object_define(groups, names[i], v, 0b1110);
    } else if (__Porffor_object_lookup(groups, names[i], __Porffor_object_hash(names[i])) == 0) __Porffor_object_define(groups, names[i], undefined, 0b1110);
  }
  return groups;
};

// lastIndex: the header slot of a regexp without own props, else a real property (see __Porffor_object_underlying)
export const __Porffor_regex_liGet = (r: any): any => {
  if (Porffor.type(r) == Porffor.TYPES.regexp) if (Porffor.IR.loadU8(r, 20) == 0) return Porffor.IR.loadI32(r, 8);
  return Porffor.object.get(r, 'lastIndex');
};

export const __Porffor_regex_liSet = (r: any, v: any): void => {
  if (Porffor.type(r) == Porffor.TYPES.regexp) if (Porffor.IR.loadU8(r, 20) == 0) if (__Porffor_object_regexLiStore(r, v)) return;
  __Porffor_object_setStrict(r, 'lastIndex', v);
};

export const __Porffor_regex_interpretProp = (regexp: RegExp, input: any, mode: i32, flags: i32): any => {
  const li: number = ecma262.ToLength(Porffor.object.get(regexp, 'lastIndex'));
  const gy: boolean = (flags & 0b00100001) != 0;
  let start: i32 = 0;
  if (gy) {
    if (li > Porffor.IR.loadI32(Porffor.IR.ptr(input), 0)) {
      __Porffor_object_setStrict(regexp, 'lastIndex', 0);
      if (mode == 1) return false;
      if (mode == 2) return -1;
      return null;
    }
    start = li;
  }
  const out: any = __Porffor_regex_interpretFrom(regexp, input, mode, start);
  if (gy) __Porffor_object_setStrict(regexp, 'lastIndex', Porffor.IR.loadI32(regexp, 8));
  return out;
};

export const __Porffor_regex_interpret = (regexp: RegExp, input: any, mode: i32): any => {
  const flags: i32 = Porffor.IR.loadU16(regexp, 4);
  if (Porffor.IR.loadU8(regexp, 20) != 0) return __Porffor_regex_interpretProp(regexp, input, mode, flags);
  let start: i32 = 0;
  if ((flags & 0b00100001) != 0) { // g or y
    start = Porffor.IR.loadI32(regexp, 8);
    if (start < 0) start = 0;
  }
  return __Porffor_regex_interpretFrom(regexp, input, mode, start);
};

// interpret from an explicit start, for split/replace internals
export const __Porffor_regex_interpretFrom = (regexp: RegExp, input: any, mode: i32, start: i32): any => {
  const flags: i32 = Porffor.IR.loadU16(regexp, 4);
  const nCaps: i32 = Porffor.IR.loadU16(regexp, 6);
  const blob: i32 = Porffor.IR.loadI32(regexp, 12);
  const bc: i32 = blob + 40;

  const global: boolean = (flags & 0b00000001) != 0;
  const sticky: boolean = (flags & 0b00100000) != 0;
  const mFlag: boolean = (flags & 0b00000100) != 0;

  const inputType: i32 = Porffor.type(input);
  const inputPtr: i32 = Porffor.IR.ptr(input);
  const isU16: boolean = inputType == Porffor.TYPES.string;
  const inputLen: i32 = Porffor.IR.loadI32(inputPtr, 0);
  const cpMode: boolean = (flags & 0b10010000) != 0 && isU16;

  const minLen: i32 = Porffor.IR.loadU16(blob, 0);
  const prefKind: i32 = Porffor.IR.loadU8(blob, 2);
  const wideStart: boolean = Porffor.IR.loadU8(blob, 3) != 0;
  const prefUnit: i32 = Porffor.IR.loadU16(blob, 4);
  const nSlots: i32 = Porffor.IR.loadU8(blob, 6);

  // aux buffer: caps + counters + loopSp + frames (64 lookaround frames is plenty)
  const auxBytes: i32 = nCaps * 8 + nSlots * 8 + 64 * 24;
  if (auxBytes > __Porffor_regex_capAux) {
    let newCap: i32 = __Porffor_regex_capAux == 0 ? 1024 : __Porffor_regex_capAux;
    while (newCap < auxBytes) newCap *= 2;
    __Porffor_regex_bufAux = __Porffor_regex_alloc(newCap);
    __Porffor_regex_capAux = newCap;
  }
  __Porffor_regex_capsPtr = Porffor.IR.ptr(__Porffor_regex_bufAux);

  let matchEnd: i32 = -1;
  let pos: i32 = start;

  if (pos + minLen <= inputLen) {
    if (sticky) {
      matchEnd = __Porffor_regex_attempt(bc, inputPtr, inputLen, isU16, cpMode, flags, nCaps, nSlots, pos);
      if (matchEnd != -1) __Porffor_regex_mStart = pos;
    } else if (prefKind == 1 && !mFlag) {
      // anchored patterns can only match at 0
      if (pos == 0) {
        matchEnd = __Porffor_regex_attempt(bc, inputPtr, inputLen, isU16, cpMode, flags, nCaps, nSlots, 0);
        if (matchEnd != -1) __Porffor_regex_mStart = 0;
      }
    } else {
      const bound: i32 = inputLen - minLen;
      const scanKind: i32 = prefKind == 2 ? 2 : (prefKind == 3 && (!isU16 || !wideStart) ? 3 : (prefKind == 1 ? 1 : 0));
      while (pos <= bound) {
        // skip positions that can't start a match
        if (scanKind == 2) {
          if (isU16) {
            while (pos <= bound && Porffor.IR.loadU16(inputPtr + pos * 2, 4) != prefUnit) pos += 1;
          } else {
            const bcast: i32 = 0x01010101 * prefUnit;
            while (pos + 4 <= bound + 1) {
              const v: i32 = Porffor.IR.loadU32(inputPtr + pos, 4) ^ bcast;
              if (((v - 0x01010101) & ((v & 0x80808080) ^ 0x80808080)) != 0) break;
              pos += 4;
            }
            while (pos <= bound && Porffor.IR.loadU8(inputPtr + pos, 4) != prefUnit) pos += 1;
          }
          if (pos > bound) break;
        } else if (scanKind == 3) {
          if (isU16) {
            while (pos <= bound) {
              const u: i32 = Porffor.IR.loadU16(inputPtr + pos * 2, 4);
              if (u <= 255 && (Porffor.IR.loadU8(blob + 8 + (u >> 3), 0) & (1 << (u & 7))) != 0) break;
              pos += 1;
            }
          } else {
            while (pos <= bound) {
              const u: i32 = Porffor.IR.loadU8(inputPtr + pos, 4);
              if ((Porffor.IR.loadU8(blob + 8 + (u >> 3), 0) & (1 << (u & 7))) != 0) break;
              pos += 1;
            }
          }
          if (pos > bound) break;
        } else if (scanKind == 1) {
          // m + ^: only try right after line terminators
          if (pos != 0) {
            while (pos <= bound) {
              const u: i32 = isU16 ? Porffor.IR.loadU16(inputPtr + (pos - 1) * 2, 4) : Porffor.IR.loadU8(inputPtr + pos - 1, 4);
              if (Porffor.fastOr(u == 10, u == 13, u == 0x2028, u == 0x2029)) break;
              pos += 1;
            }
            if (pos > bound) break;
          }
        }

        matchEnd = __Porffor_regex_attempt(bc, inputPtr, inputLen, isU16, cpMode, flags, nCaps, nSlots, pos);
        if (matchEnd != -1) {
          __Porffor_regex_mStart = pos;
          break;
        }

        pos += 1;
        // don't start mid surrogate pair in u mode
        if (cpMode && pos < inputLen) {
          const u: i32 = Porffor.IR.loadU16(inputPtr + pos * 2, 4);
          if (u >= 0xDC00 && u <= 0xDFFF) {
            const u0: i32 = Porffor.IR.loadU16(inputPtr + (pos - 1) * 2, 4);
            if (u0 >= 0xD800 && u0 <= 0xDBFF) pos += 1;
          }
        }
      }
    }
  }

  if (matchEnd == -1) {
    if (global || sticky) Porffor.IR.storeI32(regexp, 8, 0);
    if (mode == 1) return false;
    if (mode == 2) return -1;
    return null;
  }

  if (global || sticky) Porffor.IR.storeI32(regexp, 8, matchEnd);
  if (Porffor.comptime.flag`hasFunc.__Porffor_regex_legacyGet`) __Porffor_regex_legacyUpdate(regexp, input, __Porffor_regex_mStart, matchEnd, nCaps);
  if (mode == 1) return true;
  if (mode == 2) return matchEnd;

  // build the exec array
  const matchStart: i32 = __Porffor_regex_mStart;
  const caps: i32 = __Porffor_regex_capsPtr;
  const result: any[] = Porffor.array.new(nCaps + 1);
  Porffor.array.fastPush(result, __Porffor_regex_inputSubstring(input, inputType, matchStart, matchEnd));
  for (let k: i32 = 0; k < nCaps; k++) {
    const cs: i32 = Porffor.IR.loadI32(caps + k * 8, 0);
    const ce: i32 = Porffor.IR.loadI32(caps + k * 8, 4);
    if (cs != -1 && ce != -1) Porffor.array.fastPush(result, __Porffor_regex_inputSubstring(input, inputType, cs, ce));
      else Porffor.array.fastPush(result, undefined);
  }

  // CreateDataProperty: never through (Array.prototype) setters
  const resProps: object = __Porffor_object_underlying(result);
  __Porffor_object_fastAdd(resProps, 'index', matchStart, 0b1110);
  __Porffor_object_fastAdd(resProps, 'input', input, 0b1110);

  const namesPtr: i32 = Porffor.IR.loadI32(regexp, 16);
  __Porffor_object_fastAdd(resProps, 'groups', namesPtr == 0 ? undefined : __Porffor_regex_groupsObj(namesPtr, caps, input, inputType, false), 0b1110);

  if ((flags & 0b01000000) != 0) { // d: indices
    const indices: any[] = Porffor.array.new(nCaps + 1);
    const pair0: any[] = Porffor.array.new(2);
    Porffor.array.fastPush(pair0, matchStart);
    Porffor.array.fastPush(pair0, matchEnd);
    Porffor.array.fastPush(indices, pair0);
    for (let k: i32 = 0; k < nCaps; k++) {
      const cs: i32 = Porffor.IR.loadI32(caps + k * 8, 0);
      const ce: i32 = Porffor.IR.loadI32(caps + k * 8, 4);
      if (cs != -1 && ce != -1) {
        const pair: any[] = Porffor.array.new(2);
        Porffor.array.fastPush(pair, cs);
        Porffor.array.fastPush(pair, ce);
        Porffor.array.fastPush(indices, pair);
      } else Porffor.array.fastPush(indices, undefined);
    }
    __Porffor_object_fastAdd(__Porffor_object_underlying(indices), 'groups', namesPtr == 0 ? undefined : __Porffor_regex_groupsObj(namesPtr, caps, input, inputType, true), 0b1110);
    __Porffor_object_fastAdd(resProps, 'indices', indices, 0b1110);
  }

  return result;
};

export const __RegExp_prototype_source$get = function (this: any) {
  if (Porffor.type(this) != Porffor.TYPES.regexp) {
    if (Porffor.object.isObject(this)) if (this === __Porffor_object_getHiddenPrototype(Porffor.TYPES.regexp)) return '(?:)';
    throw new TypeError('RegExp.prototype.source getter called on incompatible receiver');
  }
  const src: i32 = Porffor.IR.loadI32(this, 0);
  const srcType: i32 = Porffor.IR.loadU8(this, 22);
  if (src == 0 || (src as bytestring).length == 0) return '(?:)';
  const pattern: any = Porffor.as(src, srcType);

  // escape bare '/' and line terminators so /source/flags round-trips (EscapeRegExpPattern)
  let needsEscape: boolean = false;
  const len: i32 = (pattern as bytestring).length;
  for (let i: i32 = 0; i < len; i++) {
    const c: i32 = (pattern as bytestring).charCodeAt(i);
    if (Porffor.fastOr(c == 47, c == 10, c == 13, c == 0x2028, c == 0x2029)) {
      needsEscape = true;
      break;
    }
    if (c == 92) i += 1;
  }
  if (!needsEscape) return pattern;

  const out: bytestring = Porffor.malloc(len * 6 + 8);
  Porffor.IR.storeI32(out, 0, 0);
  let inClass: boolean = false;
  for (let i: i32 = 0; i < len; i++) {
    const c: i32 = (pattern as bytestring).charCodeAt(i);
    if (c == 92) {
      Porffor.bytestring.appendChar(out, c);
      i += 1;
      if (i < len) Porffor.bytestring.appendChar(out, (pattern as bytestring).charCodeAt(i));
      continue;
    }
    if (c == 91) inClass = true;
      else if (c == 93) inClass = false;
    if (c == 47 && !inClass) {
      Porffor.bytestring.append2Char(out, 92, 47);
      continue;
    }
    if (c == 10) {
      Porffor.bytestring.append2Char(out, 92, 110);
      continue;
    }
    if (c == 13) {
      Porffor.bytestring.append2Char(out, 92, 114);
      continue;
    }
    if (c == 0x2028 || c == 0x2029) {
      Porffor.bytestring.append2Char(out, 92, 117);
      Porffor.bytestring.append2Char(out, 50, 48);
      Porffor.bytestring.append2Char(out, 50, c == 0x2028 ? 56 : 57);
      continue;
    }
    Porffor.bytestring.appendChar(out, c);
  }
  return out;
};

export const __RegExp_prototype_lastIndex$get = function (this: RegExp) {
  if (Porffor.IR.loadU8(this, 20) != 0) return Porffor.object.get(this, 'lastIndex');
  return Porffor.IR.loadI32(this, 8);
};

export const __Porffor_regex_origFlags = (R: any): bytestring => {
  const result: bytestring = Porffor.malloc(16);
  Porffor.IR.storeI32(result, 0, 0);
  const flags: i32 = Porffor.IR.loadU16(R, 4);
  if (flags & 0b01000000) Porffor.bytestring.appendChar(result, 0x64);
  if (flags & 0b00000001) Porffor.bytestring.appendChar(result, 0x67);
  if (flags & 0b00000010) Porffor.bytestring.appendChar(result, 0x69);
  if (flags & 0b00000100) Porffor.bytestring.appendChar(result, 0x6d);
  if (flags & 0b00001000) Porffor.bytestring.appendChar(result, 0x73);
  if (flags & 0b00010000) Porffor.bytestring.appendChar(result, 0x75);
  if (flags & 0b10000000) Porffor.bytestring.appendChar(result, 0x76);
  if (flags & 0b00100000) Porffor.bytestring.appendChar(result, 0x79);
  return result;
};

export const __RegExp_prototype_flags$get = function (this: any) {
  const R: any = this;
  if (!Porffor.object.isObject(R)) throw new TypeError('RegExp.prototype.flags getter called on non-object');

  if (Porffor.type(R) == Porffor.TYPES.regexp) {
    const own: any = __Porffor_object_underlyingIfAny(R);
    if (Porffor.IR.ptr(own) == 0) return __Porffor_regex_origFlags(R);
    if (Porffor.IR.loadU16(own, 0) == 0) return __Porffor_regex_origFlags(R);
  }

  const result: bytestring = Porffor.malloc(16);
  Porffor.IR.storeI32(result, 0, 0);

  if (!!__Porffor_regex_getData(R, 'hasIndices')) Porffor.bytestring.appendChar(result, 0x64);
  if (!!__Porffor_regex_getData(R, 'global')) Porffor.bytestring.appendChar(result, 0x67);
  if (!!__Porffor_regex_getData(R, 'ignoreCase')) Porffor.bytestring.appendChar(result, 0x69);
  if (!!__Porffor_regex_getData(R, 'multiline')) Porffor.bytestring.appendChar(result, 0x6d);
  if (!!__Porffor_regex_getData(R, 'dotAll')) Porffor.bytestring.appendChar(result, 0x73);
  if (!!__Porffor_regex_getData(R, 'unicode')) Porffor.bytestring.appendChar(result, 0x75);
  if (!!__Porffor_regex_getData(R, 'unicodeSets')) Porffor.bytestring.appendChar(result, 0x76);
  if (!!__Porffor_regex_getData(R, 'sticky')) Porffor.bytestring.appendChar(result, 0x79);
  return result;
};

export const __Porffor_regex_flagGet = (R: any, bit: i32): any => {
  if (Porffor.type(R) == Porffor.TYPES.regexp) return (Porffor.IR.loadU16(R, 4) & bit) != 0;
  if (Porffor.object.isObject(R)) if (R === __Porffor_object_getHiddenPrototype(Porffor.TYPES.regexp)) return undefined;
  throw new TypeError('RegExp flag getter called on incompatible receiver');
};

export const __RegExp_prototype_global$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b00000001);
};
export const __RegExp_prototype_ignoreCase$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b00000010);
};
export const __RegExp_prototype_multiline$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b00000100);
};
export const __RegExp_prototype_dotAll$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b00001000);
};
export const __RegExp_prototype_unicode$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b00010000);
};
export const __RegExp_prototype_sticky$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b00100000);
};
export const __RegExp_prototype_hasIndices$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b01000000);
};
export const __RegExp_prototype_unicodeSets$get = function (this: any) {
  return __Porffor_regex_flagGet(this, 0b10000000);
};

export const __RegExp_prototype_toString = function (this: any) {
  if (!Porffor.object.isObject(this)) throw new TypeError('RegExp.prototype.toString called on non-object');
  const source: any = ecma262.ToString(__Porffor_regex_getData(this, 'source'));
  const flags: any = ecma262.ToString(__Porffor_regex_getData(this, 'flags'));
  return __Porffor_strcat(__Porffor_strcat(__Porffor_strcat('/', source), '/'), flags);
};

// any: called as a function it can return its (non-regexp) regexp-like argument
export const RegExp = function (pattern: any, flags: any): any {
  const patternIsRegExp: boolean = __Porffor_regex_isRegExp(pattern);
  if (new.target === undefined) if (patternIsRegExp) if (flags === undefined) {
    if (__Porffor_regex_getData(pattern, 'constructor') === RegExp) return pattern;
  }

  let patternSrc: any = pattern;
  let flagsSrc: any = flags;
  if (Porffor.type(pattern) == Porffor.TYPES.regexp) {
    const src: i32 = Porffor.IR.loadI32(pattern, 0);
    patternSrc = src == 0 ? '' : Porffor.as(src, Porffor.IR.loadU8(pattern, 22));
    if (flags === undefined) flagsSrc = __Porffor_regex_origFlags(pattern);
  } else if (patternIsRegExp) {
    patternSrc = __Porffor_regex_getData(pattern, 'source');
    if (flags === undefined) flagsSrc = __Porffor_regex_getData(pattern, 'flags');
  }

  if (patternSrc === undefined) patternSrc = '';
    else if ((Porffor.type(patternSrc) | 0b10000000) !== Porffor.TYPES.bytestring) patternSrc = ecma262.ToString(patternSrc);
  if (flagsSrc === undefined) flagsSrc = '';
    else if ((Porffor.type(flagsSrc) | 0b10000000) !== Porffor.TYPES.bytestring) flagsSrc = ecma262.ToString(flagsSrc);

  const re: RegExp = __Porffor_regex_compile(patternSrc, flagsSrc);
  if (new.target !== undefined) if (new.target !== RegExp) Porffor.IR.storeU8(re, 23, 1);
  return re;
};

export const __RegExp_Symbol_species$get = function (this: any): any {
  return this;
};

export const __Porffor_regex_legacyCheck = (C: any): void => {
  if (C !== RegExp) throw new TypeError('RegExp legacy static accessor called on incompatible receiver');
  if (__Porffor_regex_legacyState == 2) throw new TypeError('RegExp legacy static properties are unavailable after a subclass match');
};

// kind: 0 lastMatch, 1-9 $1-$9, 10 lastParen, 11 leftContext, 12 rightContext
export const __Porffor_regex_legacyGet = (C: any, kind: i32): any => {
  __Porffor_regex_legacyCheck(C);
  if (__Porffor_regex_legacyState == 0) return '';
  const src: any = __Porffor_regex_legacySrc;
  const srcType: i32 = Porffor.type(src);
  const p: i32 = Porffor.IR.ptr(__Porffor_regex_legacyPos);
  const start: i32 = Porffor.IR.loadI32(p, 0);
  const end: i32 = Porffor.IR.loadI32(p, 4);
  if (kind == 0) return __Porffor_regex_inputSubstring(src, srcType, start, end);
  if (kind == 11) return __Porffor_regex_inputSubstring(src, srcType, 0, start);
  if (kind == 12) return __Porffor_regex_inputSubstring(src, srcType, end, Porffor.IR.loadI32(Porffor.IR.ptr(src), 0));

  let n: i32 = kind;
  if (kind == 10) {
    n = Porffor.IR.loadI32(p, 8);
    if (n == 0) return '';
    if (n > 9) return ''; // only the first 9 captures are kept
  }
  const cs: i32 = Porffor.IR.loadI32(p + (n - 1) * 8, 12);
  const ce: i32 = Porffor.IR.loadI32(p + (n - 1) * 8, 16);
  if (Porffor.fastOr(cs == -1, ce == -1)) return '';
  return __Porffor_regex_inputSubstring(src, srcType, cs, ce);
};

export const __RegExp_input$get = function (this: any): any {
  __Porffor_regex_legacyCheck(this);
  return __Porffor_regex_legacyInput;
};
export const __RegExp_input$set = function (this: any, val: any): void {
  if (this !== RegExp) throw new TypeError('RegExp legacy static accessor called on incompatible receiver');
  __Porffor_regex_legacyInput = ecma262.ToString(val);
};
export const __RegExp_$_$get = function (this: any): any {
  return Porffor.callThis(__RegExp_input$get, this);
};
export const __RegExp_$_$set = function (this: any, val: any): void {
  Porffor.callThis(__RegExp_input$set, this, val);
};
export const __RegExp_lastMatch$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 0);
};
export const __RegExp_lastParen$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 10);
};
export const __RegExp_leftContext$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 11);
};
export const __RegExp_rightContext$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 12);
};
export const __RegExp_$1$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 1);
};
export const __RegExp_$2$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 2);
};
export const __RegExp_$3$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 3);
};
export const __RegExp_$4$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 4);
};
export const __RegExp_$5$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 5);
};
export const __RegExp_$6$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 6);
};
export const __RegExp_$7$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 7);
};
export const __RegExp_$8$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 8);
};
export const __RegExp_$9$get = function (this: any): any {
  return __Porffor_regex_legacyGet(this, 9);
};

export const __RegExp_prototype_exec = function (this: any, input: any) {
  if (Porffor.type(this) != Porffor.TYPES.regexp) throw new TypeError('RegExp.prototype.exec called on incompatible receiver');
  if ((Porffor.type(input) | 0b10000000) !== Porffor.TYPES.bytestring) input = ecma262.ToString(input);
  return __Porffor_regex_interpret(this, input, 0);
};

export const __RegExp_prototype_compile = function (this: any, pattern: any, flags: any) {
  if (Porffor.type(this) != Porffor.TYPES.regexp) throw new TypeError('RegExp.prototype.compile called on incompatible receiver');
  if (Porffor.IR.loadU8(this, 23) != 0) throw new TypeError('RegExp.prototype.compile called on a subclass instance');
  let fresh: any = undefined;
  if (Porffor.type(pattern) == Porffor.TYPES.regexp) {
    if (flags !== undefined) throw new TypeError('RegExp.prototype.compile flags must be undefined for a RegExp pattern');
    fresh = new RegExp(pattern);
  } else fresh = __Porffor_regex_create(pattern, flags);

  // everything but the lastIndex mode and legacy bytes
  Porffor.IR.copy(Porffor.IR.ptr(this), Porffor.IR.ptr(fresh), 20);
  Porffor.IR.storeU8(this, 22, Porffor.IR.loadU8(fresh, 22));
  Porffor.IR.gcBarrier(this, Porffor.TYPES.regexp);
  __Porffor_regex_liSet(this, 0);
  return this;
};

export const __RegExp_prototype_test = function (this: any, input: any) {
  if (!Porffor.object.isObject(this)) throw new TypeError('RegExp.prototype.test called on non-object');
  if ((Porffor.type(input) | 0b10000000) !== Porffor.TYPES.bytestring) input = ecma262.ToString(input);
  if (__Porffor_regex_pristine(this)) return __Porffor_regex_interpret(this, input, 1);
  return __Porffor_regex_specExec(this, input) !== null;
};

export const __Porffor_regex_getIdx = (o: any, i: i32): any => {
  if (Porffor.type(o) == Porffor.TYPES.array) if (i < (o as any[]).length) return (o as any[])[i];
  return Porffor.object.get(o, i);
};

export const __Porffor_regex_advance = (s: any, index: number, unicode: boolean): number => {
  if (!unicode) return index + 1;
  if (index + 1 >= s.length) return index + 1;
  if (Porffor.type(s) == Porffor.TYPES.string) {
    const p: i32 = Porffor.IR.ptr(s) + index * 2;
    const u1: i32 = Porffor.IR.loadU16(p, 4);
    const u2: i32 = Porffor.IR.loadU16(p, 6);
    if (u1 >= 0xD800 && u1 <= 0xDBFF && u2 >= 0xDC00 && u2 <= 0xDFFF) return index + 2;
  }
  return index + 1;
};

export const __Porffor_regex_flagIn = (flags: any, c: i32): boolean => {
  const len: i32 = flags.length;
  for (let i: i32 = 0; i < len; i++) {
    if (flags.charCodeAt(i) == c) return true;
  }
  return false;
};

// Get of a method without allocating an underlying object for a regexp without own props
export const __Porffor_regex_getData = (o: any, key: any): any => {
  if (Porffor.type(o) == Porffor.TYPES.regexp) if (Porffor.IR.ptr(__Porffor_object_underlyingIfAny(o)) == 0) {
    // accessors still get the regexp as receiver
    const proto: any = __Porffor_object_getHiddenPrototype(Porffor.TYPES.regexp);
    const entryPtr: i32 = __Porffor_object_lookup(proto, key, __Porffor_object_hash(key));
    if (entryPtr == 0) return Porffor.object.get(proto, key);
    if ((Porffor.IR.loadU16(entryPtr, 16) & 0b0001) == 0) return __Porffor_object_readValue(entryPtr);
    const get: any = __Porffor_object_accessorGet(entryPtr);
    if (Porffor.type(get) != Porffor.TYPES.function) return undefined;
    return Porffor.callThis(get, o);
  }
  return Porffor.object.get(o, key);
};

// regexp without own props and builtin exec: uses the engine directly, RegExp.prototype getter overrides are not observed
export const __Porffor_regex_pristine = (rx: any): boolean => {
  if (Porffor.type(rx) != Porffor.TYPES.regexp) return false;
  const own: any = __Porffor_object_underlyingIfAny(rx);
  if (Porffor.IR.ptr(own) != 0) if (Porffor.IR.loadU16(own, 0) != 0) return false;
  return __Porffor_regex_getData(rx, 'exec') === __RegExp_prototype_exec;
};

export const __Porffor_regex_requireObject = (rx: any): void => {
  if (!Porffor.object.isObject(rx)) throw new TypeError('RegExp method called on non-object');
};

export const __Porffor_regex_specExec = (rx: any, s: any): any => {
  const exec: any = __Porffor_regex_getData(rx, 'exec');
  if (Porffor.type(exec) == Porffor.TYPES.function) {
    const result: any = Porffor.callThis(exec, rx, s);
    if (result !== null && !Porffor.object.isObject(result)) throw new TypeError('RegExp exec method returned something other than an Object or null');
    return result;
  }
  if (Porffor.type(rx) != Porffor.TYPES.regexp) throw new TypeError('RegExp exec method called on incompatible receiver');
  return __Porffor_regex_interpret(rx, s, 0);
};

export const __Porffor_regex_create = (p: any, f: any): any => {
  return __Porffor_regex_compile(p === undefined ? '' : ecma262.ToString(p), f === undefined ? '' : ecma262.ToString(f));
};

export const __Porffor_regex_isRegExp = (arg: any): boolean => {
  if (!Porffor.object.isObject(arg)) return false;
  const matcher: any = __Porffor_regex_getData(arg, Symbol.match);
  if (matcher !== undefined) return !!matcher;
  return Porffor.type(arg) == Porffor.TYPES.regexp;
};

export const __Porffor_regex_species = (rx: any): any => {
  const c: any = __Porffor_regex_getData(rx, 'constructor');
  if (c === undefined) return RegExp;
  if (!Porffor.object.isObject(c)) throw new TypeError('RegExp constructor property is not an object');
  // RegExp itself without own props: nothing defined a species on it
  if (c === RegExp) if (Porffor.IR.ptr(__Porffor_object_underlyingIfAny(c)) == 0) return RegExp;
  const s: any = Porffor.object.get(c, Symbol.species);
  if (s == null) return RegExp;
  if (ecma262.IsConstructor(s)) return s;
  throw new TypeError('RegExp species is not a constructor');
};

export const __Porffor_regex_speciesNew = (C: any, R: any, flags: any): any => {
  if (C === RegExp) return new RegExp(R, flags);
  const args: any[] = Porffor.array.new(2);
  Porffor.array.fastPush(args, R);
  Porffor.array.fastPush(args, flags);
  return Porffor.call(C, args, null, C);
};

export const __Porffor_regex_splitLimit = (limit: any): number => {
  if (limit === undefined) return 4294967295;
  const n: number = ecma262.ToNumber(limit);
  if (n != n || n == Infinity || n == -Infinity) return 0;
  const t: number = Math.trunc(n) % 4294967296;
  return t < 0 ? t + 4294967296 : t;
};

export const __Porffor_regex_match = (regexp: any, input: any) => {
  if (Porffor.callThis(__RegExp_prototype_global$get, regexp)) {
    Porffor.IR.storeI32(regexp, 8, 0);
    const result: any[] = Porffor.array.new(4);
    const inputType: i32 = Porffor.type(input);
    const inputLen: i32 = (input as bytestring).length;
    while (true) {
      const end: i32 = __Porffor_regex_interpret(regexp, input, 2);
      if (end == -1) break;
      Porffor.array.fastPush(result, __Porffor_regex_inputSubstring(input, inputType, __Porffor_regex_mStart, end));
      if (end == __Porffor_regex_mStart) { // empty match, advance by hand (a whole cp in u mode)
        if (end >= inputLen) {
          Porffor.IR.storeI32(regexp, 8, 0);
          break;
        }
        Porffor.IR.storeI32(regexp, 8, __Porffor_regex_advance(input, end, (Porffor.IR.loadU16(regexp, 4) & 0b10010000) != 0));
      }
    }
    if (result.length == 0) return null;
    return result;
  }

  return __Porffor_regex_interpret(regexp, input, 0);
};

export const __RegExp_prototype_Symbol_match = function (this: any, string: any) {
  const rx: any = this;
  __Porffor_regex_requireObject(rx);
  const s: any = ecma262.ToString(string);
  if (__Porffor_regex_pristine(rx)) return __Porffor_regex_match(rx, s);

  const flags: any = ecma262.ToString(__Porffor_regex_getData(rx, 'flags'));
  if (!__Porffor_regex_flagIn(flags, 103)) return __Porffor_regex_specExec(rx, s); // g
  const fullUnicode: boolean = __Porffor_regex_flagIn(flags, 117) || __Porffor_regex_flagIn(flags, 118);
  __Porffor_regex_liSet(rx, 0);
  const out: any[] = Porffor.array.new(4);
  while (true) {
    const result: any = __Porffor_regex_specExec(rx, s);
    if (result === null) break;
    const matchStr: any = ecma262.ToString(__Porffor_regex_getIdx(result, 0));
    Porffor.array.fastPush(out, matchStr);
    if (matchStr.length == 0) __Porffor_regex_liSet(rx, __Porffor_regex_advance(s, ecma262.ToLength(__Porffor_regex_liGet(rx)), fullUnicode));
  }
  if (out.length == 0) return null;
  return out;
};

export const __RegExp_prototype_Symbol_matchAll = function (this: any, string: any): __Porffor_RegExpStringIterator {
  const r: any = this;
  __Porffor_regex_requireObject(r);
  const s: any = ecma262.ToString(string);
  const c: any = __Porffor_regex_species(r);
  const flags: any = ecma262.ToString(__Porffor_regex_getData(r, 'flags'));
  const matcher: any = __Porffor_regex_speciesNew(c, r, flags);
  __Porffor_regex_liSet(matcher, ecma262.ToLength(__Porffor_regex_liGet(r)));

  // %RegExpStringIterator%: [matcher, string, global, fullUnicode, done]
  const rec: any[] = Porffor.array.new(5);
  Porffor.array.fastPush(rec, matcher);
  Porffor.array.fastPush(rec, s);
  Porffor.array.fastPush(rec, __Porffor_regex_flagIn(flags, 103));
  Porffor.array.fastPush(rec, __Porffor_regex_flagIn(flags, 117) || __Porffor_regex_flagIn(flags, 118));
  Porffor.array.fastPush(rec, false);
  return Porffor.as(rec, Porffor.TYPES.__porffor_regexpstringiterator);
};

export const __Porffor_RegExpStringIterator_prototype_next = function (this: any) {
  if (Porffor.type(this) != Porffor.TYPES.__porffor_regexpstringiterator) throw new TypeError('RegExp String Iterator next called on incompatible receiver');
  const rec: any[] = Porffor.as(this, Porffor.TYPES.array);
  if (rec[4]) return __Porffor_iterator_result(undefined, true);

  const r: any = rec[0];
  const s: any = rec[1];
  const match: any = __Porffor_regex_specExec(r, s);
  if (match === null) {
    rec[4] = true;
    return __Porffor_iterator_result(undefined, true);
  }

  if (rec[2]) { // global
    const matchStr: any = ecma262.ToString(__Porffor_regex_getIdx(match, 0));
    if (matchStr.length == 0) __Porffor_regex_liSet(r, __Porffor_regex_advance(s, ecma262.ToLength(__Porffor_regex_liGet(r)), rec[3]));
    return __Porffor_iterator_result(match, false);
  }

  rec[4] = true;
  return __Porffor_iterator_result(match, false);
};

export const __Porffor_regex_search = (regexp: any, input: any) => {
  const lastIndex: i32 = Porffor.IR.loadI32(regexp, 8);
  Porffor.IR.storeI32(regexp, 8, 0);
  const end: i32 = __Porffor_regex_interpret(regexp, input, 2);
  Porffor.IR.storeI32(regexp, 8, lastIndex);
  if (end == -1) return -1;
  return __Porffor_regex_mStart;
};

export const __RegExp_prototype_Symbol_search = function (this: any, string: any) {
  const rx: any = this;
  __Porffor_regex_requireObject(rx);
  const s: any = ecma262.ToString(string);
  if (__Porffor_regex_pristine(rx)) return __Porffor_regex_search(rx, s);

  const previousLastIndex: any = __Porffor_regex_liGet(rx);
  if (!__Object_is(previousLastIndex, 0)) __Porffor_regex_liSet(rx, 0);
  const result: any = __Porffor_regex_specExec(rx, s);
  if (!__Object_is(__Porffor_regex_liGet(rx), previousLastIndex)) __Porffor_regex_liSet(rx, previousLastIndex);
  if (result === null) return -1;
  return Porffor.object.get(result, 'index');
};

export const __Porffor_regex_getSubstitution = (matched: any, str: any, position: i32, captures: any[], namedCaptures: any, template: any): any => {
  const strType: i32 = Porffor.type(str);
  const stringLength: i32 = str.length;
  const tLen: i32 = template.length;
  const tType: i32 = Porffor.type(template);
  const captureLen: i32 = captures.length;
  let out: any = '';
  let lit: i32 = 0;
  let i: i32 = 0;
  while (i < tLen) {
    if (template.charCodeAt(i) != 36 || i + 1 >= tLen) { // not $
      i += 1;
      continue;
    }

    const next: i32 = template.charCodeAt(i + 1);
    let rep: any = undefined;
    let refLen: i32 = 0;
    if (next == 36) { // $$
      rep = '$';
      refLen = 2;
    } else if (next == 96) { // $`
      rep = __Porffor_regex_inputSubstring(str, strType, 0, position);
      refLen = 2;
    } else if (next == 38) { // $&
      rep = matched;
      refLen = 2;
    } else if (next == 39) { // $'
      let tailPos: i32 = position + matched.length;
      if (tailPos > stringLength) tailPos = stringLength;
      rep = __Porffor_regex_inputSubstring(str, strType, tailPos, stringLength);
      refLen = 2;
    } else if (next >= 48 && next <= 57) { // $n $nn
      let digitCount: i32 = 1;
      let index: i32 = next - 48;
      if (i + 2 < tLen) {
        const d2: i32 = template.charCodeAt(i + 2);
        if (d2 >= 48 && d2 <= 57) {
          digitCount = 2;
          index = index * 10 + d2 - 48;
        }
      }
      if (index > captureLen && digitCount == 2) {
        digitCount = 1;
        index = next - 48;
      }
      if (index >= 1 && index <= captureLen) {
        rep = captures[index - 1];
        if (rep === undefined) rep = '';
        refLen = 1 + digitCount;
      }
    } else if (next == 60) { // $<
      if (namedCaptures !== undefined) {
        let gt: i32 = -1;
        for (let j: i32 = i + 2; j < tLen; j++) {
          if (template.charCodeAt(j) == 62) {
            gt = j;
            break;
          }
        }
        if (gt != -1) {
          const capture: any = namedCaptures[__Porffor_regex_inputSubstring(template, tType, i + 2, gt)];
          rep = capture === undefined ? '' : ecma262.ToString(capture);
          refLen = gt + 1 - i;
        }
      }
    }

    if (refLen == 0) { // lone $
      i += 1;
      continue;
    }
    out = __Porffor_strcat(__Porffor_strcat(out, __Porffor_regex_inputSubstring(template, tType, lit, i)), rep);
    i += refLen;
    lit = i;
  }
  if (lit == 0) return template;
  return __Porffor_strcat(out, __Porffor_regex_inputSubstring(template, tType, lit, tLen));
};

// pristine regexp and a replacement string without $
export const __Porffor_regex_replacePlain = (searchValue: any, str: any, repl: any) => {
  const thisLen: i32 = str.length;
  const strType: i32 = Porffor.type(str);
  const flags: i32 = Porffor.IR.loadU16(searchValue, 4);
  const global: boolean = (flags & 0b00000001) != 0;
  const uv: boolean = (flags & 0b10010000) != 0;

  let out: any = '';
  let matched: boolean = false;
  let appendIndex: i32 = 0;
  // non-global sticky starts at lastIndex, everything else at 0
  let searchIndex: i32 = 0;
  if (!global && (flags & 0b00100000) != 0) {
    searchIndex = Porffor.IR.loadI32(searchValue, 8);
    if (searchIndex < 0) searchIndex = 0;
    if (searchIndex > thisLen) {
      Porffor.IR.storeI32(searchValue, 8, 0);
      return str;
    }
  }

  // all-bytestring case builds one growing buffer instead of strcat chains
  const bytes: boolean = strType == Porffor.TYPES.bytestring && Porffor.type(repl) == Porffor.TYPES.bytestring;
  const replLen: i32 = repl.length;
  let cap: i32 = thisLen + replLen + 16;
  let buf: i32 = bytes ? Porffor.malloc(cap + 8) : 0;
  let bufLen: i32 = 0;
  while (searchIndex <= thisLen) {
    const matchEnd: i32 = __Porffor_regex_interpretFrom(searchValue, str, 2, searchIndex);
    if (matchEnd == -1) break;
    const matchIndex: i32 = __Porffor_regex_matchStart();
    matched = true;
    if (bytes) {
      const segLen: i32 = matchIndex - appendIndex;
      if (bufLen + segLen + replLen > cap) {
        while (cap < bufLen + segLen + replLen) cap *= 2;
        const nbuf: i32 = Porffor.malloc(cap + 8);
        Porffor.IR.copy(nbuf + 4, buf + 4, bufLen);
        buf = nbuf;
      }
      Porffor.IR.copy(buf + 4 + bufLen, Porffor.IR.ptr(str) + 4 + appendIndex, segLen);
      bufLen += segLen;
      Porffor.IR.copy(buf + 4 + bufLen, Porffor.IR.ptr(repl) + 4, replLen);
      bufLen += replLen;
    } else {
      out = __Porffor_strcat(out, __Porffor_regex_inputSubstring(str, strType, appendIndex, matchIndex));
      out = __Porffor_strcat(out, repl);
    }

    appendIndex = matchEnd;
    if (!global) break;

    if (matchEnd == matchIndex) {
      if (matchEnd >= thisLen) break;
      searchIndex = __Porffor_regex_advance(str, matchEnd, uv);
      continue;
    }

    searchIndex = matchEnd;
  }

  if (global) Porffor.IR.storeI32(searchValue, 8, 0);
  if (!matched) return str;
  if (!bytes) return __Porffor_strcat(out, __Porffor_regex_inputSubstring(str, strType, appendIndex, thisLen));

  const tailLen: i32 = thisLen - appendIndex;
  if (bufLen + tailLen > cap) {
    cap = bufLen + tailLen;
    const nbuf: i32 = Porffor.malloc(cap + 8);
    Porffor.IR.copy(nbuf + 4, buf + 4, bufLen);
    buf = nbuf;
  }
  Porffor.IR.copy(buf + 4 + bufLen, Porffor.IR.ptr(str) + 4 + appendIndex, tailLen);
  bufLen += tailLen;
  Porffor.IR.storeI32(buf, 0, bufLen);
  return buf as bytestring;
};

export const __RegExp_prototype_Symbol_replace = function (this: any, string: any, replaceValue: any) {
  const rx: any = this;
  __Porffor_regex_requireObject(rx);
  const s: any = ecma262.ToString(string);
  const sType: i32 = Porffor.type(s);
  const lengthS: i32 = s.length;
  const functional: boolean = Porffor.type(replaceValue) == Porffor.TYPES.function;
  if (!functional) replaceValue = ecma262.ToString(replaceValue);

  const pristine: boolean = __Porffor_regex_pristine(rx);
  if (pristine && !functional && __Porffor_regex_flagIn(replaceValue, 36) == false) return __Porffor_regex_replacePlain(rx, s, replaceValue);

  let global: boolean = false;
  let fullUnicode: boolean = false;
  if (pristine) {
    const iflags: i32 = Porffor.IR.loadU16(rx, 4);
    global = (iflags & 0b00000001) != 0;
    fullUnicode = (iflags & 0b10010000) != 0;
  } else {
    const flags: any = ecma262.ToString(__Porffor_regex_getData(rx, 'flags'));
    global = __Porffor_regex_flagIn(flags, 103);
    if (global) fullUnicode = __Porffor_regex_flagIn(flags, 117) || __Porffor_regex_flagIn(flags, 118);
  }
  if (global) __Porffor_regex_liSet(rx, 0);

  const results: any[] = Porffor.array.new(4);
  while (true) {
    const result: any = pristine ? __Porffor_regex_interpret(rx, s, 0) : __Porffor_regex_specExec(rx, s);
    if (result === null) break;
    Porffor.array.fastPush(results, result);
    if (!global) break;
    const matchStr: any = ecma262.ToString(__Porffor_regex_getIdx(result, 0));
    if (matchStr.length == 0) __Porffor_regex_liSet(rx, __Porffor_regex_advance(s, ecma262.ToLength(__Porffor_regex_liGet(rx)), fullUnicode));
  }

  let acc: any = '';
  let nextPos: i32 = 0;
  const nResults: i32 = results.length;
  for (let r: i32 = 0; r < nResults; r++) {
    const result: any = results[r];
    let nCaptures: number = __Porffor_array_lengthOf(result) - 1;
    if (nCaptures < 0) nCaptures = 0;
    const matched: any = ecma262.ToString(__Porffor_regex_getIdx(result, 0));
    let position: number = ecma262.ToIntegerOrInfinity(Porffor.object.get(result, 'index'));
    if (position < 0) position = 0;
    if (position > lengthS) position = lengthS;

    const captures: any[] = Porffor.array.new(4);
    for (let n: i32 = 1; n <= nCaptures; n++) {
      let capN: any = __Porffor_regex_getIdx(result, n);
      if (capN !== undefined) capN = ecma262.ToString(capN);
      Porffor.array.fastPush(captures, capN);
    }
    let namedCaptures: any = Porffor.object.get(result, 'groups');

    let replacement: any = undefined;
    if (functional) {
      const args: any[] = Porffor.array.new(nCaptures + 4);
      Porffor.array.fastPush(args, matched);
      for (let n: i32 = 0; n < nCaptures; n++) Porffor.array.fastPush(args, captures[n]);
      Porffor.array.fastPush(args, position);
      Porffor.array.fastPush(args, s);
      if (namedCaptures !== undefined) Porffor.array.fastPush(args, namedCaptures);
      replacement = ecma262.ToString(Porffor.call(replaceValue, args, undefined, undefined));
    } else {
      // ToObject: only null throws, Gets on a primitive see its wrapper's props anyway
      if (namedCaptures === null) throw new TypeError('Cannot convert null to object');
      replacement = __Porffor_regex_getSubstitution(matched, s, position, captures, namedCaptures, replaceValue);
    }

    if (position >= nextPos) {
      acc = __Porffor_strcat(__Porffor_strcat(acc, __Porffor_regex_inputSubstring(s, sType, nextPos, position)), replacement);
      nextPos = position + matched.length;
    }
  }

  if (nResults == 0) return s;
  if (nextPos >= lengthS) return acc;
  return __Porffor_strcat(acc, __Porffor_regex_inputSubstring(s, sType, nextPos, lengthS));
};

export const __RegExp_prototype_Symbol_split = function (this: any, string: any, limit: any) {
  const rx: any = this;
  __Porffor_regex_requireObject(rx);
  const s: any = ecma262.ToString(string);
  const c: any = __Porffor_regex_species(rx);

  // pristine non-sticky regexp: scan forward with the engine instead of a sticky splitter copy
  if (c === RegExp && __Porffor_regex_pristine(rx) && (Porffor.IR.loadU16(rx, 4) & 0b00100000) == 0) {
    const lim: number = __Porffor_regex_splitLimit(limit);
    const out: any[] = Porffor.array.new(4);
    if (lim == 0) return out;
    const lastIndex: i32 = Porffor.IR.loadI32(rx, 8);
    __Porffor_string_splitRegex(s, rx, lim, out);
    Porffor.IR.storeI32(rx, 8, lastIndex);
    return out;
  }

  const flags: any = ecma262.ToString(__Porffor_regex_getData(rx, 'flags'));
  const unicodeMatching: boolean = __Porffor_regex_flagIn(flags, 117) || __Porffor_regex_flagIn(flags, 118);
  const newFlags: any = __Porffor_regex_flagIn(flags, 121) ? flags : __Porffor_strcat(flags, 'y');
  const splitter: any = __Porffor_regex_speciesNew(c, rx, newFlags);

  const out: any[] = Porffor.array.new(4);
  const lim: number = __Porffor_regex_splitLimit(limit);
  if (lim == 0) return out;

  const sType: i32 = Porffor.type(s);
  const size: i32 = s.length;
  if (size == 0) {
    if (__Porffor_regex_specExec(splitter, s) !== null) return out;
    Porffor.array.fastPush(out, s);
    return out;
  }

  let lengthA: i32 = 0;
  let p: i32 = 0;
  let q: i32 = 0;
  while (q < size) {
    __Porffor_regex_liSet(splitter, q);
    const z: any = __Porffor_regex_specExec(splitter, s);
    if (z === null) {
      q = __Porffor_regex_advance(s, q, unicodeMatching);
      continue;
    }
    let e: number = ecma262.ToLength(__Porffor_regex_liGet(splitter));
    if (e > size) e = size;
    if (e == p) {
      q = __Porffor_regex_advance(s, q, unicodeMatching);
      continue;
    }
    lengthA = Porffor.array.fastPush(out, __Porffor_regex_inputSubstring(s, sType, p, q));
    if (lengthA == lim) return out;
    p = e;
    let nCaps: number = __Porffor_array_lengthOf(z) - 1;
    if (nCaps < 0) nCaps = 0;
    for (let i: i32 = 1; i <= nCaps; i++) {
      lengthA = Porffor.array.fastPush(out, __Porffor_regex_getIdx(z, i));
      if (lengthA == lim) return out;
    }
    q = p;
  }
  Porffor.array.fastPush(out, __Porffor_regex_inputSubstring(s, sType, p, size));
  return out;
};

export const __Porffor_regex_strMatch = (o: any, regexp: any) => {
  if (Porffor.object.isObject(regexp)) {
    const matcher: any = __Porffor_regex_getData(regexp, Symbol.match);
    if (matcher === __RegExp_prototype_Symbol_match) return Porffor.callThis(__RegExp_prototype_Symbol_match, regexp, o);
    if (matcher != null) return Porffor.callThis(matcher, regexp, o);
  }
  const s: any = ecma262.ToString(o);
  const rx: any = __Porffor_regex_create(regexp, undefined);
  return Porffor.callThis(__Porffor_regex_getData(rx, Symbol.match), rx, s);
};

export const __String_prototype_match = function (this: string, regexp: any) {
  return __Porffor_regex_strMatch(this, regexp);
};
export const __ByteString_prototype_match = function (this: bytestring, regexp: any) {
  return __Porffor_regex_strMatch(this, regexp);
};

export const __Porffor_regex_strMatchAll = (o: any, regexp: any) => {
  if (Porffor.object.isObject(regexp)) {
    if (__Porffor_regex_isRegExp(regexp)) {
      const flags: any = __Porffor_regex_getData(regexp, 'flags');
      if (flags == null) throw new TypeError('RegExp flags is null or undefined');
      if (!__Porffor_regex_flagIn(ecma262.ToString(flags), 103)) throw new TypeError('matchAll used with non-global RegExp');
    }
    const matcher: any = __Porffor_regex_getData(regexp, Symbol.matchAll);
    if (matcher === __RegExp_prototype_Symbol_matchAll) return Porffor.callThis(__RegExp_prototype_Symbol_matchAll, regexp, o);
    if (matcher != null) return Porffor.callThis(matcher, regexp, o);
  }
  const s: any = ecma262.ToString(o);
  const rx: any = __Porffor_regex_create(regexp, 'g');
  return Porffor.callThis(__Porffor_regex_getData(rx, Symbol.matchAll), rx, s);
};

export const __String_prototype_matchAll = function (this: string, regexp: any) {
  return __Porffor_regex_strMatchAll(this, regexp);
};
export const __ByteString_prototype_matchAll = function (this: bytestring, regexp: any) {
  return __Porffor_regex_strMatchAll(this, regexp);
};

export const __Porffor_regex_strSearch = (o: any, regexp: any) => {
  if (Porffor.object.isObject(regexp)) {
    const searcher: any = __Porffor_regex_getData(regexp, Symbol.search);
    if (searcher === __RegExp_prototype_Symbol_search) return Porffor.callThis(__RegExp_prototype_Symbol_search, regexp, o);
    if (searcher != null) return Porffor.callThis(searcher, regexp, o);
  }
  const s: any = ecma262.ToString(o);
  const rx: any = __Porffor_regex_create(regexp, undefined);
  return Porffor.callThis(__Porffor_regex_getData(rx, Symbol.search), rx, s);
};

export const __String_prototype_search = function (this: string, regexp: any) {
  return __Porffor_regex_strSearch(this, regexp);
};
export const __ByteString_prototype_search = function (this: bytestring, regexp: any) {
  return __Porffor_regex_strSearch(this, regexp);
};

export const __Porffor_regex_escPut = (out: i32, wide: boolean, n: i32, c: i32): i32 => {
  if (wide) Porffor.IR.storeU16(out + n * 2, 4, c);
    else Porffor.IR.storeU8(out + n, 4, c);
  return n + 1;
};

export const __Porffor_regex_escHex = (out: i32, wide: boolean, n: i32, c: i32): i32 => {
  n = __Porffor_regex_escPut(out, wide, n, 92);
  const digits: i32 = c <= 0xFF ? 2 : 4;
  n = __Porffor_regex_escPut(out, wide, n, digits == 2 ? 120 : 117);
  for (let k: i32 = digits - 1; k >= 0; k--) {
    const d: i32 = (c >> (k * 4)) & 15;
    n = __Porffor_regex_escPut(out, wide, n, d < 10 ? 48 + d : 87 + d);
  }
  return n;
};

// EncodeForRegExpEscape kind: 1 \c, 2 control escape, 3 hex escape, 0 itself
export const __Porffor_regex_escKind = (c: i32): i32 => {
  // ^ $ \ . * + ? ( ) [ ] { } | /
  if (Porffor.fastOr(c == 94, c == 36, c == 92, c == 46, c == 42, c == 43, c == 63, c == 40, c == 41, c == 91, c == 93, c == 123, c == 125, c == 124, c == 47)) return 1;
  if (c >= 9 && c <= 13) return 2;
  // , - = < > # & ! % : ; @ ~ ' ` "
  if (Porffor.fastOr(c == 44, c == 45, c == 61, c == 60, c == 62, c == 35, c == 38, c == 33, c == 37, c == 58, c == 59, c == 64, c == 126, c == 39, c == 96, c == 34)) return 3;
  // whitespace, line terminators, (lone) surrogates
  if (Porffor.fastOr(c == 0x20, c == 0xA0, c == 0x1680, c == 0x2028, c == 0x2029, c == 0x202F, c == 0x205F, c == 0x3000, c == 0xFEFF)) return 3;
  if (Porffor.fastOr(c >= 0x2000 && c <= 0x200A, c >= 0xD800 && c <= 0xDFFF)) return 3;
  return 0;
};

export const __RegExp_escape = (str: any) => {
  if ((Porffor.type(str) | 0b10000000) != Porffor.TYPES.bytestring) throw new TypeError('RegExp.escape requires a string');
  const len: i32 = str.length;
  const isU16: boolean = Porffor.type(str) == Porffor.TYPES.string;

  // escapes are ascii, the output is only wide if some unit > 0xff is kept as is
  let wide: boolean = false;
  if (isU16) for (let i: i32 = 0; i < len; i++) {
    const c: i32 = str.charCodeAt(i);
    if (c > 0xFF) if (__Porffor_regex_escKind(c) == 0 || (c >= 0xD800 && c <= 0xDFFF)) {
      wide = true;
      break;
    }
  }

  const out: i32 = Porffor.malloc(8 + len * (wide ? 12 : 6));
  let n: i32 = 0;
  for (let i: i32 = 0; i < len; i++) {
    const c: i32 = str.charCodeAt(i);

    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < len) {
      const c2: i32 = str.charCodeAt(i + 1);
      if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
        n = __Porffor_regex_escPut(out, wide, n, c);
        n = __Porffor_regex_escPut(out, wide, n, c2);
        i += 1;
        continue;
      }
    }

    // a leading digit or ascii letter would continue an escape before it
    if (i == 0 && ((c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 65 && c <= 90))) {
      n = __Porffor_regex_escHex(out, wide, n, c);
      continue;
    }

    const kind: i32 = __Porffor_regex_escKind(c);
    if (kind == 1) {
      n = __Porffor_regex_escPut(out, wide, n, 92);
      n = __Porffor_regex_escPut(out, wide, n, c);
    } else if (kind == 2) {
      n = __Porffor_regex_escPut(out, wide, n, 92);
      n = __Porffor_regex_escPut(out, wide, n, c == 9 ? 116 : (c == 10 ? 110 : (c == 11 ? 118 : (c == 12 ? 102 : 114))));
    } else if (kind == 3) n = __Porffor_regex_escHex(out, wide, n, c);
      else n = __Porffor_regex_escPut(out, wide, n, c);
  }

  Porffor.IR.storeI32(out, 0, n);
  if (wide) return out as string;
  return out as bytestring;
};
