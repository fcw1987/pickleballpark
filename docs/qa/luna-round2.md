# Luna round 2 visible QA

Run date: 2026-09-13. Branch: `qa/beta-luna-round2`, starting commit `3270c57`.

The blind journey uses the rendered Park controls at `1280x800`, then reopens the saved copy, watches the complete timeline, checks 3D camera choices, returns to 2D, and sweeps `390x844`, `430x932`, `768x1024`, and `1280x800`. The helper writes screenshots and a JSON result to `/private/tmp/park-beta-luna-round2-evidence`.

## Authored coaching sequence

The existing “Starter Serve, Return & Third” play is extended with shot 4: `Volley / block`, Orange 1 hitter, Green 2 receiver, short-hop contact, centerline target, and Orange 2 partner movement set to `Advance`. The visible numeric inputs are edited and committed with Enter; the centerline preset changes width to `10` while depth remains `5`, and those exact `10`/`5` values persist after Save As, My Plays reopen, and shot-4 editor reopen. Auto Shading, Coverage Guides, and the visible movement pin control are exercised where exposed. The rally remains doubles and the player handedness controls are exercised from Rally details.

## Reproduction helper

```sh
PARK_URL=http://127.0.0.1:4195 node tools/qa-luna-round2.mjs
```

The companion smoke spec is `tests/qa-coaching-visible.spec.mjs` and can be run with the local server through Playwright.

## Blind observations

- Menu, Add shot, shot family, receiver, contact style, movement intent, target presets, numeric inputs, Save As, My Plays, and reload all have discoverable visible paths.
- Save As creates a device-saved “— copy”; My Plays lists it and selecting it reopens the copy. Reloading the same isolated context retains the copy and the extended duration.
- Playback is reviewed with a normal-speed Playwright video recording (14.56s of the corrected full browser journey) and frames decoded every 1s. The authored ~4.8s timeline visibly cycles through serve, return, drop, and volley frames; timeline samples also reach the full duration. This is a full recording review, not a single screenshot.
- 3D mode toggles the `three-d-active` state. Opening the visible `⋮ Playback options` disclosure exposes the Camera selector at both `390x844` and `1280x800`; all four presets (`Overhead`, `Sideline`, `Behind Green`, `Behind Orange`) accept selection. Returning to 2D clears the state.

## Corrected interaction finding

The initial blind pass hesitated because the camera control is behind the `⋮ Playback options` disclosure. The supported path is: click `⋮ Playback options`, then choose Camera. At both required widths the selector is visible and all four options work. This is a discoverability note, not a product blocker.

## What was tried / hesitated / confusing

- In the blind pass, clicking a stale/hidden `#menuToggle` locator and keyboard activation did not open the menu, which caused the initial hesitation. Corrected repro at `390x844` uses the visible `summary[aria-label="Menu"]` bounding box (`69.03x44` at `(12,12)`) and a touchscreen tap at its measured center; the hit element is the visible `Menu` span and the side panel opens. This is a locator-discovery issue, not canvas interception.
- Hesitated at “Edit”: it opens the current shot inspector rather than a global court-position edit mode. Partner movement is instead authored from the shot’s “Moving player” and “Movement intent” controls.
- Expected Save As to ask for a name; it immediately creates a “— copy” and reports “Saved on this device.” This is understandable after the result appears but is not obvious before clicking.
