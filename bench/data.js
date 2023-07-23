window.BENCHMARK_DATA = {
  "lastUpdate": 1690148010033,
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
          "id": "d28d4d76313beac7021cbb114fad332979ef16e6",
          "message": "bench ci: remove fibs",
          "timestamp": "2023-07-23T22:32:26+01:00",
          "tree_id": "25cb3cdfede7639417231f8386a196530221a865",
          "url": "https://github.com/CanadaHonk/porffor/commit/d28d4d76313beac7021cbb114fad332979ef16e6"
        },
        "date": 1690148010015,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 71.84,
            "range": "±0.02%",
            "unit": "ops/sec",
            "extra": "74 samples"
          },
          {
            "name": "porffor(default) countPrimes(10000)",
            "value": 46.76,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "61 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 71.52,
            "range": "±0.01%",
            "unit": "ops/sec",
            "extra": "74 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 1010,
            "range": "±0.32%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor(default) randoms(100000)",
            "value": 2219,
            "range": "±0.11%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 562897,
            "range": "±0.08%",
            "unit": "ops/sec",
            "extra": "99 samples"
          },
          {
            "name": "porffor(default) factorial(100)",
            "value": 615904,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "98 samples"
          }
        ]
      }
    ]
  }
}