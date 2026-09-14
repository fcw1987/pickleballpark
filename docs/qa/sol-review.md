# Independent Sol beta review

Review source: `3270c57` (`qa/beta-sol-review`), compared with `d669348`.

## Result

No new product blocker was found in the four reviewed fixes. The independent
browser checks passed with one Chromium worker, including an active-playback
variant of parked WebGL loss that was absent from the original regression.

The source/package gate was temporarily red during review: `npm run check`
reported `Runtime file mismatch: play-builder.js` in
`tests/deployment-artifact.unit.mjs`. This was the expected frozen runtime pin
while runtime fixes were still landing, and the release owner is responsible
for refreshing and re-verifying the exact artifact after the runtime becomes
final. It is evidence that package/source equivalence had not yet been
established at `3270c57`, rather than evidence of a separate runtime defect.

## State-authority review

### Mid-rally serve validation (`0fef773`)

`validateRecipeIntent` now rejects a serve whenever it appears after index zero
or when the opening condition is `midrally`. The existing focused unit case and
the extended invalid corpus cover the first mid-rally recipe and a later serve.
The intentional-fault path remains deliberately separate: it retains a rule
warning and terminates the demonstration, as documented for authored coaching
mistakes.

### Modal keyboard ownership (`53b49af`)

The document shortcut listener returns before authored Undo/Redo or placement
Escape handling whenever a native builder dialog, the information modal, or the
park menu overlay owns focus. All four modal entry points passed real keyboard
checks for Control-Z and Command-Shift-Z. The listener is installed once by the
single builder instance; the fix adds no loop or listener registration.

### Parked WebGL context loss (`572c561`)

The context-loss handler now accepts a loss from the current renderer even when
the 3D view is suspended, disposes that dead renderer, and leaves the shared
playback session under the guided 2D owner. The independent active-playback
case verified all of the following across loss and 3D recreation:

- source JSON remained byte-for-byte identical;
- `playing`, playback rate, and iteration remained authoritative;
- elapsed time continued advancing in 2D;
- the dead canvas was removed and exactly one non-lost canvas replaced it;
- guided and replay schedulers did not run concurrently.

The native Safari pre/post probe was completed by the root reviewer: the
pre-fix parked renderer stayed connected with a lost context and blank visual;
the post-fix renderer was replaced with one live canvas while source was
preserved. Three.js may emit a benign warning when disposal requests a forced
loss after the browser has already lost that context; this does not mean the
test extension was unavailable.

### Asynchronous source intent (`2066995`)

Source replacement captures a monotonic intent token before a possible Planner
to Builder restore. Edit, history, source-load, and return-to-Planner paths all
advance that authority and/or cancel pending 3D work. The existing real-browser
interleavings passed for later Open, edit plus Save As, and rejected Import.
Code review found no path in these source-replacing actions where an older
document can install after a newer user intent. A rejected later source choice
still advances intent and keeps the current source, which correctly prevents an
older pending choice from winning.

## Expanded deterministic corpus

`tools/qa-generated-extended.mjs` imports the original generator instead of
forking its logic. It builds one deterministic row for every possible pair
across these dimensions, without expanding to their full Cartesian product:

- lengths 1, 2, 8, 31, and 64;
- all four green/orange hitter pairings;
- left, center-left, center, center-right, and right contact regions;
- all eight legal mid-rally shot families;
- automatic, forehand, backhand, and physically valid post-bounce short-hop
  contacts;
- hold, advance, recover, and manual pinned movement;
- all four Auto Shading/Coverage Guides combinations and all team scopes;
- four handedness patterns spanning all-right through all-left.

The valid side contains 446 documents and 9,435 shots. Every document is
validated, compiled twice, checked for deterministic play and event output,
passed through scoped rally rules, and sampled at event and segment boundaries.
Auto Shading cases also pass through the guarded assisted recompilation. The
runner verifies that compilation and assistance never mutate authored source.
Its 77,873 boundary points remain finite, repeatable, and identical through the
canonical 2D/3D ball projection. It produced 4,744 guide records.

The invalid side contains 24 documents with explicit expected layers:
17 schema-validation rejections, six rally-rule errors, and one physical
feasibility error. A case fails the runner if it passes or fails at a different
layer, so the invalid bucket cannot inflate coverage with mislabeled data.

## Real-interface 64-shot workflow

The browser suite imports a 64-shot fixture by opening Import / Export, filling
the visible JSON field, and pressing Import JSON. It then uses the rendered
chapter and edit controls to select and edit Shots 1, 33, and 64; deletes the
last shot; restores it with the visible Undo command; uses Save As; exports and
reimports the visible JSON; cycles all three playback rates through twelve 2D/
3D round trips; and reloads the page. The final source, 64 unique chapters,
disabled shot-limit button, edits, and persisted reimport all remain intact.

A second long-rally browser check drives the rendered range input across more
than 400 distinct event boundaries, segment boundaries, and evenly spaced
seeks. At every point, the guided 2D and live 3D samples agree on world and
board ball state, all three rendered timelines agree on time, all 64 chapter
markers remain present, renderer memory remains stable, and one canvas remains.

## Commands and evidence

```text
node tools/qa-generated-extended.mjs
PORT=4196 npx playwright test tests/qa-independent-review.spec.mjs --workers=1 --project=chromium
PORT=4196 npx playwright test tests/qa-persistence.spec.mjs tests/qa-modal-authority.spec.mjs tests/qa-render-lifecycle.spec.mjs --workers=1 --project=chromium
```

The targeted upstream suite passed 11/11. The final independent suite passed
4/4. Browser coverage here is Chromium plus the separately recorded native
Safari lifecycle probe. The repository's seven known WebKit infrastructure
failures remain governed by their existing exact allowlist and were not waived
or changed by this review.
