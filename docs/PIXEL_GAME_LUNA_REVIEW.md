# Luna visual review

Date: 2026-09-13  
Candidate: root local preview at `http://127.0.0.1:4184`  
Contexts: fresh Playwright browser contexts with `serviceWorkers: 'block'`; light and dark rest states, main menu, playback options, editor, 320px portrait, landscape, and 200% text.

The current candidate reads as a coherent original pixel game interface. The park artwork owns the screen at rest, while the control surfaces use stepped navy/ivory frames, shadowed bevels, pixel label glyphs, and a consistent cursor-like accent. The top row is a single context bar with Menu, the active chapter chip, Edit, Add, and 2D/3D. The bottom row has one Play control, one marked seek rail, and a compact playback-options affordance. There are no visible Previous, Next, Restart, or Loop controls. The app opens paused in the inspected contexts.

The 402px light rest capture shows a court region of 390×719px from y=68 to y=787, followed by a 75px transport row. The 402px menu opens at x=12, y=62, width=320, height=576 and keeps the full framed menu within the viewport. The options menu and editor retain the same pixel frame family. The editor sheet is deliberately substantial and covers the court while authoring; its `Done`, Shot family, Hitter, Flight, target placement, Details, and Coach tools routes remain legible and reachable. The transport remains visible beneath the sheet.

The dark 402px rest and menu captures preserve the same hierarchy with a dark teal court frame, soft green selected controls, ivory labels, and the dark nine-slice panel asset. The filled primary controls use dark navy text against green or amber surfaces and remain visually readable. The menu contents stay truthful: Rename, New Play, My Plays, Save As, Learn, Court Planner, Import / Export, Help, and Appearance are all available from the one menu.

At 320×568 the court remains 308×414px from y=68 to y=482, the transport is 74px high, and the document has no horizontal overflow. The landscape 844×390 state keeps an 832×247px court and a 75px transport without overflow; its wide composition gives the court room while keeping the compact controls at the top and rail at the bottom. At 200% text on a 390×844 viewport, the UI and document remain 390px wide with no horizontal overflow. The context row wraps into a readable two-line arrangement and the court remains visible below it.

One low-severity narrow-screen issue remains: at 320px the active chapter chip visually truncates to `1…`, so the family name is not visible until the chapter picker opens. The picker itself retains the full authored chapter labels and remains the correct route for selection and Edit. This is a compactness issue rather than a lost function.

The three-dot playback-options button is visually compact, while its native accessible name remains `Playback options` and its opened panel exposes speed, camera, Undo, and Redo. That tradeoff keeps the rail usable at phone widths and preserves camera access without restoring old transport stepping controls.

The first four-camera pass found one scenery issue: Overhead was clear and Sideline kept the court readable, but Behind Green and Behind Orange made the retained 14ft banner huge in the foreground. I applied the bounded shared-layout correction in `park-layout.js`, preserving the approved PNG while changing the static landmark from 14×3.5ft at y=-6.2 to 7×1.75ft at y=-8, with `controls.banner` kept on the same anchor. Fresh 402px and 1440px captures now keep the wordmark visible without covering the foreground players; the close views retain their depth while the banner no longer dominates. Sideline leaves the smaller sign near the far-right edge, and Overhead remains clear.

Final corrected camera captures are preserved under `pixel-game/after/cameras/`. The review also inspected the following isolated intermediate captures (not packaged as final evidence):

- `402-light-rest.png`, `402-light-menu.png`, `402-light-options.png`, `402-light-editor.png`
- `402-dark-rest.png`, `402-dark-menu.png`
- `320-light-rest.png`, `320-light-menu.png`
- `844-landscape-rest.png`, `844-landscape-menu.png`
- `390-large-rest.png`
- `cameras/overhead-clear.png`, `cameras/sideline-clear.png`, `cameras/behind-green-clear.png`, `cameras/behind-orange-clear.png`
- `layout-after/402-overhead.png`, `layout-after/402-sideline.png`, `layout-after/402-behind-green.png`, `layout-after/402-behind-orange.png`
- `layout-after/desktop-overhead.png`, `layout-after/desktop-behind-green.png`, `layout-after/desktop-behind-orange.png`

Automated preservation coverage for this candidate was run separately: builder UI 4/4, iPhone workflow 4/4, and iPhone interface 2/2.
