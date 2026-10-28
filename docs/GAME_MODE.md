# Pickleball Park Game Mode

These foundations follow the owner brief dated October 28, 2026. M0 adds
observation tools, compatibility fixtures and tests. M1 adds an opt-in model 2
compiler and shared physics path. Neither milestone adds a game, rally policy,
score engine or workspace.

The starting runtime is main `c0d70093eb2658e09ad23ce14f5a7acebfa0af52`
(PR23). PR22 already supplied the serving-convention adapter, library-capacity
recovery, startup fallback, artwork, phone Planner and copy fixes. They are
preserved. M0 adds no runtime files and needs no cache bump.

M1 starts from verified main `43e2a6819d80eded008c448f09256455783de3c3`
(M0, PR24). Model 1, all eight lessons and the existing smart-rally-v2/v3 paths
remain the default compatibility boundary. Existing documents are not migrated.

## M1: versioned physics and completed points

Model 2 requires both `modelVersion: 2` and
`physicsVersion: 'play-physics-v2'`. Its source and compiled Play retain these
versions through installation and timeline compilation. The new pure solver
owns flight geometry and interception; a later rally engine must call it instead
of maintaining a second approximation. See [the document additions](PLAY_DOCUMENT.md#model-2-source)
and [physics and terminal evidence](MODEL2_PHYSICS.md).

Incoming contact position, height and time come from that solved flight. Shot
quality and family select illustrative profiles; they cannot assign an unrelated
next-contact height. Terminal stages represent net interaction, landings, a
second bounce or a physical fault without inventing an opposing next contact.

A completed model 2 point carries a winner, reason, responsible/struck actors
where applicable, an existing recipe ID and geometric/time evidence. The
declaration must match independent physical/rule evidence. Expected faults keep
the full accepted point and playable ending with zero unexpected violations;
they do not use `intentionalFault` to bypass validation. Momentum from an earlier
volley retains its occurrence time and later observation time separately, so a
later foot contact does not incorrectly reorder the faulty acts.

M1 retains the existing compiler result interface and the single
`CoachingSession` clock. Both renderers and cue/chapter labels consume the same
terminal timeline. There is no Game Mode playback owner, new score state or
automatic next point in this milestone. Runtime modules belong in the bounded
runtime artifact and worker cache; M1 is a runtime release and advances the
static cache once, from `pickleboard-static-v39` to `pickleboard-static-v40`.
The six new runtime modules are `play-physics-v2.js`, `play-compiler-v2.js`,
`play-timeline-v2.js`, `play-outcome-v2.js`, `play-actors-v2.js` and
`terminal-cues.js`. Shared actor/foot sampling keeps logical motion, 3D
presentation and body collision evidence on the same geometry and clock.

M1 bypasses the legacy position suggestions and Auto Shading for model 2 points,
returning empty derived coverage and a warning when requested. That preserves
the feet, interceptions and outcome proof. The separate Coverage view remains
available; this boundary does not add new positioning policy.

## Baseline tool

Use Node 24 and the locked dependencies. This explicit corpus produces 84
observations: seeds 0 through 27 at each of 12, 30 and 60 requested hits.

```sh
node tools/rally-realism.mjs --seeds 0:27 --lengths 12,30,60 \
  --output release-results/game-mode-m0/baseline.json \
  --archive release-results/game-mode-m0/rallies.jsonl
```

Run the expensive generation once. The archive retains each generated source
document, exact seed/settings/version and original generation time. To inspect
the same documents with a collector change, use `--archive-input` and a new
output path; generation is not invoked. Existing outputs are rejected before
generation, and the final writes also refuse overwrites. A partial archive is
explicitly `INCOMPLETE`; missing or duplicated observations cannot masquerade
as a complete corpus.

Reports record the source SHA/state, collector and adapter file hashes, generator
version, exact seeds/settings, host/Node information, failures, denominators,
censoring, per-rally observations and timings. Timing includes cooperative
generation yields; compilation is measured separately. A local observational
pass is not evidence for a CI performance target.

The default adapter wraps the unchanged `smart-rally-v3` exact-hit generator.
`--adapter ./local-adapter.mjs --settings '{"lengthFeel":"natural"}'` accepts
another local adapter. Its default export supplies `name`, `version`,
`generate({ seed, settings, signal })`, `validate`, `compile` and `rules`.
Generation returns `{ document, outcome?, censored? }`. The compile/rules
functions must be the real versioned production paths, not fabricated timelines.
The runner does not repair documents and rejects source mutation.

## What is measured

Contact ordinals, families, actual heights, net crossings and player positions
come from accepted compiled contacts. Positions use the compiled logical
sampler at each contact; they are not renderer meshes or certified foot history.
The approach threshold is 12.5 ft from a player's own baseline, on its own half.
“Up” includes a player beyond that threshold, including a step into the kitchen.
It is a formation observation and says nothing about volley legality.

The report includes:

- Observed counts and first all-four-up contact, with fixed-count groups kept
  separate. Line-attainment observations end at censoring.
- Third-shot drives divided by drives+drops, third-shot lobs, and lobs divided
  by all accepted contacts. A rejected/truncated prefix never becomes a valid
  short rally in these denominators.
- Longest consecutive dink run, conditional on a rally reaching the line;
  split-team opportunities after the sixth contact; dinks while an opponent
  is not up; and measured contact-height/net-clearance distributions by family.
- A line-drive/below-net-height proxy, explicitly separate from tactical
  attackability. The net-clearance measurement uses the actual compiled net
  crossing and the 34-inch centre net, not a declared minimum clearance.
- Generation timing distributions, including a separate 12-hit cohort.

Legacy `ending: 'stop'` documents are right-censored observations. Requested
hit counts are **not natural rally lengths**. Natural length, point winners,
serve faults, third-shot success and early point-ending rates remain null when
the engine supplies no outcome evidence. A declared model 1 winner/fault is not
enough: a natural observation also needs matching terminal timeline evidence,
all contacts accepted, and no compiler/rule errors. Unknown block intent,
incoming quality, game-level Erne/around-the-post rates and other unrepresented
tactics stay null; empty cohorts stay null, never 0 or NaN. Explicit future
terminal/quality facts can populate supported metrics without inventing them
from family labels. The report retains every numerator and eligible denominator.

Section 13 calibration ranges are future tuning targets from the brief, not
hard constraints imposed on this legacy baseline. Modelled ranges need owner
calibration and a versioned measurement policy. Do not tune by silently changing
the definitions after a baseline has been captured.
`PASS` means the corpus and validation completed; calibration is explicitly
`NOT_EVALUATED`. It does not claim the legacy generator meets the future targets.

## Compatibility fixtures

`tools/game-mode-compatibility.mjs` captures all eight lessons and seven saved
document cases. The v2 and unmarked-service cases are explicitly synthetic;
their exact origins are in `tests/fixtures/game-mode/documents.json`. They
exercise supported compiler/service-convention paths without claiming historical
v2 generator output. Two v3 fixtures are unchanged generator outputs (seed 7,
7 and 99 hits). The real 99-hit fixture is reused by the browser capacity test.
The legacy encodings preserve coordinates and pins; fixture IDs/titles are
explicit, and their complete source documents are covered by the hashes.

Each case hashes the source, compiled Play, complete JSON timeline structure,
findings and coverage. A second hash covers ball/logical-player/actor samples
and the actual trajectory/preparation functions. Sampling includes segment
interiors and exact/contact/bounce/boundary times on both sides by 1 microsecond.
No numeric rounding is used. This catches function changes JSON would omit.

The approved baseline is `tests/fixtures/game-mode/compatibility.json`.
Capturing a different baseline is deliberate and refuses to overwrite it:

```sh
node tools/game-mode-compatibility.mjs --capture release-results/new-compatibility.json
```

Compare the new result with the approved fixture before any explicit compatibility
change. Never rewrite saved documents or replace hashes simply to make a test pass.

PR22's service, quota/conflict/capacity and startup tests remain authoritative.
M0 adds the missing browser case: 50 real 99-hit plays remain readable, a 51st
edited draft shows Manage/Export guidance without changing saved bytes, and deletion
restores saving. Its source fixture is reused; browsers do not regenerate 99 hits.

One scoped discrepancy is recorded for review: the original brief asked for an
8-second blocked-builder fallback, while PR22's accepted bounds are 12 seconds
for graphics entry and 15 seconds for the independent core guard. M0 preserves
that reviewed runtime under the current tools-only scope.

## Contracts for later milestones

These are design contracts, not implemented M0 features:

- Default setup: traditional side-out to 11, win by 2; Advanced 4.0; Natural;
  stacking off; teams keep fixed ends. Logical service slots are separate from
  tactical coordinates. Rulebook examples must be verified before scoring logic
  is implemented; rally-scoring options do not change this default.
- Game score/server state belongs to the game engine; rally decisions/outcomes
  belong to the rally engine; geometry/timing belongs to the compiler.
  `CoachingSession` remains the only clock. Game playback may hold/advance after
  a point; Builder and lessons retain their repeat behaviour.
- Separate versioned PRNG streams serve policy, execution, game sequencing and
  presentation/quiz choices. A camera or quiz cannot change a generated game.
  Recipes record versions and exact inputs. Long generation yields and cancels.
- Natural play uses one simulation. Bounded selection for requested length or
  winner must record attempts and explicit incompleteness; it must never invent
  a winning point or hide a failed bound.
- New game storage has separate versioned keys. Opening a game point in Builder
  copies it as a transient preview until edited/saved and preserves the parked
  Builder document, history, view and playhead.

Milestones remain ordered M0 through M8, one reviewed PR each. Preserve complete
required CI, the optimized partition/catalog gates and compatibility contracts.
Only runtime releases bump the static cache. Merge/deploy follows architectural
review and passing required checks; M3/M5/M6/M7 desktop/phone reviews and final
M8 owner signoff remain required. M2 rally policy and later engine/UI work are
not folded into the M0/M1 foundations.
