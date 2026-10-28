# Pixel redesign validation map

This is a coverage plan and audit record, not a declaration that final Quality checks passed. Historical `docs/pixel-game/after` captures belong to the earlier presentation and do not establish acceptance for this redesign.

## Shot vocabulary

The authoring schema exposes `serve`, `return`, `drive`, `drop`, `dink`, `volley`, `reset`, `lob`, and `overhead`. The eight built-in lessons also exercise `block` and `short-hop`; older playback sources can name `forehand` and `backhand` strokes directly. Reset contact can be short-hop. Serve has volley and drop methods. Do not reduce this to nine visual labels and lose the additional contact semantics.

For every family, validate physical left/right handedness and forehand/backhand contact independently. Each combination must retain preparation, exact contact, follow-through, and recovery. The complete pose sweep in `tests/pixel-stroke-coverage.unit.mjs` samples 121 phase positions per family/hand/side, checks actual shoulder–elbow–wrist bone lengths and paddle handle length, and independently reconstructs the contact point from soles and paddle offset at three scales. It also verifies that moving contact plants feet while moving ready stance advances footwork.

Full motion acceptance must additionally inspect approach, split step, lateral shuffle, run, plant, recovery, and idle in continuous normal-speed playback. Numeric pose checks alone do not prove readable movement.

## Regression map

| Requirement | Existing regression suites / new targeted checks |
| --- | --- |
| Regulation 20 × 44 feet; seven-foot kitchen each side | `court-geometry.unit.mjs`; renderer projection and canvas court diagnostics |
| Court feet remain authoritative; inverse pointer mapping | `projection.spec.mjs`, `builder-authoring.spec.mjs`, `builder-integration.spec.mjs`, `iphone-input.spec.mjs` |
| Every stroke and physical hand | `pixel-stroke-coverage.unit.mjs`, `presentation.unit.mjs`, `stroke-instruction.unit.mjs`, `three-d-all-plays.spec.mjs` |
| Precise ball/paddle contact; overhead compatibility | `overhead-contact-compatibility.unit.mjs`, `overhead-short-hop-preview.unit.mjs`, `overhead-short-hop-preview.spec.mjs`, pixel renderer diagnostics |
| Playback, chapters, scrubbing, pause/resume | `pixel-game-input.spec.mjs`, `pixel-replay.spec.mjs`, `playback-resume.spec.mjs`, `shot-timeline.spec.mjs` |
| Editor intent, placement, history, pins | `builder-authoring.spec.mjs`, `builder-waypoints.spec.mjs`, `builder-lifecycle.spec.mjs`, `iphone-workflow.spec.mjs` |
| Saved library and failure preservation | `saved-library.spec.mjs`, `qa-persistence.spec.mjs`, `builder-storage.unit.mjs` |
| Tactical planner, drawing, token dragging, handedness | `core.spec.mjs`, `coaching-workflow.spec.mjs`, `projection.spec.mjs` |
| Rally legality, smart continuation, assistance | `rally.unit.mjs`, `smart-*.unit.mjs`, `smart-authority-review.spec.mjs`, `smart-authoring-controller.spec.mjs` |
| 320/390 phone readability, menus/editor, dark theme, text enlargement | `iphone-interface.spec.mjs`, `iphone-reliability.spec.mjs`, `pixel-game-review.spec.mjs`, actual 320×568 and 390×844 captures |
| Lifecycle, assets, cache, real offline reload | `pixel-lifecycle.spec.mjs`, `static-world-cache.spec.mjs`, `service-worker.spec.mjs`, package verification |

## Final validation policy

Use Node 24 and locked dependencies. First run focused Chromium/WebKit checks while the renderer is changing. Final required gates are `npm run check`, `npm run check:generated`, complete Chromium, the complete two-shard WebKit Quality job (merged and catalog-checked by `tools/merge-webkit-ci.mjs`), build/package verification. WebKit permits zero failures, skips, retries, or flaky outcomes. Preserve reports and captures in ignored `release-results/` paths.

A complete catalog run in fresh-process shards is separate evidence from the standard monolithic WebKit runner. If used to diagnose the known pristine-baseline ordinal-80 hang, record catalog identity, exact coverage, every shard result, and the standard runner's unresolved outcome explicitly. Do not describe focused runs or sharded runs as successful standard Quality execution.

## Deliberate product expectation changes

The default public court is the Canvas2D pixel surface. Default editor viewport-fit assertions measure `.pixel-court-canvas`, preserving their existing minimum size and screen-bound checks. Public replay restoration now exercises the visible 2D Play/Pause/Exit controls instead of clicking the intentionally hidden 3D entry. Existing explicit `switchView('3d')` integration and authoring compatibility checks remain in place.

Projection fixtures now assert an identity top-down ground transform with equal feet scales and wide viewBox `{-22,-8,64,60}`. The retained SVG actor's sole anchoring offset remains checked independently of its canonical numeric coordinates. Pointer dragging, fractional precision, drawing through resize/replay, and touch cancellation retain their previous behavioral assertions.

The actual renderer contact audit in `pixel-regulation.spec.mjs` enumerates every built-in lesson and both physical hands. It compares visible logical paddle centers with the actual displayed ball at each contact, requiring exact logical contact and identical raster centers; a semantic contact target alone is insufficient evidence.

Legacy Three.js rendering remains compatibility coverage, entered deliberately with `pickleboard.threeD.enter()` or `playBuilder.switchView('3d')`; tests no longer click intentionally hidden public entry controls. Existing opaque geometry/contact, camera, resource lifecycle, lazy loading, cancellation, context loss, offline and buffer-size assertions remain intact. Test names identify this coverage as legacy compatibility, distinct from the primary Canvas2D surface.

## Authoring-valid combination coverage

`pixel-authoring-cases.mjs` derives cases directly from `PLAY_DOCUMENT_ENUMS` instead of assuming a hand-maintained list equals supported behavior. The current schema accepts **80 distinct combinations**: eight non-serve families × four contact styles (`auto`, `forehand`, `backhand`, `short-hop`) × two physical hands = 64, plus serve × four styles × two hands × two serve methods (`volley`, `drop`) = 16. All 80 compile as one accepted shot without errors at the representative legal setup. Serve/short-hop is schema-valid; the compiler's serve contact kind remains authoritative. Overhead/short-hop is also valid: its legacy shot type is short-hop while authored overhead family and seven-foot contact remain intact. Do not label these pairs illegal or silently filter them out.

The generated browser matrix loads transient authoring documents through the real compiler and primary renderer, then checks accepted shot count, explicit rendered family, actual displayed ball/paddle coincidence, canonical soles, and measured arm lengths. It does not bypass the 50-draft limit by changing persistence; test documents use the existing transient load option.

**18 additional tactical boundary representatives** exercise each family at low/soft/shallow-left and high/firm/deep-right targets. Pace, arc, target and derived spin change the ball trajectory rather than introducing a new arm skeleton. Spin has no separate authoring enum: compiler-derived backspin applies to drop/dink/reset, topspin to other families, with pace-derived 300/600/850 RPM. The suite covers both spin types and low/high RPM explicitly; medium pace/arc are exercised in every base combination. This is deliberate equivalence coverage rather than an unbounded Cartesian product of target positions and flight values.

Negative cases distinguish malformed serve methods/non-serve serve-method fields, illegal mid-rally serve intent, and schema-valid but infeasible shallow low arcs that fail net clearance. They must remain rejected with their source intent preserved. The unfiltered pure 13×2×2 choreography sweep is a separate low-level geometric stress test, not a claim that all those authored combinations are legal.
