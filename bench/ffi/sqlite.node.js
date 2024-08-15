// based on https://github.com/littledivy/blazing-fast-ffi-talk/blob/main/sqlite.node.js
import Database from 'better-sqlite3';
const db = new Database(":memory:");

db.exec("PRAGMA auto_vacuum = none");
db.exec("PRAGMA temp_store = memory");
db.exec("PRAGMA locking_mode = exclusive");
db.exec("PRAGMA user_version = 100");

const sql = `
WITH RECURSIVE c(x) AS (
  VALUES(1)
  UNION ALL
  SELECT x+1 FROM c WHERE x<50
)
SELECT x, x as a FROM c
`;

function createQuery(sql) {
  return db.prepare(sql);
}

const query = createQuery(sql);
function run() {
  query.all();
}

// based on https://github.com/littledivy/blazing-fast-ffi-talk/blob/main/bench.mjs
const total = 100;
const runs = 100_000;

let sum = 0;
const bench = () => {
  const start = performance.now();
  for (let i = 0; i < runs; i++) run();
  const elapsed = Math.floor(performance.now() - start);
  const rate = Math.floor(runs / (elapsed / 1000));
  sum += rate;
};

for (let i = 0; i < total; i++) {
  bench();
}

console.log(sum / total);