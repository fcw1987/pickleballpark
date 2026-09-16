# Smart rally adversarial review

Branch: `work/smart-rally-adversarial` at `ebe89d7`.

The new unit suite is `tests/smart-adversarial.unit.mjs`. It exercises the shared effective compiler/rule boundary, Auto Shading inputs, exact 99 hit boundaries, malformed request limits, deterministic seeds, authored-prefix preservation, waypoint retention, family changes, stale proposal authorization, and repeated proposal behavior.

The suite also records one generator failure as a regression. `proposeRandomRally({ length: 3, seed: 5 })` returns a document that passes `evaluateFullCandidate`, has three valid compiled hits, and carries `ending: "stop"` with `intentionalFault: false`. `proposeSmartAdd(source, { seed: 6 })` then returns `ok: false` with `No compatible continuation was found after 48 bounded attempts.` The source family sequence is `serve / return / drop`. This is a valid playable prefix that Smart Add cannot extend, so it does not meet the authoring expectation that a normal draft can keep adding compatible shots without manual repair.

Baseline command:

```sh
node --test tests/smart-adversarial.unit.mjs
```

On this branch, the boundary and preservation checks pass; the dead-end regression is expected to fail until generation accounts for future reachability or offers a compatible continuation policy for this state. No production source was changed by this review.

