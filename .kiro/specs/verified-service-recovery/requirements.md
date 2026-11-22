# Verified service recovery requirements

## 1. Warehouse rehearsal

When the operator runs Warehouse Label Outage with the original plan, Ghost Drill shall report **Rollback completed**, **Failed**, and printing unavailable. The required label-printing and queue-endpoint checks shall expose recorded Baseline and Rollback results. The failed printing check shall link to **Switch queue to backup**.

When the operator adds **Restore label queue endpoint** and reruns, Ghost Drill shall start from the original fixture baseline, restore printing through the primary gateway, and report **Verified**.

## 2. Verdict rules

- If any required check is confirmed unhealthy in Baseline or Rollback, the verdict shall be **Failed**, even if another observation is missing. The proof shall identify every failed phase. A check that fails in both phases shall remain **Failed**.
- If each required check is confirmed healthy in both phases under the same requirement, the verdict shall be **Verified**.
- If no check is confirmed unhealthy and at least one required observation is missing, the verdict shall be **Unknown** and the proof shall identify the missing observation without a step link. An empty required set shall also yield **Unknown**.

## 3. Replay and fixture isolation

- When the operator selects **Missing Print Path Evidence** and runs it, the rollback shall complete with **Unknown** because the primary gateway's reachability to the print service was not observed in Rollback. Reset and rerun shall reproduce that result.
- When a draft changes after a run, the summary shall identify the recorded run as belonging to the previous plan until the operator reruns or reverts the edit.
- When the operator selects an earlier step, the map and selected-step evidence shall display that exact recorded snapshot. The Baseline and Rollback comparison shall stay identified as proof for the completed run.
- When the operator resets or switches fixture, the next view shall show the selected fixture's starting state and plan with no previous verdict or draft changes.
