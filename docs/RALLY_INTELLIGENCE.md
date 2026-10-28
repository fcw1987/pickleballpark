# Rally intelligence

This change addresses a reproducible seven-hit Random Rally failure: at base
`170b4ed6a45d8b9cca335fedbfd0d1760ac6a95d`, seed `2` served to `(5, 33)` and chose
`player4` to return it. `player3` was the intended designated receiver. Nearest
distance was being used to assign a service role whose identity was absent from
the rule checks.

## Facts and authoring

`rally-state.js` owns per-rally service identity and opening contact eligibility.
New starter/generated documents have an additive optional `service` object:

```json
{"server":"player1","receiver":"player3","court":"right"}
```

`court` means right/even or left/odd from the server's perspective. It is optional
for older documents. `correctPositionsAtScoreCall` may also be declared, but this
application does not award points or officiate a correction. This is a four-player
doubles demonstration model, not a singles or match scoring/service-rotation
engine. A user declares the correct roles from the actual game state; the app
does not infer missing score history from where players stand.

The first serve's Hitter/Receiver controls explicitly update declared roles in the
same Undo transaction. Serving court is editable in the existing Players section.
These edits never rewrite the later return hitter, manual movement, or pins.
Inconsistencies produce actionable findings and retain the authored source.

Legacy files remain valid schema version 1. An explicit serve-recipe receiver or
a trusted lesson can establish the role without a migration. If neither exists,
the compiler reports unknown service context, preserves existing authored
playback, and refuses to invent an opening through Smart Add. Import/export and
storage keep the source data. Midrally demonstrations do not invent an omitted
serve/return. Existing `smart-rally-v2` recovery and frozen legacy contact/motion
fixtures remain unchanged. Newly generated shots use `smart-rally-v3`.

## Rules, heuristics, and evidence

Sources reviewed 2026-10-28. The 2026 rulebook renumbered these sections.

| Concern | Classification | Implementation and limit |
| --- | --- | --- |
| Designated server/receiver | Rule, USAP §§5.B–5.C | Identity is declared independently of position. Wrong-receiver correction is reported without inventing a score result. The score-call context controls fault versus replay. |
| Serve and return bounce | Rule, §§10.A–10.B | Timeline bounce events determine the first two responses. A drop-serve preparation bounce is a separate event. |
| Serving area and landing | Rule, §§7.A,7.E,8.B–8.C | Declared court controls the diagonal target. Grounded stance determines serving-foot checks; ball contact can reach across an extension. Service court lines are in except the NVZ line. |
| NVZ volley and momentum | Rule, §§11.A–11.A.3 | Validate declared feet, momentum, and explicit foot-reestablishment facts. A bounced kitchen contact and kitchen airspace are permitted. |
| Intended next hitter after serve | Authoring continuity | Both opponents remain legally eligible. An explicit recipe receiver constrains generated continuation; a mismatch is a continuity finding, not a sporting fault. |
| Reach and flight | Physical approximation | Candidate ranking uses 14 ft/s, 0.12 s reaction and 3 ft paddle reach. Final generated actor routes must pass the existing 18 ft/s peak bound. These are product thresholds, not player measurements. |
| Pair spacing and recovery | Tactical heuristic | Assign partner lanes together, preserve small-poach home roles, switch after a substantial crossover, protect pinned space, and bound recovery by elapsed flight time. A 2.5 ft clearance is a model safeguard. |
| Approach and third shot | Tactical heuristic | Wait for the return bounce; approach behind suitable returns/soft shots. Third-shot defaults favor drives/drops/lobs. Stop movement at the next contact window. No universal “follow the X” rule is enforced. |
| Short hop | Physical/pedagogical approximation | The model uses at most 0.35 s since bounce and 1.5 ft height. Findings are labeled feasibility; a missing incoming leg in a midrally example cannot prove its bounce timing. |
| Coverage cones and facing | Pedagogical visualization | A read-only snapshot exposes tracking intent and responsibilities. Cone geometry cannot create a rule, choose an illegal returner, or move an authored player. |

Rules sources: [2026 USA Pickleball Official Rulebook](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf)
and [2026 Referee Casebook, revision May 22](https://usapickleball.org/docs/referee/usa-pickleball-referee-casebook-2026-r1.pdf).
Casebook 8-23 explains grounded foot reestablishment; 14-23 illustrates momentum
after a dead ball. The model has no full sole/clothing/paddle-ground/contact or
balance-recovery history. A manual volley followed by NVZ entry therefore gets
an uncertainty warning; it is not silently certified by a generated `false` flag.

Coaching sources:

- [USA Pickleball positioning](https://usapickleball.org/pickleball-skills/level-two/pickleball-basics-positioning-tips/): linked movement, angles, and contextual partner spacing.
- [USA Pickleball return guidance](https://usapickleball.org/blog-category/pickleball-basic-terms/): a deep return buys approach time; prepare when the opponent strikes.
- [USA Pickleball planned/opportunistic poaching](https://usapickleball.org/pickleball-skills/level-four/pickleball-poaching-planned-vs-opportunistic-strategy/): recover after small incursions, coordinate switches for deeper crossings.
- [PrimeTime forehand preparation](https://primetimepickleball.com/5-forehand-problems/) and [contact tracking](https://primetimepickleball.com/how-to-hit-perfect-pickleball-shots-in-7-simple-steps/): tracking, shoulder turn, and paddle aim are distinct. Snapshot facing must not override an active stroke pose.

These defaults are explainable approximations. They do not guarantee optimal play
against every opponent, formation, ball, or physical ability. The existing
trajectory model remains illustrative, with no spin/aerodynamic calibration.

## Renderer contract

```js
import { createTacticalSnapshot } from './rally-tactics.js';
const snapshot = createTacticalSnapshot({
  play, timeline, elapsed, players: document.players,
  positions: sampledActorPositionsInBoardFeet // optional
});
```

Input is read-only; output is deeply frozen. `elapsed` is seconds on the existing
shared clock. Board coordinates are feet: `x=0..20`, `y=0..44`, net `y=22`, green
on the near end. Height is `heightFeet`. When overlays sit on rendered actors,
pass their sampled current positions converted to board feet. Otherwise the
snapshot samples canonical timeline positions. Neither the camera nor the
overlay owns a second clock or motion path.

The stable version-1 snapshot exposes:

- `time`, `shotId`, `phase` (`serve`, `return`, `third-shot`, `open-rally`, `complete`). Phase describes the upcoming contact responsibility, so outgoing serve flight is `return`.
- `ball: {x,y,heightFeet,phase}`.
- `players[id]: {id,team,handedness,position:{x,y},facing:{x,y},trackingTarget,responsibility,eligible,coveragePriority,reach,reasons}`. Facing is a normalized horizontal tracking-intent vector. Responsibilities are `designated-returner`, `primary`, `support`, `recover`, or `complete`.
- `service: {known,source,server,receiver,servingTeam,court,correctPositionsAtScoreCall}`; unknown facts are null.
- `designatedReceiver`: service identity; `legalReceiver`: exclusive returner only during serve reception; `authoredReceiver`: the represented next contact actor, separate from legality.
- `eligibleHitters`: role-eligible players; `mustBounceBeforeContact`: changes only on the required timeline bounce. After the opening, authored responsibility does not make another teammate ineligible.
- `coordinateSystem:'board-feet'`, regulation `court`, and an explanatory string.

Preparation ranks the current contact using its remaining preparation time,
rather than asking a server to reach the distant return contact. Terminal
snapshots have no outstanding receiver/bounce requirement. Reach/priority are
illustrative guidance and never override explicit authoring or service identity.

## Verification and integration

Focused tests are `tests/rally-intelligence.unit.mjs`,
`tests/rally-tactics.unit.mjs`, and `tests/rally-intelligence.spec.mjs`.
They cover the seven-hit seed-2 reproduction, bounded seeds, both opening
bounces, closer stacked partners, legal centerline crossings, either third-shot
hitter, service-line/foot boundaries, NVZ reset/momentum metadata, unknown legacy
roles, imports, Undo, shared replay events, shading, and deterministic snapshots.
Existing long-rally and frozen legacy compatibility tests remain required.

Runtime registration consists only of adding `rally-state.js` and
`rally-tactics.js` to `sw.js` and `tools/runtime-files.json`, and updating the
package-test generator expectation to v3. It is a separate integration commit.
The release owner must increment the static-cache version once for the combined
runtime release and rerun the exact merged commit's required Quality checks.
No merge, deployment, access change, or historical baseline update is part of
this branch.
