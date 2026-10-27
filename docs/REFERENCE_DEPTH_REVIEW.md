# Reference-depth visual checkpoint

This is an early integrated art and camera review, not an approved release.
Branch: `feature/reference-depth-review`. The original live app is unchanged.
The two rejected local iterations remain intact.

## Review locally

Use Node 24 in this checkout, install the locked dependencies with `npm ci` if
needed, then run `npm start`. Open the URL printed by the server. The captured
review server used `http://127.0.0.1:4182/`.

Choose the Dink Exchange lesson and press Play. Drag empty ground to rotate and
tilt; use Pan or Shift/right drag to pan. Two-finger touch pans/pinches. The
visible camera controls provide zoom and reset. Editing a player or shot target
takes precedence over the camera. View changes do not modify the authored play.

## What's implemented

- Original detailed directional character atlases with separate animated arms
  and paddles; original generated foliage and editable procedural park geometry.
- Native-resolution scene rendering with an unrestricted azimuth camera,
  elevation limited to 20–75 degrees, and zoom distance limited to 7–55 metres.
- A navy/ivory stepped menu frame containing working authoring and camera tools.
- The canonical 20-by-44-foot court, 7-foot kitchens, service lines and net.

## Focused evidence

The actual desktop and phone recording exercises more than a full revolution
(-7.2 radians), tilt, pan, zoom/reset, menu use, and a running dink exchange.
Checks found no page errors, horizontal overflow, or authored-document changes.
A separate browser touch-event check verified two-finger pan/pinch; a target
drag changed the authored target without moving the camera.

Sixteen actual-app contact cases cover both hands, forehand/backhand, and
front/quarter/profile/tilted rear views for dinks. The last audit uses the dink
family rather than the legacy generic drop animation. Paddle-center error at
the authored ball contact is at floating-point tolerance (at most 5.44e-16 m),
and both striking-arm bones remain 0.28 m. The screen evidence shows directional
frame changes and distinct hand/side selection. These numbers support the
visual check; they are not evidence of every stroke's complete animation.

Additional focused checks: nine builder UI tests and nine court/core unit tests
passed. The routine check runs the existing 278 units, asset checks and brand
checks. Full Chromium/WebKit, all shot/variant combinations, offline upgrade,
runtime packaging, and release checks have not been completed for this new
direction. Do not reuse old flat or sculpted-3D results as proof for it.

## Deliberate current limits

The athletes use four drawn views (front, quarter, profile, back), mirrored into
eight directions. Rear quarters reuse the back view. Sprite planes face the
camera while the displayed direction changes with the athlete's world facing;
they do not all display a front-facing character. Tilt has no separate overhead
artwork. Trees also use illustrated camera-facing planes. This is a 2.5D scene,
not a fully volumetric athlete model.

All supported shot data and existing choreography remain available, but the new
artwork has only the focused dink contact coverage above. Complete preparation,
follow-through, recovery, footwork and hand/variant coverage for the full shot
catalog still need verification after visual feedback. The new modules/assets
also need release allowlist/cache integration before any deployment candidate.

## Source and provenance

Runtime geometry and animation are editable JavaScript. Original RGBA atlas
sources, the controlled armless atlas edit, metadata, prompts, and foliage are
in `assets/reference-athletes`, `assets/reference-depth`, and corresponding
`source-art` folders. No Nintendo art or paid assets were imported. The current
2.5D approach does not require a Blender/GLB conversion; the rejected 3D sources
remain preserved separately.

Library review images and videos are new files, distinct from the rejected flat
previews. The companion source ZIP is a checkpoint patch/source bundle, not a
deployment artifact. No push, merge, or deployment is authorized or performed.
