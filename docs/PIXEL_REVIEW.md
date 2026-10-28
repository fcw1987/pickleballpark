# Pixel court local review

> Preserved rejected prototype. On 2026-10-27 the user rejected this coarse flat implementation and requested a richer reference-faithful scene with free pan, 360-degree rotation and tilt. Final validation was stopped; this branch is historical work, not an accepted candidate.

Branch: `feature/leaf-court-pixel-reset`.
Base: `e765b0160c23a600680b3323f6bb50d09da3e17c` (freshly fetched main).
Checkout: `/Users/fdub/Documents/Codex/2026-10-27/task/pickleball-park-pixel`.

## What changed

The primary editor and rally playback now render original tile and sprite art
on Canvas2D. The court uses a uniform top-down projection at four logical pixels
per foot, with an 80 × 176 pixel regulation playing area. SVG retains accessible
token targets, annotation tools and canonical pointer mapping. Saved documents,
storage keys, rally physics and authoring intent are preserved.

The scene includes original park tiles, a red-roof clubhouse, pond, trees,
flowers, fences and benches. Native athlete sprites have directional faces,
handed paddle grips, family-specific preparation and follow-through, and
contact poses solved with fixed arm bones. Menus use ivory panels and navy
double borders. Public flows start in the pixel court. Historical 3D internals
remain available to compatibility tests but have no public view toggle.

## Review locally

Use Node 24 with the locked dependencies. From this checkout, run
`PORT=4200 npm start`, then open `http://127.0.0.1:4200` on the Mac.

1. Play the starter rally, scrub its chapters, edit a target and change a shot.
2. Open the menu and try Dink Exchange, Volley & Block, Short-Hop Reset, and
   Lob & Overhead. Compare paddle preparation, contact and recovery.
3. Try both player hands, then save and reopen a custom play.
4. Inspect the 390 px and 320 px layouts as well as the desktop view.

The review files are actual app captures. The approved generated concept is a
direction reference; its court proportions were not copied.

## Editable assets and provenance

- `source-art/pixel-park/`: PNG atlas, drawing commands, palette/tile metadata,
  provenance and review sheets. `tools/generate-pixel-park.mjs` regenerates the
  runtime atlas using Node built-ins.
- `pixel-athletes.js` and `pixel-strokes.js`: original editable pixel drawing
  and stroke choreography. `tools/source-art/pixel-athlete-proof.mjs` exports
  transparent pose sheets and a motion proof.
- `tools/source-art/pixel-runtime-motion.mjs`: actual app motion/contact capture.
- `tools/source-art/convert-pixel-review.mjs` and its Swift companion: local
  frame-preserving H.264 MP4 conversion.

No Pokémon game graphics, paid asset packs or downloaded character models were
used. The rejected 3D work is preserved in a separate checkout and branch.

## Validation status

Final candidate verification is pending. See `PIXEL_SHOT_COVERAGE.md` for the
exact shot matrix and the distinction between numeric checks, visual review,
focused browser checks and full Quality checks. Reports are kept under ignored
`release-results/`; historical captures do not prove this candidate.

No merge, push, PR or deployment was performed. The live app is unchanged.
