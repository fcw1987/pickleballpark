# Smart Coach verification

`rally-coach.js` is a proposal layer over the existing document validator, compiler, and rally rule checker. It never mutates a live builder. The caller owns source revision checks, atomic application, Undo/Redo, and any visible result message.

## Contract

`proposeCoachFix(source, { signal })` returns one `coach-fix` proposal or an unsuccessful proposal with the source identity and a specific reason. A successful automatic proposal has `requiresConsent: false`, concrete `changes`, and a candidate that passes complete document, compiler, and rule evaluation. Automatic changes are limited to explicitly automatic, semantically derived unpinned movement, automatic receiver selection, and automatic partner movement. Authored targets, pins, hitters, receivers, flight values, shot families, initial positions, manual destinations, and waypoint paths remain protected even if broad generator metadata labels the containing field automatic.

`proposeCoachOptions(source, { signal })` returns an array of evaluated `coach-option` proposals. Every option includes the source identity, candidate identity, concrete before/after changes, `requiresConsent`, and an evaluation summary. Options that release a pin or change a target, hitter, receiver, flight value, family, or initial position require consent. The array also carries non-enumerable `sourceIdentity`, `reason`, and `cancelled` metadata for cancellation and no-option states.

The caller should pass a proposal through the root application guard immediately before applying it. A changed source identity rejects a stale proposal. Proposal ranking prefers fewer changed fields, local impact, and smaller bounded deltas; it makes no optimality claim.

## Regression fixtures

The independent unit suite uses stable authored fixtures and the real compiler/evaluator:

- `automaticRepairScenario` stores a six-hit generated document with a direct target edit as a fixed fixture. It is deliberately not regenerated after generator improvements. Coach preserves that explicit target and changes Shot 4's downstream derived recovery movement, validating the complete rally. Current generated outputs have separate positive corpus checks.
- `protectedPinScenario` gives Shot 1 an authored pin that blocks Shot 3. Fix for me declines it; Show options includes an evaluated pin release that requires consent.
- `laterBreakScenario` combines an automatic first error with a later authored pin. A candidate that fixes only the first prefix is rejected because the full rally remains invalid.
- `noFeasibleScenario` uses several protected locks and confirms that the bounded search reports no evaluated repair while preserving the draft.
- `validScenario` demonstrates the no-issue/tactical boundary. Cancellation, stale source identity, source immutability, JSON proposal round trips, and root initial-layout diff classification are covered.

Run the focused checks with:

```sh
node --check rally-coach.js
node --test tests/smart-coach.unit.mjs
```

The search is finite: at most 96 automatic evaluations or 192 option evaluations, with single-field candidates followed by bounded two-field combinations and cooperative cancellation checks. Unsupported waypoint paths are preserved and excluded from movement rewrites. The model remains the existing illustrative compiler; Coach does not add physics, remove a waypoint, or infer tactical advice.

On the local Node runtime, the focused suite completed 10 tests in about 0.29 seconds. A warm-process timing sample measured the generated safe repair at 31.8 ms and its options at 40.9 ms, the protected-pin case at 0.2 ms and 25.4 ms, and the genuine no-feasible case at 0.2 ms and 23.4 ms respectively. These are bounded local reference timings, not a device performance guarantee.
