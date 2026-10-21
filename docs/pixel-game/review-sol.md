# Sol independent pixel game review

## Review target

This review exercises the integrated local candidate through its public browser surface with fresh, synthetic browser storage. It covers the ordinary 3D court, the 2D fallback, desktop at 1440 × 900, phone at 402 × 874, light and dark themes, normal motion, contextual authoring, a 64-shot synthetic document, save failure, retained waypoint disclosure, keyboard use, and renderer loading boundaries. No private draft data appears in the screenshots or test fixtures.

The review uses `tests/pixel-game-review.spec.mjs`. Its screenshot attachments are generated test artifacts rather than committed product assets.

## Findings and corrections

### Exact chapter boundaries selected conflicting shots

At a timestamp shared by two segments, the canonical ball/state sampler selected the destination segment while Guided and 3D presentation code selected the preceding segment. A chapter jump could therefore show the correct ball at Shot 2 while retaining Shot 1's actor phase, path, progress label, or cue.

The corrected presentation selectors now use the same strict end-boundary epsilon as the canonical sampler. A cross-view browser audit checks every chapter in all eight lessons and the current custom rally, then checks the 3D step and rally leg. Initial time zero remains the ready state. The related Guided, presentation, and 3D animation suites pass 18/18.

### The resting inspector masked too much of the phone court — corrected

The first integrated capture showed the nominally collapsed inspector at 176 × 133 CSS pixels in both desktop and phone layouts. On the phone it still exposed the Flight field and covered the far player and park sign. The corrected interface removes the collapsed inspector from layout entirely. Fresh light and dark captures now show an unobstructed court, and the geometry assertion passes.

### Chapter-to-edit keyboard focus was lost — corrected

Opening the chapter picker with the keyboard and pressing Enter on `Edit Shot 2` initially opened the correct inspector but dropped focus to the document body. The corrected transition moves focus to the visible Shot family control. Typed title input also remains focused through repeated render scheduling and persists after blur and reload. The complete keyboard and persistence case now passes.

### The phone top action row reaches the shell edge — bounded

The corrected 402 × 874 capture made the final 2D toggle appear clipped because its pixel shadow reaches the fixed shell edge. A follow-up geometry audit measures every visible top-bar button and summary independently. Their interactive boxes and content remain inside the viewport, document `scrollWidth` stays bounded, and the test passes. The edge shadow is minor visual polish rather than a functional blocker.

## Confirmed behavior

- The ordinary authoring transport exposes one Play/Pause button and one semantic slider. Previous, Next, Restart, and Loop actions are absent.
- A real-time phone run advances the builder rail from the shared clock. Pause freezes the exact time. Chapter selection stays paused, and switching between ready views preserves that playhead.
- The 64-shot synthetic document keeps all 64 Edit routes in a bounded scrolling chapter picker. The final authored shot remains editable even when it is outside the valid compiled prefix, Add is disabled at the supported limit, and editing that shot does not replace the current playback chapter.
- Unsupported intermediate waypoints block Play until `Preview destination only` is chosen. A storage quota failure keeps the edited document in memory and presents Retry save. A deliberately delayed 3D completion cannot override an explicit Pause.
- Light and dark theme surfaces use the same pixel frame vocabulary, native controls, visible focus styling, and readable contrast. Fresh corrected screenshots were inspected at desktop and phone sizes, and all interactive controls remain within their viewports.

## Commands and evidence

- `node --test tests/coaching-session.unit.mjs tests/shot-chapters.unit.mjs` — 14 passed.
- `npx playwright test tests/plays.spec.mjs tests/three-d-animation.spec.mjs tests/park-presentation.spec.mjs --grep-invert offline` — 18 passed after the boundary correction.
- `npx playwright test tests/pixel-game-review.spec.mjs --workers=1` — all five cases passed after the resting-card and focus correction, including independent bounds for every visible top-bar control.

VoiceOver rotor and hardware-device touch behavior were not exercised. The review covers semantic slider exposure, keyboard endpoints, emulated touch, and browser focus, but it does not claim physical iPhone assistive-technology validation.
