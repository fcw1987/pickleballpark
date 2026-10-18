# Pickleboard name restoration — current local candidate

Pickleboard is the product name. Current interface text, install label, package description, banner and raised village sign restore it. The sign retains its original footprint and materials; the accepted village and court remain unchanged. Existing install identity, repository and hosted URLs, service-worker scope, cache namespace, theme key, draft keys and JSON play compatibility remain stable. The entries below describe earlier candidates and retain their historical labels.

---

# Unified iPhone builder candidate — draft review

This successor candidate retains the complete court-centered builder at `4816210` and the earlier pushed builder at `d9b75d7`. It adds a shallow phone shot editor with full details, per-player movement placement, safer touch cancellation and local save conflict recovery. File/Plays, direct paused target editing, explicit waypoint acknowledgement, eight lessons, shared 2D/3D time, planner and original artwork remain.

The existing Pages preview is still published from `feature/visual-play-builder`. This candidate uses a separate branch and draft PR; it must not update that preview, main or deployment settings. Runtime checkpoint: `7bfb7dd`. See [verification](UNIFIED_IPHONE_VERIFICATION.md) for changes, browser evidence, package identity and device limitations.

---

# Local visual play builder candidate — not published

The local builder candidate follows the court-first `e4e23a9` baseline. Build a Play is now the paused 3D front door, with one shared 2D/3D session, genuine parameterized rallies, named local drafts and JSON backups, independent shading/guides, and the retained planner. The approved pixel art and eight lessons remain. This is a local product expansion for owner review; the public site is unchanged. See [builder verification](BUILDER_VERIFICATION.md) for exact tests, model limits, screenshots, recordings and offline evidence.

---

# Pickleball Park, pixel park baseline for live testing

The owner approved the rebrand on desktop and authorized delivery through the existing repository and Pages path. This sanitized public snapshot carries the approved runtime plus deliberately selected maintainer documentation and five reviewed app-only stills in [rebrand verification](REBRAND_VERIFICATION.md). It is a release candidate for live testing, not a stable 1.0 announcement.

## Permanent product name

Pickleball Park, formerly Pickleboard, is an interactive pickleball coaching and strategy app with an editable tactical board, guided lessons, and spatial replay in one original pixel art park. The full name appears in the interface, install manifest, source-authored park sign, and current documentation. New project-owned package identity is `pickleballpark`.

The existing install start URL, worker registration and scope, theme preference, and internal compatibility contracts remain stable. The current cache version updates local assets without changing install identity or deleting unrelated storage.

## Accumulated change from public main

The previous public main baseline was `e67d060ca44a3c27af346007e619927bc6e3c9a1`. The visually accepted runtime source is `f89cdfd`; this sanitized snapshot deliberately carries that approved runtime through a clean publication route rather than publishing its original development ancestry.

Compared with public main, the accepted runtime includes an elevated editable SVG court with precise inverse dragging and drawing projection; original directional pixel athletes in the editor and spatial replay with connected grips; a textured park and consistent landmarks; one canonical court definition with service centerlines outside the kitchens; continuous rally flight and camera-independent facing; and a high-contrast outlined ball with restrained tracking cues.

The shared timeline supplies eight illustrative lessons: Serve & Return, Third Shot Drop, Third Shot Drive, Fifth Shot Drop, Dink Exchange, Volley & Block, Short-Hop Reset, and Lob & Overhead. Loop, responsive transport and instruction panels, readable shot cues, interruption-safe pause/resume, snapshot restoration, lazy-loading cancellation, recoverable failure paths, and demand rendering are included. These examples are not a complete officiating engine, physical simulation, or biomechanics model.

## Compatibility and known limits

The worker remains at `sw.js` with the existing scope and `./index.html` start URL. The accepted runtime uses cache version v15 in the retained compatibility namespace; the existing theme key remains compatible. Only theme preference persists across reloads; player arrangements, drawings, and handedness are session-only.

Local rebrand checks recorded 122 Chromium browser tests, 49 unit tests, and 77 asset checks. WebKit recorded 115 passes and seven documented offline-emulation/cache failures. These historical local counts are context only; those were historical results, superseded by the executed hosted checks in [live delivery verification](LIVE_TESTING_DELIVERY.md). The actual public v8-to-v15 package upgrade passed in Chromium and WebKit. Native Safari, installation, and physical phone/tablet behavior are outside the claims made here. No universal performance guarantee is made.

The public evidence intentionally excludes recordings, raw test logs, browser metadata, local machine paths, and redundant historical evidence. The retained stills establish the visible board, guided, 3D replay, menu, and help states; they do not claim frame-accurate video behavior or physical-device coverage.

## Release preparation

Suggested release title: **Pickleball Park — unified pixel park coaching and rebrand**. Keep the existing repository and Pages URLs until a coordinated rename is separately approved and tested. See [public release snapshot](RELEASE_PUBLICATION_SUMMARY.md), [rename handoff](RENAME_HANDOFF.md), and [coaching verification](PARK_COACHING_VERIFICATION.md).
