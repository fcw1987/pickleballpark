# Headless rally engine

M2 adds `rally-engine-v1` beside model 1 and `smart-rally-v2/v3`, using M1's
shared physics and terminal evidence. It adds no Game UI, scoring, new Builder
workspace, highlight presentation or replacement of Random Rally/Smart Add.
Calibration and CI performance qualification remain pending evidence. The
implementation described here does not imply that acceptance gates passed.

## API and normalized input

```js
import { simulateRally, createRallySimulator } from './rally-engine.js';

const result = await simulateRally({
  seed: 7,
  // Optional players, layout and service can come from a future game engine.
  options: {
    lengthFeel: 'natural', winner: 'either', signatureShots: true, maxShots: 99
  },
  signal,
  onProgress(progress) { /* observational only */ }
});
```

The seed is an explicit uint32. Default players are Advanced 4.0, right-handed
and balanced in the fixed Green/Orange identities. Supplied maps contain all
four team/handedness/style records; optional flavour defaults to `balanced`.
Styles are `pro`, `advanced`, `intermediate`, `beginner`; flavours are `balanced`,
`bangers`, `kitchen-masters`, `lobbers`. Skill and flavour are separate settings.

Service names the server, designated receiver and left/right court with
`server-perspective-v1`. Missing service defaults to player1 serving right to
player3. Roles are not inferred from nearest positions. Missing layout uses a
deterministic role/court/handedness-aware setup; supplied layouts have five finite
board-space points in the supported apron and are not silently relocated.

Only the four displayed options are accepted. `maxShots` is 1–99; Short means
3–6 contacts, Long 12–20, Epic at least 25. Winner is `either`, `green` or
`orange`. Unknown settings and malformed inputs reject before work, even when
the signal is already aborted. The full strict origin shape is documented in
[Play documents](PLAY_DOCUMENT.md#m2-engine-provenance).

`createRallySimulator({ yieldControl, workChunk })` exposes the same input API
with an injected scheduler for tests/controlled hosts. Default chunks contain
eight work units and use a real MessageChannel macroturn, with a timer fallback.
Scheduler choices do not supply random values or change successful output.

## Result states and limits

Results contain `status`, `document`, `outcome`, `decisions`, `stats`, `recipe`,
`diagnostics` and separate `outcomeClassification` analysis.

| Status | Meaning |
| --- | --- |
| `complete` | Every represented contact passes final independent validation and the physical ending matches the source and `rules.expectedOutcomes`. |
| `censored` | The shot cap is reached with a valid `ending: 'stop'` prefix and no point winner. |
| `unsatisfied` | Bounded attempts found no requested length/winner; no document is selected. |
| `cancelled` | Cancellation was acknowledged before a successful result left the request. |
| `failed` | Search, invariant or independent-validation failure with reproducible diagnostics and no selected document. |

Natural/either gets one simulation. Conditioned length/winner selection gets at
most 64 versioned deterministic seeds. An invalid candidate stops search rather
than being discarded for a later convenient result. No secret error reduction,
forced winner or invented ending makes a selection succeed at the shot limit.
Each finite intent list permits eight target repairs per intent. The driver
bounds each attempt to 65,536 work units and the whole request to 64 times that
count. Work/rejection counts are deterministic; timing is measured outside the
engine.

Frozen progress is `{ phase, attempt, attemptIndex, attemptSeed, shots, work }`.
Phases are `attempt`, `retry`, `search`, `validating`; attempt is one-based and
attemptIndex zero-based. Observer exceptions do not change seeded choices.
Cancellation is checked around work yields and final synchronous validation,
including before returning a selected result. No cancelled request emits late
progress or installs a point.

## Origin and decision records

A selected result's recipe equals `document.generation`. It records engine,
policy and physics versions, normalized original settings, seed and selection.
No-document request records instead have `selection: null`, deliberately invalid
as persisted document provenance. Styles live in the input recipe, while saved
players retain team/handedness. Per-shot provenance identifies the selected seed;
ownership names supported fields actually present. Import/open/save never
regenerates from this origin or overwrites subsequent edits. Existing source and
storage bounds remain unchanged.

Request-local `rally-random-v1` streams separate intent, target, execution and
narration. Stable candidate ordering, sub-seed derivation and numerical precision
are versioned. Generated geometry/evidence uses nine decimal places; exact unit
draws and original normalized inputs remain intact. M1 sampling stays at full
precision; existing documents are not rounded or migrated.

Pre-choice situation, feasible candidates, normalized weights and exclusions
are separate from execution draws and resolution. Future prediction UI can read
the former without leaking the answer. Detailed traces remain returned/archive
analysis, outside saved documents. Narration is bounded inert text; excitement
is an explicit heuristic with no authority over weights, geometry or winners.

M1 physical outcomes retain `winner`/`fault` semantics. Separate
`rally-causation-v1` analysis may classify `winner`, `forced-error`,
`unforced-error`, `rule-fault` or `unknown`, with shot/actor identity, a preceding
pressure decision and bounded heuristic facts. A quality roll alone cannot prove
forced causation. This classification cannot replace physical ending evidence.

## Physical planning and browser lifetime

`play-planning-v2.js` shares contact/stance/leg construction with the compiler.
One pending leg is resolved against the next actual interception and actor
routes before commit. Trials may replace that bounded tail; they do not rebuild
the finalized prefix or introduce another flight approximation.

The engine enumerates actual incoming contacts and eligible players, respecting
designated receiver and opening-bounce rules. Its corrected M2 ranker considers
reach, lanes, partner spacing and handedness without changing legacy selection.
Forehand preference cannot override role or better reach. Incoming geometry
supplies contact height. A baseline drive needs an achievable fast flight; a
kitchen speed-up also needs the ball lower surface above the local tape.
Grounded contacts are capped at 8.5 feet. Ordinary volley timing can identify
an actual pre-bounce contact over the NVZ while both feet remain outside it;
the legacy implicit contact plane is unchanged when that timing is absent.
Execution perturbs supported physical inputs. An error ends the point only when
the solved geometry supplies it. Let-go is defensive choice, not a paddle hit.

`rally-targets.js` resolves regions/launch inputs through the shared solver and
its inverse clearance helper. Speed, apex and clearance are not independent
constraints. Pair movement goals yield to actual time and complementary lanes.
Fresh contacts carry explicit grounded feet/reset state. Continuous sampled
actor/foot peak speed is at most 18 ft/s and partner spacing at least 2.5 ft;
M1 tolerance is not extra generation travel. Full shoe/equipment collision,
airborne and balance history remain outside the model. Signature permission
allows only supported grounded geometry when an actual opportunity exists; it
does not promise a frequency.

Final source independently crosses public document/compiler/rule validation and
exact generated movement/spacing checks. Every represented contact must be
accepted with zero unexpected violations. A successful planning trial alone
cannot bypass this gate.

Browser callers use `simulateRallyInWorker` from `rally-engine-client.js`. Each
request owns one module worker running the same engine as Node. The client may
terminate it during synchronous final validation, releases listeners/resources
at settlement and ignores late messages. Worker/client never install a point or
mutate Builder, history or storage. `CoachingSession` remains the only playback
clock. The complete worker dependency graph must be cached and packaged before
release, with fresh-offline and M1-upgrade checks in both browsers.

## Observation and pending qualification

M0's `rally-realism-v1` archive policy is unchanged. `rally-realism-v2` observes
accepted production contact positions/heights, source/compiled authoring intent,
and lower-ball-surface clearance above local tape. Incoming affordance is not a
previous execution-quality label.

A known outcome requires all contacts accepted, zero compiler errors, valid
rules and matching `expectedOutcomes` with terminal evidence. Its shot ID need
not be the final contact. Earlier-volley momentum retains occurrence,
evidence-observed and physical dead times, and faulting/struck actors separately.

Archives retain all statuses, recipes, attempts, available decisions and
diagnostics, including no-document failures. Corpus completeness, physical
validity and calibration are distinct verdicts. Missing/censored/failed results
and insufficient conditional samples remain visible; a physical-validity PASS
cannot imply calibration passed.

Homogeneous Pro, Advanced and Intermediate Natural/either cohorts use development
seeds 0–59 and disjoint frozen qualification seeds 1000–1299, balanced by serving
team/court. Beginner/flavour cohorts have correctness and directional checks, not
invented numerical bands. Per-game Erne/ATP rates stay `N/A` until games exist.
Natural and conditioned costs are separate. The 12-contact performance target
includes search, yields and final validation; warmed compiler-only probes do
not satisfy it.

The source-compatible fifth-shot cohort covers all opportunities after a
third-shot drive, with the blocked-drive subset separately reported. The PPA's
66% drop / 31% firm-volley figures are not limited to fourth-shot blocks.
Qualification needs the applicable original bands, sufficient samples, physical
gates and measured CI performance. Pending evidence must remain visibly pending;
targets are not silently changed to obtain a passing report.
