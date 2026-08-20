#!/usr/bin/env bash
# compile each bench to wasm32-wasi and run it under wasmtime. the benches only
# print timings, so a clean exit is the assertion - enough to catch what the wasi
# backend risks: arena exhaustion, traps, and gc corruption.
set -uo pipefail

CLANG="${WASI_SDK_PATH:-/opt/wasi-sdk}/bin/clang"
TARGET="${WASI_TARGET:-wasm32-wasip2}"
OUT="${OUT:-/tmp/porffor-wasi}"

# benches that cannot pass yet:
#   avg   - uses `node:child_process`
#   v8-v7 - slow
SKIP=(avg v8-v7)

mkdir -p "$OUT"

fail=0
for src in bench/*.js; do
  name=$(basename "$src" .js)
  [[ " ${SKIP[*]:-} " == *" $name "* ]] && continue

  if out=$({ ./porf c "$src" -o "$OUT/$name.c" &&
    "$CLANG" --target="$TARGET" -O2 -w \
      -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_MMAN \
      -mllvm -wasm-enable-sjlj -mllvm -wasm-use-legacy-eh=false \
      "$OUT/$name.c" -lsetjmp -lwasi-emulated-signal -lwasi-emulated-mman \
      -o "$OUT/$name.wasm" &&
    wasmtime run "$OUT/$name.wasm"; } 2>&1)
  then
    echo "ok   $name"
  else
    echo "FAIL $name"
    echo "$out"
    fail=1
  fi
done

exit $fail
