# Combined feature integration

`feature/coverage-rally-integration` combines coverage, rally intelligence and
efficiency on tested base `170b4ed`. The coverage/rally wiring is documented in
[Coverage and rally integration](COVERAGE_RALLY_INTEGRATION.md). All three
source branches and their working files are preserved.

## Repaired baseline

The exact repair range `170b4ed..f2d4a0b7b0496958d7bbfb8ce112c6e19dd3d6f3`
was fetched from the repository and inspected before integration:

| Repair source | Integration copy |
| --- | --- |
| `b45d021` | `3f8bb76` |
| `ff73f26` | `dbdf519` |
| `f2d4a0b` | `11d2670` |

The narrow planner label now wraps within the viewport. The complete framing
sweep retains every lesson, camera and viewport assertion in five independent
viewport cases. Paused timeline sampling respects native range serialization.
The artwork checks compare exact source RGBA using equivalent canvas backing
stores, retain all visible source pixels, and independently verify cuff/hair
ownership and UVs with negative controls. No tolerance or sporting rule was
relaxed. The range did not modify package helpers, so the reconciled Add/Undo
completion checks remain intact. The baseline remains v36; the combined runtime
still uses one increment to v37. Main merging is not needed for local validation
of these equivalent repair commits.

Main `71a9ac7f64c0c30dcf8fe6539e12e30af93a4161` subsequently merged with
exactly the repair tree. The ordinary ancestry merge `0e992fc` retained the
complete combined tree unchanged. Its source-equivalence evidence is preserved
with the first full run.

That first full Chromium run on `375b163` completed all 414 cases: 413 passed
and one failed, with no skips or retries. At 320×568 and 200% text, the added
Coverage row raised playback above the phone menu's fixed bottom offset. The
menu missed its required clearance by 4.125 pixels. The repair measures the
playback boundary in the existing layout pass and constrains both the fixed
menu bottom and scroll height from it. The regression assertion is unchanged.
The failed complete report and trace remain in
`release-results/final-combined-375b163-initial/`; final checks must run on the
new committed candidate, without replacing this failure with a focused pass.

The unchanged 17 layout/coverage checks pass in both engines after that repair.
Five fresh WebKit phone journeys also captured zero page or console errors
through startup, playback, scrub, view changes, rotation, planner and reload;
the enlarged 320px menu has eight pixels of playback clearance. No error was
filtered or suppressed. The baseline's isolated ResizeObserver warning was not
reproduced; the observer callbacks were not changed, so this is not evidence
that its underlying cause has been fixed.

## Efficiency composition

All six efficiency commits were inspected and applied in order:

| Efficiency source | Integration copy |
| --- | --- |
| `9071b2a` | `b93b6f2` |
| `9b04c71` | `eca9b4f` |
| `61375c7` | `1e2d4a1` |
| `6706833` | `143c593` |
| `7df7e70` | `237ea76` |
| `d84a72c` | `e0cdd8d` |

The live coverage provider remains installed in the builder constructor.
Loading cancellation and scene readiness preserve that callback; every sample
still reads the current source and rendered positions. Pending scenes dispose
their coverage layer through ordinary scene cleanup. Hidden Canvas2D scheduling
stops without adding a second coverage or tactical clock.

There is one static-cache increment, v36 to v37, for all three features. Coverage
and rally modules remain installation assets. The 33 retained SVG replay assets
stay in the runtime inventory and are cached on demand. No art, court geometry,
saved-play schema, service-role rule, cone model or NVZ-history caveat was
changed by this integration.

One package-check overlap required reconciliation: the new migration Add/Undo
check now calls `clickAndVerifySmartAdd`, like fresh authoring. All 42 migration
cases therefore await the actual queued result and verify success, exact shot
and valid counts, an idle queue, and no save error before Undo. Preservation of
other saved draft revisions and all cache/hash/path checks remains intact.

## Earlier focused evidence

- Routine checks: 352 unit tests, referenced assets and brand checks passed.
- Chromium: 19 coverage/rally checks and 26 startup/lifecycle/geometry checks
  passed in separate processes, with no failures, retries or skips.
- WebKit: the same 19 and 26 checks passed in separate fresh processes.
- The two actual WebKit blob reports were merged by Playwright and accepted by
  the unchanged strict policy against their complete 45-test scoped catalog.
  The same partial report was correctly rejected against that stage's full
  409-test catalog. This is not a full-suite pass.
- Four focused packaged cases passed: preview upgrade and path migration in
  Chromium and WebKit. Each verified all 131 runtime hashes and real offline
  Add completion/Undo; the same-path cases installed 96 cache entries and the
  path migrations used v37 while preserving the old scope. Results are retained
  under `release-results/all-features/package-*.json`. The remaining full
  44-case package matrix is part of the final sequence below.

The efficiency branch's earlier 386/390 WebKit run remains a failed full gate.
Its four navigation stalls, application-free reproduction at navigation 80, and
focused repetitions explain the proposed process boundaries; they do not
excuse a failed or missing test. No timeout, retry, skip, expected-failure rule,
CI workflow, or protection setting has been relaxed.

## Exact final validation plan

The repaired baseline is included. Validate the clean complete candidate with
Node 24 and locked dependencies. Do not certify it from isolated-branch results
or the earlier focused run. Final exact-commit evidence belongs under ignored
`release-results/final-combined/`, with full WebKit process reports in the fresh
directory reported by its runner.

1. Run `npm ci`, `npm run check`, and `npm run check:generated`.
2. Build with `node tools/build-site.mjs --require-clean`; validate `dist` with
   `tools/verify-deployment-artifact.mjs`, the exact full candidate SHA and
   `--require-clean`.
3. Discover and run the complete Chromium suite with one worker, no retries and
   `--forbid-only`, retaining its catalog, JSON report, logs and failure traces.
   The repaired combined catalog is 414 tests; rediscover for the exact commit.
4. Run `node tools/run-webkit-file-shards.mjs` to inspect the local full WebKit
   plan. It currently contains all 414 tests across 76 files, at most 25 cases
   per process. Then run `PORT=4231 node tools/run-webkit-file-shards.mjs --run`.
   Each file runs in a fresh Playwright/browser process with its original test
   timeouts and order, one worker and zero retries. Each process retains raw
   JSON, an official blob report, logs and failure traces in a new evidence
   directory. The runner continues independent files after failures, then
   merges official reports and applies the existing strict policy against the
   full discovered catalog. Missing/duplicate cases, skips, retries, failures,
   failed subprocesses, missing reports or a changed source revision reject the
   run. Passing focused evidence never substitutes for this complete run.
5. With `QA_PACKAGE_MODE` and `QA_PACKAGE_BROWSER` unset, run
   `npm run verify:package` once on that exact built candidate. Require all 44
   cases, including two full fresh authoring scenarios, all 42 migration
   Add/Undo proofs, 54 lesson/view round trips, and every runtime/cache hash and
   real server-stopped offline assertion.
6. Preserve all evidence and run the existing required Quality jobs against
   the final source identity. The local runner does not alter or replace the
   protected CI gate. Publication remains outside this local integration task.

The new WebKit runner plans only by default. Its explicit `--run` mode requires
a clean committed source and records every process result; it never turns a
passing focused rerun into a successful full run. A failing final run remains
failed and must be diagnosed or repeated as a complete gate in a functioning
environment, with the failed evidence retained.
