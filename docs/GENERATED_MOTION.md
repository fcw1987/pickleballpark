# Generated movement policy

New rally-engine routes use the versioned `GENERATION_MOTION_V1` policy in
`generated-motion-limits.js`: peak speed 18 ft/s and acceleration magnitude
30 ft/s² (9.144 m/s²). These are selected coaching-generation bounds, not measured
universal human maxima. They do not change authored `MOVEMENT_V2` acceptance,
saved source, historical samples, or the existing broad v1 route certificate.

For the shared rest-to-rest quadratic ease, travel distance D over T seconds
has peak speed 2D/T and acceleration magnitude 4D/T². The permitted endpoint
distance is therefore `min(peak*T/2, 30*T*T/4)`. The pure
`generationDistanceBudgetV1(seconds, peakFeetPerSecond = 18)` accepts finite
nonnegative time and a speed in [0,18]. A zero duration or speed permits no
travel. Invalid inputs reject rather than silently widening the policy.

The same budget applies to generated contact arrivals, post-contact recovery and
off-ball support. A striking actor's recovery starts after its actual contact
hold, not at the flight's start. Exact selected arrival feet cannot be clamped
to fabricate contact. An infeasible arrival must be rejected so the bounded
search can try another actual incoming-ball time or stance.

The shared movement inspector remains speed-only by default for historical
inspection compatibility. Generation explicitly supplies
`maxAccelerationFeetPerSecondSquared: 30` in engine route checks, signature
candidate checks, and the independent final driver audit. With that option,
the inspector checks the actual sampled root and both foot tracks. Actor-specific
phase boundaries and full-duration analytic derivatives avoid cancellation on
tiny dead-clipped intervals. The derivative model is checked against actual
sampler positions, then acceleration and velocity continuity are bounded.
A constant-speed momentum piece can pass a within-piece acceleration check but
still fail an instantaneous velocity change. A clipped terminal route is judged
only over the time actually represented, using its original movement duration.

Successful enabled audits report `maxAccelerationFeetPerSecondSquared` and
`boundAccelerationFeetPerSecondSquared`; a producer's own success claim is not
a substitute for the driver recomputing these from serialized source.

The existing broad v1 route certificate (`9t + 3 ft` outer reach) stays unchanged.
It can still soundly exclude contacts, but does not prove reachability under the
stricter generation policy. If bounded search finds no feasible contact and no
valid exclusion certificate, generation reports failure. It must not invent a
winner, a second-bounce proof, or a more favorable random draw.

## Acceleration-bounded ending evidence

The separate v2 certificate covers a narrower, explicitly named route class:
full rest-to-rest eased routes ending at interception. Its necessary endpoint
ball reach is `min(9*t, 7.5*t*t) + 3` feet. A finite affine flight-stage path is
sampled with a conservative between-sample margin using the stage's horizontal
speed plus an 18 ft/s global allowance slope. Both actors, every contiguous
represented stage, preparation lead-in and the exact time interval must be
covered by a positive margin. Unsupported momentum, stage gaps, malformed
geometry or a possible contact make the certificate fail closed.

This is not universal human unreachability. A valid certificate only establishes
that no route in the selected generated class can reach that actual ball. The
terminal event remains the independently solved second-bounce rule fault. The
public validator recomputes the exact declared certificate version from source;
it cannot trust producer evidence or silently substitute a different version.
Fresh generation tries unchanged v1 first, then v2. Neither version rescues a
mere failed bounded search without a complete exclusion proof.

## Timing-derived contact plants

The eight-candidate stance budget retains the nearest-origin emergency plant,
a comfortable 1.8-foot contact plant and a behind-ball option. When the full
comfortable move cannot fit the actual route time, a bounded monotone search
also reserves the smallest intermediate extension whose travel fits the same
speed/acceleration budget. This avoids mistaking a coarse radius grid for an
exhaustive search. Every such candidate still passes legal feet, exact route,
spacing, necessary reach and selected-hand trainer-pose admission. No player
speed, body reach or random execution draw is changed to make it succeed.
