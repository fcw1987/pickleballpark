# Known limitations

This file separates unsupported product capabilities, test-environment limits and unresolved defects. It is updated during beta stabilization; see [QA_STATUS.md](QA_STATUS.md) for evidence and severity.

## Unresolved defects

- BETA-001: native Safari reportedly showed a blank 3D court after Help on the prior packaged candidate. Release blocker under investigation; no root cause or successful correction is claimed yet.

## Test environment

- Physical iPhone/iPad behavior, native software keyboard and VoiceOver are not established by browser emulation.
- The Apple simulator tool is unavailable on this machine.
- The prior macOS Playwright WebKit offline-emulation/cache failures need separate reporting from real stopped-server package/offline behavior.

## Product capabilities

- Retained intermediate movement waypoints require the explicit destination-only preview acknowledgement; the application does not animate those paths.
- Scenario-specific unsupported pickleball capabilities will be recorded with the durable scenario catalog rather than implemented as part of stabilization.
