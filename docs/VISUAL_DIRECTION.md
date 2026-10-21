# Pickleball Park visual direction — second pass

Original compact sports world inspired by the original DS Diamond/Pearl's deliberate silhouettes, restrained colors and spatial readability. No copied Nintendo assets. The first-pass flat board and coarse scene-buffer treatment are superseded.

## One world, separate rendering boundaries

The editable board and guided Play use the same fixed elevated SVG court. Ground coordinates project with `x′ = x + .12(22 − y)`, `y′ = .9y`; `board-projection.js` owns that mapping and inverse. Canonical positions and drawing/path data remain feet. The viewBox includes all original off-court setup bounds. Players and net stay upright; actors are ordered by their court depth. Shadows and the court slab provide depth without a flattened screenshot transform.

Sprites use the approved replay layers composited into a 64×64 source and a 16/3-foot presentation box. Canonical numeric image attributes remain centered for compatibility, while the rendering transform places the visible sole edge (54/64 of image height) on the projected foot anchor. Transparent padding never becomes tactical state. Pointer mapping handles the SVG screen transform and inverse projection; browser input precision is respected, not quantized by the app.

The replay stays genuinely 3D with all four named camera identities, one existing timeline and trajectory model. Its default buffer is CSS size × device pixel ratio, capped at 2, with antialiasing. Sprite pixels and restrained toon shades supply the aesthetic; low scene resolution and low animation frequency do not.

## Shared art contract

`visual-theme.js` supplies the palette and render/sprite tokens. [CHARACTER_DESIGN.md](CHARACTER_DESIGN.md) describes original front, side, rear, ready and swing studies.

- Navy caps, hoodie sleeves and trousers; faceless warm neutral heads and small hands.
- Compact torso, larger readable cap/head, short connected limbs, separated pale shoes.
- Green/orange chest and rear panels plus shoulders make teams legible at court size.
- Physical handedness determines paddle attachment; no mirrored branding or copied graphics.
- Shoe geometry is oriented within its mesh; soles remain horizontal through the full joint chain. Preparation, contact, follow-through, recovery and travel share continuous elapsed time.
- Muted jade court, sage kitchen, cream lines, navy net, citron ball. Terracotta user drawings and golden Play paths remain distinct.
- Cream/day and slate/night panels, crisp borders, hard offset shadows, readable local system fonts, visible focus and comfortable touch targets.

## Composition and quality

Court depth is the default, not an experimental theme. Portrait uses a steeper elevated projection to retain useful player size; short landscape guided Plays place instructions beside the court; desktop and portrait reserve a bottom coaching panel. Full-court 3D cameras prioritize tactical context; low sideline and narrow views inherently show smaller actors. Close character studies must accompany actual court-size screenshots, never replace them as evidence.

High resolution and motion quality are measured separately. Callback cadence is not proof of presented frames. No new framework, runtime dependency, remote asset, backend or alternative Play state model is introduced.

## Current pixel replay contract (supersedes volumetric athletes)

The replay's visible athletes are authored pixel body/paddle layers, matching the board's faceless navy caps/hoodies, broad team panels, white soles, and square paddles. Eight camera-relative views remain upright in the genuine 3D world. Stable foot pivots and contact shadows ground them; physical handedness is authored rather than mirrored branding. The canonical Play clock and ball trajectory remain authoritative. The paddle layer meets the ball, not the reverse.

The ball is citron/cream with a navy edge and 10 CSS pixel minimum visible diameter, a short past-position trail, and a hollow occlusion cue. Default Overhead is elevated/angled with portrait-specific framing; Sideline is elevated but remains a sideline. No coarse full-scene pixel filter. Native DPR up to 2 and antialiasing remain. Detailed contract and final evidence: `PIXEL_ACTOR_ASSETS.md` and `PARK_COACHING_VERIFICATION.md`.

## Current unified park contract

The liked replay actors are now the source for editor and guided artwork. `tools/generate-replay-art.mjs` followed by `tools/generate-art.mjs` reproduces that relationship; the obsolete centered free hand is not reused. `park-layout.js` shares landmark coordinates across projections. `court-geometry.js` shares exact service-line endpoints. Quiet teal court clusters, sage kitchens, ivory lines, layered green grass and terracotta paths keep the outlined ball and tactical drawings prominent. Tree, shrub, bench and sign pixels are original local artwork.

Ground projection remains unchanged; physical height uses `sqrt(1 - .9²)` for the elevated SVG view. Loop and shot cues share authoritative playback time. No decorative motion or wall-clock cue animation is used. See [current verification](PARK_COACHING_VERIFICATION.md).

## Court-first responsive composition (2026-09-07 local candidate)

The painted court and complete existing editable apron determine the responsive fit. Wide layouts use a 0.65 longitudinal affine depth scale and 0.09 shear; portrait uses 0.90 and 0.04. These are presentation transforms only. The inverse keeps exact canonical positions and drawings. Upright actor/ball height retains its approved calibration independently of ground fitting, preventing stretched overhead equipment.

The compact two-line navy-on-ivory pixel banner replaces the detached header and upper tree. Existing native MENU and HELP buttons occupy the left and right park paths, with screen positions derived from the actual SVG CTM, including guided-mode letterboxing. MENU stacks its icon and label to protect court clearance at enlarged text. The banner scales with the rendered scene and remains inside the viewport when shot cues expand the HUD. Spatial replay shares the banner and HELP artwork as world scenery; its transport and camera identities are unchanged. Behind-player occlusion of world signage remains intentional.

Keep the static bench, two remaining trees, shrubs and quiet paving. Omit spectators, dense planting and decorative motion so the playing surface remains dominant.
