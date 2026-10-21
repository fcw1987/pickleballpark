# Builder lifecycle independent review

Review base: `1ea202d`. Scope: builder lifecycle behavior only. The review uses the real built-in play data and browser runtime; it does not replace the catalog or renderer with a mock.

## Coverage

`tests/builder-lifecycle.spec.mjs` exercises these boundaries:

- 30 complete builder 2D/3D and builder/planner round trips, asserting byte-identical source, exact playhead preservation, and retained planner positions and drawings.
- Repeated paused 3D camera, resize, seek, and render requests, asserting each demand settles with no RAF and that no spontaneous RAF growth follows.
- A deliberately delayed 3D entry followed by a planner switch, asserting the stale continuation cannot reopen 3D or leave the planner locked.
- WebGL allocation failure, asserting a visible, editable 2D builder fallback.
- 50 loop cycles advanced through the production `CoachingSession` timing path, followed by exit and checks for pending RAF, hold timer, playback, or restart.
- Persisted source reload plus malformed local-storage recovery, asserting malformed content is retained for recovery and never interpreted as a draft.

The tests use animation-frame settling only to observe scheduler quiescence. They do not use fixed sleeps or arbitrary timeout delays to hide races.

## Findings

No lifecycle defect was reproduced by this suite on Chromium at the review base. The strongest residual risk is delayed 3D loading: it crosses builder and renderer generation counters, abort handling, workspace ownership, and asynchronous scene allocation. The regression makes the builder continuation stale while the request is outstanding and verifies the eventual completion cannot alter planner state.

The 50-cycle check accelerates the session by passing an exact synthetic timestamp through `CoachingSession.tick`; it validates loop arithmetic and post-exit scheduler state without waiting through 50 wall-clock holds. The 30 round-trip check uses actual renderer entry and disposal, so it also covers repeated WebGL resource ownership at the builder boundary.
