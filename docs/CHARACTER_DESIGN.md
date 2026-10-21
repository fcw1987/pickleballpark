# Character design contract

Current product: **Pickleboard**. The permanent name changes lettering only; approved geometry, poses, grips, anchors and palette remain the accepted baseline.

The four runtime athletes are original repository-authored pixel art. The
Diamond/Pearl era is an art-direction reference for compact DS proportions and
stepped edges only; no Nintendo artwork is copied.

## Silhouette and anchor

- Canvas: 64×64 RGBA, nearest-neighbor sampling. It preserves the replay cell's
  original 48×48 construction with 8px transparent padding.
- Sole anchor: the last painted shoe row is y=53, with its lower edge anchored at y=54; the root/projection worker
  positions the player from this foot line.
- Cap/head and jacket retain the approved replay body silhouette inside the
  padded cell; transparent padding never becomes tactical state.
- Legs and shoes remain separate, with a visible center gap and a stable
  lower edge at y=54.
- Arms are short and bent. The paddle hand and support hand each have a skin
  pixel block touching the handle so the grip reads at native size.

## Palette and team areas

All colors come from `visual-theme.js`. Ink/navy (`ink`, `navy`, `navyDark`,
`navyLight`) carries caps, outlines and shadowed clothing. Skin uses `skin` and
`skinShade`; shoes use `shoe`. Green athletes use `green`/`greenLight`/
`greenDark`, orange athletes use `orange`/`orangeLight`/`orangeDark`.
The team panel covers roughly 30% of the visible torso pixels, with a bright
highlight stripe and dark lower fold; this prevents the athlete becoming a
single dark mass.

## Orientation and references

Green runtime sprites are front-facing and orange runtime sprites are
rear-facing, preserving the existing game orientation. Handedness changes the
physical paddle side; artwork is authored for both sides rather than mirrored
text. The four board files are direct ready-frame composites of the approved
replay body and action sheets, so the grip and paddle geometry stay shared.
`assets/source/players-native.png` and `players-large.png` show all four
team/hand combinations at normal and magnified scale. `player-court-preview.png`
checks the 16/3-foot square implied by the 64px source and `(32,54)` anchor.

Regenerate deterministically with `node tools/generate-art.mjs`; it reads the
checked-in replay PNGs and never edits them.
