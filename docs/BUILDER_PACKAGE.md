# Builder package and offline contract

The deployment artifact is pinned to commit `7ef3961857b41731712bb3697eca29ff5664e43f`, where Build a Play is the default entry. Its runtime manifest contains exactly 91 files totaling 1,574,196 bytes, with manifest SHA-256 `1ad3da14624cd2d7170b07110f653620857d921129d9dc0a948f9013977db52b`. Documentation, drafts, test profiles, tests, and source art remain outside the runtime package.

`npm run build:site` rejects any path, byte length, or hash difference from `tests/fixtures/approved-runtime.json`. `node tools/verify-deployment-artifact.mjs dist <full-revision>` independently enforces the same source, manifest digest, file count, file set, byte count, and regular-file-only contract.

`node tools/verify-package.mjs` serves the exact artifact at the established Pages application subpath and checks Chromium and WebKit in fresh-install and real upgrade modes. The upgrade starts from retained production `f1308015d9e3848909e35d3919735b265e71fb7f` and cache v15. It verifies that the open planner arrangement survives worker activation, theme and unrelated caches survive, and cache v17 owns the new runtime. After the owned server stops, each case reloads the saved custom builder draft and round trips all eight lessons through the explicit planner workspace and 3D renderer.

If runtime code changes after this pin, regenerate `tests/fixtures/approved-runtime.json` from the complete approved runtime path set, recompute the formatted runtime-manifest SHA-256, and update the source, count, byte total, and digest constants together. A later pin must retain the strict path and hash comparisons; it must not add exclusions or weaken assertions to make a changed artifact pass.
