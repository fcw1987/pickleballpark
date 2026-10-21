# Overhead plus short-hop compatibility review

## Classification

This is an editor-supported and schema-valid source-document combination with conflicting sports semantics. It is **not** an invalid-import-only case.

Independent source inspection confirms that the ordinary builder offers `Short hop` in its contact selector, `play-document.js` accepts that contact style, and saved documents import without rewriting it. For an authored overhead family with this contact style, the compiler retains `authoring.family = overhead`, emits a `short-hop` type/stroke/contact kind, and assigns the overhead's seven-foot contact height. The separate rally rule evaluator rejects that high short-hop contact. These different validity boundaries explain why the renderer must still handle the existing source state gracefully; validator rejection does not erase the editor/import compatibility requirement.

The prior 3D renderer selected a low short-hop body/path despite the explicit overhead family and high authoritative target. The reported 0.22048 m miss is therefore a renderer compatibility defect for a source state the product accepts. Correct rendering does not make a seven-foot short hop physically meaningful or remove the rule evaluator's warning.

## Scope reviewed

The proposed change honors explicit authored overhead family only in opted-in instructional 3D presentation: overhead support position, body pose and paddle path. It retains the original short-hop profile and contact ratio. The core/compiler, shot data, event times, ball trajectories, ordinary/default 2D presentation, court, village and character design are outside this change.

Independent diff review found only the presentation/athlete visual-family resolution for this fix. The renderer receives an `instructionalFamily` marker when the opt-in sampler sees an explicit authored overhead. The existing overhead machinery then uses the original profile rather than replacing it with overhead timing.

## Frozen source and verification

Runtime digest under review: `667bb8a0dd3d0d84fbf638be3b89f612f4f9a08d141df2308ed7b69fe4ad2998`. Source change: `50a49a5ce7d795e39844cfe0dce288930cf2c485`; stamp revision: `4c4ea9e`; packaged revision: `2b4559abe460681e166d2d1a883119c0504b841d`.

The reviewer independently read the final source diff, `overhead-node24-regressions.log`, `OVERHEAD_SHORT_HOP_REPAIR_AUDIT.json`, and `verification/browser-history-diagnostic.json`. The unchanged targeted suite passes 13/13 on installed Node 24.11.0. Coverage includes lossless import and retained rule conflict, ordinary overhead styles, both hands and lateral placements, compiled Play/events/ball/default-2D compatibility, limb geometry, support feet, continuity, and a generated 99-hit rally. The repair audit reports contact error at most 4.97e-16 m for the edge fixture and ordinary overhead controls.

The isolated browser diagnostic verifies 108 served files against this unchanged digest. Chromium 149.0.7827.55 and WebKit 26.5 each pass one 810-sample strict original-call-order sequence and two 810-sample instrumented sequences. Each sample applies the athlete update once; no second settling update is used. World-space thigh/shin errors remain below 1e-15 m, selected fresh/reused actor vertices and endpoints are identical, and there are no recorded history failures.

An observed host Node 22.4 optimized-test anomaly remains: its default run fails one targeted history/limb test, while the same version with `--no-maglev` and installed Node 24.11.0 pass. The exact mechanism is not proven. Earlier matrix-refresh speculation was falsified; no matrix-refresh or route workaround is included in the final source. This evidence does not establish a browser defect or a proven compiler bug.

## Independent visual acceptance

**Accepted for the scoped 3D compatibility repair at the digest above.** The reviewer opened actual saved runtime images and ordered dense frames; this is not an inference from tests alone.

Clean matched baseline evidence is `../stroke-review/baseline-contactv29/` (seven cases, digest `1342f7a03c16736fa9eba5509d244fd166697bcedf43401872aa1436bb24f2b6`). Final evidence is `../stroke-review/candidate-contact-final/` (17 cases) and `../stroke-review/candidate-contact-final-dense/` (two edge cases). Reports record unchanged respective runtimes and no page errors. Requested hand, effective actor hand, and token hand agree in the canonical case/frame records.

Actual images opened for this supplement:

- Clean baseline right-hand edge contact and both edge phase sheets.
- Final right-hand edge preparation/contact/finish (03/05/07), left-hand contact (05), and both full edge phase sheets.
- Final ordinary overhead phase sheets for both hands.
- Final verified left-handed forehand, backhand and lob phase sheets.
- Both final dense edge sheets: 28 frames each from -0.5 to +0.4 seconds at 1/30-second simulation spacing, including exact contact.

The baseline misses the high ball visibly while retaining a crouched support pose. The repaired edge rises into an upright overhead support, meets the ball at the paddle face with either physical hand, and follows through downward across the body. The dense progression shows no obvious pose reset, planted-foot jump, or limb-length change through preparation, contact and recovery. The modest square stance remains stylized, consistent with the previously accepted scope; this is not a complete overhead footwork lesson. Verified left-handed forehand, backhand and lob retain distinct paddle-side/cross-body/low-to-high patterns.

An independent file comparison found all 50 corresponding PNGs byte-identical between clean baseline and final for right-handed forehand, backhand and lob plus ordinary overhead in both hands (10 frames per case). This supports the narrow scope without requiring replacement of the user's existing three main clips.

Final numeric capture support (`candidate-contact-final/stroke-acceptance-summary.json`) reports 17 cases, no failures/errors, maximum contact error 9.16e-16 m, zero public-seek and single-apply history discrepancy, and contact-foot drift below 1.8e-15 m. Dense-frame review establishes observed progression, not continuous video playback or a claim about physical display frame rate.

## Corrected evidence provenance and remaining limits

An initial edge capture labelled left/right used the same effective hand; those images were rejected. A second, hand-verified capture was rejected because a planner card obscured the right-handed contact. Both attempts were preserved in explicitly named historical directories. Only the unobstructed canonical captures above support this acceptance.

The ordering defect also affected the older generic harness, so historical `candidate-final/*-left` images are superseded as handedness evidence. The new canonical left-handed forehand/backhand/lob and overhead captures verify actual actor/token hands and replace those claims. Earlier right-handed clips and direct numerical tests constructing left-handed actors remain valid.

No visual compatibility blocker remains in the inspected scope. The seven-foot short-hop semantic conflict remains real and is still rejected by rule evaluation; the repair does not normalize the source or make that contact a physically meaningful short hop. The host Node 22.4 optimized-test anomaly remains documented with an unproven mechanism, not recast as a browser failure. No environment changes are requested.
