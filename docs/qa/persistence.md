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

## Passing browser coverage

The same spec includes six independent passing cases:

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
