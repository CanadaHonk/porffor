import { Opcodes } from "./wasmSpec.js";

export default wasm => {
  for (let i = 0; i < wasm.length; i++) {
    if (i > 2) {
      if (wasm[i] === wasm[i - 2]) {
        if (wasm[i - 1] === Opcodes.local_get && wasm[i - 3] === Opcodes.local_set) {
          // local.set 0
          // local.get 0
          // -->
          // local.tee 0

          wasm[i - 3] = Opcodes.local_tee;
          wasm.splice(i - 1, 2);
          wasm[0] -= 2;
        }
      }

      if (wasm[i] === Opcodes.end && wasm[i - 1] === Opcodes.return) {
        // return
        // end
        // -->
        // end

        wasm.splice(i - 1, 1);
        wasm[0]--;
      }
    }
  }

  return wasm;
};