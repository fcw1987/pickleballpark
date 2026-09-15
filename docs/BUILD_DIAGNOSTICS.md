# Build identity and diagnostics

Pickleball Park exposes `version.json` at the source root and in a packaged
`dist/` artifact. The endpoint contains build metadata only. It does not
contain saved plays, browser storage, credentials, absolute paths, or a claim
that an unstamped working tree is a release.

The runtime imports `build-identity.js` during startup and captures that object
as the Running build. `build-diagnostics.js` can make one explicit request to
`./version.json` with `cache: "no-store"` and a cache-busting query. The result
is labelled Server build and remains separate from the loaded snapshot. If the
request fails, the report keeps the Running build and labels the server status
unavailable; offline use therefore remains truthful.

Identity fields distinguish the source revision, package revision, and review
evidence revision. `runtimeSha256` is the digest of a canonical list of static
runtime file paths and bytes. The fileset explicitly excludes generated
`version.json`, `build-identity.js`, `build-info.json`, and
`runtime-manifest.json` so metadata cannot hash itself recursively. The package
manifest still records the exact bytes of the generated files.

## Local source and package flow

After the intended source commit is frozen, stamp metadata locally:

```bash
npm run stamp:build -- --source-revision <source-sha> \
  --cache-version <cache-label> --status packaged
npm run build:site
npm run verify:deployment-artifact -- dist <package-sha>
```

`stamp:build` writes `version.json` and embeds the same snapshot in
`build-identity.js`. It reports a dirty tree as development/unverified. The
existing `pin:local-candidate <full-source-sha>` workflow then expands the
reviewed runtime fixture, updates its exact digest/count contract, and must be
run only after the runtime is frozen. It does not publish, push, or alter Pages
settings.

The package build copies `version.json` under the same subpath as the rest of
the static application. A source-branch server and a `dist/` server can
therefore be checked at `/version.json` (or the equivalent project subpath)
without depending on a legacy build-info endpoint.

