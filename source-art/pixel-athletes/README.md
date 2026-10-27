# Original pixel athletes

`athlete-native-atlas.png` is an editable transparent pose sheet: 208 cells at
32 × 32 native pixels (13 vocabulary rows × 16 columns). Each row shows both
hands, forehand/backhand sides, and preparation/contact/follow/recovery phases.
It is an inspection and editing export, not an image loaded by the runtime.

The canonical runtime artwork is `pixel-athletes.js`: integer pixel clusters,
skin/kit palettes, cap/hair variants, grip, paddle and limb drawing. The canonical
motion source is `pixel-strokes.js`: family curves, handed facing, fixed-length
arm IK, crouch/overhead torso adjustment and planted foot support. Edit these
sources to change the app; editing the exported PNG alone does not update it.

Run `node tools/source-art/pixel-athlete-proof.mjs` from the repository root to
regenerate the native sheet, provenance and enlarged inspection/motion proofs.
It uses the repository's locked Playwright dependency and a local preview.

The sheet describes representative poses. Actual playback additionally solves
the paddle against the authoritative ball contact, using the same integer
global-pixel snapping for the paddle and ball. Player ground coordinates remain
unchanged; foot offsets retain world-space plants through the contact window.

All pixel constructions and choreography are original project work. No Pokémon
sprites, external character packs or paid assets are included. See provenance
and `docs/PIXEL_SHOT_COVERAGE.md` for generation and verification details.
