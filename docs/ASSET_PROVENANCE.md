# Asset provenance

Current visual assets are original Pickleball Park artwork authored in this repository. No Nintendo/Pokémon assets, fonts, logos, extracted panels, sound, or music are used. DS Diamond/Pearl is an art-direction reference only.

The following revision entries retain the history of the artwork. The current assets and display font are described in the final entry below; historical counts are not the current package inventory.

Palette: visual-theme.js. Sprite/icon source: `tools/generate-art.mjs`, authored pixels encoded to PNG with Node standard library. The first version generated four 48×48 RGBA players, eleven icon variants, and QA sheets in assets/source. No raster/image library or remote input. 48-pixel drawing selected over 32-pixel resampling for readable cap, hand and paddle. Green front/orange rear follow existing orientation; physical handedness uses authored placement, no mirrored text. Existing Three.js vendor files and their existing license notices remain unchanged. No project license change is made. This early revision used installed system fonts only.

Visual reference consulted: [original Diamond/Pearl DS town screenshot](https://www.vgchartz.com/game/4022/pokemon-diamond-pearl-version/screenshots). Reference only, not downloaded into runtime or copied. It informed compact proportions, restrained palette and crisp spatial edges.

## Second-pass revision

Commit `3871440` reauthors the original player pixels and adds `assets/source/players-poses.png` (front, genuine side profile, rear, extended swing). The four runtime PNG filenames remain unchanged. Navy clothing, broad team panels and the 46/48 visible-sole edge are shared with the projected editor and compact 3D rig. Source pixels occupy rows through 45; row edge 46 is the placement anchor. Court artwork now uses a 4×4-foot upright presentation box rather than the first pass's 4×3 box. `node tools/generate-art.mjs` reproduces the assets without an image library, external model or remote input. Existing icons and their original provenance remain unchanged.

Procedural 3D shapes and pose changes are repository-authored code in `three-d-playback.js` and `three-d-animation.js`. The SVG projection, net and slab are original local geometry. No new third-party artwork or license is introduced.

## Pixel actor replay revision

The visible procedural athletes are superseded by original layered pixel art from `tools/generate-replay-art.mjs`. It draws body/action pixels directly using the local Pickleball Park palette and character family; it does not render the rejected 3D model. Eight directions, physical handedness, two teams, and stroke phases are generated reproducibly. Runtime: `assets/replay/metadata.json` and 32 deduplicated PNGs (71,299 bytes); source/QA previews: `assets/source/replay-actors-preview.png` and `replay-actors-close.png`. Generator inputs are repository code, not external art. No licensing changes, paid tools, external services, new dependencies, or copied artwork. See `PIXEL_ACTOR_ASSETS.md` for frame/pivot/anchor conventions.

## Unified pixel park revision (accepted pre-rebrand baseline)

The prior paragraphs record historical assets. Current editor PNGs are **64×64**, exported directly from the approved replay ready body/action layers, pivot `(32,54)`. Run `node tools/generate-replay-art.mjs` then `node tools/generate-art.mjs`. The replay generator now includes lob and overhead preparation/contact/follow/recovery frames; existing liked grip/body art is preserved. Metadata describes 35 actions and 1,120 direction/team/hand frames in 32 deduplicated PNGs (88,591 bytes; metadata 312,149 bytes).

`tools/generate-park-art.mjs` authors seven local PNGs (2,330 bytes total): sparse court clusters, grass and path textures, tree, shrub, bench and sign. Source arrangement is `park-layout.js`; rendering adapters are `park-scene.js`. No random runtime texture generation, external image input, copied Nintendo art, remote fonts, new dependency or license change. Generator source is the reproducible original asset source.

## Pickleball Park rebrand (historical)

The permanent product name is Pickleball Park. The 64×64 park sign is authored by `tools/generate-park-art.mjs` with original 3×5 pixel glyphs spelling `PICKLEBALL` above `PARK`. It replaces two unlabeled sign strokes, not a third-party font. Sign PNG: 214→306 bytes; the seven park PNGs total 2,422 bytes. Bounds, palette, world placement and pivot are unchanged.

Inspection found no old PB lettering in the approved replay athletes, editor composites, caps, paddle faces or icon emblem. Those assets, all 1,120 frame records, 32 atlas files, four editor PNGs, eleven icons and source sheets are unchanged. All three generators reproduce their outputs; the only runtime artwork delta is the sign. The historical before/after inspection remains local; the original source sheets remain in `assets/source/`. No license, ownership, dependency, asset service or font installation changed.

## Court-first border artwork (local candidate, 2026-09-07)

`tools/generate-park-art.mjs` now produces the original 128×32 navy/ivory two-line `assets/park/banner.png` and revises the existing 64×64 sign to HELP. The existing local pixel glyph generator, palette, PNG encoder and license terms are unchanged. Run `node tools/generate-park-art.mjs`, then `npm run check:generated`. No external graphics, fonts or services were used. Athlete artwork, grip anchors and all other park PNGs are unchanged. The top tree is replaced by the banner; no spectators or animated decorations were added.

## Current game interface and fidelity candidate (2026-09-14)

`tools/generate-park-art.mjs` reproduces ten local park PNGs, including two original menu frames. The current pass refines grass, clay paths, trees, shrubs and bench shading with intentional pixel clusters. Frame corners retain their dimensions while live HTML labels and controls remain scalable. Both court views consume the shared park layout and assets.

`tools/generate-menu-font.mjs` generates `assets/park/menu-labels.ttf` (15,520 bytes, 45 glyphs) from repository-authored rectangle patterns. This is the original **Park Labels** display font, not a redistributed system, commercial or game font. Short labels use it; settings, values, play names and paragraphs use readable local system fallbacks. There are no remote font requests or font installations.

The approved athlete files in `assets/players/` and `assets/replay/`, outlined ball, paddle anchors, court coordinates and net geometry remain unchanged from checkpoint `1375835`. No new external artwork, dependency, license, copied game resource or asset service was introduced. `npm run check:generated` verifies all 66 generated asset paths in a temporary directory. See [PIXEL_GAME_ART.md](PIXEL_GAME_ART.md) for current dimensions, palette and generation details.

## Pickleboard name restoration (historical October 18 candidate)

The product name is Pickleboard. The original 128×32 banner now reads `PICKLEBOARD` in one centered line; the raised village sign reads `PICKLE` above `BOARD`. Both use repository-authored glyphs, existing colors and the original sign footprint. The village, court, foliage, props, athlete artwork, anchors and surrounding materials retain their accepted layout. Historical rebrand entries and captures above preserve the labels used at capture time.

## Pickleball Park branding continuation (current candidate)

The owner confirmed Pickleball Park as the authoritative name. The existing 128×32 banner is regenerated from `tools/generate-park-art.mjs` with the complete PICKLEBALL PARK wordmark. The raised village sign uses two centered lines, PICKLEBALL and PARK, within the existing sign geometry. Materials, sign position, court, athletes, accepted stroke motion and all other artwork remain unchanged. Historical images and prior verification reports keep their original names. No external assets, fonts, dependencies or licenses were introduced.
