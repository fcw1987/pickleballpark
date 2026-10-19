# Pickleboard instructional stroke pass

The scoped 3D stroke improvement is implemented and independently accepted from actual rendered phase sheets and dense motion samples. Pickleboard naming is restored, including the existing village sign. The accepted environment is retained. The default 2D presentation matches frozen baseline signatures; the 3D renderer explicitly opts into the new choreography.

Forehand and backhand use distinct preparation/contact sides and finishing arcs. Lob starts low and lifts to a high finish. World-space stance feet, fixed-length arm/leg IK, continuous paddle contact paths and gradual facing/recovery remove the observed skating, limb stretching and segment-boundary snaps. Ball paths, the shared clock, authoring/compiler/storage and Smart Rally mechanics are preserved.

## Frozen local build

- Worktree: `pickleboard-strokes`; branch `feature/stroke-instruction`.
- Runtime source: `50a49a5ce7d795e39844cfe0dce288930cf2c485`.
- Metadata stamp: `4c4ea9e00f0667a5718aad76bcc709fe2bc8d793`.
- Package commit: `2b4559abe460681e166d2d1a883119c0504b841d`.
- Runtime digest: `667bb8a0dd3d0d84fbf638be3b89f612f4f9a08d141df2308ed7b69fe4ad2998`.
- Cache: `pickleboard-static-v30`; 110 packaged runtime files, 1,926,977 bytes.
- Candidate preview: `http://127.0.0.1:4177/`. The accepted environment baseline remains unmodified in `pickleboard-perf`.
- Original stroke captures and twelve comparative performance trials describe v29 (`a951019ab0833dc11277dfd1e6199c69c4477978`, runtime digest `1342f7a03c16736fa9eba5509d244fd166697bcedf43401872aa1436bb24f2b6`). They retain their original provenance; final v30 compatibility evidence is separately identified.

## Completed evidence

- Final Node 24 validation: 247 unit tests and 107 referenced static assets pass. Brand integrity passes after explicitly preserving the two named historical performance reports; their original baseline product labels are not rewritten.
- `npm run check:generated`: all 65 generated paths match semantically; 43 PNGs differ only in lossless compression bytes under the newer Node/zlib runtime. No generated source asset was changed.
- Exact staged deployment artifact verification passed.
- Final v30 browser gate: 45/45 tests pass, with no skipped, flaky or unexpected results (`verification/browser-final-v30.json`). This covers renderer, service worker, diagnostics, branding and interface behavior.
- Final v30 lifecycle gate: 30/30 cycles in Chromium and 30/30 in WebKit pass. Both recover forced context loss, retain 39 geometries and 8 textures, and settle with no pending animation frames, errors or failures (`verification/lifecycle-final-v30.json`).
- Final v30 offline-package gate: all 32 scenarios pass, 16 per engine. This includes direct upgrades from the exact v29 review package, saved custom plays, eight offline lessons, and applicable Smart Rally checks. Each scenario verifies all 110 package hashes and reopens the cached application after its owned server stops (`verification/package-final-v30.json`).
- Nine focused stroke tests include both hands, fixed rendered limb lengths, stance support, contact tangents, default 2D compatibility and all contacts in a generated 99-shot rally.
- Final source audit confirms nine authoring, compiler, storage, Smart Rally, catalog and ball modules remain byte-identical to the accepted environment baseline; `three-d-core.js` differs only in its first product-name comment (`verification/preserved-mechanics-v30.json`). The compatibility fixture also retains exact compiled Play, event, ball-sample and default-2D hashes.
- Original v29 capture: 14 cases, four dense sequences, native DPR3 phone, actual 0.25x slow clips, zero capture errors and unchanged runtime digest. Numeric checks found contact error below 1e-15 m, seek history error zero, and maximum sampled adjacent-boundary paddle displacement 7.21e-6 m. A later capture audit found that fixture loading could restore player handedness; final v30 evidence explicitly asserts both token and rendered-rig handedness on every frame. Older left-labelled images are not independent proof of left-handed rendering.
- Fresh final v30 capture and numeric acceptance cover 17 cases, including verified left-handed core strokes and both edge-contact hands. Contact error is at most 9.16e-16 m, ordinary and single-apply shuffled history errors are zero, and maximum sampled boundary paddle displacement is 9.24e-6 m. No capture or numeric errors occurred. All 30 matched right-handed forehand/backhand/lob frames are pixel- and pose-identical between v29 and v30; delivered clips retain their original v29 labels (`verification/main-stroke-pixel-pose-comparison-v30.json`). The edge contact miss improves from 0.22048 m to approximately 5e-16 m, with source documents, compiled Play, events and sampled ball positions unchanged.
- Independent Astra review accepted the final scoped result after inspecting unobstructed before/after images, both 28-frame dense overhead edge sequences and freshly verified left-handed forehand/backhand/lob sheets. No visible contact, jump or limb-stretch blocker remained. See [FINAL_REVIEW.md](FINAL_REVIEW.md), its final compatibility supplement, the [review gallery](review.html) and [capture notes](../stroke-review/CAPTURE_NOTES.md).
- Twelve matched v28-to-v29 performance trials completed (six desktop, six native-DPR3 phone), with raw files `verification/performance-desktop.json` and `verification/performance-phone.json`.
- Seven review images/videos were successfully saved to Library; confirmed identities are in `verification/library-deliverables.json`.

## Performance

The original v28-to-v29 counterbalanced baseline/candidate trials ran sequentially in an isolated Chromium process, three repetitions per version at each viewport. All twelve trials verified the served runtime bytes and an active half-speed replay window. The runtime digest stayed unchanged.

| Metric (median of three per-run statistics) | Accepted baseline | Candidate |
| --- | ---: | ---: |
| Desktop render-call interval median / P95 | 14.2 / 14.9 ms | 14.2 / 14.8 ms |
| Phone DPR3 render-call interval median / P95 | 27.2 / 27.9 ms | 27.2 / 27.9 ms |
| Desktop animation + render CPU | 44.108 ms/s | 45.298 ms/s |
| Phone animation + render CPU | 25.923 ms/s | 27.151 ms/s |

Animation sampling remains approximately 0.4 ms median / 0.5 ms P95 per call. Combined sampled CPU rises 2.7% desktop and 4.7% phone; observed cadence is effectively unchanged. All runs retain 17 draw calls and 11,090 triangles, native resolution and 4-sample antialiasing, with zero cache rebuilds during the measurement window and zero page errors. Persistent cache estimates stay 9.89 MiB desktop / 22.60 MiB phone, with zero transient bytes between rebuilds.

These are host SwiftShader callback/call timings, not physical phone frame rate or completed GPU timings. Raw reports and `verification/performance-summary.json` retain methodology, source identities and per-run values.

The final v29-to-v30 compatibility spot check used one sequential pair per viewport, with actual served bytes and active replay verified. Desktop render-call median/P95 changed from 14.2/15.0 ms to 14.2/14.9 ms; native-DPR3 phone changed from 26.9/27.9 ms to 27.3/28.2 ms. Combined sampled CPU changed by +3.02% desktop and +3.16% phone. Both retained 17 draw calls and 11,090 triangles, with no page errors. These four observations are descriptive spot checks, not repeated statistical certification; the phone difference is retained rather than reported as identical. See `verification/performance-postfix-summary.json` and the two raw `performance-postfix-*.json` reports.

## Final validation status

Execution was interrupted twice by a disconnected host. The resumed v29 branding/interface checks passed 9/9 and lifecycle checks passed 60/60. These are retained with `v29-before-contact-fix` filenames rather than attributed to v30. The initial browser run's service-worker failures came from stale v25 test expectations; tests now explicitly check v30 and retain their other assertions and protected source hashes.

The expanded history regression exposed a test-runtime-specific discrepancy on host Node 22.4 default optimization. The unchanged tests pass 13/13 on installed Node 24.11 and 24.19 and on Node 22.4 with the per-process `--no-maglev` diagnostic. Both actual browser engines also pass the strict original 810-sample sequence and two additional 810-sample instrumented sequences: rendered limb errors remain below 1e-15 m and fresh/reused rigs agree exactly. The failed matrix-refresh experiment was removed; no production route refactor or speculative optimization workaround remains. See `verification/node-runtime-comparison.json`, `verification/browser-history-diagnostic.json` and [the compatibility classification](OVERHEAD_SHORT_HOP_CLASSIFICATION.md). The precise compiler mechanism is not established. Final checks use the already-installed Node 24.11 runtime with a command-local PATH; no installation or global setting change was made.

Final v30 renderer/interface, lifecycle, all 32 offline-package scenarios, fresh capture/numeric acceptance and independent visual review pass as recorded above. Performance spot checks retain the same rendering workload and the observed differences recorded above. Final live preview verification checks all 108 digest-covered files against the frozen source with no mismatches (`verification/served-runtime-final-v30.json`). Package verification is recorded separately from the intentionally unchanged local source stamp.

## Limits

Reviewers inspected dense actual frames rather than continuously playing the WebM recordings. Phone framing supports broad stroke identity, not detailed wrist instruction. Stances remain stylized and fairly square. The overhead/short-hop combination is schema-valid, importable and selectable in the ordinary builder; it must not be dismissed as invalid imported input. Its seven-foot contact conflicts with the separate rally-rule validator's definition of a low short hop. The resumed pass repairs the 3D pose selection for that accepted source state while preserving its compiled ball path, event timing and default 2D presentation. The rule-validation conflict remains explicit rather than silently rewriting saved plays. See the compatibility audit and final review supplement for the exact evidence. Spin physics was deferred to preserve existing rallies; [SPIN_ASSESSMENT.md](SPIN_ASSESSMENT.md) defines a bounded opt-in proposal.
