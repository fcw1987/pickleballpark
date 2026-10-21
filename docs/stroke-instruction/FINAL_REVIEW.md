# Independent visual acceptance

**Decision: accepted for the scoped stylized instructional-motion improvement.** The accepted court, village, surroundings, lighting and athlete design are preserved. This is not motion-capture validation or a claim that every stroke represents all legitimate playing techniques.

Final main capture runtime digest: `1342f7a03c16736fa9eba5509d244fd166697bcedf43401872aa1436bb24f2b6`. The 14-case `../stroke-review/candidate-final/stroke-report.json` reports an unchanged runtime and no page errors.

## Actual evidence reviewed

The reviewer opened saved images, not only source or test output:

- Baseline wide filmstrips and drop details, then closeup forehand/backhand/lob and the no-label comparison board. See `BASELINE_REVIEW.md`.
- Two interim candidate iterations, rejecting visible lob arm elongation and an occluded return camera. See `CANDIDATE_REVIEW.md`.
- Final ordinary-stroke closeups and phase sheets: forehand preparation/contact/finish; backhand contact and a then-labelled left-handed sequence (handedness provenance superseded below); lob low preparation and high finish; low short-hop preparation/contact/follow; overhead contact; the no-label comparison board; phone forehand and lob screenshots.
- Final explicit backhand overhead frames 03/05/07 and its complete phase sheet. The paddle meets the ball above the head and descends into a coherent finish without visible limb stretching.
- Dense actual fixed-camera sheets for forehand, backhand and lob (28 samples at 1/30-second simulation spacing), and moving return (43 samples from −0.6 to +0.8 seconds). These were first inspected in an intermediate capture and then all four canonical `candidate-final-dense/*-phases.jpg` sheets were opened again after the overhead repair. The final dense report matches the same runtime digest and records no errors.

No continuous WebM playback is claimed by this reviewer. Motion judgment uses the ordered dense actual-runtime images, supported by independently sampled geometry/continuity. The capture worker also supplies concise actual slow-motion clips for human inspection.

## Observed result

Forehand now shows a paddle-side preparation, shoulder turn and cross-body release. Backhand uses the opposite contact side and a different finishing arc. Lob begins low, rises through contact and finishes around head height. The corrected arm no longer lengthens down toward the ankle. The earlier labelled left-handed images are not evidence for handedness: subsequent harness inspection found their effective physical hand was not verified. Corrected verified left-handed evidence is required in the supplement below.

The dense samples show continuous swing progression through contact and gradual finish/recovery. Moving return settles into the strike, then progresses into alternating advancing steps; the feet continue to articulate during preparation instead of freezing while the root moves. The full visible advance is assessable through roughly +0.7 seconds; the final +0.73 to +0.8 samples approach the fixed camera and partially crop the feet. There is no obvious pose reset or limb-length jump in the inspected contact/recovery windows.

The repaired knees maintain coherent bending through the ordinary shots. The very low short-hop uses a deep crouch appropriate to its near-ground contact rather than an extending arm. Overheads straighten the support leg chain without floating the feet. Stances remain fairly square and stylized, with modest weight transfer: accepted for this scope, not offered as a detailed footwork clinic.

## Supporting independent checks

- A direct Three.js boundary probe compared actual rendered hand, paddle, head and foot world positions across every built-in adjacent segment, all four players and both hands, with `instructionalMovement:true`. Across 816 part comparisons at ±0.1 microseconds, the maximum gap was `7.209134805875535e-7 m`. This removes the earlier 0.13–0.18 m paddle boundary pops. It establishes positional continuity, not human perception of every derivative.
- `SOLE_AUDIT.json` measures both source sneaker geometry and the actual dynamic-body-batch vertices at forehand, lob, short-hop and overhead contact. Both feet have minimum world Y exactly zero; acrylic is Y=0 and the kitchen surface Y=0.001. There is no positive shoe/court gap. Nearby detached circular marks can be ball shadows; lowering the shoes would not address the visual perception.
- Final capture acceptance metrics provide additional contact, reach, foot support and boundary coverage. They support but do not replace the image review above.

## Practical limits

Phone default framing preserves the full tactical court and broad paddle/ball relationship, but the athletes are too small there to teach fine wrist and elbow mechanics. Use the provided closeup phase sheets/slow clips for that review. Dense samples are 30 Hz in simulation time, not proof of device frame-rate performance. Coaching references and the limits of tennis evidence transfer are documented in `DIRECTION.md`.

No remaining visual blocker was found in the reviewed scope. No environment redesign is requested.

## Handedness provenance correction and final compatibility supplement

**Accepted at final runtime digest `667bb8a0dd3d0d84fbf638be3b89f612f4f9a08d141df2308ed7b69fe4ad2998`.** Source revision `50a49a5ce7d795e39844cfe0dce288930cf2c485`; stamp `4c4ea9e`; packaged revision `2b4559abe460681e166d2d1a883119c0504b841d`. See [the complete compatibility review](OVERHEAD_SHORT_HOP_REVIEW.md) for classification, exact evidence and limitations.

The earlier generic capture harness applied handedness in an order that did not guarantee the effective actor hand. Historical `candidate-final/*-left` images are therefore superseded as left-handed visual evidence, even where their pixels differ from right-labelled images. The earlier main right-handed clips remain valid, as do direct numerical tests that construct physical left-handed rigs. Corrected canonical captures assert and record token and actual actor handedness. The reviewer independently opened the verified `candidate-contact-final` left-handed forehand, backhand and lob phase sheets; their stroke identities are clear and accepted.

The overhead/short-hop source combination is allowed by ordinary builder controls and accepted by the schema/import path, while its compiled seven-foot short-hop semantics remain contradictory and rejected by rule evaluation. It is not an invalid-import-only case. The narrow instructional-3D repair honors the explicit authored overhead family while preserving original profile/timing, ball trajectory/events and default 2D behavior. No court, village, lighting or athlete redesign is involved.

The reviewer opened clean before/after edge sheets, both final overhead controls, right edge preparation/contact/finish and left edge contact, then both canonical dense edge sheets (28 frames each, -0.5 to +0.4 seconds at 1/30-second simulation spacing). The repaired athlete reaches the ball with an upright overhead pose and coherent descending finish. No visible support-foot jump, pose reset or limb stretching was found through the inspected window. No continuous WebM playback is claimed. All 50 PNGs for main right-handed forehand/backhand/lob and ordinary overhead both hands are byte-identical between clean baseline and final, independently checked.

The final 17-case main and two-case dense reports match the final unchanged digest and contain no page errors. The capture acceptance summary has no failures and zero public-seek/single-apply discrepancy. Strict isolated Chromium and WebKit history checks also pass. The unchanged targeted suite passes 13/13 on installed Node 24; the host Node 22.4 default optimized run still has a documented anomaly, absent with its diagnostic flag and in the tested browsers. Its exact mechanism is unproven, and the rejected matrix/route workarounds are absent from production.

No remaining visual blocker was found for this scoped compatibility repair. The source semantic conflict and the Node 22.4 diagnostic limitation remain explicit; they are not hidden by this acceptance.
