# Dimensional art and phone UX candidate

An original faceted 3D JRPG sports park replaces the flat billboard replay. Art direction and final visual judgment were led by Astra, implementation by Sol 6.1, and capture/performance work by Luna. Creative decisions were made internally from rendered comparisons.

The canonical source was the unpublished Smart Rally checkout at `fc46c60f83ed8b1a2bd4ee186e05f7ab55e3a717`, rather than public main. Its tracked files remain unchanged and its untracked report was preserved byte-for-byte. See [source provenance](SOURCE.md). This candidate is local on `feature/dimensional-art-mobile`; nothing was deployed, pushed or merged.

## Review the result

- [Before/after gallery and motion](review.html)
- [Final desktop builder](final/screens/desktop-builder.png)
- [Final phone portrait](final/screens/phone-portrait-builder.png) and [landscape](final/screens/phone-landscape-builder.png)
- [Phone shot editor](final/screens/phone-portrait-editor-family-menu.png) and [menu](final/screens/phone-portrait-menu.png)
- [Four-play motion capture](final/motion/four-play-motion.webm)
- [Astra's visual judgment and optimization decision](ASTRA_VISUAL_VERDICT.md)
- [Mobile path evidence](../qa/dimensional-mobile/README.md)

The local application preview is `http://127.0.0.1:4173/index.html`; the gallery is `http://127.0.0.1:4173/docs/art-overhaul/review.html`. Phone captures use browser emulation, not physical iPhone or Safari-device testing.

## Exact reviewed bytes

| Record | Identity |
| --- | --- |
| Frozen source | `39670b72c532b256b96f2554d13065ef783d2223` |
| Metadata stamp | `4438addfadcd2406b5d9200d356c9c5fa63c4fa3` |
| Package build | `c844fce50a6a4d270836c29c7995004e2b5daa7e` |
| Runtime SHA-256 | `5b890e14e1690cdb2c54d69e7f5c8933c71c506c10d4cb76d742446d2d95e129` |
| Package manifest SHA-256 | `2d236d5ceb9c4801447b8afe40a531623d03eecd32f4876d62cbcaaa1b7ed865` |
| Package | 110 runtime files, 1,871,430 bytes, plus two package metadata files |
| Service-worker cache | `pickleboard-static-v25` |

Each final capture records the checkout revision, stamped source revision and runtime digest. Later report/evidence commits do not alter these runtime bytes. Build metadata intentionally remains a local candidate, not a published release.

## What changed

- Four original articulated athletes have distinct uniforms, caps/headbands, shorts, knees, shoes and physical paddles. Facing, handedness, foot placement, stroke preparation/contact/follow-through/recovery and travel derive from the existing shared playback clock. The visible batched body geometry follows the articulated rig; no independent animation clock or replacement physics engine was introduced.
- The authored world combines a teal acrylic court, sage kitchens, terracotta walkways, planters, trees and benches. Net tape is exactly 34 inches at center and 36 inches at the 20-foot sidelines, with posts spanning 22 feet. The court keeps the authoritative dimensions and coordinate mapping.
- A citron ball keeps the existing trajectory/contact center with a 12-CSS-pixel minimum visible size. All camera presets and a short-landscape framing adjustment preserve usable court space.
- Ivory, navy and green controls replace heavy yellow chrome. Phone controls have 44-pixel targets; native fields remain at least 16 pixels. Guided Shot details collapse without hiding playback, seeking or camera access. Simple editing and advanced Customize remain available.
- A narrow existing editor bug was repaired: explicitly choosing a named shot now selects that shot even while the editor is open. Automatic playback and arbitrary seeks continue to preserve the open editor selection. The enlarged-text editor also keeps Close above the header.

The 2D board artwork, Smart Rally compiler and successful Add / Random Rally / Coach / saved-play mechanics are preserved. The visual route is original volumetric art with restrained pixel details, not hand-painted directional sprites or copied franchise assets.

## Verification

- `npm run check`: **234/234 unit checks pass**, with 107 referenced static assets valid and brand checks passing. [Log](final/check.log)
- Generated-asset verification: all 65 paths valid, no regenerated differences. [Log](final/generated-assets.log)
- Exact package inventory, hashes and metadata validation pass. [Proof](final/artifact-verification.json)
- Smart authoring/controller/99-hit/Coach/build identity/persistence regression: **27 passes**. [Log](smart-regression.log)
- Mobile authoring and interface paths: **33 passes** across seven suites, including a complete custom phone rally, pins, structural actions, menus, reload, saved plays, 200% text and reduced-height keyboard simulation. [Details](../qa/dimensional-mobile/README.md)
- Dimensional review: **13 Chromium geometry checks, five final framing checks and 14 WebKit rendering/mobile/framing checks pass**. Actual visible triangles, 184 contacts, both hands, shoe grounding, and all eight plays across five viewports and four cameras are checked. Camera/clock/geometry were unchanged by the final material optimization; independent code review confirmed that those contracts remain intact.
- Final integrated renderer smoke: **9/9 pass**, including cameras, pause/resume/rate/seek, reduced motion, phone controls, offline repeat opening and owned-resource disposal. [Log](final/renderer-smoke.log)
- Exact-package stopped-server verification: **22/22 pass**, covering fresh installation and ten upgrade sources in both Chromium and WebKit, including the actual unpublished Smart Rally baseline. Every case verifies all 110 runtime hashes, preserved saved draft/theme/install identity and all eight lessons after the server stops. Fresh, public-upgrade and Smart Rally-upgrade cases additionally exercise offline Add, 99-hit Random Rally and Coach with undo/protected-pin preservation. [Proof](final/package-verification.json)

WebKit's automated `setOffline(true)` reload fails in an independent minimal fixture as well as the app. The [control evidence](OFFLINE_ENGINE_CONTROL.md) records the engine limitation. All 11 WebKit package scenarios pass using an actually stopped local server instead; no test is weakened to hide the automated-offline failure.

## Performance and lifecycle

The first art candidate materially slowed headless rendering. Astra withheld responsiveness acceptance and required a controlled comparison. The final choice uses Lambert diffuse world materials and existing soft contact ellipses, eliminating realtime shadow maps while preserving athlete materials, geometry, resolution and animation cadence. [Comparison and rendered alternatives](performance-iteration/README.md)

The final six-pass comparison runs before/candidate pairs in counterbalanced order in one Chromium process, at 1440×900 DPR 1 with SwiftShader. Each target receives active animation warm-up and six seconds of measured playback.

| Measure | Original | Final |
| --- | ---: | ---: |
| RAF callback interval median | 16.7 ms | 16.7 ms |
| RAF callback interval p95 | 25.1 ms | 25.1 ms |
| Draw calls | 53 | 45 |
| GPU geometries / textures | 43 / 14 | 41 / 6 |
| Triangles | 8,822 | 11,156 |
| Pose CPU median | 0.1 ms | 1.0 ms |
| Render submission CPU median | 0.3 ms | 0.2 ms |

[Raw matched measurements](final/matched-performance.json). Callback cadence is not displayed FPS, and submission CPU time is not GPU completion time. These results establish a matched software-renderer comparison; they do not claim physical iPhone performance. The articulated rig costs additional CPU, while the selected rendering path restores the measured cadence and reduces draw calls/resources.

The final 20-cycle run shows one canvas, a live WebGL context, stable 41 geometries / six textures, no leaked schedulers or pending animation callbacks, and no errors. It exercises play/pause/seek, menus, 2D/3D switching, cameras and viewport changes with reduced motion enabled. [Final proof](final/lifecycle-20.json)

## Reproduce

Use the existing dependency installation, start the local preview with `npm start`, and run the repository checks. Capture and benchmark harnesses are in `tools/art-overhaul-*.mjs`. `node tools/verify-package.mjs` checks the built `dist/` package at the real project subpath, including cache upgrades and server-stopped reloads. No external account or additional package installation is needed.

No known art or mechanics blocker remains. Physical-device touch, native keyboard, VoiceOver, notch safe-area behavior and hardware rendering performance remain device acceptance work; browser emulation is identified honestly throughout this evidence.

## Delivery status

The requested seven screenshots, two motion captures and this report are staged in the task's `deliverables/` directory. Library saving was attempted through the current bundled prepared-upload helper. The helper's authenticated discovery reports `Library prepare_uploads is not available` in this execution environment, before any upload preparation or file creation. **Zero files are confirmed saved and no Library IDs were issued.** The batch request and diagnostic are preserved beside the deliverables for a supported retry from an environment with that capability. No alternate transfer route, new credential or security-setting change was used.
