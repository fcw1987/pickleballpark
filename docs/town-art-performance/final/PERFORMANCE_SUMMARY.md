# Final matched performance acceptance · 18 October 2026

The frozen optimized village improves both measured desktop and **native DPR3 phone-size** active-render workloads, retaining full resolution and native four-sample MSAA. Its resolved-cache revision fixes the phone memory fallback exposed by the retained [pre-memory-fix evidence](pre-memory-fix/PERFORMANCE_SUMMARY.md). No remaining performance blocker was found in these two software-renderer workloads; this is not a physical-device or displayed-FPS certification.

| Surface / version | RAF median / p95 (ms) | RAF mean (ms) | Mean render-call interval (ms) | Render calls / observer intervals |
| --- | ---: | ---: | ---: | ---: |
| Desktop baseline | 24.9 / 25.1 | 21.69 | 21.71 | 273–279 / 272–278 |
| Desktop reviewed | 25.0 / 33.4 | 26.62 | 26.64 | 226–228 / 225–227 |
| Desktop optimized | **16.6 / 16.9** | **14.08** | **14.09** | 427–429 / 426–428 |
| Phone DPR3 baseline | 50.0 / 58.4 | 50.92 | 50.93 | 117–121 / 116–120 |
| Phone DPR3 reviewed | 58.3 / 58.4 | 54.92 | 55.00 | 110–111 / 109–110 |
| Phone DPR3 optimized | **25.0 / 33.4** | **26.74** | **26.75** | 226–229 / 225–228 |

Each summary value is the median of three per-run statistics, rather than a pooled percentile. Counts are ranges across those runs. Optimized desktop mean render-call intervals were 14.133, 14.090 and 14.016 ms; native DPR3 phone means were 26.751, 26.374 and 26.768 ms. All raw run values are retained.

Against reviewed, desktop RAF median/p95 fell **33.6% / 49.4%**, with mean render-call interval **47.1% lower**. Native DPR3 phone RAF median/p95 fell **57.1% / 42.8%**, with mean render-call interval **51.4% lower**. Against the older baseline in the same final active workload, optimized mean render-call interval was **35.1% lower on desktop** and **47.5% lower on phone**.

## Matched workload and limits

Each suite has nine sequential runs: baseline, reviewed, optimized / reviewed, optimized, baseline / optimized, baseline, reviewed. Each version appears once in each position within a three-run block. Every run uses a fresh isolated headless Chromium context with service workers blocked, the same `third-shot-drop` play and overhead camera, 1200 ms active warm-up, pause/reset, then six seconds at **0.5× playback rate**. Every run starts at play time zero and ends playing, outside a hold, in iteration zero, at approximately 3.000–3.021 seconds. Wall windows are 6.002–6.051 seconds. All 18 active-window checks passed, with **zero page errors**.

The older saved six-second 1× evidence is not directly comparable. It records a 4.458-second timeline, iteration one at the end, and more observer intervals than actual render calls (for example baseline 347 intervals versus 229 calls). Its loop/hold path can stop application rendering while the separate RAF observer continues. The final half-speed window avoids that transition. The old 16.7 ms baseline must not be combined with these final measurements.

RAF timestamps describe browser callback scheduling, whose quantized distribution permits a 16.6 ms median with a 14.08 ms mean and approximately 428 render calls in six seconds. Separate public `renderer.render` invocation timestamps corroborate cadence. **Neither metric is displayed FPS or physical GPU timing.** Chromium 149.0.7827.55 reports ANGLE Vulkan **SwiftShader**, on an Apple M3 Max host. The phone workload emulates viewport/DPR in that browser; it is not a physical phone. Three repeats give descriptive evidence, not statistical certification or a hardware-wide guarantee.

CPU timings wrap the complete public render call, including cache signature/copy/live work; internally captured original render calls do not add nested wrapper samples. Desktop median render-wrapper CPU time is approximately 0.2 ms for every version. With more frames rendered, optimized render submission CPU rises from reviewed **8.19 to 15.00 ms per wall second** on desktop and **5.15 to 9.26** on phone; apply CPU rises from **13.26 to 25.48** and **7.49 to 14.60** respectively. These JavaScript/submission measurements do not measure GPU completion. Median first-scene readiness is **665 / 907 / 976 ms** on desktop and **714 / 936 / 1030 ms** on phone for baseline / reviewed / optimized. The steady-state gain retains an initial setup and memory tradeoff.

## Full-quality cache and memory acceptance

| Surface | CSS / backing pixels | Device / render DPR | Native / build MSAA | Estimated resident / peak extra cache memory |
| --- | --- | --- | --- | --- |
| Desktop | 1440 × 900 / 1440 × 900 | 1 / 1 | 4 / 4 | 10,368,000 / 62,208,000 bytes (**9.89 / 59.33 MiB**) |
| Phone | 390 × 844 / 1170 × 2532 | 3 / 3 | 4 / 4 | 23,699,520 / 142,197,120 bytes (**22.60 / 135.61 MiB**) |

Actual resolution and native MSAA match across all three versions. `visual-theme.js` configures a DPR3 cap; the playback module's fallback value of two does not apply. The new cache builds at native MSAA, then copies resolved display-encoded RGBA8 color and depth into a single-sample resident target. Moving players, ball, shadows and net remain live in the native MSAA framebuffer. Resident samples zero describes storage after native resolution, not a lower-quality static render.

All six optimized runs record **cache enabled, zero failures/bypasses, no disabled reason, zero transient bytes after warm-up and after sampling**. Desktop has one build before and after sampling and 427–429 additional cache reuses. Phone has two builds and one prior scene/view invalidation already present before sampling; those counts remain unchanged throughout the measured window, with 226–229 additional reuses. No cache rebuild or invalidation occurred during any measured six-second window.

Estimated cache allocations remain below **96 MiB resident / 192 MiB rebuild peak** caps. The estimates cover cache color/depth attachments, including temporary MSAA build storage; they exclude the existing default framebuffer and driver overhead. The temporary target is disposed after each build. Independent cache quality/lifecycle evidence covers pixel equivalence and repeated resource disposal; this timing suite confirms reuse and memory statistics in the exact active workload.

The retained pre-memory-fix DPR3 suite had zero builds/reuses and `cache-memory-budget` fallback. It measured optimized mean render-call interval 53.76 ms, only 2.6% below its matched reviewed scene and 8.0% above its matched baseline. The failure remains visible rather than being replaced with a lower-DPR substitute. The final suite uses the same full-resolution DPR3 workload, with its own fresh matched controls.

## Frozen identity and evidence

Before each suite, **108 digest-covered runtime files per version** were fetched from the actual preview URLs and byte-compared with the designated checkout; served and local digests match. The count follows established identity-file exclusions and differs from the packaged-file count. Each local runtime digest was rechecked after every run. Runtime files and old evidence were not edited by this acceptance task.

| Version | Preview | HEAD | Stamped runtime source | Runtime SHA-256 |
| --- | --- | --- | --- | --- |
| Baseline | 4173 | `08401fca5150f1ccfcb482a50953b5bbd340fe6a` | `39670b72c532b256b96f2554d13065ef783d2223` | `5b890e14e1690cdb2c54d69e7f5c8933c71c506c10d4cb76d742446d2d95e129` |
| Reviewed | 4175 | `3751cef343062667a2413d0add95bcb134331311` | `b65504187f8e9e741908dd07690db0b79158a960` | `88a8f82f42eb98c0fbd4e7ef3b6bd7c97790d13091ca04d3c76168b9a552a748` |
| Optimized | 4176 | `c354c3c6cbf52ca2040c46a7c4d6e59b97412a88` | `091451b1b547b1271cccb670fd97c0b343d614e8` | `a5da7c29811b5a80f0f65ca444601922e71dea282a05545a7874fc9d97e25884` |

- [Desktop raw records](matched-desktop.json), measured 16:37:31–16:38:45 UTC.
- [Native DPR3 phone raw records](matched-phone.json), measured 16:39:00–16:40:15 UTC.
- [Machine-readable summary](matched-summary.json).
- [Retained pre-memory-fix measurements](pre-memory-fix/PERFORMANCE_SUMMARY.md).
- [Benchmark helper](../../../tools/art-overhaul-matched-performance.mjs).

Both benchmark browser processes and all contexts closed successfully. The acceptance task changed only its benchmark helper and evidence; no commits, push, merge, deployment, user-browser automation or permission/security changes were performed.
