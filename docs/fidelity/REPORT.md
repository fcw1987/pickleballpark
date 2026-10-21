# Pickleball Park — robustness and visual fidelity review

Review date: 2026-09-14 PDT.

Local review candidate; nothing was pushed, merged, deployed or changed in production. PR 17 and remote previews remain unchanged. The established document, compiler, instructional model, shared clock, saved compatibility, athletes and outlined ball were preserved.

The visual gate passes after three independent Luna challenge waves and corrective reviews. Available robustness verification passes except the seven independently reproduced Playwright WebKit infrastructure failures. **Final native Safari acceptance is blocked by unavailable desktop-control access**, so the entire robustness gate is not represented as complete. Physical iPhone/iPad acceptance also remains pending. These are explicit limits, not inferred passes.

## ROBUSTNESS

### Starting point and authority

The actual clean starting checkout was `13758356d65f154b19ca631e6ecb9bdb8afd875b` on `integration/beta-stabilization`. It remains recoverable through `checkpoint/stabilized-engine-1375835` and the frozen baseline on port 4190. Work continued on `integration/robustness-visual-fidelity`.

Final runtime source: **`9024bfc40e9c498092497db2e3a04f2ff3844f68`**. The package pins 99 runtime files, **1,698,548 bytes**, to manifest SHA-256 **`678199f3d3136f12bce20451507524111b81b0b5f4659655c5a372959abe7f0b`**. Later report/pinning commits do not change this runtime. The manifest, installation identity, service-worker scope and cache prefix are preserved; the local candidate advances the existing cache to version 23 for upgrade testing.

The [state ownership map](../STATE_OWNERSHIP.md) records the actual authorities. `PlayBuilder.document` owns authored intent and `compiled` its derived rally. `CoachingSession` owns the one clock and playhead. Selected authoring shot is intentionally distinct from the live playback chapter while an editor is open. Renderer/camera and disclosure state do not write the document. Compilation and local storage are synchronous; import and renderer work use explicit current-operation identity. There is no invented asynchronous compiler or second simulation state.

Astra integrated with the harness's actual four-slot capacity: three workers alongside the owner, followed by fresh review waves. Luna handled the interface, park art and visible journeys; Sol attacked input, persistence, lifecycle, stale results and packages. Worktrees, ports and synthetic browser profiles separated writers and test data. The third fresh visual reviewer used a separate Berd session when the collaboration thread could not create another fresh worker.

### Confirmed defects and corrections

The ledger groups **18 reproduced findings: four high, thirteen medium, one low; no new release-blocking defect**. Layout subcases are grouped rather than counted as separate bugs to inflate totals. All 18 groups were corrected. Historical Safari BETA-001 remains a monitored risk with an unproved original cause. Full reproductions and intermediate failures are in [the ledger](GAUNTLET_STATUS.md), [input/stale-result review](../qa/gauntlet-robustness.md) and [fresh state review](../qa/gauntlet-review2.md).

| Finding | Severity | Root cause and correction | Local commit / regression |
| --- | --- | --- | --- |
| Placement survives timeline navigation | High | Timeline entry bypassed gesture cleanup; seek, scrub and chapters now release placement. | `4c8da18`; interrupted input suite |
| Second touch outside court commits first drag | High | Surface-only listener missed the second owner; document capture cancels the old gesture. | `4c8da18`; exact document/history remain unchanged |
| Menu leaves placement armed | Medium | Disclosure entry retained interaction mode; panel/menu entry releases it. | `4fc3195`; panel cancellation case |
| Resize leaves armed placement | Medium | Visual viewport callback checked drag but not armed placement. | `4c8da18`; viewport cancellation case |
| Planner second touch transfers player drag | Medium | Code replaced the active token while using the first touch's coordinates; retain touch identity and cancel the transfer. | `4c8da18`; two-engine input case |
| Planner second touch orphans drawn path | Medium | A new path replaced the model pointer before the old path was captured; finalize one coherent stroke. | `4c8da18`; DOM/model/snapshot equality |
| Nonprimary mouse press replaces owner | Low | Any mouse press could begin another drag; release the old operation without starting a nonprimary one. | `4c8da18`; mouse ownership case |
| Hidden/Help/workspace Planner gesture survives | Medium | Cleanup occurred after snapshot or not at visibility loss; finish owned input before capture. | `4c8da18`; background/workspace cases |
| Older actor-load rejection replaces newer announcement | Medium | Success checked play and snapshot identity; rejection checked only play. Both paths now require the current snapshot. | `1762074`; controlled older-finishes-last case |
| Help shows one shot but edits another | High | Pause publication was deferred; Help reconciled the old playing snapshot and left the Serve ring while Return was current. Publish paused state before Help synchronization. Explicit open-editor intent remains stable. | `acd4765`, `fd95686`; independent visible wrong-target reproduction in both engines |
| Compact status says Saved during pending edit | Medium | The input handler updated only the expanded status. Both visible and accessible statuses now immediately say Editing. No lost write was reproduced. | `2bc1924`; independent pending-title regression |
| Reduced motion leaves a stretched renderer buffer | Medium | A global 0.01ms transition inadvertently animated all host dimensions. Sizing read the old height after the new rectangle was cached. Use `transition: none` for reduced motion. | `3a73d25`; DPR3 before-failure was 60px short; exact buffer and paused-idle tests |
| Responsive context/chapter layout collisions | Medium | Overfull landscape header and enlarged chapter positioning; bounded header anchoring, readable narrow context and full-width phone seek. | `55cd519`, `c9fa42a`, `7c5f7fa`; responsive layout set |
| Dense-rally chapter route hidden on phone | High | Early visual integration hid the expanded selector; restore it at narrow widths. | `1ae2ba3`; all 64 chapters selectable |
| 320px Menu action behind transport | Medium | Dropdown height used viewport fraction without accounting for playback. Layout owner now caps its scroll viewport at transport/visible viewport. | `7be0c58`; reproduced bottom 462.6px versus permitted 432.7px; normal/enlarged phone and landscape regression |
| Actual 200% labels overflow buttons | Medium | Narrow fixed widths remained active when live text enlarged. Large-text controls now size to their labels. | `9024bfc`; text rectangles fit button bounds, values remain readable |
| Intent tabs lack complete keyboard semantics | Medium | Visual tabs used roving focus without explicit relationships/navigation. Add panel relationships and scoped Left/Right/Home/End selection, preserving document/history. | `9024bfc`; keyboard selection/wrap/focus regression |
| Checkpoint fails brand verification | Medium | Historical report copied the old product name as a test title. Correct the displayed evidence without altering tests or brand rules. | `a2a3018`; brand and full unit/static check |

No compiler redesign, document migration, trajectory change, permanent rendering loop or arbitrary recovery timeout was introduced. Reduced-motion sizing is a demonstrated separate mechanism; it does **not** prove the historical Safari Help-only blank's cause.

### Scenarios, generated coverage and realistic use

The durable [scenario catalog](../SCENARIO_CATALOG.md) has **25 canonical fixtures** with intent, contacts, bounces, responsibilities, terminal conditions and visual checks. They cover legal deep/short openings, third/fifth drops and drives, drive/block/reset, straight/cross/middle dinks, volleys, short hops, lob/overhead, transition and kitchen formations, handedness, wide/center targets, manual pins, all shading/guide combinations, a 30-shot mixed rally, infeasible pins and intentional rule outcomes.

Two deterministic generated schedules add **533 valid and 33 intentionally invalid documents**: 87+9 initial and 446+24 extended. Together with the catalog this is **591 scheduled inputs**, not 591 distinct human coaching journeys. The generated schedules validate 9,825 accepted shots at **82,259 event-boundary samples**. Lengths include 1, 2, 3, 8, 30, 31 and 64. Initial family/arc/pace coverage exhausts 72 combinations; the extended schedule efficiently covers other factor pairs. A known-invalid sequence shrinks from eight shots to the shortest failing two-shot prefix.

Initial seeds: `12648430`, `20260145`, `1592598566`. Extended seeds: `1`, `2`, `3`, `5`, `8`, `13`, `324508639`, `610839776`, `826366246`, `2654435769`, `3735928559`, `4294967295`. Exact dimensions and results: [initial](results/generated.json), [extended](results/generated-extended.json).

Canonical browser cases compare actual paddle/ball contact within 0.01 metres, correct hitter, stroke handedness, unchanged tactical facing across four cameras, identical logical samples across 2D/3D and history-independent seek. Domain tests check opening bounces, no extra bounce, continuous finite trajectories around modeled impacts, legal requested service placement, source immutability and movement bounds. Invalid links stay editable and stop preview without silently changing targets or pins.

Three fresh visible-interface challenges covered recreational, coach and power-user behavior. Reviewers found Play and Edit, created/changed custom responses, placed targets, explored exact settings, pinned movement, toggled coaching assistance, sought chapters, switched views and saved/reopened plays. One deliberately infeasible pin exposed the need to route a later contact warning to the *earlier pin owner*; the corrected action now opens that player and source shot. Save As creates a named copy immediately. Help and playback options remain discoverable but can require exploration. These observations are distinct from fixture-loaded domain tests.

### Persistence, Undo/Redo and asynchronous authority

The final deterministic storage/history soak ran **32 seeds × 500 operations**, including **12,487 mutations, 3,165 Undo, 348 Redo and 1,248 persistence round trips**. The 64-shot document retained both unsupported waypoints. Quota-style failure stayed atomic and stale revisions produced conflicts. [Exact result](results/persistence-soak.json).

The browser catalog additionally covers drags as one edit, exact fields, family/arc/pace, movement/pins, assistance, insert/delete/duplicate, import, rename, replacement, valid selection after Undo, close/background field commit, failed and oversized imports, unsupported versions, retained waypoints, two tabs, stale-save recovery and Save a copy. A separate 30-round synchronized two-tab probe always produced a conflict in one tab; this is bounded evidence, not a database-isolation guarantee for localStorage.

Controlled deferred actor and renderer loads exercise newer work winning over older completion, exit during startup, initialization failure/retry and parked context loss. Pending field status differs from completed save. No save loop runs on animation frames; draft writes remain the established synchronous local-storage operations.

### Long rallies, looping and lifecycle

The full 64-shot limit is exercised through creation, all chapter selection, early/middle/final edits, deletion/Undo/Redo, saving, reload, import/export, validation, view changes and repeated playback. Dense chapters use the expanded selector, not a page of permanent controls.

Final lifecycle soak: **200 transition iterations per engine**, **eight forced WebGL context losses per engine**, one canvas, restored contexts, and unchanged **44 geometries / 17 textures**. Final renderer/session schedulers, hold timer and tracked pending animation requests settle to zero. Cumulative scheduler start counters naturally rise as demand work restarts; they are not concurrent loops. [Lifecycle result](results/lifecycle-soak.json).

Final accelerated transport soak: **640 repetitions** across Chromium/WebKit and 2D/3D—600 five-shot and 40 maximum-length repetitions—with **1,920 boundary samples**. No drift or mismatch was observed. First-use contact/occlusion textures warm from 17 to 19, then remain bounded; every paused case is idle. [Transport result](results/transport-soak.json). Separate normal 1× clips cover actual waiting through the end recovery/loop boundary.

Help/menu/details/view/resize recovery checks compare exact canvas buffer dimensions, context state, resource ownership and visible output. Paused scenes do not acquire a permanent loop. Simulated visibility events test cleanup; a headless tab-background attempt reported `document.hidden: false`, so it is explicitly **not** an OS background-return pass. [Browser recovery evidence](results/browser-recovery.json).

### Safari, offline, upgrades and test limits

Early in this mission, actual native Safari restored the court after one paused and three playing Help cycles. This also exposed the wrong-shot handoff corrected above. Those observations precede the final visual runtime. Later native access failed repeatedly—including a session reset and final retry—with **“Sky Computer Use native pipe startup failed”** before the app could be selected. No current native blank was reproduced, but the final native acceptance script could not run. The historical cause remains unknown.

Playwright WebKit is not native Safari. Its seven macOS failures concern offline-emulation reload/navigation and unrelated-cache loss. Minimal diagnostics reproduce the same signatures while serving neither application nor cache-deletion code; real offline navigation without emulation succeeds. The exact existing Linux CI policy retains the same seven signatures and review expiry; no macOS waiver, skipped assertion or broader exception was added.

The real packaged-artifact program tests fresh installation plus upgrades from public production and seven intervening builder/visual/stabilization candidates, including checkpoint v22 → v23 and the already-served interim local v23, in **both engines**. It checks every runtime hash, scope/identity, unrelated caches, preserved saved custom play and Planner state, all eight lessons, offline reload/editing, 3D and export after the server is stopped. The final run and browser totals are recorded in the verification section below. The same-v23 upgrade test disproved a suspected stale-preview issue: the existing network-first service worker refreshes both changed, eagerly loaded assets. No speculative cache change was made.

Unavailable: physical iPhone/iPad, installed Apple simulator, physical multi-touch cancellation, native software keyboard, VoiceOver, OS Dynamic Type, thermal/battery behavior and final native Safari automation. Browser viewport/touch/CSS text enlargement and reduced motion are simulations. No paid tool or new dependency was installed to paper over those limits.

### Performance and final verification

Three fresh isolated runs per candidate per viewport on an Apple M3 Max, macOS Darwin 27, Playwright Chromium 149.0.7827.55. The baseline was frozen `1375835`; the candidate was runtime `9024bfc`. Other mission test browsers were closed. All source/action work uses the same synthetic 3/8/64-shot inputs. The table reports the median across run medians; readiness uses three runs, reload nine measurements. Small submillisecond differences are timer-quantized observations, not statistically established improvements.

**1440×900, DPR1 desktop; before → candidate, milliseconds.**

| Readiness/action | Median |
| --- | --- |
| Builder ready | 79.66 → 84.16 |
| First 3D ready | 123.30 → 128.94 |
| Warm 3D entry | 23.30 → 22.10 |
| Reload with saved 64 shots | 729.92 → 730.90 |

| Shots | Pure compile | Target edit | Seek submission | Save | Details pair + layout | Renderer CPU submission |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 0.10 → 0.10 | 2.00 → 2.20 | 0.50 → 0.50 | 0.10 → 0.10 | 0.50 → 0.60 | 0.40 → 0.40 |
| 8 | 0.10 → 0.10 | 2.40 → 2.60 | 0.50 → 0.50 | 0.10 → 0.10 | 0.50 → 0.50 | 0.40 → 0.40 |
| 64 | 0.70 → 0.70 | 6.40 → 6.50 | 0.80 → 0.80 | 0.50 → 0.50 | 0.50 → 0.60 | 0.40 → 0.40 |

**390×844, DPR3 phone emulation; before → candidate, milliseconds.**

| Readiness/action | Median |
| --- | --- |
| Builder ready | 83.10 → 85.27 |
| First 3D ready | 128.44 → 150.73 |
| Warm 3D entry | 22.30 → 41.50 |
| Reload with saved 64 shots | 744.59 → 788.32 |

| Shots | Pure compile | Target edit | Seek submission | Save | Details pair + layout | Renderer CPU submission |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 0.10 → 0.10 | 2.00 → 2.10 | 0.50 → 0.50 | 0.10 → 0.10 | 0.50 → 0.50 | 0.40 → 0.40 |
| 8 | 0.10 → 0.10 | 2.60 → 2.40 | 0.50 → 0.50 | 0.10 → 0.20 | 0.50 → 0.50 | 0.40 → 0.40 |
| 64 | 0.70 → 0.70 | 6.20 → 6.30 | 0.80 → 0.80 | 0.50 → 0.50 | 0.60 → 0.60 | 0.40 → 0.40 |

The DPR3 phone renders more pixels and warm 3D entry increased from 22.30ms to 41.50ms; first readiness increased from 128.44ms to 150.73ms. This measured cost is retained for fidelity, not concealed by lowering resolution. Median renderer CPU command submission remains 0.40ms in both layouts; it does not measure GPU completion. The final park uses 44 geometries, 58 draw calls and 8,832 triangles versus 43, 57 and 8,830 at the checkpoint. Textures settle at 17 for these desktop samples and 18 for the phone samples; other contact/occlusion scenarios warm to 19 and remain bounded.

Across all twelve measured runs, one canvas remained, no render request remained pending, and **zero application renders occurred during 60 paused observer callbacks**. Those callbacks took approximately 492–500ms; their cadence is not displayed frame rate. Each run also performed ten warm 2D/3D cycles and three reloads retaining 64 shots. Menu click-pair dispatch was below 0.1ms median timer resolution; that metric excludes completed layout/paint and is not a claim of zero-cost visual opening. Details measurements explicitly flush layout.

These are bounded CPU/resource measurements and stress sessions (175.1s total matched command time), not a multi-hour physical-device soak or proof against every memory leak. [Desktop raw measurements](results/performance-desktop.json), [phone raw measurements](results/performance-phone.json).

| Final check | Actual result |
| --- | --- |
| Units and contract tests | 168 passed, zero failed/skipped |
| Syntax, static references and brand | Passed; 96 referenced assets |
| Generated assets | 66 paths verified without changing the checkout |
| Chromium full catalog | 311 passed, zero failed/skipped/flaky; 379.1s |
| Playwright WebKit full catalog | 304 passed, exact seven infrastructure failures; zero skipped/flaky; 228.5s |
| Canonical/domain/generated | 25 catalog fixtures; 533 valid + 33 invalid generated inputs; all expected invariants/outcomes |
| Persistence/history | 32×500 model operations; all invariants and failure recovery passed |
| Lifecycle / transport / recovery soaks | All three final commands passed in both engines; bounded 49.1s combined command duration |
| Packaged artifact and upgrade matrix | 18/18 passed: nine modes × two engines; 99 runtime hashes, 97 cache entries, eight offline lessons each |
| Visual review | Three fresh Luna waves plus correction addenda; final game identity, 320 menu and actual 200% text accepted |
| Native Safari / physical devices | Final native access blocked; physical testing unavailable |

[Compact final result](results/final-verification.json) records the runtime, exact browser counts and failures. Full browser logs/traces remain in local temporary QA directories rather than bloating the repository. Product assertions were not weakened to pass; navigation selectors were updated to follow the actual visible interface. The existing WebKit exception catalog was expanded only for new passing tests, with the original seven failure signatures unchanged.

## VISUALS

### Before and after

The matched baseline is checkpoint `1375835`, not an unrelated old design. The final runtime retains court-first entry and replaces the remaining form-like presentation with coherent game choices, intent sections, document menus and contextual warnings. The app opens paused with the editable 3D court, one Play/Pause control, chapter timeline, Menu, current shot, Edit and Add. There are no Previous, Next, Restart or Loop transport controls.

| Surface | Checkpoint | Final candidate |
| --- | --- | --- |
| Phone resting 3D | [Before](before/phone-rest-3d.png) | [After](after/phone-rest-3d.png) |
| Phone menu | [Before](before/phone-menu.png) | [After](after/phone-menu.png) |
| Phone Shot details | [Before](before/phone-shot-card.png) | [After](after/phone-shot-card.png) |
| Desktop resting 3D | [Before](before/desktop-rest-3d.png) | [After](after/desktop-rest-3d.png) |
| Desktop editor | [Before](before/desktop-details.png) | [After](after/desktop-details.png) |
| Phone 2D | [Before](before/phone-rest-2d.png) | [After](after/phone-rest-2d.png) |

Phone variants: [320×568](after/phone-small-rest-3d.png), [430×932](after/phone-large-rest-3d.png), [landscape](after/landscape-rest-3d.png). Wider composition: [tablet](after/tablet-rest-3d.png), [desktop 2D](after/desktop-rest-2d.png). Normal-state images were captured on `7be0c58`; the subsequent `9024bfc` correction changes enlarged controls and accessibility relationships, not those normal pixels. Final enlargement evidence is in the third review addendum.

### Interface, world and pixel quality

The original frames use stepped edges, warm paper, navy outlines, restrained amber selection and coherent dark-theme equivalents. Family and Hitter are compact choice cards with live accessible selects. **Edit by intent** exposes Target, Flight, Players, Movement, Coach Tools and Precision on the same document actions at every width. [Movement](after/phone-movement.png), [Precision](after/phone-precision.png), [document menu](after/phone-document-menu.png).

Shot descriptions derive from target, family, arc and pace. Direction is labelled from the green-side viewpoint instead of falsely calling any lateral target crosscourt; nonpreset flight values say Custom. At 320px the header says Shot 1 and the footer retains Serve. A warning names the affected shot, distinguishes rule/feasibility/support/coaching categories, preserves intent and offers a relevant correction route. [Validation](after/phone-validation.png).

The seek rail spans the phone width with directly available Undo/Redo. Chapter position follows actual logical time. [Expanded chapters](after/phone-chapters.png) provide comfortable selection for long rallies. Desktop releases the editor column when the panel closes; an open panel uses the same game language with more simultaneous room.

The world pass adds deliberately layered tree canopies, clipped shrubs, clearer bench slats, coordinated grass clusters and staggered clay pavers. Quiet court colors keep team, ball and target contrast. 2D gutters continue the park texture instead of exposed cream. No extra crowd, moving decorations, copied game asset or random runtime noise was added. The athletes, outlined ball, grip anchors, court markings and coordinate geometry are unchanged. [Original source and rights](../ASSET_PROVENANCE.md).

The renderer now honors up to DPR3 instead of stopping at DPR2, without reducing logical render quality to create pixelation. Nearest sampling and existing deliberate asset resolution preserve crisp edges. A controlled 390px DPR3 comparison increased the buffer from 756×1374 to 1134×2061 with unchanged geometry/texture counts; that is 2.25× the pixels and a real physical-device cost still to assess. [High-DPI comparison](hidpi/README.md), [full DPR3 sample](after/phone-rest-3d-dpr3.png). The generated 45-glyph Park Labels font is original and local; long copy, values and names remain live readable text.

### Independent critique and correction

[Wave 1](review-wave1.md) identified the crowded landscape header, shortened phone controls and technical editor density. [Wave 2](review-wave2.md) challenged generic forms, 2D gutters, nested coaching tools and target/pin recovery. [Wave 3](review-wave3.md) used visible custom Drive, direct target, deliberate invalid pin, correction, save/reopen, playback and view routes. Its early verdict was conditional; that triggered the choice cards and clearer intent treatment rather than being counted as acceptance.

The final third-wave addendum says the current editor is an integrated original pixel-game coaching tool with **no fundamental web-form mismatch**. It then caught the 320px menu collision and, when asked to distinguish device density from actual text scaling, the 200% header overflow. Both were reproduced and corrected. Independent source audit confirmed original asset provenance and preservation; its keyboard-tab finding was corrected too.

Remaining visual limitations are bounded: advanced editing at 320px occupies most of the screen and requires scrolling; its tab row can leave view while deep in a section. Help is long. Target labels can crowd a nearby athlete. Wide grass remains intentionally quiet. These do not prevent access or rewrite authored data, and are retained as future refinement rather than expanding this mission into a new UI architecture.

### Measured composition and motion

The world remains the majority of the resting portrait viewport. The full-width touch rail and clearer context use more space than the already court-first checkpoint. These measurements therefore do **not** claim a larger court everywhere. All four regulation-court corners stay in every sampled viewport; the off-court instructional envelope is preserved.

| CSS viewport | World host, before → after | Permanent interface, before → after | Projected regulation court, before → after |
| --- | --- | --- | --- |
| 390×844 | 79.1% → 72.8% | 15.1% → 21.4% | 31.5% → 30.4% |
| 430×932 | 81.0% → 75.3% | 13.7% → 19.4% | 31.9% → 30.9% |
| 320×568 | 70.1% → 60.8% | 22.1% → 31.4% | 26.4% → 19.9% |
| 844×390 | 65.7% → 57.9% | 28.8% → 36.6% | 11.6% → 9.0% |
| 768×1024 | 84.8% → 82.2% | 11.3% → 13.9% | 27.7% → 26.1% |
| 1440×900 | 83.5% → 80.6% | 13.0% → 16.0% | 24.2% → 23.4% |

These are distinct rectangle/polygon measurements, not an engagement or usability score. Capture methodology disables CSS transitions for stills, uses fresh profiles, and measures CSS pixels; high-DPI originals are separate. [Before measurements](before/measurements.json), [after measurements](after/measurements.json).

Three normal 1× recordings cover the [starter](motion/starter/normal-speed-playback.webm), [drive/block/reset](motion/drive-block-reset/normal-speed-playback.webm) and [lob/overhead](motion/lob-overhead/normal-speed-playback.webm), including at least two complete repetitions, pause/resume, pointer scrub, chapter selection and 2D/3D changes. Durations are 23.68s, 26.16s and 19.48s. Astra inspected 140 half-second samples spanning their entire durations; this is **whole-duration sampled review**, not every frame or physical displayed-frame-rate measurement. No sampled blank, unintended loop drift, obvious contact discontinuity or missing ball was observed. Each clip has 11 recorded interaction milestones and no page errors. Exact event and sampling metadata sit beside each clip.

## Local delivery and owner walkthrough

Branch: **`integration/robustness-visual-fidelity`**. Runtime source: **`9024bfc`**; the final report/evidence commit is the local delivery tip. The working tree is clean at delivery. [Focused implementation commits](results/implementation-commits.txt) preserve independent fixes and visual changes; the checkpoint branch remains intact.

Review preview: **http://127.0.0.1:4173** serving the exact packaged candidate. Source preview: http://127.0.0.1:4184. Frozen pixel baseline: http://127.0.0.1:4180. Frozen stabilized-engine baseline: http://127.0.0.1:4190. Worker previews on 4192–4195 are stopped.

[Packaged candidate ZIP](../../release-results/Pickleball-Park-local-review.zip) contains only the 99 runtime files and two build metadata files. The `dist` build metadata records the delivery commit; its runtime manifest remains the exact tested hash above. [Package result](results/package-verification.json) is from the same runtime with earlier report metadata `933eee3`; final metadata rebuilding does not alter the runtime bytes.

Processes intentionally left running: review server PID 68545 (4173), source server PID 69815 (4184), requested frozen baseline PID 99598 (4180), stabilized baseline PID 6652 (4190), plus their existing Berd monitors. Bounded tests and performance producers have finished; no ongoing background test is promised.

1. Open the local review preview. It should open paused in 3D. Play, pause, drag the timeline, select a chapter and resume through a repeat.
2. Edit Shot 3 from Drop to Drive. Place its target on court; Undo and Redo. Open each intent group, especially Movement and Coach Tools.
3. Create a deliberately unreachable pin, inspect the named-shot warning and use its source-pin correction route. Undo should restore the exact pin.
4. Menu → Play file → Save As. Reopen it from My Plays, export/import the JSON, reload, and take a Planner round trip.
5. On physical iPhone/iPad Safari and installed standalone mode: repeat Help open/close while paused and playing at least 20 times; background/return, rotate, invoke the keyboard, try a cancelled/second-finger target drag, use text enlargement and VoiceOver, then load a 64-shot saved play. Verify offline reload/editing/lessons/3D once cached. Report any blank court with device/OS, viewport, last action and whether 2D/reopening recovers it.

Physical and final native acceptance remain pending. No remote publication is authorized by this report.
