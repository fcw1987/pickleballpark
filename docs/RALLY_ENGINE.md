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
designated receiver and opening-bounce rules. Bounded continuous reach critical
times supplement fixed interception probes; every proposed contact still needs
actual solver, feet, collision, peak-speed and spacing acceptance. At a fixed
contact opportunity the corrected M2 actor ranker considers reach, lanes and
handedness. Across feasible opportunities it compares supported contact height,
forward progress, recovery and available physical replies. Uninspected proposals
are labelled as search bounds, never accepted audits. Forehand preference cannot
override role or better reach, and a volley has no automatic priority. Incoming geometry
supplies contact height. A baseline drive needs an achievable fast flight; a
kitchen speed-up also needs the ball lower surface above the local tape.
Grounded contacts are capped at 8.5 feet. Ordinary volley timing can identify
an actual pre-bounce contact over the NVZ while both feet remain outside it;
the legacy implicit contact plane is unchanged when that timing is absent.
Execution perturbs supported physical inputs. An error ends the point only when
the solved geometry supplies it. Let-go is defensive choice, not a paddle hit.

Each ordinary contact has at most eight grounded stance candidates. The nearest
existing pose remains available, alongside bounded lateral and rear alternatives
that preserve hand, paddle reach and NVZ constraints. All candidates contribute
to the opportunity search bound; accepted stances still pass the actual incoming
route, collision, peak-speed and spacing checks. Nominal replies use planned
routes for all four players and the unchanged shared body sweep against the
hitter and partner. The selected jittered nominal target receives the same
check before execution. Non-error delivery is checked again after perturbation;
sampled errors retain genuine body faults. Existing saved faults are never
exempted or rewritten. Decision analysis records the selected nominal flight
and actor-route evidence separately from execution and its outcome.
The current candidate contact also passes the shared contact-rule checks before
commit. An interception accepted by the solver's numerical bound must still
satisfy the stricter rule guard before the second bounce; neither tolerance is
relaxed and a rejected proposal may yield to an earlier legal opportunity.

`resolveDeliveredFlightV1` measures the solved speed, clearance and landing after
execution. A non-error speed-up or counter above 45 mph tries ten explicit
increases in coherent clearance while retaining the executed landing target;
each is a fresh shared-solver solution. If no supported option fits, the ordinary
bounded target/opportunity search records the rejection. Reported velocity is
never clamped. All other section-7 family ranges remain explicit diagnostic
guidance, and sampled error geometry remains visible even when outside those
ranges. Speed, apex, clearance and landing cannot all be independent equalities.

The fifth-shot 66/31 drop/firm-volley row remains the marginal source reference.
An explicit air-contact conditional row uses 58/40, with the remainder divided
between drive and lob; bounced opportunities never acquire a volley label.
Decision records name the conditional prior. Calibration still measures every
fifth opportunity after a third-shot drive, with no denominator substitution.

Pressure records actual incoming contact velocity, retaining launch speed as a
separate fact. Formation load is a bounded heuristic based on represented teams,
without a serving-team bonus. Execution quality changes supported placement,
clearance and depth through the same solver. Feet/body targets track represented
defenders. A poor soft execution may create a higher reply; the following contact
height remains a physical observation. Settled neutral soft exchanges have a
separate execution-risk context only when feet, reach margin, time, movement,
formation and incoming-speed evidence all qualify. Attacks and scrambling retain
the ordinary context. These are versioned tactical hypotheses requiring measured
calibration, not claims of empirical causation.

`rally-targets.js` resolves regions/launch inputs through the shared solver and
its inverse clearance helper. Speed, apex and clearance are not independent
constraints. Pair movement goals yield to actual time and complementary lanes.
One request-local pending plan retains the unbounded tactical destinations until
the real next-contact time is known. A later bounced contact can extend movement;
an earlier contact shortens it. The arriving hitter keeps the exact chosen feet.
Unbounded goals never enter saved source. An attackable or error-quality soft
shot does not automatically bring the serving pair forward.
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

Interim pending-event inspection retains the full represented physical span,
including body collisions after the first bounce, while deferring unnecessary
second-bounce reach classification. Final outcome inspection still performs that
classification. Selected-actor nominal body inspection calls the same swept body
solver on owned, unchanged trial data; final public validation checks every actor
independently. Sample reuse stays inside one synchronous movement inspection,
and ordinary sampler results retain exact values, freezing and error behavior.

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
seeds 0–59. The preserved 900-point qualification archive at source `9493af3`
is physically valid but failed calibration; its seeds 1000–1299 are now examined
regression data. A new immutable holdout reserves 1200 seeds per style,
50000–51199, balanced by serving team/court. Its first run requires a frozen,
reviewed candidate. Do not tune with it, extend it after results, or describe
examined results as unseen. See [measurement workflow](../tools/rally-realism-v2.md).
Beginner/flavour cohorts have correctness and directional checks, not
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
