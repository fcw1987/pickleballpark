# Model 2 physics and terminal evidence

Model 2 is an opt-in instructional model identified by
`modelVersion: 2` and `physicsVersion: 'play-physics-v2'` under schema version 1.
It has a separate solver, compiler, timeline and outcome-evidence path. Model 1
remains the default for existing documents, lesson copies and the legacy smart
generator versions. No migration, scoring engine, rally policy or Game Mode UI
is part of M1.

## Shared physical boundary

`play-physics-v2.js` is pure deterministic math: no DOM, randomness, global
playhead or clock. The compiler and a future generator share these entry points:

```js
solveFlightV2({
  from: { x, y, heightFeet }, target: { x, y },
  family, arc, pace, quality, physics
})

interceptFlightV2(flight, {
  kind, stance, contactOverride, afterBounceSeconds
})
```

Board inputs are feet. Timeline trajectories expose the existing world-space
meter sampling interface and retain board-space physical evidence. The sole
playback time is `CoachingSession.clock.elapsed`. Sampling a different time or
orbiting the camera does not re-simulate the point or alter an outcome.

The solved flight exposes `stages`, physical `events`, `firstLandingTime`,
`secondBounceTime`, `totalDuration`, obstruction/terminal evidence and metadata.
`sampleBoard(seconds)` returns board feet with `heightFeet`; `sample(seconds)`
returns world meters with `x`, `y`, `z`. Interception returns `{ time, point,
bounces }`, with time relative to the incoming contact and a board-space point.
The compiled shot's inert `physicsV2` specification reconstructs the same solver
after definition cloning; it is derived runtime data, not a persisted animation
function or an alternative editable document.

`play-actors-v2.js` supplies shared actor and individual foot positions to
logical sampling, 3D presentation and body collision analysis. Ordinary planned
routes use the segment's `originalDuration`, so an earlier dead ball does not
accelerate an actor's route to its planned endpoint. Momentum uses absolute
timeline time to interpolate from contact feet to observed feet and holds that
pose afterward, including across a later ball segment.
Model 2 presentation aligns its painted/source foot anchors to those sampled
points in both views. These are point anchors, not full shoe-ground collision
polygons. The alignment does not establish exact shoe-edge contact timing or
anatomical mesh/collision identity.

An incoming flight supplies a response's contact position, time and height. A
bounced contact samples the post-bounce path at its supported delay; a volley
intercepts the incoming path at the hitter's depth. Transition volleys are not
all moved to a fixed kitchen-line depth. A legal volley keeps its feet outside
the NVZ unless an explicitly represented NVZ fault is the point's result.
`contactOverride` applies only to Erne/around-the-post geometry in the supported
apron and must agree with the incoming trajectory. Quality labels are not a
substitute for these physical intersections.

The first recipe has no represented incoming path. Its contact uses the starting
ball position and a declared model assumption: 2.2 ft ordinarily, 7.5 ft for an
overhead, 0.8 ft for a short-hop, or the solved preparatory rebound for a drop
serve. These starting conditions do not turn a quality label into a later
contact-height override. Movement waypoints are retained with an unsupported
warning; M1 samples the final movement destination rather than claiming full
waypoint or foot-contact history.

## Units, geometry and calibration

The board is 20 by 44 feet, net plane `y = 22`, with an 8-foot supported apron.
The solver uses 32.174 ft/s² gravitational acceleration and the ball radius
derived from the existing court geometry constant. Collision checks concern the
ball surface, not just its center. The center tape is 34 inches high and the
sideline tape 36 inches; local tape height varies with lateral position. The
versioned sag interpolation is a model approximation. Net posts have inside
faces at `x = -1` and `x = 21`, with a modeled 3-inch diameter. Going through the
net/post gap is not an around-the-post shot.

The preserved reference-world art has stylized 0.09-meter-wide posts centered
11 feet either side of the court center. The solver instead uses official
22-foot inside spacing and 3-inch posts. Accepted ATP geometry conservatively
keeps the whole ball outside the physical post and also clears the stylized
art. Net gaps, post surfaces and rendered meshes do not have exact collision
identity; M1 does not change legacy world art to assert such an identity.

The tape interpolation is `34/12 + (2/12) * min(1, ((x - 10) / 10)²)` feet.
First-flight motion is a constant-gravity ballistic arc: an apex input and
contact height set vertical launch velocity, or an explicit signed
`launchVerticalFeetPerSecond` supplies it directly. Exactly one of those physics
inputs may be supplied. The same gravity equation derives time to ground;
target displacement over that time sets horizontal velocity. Rebound uses vertical restitution 0.68 and
horizontal velocity retention 0.72. Drag and spin forces are outside this
version. A future change to those semantics needs an explicit version and
compatibility decision rather than reinterpreting existing model 2 documents.

The owner brief's family ranges guide calibration. They are not independent
equalities imposed on every flight. Contact height, landing location, gravity,
interception time, chosen apex and net clearance must form one coherent flight.
An impossible combination must produce a finding rather than silently moving
the landing or contact to satisfy a table entry.

| Family | Illustrative clearance / apex / pace guidance |
| --- | --- |
| Serve / return | 12–30 inches above tape; 6–8 ft apex; roughly 22–40 mph pace |
| Drive | 6–16 inches; 3.5–5 ft; roughly 28–45 mph |
| Drop | 6–18 inches while descending; 5.5–7 ft apex before the net; 15–22 mph |
| Dink / reset | Roughly 2–10 inches; 3.4–4.5 ft; 8–16 mph |
| Attackable dink | 14–24 inches; 4.5–5.5 ft; 10–16 mph |
| Speed-up / counter | 2–12 inches; apex under 4.5 ft; 30–45 mph |
| Lob | 15–22 ft apex; 18–25 mph |
| Overhead | Downward from a 7–8.5 ft contact; 35–45 mph |

Pace guidance is approximate. **Launch speed** means the magnitude of velocity
at paddle contact. An average horizontal speed uses horizontal distance divided
by flight time; a path-average speed uses traveled three-dimensional distance
divided by elapsed time. These quantities are different, and neither an average
nor a family pace label may be presented as a measured launch speed. Contact
quality, ball restitution and profile tuning are instructional assumptions,
not measured biomechanics or validated predictions of a player's reach.

The current solver reports `launchSpeedMph`, `launchVerticalFeetPerSecond` and `horizontalAverageSpeedMph`;
the compatibility `metadata.speedMph` field is the launch-speed alias. The
horizontal average describes the initial ballistic flight before a collision;
it is not a whole-point or post-net-drop average. Family, arc, quality and pace
guide an ordinary default apex. Soft pace adds 0.35 ft and firm pace subtracts
0.2 ft from that default; the resulting coherent solution derives duration and
speed. An overhead defaults to downward vertical velocity of −12, −18 or −24
ft/s for soft, medium or firm pace. Its maximum flight height is at launch. An
explicit apex can instead author a lofted overhead. Pace does not impose a
second independent mph constraint. No three-dimensional path-average speed is
currently reported.

Model 2 drop-serve preparation passively falls from 3.5 ft under the same gravity
and rebounds with the same 0.68 vertical restitution. Paddle contact samples the
rebound 0.3 seconds after that preparatory bounce, about 1.684 ft high for the
current ball radius. The contact height is derived from this motion. The
preparation bounce is separate from the rally's required receiving-court bounce.
Model 1 retains its original preparation and contact assumptions.

## Terminal resolution

A terminal leg has explicit physical stages and no fabricated next hitter.
Events include ordinary `contact`, `net-crossing`, `bounce`, `end` and terminal
`net-touch`, `out`, `second-bounce`, `fault`, `dead`. `second-bounce` is distinct
from `bounce`, preserving the ordinary incoming-bounce count. Event times are
absolute timeline seconds; document outcome evidence is relative to the
referenced recipe's contact. Stable event IDs and deterministic ordering allow
the same scrubbed frame to show the same terminal cues in either renderer.

The outcome resolver compares declared reason, actor, position and time with
independent solved evidence. An out result needs an actual out landing; a net
failure needs the physical net interaction and failed return; a body result
needs the struck actor and contact geometry. A net touch is not itself a dead
ball. A modelled unreachable winner needs defender reach and available-time
evidence, followed by a real decisive stage such as the second bounce. Predicting
that a ball is unreachable does not itself create an official dead-ball event.

For ordinary faults, chronology selects the earliest decisive event. NVZ
momentum needs a separate pending record: `violationOccurrenceTime` refers to
the earlier volleying act, while `evidenceObservedTime` records the later zone
contact. `outcome.shotId` may therefore identify an earlier recipe. The playback
ending must include the relevant later observation even if the ball became dead
earlier. If that player instead recovers balance outside the NVZ, the pending
momentum claim is not a fault. The supported observation window is a model
input bound, not a rule that makes momentum legal after a fixed delay.

The momentum timestamp is an observation of the provided feet, rather than a
calculation of first zone entry. If an observed endpoint is inside the NVZ, the
shared linear foot path can touch the boundary before that observation. A claim
that observation coincides with a represented anchor's first line touch needs
continuity evidence: for example, an approach wholly outside the zone ending
exactly on the near `y = 15` or far `y = 29` line. It does not prove a whole shoe
polygon's first edge contact. Official precedence still belongs to the original
faulty volleying act. The model does not infer an unseen earlier foot history.

Expected terminal faults are accepted completed points. They keep all valid
contacts and their ending motion, with zero unexpected violations. A declared
label alone cannot suppress a physical/rule violation, and ordinary completed
points never use `intentionalFault` to bypass checks. Invalid evidence remains
an error finding. `compileDocumentV2` retains the existing result shape; model
selection remains explicit through `compilePlayTimeline` and GuidedPlayEngine.
Authoring and import use the validated public `compileDocument` boundary. The
versioned module's `previewDocumentV2` helper is for planning and fixture
construction; its derived preview is not evidence that a document has passed
the public compiler and rule checks.

`validateModel2Rules(play, timeline)` returns `{ valid, violations, warnings,
expectedFaults, outcome }`. Unexpected entries carry
`classification: 'UNEXPECTED'` and `expected: false`. A matched terminal entry
does not waive other findings: acceptance requires no unexpected violations and
no compiler error findings. The reach judgment records each defender's launch
position, available time and clearance under the shared 14 ft/s, 0.12-second
reaction, 3-foot paddle-reach model. Its conservative continuous bound treats an
ambiguous opportunity as reachable instead of declaring an unsupported ace.

## Rule references and supported scope

These references use the reorganized [2026 USA Pickleball Official Rulebook](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf).
Pages below are printed pages; add 5 for PDF page numbers.

| Geometry or fault | 2026 rule reference |
| --- | --- |
| Body contact; paddle/below-wrist hands touching the paddle exempt | 10.C.3, p23; serve contacts use 7.E.4–5, p18 |
| Lines in; serve touching NVZ line out | 8.B–E, p19 |
| Serve and return each bounce before the response | 10.A.1–2, p23 |
| Second bounce; out or own-side first landing | 10.B.1, 10.C.1–2, p23 |
| NVZ touching, momentum and both-feet reset | 11.A.1–3, p25 |
| Surface-only NVZ, including its boundary lines | 3.A.4.c, p7 |
| Ball touching net remains live; support, gap and under-net distinctions | 13.A–E, p27 |
| Around the post; player/ball plane and contact restrictions for Erne | 13.C, 13.F–I, pp27–28 |
| Post spacing/diameter and tape heights | 3.B.2, 3.B.6–7, p8 |

[Official Casebook Case 14-23, printed p15](https://usapickleball.org/docs/referee/usa-pickleball-referee-casebook-2026-r1.pdf#page=20)
clarifies that competing momentum faults are ordered by when the faulty
volleying acts started. The earlier act can prevail even when its zone contact
occurs later or after a dead ball; recovery without zone contact removes that
candidate fault. This is why a single earliest foot-contact timestamp is
insufficient.

Erne is a shot description, not an exception to NVZ, player/net contact or net
plane rules. A ball above the NVZ is not a foot contact with its surface. The
model represents declared feet and supported momentum evidence, not complete
equipment contact history or every balance state. Body detection uses a moving
torso proxy, not anatomical paddle/hand collision geometry. Erne validation uses
the shared grounded feet at contact. An approach through the kitchen before
the volley is permitted when both modeled feet re-establish outside before
contact; a blanket ban on that earlier approach would misstate rule 11.A.3.
M1 does not certify an airborne jump or full reset history from two-dimensional
foot points. If both represented feet are grounded outside, a false reset flag
alone produces `UNEXPECTED` `unsupported-reset-history`, preserves the source
and cannot become an expected fault. Camera changes project the same
model feet; a rendered sprite or viewing angle does not establish additional
foot-ground contact history or exact anatomical contact surfaces. Net malfunctions, officiating
replays, adaptive-player allowances and tournament administration require more
state and are outside this standing-doubles physics contract.
