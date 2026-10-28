# Model 2 physical fixtures

These 17 cases use hand-authored geometry from `scenarios.mjs`. Their expected
reasons were specified before solving. Each JSON file records the shared solver's
terminal point and contact-relative time, and must pass ordinary document
validation and compilation without an unexpected violation. The fixtures contain
no random rally policy or historical user data.

`cases.mjs` exports `readModel2Fixture(id)` for Node tests and package verification.
The package harness passes that JSON into the app; test files are never shipped
in the runtime artifact. `factories.mjs` provides small document builders for
schema tests. The negative counterpart of every physical case changes a measured
input or declared point, actor, time or rule reference, while keeping
`intentionalFault` false.

The cases cover stopping net contact, long and wide landings, second bounce,
swept torso contact, both serve/body exceptions, NVZ foot and momentum faults,
both opening bounce faults, a transition volley, a variable bounced contact,
Erne, low around-the-post geometry and a conservative unreachable judgment.

The two momentum fixtures put the declared foot points on the exact NVZ line at
the evidence timestamp. Those point samples remain outside the zone before it;
this does not certify the first contact by an entire painted shoe or foot
polygon. Forward and reverse scrubbing must show the same actor and foot-point
anchors in Canvas2D and 3D. The longer
case proves that an earlier faulty volley can override an opposing later fault
even though the momentum evidence is observed after the ball becomes dead.
For general documents, an inside-zone foot observation is evidence at its
recorded time and does not claim to identify the first instant of entry.

Physical classification is separate from the final hitter's result: all these
rule faults use outcome type `fault`; `unreachable` uses `winner` and includes
reach/time evidence in the compiled result. A completed point's `ending` still
reflects whether the final hitter's team won. Torso fixtures establish represented
torso geometry; a label cannot establish an unrepresented paddle-hand exception.
