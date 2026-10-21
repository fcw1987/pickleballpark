# Working on Pickleball Park

This is a static JavaScript application. Keep the public name **Pickleball Park**;
existing `pickleboard` storage keys, worker-cache namespace and compatibility APIs
are intentional. Preserve saved plays, authored intent and unrelated local work.

## Development and validation

- Use Node 24 and the locked dependency versions. Keep independent workers on
  disjoint files, and use separate ports/output directories for browser runs.
- Read the relevant existing tests and documents before changing behavior. Keep
  normal edits narrow; do not redesign the interface or rewrite saved documents
  to conceal a validation problem.
- Run `npm run check` for routine syntax, unit, asset and brand checks. Use focused
  Chromium/WebKit tests while developing, then the full required Quality checks
  for the final candidate. WebKit permits no failure exceptions, skips or retries.
- Exercise storage failures, conflicts and the 50-play limit for persistence
  changes. A failed save/import/copy must retain the current work and existing
  library. Untouched lessons and New Play previews stay transient until edited.
- Put generated screenshots, reports and traces under ignored `release-results/`
  or an external task evidence directory. Do not overwrite historical captures.

## Runtime identity, cache and release baselines

- Routine changes must not require stamp commits or frozen-hash updates. The
  package build generates its own deterministic identity and runtime manifest
  from the exact checkout; generated publication metadata belongs in `dist/`.
- Retained root stamps and approved-runtime fixtures describe historical local
  checkpoints. Do not present them as proof of a new deployed commit.
- Keep frozen release-baseline validation separate from routine `npm run check`.
  Update a release baseline only deliberately, after review, with its associated
  evidence. Do not weaken exact artifact checks to avoid updating a baseline.
- Increment the static cache version in `sw.js` once for a runtime release and
  keep its asset list current. Preserve cache entries outside the worker scope,
  origin-scoped saved data and the compatibility cache prefix. Test real offline
  reloads and upgrades with the owned test server stopped.

## Publication

- Work on a separate branch and merge through a PR after the required checks.
  Preserve branch history; do not force-push, rewrite history or delete branches
  as part of ordinary publication.
- Pages uses **GitHub Actions**, never the repository root or a source branch.
  Deploy only the runtime artifact built and verified by successful Quality
  checks for the exact current `main` commit. Pull-request artifacts are not
  publication candidates.
- The artifact contains only explicitly allowed application files and generated
  publication metadata. Exclude source documents, tests, tools, screenshots,
  local paths, source maps, `node_modules` and credentials. Verify path safety,
  file bytes, manifest, dependency integrity and commit identity before upload
  and again before deployment.
- Use the existing **Deploy verified Pages artifact** workflow. Automatic main
  publication must wait for same-commit Quality success; a manual dispatch must
  identify the full current-main SHA and select that commit's verified artifact.
- Monitor CI and deployment to completion. Confirm the live build identity and
  files, test mobile layout and affected flows, and check that source-only paths
  are unavailable. Record the prior deployed SHA/artifact as the rollback point.
- Do not alter account access, repository security or branch protection as a
  workaround for a failed gate. Report the exact failure and preserve evidence.
