# Pixel game recording review

This review covers the app-only recordings in [`after`](after/) using Chromium's installed `HTMLVideoElement` decoder and `requestVideoFrameCallback`. The recordings were decoded sequentially because their browser seek ranges report `[0, 0]`; setting `currentTime` directly resets them to the opening frame. Each saved sample records the decoder's actual `mediaTime`, dimensions and cumulative presented-frame count in [`decoded-metadata.json`](after/motion-samples/decoded-metadata.json).

Both recordings decode at 402×874 pixels. [`normal-speed-playback.webm`](after/normal-speed-playback.webm) is 22.16 seconds, and [`phone-authoring.webm`](after/phone-authoring.webm) is 12.48 seconds. The normal recording reaches 536 presented frames by media time 21.40 seconds and the authoring recording reaches 310 by 12.36 seconds, which is consistent with the recorder's roughly 25 fps output. This is recording cadence, not a measurement of application rendering performance.

## Normal playback

The [normal playback contact sheet](after/motion-samples/normal-contact-sheet.png) corroborates the action/state log in [`normal-speed-playback.json`](after/normal-speed-playback.json):

- The 1.08-second sample opens paused with **Play**, Shot 1 and time zero. The 2.56-second sample shows **Pause** and an advancing Shot 1 timeline after the recorded 1× Play action.
- The 4.20-second sample is Shot 2 at about 2.1 seconds. The 7.20-second sample has returned to Shot 1 at about 0.9 seconds, visually bracketing the first wrap. The 10.16-second sample is Shot 3 at about 3.3 seconds, while 11.80 seconds is back to Shot 1 at about 0.2 seconds. Together with the log's `iteration: 2` at 11.726 wall seconds, these samples support two completed repetitions and a second wrap to the opening chapter.
- The 12.64-second frame shows **Play** at the recorded mid-flight pause. A yellow ball, its short 3D trail and the corresponding actor poses are visible. The 14.36-second frame shows **Pause**, a later Shot 2 playhead and changed ball/actor positions after resume.
- The 15.24-second sample is immediately adjacent to the logged scrub/release pair at 15.256/15.260 seconds and still exposes **Pause**. A single image cannot prove that poses remained frozen throughout the drag; the event log and the scrub browser regressions provide that behavioral evidence.
- The 16.44-second sample shows Shot 2 near its chapter anchor after chapter selection while **Pause** remains displayed. The 17.36-second sample is the same active session in 2D, with a clearly visible yellow ball and solid trail. The 19.20-second sample returns to the angled 3D court with the timeline still advancing.
- The 21.40-second sample visibly shows **Play** after the final explicit pause. It is Shot 1 after the log's third wrap, consistent with `iteration: 3` at the final event.

Across these samples the ball remains visible in flight, the trail changes appropriately between the short depth-marked 3D treatment and the stronger 2D line, actors occupy coherent rally poses, and no sampled wrap produces a blank court or missing controls. The screenshots show the state on either side of wraps; they do not establish every intervening animation frame.

## Phone authoring

The [authoring contact sheet](after/motion-samples/authoring-contact-sheet.png) samples the 17 entries in [`phone-authoring-events.json`](after/phone-authoring-events.json):

1. Fresh paused draft and direct serve-target placement appear at 1.12 and 1.88 seconds.
2. Return adjustment, Shot 3 editing and the appended Shot 4 editor appear at 2.60, 3.32 and 4.00 seconds.
3. The 4.76-second Shot 3 details frame exposes Green 2, Manual movement, X 7.4 and Y 13.2. The 5.48-second frame shows both Auto Shading and Coverage Guides checked.
4. The 6.20-second frame shows the restored post-Redo state, and 6.92 seconds shows the saved four-shot work returned to Shot 1. The 41 ms Undo/Redo interval is too short for these samples to show the transient undone frame independently.
5. The 8.84-second frame shows playback in 2D, 10.12 seconds shows the active session in 3D, and 11.04 seconds shows its return to 2D with the playhead advanced. Ball and trail remain visible in both views.

The log contains all 17 named operations and records three shots becoming four, exact target and movement values, independent assistance settings, save/reload, and preserved playing intent through both view switches. Some operations occur closer together than the sampled cadence—Coverage Guides/Auto Shading, Undo/Redo, and reload/2D continuation—so their ordering comes from the structured event log rather than separate visible frames.

The WebM's last decoded frame still displays **Pause**, even after the log records `playing: false` at 11.647 seconds. The separately captured [`phone-authoring-final.png`](after/phone-authoring-final.png) shows the resulting **Play** control and the same paused 3.2-second pose. The recording was closed before Chromium encoded that final DOM-label repaint, so the WebM alone does not visually prove the last Pause click; the event state and final still supply that evidence.

## Limits of this evidence

The decoded PNGs are discrete visual samples from browser video. They establish the rendered controls, court, actors, ball, trails and sampled state changes at specific media times. They cannot by themselves prove continuous smoothness, the duration of every hold, input causality, or the absence of a defect between samples. Exact 1× configuration, iteration counts, selected chapters and authored values come from the recorder's structured state logs and are separately covered by browser tests.

The recordings use Playwright Chromium viewport emulation and contain only the application surface. They do not include browser chrome, a physical phone, native Safari, device compositing, or physical touch latency. The authoring walkthrough uses emulated touch for court placement and assistance toggles; other controls use Playwright's actionability-driven clicks, fills and selections.

