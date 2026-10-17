# Final visual verdict

**Art-direction pass for the authored volumetric route.** This is a substantial, coherent improvement over the original directional sprite replay. The final judgment is based on normal court-scale desktop and phone renders, plus held-clock low-camera action frames. It does not rely on a character close-up or geometry assertions.

## What passes

- The normal builder court fills the useful space at 1440×900, 390×844 and 844×390. The short landscape camera uses the screen width rather than shrinking the long court into the center.
- Original green and orange athletes have recognizable human proportions, visible shorts and legs, separated sneakers, physical paddles, and readable team uniforms. They are visibly dimensional rather than billboard stickers.
- The revised ready pose lowers the paddle and bends the knees. The final forward-lean correction was rendered and reviewed after execution recovered; it improves the earlier seated/backward posture.
- Serve and forehand neighborhoods, drive, backhand dink/block, short-hop contact, overhead preparation/contact/follow-through and travel were reviewed during iteration. Overhead reach and follow-through are distinct. Low contacts and alternating travel steps remain legible at court scale.
- Teal court, sage kitchens, fresh green turf, dimensional net, trees and benches form one restrained sports park. The final rendering direction uses diffuse world materials without realtime shadow maps; existing player contact ellipses provide sufficient grounding while the citron ball remains easy to locate.
- Compact ivory controls fit the world and leave much more phone space for the court. Native text is readable; the design avoids a flood of yellow controls and heavy nested borders.

## Honest stylistic scope

The result is an original **faceted 3D JRPG sports park with restrained pixel details**. It satisfies the selected authored volumetric direction and solves the rejected flat/static presentation. It is not hand-painted directional pixel-sprite art, nor a replica of Pokémon's art assets. The environment remains deliberately sparse; adding decorative clutter would reduce tactical clarity without meaningfully improving its artistic identity.

## Earlier art-review evidence (before rendering optimization)

These `astra-final` images document the earlier shadowed iteration, not the frozen delivery rendering. All paths below are relative to this report:

- [Desktop builder](astra-final/desktop-builder.png)
- [Phone portrait builder](astra-final/phone-portrait-builder.png)
- [Phone landscape builder](astra-final/phone-landscape-builder.png)
- [Desktop overhead replay](astra-final/desktop-3d.png)
- [Sideline replay](astra-final/desktop-3d-sideline.png)
- [Behind-orange replay](astra-final/desktop-3d-behind-orange.png)
- [Drop contact](astra-final/desktop-contact.png)
- [Final short-hop contact and ready posture](astra-final/short-hop-sideline-contact.png)
- [Final overhead contact](astra-final/overhead-sideline-contact.png)
- [Capture metadata](astra-final/capture.json)

## Performance-driven art decision

The first matched software-renderer run exposed a material callback-cadence regression: median 16.7 to 33.3 ms and p95 25.1 to 41.8 ms. Art approval did not override the user’s responsiveness constraint, so a focused rendering comparison was required.

The selected optimization removes realtime shadow maps and uses Lambert diffuse materials for the environment, retaining the athletes’ existing materials, full geometry, native resolution and animation timing. Actual identical overhead and behind-orange contact images were reviewed against the 1024px soft-shadow version. Silhouettes, jersey colors, court/net form and ball readability remain intact. The existing contact ellipses sufficiently ground the players. The modest loss of cast shadows is an acceptable artistic tradeoff; no extra shadow geometry is requested.

- [Selected overhead rendering](performance-iteration/materials/none-lambert-world-overhead-contact.png)
- [Selected behind-orange rendering](performance-iteration/materials/none-lambert-world-behind-orange-contact.png)
- [Previous overhead rendering](performance-iteration/shadows/soft1024-overhead-contact.png)
- [Previous behind-orange rendering](performance-iteration/shadows/soft1024-behind-orange-contact.png)

The controlled comparison reported recovery to median 16.7 ms / p95 25.1 ms callback intervals. These are callback measurements in Chromium/SwiftShader, not displayed FPS or real-device performance. The integrated runtime was subsequently validated as recorded below; hardware-device qualification remains unavailable. Earlier `astra-final` captures show the pre-optimization shadow path; the comparison images above document the approved replacement.

The earlier capture harness reported no page errors. Independent browser/lifecycle and regulation net-geometry checks remain their QA owners’ responsibility. No additional art correction is required by this review.


## Frozen integrated acceptance

**Accepted for delivery within the measured environment.** Final desktop, portrait and landscape builder images retain the approved dimensional athletes, clear court composition, readable ball and sufficient grounding after the rendering optimization. No further art changes are requested.

The frozen runtime is stamped from source `39670b72c532b256b96f2554d13065ef783d2223`, with digest `5b890e14e1690cdb2c54d69e7f5c8933c71c506c10d4cb76d742446d2d95e129`. The evidence records a later documentation/tooling HEAD `c844fce`; the runtime digest identifies the measured implementation.

The [final matched performance run](final/matched-performance.json) uses six sequential, counterbalanced passes in one Chromium/SwiftShader process, 1440×900 DPR1, with 1200 ms of active warm-up before each six-second sample. All three candidate passes match baseline's approximately **16.7 ms median and 25.1 ms p95 callback interval**. Candidate scene counts are 45 draw calls, 41 geometries and 6 textures versus baseline 53, 43 and 14. Candidate triangle count remains higher (11,156 versus 8,822), and median pose-update CPU time increases from about 0.1 to 1.0 ms; median render submission CPU time decreases from about 0.3 to 0.2 ms. All six passes report no page errors. These results resolve the earlier large median/p95 cadence regression in this tested workload; they do not establish identical frame distributions or displayed FPS.

The [20-cycle lifecycle result](final/lifecycle-20.json) reports stable 41-geometry/6-texture counts, one canvas, no pending animation frames at rest, no context loss, and no errors or failures after play/pause/seek, menus, cameras and 2D/3D changes across viewport orientations. This run used reduced-motion preference and did not force context loss.

Actual final delivery images, superseding the earlier `astra-final` shadowed evidence:

- [Final desktop builder](final/screens/desktop-builder.png)
- [Final phone portrait builder](final/screens/phone-portrait-builder.png)
- [Final phone landscape builder](final/screens/phone-landscape-builder.png)
- [Final overhead replay](final/screens/desktop-3d.png)
- [Final contact frame](final/screens/desktop-contact.png)
- [Final screen capture metadata](final/screens/capture.json)

This acceptance is qualified to the tested software-renderer workload and reviewed renders. No physical phone, hardware GPU, touch-latency or displayed-frame-rate claim is made. Broader package/regression acceptance remains with the parent and QA owners.
