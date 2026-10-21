# Pickleball Park — local continuation, 21 October 2026

The owner confirmed Pickleball Park as the authoritative brand. This local branch continues the completed strokes candidate `359d4b48b89c218e7f42f53817239ff7aeb0c931`; it does not replace or modify that original checkout. The branch is `branding/pickleball-park-strokes`, in a separate local clone at `2026-10-21/task/pickleball-park-branding`. Its `origin` points to the original local strokes checkout, not GitHub; this branch has no upstream. No push, merge, repository rename, deployment, or Pages setting change occurred.

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

## GitHub and Pages — inspected, unchanged

Direct read-only API and HTTP inspection on October 21 found:

- Public repository [`fcw1987/pickleboard`](https://github.com/fcw1987/pickleboard), protected default `main` at `f1308015d9e3848909e35d3919735b265e71fb7f`.
- Default README and [published site](https://fcw1987.github.io/pickleboard/) already say Pickleball Park. Repository About description and homepage are unset.
- Pages actually uses **legacy branch publication**, `integration/robustness-visual-fidelity` at `/`, with HTTPS enforced and no custom domain. The last successful build is `b2b36e2`, September 15 ([run](https://github.com/fcw1987/pickleboard/actions/runs/34978572755)). The live cache is v23; `version.json` and `build-info.json` return 404.
- An artifact-based manual `pages.yml` exists, but it is not the configured publishing source. Existing public handoff claims that Actions is already authoritative are stale.

Exact proposed remote changes, deferred for scope review:

1. Set About description to **Pickleball Park — an interactive pickleball coaching and strategy app with a tactical board, guided lessons, and spatial replay.**
2. Set homepage to **https://fcw1987.github.io/pickleboard/**. Keeping the slug avoids changing existing app/site links; display branding does not require a slug rename.
3. Review the full candidate and intended source/publication boundary before any push or PR. A push to the current Pages source branch is itself publication. Main is an older protected release line; no branch target or deployment migration has been changed here.
4. If choosing the existing verified-artifact workflow, separately approve changing Pages to Actions and publish only a verified artifact of the reviewed revision. The inherited Linux CI WebKit exception policy expired October 6 and pins old test-source hashes/counts; it needs fresh review or resolution before treating that workflow as a green publication gate. This task did not extend or bypass it.
5. Optional coordinated slug rename: **`fcw1987/pickleboard` → `fcw1987/pickleballpark`** (availability not checked). Repository URL would become **https://github.com/fcw1987/pickleballpark**; Pages would become **https://fcw1987.github.io/pickleballpark/**. GitHub redirects repository/Git traffic, but project-site URLs are excluded from that guarantee ([GitHub documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)). Update clone remotes, About homepage and current factual links; validate installed-app identity, worker scopes and offline migration for the new path before moving. Existing local-storage keys are origin-scoped and should not be renamed merely for branding.

If the slug changes, review hardcoded project paths in `tools/verify-package.mjs`, `tools/verify-source-identity.mjs`, `tests/build-diagnostics-path.unit.mjs`, and `tests/build-diagnostics.unit.mjs`. Workflow repository references use the dynamic repository context. Historical run/issue links can retain their original URLs. No custom-domain/CNAME migration is currently indicated.

## Remaining limits

The strokes candidate's documented overhead + Short hop authoring/rules inconsistency remains; this branding work does not change compiler or validation behavior. The Node 22.4 optimized rig-test anomaly remains documented; current checks use the installed Node 24 runtime. Spin is still a proposal. No physical iPhone/iPad, native keyboard, VoiceOver or Dynamic Type acceptance is claimed. No AGENTS.md or available software-engineering skill was found; repository build/identity/verification guidance was followed.
