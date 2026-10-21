# Smart rally adversarial review

Branch: `work/smart-rally-adversarial` at `ebe89d7`.

The new unit suite is `tests/smart-adversarial.unit.mjs`. It exercises the shared effective compiler/rule boundary, Auto Shading inputs, exact 99 hit boundaries, malformed request limits, deterministic seeds, authored-prefix preservation, waypoint retention, family changes, stale proposal authorization, and repeated proposal behavior.

The review found a generator dead end: `proposeRandomRally({ length: 3, seed: 5 })` returned a document that passed `evaluateFullCandidate`, had three valid compiled hits, and carried `ending: "stop"` with `intentionalFault: false`, while `proposeSmartAdd(source, { seed: 6 })` could not append Shot 4. The source family sequence was `serve / return / drop`. Random generation now performs one bounded forward reachability check (up to the shared 99 hit limit), and Smart Add checks the resulting state for one further continuation before accepting a candidate. This preserves the requested hit count, authored prefix, cancellation, and deterministic metadata while avoiding a valid dead-end state.

Baseline command:

```sh
node --test tests/smart-adversarial.unit.mjs
```

On this branch, the smart-rally, Coach, and adversarial suites pass, including the original Fifth Shot Drop continuation and 100-seed short-rally corpus with five Adds per seed.
