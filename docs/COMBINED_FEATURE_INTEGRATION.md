# Combined feature integration

`feature/coverage-rally-integration` combines coverage, rally intelligence and
efficiency on tested base `170b4ed`. The coverage/rally wiring is documented in
[Coverage and rally integration](COVERAGE_RALLY_INTEGRATION.md). All three
source branches and their working files are preserved.

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

## Combined checks and remaining gate

- Routine checks: 352 unit tests, referenced assets and brand checks passed.
- Chromium: 19 coverage/rally checks and 26 startup/lifecycle/geometry checks
  passed in separate processes, with no failures, retries or skips.
- WebKit: the same 19 and 26 checks passed in separate fresh processes.
- The two actual WebKit blob reports were merged by Playwright and accepted by
  the unchanged strict policy against their complete 45-test scoped catalog.
  The same partial report was correctly rejected against the full 409-test
  catalog. This is not a full-suite pass.
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

First integrate the pending baseline repair and commit the complete candidate.
Use Node 24 and the locked dependencies. Do not certify the final candidate from
the isolated-branch results or this intermediate focused run.

1. Run `npm ci`, `npm run check`, and `npm run check:generated`.
2. Build with `node tools/build-site.mjs --require-clean`; validate `dist` with
   `tools/verify-deployment-artifact.mjs`, the exact full candidate SHA and
   `--require-clean`.
3. Discover and run the complete Chromium suite with one worker, no retries and
   `--forbid-only`, retaining its catalog, JSON report, logs and failure traces.
   The current combined catalog is 409 tests; rediscover after baseline repair.
4. Run `node tools/run-webkit-file-shards.mjs` to inspect the local full WebKit
   plan. It currently contains all 409 tests across 75 files, at most 25 cases
   per process. Then run `PORT=4231 node tools/run-webkit-file-shards.mjs --run`.
   Each file runs in a fresh Playwright/browser process with its original test
   timeouts and order, one worker and zero retries. Each process retains raw
   JSON, an official blob report, logs and failure traces in a new evidence
   directory. The runner continues independent files after failures, then
   merges official reports and applies the existing strict policy against the
   full discovered catalog. Missing/duplicate cases, skips, retries, failures,
   failed subprocesses, missing reports or a changed source revision reject the
   run. This approach is prepared and scoped-report-tested; the complete
   75-process run has not yet executed.
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
