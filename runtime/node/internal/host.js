import '../c-helpers.js';

export const platform = (() => {
  let darwin = 0;
  Porffor.c`
#ifdef __APPLE__
  darwin = 1;
#endif
`;
  return darwin ? 'darwin' : 'linux';
})();

export const getcwd = () => {
  let out;
  Porffor.c`{
  char *dir = getcwd(NULL, 0);
  out = porf_node_cstr(dir);
  free(dir);
}`;
  return out;
};

// process points this at process.cwd() so patching it works like in node
let source = getcwd;
export const setCwd = fn => {
  source = fn;
};
export const cwd = () => source();

// the global gc() of --expose-gc: a full collection
export const gc = () => {
  Porffor.c`porf_gc_collect(0);`;
};
