# Pickleboard local handoff — 19 October 2026

The completed candidate is on **`feature/stroke-instruction`**, in:

`/Users/fdub/Documents/Codex/2026-10-17/task-5/pickleboard-strokes`

The same branch is available as a local branch in **`~/Geese/pickleboard`**. Its active `integration/smart-rally-authoring` checkout and unrelated files were preserved. Find the latest documentation commit without switching that checkout:

```sh
git -C ~/Geese/pickleboard log -1 feature/stroke-instruction
git -C ~/Geese/pickleboard show feature/stroke-instruction:docs/STROKE_HANDOFF.md
```

## What is complete

The accepted rounded town court and lighting are retained. The stroke pass adds distinct forehand, backhand and lob motions, smoother approach/recovery, grounded contact feet and fixed-length articulated limbs for both hands. Pickleboard naming is restored, including the sign. Builder mechanics, saved plays, Smart Rally, the deterministic shared clock, default 2D samples and authoritative ball paths are preserved.

The final 3D-only compatibility repair makes an authored overhead reach its high ball even when Contact style is Short hop. The contact miss falls from 0.22048 m to floating-point precision. The three main right-handed strokes match v29 across all 30 compared frames and poses. Fresh captures verify actual player/rig handedness; they supersede older unverified left-labelled images.

| Frozen identity | Commit or value |
| --- | --- |
| Completed source/tests/review evidence | `e25a87cd7e52e2094f1808e6e038ed4be57f2bd8` |
| Runtime source | `50a49a5ce7d795e39844cfe0dce288930cf2c485` |
| Verified offline package | `2b4559abe460681e166d2d1a883119c0504b841d` |
| Accepted environment baseline | `ac7ca5ff3a3022de3cb4ba843f2111b0f53987db` |
| Runtime SHA-256 | `667bb8a0dd3d0d84fbf638be3b89f612f4f9a08d141df2308ed7b69fe4ad2998` |
| Service-worker cache | `pickleboard-static-v30` |

This handoff advances documentation only. Source/package stamps intentionally keep their frozen identities; they are not rewritten for later notes. No public release, push or merge was performed.

## Launch port 4177

Use **<http://127.0.0.1:4177/>**. First check `curl -fsS http://127.0.0.1:4177/version.json` and `lsof -nP -iTCP:4177 -sTCP:LISTEN`; reuse the matching server. If there is no listener, start it from the isolated checkout:

```sh
cd /Users/fdub/Documents/Codex/2026-10-17/task-5/pickleboard-strokes
PICKLEBOARD_NODE='/Users/fdub/Library/Application Support/xyz.block.berd/packages/node/v24.11.0/darwin-arm64/bin/node'
HOST=127.0.0.1 PORT=4177 "$PICKLEBOARD_NODE" tests/helpers/static-server.mjs
```

Checked-in assets and vendor modules suffice to serve the application; serving needs no install or build. Keep the server running in its terminal. If 4177 belongs to another process, inspect it before doing anything; do not kill an unrelated listener. The [review gallery](stroke-instruction/review.html) is served at `/docs/stroke-instruction/review.html`.

## Recorded validation

These results describe the frozen v30 runtime, not new runs for this documentation audit:

| Check | Result |
| --- | --- |
| `npm run check`, Node 24.11.0 | 247/247 unit tests; 107 referenced assets; brand integrity pass |
| Browser regression gate | 45/45; no skipped, flaky or unexpected results |
| Lifecycle | 60/60 cycles: 30 Chromium + 30 WebKit; context-loss recovery passes |
| Offline package | 32/32 scenarios: 16 per engine, including exact v29 → v30 upgrade |
| Generated assets | 65 semantic matches; 43 PNGs differ only in lossless compression under newer Node/zlib |
| Capture and geometry | 17 verified cases; two dense edge sequences; zero seek/history discrepancy |
| Served runtime | All 108 digest-covered files match; HTTP 200 |

Independent review accepted actual phase sheets and dense frames. It did not claim continuous video inspection or physical-phone testing. Final performance spot checks retain 17 draw calls / 11,090 triangles: desktop median/P95 14.2/14.9 ms; DPR3 phone 27.3/28.2 ms (v29: 26.9/27.9 ms). These are one-pair host SwiftShader observations.

Start with the [validation summary](stroke-instruction/verification/release-validation-final-v30.json), [full report](stroke-instruction/REPORT.md), and [independent visual review](stroke-instruction/FINAL_REVIEW.md). Use installed Node 24 for development checks; the Node 22.4 limitation below remains.

## Remaining limitations

- **Node 22.4 reused-rig diagnostic:** unchanged targeted tests still pass 12/13 in its default mode, with the first failure at sample 271: forehand/left/time zero, shin 0.481712675 m instead of 0.425 m. The sample's root/foot-target disagreement precedes rendering. The same binary with diagnostic `--no-maglev`, and Node 24.11/24.19 defaults, pass 13/13 plus all 810 history samples. Chromium 149.0.7827.55 and WebKit 26.5 each pass three 810-sample runs with one update per sample. No production shin/matrix/route workaround remains; the precise compiler mechanism is unproven. See [runtime comparison](stroke-instruction/verification/node-runtime-comparison.json) and [browser evidence](stroke-instruction/verification/browser-history-diagnostic.json).
- **Overhead + Short hop rules/UI inconsistency:** ordinary controls, save/import and preview accept this combination. Compilation emits short-hop semantics at seven feet; whole-rally evaluation rejects it with `short-hop-contact`. Ordinary preview only receives compiler findings, which are empty for the saved fixture, so the specific rule warning is **not automatically surfaced** there. The repair makes 3D contact coherent; it does not correct the authoring/validation inconsistency or rewrite saved intent. Canonical Smart Rally generation does not create the combination. See [classification](stroke-instruction/OVERHEAD_SHORT_HOP_CLASSIFICATION.md).
- **Spin remains proposed only.** No new spin/bounce physics or authoring control was implemented. See the bounded [spin assessment](stroke-instruction/SPIN_ASSESSMENT.md).

Phone views support broad shot identity; close-up evidence is needed for wrist/elbow review. Stances remain stylized. Existing historical captures/logs retain their original provenance; this handoff adds no disposable raw logs or media.
