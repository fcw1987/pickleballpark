# Spin feasibility assessment

Assessed against `ac7ca5f` on 2026-10-18. This pass makes no trajectory, renderer, builder, saved-play, or 2D runtime changes. Instructional character animation remains the priority.

## Decision

A bounded, explicitly opted-in teaching illustration is feasible. A physically predictive spin/bounce simulation is outside the safe scope of the current authored rally system. Preserve the successful compiled mechanics now; do not add a control that suggests spin currently affects the visible ball or trajectory.

The smallest future implementation should first establish an explicit opt-in contract and a directionally correct, deterministic orientation sampler. Bounce shaping is a separate step, permitted only when the authored landing and next contact can be connected without an implausible lateral turn, reversal, or extra ground contact. Existing metadata alone must not activate either feature.

## What exists today

| Path | Current behavior | Consequence |
| --- | --- | --- |
| `three-d-core.js: normalizeShotMetadata` | Reads `flight.spin`, then `trajectory3d.spin`, then `shot.spin`, then family defaults. Supports topspin/backspin/flat and finite nonnegative rpm; no upper rpm bound. | Missing metadata is not a no-spin declaration. Many existing plays already carry nonzero spin. |
| `three-d-core.js: compileLeg` | Uses authored contact, landing, next contact, duration and parabolic arcs. Spin is retained as metadata but does not affect sampled position, event timing, or rebound. | Activating existing metadata would silently change saved and generated rallies. |
| `three-d-core.js: createTrajectory` | Separate standalone illustrative compatibility API. Fixed type-dependent bounce travel multipliers: topspin 1.22, backspin 0.55, flat 0.9. RPM does not scale the multiplier. | Even zero-rpm topspin and backspin travel differently. This is an existing inconsistency, not a validated bounce model. |
| `three-d-ball.js: ReadableBall` | Camera-facing pixel sprite, ground shadow and sampled past-position trail. No spin/orientation input or rotation. | Rotating the sprite in its image plane would show rotation about the viewing axis, not general topspin/backspin. |
| `play-document.js`, `builder-ui.js`, `play-builder.js` | Schema/model version 1 recipes expose family, contact, target, arc, pace and movement; there is no supported spin control or validated spin recipe contract. Generic edit handling/extension JSON preservation is not a supported spin feature. | An author-facing field needs deliberate validation, edit ownership, template, Undo/Redo and persistence integration. |
| `play-compiler.js: trajectoryMetadata` | Automatically assigns backspin to drop/dink/reset and topspin to other families, with 300/600/850 rpm from pace. | These are family presets, not proof of a player's technique or a physically fitted outcome. |
| `smart-rally-generator.js`, `rally-proposals.js` | Deterministic recipes/proposals, bounded search and automatic-versus-authored field ownership. No spin ownership field. | A future extension must not change seeds, successful prefixes, generation/version identity, or overwrite authored spin. |
| `builder-storage.js` | Versioned, validated source JSON; preserves allowed extension data, with bounded import and conflict checks. | Add a tested source contract before exposing an editable value. Do not change the storage key or rewrite legacy documents merely to opt in. |

Compiled first-flight horizontal velocity follows contact-to-landing (or contact-to-interception). Rebound horizontal velocity follows landing-to-next-contact. Those directions can differ: preservation of authored points currently takes precedence over velocity continuity. Short hops have a special rising rebound; terminal bounced shots stop at the landing with no invented onward bounce. These contracts must survive any extension.

## Physics basis and limits

[Pickleball Flight Dynamics](https://arxiv.org/html/2409.19000v1) models gravity, drag and wind and explicitly omits spin. Its drag estimate uses forward-facing wiffle-ball measurements rather than measured pickleball coefficients. It supports considering drag in a research model, but supplies no pickleball spin/bounce calibration.

[Executing a Successful Third Shot Drop in Pickleball](https://arxiv.org/html/2501.00163v1) fits drag/lift using measured trajectories and explores horizontal-axis spin perpendicular to travel. Its conclusions emphasize speed/angle control and call spin secondary for the modeled drop landing range; it acknowledges post-bounce effects. It does not provide a calibrated contact-friction/restitution system for this application's surfaces. Its fitted flight coefficients differ from the earlier paper, so neither paper justifies treating preset rpm as a universal prediction.

[Rod Cross, Grip-slip behavior of a bouncing ball](https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/GripSlip.pdf) experimentally studies several other ball types. Contact deformation and friction can change translation and rotation together, with behavior beyond a simple rigid rolling model. This explains why a universal “topspin speeds up / backspin stops” multiplier is misleading; it does not establish coefficients for a perforated pickleball on a court.

The application authors both the landing and the subsequent interception. A forward initial-value physical simulation generally changes those points when spin changes; forcing all points, heights, durations and initial conditions simultaneously can overconstrain it. The proposed extension is therefore an authored teaching illustration with bounded, validated shaping. It must never be described as exact physical simulation or measured rpm playback.

## Concrete future scope

1. **Explicit activation and exact legacy path.** Introduce a separate validated opt-in presentation/illustration mode. Absent mode uses the exact existing code path, samples and events. Existing implicit family spin never enables it. Do not casually migrate `modelVersion: 1`; settle version and template semantics before implementation. Flat or zero-rpm input in the new mode must bypass spin position/orientation effects exactly. Keep legacy standalone API correction separate because its zero-rpm behavior is observable compatibility behavior.
2. **World-space direction and deterministic orientation.** For horizontal travel unit vector `d`, world up `n=(0,1,0)`, use topspin angular axis `n × d` and opposite sign for backspin. This moves the top surface forward for topspin and makes `omega × velocity` point downward in the usual Magnus convention. Derive angle analytically from simulation seconds (`rpm * 2π/60 * localTime`), never add per-render-frame deltas. Handle zero horizontal distance explicitly. Preserve orientation at bounce with a piecewise analytic continuation. At paddle contact, use a defined deterministic boundary convention; do not infer handedness from spin sign.
3. **Honest visual representation.** Retain the accepted ball center, pixel footprint, depth testing, occlusion cue, shadow and trail. A material's screen-plane rotation alone cannot depict the world-space axis above. A future surface marker must project a world-space sphere orientation, or a separate explicit teaching cue must explain direction. Full-speed sampled rpm can alias; any readability slowdown must be labeled illustrative rather than presented as measured angular speed. Require visual QA from opposing cameras and slow playback before shipping it.
4. **Optional rebound tangent shaping, guarded by feasibility.** Preserve landing and next-contact positions and heights, bounce count, net/contact events and all durations. A small endpoint-preserving correction such as `delta * p*(1-p)^2` can adjust the initial rebound derivative while leaving both endpoints and the final derivative unchanged. Choose the initial horizontal tangent within a conservative cone about incoming travel; bound displacement and tangent magnitude. Validate the whole polynomial for forward progress, court/apron limits, above-radius height and no unintended extra apex/contact, especially short hops. If constraints conflict, retain the canonical trajectory and explicitly indicate that the teaching effect is unavailable; do not invent a sideways “spin kick.” This construction is an interpolation technique, not a calibrated impact law. Do not ship arbitrary numeric kick/friction/restitution constants under a physics label.
5. **Defer coupled flight/impact simulation.** Airborne Magnus deformation, drag integration, bounce energy transfer and post-bounce rpm change need a separate model with measured coefficients and an endpoint-solving policy. Do not graft an unconstrained integrator onto the existing compiler or solve failures by moving authored targets/contacts.

No part of this future scope is implemented or required to complete the current character-animation work.

## Acceptance requirements for any later implementation

- For legacy documents and absent opt-in: exact sampled coordinates, durations, event identities/order/counts, actor contacts and target rings; identical 2D/3D shared ball centers and tactical outcomes.
- For opted-in flat/zero rpm: exact baseline positions and a fixed, nonspinning orientation. Validate finite bounded rpm and reject malformed values at the source boundary; do not silently turn bad inputs into a different physics state.
- Seek, backward scrub, restart, pause, loop, and playback at 1x/0.5x/0.25x produce the same pose and position at the same simulation time, independent of frame history and camera.
- Topspin/backspin signs remain correct for both court ends and diagonal travel, through bounce, at exact boundaries and just before/after them. No angle discontinuity at the bounce.
- Landing, volley interception and subsequent paddle contacts stay exact; no extra bounce on volleys or drop-serve preparation; terminal landings hold; short-hop contact remains on the rise.
- Save/export/import, Undo/Redo, duplicate, family change, template edits, Smart Add and seeded Random Rally preserve explicit authored spin and legacy behavior. New field ownership/signatures and model/generator version policy receive targeted coverage.
- Existing net/rally validators and adversarial samples still pass. Add derivative/bound checks rather than relying only on position continuity; current continuity tests do not prove a physically plausible tangent.

## Evidence collected

Baseline command (no browser use):

```sh
node --test tests/three-d-core.unit.mjs tests/builder-sampling.unit.mjs tests/rally.unit.mjs tests/smart-rally-generator.unit.mjs tests/builder-storage.unit.mjs
```

Result: **52 tests passed, 0 failed**. Existing coverage includes compiled contact/bounce continuity, short-hop rise, deterministic seeded generation, storage round trips, 99-shot compilation and standalone type-dependent spin travel. It does not test world-space spin orientation, compiled spin effects, or tangent physical validity.

A read-only Node probe changed every compiled starter shot from 900-rpm topspin to 900-rpm backspin: all 101 sampled ball states, event arrays and duration were exactly equal. A separate standalone zero-rpm probe measured post-bounce travel of **1.037 m topspin**, **0.4675 m backspin**, and **0.765 m flat**. These results distinguish inert compiled metadata from the standalone illustration and substantiate the zero-rpm inconsistency.

No runtime edits, scene changes, browser automation, pushes, merges, deployment, restamping or commits were performed for this assessment.
