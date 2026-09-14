# Independent Safari acceptance review

Date: 2026-09-13

Candidate reviewed: `7b34060` worktree, including renderer fix `572c561`

## Recommendation

Accept the current candidate for native Safari and close `BETA-001` as **historical, not reproduced on the accepted candidate**. Do not claim that `572c561` fixed the historical Help-only blank or assign that observation a causal root cause. No further release escalation is warranted solely because the original observation remains unexplained.

This recommendation relies on current native Safari evidence, rather than treating Playwright WebKit as a substitute for Safari. `docs/qa/native-safari.json` records 24 controlled Help cycles before the renderer fix and 48 after the real context-loss recovery, with a live singular canvas, non-collapsed buffer, stable resources, no context loss, and no errors. The same current native run also includes a visible Menu > Help > Close journey with the court, four athletes, ball, and target rendered, plus a visible background-and-return check that retained the rendered court. The parked-context mechanism was separately reproduced in native Safari before `572c561`, and the native post-fix run visibly recovered with one replacement live canvas and unchanged source.

The older report remains accurate as historical evidence: native Safari once displayed a blank 3D surface after Help while inspector evaluation and reload were also unresponsive. That run did not establish whether the application renderer, Safari's compositor/GPU process, or the diagnostic window had failed. The current evidence does not retroactively prove a cause or a fix for that exact event.

## Source-path assessment

Help has no direct renderer lifecycle mutation. `playBuilder.action('help')` clears placement state, pauses playback, and opens the shared information modal. Modal open/close only changes overlay classes, `aria-expanded`, body overflow, and focus. It does not park or dispose 3D, replace the canvas, change renderer load generation, or load assets. Opening Help reaches the existing one-frame invalidation through `pause()`; closing the overlay does not issue a new demand frame. Current native repeated visible and controlled checks show that Safari preserves the already presented canvas across that close path, so adding a speculative Help-specific render or continuous loop is not supported.

The bounded renderer mechanisms are coherent:

- `resize()` clamps both axes to at least one pixel, updates renderer size and camera framing, then requests one frame. The builder watches its court region and viewport and forwards changed geometry to the renderer.
- Visibility changes clear the playback timestamp baseline. Hidden state cancels and clears the renderer frame; visible active state requests a new one. A parked viewer remains inactive until normal 3D re-entry requests a frame.
- The demand loop clears its handle before every callback, stops after one paused frame, and schedules another frame only while playing.
- `webglcontextlost` now recognizes both active and parked owned scenes by checking the scene and event canvas. It exits, disposes renderer state, removes the canvas, and presents a safe retry. Re-entry builds one new renderer. Browser context restoration is therefore not relied on.
- Loading uses a monotonically increasing generation plus abort control. Every awaited boundary rejects stale work; a park created after cancellation is explicitly disposed. Workspace exit also disposes scene resources and removes lifecycle listeners.

I found no ordinary Help, visibility, resize, re-entry, context-loss, or load-cancellation path that can leave an owned dead renderer reusable without an exit or a later invalidation.

## Fresh bounded checks

Against a localhost preview of this worktree, `tools/qa-lifecycle-soak.mjs` completed 30 cycles in each engine. Each run included visible-size changes, 30 Help transitions, view parking/re-entry, playback and seeks, and one real parked `WEBGL_lose_context` event. Chromium and Playwright WebKit both ended with one live canvas, a 1428 x 737 drawing buffer, 43 geometries, 17 textures, 10 programs, no pending application or browser animation frames, no errors, and no failures.

`tools/qa-safari-acceptance.mjs` then used the actual visible builder menu and Help close controls over 12 rounds in each engine, alternating paused and playing states across five viewport shapes and four 2D/3D re-entries. Every post-close canvas capture was nonblank, the context remained live, exactly one canvas remained connected, CSS and drawing-buffer axes stayed above one pixel, body overflow was restored, and there were no browser errors. Paused final state had no pending renderer frame. Headless page switching did not set `document.hidden` in either engine, so this probe adds no background-tab claim; the native visible background-return evidence supplies that acceptance check.

The focused probe did expose drawing-buffer dimensions that can lag the CSS canvas dimensions immediately after a viewport change until a later resize or re-entry. The canvas captures remained fully rendered and complex in every such sample, including Playwright WebKit; neither axis approached one pixel. This may warrant separate framing/resolution polish for rotation, but it is not a blank-court mechanism and did not correlate with Help.

## Acceptance boundary

Native Safari acceptance is supported for the current controlled origin and ordinary browser state represented by the recorded run. Physical iPhone/iPad, Safari GPU-process failure injection, memory-pressure eviction, and the unresponsive historical diagnostic state remain outside the evidence. Those limits do not justify retaining a release blocker after the current native visible journey, repeated native lifecycle probes, deterministic context-loss recovery, and both-engine controlled checks all pass.
