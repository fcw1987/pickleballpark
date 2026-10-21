# Pickleball Park identity continuity

The authoritative product name is **Pickleball Park**, with **PICKLEBALL PARK** on signs. The current branding continuation supersedes the October 18 naming direction. Historical reports and screenshots retain the labels they actually captured.

## Preserved compatibility contracts

- Current repository: <https://github.com/fcw1987/pickleballpark>
- Current published site: <https://fcw1987.github.io/pickleballpark/>
- Internal development package name: `pickleboard`
- Install start URL: `./index.html`; no new manifest `id`
- Existing service-worker registration path, scope and `pickleboard-` cache prefix
- Existing `pickleboard-theme` preference and `pickleballpark-builder-v1` draft key
- Existing `window.pickleboard` API, play schema and JSON import/export compatibility

Display-name corrections do not migrate or clear saved data. The cache advances from v30 to v31 to refresh the changed runtime assets within the same namespace. Historical release metadata and evidence remain factual; the local continuation has its own build identity.

## Approved GitHub rename — completed October 21

The owner approved renaming `fcw1987/pickleboard` to `fcw1987/pickleballpark`. Repository ID `1039845562` and node ID `R_kgDOPfrIug` stayed unchanged. The About description and homepage now use Pickleball Park. The Geese clone's GitHub origin was updated; the other inspected clones retain their local-path origins.

Pages still publishes `integration/robustness-visual-fidelity` at `/`, commit `b2b36e2f5c4ad542cdf43a2a03cf1a1f7db27585`. GitHub automatically rebuilt that same revision after the rename; the build completed successfully. No local candidate was pushed and no publishing setting or workflow was changed. Six served entry/runtime files at the new URL exactly match that original published commit.

The old repository URL redirects to the new repository. The old Pages URL returns 404; use the new site address. Existing installed shortcuts and path-specific service workers may still target the old address. The earlier v23/v30-to-v31 verification covers upgrades within one project path, not migration between the old and new URLs. Saved browser storage keys remain unchanged; installed-app migration at the new path still needs validation before publishing the candidate. See [the audit and remaining publication work](PICKLEBALL_PARK_BRANDING.md).
