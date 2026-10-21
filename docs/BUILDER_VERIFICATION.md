# Visual Play Builder — local candidate verification

Date: 2026-09-07. Source: clean court-first `e4e23a9`, descending from published `f130801`; branch `feature/visual-play-builder`. Runtime candidate `7ef3961857b41731712bb3697eca29ff5664e43f`; final selection repair follows the visually inspected `5d38cd5` checkpoint. No archived private ancestry was merged, and nothing was pushed or deployed.

## Delivered workflow

The normal entry opens a paused 3D starter draft. It is a source-authored serve, return, and drop, not a catalog selector. Edit its target numerically or on the court, choose drive instead of drop, and append further shots. The compiler retains authored intent and previews the valid prefix when later contacts become infeasible. New Play, named autosave, Save As, Open, import/export, Undo/Redo, deletion, duplication and validated reorder are available. Source documents support at most 64 shots and the library supports 50 drafts.

One CoachingSession owns time, speed and Loop. 2D/3D is a presentation toggle; camera selection does not change tactical coordinates or facing. Loading freezes the playhead, cancels stale work and falls back to editable 2D on failure. Planner has its own retained arrangement and drawings. Use as starting layout explicitly copies them into the draft after confirmation; it does not interpret arrows as shots. Planner itself remains session-only.

Auto Shading and Show Coverage Guides are independent, undoable source settings. The former changes eligible derived lateral movement; the latter explains suggested coverage without enabling movement. Authored pins and ball intent remain intact. Infeasible assistance is declined visibly. This is a bounded coaching heuristic, not optimal strategy.

## Evidence and examples

- [3D builder](builder/evidence/builder-3d.png), [same document in 2D](builder/evidence/builder-2d.png), [retained planner](builder/evidence/planner.png).
- [Phone portrait](builder/evidence/phone.png), [phone landscape](builder/evidence/landscape.png), [tablet](builder/evidence/tablet.png), [coverage and manual plan](builder/evidence/coverage.png).
- [Normal-speed eight-shot recording](builder/evidence/custom-eight-shot.webm), [whole-sequence sampled strip](builder/evidence/motion-strip.png). Recording includes initial loading, the complete authored rally, 2D switch and planner return. Recording cadence is not a runtime frame-rate measurement.
- [Shading with manual movement recording](builder/evidence/shading-manual-play.webm), [full-duration video sample sheets](builder/evidence/shading-manual-play-review-1.png), [left-handed contact sample](builder/evidence/contact-4-contact.png).
- Importable source: [eight-shot drive/drop exchange](builder/examples/eight-shot-drive-drop.json) and [lateral shading with a manual pin](builder/examples/lateral-shading-manual-pin.json). Choose Import / Export, select the file, then Import JSON. These examples are actual recipes consumed by the production compiler.

Images contain only the application. The normal-size desktop, tablet, phone and landscape renders were inspected by Astra and a fresh Luna reviewer. Motion review inspected samples spanning the entire 13.64-second eight-shot recording and 6.36-second shading recording, plus frames 80 ms before/at/after representative contacts. This is sampled visual motion inspection, not a claim that every encoded video frame was reviewed. No physical phone testing is claimed.

## Checks actually run

| Command / check | Result |
|---|---|
| Baseline `npx playwright test --workers=2` | 133/133 Chromium before builder |
| Final `npm run check` | 126/126 unit tests; syntax, 88 referenced static assets and active brand checks passed |
| Final `npm run check:generated` | 63 generated paths reproduced; no source artwork changes |
| Final `npx playwright test --workers=2` | 160/160 Chromium |
| Final `npx playwright test --config=playwright.webkit.config.mjs --workers=2` | 153 passed; seven preexisting infrastructure cases below |
| `npm run build:site` | Exact 91-file runtime package, 1,574,196 bytes; locked vendor hashes checked |
| `npm run verify:package` | 4/4 Chromium/WebKit × fresh/upgrade cases; all runtime hashes, saved custom draft and all eight lessons offline |
| Independent focused technical review | 29 browser checks and 45 compiler/coverage/storage/clock units passed before final focus correction |
| Final affected accessibility/authoring WebKit subset | 31/31 after corrective work |

The full suites retain the eight lessons, contact/continuity/rule/Loop checks and planner restoration. New tests cover genuine target compilation, drive/drop changes, 40 deterministic generated parameter cases, a valid 64-shot sequence, edited templates, drop-serve preparation, forehand/backhand and camera-independent sampling. Template guide-only changes preserve the exact original timeline. Rules, feasibility, tactical guidance and unsupported cases are separately classified.

Browser interaction coverage includes 1440×900, 768×1024, 1024×768, 390×844, 844×390 and 320×568; emulated touch at DPR2; both projections; exact inverse mapping using the coordinates actually delivered by each browser; target cancellation; real file input; named library operations; and 200% text. Short landscape uses a scrollable inspector and a horizontally scrollable shot sequence with a sticky Add Shot control. Enlarged text uses a readable scrolling flow instead of clipping controls.

Lifecycle coverage includes 30 actual view/planner round trips with exact document and playhead assertions, retained drawing state, delayed-load cancellation, failed WebGL fallback, paused scheduler quiescence, and 50 accelerated production-session Loop repetitions with no restart after exit. These are bounded stress tests, not a claim of zero memory leaks under every browser condition.

## Reproduced defects and corrections

- Undoing a newly appended shot retained its removed selection ID. The controller now keeps an existing selection or chooses the first restored shot (null for an empty draft). The new browser regression failed before the correction and passed afterward, including editing the restored target.

- Explicit touch placement near the previous target incorrectly retained a drag offset. Explicit placement now uses zero offset; ordinary target dragging still preserves its initial offset, and pointer-up samples the final delivered location.
- A title blur rerender swallowed the immediately following Save As click. The UI captures the intended action before committing the focused input; a real-click regression checks a new copy is made on the first click.
- File selection imported immediately while leaving an empty Import dialog open. It now fills the JSON preview and waits for explicit Import, preventing a second empty import.
- Help opened from the builder returned focus to the hidden planner trigger or the document body. The caller now supplies the actual trigger; Escape returns focus correctly for both native planner and builder controls, including a pointer click after editing the title.
- Collapsed phone controls still inherited visible inspector fields at enlarged text. Specific collapsed rules and measured control clearance fix overlap. Add Shot remains reachable in landscape and has readable text rather than an apparently disabled low-contrast label.
- Declined shading could retain an “applied” explanation. The compiler now identifies those overlays as suggestions only and preserves the unassisted plan.

These failures were reproduced during integration before their focused checks passed. No assertion was disabled to obtain a green result. WebKit rounds automated fractional CSS pointer input; tests assert exact court mapping from the actual delivered event, rather than pretending the browser delivered the requested fractional pixel.

## Offline and compatibility

Cache v17 retains the existing worker URL, scope, manifest start URL and legacy theme key. Builder drafts live under `pickleballpark-builder-v1` outside cache ownership. No migration deletes source data. Unsupported storage/schema versions and malformed data remain available for recovery; quota failures retain the previous committed library. Export important work because browser storage is not a guaranteed backup.

Package checks serve the existing Pages application subpath, reconstruct the actual prior published `f130801` assets/cache v15, then activate v17 in the same profile and origin. Open planner state, theme and unrelated caches survive activation. After the owned server stops, the saved custom draft reloads and all eight lessons work through the planner and spatial renderer. This is real stopped-server local offline verification, not a disconnected physical-device test.

The seven full-suite WebKit failures remain the established six `setOffline` navigation internal errors and the unrelated-cache assertion from the browser infrastructure case. Exact cases, signatures, source hashes and review expiry remain enforced in `tools/webkit-policy.mjs`; new failures cannot use that exception. Local macOS results do not constitute acceptance by the Linux-only CI policy. Remote CI was not run. The separately passing stopped-server package cases provide meaningful WebKit offline and upgrade coverage.

Native Safari was also inspected in a separate private window: default 3D startup, Play, Loop, switching to 2D during playback, pause, planner entry and return all operated. Its actual rendered dark-theme 2D view was inspected. Safari persistence, install and disconnected-device behavior were not tested; the private verification window was closed without touching other tabs.

## Model and scope limits

See [schema and compiler](PLAY_DOCUMENT.md), [storage](BUILDER_STORAGE.md), [package pin](BUILDER_PACKAGE.md), and [lifecycle review](BUILDER_LIFECYCLE_REVIEW.md).

Mathematical tests establish deterministic sampling, bounded finite coordinates, continuous event transitions, modeled bounce/contact ordering, protected authored inputs and the declared rule subset. They do not validate aerodynamics or professional biomechanics. The trajectory is an instructional curve model; 14 ft/s reachability is a planning heuristic. Optional imported movement waypoints are preserved but only the final target is sampled, with an explicit unsupported finding. Detailed spin, stacking, scoring and complete tournament officiating remain outside version 1. The UI supports manual movement targets and pins, not a waypoint editor.

Runtime assets and approved actor artwork remain local. No production dependency, framework, account, remote generation service or backend was added. The default 3D startup intentionally loads more than the old planner; measurements are reported separately below rather than repeating the previous lightweight-editor budget.

## Performance and asset cost

[Raw measured conditions and both runs](builder/evidence/performance.json), measured at `5d38cd5` before the final 109-byte Undo selection guard. Rendering and compiler code did not change afterward. macOS arm64, Apple M3 Max host; Chromium 149.0.7827.55 in headless SwiftShader software rendering, 1440×900, DPR1. The 3D canvas occupied 1069.61×508.78 CSS pixels with a 1070×509 backing buffer. Two isolated foreground 30-second samples followed a three-second warmup, using the eight-shot document with Loop on. A concurrent exploratory run was discarded explicitly.

| Measurement | Observed result |
|---|---|
| Cold default 3D ready | 185.1 / 141.8 ms |
| Warm entry ready | 86.1 / 83.2 ms |
| Prior `e4e23a9` cold planner ready | 49.3 ms, one sample |
| Cold loaded encoded bytes, including document | Builder 1,550,258; prior planner 219,529 |
| Callback interval median / p95 | 8.3 / 16.6 ms, both runs |
| Callback p99 | 16.9 / 17.0 ms |
| Intervals exceeding 1.5× observed median (12.45 ms) | 7.30% / 7.40% |
| Largest observed callback interval | 17.6 ms |
| Steady renderer resources | 43 geometries, 17 textures, 10 programs |
| Representative render submission | 57 draw calls, 8,830 triangles |

This is a deliberate startup tradeoff: a 3D authoring front door loads the engine and actor textures that the former 2D planner deferred. It is not a feature-equivalent timing comparison. The complete package is 1,574,196 bytes; no actor atlas or production dependency was added. Callback intervals do not prove displayed FPS, and software rendering is not physical phone or GPU throughput. Main-thread render-function duration and GPU/presentation timing were not measured.

Independent synchronous compiler benchmark: Node 22.4.0, 200 warmups and 3,000 measured calls per fixture. The real eight-shot export compiled in median 0.082 ms / p95 0.164 ms; a valid 64-shot alternating midrally document in median 0.587 ms / p95 0.849 ms. Both had complete valid prefixes and zero findings. These measure compilation, not rendering.

## Independent review and local handoff

Luna used the explicitly selected `gpt-5.6-luna` configuration for UI implementation and a fresh visual review. Sol used `gpt-5.6-sol` for compiler, persistence, coverage and independent technical work. Workers used isolated worktrees and did not publish. Astra integrated all changes and reran the combined suites. The final Sol review independently hashed all 91 runtime files with zero mismatches; the final Luna review found no visual blocker after import, contrast and compact-layout corrections. Short landscape remains dense but the inspector scrolls and Add Shot stays reachable.

The package pin is technical review evidence for this local candidate, not a claim that the owner approved publication. Preview: `http://127.0.0.1:4173/`. Start with the default three-shot draft, move the serve target, change shot three between drive and drop, append a response, then Play. Toggle 2D while paused or running, enable Loop, use Save As and reload, and visit Planner/Return to builder. Import the supplied eight-shot and shading documents for longer examples. At 200% text, scroll the enlarged control flow; normal layouts require no page scrolling.

All work packages are integrated. Auxiliary browser contexts and measurement servers were closed; the existing port-4173 preview remains. No push, merge, deployment, repository rename or production setting change was performed. Archived private branches remain untouched.
