# Stroke instruction: animation direction and acceptance

Scope: preserve the user-accepted village, court, surroundings, lighting, materials and athlete design. Improve locomotion and stroke demonstration only. This is animation direction, not a claim that the procedural rig is a biomechanically validated teaching model.

## Evidence inspected

Independent reviewer inspected actual saved images from the frozen baseline `pickleboard-perf/docs/town-art-performance/final/`: `motion/motion-filmstrip.png`, `motion/drive-filmstrip.png`, and `details/drop-contact.png`, together with `three-d-athletes.js`, `three-d-animation.js`, and `three-d-presentation.js`. The filmstrips establish composition and broad progression, but their wide framing and 0.33-second sampling cannot establish foot locking, wrist control, or contact velocity. Closeups around each stroke are required before acceptance.

The inspected side detail shows compact, almost identical crouched silhouettes with paddles close to the torso; the wide strips make stroke distinctions hard to read. These are observed visual limitations. The following are separately identified source causes, not invented observations of unseen motion:

- `updateAthlete` enables travel only for `action === 'shuffle'`, so preparing an incoming stroke can suppress stepping while the root still translates.
- Ankles oscillate sinusoidally only along local Z, regardless of actual world travel direction. The ground half of that sine is not a world-space stance lock.
- `contactPlant` uses the same hand-side offset for every stroke; a backhand needs contact on the opposite side.
- `strokePoseNames` selects lob and overhead poses that the inspected pose library does not define. Body motion falls back to ready while the paddle has a special high finish.
- Each paddle phase uses smoothstep interpolation independently. That produces zero endpoint velocity at contact and a new acceleration after impact, contrary to a continuous swing.
- Paddle angle derives from the shoulder-to-face direction. Grip orientation should be authored independently enough to distinguish a controlled open lob face from a drive face and avoid a changing wrist hinge caused solely by reach.

## Implementation direction, in order

1. **Feet and root must agree.** Derive gait from actual movement direction and accumulated travel. Keep stepping active during early preparation if the root is moving. Grounded stance feet oppose root translation locally so their world position is stable; the recovery foot clears the ground with a short arc. Slow the final approach into a support base before impact. Avoid generic in-place marching, simultaneous sliding soles, side-to-side pelvic wiggle, or a frozen lower body drifting into a hit. Do not fake weight transfer by translating the entire character while both feet slide.
2. **Give each stroke a support base.** Use a modest stagger or pivot appropriate to the stroke, knees soft, head relatively level. A settling split step is a brief readiness event around the opponent's strike, not a permanent squat or repeated hop. Show rear-to-front pressure transfer through the pelvis over the support base, without a deep lunge or exaggerated torso pitch. A rear heel may release as the body rotates; avoid rotating both soles as if attached to a turntable.
3. **Make preparation legible.** Turn torso/shoulders toward the relevant side before the arm accelerates. Keep the paddle separated from the torso silhouette. Weight shift and torso lead the arm; do not lock all channels to the exact same phase curve. These are subtle offsets, not a theatrical chain of disconnected joint motions.
4. **Pass through contact.** Contact remains at the authoritative ball event. Use a continuous curve with a coherent nonzero tangent through it, followed by deceleration. Do not pause at impact, warp the paddle only in the last instant, stretch the forearm, or start ball travel before visible meeting. Wrist orientation stays controlled as elbow extension and shoulder movement carry the stroke.
5. **Finish, then recover.** The finish must be readable for a moment and blend back to a balanced ready position without reversing the whole swing abruptly. Return-and-advance can flow forward after contact; stop or split as the next opponent contact approaches. Keep movement and stroke blended rather than switching entire bodies abruptly between animation categories.

## Required stroke signatures

| Stroke | Preparation | Contact | Follow-through |
| --- | --- | --- | --- |
| Forehand | Paddle on dominant side, modestly behind and below contact; opposite shoulder turns forward | Clearly in front and on dominant side; body opens through swing | Rising arc across torso toward opposite shoulder, then controlled ready recovery |
| Backhand | Paddle crosses body to non-dominant side; paddle shoulder leads toward ball | In front on non-dominant side; visibly distinct root/contact relationship from forehand | Opens outward toward dominant side; controlled torso release |
| Lob | Low paddle start with more knee/hip loading than a drive, limited backswing | Open face lifting in front, controlled wrist | Pronounced upward arc and head-height finish; modest leg extension, no jump or overhead windmill |
| Drop/block regression | Compact, small loading; block remains especially short | In front with controlled face | Small purposeful finish; should not acquire the full drive swing |

Choose a single coherent backhand convention. If showing a two-handed backhand, both hands must visibly share the grip through acceleration/contact; a support hand hovering beside the wrist is not a convincing grip. If showing one-handed, release the off hand before acceleration and use it for balance. Do not imply there is only one correct stance or backhand style. Mirroring must preserve the same signatures for left-handed players.

## Evidence and limits

- [USA Pickleball, Pickleball Basic Terms](https://usapickleball.org/blog-category/pickleball-basic-terms/) gives the direct pickleball coaching basis: move into position, turn shoulders/hips, contact ahead, transfer toward the front foot, then recover. It describes an open paddle and high finish for a baseline lob. It also tells advancing players to stop in readiness if the opponent will strike before they reach the NVZ. These are beginner teaching cues, not a universal prescription for elite stances. (Consulted 2026-10-18.)
- [PrimeTime Pickleball, The Kinetic Chain in Your Pickleball Swing](https://primetimepickleball.com/the-kinetic-chain-in-your-pickleball-swing/) supports larger body segments leading the arm/hand. This is coaching guidance, not measured kinematic data. The [coach page](https://primetimepickleball.com/) identifies Nicole Havlicek as an IPTPA-certified coach and former Division I tennis player.
- [PrimeTime, Two Handed Backhand Stroke Analysis with Tyler Loong](https://primetimepickleball.com/two-handed-backhand-stroke-analysis/) identifies a relevant full/slow-motion coaching reference. Only its accessible page text was reviewed here; its embedded video was not inspected, so no frame-specific claims are attributed to it.
- [Landlinger et al. (2010), Key Factors and Timing Patterns in the Tennis Forehand of Different Skill Levels](https://pmc.ncbi.nlm.nih.gov/articles/PMC3761808/) is primary 400 Hz motion-capture research on 13 male tennis players. It supports reviewing pelvis/trunk timing and downstream racket speed as coordinated motion. Tennis racket inertia, ball properties, court dimensions, swing amplitudes and participant skill differ: do not import its angular magnitudes, millisecond timing, or racket speeds into pickleball. Our timing offsets are animation judgments, not derived pickleball measurements.
- [Edriss et al. (2025), Pose estimation for pickleball players' kinematic analysis](https://pubmed.ncbi.nlm.nih.gov/40563204/) is a small pilot of 14 male players performing warm-up dinks, using approximate markerless estimates. It reported skill-group differences in femur flexion and continued wrist motion. It does not validate forehand/backhand/lob ranges or justify a conspicuous wrist snap. “Controlled wrist” here means stable-looking paddle control, not a literally immobile joint.

## Independent visual acceptance

Review normal speed and slowed motion plus matched fixed-camera closeups with an identifiable ground reference. Inspect approach, final plant, loaded preparation, contact, early follow, finish and recovery; include left-handed mirroring, a low ball, and the standard return advancing toward the NVZ. At least forehand, backhand and lob must be recognizable without reading a label.

Reject if a planted foot visibly drifts, gait moves perpendicular to travel, the paddle changes direction or stops at contact, the arm length visibly changes, a body turn snaps at a segment boundary, or the lob is merely a forehand with a high endpoint. Require a clear ball/paddle meeting and smooth recovery. Automated reach/contact/continuity checks support this review but cannot substitute for actual visual/motion inspection. Initial acceptance was pending fresh closeup captures; the completed independent decision and exact reviewed scope are recorded in FINAL_REVIEW.md.
