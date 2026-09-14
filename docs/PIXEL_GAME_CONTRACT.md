# Pixel game candidate — integration contract

The controlling assignment is the owner's Pixel Game Experience and Shot Timeline mission, September 13, 2026. Baseline: PR #17, `integration/unified-iphone-builder`, `d0d5376a4a76e44a3ce381c83f61e3354bcc2241`, verified against GitHub before editing. The checkout was clean. Older worker directories were absent. The existing remote preview is preserved. Local continuation: `integration/pixel-game-shot-timeline`.

## Ownership and files

Astra integrates and owns environment art, packaging, evidence and corrective inspection. Sol Session owns `coaching-session.js`, `guided-plays.js`, `three-d-playback.js`, `play-builder.js`, chapter metadata and session tests. Luna Interface owns `builder-ui.js`, `builder-ui.css`, `builder-integration.css` and interface documentation. Sol Input owns `shot-timeline.js` and focused input tests. Coordinate interfaces before changing another owner's files. Worker previews use 4181 (session), 4182 (interface), 4183 (input); frozen baseline uses 4180. The integrated candidate uses 4173 only when ready.

## One authoritative timeline

Keep the existing document, compiler, derived timeline and CoachingSession. Chapters derive from real compiled navigation/preparation events, retaining authored stable IDs. Session supplies chapters with `{shotId, number, label, anchor, contactTime, startTime, endTime}`. Coincident chapters retain separate accessible destinations, ordered by authored index; current time ties select the final applicable anchor. The chapter map is cached per accepted compiled timeline, never rebuilt by seeking or rendering a frame.

Session/render state includes `chapters`, `time`, `duration`, `playing` (user intent, including temporary scrub suspension), and `busy`. UI shot selection for editing stays separate from current playback chapter. Editing pauses. Tapping a chapter preserves playback intent. New/loaded documents start paused. Repetition is unconditional for valid playback; old Loop false preferences are accepted but do not govern viewing. The existing logical one-second final hold is retained; endpoint seeking stays at the final sample. Pause wins over every delayed operation.

## Timeline component

`mountShotTimeline({onAction})` returns `{element, update(state), cancel(), destroy()}`. Luna mounts its `element` in the single bottom transport and calls update with the state above. The module owns the native range, visual pixel rail, thumb, notches and time text, but no clock. It emits `scrubBegin({id})`, `scrubSeek({id,time})`, `scrubEnd({id})`, `scrubCancel({id})`; keyboard/tap seeking can use `seek(seconds)`. The operation ID protects release from older gestures. `chapter(shotId)` preserves active/paused intent. `pauseForEditing` stops playback before an authoring panel or operation opens. A separate chapter picker is in the interface; every shot has a reachable button and Edit route. No hidden repeat setting or alternate stepping transport.

## Original pixel menu family

Use native semantic content in crisp stepped navy frames with ivory interiors, park-green selection and warm ochre emphasis. Dark theme gets ink interiors with warm readable text and the same edge construction. Tokens: `--game-ink`, `--game-paper`, `--game-paper-deep`, `--game-green`, `--game-accent`, `--game-muted`, `--game-danger`, `--game-edge`, `--game-highlight`. Shared `.game-panel`, `.game-button`, `.game-heading`, `.game-row`, `.game-chip` may extend existing builder classes. Solid pixel corners/bevels and small original cursor marks; no blur/translucent panels. Headings can use local monospace; body and precise fields remain legible native text. Cover pressed, selected, focused, disabled, expanded, pending, error and success. Replace competing builder CSS rather than adding another override tail.

At rest: one compact Menu entry, small chapter identity, Edit and Add shot, 2D/3D, contextual Undo, and one Play/Pause plus rail in a reserved safe strip. No permanent title input, description, issue paragraph, sequence strip, coach checks, camera or speed select. Default desktop also rests on the court. Main menu holds document/library/learn/planner/import/export/help/appearance; detail editor keeps every existing field, recovery and unsupported path acknowledgement.

## Safety and evidence

No dependency or schema change is planned. Keep exact data, pins, autosave/conflicts, history, stopped-server offline behavior, renderer lifecycle and planner restoration. Synthetic plays and isolated browser profiles only. Capture actual 402×874, 390×844, 430×932, 320-width, short landscape, tablet, desktop, themes and enlarged text. Report device emulation separately from physical Safari/VoiceOver. No push, remote PR modification, merge, deployment or hosting change.
