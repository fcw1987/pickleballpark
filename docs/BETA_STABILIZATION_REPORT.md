# Pickleball Park beta stabilization

## Delivery and acceptance

Starting revision: `d66934838a742f126cf9650b2459a5420ea917b8`, verified clean on `integration/pixel-game-shot-timeline`. Local work is on `integration/beta-stabilization`.

The final application runtime is pinned to `e0177cc706e316a8011db348deed133fcaf3ec47`. Subsequent commits contain QA, evidence, packaging pins and this report. The delivered repository revision is recorded in the final preview's `build-info.json` and the owner handoff. The package contains 99 runtime files, 1,658,320 bytes, with manifest SHA-256 `2b619132a2ad7e971dc76fb0b79bb02a33b904f281f4a692b8e767423aa74ee5` and cache `pickleboard-static-v22`.

**Beta sign-off is held pending disposition of BETA-001.** Current native Safari checks pass, but the historical Help-only blank's original cause has not been established. The mission explicitly required that defect to be resolved. Independent Sol review recommends treating it as historical/unreproduced; that recommendation is preserved separately and is not presented as proof of a fix. Seven confirmed product defects are corrected: five release blockers and two medium defects. No confirmed high-severity defect was found. The historical BETA-001 report remains the sole unresolved acceptance item.

The work remains local. Nothing was pushed, merged, deployed, or changed in the remote candidate or production settings. Review preview: `http://127.0.0.1:4173/`.

## What was exercised

The domain corpus contains **591 document cases across three schedules**: 25 named canonical fixtures, 87 valid plus nine intentionally invalid initial generated cases, and 446 valid plus 24 intentionally invalid extended cases. These are scheduled inputs, not 591 distinct pickleball tactics. Browser tests and repeated soak operations are counted separately.

The [scenario catalog](SCENARIO_CATALOG.md) covers opening serves and returns, deep/short targets, third/fifth drops, drives, blocks represented by volleys, resets, short-hop, dinks, speedups represented by firm drives, lobs/overheads, transition positioning, both teams at the kitchen, pins, shading, guides, both handedness values, forehand/backhand, wide/middle/centerline targets, arc/pace variation, early interception, bounced response, longer mixed rallies, infeasible movement and declared rule faults/outcomes. Each fixture records intended contacts, bounces, responsibility, terminal behavior and visual checks.

The initial seeds are `12648430`, `20260145`, `1592598566`; lengths are 1, 3, 8, 30 and 64. Its 72 family × arc × pace combinations exhaust those factor pairs. The extended seeds are `1, 2, 3, 5, 8, 13, 324508639, 610839776, 826366246, 2654435769, 3735928559, 4294967295`; lengths are 1, 2, 8, 31 and 64. Extended factors include player pair, contact region/style, movement intent, pins, assistance and handedness. The generators sampled 390 + 9,435 accepted shots and 4,386 + 77,873 event-boundary samples. The shortest-prefix shrinker reduces an intentionally invalid eight-shot fixture to its two-shot cause; this is not claimed as a newly discovered random failure.

Three fresh Luna reviewers completed visible-interface journeys before implementation-assisted regression assertions. They approached the app as a recreational player, doubles coach and aggressive explorer. They authored/edited rallies, placed targets, used detailed movement/pins, shading and guides, changed handedness, played/paused/scrubbed, selected chapters/cameras, saved copies, reopened/reloaded, used Help and menus, and challenged touch and keyboard layouts. A separate Sol journey imported and edited all 64 shots, including early/middle/final edits, deletion/Undo, save/export/import/reload and view changes. Corrective review rejected two false positives caused by hidden/stale locators: Camera is reachable through Playback options, and the visible mobile Menu accepts a measured touch tap.

## Confirmed defects and corrections

| ID | Severity | Reproduced failure and root cause | Correction / local commit |
| --- | --- | --- | --- |
| BETA-002 | Medium | A first serve was accepted in a document explicitly declared mid-rally | Enforce the opening contract without rewriting source; `0fef773` |
| BETA-003 | Release blocker | A parked 3D canvas lost its real WebGL context; the inactive guard ignored the event and re-entry reused the dead renderer | Recognize loss on the owned active or parked scene, dispose it and permit one fresh renderer; `572c561` |
| BETA-004 | Medium | Command/Control-Z on modal buttons edited the background draft | Keep authored Undo/Redo outside active modal scope; `53b49af` |
| BETA-005 | Release blocker | An older Open awaiting workspace/3D restoration overwrote a newer Open, edit, copy or rejected import intent | Give source changes their own authority generation and check awaited boundaries; `2066995` |
| BETA-006 | Release blocker | A pending Use Planner applied an old layout to a newly opened play | Check source authority after confirmation and workspace restoration; `9e6e2b7` |
| BETA-007 | Release blocker | Two never-saved tabs shared `starter-draft`, so their first saves could silently overwrite one another | Give each fresh unsaved starter its own document identity; `ac88f66` |
| BETA-009 | Release blocker | Per-frame rendering replaced Pause text/span nodes between pointer down and up, cancelling the click | Preserve existing button descendants and update text only when changed; `eedf069` |

Every correction has focused regression coverage and surrounding retesting. BETA-009 was caught by the first final WebKit gate: the original test failed 2/40, and deterministic held presses failed at all three widths before correction. Afterward the original test passed 80/80, root recorded 240 successful input cycles across both engines, and fresh Luna and Sol reviews passed visible presses, touch, loop wrap, label synchronization and delayed scrub authority. See [input evidence](qa/pause-visible-review.md). Fresh Sol review independently challenged source authority, persistence and parked-context recovery. Commits are focused; test-only reproduction commits precede several fixes. The complete local history is available with `git log d669348..integration/beta-stabilization`.

BETA-008 is a **test-environment limitation**, not a production correction. Playwright WebKit's `page.close({runBeforeUnload:true})` returned while the old page remained open. Minimal no-app cases reproduced that behavior. Adding a diagnostic beforeunload listener changed it, explaining the earlier misleading probe. The regression now waits for normal completed close and asserts removal of the page. It passed five repeated trials in each engine; native Safari Cmd-W also preserved the focused pending title. No production unload listener was added.

## Verification results

The final corrected runtime passed **284/284 Chromium tests**. WebKit passed **277/284**, with seven cache/offline-emulation failures detailed below. No tests were skipped, retried or weakened in these final local runs. [QA status](QA_STATUS.md) and [machine-readable evidence](qa/results.json) retain the actual results.

| Program | Result |
| --- | --- |
| Unit checks | 168 passed; includes domain, history/storage, transport, geometry, artifact and strict quality-policy checks |
| Syntax, static assets, brand | Passed; 96 referenced assets validated |
| Generated artwork | 66 paths reproduced without changing source; no compression-only PNG differences |
| Catalog browser checks | All 25 fixtures in each engine; paddle contact, handedness, four-camera tactical facing, 2D/3D agreement, deterministic seeking and source/history safety |
| Persistence | 11 browser regressions passed in each engine; mutation/history matrix, real drag grouping, conflicting tabs, pending source operations, pending-field close, invalid/delayed imports, retained waypoints and 64-shot round trips |
| Persistence model soak | 32 seeds × 500 operations: 12,487 mutations, 3,165 Undo, 348 Redo and 1,248 storage round trips; quota atomicity and stale-save recovery passed |
| Transport soak | 640 repetitions across both engines, including 40 full 64-shot repetitions; 1,920 post-render boundary samples; no source/history drift or paused rendering |
| Lifecycle soak | 200 cycles per engine, eight actual parked-context losses per engine, five viewport shapes, Help/menu/view/seek/background simulation; one final canvas and no pending RAF/hold timer or errors |
| Packaged artifact | 14/14 passed: fresh + production + builder + usability + PR #17 + d669348 + interim beta v21 upgrade paths, in Chromium and WebKit |
| Real offline | In every package case the owned server was stopped. Custom reload/editing, all eight lessons, 3D playback and saved source preservation passed; unrelated caches retained |
| Independent challenges | Round 2's two corrected cases and round 3's nine strengthened cases passed in both engines |

The approved transport remains unchanged: opens paused, one Play/Pause, no Loop/Previous/Next/Restart controls, automatic repeating play, and a seekable shot-marked timeline. Scrubbing preserves running/paused intent; explicit Pause defeats delayed release or completion. Seeking does not select a different authored edit unintentionally. A blocked later link remains editable and explained; its compiled valid prefix is retained internally, while the builder requires blocking errors to be corrected before preview.

## Safari and browser limits

The actual parked-context blank was reproduced visually in native Safari before the fix. After recovery, native Safari retained one replacement renderer, unchanged source and a visible court. A 24-round pre-fix and 48-round post-recovery Help probe passed. Visible native Play → Menu → Help → Close, tab background/return, pending title → Cmd-W → reopen, and the final packaged Help/Play/Pause checks also passed. Inspector verified cache v22 and the loaded Pause guard; earlier native inspection verified the owned-canvas recovery guard. The final saved play survived the update. No permanent render loop or arbitrary production timeout was introduced.

The historical Help-only blank did not recur. The original observation also had an unresponsive Inspector/reload, so neither the app nor Safari's compositor/GPU process can now be identified as its cause. BETA-001 remains an explicit sign-off question rather than a claimed fix. See [native evidence](qa/native-safari.json) and [independent assessment](qa/safari-acceptance-review.md).

Seven macOS Playwright WebKit cache/offline-emulation cases still fail. A fresh minimal server serving no application or cache-deletion code reproduced the internal-error and cache-loss signatures; the same diagnostic passed with its server physically stopped. These are reported as failures, with no macOS waiver. The existing Linux CI exception remains restricted to the same seven signatures, pinned source/browser identities, required diagnostics and review expiry; its catalog size and v22 test hash were updated for the expanded suite.

## Visual, performance and residual limits

Visible checks covered 390×844, 430×932, 320×568 and 844×390, plus tablet/desktop and intervening resizing. Touch simulation, reduced motion, both app themes, 200% CSS text enlargement, exact numeric edits, panel scrolling, focus containment/return and hidden controls were checked. These do not establish physical iPhone/iPad behavior, the native software keyboard, Dynamic Type, VoiceOver or hardware touch cancellation. No Apple simulator is installed.

Normal-speed recordings and samples spanning their full duration show serve/return/drop/volley progression, looping, readable outlined balls, distinct teams, visible court boundaries and usable contextual controls. Root inspected representative desktop, compact, detailed-editor and motion samples. Recordings are retained in [round 2](qa/evidence/round2/coaching-journey.webm) and [round 3](qa/evidence/round3/motion-normal.webm). Temporal sampling is not an assertion that every video frame was manually inspected. Deterministic contact/bounce/continuity checks supply the stronger model evidence.

Matched headless Chromium measurements found no material regression: first 3D readiness median 127.5 → 124.4 ms; warm re-entry 23.1 → 23.5 ms; 64-shot compile 0.7 → 0.7 ms, edit pipeline 6.0 → 6.0 ms and seek 0.9 → 0.8 ms. Resource bytes increased 2,356 (about 0.15%). Measurements cover CPU submission and callback cadence, not displayed FPS or GPU completion. Paused unchanged scenes submitted zero app renders. Lifecycle runs retained 43 geometries/17 textures; the broader transport fixture warmed to 19 textures on first visible use and then remained exact. See [final conditions and measurements](qa/final-performance.json); [earlier close/performance investigation](qa/close-performance.md) is retained separately.

No confirmed high or medium defect is deferred. Low/discoverability observations include Camera behind Playback options, Save As immediately naming a copy, and a possible transient drawing-buffer/CSS-size lag observed during a resize probe without blank rendering. These did not justify a redesign or speculative runtime patch.

Unsupported specialist capabilities remain outside this mission: dedicated speedup/block semantics beyond the existing family mappings, Erne/ATP, spin control, scoring, poach/stacking strategy simulation, measured biomechanics, inferred outcomes and intermediate movement path animation. Retained waypoints remain safely preserved with explicit destination-only acknowledgement.

## Local packaging and working state

The runtime is committed at `e0177cc`, after input correction `eedf069`. `89d4b4c` pins that runtime and the strict 284-case catalog. Later commits contain the final regressions and report. The reviewed package used metadata revision `89d4b4c`; the final preview is rebuilt at the delivery HEAD with exactly the same verified runtime bytes. The handoff reports the final commit. The integration branch is local and recoverable; temporary QA worktrees and concise reproducible evidence are retained. Final working-tree cleanliness and the running preview are checked before handoff.

## Owner walkthrough

Open the local preview; it should start paused. Use **Edit → Details** for targets and movement, **Coach tools** for shading/guides, **Playback options** for camera/speed/Undo/Redo, and **Menu** for saved plays, lessons, import/export and Planner. Play, pause, seek and choose a chapter; switch views; open and close Help. The report and durable corpus are available for review without publishing the candidate.
