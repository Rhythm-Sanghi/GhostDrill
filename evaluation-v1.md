# Ghost Drill evaluation v1

Replay format 1 and simulator version 1. These results describe deterministic synthetic cases.

## Simulator cases

| Case | Expected verdict and reason | Observed |
| --- | --- | --- |
| Warehouse preset order | Failed. The backup gateway still cannot reach the print service. | Failed. The queue still targets backup. |
| Warehouse repaired, path reachable | Verified. The queue targets primary and its path reaches the print service. | Verified. Both required checks passed. |
| Same repaired order, path unreachable | Failed. The primary gateway cannot reach the print service. | Failed. The required printing check is unhealthy. |
| Same repaired order, path unobserved | Unknown. Reachability from primary to the print service is missing. | Unknown. The report names the missing observation. |
| Dispatch original order | Failed. The reopen attempt precedes connector restore. | Failed. The queue stays paused. |
| Dispatch reordered, connector restored | Verified. The connector is ready when the queue reopens. | Verified. Both required checks passed. |
| Dispatch reordered, connector stays offline | Failed. The connector is still unavailable at reopen. | Failed. The queue stays paused. |
| Missing Print Path Evidence preset | Unknown. Restoring the endpoint cannot fill in unobserved reachability. | Unknown. No source step is supplied for the missing evidence. |

[Simulator and replay tests](tests/replay.test.ts) · [Warehouse tests](tests/warehouse.test.ts) · [Dispatch tests](tests/dispatch.test.ts)

## Browser checks

Playwright exercises Chromium on desktop and mobile, including a 320 px viewport. A fresh context imports a real JSON download, rebuilds both runs, replays the contingency cases, and downloads matching Markdown. Invalid inputs preserve the currently loaded run. The desktop path uses Tab and Enter and checks visible focus. Status checks verify the accessible live-region content.

[Browser transfer checks](tests/replay.spec.ts) · [Recorded evidence replay](tests/drill.spec.ts#L362)

## Human usability

No participant sessions have been recorded.
