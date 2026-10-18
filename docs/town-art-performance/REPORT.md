# Village renderer optimization · local continuation

The reviewed village candidate remains frozen at port 4175 and commit `3751cef343062667a2413d0add95bcb134331311`. This continuation uses a separate worktree and branch, `feature/town-art-perf`, served at **http://127.0.0.1:4176/**. The older performance baseline at port 4173 and the canonical Smart Rally checkout are unchanged. No push, merge or public deployment is authorized or performed.

The final 18 matched trials accept the optimization in both measured workloads. Median callback spacing improves from **25.0 to 16.6 ms on desktop** and **58.3 to 25.0 ms at native phone DPR3**, with full resolution and native antialiasing preserved. All functional, package, cache-quality and lifecycle checks pass. [Final performance evidence](final/PERFORMANCE_SUMMARY.md).

## Question and constraints

The reviewed village pass was visually stronger but measured approximately 25 ms median callback cadence, compared with 16.7 ms in the earlier scene. This pass investigates that regression while retaining the expressive humans, rounded painted vegetation, cream cottages, colored roofs, paths, flowers, court clarity and working animations. Draw-call counts alone are not an explanation of rendering cost.

Two real `gpt-6.1-sol` implementation workers handle rendering diagnosis/optimization and joint finish. An independent reviewer evaluates actual matched scene and human captures against the frozen village pass and the official references retained in the earlier art report.

## Diagnostic method

Controlled ablations use fresh isolated headless Chromium contexts with the same 1440 × 900 viewport and active third-shot-drop scene. They compare unchanged rendering, reduced pixel counts, multisampling, materials, texture sampling, static lighting, depth ordering, actor uploads and component visibility. Reduced resolution and hidden components are diagnostic options, not proposed art changes.

The first sweep showed that `gl.finish()` returned without waiting for the software driver's full raster work in this setup. Its approximately 0.3 ms values are submission measurements, not GPU completion. Ordinary playback callback cadence is the primary comparative metric. Additional readback probes are labeled completed-render-plus-readback proxies, not pure GPU time.

The final matched measurements use baseline/reviewed/optimized ordering in a counterbalanced sequence with other capture and test processes stopped. Software-renderer callback cadence is not displayed FPS or physical phone performance.

## Initial causal findings

- Turning multisample antialiasing off at full resolution restored approximately 16.6 ms median / 16.8 ms p95, versus 25 / 33.4 ms in the full control.
- Reducing pixel count also improved cadence, supporting a raster/sample-cost bottleneck.
- Changing actor materials and sorting opaque objects front to back did not independently restore the baseline. Actor uploads are included in the follow-up sweep.
- Baking static lighting and removing texture sampling improved tail cadence, but retained the roughly 25 ms median.
- Raw no-antialias rendering visibly worsens court, net, roof and fence edges. It is retained as diagnostic evidence, not accepted as the final visual result.

[Raw ablation evidence](../town-art/performance-study/ablation.json) includes the tested modes, backing-buffer dimensions, driver, context attributes, draw counts and page errors.

## Implemented result

The final cache renders the static village into a temporary native-MSAA color/depth target, then copies its resolved display-encoded color and depth into a compact persistent target. The temporary multisample attachments are disposed after each rebuild. Native antialiasing is already resolved into the stored image; live players, ball, shadows and translucent net still render to the unchanged antialiased canvas. Actual resolution, DPR, world geometry, materials, textures, lighting and animation remain intact. The implementation uses public Three.js targets and textures and adds no animation loop.

The cache signature covers camera/projection, viewport/backing buffer, world transforms and geometry versions, material/texture state, lights and background. Unsupported tone mapping, output color space, clipping, fog or textured backgrounds use direct rendering. Allocation or framebuffer failures also fall back to direct rendering. Owned temporary targets, resident targets, material clones and fullscreen geometry are disposed once.

The first cache retained its multisample attachments. The final three-version benchmark exposed a wrong earlier assumption: `visual-theme.js` explicitly allows DPR3, so the native 390 × 844 phone surface is **1170 × 2532**, not DPR2. The former 113.0 MiB persistent target exceeded its 96 MiB limit and bypassed caching. The full [pre-fix measurements](final/pre-memory-fix/PERFORMANCE_SUMMARY.md) are retained; that phone result was not accepted as an optimization.

The resolved cache uses **8 bytes per backing pixel between frames**. Desktop 1440 × 900 retains **9.89 MiB**; the native-DPR3 phone retains **22.60 MiB**. Rebuilds temporarily require the resident target plus the native-MSAA scratch target: **59.33 MiB desktop / 135.61 MiB phone** on the tested 4-sample renderer. Separate caps bound estimated resident allocation to **96 MiB** and estimated rebuild peak to **192 MiB**. Larger surfaces fall back to direct rendering at unchanged quality. These estimates cover cache attachments only; they exclude the unchanged default framebuffer and driver overhead. Physical-device memory behavior remains unmeasured.

The [final cache audit](CACHE_ACCEPTANCE.md) passes **72 cached/direct image cases**: 36 desktop and 36 native-DPR3 phone cases spanning all four cameras, contacts and travel phases. Maximum desktop mean channel error is **0.02493 / 255**, with **0.1574%** of pixels differing by more than two levels and **0.01096%** by more than 24. Phone maxima are **0.008065 / 255**, **0.05897%**, and **0.005637%**, respectively. Residual differences are confined to fine net/occlusion edges. Native MSAA remains 4; retained images are already resolved, so their storage target needs no multisample attachments. [Final numeric comparisons](verification/cache-pixel-memory-final.json) retain source hashes and resource audits. Twelve forced phone rebuilds kept memory counts stable, with one resident target, zero transient bytes after each build, zero cache failures and zero bypasses.

## Art finish and composition

Each leg now has one swept thigh–knee–calf surface rather than overlapping cylinders and a knee cap. Fitted open-ended sleeves and trimmed hidden upper-arm skin remove exposed shoulder wedges. Original semantic joint handles, hand/paddle targets, trajectory/contact logic, handedness and shared clock remain authoritative. The worker audited **396 poses** with zero shoulder/wrist/paddle anchor change, finite normals, no inverted leg triangles and batch error below 1.2e-7. The surface refinement removes 48 triangles per athlete; its isolated CPU change was approximately +0.016 ms for four moving actors. [Pose verification](../town-art/perf-seam-pass/verification.json).

The expanded camera audit found an existing clubhouse wall obscuring the low behind-green camera in the frozen reviewed scene. The coral clubhouse, path, gate and garden move right, and two trees shift clear of its roof. The blue cottage balances the opposite side. No camera or motion solver changes were necessary. All four game cameras and both phone orientations were reviewed after the move.

The original art-direction judgment remains: the rounded expressive humans, cream cottages, colored roofs, painted foliage and composed village are a substantial move toward the requested modern Pokémon-like human world. They remain original procedural assets, with simpler garment, face and architectural detail than the official reference. Official reference images are review material only, not runtime assets.

## Local identity

- Runtime source: `091451b1b547b1271cccb670fd97c0b343d614e8`.
- Stamped runtime/package source: `efbf53b056becd1bee575fa0633ee6af70c28b38`.
- Package build revision: `c354c3c6cbf52ca2040c46a7c4d6e59b97412a88`.
- Runtime SHA-256: `a5da7c29811b5a80f0f65ca444601922e71dea282a05545a7874fc9d97e25884`.
- Package manifest SHA-256: `0a41d77f3543744a90381c83a61b4bd99ae7738aa3cd60af3f1b75030dc15802`.
- Package: 110 runtime files, 1,913,496 bytes; cache `pickleboard-static-v28`. This is 17,603 bytes above the reviewed village package.

The original runtime/package was frozen before the host disconnect. On resumption, all comparison servers were restored on their original ports and source/runtime digests rechecked. [Resumption identities](verification/resumed-source-identities.json) preserve the v27 starting point. The memory fix above produced the final v28 identity; the comparison roots remain unchanged.

## Visual and motion acceptance

[Independent review](INDEPENDENT_REVIEW.md) records two independent image inspections, including a fresh reviewer explicitly using `gpt-6.1-sol`. Both accepted the continuation's direction, joint continuity and cleared reverse view, with no critical visible blocker. Both explicitly retain the reference-fidelity caveats above. The independent review covers stills, not runtime or timing certification.

The final [comparison gallery](review.html) includes before/after scene and human captures, all court cameras, phone layouts and paired 24-second four-play videos. The lead inspected the final native captures and sampled the recorded motion at three frames per second across serve/return, drop, drive and fifth-shot drop. Ball travel and body/paddle changes remain coherent in the sampled sequence; no stationary cached-player imprint, broad depth occlusion error, scenery flicker or disappearing player was visible. These samples supplement the precise automated contact/shared-clock checks; they cannot establish every displayed frame's timing. The `.webm` preserves the full recording for review.

## Verification

The unchanged art/motion implementation originally passed 234 unit, 28 renderer and 26 offline scenarios. The native-DPR3 cache refinement adds one meaningful renderer case and a strict evidence-path brand-check unit case; its final verification follows.

- **235/235 unit tests**, static references and brand checks passed: [check-v28.log](verification/check-v28.log).
- **65 generated asset paths** previously regenerated and compared; this cache-only refinement changes no generated asset bytes: [generated.log](verification/generated.log).
- **29/29 renderer tests** passed on v28, including contact/handedness, shared clock, all-play camera fitting, phone ball visibility and the five cache tests: [renderer-v28.log](verification/renderer-v28.log).
- **28/28 offline package scenarios** passed: 14 each in isolated Chromium and WebKit, including direct launches, version upgrades, v27-to-v28 cache upgrade, saved drafts and Smart Rally preservation: [package-v28.json](verification/package-v28.json).
- Final v28 desktop, all-camera, phone, native-DPR3 phone, athlete and four-play motion captures completed with empty error arrays: [screens](final/screens/capture.json), [native phone](final/native-phone/capture.json), [athlete/detail provenance](final/details/detail-provenance.json), [motion](final/motion/motion-report.json).
- The final cache audit separately passes **five tests / 72 cached-direct image cases**, plus **30 lifecycle iterations with one forced context loss**, stable resources and clean shutdown: [cache acceptance](CACHE_ACCEPTANCE.md), [test report](verification/cache-memory-final.json), [lifecycle](verification/lifecycle-memory-final.json).
- Exact v28 artifact verification passed: [artifact-v28.json](verification/artifact-v28.json).

### Evidence chronology

`verification/cache-checks.log` and `cache-pixel-comparison-initial.json` intentionally retain the early failed comparison that led to the color-encoding correction. They are diagnostic history, not final acceptance. The later 28-test renderer run passed all four cache tests on the frozen runtime. The resumed [cache acceptance](CACHE_ACCEPTANCE.md) re-ran all four tests and reproduced the same 36-case pixel maxima. The [30-cycle lifecycle](verification/lifecycle-30-context-loss.json) included one forced graphics-context loss and recovered successfully: one live canvas, unchanged 39 geometries / 8 textures, no pending animation callbacks, zero errors and zero failures. These checks passed on the same frozen runtime without code changes.

### Astra art-direction acceptance

A fresh reviewer explicitly using `gpt-6-astra` independently inspected the real official references and final native captures. Its [scoped visual acceptance](ASTRA_VISUAL_ACCEPTANCE.md) finds no remaining visual blocker worth changing the frozen runtime during this acceptance pass. It confirms the meaningful improvement in rounded human silhouettes, continuous joints, village composition and clear reverse camera, while retaining specific limits around broad empty horizons, hard path margins, faceted/lobed foliage, sparse cast shadows and neutral faces. This is directional acceptance of an original stylized village, not a claim to match the reference's production finish. The reviewer subsequently reopened six refreshed v28 images, including both native-DPR3 phone orientations, and confirmed the acceptance with no visible compact-cache regression.

### Final benchmark method

The resumed helper verifies every served runtime file against its named checkout before starting Chromium, and records the served metadata and digest. Each candidate runs in a fresh isolated context, with service workers blocked. Desktop and phone-emulated trials each use nine runs: baseline/reviewed/optimized, reviewed/optimized/baseline, optimized/baseline/reviewed.

All candidates use the same third-shot-drop play and overhead camera, 1.2-second active warm-up, reset, then six measured seconds at **0.5× playback**. Start/end assertions prove the window stays active and does not cross a hold or loop transition. This corrects an ambiguity in earlier six-second measurements of a roughly 4.5-second play; their values are retained as diagnostic history, not substituted for this final comparison. RAF callback cadence is reported alongside actual application render-call cadence. CPU timings encompass the whole public render call, including the optimized cache's work, and totals per elapsed second make invocation counts explicit. None of these quantities is pure GPU time or physical-device displayed FPS.

Desktop viewport is 1440 × 900 DPR1. Phone emulation is 390 × 844 device DPR3, with the application's existing render DPR cap of 3. Three repeats per version provide a descriptive controlled comparison, not statistical certification. Runtime files remain frozen for all trials.

### Final benchmark result

| Surface / version | RAF median / p95 (ms) | Mean render-call interval (ms) |
| --- | ---: | ---: |
| Desktop baseline | 24.9 / 25.1 | 21.71 |
| Desktop reviewed | 25.0 / 33.4 | 26.64 |
| Desktop optimized | 16.6 / 16.9 | 14.09 |
| Phone DPR3 baseline | 50.0 / 58.4 | 50.93 |
| Phone DPR3 reviewed | 58.3 / 58.4 | 55.00 |
| Phone DPR3 optimized | 25.0 / 33.4 | 26.75 |

Each number is the median of three per-run statistics, not a pooled percentile. Relative to the reviewed village, mean render-call intervals fall **47.1% on desktop** and **51.4% on native-DPR3 phone**. All 18 runs verified the active workload and exact served runtime bytes, with zero page errors. No optimized run rebuilt or invalidated its static cache during measurement. Both surfaces kept native 4× MSAA, exact original backing resolution, zero failures/bypasses and zero transient cache bytes after build.

The initial setup remains a tradeoff: median scene readiness is 907 → 976 ms on desktop and 936 → 1030 ms on phone, reviewed → optimized. Higher steady-state render frequency also increases JavaScript submission CPU per wall second. These software-renderer results support this candidate, while physical-phone frame pacing and memory remain unmeasured. The [full summary](final/PERFORMANCE_SUMMARY.md) retains per-run ranges, CPU totals, cache statistics and the superseded phone fallback diagnosis.

[Final source identities](verification/final-source-identities.json) and [HTTP preview checks](verification/final-preview-http.json) confirm that 4173, 4175 and the canonical Smart Rally checkout remain at their original source/runtime identities. The final evidence commit adds reports, captures and validation tooling only; it does not restamp or change the tested runtime. No remaining implementation or verification blocker was found within the tested scope.
