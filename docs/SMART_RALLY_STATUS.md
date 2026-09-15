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

| ID | Baseline observation / reproduction | Implementation owner | Regression and browser evidence | Status |
| --- | --- | --- | --- | --- |
| R01 | Main menu includes the unwanted subtitle; retain the approved title art. | Luna interface | Pending title/divider and viewport captures. | In progress |
| R02 | Independent native details elements permit unrelated panels to coexist. | Luna interface | Pending ordered menu/chapter/options tests, child selector and focus tests. | In progress |
| R03 | Routine successful save status occupies the court header and menu. | Luna interface / integration | Pending quiet success, visible failure/conflict and management journeys. | In progress |
| R04 | Family is a native select; advanced disclosure says Edit by intent; deletion is inside More shot actions. | Luna interface / integration | Pending semantic picker, Customize, structural actions, mobile access. | In progress |
| R05 | Add selects player3/player1 by team and always Drive after the first shot, without whole-rally validation. Owner reports Fifth Shot Drop continuation failure. | Luna generation / integration | Pending failing-before fixture, validated continuations and rapid Add queue. | In progress |
| R06 | Random Rally is absent. | Luna generation / integration | Pending exact hit count, seed corpus, variety, cancellation, stale result, UI and offline tests. | In progress |
| R07 | Shared schema maximum is 64; UI duplicates a literal 64. | Luna generation / interface | Pending 63/64/65/98/99/100 boundaries and invalid request/import tests. | In progress |
| R08 | Coach explains findings and routes editing; no evaluated transactional repair. | Next Luna wave / integration | Pending automatic repair, consent, downstream rejection, stale result and one-step Undo. | Planned |
| R09 | Normal presentation uses numbered team labels. | Luna input / next wave | Pending stable starting-role labels, ambiguous layouts, crossings/cameras/views. | In progress |
| R10 | Environmental Help sign exists; real Help access must remain. | Next Luna wave | Pending both scene paths, asset reproduction, all workspace Help routes. | Planned |
| R11 | Appearance is a full menu row. | Luna interface | Pending compact accessible toggle in both themes with state preservation. | In progress |
| R12 | Curved arrows are Undo and Redo; global Space playback is absent. | Luna input / integration | Pending focus/key ownership and single activation tests. | In progress |
| R13 | Owner reports native Safari sticky seek; historical automation is not a reproduction. | Luna input | Pending event trace, release/cancel/blur/second pointer and browser comparison. | In progress |
| R14 | Owner reports Chrome More closes during Camera or speed selection. | Luna interface | Pending demonstrated mechanism and native/automated comparison. | In progress |
| R15 | Owner reports iPhone Edit activates Family immediately. | Luna interface | Pending activation/focus trace, explicit second-tap and remaining selector checks. | In progress |
| R16 | Editor labels differ by breakpoint; short landscape needs inspection. | Luna interface | Pending Close semantics, scroll, rotation, enlarged text and input preservation. | In progress |
| R17 | Source branch has no packaged build-info endpoint; v23 alone does not identify runtime. | Next Luna wave / integration | Pending loaded versus server identity, source/package subpath and offline diagnostics. | Planned |

## Shared implementation contracts

The versioned document, compiler, assisted revalidation, and single coaching session remain authoritative. Proposal helpers operate on copies above that compiler. Smart Add may only append to the authored prefix. Random Rally creates a separate draft. Coach may apply only its evaluated changes, with explicit acceptance for protected intent. A source identity and controller revision must still match at application. Each successful application is one document/history transaction.

Existing documents conservatively retain authored ownership. New automatic choices require explicit, bounded, backward-compatible metadata; matching a default value does not grant permission to overwrite it. Whole-rally validation includes assistance when enabled. The UI displays pending work separately from persisted success and may never claim an invalid placeholder was added successfully.

## Verification record

To be populated with actual command outcomes, reproducible seeds, browser versions, isolated visible journeys, and independent findings as integration proceeds. Native Safari, automated WebKit, touch emulation, and physical device testing will be reported separately.
