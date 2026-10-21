# Park art contract

Current product: **Pickleball Park**. The permanent name changes lettering only; approved geometry, poses, grips, anchors and palette remain the accepted baseline.

The park setting is original repository-authored pixel art with no external
assets or runtime dependencies. `tools/generate-park-art.mjs` deterministically
produces 128px quiet-court, grass, and path textures plus transparent 64px
tree, shrub, bench, and sign details in `assets/park/`.

`park-layout.js` is the shared placement contract for the SVG board and the
3D replay scene. Canonical board feet remain `x=0..20`, `y=0..44`; the park
apron is `x=-8..28`, `y=-8..52`. Landmarks are outside the painted court and
use more than four feet of setback wherever the apron permits it. Each
landmark records an id, type, x/y foot position, size, height, and anchorFoot.
Renderers may choose their own projection, but they must use those same
positions and preserve the existing playable and movement bounds.

The richer teal court, aqua-sage kitchen, layered greens, and terracotta path
are quiet materials. Court textures avoid high-contrast noise; the existing
character and ball colors remain unchanged. Detail sprites contain no ball
marks or extra yellow objects.

Regenerate with:

```sh
node tools/generate-park-art.mjs
```
