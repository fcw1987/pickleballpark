# Unified iPhone builder candidate

Verified against the completed `4816210` court-centered source, which already contains `d9b75d7` from draft PR #16. No equivalent patches or archived private development history were merged. Runtime checkpoint: `7bfb7ddf49627aae29e326ff3342c4e0e2f8ca38`; final package uses this exact runtime fixture. This is an isolated successor draft candidate, not a production deployment.

## Preserved and newly implemented

Preserved: compact File/Plays grouping, contextual inspector, direct paused target dragging, explicit cancellation, hidden target guard, Preview destination only acknowledgement, eight lessons, one playhead, Loop, planner restoration, original characters/grips/ball/park, demand rendering and local backup format. The earlier court-centered pass is not claimed as new work.

New: shared shallow phone editor (family, hitter, target, flight) with full scrollable Details; per-player movement destination and pin editing through the existing compiler; coherent offcourt movement bounds; 44 CSS-pixel phone controls where practical; visual-viewport/safe-area adaptation; recoverable invalid fields and imports; local conflict detection; and cancellation on loss of pointer ownership or changed projection. Exact coordinates are displayed to three decimals while unedited source/export values remain unchanged. The schema remains version 1 with an optional `playerMovement` map: old builds cannot faithfully preview those additional partner commands. See [schema](BUILDER_SCHEMA.md).

## Phone workflow and evidence

Before: open the inspector and work through small stacked fields; partner movement was not fully authored through the visible interface; narrow placement left too little court. After: select a shot, use the shallow card, tap Place target (or drag an already visible paused target), then Cancel or finish one gesture. Details provides receiver/contact/serve options, exact values, Moving player, intent, destination and pin. Done closes committed undoable changes; it is not a destructive cancel. File holds saved work/import/export; Plays holds lessons/planner/new draft.

The recorded test authors a named custom rally, changes serve placement, edits the return, selects a drive as shot three, adds a fourth shot, changes partner movement, toggles assistance/guides, undoes/redoes, reloads, visits a lesson and returns through Planner. It asserts four valid compiled shots before playback and exact saved document equality on return.

- Phone browse: [before](iphone-builder/before-workflow/390x844-browse.png), [after](iphone-builder/after-workflow/390x844-browse.png)
- Phone detailed editing: [before](iphone-builder/before-workflow/390x844-details.png), [after](iphone-builder/after-workflow/390x844-details.png)
- Narrow placement: [before](iphone-builder/before-workflow/320x568-placement.png), [after](iphone-builder/after-workflow/320x568-placement.png)
- Landscape placement: [before](iphone-builder/before-workflow/844x390-placement.png), [after](iphone-builder/after-workflow/844x390-placement.png)
- Tablet portrait: [before](iphone-builder/before-workflow/768x1024-browse.png), [after](iphone-builder/after-workflow/768x1024-browse.png)
- Tablet landscape: [before](iphone-builder/before-workflow/1024x768-browse.png), [after](iphone-builder/after-workflow/1024x768-browse.png)
- Desktop: [before](iphone-builder/before-workflow/1440x900-browse.png), [after](iphone-builder/after-workflow/1440x900-browse.png)
- [Phone recording](iphone-builder/recording/phone-authoring.webm), [final custom view](iphone-builder/recording/custom-phone.png), [exported custom source](iphone-builder/recording/custom-play.json)

Captures are application-only Chromium desktop emulation. State gallery uses DPR1; touch workflow uses DPR2, with additional DPR3 input coverage. The video is a short accelerated authoring walkthrough with ordinary playback timing, not a claimed human-paced tutorial or runtime FPS measurement. Chronological 0.5-second decoded frames were independently inspected; this is not frame-exhaustive video inspection. [Enlarged text](iphone-builder/phone-200-text.png) uses the retained readable vertical reflow (scrolling is required at 200%); [dark tablet details](iphone-builder/tablet-dark-details.png) and [wide desktop](iphone-builder/wide-desktop.png) were also inspected. No physical iPhone/iPad, actual Safari, VoiceOver, hardware keyboard or installed-PWA acceptance is claimed. Keyboard-height changes are simulated. Playback gallery frames occur shortly after 0.6 seconds, so only paused opening/placement comparisons are exact-time matches.

## Court and camera measurements

Painted court polygon in CSS square pixels, canonical four court corners projected into the actual viewport. Same starting draft and named camera; the new wide-view angle is explicitly different. Grass/canvas area does not count.

| Viewport | State | Before | After | Change |
|---|---|---:|---:|---:|
| 390×844 | browse | 63,708 | 54,054 | -15.2% |
| 390×844 | placement | 53,981 | 78,455 | +45.3% |
| 320×568 | browse | 13,948 | 13,998 | +0.4% |
| 320×568 | placement | 12,864 | 21,988 | +70.9% |
| 844×390 | browse | 50,152 | 55,094 | +9.9% |
| 844×390 | placement | 50,152 | 55,094 | +9.9% |
| 768×1024 | browse | 119,088 | 119,088 | +0.0% |
| 768×1024 | placement | 111,202 | 111,202 | +0.0% |
| 1024×768 | browse | 125,012 | 88,897 | -28.9% |
| 1024×768 | placement | 122,008 | 88,897 | -27.1% |
| 1440×900 | browse | 251,377 | 179,906 | -28.4% |
| 1440×900 | placement | 251,377 | 179,906 | -28.4% |

Phone placement improves by temporarily hiding sequence/assistance chrome; cancelling restores it. The 390px browse court is smaller because readable native inputs and touch controls use more height. Tablet/desktop camera changes from `[12,16,1.5]` to `[12,16,3.5]` reveal the net and separation; the deliberate framing cost is reported rather than claimed as area improvement. Portrait camera identity remains. All existing presets remain available. No court dimensions or tactical positions changed. [Raw before](iphone-builder/before-workflow/measurements.json) and [after](iphone-builder/after-workflow/measurements.json).

## Reliability and regression evidence

- Two tabs could overwrite the same saved draft. Saves now compare the observed stored version; a conflict preserves the in-memory work and offers Save a copy. Quota failure retains Retry; unrelated drafts do not conflict. The new old-source reproduction fails against `4816210` and passes on the candidate.
- Imported IDs could replace a saved draft. Imports now create a copy identity; invalid imports retain the text and error. The old-source regression demonstrates the overwrite.
- Pending title text could be lost on backgrounding. Completed fields blur/commit before page hide; an old-source regression demonstrates the loss. Local save status distinguishes pending editing, success and failure.
- Gesture interruption could leave stale ownership. Pointer cancellation, lost capture, second touch, resize, shot change, playback and view transitions clear the operation. Tests preserve exact coordinates and Undo; native touch tests activate the real placement control before sampling its resized projection.
- Future movement pins incorrectly influenced earlier coverage. Protection now follows shot order; current/manual and persistent locks remain authoritative. Tests compare the same earlier result before/after a future pin and preserve the later exact destination.
- WebKit exposed a stale Pause label at final-event completion: a live-state toggle could restart instead of pause. The button now requests an explicit state. A deterministic regression fails before the correction and passes in both engines; the phone workflow restarts before its measured playback interval and asserts exact paused time across views.
- Full browser testing caught landscape imported-status overlap with Add shot. Status is bounded and scrollable, the collapsed editor is compact, and the actual import/add workflow now passes.
- Visual review caught narrow placement, sheet/menu overlap, floating-point noise and clipped Restart text. Corrected with a focused placement layout, closed-menu stacking, display-only precision formatting and compact label padding.

Saved source remains separate from presentation. Autosave does not write frame samples. Library records are cached until edits/storage events instead of reparsing all stored plays per rendered frame. Intermediate waypoints remain in imports/exports, require explicit Preview destination only acknowledgement and are not claimed as animated paths. Partner waypoint metadata follows the same gate.

## Performance and package

Matched headless Chromium 149 on macOS/SwiftShader software rendering, 1440×900 DPR1, starter draft, overhead, 1× Loop; two 30-second samples after two logical seconds of warmup. Baseline readiness 826/763 ms; candidate 846/779 ms. Encoded resource bytes 1,556,483 → 1,582,744. RAF median 8.8 → 8.4 ms, p95 16.9 → 16.7/16.7 ms, p99 17.5/17.2 → 16.8/16.8 ms. Interval proportion above 1.5× observed median: 44.3/45.3% → 37.5/37.5%; bimodal automation cadence means this is not a demonstrated displayed-frame-rate gain. CPU render submission median 0.3 ms, p95 0.4 ms unchanged; p99 0.5 ms unchanged. No trustworthy GPU completion or physical phone performance measurement is claimed.

Measurements were captured at pause-corrected `30c8a36`; final `7bfb7dd` changes only the number field display from six to three decimal places, with unchanged byte count and playback paths.

Resources unchanged: 43 geometries, 17 textures, 57 draw calls; zero paused frames during the one-second settled sample. [Before measurements](iphone-builder/performance-before.json), [after](iphone-builder/performance-after.json). Runtime package: 93 paths, 1,599,946 → 1,626,442 bytes (+26,496; about 1.65%). No assets, production dependencies or new runtime paths added. [Complete runtime comparison](iphone-builder/runtime-comparison.json); frozen manifest digest `d1f19dd68bd834ba4a2b37bb7c679932c1c3f32ee6e8e5211174abcab2cca0b6`.

Service worker advances v18→v19 under the same owned namespace; stable registration/scope/start URL/theme key and draft keys retained. Package validation serves the [existing Pages path](https://fcw1987.github.io/pickleboard/), tests fresh install plus the older public fixture, actual current preview `d9b75d7`/v17, and immediate `4816210`/v18, each in Chromium/WebKit. It verifies hashes, existing open editing state, saved custom source, theme and unrelated caches, then stops the server and opens all eight lessons plus custom work offline. No global cache clearing.

## Checks and independent review

Baseline: `npm run check` 134 unit tests; full Chromium 168 passes. Candidate: `npm ci` succeeds with unchanged dependencies; `npm run check` 146 units, syntax, 90 static paths and brand checks pass; `npm run check:generated` reproduces 63 asset paths. Focused corrected authoring/input 35/35 and phone recording 1/1 pass. Full local Chromium at pause-corrected `30c8a36`: **189/189 passed**. The final display-only formatting change reran all four phone tests successfully; hosted CI checks the exact final candidate. `npm run build:site && npm run verify:package`: **8/8 clean-install/upgrade cases passed**, including all eight stopped-server offline lessons and custom draft reload in each case. [Package results](iphone-builder/package-verification.json). Full local WebKit: **182 passed, seven failed with the existing offline-emulation/cache signatures**. All new iPhone tests pass. Those seven failures are reported, not called local passes; the Linux CI gate separately requires the strict established diagnostic policy.

Luna (`gpt-5.6-luna`) implemented shared UI and reviewed actual images/chronological clip samples. Sol (`gpt-5.6-sol`) implemented save and input ownership, reviewed domain integrity and independently verified packaging. Astra integrated and inspected the diff/rendered output; authors' reports were not used as substitutes for combined tests. Review corrections are listed above. [Apple/WCAG source-to-change guidance](IPHONE_INTERFACE_GUIDANCE.md) distinguishes browser standards from native platform behavior.

The strict WebKit infrastructure policy remains tied to seven exact test/signature pairs, unchanged browser version, independent no-app diagnostics, retries, protected file hashes and review expiry. New/unmatched failures block CI; it is not blanket allow-failure. Current service-worker test hashes/counts were updated only for v19 and the added tests. [Tracked infrastructure issue](https://github.com/fcw1987/pickleboard/issues/14).

A new WebKit quota-test failure was traced to assigning a method on its exotic Storage instance, which did not inject the intended exception. The test now supplies an explicit storage adapter and asserts a failed write occurred; all original state/retry checks remain. The four save tests pass on WebKit. This is not a new infrastructure exception.

## Review and handoff

Local preview: http://127.0.0.1:4173/ . On a phone-sized viewport: Edit shot → target → tap or Cancel; Details → Moving player → manual pin; play/pause and switch 2D/3D; use File to save/export/reopen and Plays to visit Planner. Confirm useful touch reach, real keyboard avoidance, rotation and physical-device smoothness during owner acceptance.

Authoritative branch: `integration/unified-iphone-builder`. PR #16 and its `feature/visual-play-builder` Pages source remain untouched. The successor draft PR is the only candidate for this mission; its exact checks/artifact are linked in the delivery report. No merge, force push, branch deletion, deployment or settings change is authorized/performed. Future work should start from this clean public lineage, never archived private history.

## Hosted CI touch-input correction

The first PR #17 run (34296296998) correctly blocked on an unapproved eighth WebKit failure. In the native-touch test, the stored target exactly equaled the received pointer’s court mapping, but the requested fractional screen point mapped 0.110693 feet away on Linux WebKit. The trace requested CSS (116.232383, 616.956834) and received court (2.722288, 39.142832). The test now sends an explicit rounded CSS-pixel position, retaining the original 0.1-foot nominal accuracy, six-decimal received-input mapping, single edit, and Undo assertions. No runtime or infrastructure policy changed. All 11 input tests pass locally in each engine; the replacement hosted run is linked on PR #17.
