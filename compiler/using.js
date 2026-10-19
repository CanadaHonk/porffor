const ident = name => ({ type: 'Identifier', name });
const call = (name, args) => ({ type: 'CallExpression', callee: ident(name), arguments: args, optional: false });
const exprStmt = expression => ({ type: 'ExpressionStatement', expression });
const assign = (left, right) => exprStmt({ type: 'AssignmentExpression', operator: '=', left, right });
const decl = (kind, name, init) => ({ type: 'VariableDeclaration', kind, declarations: [ { type: 'VariableDeclarator', id: ident(name), init } ] });

const isUsing = x => x?.type === 'VariableDeclaration' && (x.kind === 'using' || x.kind === 'await using');

let uid = 0;
const wrap = (body, isAsync, pre = null) => {
  const id = uid++;
  const res = `#using_res${id}`, err = `#using_err${id}`, has = `#using_has${id}`, e = `#using_e${id}`;

  const stmts = [];
  if (pre) stmts.push(exprStmt(call('__Porffor_using_add', [ ident(res), ident(pre[0]), { type: 'Literal', value: pre[1] } ])));
  for (const x of body) {
    if (!isUsing(x)) {
      stmts.push(x);
      continue;
    }

    const hint = x.kind === 'await using' ? 1 : 0;
    stmts.push({ ...x, kind: 'const' });
    for (const d of x.declarations) stmts.push(exprStmt(call('__Porffor_using_add', [ ident(res), ident(d.id.name), { type: 'Literal', value: hint } ])));
  }

  const dispose = call(isAsync ? '__Porffor_using_disposeAsync' : '__Porffor_using_dispose', [ ident(res), ident(has), ident(err) ]);
  return [
    decl('const', res, { type: 'ArrayExpression', elements: [] }),
    decl('let', err, null),
    decl('let', has, { type: 'Literal', value: false }),
    {
      type: 'TryStatement',
      block: { type: 'BlockStatement', body: stmts },
      handler: { type: 'CatchClause', param: ident(e), body: { type: 'BlockStatement', body: [
        assign(ident(has), { type: 'Literal', value: true }),
        assign(ident(err), ident(e))
      ] } },
      // an await using only awaits on exit if a resource was actually added
      finalizer: { type: 'BlockStatement', body: [ isAsync ? {
        type: 'IfStatement',
        test: { type: 'BinaryExpression', operator: '!==', left: { type: 'MemberExpression', object: ident(res), property: ident('length'), computed: false, optional: false }, right: { type: 'Literal', value: 0 } },
        consequent: exprStmt({ type: 'AwaitExpression', argument: dispose }),
        alternate: exprStmt(call('__Porffor_using_dispose', [ ident(res), ident(has), ident(err) ]))
      } : exprStmt(dispose) ] }
    }
  ];
};

const walkList = list => {
  list = list.map(x => walk(x) ?? x);
  if (!list.some(isUsing)) return list;
  return wrap(list, list.some(x => isUsing(x) && x.kind === 'await using'));
};

const walk = node => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) walk(x); return; }

  switch (node.type) {
    case 'BlockStatement':
    case 'StaticBlock':
      node.body = walkList(node.body);
      return;

    case 'SwitchStatement':
      walk(node.discriminant);
      for (const c of node.cases) { walk(c.test); c.consequent = walkList(c.consequent); }
      return;

    case 'ForOfStatement':
    case 'ForInStatement':
      walk(node.right);
      node.body = walk(node.body) ?? node.body;

      if (isUsing(node.left)) {
        const hint = node.left.kind === 'await using' ? 1 : 0;
        node.left = { ...node.left, kind: 'const' };
        node.body = { type: 'BlockStatement', body: wrap([ node.body ], hint === 1, [ node.left.declarations[0].id.name, hint ]) };
      }
      return;

    case 'ForStatement':
      // for ([await] using x = y; ...): the resources live for the whole loop
      if (isUsing(node.init)) {
        const block = { type: 'BlockStatement', body: [ node.init, node ] };
        node.init = null;
        walk(block);
        return block;
      }
      break;
  }

  for (const key in node) {
    if (key === 'start' || key === 'end' || key[0] === '_') continue;
    const v = node[key];
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const out = walk(v[i]);
        if (out) v[i] = out;
      }
    } else {
      const out = walk(v);
      if (out) node[key] = out;
    }
  }
};

export default program => {
  walk(program);
  return program;
};
