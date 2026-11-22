# Verified service recovery design

The fixtures share the warehouse topology and change steps. Warehouse Label Outage starts with the original incomplete rollback and supports the existing queue restore edit. Missing Print Path Evidence applies both rollback actions, but the primary print path has no captured reachability result after restoration. Reachability can be reachable, unreachable, or unobserved.

The simulator evaluates named requirements from each recorded state. **Label printing** depends on the active gateway's print path. **Queue endpoint** requires the queue to target the primary gateway. Results carry a short reason and, where applicable, the last relevant runbook step. Unobserved results name the dependency and carry no step reference.

Pair the first and last snapshots by required check ID. Check for a confirmed failure in either phase first, then for missing observations or an empty requirement set. The run retains the phase pairs and the aggregate verdict independently of the count of executed rollback actions.

Keep the current three-panel workspace. The summary reports the verdict and flags a previous plan when draft and executed step IDs differ. Evidence shows the phase pairs and adds selected-step results during replay. The native scenario selector clears the plan edit, recorded run, and replay selection when the operator changes fixtures. The topology distinguishes an unobserved active print path from a blocked path.

Exercise verdict precedence, unhealthy baselines, evidence provenance, and fresh runs with deterministic fixture tests. Check both user journeys, draft editing, switching, and keyboard operation against the built subpath.
