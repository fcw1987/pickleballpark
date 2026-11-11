# Advanced doubles stacking

Stacking lets a pair return to agreed left/right playing sides after the legal
serve or return. It does not change who serves, who receives, or which serving
area applies. This application describes one rally, not a scored match: it must
never guess score parity, starting-server identity or a new service order.

## Rules and coaching are different

The [2026 USA Pickleball rulebook](https://usapickleball.org/docs/rules/USAP-Official-Rulebook.pdf)
requires the correct server and receiver (5.B.1–5.B.3). The server's feet must
satisfy the serving-area requirements at contact (7.A.1–7.A.3). Partner placement
is otherwise flexible on their own end, including outside the sidelines (5.B.4).
This does not make a partner standing in the serve's path safe: a serve striking
the receiving team before landing faults the receiver (7.E.5). The returner must
let the serve bounce; either serving partner must let the return bounce (10.A).
Volley feet and subsequent momentum remain subject to the non-volley-zone rules
(11.A). No stacking option exempts a contact from these checks.

Do not describe waiting until contact to switch as a blanket rule forbidding a
partner's earlier movement. It is a useful coordination policy, separate from
service identity and foot legality.

## Practical nuances

- **Half stack:** stack while serving. Both players unwind laterally behind the
  baseline, ready for the bounced return, rather than charging the kitchen.
- **Full stack:** also stack while receiving. A traditional return stack puts the
  non-returner outside the receiving-side sideline near the kitchen line. After
  the return, that partner enters as the returner approaches the opposite lane.
- **Switching:** a return-side alternative starts in conventional positions and
  switches after the return. It needs coordinated paths, often hand signals, and
  must not be drawn as two players running through one another.
- **Buy time:** a deep, controlled return gives the returner more time to cross
  and approach. An awkward or short return may require splitting and defending
  in transition, not sprinting through the next shot to reach an ideal marker.
- **Preferred sides are not ball ownership:** a right/left-handed pair may want
  both forehands toward the middle. Same-handed pairs can stack too. Mobility,
  backhands, reach, strengths, angles and matchups matter. The better situated
  player can take a middle ball; a temporary poach does not rewrite the pair's
  preferred sides.
- **Communicate and recover:** agree on switching and middle coverage. Protect
  the gap together, recover toward the kitchen when appropriate, and remain
  balanced for the opponent's contact. Stacking is a means to that formation,
  not a requirement to chase an assigned spot during every exchange.

Coaching references: [Pickler: How to Stack](https://insideden.com/pickleball-blog/how-to-stack-pickleball/)
and [Pickleball.com: The doubles strategy explained](https://pickleball.com/learn/how-to-stack-in-pickleball-the-doubles-strategy-explained).
Rules and links checked on 2026-11-11.

## Source contract

The opt-in source shape is:

```json
{
  "version": "stacking-v1",
  "teams": {
    "green": { "mode": "serve-only", "leftPlayer": "player2" },
    "orange": { "mode": "full", "leftPlayer": "player3" }
  }
}
```

Omit a team to disable its preference. Omit `stacking` when both teams are off.
`leftPlayer` means the left side from that team's view facing the net: high board
X for green, low board X for orange. Handedness never silently assigns it.
Unknown versions, fields, modes and opposing-team identities are rejected.

`rally-stacking.js` is a pure source/policy boundary. It validates without
mutating documents, provides canonical detached generator settings, resolves
lane preferences by the actual service role and contact index, and can create a
traditional setup only when a new generator request omitted its layout. Full
stacking in a midrally start supplies stable preferred sides; serve-only does not
invent the missing service role. Unspecified service cannot activate a switch.

## Builder and persistence

The **Advanced stacking** section in Coach tools stores preferences for the next
Random Rally. The Random Rally dialog also offers a per-request override; turning
both teams Off there produces a genuinely unstacked request rather than falling
back to the saved configuration. Cancel leaves the original play unchanged.
Both controls display the existing player name and immutable player number to
avoid confusing a starting-side label with the requested preferred side.

The optional setting is accepted on legacy documents as future-generation
preferences; it does not convert their physics or rewrite trusted lesson motion.
Model 2 playback retains the metadata but plays the explicit authored routes.

## Motion and source guarantees

The same source survives document validation, export/import, save/load,
duplicate, Undo/Redo and generation provenance. Old documents remain unchanged.
An edited document's preferences may differ from its original generation recipe;
the recipe is provenance, not an instruction to regenerate it while loading.

Author-supplied layouts, service roles, feet, movement commands and pins remain
authoritative. Do not replace them on compile or load to make a stack work. New
generated defaults may position the partner for a stack, but an explicit layout
must be preserved exactly. A preferred lane is a tactical goal, never proof that
a player reached it or a restriction on which legal partner may hit a ball.

Generated movement uses the same physical sampler and actual contact times
as other movement. Opening serve movement can unwind sideways but remains deep;
the receiving formation holds until the designated return. The current sampler
cannot express a separate delayed start for an off-ball partner, so the serving
partner conservatively holds through the first segment and completes its lateral
move during the return flight. The server uses its actual contact/release hold.
Both partners make
bounded progress, with hitter contact holds, body spacing, collisions, pins and
the two-bounce rule intact. Short time means partial progress. Unsafe crossing
paths are held or rejected with a diagnostic, never teleported or silently
declared complete. Actual arriving feet still take precedence over formation.

The stacking tests cover both ends, both service courts, every server/receiver identity, both hands,
both preferred assignments, full/half/off, source preservation, missing roles,
illegal serving feet, insufficient time, crossing routes and interrupted stacks.
The engine driver independently rejects settings that differ from the normalized
request before granting generation provenance. Explicit configurations survive
failed writes, conflicts and full-library checks without losing existing work.
