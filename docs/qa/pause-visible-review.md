# BETA009 visible Pause review

This review covers the user-facing builder transport on the local beta source and the patched candidate. It uses fresh Playwright browser contexts, visible controls only, and the exact input that exposed the WebKit race: start Play, wait until the control reads Pause, press its center, hold through four real `requestAnimationFrame` callbacks, then release.

The source endpoint was `http://127.0.0.1:4184` at the start of review. In Chromium, the visible Pause button remained `aria-pressed="true"` after the four-frame press/release, so playback continued. The visible long-press regression reproduced the blocker. The initial headed screenshot was also inspected at 1280 × 900; the transport is one bottom-row Play control beneath the court.

The patched candidate was then reviewed at `http://127.0.0.1:4201`. The matrix is bounded to the three requested widths (1280 × 900, 390 × 844, 320 × 700), builder 2D and 3D, a chapter-menu trigger while playing, Play resume from the paused current point, and an actual touchscreen tap at phone width. The regression spec is `tests/qa-pause-visible.spec.mjs`.

The final candidate run is six tests in Chromium (6/6) and six in WebKit (6/6). Each long-press case checks the visible label span, native focus, `aria-label`/`aria-pressed`, a positive timeline value, and timeline stability over six RAFs plus 100 ms before resuming. The old 4184 source had already reproduced the replacement-node miss in the initial manual pass; later 4184 checks were not treated as baseline evidence after the shared runtime was updated.

The candidate acceptance condition is visible state: after the hold/release the single visible transport reads Play with `aria-pressed="false"`, its timeline value is greater than zero, and pressing Play again advances that same timeline value. The chapter-menu case requires the visible builder menu and fails if it disappears; it never falls back to hidden legacy controls. Planner lesson 3D was not forced through a hidden or synthetic control path; the available visible builder path was used for the bounded BETA009 review.

## Integration evidence

Correction: `eedf069`, runtime package `e0177cc` (cache v22). Sol reproduced the old WebKit hold at all three widths (0/3 passed), then the identical cases passed 3/3 on the correction. The original intermittent test failed 2/40 before correction and passed 80/80 afterward. Root's capture-listener diagnostic found one missing builder click in 120 old cycles; the corrected run passed 120 cycles in each engine. The before/after delivered events are retained in [pause-input-events.json](pause-input-events.json).

Fresh independent Sol review found no correction defect: Chromium 20/20, WebKit 19/20 with the existing offline-emulation internal error; session/chapter units 14/14. Held presses retained connected button/icon/label nodes across playback and loop wrap, then paused both clock and session with synchronized accessible labels. Native Safari accepted a held press at the rally endpoint. Explicit Pause defeated delayed scrub release. Root owns final packaged/native acceptance.
