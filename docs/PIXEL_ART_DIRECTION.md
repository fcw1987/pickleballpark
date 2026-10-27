# Leaf Court pixel direction

> Preserved rejected prototype. On 2026-10-27 the user rejected this coarse flat implementation and requested a richer reference-faithful scene with free pan, 360-degree rotation and tilt. Final validation was stopped; this branch is historical work, not an accepted candidate.

Approved reference: **Pickleball Park - LeafGreen Pixel Concept.png**, Library
`libfile_8ddf506b9bc48191a81d1812916e7e1f`. Materialized and visually inspected on
the consuming Mac on 2026-10-27. It is a generated direction image, not an asset
sheet or a geometric specification.

## Visual contract

- Original top-down tile and sprite artwork with the readable, bright park
  atmosphere of a GBA-era role-playing game. No copied Pokémon artwork.
- Uniform logical pixels, nearest-neighbor enlargement, stepped outlines and
  deliberate color clusters. No 3D scene and no pixelation filter on 3D models.
- Blue regulation court, lush layered green trees, sandy paths, compact red-roof
  clubhouse, silver fence, flowers and a small pond. Decoration frames play.
- Trainer-scale athletes with distinct kits, caps/hair, visible grip and paddle,
  clear facing and separated feet. Preparation, impact, follow-through and
  recovery must read at actual phone size.
- Navy double borders, ivory menu surfaces and crisp accents. Controls remain
  accessible, legible and usable at 320 px and 390 px widths.

## Geometry and action contract

The court remains 20 × 44 feet under a uniform top-down projection. Each kitchen
is 7 feet deep; net y = 22; kitchen lines y = 15 and y = 29; service boxes are
10 × 15 feet. The concept's compressed court is not copied. Ball ground position,
height, player positions, authored paths and pointer mapping share one projection.

The actual app shot catalog and legal contact combinations determine coverage.
Every supported stroke family must have a recognizable motion signature; both
forehand and backhand, handedness, preparation, contact and footwork are tested.
Existing tactical authoring, storage, rally rules and semantic shot data remain
authoritative. Visual corrections must not silently rewrite saved plays.

## Review order

1. Inspect the approved reference, then integrated desktop and phone scenes.
2. Review actual animation for representative strokes and contacts early.
3. Correct visual defects and interaction regressions.
4. Run focused checks during development and applicable full validation after
   the candidate settles. Report the exact candidate and distinguish check scopes.

This branch starts at freshly fetched main
`e765b0160c23a600680b3323f6bb50d09da3e17c`. The rejected 3D branch and its assets
remain intact in the separate sibling checkout. No push, merge or deployment is
authorized by this implementation request.
