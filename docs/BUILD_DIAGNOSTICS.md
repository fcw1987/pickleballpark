# Build identity and diagnostics

Pickleboard exposes `version.json` at the source root and in a packaged
`dist/` artifact. The endpoint contains build metadata only. It does not
contain saved plays, browser storage, credentials, absolute paths, or a claim
that an unstamped working tree is a release.

The runtime imports `build-identity.js` during startup and captures that object
as the Running build. `build-diagnostics.js` can make one explicit request to
`./version.json` with `cache: "no-store"` and a cache-busting query. The result
is labelled Server build and remains separate from the loaded snapshot. If the
request fails, the report keeps the Running build. Network failure is labelled
offline; a reachable server that returns 404 is labelled not-found and remains
online, so a missing endpoint is not misreported as disconnected use.

Identity fields distinguish the source revision, package revision, and review
evidence revision. `runtimeSha256` is the digest of a canonical list of static
runtime file paths and bytes; it does not claim to hash the browser's loaded
memory. The fileset explicitly excludes generated `version.json`,
`build-metadata.js`, `build-info.json`, and `runtime-manifest.json` so metadata
cannot hash itself recursively. Runtime logic in `build-identity.js` remains
covered. The package manifest still records the exact bytes of generated files.

## Local source and package flow

After the intended source commit is frozen, stamp metadata locally:

```bash
npm run stamp:build -- --source-revision <source-sha> \
  --cache-version <cache-label> --status local
# Commit only the generated metadata, producing metadata revision M.
npm run pin:local-candidate -- <full-metadata-revision-M>
# Commit the updated package fixture and checks, producing package revision P.
npm run build:site
npm run verify:deployment-artifact -- dist <full-package-revision-P>
```

`stamp:build` writes `version.json` and the generated `build-metadata.js`
snapshot. It verifies that the current runtime bytes and paths match the
explicit source revision; docs and generated metadata changes do not make that
runtime comparison dirty. A changed runtime is reported as development and
cannot be stamped as packaged or verified. The existing
`pin:local-candidate <full-metadata-revision-M>` workflow then expands the
reviewed runtime fixture, updates its exact digest/count contract, and must be
run only after the runtime is frozen. It does not publish, push, or alter Pages
settings.

The local packaging phases are: freeze runtime source revision S; stamp
metadata for S; commit the generated metadata as metadata revision M; pin M's
exact runtime files; commit that fixture and its checks as P; build P's artifact; then run artifact
verification. `verified` is reserved for metadata carrying matching source and
package proof. The Running build is the startup snapshot; a queried endpoint is
reported separately as Server build and cannot replace it.

The package build copies `version.json` under the same subpath as the rest of
the static application. A source-branch server and a `dist/` server can
therefore be checked at `/version.json` (or the equivalent project subpath)
without depending on a legacy build-info endpoint.
