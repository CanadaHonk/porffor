// based on https://github.com/littledivy/blazing-fast-ffi-talk/blob/main/sqlite_shared.mjs
const SQLITE3_OK = 0;
const SQLITE3_ROW = 100;

const SQLITE3_OPEN_READWRITE = 0x00000002;
const SQLITE3_OPEN_CREATE = 0x00000004;
const SQLITE3_OPEN_MEMORY = 0x00000080;
const SQLITE3_OPEN_PRIVATECACHE = 0x00040000;

const unwrap = (code: i32) => {
  if (code === SQLITE3_OK) return;
  // throw new Error(`SQLite error: ${code}`);
};

const passTA = (ta: any) => {
  return Porffor.wasm.i32.load(ta, 0, 4);
};

// based on https://github.com/littledivy/blazing-fast-ffi-talk/blob/main/sqlite.deno.ts
const {
  sqlite3_initialize,
  sqlite3_open_v2,
  sqlite3_exec,
  sqlite3_prepare_v2,
  sqlite3_reset,
  sqlite3_step,
  sqlite3_column_int,
} = Porffor.dlopen("libsqlite3.so.0", {
  sqlite3_initialize: {
    parameters: [],
    result: "i32",
  },
  sqlite3_open_v2: {
    parameters: [
      "buffer", // const char *filename
      "buffer", // sqlite3 **ppDb
      "i32", // int flags
      "pointer", // const char *zVfs
    ],
    result: "i32",
  },
  sqlite3_exec: {
    parameters: [
      "pointer", // sqlite3 *db
      "buffer", // const char *sql
      "pointer", // sqlite3_callback callback
      "pointer", // void *arg
      "pointer", // char **errmsg
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

sqlite3_initialize();

const pHandle = new Uint32Array(2);
unwrap(sqlite3_open_v2(
  ":memory:",
  passTA(pHandle),
  SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_PRIVATECACHE |
    SQLITE3_OPEN_CREATE | SQLITE3_OPEN_MEMORY,
  null
));

const db: number = pHandle[0] + pHandle[1]*4294967296;

function exec(sql) {
  unwrap(sqlite3_exec(db, sql, null, null, null));
}

exec("PRAGMA auto_vacuum = none");
exec("PRAGMA temp_store = memory");
exec("PRAGMA locking_mode = exclusive");
exec("PRAGMA user_version = 100");

function prepareStatement() {
  const sql = `WITH RECURSIVE c(x) AS (
    VALUES(1)
    UNION ALL
    SELECT x+1 FROM c WHERE x<50
  )
  SELECT x, x as a FROM c;`;

  const out = new Uint32Array(2);
  unwrap(sqlite3_prepare_v2(
    db,
    sql,
    sql.length,
    passTA(out),
    null
  ));
  return out[0] + out[1]*4294967296;
}

const prepared = prepareStatement();
const run = (): number[] => {
  const result: number[] = new Array(50);

  let status: number = SQLITE3_ROW;
  while (status == SQLITE3_ROW) {
    status = sqlite3_step(prepared);
    const i: number = sqlite3_column_int(prepared, 0);
    result[i] = i;
  }

  sqlite3_reset(prepared);
  return result;
};

const runs = 10_000;
const start = performance.now();
for (let i = 0; i < runs; i++) run();

console.log(((performance.now() - start)).toFixed(10));