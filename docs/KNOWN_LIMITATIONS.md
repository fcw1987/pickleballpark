# Known limitations

See [the current combined gauntlet](fidelity/GAUNTLET_STATUS.md) for active acceptance work. [QA_STATUS.md](QA_STATUS.md) and [the stabilization report](BETA_STABILIZATION_REPORT.md) record the preceding checkpoint.

## Historical Safari risk

- **BETA-001:** the historical native Safari blank 3D court after Help has not recurred, including on the final v22 package. Its original cause remains unproved. The separately reproduced parked-context-loss blank is fixed and passes native Safari recovery. The robustness and visual fidelity assignment supersedes the earlier historical-cause hold: its gate requires no reproducible current native Safari blank, while preserving this risk honestly. The new combined candidate still requires native retesting; this is not a claim that the historical cause was fixed.
- All seven confirmed product defects in the preceding beta campaign were corrected at checkpoint `1375835`. New gauntlet findings and corrective review remain active in the current ledger.

## Test environment

- Seven macOS Playwright WebKit cache/offline-emulation tests still fail. Minimal no-app diagnostics reproduce the internal-error/cache-loss signatures; actual stopped-server package/offline and upgrade tests pass in both engines. No macOS waiver is applied.
- Physical iPhone/iPad, hardware touch cancellation, native software keyboard, Dynamic Type and VoiceOver remain unverified. No Apple simulator is installed. Browser touch/viewport/CSS enlargement tests are simulations.
- CPU submission timings and callback cadence do not measure displayed FPS or GPU completion. Motion recordings were reviewed through samples spanning their duration, not every frame.

## Product capabilities

- Retained intermediate movement waypoints require explicit destination-only acknowledgement; those paths are preserved but not animated.
- Dedicated speedup/block semantics beyond existing family mappings, Erne/ATP, spin control, scoring, poach/stacking strategy simulation, measured biomechanics and inferred outcomes are outside current scope. See the future capability list in [SCENARIO_CATALOG.md](SCENARIO_CATALOG.md).
- At the checkpoint, camera is inside Playback options and Save As immediately creates a named copy. The current interface mission reviews their discoverability while preserving both capabilities.
- A transient drawing-buffer/CSS-size lag during resize was observed without blank rendering. It remains an unconfirmed low-severity observation; no speculative runtime patch was made.
