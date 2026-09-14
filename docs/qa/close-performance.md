# Close lifecycle and matched performance QA

Scope: candidate `30ed0cc` on `http://127.0.0.1:4198/`, compared with the retained `d669348` build on `http://127.0.0.1:4173/`. The close investigation used the candidate source. No production listener, renderer, compiler, storage, or UI change was needed.

## Pending field on close

The WebKit failure was a Playwright close-harness limitation, not a reproduced application defect. Playwright 1.61's installed API declaration says that `page.close({ runBeforeUnload: true })` runs before-unload handling but does not wait for the page to close. The application has no `beforeunload` listener: it commits an active text field by blurring it from `pagehide`, and the field's synchronous `change` action saves the document.

`tools/qa-close-lifecycle.mjs` routes a minimal same-origin page with an input, a synchronous `change` storage write, and individually selected lifecycle listeners. It does not install logging listeners into the decisive cases. Three trials per engine produced:

| Case | Chromium | WebKit | Close state before reopen |
| --- | ---: | ---: | --- |
| No lifecycle listener, `page.close()` | 0/3 stored | 0/3 stored | Closed in both engines |
| `pagehide` → blur → `change` → storage, `page.close()` | 3/3 | 3/3 | Closed in both engines |
| Direct storage from `pagehide`, `page.close()` | 3/3 | 3/3 | Closed in both engines |
| `pagehide` → blur, `runBeforeUnload: true` | 3/3 | 0/3 | WebKit still open after 250 ms; two context pages |
| Same WebKit case plus a no-op `beforeunload` listener | — | 3/3 | Added listener changes close behavior |
| Complete application, `page.close()` | 3/3 | 3/3 | Closed in both engines |
| Complete application, `runBeforeUnload: true` | 3/3 | 0/3 | WebKit old page remains open |

The no-listener control establishes that default close does deliver the `pagehide` commit rather than saving because close implicitly fires the input's `change`. The no-op `beforeunload` result explains why the earlier event-logging probe made all cases pass: its instrumentation changed the behavior being measured. Waiting for WebKit's `close` event with `runBeforeUnload: true` timed out because that page did not close.

The regression now calls `await page.close()` and asserts both `page.isClosed()` and removal of the old page from `context.pages()` before opening the replacement. The focused test passed 5/5 in Chromium and 5/5 in WebKit. Native Safari independently preserved `Native close pending title` after typing with the input focused, pressing Cmd+W, and opening a new window at the same origin, without injected lifecycle listeners. These results cover completed browser close; they do not claim crash or force-quit durability.

The final complete persistence file passed 11/11 in Chromium and 11/11 in WebKit. Its storage/history unit file passed 15/15.

## Matched CPU and resource measurements

`tools/qa-performance.mjs` ran both builds in Playwright Chromium 149.0.7827.55 on an Apple M3 Max host with SwiftShader, fresh isolated contexts, service workers blocked, 1440×900 CSS pixels, and DPR1. Each build received three runs. Each run used the same valid 3-, 8-, and 64-shot sources, 160/160/80 pure compiles, 20 target edits, 100 seeks, 100 menu open-close pairs, and 50 synchronous saves per source size. It then performed ten 2D/3D loops, observed 60 paused `requestAnimationFrame` callbacks, and completed three 64-shot reloads.

Values below are the median of the three per-run medians, in milliseconds. “Edit pipeline” includes validation, compilation, installation, save, and render scheduling. “Install pipeline” is one `loadDocument` including compilation, installation, save, and render.

| Shots | Build | Pure compile | Install pipeline | Target edit pipeline | Seek | Save |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 3 | `d669348` | 0.10 | 4.3 | 2.7 | 0.5 | 0.10 |
| 3 | `30ed0cc` | 0.10 | 4.0 | 2.5 | 0.5 | 0.10 |
| 8 | `d669348` | 0.10 | 4.4 | 2.9 | 0.6 | 0.10 |
| 8 | `30ed0cc` | 0.10 | 4.6 | 3.0 | 0.6 | 0.10 |
| 64 | `d669348` | 0.70 | 7.3 | 7.3 | 1.0 | 0.50 |
| 64 | `30ed0cc` | 0.70 | 7.6 | 7.1 | 1.0 | 0.50 |

Menu open-close p95 was 0–0.1 ms for every size and build, at the resolution limit of the page timer. Broader lifecycle medians were:

| Metric | `d669348` | `30ed0cc` |
| --- | ---: | ---: |
| First navigation through ready 3D | 142.3 ms | 140.1 ms |
| Warm 3D re-entry | 28.6 ms | 27.7 ms |
| 2D entry | 2.9 ms | 2.8 ms |
| Completed 64-shot reload | 794.1 ms | 796.7 ms |

Both builds loaded 91 resources. Encoded local resource bytes were 1,612,236 before and 1,613,844 after, an increase of 1,608 bytes (about 0.10%). Renderer memory began and ended at 43 geometries and 17 textures in all six runs. All three runs per build recorded zero application render calls while 60 paused rAF callbacks elapsed in 493–496 ms.

The candidate shows no material regression in these matched tasks. Differences are small relative to run variation and 0.1 ms page-timer resolution; the measurements do not establish a speed improvement. rAF timing is callback cadence, not displayed FPS. Renderer function calls cover CPU command submission, not GPU completion, and this headless desktop software-rendering run is not a physical-device or native-Safari benchmark.

## Independent persistence review

Fresh-draft UUID commit `ac88f66` assigns a new identifier before the initial history snapshot whenever `loadLast()` returns no document. It reuses the same `crypto.randomUUID()` path already used by New, Save As, template, and import copies. Separate fresh tabs therefore save different document identities; malformed-storage recovery also receives a fresh identity while retaining its visible storage error. No correctness issue was found.

Planner authority commit `9e6e2b7` claims a source-intent generation before confirmation and checks it after both awaited boundaries: confirmation and restoration of the builder workspace/3D view. All source replacements claim intent at action entry; edits, history changes, direct document loads, and returning to Planner also advance intent. A newer Open, import attempt, edit, Save As, undo/redo, New, template choice, or Planner return therefore prevents the older planner snapshot from applying. View-only and playback-only actions do not invalidate source intent. No missing source mutation or stale-apply path was found in the reviewed control flow.

The four delayed source-authority cases plus the two-tab fresh identity case passed 5/5 together in Chromium and 5/5 in WebKit. This review found no additional production correction to propose.
