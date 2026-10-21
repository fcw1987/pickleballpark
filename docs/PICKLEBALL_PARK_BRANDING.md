# Pickleball Park — local continuation, 21 October 2026

The owner confirmed Pickleball Park as the authoritative brand. This local branch continues the completed strokes candidate `359d4b48b89c218e7f42f53817239ff7aeb0c931`; it does not replace or modify that original checkout. The branch is `branding/pickleball-park-strokes`, in a separate local clone at `2026-10-21/task/pickleball-park-branding`. Its `origin` points to the original local strokes checkout, not GitHub; this branch has no upstream. The subsequently approved GitHub rename and PR cleanup are completed below. No local candidate was pushed or merged, and no publishing setting was changed.

## Audit of the other builds

No missing production fix was found that requires merging another build. Smart Rally `fc46c60`, dimensional/mobile `08401fc`, town art `3751cef`, and native-resolution performance `ac7ca5f` are direct ancestors. The iPhone, builder, robustness, and package baselines are ancestors too.

The audit checked 73 local branch tips in the original Geese repository: 21 were ancestors, 35 other tips had no unique patches after patch-equivalence comparison, and 17 contained older visuals, documentation/test variants, or changes whose representative functionality survives. Content checks confirmed projected contact/ball height, incoming-bounce rules, mid-rally instructions, backhand reset/block mapping, interrupted playback, phone seek space, inspector collapse and the bounded banner. Persistence and long-rally tests survive with newer menus, Smart Add and larger shot limits.

The current strokes candidate deliberately supersedes old billboard replay with articulated athletes, and older tiny-phone wrapping with compact mobile controls. Its original pixel artwork still supports 2D presentation. The separate 2025 `origin/player-icons-update` experiment automatically changed teams/colors when players crossed the net and animated orientation flips. That alternate behavior is absent: current builds keep teams determined by game mode. It was not merged.

The branding continuation keeps 18 gameplay, storage, clock, Smart Rally, stroke and renderer modules byte-for-byte identical to `359d4b4`; exact paths and SHA-256 values are in [verification.json](branding-2026-10-21/verification.json). No missing functional feature was added.

## Branding change and compatibility

The page title and description, planner banner/alternative text, menus, install labels, diagnostics, current documentation and package descriptions now say Pickleball Park. The source-generated raster banner uses the full name inside its existing 128×32 frame. The raised village sign reads PICKLEBALL over PARK inside the existing sign geometry. Court, environment materials, sign placement, athletes and stroke motion are retained. Historical reports and captures retain their original provenance.

The internal package name `pickleboard`, `window.pickleboard`, theme key `pickleboard-theme`, draft key `pickleballpark-builder-v1`, manifest `start_url`, implicit install identity, service-worker path and `pickleboard-` cache namespace remain unchanged. Cache v31 refreshes changed assets from v30. Build diagnostics preserve historical server product names rather than relabeling an older server as the new build.

## Frozen local identities

| Stage | Revision |
| --- | --- |
| Original strokes candidate | `359d4b48b89c218e7f42f53817239ff7aeb0c931` |
| Branding runtime source | `23d2b7975291ff5ffbc1c1e89cd6afac76d8af8c` |
| Generated source metadata | `cd4d148a3ad3ac609a8f0bce37c4429d02997337` |
| Frozen local package | `e84e5211ff3ed1937b389814d23c00aa17682665` |

Runtime digest: `ea8bc461b7b44f9109999ada9a2ba4bf282dc4d250df27491fc596f1d485eff9`. The package contains 110 runtime files (1,927,118 bytes) plus two publication-metadata files. Later report commits do not change these runtime/package identities. Source metadata intentionally keeps `packageVerified: false`; package proof is separate.

## Verification

- Node 24.11.0: **251 unit tests passed**, no failures or skips; 107 referenced assets and brand integrity passed. Initial artifact tests correctly rejected the old frozen manifest after the banner changed; all pass after stamping and pinning the new local package.
- Chromium: **21/21** selected branding, diagnostics, builder and service-worker/cache tests passed; no skipped/flaky results.
- WebKit 26.5: **18/21** passed. The three failures are offline emulation navigation and unrelated-cache disappearance after navigation. The independent infrastructure diagnostic reproduced both with **no application code and no cache-deletion code served**, and confirmed real stopped-server offline reload. These failures remain recorded, not converted into passes.
- Generated assets: all 65 semantic paths match; 43 PNGs differ only in compression under Node 24/zlib. Only the intended banner artwork was changed in source.
- Exact frozen deployment artifact validation passed for `e84e521` and its 110 files.
- **6/6 package scenarios passed:** fresh install, exact strokes v30 → v31 branding upgrade, and public v23 → v31 upgrade, each in Chromium and WebKit. Each checks all 110 runtime hashes, retains the implicit install identity, saved drafts, theme and unrelated cache, and exercises actual stopped-server reload, offline Smart Add, Random99, Coach repair/Undo and eight lessons. Fresh mode has no prior state to preserve.
- Visual inspection: desktop 1440×900, phone 390×844, small phone 320×568 at 200% text, and a separate DPR3 close inspection of the raised sign. Initial raster word spacing was tightened to keep the complete name within the existing frame. The sign inspection camera was widened without changing runtime cameras. Captures had no page errors. This is browser emulation, not physical-phone testing.

Review captures: [village sign](branding-2026-10-21/village-sign.png), [phone planner/banner](branding-2026-10-21/phone-planner.png), [phone menu](branding-2026-10-21/phone-menu.png), [200% small-phone menu](branding-2026-10-21/small-phone-menu-200-percent.png), [desktop builder](branding-2026-10-21/desktop-builder.png). Machine-readable results are in [verification.json](branding-2026-10-21/verification.json); full execution logs remain outside the repository in this task's review-evidence folder.

## GitHub and Pages — approved rename completed

On October 21, the owner approved the repository rename and closing fully superseded PRs. Fresh authenticated API reads verified repository ID `1039845562` and node ID `R_kgDOPfrIug` before and after the rename. Completed changes:

- Repository: [`fcw1987/pickleballpark`](https://github.com/fcw1987/pickleballpark). The old repository address returns a 301 redirect.
- About description: **Pickleball Park — an interactive pickleball coaching and strategy app with a tactical board, guided lessons, and spatial replay.**
- Homepage: **https://fcw1987.github.io/pickleballpark/**. This serves HTTP 200; the old `/pickleboard/` site returns 404.
- `/Users/fdub/Geese/pickleboard` origin now uses `https://github.com/fcw1987/pickleballpark.git` for fetch and push. Task-3, the shared task-5 worktrees, and this branding clone retain their local-path origins. No local branches, commits, dirty files, or worktrees were removed.
- Closed [PR #16](https://github.com/fcw1987/pickleballpark/pull/16) and [PR #17](https://github.com/fcw1987/pickleballpark/pull/17) without merging or deleting their branches. Their exact heads, `d9b75d71b3836613acfd5d5c33e2d228b789ec4c` and `d0d5376a4a76e44a3ce381c83f61e3354bcc2241`, are ancestors of strokes `359d4b4` and branding `7308c77`. Source comparisons retained storage, framing, waypoint policy, movement/lifecycle tests, save-conflict recovery, copy import, placement cancellation, Loop, paused editing, and planner restoration. No runtime or test paths were deleted; the only removed path was the superseded `assets/park/sign.png`.
- Kept [PR #18](https://github.com/fcw1987/pickleballpark/pull/18) open because its branch hosts Pages. All 19 remote branches remain; the original strokes and branding candidates remain local.

Pages still uses **legacy branch publication**, `integration/robustness-visual-fidelity` at `/`, with HTTPS enforced and no custom domain. The rename automatically triggered GitHub to rebuild the same published commit `b2b36e2f5c4ad542cdf43a2a03cf1a1f7db27585`; status was `built` at `2026-10-21T15:12:45Z`, with no error. The new URL's `index.html`, `manifest.json`, `sw.js`, `script.js`, `play-builder.js`, and `visual-theme.js` are byte-identical to that commit. Its title and install labels already say Pickleball Park; its live cache remains v23. The newer local runtime was not deployed.

The default branch remains protected `main` at `f1308015d9e3848909e35d3919735b265e71fb7f`. The artifact `pages.yml` workflow is manual-only and is not the configured publishing source; quality checks trigger on main pushes, main PRs, and manual dispatch. No workflow was edited or manually dispatched. Existing public handoff claims that Actions is already authoritative remain stale.

### Remaining publication work

Review the full candidate and intended publication boundary before any push, PR, or Pages migration. A push to the current Pages source branch is itself publication. If choosing the verified-artifact workflow, changing Pages to Actions requires separate authorization. The inherited Linux CI WebKit exception policy expired October 6 and pins old test-source hashes/counts; it needs fresh review or resolution before treating that workflow as a green publication gate. This task did not extend or bypass it.

Review hardcoded test project paths in `tools/verify-package.mjs`, `tools/verify-source-identity.mjs`, `tests/build-diagnostics-path.unit.mjs`, and `tests/build-diagnostics.unit.mjs` for the new `/pickleballpark/` address. Workflow repository references already use dynamic repository context. Historical links may retain their original URLs. No CNAME change is indicated.

The old Pages address does not redirect. Existing installed shortcuts and service workers may still target it. The six package scenarios above verified upgrades within one project path, not an old-path-to-new-path installation migration. Validate installed-app identity and offline behavior at the new path before publishing the local candidate; browser storage keys remain unchanged.

## Remaining limits

The strokes candidate's documented overhead + Short hop authoring/rules inconsistency remains; this branding work does not change compiler or validation behavior. The Node 22.4 optimized rig-test anomaly remains documented; current checks use the installed Node 24 runtime. Spin is still a proposal. No physical iPhone/iPad, native keyboard, VoiceOver or Dynamic Type acceptance is claimed. No AGENTS.md or available software-engineering skill was found; repository build/identity/verification guidance was followed.
