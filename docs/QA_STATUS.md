# Beta stabilization status

Current local follow-up: [robustness and visual fidelity report](fidelity/REPORT.md). The figures below describe the earlier stabilization checkpoint.


Starting checkpoint: `d66934838a742f126cf9650b2459a5420ea917b8`, verified clean on `integration/pixel-game-shot-timeline`. The local review candidate is on `integration/beta-stabilization`. No push, remote preview replacement, merge, deployment, or hosting changes are authorized.

## Test program

The director coordinates three concurrent isolated workers within the available four-agent limit. Roles rotate across fresh Luna recreational, coaching and exploratory challenges; Sol domain generation, persistence, rendering/lifecycle and independent implementation reviews. Production file ownership is explicit. Each confirmed correction needs a reproduction, focused regression, surrounding retest and independent review.

| Program | Planned evidence | Status |
| --- | --- | --- |
| Three fresh visible-interface challenges | Attempts, hesitations, failures, discoveries; compact, wide, touch and keyboard | Three fresh rounds completed; additional fresh Luna/Sol Pause reviews passed |
| Canonical pickleball catalog | Intent, contacts, bounces, responsibilities, terminal conditions, visual checks and explicit unsupported cases | Corpus and integrated checks passed |
| Seeded domain variations | Reproducible valid/invalid cases, bounded long rallies, invariants, shrunk failures | Corpus and integrated checks passed |
| Persistence and history | Every mutation, conflict/recovery, import/export, delayed operations, reopen/close | 11 browser cases in both engines, 16,000 model operations passed |
| Native Safari release blocker | Actual root cause or concrete blocker; native and controlled browser evidence | Parked context loss fixed; historical Help-only cause unproved |
| Render and asynchronous lifecycle | Delayed initialization, context loss, modal/view/resize/background stress, idle ownership | Corpus and integrated checks passed |
| Transport and long rallies | 64-shot authoring lifecycle, deterministic seek, hundreds of repetitions and interruptions | Final corrected runtime passed |
| Soak and performance | Bounded actions, exact conditions, resource trends and matched timings | Final corrected runtime passed |
| Final artifact | Units, syntax/assets/brand/generated, both engines, catalog, visible/motion review, offline and historical upgrades | Final checks complete; historical Safari acceptance held |

## Findings ledger

Severity: release blocker, high, medium, low. Classification: confirmed defect, usability defect, visual defect, performance defect, browser/test limitation, unsupported capability, future enhancement, expected behavior. Suspicions remain hypotheses until reproduced.

| ID | Classification / severity | Reproduction / root cause | Correction / regression / retest | Status |
| --- | --- | --- | --- | --- |
| BETA-001 | Reported defect / release blocker | Prior native Safari blank 3D after Help on packaged localhost:4173; cause not established | Native reproduction plus controlled lifecycle review | Open |
| BETA-002 | Confirmed defect / medium | A mid-rally document accepted a first serve despite its opening contract | Reject serve outside shot 1 of full-rally opening; focused and surrounding 40/40 units; `0fef773` | Fixed; independent corpus review passed |
| BETA-003 | Confirmed defect / release blocker | Real WebGL context loss while 3D is parked is ignored; reentry reuses a lost context in both engines | `572c561`; four focused cases per engine, native real-loss pre/post and 200-cycle per-engine soak | Fixed; independent review passed |
| BETA-004 | Confirmed defect / medium | Control-Z on a modal button changes the underlying draft/history in Help, My Plays, Learn and Import/Export; 4/4 focused reproductions | `53b49af`; both Undo and Redo authority checks; Chromium 29/29, WebKit 18/18 surrounding | Fixed; independent review passed |
| BETA-005 | Confirmed defect / release blocker | Older Open awaiting planner-to-3D restoration can overwrite a later document choice or authored edit | `2066995`; separate source intent from renderer generation; three independent delayed-source regressions | Fixed; independent review passed |
| BETA-006 | Confirmed defect / release blocker | Pending Use Planner can apply old layout/handedness/drawings to a newer opened play | Intent checked after confirmation and restoration; `9e6e2b7`; surrounding Chromium 16/16, independent four async cases pass | Fixed; independent and final gates passed |
| BETA-007 | Confirmed defect / release blocker | Two never-saved tabs share `starter-draft`; second first-save silently replaces the first | Unique fresh draft identity; `ac88f66`; integrated persistence/reliability Chromium 15/15 | Fixed; independent two-engine retest passed |
| BETA-008 | Browser/test environment limitation | WebKit `runBeforeUnload: true` returns while the old page remains open; a minimal no-app case reproduces it | Normal completed close plus explicit closed-page assertions; native Cmd-W passes; `7b34060` | Classified; regression corrected without production changes |
| BETA-009 | Confirmed defect / release blocker | Per-frame text/child replacement detached the Pause hit node between press and release; click omitted. Old held-press fails 3/3, intermittent original fails 2/40 | Stable button descendants and guarded text; `eedf069`; held-press 3/3, original 80/80, root event cycles 240/240, fresh Luna 6/6 per engine and Sol surrounding review | Fixed; final gates passed |

The first correction round is integrated. BETA-003 was reproduced with the real loss extension in native Safari, producing a visually blank court; after `572c561`, retry creates one live renderer and preserves the draft. Native Help stress passed 24 cycles before and 48 after recovery. This proves the parked-context mechanism and its correction, not the historical Help-only observation's spontaneous cause. See [native-safari.json](qa/native-safari.json).

BETA-004 is fixed in `53b49af`: surrounding Chromium 29/29 and WebKit 18/18. BETA-005 is fixed in `2066995`: surrounding Chromium 16/16 and independent delayed-source retesting passed. Counts describe those scoped runs; they are not final suite targets.

## Environment and evidence limits

macOS native Safari is accessible through its UI. Playwright Chromium and WebKit are installed. No Apple simulator is installed (`xcrun simctl` unavailable). Browser touch, viewport and text simulations are distinct from physical iPhone/iPad, native software keyboard, Dynamic Type and assistive technology acceptance. Disposable isolated origins/profiles use synthetic drafts; personal browser data is preserved.

The seven macOS WebKit offline-emulation/cache failures recurred in the final run and are reported below as failures. A fresh minimal no-app diagnostic reproduced their signatures. Native Safari's historical blank court is not assumed to share that cause.

## Final verification of runtime e0177cc (cache v22)

- **Chromium: 284/284 passed. WebKit: 277 passed, seven failed.** No skips or retries in these local runs. All seven failures match the pre-existing cache/offline-emulation signatures; a fresh no-app diagnostic reproduced them. They are reported as failures, without a macOS waiver.
- Units: 168/168; runtime syntax; 96 referenced static assets; brand; 66 generated asset paths verified.
- Catalog: all 25 fixtures in both browser suites; four-camera contact/facing checks, deterministic seeks and 2D/3D consistency. The 64-shot authoring/save/import/history journey passed.
- Generated: 87 valid + nine invalid initial cases and 446 valid + 24 invalid extended cases. Including the 25 canonical fixtures, 591 scheduled domain inputs; repeated operations are separate.
- Transport: 640 repetitions, including 40 full 64-shot repetitions, and 1,920 post-render boundary samples. No source/history drift; resources stable after first-use texture warmup; paused idle passed.
- Lifecycle: 200 cycles per engine, eight actual context losses per engine, five viewports. Final one live canvas, 43 geometries/17 textures, no scheduled RAF/hold timer, no errors.
- Persistence model: 32 seeds × 500 = 16,000 operations (12,487 mutations, 3,165 Undo, 348 Redo); 1,248 storage round trips. Both-engine browser persistence coverage passed.
- Package: **14/14 passed**, fresh installation plus six upgrades in each engine (production v15, builder v17, usability v18, PR #17 v19, mission start v20 and interim beta v21). Every case stopped its own server and passed offline custom editing/reload, all eight lessons and 3D. Saved documents and unrelated caches retained.
- Native Safari: actual v22/Pause guard verified; saved play retained; visible Play/Menu/Help/Close/Play/Pause passed; court visible and paused. Historical BETA-001 did not recur and its original cause is still unproved.
- Final matched CPU timings found no material regression; unchanged paused scenes made zero application render calls. [Final performance evidence](qa/final-performance.json).

The earlier 278-case WebKit final-gate run had ten failures: seven known environment signatures, two coaching cases pointing at a retired worker origin (corrected), and the real BETA-009 Pause defect. It was reproduced, corrected and independently reviewed; the final 284-case run has only the seven environment failures.

The complete final statistics, seeds, resources and package results are retained in [qa/results.json](qa/results.json). See [the stabilization report](BETA_STABILIZATION_REPORT.md) for owner review. **Beta sign-off remains held for the owner's disposition of the historical BETA-001 report; no cause or fix is invented.**
