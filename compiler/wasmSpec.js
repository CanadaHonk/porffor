const enumify = (...args) => {
  const obj = {};

  for (let i = 0; i < args.length; i++) {
    obj[i] = args[i];
    obj[args[i]] = i;
  }

  return obj;
};

export const Section = enumify('custom', 'type', 'import', 'func', 'table', 'memory', 'global', 'export', 'start', 'element', 'code', 'data', 'data_count', 'tag');
export const ExportDesc = enumify('func', 'table', 'mem', 'global', 'tag');

export const Mut = enumify('const', 'var');

export const Valtype = {
  i32: 0x7f,
  i64: 0x7e,
  f64: 0x7c,
  v128: 0x7b
};

export const Reftype = {
  funcref: 0x70,
  externref: 0x6f
};

export const Blocktype = {
  void: 0x40,
};

export const Opcodes = {
  unreachable: 0x00,
  nop: 0x01,

  block: 0x02,
  loop: 0x03,
  if: 0x04,
  else: 0x05,

  try: 0x06,
  catch: 0x07,
  catch_all: 0x19,
  delegate: 0x18,
  throw: 0x08,
  rethrow: 0x09,

  end: 0x0b,
  br: 0x0c,
  br_if: 0x0d,
  br_table: 0x0e,
  return: 0x0f,

  call: 0x10,
  call_indirect: 0x11,
  return_call: 0x12,
  return_call_indirect: 0x13,

  drop: 0x1a,
  select: 0x1b,

  local_get: 0x20,
  local_set: 0x21,
  local_tee: 0x22, // set and return value (set and get combined)

  global_get: 0x23,
  global_set: 0x24,

  i32_load: 0x28,
  i64_load: 0x29,
  f32_load: 0x2a,
  f64_load: 0x2b,

  i32_load8_s: 0x2c,
  i32_load8_u: 0x2d,
  i32_load16_s: 0x2e,
  i32_load16_u: 0x2f,

  i64_load8_s: 0x30,
  i64_load8_u: 0x31,
  i64_load16_s: 0x32,
  i64_load16_u: 0x33,
  i64_load32_s: 0x34,
  i64_load32_u: 0x35,

  i32_store: 0x36,
  i64_store: 0x37,
  f32_store: 0x38,
  f64_store: 0x39,

  i32_store8: 0x3a,
  i32_store16: 0x3b,

  i64_store8: 0x3c,
  i64_store16: 0x3d,

  memory_size: 0x3f,
  memory_grow: 0x40,

  i32_const: 0x41,
  i64_const: 0x42,
  f64_const: 0x44,

  i32_eqz: 0x45,
  i32_eq: 0x46,
  i32_ne: 0x47,

  i32_lt_s: 0x48,
  i32_lt_u: 0x49,
  i32_le_s: 0x4c,
  i32_le_u: 0x4d,
  i32_gt_s: 0x4a,
  i32_gt_u: 0x4b,
  i32_ge_s: 0x4e,
  i32_ge_u: 0x4f,

  i32_clz: 0x67,
  i32_ctz: 0x68,
  i32_popcnt: 0x69,

  i32_add: 0x6a,
  i32_sub: 0x6b,
  i32_mul: 0x6c,
  i32_div_s: 0x6d,
  i32_div_u: 0x6e,
  i32_rem_s: 0x6f,
  i32_rem_u: 0x70,

  i32_and: 0x71,
  i32_or: 0x72,
  i32_xor: 0x73,
  i32_shl: 0x74,
  i32_shr_s: 0x75,
  i32_shr_u: 0x76,
  i32_rotl: 0x77,
  i32_rotr: 0x78,

  i64_eqz: 0x50,
  i64_eq: 0x51,
  i64_ne: 0x52,

  i64_lt_s: 0x53,
  i64_lt_u: 0x54,
  i64_le_s: 0x57,
  i64_le_u: 0x58,
  i64_gt_s: 0x55,
  i64_gt_u: 0x56,
  i64_ge_s: 0x59,
  i64_ge_u: 0x5a,

  i64_add: 0x7c,
  i64_sub: 0x7d,
  i64_mul: 0x7e,
  i64_div_s: 0x7f,
  i64_div_u: 0x80,
  i64_rem_s: 0x81,
  i64_rem_u: 0x82,

  i64_and: 0x83,
  i64_or: 0x84,
  i64_xor: 0x85,
  i64_shl: 0x86,
  i64_shr_s: 0x87,
  i64_shr_u: 0x88,
  i64_rotl: 0x89,
  i64_rotr: 0x8a,

  f32_eq: 0x5b,
  f32_ne: 0x5c,

  f32_lt: 0x5d,
  f32_le: 0x5f,
  f32_gt: 0x5e,
  f32_ge: 0x60,

  f32_abs: 0x8b,
  f32_neg: 0x8c,

  f32_ceil: 0x8d,
  f32_floor: 0x8e,
  f32_trunc: 0x8f,
  f32_nearest: 0x90,

  f32_sqrt: 0x91,
  f32_add: 0x92,
  f32_sub: 0x93,
  f32_mul: 0x94,
  f32_div: 0x95,
  f32_min: 0x96,
  f32_max: 0x97,
  f32_copysign: 0x98,

  f64_eq: 0x61,
  f64_ne: 0x62,

  f64_lt: 0x63,
  f64_le: 0x65,
  f64_gt: 0x64,
  f64_ge: 0x66,

  f64_abs: 0x99,
  f64_neg: 0x9a,

  f64_ceil: 0x9b,
  f64_floor: 0x9c,
  f64_trunc: 0x9d,
  f64_nearest: 0x9e,

  f64_sqrt: 0x9f,
  f64_add: 0xa0,
  f64_sub: 0xa1,
  f64_mul: 0xa2,
  f64_div: 0xa3,
  f64_min: 0xa4,
  f64_max: 0xa5,
  f64_copysign: 0xa6,

  i32_wrap_i64: 0xa7,
  i64_extend_i32_s: 0xac,
  i64_extend_i32_u: 0xad,

  f32_convert_i32_s: 0xb2,
  f32_convert_i32_u: 0xb3,
  f32_convert_i64_s: 0xb4,
  f32_convert_i64_u: 0xb5,
  f32_demote_f64: 0xb6,

  f64_convert_i32_s: 0xb7,
  f64_convert_i32_u: 0xb8,
  f64_convert_i64_s: 0xb9,
  f64_convert_i64_u: 0xba,
  f64_promote_f32: 0xbb,

  i32_reinterpret_f32: 0xbc,
  i64_reinterpret_f64: 0xbd,
  f32_reinterpret_i32: 0xbe,
  f64_reinterpret_i64: 0xbf,

  i32_extend8_s: 0xc0,
  i32_extend16_s: 0xc1,
  i64_extend8_s: 0xc2,
  i64_extend16_s: 0xc3,
  i64_extend32_s: 0xc4,

  i32_trunc_sat_f32_s: [ 0xfc, 0x00 ],
  i32_trunc_sat_f32_u: [ 0xfc, 0x01 ],
  i32_trunc_sat_f64_s: [ 0xfc, 0x02 ],
  i32_trunc_sat_f64_u: [ 0xfc, 0x03 ],

  i64_trunc_sat_f32_s: [ 0xfc, 0x04 ],
  i64_trunc_sat_f32_u: [ 0xfc, 0x05 ],
  i64_trunc_sat_f64_s: [ 0xfc, 0x06 ],
  i64_trunc_sat_f64_u: [ 0xfc, 0x07 ],

  memory_init: [ 0xfc, 0x08 ],
  data_drop: [ 0xfc, 0x09 ],
  memory_copy: [ 0xfc, 0x0a ],
  memory_fill: [ 0xfc, 0x0b ],

  // simd insts are 0xFD simdop: varuint32
  v128_load: [ 0xfd, 0x00 ],
  v128_const: [ 0xfd, 0x0c ],

  i8x16_shuffle: [ 0xfd, 0x0d ],

  i32x4_splat: [ 0xfd, 0x11 ],
  i32x4_extract_lane: [ 0xfd, 0x1b ],
  i32x4_replace_lane: [ 0xfd, 0x1c ],

  i16x8_extract_lane_s: [ 0xfd, 0x18 ],
  i16x8_extract_lane_u: [ 0xfd, 0x19 ],
  i16x8_replace_lane: [ 0xfd, 0x1a ],

  i32x4_add: [ 0xfd, 0xae, 0x01 ],
  i32x4_sub: [ 0xfd, 0xb1, 0x01 ],
  i32x4_mul: [ 0xfd, 0xb5, 0x01 ],

  v128_or: [ 0xfd, 80 ],
  v128_xor: [ 0xfd, 81 ],
  v128_any_true: [ 0xfd, 83 ]
};

export const opcodeSignature = (op) => {
  const effect = 1, trap = 2, branch = 4, branchable = 8, scope = 16;

  if (typeof op !== 'number') {
    let op2 = op[1] | 0;
    if (op[0] === 0xfc) {
      if (op2 <= /* Opcodes.i64_trunc_sat_f64_u[1] */ 0x07) {
        return [ 1, 1, 0 ]; // [float] -> [int]
      }
      switch (op2) {
        case /* Opcodes.data_drop[1] */ 0x09:
        case /* Opcodes.elem_drop[1] */ 0x0d:
          return [ 0, 0, effect ]; // [i32 addr] -> [] (effect)
        case /* Opcodes.memory_init[1] */ 0x08:
        case /* Opcodes.memory_copy[1] */ 0x0a:
        case /* Opcodes.table_init[1] */ 0x0c:
        case /* Opcodes.table_copy[1] */ 0x0e:
          return [ 3, 0, effect ]; // [i32 to, i32 from, i32 count] -> [] (effect)
        case /* Opcodes.memory_fill[1] */ 0x0b:
        case /* Opcodes.table_fill[1] */ 0x11:
          return [ 3, 0, effect ]; // [i32 from, i32 count, value] -> [] (effect)
        case /* Opcodes.table_grow[1] */ 0x0f:
          return [ 1, 1, effect ]; // [i32 amount] -> [i32 result] (effect)
        case /* Opcodes.table_size[1] */ 0x10:
          return [ 0, 1, 0 ]; // [] -> [i32 size] (effect)
      }
      // Unknown op
      return undefined;
    }
    if (op[0] == 0xfd) {
      if (op2 < 0x80) {
        if (op2 <= /* Opcodes.f64x2_ge[1] */ 0x4c) {
          if (op2 <= /* Opcodes.v128_load64_splat[1] */ 0x0a) {
            return [ 1, 1, trap ]; // [i32 addr] -> [v128] (trap)
          }
          if (op2 <= /* Opcodes.f64x2_replace_lane[1] */ 0x22) {
            if (op2 <= /* Opcodes.f64x2_splat[1] */ 0x14) {
              switch (op2) {
                case /* Opcodes.v128_store[1] */ 0x0b:
                  return [ 2, 0, effect | trap ]; // [i32 addr, v128] -> [] (effect, trap)
                case /* Opcodes.v128_const[1] */ 0x0c:
                  return [ 0, 1, 0 ]; // [] -> [v128]
                case /* Opcodes.v128_shuffle[1] */ 0x0e:
                  return [ 2, 1, 0 ]; // [v128, v128] -> [v128]
              }
              /* Opcodes.v128_shuffle[1] */
              /* Opcodes.iaxb_splat[1] */
              return [ 1, 1, 0 ]; // [value] -> [v128]
            }
            if (op2 == /* Opcodes.i8x16_replace_lane[1] */ 0x17
              || (op2 >= /* Opcodes.i16x8_replace_lane[1] */ 0x1a && (op2 & 1) == 0)) {
              return [ 2, 1, 0 ]; // [v128, value] -> [v128]
            }
            return [ 1, 1, 0 ]; // [v128] -> [value]
          }
          return [ 2, 1, 0 ]; // [v128, v128] -> [v128]
        }
        return undefined; // TODO
      }
      op2 = (op2 & 0x7F) + (op[2] << 7);
      if (op2 == /* Opcodes.i32x4_add[1] */ 0xae
        || op2 == /* Opcodes.i32x4_sub[1] */ 0xb1
        || op2 == /* Opcodes.i32x4_mul[1] */ 0xb5) {
        return [ 2, 1, 0 ]; // [v128, v128] -> [v128]
      }
      return undefined; // TODO
    } // end 0xfd
    // Unknown op
    return undefined;
  }

  op |= 0;

  // "binary search"
  if (op <= /* Opcodes.f64_const */ 0x44) {
    if (op >= /* Opcodes.i32_const */ 0x41) {
      return [ 0, 1, 0 ]; // [] -> [value]
    }
    if (op >= /* Opcodes.i32_load */ 0x28) {
      if (op <= /* Opcodes.i32_load32_u */ 0x35) {
        return [ 1, 1, trap ]; // [i32 addr] -> [value] (trap)
      }
      if (op <= /* Opcodes.i64_store32 */ 0x3E) {
        return [ 2, 0, effect | trap ]; // [i32 addr, value] -> [] (effect, trap)
      }
      if (op == /* Opcodes.memory_size */ 0x3F) {
        return [ 0, 1, 0 ]; // [] -> [i32 size]
      }
      /* Opcodes.memory_grow */
      return [ 1, 1, effect ]; // [i32 pages] -> [i32 result]
    }
    switch (op) {
      case /* Opcodes.unreachable */ 0x00:
      case /* Opcodes.throw */ 0x08:
      case /* Opcodes.rethrow */ 0x09:
      case /* Opcodes.throw_ref */ 0x0a:
      case /* Opcodes.br */ 0x0c:
      case /* Opcodes.br_table */ 0x0e:
      case /* Opcodes.return */ 0x0f:
      case /* Opcodes.return_call */ 0x12:
      case /* Opcodes.return_call_indirect */ 0x13:
      case /* Opcodes.return_call_ref */ 0x15:
        return null; // [] -> [never] (control flow doesn't continue beyond this point)
      case /* Opcodes.nop */ 0x01:
        return [ 0, 0, 0 ]; // [] -> []
      case /* Opcodes.block */ 0x02:
      case /* Opcodes.try */ 0x06:
      case /* Opcodes.try_table */ 0x1f:
        return [ 0, 0, scope ]; // [] -> [] (opens scope)
      case /* Opcodes.loop */ 0x03:
        return [ 0, 0, branchable | scope ]; // [] -> [] (can branch to, opens scope)
      case /* Opcodes.if */ 0x04:
        return [ 1, 0, branch | scope ]; // [] -> [] (can branch, opens scope)
      case /* Opcodes.else */ 0x05:
      case /* Opcodes.catch */ 0x07:
      case /* Opcodes.delegate */ 0x18:
      case /* Opcodes.catch_all */ 0x19:
        return [ 1, 0, branch | branchable ]; // [] -> [] (can branch, can be branched to)
      case /* Opcodes.end */ 0xb:
      case /* Opcodes.br_if */ 0x0d:
        return [ 1, 0, branch ]; // [i32 cond] -> [] (can branch)
      case /* Opcodes.drop */ 0x1a:
        return [ 1, 0, 0 ]; // [value] -> []
      case /* Opcodes.select */ 0x1b:
        return [ 3, 1, 0 ]; // [whenTrue, whenFalse, condition] -> [value]
      case /* Opcodes.local_get */ 0x20:
      case /* Opcodes.global_get */ 0x23:
        return [ 0, 1, 0 ]; // [] -> [value]
      case /* Opcodes.local_set */ 0x21:
      case /* Opcodes.global_set */ 0x24:
        return [ 1, 0, effect ]; // [value] -> [] (effect)
      case /* Opcodes.local_tee */ 0x22:
        return [ 1, 1, effect ]; // [value] -> [value] (effect)
      case /* Opcodes.table_get */ 0x25:
        return [ 1, 1, trap ]; // [i32 index] -> [ref value] (trap)
      case /* Opcodes.table_set */ 0x25:
        return [ 2, 0, effect | trap ]; // [i32 index, ref value] -> [] (effect, trap)
    }
    // Behavior differs / not describable
    /* Opcodes.call */
    /* Opcodes.call_indirect */
    /* Opcodes.call_ref */
    /* Opcodes.select_typed */
    return undefined;
  }
  if (op <= /* Opcodes.i64_rotr */ 0x8a) {
    if (op == /* Opcodes.i32_eqz */ 0x45 || op == /* Opcodes.i64_eqz */ 0x50
      || (op >= /* Opcodes.i32_clz */ 0x67 && op <= /* Opcodes.i32_popcnt */ 0x69)
      || (op >= /* Opcodes.i64_clz */ 0x79 && op <= /* Opcodes.i64_popcnt */ 0x7b)) {
      return [ 1, 1, 0 ]; // [value] -> [result]
    }
    if ((op >= /* Opcodes.i32_div_s */ 0x6d && op <= /* Opcodes.i32_rem_u */ 0x70)
      || (op >= /* Opcodes.i64_div_s */ 0x7f && op <= /* Opcodes.i64_rem_u */ 0x82)) {
      return [ 2, 1, trap ]; // [value1, value2] -> [result] (trap)
    }
    return [ 2, 1, 0 ]; // [value1, value2] -> [result]
  }
  if (op <= /* Opcodes.f64_copysign */ 0xa6) {
    if (op <= /* Opcodes.f32_sqrt */ 0x91
      || (op >= /* Opcodes.f32_abs */ 0x99 && op <= /* Opcodes.f64_sqrt */ 0x9f)) {
      return [ 1, 1, 0 ]; // [value] -> [result]
    }
    return [ 2, 1, 0 ]; // [value1, value2] -> [result]
  }
  if (op <= /* Opcodes.i64_extend32_s */ 0xc4) {
    if (op <= /* Opcodes.i32_trunc_f64_u */ 0xab
      || (op >= /* Opcodes.i64_trunc_f32_s */ 0xae && op <= /* Opcodes.i64_trunc_f64_u */ 0xb1)) {
      return [ 1, 1, trap ]; // [value] -> [result] (trap)
    }
    return [ 1, 1, 0 ]; // [value] -> [result]
  }
  // unknown op
  return undefined;
};

export const FuncType = 0x60;
export const Empty = 0x00;

export const Magic = [0x00, 0x61, 0x73, 0x6d];
export const ModuleVersion = [0x01, 0x00, 0x00, 0x00];

export const PageSize = 65536; // 64KiB (1024 * 8)

export const ValtypeSize = {
  i32: 4,
  i64: 8,
  f64: 8,

  // special
  i8: 1,
  i16: 2
};