window.BENCHMARK_DATA = {
  "lastUpdate": 1690201951580,
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
          "id": "d9b01d3ca5567926c1950f15479fb9b5352049af",
          "message": "Merge branch 'main' of https://github.com/CanadaHonk/porffor",
          "timestamp": "2023-07-23T23:53:02+01:00",
          "tree_id": "7723efb487c0984291398ea51d3645a1cee6afbf",
          "url": "https://github.com/CanadaHonk/porffor/commit/d9b01d3ca5567926c1950f15479fb9b5352049af"
        },
        "date": 1690152923428,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 39.61,
            "range": "±0.01%",
            "unit": "ops/sec",
            "extra": "68 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 49.39,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "64 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 44.71,
            "range": "±0.01%",
            "unit": "ops/sec",
            "extra": "59 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 870,
            "range": "±0.36%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1985,
            "range": "±0.03%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 638331,
            "range": "±0.05%",
            "unit": "ops/sec",
            "extra": "99 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 715094,
            "range": "±0.11%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node arrayAccess()",
            "value": 145950814,
            "range": "±0.08%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "porffor arrayAccess()",
            "value": 929,
            "range": "±163.40%",
            "unit": "ops/sec",
            "extra": "9 samples"
          },
          {
            "name": "porffor(i32) arrayAccess()",
            "value": 1077,
            "range": "±173.14%",
            "unit": "ops/sec",
            "extra": "7 samples"
          },
          {
            "name": "node arithmetic()",
            "value": 146010304,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor arithmetic()",
            "value": 1940390,
            "range": "±0.29%",
            "unit": "ops/sec",
            "extra": "92 samples"
          },
          {
            "name": "porffor(i32) arithmetic()",
            "value": 1967759,
            "range": "±0.20%",
            "unit": "ops/sec",
            "extra": "99 samples"
          },
          {
            "name": "node mathFuncs()",
            "value": 128083557,
            "range": "±0.07%",
            "unit": "ops/sec",
            "extra": "99 samples"
          },
          {
            "name": "porffor mathFuncs()",
            "value": 1817290,
            "range": "±0.31%",
            "unit": "ops/sec",
            "extra": "95 samples"
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
          "id": "b09518d6ee84ff364109fd9bea883290630aaf37",
          "message": "codegen: fix getting type of funcs with 0 index",
          "timestamp": "2023-07-24T00:10:23+01:00",
          "tree_id": "a8605f8c98eba3258ff0850fdbf3bf2d4b022806",
          "url": "https://github.com/CanadaHonk/porffor/commit/b09518d6ee84ff364109fd9bea883290630aaf37"
        },
        "date": 1690153952389,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 39.6,
            "range": "±0.04%",
            "unit": "ops/sec",
            "extra": "68 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 48.21,
            "range": "±0.05%",
            "unit": "ops/sec",
            "extra": "63 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 44.69,
            "range": "±0.02%",
            "unit": "ops/sec",
            "extra": "59 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 860,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1984,
            "range": "±0.04%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 632193,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 713704,
            "range": "±0.34%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "node arrayAccess()",
            "value": 145672617,
            "range": "±0.26%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor arrayAccess()",
            "value": 1328,
            "range": "±142.01%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "porffor(i32) arrayAccess()",
            "value": 944,
            "range": "±173.53%",
            "unit": "ops/sec",
            "extra": "7 samples"
          },
          {
            "name": "node arithmetic()",
            "value": 146196109,
            "range": "±0.22%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor arithmetic()",
            "value": 1912093,
            "range": "±0.31%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor(i32) arithmetic()",
            "value": 1949022,
            "range": "±0.23%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "node mathFuncs()",
            "value": 127810899,
            "range": "±0.08%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "porffor mathFuncs()",
            "value": 1801734,
            "range": "±0.35%",
            "unit": "ops/sec",
            "extra": "96 samples"
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
          "id": "0fe381de059fb5202b08d918d6ce66eda5daffab",
          "message": "Merge branch 'main' of https://github.com/CanadaHonk/porffor",
          "timestamp": "2023-07-24T00:21:40+01:00",
          "tree_id": "d09b08cdc91043ada28a781bce3b8fb46b2639be",
          "url": "https://github.com/CanadaHonk/porffor/commit/0fe381de059fb5202b08d918d6ce66eda5daffab"
        },
        "date": 1690154649361,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 33.11,
            "range": "±0.30%",
            "unit": "ops/sec",
            "extra": "58 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 38.91,
            "range": "±0.92%",
            "unit": "ops/sec",
            "extra": "51 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 37.51,
            "range": "±0.17%",
            "unit": "ops/sec",
            "extra": "65 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 734,
            "range": "±0.15%",
            "unit": "ops/sec",
            "extra": "93 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1658,
            "range": "±0.29%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 912348,
            "range": "±0.13%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 909499,
            "range": "±0.12%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "node arrayAccess()",
            "value": 121136600,
            "range": "±0.31%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "porffor arrayAccess()",
            "value": 1216,
            "range": "±133.27%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "porffor(i32) arrayAccess()",
            "value": 682,
            "range": "±166.09%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "node arithmetic()",
            "value": 121365255,
            "range": "±0.20%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor arithmetic()",
            "value": 1563931,
            "range": "±0.78%",
            "unit": "ops/sec",
            "extra": "93 samples"
          },
          {
            "name": "porffor(i32) arithmetic()",
            "value": 1562625,
            "range": "±0.88%",
            "unit": "ops/sec",
            "extra": "92 samples"
          },
          {
            "name": "node mathFuncs()",
            "value": 105490113,
            "range": "±0.37%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor mathFuncs()",
            "value": 1504821,
            "range": "±0.35%",
            "unit": "ops/sec",
            "extra": "96 samples"
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
          "id": "ad2318445ee9ac178ec72a7adfcb0f687a19ded2",
          "message": "readme: update with array support",
          "timestamp": "2023-07-24T01:03:33+01:00",
          "tree_id": "c7e5c921f92d384fc261293159498d46a2bad55c",
          "url": "https://github.com/CanadaHonk/porffor/commit/ad2318445ee9ac178ec72a7adfcb0f687a19ded2"
        },
        "date": 1690157137903,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 39.61,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "68 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 48.22,
            "range": "±0.04%",
            "unit": "ops/sec",
            "extra": "63 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 44.67,
            "range": "±0.06%",
            "unit": "ops/sec",
            "extra": "59 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 873,
            "range": "±0.20%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1985,
            "range": "±0.07%",
            "unit": "ops/sec",
            "extra": "98 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 639540,
            "range": "±0.16%",
            "unit": "ops/sec",
            "extra": "93 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 711802,
            "range": "±0.37%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "node arrayAccess()",
            "value": 146297565,
            "range": "±0.19%",
            "unit": "ops/sec",
            "extra": "95 samples"
          },
          {
            "name": "porffor arrayAccess()",
            "value": 1446,
            "range": "±128.12%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "porffor(i32) arrayAccess()",
            "value": 945,
            "range": "±179.72%",
            "unit": "ops/sec",
            "extra": "8 samples"
          },
          {
            "name": "node arithmetic()",
            "value": 146187459,
            "range": "±0.17%",
            "unit": "ops/sec",
            "extra": "94 samples"
          },
          {
            "name": "porffor arithmetic()",
            "value": 1933935,
            "range": "±0.34%",
            "unit": "ops/sec",
            "extra": "96 samples"
          },
          {
            "name": "porffor(i32) arithmetic()",
            "value": 1964650,
            "range": "±0.27%",
            "unit": "ops/sec",
            "extra": "99 samples"
          },
          {
            "name": "node mathFuncs()",
            "value": 128225130,
            "range": "±0.09%",
            "unit": "ops/sec",
            "extra": "97 samples"
          },
          {
            "name": "porffor mathFuncs()",
            "value": 1810629,
            "range": "±0.34%",
            "unit": "ops/sec",
            "extra": "95 samples"
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
          "id": "0df3d22c7ba961482c7a82ef801ba803b3f32cb5",
          "message": "codegen: add compile-time allocator instead of grow\n\nalso added alloc memflag to memory store/loads. can still use runtime allocation (grow) via `-runtime-alloc` flag. creating (then accessing) arrays is >2x faster now!",
          "timestamp": "2023-07-24T13:30:42+01:00",
          "tree_id": "64cd3cadcbb9d3334d6952970e6b29e1b53e9233",
          "url": "https://github.com/CanadaHonk/porffor/commit/0df3d22c7ba961482c7a82ef801ba803b3f32cb5"
        },
        "date": 1690201951557,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 32.97,
            "range": "±0.82%",
            "unit": "ops/sec",
            "extra": "57 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 36.26,
            "range": "±0.80%",
            "unit": "ops/sec",
            "extra": "62 samples"
          },
          {
            "name": "porffor(i32) countPrimes(10000)",
            "value": 48.62,
            "range": "±0.99%",
            "unit": "ops/sec",
            "extra": "62 samples"
          },
          {
            "name": "node randoms(100000)",
            "value": 774,
            "range": "±1.07%",
            "unit": "ops/sec",
            "extra": "86 samples"
          },
          {
            "name": "porffor randoms(100000)",
            "value": 1621,
            "range": "±0.81%",
            "unit": "ops/sec",
            "extra": "89 samples"
          },
          {
            "name": "node factorial(100)",
            "value": 981932,
            "range": "±0.74%",
            "unit": "ops/sec",
            "extra": "90 samples"
          },
          {
            "name": "porffor factorial(100)",
            "value": 847162,
            "range": "±0.78%",
            "unit": "ops/sec",
            "extra": "87 samples"
          },
          {
            "name": "node arrayAccess()",
            "value": 157063309,
            "range": "±0.80%",
            "unit": "ops/sec",
            "extra": "91 samples"
          },
          {
            "name": "porffor arrayAccess()",
            "value": 1569674,
            "range": "±0.82%",
            "unit": "ops/sec",
            "extra": "90 samples"
          },
          {
            "name": "porffor(i32) arrayAccess()",
            "value": 1560420,
            "range": "±1.15%",
            "unit": "ops/sec",
            "extra": "88 samples"
          },
          {
            "name": "node arithmetic()",
            "value": 154367607,
            "range": "±0.85%",
            "unit": "ops/sec",
            "extra": "88 samples"
          },
          {
            "name": "porffor arithmetic()",
            "value": 1552308,
            "range": "±1.24%",
            "unit": "ops/sec",
            "extra": "88 samples"
          },
          {
            "name": "porffor(i32) arithmetic()",
            "value": 1516626,
            "range": "±0.88%",
            "unit": "ops/sec",
            "extra": "90 samples"
          },
          {
            "name": "node mathFuncs()",
            "value": 112924385,
            "range": "±0.93%",
            "unit": "ops/sec",
            "extra": "88 samples"
          },
          {
            "name": "porffor mathFuncs()",
            "value": 1483559,
            "range": "±0.75%",
            "unit": "ops/sec",
            "extra": "91 samples"
          }
        ]
      }
    ]
  }
}