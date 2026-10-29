# Model-2 realism measurements

`rally-realism-v2.mjs` keeps three verdicts explicit: corpus completion and
production document/compiler/rule acceptance, grounded generator-model support,
and numerical calibration. `rally-realism-v1` and its archived measurements are
unchanged. A rule-valid document is not a claim of complete human biomechanics.

## Reserved holdout and examined regression data

`tools/rally-holdout-v1.json` reserves seeds **50000–51199**, 1200 per style
for Pro, Advanced and Intermediate: **3600 natural rallies** in total. Its four
server/receiver/court roles each occur 300 times per style. All players use the
balanced flavour, Natural length, winner Either, signatures enabled and the
ordinary 99-contact limit. The complete definition and generated schedule are
validated and immutable; replacement seeds, subsets, extra styles, changed
flavours, reordered roles and increased counts are rejected.

The reservation inventory found 361 used seed values across 286 JSON/JSONL files
and explicit source seed literals, with zero overlap and zero unreadable files.
Evidence is retained in `release-results/game-mode-m2/holdout-reservation.json`.
This documents the reservation check; it does not prove future blindness.

The **first holdout run is allowed only after the candidate is frozen and
reviewed**. Current work remains targeted tests and the existing development
cohort. Do not run the holdout to guide unfinished tuning. After that review,
the calibration job invokes the full reservation once, without retries:

```sh
node tools/rally-realism-v2.mjs --cohort holdout \
  --output release-results/game-mode-m2/holdout-v1.json \
  --archive release-results/game-mode-m2/holdout-v1.jsonl \
  --require-calibration --require-clean
```

The CLI requires clean committed source for this cohort, refuses existing output
files, and includes the definition hash in collector provenance. Clean source
does not establish review approval or unseen results. The report's
`cohortEvidence` names the reserved purpose and records
`examinationState: NOT_ESTABLISHED_BY_COLLECTOR` / `unseenClaim: NOT_ASSERTED`.
The definition's unchanged `RESERVED_NOT_RUN` value records its original
reservation; it is not a live execution ledger. Record actual usage and review
history with the resulting evidence. If results are examined and used for
retuning, later runs must be labelled examined regression evidence, never unseen
holdout evidence. Do not extend the seed range or count based on results.

`--cohort qualification` retains the exact original **1000–1299** schedule and
API. Those 900 archived rallies have been examined and are now regression data;
new reports identify that purpose explicitly. Preserve their original archives.
Development remains the original 0–59 seeds per core style.

The holdout retains every attempted result and the independent completeness,
physical validity, generator support and calibration verdicts. All existing
numeric bands, conditional denominators and minimum counts of **10** remain
unchanged. Sparse line-drive evidence remains insufficient; the action
diagnostics below do not broaden that gate. Exactly-12 timing still requires
natural complete points and does not substitute capped prefixes.

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

## Generated-flight feasibility

The separate `rally-generated-flight-feasibility-v2` observation audits compiled
serialized stage velocities for every generated family and error. Its model
ceilings are distinct from the original Section 7 preferred ranges and unchanged
Section 13 calibration bands. Physical rule validity, model support, generated
flight feasibility, corpus completeness and calibration retain separate verdicts.
A speed failure does not erase a row or remove it from original natural
denominators. Missing or unattempted output keeps aggregate feasibility
`NOT_EVALUATED` unless an observed violation makes it `FAIL`; partial checking
cannot claim `PASS`. Reports retain actual source policy/planner versions,
including archive replay without relabelling an old origin.

Current generation records policy v2 and planner v1. Old policy-v1 documents
remain importable and replay identically, even when this new analysis flags an
unrealistic stored flight. The collector never repairs or regenerates them.
