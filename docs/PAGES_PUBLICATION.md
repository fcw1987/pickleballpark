# Pickleball Park Pages publication

The owner authorized publishing `branding/pickleball-park-strokes` in `fcw1987/pickleballpark` and selecting that branch's root as the legacy GitHub Pages source. The site address is <https://fcw1987.github.io/pickleballpark/>. The original strokes branch, prior live branch and PR #18 are retained.

## Source and verification

The root `.nojekyll` marker makes GitHub serve the static files, including the tracked `vendor/` Three.js modules. The app does not need `node_modules` in production. Legacy publication serves source files directly; `build-info.json` and `runtime-manifest.json` are packaged-artifact endpoints and are not present at the source root.

`version.json` and `build-metadata.js` identify the frozen runtime source and its SHA-256 digest. A later commit can contain verification or documentation without changing those runtime bytes. Verify the exact deployed commit through the Pages API, then compare the served runtime files with the approved manifest. Do not relabel the source metadata as package-verified merely because a source branch was published.

Quality runs on pushes and pull requests targeting `main` or `branding/pickleball-park-strokes`, using Node 24. The full WebKit gate requires every discovered test to pass on its only attempt, with zero failures, skips or flaky results. Offline tests stop their own HTTP servers and verify that ordinary HTTP requests fail before checking the cached application. The expired exception policy is no longer used.

Publication preflight repaired a real Help-dialog focus escape and compact-layout regressions in the seek surface, enlarged Menu label and native Hitter selector. Tests for explicit chapter selection now follow the accepted `62f5677` behavior. Renderer tests distinguish the canonical 2D route from the instructional 3D route introduced by `041f285`, retaining exact contact, ball, camera, history and source checks. Failure/cancellation tests interrupt the current lazy module instead of obsolete texture requests. Test screenshots go to ignored `release-results/` rather than overwriting historical review captures.

The manual main-only `pages.yml` verified-artifact workflow is a separate publication mechanism and is not used for legacy branch publication. Every push to the selected Pages branch triggers Pages independently of Quality. Check the candidate before pushing; a Quality run does not block that automatic publication. No branch protection or account security setting was changed.

## Project-path migration

The old `/pickleboard/` Pages address returns 404 and does not redirect to `/pickleballpark/`. The repository address does redirect. Existing installed shortcuts may continue opening the old URL; use the new site address and install it from there when needed. Browser installation UI and physical-device behavior require separate device acceptance.

The manifest keeps relative `start_url: ./index.html` and no explicit `id`. The new path therefore has a distinct implicit install identity and service-worker scope. Saved drafts and theme keys remain origin-scoped and unchanged; the application does not clear or rename them.

Cache v32 limits obsolete-cache cleanup to entries under its own worker scope. It retains old-path offline files, unrelated origin caches and mixed-scope cache entries. This preserves an existing cached installation without pretending that its old network address still works. Same-path upgrades still remove obsolete owned entries.

The package verifier includes `path-migration` from the exact published v23 source and `branding-path-migration` from the exact v30 candidate. Each checks real saved drafts, theme/storage bytes, old and new worker scopes, manifest identity, old cached hashes, unrelated caches, current artifact hashes, the old network 404 and actual stopped-server reloads.
