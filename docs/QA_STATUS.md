# Beta stabilization status

Starting checkpoint: `d66934838a742f126cf9650b2459a5420ea917b8`, verified clean on `integration/pixel-game-shot-timeline`. Work continues locally on `integration/beta-stabilization`. No push, remote preview replacement, merge, deployment, or hosting changes are authorized.

## Test program

The director coordinates three concurrent isolated workers within the available four-agent limit. Roles rotate across fresh Luna recreational, coaching and exploratory challenges; Sol domain generation, persistence, rendering/lifecycle and independent implementation reviews. Production file ownership is explicit. Each confirmed correction needs a reproduction, focused regression, surrounding retest and independent review.

| Program | Planned evidence | Status |
| --- | --- | --- |
| Three fresh visible-interface challenges | Attempts, hesitations, failures, discoveries; compact, wide, touch and keyboard | Round 1 running |
| Canonical pickleball catalog | Intent, contacts, bounces, responsibilities, terminal conditions, visual checks and explicit unsupported cases | Running |
| Seeded domain variations | Reproducible valid/invalid cases, bounded long rallies, invariants, shrunk failures | Running |
| Persistence and history | Every mutation, conflict/recovery, import/export, delayed operations, reopen/close | Scheduled next worker wave |
| Native Safari release blocker | Actual root cause or concrete blocker; native and controlled browser evidence | Investigating |
| Render and asynchronous lifecycle | Delayed initialization, context loss, modal/view/resize/background stress, idle ownership | Running |
| Transport and long rallies | 64-shot authoring lifecycle, deterministic seek, hundreds of repetitions and interruptions | Scheduled |
| Soak and performance | Bounded actions, exact conditions, resource trends and matched timings | Scheduled |
| Final artifact | Units, syntax/assets/brand/generated, both engines, catalog, visible/motion review, offline and historical upgrades | After corrections |

## Findings ledger

Severity: release blocker, high, medium, low. Classification: confirmed defect, usability defect, visual defect, performance defect, browser/test limitation, unsupported capability, future enhancement, expected behavior. Suspicions remain hypotheses until reproduced.

| ID | Classification / severity | Reproduction / root cause | Correction / regression / retest | Status |
| --- | --- | --- | --- | --- |
| BETA-001 | Reported defect / release blocker | Prior native Safari blank 3D after Help on packaged localhost:4173; cause not established | Native reproduction plus controlled lifecycle review | Open |
| BETA-002 | Confirmed defect / medium | A mid-rally document accepted a first serve despite its opening contract | Reject serve outside shot 1 of full-rally opening; focused and surrounding 40/40 units; `0fef773` | Fixed; independent corpus review pending |
| BETA-003 | Confirmed defect / release blocker | Real WebGL context loss while 3D is parked is ignored; reentry reuses a lost context in both engines | Renderer owner preparing loss/disposal regression and fix | Fixing |
| BETA-004 | Confirmed defect / medium | Control-Z on a modal button changes the underlying draft/history in Help, My Plays, Learn and Import/Export; 4/4 focused reproductions | Scope authored shortcuts away from open modals; both Undo and Redo authority checks | Fixing |
| BETA-005 | Confirmed defect / release blocker | Older Open awaiting planner-to-3D restoration can overwrite a later document choice or authored edit | Separate source intent from renderer generation; independent persistence regression | Reproducing |
| BETA-006 | Confirmed defect / release blocker | Pending Use Planner can apply old layout/handedness/drawings to a newer opened play | Intent checked after confirmation and restoration; `9e6e2b7`; surrounding Chromium 16/16, independent four async cases pass | Fixed; final gate pending |
| BETA-007 | Confirmed defect / release blocker | Two never-saved tabs share `starter-draft`; second first-save silently replaces the first | Unique fresh draft identity; `ac88f66`; integrated persistence/reliability Chromium 15/15 | Fixed; independent retest pending |

The first correction round is integrated. BETA-003 was reproduced with the real loss extension in native Safari, producing a visually blank court; after `572c561`, retry creates one live renderer and preserves the draft. Native Help stress passed 24 cycles before and 48 after recovery. This proves the parked-context mechanism and its correction, not the historical Help-only observation's spontaneous cause. See [native-safari.json](qa/native-safari.json).

BETA-004 is fixed in `53b49af`: surrounding Chromium 29/29 and WebKit 18/18. BETA-005 is fixed in `2066995`: surrounding Chromium 16/16 and independent delayed-source retesting passed. Counts describe those scoped runs; they are not final suite targets.

## Environment and evidence limits

macOS native Safari is accessible through its UI. Playwright Chromium and WebKit are installed. No Apple simulator is installed (`xcrun simctl` unavailable). Browser touch, viewport and text simulations are distinct from physical iPhone/iPad, native software keyboard, Dynamic Type and assistive technology acceptance. Disposable isolated origins/profiles use synthetic drafts; personal browser data is preserved.

The previous seven macOS WebKit offline-emulation/cache failures are historical evidence, not passing tests or targets. This campaign will report actual final results and rerun diagnostics if those signatures recur. Native Safari's reported blank court is not assumed to share that cause.
