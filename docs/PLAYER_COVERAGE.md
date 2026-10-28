# Player coverage view

Coverage is an optional, default-off view preference. The visible Coverage
button is beside the court controls. It is separate from Auto Shading and
Coverage Guides: it never changes a player route, authored position, manual
pin, saved document, import/export payload, or undo history.

Four translucent 116-degree sectors originate at the actual rendered players.
Each begins from world-space strategic facing and turns gently toward the
current ball. The outer edge fades, green has a solid perimeter, orange a
broken perimeter, and same-team intersections use fixed diagonal hatching.
The hatching means **shared space — call the ball**, not both players should
chase it. A short inner mark indicates the paddle-hand side; left-handedness
mirrors that mark without claiming a universal backhand disadvantage.

The floor guide stops at the net, has no camera-relative rotation, and has no
independent clock. Seek, pause, playback and orbit all use the existing sample.
Court markings are masked out. The depth-tested floor sits below visible
athletes and the ball, with an additional clear area around the ball's ground
position. One plane and one shader draw all four sectors and both overlaps.
There are no coverage textures, offscreen render passes, or per-frame GPU
allocations. The retained Canvas2D planner draws equivalent sectors before
court lines and actors.

## Meaning and evidence

These layers have different responsibilities:

| Layer | What it means |
| --- | --- |
| Rules engine | Actual represented rules, correct receiver and bounce/NVZ constraints. This view does not decide them. |
| Tactical provider | Strategic facing, receiver/preparation state and partner priorities. These remain read-only inputs. |
| Physical reach model | Would require time to interception, pace, height, movement and individual capability. This view does not claim to be that model. |
| Coverage visualization | A pedagogical action sector and shared space. Neither the 116-degree angle nor nine-foot radius is a measured capability or a guarantee. |

USA Pickleball's [doubles strategy guidance](https://usapickleball.org/pickleball-skills/level-three/pickleball-doubles-strategy-tips/)
supports coordinated positioning and communication over middle balls. Its
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
`coverageFacing`, when provided, bypasses the visual ball-facing blend. This
allows the engine to own the final ball-aware direction. Legality and priority
are retained as separate metadata; sector membership never assigns a receiver.

Before provider integration the adapter reads the already-rendered positions,
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
The parent integration should increment the worker cache version once for the
combined runtime release; this isolated track does not independently bump it.

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
