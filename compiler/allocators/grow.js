import { Opcodes, Valtype } from '../wasmSpec.js';
import { number } from '../embedding.js';
import Prefs from '../prefs.js';

export default class GrowAllocator {
  constructor() {
    Prefs.rmUnusedTypes = false;
    Prefs.data = false;
  }

  alloc() {
    return [
      // get current page count
      [ Opcodes.memory_size, 0 ],

      // grow by 1 page
      [ Opcodes.i32_const, 1 ],
      [ Opcodes.memory_grow, 0 ],
      [ Opcodes.drop ],

      // get ptr (page count * page size)
      number(65536, Valtype.i32)[0],
      [ Opcodes.i32_mul ]
    ];
  }
}