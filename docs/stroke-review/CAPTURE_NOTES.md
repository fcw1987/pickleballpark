# Stroke motion evidence

Original v29 stroke evidence is in `candidate-final/`; its fixed-camera dense samples are in `candidate-final-dense/`. The accepted ac7ca5ff environment baseline is in `baseline/`, with selected source clip/camera reports in `baseline-clips/` and `baseline-return/`. Final v30 overhead compatibility evidence is in `candidate-contact-final/` and `candidate-contact-final-dense/`, compared with the exact v29 snapshot in `baseline-contactv29/`. Earlier directories retain superseded iterations and their original runtime identities.

`candidate-final/stroke-report.json` preserves each exact input play, shot metadata, handedness, compiled semantics, camera and sampled timeline times. There are 14 cases: forehand/backhand drives and lobs with both hands; moving return; compact dink/backhand dink/volley/block; low short-hop; forehand overhead; and an explicitly authored backhand overhead at seven feet. The backhand-drive fixture preserves drive flight metadata while explicitly requesting backhand stroke artwork. The authored overhead fixture preserves overhead stroke/type and explicitly selects a backhand contact side. Neither is a relabelled generic sequence.

The main close-up sheets show ten actual timeline samples per case. The dense sheets sample actual timeline state at 1/30-second simulation increments: return −0.6 to +0.8 seconds relative to contact (43 frames), and core drives/lob −0.5 to +0.4 seconds (28 frames). The camera stays fixed. Return uses the opposite front three-quarter angle to avoid an occluding partner. Ordinary court and phone views accompany every case. `stroke-unlabelled-core.jpg` provides a compact blind comparison; its answer key is a separate file.

The concise `*-slow.webm` clips record actual renderer playback at 0.25× using the canvas MediaRecorder stream. Return runs six wall-clock seconds; other core clips run 3.6 seconds. Full capture-session films are also retained. Recorder requests and browser rAF timings are not physical display FPS measurements. Runtime default playback rate was 1×. The native phone still is a 402×874 Chromium viewport at device scale factor 3, with the actual renderer pixel ratio and drawing-buffer dimensions recorded in `stroke-sign-provenance.json`; it is viewport emulation, not a physical iPhone test.

`stroke-acceptance.json` includes finite geometry, visible paddle/ball contact, shuffled seeking history, fixed arm reach/grip alignment, planted-foot drift, actual wall-clock playback-rate observations, pause freeze, and every adjacent timeline boundary for all four actors. Boundary displacement is measured across ±1 microsecond for root, paddle, head and both feet, with foot speeds measured at ±1/120 second. A jump over one centimetre across the two-microsecond boundary interval fails. Dense one-sixtieth-second simulation samples are reported separately; these are not a claim about displayed frame rate. Foot origin height is not sole-to-court gap and requires the accompanying visual ground check.

The original v29 runtime digest is `1342f7a03c16736fa9eba5509d244fd166697bcedf43401872aa1436bb24f2b6`; final v30 is `667bb8a0dd3d0d84fbf638be3b89f612f4f9a08d141df2308ed7b69fe4ad2998`. Reports preserve their own unchanged before/after digest. The original main capture preceded its metadata stamp, so its recorded HEAD/stamped metadata describes that capture time rather than the later package revision.

The final capture audit found that assigning token handedness before loading a play could be undone by the prior play's restore behavior. Old left-labelled images alone therefore do not establish left-handed rendering. The corrected harness loads fixture documents through the builder with explicit player settings and assigns catalog-case hands after loading. It verifies token and rendered-rig handedness after entering 3D and on every captured frame. `*-unverified-hands` directories preserve the rejected evidence. `*-hand-verified-card-occluded` directories preserve the first corrected attempt, where the planner card still obscured the right-handed paddle; canonical contact captures hide that overlay only while recording. Neither correction changes the runtime or actor geometry.

Final numeric acceptance also compares shuffled single `applyAtTime` calls without a settling update, separately from ordinary session seeking. This complements the strict reused-rig history checks in both browser engines.

Reproduce into a new evidence directory with the final candidate served on port 4177. Use the already-installed Node 24 runtime described in the report; host Node 22.4 has a documented optimization-specific diagnostic discrepancy. These commands intentionally do not overwrite the historical v29 evidence:

```sh
PREVIEW_URL=http://127.0.0.1:4177 CAPTURE_DIR=/tmp/pickleboard-v30-review node tools/stroke-motion-review.mjs
PREVIEW_URL=http://127.0.0.1:4177 CAPTURE_DIR=/tmp/pickleboard-v30-review node tools/stroke-motion-acceptance.mjs
PREVIEW_URL=http://127.0.0.1:4177 CAPTURE_DIR=/tmp/pickleboard-v30-dense STROKE_CASES=overhead-short-hop-right,overhead-short-hop-left STROKE_DENSE=1 STROKE_VIDEO=0 node tools/stroke-motion-review.mjs
PREVIEW_URL=http://127.0.0.1:4177 CAPTURE_DIR=/tmp/pickleboard-v30-review node tools/stroke-sign-review.mjs
```

These tools use isolated Playwright Chromium contexts and temporary profiles. They do not edit runtime files, stamp builds, publish, or use personal browser sessions.
