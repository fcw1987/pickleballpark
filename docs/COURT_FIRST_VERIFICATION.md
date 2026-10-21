# Court-first park: verification and local review

2026-09-07. Source: clean published `f1308015d9e3848909e35d3919735b265e71fb7f`. Branch: `feature/court-first-park`. Final runtime: `195dd49da319d3ca5c41eb97105270badeae2a8d`; package verification commit: `69e56fa`. No archived private ancestry was integrated. Nothing was pushed, merged, deployed or renamed.

## Result and evidence

The full painted court uses more useful space through responsive affine ground fitting, with canonical dimensions and the complete existing apron retained. MENU is a stacked hamburger/label plaque on the left path; HELP is a native labeled plaque on the right path. Both use the existing dialogs, focus return and keyboard behavior. Their positions derive from the actual SVG screen transform, including guided-mode letterboxing, and adapt outward to avoid the court at enlarged text.

A compact original two-line pixel banner replaces the detached product heading and top tree. It scales with the rendered scene, rather than the outer DOM stage, so expanded coaching instructions do not clip it. A semantic H1 and full accessible product name remain. Shared spatial-replay scenery uses the same banner and HELP art; camera choices and transport are unchanged. World signage can legitimately sit behind players in perspective views.

The existing quiet paving, bench, shrubs and two trees remain. No spectators, dense planting or decorative animation were added: the court stays dominant. Characters, grips, ball treatment, all eight lessons, court geometry, rally data, timing, Loop and restoration code remain unchanged.

- [Matching before/after gallery and actual interaction clip](court-first/index.html)
- [Desktop before](court-first/before/1440x900-board.png) / [after](court-first/after/1440x900-board.png)
- [Phone before](court-first/before/390x844-board.png) / [after](court-first/after/390x844-board.png)
- [Guided desktop after](court-first/after/1440x900-guided.png), [spatial replay](court-first/after/1440x900-replay.png)
- [Help](court-first/help.png), [menu](court-first/menu.png), [200% text](court-first/text200-phone.png), [dark theme](court-first/dark-desktop.png)
- [6-second browser walkthrough](court-first/walkthrough.webm): mouse drag, MENU, HELP, normal 1× guided playback, paused HELP, return to editing. Chromium recording is 25 fps; it is not a runtime frame-rate measurement. Actual decoded sequence frames were inspected by Astra and Luna.

## Court measurements

Chromium, DPR1, actual content viewports. The four canonical painted-court corners are projected through the current affine mapping and SVG screen CTM; polygon area is measured in CSS px². These numbers exclude grass, paths, shadows and the SVG bounding box. The camera-like foreshortening differs intentionally between wide and portrait layouts; underlying court proportions remain 20×44 feet. All six viewports had no page overflow. Narrow portrait layouts remain width-limited; taller empty areas are not falsely counted as reclaimed court.

| Viewport | Mode | Before px² | After px² | Gain |
|---|---|---:|---:|---:|
| 1440×900 | board | 169,438 | 229,625 | +35.5% |
| 1440×900 | guided | 90,174 | 122,209 | +35.5% |
| 680×1000 | board | 155,053 | 201,780 | +30.1% |
| 680×1000 | guided | 122,116 | 126,290 | +3.4% |
| 768×1024 | board | 199,328 | 228,247 | +14.5% |
| 768×1024 | guided | 128,487 | 132,879 | +3.4% |
| 1024×768 | board | 122,295 | 165,750 | +35.5% |
| 1024×768 | guided | 56,823 | 77,010 | +35.5% |
| 390×844 | board | 50,586 | 65,832 | +30.1% |
| 390×844 | guided | 49,513 | 64,435 | +30.1% |
| 844×390 | board | 29,728 | 40,285 | +35.5% |
| 844×390 | guided | 29,728 | 40,285 | +35.5% |

Desktop editing gained 60,187 CSS px² (4.64 percentage points of the whole viewport). Its court bounding box changed from 370×579 to 480×573 CSS px. Phone portrait gained 15,246 CSS px²; the bounding box changed from approximately 202×316 to 198×361. This is a measured surface increase, not a claim that every screen gains equally: height-limited portrait guided views gain 3.4%.

## Corrective integration review

1. The old fixed portrait frame left substantial wide-screen space unused. The new desktop footprint assertion fails against untouched `f130801` (169,438 versus the 200,000 minimum), and passes on the candidate (229,625). Existing inverse-drag, offcourt/apron and annotation assertions remain.
2. Initial integrated controls used stage dimensions instead of SVG CTM. The guided instruction panel letterboxed the SVG, leaving controls floating beside the paths. Actual images exposed this; CTM placement and an independent projected-anchor assertion correct it.
3. Responsive depth initially changed `projectHeight`, stretching the left-handed overhead paddle to 2.151×. The existing <1.5 assertion failed. Ground fitting is now independent from the approved upright-height calibration, and contact assertions pass at both desktop and portrait sizes across every lesson and both hands. No ball trajectory was changed.
4. The dynamic shot cue could clip a fixed-size banner at 1024×768. A recorded frame exposed this. Scene-scaled banner width and true top-bound clamping fix it; a shot-cue regression and fresh recording confirm the correction.
5. At 200% text, a wide HELP label could cross the slanted sideline. Both fixtures now stack symbol/label, preserve rem-based text enlargement, reduce only compact horizontal padding, and use full-height edge clearance. Polygon-separation tests pass in portrait and landscape; no capped enlarged font was retained.
6. Rebrand tests previously assumed a detached text header. They now require the loaded full-name banner, semantic heading, exact accessible name, viewport containment and non-overlap, while retaining negative brand and menu-heading checks.

Real model configurations were explicitly selected: Luna `gpt-5.6-luna` authored original art and independently inspected final images; Sol `gpt-5.6-sol` implemented layout and independently reviewed projection, restoration and cache coverage. No further underlying model metadata was exposed. Independent Sol review identified the enlarged-text clearance risk. Fresh Luna review cleared the final desktop, phone, guided, dark, 200% text and recorded shot-cue frames after corrections. Astra inspected the integrated diff and actual rendered output.

## Executed checks

- Baseline `npm run check`: 78 unit tests, 77 static references and brand checks passed.
- Baseline `npx playwright test --workers=2`: 122 Chromium tests passed.
- Final `npm run check`: 78/78 unit tests, 78 referenced static assets and brand integrity passed.
- Final `npm run check:generated`: 63 generated paths reproduce exactly; no PNG compression-only differences.
- Final `npx playwright test --workers=2`: **133/133 Chromium tests passed**, including DPR2 touch, mouse inverse dragging, drawings through resize/restoration, focus/Escape, all eight lessons, playback/Loop, recovery and the existing 30-cycle lifecycle coverage.
- Final `npx playwright test --config=playwright.webkit.config.mjs --workers=2`: **126 passed, seven existing failures**. No new failures remain.
- Unchanged baseline WebKit on port 4273: **115 passed, the same seven failures**. An initial comparison attempt on port 4190 returned empty WebKit navigations and was stopped; the successful comparison used a separate compatible local origin without changing source/tests.
- `npm run build:site`, `node tools/verify-deployment-artifact.mjs dist <current-HEAD>`: exact 82-file runtime artifact validated, plus two build metadata files.
- `npm run verify:package`: **four cases passed** (Chromium/WebKit × fresh/upgrade), at the existing Pages subpath, with all 82 runtime hashes, 79 declared cache URLs and all eight lessons in both views after the owned HTTP server stopped.
- `git diff --check`: passed.

The seven WebKit failures remain six internal navigation errors under Playwright offline emulation and one cache/Vary assertion after navigation. Exact cases, signatures and review expiry remain in `tools/webkit-policy.mjs` and [existing issue 14](https://github.com/fcw1987/pickleboard/issues/14). Only the changed service-worker spec hash and complete catalog counts were updated. The Linux-only infrastructure policy was not used to call this local macOS run green; no assertion was removed or skipped. The real stopped-server package checks pass in WebKit. Native Safari and physical phones/tablets were not tested in this pass; emulated viewports and Playwright WebKit are not those devices.

## Offline and runtime budget

The previous-production fixture now describes the actual published `f130801` v15 asset set: 78 distinct served files, all independently matched against source and public HTTPS hashes. The test installs that build, retains the same browser profile and origin, then activates candidate v16. It verifies the open arranged/drawn board, theme, unchanged worker URL/scope/start URL, complete new asset hashes and unrelated-cache preservation. Board arrangements remain session-only. No broad storage deletion or unrelated cache cleanup was introduced.

The exact candidate manifest is [runtime comparison](court-first/runtime-comparison.json): 82 runtime paths, 1,444,069 bytes, **+6,793 bytes** versus published runtime. Added: `assets/park/banner.png` (280 bytes). Changed: sign PNG, projection, index, shared park layout/scene, controller, stylesheet and service worker. No runtime files were removed. Athlete/source atlases and vendor modules are unchanged. The legacy fixture field `approvedSource` identifies this reviewed local runtime, not owner authorization to publish it. New package manifest SHA-256: `999354a660ec00236e0777d68b528fb68e1321c66861e2ac66a5d3713f661414`.

[Matched loading/resource observations](court-first/performance.json) use headless Chromium, SwiftShader software rendering, 1440×900 DPR2, two fresh contexts per build. The editor does not load Three.js. Scene draw calls remain 53; geometries remain 43; textures increase 14→15 for the small banner. The drawing buffer stays 2880×1800. Both builds render zero unchanged paused frames during 120 requested animation callbacks. These are resource/idle observations, not displayed FPS or a physical-device benchmark. Two observed editor-ready times were 83.6/45.8 ms before and 50.3/43.5 ms after; first replay entry was 127/116 ms before and 138/120 ms after. Completed resource bytes at editor readiness were 194,147→200,792. These small samples do not establish a speed improvement; timing samples are illustrative localhost observations and not a performance guarantee.

## Local review and continuity

Open **http://127.0.0.1:4173/**. Drag a player, open left-border MENU, select Serve & Return, play/pause, open right-border HELP, close with Escape, enable Loop, visit 3D, return and Exit. Resize to portrait and inspect the compact fixtures. Review the [gallery](http://127.0.0.1:4173/docs/court-first/index.html) for matching original views. The runtime-only package excludes this evidence gallery and recordings from the app/offline cache.

Local commits: `c8449d7` banner/HELP source art; `673eb56` stronger sign contrast; `77f9ee1` responsive layout and tests; `195dd49` shared scene integration, accessible controls and corrective regressions; `69e56fa` exact artifact and actual-production upgrade verification. A final documentation/evidence commit records this report. Original worktrees and source branches are retained, writers are finished, and only the integration preview is intentionally left running. Production remains at its previous publication; this branch requires the owner's next review before any push or deployment.
