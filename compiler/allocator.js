import { PageSize } from './wasmSpec.js';
import './prefs.js';

const pagePtr = ind => {
  if (ind === 0) return 16;
  return ind * PageSize;
};

export const nameToReason = (scope, name) => {
  let scopeName = scope.name;
  if (globalThis.precompile && scopeName === 'main') scopeName = globalThis.precompile;

  return `${Prefs.scopedPageNames ? (scopeName + '/') : ''}${name}`;
};

export const alloc = ({ scope, pages }, name) => {
  const reason = nameToReason(scope, name);

  if (pages.has(reason)) {
    return pagePtr(pages.get(reason));
  } else {
    const ind = pages.size;
    pages.set(reason, ind);

    scope.pages ??= new Map();
    scope.pages.set(reason, ind);

    return pagePtr(ind);
  }
};