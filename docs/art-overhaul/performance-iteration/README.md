# Rendering cost comparison

The original volumetric candidate doubled the matched Chromium callback median from 16.7 to 33.3 ms. This experiment isolates shadow filtering/resolution and diffuse environment materials with temporary browser overrides before changing the runtime.

All scenarios use one headless Chromium process, sequential fresh contexts, 1440×900 at DPR 1, Third Shot Drop in the overhead camera, a 1.5-second shader/material warm-up, and six seconds of active replay. No timeline, articulation, ball, drawing-buffer resolution or camera-framing changes are involved. Screenshots hold the same drop-contact instant in overhead and behind-orange cameras.

| Temporary render configuration | Callback median | Callback p95 | Draw calls at final sample |
| --- | ---: | ---: | ---: |
| Standard environment, 1024 PCFSoft shadow map | 33.3 ms | 41.8 ms | 83 |
| Standard environment, 512 PCFSoft shadow map | 33.3 ms | 41.7 ms | 84 |
| Standard environment, 512 Basic shadow map | 33.2 ms | 33.4 ms | 84 |
| Standard environment, existing contact ellipses only | 25.0 ms | 33.4 ms | 47 |
| Lambert environment, 1024 PCFSoft shadow map | 25.0 ms | 33.4 ms | 83 |
| Lambert environment, 512 Basic shadow map | 24.9 ms | 25.1 ms | 83 |
| **Lambert environment, existing contact ellipses only** | **16.7 ms** | **25.1 ms** | **46** |
| Lambert environment and actors, contact ellipses only | 16.7 ms | 25.1 ms | 46 |

The world-only Lambert configuration preserves actor materials and matches the original billboard baseline's callback median/p95. Extending Lambert to actors gives no further cadence benefit, so that variant is unnecessary. Geometry remains unchanged; eliminating the shadow pass reduces submitted triangles from roughly 22,194 to 11,158 and removes two shadow-map textures. Draw-call counts vary slightly with the ball's final replay phase.

Astra approved the paired overhead and behind-orange images: athlete silhouettes, jersey colors, court/net form and ball readability remain intact, and the existing ellipses provide sufficient grounding at normal court scale. The runtime now uses world-only Lambert materials and contact ellipses without realtime shadow maps. Actor Standard materials, articulated rig, animation cadence, ball, DPR and geometry remain as reviewed. The existing world regression now asserts diffuse garden materials, visible athlete contact shadows, and the disabled realtime shadow pass. All 23 actor/presentation/animation unit checks pass; the fresh matched runtime comparison is recorded separately by final QA.

Raw results and paired screenshots are in [shadows](shadows/results.json) and [materials](materials/results.json). The warm-up and measurement procedure remains reproducible with:

```sh
node tools/art-overhaul-shadow-performance.mjs /tmp/shadow-performance-recheck
```

`PERFORMANCE_MODES` selects a comma-separated subset. The harness explicitly restores Standard environment materials for control variants, so controls remain reproducible after changing the shipped material choice. It changes only the temporary browser scene, never application files.

These timings describe callback cadence and CPU command submission on local Chromium/SwiftShader. They do not measure displayed FPS, GPU completion time, or physical-phone performance. The apply-at-time CPU median remains about 1.0 ms in this experiment because the fully articulated athletes are still sampled and baked at every authored update.
