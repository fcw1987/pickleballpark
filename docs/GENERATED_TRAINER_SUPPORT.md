# Generated grounded trainer support

New generated contacts must pass both the broad necessary grounded envelope and
an exact evaluation of the active instructional trainer's selected-hand impact
pose. Neither check changes authored source acceptance or asserts a universal
human reach limit. A failure means that this current bounded trainer solve cannot
represent the contact with its fixed bones and actual grounded feet.

`trainer-contact-support.js` is the pure numeric module shared with the renderer,
frozen at SHA-256
`c24161585dca175007313e92b36fa677e2e85687f6a63653f1ada3b690470b9d`
with explicit revision `trainer-contact-support-v3`.
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

## Shared posture revision 2

The coordinated pure module revision `trainer-contact-support-v2` keeps all
adult-profile dimensions and hard arm, leg and hip limits unchanged. After the
original solve, it softly prefers a 0.56 m arm extension when the pelvis has room
to move toward the same authored wrist. The preference fades continuously to
zero within 1 cm of the existing hard bounds and is analytically clipped against
those bounds. Root, sole targets, desired wrist and paddle face do not move.
The adapter records the exact module revision and SHA256 in its provenance.

An independent matched development review retained all 114 accepted selected-hand
contacts (maximum paddle-face difference 1.67e-16 m) and all 11 captured rejected
fixed deliveries with unchanged residual errors. Sixty accepted postures gained
elbow bend. This is a posture preference, not wider anatomy or a claim that the
bounded solver proves every possible human contact reachable or unreachable.

## Shared posture revision 3

Low Model-2 contacts can face the actual ball more directly rather than following
a distant outgoing target. A smooth preference applies to ordinary low-contact
families below 0.80 m, reaches full weight below 0.30 m, and fades near the root
and toward the rearward bearing seam. Serve, lob and overhead are excluded.
Both target and original posture keep the existing plus-or-minus 75-degree
court-facing turn limit. This is not a feasibility-triggered fallback or an
expanded arm, leg, hip or foot allowance.

The preference requires explicit Model 2 and finite contact height. Legacy,
missing-context and planar facing callers retain revision-2 behavior. The
renderer forwards the model version; the generation evaluator already requires
a stationary grounded Model-2 contact. Existing exactly-rear and close-contact
ambiguities remain outside this preference rather than being called globally
continuous. Tests cover the added blend boundaries and both handed/court mirrors.

Fixed contact witnesses preserve the exact source feet, hand and desired ball
contact. Three historical failed prefixes also remain uncertain under all three
route-certificate versions; the new engine must establish a real supported
return, retain all earlier random draws and independently pass public physics.
A bounded pose-search failure still cannot certify human impossibility.
