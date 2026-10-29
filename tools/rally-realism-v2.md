# Model-2 realism measurements

`rally-realism-v2.mjs` keeps three verdicts explicit: corpus completion and
production document/compiler/rule acceptance, grounded generator-model support,
and numerical calibration. `rally-realism-v1` and its archived measurements are
unchanged. A rule-valid document is not a claim of complete human biomechanics.

## Additive action diagnostics

`summary.diagnostics.lineInitiatedAttacks` observes contacts at the existing
12.5-ft approach threshold with one of these source intents:

- `drive`
- `third-shot-drive`
- `speed-up`
- `put-away`

`lineControlledCounters` reports `counter` intent separately. “Controlled” names
the intent category; it does not certify execution quality. `familyDriveSubset`
retains the narrower `family === 'drive'` view.

These action diagnostics use valid, complete, unconditioned natural-rally contacts.
Each diagnostic reports the full contact count, matched/missing pre-choice
evidence, actual ball lower-surface position above or at/below the local tape,
solver-backed affordance values, and their intersection. Missing evidence never
becomes a positive affordance. The matching contract requires the same shot,
actor, contact geometry, and all four actor positions at the prescribed evidence
time, within 1e-6 feet/seconds. The first serve snapshots segment start before
preparation; subsequent snapshots use physical contact time. Contact metrics
always retain actual contact-time positions.

These action groups are **diagnostic only**. They do not replace the existing
family-drive calibration numerator, denominator, minimum sample count or bands.
A proposed broader interpretation of the brief's line-attack target remains
**AWAITING ASTRA REVIEW** before numerical qualification uses it. Natural
observations and targeted correctness examples must remain separate.

## Grounded contact support

`rally-contact-support-v1` defines a maximum supported grounded contact height of
8.5 ft with the existing 1e-6-ft numerical tolerance. It applies to all contact
families produced under the grounded `rally-engine-v1` model. The collector reads
actual compiled contact height, rather than execution quality or a declared apex.

A generated contact outside this envelope produces `modelSupport.status: FAIL`
and `MODEL_SUPPORT_FAIL` as the corpus report status when otherwise complete and
rule-valid. The separate `physicalValidity` verdict and every original contact
remain intact. The diagnostic is not an official pickleball fault, changes no
schema/import bounds, and never rewrites source. Non-engine-origin manual model-2 documents and model1 documents do not acquire
this generator-only restriction. Retained provenance never causes an edited
document to be regenerated or blocks its import. Existing
calibration gates remain unchanged.

## Proposed 12-contact performance cohort — AWAITING ASTRA REVIEW

The following is a proposal only. It is not wired into any calibration or CI
gate and has not been run:

- Keep natural qualification seeds 1000–1299 per core style unchanged.
- Predeclare a separate performance range 2000–2299 per core style, balanced
  across both serving teams and service courts.
- Use Natural, winner Either, unchanged profile/error settings and `maxShots:12`.
- Time every full public generation await, including search, cooperative yields
  and final validation. Do not exclude fast or slow attempts, search for seeds,
  lower error rates, or add seeds after observing the count.
- Archive all early complete points, valid censored prefixes and failures.
  Failed or missing results must remain visible. Every valid output with exactly
  12 accepted contacts enters the work-size timing cohort, including an honestly
  labelled censored prefix. Report the other lengths and statuses separately.
- Retain a predeclared minimum of 10 eligible observations per style and the
  requested median below 20 ms / p95 below 100 ms numerical targets.

This would measure **12-contact construction plus final validation**, not natural
exactly-12 complete-point performance. Natural exactly-12 timings must still be
reported separately, with insufficient samples made explicit. If acceptance
requires only complete exactly-12 points, a capped-prefix benchmark does not
answer that question and cannot be presented as its numerical PASS.
