# Pickleball Park — visual review wave 3

Review date: 2026-09-14, America/Los_Angeles. Candidate: `http://127.0.0.1:4184`. Review method: fresh isolated Playwright Chromium contexts with `serviceWorkers: 'block'`; no native Safari, CUA, hidden application APIs, dependency installs, core edits, commits, push, merge, deploy, or remote changes.

## Revision and evidence boundary

The first visible sample was taken around 20:34 PDT from HEAD `fd9568698b3191bdfd1910297a973ab4c250ee89`. The repository changed while the review was running; the final read-only boundary check at 21:21 PDT reported HEAD `a492d28ce862e7c6ab65b36d3e11145b485008a8`. The post-boundary screenshot at 21:22 PDT still showed the same starter surface and timing. Earlier screenshots should be treated as observations of the candidate before that integration boundary; the post-boundary screenshot anchors the latest check.

Follow-up handoff boundary: at 21:25 PDT, Astra reported root `a970faf` with `c9fa42a` included and ongoing Luna selection-row/panel refinement. The earlier pin-recovery evidence in this report was captured on `a492d28`, which includes `c9fa42a`; that route is direct evidence of the correction. A local read-only check reported HEAD `2bc19242a083f381deec84b60d6926b662ef8249`, but the `2bc1924` UI was not captured. No visual claim is made here about `2bc1924`, `a970faf`, or the newer Luna UI. The incoming handoff was from Astra; this review reports observed product UI and does not set product direction.

Evidence is sampled UI state. The PNGs below are individual frames. I also recorded one normal-speed WebM clip, but did not watch the entire recording visually; ball and chapter conclusions come from the sampled frames and the live playhead labels.

## Visual gate

**Conditional pass — original, coherent pixel-game surface with bounded polish still needed.**

The court, players, ball, props, palette, and 2D/3D controls feel authored for Pickleball Park. At 390×844 the court remains the visual focus in the resting state. At desktop scale the court has a convincing perspective and the art stays crisp. The 2D replay makes the line geometry and ball trail especially easy to follow.

The main remaining fidelity issues are responsive density and editor affordance. The authoring panel reads like a web form laid over the game, and the environment around the court becomes a large, mostly static grass field at 1440×900. These are bounded visual improvements rather than a need for a new feature architecture.

## Required viewport review

| View | Result | Evidence |
| --- | --- | --- |
| 390×844 | Resting court is clear; top and bottom rails frame the play well. Details panel covers most of the court but remains scrollable. | [initial 390](review-wave3/initial-390x844.png), [post-boundary 390](review-wave3/post-boundary-390x844.png) |
| 320×568 | Court still reads, but `1. Ser...` truncates in the chapter button. Shot details initially expose only the upper form; target and intent controls require panel scrolling with little visual cue. | [initial 320](review-wave3/phone320x568-initial.png), [details 320](review-wave3/edit-serve-320x568.png) |
| 844×390 | Landscape composition works, but the inspector occupies the right half and only its upper fields are visible before scrolling. The shot summary in the header truncates. | [initial landscape](review-wave3/landscape844x390-initial.png), [details landscape](review-wave3/edit-serve-landscape844x390.png) |
| 1440×900 | Strongest court presentation; pixel art is crisp and readable. The grass surround is broad and visually quiet, so the world feels flat beyond the court. | [desktop](review-wave3/desktop1440x900-initial.png) |
| 390×844 at DPR 3 | Raster output is 1170×2532 and remains crisp; text and pixel edges hold up at high device scale. | [DPR 3 sample](review-wave3/phone390x844-dpr3-initial.png) |

## Visible journey and outcomes

### Authoring a serve, return, and third shot

1. Open the visible `1. Serve` chapter chooser. It exposes `Shot 1 · Serve`, `Shot 2 · Return`, and `Shot 3 · Drop`, each with its own `Edit` action. The chapter menu is coherent and quick to understand: [chapter menu](review-wave3/chapter-menu-390x844.png).
2. Choose Shot 3, select `Edit`, change `Shot family` from `Drop` to `Drive`, and choose `Done`. The header and chooser update to `3. Drive`; the live summary reads `Authored drive to (7.0, 27.0)` and the rally shortens from 3.7 seconds to 3.3 seconds. This is a good visible confirmation of an authored change: [custom Drive chapter](review-wave3/custom-third-drive-chapters-390x844.png).
3. For Shot 1, `Edit` opens `Shot 1 details` with `Shot family`, `Hitter`, `Place target on court`, and `Edit by intent`. The serve summary is concrete (`high arc`, `medium pace`, `deep toward the left sideline`). The panel is legible, but the native select-like fields and tab grid are the most generic web-form-looking part of the product: [serve details](review-wave3/edit-serve-390x844.png).

### Target placement and exact values

1. Choose `Place target on court`. The visible instruction changes to `Tap to place Shot 1's target. Cancel keeps the current target.` Click a point on the visible canvas; the target ring moves immediately and the app saves on the device.
2. A test placement around 70% canvas width and 33% canvas height produced a precise rule response: `The serve target must be in the diagonal receiving service court beyond the non-volley-zone line.` It asks for the opposite service box beyond the kitchen. The authored target stays visible; it is not silently rewritten: [target placement result](review-wave3/target-placed-390x844.png), [validation details](review-wave3/validation-details-390x844.png).
3. `Edit by intent` exposes Target, Flight, Players, Movement, Coach Tools, and Precision. Sampled exact values after direct placement were `Target width 15.748` and `Target depth 8.197`. The panel also exposes the default `Manual X 15`, `Manual Y -1` movement values. Flight has `High / steady`, `High`, and `Medium`; Players exposes receiver, contact style, and serve method: [Flight](review-wave3/intent-flight-scrolled-390x844.png), [Players](review-wave3/intent-players-scrolled-390x844.png), [Movement](review-wave3/intent-movement-scrolled-390x844.png), [Precision](review-wave3/intent-precision-scrolled-390x844.png).

### Pinned movement validation and correction path

1. Open `Edit → Edit by intent → Movement → Place movement on court`, then click a deliberately far destination for Green 1. The placement prompt is explicit: `Tap a movement destination to pin this player.`
2. The app preserves the pin and reports `Shot 3 needs attention`. The exact rule is visible: `Green 1 is pinned at (16.0, 1.5) and cannot reach this contact without relaxing that authored lock.` It offers `Review Shot 3` and `Edit Green 1 pin · Shot 1`: [pinned validation](review-wave3/pinned-movement-validation-scrolled-390x844.png).
3. Click `Play`. The button remains visually available, but no Pause state appears and the playhead stays at `0:00.0`. A red message explains `Playback is paused because Shot 3 is not valid yet. Fix that shot before previewing the rally.` This correctly blocks downstream playback without teleporting the player: [blocked Play attempt](review-wave3/pinned-play-attempt-390x844.png).
4. Click the attention banner, then `Edit Green 1 pin · Shot 1`; the origin editor opens. Explicitly uncheck the visible pin checkbox and choose `Done`. The attention message clears and playback can resume: [origin correction](review-wave3/validation-edit-origin-shot1-390x844.png), [cleared state](review-wave3/pinned-movement-unpinned-cleared-390x844.png).

The feedback and correction path is clear enough for a power user: the app names the affected downstream shot, states the authored constraint, preserves the intent, and routes back to the origin. The one improvement I would make is visual: give the `Edit Green 1 pin · Shot 1` action stronger separation from the rule text so the correction path is scannable on a small screen.

### Playback, tracking, view modes, and advanced controls

1. Toggle `2D`; the button becomes `3D`. The 2D view has clearer court geometry and keeps the target ring readable: [2D view](review-wave3/initial-390x844-2D.png).
2. Press `Play` at normal speed. Sampled frames at 0.9s, 1.8s, 2.7s, and 3.5s update the current chapter from Serve to Return to Drop. The yellow ball, amber flight trail, current shot label, and playhead are trackable. At 2.6s, seeking the visible range slider selects `Shot 2, Return` and displays `0:02.6 / 0:03.7`: [0.9s](review-wave3/play-sample-t0_9-2D-390x844.png), [1.8s](review-wave3/play-sample-t1_8-2D-390x844.png), [3.5s](review-wave3/play-sample-t3_5-2D-390x844.png), [seek](review-wave3/seek-shot3-390x844.png).
3. Open `Playback options`. The advanced controls are findable after expanding the disclosure: speed `0.25×`, `0.5×`, `1×`, and camera `Overhead`, `Sideline`, `Behind Green`, `Behind Orange`: [Playback options](review-wave3/playback-options-390x844.png).
4. Open `Edit by intent → Coach Tools`. `Rally details`, `Player handedness`, and `Coach tools` are nested disclosures. Open `Coach tools` to find `Auto Shading` and `Coverage Guides`; both toggled on successfully and the court shows `Suggested Coverage · instructional approximation`: [toggled tools](review-wave3/coach-tools-toggled-390x844.png).

Normal-speed clip: [rally WebM](review-wave3/page@f0a5bcac9baec6fb6f1fb4850d2ea713.webm). This is a recording artifact, not a claim that the entire recording was watched frame by frame.

### Help, menus, and save/reopen

- `Menu` opens a coherent Park Desk menu with Play file, Learn, Court Planner, Import / Export, Help, and Appearance. `Appearance` toggles the dark theme directly; the change is visible immediately: [dark theme](review-wave3/appearance-390x844.png).
- `Help` opens a readable in-app information panel covering authoring, playback, court layout, keyboard, shading, and persistence. It is useful but becomes a long wall of copy on a 390px screen: [Help](review-wave3/help-390x844.png).
- `Menu → Play file → Save As` creates `Starter Serve, Return & Third — copy` and reports `Saved on this device`. In the same isolated context, `My Plays` lists the copy and clicking it reopens the play with the copied title: [My Plays](review-wave3/my-plays-after-save-same-context-390x844.png), [reopened copy](review-wave3/reopened-copy-390x844.png).

## Strongest bounded improvements

1. Give the actionable `Add` control a clearer enabled state. In the resting 390 and 320 views its pale fill and near-white label look disabled beside the deliberate green 2D and Play buttons, even though Add opens the next Shot details panel: [Add flow](review-wave3/add-shot-390x844.png). This is the least intentional-looking control.
2. Improve small-screen editor orientation. Keep the current panel and tabs, but add a small persistent scroll cue or section position indicator. At 320×568, the panel shows the upper form and the lower target/intent controls disappear below the fold; at 844×390, the inspector hides the right half of the court and only the upper fields show before scrolling.
3. Reduce target-label collisions with player sprites. The ring and label remain trackable, but the initial target label sits close to Green 1 and the Return target at the seek frame sits close to the receiver. A small label offset or collision-aware nudge would preserve the authored target while improving ball/target reading.
4. Strengthen environmental depth around the court at desktop scale. The pixel props and palette are coherent, but the wide grass field is visually flat and quiet around the court. A bounded background contrast or depth cue would keep attention on the court without changing the scene structure.

## Final assessment

Pickleball Park feels like a real original pixel-game coaching surface when the court is visible and playback is running. The ball, trail, chapter label, and timeline work together. The authoring model respects domain constraints and makes infeasible pinned links reviewable and correctable. The remaining work is polish around responsive editor affordance, target-label placement, and environmental depth; the visual gate is a conditional pass.

## Acceptance addendum — current HEAD `7c5f7fa`

Capture boundary: 2026-09-14, 21:28 PDT. I read only the current HEAD/status before the visible journey, then used fresh isolated Playwright Chromium contexts against `http://127.0.0.1:4184` with `serviceWorkers: 'block'`. No source was read first. No native Safari, CUA, core changes, or commits were used.

### Latest visible states

| View | Menu | Editing | Coach tools | Evidence |
| --- | --- | --- | --- | --- |
| 390×844 | Park Desk menu is a coherent pixel panel with Play file, Learn, Court Planner, Import / Export, Help, and Appearance. | Shot details now use side-by-side `FAMILY` and `HITTER` cards with colored pixel markers, then `Place target on court` and `Edit by intent`. | Icon-labeled intent rows and a framed `SHADING & GUIDES` card read as part of the game editor. Both checkboxes toggle and the court announces `Suggested Coverage · instructional approximation`. | [390 Menu](review-wave3/rereview-390x844-menu.png), [390 editing](review-wave3/rereview-390x844-edit.png), [390 Coach tools](review-wave3/rereview-390x844-coach-tools-toggled.png) |
| 320×568 | One vertical menu reaches the fixed footer; `Appearance` is positioned at about y=425–467 CSS px and is crowded/partly covered by the footer. | One-row `Shot 1` token stays readable, and the footer says `Shot 1, Serve`; no second header row appears. Family/Hitter cards remain legible. | The settings card is reachable by scrolling, but the intent tabs are above the visible viewport once the lower card is open. | [320 Menu](review-wave3/rereview-320x568-menu.png), [320 editing](review-wave3/rereview-320x568-edit.png), [320 Coach tools](review-wave3/rereview-320x568-coach-tools.png) |
| 1440×900 | Menu panel is compact and leaves the court readable. | Right-side inspector leaves roughly two-thirds of the court visible and keeps the pixel scene in context. | Coach tools remain a framed game-editor card on the right, with the court still carrying visual priority. | [desktop Menu](review-wave3/rereview-1440x900-menu.png), [desktop editing](review-wave3/rereview-1440x900-edit.png), [desktop Coach tools](review-wave3/rereview-1440x900-coach-tools.png) |

The 320×568 device-scale-2 sample is 640×1136 raster pixels. This is a DPR2 density check only, not a 200% text-size test; the heading, Family/Hitter labels, field values, and footer timing remain crisp and readable: [320 DPR2 initial](review-wave3/rereview-320-dpr2-initial.png), [320 DPR2 editing](review-wave3/rereview-320-dpr2-edit.png).

### Brief current rally

From a fresh 390×844 context, I switched to 2D, pressed Play, and sampled the visible running state at 0.9s, 1.8s, and 3.4s. The live labels were respectively `Shot 1, Serve`, `Shot 2, Return`, and `Shot 3, Drop`; the yellow ball, amber trail, footer playhead, and current chapter remained trackable. These are sampled frames, not a claim that an entire recording was watched: [0.9s](review-wave3/rereview-rally-390-t0_9.png), [1.8s](review-wave3/rereview-rally-390-t1_8.png), [3.4s](review-wave3/rereview-rally-390-t3_4.png).

### Acceptance judgment

The current editing surface reads as an integrated pixel-game coaching tool at 390×844 and 1440×900. It still uses familiar select fields, but the current Family/Hitter cards, pixel markers, icon intent rows, palette, court context, and nested Shading & Guides card give those controls a coherent game-editor language. This is no longer a fundamental web-form mismatch.

The old Add-looks-disabled and truncated-320-header findings do not apply to HEAD `7c5f7fa`: Add is visibly green/actionable, and the 320 header is a single readable `Shot 1` token with the footer `Shot 1, Serve`. The current actual defect is bounded to the 320 Menu lower-action collision/crowding, plus the weaker orientation caused by scrolling the editor until its tab row is off-screen. A small responsive adjustment to keep the Menu’s lower actions above the fixed footer, and a modest editor position cue at 320, are sufficient; no new architecture is indicated.

**Final acceptance addendum: PASS with one bounded 320px polish defect.** The current root is visually acceptable as an integrated original pixel-game tool, subject to fixing the Menu/footer collision before calling the small-screen composition fully finished.

## Correction — repaired 320 Menu and actual 200% text test

Capture boundary: 2026-09-14, 21:45 PDT. Requested runtime was `runtime2dc5ce6`, cache `v23`, and UI candidate `7c5f7fa`; the local read-only repository HEAD at the check was `7be0c58343bdeacebd00332e82cf31541a850f1f`. The following claims are from a fresh visible Playwright capture against `4184`; no source was read and no core files were changed.

### 320 Menu correction

The earlier collision was reproduced before the narrow fix with the lower Menu item at approximately y=465 against a footer beginning around y=438. On the repaired current UI, `Menu` opens a `.builder-menu-panel` with a 364px viewport, 439px scroll height, and `overflow-y: auto`. A real mouse-wheel scroll over the visible menu produced `scrollTop: 91`; `Appearance` moved to y≈334 with a 42px hit area, became fully reachable, and clicking it succeeded and closed the menu. The final scrolled state is preserved here: [final 320 Menu](review-wave3/final-menu-320x568.png). The post-click theme state is here: [Appearance activated](review-wave3/final-menu-320-appearance-activated.png).

This fixes the previously reported 320 Menu/footer collision. The current 320 Menu journey is accepted.

### Actual 200% html text-size test

The earlier DPR2 screenshots are density-only evidence. In a separate fresh 320×568 context, I set the actual visible document root to `font-size: 200%`; computed `html` size became 32px while `body` remained 16px. At the small viewport, the header wraps and overlaps: `Menu` spills outside its button and `Edit`, `Add`, and `2D` crowd the next line. The editor still opens, but becomes an almost full-screen 304×552 panel: [html font-size 200% initial](review-wave3/final-320-html-font-size-200-initial.png), [html font-size 200% edit](review-wave3/final-320-html-font-size-200-edit.png).

Resizing that same 200% text render to 640×1136 removes document overflow and improves the composition, but the `Menu` label still overflows its button: [html font-size 200% resized](review-wave3/final-html-font-size-200-resized-640x1136.png). This is the only new actual defect from the follow-up: the small-screen header does not tolerate a real 200% root text-size setting. It is bounded to header text/button sizing and should be addressed only if 200% text scaling is an accepted accessibility target.

### Updated gate

The repaired Menu collision is cleared. The earlier DPR2 density result remains valid but is explicitly not text scaling. The current acceptance remains **PASS**, with the 200% html-font-size header overflow recorded as a bounded accessibility polish item rather than a fundamental web-form mismatch or a reason to change the editor architecture. All isolated Playwright contexts used for this check were closed before handoff.

## Final correction — current 200% text acceptance

Capture boundary: 2026-09-14, 21:54 PDT. Astra requested verification of the latest accessibility correction; the local read-only repository HEAD at capture was `933eee3f8a27cda05c42b0b83853ae49b6779355`. This was a focused visible Playwright check only; no source was read first, no broad review was repeated, and no core files were changed.

In a fresh 320×568 context at device scale 1, I set the actual document root to `font-size: 200%` and verified `html: 32px`, `body: 16px`. The repaired header auto-sized its controls and kept the labels fitting: Menu width ≈170px, Edit ≈76px, Add ≈62px; each measured control had equal client and scroll widths. The header uses multiple rows at this text size, but Menu, Shot 1, Edit, Add, and 2D remain readable without overlap: [final 320 html-font-size-200 header](review-wave3/final-320-html-font-size-200-latest.png).

Menu still opens at this text size: [final 320 html-font-size-200 Menu](review-wave3/final-320-html-font-size-200-menu.png). After opening Edit, `Edit by intent` still opens and `Precision` still opens with `Target width` and `Target depth`, so advanced authoring remains reachable: [final 320 html-font-size-200 advanced](review-wave3/final-320-html-font-size-200-advanced.png).

This supersedes the immediately preceding html-font-size-200 overflow finding. The prior screenshot remains preserved as earlier evidence of the pre-fix defect; the latest candidate fixes that defect. The DPR2 screenshots remain density-only evidence and are not used to make the text-size acceptance claim.

**Final correction acceptance: PASS.** Actual 200% text now preserves readable header labels and advanced editor access at 320×568. No further visual correction is required from this focused check. The isolated Playwright context and browser were closed after capture.
