# Original pixel interface and park art

## Sources and preservation

The park textures and landmarks are original procedural artwork in `tools/generate-park-art.mjs`. Run `node tools/generate-park-art.mjs` to reproduce the eight local PNGs. `npm run check:generated` rebuilds all generators in a temporary directory and compares pixel scanlines, dimensions, metadata and path sets. No extracted game assets, external fonts, Nintendo characters, logos or music are used. The reference informs a general handheld pixel-menu language only.

This candidate refines five existing assets: stepped multi-layer tree canopies, clipped shrubs, lit bench slats, tapered grass clusters and staggered clay pavers. The quiet court, compact wordmark and help sign retain their original pixels. The actors, layered paddle grips, ball, tactical coordinates, court markings and physics are unchanged. All assets retain their original dimensions and paths; there is no added scenery object count.

Both views consume `PARK_LAYOUT` and the same textures. The 3D landmarks now face the camera around their stored ground anchors. Previously yaw-only planes collapsed vertically in the overhead view, making a tree look like a flat oval. Camera-facing presentation restores readable silhouettes at the ordinary pixel scale. Landmarks keep transparent padding and clamp their texture edges. Ground materials use nearest magnification and interpolated mip levels at minification, reducing abrupt transitions between levels on angled pavers. Actor atlas sampling is unchanged. There is no postprocessing target or fullscreen resolution reduction.

## Selective reference decisions

| Official source and relevant section | Decision in this web app | Evidence/acceptance |
| --- | --- | --- |
| [Apple: Designing for games — smaller screens and safe areas](https://developer.apple.com/design/human-interface-guidelines/designing-for-games) | Reflow independent controls while leaving the court visible; reserve room for essential touch controls inside the viewport. | Matched phone/tablet/desktop captures and court-polygon measurement. |
| [Apple: Game controls — touch and keyboard](https://developer.apple.com/design/human-interface-guidelines/game-controls) | Keep semantic direct controls, contextual actions and scoped keyboard navigation. | Native range, chapter picker and exact target fields; typing shortcuts stay local. |
| [Apple: Design great interfaces for handheld games — layout, legibility, touch placement and feedback](https://developer.apple.com/videos/play/meet-with-apple/243/) | Anchor small groups, use scrollable detail content, keep selected/pressed states visible. Approximately 44–48 CSS pixel touch regions are a project choice, not an equivalence to native point measurements. | Responsive menu/editor captures and input tests; physical iPhone coverage reported separately. |
| [Apple: Customize and resize sheets — nonmodal interaction](https://developer.apple.com/videos/play/wwdc2021/10063/) | A nonmodal editing region lets the court and precision fields work together; explicit Done returns to viewing. | Phone placement and detailed authoring walkthrough. No UIKit implementation implied. |
| [W3C: Slider pattern — keyboard and touch-assistive warning](https://www.w3.org/WAI/ARIA/apg/patterns/slider/) | Native range, meaningful shot/time value text, Home/End and arrows; exact chapter list is a separate accessible route. | Chromium/WebKit keyboard and input tests. Automated browser coverage does not establish VoiceOver compatibility on iPhone. |
| [W3C: Media seek slider — value text and compatibility](https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-seek/) | Time and shot identity replace an unexplained percentage; no live-region updates per frame. | DOM semantic checks and endpoint tests. |
| [W3C: Dragging movements — single-pointer alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Tap the rail, choose a chapter, tap-place a target or use exact values without a drag. | Touch and keyboard authoring/seek tests. |
| [W3C: Modal dialog — focus, Escape and return](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Use real dialogs for distinct file tasks, focus inside them, dismiss with Escape/Close and restore a meaningful trigger. | Menu/import/help focus tests and inspection. |

The two HIG URLs initially returned a JavaScript shell through the text reader; indexed official summaries and the full official handheld-game transcript supplied the relevant guidance. The repeating playback and chapter convention are owner choices, not Apple requirements.
