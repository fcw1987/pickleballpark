# Pickleball Park play document and compiler

Status: schema version 1, trajectory model version 1. Rules reference checked 2026-09-07 against the [2026 USA Pickleball Official Rulebook PDF](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf), the [official rules page](https://usapickleball.org/rules/), and the [USA Pickleball Rules Summary](https://usapickleball.org/rules/summary/). The implemented standing-doubles subset follows serve position in 7.A, volley-serve requirements in 7.C, drop-serve requirements in 7.D, serve placement in 7.E, the opening two-bounce rule in 10.A, and non-volley-zone volley footing and momentum in 11.A. These references use the reorganized 2026 section numbers.

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
  opening: "serve|midrally",
  ending: "stop|winner|fault",
  intentionalFault: false
}
```

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
