window.BENCHMARK_DATA = {
  "lastUpdate": 1690149451525,
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
          "id": "cf2665273811fd40514bb99c10041d4cd8d369ad",
          "message": "bench ci: new tests",
          "timestamp": "2023-07-23T22:55:38+01:00",
          "tree_id": "c131942299a81490f58c6da536c02f014108850a",
          "url": "https://github.com/CanadaHonk/porffor/commit/cf2665273811fd40514bb99c10041d4cd8d369ad"
        },
        "date": 1690149451507,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 71.77,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "74 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 46.62,
            "range": "±0.16%",
            "unit": "ops/sec",
            "extra": "61 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 71.4,
            "range": "±0.12%",
            "unit": "ops/sec",
            "extra": "74 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 1011,
            "range": "±0.33%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 2225,
            "range": "±0.12%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 563659,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 622187,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node arrayAccess(45)",
            "value": 587874891,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "porffor arrayAccess(45)",
            "value": 1325,
            "range": "±173.49%",
            "unit": "ops/sec",
            "extra": "6 samples"
          },
          {
            "name": "porffor(i32) arrayAccess(45)",
            "value": 1203,
            "range": "±172.92%",
            "unit": "ops/sec",
            "extra": "6 samples"
          },
          {
            "name": "node arithmetic(45)",
            "value": 588790682,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor arithmetic(45)",
            "value": 2405067,
            "range": "±0.32%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor(i32) arithmetic(45)",
            "value": 2404643,
            "range": "±0.16%",
            "unit": "ops/sec",
            "extra": "99 samples"
          }
        ]
      }
    ]
  }
}