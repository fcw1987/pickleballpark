# Reference Depth Park editable source

`depth-park-environment.js` is the editable scene layout, geometry, surface texture and material source. All coordinate values in that module are feet; its root converts to metres. Foliage is rooted at terrain level and camera-facing at every orbit angle. Other props are full geometry with correct depth occlusion.

The generated original detailed tree is `assets/reference-depth/park-tree-v1.png`. Its actual alpha is preserved. `environment-provenance.json` records the built-in imagegen prompt and origin. It was generated for this project without extracted game assets, third-party assets, API fallback or paid packs.

There is no framebuffer pixelation. Detailed source art and nearest texture magnification retain the pixel illustration language; camera resolution stays native. Geometry includes a real gabled terracotta roof, four-sided clapboard clubhouse, mullioned windows, paneled door, readable PARK sign, silver posts/rails, plank benches, petal flowers, edged sandy paths and a separate pond bank/water surface.
