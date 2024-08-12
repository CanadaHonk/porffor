let commands = [
  [ 'precompile', 34, 'Precompile all Porffor built-ins', {}, true ],
  [ 'run', 34, 'Run a JS file' ],
  [ 'wasm', 34, 'Compile a JS file to a Wasm binary\n', { target: 'wasm' } ],

  [ 'c', 31, 'Compile a JS file to C source code', { target: 'c' } ],
  [ 'native', 31, 'Compile a JS file to a native binary\n', { target: 'native' } ],

  [ 'profile', 33, 'Profile a JS file' ],
  [ 'debug', 33, 'Debug a JS file' ],
  [ 'debug-wasm', 33, 'Debug the compiled Wasm of a JS file', { asur: true, wasmDebug: true } ],
];
let args = [
  { separator: 'General options:' },
  {
    arg: 'help',
    short: 'h',
    description: 'Show this help message',
    help: 1
  },
  {
    arg: 'help-verbose',
    description: 'Show all available options',
    help: 2
  },
  {
    arg: 'version',
    short: 'v',
    description: 'Show the current version',
    target: x => {
      console.log(globalThis.version);
      process?.exit?.(0);
    }
  },
  {
    arg: 'output-file',
    short: 'o',
    paramName: 'file',
    type: 'string',
    description: 'Specify the target of the compilation',
    target: 'outFile'
  },
  {
    arg: 'eval',
    short: 'e',
    paramName: 'source',
    type: 'string',
    description: 'Execute from the given string instead of a file',
    target: 'evalSource'
  },
  {
    arg: 'print',
    short: 'p',
    paramName: 'source',
    type: 'string',
    description: 'Same as --eval but print the result',
    target: x => {
      Options.evalSource = x;
      Options.printOutput = true;
      Options.optUnused ??= false;
    }
  },
  {
    arg: 'valtype',
    type: [ 'i32', 'i64', 'f64' ],
    description: 'Specify the Wasm type used for the JS type number (default: f64)',
    target: 'valtype',
    default: 'f64'
  },
  {
    arg: 'parser',
    paramName: 'parser',
    type: 'string',
    description: 'Parse with the specified parser (supported: acorn, meriyah, hermes-parser, @babel/parser)',
    target: 'parser'
  },
  {
    arg: 'run',
    description: 'Run the code after compiling',
    invDescription: "Don't run the code after compiling",
    target: 'runAfterCompile',
    default: () => ![ 'wasm', 'c', 'native' ].includes(Options.command)
  },
  {
    arg: 'module',
    description: 'Compile as a JavaScript module instead of a script.',
    target: 'module',
    hide: true
  },
  {
    arg: 'target',
    type: [ 'wasm', 'c', 'native' ],
    description: 'Specifies the compilation target (equivalent to commands "wasm", "c" or "native")',
    target: 'compileTarget',
    hide: true
  },
  {
    arg: 'native',
    description: 'Sets the compile target to native (similar to command "native")',
    target: x => {
       Options.native = true;
       Options.compileTarget = 'native';
    },
    hide: true
  },
  {
    arg: 'compiler',
    description: 'Specifies the compiler used to compile to native',
    target: 'compiler'
  },
  {
    arg: '_cO',
    description: 'Specifies the optimization level for the native compiler (e.g. O2)',
    target: '_cO'
  },
  {
    arg: 'parse-types',
    description: 'Enable parsing types',
    target: 'parseTypes'
  },
  { separator: 'Optimization options:' },
  {
    short: 'O0',
    description: "Don't optimize",
    target: x => Options.optLevel = 0
  },
  {
    short: 'O1',
    description: 'Use basic optimizations',
    target: x => Options.optLevel = 1
  },
  {
    short: 'O2',
    description: 'Use advanced optimizations (e.g. inlining). Unstable!',
    target: x => Options.optLevel = 2
  },
  {
    short: 'O3',
    description: 'Use more advanced optimizations (e.g. precompute constant math). Unstable!',
    target: x => Options.optLevel = 3
  },
  {
    arg: 'opt-level',
    paramName: 'level',
    type: 'int',
    description: 'Sets the optimization level (equivalent to -O0 / -O1 / -O2 / -O3)',
    target: 'optLevel',
    default: 1
  },
  {
    arg: 'opt-types',
    description: 'Use types in compilation (requires --parse-types)',
    target: 'optTypes'
  },
  {
    arg: 'pgo',
    description: 'Enable profile guided optimization (PGO)',
    target: 'pgo',
    default: () => !!Options.compileTarget && Options.compileTarget != 'wasm'
  },
  {
    arg: 'cyclone',
    description: 'Enable partial constant evaluator "cyclone"',
    target: 'cyclone'
  },
  {
    arg: 'rm-unused-types',
    description: 'Remove unused types',
    target: 'rmUnusedTypes',
    default: true
  },
  {
    arg: 'tail-call',
    description: 'Optimize tail calls (warning: tail calls are not widely implemented)',
    target: 'tailCall'
  },
  {
    arg: 'opt-inline',
    description: 'Inline functions',
    invDescription: "Don't inline any functions",
    target: 'optInline',
    default: () => Options.optLevel >= 2
  },
  {
    arg: 'opt-inline-only',
    description: 'Stop after inline optimization',
    target: () => {
      Options.optInline = true;
      Options.optInlineOnly = true;
    },
    hide: true
  },
  {
    arg: 'opt-wasm-runs',
    paramName: 'count',
    type: 'int',
    description: 'How many times to run through the Wasm for optimizations',
    target: 'optWasmRuns',
    hide: true
  },
  { separator: 'Debug information options:' },
  {
    short: 'd',
    description: 'Add debug information for compilation',
    target: 'debugInfo'
  },
  {
    short: 'b',
    description: 'Show the length of the compiled Wasm',
    target: 'showByteLength'
  },
  {
    arg: 'backtrace-surrounding',
    paramName: 'count',
    type: 'int',
    description: 'How much Wasm code should be shown before / after the current position during a backtrace',
    target: 'backtraceSurrounding'
  },
  {
    arg: 'backtrace-func',
    description: 'Instead of showing only a small portion of the function for backtraces, show it entirely',
    target: 'backtraceFunc'
  },
  {
    arg: 'funcs',
    description: 'Print the disassembled Wasm of all functions or the function selected with -f before optimization',
    target: 'logFuncs'
  },
  {
    arg: 'opt-funcs',
    description: 'Print the disassembled Wasm of all functions or the function selected with -f after optimization',
    target: 'optFuncs'
  },
  {
    short: 'f',
    paramName: 'name',
    type: 'string',
    description: 'Specifies the function to dump for --funcs',
    target: 'wantedFunction'
  },
  {
    arg: 'opt-log',
    description: 'Print information about the optimization process',
    target: 'optLog',
    hide: true
  },
  {
    arg: 'verbose-pgo',
    description: 'Print more information about profile guided optimization (PGO)',
    target: 'verbosePgo',
    hide: true
  },
  {
    arg: 'pgo-log',
    description: 'Print how much could be optimized due to profile guided optimization',
    target: 'pgoLog',
    hide: true
  },
  {
    arg: 'cyclone-log',
    description: 'Print how much could be optimized due to cyclone',
    target: 'cycloneLog',
    hide: true
  },
  {
    arg: 'builtin-tree',
    description: 'Show a tree of all built-in functions.',
    target: 'builtinTree',
    hide: true
  },
  {
    arg: 'largest-types',
    description: 'Print information about the types with the highest ids',
    target: 'largestTypes',
    hide: true
  },
  {
    arg: 'log-missing-objects',
    description: 'Print information about non-existent built-in objects refered to by function names',
    target: 'logMissingObjects',
    hide: true
  },
  {
    arg: 'ast-log',
    description: 'Print out the abstract syntax tree (AST) as JSON',
    target: 'astLog',
    hide: true
  },
  {
    arg: 'sections',
    description: 'Print the contents of all Wasm sections in hexadecimal',
    target: 'sections',
    hide: true
  },
  {
    arg: 'compile-alloc-log',
    description: 'Print information about compile time allocated memory',
    target: 'compileAllocLog',
    hide: true
  },
  {
    arg: 'runtime-alloc-log',
    description: 'Print information at runtime about allocated memory',
    target: 'compileAllocLog',
    hide: true
  },
  {
    arg: 'code-log',
    description: 'Print information during the code generation process',
    target: 'codeLog',
    hide: true
  },
  {
    arg: 'regex-log',
    description: 'Print debug information about Wasm generated from regular expressions',
    target: 'regexLog'
  },
  { separator: 'Profiling options:' },
  {
    arg: 'show-time',
    description: 'Measure the time the program took to run',
    target: 'showTime'
  },
  {
    arg: 'profile-compiler',
    description: 'Log information about the compilation process',
    target: 'profileCompiler'
  },
  {
    arg: 'profile-assemble',
    description: 'Log information about the assembly process',
    target: 'profileAssemble'
  },
  { separator: 'Library options:' },
  {
    arg: 'prng',
    paramName: 'algorithm',
    type: 'string',
    description: 'Specifies the algorithm used for the pseudo-random number generator (supported: lcg32_glibc, lcg32_minstd, xorshift32+, xorshift64+, xorshift128+, xoroshiro128+, xoshiro128+)',
    target: 'valtype',
    default: 'f64'
  },
  { separator: 'Advanced options (can break things if not used correctly):', hide: true },
  {
    arg: 'opt-unused',
    description: 'Determines whether the result of an expression is unused',
    target: 'optUnused',
    default: true,
    hide: true
  },
  {
    arg: 'force-remove-types',
    paramName: 'type,...',
    type: 'string',
    description: 'Specify which types should be forced to be removed (e.g. Map)',
    target: 'forceRemoveTypes',
    hide: true
  },
  {
    arg: 'treeshake-wasm-imports',
    description: 'TODO',
    target: 'treeshakeWasmImports',
    default: true,
    hide: true
  },
  {
    arg: 'always-memory',
    description: 'TODO',
    target: 'alwaysMemory',
    default: true,
    hide: true
  },
  {
    arg: 'indirect-calls',
    description: 'TODO',
    target: 'indirectCalls',
    default: true,
    hide: true
  },
  {
    arg: 'data',
    description: 'TODO',
    target: 'data',
    default: true,
    hide: true
  },
  {
    arg: 'passive-data',
    description: 'TODO',
    target: 'passiveData',
    default: () => !Options.compileTarget || Options.compileTarget === "wasm",
    hide: true
  },
  {
    arg: 'active-data',
    description: 'TODO',
    target: 'activeData',
    hide: true
  },
  {
    arg: 'asur',
    description: 'Use the Asur runtime to run Wasm',
    target: 'asur',
    hide: true
  },
  {
    arg: 'wasm-debug',
    description: 'Debug Wasm (used in combination with --asur). Equivalent to command "debug-wasm"',
    target: 'wasmDebug',
    hide: true
  },
  {
    arg: 'allocator',
    type: [ 'static', 'grow', 'chunk' ],
    description: 'Change the type of allocator to use',
    target: 'allocator',
    hide: true
  },
  {
    arg: 'chunk-allocator-size',
    paramName: 'pages',
    type: 'int',
    description: 'Change the amount of pages in a "chunk" for the chunk allocator type',
    target: 'chunkAllocatorSize',
    hide: true
  },
  {
    arg: 'scoped-page-names',
    description: 'Make allocation page names depend on scope name',
    target: 'scopedPageNames',
    hide: true
  },
  {
    arg: 'rm-blank-main',
    description: "Remove the main function if it doesn't contain anything and there are other exports",
    target: 'rmBlankMain',
    hide: true
  },
  {
    arg: 'always-value-internal-throws',
    description: 'Internal throws always return a value',
    target: 'alwaysValueInternalThrows',
    hide: true
  },
  {
    arg: 'warn-assumed-type',
    description: 'Print a warning if a certain type is assumed during compilation',
    target: 'warnAssumedType',
    hide: true
  },
  {
    arg: 'todo-time',
    type: [ 'compile', 'runtime' ],
    description: 'Whether to emit TODO errors at compile time or runtime',
    target: 'todoTime',
    hide: true
  },
  {
    arg: 'compile-hints',
    description: 'Enable experimental V8 WASM compilation hints',
    target: 'compileHints',
    hide: true
  },
  {
    short: '%',
    description: 'Print percentages in profiling mode',
    target: 'percent',
    hide: true
  },
  { separator: '"Shortcut" options (assume "normal" behavior):', hide: true },
  {
    arg: 'truthy',
    type: [ 'full', 'no_negative', 'no_nan_negative' ],
    description: 'Determines what is considered "truthy" as in when an if statement passes',
    target: 'truthy',
    hide: true
  },
  {
    arg: 'fast-length',
    description: 'Use a shortcut for length members, assuming that the object is valid',
    target: 'fastLength',
    hide: true
  },
  {
    arg: 'funsafe-no-unlikely-proto-checks',
    description: 'Remove < 0 checks in charCodeAt',
    target: 'funsafeNoUnlikelyProtoChecks',
    hide: true
  },
  {
    arg: 'zero-checks',
    paramName: 'where,...',
    type: 'string',
    description: 'Remove all checks for a particular function (available for: charcodeat)',
    target: 'zeroChecks',
    hide: true
  },
  { separator: 'Wasm generation options:', hide: true },
  {
    arg: 'exception-mode',
    type: [ 'lut', 'stack', 'stackest', 'partial' ],
    description: 'Change the way exceptions are represented',
    target: 'exceptionMode',
    hide: true
  },
  {
    arg: 'typeswitch-brtable',
    description: 'Perform type switch using the br_table Wasm instruction',
    target: 'typeswitchBrtable',
    hide: true
  },
  {
    arg: 'typeswitch-unique-tmp',
    description: 'Uniquify temporary variables for typeswitches using ids',
    target: 'typeswitchUniqueTmp',
    hide: true
  },
  {
    arg: 'indirect-call-mode',
    type: [ 'strict', 'vararg' ],
    description: 'Determines how indirect calls are done',
    target: 'indirectCallMode',
    hide: true
  },
  {
    arg: 'indirect-call-min-argc',
    paramName: 'count',
    type: 'int',
    description: 'Determines how many arguments a function will at least have for call mode vararg',
    target: 'indirectCallMinArgc',
    hide: true
  },
  { separator: '2c options:' },
  {
    arg: '2c-memcpy',
    description: 'Use memcpy instead of traditional load / store operations (... why)',
    target: '2cMemcpy'
  },
  {
    arg: '2c-direct-local-get',
    description: 'Use locals directly by name instead of using temporary variables',
    target: '2cDirectLocalGet'
  }
];

export const parseArgs = (argv, optionsOnly = false, file) => {
  if (!optionsOnly) {
    globalThis.Options = {
      additionalArgs: []
    };
  }
  let argObj = Options;

  let help = false;
  let argMode = true;
  let argTypes = {
    string: x => x,
    int: x => {
      let value = parseInt(x);
      if (value !== value) {
        return undefined;
      }
      return value;
    },
    number: x => {
      let value = parseFloat(x);
      if (value !== value) {
        return undefined;
      }
      return value;
    }
  };
  for (let i = optionsOnly ? 0 : 2; i < argv.length;) {
    let arg = argv[i++];
    if (arg === '') {
      continue;
    }
    if (!argMode || !arg.startsWith('-')) {
      if (optionsOnly) {
        console.error('Expected options, found: ' + arg);
        help = true;
        break;
      }
      if (i === 3) { // was 2
        let cmd = commands.find(x => x[0] === arg);
        if (cmd) {
          argObj.command = arg;
          continue;
        }
      }
      Options.additionalArgs.push(arg);
      argMode = false;
      continue;
    }
    if (arg === '--') {
      argMode = false;
      continue;
    }
    let argDesc, value, inv = false;
    if (arg.startsWith('--')) {
      arg = arg.substring(2);

      let eq = arg.indexOf('=');
      if (eq >= 0) {
        value = arg.substring(eq + 1);
        arg = arg.substring(0, eq);
      }
      argDesc = args.find(x => x.arg === arg);
      if (!argDesc) {
        if (arg.startsWith("no-")) {
          argDesc = args.find(x => x.arg === arg.substring(3));
          if (!argDesc || argDesc.type) {
            argDesc = null;
          }
          inv = true;
        }
        if (!argDesc) {
          console.error('Error: invalid option --' + arg);
          help = true;
          break;
        }
      }
      if (argDesc.help) {
        help = argDesc.help;
        break;
      }
      arg = '--' + arg;
    } else {
      arg = arg.substring(1);
      argDesc = args.find(x => x.short === arg);
      if (!argDesc) {
        console.error('Error: invalid option -' + arg);
        help = true;
        break;
      }
      arg = '-' + arg;
    }
    if (!argDesc.type) {
      value = !inv;
    } else {
      if (!value) {
        value = argv[i++];
      }
      if (!value) {
        console.error(`Error: Option ${arg} requires a value`);
        help = true;
        break;
      }
      if (Array.isArray(argDesc.type)) {
        if (!argDesc.type.includes(value)) {
          console.error(`Error: Invalid value for option ${arg}, must be one of ${argDesc.type.join(', ')}`);
          help = true;
          break;
        }
      } else {
        let argFunc = argDesc.type;
        if (typeof argFunc != 'function') {
          argFunc = argTypes[argFunc];
        }
        value = argFunc(value);
        if (value === undefined) {
          console.error(`Error: Invalid value for option ${arg}`);
          help = true;
          break;
        }
      }
    }
    if (typeof argDesc.target == 'function') {
      argDesc.target(value);
    } else if (argDesc.target) {
      argObj[argDesc.target] = value;
    }
  }
  if (optionsOnly && help) {
    console.error("An error occurred while trying to read command line arguments for " + file);
    throw new Error("command line arguments");
  }
  if (help) {
    showHelp(help > 1);
  }
  if (Options.command) {
    let cmd = commands.find(x => x[0] == Options.command);
    if (cmd[3]) {
      Object.assign(argObj, cmd[3]);
    }
  }
  for (let opt of args) {
    if (!opt.default) {
      continue;
    }
    if (argObj[opt.target] !== undefined) {
      continue;
    }
    let value = opt.default;
    if (typeof value == 'function') {
      value = value();
    }
    argObj[opt.target] = value;
  }
  if (optionsOnly) {
    return;
  }
  if (Options.additionalArgs.length > 0) {
    Options.file = Options.additionalArgs[0];
    Options.additionalArgs.shift();
  } else {
    Options.file = null;
  }
};

export const showHelp = (showHidden = false) => {
  const color = (txt, colors) => {
    if (!process?.stdout || !(process.stdout.isTTY ?? true)) {
      return txt;
    }
    if (!Array.isArray(colors)) {
      colors = [ colors ]; 
    }
    return colors.map(x => '\x1B[' + x + 'm').join('') + txt + '\x1B[0m';
  };

  // description + version
  console.log(`${color('Porffor', [1, 35])} is a JavaScript engine/runtime/compiler. ${color('(' + globalThis.version + ')', 90)}`);

  // basic usage
  console.log(`Usage: ${color('porf [command] [...options] path/to/script.js [...args]', 1)}`);
  console.log();

  // commands
  console.log(color('Commands:', 1));
  for (let [ cmd, col, desc, opt, hide ] of commands) {
    if (hide && !showHidden) {
      continue;
    }
    console.log(`  ${color(cmd, [1, col])}${' '.repeat(20 - cmd.length)}${desc}`);
  }

  // options
  for (let obj of args) {
    if (obj.hide && !showHidden) {
      continue;
    }
    if (obj.separator) {
      console.log();
      console.log(color(obj.separator, 1));
      continue;
    }
    printArgObject(obj, color, 35, 1, 80);
    if (obj.invDescription) {
      printArgObject(obj, color, 35, 1, 80, true);
    }
  }
  process?.exit?.(1);
};

function printArgObject(obj, color, maxLeft, midPad, maxRight, inv = false) {
  let left = argHelp(obj, color, maxLeft, inv);
  let right = textSplit(inv ? obj.invDescription : obj.description, maxRight);
  printTable('  ', [ left, right ], [ maxLeft + midPad, maxRight ]);
}

function textSplit(text, maxLength) {
  let lines = [];
  let split = text.split(' ');
  let line = '';
  for (let i = 0; i < split.length; i++) {
    let word = split[i];
    if (line.length + word.length + 1 > maxLength) {
      lines.push([ line, line.length ]);
      line = '  ';
    } else if (i > 0) {
      line += ' ';
    }
    line += word;
  }
  lines.push([ line, line.length ]);
  return lines;
}

function argHelp(obj, color, maxLength, inv = false) {
  let lines = [];
  let line = '';
  if (obj.arg) {
    line += '--' + (inv ? 'no-' : '') + obj.arg;
  }
  if (obj.short) {
    if (line.length > 2) {
      line += ', ';
    }
    line += '-' + obj.short;
  }
  let rawLength = line.length;
  if (Array.isArray(obj.type)) {
    let markStart = line.length + 2;
    for (let i = 0; i < obj.type.length; i++) {
      let word = obj.type[i];
      if (i == 0) {
        word = ' (' + word;
      } else {
        word = '|' + word;
      }
      if (i == obj.type.length - 1) {
        word = word + ')';
      }
      if (rawLength + word.length > maxLength) {
        line = line.substring(0, markStart) + color(line.substring(markStart), 1);
        lines.push([ line, rawLength ]);
        line = '  ';
        rawLength = line.length;
        markStart = line.length;
      }
      line += word;
      rawLength += word.length;
    }
    line = line.substring(0, markStart) + color(line.substring(markStart, line.length - 1), 1) + ')';
  } else if (obj.paramName) {
    line += ' ' + color('<' + obj.paramName + '>', 1);
    rawLength += obj.paramName.length + 3;
  }
  lines.push([ line, rawLength ]);
  return lines;
}

function printTable(prefix, columns, columnSizes) {
  let i = 0;
  while (true) {
    let maxColumn = -1;
    for (let j = 0; j < columns.length; j++) {
      if (i < columns[j].length) {
        maxColumn = j;
      }
    }
    if (maxColumn < 0) {
      break;
    }
    let line = prefix;
    for (let j = 0; j <= maxColumn; j++) {
      let [ str, len ] = columns[j][i] ?? [ "", 0 ];
      line += str;
      if (j != maxColumn) {
        line += ' '.repeat(columnSizes[j] - len);
      }
    }
    console.log(line);
    i++;
  }
}
globalThis.argvChanged = () => {
  parseArgs(process.argv);
};
parseArgs([]);
