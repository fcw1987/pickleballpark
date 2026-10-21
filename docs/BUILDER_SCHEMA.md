
## Per-player movement extension

The iPhone candidate accepts optional `shot.playerMovement`, a record keyed by non-hitter player IDs. Each value uses the same bounded `intent`, `pinned`, optional `target` and `waypoints` contract as `shot.movement`. The hitter keeps its single `movement` entry; duplicate commands for the hitter are rejected. Old version-one documents are unchanged and require no migration. Older application builds do not implement these optional partner commands; use the new candidate to preview such exports faithfully.

The compiler uses existing elapsed-time movement and reachability bounds. A manual pin remains authoritative over generated coverage. Infeasible partner destinations stop the valid preview with an explanation rather than being redirected. Intermediate waypoints remain preserved but require the same explicit destination-only acknowledgement; this is not a path-planning extension.
