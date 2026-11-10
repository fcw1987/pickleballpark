# Optional authored-play shading

Coverage suggestions are illustrative coaching guidance, not rules, measured
reach envelopes, or claims that a particular player must take the ball.

The legacy authored-play helper uses the visible opponent contact origin, not
an outgoing target or future opponent shot. The pair's physical left/right
ordering determines lanes. A normalized origin s in [-1,1] gives pair center
10 + 3s and half-width 5 - s², in court feet. Each suggestion moves 25% toward
its lane. These deliberately modest design constants produce a neutral center
and continuous, mirror-symmetric shifts toward either sideline. Equal-x pairs
hold instead of choosing a direction from player identity.

The same-side defender protects the line and the other closes toward the middle.
This is a default, not a forehand-always-takes-middle rule. Guides preserve
reserved next-contact players and authored movement protection. Assistance is
lateral only; the compiler owns depth, contact geometry, and timing. With no
next receiver, both unprotected players may receive a small adjustment.

Pair adjustment is stopped at a 2.5-foot clearance circle; an already-close
formation is not made closer. The full compiler separately compares assisted
linear and sampled actor routes against their unassisted routes, for authored
as well as generated plays. Unsafe assistance falls back to the original play
with a warning. Assistance also may not increase an actor route above an
illustrative eased peak of 18 feet per second; an already-fast authored base
route remains unchanged. This never repairs or rewrites saved authored geometry.
Guide-only, disabled, and selected-team modes remain independent. Model 2
physical points still disable this legacy assistance and retain their warning.

These limits are model choices, not USA Pickleball faults. Mandatory opening
bounces, correct service roles, and NVZ restrictions belong to rules validation.
Recovery while following an already-hit ball may reasonably follow its flight;
that is different from knowing an opponent's unplayed shot.

## Integration contract

`applyCoverageAssistance(play, document, timeline)` is a pure post-compile pass
returning a cloned derived play and coverage records. It does not change the
source document, shot facts, hitter, contact metadata, or depth. The effective
compiler rebuilds the timeline from permitted derived positions and can reject
unsafe assistance. Suggested x is bounded to 1–19 feet and applied lateral
adjustment to an illustrative 13 feet per second of leg duration.

The canonical controls are `assistance.autoShading`, `assistance.showGuides`,
and `assistance.team` (green, orange, or both). Movement protection comes from
the existing document ownership/pin model, including partner commands. No new
movement owner or player swap is introduced. This helper does not model
stacking, poaching, switches, or measured reach. Lateral guidance alone cannot
advance the serving team toward the NVZ. Entering the NVZ is not itself illegal.

## Sources

- PrimeTime Pickleball, [shading and middle responsibility](https://primetimepickleball.com/the-number-1-forehand-strategy-mistake/).
- USA Pickleball, [positioning and transition guidance](https://usapickleball.org/pickleball-skills/level-two/pickleball-basics-positioning-tips/).
- USA Pickleball, [split-step timing](https://usapickleball.org/pickleball-skills/level-four/how-to-master-the-split-step-for-faster-reactions/).
- USA Pickleball, [rules summary](https://usapickleball.org/rules/summary/).
