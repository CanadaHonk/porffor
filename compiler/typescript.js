// enums, namespaces, parameter properties and import aliases as tsc emits them
import { patternNames, lexicalNames, varNames, qualify, without, SKIP_KEYS, ident, literal, varDecl, call } from './modules.js';

const index = (object, property) => ({ type: 'MemberExpression', object: ident(object), property, computed: true, optional: false });
const member = (object, name) => index(object, literal(name));
const assign = (left, right) => ({ type: 'AssignmentExpression', operator: '=', left, right });
const exprStmt = expression => ({ type: 'ExpressionStatement', expression });

const TYPE_ONLY = new Set([ 'TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSDeclareFunction', 'TSNamespaceExportDeclaration' ]);

const constant = (node, values, self) => {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'number' || typeof node.value === 'string' ? node.value : undefined;

    case 'TemplateLiteral': {
      let out = node.quasis[0].value.cooked;
      for (let i = 0; i < node.expressions.length; i++) {
        const v = constant(node.expressions[i], values, self);
        if (v === undefined) return;
        out += v + node.quasis[i + 1].value.cooked;
      }
      return out;
    }

    case 'Identifier':
      return values.get(node.name);

    case 'MemberExpression':
      if (node.object.type === 'Identifier' && node.object.name === self) return values.get(node.computed ? node.property.value : node.property.name);
      return;

    case 'UnaryExpression': {
      const v = constant(node.argument, values, self);
      if (typeof v !== 'number') return;
      if (node.operator === '-') return -v;
      if (node.operator === '+') return v;
      if (node.operator === '~') return ~v;
      return;
    }

    case 'BinaryExpression': {
      const l = constant(node.left, values, self), r = constant(node.right, values, self);
      if (l === undefined || r === undefined) return;
      if (node.operator === '+') return l + r;
      if (typeof l === 'string' || typeof r === 'string') return;
      switch (node.operator) {
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '%': return l % r;
        case '**': return l ** r;
        case '<<': return l << r;
        case '>>': return l >> r;
        case '>>>': return l >>> r;
        case '&': return l & r;
        case '|': return l | r;
        case '^': return l ^ r;
      }
    }
  }
};

// (function (param) { body })(name || (name = {}))
const scopeFunction = (name, param, body, ns, merged) => {
  const target = ns ? () => member(ns, name) : () => ident(name);
  let arg = merged ? ident(name) : { type: 'LogicalExpression', operator: '||', left: target(), right: assign(target(), { type: 'ObjectExpression', properties: [] }) };
  if (ns && !merged) arg = assign(ident(name), arg);
  return exprStmt({
    type: 'CallExpression', optional: false, arguments: [ arg ],
    callee: { type: 'FunctionExpression', id: null, params: [ ident(param) ], generator: false, async: false, expression: false, body: { type: 'BlockStatement', body } }
  });
};

const enumBody = (node, values, param) => {
  const self = node.id.name;
  const names = new Set([ ...values.keys(), ...node.members.map(x => x.id.name ?? x.id.value) ]);
  const body = [];
  let next = 0, prev;
  for (const x of node.members) {
    const name = x.id.name ?? x.id.value;
    const value = x.initializer ? constant(x.initializer, values, self) : next;
    let init = literal(value);
    // computed, or one more than a computed member
    if (value === undefined) init = x.initializer ? qualify(walk(x.initializer), names, x => member(param, x.name))
      : { type: 'BinaryExpression', operator: '+', left: member(param, prev), right: literal(1) };

    // numeric members map back to their name
    body.push(exprStmt(typeof value === 'string' ? assign(member(param, name), init) : assign(index(param, assign(member(param, name), init)), literal(name))));
    values.set(name, value);
    prev = name;
    next = typeof value === 'number' ? value + 1 : undefined;
  }
  return body;
};

const instantiated = node => node.body.type === 'TSModuleDeclaration' ? instantiated(node.body) : node.body.body.some(x => {
  if (x.type === 'ExportNamedDeclaration') x = x.declaration;
  // declared values still instantiate
  if (!x || TYPE_ONLY.has(x.type)) return false;
  if (x.type === 'TSModuleDeclaration') return instantiated(x);
  if (x.type === 'TSImportEqualsDeclaration') return x.isExport;
  return true;
});

const exportedNames = node => {
  if (node.body.type === 'TSModuleDeclaration') return [ node.body.id.name ];
  const out = [];
  for (const x of node.body.body) {
    const decl = x.type === 'ExportNamedDeclaration' ? x.declaration : x.type === 'TSImportEqualsDeclaration' && x.isExport ? x : null;
    // types are not namespace members at runtime
    if (!decl || TYPE_ONLY.has(decl.type) || decl.importKind === 'type' || (decl.type === 'TSModuleDeclaration' && !instantiated(decl))) continue;
    if (decl.type === 'VariableDeclaration') for (const d of decl.declarations) patternNames(d.id, out);
      else if (decl.id) out.push(decl.id.name);
  }
  return out;
};

const entityName = node => node.type === 'TSQualifiedName'
  ? { type: 'MemberExpression', object: entityName(node.left), property: node.right, computed: false, optional: false }
  : node;

// ns: the namespace's param when inside one
const lowerList = (list, top, ns) => {
  const kind = top ? 'var' : 'let';
  const declared = new Set(), functions = new Set(), enums = new Map(), namespaces = new Map();
  for (const node of list) {
    const x = node.type === 'ExportNamedDeclaration' ? node.declaration : node;
    if (x?.type === 'TSModuleDeclaration' && x.id.type === 'Identifier') namespaces.set(x.id.name, [ ...namespaces.get(x.id.name) ?? [], ...exportedNames(x) ]);
  }

  const out = [];
  for (const node of list) {
    const exported = node.type === 'ExportNamedDeclaration' && node.declaration != null;
    const x = exported ? node.declaration : node;
    if (x.declare || TYPE_ONLY.has(x.type)) continue;

    // declared by the first merged declaration
    const declare = name => {
      if (declared.has(name)) return;
      declared.add(name);
      const decl = varDecl(kind, name);
      out.push(exported && !ns ? { ...node, declaration: decl } : decl);
    };

    switch (x.type) {
      case 'TSEnumDeclaration': {
        const name = x.id.name, param = `#enum_${name}`;
        declare(name);
        if (!enums.has(name)) enums.set(name, new Map());
        out.push(scopeFunction(name, param, enumBody(x, enums.get(name), param), exported && ns));
        continue;
      }

      case 'TSModuleDeclaration': {
        if (x.global || x.id.type !== 'Identifier' || !instantiated(x)) continue;
        const name = x.id.name, param = `#ns_${name}${x.start}`;
        declare(name);
        const inner = x.body.type === 'TSModuleDeclaration' ? [ { type: 'ExportNamedDeclaration', declaration: x.body, specifiers: [] } ] : x.body.body;
        const body = lowerList(inner, false, param);
        qualify(body, without(new Set(namespaces.get(name)), varNames(body, lexicalNames(body, []))), x => member(param, x.name));
        out.push(scopeFunction(name, param, body, exported && ns, functions.has(name)));
        continue;
      }

      // commonjs as tsc emits it, in an es module its default and what require gives
      case 'TSExportAssignment':
        if (!list.some(x => x.type === 'ImportDeclaration' || x.type.startsWith('Export'))) {
          out.push(exprStmt(assign(member('module', 'exports'), walk(x.expression))));
          continue;
        }
        out.push(varDecl('const', '#export', walk(x.expression)), { type: 'ExportNamedDeclaration', declaration: null, source: null, attributes: [],
          specifiers: [ 'default', 'module.exports' ].map(name => ({ type: 'ExportSpecifier', local: ident('#export'), exported: literal(name) })) });
        continue;

      case 'TSImportEqualsDeclaration': {
        if (x.importKind === 'type') continue;
        const value = x.moduleReference.type === 'TSExternalModuleReference' ? call('require', [ x.moduleReference.expression ]) : entityName(x.moduleReference);
        if (x.isExport && ns) out.push(exprStmt(assign(member(ns, x.id.name), value)));
          else if (x.isExport) out.push({ type: 'ExportNamedDeclaration', declaration: varDecl('var', x.id.name, value), specifiers: [], source: null, attributes: [] });
          else out.push({ ...varDecl('var', x.id.name, value), _alias: x.id.name });
        continue;
      }

      case 'ClassDeclaration':
      case 'FunctionDeclaration':
        declared.add(x.id.name);
        functions.add(x.id.name);
        break;
    }

    walk(x);
    if (!exported || !ns) {
      out.push(node);
      continue;
    }

    // namespace exports are properties of it
    if (x.type === 'VariableDeclaration') {
      for (const d of x.declarations) if (d.init) out.push(exprStmt(assign(d.id, d.init)));
    } else {
      out.push(x, exprStmt(assign(member(ns, x.id.name), ident(x.id.name))));
    }
  }
  // aliases only used as types are dropped
  const aliases = new Map(out.filter(x => x._alias).map(x => [ x._alias, x ]));
  const names = new Set(aliases.keys()), used = new Set();
  const use = node => qualify(node, names, x => {
    if (!used.has(x.name)) {
      used.add(x.name);
      use(aliases.get(x.name).declarations[0].init);
    }
    return x;
  });
  use(out.filter(x => !x._alias));
  return out.filter(x => !x._alias || used.has(x._alias));
};

const parameterProperties = cls => {
  const ctor = cls.body.body.find(x => x.kind === 'constructor')?.value;
  if (!ctor) return;

  const names = [];
  ctor.params = ctor.params.map(x => {
    if (x.type !== 'TSParameterProperty') return x;
    names.push((x.parameter.left ?? x.parameter).name);
    return x.parameter;
  });
  if (names.length === 0) return;

  // after super(), which may be in a try block
  const superCall = list => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].type === 'ExpressionStatement' && list[i].expression.type === 'CallExpression' && list[i].expression.callee.type === 'Super') return [ list, i + 1 ];
      if (list[i].type === 'TryStatement') {
        const found = superCall(list[i].block.body);
        if (found) return found;
      }
    }
  };
  const [ body, i ] = superCall(ctor.body.body) ?? [ ctor.body.body, 0 ];
  body.splice(i, 0, ...names.map(x => exprStmt(assign({ type: 'MemberExpression', object: { type: 'ThisExpression' }, property: ident(x), computed: false, optional: false }, ident(x)))));
  cls.body.body.unshift(...names.map(x => ({ type: 'PropertyDefinition', key: ident(x), value: null, computed: false, static: false, decorators: [] })));
};

const walk = node => {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    for (const x of node) walk(x);
    return node;
  }

  switch (node.type) {
    case 'Program': {
      node.body = lowerList(node.body, true, null);
      // like tsc, imports only used as types or shadowed by a value declaration are elided
      const imports = node.body.filter(x => x.type === 'ImportDeclaration' && x.specifiers.length > 0);
      const used = new Set(), declared = new Set(lexicalNames(node.body, varNames(node.body, [])));
      qualify(node.body.filter(x => x.type !== 'ImportDeclaration'), new Set(imports.flatMap(x => x.specifiers.map(y => y.local.name))), x => used.add(x.name) && x);
      for (const x of imports) x.specifiers = x.specifiers.filter(y => used.has(y.local.name) && !declared.has(y.local.name));
      node.body = node.body.filter(x => !imports.includes(x) || x.specifiers.length > 0);
      return node;
    }

    case 'BlockStatement':
    case 'StaticBlock':
      node.body = lowerList(node.body, false, null);
      return node;

    case 'SwitchCase':
      walk(node.test);
      node.consequent = lowerList(node.consequent, false, null);
      return node;

    case 'ClassDeclaration':
    case 'ClassExpression':
      // type-only members
      node.body.body = node.body.body.filter(x => !x.type.startsWith('TS') && !x.declare);
      parameterProperties(node);
      break;
  }

  for (const key in node) if (!SKIP_KEYS.has(key)) walk(node[key]);
  return node;
};

export default walk;
