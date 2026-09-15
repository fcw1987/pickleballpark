# Smart Coach verification

`rally-coach.js` is a proposal layer over the existing document validator, compiler, and rally rule checker. It never mutates a live builder. The caller owns source revision checks, atomic application, Undo/Redo, and any visible result message.

## Contract

`proposeCoachFix(source, { signal })` returns one `coach-fix` proposal or an unsuccessful proposal with the source identity and a specific reason. A successful automatic proposal has `requiresConsent: false`, concrete `changes`, and a candidate that passes complete document, compiler, and rule evaluation. Automatic changes are limited to explicitly automatic, unpinned movement; automatic receiver selection; automatic partner movement; and automatic `arc` or `pace` values. Authored targets, pins, hitters, receivers, flight values, shot families, initial positions, and waypoint paths remain protected.

`proposeCoachOptions(source, { signal })` returns an array of evaluated `coach-option` proposals. Every option includes the source identity, candidate identity, concrete before/after changes, `requiresConsent`, and an evaluation summary. Options that release a pin or change a target, hitter, receiver, flight value, family, or initial position require consent. The array also carries non-enumerable `sourceIdentity`, `reason`, and `cancelled` metadata for cancellation and no-option states.

The caller should pass a proposal through the root application guard immediately before applying it. A changed source identity rejects a stale proposal. Proposal ranking prefers fewer changed fields, local impact, and smaller bounded deltas; it makes no optimality claim.

## Regression fixtures

The independent unit suite uses real `createStarterDocument` data and production `compileDocument` results:

- `automaticRepairScenario` gives an unpinned automatically owned partner movement an unreachable manual destination. Coach changes only that derived movement to `hold` and validates all three downstream contacts.
- `protectedPinScenario` gives Shot 1 an authored pin that blocks Shot 3. Fix for me declines it; Show options includes an evaluated pin release that requires consent.
- `laterBreakScenario` combines an automatic first error with a later authored pin. A candidate that fixes only the first prefix is rejected because the full rally remains invalid.
- `validScenario` demonstrates the no-issue/tactical boundary. Cancellation, stale source identity, source immutability, and JSON proposal round trips are covered.

Run the focused checks with:

```sh
node --check rally-coach.js
node --test tests/smart-coach.unit.mjs
```

The search is finite: at most 96 automatic candidates or 192 options, with single-field candidates followed by bounded two-field combinations and cooperative cancellation checks. Unsupported waypoint paths are preserved and excluded from movement rewrites. The model remains the existing illustrative compiler; Coach does not add physics, remove a waypoint, or infer tactical advice.

