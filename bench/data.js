window.BENCHMARK_DATA = {
  "lastUpdate": 1690141839438,
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
          "id": "31f47fe79f31a87d1bca698108c34a68c3b38fc7",
          "message": "bench ci: ignore i32 unsupported",
          "timestamp": "2023-07-23T20:49:48+01:00",
          "tree_id": "4c089ea63e4c48ab915a7319b375bcc1da20af1a",
          "url": "https://github.com/CanadaHonk/porffor/commit/31f47fe79f31a87d1bca698108c34a68c3b38fc7"
        },
        "date": 1690141839418,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 33.02,
            "range": "±0.02%",
            "unit": "ops/sec",
            "extra": "58 samples"
          },
          {
            "name": "porffor(default) countPrimes(10000)",
            "value": 40.13,
            "range": "±0.31%",
            "unit": "ops/sec",
            "extra": "53 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 37.25,
            "range": "±0.03%",
            "unit": "ops/sec",
            "extra": "64 samples"
          },
          {
            "name": "node randoms(10000)",
            "value": 7295,
            "range": "±0.07%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor(default) randoms(10000)",
            "value": 16291,
            "range": "±0.17%",
            "unit": "ops/sec",
            "extra": "98 samples"
          }
        ]
      }
    ]
  }
}