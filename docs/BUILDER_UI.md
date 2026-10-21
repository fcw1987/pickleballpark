# Pixel court builder UI

`builder-ui.js` exports `mountBuilderUI({ onAction })`. It appends one native accessible control surface and returns `{ render, destroy, element }`. The host owns the document, compiler, court renderer, playhead, persistence, and dialogs; the UI emits actions and can be rendered again with the shared session state.

The host supplies the versioned document, stable shot identifiers and the compiled chapter map. The UI accepts arbitrary shot arrays and exposes the supported families, target coordinates and presets, receiver/contact/serve choices, arc and pace preferences, movement pins, handedness, edit operations, assistance toggles, planner round trip, import/export dialogs, and transport controls. It does not calculate trajectories or interpret planner drawings.

The resting screen is one compact Menu, a chapter chip, Edit, Add and 2D/3D controls over the court. The document name, file operations, library, lessons, planner, import/export, help and appearance actions live in Menu. The inspector starts collapsed and provides the contextual Edit route; coordinates, contact choices, pins, Auto Shading and Coverage Guides remain in the expanded editor. The chapter picker replaces the permanent shot strip and gives every shot a seek button plus an Edit route, including dense 64-shot rallies.

The bottom rail has one Play/Pause button and one `mountShotTimeline` instance. `builder-ui.js` appends the component returned by `mountShotTimeline({ onAction })` into `.builder-transport-timeline` and forwards `seek`, `chapter`, `scrubBegin`, `scrubSeek`, `scrubEnd` and `scrubCancel` unchanged to the host. The component is updated from `{ chapters, time, duration, playing, busy, currentShotId, selectedShotId }`, is cancelled before a modal or authoring operation opens, and is destroyed with the UI. There are no visible Previous, Next, Restart or Loop controls. The host owns the single clock and always-repeat policy.

The host should load `builder-ui.css`, `builder-integration.css` and `shot-timeline.css`, add `body.builder-workspace` while mounted, and render its production court beneath the transparent `[data-builder-court-region]` area. `render` intentionally avoids replacing document-dependent DOM when only time, save status, busy state, or play/pause changes, so text fields and the timeline retain focus during playback updates. The application retains this UI/controller across planner visits so the draft and history survive. `destroy()` is available for complete UI teardown, not ordinary workspace switching. The shared stepped navy/ivory pixel frame uses real native fields and buttons, with dark theme tokens and focus, disabled, pending, error and success states.

Current layout, interaction evidence, waypoint preview policy and measurements: [court-centered usability verification](COURT_CENTERED_BUILDER.md).

## Phone editing contract

The selected card exposes family, hitter, target placement and Flight. Details expands precise coordinates, contact/receiver/serve choices, and movement for any player; a partner command uses the optional `playerMovement` map. Done closes immediate undoable edits. It does not discard committed changes. Cancel placement discards the unfinished gesture, and changing shots, views, camera, playback or viewport releases its owner. On compact phones placement temporarily hides the sequence and assistance row to expose more court.

Numeric coordinates display up to three decimal places to avoid ray-casting noise. Opening, focusing or dismissing a field does not change the full precision source; JSON export preserves it. Empty and out-of-range inputs remain invalid until corrected or cancelled, rather than becoming zero. Field-level pending status is distinct from a completed local save.

The details sheet is a nonmodal region with a bounded internal scroll area. The library/import dialogs retain native modality. System fonts, safe areas, visualViewport and explicit labels are shared browser standards, not a claim of native UIKit behavior. See [guidance](IPHONE_INTERFACE_GUIDANCE.md) and [verification](UNIFIED_IPHONE_VERIFICATION.md).
