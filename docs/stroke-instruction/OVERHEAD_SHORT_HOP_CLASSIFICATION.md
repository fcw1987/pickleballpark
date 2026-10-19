# Overhead / short-hop compatibility investigation

The combination is **accepted by the source schema, import path and ordinary builder controls, while its compiled contact semantics are contradictory**. It must not be described as a malformed import or an ordinary-overhead regression. A user can select it without importing anything.

## Source boundary and compilation

- `play-document.js:148` validates `family` and `contactStyle` independently. `overhead` and `short-hop` are each valid enum choices, with no cross-field restriction.
- `builder-ui.js:442` offers Short hop in Contact style for every selected family. Its change handler sends `editShot`; `play-builder.js:496` writes that authored field directly.
- `builder-storage.js:213` imports through the same document validator and preserves the source value. Importing does not change the combination into a different shot.
- `play-compiler.js:30` treats the overhead family as a volley for interception. Lines 31 and 58–60 prioritize `contactStyle:short-hop` for contact kind and stroke/type. Line 211 separately prioritizes the overhead family for a seven-foot contact height. Consequently the resulting shot has `type:short-hop`, `stroke:short-hop`, `contact.kind:short-hop`, `contact.heightFeet:7`, and `authoring.family:overhead`.
- `rally-rules.js:45` rejects a short-hop contact above 1.5 feet. `rally-proposals.js:127` runs that rule check in `evaluateCandidate`, which rejects this candidate with `short-hop-contact`. However `compileEffectiveCandidate`, used by ordinary builder preview installation at `play-builder.js:162`, compiles it without that rule evaluation. The fixture compiles both shots with no compiler findings.
- Canonical Smart Rally generation selects short-hop only for reset recipes (`smart-rally-generator.js:131`). Two generated 99-shot samples, seeds 1 and 12648430, produced overheads only with automatic contact style. They do not generate this combination.

## Exact fixture and observed contact

`tests/fixtures/overhead-short-hop-document.json` is a schema-version-one two-shot builder source. It derives from the native Lob / Overhead lesson with `templateSource` removed to exercise genuine compilation and only the overhead recipe's Contact style changed to Short hop. It imports losslessly. The byte snapshots in `tests/fixtures/overhead-short-hop-compatibility-baseline.json` predate the visual repair; hashes use JSON bytes without numeric rounding.

The pre-repair audit is `OVERHEAD_SHORT_HOP_AUDIT.json`. For both handed rigs, the high contact target was missed by approximately **0.220477822 m** while geometry remained finite and arm reach remained bounded. The normal automatic/forehand/backhand overhead controls met their contact to floating-point precision. The miss occurs because emitted `short-hop` metadata selects a low body/paddle family and a groundstroke root offset; the reach guard clips the high target.

## Scoped repair

The approved repair resolves the explicitly authored overhead family only in the opted-in 3D presentation. It uses the existing overhead support base and rig pose. The original short-hop duration/contact ratio, contact height, ball trajectory, bounces and event identity remain unchanged. The default shared presentation used by 2D does not opt into this override. Neither compiler physics nor source authoring data is normalized or rejected.

Regression coverage exercises direct builder-source and imported copies, both physical hands and mirrored court placement, exact contact, foot planting and rendered limb endpoints. It also compares the compiled Play, event arrays, ball samples and complete default 2D presentations against pre-repair byte hashes. The ordinary overhead controls and complete generated 99-hit rally remain covered.

## Cross-runtime history diagnostic and conclusion

A stricter dense history test exposed a first-sample mismatch on this host's **Node v22.4.0, V8 12.4.254.21-node.15, Darwin arm64**. After automatic-style forward/reverse sweeps, the first forehand/left sample at local time zero can return a root at the overhead plant but foot targets centered at the tactical contact. Its actual shin endpoint distance is approximately 0.481712675 m instead of 0.425 m. The disagreement occurs in the returned sample before rendering. A root-matrix refresh was tested, falsified, and removed. No production shin, matrix, route-refactor or optimization workaround remains.

The unchanged actual 13-test set reports 12 passing / 1 failing with that Node runtime's default mode; the same binary with the per-process `--no-maglev` diagnostic reports 13 / 13 and completes the 810-sample workload. Independently invoked existing Node v24.11.0 and bundled Node v24.19.0 each pass all 13 unchanged tests and the full 810-sample history probe in their default execution modes. Binary identities, source checksums, commands and original failures are retained in [the runtime comparison](verification/node-runtime-comparison.json). No runtime was downloaded or installed, and no global default or security setting was changed.

Independent **Chromium 149.0.7827.55 and WebKit 26.5** each passed one strict 810-update repetition of the original call order, followed by two 810-update repetitions with selected fresh-rig and repeated-sampler comparisons. These checks measure the first geometry update without a second settling update. Both engines report no failures; thigh/shin/knee/ankle errors stay below `1e-15 m`, and selected fresh/reused rendered vertices and endpoints are identical. See [the browser history report](verification/browser-history-diagnostic.json) and [its log](verification/browser-history-diagnostic.log). All 108 served runtime files matched digest `667bb8a0dd3d0d84fbf638be3b89f612f4f9a08d141df2308ed7b69fe4ad2998` throughout the probe.

The bounded conclusion is a **reproduced host Node 22.4 optimized-test anomaly, not reproduced in the checked modern Node runtimes or actual browsers**. The exact compiler mechanism is not established. This does not justify changing otherwise passing production choreography or weakening assertions. Final validation uses the existing Node 24 runtime; the original negative result remains visible.

## Final repair verification

[The post-repair audit](OVERHEAD_SHORT_HOP_REPAIR_AUDIT.json) uses Node v24.11.0 and the unchanged runtime digest above. The legacy combination and ordinary automatic/forehand/backhand overhead controls, both hands, meet contact within `4.97e-16 m`; maximum shin-length error is `3.34e-16 m` and thigh-length error `1.67e-16 m`. Sampled rendered vertices remain finite. The [13 regression results](overhead-node24-regressions.log) include source-preserving import, both hands and mirrored placement, exact contact and grounded support, actual world-space joint endpoints, byte-for-byte ball/event/2D preservation, and the complete 99-hit generated rally. The broader final unit and package validation remains owned by the parent release task.

No remaining compatibility or cross-engine history blocker was found in the checked scope. The earlier seven-foot short-hop rule warning remains truthful source semantics; the visual repair neither hides that warning nor rewrites the authored draft.
