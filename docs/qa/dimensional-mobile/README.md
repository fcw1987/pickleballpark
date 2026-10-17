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
- **15/16 pass** in the first combined run with `iphone-workflow`; invalid numeric edits/import recovery, resize/theme/keyboard-height simulation and pause race pass.
- The complete portrait custom-rally workflow fails at its existing `validShotCount === 4` expectation. The same exact test fails against the separately preserved original fc46c60 server on port 4174, with expected 4 / received 0. A CSS-only original comparison also reproduces it. The sequence changes the initial serve to Drop after chapter navigation/edit reopening, resulting in the compiler's correct “must begin with a serve” warning. This is a preexisting selection/authoring path under investigation by the parent, not a passing workflow claim.
