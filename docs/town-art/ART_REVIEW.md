# Art-direction review

This continuation starts from the owner-reviewed `08401fca5150f1ccfcb482a50953b5bbd340fe6a` candidate. The first task was to inspect its existing review page and actual desktop, sideline and phone captures. Two implementation workers and the independent reviewer ran as `gpt-6.1-sol` with high reasoning effort.

## Actual reference

- [Official Pokémon: Let’s Go Kanto environment images](https://pokemonletsgo.pokemon.com/en-us/kanto-region/), including the retained Pallet Town image.
- [Official human character scene](https://www.pokemon.co.jp/ex/pika_vee/character/180713_02.html).

The local reference JPGs were downloaded from the official source and visually inspected before implementation. They are review material only, excluded from the runtime package. Application geometry, face markings, clothes, building designs, signs and painted colors are original. There are no creatures, copied characters, franchise marks or downloaded art in the application.

## Specific critique of the previous candidate

The small heads, pin-dot eyes and hard octagonal forms read as adult sports miniatures rather than expressive stylized people. Angular layer-cake trees, rocklike shrubs and flat surfaces made the park generic. The large empty olive lawn had no architecture or connected paths to suggest a human world. Muted lighting suppressed the cream, blue and bright-green separation visible in the reference. Tight court framing supported authoring, but surrounding space lacked a deliberate composition.

The working articulated animation was worth preserving. New art therefore changed appearance, surrounding scenery and light, while retaining the actual motion solver, clock, trajectories, authored positions and contact anchors.

## Iteration findings

The first new pass established a village: cream cottages, capped pale fence, intersecting paths, flowers and rounded canopies. Heads and hair became larger and softer. Independent review accepted the inhabited context and gameplay readability but withheld visual acceptance because the scene still looked ungrounded, tree clusters looked like smooth balls, buildings were unfinished, and close-up eyes were round protruding disks.

The next passes added shaped almond eyes, smaller irises and lids, asymmetric hair, brighter face light, connected shoulder treatment, corrected limb taper and thumb cues. Roof courses, ridges, window highlights, painted leaf marks, path-edge vegetation and soft translucent ground shading made the scenery more deliberate. A large foreground tree was moved away from the sideline court apron. The reviewer inspected five normal scene captures, four human closeups and four drop-phase stills.

The independent conclusion for iteration 3 was: this is a substantial move toward the reference’s modern human village style, with no critical visual blocker for that directional goal. It is not a claim of matching the reference’s commercial production quality. Normal desktop and both phone orientations retained all four athletes and a clearly visible ball.

## Remaining finish

The official reference still has richer painted material response, natural planting edges and soft directional cast shadows. This candidate remains a lightweight procedural interpretation. Rounded tree lobes are still discernible. Closeups show some knee and sleeve joins and a simple paddle grip; these are much less apparent at normal gameplay scale. Actual recorded motion and performance evidence are provided separately from aesthetic review.

## Performance-driven preservation

The richer first scene was too costly in the matched software-renderer run. Static scenery was reduced and spatially batched; pose batching was rewritten with equivalent typed-array arithmetic. The worker compared 378 poses across both hands and nine actions and reported exactly identical transformed positions and normals before and after that CPU optimization. No animation or gameplay rule was adjusted to obtain the speedup.

Subsequent exact vertex indexing reduced static world vertex storage from 41,811 to 19,361 and the athletes' effective rendered vertices by roughly 70%. The worker checked 396 poses and 29.2 million rendered position, normal and color components with zero bit differences. These changes reduce CPU/storage work while preserving triangle order and shape; they do not establish hardware rendering parity.

## Final independent review

After the runtime was frozen, the independent reviewer inspected five final desktop/phone scene captures, all four athlete closeups, and the four drop prepare/contact/follow/recover stills. Directional acceptance stands. Almond eyes and distinctive headwear remain intact; paddle/arm alignment, bent knees and shoes remain coherent at gameplay scale. Roof courses, cream walls, windows, leaf marks, flowers and paths survive the optimization. No mesh holes, indexing spikes or flipped-looking face panels were visible. Sideline framing is clear, and both phone orientations retain the full court, all four athletes and an identifiable bright ball.

The final optimization makes some base shrubs and canopy edges slightly more faceted. This is a peripheral tradeoff rather than a critical visual blocker. Existing knee overlap scallops, sleeve joins and simple hands remain visible in closeups. The reviewer assessed still images, not video playback, timing, smoothness or frame pacing; motion recordings and measured performance are separate evidence.
