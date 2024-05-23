import { Valtype } from '../wasmSpec.js';
import { number } from '../embedding.js';
import Prefs from '../prefs.js';

const allocType = itemType => {
  switch (itemType) {
    case 'i8': return 'bytestring';
    case 'i16': return 'string';

    default: return 'array';
  }
};

const ptr = ind => {
  if (ind === 0) return 1;
  return ind * pageSize;
};


export default class StaticAllocator {
  constructor() {
  }

  alloc({ scope, pages }, name, { itemType }) {
    const reason = `${allocType(itemType)}: ${Prefs.scopedPageNames ? (scope.name + '/') : ''}${name}`;

    if (pages.has(reason)) return number(ptr(pages.get(reason).ind), Valtype.i32);

    if (reason.startsWith('array:')) pages.hasArray = true;
    if (reason.startsWith('string:')) pages.hasString = true;
    if (reason.startsWith('bytestring:')) pages.hasByteString = true;
    if (reason.includes('string:')) pages.hasAnyString = true;

    let ind = pages.size;
    pages.set(reason, { ind, type: itemType });

    scope.pages ??= new Map();
    scope.pages.set(reason, { ind, type: itemType });

    return number(ptr(ind), Valtype.i32);
  }
}