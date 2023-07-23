window.BENCHMARK_DATA = {
  "lastUpdate": 1690122626630,
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
          "id": "ace1cb1dec46a0c83a7ec42d4c6f3bbf13338d89",
          "message": "bench ci: add perms to write\n\ntest262: 10.84% | 🧪 48843 | 🤠 5295 | ❌ 942 | 💀 8183 | 🧩 143 | 💥 3344 | 📝 30936",
          "timestamp": "2023-07-23T15:28:42+01:00",
          "tree_id": "a6312ce910036c7d1ca6eced6029f2e3fffc85b4",
          "url": "https://github.com/CanadaHonk/porffor/commit/ace1cb1dec46a0c83a7ec42d4c6f3bbf13338d89"
        },
        "date": 1690122626609,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "node countPrimes(10000)",
            "value": 33.12,
            "range": "±0.87%",
            "unit": "ops/sec",
            "extra": "57 samples"
          },
          {
            "name": "porffor countPrimes(10000)",
            "value": 36.58,
            "range": "±0.84%",
            "unit": "ops/sec",
            "extra": "62 samples"
          },
          {
            "name": "node randoms(10000)",
            "value": 7969,
            "range": "±0.71%",
            "unit": "ops/sec",
            "extra": "88 samples"
          },
          {
            "name": "porffor randoms(10000)",
            "value": 15834,
            "range": "±1.04%",
            "unit": "ops/sec",
            "extra": "85 samples"
          }
        ]
      }
    ]
  }
}