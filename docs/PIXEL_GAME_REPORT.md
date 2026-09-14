# Pixel Game Experience and Shot Timeline — local review candidate

The normal experience is now the court, with one compact game menu, contextual shot editing, and one Play/Pause plus a real shot-marked timeline. The app opens paused. Choosing Play resumes the current position and repeats until paused. This candidate is for local owner review; nothing was pushed, merged, deployed, or changed in hosting.

## Source and package identity

The live [draft PR #17](https://github.com/fcw1987/pickleboard/pull/17) was checked before implementation and again after integration. Its branch remains `integration/unified-iphone-builder`, at `d0d5376a4a76e44a3ce381c83f61e3354bcc2241`. That clean checkpoint was preserved in a detached baseline worktree. Its pinned `7bfb7dd` runtime was byte-equivalent to the PR head; it was not treated as permission to reset newer work.

The continuation branch is **`integration/pixel-game-shot-timeline`**. The final runtime is pinned at **`ab4432da4fc0b86d26421dac0310ccc20b082ec5`**. Later commits contain package pins, evidence, and reports. The local review server at **http://127.0.0.1:4173/** serves `dist`; `build-info.json` identifies the exact final branch tip and runtime source. The package contains 99 runtime files, 1,655,964 bytes, and two identity metadata files. Its runtime manifest SHA-256 is `607fc4a6543c6586fef076e58489724b944db188ebed0bab0d519c6cdde23392`. The tooling's historical `approvedSource` field means an immutable byte pin here, not owner approval to publish.

Read-only GitHub checks also established that Pages already used PR #17's branch at mission start. Its last build remains `d0d5376`, built September 14 at 00:29 UTC, before this mission. Main remains `f1308015d9e3848909e35d3919735b265e71fb7f`. Older PR prose about a different preview is not the current hosting configuration.

Astra owned integration, art refinement, corrective inspection, packaging and final verification. Actual configured `gpt-5.6-luna` and `gpt-5.6-sol` workers substantially implemented the interface, session/chapter behavior, native range/input handling, preservation tests and independent reviews. Work used isolated checkouts and distinct ports, with four active-agent slots available. No production dependency, document schema, framework or public ancestry replacement was introduced.

Key local checkpoints include `947e84a` (shared repeating session), `af3374a` (exact canonical chapter boundaries), `e38bec0` (complete contextual surfaces and editing focus), `8c13c10` (compact shared banner), `90df4bb` (chapter Escape), and `ab4432d` (final Help layering and landscape rail). These are scoped commits on one review branch, not separate competing candidates.

## Preserved capabilities

| Capability | Result and evidence |
| --- | --- |
| Genuine custom rallies, up to 64 shots | Same authored document and deterministic compiler; one-shot, unequal timing, eight-shot and valid 64-shot cases covered. All 64 destinations remain available through the chapter picker. |
| Targets, families, flight, hitter/receiver, contact and handedness | Detailed phone controls remain available. Direct drag/tap placement and exact values use the original commands; no silent coordinate or pin changes. |
| Manual movement and pins | Retained, undoable, and stronger than generated assistance. Phone recording pins a partner and preserves the authored coordinates after reload. |
| Auto Shading and Coverage Guides | Independent controls under Coach tools; changing one does not silently enable the other. The section and focus survive edits. |
| Actors, grips, ball and court | Approved actor identity, atlas pixels, connected paddles, outlined ball, tactical coordinates, court dimensions, markings and rally physics retained. |
| One session across 2D/3D | Current time, active intent, speed, camera and source are shared. Ready-view changes preserve active playback; loading callbacks cannot defeat a later Pause. |
| Documents and recovery | Named drafts, truthful autosave, My Plays, Save As, JSON import/export, Undo/Redo, stale-tab conflicts, Retry save, Save a copy and failed-import protection retained. |
| Court Planner | Separate arrangement and markup survive round trips. Applying its layout uses an explicit pixel confirmation and creates one undoable edit. |
| Eight lessons | Every lesson loads paused and compiles all authored shots. Package tests reopen all eight in both views after the owned server stops. |
| Unsupported intermediate waypoints | Data remains intact. Playback still requires the explicit **Preview destination only** acknowledgement; no claim that intermediate paths animate. |
| Lifecycle and offline | Existing visibility, cancellation, abandoned-loading and bounded-renderer fixes preserved; real stopped-server package checks pass. |
| Intentional transport change | Previous, Next, Restart and Loop controls removed from ordinary custom and guided playback. Seeking and chapters replace stepping; repetition is inherent. |

## Playback and chapter contract

There is one authoritative `CoachingSession` and one logical clock. The range, ball, actor sample, chapter cue and renderer derive from it. A cached chapter map is built from accepted compiled navigation/preparation segments and stable authored shot IDs. An anchor begins at that shot's canonical preparation/navigation event; contact time and the interval are retained separately. Durations are not divided evenly by shot count. Shared timestamps retain every authored destination, with the final applicable chapter winning a time tie. Presentation code and the sampler now agree at exact boundaries.

The rail spans the rally's valid duration. It stays at the final sample during the existing **one logical second** final hold; speed scales wall time. Wrap resets derived trails and contact presentation to the initial sample without editing the starting layout. Pausing during that hold preserves the remainder. Explicit endpoint seeking stays at the final pose; Play at the terminal endpoint starts at zero. Legacy Loop-false preferences are accepted but do not alter the new viewing policy or require a schema migration.

Pointer scrubbing freezes the clock while retaining playback intent, so a scrub begun during playback still offers Pause. Normal release resumes only when the current operation and user intent allow it. Explicit Pause, cancellation, a second touch, lost capture, rotation, visibility loss or a modal prevents stale release callbacks from restarting playback. Paused seeks stay paused; chapter selection preserves current intent. Opening Edit deliberately pauses. Current playback chapter and an open editor's selected shot remain distinct.

After a timing edit, the playhead maps by stable shot ID and relative position in that chapter's interval. Deletion prefers the following surviving chapter, then the preceding one. Endpoints remain endpoints. Seeking/repeating does not save, compile, allocate document histories or add Undo entries. Invalid sequences retain editable source and affected-shot feedback, but do not silently replay an old document or an unlabeled valid prefix. Empty or unavailable timelines remain safely paused.

The native range exposes meaningful shot/time value text, exact endpoints and keyboard seeking. Its visual pixel rail has a 48px input region. Dense marks do not gain overlapping hit boxes: the compact chapter picker supplies a readable exact selection and separate Edit route for every shot. There is no per-frame live announcement.

## Visual evidence and corrections

All committed captures use synthetic drafts and isolated storage, with no browser chrome, private plays or personal machine paths. The owner fixture is 402×874 CSS pixels at DPR3. Matching captures also cover 390×844, 430×932, 320×568, 874×402, 768×1024 and 1440×900 in both themes.

| View | Before | Final |
| --- | --- | --- |
| 402px phone, light | [Baseline](pixel-game/before/402x874-light-rest.png) | [Court at rest](pixel-game/after/402x874-light-rest.png) |
| 402px phone, dark | [Baseline](pixel-game/before/402x874-dark-rest.png) | [Court at rest](pixel-game/after/402x874-dark-rest.png) |
| Desktop | [Baseline](pixel-game/before/1440x900-light-rest.png) | [Final](pixel-game/after/1440x900-light-rest.png) |
| Short landscape | [Baseline](pixel-game/before/874x402-light-rest.png) | [Final](pixel-game/after/874x402-light-rest.png) |

The pixel component overview is the actual application: [main menu](pixel-game/after/states/402x874-light-menu.png), [dark menu](pixel-game/after/states/402x874-dark-menu.png), [chapter picker](pixel-game/after/states/402x874-light-chapters.png), [shot editor](pixel-game/after/states/402x874-light-editing.png), [precise details](pixel-game/after/states/402x874-light-details.png), [placement](pixel-game/after/states/402x874-light-placement.png), [playback options](pixel-game/after/states/402x874-light-playback-options.png), [planner confirmation](pixel-game/after/states/402x874-light-planner-confirmation.png), and [Help](pixel-game/after/states/402x874-dark-help.png). The 30-state gallery also includes both themes of My Plays, Learn, empty, loading, invalid sequence, import failure and save recovery. [200% phone editor](pixel-game/after/cameras/402-text200-light-editor.png) and [short-landscape options](pixel-game/after/cameras/844-text200-dark-options.png) show internally scrolling, bounded expanded surfaces.

Original scalable nine-slice frames and a locally generated Park Labels font replace the old form-panel language. Text, inputs, selection and focus remain live HTML. Detailed values and prose use readable system text. Five original park textures were refined without adding scenery objects. Camera-facing landmarks retain grounded anchors, and the approved banner pixels now occupy a smaller shared 7×1.75-foot footprint. [Overhead](pixel-game/after/cameras/402-overhead.png), [sideline](pixel-game/after/cameras/402-sideline.png), [behind Green](pixel-game/after/cameras/402-behind-green.png) and [behind Orange](pixel-game/after/cameras/402-behind-orange.png) preserve useful coaching views. The matched full-resolution before/after images show the environment at its actual viewing scale.

Corrective inspection removed a Flight field leaking from the collapsed inspector, fixed a giant playback-options label and missing phone camera route, kept open menus/Coach tools from closing during edits, restored chapter-to-editor and Escape focus, bounded 200% menus/editor, synchronized the closed target after paused chapter navigation, and corrected stale shot labels at canonical anchors. A second camera review found the oversized retained banner in close views and reduced it. Final Help inspection found an ancestor stacking context hiding its heading behind the game controls; the whole modal now sits above the court, targets and header, with a tested backdrop and return focus. Legacy narrow-guided rail styling is now scoped away from the wide builder landscape rail.

Independent findings and their limits are retained in [Sol's review](pixel-game/review-sol.md), [Luna's final image review](PIXEL_GAME_LUNA_REVIEW.md), and [the recording review](pixel-game/motion-review.md). These are concrete corrective reviews, not approvals inferred from test counts.

## Recordings and motion evidence

[Normal-speed playback video](pixel-game/after/normal-speed-playback.webm) and its [timestamped events](pixel-game/after/normal-speed-playback.json) show two complete 1× repetitions with final holds, in-flight Pause, exact resume, a pointer scrub, a chapter jump, active 2D/3D changes and final Pause. The paused and resumed sample is exactly 0.7974875019 seconds. At 11.726 wall seconds, iteration 2 has begun; the clip finishes in iteration 3. There are no recorded page errors.

The [phone-sized authoring video](pixel-game/after/phone-authoring.webm) and [17-event log](pixel-game/after/phone-authoring-events.json) cover direct serve placement, exact return adjustment, third-shot selection/flight, appending a response, pinning a partner, independent guides/shading, Undo/Redo, named save, paused reload and continuation across views. It uses emulated touch for court placement and Coach toggles, and actionable browser clicks/fills/selects for the other controls. Neither recording is a physical iPhone capture. Sampled decoded-frame review and logical-clock assertions do not establish physical display smoothness.

## Measurements and costs

The court-area metric projects the actual four court corners and samples 945 court points for foreground UI occlusion. It measures the playing polygon, not canvas or grass. Scene-level ball/actor/scenery visibility is separately inspected and covered by existing framing tests. Both [before](pixel-game/before/measurements.json) and [after](pixel-game/after/measurements.json) retain raw values.

| CSS viewport | Before court px² | Final court px² | Change |
| --- | ---: | ---: | ---: |
| 402×874 | 61,691 | 110,925 | +79.8% |
| 390×844 | 54,054 | 103,692 | +91.8% |
| 430×932 | 77,886 | 127,879 | +64.2% |
| 320×568 | 13,998 | 47,996 | +242.9% |
| 874×402 | 60,604 | 41,965 | −30.8% |
| 768×1024 | 119,088 | 218,005 | +83.1% |
| 1440×900 | 179,906 | 314,149 | +74.6% |

The short landscape view is a real tradeoff: the old layout used a side control stack and more court height. The new coherent top/bottom controls reserve vertical space and fit the full action conservatively. Its wide rail is now a single row, all essential controls remain reachable, and no court-area gain is claimed there. The portrait acceptance fixture gains substantially without stretching court geometry or counting decorative ground.

Performance uses local headless Chromium with ANGLE/SwiftShader, fresh profiles, and the same DPR2 renderer cap before/after. It is CPU timing, not displayed FPS or a physical-phone benchmark. Single startup measurements are noisy. [Raw measurements](pixel-game/after/performance.json) include the environment and resource counters.

| Measurement | Phone before → final | Desktop before → final |
| --- | --- | --- |
| Startup to ready | 825 → 971ms | 848 → 986ms |
| Representative exact target edit | 10.5 → 5.7ms | 5.2 → 5.3ms |
| Seek median / p95 | 0.5 / 1.8 → 0.6 / 1.4ms | 0.6 / 1.0 → 0.5 / 1.3ms |
| Valid 64-shot compile/install | 8.2 → 10.5ms | 8.3 → 10.2ms |
| 64-shot seek median / p95 | 0.5 / 0.7 → 1.0 / 1.5ms | 0.5 / 0.7 → 1.0 / 1.8ms |
| Drawing buffer | 788×938 → 780×1438 | 2832×1126 → 2856×1516 |

Each measured view completed 50 accelerated repetitions. Both had zero saves, zero recompiles, unchanged source/history and zero additional paused renders during the observation interval. Geometry stayed at 43. Phone textures were 17 cold and 19 after warming all facing/stroke uses, then stayed 19; desktop stayed 17. No renderer target or fullscreen pixel filter was added. Ground uses interpolated mip levels with nearest magnification; upright art clamps padded edges. Actor atlas filtering is unchanged. Final measured draw calls were 53.

Runtime increases by **29,522 bytes (1.8%)**, from 93 to 99 files. Additions are two 149-byte frame PNGs, the original 15,520-byte font, and chapter/timeline code and CSS. No runtime paths were removed. The larger visible court increases drawing-buffer work; this cost is disclosed rather than hidden with lower image quality. Art generation, sampling decisions, provenance and selective official Apple/W3C references are in [PIXEL_GAME_ART.md](PIXEL_GAME_ART.md).

## Verification and known limits

The evidence summaries in `pixel-game/after/verification/` record final counts, source identities and failures without private absolute paths.

- `npm run check`: 156 unit tests passed, 96 referenced static assets validated, brand checks passed. All root JavaScript also passed `node --check`.
- `npm run check:generated`: 66 generated paths reproduced; zero differing PNG compression encodings. No generated checkout drift.
- Full Chromium: 219 passed, zero skipped/flaky. The final frozen-runtime rerun is recorded in the verification summary.
- Full Playwright WebKit 26.5 on macOS: 212 passed, seven infrastructure-signature failures, zero skipped/flaky. This is **not** reported as a passing suite.
- Final Help/legacy accessibility/context checks: 14/14 in each engine. Final short-landscape/enlarged-text checks: 6/6 in each engine. Worker preservation checks: 39/39 in each engine; focused native timeline/input suite: 17/17 WebKit.
- Exact static package: 10/10 scenarios — fresh, historical main/v15, builder/v17, usability/v18, direct PR #17/v19 — in both engines. Each validates runtime/cache hashes and install identity, preserves unrelated caches and applicable saved drafts, stops only its owned HTTP server, then reopens the custom play and all eight lessons. Final cache is `pickleboard-static-v20`, with 97 owned entries.

The seven WebKit failures are specific: offline `page.reload` at coaching-workflow:122, pixel-replay:73, plays:228 and three-d:126; offline `page.goto` at service-worker:52 and :108; and the unrelated-cache `keep me` assertion at service-worker:93. An isolated diagnostic serving **no application or cache-deletion code** reproduces both `WebKit encountered an internal error` under browser offline emulation and loss of the seeded cache entry on navigation. Closing its actual server allows offline reload. The complete package tests independently pass that real offline method, including unrelated-cache preservation.

The existing exception policy remains strictly Linux-CI-only, Playwright 1.61.0/WebKit 26.5, with identical seven signatures, diagnostics and October 6, 2026 expiry. Only protected source hashes, exact line locations and catalog counts were refreshed; its ten policy unit tests pass. No Mac exception was added or applied. Linux CI was not run, and the Mac failures remain explicitly unwaived infrastructure limitations. Earlier Chromium failures were obsolete transport selectors/completion expectations and two stale Return step-index assertions; these were replaced with equivalent or stronger chapter/anchor and interruption checks, not skipped.

Native macOS Safari 27 was opened on a separate local origin. Its accessibility tree and direct controls verified paused launch, Play/Pause, time/chapter value text, tap seeking, import-dialog focus and Escape return. A focused native End-key result was not established through the available controls. Safari remote automation was disabled; settings were left unchanged. No iPhone/iPad simulator was installed. VoiceOver launch was attempted, but no running assistive session became available. No VoiceOver, physical touch, native Dynamic Type, software-keyboard hardware, or complete accessibility-conformance pass is claimed. Automated safe-area, viewport-height, rotation and 200% text cases are browser simulations.

A subsequent native Safari check of the packaged `localhost:4173` origin showed a blank 3D surface after opening Help. The native console did not return even a minimal diagnostic evaluation, and a reload did not settle during inspection. The owned diagnostic window was closed. This observation was not reproduced by the complete Chromium run, Playwright WebKit context tests or packaged offline checks, but it is **unresolved native Safari acceptance**, not a passing result or an assumed infrastructure exception. Review the final 127.0.0.1 preview in the owner's Safari before considering publication.

The remaining small visual limitation is a truncated chapter chip at 320px; the full label is available on the rail/picker. Close cameras intentionally prioritize depth and complete actors over maximal court polygon area. Unsupported waypoint paths remain destination-only after acknowledgement. No audio, haptics, scoring, new shot families, controller support, accounts, analytics or other unrelated scope was added.

## Owner review

1. Open http://127.0.0.1:4173/ at ordinary browser zoom. Confirm the paused court and compact pixel controls in both themes.
2. Choose Play, watch two repeats, Pause in flight, and resume. Seek to the end, then Play. Confirm no stepping/repeat buttons.
3. Drag or tap the rail; choose a shot from the chapter chip. Open its separate Edit action, place a target, use Details and Coach tools, then Done.
4. Switch 2D/3D, try the alternate cameras in Playback options, Undo/Redo an authored edit, Save As, and reload.
5. Open My Plays, Learn, Planner, Import/Export and Help. Inspect the supplied error and enlarged-text captures without risking a personal draft.
6. On physical iPhone/iPad, finish Safari chrome/rotation/keyboard and VoiceOver slider/chapter/precise-field acceptance. Those device checks remain owner acceptance, distinct from this implemented and locally packaged candidate.

Publication remains a separate owner decision. The remote PR and preview were preserved throughout.
