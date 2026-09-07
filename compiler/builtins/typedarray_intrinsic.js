export default async () => {
  const fs = (await import('node:fs'));
  const arrayCode = fs.readFileSync(globalThis.precompileCompilerPath + '/builtins/array.ts', 'utf8');

  // extract the same shared array<->typedarray methods typedarray.js interpolates per-type,
  // so %TypedArray%.prototype gets a matching set of thin validate-and-forward dispatchers
  const rawBlocks = [...arrayCode.matchAll(/\/\/ @porf-typed-array\nexport const __Array_prototype_(\w+) = function \(this: any\[\],?\s*([^)]*)\)/g)];

  // loud guard: a future reformat of array.ts (e.g. a wrapped signature, or a blank line
  // between the marker and the export) would make this regex silently match fewer methods
  // than exist, quietly dropping their %TypedArray%.prototype dispatcher with a green build.
  // Cross-check against a plain marker count so that class of drift throws instead.
  const markerCount = [...arrayCode.matchAll(/\/\/ @porf-typed-array\n/g)].length;
  if (rawBlocks.length !== markerCount) {
    throw new Error(`typedarray_intrinsic.js: expected to extract ${markerCount} @porf-typed-array method signatures from array.ts, got ${rawBlocks.length} - the extraction regex likely no longer matches array.ts's current formatting`);
  }

  const blocks = rawBlocks
    .map(m => ({ name: m[1], paramsDecl: m[2].trim() }))
    // concat is generated for typed arrays too but is not part of the %TypedArray%.prototype spec surface
    // (and takes a rest param, which Porffor.callThis-style forwarding can't express positionally)
    .filter(m => m.name !== 'concat');

  // typedarray-only methods (not shared with Array.prototype), signatures from typedarray.js
  const extra = [
    { name: 'at', paramsDecl: 'index: any' },
    { name: 'slice', paramsDecl: 'start: any, end: any' },
    { name: 'set', paramsDecl: 'array: any, offset: number' },
    { name: 'subarray', paramsDecl: 'start: any, end: any' }
  ];

  const paramNames = decl => decl === '' ? [] : decl.split(',').map(p => p.trim().split(':')[0].trim());

  const range = 'Porffor.type(this) < Porffor.TYPES.uint8clampedarray || Porffor.type(this) > Porffor.TYPES.float64array';

  // note: `this.${name}(...)` below is a real dynamic dispatch, not a fixed reference to
  // __<Type>_prototype_<name> - if a subclass or test overrides an own/prototype-chain
  // property of that name on `this`, the override runs instead of the built-in per-type
  // method. Spec wants %TypedArray%.prototype.<name> to be one fixed shared function object
  // per method (so e.g. Int8Array.prototype.map === Uint8Array.prototype.map), not a
  // per-call lookup; this dispatcher approximates that behavior without unifying the 11
  // architecturally-separate, fixed-width-specialized method bodies. Also intentionally out
  // of scope: the "length" getter (special-cased directly in codegen, not a real accessor,
  // so there's nothing to forward to), Symbol.toStringTag, and keys/values/entries (iteration
  // is special-cased in codegen for every collection type, not property-based, in this engine).
  let out = `export const __Porffor_TypedArray = function (): any {
  throw new TypeError('Abstract class TypedArray not directly constructable');
};

`;

  for (const { name, paramsDecl } of [ ...blocks, ...extra ]) {
    const names = paramNames(paramsDecl);
    const params = paramsDecl ? `, ${paramsDecl}` : '';
    const args = names.join(', ');

    out += `export const __Porffor_TypedArray_prototype_${name} = function (this: any${params}) {
  if (${range}) throw new TypeError('Method %TypedArray%.prototype.${name} called on incompatible receiver');
  return this.${name}(${args});
};

`;
  }

  for (const name of [ 'buffer', 'byteLength', 'byteOffset' ]) {
    out += `export const __Porffor_TypedArray_prototype_${name}$get = function (this: any) {
  if (${range}) throw new TypeError('Method %TypedArray%.prototype.${name} called on incompatible receiver');
  return this.${name};
};

`;
  }

  return out;
};
