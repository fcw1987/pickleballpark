# Pre-memory-fix matched performance · 18 October 2026

This is retained **pre-memory-fix evidence**, not final acceptance. The native DPR3 phone result led to a subsequent cache-memory revision.

The optimized village materially improves the measured **desktop** active-render workload. The full-quality **DPR3 phone-size** workload exceeds the cache memory cap and uses direct rendering; its small improvement over the reviewed village does **not** establish recovery to baseline phone performance.

| Surface / version | RAF median / p95 (ms) | RAF mean (ms) | Actual render-call mean (ms) | Render calls / observer intervals |
| --- | ---: | ---: | ---: | ---: |
| Desktop baseline | 24.9 / 25.1 | 21.49 | 21.51 | 280–282 / 279–281 |
| Desktop reviewed | 25.0 / 33.4 | 26.62 | 26.66 | 227–228 / 226–227 |
| Desktop optimized | **16.6 / 16.8** | **13.97** | **13.97** | 430–432 / 429–431 |
| Phone DPR3 baseline | 50.0 / 50.3 | 49.72 | 49.79 | 122–123 / 121–122 |
| Phone DPR3 reviewed | 58.3 / 58.4 | 55.20 | 55.21 | 110–111 / 109–110 |
| Phone DPR3 optimized | 50.1 / 58.4 | 53.72 | 53.76 | 113 / 112 |

Each number is the median of three per-run statistics, rather than a pooled percentile. Counts are ranges across the three runs. One phone baseline repeat had RAF p95 58.3 ms rather than 50.3 ms; all per-run values remain in the raw evidence. Desktop optimized render-call means were 13.973, 13.993 and 13.963 ms, versus reviewed 26.574, 26.658 and 26.674 ms.

Desktop RAF median/p95 fell **33.6% / 49.7%** relative to reviewed, and actual render-call mean fell **47.6%**. Against the older baseline in this matched active workload, optimized actual render-call mean fell **35.0%**. Phone DPR3 actual render-call mean fell only **2.6%** against reviewed and remained **8.0% higher** than baseline; its p95 RAF did not improve. A quantized median alone would overstate the phone improvement.

## Workload and interpretation

The two suites each use nine sequential runs: baseline, reviewed, optimized / reviewed, optimized, baseline / optimized, baseline, reviewed. This balances each version once in each position within a three-run block. Each run uses a fresh isolated headless Chromium context, service workers blocked, the same `third-shot-drop` play and overhead camera, 1200 ms active warm-up, pause/reset, then six seconds at **0.5× playback rate**. The playback rate is identical across all versions. Every run starts at play time zero and ends playing, outside a hold, in iteration zero, at approximately 3.00–3.02 seconds. Measured wall windows are 6.009–6.047 seconds. No page errors occurred.

The older saved six-second 1× evidence is **not directly comparable**: it covers a different active workload. It records a 4.458-second timeline and iteration one at the end. The session's loop/hold path can stop application rendering while a separate RAF observer continues, and those saved runs contain more observer intervals than render calls (for example baseline 347 intervals versus 229 render calls). The new half-speed window explicitly avoids a loop transition. The old 16.7 ms baseline must not be combined with the new optimized measurements.

RAF timestamps are browser callback scheduling timestamps. Their quantized distribution explains why a 16.6 ms median can coexist with a 13.97 ms mean and approximately 431 render calls in a six-second window. The separate public `renderer.render` invocation intervals corroborate the observed cadence. **Neither metric is displayed FPS or physical GPU timing.** The browser reports Chromium 149.0.7827.55 and ANGLE Vulkan **SwiftShader** on an Apple M3 Max host; the phone case is a browser viewport/DPR emulation, not a physical phone. Three repeats provide descriptive evidence, not statistical certification or a hardware-wide guarantee.

CPU timings wrap the complete public render call, including the optimized cache's signature/copy/live work; internally captured original render calls do not add nested wrapper samples. Median render-wrapper CPU time is about 0.2 ms on desktop for every version. Optimized render CPU rises from reviewed 8.05 to 14.32 ms per wall second because the application renders many more frames; apply CPU rises from 13.33 to 25.33 ms per wall second. These submission/JavaScript measurements do not measure GPU completion and do not explain the raster savings by themselves. Median first-scene readiness is 665 / 893 / 951 ms for baseline / reviewed / optimized desktop, including initial shader/cache setup; the steady-state improvement has an initial setup and memory tradeoff.

## Resolution, MSAA and memory

Desktop uses 1440 × 900 CSS/backing pixels, device/render DPR1 and four native MSAA samples on all versions. Optimized cache statistics show one build, 510–512 total reuses including warm-up, zero failures/bypasses and **51,840,000 bytes (49.44 MiB)** estimated resident cache allocation.

The phone suite requests 390 × 844 CSS pixels and device DPR3. Actual full-quality rendering is **DPR3, 1170 × 2532 backing pixels**, with four MSAA samples on every version. The task's expected DPR2 cap was incorrect: `visual-theme.js` explicitly configures `maxPixelRatio: 3`, overriding the playback module's fallback value of two. The optimized cache estimate is **118,497,600 bytes (113.01 MiB)**, exceeding its **100,663,296-byte (96 MiB)** cap. All three optimized repeats show zero builds/reuses, zero resident bytes, zero failures and `disabledReason: cache-memory-budget`, while continuing full-quality direct rendering. This suite validates the intended fallback and also exposes its performance limitation. Resolution and memory policy were not changed to improve the result.

## Identity and retained evidence

Before each suite, all **108 digest-covered runtime files per version** were fetched from their actual preview URL and byte-compared to the designated checkout. Served and local runtime digests match. The 108 count excludes four generated identity files by the runtime digest's established exclusions; it is distinct from packaged-file counts. Local runtime digest was rechecked after every run. Runtime files and old evidence were not edited.

| Version | Preview | HEAD | Stamped source | Runtime SHA-256 |
| --- | --- | --- | --- | --- |
| Baseline | 4173 | `08401fca5150f1ccfcb482a50953b5bbd340fe6a` | `39670b72c532b256b96f2554d13065ef783d2223` | `5b890e14e1690cdb2c54d69e7f5c8933c71c506c10d4cb76d742446d2d95e129` |
| Reviewed | 4175 | `3751cef343062667a2413d0add95bcb134331311` | `b65504187f8e9e741908dd07690db0b79158a960` | `88a8f82f42eb98c0fbd4e7ef3b6bd7c97790d13091ca04d3c76168b9a552a748` |
| Optimized | 4176 | `8aafabf9401d4fad3f807bcc16a7ecea27606444` | `9ded1d86e728124598905b29700374448817af89` | `62b48eed88fb40637b3eced00faf975baf171bdafc38c28ce0a8c63a59d7d513` |

- [Desktop raw records](matched-desktop.json), measured 16:19:04–16:20:18 UTC.
- [Phone DPR3 raw records](matched-phone.json), measured 16:20:36–16:21:50 UTC.
- [Machine-readable summary](matched-summary.json).
- [Benchmark helper](../../../../tools/art-overhaul-matched-performance.mjs).

All benchmark contexts and browser processes were closed after the suites. Only the benchmark helper and evidence were changed; no commits, push, merge, deployment, user-browser automation or permission/security changes were performed.
