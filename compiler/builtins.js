import { number } from "./embedding.js";
import { Opcodes, Valtype } from "./wasmSpec.js";
// import parse from "./parse.js";

export const importedFuncs = { print: 0, printChar: 1, assert: 2 };

const char = c => number(c.charCodeAt(0));

export const makeBuiltins = () => ({
  __console_log: { // `function __console_log(x) { print(x); printChar('\\n'); }`
    params: [ valtypeBinary ],
    locals: [],
    returns: [],
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