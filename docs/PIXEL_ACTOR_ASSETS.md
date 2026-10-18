# Replay pixel actor assets

`tools/generate-replay-art.mjs` produces the replay atlas family from the
shared Pickleboard palette. It does not modify the editor artwork. Each atlas
uses 64×64 cells containing the original 48×48 character construction with
8px transparent padding. The stable foot pivot is `(32,54)`.

There are 32 team/handedness/direction entries: green and orange, left and
right hand, and front, front-right, right, back-right, back, back-left, left,
front-left. Each has `ready`, alternating-foot `shuffle-a` and `shuffle-b`,
plus prepare/contact/follow/recover frames for serve, forehand, backhand,
drive, drop, and block. That is 27 poses per entry and 864 layered poses.

`metadata.json` is the renderer contract. Every frame records its atlas rect,
foot pivot, paddle grip, paddle face, team, hand, direction, and action. Every
entry names a `bodyFile` and `actionFile`. Identical encoded sheets share the
first canonical filename with the same content hash; 64 logical references
currently resolve to 32 PNG files (71,299 bytes). Runtime metadata is minified
and currently 241,986 bytes, down from the earlier 507,791-byte formatted
file. The generator remains readable source. The body is independently drawn and
contains the grounded feet, legs, torso, head, cap, and non-dominant arm. It
contains no dominant arm, hand, or paddle. The action image is independently
drawn and contains only the dominant arm, hand, grip, and paddle. There is no
composite fallback. Frames record `shoulderPivot`, `paddleGrip`, and
`paddleFace`; both layers use the same frame rectangle and stable foot pivot.
`bodyBounds` and `actionBounds` record exact nontransparent bounds as
`[minX,minY,maxXExclusive,maxYExclusive]`, so framing can ignore padding.
Generation fails if any body or action frame falls below its opaque-pixel
coverage floor or touches a cell edge, guarding against the earlier
destructive-mask failure and clipped extended paddles. Faces intentionally
have no eye pixels, matching the faceless identity of the board characters.

Rear views use a navy hood/back-of-head mass and only a narrow skin cue;
front views expose the face. Side and three-quarter views offset facial and
cap-brim details toward their viewing direction rather than mirroring one
front pose indiscriminately. Handed action geometry is authored through the
view direction, while the metadata keeps physical handedness explicit. The
support arm is always opposite the physical paddle arm. Stroke phases add a
small shoulder lean and knee bend while fixed feet preserve the pivot. Serve
frames use a low prepare, waist-level underhand contact, upward follow-through,
and balanced recovery.

Regenerate with `node tools/generate-replay-art.mjs`. The source previews are
`assets/source/replay-actors-preview.png` and
`assets/source/replay-actors-close.png`. These previews are composed from the
same independently generated body and action pixels as the runtime sheets.
The preview shows ready, all four serve phases, and all four forehand phases
at one consistent direction and visible size.
