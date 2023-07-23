window.BENCHMARK_DATA = {
  "lastUpdate": 1690152117724,
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
          "id": "03c326fe1b37c8c4262c2d875988828b78860e52",
          "message": "bench ci: fix int failing crashing",
          "timestamp": "2023-07-23T23:39:48+01:00",
          "tree_id": "f67c186b33f709dcc871c6c1976af5d4b4d3c0be",
          "url": "https://github.com/CanadaHonk/porffor/commit/03c326fe1b37c8c4262c2d875988828b78860e52"
        },
        "date": 1690152117705,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 39.61,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "68 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 48.24,
            "range": "±0.02%",
            "unit": "ops/sec",
            "extra": "63 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 44.67,
            "range": "±0.19%",
            "unit": "ops/sec",
            "extra": "59 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 877,
            "range": "±0.08%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1971,
            "range": "±1.33%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 642809,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 718354,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "93 samples"
          },
          {
            "name": "node arrayAccess()",
            "value": 146061786,
            "range": "±0.14%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor arrayAccess()",
            "value": 1199,
            "range": "±152.13%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "porffor(i32) arrayAccess()",
            "value": 923,
            "range": "±180.01%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "node arithmetic()",
            "value": 146325164,
            "range": "±0.12%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor arithmetic()",
            "value": 1933308,
            "range": "±0.31%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor(i32) arithmetic()",
            "value": 1967703,
            "range": "±0.21%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node mathFuncs()",
            "value": 128294500,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "100 samples"
          },
          {
            "name": "porffor mathFuncs()",
            "value": 1821943,
            "range": "±0.28%",
            "unit": "ops/sec",
            "extra": "95 samples"
          }
        ]
      }
    ]
  }
}