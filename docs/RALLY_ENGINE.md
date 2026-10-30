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
policy, flight-planner and physics versions, normalized original settings, seed and selection.
New generation uses `rally-policy-v3` with `rally-flight-planner-v2`. Policy v3
identifies the dink-only popup depth/loft transformation; it does not change
intent or execution probabilities. Sampled quality, a witnessed legal attacking
opportunity, the chosen reply and the eventual outcome remain separate facts.
The dink retains its NVZ landing, 20 mph ceiling and applicable 6.5 ft apex
ceiling. Drop/reset mappings are unchanged.
Older `rally-policy-v1` origins retain their exact shape without a planner marker.
Policy-v2 origins retain either their planner-v1 or planner-v2 marker and their
historical generation envelope; policy v3 requires planner v2. Opening, importing
and saving any of them never upgrades or regenerates their shots.
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

Generation owns its planning state behind opaque session and probe handles.
Incoming probes resolve the existing flight and actor routes without building an
unrelated outgoing flight. Nominal probes use the same contact, segment and body
kernels without public trial histories or a committable next-state graph. A
constructible delivery receives its actual event inspection before an atomic
source/state append. The independent public compiler still rebuilds the selected
source and validates every represented contact.

Private reuse requires the owning session, revision, incoming/prior flight and
exact contact/movement dependencies. Changed dependencies are inspected again;
forged, foreign and stale handles reject. Returned observations are detached and
immutable. Cached flight views expose only safe samplers with fresh frozen
numeric results. A reentrant input access that changes the session revision
rejects the outer operation before it can cache stale data or append state.
Public authored-planning results keep their existing mutability and exact source
proof guards. No caller flag can declare a geometry result trusted.

The engine enumerates actual incoming contacts and eligible players, respecting
designated receiver and opening-bounce rules. Bounded continuous reach critical
times supplement fixed interception probes; every proposed contact still needs
actual solver, feet, collision, peak-speed and spacing acceptance. At a fixed
contact opportunity the corrected M2 actor ranker considers reach, lanes and
handedness. Across feasible opportunities it compares supported contact height,
improvement toward the grounded 14.25-foot ready line, actual-foot NVZ reset
cost, recovery and available physical replies. Advancing beyond that line earns
no extra progress. For equivalent supported contacts/replies, a clear outside-NVZ
plant is preferred; necessary legal bounced-ball entries remain available. The
same preference orders optimistic bounds and final audited candidates. Uninspected proposals
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
actual deliveries retain genuine body faults regardless of the quality label. Existing saved faults are never
exempted or rewritten. Decision analysis records the selected nominal flight
and actor-route evidence separately from execution and its outcome.
The current candidate contact also passes the shared contact-rule checks before
commit. An interception accepted by the solver's numerical bound must still
satisfy the stricter rule guard before the second bounce; neither tolerance is
relaxed and a rejected proposal may yield to an earlier legal opportunity.

`rally-flight-planner-v2` is shared by nominal targets, reply probes, execution,
delivered admission and grounded signatures. It derives a finite time interval
from the actual contact, landing and a modeled speed ceiling, intersects signed
launch/apex/route bounds, then tries at most six deterministic preferred/boundary
times through the unchanged `solveFlightV2`. It replaces the cascading clearance
searches. Clearance, speed and apex are measured together rather than imposed as
independent equalities. Around-post flights retain the same post geometry.
Support probes and pre-choice catalog checks rank the same bounded candidates
through the shared authoritative launch calculation, then fully materialize only
the preferred flight. Other timings are marked unmaterialized, never audited
successes. Diagnostics distinguish launch evaluations, full materializations and
combined work; both kinds count toward cooperative work limits. Selected target
and delivery construction retain their bounded alternatives and independent
physical checks. No cached planner flight bypasses compiler construction.

Generation ceilings are modeling defaults, not human limits or rules: serve 40,
return 36, drive 45 Pro / 38 other styles, dink 20, reset 24, drop 26, lob 28, and firm
volleys/fast attacks/overheads 45 mph. Errors allow at most the smaller of 50 mph
and 1.25 times the family ceiling. Preferred Section 7 ranges remain diagnostics;
departures stay visible. A meaningful non-error lob has a high apex and an
ordinary overhead stays downward. Non-error family shape ceilings are the
actual contact height or one foot above the preferred upper apex, whichever is
higher: ordinary dinks 5.2, attackable dinks 6.5, drives 6, drops 8, resets and
ordinary volleys 5.5, serves/returns 9 and lobs 23 feet. These version-2 generation
guards preserve older planner-v1 origins and explicit saved replay. A sampled
lob error can hit the mesh without being forced into an ideal high arc. No generation restriction is retroactive
validation of an existing saved point.

A chosen nominal target, solved flight and friendly route are established before
execution quality/error is drawn. At most eight targets are considered per intent;
a second supported target within the same intended region may improve preferred
speed. Once sampled, quality, error and perturbation draws stay fixed. The first
constructible delivered timing is inspected once for actual physical events; a
genuine fault is adjudicated regardless of the quality label, without searching
later timings to avoid it. Nominal lanes must clear the mesh; delivered admission
permits a supported mesh hit under the same quality-specific speed and shape
bounds, without granting an error allowance or relabeling neutral execution. An unequivocal own-side body hit finishes through the
shared terminal path; a projected later opponent body hit cannot preempt an
earlier legal paddle interception. Unsupported construction returns `unsupported-execution`
with preserved evidence and no selected point, never a new quality roll or a
fabricated winner. Net/long/wide targets and signed launch are solved jointly;
actual earlier net/body/out events remain authoritative. Soft popups carry within
the short landing region instead of silently becoming deep drives. The
`rally-dink-popup-v1` mapping uses the fixed depth draw for a 15.05–15.30 ft
baseline depth and a 6.4 ft apex preference, raised to the actual contact height
when necessary. These are jointly solved preferences under the existing family
bounds, not independent speed/clearance equations. Its delivery analysis leaves
receiver opportunity `unestablished`: only normal contact search and the actual
eligible actor's route, feet and supported attacking flight can establish one.
A valid popup without a legal attack remains a valid shot. Drop/reset retain
their earlier mapping. Incoming reply height still comes from the solved
trajectory, not the quality label.

The final public compiler consumes the serialized nine-decimal source. A separate
`rally-generated-flight-feasibility-v2` audit measures actual stage velocity,
apex, signed launch and ground time for every family, including errors. It does
not trust a planner acceptance flag and leaves old playback/import equations
unchanged. Fresh output needs this audit as well as existing source, rules,
movement, spacing and terminal checks. Immutable planner analysis nodes are quantized once
per synchronous evidence observation; mutable planning/source copies keep their
existing behavior. The driver detaches returned analysis from committed source.

The fifth-shot 66/31 drop/firm-volley row remains the marginal source reference.
An explicit air-contact conditional row uses 58/40, with the remainder divided
between drive and lob; bounced opportunities never acquire a volley label.
Decision records name the conditional prior. Calibration still measures every
fifth opportunity after a third-shot drive, with no denominator substitution.
The fourth-shot 85-percent soft response applies to a genuinely low, non-attackable
drop. A supported attacking contact uses the existing high-ball policy and actual
defender targets; a quality label alone cannot establish that opportunity.

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

`rally-targets.js` resolves regions and launch inputs through the shared bounded
planner and authoritative solver. Speed, apex and clearance are not independent
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
