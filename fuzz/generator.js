// Track declared variables to avoid undefined references
let declaredVars = [];

const generators = {
  // Literals - wrap in parens to avoid identifier issues like 9.prototype
  number: () => {
    const num = Math.random() < 0.5 ? Math.floor(Math.random() * 100) : Math.random() * 100;
    return `(${num})`;
  },
  string: () => {
    if (Math.random() < 0.1) {
      return `''`;
    }

    const len = Math.floor(Math.random() * 32) + 1;
    if (Math.random() < 0.8) { // bytestring
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return `'${Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('')}'`;
    } else { // unicode string
      return `'${Array.from({length: len}, () => `\\u${Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')}`).join('')}'`;
    }
  },
  boolean: () => Math.random() < 0.5 ? 'true' : 'false',
  null: () => 'null',
  undefined: () => 'undefined',

  // Arrays - simple arrays only
  array: (depth = 0) => {
    if (depth > 2) return '[]';
    const len = Math.floor(Math.random() * 3);
    if (len === 0) return '[]';
    const items = Array.from({ length: len }, () => generateExpression(depth + 1));
    return `[${items.join(', ')}]`;
  },

  // Objects - simple objects only
  object: (depth = 0) => {
    if (depth > 2) return '{}';
    const len = Math.floor(Math.random() * 3);
    if (len === 0) return '{}';
    const props = Array.from({length: len}, () => {
      if (Math.random() < 0.5) {
        const key = String.fromCharCode(97 + Math.floor(Math.random() * 26));
        return `'${key}': ${generateExpression(depth + 1)}`;
      } else {
        return `[${generateExpression(depth + 1)}]: ${generateExpression(depth + 1)}`;
      }
    });
    return `({${props.join(', ')}})`;
  },

  // Variables - only use declared ones
  variable: () => {
    if (declaredVars.length === 0) return '42';
    return declaredVars[Math.floor(Math.random() * declaredVars.length)];
  }
};

// Generate simple expressions (no complex nesting)
function generateSimple() {
  const simpleTypes = ['number', 'string', 'boolean', 'null', 'undefined'];
  if (declaredVars.length > 0 && Math.random() < 0.3) {
    simpleTypes.push('variable');
  }
  const type = simpleTypes[Math.floor(Math.random() * simpleTypes.length)];
  const result = generators[type]();
  // Ensure we never return undefined/null that could cause syntax issues
  return result || '42';
}

// Generate expressions with controlled complexity
function generateExpression(depth = 0) {
  if (depth > 2) return generateSimple();

  const roll = Math.random();

  if (roll < 0.3) {
    // Simple value
    return generateSimple();
  } else if (roll < 0.4) {
    // Binary operation
    const ops = ['+', '-', '*', '/', '%', '===', '!==', '>', '<', '>=', '<=', '&&', '||'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    return `(${generateExpression(depth + 1)} ${op} ${generateExpression(depth + 1)})`;
  } else if (roll < 0.65) {
    // Unary operation
    const ops = ['!', '-', '+', 'typeof'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    return `(${op} ${generateExpression(depth + 1)})`;
  } else if (roll < 0.75) {
    // Function call
    const builtins = ['Math.abs', 'Math.floor', 'Math.ceil', 'String', 'Number', 'Boolean'];
    const func = builtins[Math.floor(Math.random() * builtins.length)];
    const argCount = Math.floor(Math.random() * 2);
    const args = Array.from({length: argCount}, () => generateExpression(depth + 1));
    return `${func}(${args.join(', ')})`;
  } else if (roll < 0.85) {
    // Conditional
    return `(${generateExpression(depth + 1)} ? ${generateExpression(depth + 1)} : ${generateExpression(depth + 1)})`;
  } else {
    // Array or object
    return Math.random() < 0.5 ? generators.array(depth) : generators.object(depth);
  }
}

function generateStatement(depth = 0, inFunction = false) {
  if (depth > 2) return `${generateSimple()};`;

  const roll = Math.random();

  if (roll < 0.3) {
    // Variable declaration
    const varName = `var${declaredVars.length}`;
    declaredVars.push(varName);
    return `var ${varName} = ${generateExpression()};`;
  } else if (roll < 0.5 && declaredVars.length > 0) {
    // Variable assignment
    const varName = declaredVars[Math.floor(Math.random() * declaredVars.length)];
    const ops = ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '>>=', '>>>=', '<<='];
    const op = ops[Math.floor(Math.random() * ops.length)];
    return `${varName} ${op} ${generateExpression()};`;
  } else if (roll < 0.6) {
    // If statement
    if (Math.random() < 0.5) {
      return `if (${generateExpression()}) { ${generateStatement(depth + 1, inFunction)} }`;
    } else {
      return `if (${generateExpression()}) { ${generateStatement(depth + 1, inFunction)} } else { ${generateStatement(depth + 1, inFunction)} }`;
    }
  } else if (roll < 0.75) {
    // Loop
    if (Math.random() < 0.5) {
      const limit = Math.floor(Math.random() * 5) + 1;
      return `for (let i = 0; i < ${limit}; i++) { ${generateStatement(depth + 1, inFunction)} }`;
    } else {
      return `while (${generateExpression(depth + 1)}) { ${generateStatement(depth + 1, inFunction)} break; }`;
    }
  } else if (roll < 0.85) {
    // Try/catch
    return `try { ${generateStatement(depth + 1, inFunction)} } catch (e) { ${generateStatement(depth + 1, inFunction)} }`;
  } else if (roll < 0.95 && inFunction) {
    // Return (only in functions)
    return `return ${generateExpression()};`;
  } else {
    // Expression statement
    return `${generateExpression()};`;
  }
}

function generateFunction() {
  const name = `func${Math.floor(Math.random() * 100)}`;
  const paramCount = Math.floor(Math.random() * 3);
  const params = Array.from({length: paramCount}, (_, i) => `param${i}`);

  // Save current variables and add parameters
  const savedVars = [...declaredVars];
  params.forEach(p => declaredVars.push(p));

  const stmtCount = Math.floor(Math.random() * 3) + 1;
  const statements = [];
  for (let i = 0; i < stmtCount; i++) {
    statements.push('  ' + generateStatement(0, true));
  }

  statements.push('  return ' + generateExpression() + ';');

  // Restore variables
  declaredVars = savedVars;

  return `function ${name}(${params.join(', ')}) {\n${statements.join('\n')}\n}`;
}

function generateProgram(options = {}) {
  const {
    maxStatements = 8,
    maxFunctions = 2,
    includeStrictMode = false
  } = options;

  declaredVars = [];

  let code = '';

  if (includeStrictMode) {
    code += "'use strict';\n";
  }

  // Always declare some initial variables
  const varCount = Math.floor(Math.random() * 3) + 2;
  for (let i = 0; i < varCount; i++) {
    const varName = `var${i}`;
    declaredVars.push(varName);
    code += `var ${varName} = ${generateExpression()};\n`;
  }

  const funcCount = Math.floor(Math.random() * maxFunctions) + 1;
  for (let i = 0; i < funcCount; i++) {
    code += generateFunction() + '\n\n';
  }

  const stmtCount = Math.floor(Math.random() * maxStatements) + 2;
  for (let i = 0; i < stmtCount; i++) {
    code += generateStatement() + '\n';
  }

  // Always end with a result
  code += `var result = ${generateExpression()};`;

  return code;
}

export { generateExpression as generate, generateStatement, generateFunction, generateProgram };
