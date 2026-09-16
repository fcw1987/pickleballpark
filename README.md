# Pickleball Park 🏓

Pickleball Park opens into Build a Play: a paused, editable 3D court for authoring pickleball rallies. Choose hitters, shot families, targets, arc, pace, and movement; preview one shared timeline in 3D or 2D. Eight instructional templates and the original Court Planner remain available in the same pixel art park.

The local Smart Rally candidate adds compatible continuations, exact-count Random Rally, Coach repair, and contextual game menus around one Play/Pause control and a seekable shot timeline. See [the current requirements and verification ledger](docs/SMART_RALLY_STATUS.md). This local continuation does not change the public fidelity candidate.

Pickleball Park remains a lightweight static application built with HTML, CSS, vanilla browser JavaScript, inline SVG, and a service worker. Three.js loads for the default 3D builder, with a working 2D fallback and an explicit lightweight planner entry; development tooling uses Node.js and Playwright for reproducible tests.

Formerly Pickleboard. The public snapshot preserves the accepted coaching behavior under the Pickleball Park name. See [rebrand verification](docs/REBRAND_VERIFICATION.md), [release notes](docs/RELEASE_NOTES.md), and [rename handoff](docs/RENAME_HANDOFF.md).

Phone authoring now includes a shallow shot editor, full movement/contact details, direct placement with cancellation, and recoverable local saving. See the [unified iPhone candidate report](docs/UNIFIED_IPHONE_VERIFICATION.md) for the preserved baseline, screenshots, limitations, and verification.

## Features

- Custom rallies up to 99 shots, validated targets, valid-prefix preview, movement pins, Undo/Redo, and a shared playhead
- Validated Smart Add continuations, seeded offline Random Rally, and reversible Coach repairs with explicit permission for protected intent
- Independent Auto Shading and Suggested Coverage guides; a bounded instructional approximation, not optimal strategy
- Named local drafts, Save As, and bounded versioned JSON backups

- Four draggable branded player tokens: Team 1 uses green artwork and Team 2 uses orange artwork
- Per-player left/right handedness: all players start right-handed; double click on desktop or double tap on touch devices to toggle
- A draggable yellow-green ball
- Singles and doubles starting arrangements
- Movement tracers with automatic expiry and manual clearing
- Freehand drawing mode with undo and clear actions
- Light and dark themes with the preference stored locally
- Mouse, touch, and keyboard token interaction; arrow keys move a focused token half a foot, Enter/Space switches player handedness
- Viewport-fitted portrait, landscape, mobile, and desktop layouts
- Installable PWA shell with repeat-visit offline support
- Eight guided Plays with exact shot chapters and playback that repeats until paused
- No backend, account, analytics, or remote persistence

Builder source documents are autosaved locally, including incomplete drafts, with named copies and versioned JSON import/export. Browser storage is not a backup guarantee: export important plays. Court Planner arrangements remain session-only; explicitly use a planner layout as a draft starting state to save it. Theme preference retains its compatible storage key. See [document and trajectory contract](docs/PLAY_DOCUMENT.md), [storage](docs/BUILDER_STORAGE.md), and [builder verification](docs/BUILDER_VERIFICATION.md).

## Run locally

Service workers do not operate from a normal `file://` page. Use the included local HTTP server for development and PWA testing:

```bash
npm install
npm start
```

Then open <http://127.0.0.1:4173/>.

The application has no build step and can be hosted by any static HTTPS server. The checked-in `vendor/` modules provide the sole production dependency, Three.js, for offline 3D playback. Opening `index.html` directly may display the basic application, but it is not a supported way to test modules, installation, updates, or offline behavior.

## Test

Install Chromium once after installing dependencies:

```bash
npx playwright install chromium
```

Run all static checks and browser regression tests:

```bash
npm test
```

Useful narrower commands:

```bash
npm run check
npm run test:browser
npm run test:headed
```

The browser suite covers clean initialization, player artwork and handedness, desktop double click and touch double tap behavior, touch/mouse drag synchronization, drawing mode and strokes, singles/doubles behavior, the public mode API and Reset, theme restoration, service-worker installation/offline/upgrade behavior, cache isolation and freshness, and representative portrait, landscape, and desktop viewports.

## Architecture

```text
index.html       Application shell, inline SVG court, controls, and help content
styles.css       Themes, court presentation, overlays, and responsive sizing
board-projection.js Canonical court ↔ elevated SVG view mapping
script.js        Board state, interactions, SVG updates, and public API
play-catalog.js  Shared declarative lessons, contacts and flight metadata
guided-plays.js  Guided playback and snapshot ownership
coaching-session.js Shared clock, playback intent and logical end hold
court-geometry.js Canonical court dimensions and marking endpoints
park-layout.js / park-scene.js Shared pixel park layout and rendering adapters
visual-theme.js Shared frozen palette and rendering tokens (CSS/SVG/Three.js/art)
three-d-loader.js Deferred 3D import, loading, retry and cancellation boundary
tools/           Reproducible original artwork and visual/update verification
manifest.json    PWA installation metadata
sw.js            Versioned static-shell cache and offline navigation behavior
assets/players/  Four transparent PNG player visuals (green/orange, left/right-handed)
icons/           PWA and Apple launcher icons
tests/           Playwright browser tests and local test helpers
.github/         CI quality gate
```

In the retained planner, a single board instance (the compatibility class `Pickleboard`) owns the current board behavior. Token position changes flow through `updateTokenPosition()`, which keeps each visible SVG player image and its larger transparent hit target synchronized. Player numeric image attributes remain centered for compatibility, while upright artwork is projected and anchored at the visible shoe edge. `board-projection.js` provides responsive fixed elevated court projections and inverse input mapping; logical coordinates and drawing data stay in feet. Green artwork is front-facing on the far/top side and orange artwork is back-facing on the near/bottom side, so the teams face each other across the court; this viewing orientation is inherent to the team artwork, not separate application state. Artwork is selected centrally from the player’s current team color and explicit physical left/right handedness; all four players default to right-handed. Double-clicking on desktop or double tapping the same player on a touch device toggles that individual handedness without changing its position or front/back orientation. Handedness is session-only and survives mode changes and Reset, while singles/doubles may change the artwork’s team color. `currentGameMode` is authoritative for mode changes made through the controls, public API, and Reset. `drawingMode` is authoritative for drawing UI state.

## Guided Plays and replay

The Plays menu offers **Serve & Return, Third Shot Drop, Third Shot Drive, Fifth Shot Drop, Dink Exchange, Volley & Block, Short-Hop Reset, and Lob & Overhead**. The four mid-rally demonstrations explicitly assume the opening serve/return bounces have already happened. These are illustrative teaching examples, not validated biomechanics or a complete officiating engine.

`play-catalog.js` owns the eight built-in templates. Custom `play-document.js` recipes compile through `play-compiler.js` into the same production timeline; no separate animation catalog is created. `three-d-core.js` compiles ordered contact, net-crossing, bounce and end events; both views sample the same continuous ball trajectory and player presentation at the same absolute time. `rally-rules.js` checks the represented standing-play invariants. Add lessons through that contract, not a private rendering script. See [the coaching contract](docs/PARK_COACHING_VERIFICATION.md) for scope and limits.

Entering an ordinary guided Play captures mode, exact token positions, handedness, drawings, tracers and drawing state once. **Exit** restores that snapshot. The custom builder retains its separate editable document. Both experiences use one **Play/Pause** and a seekable timeline with exact shot chapters. Opening an authoring operation pauses. Switching ready 2D/3D views preserves the shared playhead and active intent; camera changes do not change tactical state.

Fresh launch, draft restoration, import and lesson selection stay paused. Choosing **Play** resumes the current sample and repeats the rally continuously, including a one-logical-second final hold. **Pause** freezes flight or the remaining hold immediately. Explicit endpoint seeking shows the final pose, and Play from that endpoint begins a new repetition. Legacy Loop-false preferences no longer govern viewing. There are no Previous, Next, Restart or Loop controls. Speed, handedness, camera and authored history persist; loading or scrub completion cannot override a later Pause.

The builder rests on the court, with a compact main menu and contextual editor. Speed, camera and Undo/Redo live in Playback options. The chapter picker keeps every shot reachable without a permanent sequence toolbar. Ordinary guided lessons retain their compact instruction context. Shot cues and chapter marks derive from the compiled timeline, with no independent animation timer.

## Pixel actors and shared park

The main editor uses compact 64px composites of the liked replay body/action artwork, with a stable `(32,54)` foot pivot and a 16/3-foot presentation box. Guided SVG and 3D animate the same authored atlas layers. Eight directional views, both teams and physical handedness preserve the connected sleeve, wrist, grip and paddle; the old centered free-hand artwork is no longer used. The replay court, net, positions and ball flight remain genuinely 3D. No visible volumetric toy athletes remain.

`three-d-presentation.js` separates world facing, travel, stroke phase and camera-relative artwork selection. Incoming players prepare before contact; both views share contact targets. The elevated SVG projection includes the vertical component of physical ball height, so overhead contacts do not stretch the arm to compensate for an incorrect projection. The ball retains its high-contrast outlined treatment, short past-position trail in replay and projected ground cue.

`court-geometry.js` defines regulation dimensions and two centerline segments, baseline to kitchen only. `park-layout.js` places shared trees, shrubs, bench, sign and path outside the court. Quiet original pixel textures use teal, sage, layered greens and terracotta; geometry and annotations retain exact court coordinates.

## Rendering and lifecycle

Three.js **0.185.1** remains the only production dependency and loads when 3D is requested, including default builder startup. Local vendor modules and all runtime art are cached for offline use. The editor does not import Three.js. Its ground projection and inverse stay in `board-projection.js`; physical feet map to world meters at 0.3048 m/ft.

Replay uses CSS size × DPR (capped at 2), antialiasing, no coarse full-scene pixel pass, and the existing Overhead, Sideline, Behind Green and Behind Orange cameras. Artwork pixels provide the style. Unchanged paused scenes and end holds do not continuously render. One session clock owns playback; hidden-tab return resets its timestamp baseline. Owned render resources and pending park fetches are released on exit, failure or replacement. Recoverable errors leave the board intact.

The original standalone trajectory/rig utilities remain for compatibility and tests; the normal visible replay uses the shared compiled rally sampler and pixel actors. No second Play catalog or clock is introduced. See [asset contract](docs/PIXEL_ACTOR_ASSETS.md), [park art](docs/PARK_ART.md), and [mission evidence](docs/PARK_COACHING_VERIFICATION.md).

## Court coordinate model

The SVG coordinate system uses feet:

```javascript
courtBounds = {
  left: -8,
  right: 28,
  top: -8,
  bottom: 52
}
```

The regulation court occupies `x = 0..20` and `y = 0..44`. The expanded view box gives eight feet of planning space around it. The net is at `y = 22`; the non-volley zone extends from `y = 15` through `y = 29`.

Current mode defaults are:

```javascript
singles: {
  player1: { cx: 5, cy: -1 },
  player2: { cx: 15, cy: 45 },
  player3: { cx: 5, cy: 36 }, // hidden
  player4: { cx: 15, cy: 36 }, // hidden
  ball: { cx: 19, cy: 45 }
}

doubles: {
  player1: { cx: 5, cy: -1 },
  player2: { cx: 15, cy: 14 },
  player3: { cx: 5, cy: 45 },
  player4: { cx: 15, cy: 45 },
  ball: { cx: 19, cy: 45 }
}
```

These starting positions and team assignments are intentional game behavior.

## Court appearance

- Muted jade court and sage kitchen, cream lines, navy net
- Navy faceless athletes with green and orange team bands
- Yellow-green ball, orange user annotations, golden Play paths
- Crisp pixel sprites and restrained 3D pixels; readable system-font controls
- Coordinated cream/day and navy/night panels

## Public API

For compatibility, the browser continues to expose the current instance as `window.pickleboard`. This internal API name is not the product identity:

```javascript
window.pickleboard.getTokenPositions()
window.pickleboard.setTokenPosition('player1', 10, 12)
window.pickleboard.resetPositions()
window.pickleboard.setGameMode('singles') // true
window.pickleboard.setGameMode('invalid') // false
```

`setGameMode()` validates the requested mode and synchronizes the visible radio control. Reset always uses the authoritative current mode.

## PWA update and cache policy

The worker maintains an explicitly versioned `pickleboard-static-*` shell cache. It:

- Precaches only application-owned static files
- Intercepts only same-origin `GET` navigations and explicitly listed static assets
- Uses the network first when online so changed releases replace cached files
- Updates the cached shell only from the application root or `index.html`, not arbitrary same-origin pages
- Falls back to the cached application shell for offline navigation
- Deletes only obsolete caches in the retained `pickleboard-` compatibility namespace
- Activates and claims clients after the complete new shell is cached

Changing a shell asset—including any player PNG—requires incrementing the static cache version in `sw.js`. Browser tests exercise installation, offline repeat visits (including all four player images), upgrades, unrelated-cache preservation, and replacement of stale cached assets.

## CI

`.github/workflows/quality.yml` runs locked installation, syntax/unit/brand/asset checks, reproducible generation, full Chromium and WebKit suites, and exact-package/offline/production-upgrade checks on pull requests and pushes to `main`. Every required job must succeed for **Quality gate**. Pages publication is manual, selects the tested main artifact, and does not deploy pull requests. See [live testing delivery](docs/LIVE_TESTING_DELIVERY.md).

## Browser support

The production code targets current evergreen Chrome, Edge, Firefox, and Safari releases with SVG, CSS custom properties, service workers, Cache Storage, and modern JavaScript support. Chromium is the primary automated quality gate. Supplementary WebKit checks run with `npx playwright test --config playwright.webkit.config.mjs` after `npx playwright install webkit`. See [current verification](docs/REBRAND_VERIFICATION.md) for public evidence scope and browser limitations.

## Contributing

Keep the production runtime lightweight, isolate Three.js to 3D playback, and preserve the existing SVG court geometry unless a product change explicitly requires otherwise. Run `npm test` before opening a pull request. PWA changes should always be tested through HTTP on localhost or HTTPS, including an upgrade from an existing cache.

## License

This repository does not currently include a formal software license. The owner should choose one before relying on reuse or redistribution permissions.

## Visual assets and verification

The default visual language uses original compact game-inspired artwork across the editor, guided Plays and 3D. Run `node tools/generate-art.mjs` to regenerate sprites, icons and density comparisons without external tools or dependencies. The default builder requests Three.js; the explicit planner entry defers it until 3D is requested, and the service worker still caches its local modules in the background for offline replay.

See [visual direction](docs/VISUAL_DIRECTION.md), [asset provenance](docs/ASSET_PROVENANCE.md), [current verification](docs/REBRAND_VERIFICATION.md), and [public release snapshot](docs/RELEASE_PUBLICATION_SUMMARY.md). Reproducible generators and local review tools remain available in the source tree; their historical capture outputs are not part of the public evidence set.

## Pixel replay implementation

3D replay now uses original directional pixel athletes inside the 3D court, with animated paddle contact, a high-contrast ball and stable elevated camera framing. The editable SVG board retains precise dragging/drawing and snapshot restoration. Replay runs one timeline and renders unchanged paused views only when needed.

See [current rebrand verification](docs/REBRAND_VERIFICATION.md) and [reproducible actor asset contract](docs/PIXEL_ACTOR_ASSETS.md). Run `node tools/generate-replay-art.mjs` to regenerate replay art; no additional dependency is needed.

## Rebrand maintenance

Use **Pickleball Park** in prose, **PICKLEBALL PARK** in wordmarks, and `pickleballpark` for new project-owned machine names. Keep existing remote URLs factual until the coordinated rename is authorized. `npm run check:brand` checks active branding and documented compatibility/history exceptions. Regenerate art at its source; do not patch exported pixels alone. Installation identity, the theme key, service-worker path and internal API names deliberately retain continuity; see [rename handoff](docs/RENAME_HANDOFF.md).

## Court-first local layout candidate

The painted court is larger without changing canonical positions or the editable apron. MENU sits on the left park path, HELP on the right, and a compact original pixel banner replaces the detached heading and upper tree. Both controls retain keyboard, touch, focus-return and guided-session behavior. See [the measured comparison and verification](docs/COURT_FIRST_VERIFICATION.md) and [the before/after gallery](docs/court-first/index.html). This candidate has not been pushed or deployed.
