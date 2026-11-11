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
Fresh generation tries unchanged v1 first, then v2, then the separate v3
refinement below. No version rescues a mere failed bounded search without a
complete exclusion proof.

The v3 theorem covers the same route class and retains exactly the same speed,
acceleration, reaction and paddle-reach limits. It refines only the conservative
between-sample uncertainty. Starting with 32 intervals per affine stage, it
evaluates each endpoint and midpoint and subtracts the Lipschitz constant times
the outward-rounded cover radius. An uncertain interval is bisected to at most
12 levels, within 8,192 interval evaluations per actor. Every accepted leaf must
have a strictly positive conservative lower bound. A potentially reachable
sample, exhausted budget, unsupported geometry or nonfinite arithmetic fails
closed. Sample absence alone is never an ending proof.

Relative affine displacements and conservative floating-point guards prevent
large world-coordinate cancellation from fabricating a positive gap. The
certificate records exact refinement work counters as well as the bound, and
public compilation recomputes all of them from the declared version. Eight
immutable source witnesses, their mirrored cases, a hidden between-node contact,
resource-limit negatives and large-coordinate adversarial cases independently
exercise the implementation. Historical v1 and v2 source bytes remain unchanged.

## Timing-derived contact plants

The eight-candidate stance budget retains the nearest-origin emergency plant,
a comfortable 1.8-foot contact plant and a behind-ball option. When the full
comfortable move cannot fit the actual route time, a bounded monotone search
also reserves the smallest intermediate extension whose travel fits the same
speed/acceleration budget. This avoids mistaking a coarse radius grid for an
exhaustive search. Every such candidate still passes legal feet, exact route,
spacing, necessary reach and selected-hand trainer-pose admission. No player
speed, body reach or random execution draw is changed to make it succeed.

## Explicit neutral foot state for new generation

New Model-2 engine documents carry the exact optional source object
`defaultFootState: { version: 'generated-ready-stance-v1' }`. It selects a
0.72 ft half stance, or 43.8912 cm between foot centers, close to the shared
adult rig's 44 cm shoulder breadth. The same width is used for new explicit
contact feet and every otherwise unspecified off-ball stance. Batch and
incremental compilation retain the marker, so becoming the hitter, next hitter
or supporting partner cannot cause an instantaneous width change.

Documents without the marker retain the original 0.42 ft half stance exactly.
Explicit authored contact feet and momentum feet always take precedence,
including deliberately narrow or staggered stances. The marker is not inferred
from old generation metadata, and it is not a universal rule that every real
stroke uses the same stance. Unknown versions, extra numeric knobs and use on
Model 1 are rejected rather than silently interpreted.

New contact search uses the actual wider feet for side-NVZ and apron clearance.
A declared serve layout is never shifted to make its feet legal. After the
independent strict movement audit, the final driver also checks actual feet at
every represented phase endpoint against the existing apron. This catches an
off-ball partner's unsupported initial or later foot position, not only the
striker's contact. Continuous affine/eased phase geometry makes the endpoint
checks sufficient; an unsafe source is rejected without clamping it.

## Bounded contact-time refinement

Ordinary contact planes, fixed bounce delays and reach-critical times remain the
first search pass. If no supported contact remains, or all its nominal intent
choices fail before any execution draw, a second bounded pass proposes the
64 interior midpoint times of each actual live flight/bounce phase. Each pass
emits at most four physically checked opportunities. Existing peak speed,
acceleration, foot legality, spacing, reply flight and selected-hand pose checks
apply unchanged. All work stays inside the existing attempt budget and yields
through its ordinary cancellation checkpoints.

A committed contact closes the proposal generator. A failed delivered execution
ends the attempt immediately. Neither can trigger this refinement to obtain a
new quality or error draw. Failed refinement is still only a search failure,
not proof that a ball is unreachable. The exact five historical failure inputs
in `generated-time-refinement-witnesses-v1.json` require a newly represented
reply, unchanged earlier draws and exactly two actual execution RNG calls per
committed contact. Two still require time refinement. Three now find their
supported non-attacking drive in the ordinary first pass after the independent
drive-affordance correction; the tests do not force an unnecessary second pass
just to reproduce an obsolete diagnostic.
