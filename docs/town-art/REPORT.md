# Human village court · local candidate

Open the [review gallery](review.html) or the application at **http://127.0.0.1:4175/**. The previous preview at port 4173 remains unchanged.

This is an isolated continuation in the task-5 clone, branch `feature/town-court-art`, starting from reviewed candidate `08401fca5150f1ccfcb482a50953b5bbd340fe6a`. The canonical Smart Rally baseline `fc46c60` was not modified. No push, merge or public deployment was performed.

## What makes it closer

The scene now has original cream cottages with colored roofs, windows, eaves, connected paths, capped pale fences, flower borders, a paddle sign, and rounded painted foliage. Larger heads, almond eyes, deliberate hair and headwear, softer silhouettes and brighter face light give the athletes a coherent human character style. The court remains dominant and all scenery stays outside the playing area and runoff.

The actual official environment and human reference images were inspected before work. Two real `gpt-6.1-sol` implementation workers handled world and athlete art; a third independent reviewer drove corrections to eyes, anatomy, lighting, planting and composition. [Detailed critique and iteration record](ART_REVIEW.md).

The original articulated strokes and animation solver, physical paddle/contact alignment, handedness, ball trajectory, shared deterministic clock, 2D artwork, builder, Smart Rally and saved-play mechanics remain the foundation. The service-worker cache advances to v26 for the local candidate; package verification additionally covers upgrade from the reviewed v25 art build.

## Exact local runtime

| Record | Identity |
| --- | --- |
| Frozen art source | `b65504187f8e9e741908dd07690db0b79158a960` |
| Metadata stamp | `6e78018e6bd969cdb33cf9e625e84b6085bd4a2b` |
| Package build | `4810efd0559a6a0ad5e000def6a4ebc6a4a28d90` |
| Runtime SHA-256 | `88a8f82f42eb98c0fbd4e7ef3b6bd7c97790d13091ca04d3c76168b9a552a748` |
| Package manifest SHA-256 | `40495e7c190e25b68b3b32cc3e9a0d84178b129f0af616be3bfa6175fcc6e7e9` |
| Runtime package | 110 files, 1,895,893 bytes; 24,463 bytes more than the previous candidate |

Later evidence commits do not change the runtime. The metadata truthfully identifies a local candidate and does not imply publication or owner acceptance.

## Mechanical verification

`npm run check` passes all **234 unit checks**, 107 referenced static assets and the brand contract. All 65 generated asset paths remain valid with no regeneration differences. The exact runtime package inventory, bytes and source metadata pass validation.

The integrated Chromium renderer suite passes **24/24**, including the previous nine smoke contracts plus physical contact, handedness, shared-clock pause/rate/seek, regulation court and net, ball visibility, reduced motion, owned-resource disposal, 2D/3D transitions, drawing-buffer resizing, and all eight plays across five viewport sizes and four camera presets. No geometry, framing or behavioral assertion was relaxed. The cache-version brand assertion and exact package hash/byte pins were advanced to the new local package.

The final **20-cycle lifecycle soak** has no errors or failures. Renderer memory remains at 38 geometries and six textures from start to finish, with one canvas and no pending animation frames or playback timers when idle. The final screen, closeup and four-play motion capture scripts also report no page errors.

The exact built package passes **24/24 offline scenarios** across isolated Chromium and WebKit. All previous 22 scenarios remain, plus direct upgrade from the reviewed art candidate in each engine. Each scenario checks all 110 runtime hashes and 108 cached entries, then stops its owned server to verify saved custom plays and all eight lessons offline. The new art-upgrade scenarios also preserve the old draft and prove Smart Rally generation, coaching, undo and saved-library restoration offline.

## Performance: remaining regression

The final matched run uses one isolated Chromium/SwiftShader process, 1440 × 900 at DPR 1, third-shot-drop overhead, 1.2 seconds of active warm-up and six seconds of measured playback per run. Before/candidate/candidate/before/before/candidate ordering reduces order bias. Other test and capture processes were stopped. All six runs have no page errors and the expected runtime digest.

| Metric | Reviewed candidate | Village art candidate |
| --- | --- | --- |
| Callback cadence median, three runs | 16.7 / 16.7 / 16.7 ms | 25.0 / 25.0 / 24.9 ms |
| Callback cadence p95, three runs | 25.1 / 25.1 / 25.1 ms | 33.4 / 33.4 / 33.4 ms |
| Pose CPU median | 1.0 ms | 0.4 ms |
| Pose CPU p95 | 1.1–1.2 ms | 0.5 ms |
| Draw calls | 45 | 42 |
| Visible triangles | 11,156 | 25,799 |
| Geometries / textures | 41 / 6 | 38 / 6 |

The richer scene is still slower in this software renderer. Lower pose CPU, fewer calls, exact vertex indexing and a reduced scenery budget do not restore the previous callback cadence. This is an explicit remaining performance limitation, not a passing parity result. The art is reviewable and mechanically verified, but physical phone rendering performance remains unmeasured.

## Evidence

- [Matched desktop and phone captures](final/screens/capture.json)
- [Human details and stroke phases](final/details/detail-provenance.json)
- [Four-play motion recording](final/motion/four-play-motion.webm) and [provenance](final/motion/motion-report.json)
- [Unit and asset checks](verification/check.log)
- [Renderer, motion and framing checks](verification/renderer.log)
- [Exact package and offline upgrade checks](verification/package-verification.json)
- [Lifecycle checks](verification/lifecycle-20.json)
- [Matched final performance](verification/matched-performance.json)

## Limitations

Independent visual review accepts a substantial move toward the reference's human village direction, not parity with its commercial production finish. The remaining art differences are richer painted material response, softer directional cast shadows, less spherical foliage, more natural path edges, and some visible knee/sleeve joins in closeups. These are less apparent at the working gameplay camera.

Phone captures are emulations. No physical iPhone, native keyboard, VoiceOver, notch or hardware-rendering claim is made. Headless callback cadence is not displayed FPS, and CPU render submission time is not GPU completion time. All browser work used isolated repository test profiles; no user browser, Safari permissions, CUA, AppleScript, security settings or uploader retries were used.

## Reproduce

Use the existing dependency installation, `PORT=4175 npm start`, and the repository check scripts. Capture scripts accept `PREVIEW_URL` and `CAPTURE_DIR`. `tools/verify-package.mjs` serves the exact built package at the real project subpath in disposable local servers, then stops each server to prove offline behavior.
