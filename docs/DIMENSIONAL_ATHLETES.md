# Dimensional pixel athletes

## Intent and representation

The 3D court uses original, compact, retro-handheld-inspired athletes with real
volume. The character language is broad heads, stepped caps and hair, small pixel
face details, clean green/orange kits, dark silhouette contours, and discrete
color bands. It is a dimensional interpretation of pixel-art proportions, not a
copy of a commercial game sprite and not a camera-facing atlas representation.

`reference-athletes.js` keeps its public loader/resource/create/update API, but
its production actors use closed chamfered geometry. Local +Z is the actor's
world-facing direction. Camera orbit never mirrors a character, swaps its front
and back, or changes its articulated pose. Atlas loading/partition functions and
original art remain available for compatibility and provenance verification;
those atlas textures are not the rendered character surface.

The moving body is one vertex-color batch per player. Hidden source meshes are
semantic handles whose transformed vertices are checked against that visible
batch. The paddle remains real independent geometry. Dark reverse-wound outer
shells provide the silhouette contour; they are not camera-facing planes.
Geometry/material ownership and repeated disposal remain explicit.

## Pose contracts

- World root positions, authored intent, court dimensions, ball flight, contact
  timing, legal decisions, and model-2 physical sole targets are unchanged.
- The compact rig deliberately uses two fixed 0.34 m working-arm bones, replacing
  the old billboard rig's 0.42 m bones. Tests require the new exact lengths and a
  stricter 0.68 m maximum reach; they do not relax contact or continuity errors.
- Ready paddles are upright and held in front. Prepare, contact, follow-through
  and recovery use genuine 3D metre-based keys, not sprite X/Y keypaths. Only the
  authoritative contact key is fixed by the ball. Free stroke arcs route in front
  of the actual shirt and head, with distinct soft, compact, serve, drive, lob and
  overhead families and handed/backhand geometry.
- The long paddle axis uses continuous family-specific angles in a real face
  plane. Low contacts put the paddle below a wrist held ahead of the shirt. The
  actual hand stays on the visible grip; an outward/front anatomical elbow pole
  stays independent of camera orientation. The support hand rests center/front
  rather than outside its shoulder.
- Fixed 0.32/0.31 m thigh/shin bones cover the measured 0.620226 m movement
  envelope without the hidden shin stretch of the early 0.29/0.28 m candidate.
  Their 0.63 m reach remains less bowed than the initial 0.35/0.34 m proposal.
  Foot placement uses actual solid shoe soles, not a root-position substitute.
- Final torso load is resolved before leg anchors. Overheads use at most
  0.22 radians of backward torso lean around the 0.65 m pelvis and 0.42 radians
  of look-up around the 1.25 m neck pivot. These connected rotations move the
  head and visor away from contact while preserving the original jump and soles.
  Geometry audits check the hip/torso seam and actual pelvis load, rather than
  mistaking pivot-origin compensation for physical body translation.
- Actual paddle face triangles, body batch vertices, sleeve anchors, and shoe
  sole vertices are independently inspected. Invisible proxies are not evidence
  of visible contact or grounding.
- Head/paddle clearance is checked against individual closed geometry shells,
  including visible face/rim vertices. Reverse-wound outline shells must not
  cancel the solid interior in the audit. Overhead posture must clear the cap
  while preserving the authored ball, paddle contact, root, and sole anchors.

## Geometry and performance

Each capped body has 8,784 vertices (2,928 triangles); each ponytail body has
9,204 vertices (3,068 triangles), including the dark outline shells. The paddle
adds 504 vertices (168 triangles). Each athlete renders in six draws: one body
batch and five solid equipment parts. Four athletes own 82 geometries and share
one vertex-color material; the actor renderer allocates no atlas textures.

The frozen-support-neutral Apple M3 Max headless/SwiftShader probe measured
3/8/9-shot seek medians of 0.6/0.6/0.5 ms (p95 1.1/0.8/0.7 ms). Settled renderer
CPU-submission medians were 1.1/1.0/1.0 ms (p95 1.7/1.5/1.4 ms). Cold 3D readiness
was 1.223 s; warm 3D re-entry median was 19 ms. Sixty paused animation callbacks
submitted no application renders, and ten 2D/3D loops ended with one canvas and
no pending render. These are one-run local CPU diagnostics, not displayed FPS,
pure GPU timings, physical-phone measurements, or a baseline comparison.

## Entry camera

`depth-camera.js` fits the authored action envelope with 4% breathing room rather
than enforcing a 27/29 m park-overview floor. Preset angles and HUD clearance
remain unchanged. The measured default entry is about 20.47 m. With the same
actors, projected heights increase about 30–33% in portrait and 39–43% on desktop
or landscape. Manual zoom remains 7–40 m, with the existing larger auto-fit
exception for narrow layouts. Camera gestures must not alter play time, source
content, or editor target gestures.

## Coverage

The brighter rose/blue sectors, violet shared area, paddle-side marker, and
position-aware pair bearing remain illustrative incoming defensive coverage.
They are not outgoing shot targets, guaranteed reach, receiver assignment, or a
rule that the forehand must take every middle ball. See `PLAYER_COVERAGE.md` for
its read-only model, limitations, tests, and coaching sources.

## Validation and evidence

Current implementation tests replace obsolete atlas/mirror assertions with
closed-depth, world-orientation, batch/source, and camera-invariance assertions.
Legacy atlas pixel, alpha, hole, hair, and UV negative controls remain separate
provenance tests. Physical contact, grip, grounding, dense temporal convergence,
reverse seek, and segment-continuity tolerances remain in force.

Independent frozen-runtime checks cover 4,312 true-clock poses with no sampled
head/paddle or exposed-forearm/jersey penetration, exact arm/leg lengths and
connected seams. An additional 2,928 critical head/paddle checks use 61 phase
samples. Convex components use separating-axis checks; slightly non-convex head
lofts use actual triangle/edge intersection and closed-volume containment, with
independent negative controls. These focused passes do not replace the required
aggregate checks and browser suite.

Final athlete design evidence is in
`release-results/dimensional-pixel-athletes/frozen-support-neutral/`, with source
SHA-256 `a6b7a1a0f33eb2265b01e1af6a19febe92e80086404f420993fdd6c9032d633a`.
`captures.json` records 25 production poses and their actual root/contact/leg
measurements. `app-close-side.png` is a preserved failed capture occluded by the
clubhouse roof; use `app-close-side-clear.png` and its camera/actor manifest.
`desktop-reversed.png` preserves the manual-flip crop with auto-fit disabled;
manual orbit intentionally retains zoom. A separate behind-green preset capture
uses the supported reset-and-fit path. Intermediate earlier captures are not the
final actor-design evidence.

Focused and aggregate test evidence, portrait/full-app screenshots, and timing
measurements live under ignored `release-results/dimensional-pixel-athletes/`,
`release-results/dimensional-entry-camera-2026-11-10/`, and
`release-results/coverage-pair-revision/`. Reports distinguish passed, failed,
and unrun checks; intermediate captures are not final-release evidence.

This is a separate feature-branch candidate. No merge, push, deployment, or live
release is implied by the local preview or this document. Static cache v43 is
reserved for the candidate's eventual reviewed runtime release.
