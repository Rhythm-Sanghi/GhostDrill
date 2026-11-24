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

[Browser transfer checks](tests/replay.spec.ts) · [Recorded evidence replay](tests/drill.spec.ts#L364)

## Acceptance review extension

The signed-out baseline at `4a47273` exercised Warehouse repair, Dispatch reorder, Missing Print Path Evidence, and replay transfer. It recorded 27 passes, two desktop-only skips on mobile, and one desktop file-chooser timeout. The release transfer tests drive the real chooser directly and exercise Tab and Enter separately through the sample and evidence controls.

Replay format 2 records the selected acceptance requirements. Service verification still compares the baseline and final snapshots. Acceptance reviews the recorded evidence for those requirements.

| Synthetic case | Expected | Observed in simulator tests |
| --- | --- | --- |
| Dispatch sample · reopened early, restored, retried | Verified service and Violation at step 1. The retry passes. | Verified and Violation. First attempt offline at step 1, retry ready at step 3. |
| Dispatch sample · restored before both attempts | Verified service and Meets requirements. | Verified and Meets requirements. Both attempts found the connector ready. |
| Warehouse repaired · primary path is observed unreachable | Failed service and Violation. The observation requirement still passes. | Failed and Violation. Printing failed and reachability was observed. |
| Warehouse repaired · primary path is unobserved | Unknown service and Needs evidence. | Unknown and Needs evidence. The missing reachability observation is named. |
| Warehouse original order with unobserved primary path | An endpoint violation takes precedence while missing evidence stays visible. | Violation. Printing and endpoint failed, and the evidence check remained missing. |
| No selected requirements or no executed reopen attempt | Needs evidence. | Needs evidence in both cases. The action check names the absent attempt. |

The browser transfer check opens the sample, inspects each attempt, corrects the order, downloads v2 JSON, imports it in a fresh context, and checks the matching Markdown. The legacy replay test verifies that a v1 file opens as unevaluated and that reruns remain importable at the safe run-number boundary.

[Acceptance simulator cases](tests/acceptance.test.ts) · [Kiro prerequisite tests](tests/dispatch-prerequisite.test.ts) · [Sample review browser test](tests/acceptance.spec.ts)

## Human usability

No participant sessions have been recorded.
