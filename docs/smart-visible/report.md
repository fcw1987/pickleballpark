# Smart rally visible acceptance

This bounded review was run from `47a2d82` on branch `work/smart-rally-visible-review` with the isolated preview at `http://127.0.0.1:4197/`. No Pages settings, remote branch, or deployment state was changed. The preview used the repository source tree directly; packaged delivery was not exercised in this worker.

The fresh scripted acceptance covers Chromium at 390×844, 320×568, 430×932, 1440×900, and 844×390 landscape. It captures the basic court, Add, Customize, family picker, Random Rally, Coach review, 200% text, and menu states in `evidence/`. The test is `tests/smart-visible-review.spec.mjs` and passed 7/7 after the focused UI corrections. `tests/smart-visible-random.spec.mjs` passed the visible 99-hit generation and Escape cancellation journeys (2/2).

The native browser pass used the visible controls in a fresh Safari Private Browsing window and a fresh Brave tab, both against port 4197. The CUA surface did not expose exact application versions; the report therefore records the browser products and renderer context rather than inventing version numbers. Existing Safari and Brave tabs were left open.

## Findings and corrections

* Opening the editor from the compact card previously tried to focus the removed `edit-family` action. The focus fallback now targets the editor Close control.
* Court placement collapsed the editor when the gesture completed. In the visible journey, a target tap could leave the user looking at the current valid timeline chapter instead of the edited shot. The UI now detects placement completion, restores the editor, and focuses Close. The 390px test asserts this directly.
* The primary menu action was labeled “Copy diagnostics” even though it opens Help and diagnostics first. It is now “Build diagnostics”; the actual diagnostics surface retains its “Copy diagnostics” action.
* Random generation failures previously left the dialog open with the failure only in the obscured page message. The result error now appears in the dialog's live alert status while Cancel and Escape remain available during pending work.
* The expanded family picker now claims the inspector width and lays its nine choices out in two compact columns. Hitter remains a normal full-width field below it, and selecting a family closes the native details disclosure through controlled state rather than allowing stale DOM `open` state to reopen it.
* At 200% text, the 390px document now reports no horizontal overflow. The compact header keeps the current chapter visible and yields the permanent player label; short 844×390 landscape keeps the editor from intercepting the menu and bounds the playback/menu panels to the viewport.

The fresh visible journey exposed a wording issue during integration: changing the opening Serve to Return correctly preserved the authored choice and surfaced Coach, but the transient message had said “The selected family was kept” even though the family changed. Root integration corrected this to explain that the requested family was applied and the resulting rally needs review.

At 390px, the family picker is readable and scrollable in two columns, with Hitter below it. At 320px, the menu fits without horizontal overflow. The court still contains the decorative `PICKLEBALL PARK` world sign in this source snapshot; that banner is preserved by the mission and is separate from the removed Help sign.

`tests/smart-visible-video.spec.mjs` passed with normal-speed video capture at 390×844. The clip `evidence/phone-390-workflow.webm` shows Add, a seven-hit Random Rally, then a prearranged visible Import JSON fixture followed by a family-change Coach repair review; the fixture is explicitly staged so the repair state is deterministic.

## Native browser evidence

Safari Private Browsing: a fresh 4197 draft accepted a click-drag on the timeline from approximately x=400,y=738 to x=800,y=700, releasing outside the rail. The value moved from 0 to 0.6447592 seconds and remained at 0.6447592 after a later court click. The play remained paused.

Brave Browser (Chromium renderer): a fresh 4197 draft accepted a timeline click at 1.871271 seconds. A drag from approximately x=700,y=747 to x=1090,y=700, releasing outside the rail, moved it to 3.057699 seconds; a later court click left that value unchanged. In the same visible session, Playback speed changed to 0.5× and Camera to Sideline while the More/Playback options disclosure remained open after each native selector completed.

The initial non-private Safari tab retained a previously saved invalid eight-shot experiment from the exploratory journey. Playback correctly refused to run and displayed “Shot 8 needs attention”; this was kept as a useful negative observation rather than cleared.

## Screenshot index

* `phone-390-start.png`, `phone-390-add.png`, `phone-390-customize-after-placement.png`
* `phone-390-picker.png`, `phone-390-random.png`, `phone-390-coach.png`
* `phone-390-large-text-authoring.png`, `landscape-844-large-text-menus.png`
* `phone-390-random-99-progress.png`, `phone-390-random-99-complete.png`, `phone-390-random-cancel-progress.png`
* `phone-320-menu.png`, `phone-430-menu.png`, `desktop-1440-menu.png`
* `phone-390-workflow.webm` (normal-speed visible workflow clip)

These are bounded local evidence captures from the test at normal motion. No private drafts, unrelated tabs, or personal paths are included in the images.
