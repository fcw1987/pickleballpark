# Pickleball Park Pages publication

The site is <https://fcw1987.github.io/pickleballpark/>. Publication uses **GitHub Actions** and the `Deploy verified Pages artifact` workflow on `main`. Merge reviewed changes through a PR; do not publish a source branch or repository root. Historical commits and branches remain available in GitHub, but documents, tests and review screenshots are excluded from the deployed site.

## Artifact and identity

`tools/runtime-files.json` explicitly lists the application files. `npm run build:site` copies those files into `dist/`, checks the vendored Three.js files against the locked dependency, rejects private local paths, and generates `version.json`, `build-metadata.js`, `runtime-manifest.json` and `build-info.json` from the exact checkout. The runtime currently has 110 files plus two publication metadata files; the build reports their actual byte count. Do not treat the much larger repository checkout as the deployment artifact.

The package identity records the full source SHA and deterministic runtime digest. Generated metadata belongs in `dist/`; root stamps remain historical source checkpoints. `node tools/verify-deployment-artifact.mjs dist FULL_SHA --require-clean` reconstructs expected bytes from trusted source and rejects changed files, extra files, incorrect manifests or mismatched identity. Rehashing a changed artifact cannot authorize it.

Routine `npm run check` validates current code without a frozen release hash. A one-line runtime edit does not need stamp or pin commits. `npm run verify:release-baseline` is the separate historical baseline check. To deliberately record a new reviewed release baseline, commit runtime changes first, run `npm run pin:local-candidate -- FULL_SHA`, inspect the fixture and baseline change, then commit that release record. Do not modify root stamps to claim package verification.

## Required publication gates

Quality runs on PRs and pushes to `main` and the preserved branding branch, using Node 24 on Ubuntu 24.04. Checks, Chromium, WebKit, Package and Quality gate must all succeed. WebKit allows zero failures, retries, skips or flaky results. Package checks include real stopped-server offline reloads and path migration. The official Pages upload tar is also extracted safely and checked against its exact source commit before Quality can pass.

A completed successful **main push** Quality run automatically triggers publication. The selection step requires the current `main` SHA, the expected Quality workflow, all five successful jobs, and exactly one unexpired Pages artifact with its immutable ID and digest. PR artifacts and older-main artifacts are rejected. The deployment downloads that artifact, validates archive paths and exact runtime bytes, uploads the unchanged verified tar, and rechecks main and the original artifact identity immediately before deployment.

The manual **Deploy verified Pages artifact** action uses the same selection and verification gates. Run it on `main` with `commit_sha` set to the full current-main SHA, after that commit's main-push Quality run passes. It does not build an unchecked substitute. Pages source must be GitHub Actions (`build_type: workflow`). Repository protection and account permissions are not bypassed.

After publication, verify `build-info.json`, all manifest-listed file hashes and the live build identity. Check that source-only paths such as `docs/STROKE_HANDOFF.md` and `tests/fixtures/cache-setup.html` return 404. Exercise the affected flows in a fresh mobile browser context. A green upload alone is not proof that the intended build is live.

## Project-path migration and rollback

The old `/pickleboard/` Pages address returns 404 and does not redirect to `/pickleballpark/`. The repository address does redirect. Existing installed shortcuts may continue opening the old URL; use the new site address and install it from there when needed. Browser installation UI and physical-device behavior require separate device acceptance.

The manifest keeps relative `start_url: ./index.html` and no explicit `id`. The new path therefore has a distinct implicit install identity and service-worker scope. Saved drafts and theme keys remain origin-scoped and unchanged; the application does not clear or rename them.

The worker limits obsolete-cache cleanup to entries under its own scope. It retains old-path offline files, unrelated origin caches and mixed-scope entries. Same-path upgrades remove obsolete owned entries. Increment the static cache version once for a runtime release; do not migrate unrelated identifiers or saved data.

Package `path-migration` and `branding-path-migration` cases retain real saved drafts, theme/storage bytes, old worker scopes and cached hashes, unrelated caches and actual stopped-server reloads. They also verify the old network 404 and current artifact hashes.

The pre-review live runtime is `ac1e126c7dbe5545cc3a615d96a204124b472c8a` on the preserved `branding/pickleball-park-strokes` branch. If these product changes need rollback, use a reviewed revert PR that retains the runtime-only publishing pipeline, run the full gates and publish the new main artifact. Do not force-reset main or restore whole-branch publication.
