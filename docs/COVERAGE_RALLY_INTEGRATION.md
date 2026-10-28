# Coverage and rally integration

The optional Coverage view now consumes the installed rally engine through
`createRallyCoverageProvider` in the `PlayBuilder` constructor. Its live getter
reads the current document, active play, matching timeline, and token positions.
Rendered actor samples take precedence over those token positions. Imports,
edits, Undo, reloads, scrubbing and camera orbit therefore use the same source
and deterministic playhead. The provider returns no builder snapshot while the
unrelated planner workspace is active.

The runtime integration adds one import and the provider assignment in
`play-builder.js`. It does not change rules, movement generation, cone geometry,
startup, view lifecycle, or package orchestration. Legal reception remains
separate from authored contact responsibility, tactical priority, approximate
physical reach, and illustrative shared floor coverage. The existing NVZ
foot/equipment/momentum-history limitation remains visible in contact settings.

## Source composition

The isolated `feature/coverage-rally-integration` branch starts with coverage
commits `31e8691` and `58b0b993`, on tested base `170b4ed`. The engine commits
were inspected and cherry-picked in their original order; all applied cleanly:

| Engine source | Integration copy |
| --- | --- |
| `8b237a5` | `f94683d` |
| `bbe977b` | `6f467ab` |
| `87e01a3` | `9ab2e40` |
| `27cf376` | `2860639` |
| `a4eef72` | `993038c` |
| `e7f630c` | `d83b3c6` |
| `913f26e` | `297ea93` |

Both source branches and their working files remain unchanged. If both feature
sets are already present in another checkout, apply only the final integration
commit. Otherwise use the complete linear integration branch from `170b4ed`.
This records the two-feature integration stage. The efficiency changes are now
combined as described in [Combined feature integration](COMBINED_FEATURE_INTEGRATION.md).
The combined branch uses static cache v37 once, from the tested v36 baseline.
The pending baseline repair remains a separate dependency.

## Focused validation

- `npm run check`: 352 unit tests passed, static assets and brand checks passed.
- `node tools/verify-rally-coverage-contract.mjs`: 153 cases passed across four
  documents and three cameras, including metre/feet/axis conversion, actual
  actor samples, ball samples, bounce boundaries, receiver identity and immutable
  documents.
- Chromium: 19 focused browser checks passed with one worker and zero retries.
- WebKit: the same 19 checks passed with one worker, zero retries and no skips.

Browser files: `coverage-rally-integration.spec.mjs`,
`player-coverage.spec.mjs`, `player-coverage-offline.spec.mjs`,
`rally-intelligence.spec.mjs`, and `package-smart-add.spec.mjs` in `tests/`.
The new integration regressions exercise the installed constructor wiring with
the seed-2 seven-shot rally, service and bounce state, visible actor/ball
coordinates, camera orbit, reverse scrubbing, import/export, a manual pin,
handedness edits and Undo, saved reload, partner overlap and workspace changes.
The existing focused checks additionally cover the NVZ warning, actual
server-stopped offline reload, and the delayed Add queue's exact saved result.

Evidence belongs in ignored `release-results/coverage-rally-integration/` and
`release-results/coverage-rally-preview/`. Generate the real app stills and
motion using `tools/capture-player-coverage.mjs` with `COVERAGE_PROOF_OUT` set to
the latter directory and `PREVIEW_URL` pointing to the isolated preview server.
Its diagnostics must report `source: 'rally-intelligence'`.

The full Quality/browser/package matrix has deliberately not been run for this
intermediate combination. It remains required after the efficiency changes and
baseline repair are integrated. No push, main merge, deployment, permission
change, or historical release-baseline update is part of this work.
