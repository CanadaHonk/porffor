window.BENCHMARK_DATA = {
  "lastUpdate": 1690150706008,
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
      },
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
          "id": "00c47ec94f85e7bc42a894d4ebf711db61785c70",
          "message": "bench ci: set title",
          "timestamp": "2023-07-23T23:04:12+01:00",
          "tree_id": "7789a14fd9fb5d86475135aab062748f35e0339c",
          "url": "https://github.com/CanadaHonk/porffor/commit/00c47ec94f85e7bc42a894d4ebf711db61785c70"
        },
        "date": 1690149963827,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 39.63,
            "range": "±0.02%",
            "unit": "ops/sec",
            "extra": "68 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 48.19,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "63 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 44.69,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "59 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 873,
            "range": "±0.12%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1985,
            "range": "±0.02%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 635098,
            "range": "±0.08%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 700216,
            "range": "±0.11%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node arrayAccess(45)",
            "value": 706379271,
            "range": "±0.22%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor arrayAccess(45)",
            "value": 1886,
            "range": "±117.76%",
            "unit": "ops/sec",
            "extra": "7 samples"
          },
          {
            "name": "porffor(i32) arrayAccess(45)",
            "value": 963,
            "range": "±178.97%",
            "unit": "ops/sec",
            "extra": "7 samples"
          },
          {
            "name": "node arithmetic(45)",
            "value": 707641059,
            "range": "±0.13%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "porffor arithmetic(45)",
            "value": 1973769,
            "range": "±0.35%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor(i32) arithmetic(45)",
            "value": 1968041,
            "range": "±0.25%",
            "unit": "ops/sec",
            "extra": "92 samples"
          }
        ]
      },
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
          "id": "d5be2670db3316be7df53aef12af7b269d306503",
          "message": "bench ci: fix params for new",
          "timestamp": "2023-07-23T23:16:32+01:00",
          "tree_id": "272cfbbc1e1b11d70b0e8291182afe289d7c5f7d",
          "url": "https://github.com/CanadaHonk/porffor/commit/d5be2670db3316be7df53aef12af7b269d306503"
        },
        "date": 1690150705986,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 32.4,
            "range": "±0.90%",
            "unit": "ops/sec",
            "extra": "57 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 40.12,
            "range": "±0.23%",
            "unit": "ops/sec",
            "extra": "53 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 37.21,
            "range": "±0.07%",
            "unit": "ops/sec",
            "extra": "64 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 724,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1651,
            "range": "±0.08%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 913880,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 931416,
            "range": "±0.10%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node arrayAccess()",
            "value": 120964583,
            "range": "±0.16%",
            "unit": "ops/sec",
            "extra": "92 samples"
          },
          {
            "name": "porffor arrayAccess()",
            "value": 1709,
            "range": "±81.39%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "porffor(i32) arrayAccess()",
            "value": 937,
            "range": "±155.38%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "node arithmetic()",
            "value": 115721094,
            "range": "±1.14%",
            "unit": "ops/sec",
            "extra": "91 samples"
          },
          {
            "name": "porffor arithmetic()",
            "value": 1612519,
            "range": "±0.40%",
            "unit": "ops/sec",
            "extra": "92 samples"
          },
          {
            "name": "porffor(i32) arithmetic()",
            "value": 1614420,
            "range": "±0.32%",
            "unit": "ops/sec",
            "extra": "94 samples"
          }
        ]
      }
    ]
  }
}