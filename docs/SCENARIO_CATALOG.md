# Beta domain scenario catalog

Status: model version 1 QA baseline, 2026-09-13. The executable fixtures are in `tests/fixtures/qa-scenarios.mjs`; their assertions are in `tests/qa-domain.unit.mjs`. This catalog describes only behavior represented by `play-document.js`, `play-compiler.js`, `rally-rules.js`, `coverage-assistance.js`, and the canonical sampler in `three-d-core.js`.

The model is an instructional approximation. “Legal” below means the documented standing-doubles subset: diagonal serve placement, opening serve/return bounces, alternating teams and explicit receiver responsibility, cross-net targets, and generated volley footing/momentum. The rules basis was rechecked on 2026-09-13 against the [USA Pickleball official rules page](https://usapickleball.org/rules/) and its [basic how-to-play guide](https://usapickleball.org/pickleball-skills/level-one/how-to-play-pickleball/). This catalog does not claim full sport compliance, scoring, specialist/adaptive behavior, or tournament administration. Reach uses the product's bounded planning heuristic. Strategy names describe authored demonstrations, not predictive coaching or measured biomechanics.

## Authored fixtures

Every row declares the source intent, derived contact and bounce contract, responsible hitter, terminal meaning, and a visible fact that a renderer can present from the compiled model. `G` is groundstroke, `V` volley, `S` serve, and `SH` short-hop. Bounce lists are per outgoing rally leg.

| Fixture | Authored intent | Contacts / bounces | Responsibility | Terminal | Model-visible checks |
|---|---|---|---|---|---|
| `deep-serve-return` | Deep diagonal serve; deep return | S,G / 1,1 | player1, player3 | stop after return | Intended targets and contact/bounce events |
| `short-serve-return` | Short but legal serve and return | S,G / 1,1 | player1, player3 | stop after return | Serve lands beyond the far kitchen line; both bounce markers exist |
| `third-drop-fifth-drop` | Third-shot drop, fourth drive, fifth-shot drop | S,G,G,G,G / 1,1,1,1,1 | player1/player3 alternate | stop after fifth | Soft/high third and fifth; stable recipe IDs |
| `third-drive-fifth-drop` | Third-shot drive followed by fifth-shot drop | S,G,G,G,G / 1,1,1,1,1 | player1/player3 alternate | stop after fifth | Firm/low third contrasts with soft/high fifth |
| `drive-block-reset` | Drive, volley used as a block, short-hop reset, volley reset | G,V,SH,V / 0,1,0,1 | player1/player3 alternate | stop after reset | Early interception, block artwork mapping, 0.8-foot short-hop contact |
| `straight-dink` | Straight kitchen dink | G / 1 | player1 | stop | Contact and y=28 kitchen target share x=4 |
| `cross-dink` | Crosscourt kitchen dink | G / 1 | player1 | stop | Target crosses from x=4 to x=16 at y=28 |
| `middle-dink` | Kitchen dink through the middle | G / 1 | player1 | stop | Target is (10,28) |
| `dink-speedup` | Kitchen dink then a firm drive used as a speedup | G,G / 1,1 | player1, player3 | stop | Bounced kitchen contact, pace/arc contrast; speedup remains authored family `drive` |
| `lob-overhead` | Lob intercepted by overhead | G,V / 0,1 | player1, player3 | stop | High arc; lob keeps y=40 intended target while ending at early y=29.6 contact |
| `transition-one-up-one-back` | Transition drop with partner already at the kitchen | G / 1 | player1 | stop | Hitter advances y=8→12 while partner holds y=14 |
| `manual-pin-shading` | Pinned manual dink plus automatic coverage | G,G / 1,1 | player1, player3 | stop | Pin stays at (4,14); coverage guidance is derived separately |
| `shading-off-guides-off` | Authored positions only | G / 1 | player1 | stop | No coverage records or movement |
| `shading-off-guides-on` | Guide-only coverage | G / 1 | player1 | stop | Suggested Coverage records exist; positions are byte-equivalent |
| `shading-on-guides-off` | Automatic shading without guide display | G / 1 | player1 | stop | Eligible partner moves laterally; document intent stays fixed |
| `shading-on-guides-on` | Automatic shading with guide display | G / 1 | player1 | stop | Same derived movement plus guide data |
| `right-handed-auto-contact` | Auto contact side, right-handed player | G / 1 | player1 | stop | Derived stroke side is forehand |
| `left-handed-auto-contact` | Same stance and ball, left-handed player | G / 1 | player1 | stop | Derived stroke side is backhand |
| `wide-target` | Wide dink target | G / 1 | player1 | stop | Intended target x=1 remains immutable |
| `center-target` | Center target | G / 1 | player1 | stop | Intended target x=10 remains immutable |
| `bounced-response` | Ground response after a kitchen bounce | G,G / 1,1 | player1, player3 | stop | Incoming leg lands at y=28 intent; next contact is generated 0.75 feet beyond it |
| `long-mixed` | 30-shot mixed supported-family exchange | Per executable fixture / per next contact | player1/player3 alternate | stop after shot 30 | Bounded event stream, stable IDs, deterministic seek |
| `infeasible-pin` | Contact conflicts with an active pin | G,G / 1,1 compiled prefix | player1, player3 | preview blocked until corrected | Feasibility finding identifies shot 3; compiler retains two valid shots, while the builder keeps the whole draft paused and editable |
| `intentional-rule-warning` | Deliberate terminal serve fault | S / 1 | player1 | declared fault after shot 1 | Rule warning remains visible; no continuation is invented |
| `declared-winner` | Explicit winner outcome | G / 1 | player1 | declared winner after shot 1 | Winner label and outcome point to the final recipe ID |

The fixture assertions also verify that compilation leaves source targets, manual destinations, pins, and handedness unchanged; that every accepted step preserves `shot.intendedTarget`; and that event IDs remain unique and recipe-based.

## Generated program

Run `node tools/qa-generated.mjs` for the standalone bounded corpus or `node --test tests/qa-domain.unit.mjs` for the complete executable contract.

The valid sequence generator uses the fixed seeds `12648430` (`0x00c0ffee`), `20260145` (`0x01352531`), and `1592598566` (`0x5eed2026`) at lengths 1, 3, 8, 30, and 64. It alternates teams, keeps targets cross-net, bounds contact travel, and draws only from the eight families usable in a declared mid-rally state: return, drive, drop, dink, volley, reset, lob, and overhead. A reset may use the supported short-hop contact style after an incoming leg. Serve variants remain in the authored opening fixtures because their validity depends on diagonal service position and the two-bounce opening.

The second valid schedule exhausts all 72 combinations of those eight families × three arc choices × three pace choices. This gives complete pair coverage for family/arc, family/pace, and arc/pace; auto/forehand/backhand contact styles rotate deterministically through the schedule. Dedicated authored fixtures cover short-hop and handedness-dependent auto contact.

The invalid generator produces nine deterministic cases:

| Class | Cases | Expected boundary |
|---|---|---|
| Structural validation | duplicate recipe ID; off-court target | `validateDocument` throws |
| Rule | consecutive same-team contact; explicit receiver mismatch; same-side target; late serve; full-rally opening without serve; volley return before the opening bounce | playable prefix plus `rule/error` finding |
| Physical feasibility | pinned athlete cannot reach a later contact | playable prefix plus `feasibility/error` finding |

The shrinker finds the shortest failing prefix without rewriting shots. The recorded same-team example shrinks reproducibly from 8 shots to 2 and reports the six removed recipe IDs.

Current standalone totals are 87 valid documents (15 length/seed documents plus 72 authoring combinations), 390 accepted shots, and 9 invalid documents. The runner compiles every valid document twice, validates the supported rules, and samples every event immediately before, at, and after its timestamp. That is 4,386 boundary samples. Each sample is finite and above ground, repeated seeks are deeply equal, `samplePlayState().ball` equals `samplePlayBall()`, and board x/y agrees with world x/z through the canonical feet-to-meters projection. The unit suite adds continuity checks around the same generated event boundaries and verifies movement against the compiler's 14 ft/s plus 3-foot reach envelope.

## Supported mappings and future gaps

Model version 1 has no authored `block` family. A block is represented as a soft volley or reset; the sampler maps volley/reset strokes to block artwork where supported. It also has no `speedup` family or attackability model. The closest expressible intent is a firm drive or volley in a kitchen exchange. Tests assert these mappings so the catalog does not imply specialist semantics that the document cannot store.

Future model work, kept outside this beta contract:

- Distinct block and speedup families with their own ball, contact, and paddle semantics.
- Erne/ATP, poach, switch, stacking, scoring, selectable spin, measured biomechanics, and predictive tactics.
- Intermediate movement path planning. Version 1 preserves waypoints, emits an unsupported warning, and samples only the final destination.
- Outcomes inferred from simulated physics. Winner and fault are explicit authored declarations.
- Full officiating beyond the documented standing-doubles subset.

## Stabilization defect covered

`BETA-002` exposed a contract hole: a serve recipe at shot 1 was accepted when `opening` was `midrally`. A mid-rally declaration means the opening serve and return bounces have already happened, so a new serve cannot occur in that sequence. The compiler now accepts serve only as shot 1 of `opening: "serve"`; it rejects serve at every mid-rally position and at later full-rally positions while preserving the valid prefix.

## Browser and extended corpus verification

`tests/qa-scenario-browser.spec.mjs` loads all 25 fixtures into the real browser renderer. Valid contacts check paddle/ball agreement, handedness, unchanged tactical facing across all four cameras, 2D/3D world agreement, history-independent seeking and source preservation. Invalid fixtures must keep playback blocked and preserve authored data. This is controlled fixture testing, distinct from the three visible-interface challenges.

The independent extended generator in `tools/qa-generated-extended.mjs` covers 446 valid documents, 24 intentionally invalid documents, 9,435 shots and 77,873 boundary samples. See [the independent review](qa/sol-review.md) for seeds, pair coverage, factor limits and the 64-shot visible workflow. The two generator totals describe separate schedules; they are not a claim of that many unique tactical scenarios.
