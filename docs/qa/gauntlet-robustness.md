# Robustness gauntlet: ownership and interruption wave

Starting revision: `13758356d65f154b19ca631e6ecb9bdb8afd875b` (`integration/beta_stabilization`, preserved by `checkpoint/stabilized-engine-1375835`). Work branch: `work/gauntlet-robustness`. This wave keeps the versioned document, compiler, shared session clock, trajectory model, coordinates, lessons, Planner, offline identity, and renderer architecture unchanged.

## New findings

| ID | Severity | Reproduction and root cause | Correction and regression |
| --- | --- | --- | --- |
| GNT-R01 | Medium, confirmed | Arm target placement, then use the keyboard or pointer timeline. The playhead and selected viewing shot change while `BuilderCourtTools.placing` remains true; the next court tap can edit a different shot. Timeline actions bypassed the builder's ordinary `seek()` placement cleanup. | Timeline seek, scrub, and chapter entry now release placement first and preserve the complete document/history. Browser regression uses native range `End`. |
| GNT-R02 | High, confirmed | Begin a target drag, move its preview, then place a second touch on the transport or another off-court control. The surface-only second-pointer listener never sees it; releasing the first pointer commits the preview. | One capture-phase document listener cancels a different pointer/non-primary touch before target dispatch. Destroy removes that exact listener. Regression verifies source target and history remain unchanged. |
| GNT-R03 | Medium, confirmed | Arm placement and invoke the visible-viewport resize callback before pointer-down. Placement survives even though projection/available area can change. The callback only checked `drag`, while the window resize fallback checked both `drag` and `placing`. | Visible viewport change now cancels either state before fitting/reprojection. Regression preserves byte-equivalent document and history. |
| GNT-R04 | Medium, confirmed | In Court Planner, drag player 1, then touch player 2 with a second finger. `startDrag` reads `touches[0]` and replaces `dragElement`, transferring authority to player 2 with player 1's origin. | Planner records the active touch identifier; any second contact cancels instead of transferring the owner. Coordinates follow the owned touch. Two-engine synthetic native-event regression keeps player 2 unchanged. |
| GNT-R05 | Medium, confirmed | Start a Planner drawing, add a line, then send a second touchstart. `startDrawing` replaces `currentPath`; the old SVG path remains visible but is absent from `drawingPaths` and `captureBoardState()`. | A second contact finalizes the one coherent stroke and creates no replacement path. `endDrawing` respects the owning touch. Regression asserts DOM children, drawing model, and captured snapshot are all exactly one. |
| GNT-R06 | Low, confirmed | Hold a primary mouse drag and press a non-primary button over another player. The second `mousedown` replaces the drag owner. | Non-primary presses end the old operation and cannot begin another. A held operation also cannot be transferred by another `mousedown`. |
| GNT-R07 | Medium, confirmed | Background the page or return from Planner while a token/drawing gesture is active. Planner gesture state survives background, and an in-progress path can miss the snapshot taken before playback cleanup finalizes it. | Visibility loss releases Planner drag/drawing ownership. Returning to Builder finalizes input before `plannerSnapshot`. Help also releases Planner gestures before opening. Regressions verify one captured stroke and no live owner. |
| GNT-R08 | Low, confirmed stale UI result | Start two 2D pixel-actor loads for the same play object with distinct Planner snapshots; resolve the newer load, then reject the older. The success path checks play and snapshot identity, while the catch path checked only play identity, so the stale rejection overwrote the current announcement. | The rejection now requires both current play and snapshot identity, matching the success path. The controlled older-finishes-last regression preserves the newer announcement and runtime. |

The pre-fix GNT-R01 and GNT-R02 controlled run failed 2/2 in Chromium. GNT-R08 independently fails its controlled Chromium test before correction. GNT-R04/R05 were confirmed from the same concrete event sequences: the former transferred `dragElement`; the latter left a DOM path count greater than captured `drawingPaths`.

## Verification completed in this branch

- New interruption/stale-result suite after GNT-R01 through GNT-R08 corrections: 9/9 Chromium and 9/9 Playwright WebKit.
- Surrounding input, timeline, projection, persistence, Undo/Redo, import, 64-shot round trip, page-close save, two-tab conflict, and touch set: 38/38 Chromium.
- The equivalent surrounding WebKit run passed 36 product cases; its first versions of two new multi-touch tests failed because WebKit does not expose the `Touch` constructor to page script. Rewriting those tests through Playwright's cross-engine event dispatch produced 8/8 focused WebKit. This was a test-harness correction, not a product waiver.
- The existing 64-shot persistence/import/retained-waypoint case passes in both engines in the surrounding run. Existing seeded history model covers 140 browser actions; the new tests add interrupted combined-action paths rather than reusing the prior campaign totals.
- A fresh surrounding session/renderer set passed 30/30 in Chromium and 30/30 in Playwright WebKit after the stale actor-load correction. It covers delayed 3D cancellation, allocation failure, visibility, real context loss, 120 Help/play/view transitions, parked/re-entry cycles, 50 automatic repetitions, shared 2D/3D time, and paused demand rendering.

## Audit results without a new defect

Compilation is synchronous, so edit A/edit B cannot produce an out-of-order compiler Promise. Import parsing is also synchronous; delayed file reads already use `importFileGeneration`, and the existing controlled older-file-finishes-last/closed-dialog test passes in both engines. Source choices that await Planner-to-Builder restoration use `sourceIntent`, and the existing Open/Import/edit/Save As/Use Planner delayed cases pass in both engines.

3D startup has three explicit identities: builder view generation, lazy-module request generation plus play/snapshot, and viewer asset generation plus AbortController/play/snapshot. The current delayed entry, allocation failure, context loss, and parked renderer tests cover those boundaries. `BuilderCourtTools.bind()` can await its first module import, but its resumed `render()` re-reads the current view and it has no reachable destroy path in the current application. A hypothetical future destroy-while-importing issue was not treated as a current defect.

## Remaining scope and limits

The builder menu-summary cancellation belongs to the concurrent interface owner: at the checkpoint, opening and closing the menu without choosing an action can leave armed placement active. A separate UI correction is being coordinated so panel opening explicitly releases placement.

This wave is Playwright browser evidence. It does not claim physical iPhone/iPad acceptance or establish the historical native Safari Help-only blank cause. No production, remote preview, release setting, service-worker identity, paid dependency, backend, push, merge, or deployment was changed.
