# Beta persistence and source-authority QA

This pass tests the local beta candidate derived from `0fef773` with synthetic browser storage and the isolated preview port `4194`. It does not use or inspect personal browser drafts.

## Release blocker: stale source action wins

`PlayBuilder.action('open', id)` can cross the awaited Planner-to-builder 3D restoration. While that restore is pending, a later Open, authored edit plus Save As, or rejected Import can complete. The older Open then resumes and replaces the newer authoritative source in memory and in local storage.

The focused regression is commit `83bbf15` in `tests/qa-persistence.spec.mjs`. Against the uncorrected source, all three cases fail deterministically: the final document is `Authority A` although the later visible result was `Authority B` or its edited copy. The expected correction gives source-changing intents a generation, checks it after the awaited workspace restoration, and returns `{ ok: false }` from a superseded action. This requires a separate generation from the existing 2D/3D view generation.

Reproduction command:

```sh
PORT=4194 PICKLEBALLPARK_TEST_URL=http://127.0.0.1:4194 npx playwright test tests/qa-persistence.spec.mjs --project=chromium --workers=1 --grep "later Open|edit and Save As|rejected newer Import"
```

Baseline result: 3 failed as expected on `0fef773`. Each failure received the saved `starter-draft` / `Authority A` source after the newer operation had already completed.

The central source-intent correction (`2066995`, cherry-picked locally as `39b9188`) passes all three focused cases independently. Two adjacent authority failures were found afterward:

- A confirmed **Use Planner** action can await 3D restoration. A later Open succeeds against the visible builder, then the older action resumes and applies the prior planner layout, handedness, and annotations to the newly opened document. The focused regression is commit `430dc15`.
- Two tabs opened on a fresh origin before either saves both begin with the fixed `starter-draft` identity. Neither store has observed that draft as absent, so the second first-save overwrites the first without a conflict. The focused regression is commit `c3f6aeb`; the observed library contains only `Fresh tab second version`.

Both adjacent failures are fixed. `9e6e2b7` gives **Use Planner** its own source-intent checks around confirmation and workspace restoration. `ac88f66` gives each never-saved starter a per-tab UUID, matching **New Play**. The four asynchronous authority regressions pass together after the first two fixes. After the UUID correction, the fresh two-tab regression and focused-field page-close autosave pass together. The integration run reports all 11 persistence cases plus four iPhone reliability cases passing.

## Passing browser coverage

Besides the five focused regressions, the same spec includes six independent passing cases:

- A seeded 140-step browser state machine checks every document against a bounded snapshot model after edits, undo, redo, autosave, and reopen.
- A deterministic mutation matrix verifies exact one-step undo and redo for title, arc and pace, shot family, manual movement target and pinning, handedness, both assistance controls, insert, duplicate, reorder, delete, and a real court drag.
- A valid 64-shot document preserves exact source and intermediate waypoints through import-as-copy, save, export, reload, and another import-as-copy.
- Malformed, oversized, and unknown-version imports leave both the in-memory and last saved source unchanged.
- Three rapid title inputs preserve the final value when the page is closed with the field still focused, then a fresh page reloads it.
- Delayed file reads resolve newest-first and oldest-last; stale and post-dialog-close reads cannot alter the import textarea.

Passing command and result on the uncorrected source:

```sh
PORT=4194 PICKLEBALLPARK_TEST_URL=http://127.0.0.1:4194 npx playwright test tests/qa-persistence.spec.mjs --project=chromium --workers=1 --grep "bounded random|every authored mutation|64-shot|malformed, oversized|last rapid|out-of-order"
```

Result: 6 passed in isolated Chromium.

## Storage and history soak

`tools/qa-persistence-soak.mjs` uses the production `DraftStore`, `EditHistory`, and document validator. Its default deterministic run covers 32 seeds and 500 operations per seed, checking the retained history model at every step and save/open/export/import periodically. It also checks a 64-shot exact round trip with waypoints, quota-write atomicity, stale same-draft conflict detection, Save-a-copy preservation, and malformed, oversized, and future-version rejection.

```sh
node tools/qa-persistence-soak.mjs
```

Default result on `0fef773`:

```json
{
  "seeds": 32,
  "stepsPerSeed": 500,
  "totalMutations": 12487,
  "totalUndos": 3165,
  "totalRedos": 348,
  "persistenceChecks": 1248,
  "nearLimitShots": 64,
  "retainedWaypointCount": 2,
  "quotaAtomic": true,
  "staleRevisionConflict": true
}
```

The storage module is synchronous: reads, validation, compilation, history commits, and `localStorage.setItem` cannot finish out of invocation order within one JavaScript task. The tested stale-winner defect begins only where a source action awaits UI restoration. File reading is independently asynchronous and already has a working generation guard in `builder-ui.js`.

Before the final runtime pin, the package source gate correctly rejected the locally cherry-picked runtime correction: `npm run build:site` reported `Unapproved runtime change: play-builder.js`. The approved runtime fixture must be refreshed only after the integrated candidate is frozen, then the package gate must pass against those exact bytes.
