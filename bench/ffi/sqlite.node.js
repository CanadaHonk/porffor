import { dlopen } from 'node:ffi';

// based on https://github.com/littledivy/blazing-fast-ffi-talk/blob/main/sqlite_shared.mjs
const SQLITE3_OK = 0;
const SQLITE3_ROW = 100;

const SQLITE3_OPEN_READWRITE = 0x00000002;
const SQLITE3_OPEN_CREATE = 0x00000004;
const SQLITE3_OPEN_MEMORY = 0x00000080;
const SQLITE3_OPEN_PRIVATECACHE = 0x00040000;

const unwrap = code => {
  if (code === SQLITE3_OK) return;
  throw new Error(`SQLite error: ${code}`);
};

const lib = process.platform === 'darwin' ? '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib' : 'libsqlite3.so.0';
const { functions } = dlopen(lib, {
  sqlite3_initialize: { arguments: [], return: 'i32' },
  sqlite3_open_v2: { arguments: [ 'string', 'buffer', 'i32', 'pointer' ], return: 'i32' },
  sqlite3_exec: { arguments: [ 'pointer', 'string', 'pointer', 'pointer', 'pointer' ], return: 'i32' },
  sqlite3_prepare_v2: { arguments: [ 'pointer', 'string', 'i32', 'buffer', 'pointer' ], return: 'i32' },
  sqlite3_reset: { arguments: [ 'pointer' ], return: 'i32' },
  sqlite3_step: { arguments: [ 'pointer' ], return: 'i32' },
  sqlite3_column_int: { arguments: [ 'pointer', 'i32' ], return: 'i32' }
});

const {
  sqlite3_initialize,
  sqlite3_open_v2,
  sqlite3_exec,
  sqlite3_prepare_v2,
  sqlite3_reset,
  sqlite3_step,
  sqlite3_column_int
} = functions;

sqlite3_initialize();

const pHandle = new BigUint64Array(1);
unwrap(sqlite3_open_v2(
  ':memory:',
  pHandle,
  SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_PRIVATECACHE |
    SQLITE3_OPEN_CREATE | SQLITE3_OPEN_MEMORY,
  null
));

const db = pHandle[0];

function exec(sql) {
  unwrap(sqlite3_exec(db, sql, null, null, null));
}

exec('PRAGMA auto_vacuum = none');
exec('PRAGMA temp_store = memory');
exec('PRAGMA locking_mode = exclusive');
exec('PRAGMA user_version = 100');

const sql = `WITH RECURSIVE c(x) AS (
  VALUES(1)
  UNION ALL
  SELECT x+1 FROM c WHERE x<50
)
SELECT x, x as a FROM c;`;

function prepareStatement() {
  const out = new BigUint64Array(1);
  unwrap(sqlite3_prepare_v2(db, sql, sql.length, out, null));
  return out[0];
}

const prepared = prepareStatement();
function run() {
  const result = new Array(50);

  let status = SQLITE3_ROW;
  while (status === SQLITE3_ROW) {
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

console.log((performance.now() - start).toFixed(10));
