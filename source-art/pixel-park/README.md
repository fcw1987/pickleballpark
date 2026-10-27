# Original Leaf Court park art

All sprites are original pixel constructions authored for this application, using no external game assets. The approved concept informed the general park composition only. The atlas uses native 1px art on a 16px tile grid, rendered with image smoothing disabled.

- `atlas-editable.png`: RGBA master with transparent sprite slots.
- `atlas-review.png`: nearest-neighbor 4x atlas inspection.
- `park-review.png`, `phone-review.png`: composition studies at 3x. The court in these review sheets is a measurement guide, not the runtime court renderer.
- `provenance.json`: sprite coordinates and origin.
- `tile-map.json`: adaptive scene layers and review geometry.

Regenerate runtime art with `node tools/generate-pixel-park.mjs` (Node built-ins only). Its original editable rectangle and polygon drawing commands are the source of truth. Optional review sheets: `python3 tools/pixel-park/generate.py` (Pillow); this invokes the Node generator first. Generated runtime atlas: `assets/pixel-park/atlas.png`. Runtime integration: import `drawPixelEnvironment` and `pixelEnvironmentReady` from `pixel-environment.js`; redraw after readiness. Coordinates are native pixel world units, court80x176 for20x44ft. The runtime supplies court position and draws all lines, net and athletes independently.
