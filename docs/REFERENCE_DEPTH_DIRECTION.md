# Reference-depth review candidate

This is a local work in progress on `feature/reference-depth-review`. It is not
an approved visual direction or a release candidate. The rejected flat prototype
is preserved at `c5504f7` on `feature/leaf-court-pixel-reset`; the earlier sculpted
3D branch is also preserved. No public deployment is authorized.

## Source of truth

The user-approved generated concept is Library file
`libfile_8ddf506b9bc48191a81d1812916e7e1f`, **Pickleball Park - LeafGreen Pixel
Concept.png**. Its rich character shapes, layered vegetation, warm paths, blue
court, silver rails, and large navy/ivory framed menu define the visual target.
Its depicted court proportions do not supersede regulation geometry.

The user rejected the flat implementation's coarse resolution, narrow simple
athletes, and thin menu. They now explicitly require freely draggable camera
pan, full 360-degree rotation, tilt, and zoom. Strict GBA framebuffer resolution
and a fixed top-down map are no longer design constraints.

## Implementation decision

Use a real camera and regulation court/park geometry with detailed original
directional character artwork. Preserve detail at native display resolution.
Trees and athletes use camera-aware image planes; the court, fence, and
clubhouse have real depth. This 2.5D approach retains illustrated detail while
allowing orbit and tilt, but it does not make every illustrated feature a
volumetric model. Direction transitions, overlap, and high-angle appearance need
actual visual review before this architecture is considered settled.

Empty-space drag controls the camera. Actor and target gestures take priority
in editing. Provide visible Rotate/Pan modes, zoom, and reset, plus mouse and
touch gestures. Camera changes must never change shot data or the play clock.

The substantial navy/ivory bottom frame should contain working Play, Edit,
Reset and authoring/navigation controls. Optional scenery interactions must not
replace discoverable accessible controls.

## Review gates

First show actual desktop/phone stills and a short app recording proving the
character fidelity, menu, orbit, tilt and pan. No full regression sweep before
this art checkpoint. Static silhouettes without visible paddle strokes are
incomplete; they must not be represented as finished athletic animation.

Then validate distinct forehand/backhand preparation, contact, follow-through,
footwork and recovery for the supported shot combinations and handedness. Keep
the existing schema-derived catalog and contact math as foundations, without
claiming that previous flat-renderer checks validate new artwork.

Court dimensions remain 20 by 44 feet, with 7-foot non-volley zones on each side
and the canonical service boxes, net and lines. Preserve saved plays, authoring,
rally logic and tactical readability. Final validation belongs to the final
candidate after the visual direction settles.
