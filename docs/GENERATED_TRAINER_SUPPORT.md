# Generated grounded trainer support

New generated contacts must pass both the broad necessary grounded envelope and
an exact evaluation of the active instructional trainer's selected-hand impact
pose. Neither check changes authored source acceptance or asserts a universal
human reach limit. A failure means that this current bounded trainer solve cannot
represent the contact with its fixed bones and actual grounded feet.

`trainer-contact-support.js` is the pure numeric module shared with the renderer,
frozen at SHA-256
`5bca9a3854b52a51908de7d592385bed9708e9caec7f69142deaa5367d6c991c`.
It depends only on the shared versioned human profile. Its bounded alternating
arm/pelvis solve is not a proof of global physiological reachability. The original
renderer integration was compared against actual mesh, wrist, leg and sole
transforms; those checks remain independent of generation's adapter.

`assessGeneratedTrainerSupportV1` accepts actual board contact/feet/stance,
physical handedness, resolved stroke side, family, contact kind, court end and
shared-solver outgoing/incoming flights. It converts the actual soles into
anatomical left/right targets using the same court-end convention as presentation.
Body facing uses the outgoing 0.06-second horizontal tangent. Outgoing and
incoming velocities use the renderer's world-space secant with
`dt = min(0.0001, representedFlightDuration / 4)`. The incoming endpoint must be
the actual selected contact time, not a later first or second bounce. Short-hop
presentation preserves explicit serve/overhead families.

The adapter returns the exact detached input and selected-hand support result.
Unsupported context is distinct from a tested pose failure. Only stationary
grounded Model-2 impacts with standard planted loading are covered; active moving
momentum is reported as unsupported context. Camera, renderer, DOM and Three.js
are not production dependencies.

The engine tests candidate nominal replies before choice and each actual delivered
physical solution against the same frozen stance. It does not redraw quality or
errors to obtain a representable pose. If all supported physical solutions fail,
the generation attempt fails honestly.

The final driver independently recompiles serialized source and recomputes actual
contact roots, feet, resolved side/family and adjacent-flight velocities. This
pose gate follows existing public rules, necessary-envelope, actual movement/
spacing and generated-flight checks, preserving their fail-first diagnostics.
It reports `unsupported-trainer-context` separately from
`unsupported-grounded-trainer-pose`. Producer-supplied success metadata cannot
satisfy either audit, and failed source is never repaired or relabeled a winner.
