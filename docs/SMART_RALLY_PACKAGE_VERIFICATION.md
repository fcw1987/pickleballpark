# Smart Rally package verification

This package check runs the exact static artifact at the [existing Pages project path](https://fcw1987.github.io/pickleboard/).
It keeps the existing fresh, production, builder, usability, iPhone, beta, stabilized,
and fidelity upgrade modes, then adds `public-upgrade` from the owner-tested public
source `b2b36e2f5c4ad542cdf43a2a03cf1a1f7db27585` on
`integration/robustness-visual-fidelity`.

The public fixture is derived at runtime from that revision's `sw.js` and checked
against its runtime source inventory before each listed byte is hashed. This avoids
using the older approved-runtime fixture as a substitute for the public source.
The candidate cache is read from the packaged service worker and must advance the
public `pickleboard-static-v23` cache pin.

The browser pass checks:

- candidate asset hashes, content types, manifest identity, and exact service-worker cache contents;
- local theme, board state, saved drafts, and an unrelated cache through an upgrade;
- the project's `version.json` endpoint against the loaded build identity, then the retained loaded identity after the server is stopped;
- visible New Play, five Add activations, visible Random Rally at exactly 99 hits, saved old-draft retention, and visible Coach repair with one-step Undo;
- reload and renderer use while the owned test server is truly stopped, in Chromium and WebKit.

The final run is pending the reviewed candidate's stamped runtime manifest and cache
pin. A preliminary run may use a temporary artifact; it must not alter a production
`dist4173` directory.
