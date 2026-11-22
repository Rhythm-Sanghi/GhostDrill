# Requirements Document

## Introduction

GhostDrill is a network maintenance rehearsal simulation. An operator selects a warehouse scenario, runs a drill that executes a change and rollback, and inspects whether the rollback restored service. After editing the rollback plan and rerunning, the operator needs to compare the two completed runs to see whether the edit changed the outcome. This feature adds a compact run comparison to the Evidence panel that surfaces the verdict transition, rollback steps added or removed between the runs, and the checks whose results changed, with each changed check linked to the recorded evidence from the correct run. The comparison uses only recorded runs, preserves the existing warehouse and missing-evidence flows, and isolates runs by scenario.

## Glossary

- **GhostDrill**: The network maintenance rehearsal simulation application.
- **DrillRun**: The recorded result of executing a drill, including snapshots, comparisons, verdict, and executed rollback step identifiers, as produced by the simulator.
- **Recorded Run**: A DrillRun captured at the moment a drill completes, used as the basis for the run comparison. Draft edits do not mutate a recorded run.
- **Active Scenario**: The scenario currently selected by the operator.
- **Run Comparison**: The computed difference between the two most recent recorded runs of the active scenario.
- **Prior Run**: The recorded run completed immediately before the most recent recorded run.
- **Most Recent Run**: The last completed recorded run.
- **Rollback Step Diff**: The set of rollback steps present in one recorded run's executed rollback step identifiers but absent from the other's.
- **Added Rollback Step**: A rollback step present in the most recent run's executed rollback step identifiers but absent from the prior run's.
- **Removed Rollback Step**: A rollback step present in the prior run's executed rollback step identifiers but absent from the most recent run's.
- **Changed Check**: A required check whose Baseline result status or Rollback result status differs between the prior run and the most recent run.
- **Baseline**: The result status of a required check observed in a recorded run's baseline snapshot.
- **Rollback**: The result status of a required check observed in a recorded run's final snapshot after rollback.
- **Verdict**: The service verification result of a recorded run: Verified, Failed, or Unknown.
- **includeRestore**: The operator-facing state that adds the restore-queue rollback step to the rollback plan.
- **canEditRollback**: A scenario attribute that permits editing the rollback plan.
- **Draft**: The rollback plan produced from includeRestore changes that have not yet been applied by a rerun.
- **Evidence Panel**: The panel that renders rollback proof and selected-snapshot evidence.

## Requirements

### Requirement 1: Retain completed runs for comparison

**User Story:** As a warehouse operator, I want GhostDrill to retain my last two completed drill runs of the active scenario, so that I can compare the outcome of my rollback plan edits.

#### Acceptance Criteria

1. WHEN the operator completes a drill, THE GhostDrill SHALL record the resulting DrillRun as the most recent run and retain the previously recorded run as the prior run.
2. THE GhostDrill SHALL retain no more than the two most recent recorded runs of the active scenario.
3. WHILE fewer than two recorded runs exist for the active scenario, THE GhostDrill SHALL provide no run comparison.

### Requirement 2: Compute the run comparison on rerun

**User Story:** As a warehouse operator, I want GhostDrill to compare the two most recent runs when the operator reruns the drill, so that the operator can see how the rollback plan edit changed the outcome.

#### Acceptance Criteria

1. WHEN the operator reruns the active scenario and two recorded runs exist, THE GhostDrill SHALL compute a run comparison between the prior run and the most recent run.
2. THE GhostDrill SHALL include in the run comparison the verdict of the prior run and the verdict of the most recent run.
3. THE GhostDrill SHALL include in the run comparison each added rollback step.
4. THE GhostDrill SHALL include in the run comparison each removed rollback step.
5. THE GhostDrill SHALL include in the run comparison each changed check, with the before result taken from the prior run and the after result taken from the most recent run.

### Requirement 3: Render the comparison inside the Evidence panel

**User Story:** As a warehouse operator, I want the comparison shown compactly in the Evidence panel below the rollback proof, so that the Threadmark interface and mobile usability are preserved.

#### Acceptance Criteria

1. WHERE a run comparison exists, THE GhostDrill SHALL render a compact run comparison group below the existing rollback proof in the Evidence panel.
2. THE GhostDrill SHALL render the run comparison group using the existing before-and-after proof styling used by the rollback proof.
3. THE GhostDrill SHALL confine the run comparison to the single existing Evidence panel.

### Requirement 4: Link changed-check evidence to recorded snapshots

**User Story:** As a warehouse operator, I want each changed check's before and after result to link to the recorded snapshot of the correct run, so that the operator can inspect the evidence behind the change.

#### Acceptance Criteria

1. THE GhostDrill SHALL render the before result of each changed check as a link to the recorded snapshot of the prior run.
2. THE GhostDrill SHALL render the after result of each changed check as a link to the recorded snapshot of the most recent run.
3. WHEN the operator activates a changed-check result link, THE GhostDrill SHALL select and focus the linked recorded snapshot.
4. THE GhostDrill SHALL make every changed-check result link operable from the keyboard, consistent with the existing evidence jump links.

### Requirement 5: Preserve Unknown and unchanged outcomes

**User Story:** As a warehouse operator, I want the comparison to preserve the Unknown verdict and state that no modeled outcome changed when results are identical, so that missing evidence is never masked by the comparison.

#### Acceptance Criteria

1. WHERE no required check's result status changed between the prior run and the most recent run, THE GhostDrill SHALL render a message stating that no modeled outcome changed.
2. WHILE a recorded run's verdict is Unknown, THE GhostDrill SHALL preserve the Unknown verdict in the run comparison.
3. WHERE the active scenario has canEditRollback set to false, THE GhostDrill SHALL render the message stating that no modeled outcome changed when the two recorded runs are identical.

### Requirement 6: Isolate the comparison by scenario and clear on reset

**User Story:** As a warehouse operator, I want the comparison to stay scoped to the active scenario and to clear on reset, so that runs and evidence from different scenarios remain separated.

#### Acceptance Criteria

1. WHEN the operator switches the active scenario, THE GhostDrill SHALL clear all retained recorded runs and the run comparison for the previous scenario.
2. WHEN the operator resets the active scenario, THE GhostDrill SHALL clear the retained recorded runs and the run comparison.
3. THE GhostDrill SHALL compute the run comparison only from recorded runs of the active scenario.

### Requirement 7: Keep draft edits from changing the comparison

**User Story:** As a warehouse operator, I want pending rollback plan edits to leave the recorded runs and the comparison unchanged until a rerun, so that the comparison reflects executed runs only.

#### Acceptance Criteria

1. WHILE a draft rollback plan differs from the executed rollback plan, THE GhostDrill SHALL leave the recorded runs and the run comparison unchanged.
2. THE GhostDrill SHALL update the run comparison only when the operator completes a rerun of the active scenario.

### Requirement 8: Preserve existing flows, keyboard navigation, and mobile usability

**User Story:** As a warehouse operator, I want the comparison to leave the existing warehouse and missing-evidence flows, timeline replay, keyboard navigation, and mobile layout intact, so that the simulation remains usable.

#### Acceptance Criteria

1. THE GhostDrill SHALL preserve the existing rollback proof and selected-snapshot evidence in the Evidence panel.
2. THE GhostDrill SHALL preserve the existing timeline replay and step selection behavior.
3. THE GhostDrill SHALL preserve keyboard navigation across the runbook, service map, and Evidence panel.
4. WHERE the workspace is viewed on a mobile viewport, THE GhostDrill SHALL render the run comparison within the compact single-column layout used by the existing Evidence panel.
