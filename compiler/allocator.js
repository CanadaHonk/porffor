import { PageSize } from './wasmSpec.js';
import './prefs.js';

const pagePtr = ind => {
  if (ind === 0) return 16;
  return ind * PageSize;
};

export const nameToReason = (scope, name) => {
  let scopeName = scope.name;
  if (globalThis.precompile && scopeName === '#main') scopeName = globalThis.precompile;

  return `${Prefs.scopedPageNames ? (scopeName + '/') : ''}${name}`;
};

export const allocPage = ({ scope, pages }, name) => {
  const reason = nameToReason(scope, name);

  if (pages.has(reason)) {
    return pagePtr(pages.get(reason));
  }

  const ind = pages.size;
  pages.set(reason, ind);

  scope.pages ??= new Map();
  scope.pages.set(reason, ind);

  return pagePtr(ind);
};

export const allocBytes = ({ scope, pages }, reason, bytes) => {
  const allocs = pages.allocs ??= new Map();
  const bins = pages.bins ??= [];

  if (allocs.has(reason)) {
    return allocs.get(reason);
  }

  let bin = bins.find(x => (PageSize - x.used) >= bytes);
  if (!bin) {
    // new bin
    const page = pages.size;
    bin = {
      used: 0,
      page
    };

    const id = bins.push(bin);
    pages.set(`#bin_${id}`, page);
  }

  const ptr = pagePtr(bin.page) + bin.used;
  bin.used += bytes;

  allocs.set(reason, ptr);
  return ptr;
};

export const allocStr = ({ scope, pages }, str, bytestring) => {
  // basic string interning for ~free
  const bytes = 4 + str.length * (bytestring ? 1 : 2);
  return allocBytes({ scope, pages }, str, bytes);
};