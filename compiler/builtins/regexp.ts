// @porf --valtype=i32
import type {} from './porffor.d.ts';

// regex memory structure (10):
//  0 @ source string ptr (u32)
//  4 @ flags (u16):
//   g, global - 0b00000001
//   i, ignore case - 0b00000010
//   m, multiline - 0b00000100
//   s, dotall - 0b00001000
//   u, unicode - 0b00010000
//   y, sticky - 0b00100000
//   d, has indices - 0b01000000
//   v, unicode sets - 0b10000000
//  6 @ capture count (u16)
//  8 @ last index (u16)
//  bytecode (variable):
//   op (u8)
//   depends on op (variable)
//   ----------------------------
//   single - 0x01:
//     char (u8)
//   class - 0x02 / negated class - 0x03:
//     items (variable):
//       RANGE_MARKER (0x00) (u8) + from (u8) + to (u8)
//       CHAR_MARKER (0x01) (u8) + char (u8)
//       PREDEF_MARKER (0x02) (u8) + classId (u8)
//     END_CLASS_MARKER (0xFF) (u8)
//   predefined class - 0x04:
//     class (u8)
//   start (line or string) - 0x05
//   end (line or string) - 0x06
//   word boundary - 0x07
//   non-word boundary - 0x08
//   dot - 0x09
//   back reference - 0x0a:
//     index (u8)
//   ----------------------------
//   accept - 0x10
//   reject - 0x11
//   ----------------------------
//   jump - 0x20:
//     target (u16)
//   fork - 0x21:
//     branch 1 (u16)
//     branch 2 (u16)
//   ----------------------------
//   start capture - 0x30:
//     index (u8)
//   end capture - 0x31:
//     index (u8)

export const __Porffor_array_fastPushI32 = (arr: any[], el: any): i32 => {
  let len: i32 = arr.length;
  arr[len] = el;
  arr.length = ++len;
  return len;
};

export const __Porffor_regex_compile = (patternStr: bytestring, flagsStr: bytestring): RegExp => {
  const ptr: i32 = Porffor.allocate();
  Porffor.wasm.i32.store(ptr, patternStr, 0, 0);

  // parse flags
  let flags: i32 = 0;
  let flagsPtr: i32 = flagsStr;
  const flagsEndPtr: i32 = flagsPtr + flagsStr.length;
  while (flagsPtr < flagsEndPtr) {
    const char: i32 = Porffor.wasm.i32.load8_u(flagsPtr, 0, 4);
    flagsPtr += 1;

    if (char == 103) { // g
      flags |= 0b00000001;
      continue;
    }
    if (char == 105) { // i
      flags |= 0b00000010;
      continue;
    }
    if (char == 109) { // m
      flags |= 0b00000100;
      continue;
    }
    if (char == 115) { // s
      flags |= 0b00001000;
      continue;
    }
    if (char == 117) { // u
      if (flags & 0b10000000) throw new SyntaxError('Regex parse: Conflicting unicode flag');
      flags |= 0b00010000;
      continue;
    }
    if (char == 121) { // y
      flags |= 0b00100000;
      continue;
    }
    if (char == 100) { // d
      flags |= 0b01000000;
      continue;
    }
    if (char == 118) { // v
      if (flags & 0b00010000) throw new SyntaxError('Regex parse: Conflicting unicode flag');
      flags |= 0b10000000;
      continue;
    }

    throw new SyntaxError('Regex parse: Invalid flag');
  }
  Porffor.wasm.i32.store16(ptr, flags, 0, 4);

  let bcPtr: i32 = ptr + 10;
  const bcStart: i32 = bcPtr;
  let patternPtr: i32 = patternStr;
  let patternEndPtr: i32 = patternPtr + patternStr.length;

  let lastWasAtom: boolean = false;
  let lastAtomStart: i32 = 0;
  let inClass: boolean = false;
  let captureIndex: i32 = 1;

  let groupDepth: i32 = 0;
  // todo: free all at the end (or statically allocate but = [] causes memory corruption)
  const groupStack: i32[] = Porffor.allocateBytes(6144);
  const altDepth: i32[] = Porffor.allocateBytes(6144); // number of |s so far at each depth
  const altStack: i32[] = Porffor.allocateBytes(6144);

  while (patternPtr < patternEndPtr) {
    let char: i32 = Porffor.wasm.i32.load8_u(patternPtr, 0, 4);
    patternPtr = patternPtr + 1;

    // escape
    let notEscaped: boolean = true;
    if (char == 92) { // '\'
      notEscaped = false;
      if (patternPtr >= patternEndPtr) throw new SyntaxError('Regex parse: trailing \\');

      char = Porffor.wasm.i32.load8_u(patternPtr, 0, 4);
      patternPtr = patternPtr + 1;
    }

    if (inClass) {
      if (notEscaped && char == 93) { // ']'
        inClass = false;
        // end class
        Porffor.wasm.i32.store8(bcPtr, 0xFF, 0, 0);
        bcPtr += 1;
        lastWasAtom = true;
        continue;
      }

      // class escape
      let v: i32 = char;
      let predefClassId: i32 = 0;
      if (!notEscaped) {
        if (char == 100) predefClassId = 1; // \d
        else if (char == 68) predefClassId = 2; // \D
        else if (char == 115) predefClassId = 3; // \s
        else if (char == 83) predefClassId = 4; // \S
        else if (char == 119) predefClassId = 5; // \w
        else if (char == 87) predefClassId = 6; // \W
        else if (char == 110) v = 10; // \n
        else if (char == 114) v = 13; // \r
        else if (char == 116) v = 9; // \t
        else if (char == 118) v = 11; // \v
        else if (char == 102) v = 12; // \f
        else if (char == 48) v = 0; // \0
      }

      if ((patternPtr + 1) < patternEndPtr && Porffor.wasm.i32.load8_u(patternPtr, 0, 4) == 45 && Porffor.wasm.i32.load8_u(patternPtr, 0, 5) != 93) {
        // possible range
        patternPtr += 1;
        let endChar: i32;
        let endNotEscaped: boolean = true;
        if (patternPtr < patternEndPtr && Porffor.wasm.i32.load8_u(patternPtr, 0, 4) == 92) {
          endNotEscaped = false;
          patternPtr += 1;
          if (patternPtr >= patternEndPtr) throw new SyntaxError('Regex parse: trailing \\ in range');
        }

        endChar = Porffor.wasm.i32.load8_u(patternPtr, 0, 4);
        patternPtr += 1;

        let endPredefClassId: i32 = 0;
        if (!endNotEscaped) {
          if (endChar == 100) endPredefClassId = 1;
            else if (endChar == 68) endPredefClassId = 2;
            else if (endChar == 115) endPredefClassId = 3;
            else if (endChar == 83) endPredefClassId = 4;
            else if (endChar == 119) endPredefClassId = 5;
            else if (endChar == 87) endPredefClassId = 6;
            else if (endChar == 110) endChar = 10;
            else if (endChar == 114) endChar = 13;
            else if (endChar == 116) endChar = 9;
            else if (endChar == 118) endChar = 11;
            else if (endChar == 102) endChar = 12;
            else if (endChar == 48) endChar = 0;
        }

        // If either side is a predefined class, treat as literal chars
        if (predefClassId > 0 || endPredefClassId > 0) {
          // emit start char/predef
          if (predefClassId > 0) {
            Porffor.wasm.i32.store8(bcPtr, 0x02, 0, 0); // PREDEF_MARKER
            Porffor.wasm.i32.store8(bcPtr, predefClassId, 0, 1);
            bcPtr += 2;
          } else {
            Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0); // CHAR_MARKER
            Porffor.wasm.i32.store8(bcPtr, v, 0, 1);
            bcPtr += 2;
          }

          // emit hyphen
          Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0); // CHAR_MARKER
          Porffor.wasm.i32.store8(bcPtr, 45, 0, 1);
          bcPtr += 2;

          // emit end char/predef
          if (endPredefClassId > 0) {
            Porffor.wasm.i32.store8(bcPtr, 0x02, 0, 0); // PREDEF_MARKER
            Porffor.wasm.i32.store8(bcPtr, endPredefClassId, 0, 1);
            bcPtr += 2;
          } else {
            Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0); // CHAR_MARKER
            Porffor.wasm.i32.store8(bcPtr, endChar, 0, 1);
            bcPtr += 2;
          }
        } else {
          if (v > endChar) throw new SyntaxError('Regex parse: invalid range');

          Porffor.wasm.i32.store8(bcPtr, 0x00, 0, 0); // RANGE_MARKER
          Porffor.wasm.i32.store8(bcPtr, v, 0, 1);
          Porffor.wasm.i32.store8(bcPtr, endChar, 0, 2);
          bcPtr += 3;
        }

        continue;
      }

      // store v as char or predefined
      if (predefClassId > 0) {
        Porffor.wasm.i32.store8(bcPtr, 0x02, 0, 0); // PREDEF_MARKER
        Porffor.wasm.i32.store8(bcPtr, predefClassId, 0, 1);
      } else {
        Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0); // CHAR_MARKER
        Porffor.wasm.i32.store8(bcPtr, v, 0, 1);
      }

      bcPtr += 2;
      continue;
    }

    if (notEscaped) {
      if (char == 91) { // '['
        lastAtomStart = bcPtr;
        inClass = true;
        if (patternPtr < patternEndPtr && Porffor.wasm.i32.load8_u(patternPtr, 0, 4) == 94) {
          patternPtr += 1;

          // negated
          Porffor.wasm.i32.store8(bcPtr, 0x03, 0, 0);
          bcPtr += 1;
          continue;
        }

        // not negated
        Porffor.wasm.i32.store8(bcPtr, 0x02, 0, 0);
        bcPtr += 1;
        continue;
      }

      if (char == 40) { // '('
        lastAtomStart = bcPtr;

        // Check for non-capturing group
        let ncg: boolean = false;
        if (patternPtr < patternEndPtr && Porffor.wasm.i32.load8_u(patternPtr, 0, 4) == 63) { // '?'
          if ((patternPtr + 1) < patternEndPtr && Porffor.wasm.i32.load8_u(patternPtr, 0, 5) == 58) { // ':'
            ncg = true;
            patternPtr += 2;
          }
        }

        Porffor.array.fastPushI32(groupStack, lastAtomStart);

        groupDepth += 1;
        if (!ncg) {
          Porffor.wasm.i32.store8(bcPtr, 0x30, 0, 0); // start capture
          Porffor.wasm.i32.store8(bcPtr, captureIndex, 0, 1);
          bcPtr += 2;

          Porffor.array.fastPushI32(groupStack, captureIndex);
          captureIndex += 1;
        } else {
          Porffor.array.fastPushI32(groupStack, -1);
        }

        lastWasAtom = false;
        continue;
      }

      if (char == 41) { // ')'
        if (groupDepth == 0) throw new SyntaxError('Regex parse: unmatched )');

        let thisAltDepth: i32 = altDepth[groupDepth];
        while (thisAltDepth-- > 0) {
          const jumpPtr: i32 = altStack.pop();
          Porffor.wasm.i32.store16(jumpPtr, bcPtr - jumpPtr, 0, 1);
        }
        altDepth[groupDepth] = 0;

        groupDepth -= 1;

        const capturePop: i32 = groupStack.pop();
        if (capturePop != -1) {
          Porffor.wasm.i32.store8(bcPtr, 0x31, 0, 0); // end capture
          Porffor.wasm.i32.store8(bcPtr, capturePop, 0, 1);
          bcPtr += 2;
        }

        const groupStartPtr: i32 = groupStack.pop();
        lastWasAtom = true;
        lastAtomStart = groupStartPtr;
        continue;
      }

      if (char == 124) { // '|'
        altDepth[groupDepth] += 1;

        const atomSize: i32 = bcPtr - lastAtomStart;
        Porffor.wasm.memory.copy(lastAtomStart + 5, lastAtomStart, atomSize, 0, 0);
        bcPtr += 5;

        Porffor.wasm.i32.store8(lastAtomStart, 0x21, 0, 0); // fork
        Porffor.wasm.i32.store16(lastAtomStart, 5, 0, 1); // branch1: after fork

        Porffor.wasm.i32.store8(bcPtr, 0x20, 0, 0); // jump
        Porffor.array.fastPushI32(altStack, bcPtr); // target: to be written in later
        bcPtr += 3;

        Porffor.wasm.i32.store16(lastAtomStart, bcPtr - lastAtomStart, 0, 3); // fork branch2: after jump

        lastAtomStart = bcPtr;
        lastWasAtom = false;
        continue;
      }

      if (char == 46) { // '.'
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x09, 0, 0); // dot
        bcPtr += 1;
        lastWasAtom = true;
        continue;
      }

      if (char == 94) { // '^'
        Porffor.wasm.i32.store8(bcPtr, 0x05, 0, 0); // start
        bcPtr += 1;
        lastWasAtom = false;
        continue;
      }
      if (char == 36) { // '$'
        Porffor.wasm.i32.store8(bcPtr, 0x06, 0, 0); // end
        bcPtr += 1;
        lastWasAtom = false;
        continue;
      }

      // quantifiers: *, +, ?
      if (Porffor.fastOr(char == 42, char == 43, char == 63)) {
        if (!lastWasAtom) throw new SyntaxError('Regex parser: quantifier without atom');

        // check for lazy
        let lazy: boolean = false;
        if (patternPtr < patternEndPtr && Porffor.wasm.i32.load8_u(patternPtr, 0, 4) == 63) { // '?'
          lazy = true;
          patternPtr++;
        }

        // Calculate atom size and move it forward to make space for quantifier logic
        const atomSize: i32 = bcPtr - lastAtomStart;
        if (char == 42) { // * (zero or more)
          // Move atom forward to make space for fork BEFORE it
          Porffor.wasm.memory.copy(lastAtomStart + 5, lastAtomStart, atomSize, 0, 0);

          // Insert fork at atom start position
          Porffor.wasm.i32.store8(lastAtomStart, 0x21, 0, 0); // fork
          if (lazy) {
            Porffor.wasm.i32.store16(lastAtomStart, atomSize + 8, 0, 1); // branch1: skip atom entirely
            Porffor.wasm.i32.store16(lastAtomStart, 5, 0, 3); // branch2: execute atom
          } else {
            Porffor.wasm.i32.store16(lastAtomStart, 5, 0, 1); // branch1: execute atom
            Porffor.wasm.i32.store16(lastAtomStart, atomSize + 8, 0, 3); // branch2: skip atom entirely
          }

          // insert jump to loop
          Porffor.wasm.i32.store8(bcPtr, 0x20, 0, 5);
          Porffor.wasm.i32.store16(bcPtr, -atomSize - 5, 0, 6);

          // Update bcPtr to point after the moved atom
          bcPtr += 8;
        } else if (char == 43) { // + (one or more)
          // For +, atom executes once, then add fork for additional matches
          Porffor.wasm.i32.store8(bcPtr, 0x21, 0, 0); // fork
          if (lazy) {
            Porffor.wasm.i32.store16(bcPtr, 5, 0, 1); // branch1: continue (done)
            Porffor.wasm.i32.store16(bcPtr, -(bcPtr - lastAtomStart), 0, 3); // branch2: back to atom
          } else {
            Porffor.wasm.i32.store16(bcPtr, -(bcPtr - lastAtomStart), 0, 1); // branch1: back to atom
            Porffor.wasm.i32.store16(bcPtr, 5, 0, 3); // branch2: continue (done)
          }
          bcPtr += 5;
        } else { // ? (zero or one)
          // Move atom forward to make space for fork
          Porffor.wasm.memory.copy(lastAtomStart + 5, lastAtomStart, atomSize, 0, 0);

          // Insert fork at atom start position
          const forkPos: i32 = lastAtomStart;
          Porffor.wasm.i32.store8(forkPos, 0x21, 0, 0); // fork
          if (lazy) {
            Porffor.wasm.i32.store16(forkPos, atomSize + 5, 0, 1); // branch1: skip atom
            Porffor.wasm.i32.store16(forkPos, 5, 0, 3); // branch2: execute atom
          } else {
            Porffor.wasm.i32.store16(forkPos, 5, 0, 1); // branch1: execute atom
            Porffor.wasm.i32.store16(forkPos, atomSize + 5, 0, 3); // branch2: skip atom
          }

          // Update bcPtr to point after the moved atom
          bcPtr = lastAtomStart + 5 + atomSize;
        }
        lastWasAtom = false;
        continue;
      }

      if (char == 123) { // {n,m}
        if (!lastWasAtom) throw new SyntaxError('Regex parser: quantifier without atom');

        // parse n
        let n: i32 = 0;
        let m: i32 = -1;
        let sawComma: boolean = false;
        let sawDigit: boolean = false;
        while (patternPtr < patternEndPtr) {
          const d: i32 = Porffor.wasm.i32.load8_u(patternPtr, 0, 4);
          if (Porffor.fastAnd(d >= 48, d <= 57)) { // digit
            n = n * 10 + (d - 48);
            sawDigit = true;
            patternPtr++;
            continue;
          }

          if (d == 44) { // ','
            sawComma = true;
            patternPtr++;
            break;
          }

          if (d == 125) { // '}'
            patternPtr++;
            break;
          }

          throw new SyntaxError('Regex parse: invalid {n,m} quantifier');
        }

        if (!sawDigit) throw new SyntaxError('Regex parse: invalid {n,m} quantifier');
        if (patternPtr > patternEndPtr) throw new SyntaxError('Regex parse: unterminated {n,m} quantifier');

        if (sawComma) {
          // parse m (or none)
          let mVal: i32 = 0;
          let sawMDigit: boolean = false;
          while (patternPtr < patternEndPtr) {
            const d: i32 = Porffor.wasm.i32.load8_u(patternPtr, 0, 4);
            if (Porffor.fastAnd(d >= 48, d <= 57)) {
              mVal = mVal * 10 + (d - 48);
              sawMDigit = true;
              patternPtr++;
              continue;
            }

            if (d == 125) {
              patternPtr++;
              break;
            }

            throw new SyntaxError('Regex parse: invalid {n,m} quantifier');
          }

          if (sawMDigit) {
            m = mVal;
            if (m < n) throw new SyntaxError('Regex parse: {n,m} with m < n');
          } else {
            m = -1; // open
          }
        } else {
          m = n;
        }

        // check for lazy
        let lazyBrace: boolean = false;
        if (patternPtr < patternEndPtr && Porffor.wasm.i32.load8_u(patternPtr, 0, 4) == 63) { // '?'
          lazyBrace = true;
          patternPtr++;
        }

        // emit n times
        const atomSize: i32 = bcPtr - lastAtomStart;
        for (let i: i32 = 1; i < n; i++) {
          for (let j: i32 = 0; j < atomSize; ++j) {
            Porffor.wasm.i32.store8(bcPtr + j, Porffor.wasm.i32.load8_u(lastAtomStart + j, 0, 0), 0, 0);
          }
          bcPtr += atomSize;
        }

        if (m == n) {
          // exactly n
        } else if (m == -1) {
          // {n,} - infinite (like * after n mandatory matches)
          Porffor.wasm.i32.store8(bcPtr, 0x21, 0, 0); // fork
          if (lazyBrace) {
            Porffor.wasm.i32.store16(bcPtr, 5, 0, 1); // branch1: continue (done)
            Porffor.wasm.i32.store16(bcPtr, -(bcPtr - lastAtomStart), 0, 3); // branch2: back to atom
          } else {
            Porffor.wasm.i32.store16(bcPtr, -(bcPtr - lastAtomStart), 0, 1); // branch1: back to atom
            Porffor.wasm.i32.store16(bcPtr, 5, 0, 3); // branch2: continue (done)
          }
          bcPtr += 5;
        } else {
          // {n,m} - exactly between n and m matches
          // Create chain of forks, each executing atom inline
          for (let i: i32 = n; i < m; i++) {
            Porffor.wasm.i32.store8(bcPtr, 0x21, 0, 0); // fork
            if (lazyBrace) {
              Porffor.wasm.i32.store16(bcPtr, 5 + atomSize, 0, 1); // branch1: skip this match
              Porffor.wasm.i32.store16(bcPtr, 5, 0, 3); // branch2: execute atom
            } else {
              Porffor.wasm.i32.store16(bcPtr, 5, 0, 1); // branch1: execute atom
              Porffor.wasm.i32.store16(bcPtr, 5 + atomSize, 0, 3); // branch2: skip this match
            }
            bcPtr += 5;

            // Copy the atom inline
            for (let j: i32 = 0; j < atomSize; j++) {
              Porffor.wasm.i32.store8(bcPtr + j, Porffor.wasm.i32.load8_u(lastAtomStart + j, 0, 0), 0, 0);
            }
            bcPtr += atomSize;
          }
        }

        lastWasAtom = false;
        continue;
      }
    } else {
      // handle escapes outside class OR literal chars if escaped and not special
      // backreference: \1, \2, ...
      if (Porffor.fastAnd(char >= 49, char <= 57)) { // '1'-'9'
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x0a, 0, 0); // back reference
        Porffor.wasm.i32.store8(bcPtr, char - 48, 0, 1);
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }

      if (char == 100) { // \d
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x04, 0, 0); // predefined class
        Porffor.wasm.i32.store8(bcPtr, 1, 0, 1); // digit
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 68) { // \D
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x04, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 2, 0, 1); // non-digit
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }

      if (char == 115) { // \s
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x04, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 3, 0, 1); // space
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 83) { // \S
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x04, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 4, 0, 1); // non-space
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }

      if (char == 119) { // \w
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x04, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 5, 0, 1); // word
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 87) { // \W
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x04, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 6, 0, 1); // non-word
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }

      if (char == 98) { // \b
        Porffor.wasm.i32.store8(bcPtr, 0x07, 0, 0); // word boundary
        bcPtr += 1;
        lastWasAtom = false;
        continue;
      }
      if (char == 66) { // \B
        Porffor.wasm.i32.store8(bcPtr, 0x08, 0, 0); // non-word boundary
        bcPtr += 1;
        lastWasAtom = false;
        continue;
      }

      if (char == 110) { // \n
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0); // single
        Porffor.wasm.i32.store8(bcPtr, 10, 0, 1);
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 114) { // \r
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 13, 0, 1);
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 116) { // \t
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 9, 0, 1);
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 118) { // \v
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 11, 0, 1);
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 102) { // \f
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 12, 0, 1);
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
      if (char == 48) { // \0
        lastAtomStart = bcPtr;
        Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0);
        Porffor.wasm.i32.store8(bcPtr, 0, 0, 1);
        bcPtr += 2;
        lastWasAtom = true;
        continue;
      }
    }

    // default: emit single char (either a literal, or an escape that resolves to a literal)
    lastAtomStart = bcPtr;
    Porffor.wasm.i32.store8(bcPtr, 0x01, 0, 0);
    Porffor.wasm.i32.store8(bcPtr, char, 0, 1);
    bcPtr += 2;
    lastWasAtom = true;
  }

  if (groupDepth != 0) throw new SyntaxError('Regex parse: Unmatched (');
  if (inClass) throw new SyntaxError('Regex parse: Unmatched [');

  let thisAltDepth: i32 = altDepth[groupDepth];
  while (thisAltDepth-- > 0) {
    const jumpPtr: i32 = altStack.pop();
    Porffor.wasm.i32.store16(jumpPtr, bcPtr - jumpPtr, 0, 1);
  }
  altDepth[groupDepth] = 0;

  // Accept
  Porffor.wasm.i32.store8(bcPtr, 0x10, 0, 0);

  // Store capture count
  Porffor.wasm.i32.store16(ptr, captureIndex - 1, 0, 6);

  return ptr as RegExp;
};


export const __Porffor_regex_interpret = (regexp: RegExp, input: i32, isTest: boolean): any => {
  const bcBase: i32 = regexp + 10;
  const flags: i32 = Porffor.wasm.i32.load16_u(regexp, 0, 4);
  const totalCaptures: i32 = Porffor.wasm.i32.load16_u(regexp, 0, 6);

  const ignoreCase: boolean = (flags & 0b00000010) != 0;
  const multiline: boolean = (flags & 0b00000100) != 0;
  const dotAll: boolean = (flags & 0b00001000) != 0;
  const global: boolean = (flags & 0b00000001) != 0;
  const sticky: boolean = (flags & 0b00100000) != 0;

  const inputLen: i32 = Porffor.wasm.i32.load(input, 0, 0);
  let searchStart: i32 = 0;
  if (global || sticky) {
    searchStart = Porffor.wasm.i32.load(regexp, 0, 8);
  }

  if (searchStart > inputLen) {
    if (global || sticky) Porffor.wasm.i32.store(regexp, 0, 0, 8);
    return null;
  }

  // todo: free all at the end (or statically allocate but = [] causes memory corruption)
  const backtrackStack: i32[] = Porffor.allocate();
  const captures: i32[] = Porffor.allocateBytes(6144);

  for (let i: i32 = searchStart; i <= inputLen; i++) {
    if (sticky && i != searchStart) {
      if (isTest) return false;
      return null;
    }

    backtrackStack.length = 0;
    captures.length = 0;

    let pc: i32 = bcBase;
    let sp: i32 = i;

    let matched: boolean = false;
    let finalSp: i32 = -1;

    while (true) {
      const op: i32 = Porffor.wasm.i32.load8_u(pc, 0, 0);
      if (op == 0x10) { // accept
        matched = true;
        finalSp = sp;
        break;
      }

      let backtrack: boolean = false;

      if (op == 0x01) { // single
        if (sp >= inputLen) {
          // Porffor.log(`single: oob`);
          backtrack = true;
        } else {
          let c1: i32 = Porffor.wasm.i32.load8_u(pc, 0, 1);
          let c2: i32 = Porffor.wasm.i32.load8_u(input + sp, 0, 4);
          if (ignoreCase) {
            if (c1 >= 97 && c1 <= 122) c1 -= 32;
            if (c2 >= 97 && c2 <= 122) c2 -= 32;
          }
          if (c1 == c2) {
            // Porffor.log(`single: matched ${c1}`);
            pc += 2;
            sp += 1;
          } else {
            // Porffor.log(`single: failed, expected ${c1}, got ${c2}`);
            backtrack = true;
          }
        }
      } else if (op == 0x02 || op == 0x03) { // class or negated class
        if (sp >= inputLen) {
          backtrack = true;
        } else {
          let char: i32 = Porffor.wasm.i32.load8_u(input + sp, 0, 4);
          let classPc: i32 = pc + 1;
          let charInClass: boolean = false;
          while (true) {
            const marker: i32 = Porffor.wasm.i32.load8_u(classPc, 0, 0);
            if (marker == 0xFF) break; // end of class

            if (marker == 0x00) { // range
              let from: i32 = Porffor.wasm.i32.load8_u(classPc, 0, 1);
              let to: i32 = Porffor.wasm.i32.load8_u(classPc, 0, 2);
              let cCheck: i32 = char;
              if (ignoreCase) {
                if (from >= 97 && from <= 122) from -= 32;
                if (to >= 97 && to <= 122) to -= 32;
                if (cCheck >= 97 && cCheck <= 122) cCheck -= 32;
              }
              if (cCheck >= from && cCheck <= to) {
                charInClass = true;
                break;
              }
              classPc += 3;
            } else if (marker == 0x01) { // char
              let c1: i32 = Porffor.wasm.i32.load8_u(classPc, 0, 1);
              let c2: i32 = char;
              if (ignoreCase) {
                if (c1 >= 97 && c1 <= 122) c1 -= 32;
                if (c2 >= 97 && c2 <= 122) c2 -= 32;
              }
              if (c1 == c2) {
                charInClass = true;
                break;
              }
              classPc += 2;
            } else if (marker == 0x02) { // predefined
              const classId: i32 = Porffor.wasm.i32.load8_u(classPc, 0, 1);
              let isMatch: boolean = false;
              if (classId == 1) isMatch = char >= 48 && char <= 57;
              else if (classId == 2) isMatch = !(char >= 48 && char <= 57);
              else if (classId == 3) isMatch = Porffor.fastOr(char == 32, char == 9, char == 10, char == 13, char == 11, char == 12);
              else if (classId == 4) isMatch = !Porffor.fastOr(char == 32, char == 9, char == 10, char == 13, char == 11, char == 12);
              else if (classId == 5) isMatch = (char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 48 && char <= 57) || char == 95;
              else if (classId == 6) isMatch = !((char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 48 && char <= 57) || char == 95);

              if (isMatch) {
                charInClass = true;
                break;
              }
              classPc += 2;
            }
          }

          if (op == 0x03) charInClass = !charInClass;

          if (charInClass) {
            while (Porffor.wasm.i32.load8_u(classPc, 0, 0) != 0xFF) {
              const marker: i32 = Porffor.wasm.i32.load8_u(classPc, 0, 0);
              if (marker == 0x00) classPc += 3;
              else if (marker == 0x01) classPc += 2;
              else if (marker == 0x02) classPc += 2;
            }
            pc = classPc + 1;
            sp += 1;
          } else {
            backtrack = true;
          }
        }
      } else if (op == 0x04) { // predefined class
        if (sp >= inputLen) {
          backtrack = true;
        } else {
          const classId: i32 = Porffor.wasm.i32.load8_u(pc, 0, 1);
          const char: i32 = Porffor.wasm.i32.load8_u(input + 4 + sp, 0, 0);
          let isMatch: boolean = false;
          if (classId == 1) isMatch = char >= 48 && char <= 57;
          else if (classId == 2) isMatch = !(char >= 48 && char <= 57);
          else if (classId == 3) isMatch = Porffor.fastOr(char == 32, char == 9, char == 10, char == 13, char == 11, char == 12);
          else if (classId == 4) isMatch = !Porffor.fastOr(char == 32, char == 9, char == 10, char == 13, char == 11, char == 12);
          else if (classId == 5) isMatch = (char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 48 && char <= 57) || char == 95;
          else if (classId == 6) isMatch = !((char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 48 && char <= 57) || char == 95);

          if (isMatch) {
            pc += 2;
            sp += 1;
          } else {
            backtrack = true;
          }
        }
      } else if (op == 0x05) { // start
        if (sp == 0 || (multiline && sp > 0 && Porffor.wasm.i32.load8_u(input + sp, 0, 3) == 10)) {
          pc += 1;
        } else {
          backtrack = true;
        }
      } else if (op == 0x06) { // end
        if (sp == inputLen || (multiline && sp < inputLen && Porffor.wasm.i32.load8_u(input + sp, 0, 4) == 10)) {
          pc += 1;
        } else {
          backtrack = true;
        }
      } else if (op == 0x07) { // word boundary
        const prevIsWord = sp > 0 && ((Porffor.wasm.i32.load8_u(input + sp, 0, 3) >= 65 && Porffor.wasm.i32.load8_u(input + sp, 0, 3) <= 90) || (Porffor.wasm.i32.load8_u(input + sp, 0, 3) >= 97 && Porffor.wasm.i32.load8_u(input + sp, 0, 3) <= 122) || (Porffor.wasm.i32.load8_u(input + sp, 0, 3) >= 48 && Porffor.wasm.i32.load8_u(input + sp, 0, 3) <= 57) || Porffor.wasm.i32.load8_u(input + sp, 0, 3) == 95);
        const nextIsWord = sp < inputLen && ((Porffor.wasm.i32.load8_u(input + sp, 0, 4) >= 65 && Porffor.wasm.i32.load8_u(input + sp, 0, 4) <= 90) || (Porffor.wasm.i32.load8_u(input + sp, 0, 4) >= 97 && Porffor.wasm.i32.load8_u(input + sp, 0, 4) <= 122) || (Porffor.wasm.i32.load8_u(input + sp, 0, 4) >= 48 && Porffor.wasm.i32.load8_u(input + sp, 0, 4) <= 57) || Porffor.wasm.i32.load8_u(input + sp, 0, 4) == 95);
        if (prevIsWord != nextIsWord) {
          pc += 1;
        } else {
          backtrack = true;
        }
      } else if (op == 0x08) { // non-word boundary
        const prevIsWord = sp > 0 && ((Porffor.wasm.i32.load8_u(input + sp, 0, 3) >= 65 && Porffor.wasm.i32.load8_u(input + sp, 0, 3) <= 90) || (Porffor.wasm.i32.load8_u(input + sp, 0, 3) >= 97 && Porffor.wasm.i32.load8_u(input + sp, 0, 3) <= 122) || (Porffor.wasm.i32.load8_u(input + sp, 0, 3) >= 48 && Porffor.wasm.i32.load8_u(input + sp, 0, 3) <= 57) || Porffor.wasm.i32.load8_u(input + sp, 0, 3) == 95);
        const nextIsWord = sp < inputLen && ((Porffor.wasm.i32.load8_u(input + sp, 0, 4) >= 65 && Porffor.wasm.i32.load8_u(input + sp, 0, 4) <= 90) || (Porffor.wasm.i32.load8_u(input + sp, 0, 4) >= 97 && Porffor.wasm.i32.load8_u(input + sp, 0, 4) <= 122) || (Porffor.wasm.i32.load8_u(input + sp, 0, 4) >= 48 && Porffor.wasm.i32.load8_u(input + sp, 0, 4) <= 57) || Porffor.wasm.i32.load8_u(input + sp, 0, 4) == 95);
        if (prevIsWord == nextIsWord) {
          pc += 1;
        } else {
          backtrack = true;
        }
      } else if (op == 0x09) { // dot
        if (sp >= inputLen || (!dotAll && Porffor.wasm.i32.load8_u(input + sp, 0, 4) == 10)) {
          backtrack = true;
        } else {
          pc += 1;
          sp += 1;
        }
      } else if (op == 0x0a) { // back reference
        const capIndex = Porffor.wasm.i32.load8_u(pc, 0, 1);
        const arrIndex = (capIndex - 1) * 2;
        if (arrIndex + 1 >= captures.length) { // reference to group that hasn't been seen
          pc += 2;
        } else {
          const capStart = captures[arrIndex];
          const capEnd = captures[arrIndex + 1];
          if (capStart == -1 || capEnd == -1) { // reference to unmatched group
            pc += 2;
          } else {
            const capLen = capEnd - capStart;
            if (sp + capLen > inputLen) {
              backtrack = true;
            } else {
              let matches = true;
              for (let k = 0; k < capLen; k++) {
                let c1 = Porffor.wasm.i32.load8_u(input + capStart + k, 0, 4);
                let c2 = Porffor.wasm.i32.load8_u(input + sp + k, 0, 4);
                if (ignoreCase) {
                  if (c1 >= 97 && c1 <= 122) c1 -= 32;
                  if (c2 >= 97 && c2 <= 122) c2 -= 32;
                }
                if (c1 != c2) {
                  matches = false;
                  break;
                }
              }
              if (matches) {
                sp += capLen;
                pc += 2;
              } else {
                backtrack = true;
              }
            }
          }
        }
      } else if (op == 0x20) { // jump
        pc += Porffor.wasm.i32.load16_s(pc, 0, 1);
      } else if (op == 0x21) { // fork
        const branch1Offset = Porffor.wasm.i32.load16_s(pc, 0, 1);
        const branch2Offset = Porffor.wasm.i32.load16_s(pc, 0, 3);

        Porffor.array.fastPushI32(backtrackStack, pc + branch2Offset);
        Porffor.array.fastPushI32(backtrackStack, sp);
        Porffor.array.fastPushI32(backtrackStack, captures.length);

        pc += branch1Offset;
      } else if (op == 0x30) { // start capture
        const capIndex = Porffor.wasm.i32.load8_u(pc, 0, 1);
        const arrIndex = capIndex + 255; // + 255 offset for temp start, as it could never end properly
        captures[arrIndex] = sp;
        // Porffor.log(`startCapture: captures[${arrIndex}] = ${sp} | captures.length = ${captures.length}`);
        pc += 2;
      } else if (op == 0x31) { // end capture
        const capIndex = Porffor.wasm.i32.load8_u(pc, 0, 1);
        const arrIndex = (capIndex - 1) * 2 + 1;
        while (captures.length <= arrIndex) Porffor.array.fastPushI32(captures, -1);
        captures[arrIndex - 1] = captures[capIndex + 255];
        captures[arrIndex] = sp;
        // Porffor.log(`endCapture: captures[${arrIndex}] = ${sp} | captures.length = ${captures.length}`);
        pc += 2;
      } else { // unknown op
        backtrack = true;
      }

      if (backtrack) {
        if (backtrackStack.length == 0) break;
        // Porffor.log(`backtrack! before: captures.length = ${captures.length}, sp = ${sp}, pc = ${pc}`);
        captures.length = backtrackStack.pop();
        sp = backtrackStack.pop();
        pc = backtrackStack.pop();
        // Porffor.log(`backtrack! after: captures.length = ${captures.length}, sp = ${sp}, pc = ${pc}`);
      }
    }

    if (matched) {
      if (isTest) return true;

      const matchStart: i32 = i;
      if (global || sticky) {
        Porffor.wasm.i32.store(regexp, finalSp, 0, 8);
      }

      const result: any[] = Porffor.allocateBytes(4096);
      Porffor.array.fastPush(result, __ByteString_prototype_substring(input, matchStart, finalSp));

      for (let k = 0; k < totalCaptures; k++) {
        const arrIdx = k * 2;
        if (arrIdx + 1 < captures.length) {
          const capStart = captures[arrIdx];
          const capEnd = captures[arrIdx + 1];
          if (capStart != -1 && capEnd != -1) {
            Porffor.array.fastPush(result, __ByteString_prototype_substring(input, capStart, capEnd));
          } else {
            Porffor.array.fastPush(result, undefined);
          }
        } else {
          Porffor.array.fastPush(result, undefined);
        }
      }

      result.index = matchStart;
      result.input = input as bytestring;

      return result;
    }
  }

  if (global || sticky) {
    Porffor.wasm.i32.store(regexp, 0, 0, 8);
  }

  if (isTest) return false;
  return null;
};


export const __RegExp_prototype_source$get = (_this: RegExp) => {
  return Porffor.wasm.i32.load(_this, 0, 0) as bytestring;
};

// 22.2.6.4 get RegExp.prototype.flags
// https://tc39.es/ecma262/multipage/text-processing.html#sec-get-regexp.prototype.flags
export const __RegExp_prototype_flags$get = (_this: RegExp) => {
  // 1. Let R be the this value.
  // 2. If R is not an Object, throw a TypeError exception.
  if (!Porffor.object.isObject(_this)) throw new TypeError('this is a non-object');

  // 3. Let codeUnits be a new empty List.
  const flags: i32 = Porffor.wasm.i32.load16_u(_this, 0, 4);
  const result: bytestring = Porffor.allocateBytes(16);

  // 4. Let hasIndices be ToBoolean(? Get(R, "hasIndices")).
  // 5. If hasIndices is true, append the code unit 0x0064 (LATIN SMALL LETTER D) to codeUnits.
  if (flags & 0b01000000) Porffor.bytestring.appendChar(result, 0x64);
  // 6. Let global be ToBoolean(? Get(R, "global")).
  // 7. If global is true, append the code unit 0x0067 (LATIN SMALL LETTER G) to codeUnits.
  if (flags & 0b00000001) Porffor.bytestring.appendChar(result, 0x67);
  // 8. Let ignoreCase be ToBoolean(? Get(R, "ignoreCase")).
  // 9. If ignoreCase is true, append the code unit 0x0069 (LATIN SMALL LETTER I) to codeUnits.
  if (flags & 0b00000010) Porffor.bytestring.appendChar(result, 0x69);
  // 10. Let multiline be ToBoolean(? Get(R, "multiline")).
  // 11. If multiline is true, append the code unit 0x006D (LATIN SMALL LETTER M) to codeUnits.
  if (flags & 0b00000100) Porffor.bytestring.appendChar(result, 0x6d);
  // 12. Let dotAll be ToBoolean(? Get(R, "dotAll")).
  // 13. If dotAll is true, append the code unit 0x0073 (LATIN SMALL LETTER S) to codeUnits.
  if (flags & 0b00001000) Porffor.bytestring.appendChar(result, 0x73);
  // 14. Let unicode be ToBoolean(? Get(R, "unicode")).
  // 15. If unicode is true, append the code unit 0x0075 (LATIN SMALL LETTER U) to codeUnits.
  if (flags & 0b00010000) Porffor.bytestring.appendChar(result, 0x75);
  // 16. Let unicodeSets be ToBoolean(? Get(R, "unicodeSets")).
  // 17. If unicodeSets is true, append the code unit 0x0076 (LATIN SMALL LETTER V) to codeUnits.
  if (flags & 0b10000000) Porffor.bytestring.appendChar(result, 0x76);
  // 18. Let sticky be ToBoolean(? Get(R, "sticky")).
  // 19. If sticky is true, append the code unit 0x0079 (LATIN SMALL LETTER Y) to codeUnits.
  if (flags & 0b00100000) Porffor.bytestring.appendChar(result, 0x79);

  // 20. Return the String value whose code units are the elements of the List codeUnits.
  //     If codeUnits has no elements, the empty String is returned.
  return result;
};

export const __RegExp_prototype_global$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b00000001) as boolean;
};

export const __RegExp_prototype_ignoreCase$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b00000010) as boolean;
};

export const __RegExp_prototype_multiline$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b00000100) as boolean;
};

export const __RegExp_prototype_dotAll$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b00001000) as boolean;
};

export const __RegExp_prototype_unicode$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b00010000) as boolean;
};

export const __RegExp_prototype_sticky$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b00100000) as boolean;
};

export const __RegExp_prototype_hasIndices$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b01000000) as boolean;
};

export const __RegExp_prototype_unicodeSets$get = (_this: RegExp) => {
  return (Porffor.wasm.i32.load16_u(_this, 0, 4) & 0b10000000) as boolean;
};

export const __RegExp_prototype_toString = (_this: RegExp) => {
  return '/' + _this.source + '/' + _this.flags;
};


export const RegExp = function (pattern: any, flags: any = undefined): RegExp {
  let patternSrc, flagsSrc;
  if (Porffor.type(pattern) === Porffor.TYPES.regexp) {
    patternSrc = __RegExp_prototype_source$get(pattern);
    if (flags === undefined) {
      flagsSrc = __RegExp_prototype_flags$get(pattern);
    } else {
      flagsSrc = flags;
    }
  } else {
    patternSrc = pattern;
    flagsSrc = flags;
  }

  if (patternSrc === undefined) patternSrc = '';
  if (flagsSrc === undefined) flagsSrc = '';

  if (Porffor.type(patternSrc) !== Porffor.TYPES.bytestring || Porffor.type(flagsSrc) !== Porffor.TYPES.bytestring) {
    throw new TypeError('Invalid regular expression');
  }

  return __Porffor_regex_compile(patternSrc, flagsSrc);
};


export const __RegExp_prototype_exec = (_this: RegExp, input: bytestring) => {
  return __Porffor_regex_interpret(_this, input, false);
};

export const __RegExp_prototype_test = (_this: RegExp, input: bytestring) => {
  return __Porffor_regex_interpret(_this, input, true);
};

export const __String_prototype_match = (_this: string, regexp: RegExp) => {
  if (Porffor.type(regexp) !== Porffor.TYPES.regexp) {
    regexp = new RegExp(regexp);
  }

  return regexp.exec(_this);
};

export const __ByteString_prototype_match = (_this: bytestring, regexp: RegExp) => {
  if (Porffor.type(regexp) !== Porffor.TYPES.regexp) {
    regexp = new RegExp(regexp);
  }

  return regexp.exec(_this);
};