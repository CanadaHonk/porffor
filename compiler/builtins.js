import { Opcodes } from "./wasmSpec.js";
import { signedLEB128 } from "./encoding.js";

// import parse from "./parse.js";

export const importedFuncs = { print: 0, printChar: 1 };

const number = n => [ [ Opcodes.const, ...signedLEB128(n) ] ];
const char = c => number(c.charCodeAt(0));

export const makeBuiltins = () => ({
  '__console_log': { // `function __console_log(x) { print(x); printChar('\\n'); }`
    params: [ 'x' ],
    locals: 1,
    return: false,
    wasm: [
      [ Opcodes.local_get, 0 ],
      [ Opcodes.call, importedFuncs.print ],
      ...char('\n'),
      [ Opcodes.call, importedFuncs.printChar ]
    ]
  }
});

/* for (const x in builtins) {
  if (x.wasm) continue;
  // builtins[x] = parse(x, []);
} */