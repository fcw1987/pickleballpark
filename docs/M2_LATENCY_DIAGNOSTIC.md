# One bounded M2 latency diagnostic

This diagnostic cannot pass Quality, replace the required 3,600-point regression,
renew a holdout, change the 100 ms hosted p95 requirement or authorize deployment.
PR26 remains blocked by the observed 118–121 ms hosted p95. The runtime policy and
release gates stay frozen at `d4af73fd2e31442e892f41a254ee0623df8db991`.

The complete predeclared protocol is `tools/rally-latency-diagnostic-v1.json`.
It selects every archived complete Natural exactly-12-contact document with
identical input, document and outcome in the original and current records:
114 inputs, in original schedule order, with Pro/Advanced/Intermediate counts
47/36/31. No latency value was used to select or order a point. Exact input order
SHA256: `8a21382064d96819595d639724863dbaafa06833d0fc1761fe95e86d4853a520`.
Every input and its expected document/outcome hashes are explicit in the protocol.

One `ubuntu-24.04` hosted job uses pinned Node `24.22.1`, matching the retained
hosted observations. It extracts unmodified Git snapshots for:

- Old runtime: `4e336e3f268dfcce601618fd21319712f1e90456`.
- Current runtime: `d4af73fd2e31442e892f41a254ee0623df8db991`.

The selected runtime supplies both the engine and its own original collector.
Those collectors have identical source bytes. The four cells are:

| Cell | Runtime | Between first-generation measurements |
|---|---|---|
| A / old-original | Old | Original validation, retention and archive write |
| B / old-repeat | Old | Same, plus independent generation and two canonical hashes |
| C / current-original | Current | Original validation, retention and archive write |
| D / current-repeat | Current | Same, plus independent generation and two canonical hashes |

Block 1 is A, B, C, D; block 2 is D, C, B, A. All eight cells run sequentially
in fresh processes on the same host. Each uses the same 114 inputs and order.
The fixed budget is 912 first generations and 456 independent repeats: 1,368
rally calls total. There are no warmup exclusions, removed yields, forced GC,
slow-sample exclusions, latency subtraction or replacement cells.

The existing end-to-end collector boundary starts before input cloning, awaits
the actual generator with default cooperative yields and independent final
validation, then stops. Every result and raw time is retained. Collector
validation, independent repeats, hashing and writes are separate recorded phases.
Matching repeat projections are retained losslessly by reference to their first
projection plus hashes and non-projection diagnostics; mismatches retain the full
repeat. This avoids holding a second matching source graph between measurements.

CPU user/system time, heap/RSS, resource/context-switch counters, raw GC intervals,
default MessagePort yield counts/scheduling intervals and runner identity are
recorded alongside the actual wall time. Async hooks observe the existing ports;
the scheduler, runtime source and yield implementation are not replaced. A
20-channel toy test checks the port-pair accounting. Instrumentation overhead
remains included, without subtraction. Synchronous clock snapshots and lossless
repeat bookkeeping add observational overhead; the same instrumentation applies
to every cell, and this limitation must accompany interpretation.

All samples, first-result archives, repeat receipts, raw telemetry, exact source
hashes, execution order and host identity are retained. Summary comparisons are
paired within block/input; no result is labeled a release pass. This 114-point
retention context is smaller than the full 3,600-point release corpus and cannot
establish full-corpus acceptance or identify a universal runner cause.

The workflow exists only on `diagnostic/m2-latency-four-cell-v1`, with an exact
push trigger for that branch. It does not update PR26 or invoke Quality/Pages.
After both fixed blocks, stop and return the evidence for architectural review.
Do not optimize, change a threshold, consume a holdout or run acceptance again
as part of this experiment. An incomplete cell retains its evidence and stops;
there is no automatic retry.
