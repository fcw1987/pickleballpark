# Mobile interface refinement evidence

Screenshots were captured with headless Chromium via Playwright on 2026-10-17. These are browser emulations, not physical iPhone, Safari, VoiceOver, native keyboard, or safe-area device acceptance tests. No device/browser installation or external service was used.

## Layout changes

| Surface | Before | After |
|---|---:|---:|
| Builder header, 390×844 | 60px | 58px |
| Builder playback, 390×844 | 126px | 103px |
| Simple shot editor, 390×844 | 442px | 403px |
| Builder header, 1440×1000 | 83px | 62px |
| Landscape editor, 844×390 | Extends to y397 under transport | Scrolls in y61–329 above transport |
| Guided 3D HUD, 390×844 | 223px | 117px |
| Guided 3D HUD, 844×390 | 240px | 72px |

The UI uses ivory paper, navy keylines, jade primary actions and restrained burnt orange accents. Live controls use system text; the bundled pixel font remains on headings. Menus, tabs, secondary actions and native authoring fields have a 44px minimum target height. Mobile native fields remain at least 16px to avoid automatic small-text focus zoom in iPhone browsers. Browser pinch zoom is preserved.

Guided replay uses a native **Shot details** disclosure. Full description, status, progress and shot cue IDs are retained in its notes panel. Play, seek, View and Exit 3D remain visible. The disclosure state survives playback updates because the existing code updates the retained IDs. Camera and speed appear in a bounded popover above the dock.

## Evidence

- `before-{phone,narrow,landscape,desktop}.png` and `before-*-editor.png`: original HEAD builder stylesheet served using a browser route, for a CSS-only comparison. The concurrently developed renderer may already be present; these do not claim an entirely original runtime.
- `after-{phone,narrow,landscape,desktop}.png` and `after-*-editor.png`: revised builder controls.
- `before-*-guided.png` / `after-*-guided.png`: guided HUD comparison.
- `after-*-menu.png`, `after-*-guided-notes.png`, `after-*-guided-view.png`: menu, lesson disclosure and camera controls at 390×844, 320×740, 320×568, 844×390 and 1440×1000.

All checked viewport menus fit inside the visible screen, including the 320×568 case. All checked native Hitter/Flight/Arc/Pace fields were at least 16px and 44px high. Notes opened, camera selection worked, and Exit remained visible. No horizontal document overflow was observed.

## Existing browser regressions

- **19/19 pass**: `builder-smart-interface`, `coaching-layout`, `gauntlet-interface`, `iphone-interface`; covers semantic family selection, structural actions, native-select menus, chapter navigation, editor focus/scroll, seven coaching sizes and dark appearance.
- **14/14 pass** after the scoped selection and enlarged-text repairs: `builder-ui`, `pixel-game-context`, `iphone-workflow`. This includes the full custom rally, precise target and movement pins, Add, play/pause, 2D/3D switching, shading, undo/redo, reload, saved plays, lessons, planner return, invalid fields/import recovery, reduced-height keyboard simulation and 200% text at 402×874 and 844×390.
- The original fc46c60 application failed the complete portrait workflow because choosing a named chapter while the editor was open left the previous shot selected. Subsequent family edits could alter the initial serve instead of the chosen shot. The UI now selects the explicitly chosen chapter while preserving the playback time. Automatic playback and arbitrary timeline seeks continue to preserve an open editor's selection. The regression checks both the named-shot edit and editor stability during actual playback.
- At 200% text size the fixed editor could overlap the higher-layer header, which intercepted the focused Close button. The enlarged-text editor now sits above that chrome. Both zoom regressions pass, including an actual Close click.

The final focused runs cover **33 passing browser tests** across the seven files above. The execution host disconnected during an earlier run; after recovery, the affected suite was rerun to completion. No unresolved local test failures remain in these focused checks. The compiler, physics, renderer and shot mechanics were not changed by these UI repairs.
