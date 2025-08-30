import { Opcodes, Valtype } from './wasmSpec.js';
import { number } from './encoding.js';
import { createImport, importedFuncs, setImports } from './builtins.js';
import assemble from './assemble.js';
import wrap from './wrap.js';
import * as Havoc from './havoc.js';
import './prefs.js';

let activeFunc, localData;
export const setup = () => {
  // enable these prefs by default for pgo
  for (const x of [
    'typeswitchUniqueTmp', // use unique tmps for typeswitches
    // 'cyclone', // enable cyclone pre-evaler
  ]) {
    Prefs[x] = Prefs[x] === false ? false : true;
  }

  createImport('profileLocalSet', [ Valtype.i32, Valtype.i32, Valtype.f64 ], 0, (activeFunc, i, n) => {
    if (activeFunc == null) throw 'fail';
    localData[activeFunc][i].push(n);
  });
};

export const run = obj => {
  const wasmFuncs = obj.funcs;

  let starts = {};
  const time = (id, msg) => {
    if (!Prefs.pgoLog) return;

    if (!starts[id]) {
      process.stdout.write(msg);
      starts[id] = performance.now();
    } else {
      process.stdout.write(`\r${' '.repeat(50)}\r[${(performance.now() - starts[id]).toFixed(2)}ms] ${msg}\n`);
    }
  };

  time(0, `injecting PGO logging...`);

  let abort = false;
  let funcs = [];
  for (let i = 0; i < wasmFuncs.length; i++) {
    const { name, internal, params, locals, wasm } = wasmFuncs[i];
    if (internal) continue; // ignore internal funcs
    wasmFuncs[i].originalWasm = structuredClone(wasm);

    const invLocals = Object.keys(locals).reduce((acc, x) => { acc[locals[x].idx] = locals[x]; return acc; }, {});

    const id = funcs.length;
    funcs.push({ name, id, locals, params, invLocals });

    wasm.unshift(
      // log args
      ...params.flatMap((_, i) => [
        number(id, Valtype.i32),
        number(i, Valtype.i32),
        [ Opcodes.local_get, i ],
        ...(invLocals[i].type !== Valtype.f64 ? [ Opcodes.i32_from ] : []),
        [ Opcodes.call, importedFuncs.profileLocalSet ]
      ])
    );

    for (let j = 0; j < wasm.length; j++) {
      const inst = wasm[j];
      if (inst[0] === Opcodes.local_set || inst[0] === Opcodes.local_tee) {
        wasm.splice(j + 1, 0,
          number(id, Valtype.i32),
          number(inst[1], Valtype.i32),
          [ Opcodes.local_get, inst[1] ],
          ...(invLocals[inst[1]].type !== Valtype.f64 ? [ Opcodes.i32_from ] : []),
          [ Opcodes.call, importedFuncs.profileLocalSet ]
        );
      }
    }
  }

  localData = funcs.map(x => new Array(Object.keys(x.locals).length).fill(0).map(() => []));

  time(0, `injected PGO logging`);
  time(1, `running with PGO logging...`);

  try {
    obj.wasm = assemble(obj.funcs, obj.globals, obj.tags, obj.pages, obj.data, true);

    Prefs._profileCompiler = Prefs.profileCompiler;
    Prefs.profileCompiler = false;

    const priorImports = { ...importedFuncs };
    const { exports } = wrap(obj, undefined, () => {});
    exports.main();

    setImports(priorImports);
  } catch (e) {
    throw e;
  }

  Prefs.profileCompiler = Prefs._profileCompiler;

  for (const x of funcs) {
    const wasmFunc = wasmFuncs.find(y => y.name === x.name);
    wasmFunc.wasm = wasmFunc.originalWasm;
    delete wasmFunc.originalWasm;
  }

  if (abort) {
    console.log('aborting PGO!');
    return false;
  }

  time(1, `ran with PGO logging`);
  time(2, 'processing PGO data...');

  // process data
  let log = '';
  for (let i = 0; i < localData.length; i++) {
    const func = funcs[i];
    const total = localData[i].length;

    const localKeys = Object.keys(func.locals).sort((a, b) => a.idx - b.idx);
    const localValues = Object.values(func.locals).sort((a, b) => a.idx - b.idx);
    func.localKeys = localKeys;
    func.localValues = localValues;

    let counts = new Array(10).fill(0);
    const consistents = localData[i].map((x, j) => {
      if (j < func.params.length) return false; // param
      if (x.length === 0 || !x.every((y, i) => i < 1 ? true : y === x[i - 1])) return false; // not consistent

      counts[0]++;
      return x[0];
    });

    const integerOnlyF64s = localData[i].map((x, j) => {
      if (j < func.params.length) return false; // param
      if (localValues[j].type === Valtype.i32) return false; // already i32
      if (x.length === 0 || !x.every(y => Number.isInteger(y))) return false; // not all integer values

      counts[1]++;
      return true;
    });

    const domains = localData[i].map((x, j) => {
      if (j < func.params.length) return false; // param
      if (consistents[j] !== false) return false; // already consistent
      if (x.length < 2) return false; // <2 samples

      let min = Infinity, max = -Infinity;
      for (const y of x) {
        if (y < min) min = y;
        if (y > max) max = y;
      }

      counts[2]++;
      return [ min, max ];
    });

    func.consistents = consistents;
    func.integerOnlyF64s = integerOnlyF64s;
    func.domains = domains;

    log += `  ${func.name}: identified ${counts[0]}/${total} locals as consistent${Prefs.verbosePgo ? ':' : ''}\n`;
    if (Prefs.verbosePgo) {
      for (let j = func.params.length; j < localData[i].length; j++) {
        log += `    ${consistents[j] !== false ? '\u001b[92m' : '\u001b[91m'}${localKeys[j]}\u001b[0m: ${new Set(localData[i][j]).size} unique values set\n`;
      }
    }

    log += `  ${func.name}: identified ${counts[1]}/${localValues.reduce((acc, x) => acc + (x.type === Valtype.f64 ? 1 : 0), 0)} f64 locals as integer usage only${Prefs.verbosePgo ? ':' : ''}\n`;
    if (Prefs.verbosePgo) {
      for (let j = func.params.length; j < localData[i].length; j++) {
        if (localValues[j].type !== Valtype.f64) continue;
        log += `    ${integerOnlyF64s[j] ? '\u001b[92m' : '\u001b[91m'}${localKeys[j]}\u001b[0m\n`;
      }
    }

    log += `  ${func.name}: identified ${counts[2]}/${total} non-consistent locals domains${Prefs.verbosePgo ? ':' : ''}\n`;
    if (Prefs.verbosePgo) {
      for (let j = func.params.length; j < localData[i].length; j++) {
        if (domains[j] === false) continue;
        log += `    ${domains[j] !== false ? '\u001b[92m' : '\u001b[91m'}${localKeys[j]}\u001b[0m: ${domains[j] !== false ? `${domains[j][0]} ≤ x ≤ ${domains[j][1]}` : ''}\n`;
      }

      log += '\n';
    }
  }

  time(2, 'processed PGO data\n' + log);
  time(3, 'optimizing using PGO data...');

  log = '';
  for (const x of funcs) {
    // skip pgo opt for main()
    if (x.name === '#main') continue;

    const wasmFunc = wasmFuncs.find(y => y.name === x.name);

    let targets = [];
    for (let i = 0; i < x.integerOnlyF64s.length; i++) {
      const c = x.integerOnlyF64s[i];
      if (c === false) continue;

      targets.push(i);
    }

    log += `  ${x.name}: replaced ${targets.length} f64 locals with i32s\n`;
    if (targets.length > 0) Havoc.f64ToI32s(wasmFunc, targets);

    targets = [];
    let consts = [];
    for (let i = 0; i < x.consistents.length; i++) {
      const c = x.consistents[i];
      if (c === false) continue;

      targets.push(i);

      const valtype = x.localValues[i].type;
      consts.push(number(c, valtype));
    }

    // log += `  ${x.name}: replaced ${targets.length} locals with consts\n`;
    // if (targets.length > 0) Havoc.localsToConsts(wasmFunc, targets, consts, { localKeys: x.localKeys });
  }

  time(3, 'optimized using PGO data\n' + log);
};