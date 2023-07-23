window.BENCHMARK_DATA = {
  "lastUpdate": 1690148214286,
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
          "id": "7da131f2585173c5d478867ec989a098c8ced5fe",
          "message": "bench ci: tweak displayed",
          "timestamp": "2023-07-23T22:35:55+01:00",
          "tree_id": "b3cb0d61c2a894ad205cde11ae0f03de7fe8452b",
          "url": "https://github.com/CanadaHonk/porffor/commit/7da131f2585173c5d478867ec989a098c8ced5fe"
        },
        "date": 1690148214269,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 71.86,
            "range": "±0.02%",
            "unit": "ops/sec",
            "extra": "74 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 46.82,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "62 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 71.54,
            "range": "±0.01%",
            "unit": "ops/sec",
            "extra": "74 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 1018,
            "range": "±0.31%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 2216,
            "range": "±0.12%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 565682,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 619170,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "97 samples"
          }
        ]
      }
    ]
  }
}