# Court-centered builder: local verification

Completed local usability candidate. Baseline `d9b75d7`; runtime checkpoint `634bc6b20fe87730f0abc3503af6eedcfb42ba16`; branch `feature/court-centered-builder`. No push, merge, or deployment occurred in this pass. The previous builder branch push ended at `d9b75d7`.

## What changed

The default inspector is closed. Select a shot or choose **Edit shot** for family, hitter, target and flight controls. **Details** retains precise coordinates, receiver/contact and manual pins; disclosures stay open across edits. **Add shot** opens the new shot's editor. The sequence has its own horizontal scroll through 64 shots, with Add and assistance outside that scroll. File operations live under **File**; **Plays** contains New, Learn, Planner and Help. Playback and undo/redo remain separate.

Both **Auto Shading** (movement) and **Coverage Guides** (explanation only) stay visible and independent. Ordinary custom summaries describe actual arc, pace, depth and court-relative placement. Template explanations remain intact. Findings identify shot numbers, distinguish rules/movement/unsupported cases, and suggest an explicit correction without modifying targets or locks.

The builder-only overhead camera runs the court's long axis across wide screens and retains an elevated upright composition on portrait screens. Other camera presets remain unchanged. SVG framing includes actual court runoff, authored positions, upright actors and complete ball flight; scenery does not determine scale. The planner keeps its original projection and offcourt editing space. The document schema, trajectories, player artwork, grip anchors and clock are unchanged.

On short landscape screens a compact control rail sits beside the court. On portrait phones a lower editing sheet opens only on request and collapses before target placement or playback. At 200% text size controls use accessible scrollable flow and the camera selector occupies its own full-width row; ordinary viewports do not require page scrolling.

## Measured painted-court area

Fresh headless Chromium contexts, DPR1, starter draft at time zero, matching viewport. Shoelace area of projected canonical court corners, CSS px². This measures the painted playing surface, not the larger canvas or grass. **Layout only** uses the final UI with the previous framing restored in the measurement harness; **Final** adds the intentional new framing. No source or trajectory changes are made by that experiment. Different camera compositions are explicitly identified rather than represented as identical-camera gains.

| Viewport | View | Before | Layout only | Final | Total change |
|---|---|---:|---:|---:|---:|
| 1440 × 900 | 3D | 60,995 | 75,311 | 251,377 | +312.1% |
| 1440 × 900 | 2D | 78,399 | 95,976 | 120,129 | +53.2% |
| 1920 × 1080 | 3D | 114,159 | 133,464 | 447,958 | +292.4% |
| 1920 × 1080 | 2D | 143,100 | 166,535 | 208,445 | +45.7% |
| 680 × 1000 | 3D | 100,047 | 100,081 | 117,022 | +17.0% |
| 680 × 1000 | 2D | 95,003 | 95,068 | 125,259 | +31.8% |
| 768 × 1024 | 3D | 96,599 | 101,907 | 119,088 | +23.3% |
| 768 × 1024 | 2D | 85,443 | 97,840 | 128,913 | +50.9% |
| 1024 × 768 | 3D | 32,505 | 36,077 | 125,012 | +284.6% |
| 1024 × 768 | 2D | 43,231 | 47,650 | 59,641 | +38.0% |
| 390 × 844 | 3D | 61,579 | 58,144 | 63,708 | +3.5% |
| 390 × 844 | 2D | 54,670 | 51,679 | 68,092 | +24.6% |
| 844 × 390 | 3D | 17,262 | 25,177 | 50,152 | +190.5% |
| 844 × 390 | 2D | 23,711 | 33,261 | 41,632 | +75.6% |

Portrait-phone 3D was already relatively well fitted: its gain is modest, while 2D and desktop/landscape improve more. The UI-only phone measurement is slightly smaller because discoverable assistance occupies a reserved row; the final composition recovers that space. The wider desktop gain comes primarily from camera orientation, not merely shrinking controls.

[Before measurements](builder-usability/before/measurements.json) · [Layout-only measurements](builder-usability/layout-only/measurements.json) · [Final measurements](builder-usability/after/measurements.json).

## Visual evidence

| View | Before | Final |
|---|---|---|
| Desktop 3D | [1440 × 900](builder-usability/before/1440x900-3d.png) | [1440 × 900](builder-usability/after/1440x900-3d.png) |
| Desktop 2D | [1440 × 900](builder-usability/before/1440x900-2d.png) | [1440 × 900](builder-usability/after/1440x900-2d.png) |
| Phone 3D | [390 × 844](builder-usability/before/390x844-3d.png) | [390 × 844](builder-usability/after/390x844-3d.png) |
| Short landscape 2D | [844 × 390](builder-usability/before/844x390-2d.png) | [844 × 390](builder-usability/after/844x390-2d.png) |

[Dark DPR2 phone](builder-usability/dark-dpr2-390.png), [dark DPR2 desktop](builder-usability/dark-dpr2-1440.png), [200% text transport](builder-usability/text200-transport.png) were also inspected.

Additional matching captures cover 1920 × 1080, 680 × 1000, 768 × 1024 and 1024 × 768 in the same folders. [Desktop inspector](builder-usability/inspector-desktop.png), [phone sheet](builder-usability/inspector-390.png), [landscape inspector](builder-usability/inspector-844.png).

[Authoring clip](builder-usability/authoring.webm) shows a direct serve-target drag, return pace change, third-shot drive, appended drop, guides, playback/pause and a paused 2D/3D round trip. The captured source and exact playhead are asserted equal through the toggle. [Exported example](builder-usability/authoring-example.json). The authoring recording and open-editor captures use `2f9d476`; the final matrix and enlarged-text captures use `634bc6b`, whose final correction stacks enlarged camera controls and measures their reserved space. Recording is 25 fps, not a runtime FPS measurement. The complete sequence was decoded using the already-installed Playwright FFmpeg and inspected in chronological half-second samples: [sheet 1](builder-usability/motion-review-1.png), [2](builder-usability/motion-review-2.png), [3](builder-usability/motion-review-3.png), [4](builder-usability/motion-review-4.png). This is sequence inspection, not a claim to have inspected every encoded frame.

## Editing cost and saved work

- Adjust the visible target: one drag, with the original grab offset preserved. This existing shortcut is retained, not claimed as newly invented.
- Change a selected shot's family: Edit shot, then select family; selecting another sequence item opens its editor directly.
- Precise target/manual-pin editing: open Details once; it stays open across edits. Playback and panel visibility do not enter undo history.
- File actions: File then the action, rather than permanent transport buttons. Lessons/planner are similarly two actions through Plays.
- Target placement closes the sheet and exposes **Cancel target**; Escape and native pointer cancellation also cancel without committing.

Source edits autosave with visible status. Tests retain exact values through save, reload, named reopen, template copies and planner round trips. No persistence schema or storage key changed.

## Waypoint policy

Intermediate imported movement points remain unsupported by model version 1. Every affected shot is disclosed. **Preview destination only** is required before playback or a nonzero seek, with the original points preserved in storage/export. A changed affected path invalidates the session acknowledgement; reload asks again. This does not add path animation or convert saved source. Tests cover acknowledgement, blocked clock advancement, changed paths and exact saved/exported/reloaded data.

## Regression evidence and independent review

- Hidden target capture: clicking the invisible selected target during playback could pause/recompile the draft. The new test fails against the untouched `d9b75d7` snapshot and passes with the playing-state guard.
- Native pointer cancellation: Sol found that placement ended internally but the UI still said Cancel target. Cancellation now refreshes the builder; a pointercancel regression verifies unchanged source and restored Edit shot.
- Menu/title commit: integration tests caught a File disclosure disappearing when a title committed, plus a short-landscape stacking conflict. Pointer/focus sequencing and popup stacking were corrected; Save As/import/focus tests pass.
- Test precision: WebKit delivers slightly quantized pointer coordinates. Drag expectations now use actual native down/up coordinates while retaining six-decimal world-coordinate assertions, rather than loosening tolerances.
- Test readiness: one WebKit anchor assertion sampled after the HUD CSS variable changed but before projected controls settled. It now polls the actual geometric contract, retaining all original alignment/containment assertions. An isolated untouched-baseline rerun passed 12/12; this is a test-readiness correction, not a claimed reproduced persistent baseline app defect.

Explicit `gpt-5.6-luna` implemented UI and a fresh Luna reviewer inspected actual normal-size images and chronological motion sheets. Review caught tablet assistance clipping and weak short-landscape 2D framing; both were corrected and re-inspected. Final visual review found no material outstanding issue. Explicit `gpt-5.6-sol` implemented waypoint policy and authoring coverage; a separate Sol review checked framing, source/session integrity and found the pointercancel issue above. Astra reviewed the integrated diff, images and test results.

## Executed checks

- Baseline: `npm run check` — 126 unit tests, syntax/assets/brand passed. `npx playwright test --workers=2` — 160 Chromium passed.
- Final: `npm run check` — 134 unit tests, syntax, 90 referenced static assets and brand checks passed.
- `npm run check:generated` — all 63 generated paths reproduce; no artwork regenerated or changed by this pass.
- `npx playwright test --workers=2` — **168 passed**.
- `npx playwright test --config=playwright.webkit.config.mjs --workers=2` — **161 passed, seven existing failures**: six WebKit internal errors using simulated offline navigation/reload and the established unrelated-cache emulation assertion. No new failures or new exceptions remain. The Linux-CI exception policy retains exact signatures/source hashes and expiry; only the expanded passing test count and intentional cache-version fixture hash changed. This macOS run is reported as failed in those seven cases, not relabeled a full pass.
- `npm run build:site`, `npm run verify:package` — **six cases passed**: Chromium and WebKit fresh install, upgrade from public `f130801`, upgrade from builder `d9b75d7`. Server stopped for real offline reload; all eight lessons, custom saved draft, exact runtime/cache hashes, unrelated-cache preservation and planner restoration checked. [Package results](builder-usability/package-verification.json).
- Exact artifact verifier passed for 93 runtime files. Service worker moves v17 → v18, retains URL/scope/theme key; two new helper modules are included. Draft data remains outside cache lifecycle.

The tests include 30 complete planner/view round trips, 50 accelerated loop repetitions, pause/resume, scrubbing, target and projection mapping, manual pins, early edits, undo/redo, storage failure, delayed/failed 3D startup, reduced motion, DPR2 emulated touch, 320px narrow layout and 200% text enlargement.

## Runtime weight and limitations

Runtime grows from 91 files / 1,574,196 bytes to **93 files / 1,599,946 bytes**: +25,750 bytes (+1.6%). No new dependency, image, font, texture, renderer or production service. [Complete path/hash comparison](builder-usability/runtime-comparison.json) accounts for every changed/added file; all source artwork and runtime art are unchanged.

Matched timing results are recorded separately below. Desktop browser emulation is not physical device testing. Actual Safari and physical phones/tablets were not tested. The waypoint model limitation remains explicit. No claims of new shot physics, validated biomechanics or improved animation are made.

## Local review

Preview: `http://127.0.0.1:4173/`. Drag the target ring, select 3. Drop and change it to Drive, Add shot, collapse, Play/Pause, toggle 2D, then return to 3D. Try Auto Shading separately from Coverage Guides. File exposes named plays/import/export; Plays exposes lessons and the preserved planner.

Only the owner's original 4173 preview is intended to remain running. The baseline and worker previews are stopped after verification. Source branches and isolated worker checkouts are retained; no archived private history was merged. Production is unchanged.

## Matched local timing

Apple M3 Max, macOS 27.0, headless Chromium 149.0.7827.55, **SwiftShader software rendering**, 1440 × 900, DPR1. Two fresh-context runs per build; starter three-shot play, overhead, Loop, 1×, warmup beyond logical time 2 seconds, 30-second samples. Functional suites were finished before this comparison. Browser tooling and render-call instrumentation were active; this is not physical device or hardware-GPU performance.

| Metric | Baseline runs 1 / 2 | Final runs 1 / 2 |
|---|---:|---:|
| Ready time (ms) | 800.30 / 745.30 | 882.50 / 738.30 |
| RAF median (ms) | 8.30 / 8.30 | 9.40 / 9.40 |
| RAF p95 (ms) | 10.10 / 9.90 | 16.80 / 16.80 |
| RAF p99 (ms) | 16.70 / 16.70 | 17.70 / 17.60 |
| Intervals >1.5× observed median (%) | 2.07 / 1.75 | 44.49 / 44.49 |
| Render-call median (ms) | 0.20 / 0.30 | 0.30 / 0.20 |
| Render-call p95 (ms) | 0.40 / 0.40 | 0.40 / 0.30 |
| Render-call p99 (ms) | 0.50 / 0.50 | 0.50 / 0.50 |

The default buffer grows from 1070 × 509 to 1416 × 563 (about 46% more pixels); the larger court therefore carries a real software-rendering cost. Callback tails are slower. These measurements do not establish a GPU diagnosis or displayed frame rate, and the median-relative missed-cadence figure is not a “below 60 FPS” percentage. Main-thread render-call measurements do not include completion of GPU/software-raster work. No quality reduction was used to hide this cost.

Both builds retain 57 draw calls, 43 geometries and 17 textures in this workload, and **zero new render frames during the measured paused second**. No production dependency or asset texture cost was added. [Raw baseline](builder-usability/performance-before.json) · [raw final](builder-usability/performance-after.json).

## Local checkpoint sequence

- `2bcfcd8`: waypoint disclosure/acknowledgement policy and tests.
- `fa541f2`, `ecf97b8`: compact UI integration and responsive corrections.
- `2f9d476`: integrated court framing, target editing and cancellation safeguards.
- `634bc6b`: final runtime, readable enlarged scene controls and precise native-coordinate/readiness tests.
- `20c2c5b`: exact artifact pin, prior-builder draft upgrade and unchanged narrow WebKit policy.
- The following evidence/documentation commit contains this report and app-only captures; it changes no runtime bytes.

Runtime manifest SHA-256: `52ac96eaf909e9558f8e7ff1a4a92d469d783fb6997a9e14c7f15ad82a9e0d95`.
