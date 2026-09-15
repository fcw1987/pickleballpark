# Wave 2 evidence log

Current evidence uses the local app at `http://127.0.0.1:4184/` in visible headed Playwright Chromium. Each capture used a new isolated context with `serviceWorkers: 'block'`; actions were performed through rendered controls and pointer coordinates. The current motion artifact is [pw-current-rally.webm](pw-current-rally.webm).

## Current coach journey

- Fresh navigation showed `Starter Serve, Return & Third`, Shot 1 Serve, a 3.7-second timeline, and the 3D court. The footer Play control was clicked, paused during motion, and the timeline was clicked to seek. The chapter list was opened and its visible Shot 2 row was clicked; the resulting state read `Shot 2, Return 0:01.7 / 0:03.7`.
- The visible 2D switch produced a full-court top-down view; switching back produced the 3D court. The same target and shot timeline remained visible.
- Edit → chapter list → Edit Shot 2 → Edit by intent → Movement exposed `Place movement on court` and `Pin movement target`. Checking the pin and placing movement at screen coordinate `(620,500)` produced the visible saved summary `Authored return to (15.0, 6.0)`.
- Edit → chapter list → Edit Shot 2 → Place target on court → click `(700,450)` produced `Shot 2 needs attention`. Pressing Play then showed `Playback is paused because Shot 2 is not valid yet. Fix that shot before previewing the rally.` This is an expected infeasible link under the authoritative-pin contract, retained here as a usability-route observation.
- Edit Shot 3 → Shot family → Drive changed the visible summary from Drop to Drive and changed the footer duration from `0:03.7` to `0:03.3`.
- Edit Shot 3 → Edit by intent → Coach Tools → Coach tools exposed Auto Shading and Coverage Guides. Checking both showed `Suggested Coverage · instructional approximation`.
- The visible Menu opened `Play file`, `Learn`, `Court Planner`, `Import / Export`, `Help`, and `Appearance`. Clicking Play file revealed `MY PLAY`, Play name, Rename play, New Play, My Plays, and Save As. Help opened a visible information surface covering shot chapters, target placement, Edit by intent, validation, playback, 2D/3D, local save, Auto Shading, and Coverage Guides.

## Responsive conditions

Screenshots were captured at the requested viewport sizes, with a separate 2× device-scale desktop sample:

| viewport | artifact | observation |
| --- | --- | --- |
| 390×844 | [pw-current-390.png](pw-current-390.png) | Menu, chapter, Edit, Add, and 2D remain readable; the court fills the tall frame and the footer remains usable. |
| 320×568 | [pw-current-320.png](pw-current-320.png) | The chapter button truncates to `1. Ser...`; family/target summary disappears, while primary controls remain visible. |
| 844×390 | [pw-current-landscape-2d.png](pw-current-landscape-2d.png) | 2D leaves large cream gutters around a small centered court. |
| 1440×900 | [pw-current-initial.png](pw-current-initial.png), [pw-current-2d.png](pw-current-2d.png) | 3D uses the desktop court well; 2D is clearer and larger but still leaves surrounding green space. |
| 1440×900, DPR 2 | [pw-current-1440-hidpi.png](pw-current-1440-hidpi.png) | High-DPI desktop sample retained readable pixel edges and dense header text remained the main scanability limit. |

## Boundary correction

The earlier native Safari pass used one newly created local tab in the already-running shared Safari window because isolated native Safari was unavailable through the CUA surface. That tab was the only Safari surface created or touched. Safari Responsive Design Mode was entered and exited in that tab; it was not left active. The pre-existing Safari tab and other windows were not touched. Those early-candidate notes are not claimed as current Playwright evidence.

No physical-device, remote-action, account, or hidden-state claims are made.
