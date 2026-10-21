# Visual play builder — local implementation

Current continuation: the completed [court-centered usability pass](COURT_CENTERED_BUILDER.md) on `feature/court-centered-builder` preserves this builder. The original builder branch was pushed at `d9b75d7` under separate authorization; the usability pass remains local. The record below describes the original implementation.

Base: clean `e4e23a9`, descending from published `f130801`; no later banner correction or uncommitted changes found. Branch `feature/visual-play-builder`. No remote publication is authorized. Existing court-first preview/source is preserved in Git.

## Ownership and contracts

- Astra: integration/controller, unified view lifecycle, scene picking, planner isolation, final review.
- Sol `gpt-5.6-sol`: new document/compiler modules and numerical validation in isolated `work/builder-compiler`.
- Luna `gpt-5.6-luna`: new native authoring UI/CSS and visual checks in isolated `work/builder-ui`.
- Sol `gpt-5.6-sol`: local structured persistence and authored history in isolated `work/builder-storage`.

Selected model configurations are explicit; no additional underlying runtime identifier is exposed. Workers cannot publish or modify shared timeline/render files.

Document v1 stores recipe intent, canonical initial layout, handedness, movement pins, assistance, annotations and ending. Compiler outputs the existing Play/compilePlayTimeline format; both views consume the same compiled timeline and existing CoachingSession. Renderer preferences/playhead are separate from persisted source. Drafts use app-owned local storage outside service-worker cache ownership.

Milestones: (1) unified session/adapters, (2) genuine parameterized three-shot proof, (3) full bounded rally editing/persistence/templates, (4) assistance and separate explanation guides, (5) default 3D-first front door and integrated hardening. Work is in progress, not yet a completed candidate.

Rule references opened 2026-09-07: USA Pickleball official rules and summary, and PrimeTime Pickleball's Number 1 Forehand Strategy Mistake. Exact supported checks and approximation limits will be recorded with compiler validation.

## First integrated proof (2026-09-07)

The local `builder.html` entry now uses the actual existing 3D and projected 2D renderers. One CoachingSession survives view switches, including a paused end hold; renderer warm suspension does not create another clock. The original planner snapshot is retained across workspace exits. This development entry is temporary until final front-door hardening.

Confirmed integrated Chromium checks: 3/3 (`npx playwright test tests/builder-integration.spec.mjs --workers=1`): custom target and drive/drop recompilation, exact 1.2-second view switch, mouse target picking in both projections, Undo, planner round trip, Loop hold, and autosaved title reload. An actual 1440×900 image was inspected; controls need compact-layout refinement. Existing baseline browser run was 133/133. Current unit run has one expected artifact-contract failure because the frozen prior runtime manifest has not yet been deliberately updated for this feature; it is not waived for final delivery.

Independent Sol review caught library dispatch and New Play ID risks; unique new IDs are fixed in integration, UI dispatch correction is underway. Compiler template provenance/invalidation has been tightened. Assistance must finish compiler-owned revalidation before acceptance. The three-shot proof is functional, but full scope and final verification remain in progress.

## Full builder integration

The default index now opens the paused 3D builder; `?workspace=planner` remains an explicit lightweight planner deep link and is used by retained planner regression suites. The temporary builder entry was removed. Library copies receive unique IDs, stored plays have their own Open action, target bounds match the source schema, and failed imports remain visible. The source has a 64-shot bound; a genuine eight-shot serve/return/drop/drive continuation compiles without findings. Drop serves now have a distinct shared pre-contact release/bounce event, separate from the opening rally bounces.

Independent lifecycle tests were integrated and rerun: 9/9 Chromium passed. Responsive visual review rejected the initial phone and landscape allocations; the corrected phone reserves room outside the scene for the collapsed inspector and view controls, and short landscape moves authoring chrome to the right. Further visual and offline/package validation is pending. Cache v17 adds the builder's local modules without changing the installation URL, scope, legacy theme key, or draft storage ownership.

## Final integrated candidate

All five milestones are integrated in the normal entry. Runtime checkpoint `5d38cd5` includes the final touch, import, focus and compact-layout corrections. The strict runtime package is repinned to that exact source; 126 units, 160 Chromium checks, generated assets and four real offline package cases pass. WebKit has 153 passes and the seven separately documented infrastructure failures. Native Safari startup/playback/Loop/view/planner smoke was inspected. See [final verification](BUILDER_VERIFICATION.md) for the current record; earlier sections above describe intermediate checkpoints, not remaining work.

Compiler, UI, persistence, coverage and lifecycle work packages are integrated. Fresh Luna visual and Sol technical findings were corrected and checked after integration. No worker has publication authority. Future work starts from this clean published ancestry, never by merging archived private development history. Local candidate only; production remains unchanged.

Final selection correction: `7ef3961` repairs Undo after appending a shot; the new regression demonstrably failed before the correction. Runtime manifest repinned to that exact source. Performance and visual samples at `5d38cd5` remain applicable to unchanged rendering; the final controller adds only the selection guard.

Final executed result: 160/160 Chromium, 153 WebKit passes plus the same seven documented infrastructure failures, 126/126 units and brand/assets, 63 reproducible generated paths, and four stopped-server package cases. The 91-file, 1,574,196-byte runtime is pinned to `7ef3961`. No code remains pending; documentation and evidence complete the local handoff.
