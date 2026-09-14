# Luna visual review

Date: 2026-09-13  
Candidate: root local preview at `http://127.0.0.1:4184`  
Source captures: `docs/pixel-game/after/` (fresh root candidate, with `states/` and `cameras/` subdirectories)

I reviewed the final root capture set as images, including light and dark rest states, the main menu, chapter picker, editor, Help, empty, invalid-sequence, loading, save-failure, import-error, playback options, 200% text, and all four camera presets at phone and desktop widths. The rest state reads as a coherent original pixel game interface: the park artwork owns the screen, while stepped navy/ivory or dark-teal frames, bevel shadows, pixel label glyphs, and cursor-like accents carry the controls. The top row is one context bar with Menu, the active chapter chip, Edit, Add, and 2D/3D. The bottom row has one Play control, one marked seek rail, and one compact playback-options affordance. The final captures show no Previous, Next, Restart, or Loop controls, and the app is paused at rest.

The final 402px light and dark rest captures show the court filling the available middle region, with the transport anchored below it. The menu capture keeps one framed menu over the court and exposes Rename, New Play, My Plays, Save As, Learn, Court Planner, Import / Export, Help, and Appearance. The chapter picker lists all three authored shots with a separate Edit action per row. The editing capture keeps the court visible behind a substantial framed editor sheet and presents Done, Shot family, Hitter, target placement, Flight, Details, and Coach tools. These are the final images at:

- `docs/pixel-game/after/402x874-light-rest.png`
- `docs/pixel-game/after/402x874-dark-rest.png`
- `docs/pixel-game/after/states/402x874-light-menu.png`
- `docs/pixel-game/after/states/402x874-light-chapters.png`
- `docs/pixel-game/after/states/402x874-light-editing.png`

The final state captures cover the requested resilience paths. Empty has a full court with a zero-duration Rally transport and no phantom inspector. Invalid sequence clearly names `Shot 2 needs attention` and explains why playback is paused. Save failure presents a framed error with `Retry save` and `Save a copy`. Import error keeps the malformed JSON visible in the import/export panel and leaves Import JSON, Export current play, and Close reachable. Loading presents an explicit `Opening 3D at the current playhead…` status while the court remains visible. The corresponding final images are:

- `docs/pixel-game/after/states/402x874-light-empty.png`
- `docs/pixel-game/after/states/402x874-light-invalid-sequence.png`
- `docs/pixel-game/after/states/402x874-light-save-failure.png`
- `docs/pixel-game/after/states/402x874-light-import-error.png`
- `docs/pixel-game/after/states/402x874-light-loading.png`

Dark variants preserve the same hierarchy and remain readable: primary controls use dark navy text against soft green or amber surfaces. The regenerated Help captures show the corrected modal stacking: the framed Help sheet, heading, and close affordance sit above the context bar and 3D scene in both themes. The final dark checks are in `docs/pixel-game/after/states/402x874-dark-help.png`, `402x874-dark-empty.png`, and `402x874-dark-invalid-sequence.png`.

The final responsive set has no horizontal overflow in the recorded measurements. At 320px the court remains dominant and the transport is still present; the active chapter chip is compact and may render as `1…`, while the full name remains available from the chapter picker. Landscape keeps the court and rail in one usable composition. At 200% text, playback options and the editor use bounded framed panels with internal vertical scrolling, keeping the panel and its controls within the viewport instead of letting the document expand around them. Images reviewed include `docs/pixel-game/after/cameras/402-text200-light-options.png`, `402-text200-light-editor.png`, `844-text200-light-options.png`, and `844-text200-light-editor.png`.

The four-camera final captures confirm the bounded banner correction. At 402px and 1440px, Overhead remains clear, Sideline keeps the court readable, and Behind Green/Behind Orange retain a legible Pickleball Park sign without covering the foreground players. The shared static landmark is now compact and set farther back while using the approved artwork. The final images are in `docs/pixel-game/after/cameras/402-{overhead,sideline,behind-green,behind-orange}.png` and `1440-{overhead,sideline,behind-green,behind-orange}.png`.

One low-severity visual follow-up remains. On the narrowest rest state, the active chapter chip can truncate its family name to `1…`; the chapter picker supplies the complete label and selection route. The previous Help stacking defect and 200% editor overflow were corrected in the regenerated root captures and are no longer findings.

The root capture set records no UI error entries in `docs/pixel-game/after/states/states.json`. Automated preservation coverage was run separately by the integration owner.
