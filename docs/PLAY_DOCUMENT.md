# Pickleball Park play document and compiler

Status: schema version 1, trajectory model version 1. Rules reference checked 2026-09-07 against the [2026 USA Pickleball Official Rulebook PDF](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf), the [official rules page](https://usapickleball.org/rules/), and the [USA Pickleball Rules Summary](https://usapickleball.org/rules/summary/). The implemented standing-doubles subset follows serve position in 7.A, volley-serve requirements in 7.C, drop-serve requirements in 7.D, serve placement in 7.E, the opening two-bounce rule in 10.A, and non-volley-zone volley footing and momentum in 11.A. These references use the reorganized 2026 section numbers.

The sections below retain the model 1 contract and its defaults. M1 adds a
separate opt-in model 2 contract under the same schema version; see
[Model 2 source](#model-2-source) and [Model 2 physics](MODEL2_PHYSICS.md).
Opening, compiling or exporting an existing model 1 document does not migrate it.

## Separation of concerns

The play document is editable source intent. `compileDocument(document)` derives a production `play`, passes it to the existing `compilePlayTimeline`, and returns that deterministic timeline. Renderers sample the returned timeline; they do not own or advance separate copies. Camera choice, playhead, playback rate, selection, and other session state do not belong in this document. Animation frames are never persistence data.

The result shape is:

```js
{
  play,                 // existing Play/steps contract used by 2D and 3D
  timeline,             // compilePlayTimeline(play), with recipe-based event ids
  findings: [{ kind, severity, shotId, message }],
  validShotCount,       // playable prefix length
  coverage: []          // reserved derived assistance output
}
```

Coverage remains a separate derived heuristic. `recompileAssistedDocument(document, compiled, assistedPlay, coverage)` is the compiler-owned boundary for applying it: only derived player positions may change. It rejects ball, shot-semantic, target, or pinned-player changes; recompiles through the same timeline; restores recipe-based event IDs; and declines an unreachable assisted plan with a feasibility finding. Guide-only output can carry explanations without changing positions.

`kind` separates a demonstrable `rule` violation from `feasibility` in the bounded motion/flight model, `tactical` advice, and an `unsupported` case. The initial compiler generates the first two kinds. An incomplete or invalid document keeps its editable recipes and compiles the valid prefix. An explicitly intentional fault is compiled as a terminal shot with a visible warning; no continuation is invented.

## Version 1 source shape

```js
{
  schemaVersion: 1,
  modelVersion: 1,
  id: "local-id",
  title: "Named play",
  initialLayout: {
    player1: {x, y}, player2: {x, y},
    player3: {x, y}, player4: {x, y}, ball: {x, y}
  },
  players: {
    player1: {team: "green", handedness: "right"},
    // player2..player4 use green|orange and right|left
  },
  shots: [{
    id: "stable-recipe-id",
    family: "serve|return|drive|drop|dink|volley|reset|lob|overhead",
    hitter: "player1|player2|player3|player4",
    receiver: "auto|player1|player2|player3|player4",
    contactStyle: "auto|forehand|backhand|short-hop",
    target: {x, y},
    arc: "low|medium|high",
    pace: "soft|medium|firm",
    movement: {
      intent: "hold|advance|recover|manual",
      pinned: false,
      target: {x, y},       // required for manual
      waypoints: [{x, y}]   // optional, at most 8
    },
    serveMethod: "volley|drop" // serve only
  }],
  annotations: [],
  assistance: {autoShading: false, showGuides: false, team: "both|green|orange"},
  service: {server: "player1", receiver: "player3", court: "left|right", courtConvention: "server-perspective-v1"}, // optional
  opening: "serve|midrally",
  ending: "stop|winner|fault",
  intentionalFault: false
}
```

New explicit service courts use `server-perspective-v1`: facing the net, right/even is low X from the low-Y end and high X from the high-Y end. Unmarked older declarations retain their original service-box interpretation. The editor displays their physical side without rewriting source, coordinates, identities or pins. An explicit court edit adopts the current convention in one Undo step; opening, compiling and exporting an older play preserve its original declaration. Older clients may reject the new optional marker rather than interpret it incorrectly.

Court coordinates are feet in the established 20 by 44 board coordinate system. Initial athletes and the ball may use the supported 8-foot apron. Shot landing targets remain on court. Recipe IDs are unique, persist across reorder operations, and appear in derived event IDs independently of displayed shot numbers. The source limit is 99 shots and movement paths are limited to 8 waypoints per recipe.

Schema version 1 fixes `player1` and `player2` to Green and `player3` and `player4` to Orange. This keeps persisted identity aligned with the approved character artwork and both current renderers. Handedness remains independently editable. Team reassignment requires a later schema and renderer contract rather than silently displaying the wrong athlete.

`validateDocument` rejects unknown schema/model versions, missing structures, invalid enums, duplicate IDs, non-finite or out-of-range coordinates, oversized titles, more than 99 recipes or annotations, and annotations larger than 32,768 serialized characters. Annotations are inert JSON data. Import code must also impose a byte limit before parsing; storage/import owns that transport-level check.

## Targets, contacts, and movement

`target` is the intended landing location if nobody intercepts the ball. It remains copied into `shot.intendedTarget`. If the following recipe is a volley or overhead, the compiler derives an earlier legal-side contact and uses that point as the current production leg endpoint. A bounced response lands at the authored target and derives a nearby subsequent contact. Thus an intended landing marker is not automatically rendered as a bounce.

The compiler derives contact phase, illustrative contact height, net crossing, zero or one bounce, and incoming contact. Serve and return legs in a standard opening each bounce once. Volley feet are generated outside the non-volley zone. Generated movement is bounded and continuous between production steps. A pinned/manual target is copied to the derived step and is never changed in the source. The reserved `coverage` output lets assistance add derived positions later without changing shot targets or authoring locks.

Automatic forehand/backhand selection uses physical handedness and the contact's lateral offset from the actor's derived stance, with tactical facing determined by the athlete's court side. Camera direction has no role. Explicit forehand/backhand and short-hop choices remain explicit.

## Lesson copies

`documentFromTemplate(play)` converts every lesson shot to editable recipes. It also adds the optional `templateSource` extension:

```js
templateSource: {
  templateId,
  recipeSignatures,
  documentSignature, // layout/players/opening/ending/fault state
  play // embedded immutable-by-convention source snapshot
}
```

This is inspectable document data. Validation requires the ID, recipe signatures, document signature, and embedded play to exactly match one of the eight trusted built-in lessons; imported data cannot forge a compatibility snapshot or add runtime fields. While every recipe and compatibility-significant document field is unchanged, compilation returns the embedded approved steps exactly, preserving lesson timing, intermediate movement-only steps, contact metadata, and trajectory semantics. Changing a recipe, initial layout, player properties, opening, ending, or intentional-fault state leaves this compatibility path and genuinely recompiles all recipes from authoring intent. Annotations and Show Coverage Guides remain presentation data and preserve the exact lesson timeline. Auto Shading is applied afterward through the guarded coverage boundary, where it may change eligible player positions but cannot change ball flight. No lesson ID is secretly substituted.

Persisted template snapshots require the same size limit as imports. Future migrations that alter either schema or trajectory interpretation must increment the corresponding version and retain explicit migration behavior; they must not silently reinterpret older drafts.

## Model scope

Rule checks cover standard standing doubles facts represented in the document: diagonal serve placement, the serve and return bounce sequence, alternating teams and explicit receivers, cross-net targets, and generated volley footing. Entering the non-volley zone is not treated as a fault by itself. Intentional-fault demonstrations retain warnings and stop at the fault.

The trajectory model is an instructional approximation. Family, arc, and pace select bounded speeds, curve apexes, net clearances, and rebound heights. Player reach uses a bounded 14 feet/second planning heuristic with tolerance. A pinned post-contact position remains active until that athlete's next authored movement; a dependent contact that conflicts with it stops the playable prefix with a feasibility explanation. Model version 1 preserves optional authored waypoints and uses the final movement target for sampling; it emits an explicit `unsupported` warning whenever a waypoint path is present rather than silently ignoring that constraint. Declared winner and fault outcomes appear on the terminal step and in `play.outcome`. These are feasibility assumptions, not official rules, measured biomechanics, aerodynamics, ball-speed claims, tactical recommendations, or predictive coaching results. Detailed spin, stacking, scoring, tournament administration, specialist shots, and full officiating remain unsupported in model version 1.

A drop serve adds explicit `shot.servePreparation` metadata to the same production timeline. Model version 1 releases the ball from a fixed 3.5-foot hand height under 32.174 ft/s² gravity, records a `preparation-bounce` event at ground contact, and samples the rebound continuously up to paddle contact. This event is separate from `bounce`, so rally-rule counting still sees exactly one receiving-court bounce after the served ball crosses the net. The ordinary volley serve and all eight retained lessons carry no preparation metadata and keep their existing contact timing.

## Model 2 source

Model 2 is explicit: `schemaVersion: 1`, `modelVersion: 2` and
`physicsVersion: 'play-physics-v2'`. The version pair must survive compiled Play
creation, GuidedPlayEngine definition cloning and timeline compilation. Unknown
versions must fail validation rather than falling back to model 1. New drafts,
lesson copies and legacy smart-rally-v2/v3 documents retain model 1. Model 2
cannot embed a `templateSource` snapshot.

The shared source fields, four fixed player identities, 99-shot bound, movement
ownership and 8-foot apron remain. Model 2 additionally permits the following
shot fields; they do not create new animation clocks or renderer-owned source:

| Field | Source contract |
| --- | --- |
| `intent` | Optional validated tactical enum: serve, deep return, third-shot drop/drive, block, reset, cross-court/middle/straight/backhand dink, speed-up, counter, put-away, lob, overhead, Erne or around-the-post. Existing family names are also accepted where unambiguous. JSON uses the corresponding hyphenated names, such as `third-shot-drop` and `around-the-post`. |
| `quality` | Optional `low`, `neutral`, `attackable`, `excellent` or `error`. It can select a flight profile; it does not assign the next hitter's contact height. |
| `narration` | Optional `{ label, why }`, limited to 40 and 160 plain-text characters. Markup, controls and URLs are rejected. Compiled steps expose these as `label` and `description`. |
| `contactMode` | Optional `bounced` or `volley`; serves infer their own contact kind and reject an override. A volley cannot combine with `short-hop`. This makes a transition volley explicit without changing family identity. |
| `contactTiming` | Optional `{ afterBounceSeconds }`, finite from 0.001 through 1.5, for a bounced contact only. The incoming flight is sampled at that time. |
| `contactOverride` | Optional apron `{ x, y }` for `erne` or `around-the-post` intent only. It must agree with the incoming path; it is not permission to teleport the ball. |
| `physics` | Optional object with exactly one input: `apexFeet` (finite 0.2–30) or `launchVerticalFeetPerSecond` (finite −80–80). These are mutually exclusive; physical feasibility and collision checks still apply. |
| `contactEvidence` | Optional `{ feet: [point, point], feetEstablishedOutsideNVZ, momentum? }`. Feet are two apron points and the reset flag is boolean. Momentum is `{ afterContactSeconds, feet: [point, point], balanced: false }`, with an observation time from 0.001 through 5 seconds. This is a supported model window, not an official limit on momentum responsibility. |

Model 2 targets may use the supported apron to represent real terminal landings.
An off-court target in an ordinary continuing leg is still an unexpected
violation. Apron contact overrides are restricted to their applicable signature
shots. No unrelated extra field bypasses the model 2 validator.
An explicit model 2 service court requires `server-perspective-v1`; the unmarked
legacy interpretation remains confined to model 1. Model 2 outcome positions
use apron coordinates and a finite height from 0 through 30 ft. Their relative
evidence times are finite from 0 through 30 seconds.

Foot evidence describes two represented grounded points. An Erne approach may
pass through the kitchen before contact if both modeled feet re-establish
outside before the volley. The act of volleying begins at paddle contact; the
whole approach is not classified as that act. Contact foot faults and explicit
momentum evidence remain subject to the usual checks.

Conversely, `feetEstablishedOutsideNVZ: false` alone cannot prove a reset fault
when both represented feet are grounded outside. M1 does not represent the full
grounded/airborne history required for that conclusion. It retains the source
and reports `UNEXPECTED` `unsupported-reset-history`, rather than manufacturing
an expected `nvz-foot` outcome. No additional history fields are introduced.

### Completed point and evidence

A model 2 document with `ending: 'stop'` has no `outcome`. A completed point
requires an outcome and keeps `intentionalFault: false`:

```js
outcome: {
  winner: 'green',                 // green | orange
  type: 'winner',                   // winner | unforced-error | forced-error | fault
  reason: 'unreachable',            // see supported reasons below
  shotId: 'stable-recipe-id',
  ruleRef: '10.B.1',
  faultingActor: null,              // player ID, or null for a modelled unreachable winner
  // struckActor: 'player3',        // required for a body outcome
  evidence: {
    position: { x, y, heightFeet },
    afterContactSeconds: seconds    // relative to shotId's contact
  }
}
```

Supported reasons are `net`, `long`, `wide`, `unreachable`, `second-bounce`,
`body`, `nvz-foot`, `nvz-momentum` and `two-bounce`. An ordinary body outcome names
the struck player as `faultingActor` and `struckActor`. A serve striking the
server's partner instead names that partner as `struckActor` and the server as
`faultingActor` under rule 7.E.4. A serve striking either receiving player before
landing names the actual touched player as `struckActor` and the designated
receiver as `faultingActor` under rule 7.E.5. After a legal serve bounce, an
ordinary body contact instead faults the struck player under rule 10.C.3.
The schema checks the receiver identity and rule-specific exception; the shared
solver independently proves whether the contact occurred before landing.
Other fault actors must agree with the physical
and rule evidence; a label or a rule reference alone is not
proof. Declared position and time are compared with the independently solved
decision. They cannot force the flight to pass through a desired result.
M1 does not introduce a policy that infers the tactical forced/unforced-error
distinction from geometry. Its derived `outcome.type` is `winner` only for a
modelled unreachable result and `fault` for the other physical reasons. The
source enum retains `forced-error` and `unforced-error` for later policy; M1
does not certify those tactical claims.

`outcome.shotId` identifies an existing shot. It need not be the last recipe:
momentum from an earlier volley can decide the point after a later shot or dead
ball. The declaration remains relative to that shot's contact. The derived
outcome records the faulty act's `violationOccurrenceTime` separately from the
later `evidenceObservedTime`; see [terminal resolution](MODEL2_PHYSICS.md#terminal-resolution).
Momentum `afterContactSeconds` is the time when the supplied feet were observed.
It does not necessarily identify their first NVZ touch. Linear motion to an
endpoint inside the zone can cross its boundary earlier; proving a represented
anchor's first line touch at the observation time requires an endpoint on the
line and a checked approach. Rendered shoe polygons and their first edge contact
are outside that point-anchor claim.

`ending: 'winner'` means the last hitter's team wins; otherwise the completed
point uses `ending: 'fault'`. A body hit can therefore have `ending: 'winner'`
and derived `outcome.type: 'fault'`: the last hitter wins because the struck
opponent faults. Expected physical faults are completed point
results. They retain the full accepted shot count and terminal playback rather
than truncating a valid point or turning it into an intentional-fault warning.
An unmatched declaration remains an error finding with unexpected violations.
The compiler result keeps the existing `{ play, timeline, findings,
validShotCount, coverage }` interface.

M1's effective-compilation path preserves model 2 physical geometry instead of
running the legacy position suggestions or Auto Shading over it. It returns
empty derived `coverage` and an explicit warning if either assistance toggle is
requested. The independent Coverage view can still display sampled geometry;
it is not the position-suggestion feature. The source assistance fields are
preserved rather than silently rewritten.

### Model 1 compatibility boundary

Model 2 uses a separate solver and compiler path. It does not change model 1
flight functions, lesson timings, legacy document fields, smart-rally versions,
service markers or import/storage keys. The approved M0 fixture hashes and the
contact/bounce/boundary function samples remain the compatibility evidence; do
not replace them merely to pass a new model 2 test.
