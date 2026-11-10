# Player coverage view

Coverage is an optional, default-off view preference. The visible Coverage
button is beside the court controls. It is separate from Auto Shading and
Coverage Guides: it never changes a player route, authored position, manual
pin, saved document, import/export payload, or undo history.

Four translucent 116-degree sectors originate at the actual rendered players.
Each tracks the ball with a maximum 28-degree turn from the net-facing axis
on its physical court half. Together with the 58-degree half-width, that keeps
the entire fan in front, even when a provider faces sideways or rearward.
These are **incoming defensive coverage** cones, not outgoing shot-aim arrows.
When exactly two teammates occupy the same physical half and the ball is across
the net, the desired direction mixes 75% of the player's normalized ball-aware
bearing with 25% of the normalized pair-midpoint-to-ball bearing. This small
common shift illustrates coordinating with a partner. The 25% weight is a
visual design choice, not a measured coaching rule. It fades in over 1.5 feet
beyond the net and over 1.5 feet of lateral partner separation, keeping net
crossings and partner crossings continuous. The existing contact ease and
28-degree clamp are applied afterward. Solo, cross-net and ambiguous groups
retain individual tracking; ball targets, player positions and rules never change.
Teammates have stable rose and blue colours; their overlap mixes to violet
in linear light, independent of draw order. The outer edge fades, green jerseys
have a solid perimeter, orange jerseys a broken perimeter, and same-team
intersections retain fixed diagonal hatching as a non-colour cue.
The hatching means **shared space — call the ball**, not both players should
chase it. A short inner mark indicates the paddle-hand side; left-handedness
mirrors that mark without claiming a universal backhand disadvantage.
The brighter mark follows physical court directions: for a right-hander facing
+y toward the orange end, their own right is -x; it reverses at the other end.
The Guide also describes which current left/right player's forehand or backhand
side faces the middle. Left/right is viewed facing the net, derived from actual
positions rather than player IDs or camera axes. It follows crossings, end
changes and handedness changes; aligned partners receive no left/right label.
This is a factual hand-side cue and never assigns the middle ball to a player.

The floor guide stops at the net, has no camera-relative rotation, and has no
independent clock. Seek, pause, playback and orbit all use the existing sample.
Court markings are masked out. The depth-tested floor sits below visible
athletes and the ball, with an additional clear area around the ball's ground
position. One plane and one shader draw all four sectors and both overlaps.
There are no coverage textures, offscreen render passes, or per-frame GPU
allocations. The retained Canvas2D planner caches a small quarter-foot pixel field with
the same palette and weighted mixing, then draws its sectors before court lines
and actors. The cache is reused until sector geometry or metadata changes.

## Meaning and evidence

These layers have different responsibilities:

| Layer | What it means |
| --- | --- |
| Rules engine | Actual represented rules, correct receiver and bounce/NVZ constraints. This view does not decide them. |
| Tactical provider | Strategic facing, receiver/preparation state and partner priorities. These remain read-only inputs. |
| Physical reach model | Would require time to interception, pace, height, movement and individual capability. This view does not claim to be that model. |
| Coverage visualization | A pedagogical action sector and shared space. Neither the 116-degree angle nor nine-foot radius is a measured capability or a guarantee. |

USA Pickleball's [doubles strategy guidance](https://usapickleball.org/pickleball-skills/level-three/pickleball-doubles-strategy-tips/)
supports coordinated positioning, closing gaps and communication over middle
balls. Better Pickleball's [discussion of forehand ownership and respecting the X](https://betterpickleball.com/forehand-takes-the-middle-or-do-you-respect-the-x/)
explains why ball angle and partner position can make the crosscourt player
better placed for the middle, and why crossing simply to use a forehand can
leave gaps. Neither principle establishes a universal owner: communicate and
consider time, position and the incoming path. The Guide deliberately avoids
"forehand always takes the middle" or a computed winner/shot destination. USA Pickleball's
[rules summary](https://usapickleball.org/rules/summary/) separates the initial
two-bounce requirement from the NVZ volley restriction. Both were checked for
this implementation. They do not establish a universal sector angle or reach
distance. The angle, distance, falloff and bounded visual turn are explicitly
design parameters. In particular, a shaded NVZ location does not grant
permission to volley while standing in the NVZ.

## Read-only provider seam

`player-coverage-snapshot.js` exports:

```js
readCoverageSnapshot({ board, timeSeconds, ball, samples, segment })
```

`ball` and the presentation `samples` in the input context are the existing
renderer samples in world metres. The output contract uses canonical court
feet: x is 0–20 across the court, y is 0–44 from the green baseline toward the
orange baseline. Output facing is a unit vector in those world/court axes,
never the sprite's camera-facing atlas direction.

An engine integration can set `board.coverageSnapshotProvider(context)` to
return the following snapshot, without changing the drawing modules:

```js
{
  version: 1,
  timeSeconds: 2.5, // deterministic shared playhead
  phase: 'flight', // provider-owned semantic string
  ball: { x: 10, y: 22, heightFeet: 3 },
  players: [{
    id: 'player1',
    team: 'green', // green | orange
    position: { x: 5, y: 14 },
    facing: { x: 0, y: 1 },
    handedness: 'right', // right | left
    coverageFacing: { x: 0.2, y: 0.98 }, // optional, already ball-aware
    legalReceiver: null, // optional; no legal decision is inferred
    coveragePriority: null // optional; no priority is inferred
  }],
  legalReceiverId: null,
  coveragePriorities: []
}
```

There are at most four unique player IDs. `version`, finite sample time, ball
and player coordinates, team and handedness are validated. Missing/invalid
provider output, unknown versions and provider exceptions hide coverage for
that sample and do not interrupt the app. Provider facts are not mutated.
`coverageFacing`, when provided, supplies the desired ball-aware direction.
The view still applies its net-facing limit and a short contact-distance ease;
it gently coordinates with the normalized pair bearing in the case described
above, and never uses provider facing as an unrestricted visual direction. Legality and priority
are retained as separate metadata; sector membership never assigns a receiver.

The builder installs `createRallyCoverageProvider` with a live getter for its
current document and the board's installed play/timeline. Actual rendered actor
samples override token positions. This follows imports, edits, Undo and reloads
without retaining a stale source, and bounds the engine's desired ball-aware facing
without modifying the tactical snapshot. Leaving the builder returns no tactical snapshot
for the unrelated planner state; returning resumes the current builder source.

When no provider is installed, the adapter reads already-rendered positions,
world body facing, handedness and ball, with receiver/priority left unknown.
It does not duplicate tactical phase or receiver-selection algorithms.

## Integration ownership

New runtime modules: `player-coverage.js`, `player-coverage-snapshot.js`,
`player-coverage-overlay.js`, `player-coverage-canvas.js`,
`player-coverage-ui.js`, `player-coverage.css`.

Narrow hooks: `three-d-playback.js` creates/disposes the layer, retains the four
already-created actor samples, updates the layer at the shared playhead, and
requests one render when the preference changes. `pixel-court-renderer.js`
draws the floor before the court lines. `builder-ui.js` mounts the control.
`index.html`, `sw.js` and `tools/runtime-files.json` register the new assets.
No startup/view lifecycle scheduling or hidden-renderer logic is changed.

The local key is `pickleboard-player-coverage-v1` with `on` / `off` values.
Denied or full storage leaves a working session preference. This key is not
part of the authored-play schema. All new modules are cached for offline use.
The standalone coverage track did not increment the worker cache separately.
The combined coverage/rally/efficiency branch uses v37 once, from base v36.

## Verification and review

Focused tests cover immutable deterministic sampling, finite contract inputs,
world-space ball facing, a continuous rear-ball transition, same-team overlap,
handedness, provider failure, persistence denial, unchanged authored data,
one additional draw call, stable resource counts, idempotent disposal,
phone/landscape layouts, themes, and an actual server-stopped offline reload.

Capture the real app with:

```sh
PORT=4191 npm start
PREVIEW_URL=http://127.0.0.1:4191 node tools/capture-player-coverage.mjs
```

`release-results/player-coverage/` contains desktop and phone stills, actual
playback/orbit WebM recordings, and `evidence.json`. The capture verifies the
authored document is unchanged, checks page errors and horizontal overflow,
and compares real framebuffer pixels at court-marking, player and ball probes
with coverage off/on. Screenshots and clips are ignored build evidence, not
publication assets. Full combined-branch Quality checks remain an integration
gate, independent of this track's focused results.

## Coverage colour and facing revision

The colour/facing revision advances the source cache from v41 to v42. It does
not change the snapshot v1 contract, player routes, team assignments, actor
facing, legal receivers, or saved play data. That drawing model was version 2.

The subsequent ball/partner-context revision uses drawing model version 3,
with the same 116-degree / nine-foot / 28-degree limits and snapshot v1 seam.
It uses more saturated rose `#ff3f7d`, blue `#3a9fff` and equal linear-light
violet `#bf7bcc`; base field opacity is 0.70 with a 0.88 cap in both renderers.
Court-line masks, the clear ball-ground area, identity colours and fixed shared
hatching remain. Context text updates only when its factual description changes,
without retaining remounted controls or adding a clock. The combined runtime
release owns the single cache increment.

On phones, a compact shared-ball legend fits beside the toggle and Guide without
growing the dock. The Guide's opaque paper and transparent inner scroll area are
separate: an opaque `overflow:auto` panel inside `details` caused Chromium to
incorrectly occlude a paused WebGL frame, despite correct framebuffer pixels.
Regression tests compare actual page screenshots to the canvas through On/Off
and Guide open/close, and verify bounded keyboard scrolling and Escape dismissal.
