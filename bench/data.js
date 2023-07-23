window.BENCHMARK_DATA = {
  "lastUpdate": 1690147370841,
  "repoUrl": "https://github.com/CanadaHonk/porffor",
  "entries": {
    "porffor benches": [
      {
        "commit": {
          "author": {
            "email": "oj@oojmed.com",
            "name": "CanadaHonk",
            "username": "CanadaHonk"
          },
          "committer": {
            "email": "oj@oojmed.com",
            "name": "CanadaHonk",
            "username": "CanadaHonk"
          },
          "distinct": true,
          "id": "e94ed9e743177b43bd29dc96e6303a5b288488e2",
          "message": "bench ci: fix factorial",
          "timestamp": "2023-07-23T21:54:52+01:00",
          "tree_id": "c3ef992e4f4fa851c49c7f708dc4d4436891a496",
          "url": "https://github.com/CanadaHonk/porffor/commit/e94ed9e743177b43bd29dc96e6303a5b288488e2"
        },
        "date": 1690147370820,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 32.88,
            "range": "±0.56%",
            "unit": "ops/sec",
            "extra": "57 samples"
          },
          {
            "name": "porffor(default) countPrimes(10000)",
            "value": 36.28,
            "range": "±0.90%",
            "unit": "ops/sec",
            "extra": "62 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 49.54,
            "range": "±0.84%",
            "unit": "ops/sec",
            "extra": "63 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 795,
            "range": "±0.69%",
            "unit": "ops/sec",
            "extra": "88 samples"
          },
          {
            "name": "porffor(default) randoms(100000)",
            "value": 1641,
            "range": "±0.65%",
            "unit": "ops/sec",
            "extra": "89 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 1018222,
            "range": "±0.64%",
            "unit": "ops/sec",
            "extra": "90 samples"
          },
          {
            "name": "porffor(default) factorial(100)",
            "value": 930904,
            "range": "±0.73%",
            "unit": "ops/sec",
            "extra": "89 samples"
          },
          {
            "name": "node recursiveFib(45)",
            "value": 0.01,
            "range": "±2.19%",
            "unit": "ops/sec",
            "extra": "5 samples"
          },
          {
            "name": "porffor(default) recursiveFib(45)",
            "value": 0.02,
            "range": "±0.50%",
            "unit": "ops/sec",
            "extra": "5 samples"
          },
          {
            "name": "porffor(i32) recursiveFib(45)",
            "value": 0.02,
            "range": "±0.59%",
            "unit": "ops/sec",
            "extra": "5 samples"
          },
          {
            "name": "node iterativeFib(45)",
            "value": 14379967,
            "range": "±0.83%",
            "unit": "ops/sec",
            "extra": "87 samples"
          },
          {
            "name": "porffor(default) iterativeFib(45)",
            "value": 1511026,
            "range": "±1.15%",
            "unit": "ops/sec",
            "extra": "89 samples"
          },
          {
            "name": "porffor(i32) iterativeFib(45)",
            "value": 1536111,
            "range": "±0.84%",
            "unit": "ops/sec",
            "extra": "90 samples"
          }
        ]
      }
    ]
  }
}