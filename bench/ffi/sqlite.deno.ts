// based on https://github.com/littledivy/blazing-fast-ffi-talk/blob/main/sqlite_shared.mjs
const SQLITE3_OK = 0;
const SQLITE3_ROW = 100;

const SQLITE3_OPEN_READWRITE = 0x00000002;
const SQLITE3_OPEN_CREATE = 0x00000004;
const SQLITE3_OPEN_MEMORY = 0x00000080;
const SQLITE3_OPEN_PRIVATECACHE = 0x00040000;

const unwrap = (code: i32) => {
  if (code === SQLITE3_OK) return;
  throw new Error(`SQLite error: ${code}`);
};

const encoder = new TextEncoder();
function toCString(str) {
  return encoder.encode(str + "\0");
}

// based on https://github.com/littledivy/blazing-fast-ffi-talk/blob/main/sqlite.deno.ts
const { symbols } = Deno.dlopen("libsqlite3.so.0", {
  sqlite3_initialize: {
    parameters: [],
    result: "i32",
  },
  sqlite3_open_v2: {
    parameters: [
      "buffer",
      "buffer",
      "i32",
      "pointer",
    ],
    result: "i32",
  },
  sqlite3_exec: {
    parameters: [
      "pointer", // sqlite3 *db
      "buffer", // const char *sql
      "pointer", // sqlite3_callback callback
      "pointer", // void *arg
      "buffer", // char **errmsg
    ],
    result: "i32",
  },
  sqlite3_prepare_v2: {
    parameters: [
      "pointer", // sqlite3 *db
      "buffer", // const char *zSql
      "i32", // int nByte
      "buffer", // sqlite3_stmt **ppStmt
      "pointer", // const char **pzTail
    ],
    result: "i32",
  },
  sqlite3_reset: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_step: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },

  sqlite3_column_int: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "i32",
  },
});

const {
  sqlite3_initialize,
  sqlite3_open_v2,
  sqlite3_exec,
  sqlite3_prepare_v2,
  sqlite3_reset,
  sqlite3_step,
  sqlite3_column_int,
} = symbols;

sqlite3_initialize();

const pHandle = new Uint32Array(2);
unwrap(
  sqlite3_open_v2(
    toCString(":memory:"),
    pHandle,
    SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_PRIVATECACHE |
      SQLITE3_OPEN_CREATE | SQLITE3_OPEN_MEMORY,
    null,
  ),
);

const db = Deno.UnsafePointer.create(pHandle[0] + 2 ** 32 * pHandle[1]);

function exec(sql) {
  const _pErr = new Uint32Array(2);
  unwrap(sqlite3_exec(db, toCString(sql), null, null, _pErr));
}

exec("PRAGMA auto_vacuum = none");
exec("PRAGMA temp_store = memory");
exec("PRAGMA locking_mode = exclusive");
exec("PRAGMA user_version = 100");

const sql = `WITH RECURSIVE c(x) AS (
  VALUES(1)
  UNION ALL
  SELECT x+1 FROM c WHERE x<50
)
SELECT x, x as a FROM c;`;

function prepareStatement() {
  const pHandle = new Uint32Array(2);
  unwrap(
    sqlite3_prepare_v2(
      db,
      toCString(sql),
      sql.length,
      pHandle,
      null,
    ),
  );
  return Deno.UnsafePointer.create(pHandle[0] + 2 ** 32 * pHandle[1]);
}

const prepared = prepareStatement();
function run(): number[] {
  const result: number[] = new Array(50);

  let status = SQLITE3_ROW;
  while(status === SQLITE3_ROW) {
    status = sqlite3_step(prepared);
    const int = sqlite3_column_int(prepared, 0);
    result[int] = int;
  }
  sqlite3_reset(prepared);
  return result;
}

const runs = 10_000;
const start = performance.now();
for (let i = 0; i < runs; i++) run();

console.log(((performance.now() - start)).toFixed(10));