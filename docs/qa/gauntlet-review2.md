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

The split occurs at the UI/controller transition. `builder-ui.js` already owns `syncViewingShot()` and uses it after timeline and Play/Pause transitions. Its Help branch pauses through `rerenderAction('help')` but does not run that synchronization afterward. The builder core cannot unconditionally replace selection on Help because an explicitly open editor is allowed to stay on its authored shot while the playback chapter changes.

`tests/gauntlet-review2.spec.mjs` adds two controlled cases. The primary case uses visible Play, chapter, Menu, Help, close, and pointer-drag controls and asserts that the live shot owns the ring and resulting edit. The separately labelled model probe holds an explicit editor open, changes only the playback chapter, opens Help visibly, and asserts that the selected authored shot remains intact with history index 0.

Pre-correction evidence:

- Chromium: the expected-authority case fails after the drag because Shot 1 changed; the open-editor model probe passes.
- Playwright WebKit: the same expected-authority case fails after the drag with the same wrong-shot coordinates.

## State authority challenge results

No additional loss-of-work or stale-result defect reproduced in the engine and persistence layers.

- The pending source-operation tests keep later Open, edit plus Save As, rejected Import, and Use Planner choices authoritative across delayed Planner-to-builder restoration.
- `DraftStore` conflict detection retains the in-memory edit when another tab changes the same draft. Save As can claim a fresh ID without overwriting the other tab. Never-saved tabs start with distinct UUIDs.
- Compilation, validation, import parsing, history commit, and localStorage save attempts remain synchronous. There is no compiler or storage Promise whose older completion can replace a newer document.
- The corrected 2D actor failure path checks both play and Planner snapshot identity. The delayed renderer tests also retain request generation, play identity, snapshot identity, and Pause intent.
- The shared `CoachingSession` remains the only clock owner. The lifecycle runs ended with no guided RAF, 3D RAF, or hold timer after Pause, and with one renderer canvas where 3D was active.
- Thirty editor/replay cycles retained stable listener deltas and released renderer-owned listeners. The 120-transition Help/playback/visibility/view case settled without scheduler or renderer growth in both engines.

The layer that could redirect user work at this checkpoint was therefore the collapsed UI selection handoff after Help. The history and persistence layers did not lose the mutation; they faithfully recorded the mutation against the stale shot authority supplied by the UI.

## Verification

- Contract/unit run: 74/74 passed across builder storage, schema, compiler, session clock, generated domain corpus, 3D core, and waypoint policy.
- Deterministic persistence soak: 32 seeds × 500 operations; 12,487 mutations, 3,165 undos, 348 redos, and 1,248 persistence checks passed. The 64-shot exact document retained both waypoints; quota atomicity and stale same-draft conflict detection passed.
- Broad Chromium run: 45/49 passed initially. The only robustness startup timeout passed alone without the simultaneous WebKit run, yielding 46 stable product cases. The other three failures are the known pre-integration chapter-menu routing assertions in `pixel-game-context.spec.mjs` against this base UI.
- Broad Playwright WebKit run: 46/49 passed. The same three pre-integration chapter-menu routing assertions failed against this base UI.
- G-AUTH01 pre-correction: reproduced in Chromium and Playwright WebKit. Open-editor preservation probe passed in Chromium.

The browser matrices were deliberately started together once to challenge shared local-preview pressure. That caused one Chromium initialization timeout; its isolated rerun passed. Subsequent focused runs were serialized.

## Limits

This is local Playwright evidence against the isolated port 4195 preview. Playwright WebKit is not a native Safari claim. No physical iPhone or iPad was tested. No deployment, remote preview, dependency installation, service-worker change, cache identity change, merge, push, or production setting was performed.
