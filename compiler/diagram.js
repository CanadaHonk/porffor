export const tree = data => {
  let out = 'flowchart LR\n';
  let ids = new Map();

  const run = (x, parent = null) => {
    for (const [ name, children ] of x) {
      const alreadyHas = ids.has(name);
      if (!alreadyHas) ids.set(name, ids.size);
      const id = ids.get(name);

      if (!alreadyHas || parent != null) {
        if (parent != null) out += `${parent}-->`;
        out += `${id}${alreadyHas ? '' : `["${name}"]`}\n`;
      }

      if (children) run(children, id);
    }
  };
  run(data);

  return out;
};

export const url = code => `https://mermaid.live/view#${btoa(JSON.stringify({
  mermaid: code.length > 10000 ? { theme: 'dark', securityLevel: 'loose', maxEdges: 5000 } : { theme: 'dark' },
  updateDiagram: true,
  autoSync: true,
  rough: false,
  panZoom: true,
  code
}))}`;