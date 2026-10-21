# Smart rally authoring — requirements and verification

Status: implementation in progress. This ledger controls the local continuation; previous fidelity reports describe the historical baseline, not acceptance of this mission.

## Source and execution boundary

- Starting source: `b2b36e2f5c4ad542cdf43a2a03cf1a1f7db27585`, clean checkout, public branch `integration/robustness-visual-fidelity`.
- GitHub Pages inspected on 2026-09-15: legacy branch publication from that branch's `/`; successful Pages run at the same source. Production is therefore the fidelity source branch, not the older main artifact. No remote mutation is authorized here.
- Recoverable local checkpoint: `checkpoint/smart-rallies-start-b2b36e2`.
- Authoritative continuation: `integration/smart-rally-authoring`, forked from the public candidate without merging archived development branches.
- Existing comparison/review previews are retained. Frozen public source comparison: port 4191. Integration source: port 4184. Final package port 4173 is reserved until final local delivery.
- Actual collaboration capacity: four simultaneous agents including Astra. Three isolated workers were explicitly routed through the harness with model `gpt-5.6-luna` and high reasoning, rather than merely named Luna. Further waves will provide Coach, metadata, and independent acceptance work.
- Existing dependencies only. Owner browser storage and saved plays are not test fixtures. Evidence must omit personal paths, unrelated browser content, and private logs.

## Requirements ledger

The implementation is assembled locally. Final combined browser, package, offline, and visual acceptance is still in progress; individual passes below are not a completion declaration.

| ID | Implemented behavior / reproduced finding | Evidence and remaining gate |
| --- | --- | --- |
| R01 | Preserved wordmark, diamond and frame; removed subtitle; consistent groups. | Independent UI review and final viewport captures. |
| R02 | Captured non-bubbling details toggles enforce unrelated-panel ownership; nested controls retain parent. | Luna Chromium/WebKit tests; native Safari menu/chapter observation; broader regression pending. |
| R03 | Successful saving is quiet at rest, management is secondary; errors/conflicts retained. | Persistence and live status journeys; failed save remains an explicit exception. |
| R04 | Nine semantic shot choices, labelled Shot actions, Customize, full precision/movement tools. | Keyboard picker tests; fresh phone authoring and dismissal corrections underway. |
| R05 | Queued Add evaluates complete effective rally and preserves prefix; one Undo per success. | Five rapid Add transactions, Fifth Shot Drop + five, 100 seeds × five Adds. Independent seed-5 dead end reproduced and fixed with bounded lookahead. |
| R06 | Seeded offline generation returns exact requested contacts in a new saved draft; cancellable and guarded against newer intent. | Boundary corpus, newer-edit cancellation, 99-hit reload; final modal feedback and package checks pending. |
| R07 | Shared 99-hit maximum; no truncation; 100 and malformed requests rejected. | Schema/import, generator, 99 chapters, legacy 64 and final long workflows. |
| R08 | Evaluated automatic repair and consented options; protected intent and full downstream validation; atomic Undo. | Stable repair/pin/later-error/no-solution fixtures, metadata-bypass and stale guards; controller tests. |
| R09 | Immutable IDs gain team-relative starting labels; ambiguous layouts use A/B. | Label units and court accessibility; cameras/crossings and explanatory copy in final review. |
| R10 | Shared decorative Help landmark and unused raster removed; product banner retained. | 65 generated assets reproduced, static references checked; Help in Builder/Planner tested, Learn in final journey. |
| R11 | Compact sun/moon control preserves theme preference. | Both-theme and state-preservation regressions. |
| R12 | Space uses the same Play/Pause command, preserves native control ownership and Undo/Redo. | Keyboard units/browser checks; no transport stepping controls. |
| R13 | One scrub operation owns native/custom events; release, cancellation, blur and explicit Pause terminate authority. | 19 timeline cases; native Safari 27 click checks. Native CUA drag delivery was insufficient; no physical-device claim. |
| R14 | Click dismissal excludes native selects; Camera/speed remain inside their task. | Baseline Chromium select click closed parent; corrected parent stays open. Cross-browser focused checks and native comparison. |
| R15 | Removed hidden duplicate Family select; editor entry must focus a nonediting Close control. | Fresh activation review correcting remaining stale focus route; final touch/keyboard checks pending. |
| R16 | Close consistently dismisses details; advanced controls remain available. | Compact/landscape/enlarged-text tests and fresh visual correction pass pending. |
| R17 | Embedded loaded identity and separate no-store server comparison; source endpoint and package metadata; no self-hash. | Identity/delayed-query tests, Help diagnostics and Planner access pass; actual project-subpath/offline/package gate pending. |

## Shared implementation contracts

The versioned document, compiler, assisted revalidation, and single coaching session remain authoritative. Proposal helpers operate on copies above that compiler. Smart Add may only append to the authored prefix. Random Rally creates a separate draft. Coach may apply only its evaluated changes, with explicit acceptance for protected intent. A source identity and controller revision must still match at application. Each successful application is one document/history transaction.

Existing documents conservatively retain authored ownership. New automatic choices require explicit, bounded, backward-compatible metadata; matching a default value does not grant permission to overwrite it. Whole-rally validation includes assistance when enabled. The UI displays pending work separately from persisted success and may never claim an invalid placeholder was added successfully.

## Verification record

- The first full Chromium integration sweep stopped at 15 failures: 34 passed and 283 were unrun. Most failures referenced superseded controls; the Help focus test also assumed it contained only one button. These are being migrated without dropping their behavioral checks. One enlarged-text overflow is under corrective UI review.
- The focused combined WebKit run passed 31/31: timeline, smart authoring controller, Coach, diagnostics and corrected menu ownership. This preceded the later serve-default correction and does not substitute for the final suite.
- A 99-hit reload discrepancy was traced to a test inspection calling `store.open` on the older draft, thereby changing the last-opened identity. Corrected read-only inspection and reload passed; no persistence loss was found in that case.
- Explicit flight selection equal to its default previously retained automatic ownership; the controller now records the explicit choice. Undo restores its previous provenance.
- Coach fixtures are stable authored documents rather than regenerating changing assumptions after algorithm corrections. Current generator outputs receive separate positive corpus coverage.
- The strengthened source proof initially counted test/docs HTML and JS as runtime. Matching the actual package discovery corrected that mismatch; temporary-repository tests include those nonruntime files.
- Native Safari, automated WebKit, touch emulation, and physical testing are distinct. No physical iPhone/iPad acceptance is claimed.

## Execution contributions

The harness exposes four active slots including Astra. Real `gpt-5.6-luna` workers, explicitly selected in invocation metadata, implemented input handling, picker/menu UI, generation, Coach, identity tooling, and independent corrections. Subsequent Luna waves own package upgrades, visible phone/native journeys, and full legacy browser regression. Astra integrates and reviews the assembled controller, stale-work guards, domain checks, and final artifact. All work remains on local public-lineage branches; none of these commits has been pushed.
