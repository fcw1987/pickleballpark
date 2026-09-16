# Smart rally visible acceptance

This bounded review was run from `47a2d82` on branch `work/smart-rally-visible-review` with the isolated preview at `http://127.0.0.1:4197/`. No Pages settings, remote branch, or deployment state was changed. The preview used the repository source tree directly; packaged delivery was not exercised in this worker.

The fresh scripted acceptance covers Chromium at 390×844, 320×568, 430×932, and 1440×900. It captures the basic court, Add, Customize, family picker, Random Rally, Coach review, and menu states in `evidence/`. The test is `tests/smart-visible-review.spec.mjs` and passed 5/5 after the focused UI corrections.

The native browser pass used the visible controls in a fresh Safari Private Browsing window and a fresh Brave tab, both against port 4197. The CUA surface did not expose exact application versions; the report therefore records the browser products and renderer context rather than inventing version numbers. Existing Safari and Brave tabs were left open.

## Findings and corrections

* Opening the editor from the compact card previously tried to focus the removed `edit-family` action. The focus fallback now targets the editor Close control.
* Court placement collapsed the editor when the gesture completed. In the visible journey, a target tap could leave the user looking at the current valid timeline chapter instead of the edited shot. The UI now detects placement completion, restores the editor, and focuses Close. The 390px test asserts this directly.
* The primary menu action was labeled “Copy diagnostics” even though it opens Help and diagnostics first. It is now “Build diagnostics”; the actual diagnostics surface retains its “Copy diagnostics” action.
* Random generation failures previously left the dialog open with the failure only in the obscured page message. The result error now appears in the dialog's live alert status while Cancel and Escape remain available during pending work.

The fresh visible journey also exposed a wording issue for the integration owner: changing the opening Serve to Return correctly preserved the authored choice and surfaced Coach, but the transient message says “The selected family was kept” even though the family changed. The message should be changed to explain that the requested family was applied and the resulting rally needs review. This report leaves that model-owned copy disposition to integration.

At 390px, the family picker is readable and scrollable; the Hitter column is visually sparse while the picker is open. At 320px, the menu fits without horizontal overflow. The court still contains the decorative `PICKLEBALL PARK` world sign in this source snapshot; removal belongs to the scene/assets owner.

## Native browser evidence

Safari Private Browsing: a fresh 4197 draft accepted a click-drag on the timeline from approximately x=400,y=738 to x=800,y=700, releasing outside the rail. The value moved from 0 to 0.6447592 seconds and remained at 0.6447592 after a later court click. The play remained paused.

Brave Browser (Chromium renderer): a fresh 4197 draft accepted a timeline click at 1.871271 seconds. A drag from approximately x=700,y=747 to x=1090,y=700, releasing outside the rail, moved it to 3.057699 seconds; a later court click left that value unchanged. In the same visible session, Playback speed changed to 0.5× and Camera to Sideline while the More/Playback options disclosure remained open after each native selector completed.

The initial non-private Safari tab retained a previously saved invalid eight-shot experiment from the exploratory journey. Playback correctly refused to run and displayed “Shot 8 needs attention”; this was kept as a useful negative observation rather than cleared.

## Screenshot index

* `phone-390-start.png`, `phone-390-add.png`, `phone-390-customize-after-placement.png`
* `phone-390-picker.png`, `phone-390-random.png`, `phone-390-coach.png`
* `phone-320-menu.png`, `phone-430-menu.png`, `desktop-1440-menu.png`

These are bounded local evidence captures from the test at normal motion. No private drafts, unrelated tabs, or personal paths are included in the images.
