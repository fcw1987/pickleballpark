# Luna round 3 exploratory QA

Date: 2026-09-13. Runtime: isolated fresh Chromium profile against `http://127.0.0.1:4197/`; synthetic authored play only. The journey began from the visible UI and used no source or documentation context. Internal state checks were limited to regression assertions after the blind pass.

## Chosen doubles rally and blind journey

I used the visible authored play **Starter Serve, Return & Third**. The intended explanation is: Green 1 serves deep toward the left sideline, Orange returns, and the next authored shot represents the third ball. The landing screen shows four players, a ball, the 3D court, a shot-marked timeline, and Play/Edit/Add controls.

The exact path and observations were:

1. `Play` started the rally and changed to `Pause`; the timeline advanced while the authored court stayed visible. Expectation: a normal-speed serve/return/third replay. Discovery: playback repeats and the current step remains announced.
2. `Edit` opened Shot 1 settings. `Details · coordinates, contact, movement` revealed target width/depth, arc, pace, receiver, contact style, serve method, moving player, movement intent, manual X/Y, pinning, and shot ordering. `Coach tools` revealed Auto Shading and Coverage Guides. Expectation: advanced movement would be near the basic edit affordance. Discovery: it is one disclosure deeper, but fully reachable by visible text.
3. `Menu → Save As` immediately created a copy. After reload, `Menu → My Plays` showed the saved copy. This preserved the edited play in the isolated device profile.
4. `Menu → Help` required waiting for its panel transition to settle; the Help & Information dialog then appeared with the editing, playback, 2D/3D, and persistence guidance. `Escape` closed it and focus stayed trapped while it was open.

The only hesitation was that Help is not present in the immediate accessibility snapshot after clicking; it becomes visible once the transition settles. This is a timing characteristic, not a failed action. The regression waits for the actual dialog.

## Adversarial matrix

The following paths were exercised on fresh contexts and left the authored data unchanged unless the persistence case explicitly saved a synthetic copy.

- Touch sizes: 390×844, 430×932, 320×568, and 844×390. Each switched to visible 2D, sent two coordinate touch taps to the disabled replay token for Player 1, started a Player 2 drag and lifted at (−20,−20), then switched 2D → 3D. These gestures were ignored by the read-only replay surface; the full authored document snapshot remained byte-for-byte unchanged.
- Selected-panel scroll: Edit → Details, scroll the selected settings panel to its bottom, then inspect movement controls.
- Rapid operations: four 2D → 3D cycles interleaved with Details close/open, followed by 430×932 → 844×390 → 1440×900 resizing. The full authored document snapshot remained unchanged.
- Themes: Menu → Appearance toggled light → dark → light; rendered body colors changed and restored.
- Reduced motion: `prefers-reduced-motion: reduce`, then the visible Menu → Appearance control was used to set the app theme to dark (`localStorage['pickleboard-theme'] === 'dark'` and the dark rendered body color), plus a 200% CSS font-size simulation at 390×844. Build controls, 2D, Play, and Pause remained usable.
- Desktop keyboard: while the Play title field contained `Keyboard probe`, Control-Z did not invoke the authored Undo shortcut. Help focus stayed on its close control across repeated Tab presses. The hidden global menu/help controls were absent from the normal tab sequence.

No reproducible blocker, high-severity issue, data loss, focus escape, or visual corruption was found. No fix request is outstanding from this round.

## Evidence and verification

`tools/qa-luna-round3.mjs` records the blind journey states and captures a normal-speed visual run. Evidence is in `docs/qa/evidence/round3/`, including `01-blind-initial.png`, `03-edit-shot.png`, `04-details-open.png`, `05-coach-tools-open.png`, `mobile-2d.png`, `motion-normal-end.png`, `motion-normal.webm`, and the sampled `motion-start.png`, `motion-middle.png`, and `motion-end.png` frames.

The clip was visually sampled at three moments from the same normal-speed run. The start frame shows Shot 1 / Serve in motion, the middle frame shows Shot 2 / Return with the playhead advanced, and the later frame shows the authored replay looping back to Shot 1. These samples verify visible progression and repeat behavior; they are not presented as frame-by-frame inspection of the entire clip.

Command:

```sh
PORT=4197 PICKLEBALLPARK_TEST_URL=http://127.0.0.1:4197 \
  npx playwright test tests/qa-exploratory.spec.mjs --project=chromium --workers=1
```

Result: **9 passed Chromium, 9 passed WebKit**. The suite covers the normal serve/return/third edit and Save As reload, Help focus trapping, all four touch viewports, panel scroll and resize, rapid view/detail toggles, desktop keyboard behavior, reduced motion, explicit app dark theme, and simulated 200% text.
