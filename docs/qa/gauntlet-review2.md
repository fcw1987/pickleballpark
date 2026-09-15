# Independent robustness review 2

Review base: `17620744dd26eb0090508500a65654b8e5084126` on `integration/robustness-visual-fidelity`. Isolated branch: `work/gauntlet-review2`. The review kept the document schema, compiler, rally rules, shared session clock, renderer architecture, storage envelope, product identity, and offline contracts unchanged.

## Confirmed finding

### G-AUTH01 — High — Help can expose one shot while the next target edit commits to another

Exact visible reproduction in both isolated Chromium and Playwright WebKit:

1. Open the starter three-shot builder in 2D with its editor collapsed. Shot 1 is the authoring selection.
2. Choose **Play**, open **Choose shot chapter**, and choose Shot 2 while playback is running. The live chapter is Shot 2; keeping Shot 1 as the authoring selection is valid while playback runs.
3. Open **Menu → Help**. Help pauses playback. Close Help.
4. Drag the visible target ring.

At the base revision, the shot card and timeline identify Shot 2, but `PlayBuilder.selectedShotId` and `BuilderCourtTools` still identify Shot 1. The drag creates exactly one history transition and changes Shot 1 from `{x:5,y:38}` to approximately `{x:7.288,y:39.255}`. Shot 2 remains byte-equivalent. Autosave then durably saves the unintended Shot 1 edit.

The split occurs at the UI/controller transition. `PlayBuilder.action('help')` pauses the shared clock, but at the base revision it does not publish a render before handing control back to the Help callback. The callback can therefore reconcile against the previous playing/current-shot snapshot. The focused correction renders immediately after `pause()` and before opening Help. The UI can then synchronize the collapsed editor to the authoritative paused chapter while preserving an explicitly open editor on its authored shot.

`tests/gauntlet-review2.spec.mjs` adds two controlled cases. The primary case uses visible Play, chapter, Menu, Help, close, and pointer-drag controls and asserts that the live shot owns the ring and resulting edit. The separately labelled model probe holds an explicit editor open, changes only the playback chapter, opens Help visibly, and asserts that the selected authored shot remains intact with history index 0.

Pre-correction evidence:

- Chromium: the expected-authority case fails after the drag because Shot 1 changed; the open-editor model probe passes.
- Playwright WebKit: the same expected-authority case fails after the drag with the same wrong-shot coordinates.

Post-correction, both the collapsed-editor authority case and open-editor preservation probe pass in Chromium and Playwright WebKit (2/2 in each engine).

### G-STAT01 — Medium — the always-visible save pill can claim Saved during a pending field edit

Exact visible reproduction in Chromium on the corrected candidate:

1. Open **Menu → Play file**, change the title, and leave the field so the document is saved.
2. Focus the title again and type a second value without leaving the field.
3. Compare the two visible save states while the field remains focused.

The document-menu status correctly changes to **Editing · not saved yet**, but the always-visible save pill and its accessible label remain **Saved on this device**. The new controlled regression confirms both values in the same frame. `builder-ui.js` sets `pendingField` on input and updates `.builder-save-status`, but does not update `[data-ui="save-pill"]` until a later render.

Normal blur, visibility-change, and pagehide flows commit the field, so no lost write was reproduced. The observed defect is the contradictory visible and accessible status during the pending edit. The failing assertion is preserved for the UI owner rather than weakening the status contract.

## State authority challenge results

No additional loss-of-work or stale-result defect reproduced in the engine and persistence layers.

- The pending source-operation tests keep later Open, edit plus Save As, rejected Import, and Use Planner choices authoritative across delayed Planner-to-builder restoration.
- `DraftStore` conflict detection retains the in-memory edit when another tab changes the same draft. Save As can claim a fresh ID without overwriting the other tab. Never-saved tabs start with distinct UUIDs.
- A synchronized two-tab race probe repeated 30 same-draft title writes. Every round produced a conflict in one tab; zero rounds allowed both tabs to claim a successful save while only one title remained. This is bounded evidence rather than a general proof of cross-process localStorage serialization.
- Compilation, validation, import parsing, history commit, and localStorage save attempts remain synchronous. There is no compiler or storage Promise whose older completion can replace a newer document.
- The corrected 2D actor failure path checks both play and Planner snapshot identity. The delayed renderer tests also retain request generation, play identity, snapshot identity, and Pause intent.
- The shared `CoachingSession` remains the only clock owner. The lifecycle runs ended with no guided RAF, 3D RAF, or hold timer after Pause, and with one renderer canvas where 3D was active.
- Thirty editor/replay cycles retained stable listener deltas and released renderer-owned listeners. The 120-transition Help/playback/visibility/view case settled without scheduler or renderer growth in both engines.

The layer that could redirect user work at the base checkpoint was the collapsed UI selection handoff after Help. The history and persistence layers did not lose the mutation; they faithfully recorded the mutation against the stale shot authority supplied by the UI. On the corrected candidate, the remaining confirmed mismatch is presentation of pending-field save state, not source replacement or history corruption.

## Verification

- Contract/unit run: 74/74 passed across builder storage, schema, compiler, session clock, generated domain corpus, 3D core, and waypoint policy.
- Deterministic persistence soak: 32 seeds × 500 operations; 12,487 mutations, 3,165 undos, 348 redos, and 1,248 persistence checks passed. The 64-shot exact document retained both waypoints; quota atomicity and stale same-draft conflict detection passed.
- Broad Chromium run: 45/49 passed initially. The only robustness startup timeout passed alone without the simultaneous WebKit run, yielding 46 stable product cases. The other three failures are the known pre-integration chapter-menu routing assertions in `pixel-game-context.spec.mjs` against this base UI.
- Broad Playwright WebKit run: 46/49 passed. The same three pre-integration chapter-menu routing assertions failed against this base UI.
- G-AUTH01 pre-correction: reproduced in Chromium and Playwright WebKit. Open-editor preservation probe passed in Chromium.
- G-AUTH01 post-correction: 2/2 passed in Chromium and 2/2 passed in Playwright WebKit.
- Visible navigation migration: the 21-case authoring suite, UI harness, phone interface/reliability, responsive journeys, modal authority, persistence, and 64-shot workflow pass after moving through **Play file**, **Edit by intent**, and the single accessible view-switch control. A hidden 2D startup fallback used during initial adaptation was removed; 35 affected readiness cases then passed while waiting for actual 3D startup completion.
- Enlarged-text layout challenge: the intermediate candidate placed the chapter panel at `x=-618.109375` at 844×390 and 200% root text size. The assertion was kept; the root-owned correction anchors the menu to the header and adds its own layout regression.
- G-STAT01: the controlled Chromium run passes both Help authority cases and fails only the pending save-pill assertion with actual text **Saved on this device** instead of **Editing**.

The browser matrices were deliberately started together once to challenge shared local-preview pressure. That caused one Chromium initialization timeout; its isolated rerun passed. Subsequent focused runs were serialized.

## Limits

This is local Playwright evidence against the isolated port 4195 preview. Playwright WebKit is not a native Safari claim. No physical iPhone or iPad was tested. No deployment, remote preview, dependency installation, service-worker change, cache identity change, merge, push, or production setting was performed.
