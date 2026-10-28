# Pickleboard state ownership

Audited from the recoverable engine checkpoint `13758356d65f154b19ca631e6ecb9bdb8afd875b` on 2026-09-14. This map records the runtime that exists; it does not propose another document, compiler, clock, renderer, or persistence architecture.

| Concern | Authoritative owner | Mirrors and transient state | Ownership rule |
| --- | --- | --- | --- |
| Play document | `PlayBuilder.document` | `BuilderUI.current.document` receives the same immutable-by-convention snapshot for presentation. `DraftStore` and `EditHistory` hold cloned durable/history snapshots. Compiled plays retain derived recipe metadata. | Every authored mutation enters through `PlayBuilder.edit` or `loadDocument`, validates, commits one history snapshot, installs derived playback, then attempts one synchronous save. UI rendering, camera changes, playback frames, panel state, and assistance output may not mutate the document. |
| Compiled rally | `PlayBuilder.compiled` for the current document | `GuidedPlayEngine.activePlay`/`timeline` are the installed runtime definition. `ThreeDPlaybackViewer.currentPlay`/`timeline` are renderer references to that installed definition. | `installPlay` is the only builder integration point. Coverage assistance is derived before installation. The 3D copy samples the shared runtime and never writes authored recipes. |
| Playback clock | `CoachingSession.clock` | `GuidedPlayEngine.clock` and `ThreeDPlaybackViewer.clock` are aliases to that exact object; controls show its values. | `CoachingSession` alone changes elapsed time, playing intent, hold state, iteration, and scrub state. There is no 2D clock or 3D clock. |
| Selected shot | `PlayBuilder.selectedShotId` for authoring selection | Current playback shot is separately derived by `chapterAtTime(chapters, clock.elapsed)`. Builder UI caches both IDs for presentation. Timeline marker classes are render output. | Authoring selection must reference an existing recipe. Playback may advance without changing an open editor. Delete/Undo/Redo repair invalid selection to an existing shot. |
| Playhead | `CoachingSession.clock.elapsed` | Range values, cue text, `GuidedPlayEngine.stepIndex`, and 3D `lastState` are sampled views. During an active range gesture, `ShotTimeline.operation.time` is a preview sent to the session scrub owner. | Seek, chapter, and scrub commands enter through `GuidedPlayEngine.timelineAction`. Explicit Pause increments session intent and prevents an older suspension or scrub completion from resuming. |
| Renderer selection | In builder mode, `PlayBuilder.view`; scheduling owner is `CoachingSession.owner` | `ThreeDPlaybackViewer.active`, DOM hidden state, and `body.three-d-active` reflect allocation/presentation. `PlayBuilder.workspace` decides whether either builder renderer may own the surface. | View changes transfer sampling/scheduling around the same session. A parked 3D renderer may be reused; a disposed or context-lost renderer must not become active again. |
| Camera | `ThreeDPlaybackViewer.cameraPreset` | The camera `<select>` and computed `THREE.Camera` transform mirror the preset. `cameraFraming` is diagnostic output. | Camera changes only recompute framing and request a bounded render. They do not edit targets, player movement, the document, or playhead. |
| Interaction mode | `PlayBuilder.workspace` for Builder/Planner; one active local gesture owner inside the active surface | Builder target/movement placement is `BuilderCourtTools.placing`/`drag`. Timeline manipulation is `ShotTimeline.operation` plus `CoachingSession.scrub`. Planner token/drawing gestures are `board.dragState` and `board.currentPath`. Open menus/details are presentation state in `BuilderUI`. | One pointer/touch identity owns a gesture. View, timeline, modal, viewport, workspace, background, and second-contact interruptions release the applicable owner before another action can commit. Opening a panel does not itself become document state. |
| Undo and Redo | `EditHistory.snapshots` and `EditHistory.index` | Button enabled states are derived. `PlayBuilder.document` is replaced by a clone of `history.current`. | Only completed document mutations create history. Target/movement drags commit on pointer-up, not pointer-move. Presentation, camera, playback, panel, and Planner-only changes do not enter builder history. |
| Autosave revision | `DraftStore.observedDrafts`, keyed by document ID, is the tab's last observed serialized value | `PlayBuilder.saveStatus` and `saveError` report the last synchronous attempt. `libraryDirty` only controls a list refresh. There is no numeric revision or background save queue. | Each completed mutation attempts one synchronous localStorage transaction. The store compares the current saved document with this tab's observed value before overwrite. A conflict preserves both the in-memory edit and the other tab's stored version; Save As claims a new ID. Page unload is an additional completion path, not the only one. |
| Named document persistence | `DraftStore` envelope under `pickleballpark-builder-v1` | The My Plays list is a title/ID projection; `lastId` selects the next startup document. | Storage validates bounded plain JSON and the versioned play document before returning it. The single `setItem` is the commit point. Saved status is set only after that call succeeds. |
| Pending import | For file reads, `BuilderUI.importFileGeneration`; for source choice across a Planner restore, `PlayBuilder.sourceIntent` | The import textarea and file input are presentation buffers. JSON parsing/validation is synchronous in `DraftStore.importJSON`. | Closing/reopening the dialog or selecting a newer file invalidates older reads. Any newer source replacement or authored edit invalidates an older import that was awaiting workspace restoration. Rejected imports do not replace the document. |
| Pending compile | None: document validation, compile, coverage assistance, and runtime installation are synchronous | `PlayBuilder.compiled` is replaced only inside the same mutation turn. | No compilation Promise exists, so there is no delayed compile result to reorder. A future async compiler would need document/source identity before it could be introduced. |
| Pending renderer initialization | Builder selection uses `PlayBuilder.generation`; lazy module loading uses the loader generation plus requested play/snapshot identity; 3D asset/park loading uses `ThreeDPlaybackViewer.loadGeneration`, `AbortController`, requested play/snapshot, and a session suspension token | Busy labels, `loading`, and `loadSuspension` report the current attempt. Decoded image caches are immutable resources. | Cancellation advances generation and aborts park fetches. Every awaited boundary checks current identity before activation. Suspension resumes only if the session intent revision still matches, so explicit Pause wins. |
| Service worker update | The browser's `ServiceWorkerRegistration` owns install/waiting/active state; `sw.js` owns the versioned static cache namespace | Registration success/failure is logged. Cache writes are resource copies and never contain authored localStorage documents. The application has no second update-state model or release toggle. | Install must complete the full bounded asset list before activation. Activation removes obsolete product cache names and claims clients. Fetch failure falls back only to the owned cache/shell. This checkpoint does not expose update progress in product UI. |

## Duplicated-authority audit

The apparent duplicates that must remain are renderer mirrors of the compiled timeline, UI projections of authoritative IDs/time, and cloned history/storage snapshots. Their direction is one-way. A render frame never feeds back into the document or clock; the UI never commits by re-rendering; 3D never advances an independent time source.

The gauntlet found unsafe duplication in gesture presentation rather than the engine contracts. Timeline navigation could leave Builder placement state authoritative after the visible shot changed. Planner touch handlers could replace an existing token or drawing owner, and a replaced drawing path could remain visible without entering `drawingPaths` or a captured Planner snapshot. The bounded corrections make interruption release the old owner and preserve one coherent authored/captured state.

Two limitations remain explicit. LocalStorage provides atomic value writes but no multi-key or cross-tab transaction spanning read/compare/write; per-document conflict detection prevents ordinary stale overwrite but cannot claim database transaction isolation. Service-worker lifecycle status is browser-owned and logged rather than presented as an application update workflow.

## Smart Rally continuation

Smart Add, Random Rally and Coach add **proposal work**, not a second document or clock. The synchronous compiler still installs one effective rally, including enabled assistance. Proposal construction evaluates detached copies and cooperatively yields between bounded attempts.

| Concern | Owner | Acceptance rule |
| --- | --- | --- |
| Pending proposal | `PlayBuilder.proposalGeneration`, `proposalController`, `sourceIntent` and canonical `documentSourceIdentity` | An edit, new source choice or cancellation invalidates the old operation. The generation and source identity must both match immediately before applying. |
| Rapid Add queue | `PlayBuilder.addQueue` and `pendingAddCount` | Each queued request reads the latest completed revision, preserves the prefix and makes at most one history commit. An old queue cannot resume after its generation is cancelled. |
| Coach options | `PlayBuilder.coachCandidates`, keyed by evaluated candidate identity and source revision | Displayed descriptions are projections. Apply retrieves the original evaluated candidate, verifies source ownership and full downstream validity, then creates one Undo step. Protected changes require explicit option selection. |
| Random Rally replacement | Builder source transaction | Preserve the old draft first; create a new identity only after exact-length validation succeeds and the request is still current. Cancel and failures keep the current source. |
| Running build | Startup snapshot of embedded build metadata | A separate no-store Server build query is diagnostic data. Neither response nor failure replaces the Running build, document, history or session. |
| Family picker | UI presentation state, never a recipe copy | A completed selection closes the picker explicitly. An old native disclosure `open` value cannot reopen it during rerender. |

An independent delayed-renderer test confirmed the existing return-to-Planner source-intent guard: an older saved-play Open cannot overwrite the newer workspace choice. No new controller ownership mechanism was needed.

## Model 2 physics and terminal evidence

M1 extends the synchronous compiler contract without adding another source,
workspace or clock. The legacy ownership table above remains in force.

| Concern | Authoritative owner | Acceptance rule |
| --- | --- | --- |
| Model selection | Document `modelVersion` and model 2 `physicsVersion` | Validation selects the explicit versioned path. Compiled Play definitions and GuidedPlayEngine clones retain both values; a model 2 definition must not silently compile as model 1. |
| Physical flight and incoming contact | Pure `play-physics-v2.js` | The compiler and a future generator use this same solver. Response contact position, time and height derive from the incoming solved path. Camera, quality labels, cue text and renderer geometry cannot replace those values. |
| Model 2 actor and foot positions | Shared `play-actors-v2.js` | Logical sampling, 3D presentation and independent body collision checks use the same actor positions. Planned routes retain `originalDuration` when the ball dies early. Momentum interpolates each foot from contact to the globally timed observation, then holds it; its observation time is not automatically the first NVZ entry. Rendered/source foot anchors project these points without certifying whole-shoe edge contact. |
| Position assistance for model 2 | `compileEffectiveCandidate` version boundary | M1 bypasses legacy position suggestions/Auto Shading, preserves physical geometry and returns empty derived coverage. Requesting assistance produces an explicit warning; the independent Coverage view remains a presentation sampler. |
| Completed point declaration | Document `outcome`, including actors and point/time evidence | Source claims must agree with independently solved geometry, chronology and rule facts. A declaration cannot make its own fault expected. Ordinary completed points keep `intentionalFault: false`. |
| Terminal decision | `play-outcome-v2.js`, derived from compiled physical/rule evidence | Resolve the decisive event and compare the declaration. A modelled unreachable result needs reach/time evidence. NVZ momentum retains the earlier volley occurrence and later observation times separately. |
| Terminal stages and events | The versioned compiled timeline | Contact, net touch/crossing, ground contacts, fault and dead-ball stages are sampled from one deterministic timeline. A terminal leg has no invented opposing paddle contact. Playback includes a relevant later momentum observation. |
| Terminal cues and markers | Renderer projections of timeline events and `CoachingSession.clock.elapsed` | Scrub, orbit, pause, view switching and replay reproduce the same marker state. Renderers do not resolve outcomes, schedule separate fault timers or alter the document. |

Expected terminal faults preserve a valid completed point and its accepted shot
count. Invalid actors, geometry or timing produce unexpected violations and
error findings. Model 1 keeps its existing prefix/intentional-demonstration
semantics. The supported model 2 evidence window is not a new officiating rule
or a claim to measure full-body momentum and balance.
Grounded Erne approach through the kitchen before contact is permitted after
both modeled feet re-establish outside. A reset flag alone cannot override the
shared grounded contact feet to manufacture rule 11.A.3 evidence; unsupported
reset history remains an unexpected finding, with the source retained.

Game scoring, rally policy, asynchronous point generation and hold/advance
between points are later milestones. M1 adds none of those owners.
