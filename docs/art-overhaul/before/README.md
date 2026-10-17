# Pickleball Park visual baseline

Captured directly from the original read-only checkout at commit `fc46c60f83ed8b1a2bd4ee186e05f7ab55e3a717` (`/Users/fdub/Geese/pickleboard`), served at `http://127.0.0.1:4174`. Capture date: 2026-10-17. The capture script and evidence live in the isolated candidate checkout; no source files in the original checkout were edited.

Screenshots and motion clip:

- [Desktop 2D](desktop-2d.png), [desktop menu](desktop-menu.png), [desktop 3D overhead](desktop-3d.png), [desktop 3D sideline](desktop-3d-sideline.png)
- [Phone portrait 2D](phone-portrait-2d.png), [phone portrait 3D](phone-portrait-3d.png)
- [Phone landscape 2D](phone-landscape-2d.png), [phone landscape 3D](phone-landscape-3d.png)
- [5-second motion video](baseline-motion.webm)
- Measurements: [desktop renderer and boot metrics](desktop-metrics.json), [portrait geometry](phone-portrait-metrics.json), [landscape geometry](phone-landscape-metrics.json)
- Headless WebKit smoke: [desktop 3D](webkit-desktop-3d.png), [phone portrait 3D](webkit-phone-portrait-3d.png), [renderer check](webkit-smoke.json)
- Matching original builder views: [desktop](builder-comparison/desktop-builder.png), [phone portrait](builder-comparison/phone-portrait-builder.png), [phone landscape](builder-comparison/phone-landscape-builder.png); commit and runtime digest are in [capture metadata](builder-comparison/capture.json)

## Visual baseline observations

- The 2D board is legible and clean at desktop size. The standard pixel art scene is recognizably a court, but the player silhouettes, paddles, trees and net all use one compact pixel style with limited depth cues.
- The 3D overhead scene gives the court a convincing perspective and fills the desktop viewport. The player sprites remain flat billboard-like pixel figures against modeled court geometry, so the scene mixes 2D and 3D visual language.
- The sideline camera makes the net nearly edge-on and the far-side players and sign crowd the right edge. Objects at the far end become harder to read than in overhead view.
- On a 390 × 844 portrait screen, the court is large and readable, but the bottom overlay takes a substantial share of the screen. The View details collapse the camera and speed controls below the visible viewport; the user must scroll or reorganize controls to reach them.
- At 844 × 390 landscape, the overlay consumes much of the screen height and pushes the court into a shallow strip. The timeline title/captions compete with the play button and scrubber, while the controls run close to the lower and right edges.
- The 3D HUD uses dark navy panels and borders over the scene. Some secondary/timeline text has weak contrast at the captured scale, and the collapsed/disabled-looking View button is visually ambiguous in the portrait capture.

## Baseline measurements

The desktop capture was headless Chromium, 1440 × 900 CSS pixels, DPR 1. On first navigation, the 3D module was ready in about 59 ms from `page.goto` in this warm local run; this is a single run and excludes browser startup. Resource and renderer values are recorded in `desktop-metrics.json`: 43 geometries, 16 textures, 10 programs, 53 draw calls and 8,822 triangles after the view was opened. A 5-second active-run RAF sample produced 206 intervals with 25.1 ms median and 41.6 ms p95. This is callback cadence in headless Chromium, not displayed FPS or physical-device performance. No page errors were captured.

## Existing verification inventory for the overhaul

The existing repository already has focused browser coverage suitable for rerunning against the final candidate. These are pointers, not claims that the full suites were run during this baseline capture.

- Four authored 3D Plays, endpoint, seek-to-start, camera change, rate change, exit to 2D, chapter seek, and re-entry: `tests/three-d-all-plays.spec.mjs`.
- Player layers/handedness, court and camera framing, ball size: `tests/three-d-visual.spec.mjs`; renderer lifecycle and visibility: `tests/second-render.spec.mjs`, `tests/three-d.spec.mjs`, and `tests/renderer-buffer.spec.mjs`.
- 2D play/lesson navigation, playback/pause/repeat, timeline and chapter seeking, reduced-motion chapter inspection, viewport bounds, offline repeat visit: `tests/plays.spec.mjs`.
- Phone portrait workflow, keyboard-height resize, theme, import recovery, touch placement and interruption: `tests/iphone-workflow.spec.mjs`, `tests/iphone-input.spec.mjs`, `tests/iphone-interface.spec.mjs`, and `tests/viewport.spec.mjs`.
- Persistence across tabs, Save As, import/export and reload, malformed input handling, and long drafts: `tests/qa-persistence.spec.mjs` and `tests/service-worker.spec.mjs`.

The configured project in `playwright.config.mjs` is Chromium. `playwright.webkit.config.mjs` provides a separate WebKit project for browser-engine checks; the main desktop and phone screenshot set uses Chromium. Existing build diagnostics are in `build-diagnostics.js` and `build-diagnostics-ui.js`; the screenshot harness records `performance` navigation entries and Playwright-ready timing directly because the 3D viewer does not expose a diagnostics getter in this view.

The additional WebKit smoke reached WebGL 2 and rendered the original scene at desktop and portrait sizes with 43 geometries, 53 draw calls and 8,822 triangles, with no page errors. It is a headless WebKit observation, not a native Safari or physical-device claim.
