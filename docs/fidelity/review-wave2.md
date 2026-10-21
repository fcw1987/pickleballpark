# Pickleball Park — fidelity review wave 2

Review date: 2026-09-14. Current evidence is from a visible, headed Playwright Chromium run against `http://127.0.0.1:4184/`. Each run used a new isolated browser context with `serviceWorkers: 'block'`, then closed the context after capture. I used only rendered controls and pointer/keyboard actions; I did not read implementation files or seed hidden state.

The first exploratory pass used the already-running shared native Safari because the CUA surface exposed that browser but did not provide an isolated native-Safari context. I created exactly one new Safari tab at the local URL and did not touch the pre-existing tab, any other Safari window, or another app. I entered Safari Responsive Design Mode only in that new tab and exited it before handoff; no Responsive Design Mode remains active. Those Safari observations are historical early-candidate notes, not the current basis of this report. The current basis is the isolated Playwright evidence listed in [evidence.md](review-wave2/evidence.md).

## Journey and answers

The clean starter play opens as Serve, Return, Drop. In the current 1440×900 context, Play changed the footer to Pause, the ball moved through the court, and the timeline could be paused and sought. Opening the chapter list and choosing Shot 2 landed at `0:01.7 / 0:03.7`. The current 2D and 3D controls preserve the same playhead and authored target. A representative current motion clip is [pw-current-rally.webm](review-wave2/pw-current-rally.webm), with pause and seek samples beside it.

The authoring route is now much clearer: Edit opens shot details, Edit by intent exposes Target, Flight, Players, Movement, Coach Tools, and Precision, and the Menu exposes Play file. Shot 3 can be changed from Drop to Drive through the visible Shot family control; the displayed rally duration changed from 3.7 to 3.3 seconds. Coach Tools is a second disclosure containing Auto Shading and Coverage Guides; enabling both showed `Suggested Coverage · instructional approximation`.

Direct answers: the watch surface feels like a finished pixel coaching game, while authoring still feels like a web form around it. The main attention stealers are the dense editor/footer strip and the blocking validation banner. The world is not flat in 3D, and the ball remained findable in the motion clip and paused screenshots. The current shot is understandable from the shot header, chapter, and footer. Advanced controls are discoverable through Edit → Edit by intent, though Coach Tools adds a second disclosure. Menu, Play file, Help, and the court use one coherent visual language. Pixel styling begins to hurt readability in the 320 px header and dense small copy before it hurts court comprehension.

The strongest findings are:

1. A target that makes the next authored link infeasible is blocked with a clear state change, but the correction path is not equally clear. From a fresh starter view, Edit → chapter list → Edit Shot 2 → Place target on court → click `(700,450)` produced `Shot 2 needs attention`; Play then showed `Playback is paused because Shot 2 is not valid yet. Fix that shot before previewing the rally.` Reopening the visible editor preserves the authored target. This is expected under the owner contract: pins are authoritative, and the app must not teleport players, silently rewrite a later intent, or soften reachability validation. The bounded usability improvement is to make the affected shot and the next corrective action more explicit while preserving the saved values. Separately, Edit by intent → Movement → Pin movement target → Place movement on court at `(620,500)` saved `Authored return to (15.0, 6.0)` and remained playable, so the pin control itself is usable.

2. The 320×568 header loses the shot’s intent. The current screenshot keeps Menu, Edit, Add, and 2D visible, but compresses the chapter button to `1. Ser...` and removes the family/target summary. At 390×844 the controls remain readable and the court is still the dominant surface. Keep a readable chapter or shot-family token at 320 px and reserve overflow for secondary copy.

3. Landscape 2D is framed too narrowly. At 844×390, the current 2D screenshot leaves large cream gutters and a small centered court even though the viewport is wide. Players and the target remain findable, but the court loses visual priority. Use a width-first fit for landscape 2D while keeping the footer controls at the same reachable height.

4. Coach Tools are discoverable after the new Edit by intent route, but the second disclosure is easy to miss. The first tab view shows only `Rally details`, `Player handedness`, and `Coach tools`; Auto Shading and Coverage Guides appear only after opening that disclosure. Keep the disclosure label and its two available options visually associated, or expose a compact count/state when a coach tool is active.

5. The finished watch surface reads as a coherent pixel coaching world. The court, players, yellow ball, target ring, flight path, Help sign, and chapter timeline belong together, and the ball remains findable in the captured motion. The least intentional area is the dense authoring/footer strip: at desktop it is a narrow band of controls beside a large court, and at small widths its typography becomes the main scanability cost. Pixel styling hurts small text readability before it hurts play comprehension.

## Bounded improvements

- Keep infeasible-link validation authoritative, but name the affected shot, retained authored values, and the visible correction route together.
- Set a 320 px header contract that preserves a readable chapter/family token alongside Menu, Edit, Add, and view mode.
- Give landscape 2D a width-first camera/layout rule.
- Make Coach Tools state visible without requiring a second unexplained disclosure.

No core app files were edited and no commit was made.
