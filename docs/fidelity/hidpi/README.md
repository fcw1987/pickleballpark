# High-density drawing buffer review

Controlled Chromium comparison at 390×844, device scale 3, with fresh storage and service workers blocked. Both captures use the same integrated scene and logical time; only the renderer pixel ratio changes. The snippets are native device pixels, without image resampling.

[Previous 2× drawing buffer](buffer-2x.png) shows softened sprite and court edges when composited onto the 3× surface. [3× drawing buffer](buffer-3x.png) preserves cleaner source pixels and court lines. The candidate raises the existing maximum device ratio from 2 to 3; art resolution, nearest-neighbor athlete sampling, logical geometry, visual ball size and the one session remain unchanged.

[Measurements](comparison.json) cover 120 submitted rally samples per ratio. Both retained 44 geometries and 19 uploaded textures, with approximately 0.2 ms median CPU render submission on this host. This is not a GPU or physical phone benchmark: the 3× buffer contains 2.25 times the pixels of the 2× buffer, and actual device power/performance still needs physical acceptance. No reduced-resolution pixelation is introduced.
