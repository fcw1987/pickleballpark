# Luna recreational-player UI pass (beta)

Date: 2026-09-13  
Branch: `qa/beta-luna-round1` at `d669348`  
Server: `PORT=4191 node tests/helpers/static-server.mjs`  
Browser: Playwright Chromium, visible headed mode; fresh browser context per journey.

## Blind journey and coverage

I began from the rendered starter play, without reading implementation or interface documentation. The initial visible play is “Starter Serve, Return & Third” with three chapters: Serve, Return, and Drop. Playing it showed the ball and players move through Serve at about 0.7s, Return at about 1.9s, and Drop at about 3.0s. A complete headed playback was recorded to `/private/tmp/luna-round1-video/page@b7606cfc31959fd3b6789f61bb2cb845.webm` and inspected in VLC at the return phase.

The visible chapter chooser exposes “Shot 1 · Serve”, “Shot 2 · Return”, and “Shot 3 · Drop”, each with its own Edit control. Editing Shot 3 and changing the Shot family combobox to Drive immediately updates the banner, chapter label, target description, and playback duration. Opening Details exposes Target width/depth, target presets, arc, pace, receiver, contact style, and movement controls. Editing Target width from 7 to 9 produced the visible description “Authored drop to (9.0, 27.0).”

`+ Add` opens Shot 4 details with a default Drive and Orange 1 hitter while keeping the playhead on Shot 1. Save As makes an immediate local copy named with a “ — copy” suffix and the Menu then says “Saved on this device.” Help opens a readable modal covering building a play, playback, save scope, 2D/3D, court layout, touch, keyboard, drawing, and theme behavior. The 3D and 2D buttons switch between the angled court and top-down court views and preserve the same playhead.

## Reproduced validation path

This is reproducible and appears to be invalid-target validation rather than a data-loss defect:

1. Open the chapter chooser, choose `Edit Shot 3`, and press `Place target on court`.
2. Tap/click the visible court point around `(560, 390)` in a 1280×800 viewport.
3. The UI selects `2. Return`, shows `Shot 3 needs attention`, shortens the visible play duration to 2.5s, and reports “Playback is paused because Shot 3 is not valid yet. Fix that shot before previewing the rally.”

Nearby points that remain valid (for example `(540, 390)`, `(520, 390)`, and `(540, 420)`) keep Shot 3 selected and update its visible target coordinates. The touch cancellation path works: after arming placement on a 390×844 touch page, `Cancel target` visibly reports “Target placement cancelled.” A touch outside the court while placement is armed leaves placement armed and can open Playback options if it lands on the bottom controls; this is recoverable with Cancel target.

## Compact, theme, and motion inspection

Screenshots captured in `/private/tmp`:

- `luna-round1-390x844.png`: readable court and controls; labels truncate (`1. Ser...`) but remain usable.
- `luna-round1-320x568.png`: hamburger-only Menu and shortened `Shot 1,...` label; court, Play, timeline, and overflow remain visible.
- `luna-round1-844x390.png`: landscape view keeps all top controls and the bottom timeline visible.
- `luna-round1-help.png`, `luna-round1-theme-1.png`, `luna-round1-theme-2.png`, and `luna-round1-2d.png`: Help, dark/light themes, and 2D view inspected visually.

The Playwright page-level Meta+/Control+ zoom shortcuts did not change the visible headed page, so a true browser UI 200% zoom was unavailable through the isolated Playwright surface. The compact viewports above were still exercised at the requested dimensions. No private or account data was encountered.

## Commands and result

The scoped visible journey helper is `tools/qa-luna-round1.mjs`. Run it with `PORT=4191 node tools/qa-luna-round1.mjs`; it launches headed Chromium, uses rendered locators and coordinates only, writes screenshots to `/private/tmp/luna-round1-artifacts`, and exits nonzero on a changed expected visible result. `node --check tools/qa-luna-round1.mjs` passes. The only unrelated working-tree item is pre-existing untracked `node_modules`.
