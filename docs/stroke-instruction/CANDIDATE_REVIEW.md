# Independent candidate review

## Iteration 1 — not accepted

Actual images opened from `../stroke-review/candidate/`: `forehand-drive-right-{03,05,07}.png`, `backhand-drive-right-05.png`, `lob-right-{03,07}.png`. Capture provenance is in the suite's `stroke-report.json`. These were reviewed before the worker's reach correction.

Observed improvement: forehand preparation separates the paddle from the torso and turns the shoulder line more clearly; the follow-through crosses the body. Backhand contact now appears across the body on the non-dominant side instead of returning to the forehand side. Lob preparation is now low and its early follow-through rises, giving it a better basic signature.

Hard blocker: `lob-right-03.png` has an unmistakably elongated arm reaching almost to the ankle. The hand sits below a low paddle face and exceeds the arm's anatomical envelope. Implementation worker independently reported excessive wrist reach and is correcting grip direction/reach. Lower preparation should be retained, with the paddle below the hand for low contact where required. A downward paddle orientation is itself normal; the unacceptable baseline combination was a static-looking dangling face plus raised sideways elbow and weak body preparation.

The first candidate is an improvement but cannot be accepted with visible limb stretching. Review the new correction before spending dense-capture work on this version. Grounding looks more coherent in these images, but sparse poses do not establish stance locking or smooth final approach.

## Boundary probe — additional blocker

A separate shell/Three.js probe sampled all built-in adjacent segments at ±0.00001 seconds with actual rendered `PaddleFace`, hands and head world positions. Root and foot targets were continuous, but the following discontinuities were found on the work-in-progress candidate:

| Play and boundary | Player | Paddle jump |
| --- | --- | ---: |
| short-hop-reset: short-hop → reset | player1 | 0.1783 m |
| third-shot-drop: third-drop → drop-transition | player1 | 0.1649 m |
| serve-and-return: serve → return | player1 | 0.1344 m |
| third-shot-drive: return → third-drive | player3 | 0.1278 m |

Several head samples moved about 0.025 m, and the free hand moved up to 0.368 m. These are supporting numeric findings rather than visual acceptance. Facing reset, split-step phase switching, and free-arm side switching require smooth transitions. Root also identified excessive variation in rendered thigh/shin lengths. Both problems are blockers pending true leg-chain correction and actual dense-motion review. Capture worker's subsequent provenance-stamped acceptance report should supersede this diagnostic snapshot.

## Reach correction iteration — partial visual improvement, not final acceptance

Opened actual `../stroke-review/candidate-reach-iteration/lob-right-phases.jpg`, `backhand-drive-right-phases.jpg`, and `moving-return-right-phases.jpg`.

The corrected lob no longer displays the elongated arm in its low preparation. Its paddle starts low, lifts through contact and reaches a visibly high finish. Backhand preparation, opposite-side contact and outward finish now read as a coherent different stroke. These are observed improvements, not a whole-motion acceptance.

The moving-return evidence is unusable: a foreground athlete's head dominates every frame and hides the hitter/feet. Capture worker was asked to move the fixed camera and recapture this case. Leg-chain corrections and segment-transition fixes remain pending; they require new images plus dense movement evidence.
