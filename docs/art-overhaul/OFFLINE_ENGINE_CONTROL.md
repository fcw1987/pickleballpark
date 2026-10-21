# Automated offline reload control

The focused WebKit engine run passed 14 rendering, contact, grounding, net, mobile layout and full framing checks. Its separate offline test failed during `page.reload()` after `context.setOffline(true)`, before app startup, with `WebKit encountered an internal error`.

`offline-engine-control.mjs` reproduces that behavior using an independent one-page HTML fixture and a minimal service worker. It contains no Pickleball Park application code. Both engines first confirm the fixture is present in Cache Storage. Chromium reloads it successfully after automated offline mode; WebKit reports the same internal reload error. Recorded results are in `offline-engine-control.json`.

Run the control from the repository with `node docs/art-overhaul/offline-engine-control.mjs`. It temporarily serves port 4219, launches the installed Chromium and WebKit engines sequentially, closes both, and writes `/tmp/pickleboard-offline-control.json`.

This demonstrates a limitation of the installed WebKit automation offline toggle; it does not independently establish real-device Safari offline behavior. The application offline test remains unchanged in intent. Final packaged offline verification must stop its owned HTTP server while keeping browser networking enabled.
