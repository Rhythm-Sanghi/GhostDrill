# Implementation Plan: Compare Rollback Runs

## Overview

Add a compact run comparison to the existing Evidence panel so an operator can see how a rollback-plan edit changed the outcome across the two most recent completed runs of the active scenario. The comparison is computed by a new pure module (`src/comparison.ts`) over the unchanged `DrillRun` model; `App.tsx` retains the prior run in state and derives the comparison; `Evidence.tsx` renders the verdict transition, added/removed rollback steps, and changed checks (each linked to the correct recorded run's snapshot); `ServiceMap.tsx` gains a focus target for prior-run links; `styles.css` adds minimal additive rules. The simulator and scenario modules are not modified. Implementation language is TypeScript (detected in Clarify).

## Tasks

- [ ] 1. Implement the pure comparison core and its tests
  - [ ] 1.1 Implement `src/comparison.ts`
    - Define shared types: `RunRef`, `ChangedCheck`, `RunComparison`, `ResolvedStepDiff`, `ResolvedRunComparison` (import `CheckId`, `CheckResult`, `DrillRun`, `Verdict` from `./simulator`)
    - Implement `compareRuns(prev, current)`: diff `executedRollbackStepIds` into `addedStepIds`/`removedStepIds`; pair `changedChecks` from each run's `comparisons` (changed when baseline **or** rollback status differs, `before` = prior rollback result, `after` = current rollback result); set `identical` iff no added/removed steps and no changed checks; pass through `priorVerdict`/`currentVerdict` verbatim
    - Implement `resolveComparisonTitles(base, titleFor)`: map step-id diffs to titled `ResolvedStepDiff` entries via a scenario-derived lookup
    - Pure, deterministic, no React, no side effects
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.3_
  - [ ]* 1.2 Write property test for verdict passthrough
    - **Property 1: Verdict passthrough preserves Unknown**
    - **Validates: Requirements 2.2, 5.2**
  - [ ]* 1.3 Write property test for rollback step diff
    - **Property 2: Rollback step diff is the symmetric set difference**
    - **Validates: Requirements 2.3, 2.4**
  - [ ]* 1.4 Write property test for changed-check pairing
    - **Property 3: Changed checks pair prior rollback with current rollback**
    - **Validates: Requirements 2.5**
  - [ ]* 1.5 Write property test for identical detection
    - **Property 4: Identical detection and self-comparison idempotence**
    - **Validates: Requirements 5.1, 5.3**
  - [ ] 1.6 Write concrete example tests in `tests/comparison.test.ts`
    - `warehouseOutage` Failed→Verified: assert added step `restore-queue`, verdict transition, and the two changed checks with before/after statuses and step ids
    - Two identical `missingPrintPath` runs: assert `identical === true`, `Unknown → Unknown`, empty step/check diffs
    - _Requirements: 2.2, 2.3, 2.5, 5.1, 5.3_

- [ ] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Wire run retention and comparison into `src/App.tsx`
  - Add `previousRun: DrillRun | null` and `selectedRef: { run: RunRef; id: string }` state (replacing `selectedId`); default `selectedRef` to `{ run: 'current', id: 'baseline' }`
  - Add `rollbackStepTitle(scenario)` lookup over `[...scenario.rollbackSteps, restoreQueue]`; compute `comparison` via `useMemo` from `previousRun` and `run` (null until two runs recorded)
  - `executeDrill()` sets `previousRun` to the current `run` (null on first run) before running, then sets `run` and points `selectedRef` at the new run's final snapshot
  - `clearRun()` nulls `previousRun` and resets `selectedRef` (called by both `reset()` and `selectScenario()`)
  - Generalize `jumpToStep` → `selectSnapshot(id, runRef)`: current-run links focus the runbook step button; prior-run links focus the ServiceMap panel
  - Resolve `selected` from the run indicated by `selectedRef`; runbook `aria-current` becomes `selectedRef.run === 'current' && selectedRef.id === step.id`; pass `onSelectSnapshot`, `comparison`, and `selectedRunRef` to `Evidence`
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 4.3, 6.1, 6.2, 6.3, 7.1, 7.2_

- [ ] 4. Render the run comparison in `src/Evidence.tsx`
  - Replace the `jumpToStep` prop with `onSelectSnapshot: (id, runRef) => void`; add `comparison: ResolvedRunComparison | null` and `selectedRunRef: RunRef` props
  - Thread a `runRef` argument through `renderResult`; its "View step"/"Inspect responsible step" button calls `onSelectSnapshot(result.stepId, runRef)`; the "responsible" wording applies to any rollback-phase result that is `unhealthy` (`Rollback`, `Before`, or `After`)
  - Append a "Run comparison" `proof-group` after the rollback-proof section, rendered only when `comparison` is non-null: verdict-transition line (`priorVerdict → currentVerdict` with tone classes), "No modeled outcome changed between runs." message when `identical`, added/removed step lists, and changed checks rendered as `proof-check` + `proof-result` with `Before` (prior) / `After` (current) results
  - Selected-snapshot section passes `selectedRunRef` to its result links; rollback-proof section passes `'current'`
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.4, 5.1, 5.2, 5.3_

- [ ] 5. Add a ServiceMap focus target for prior-run links
  - Add `id="service-map"` and `tabIndex={-1}` to the ServiceMap panel `<section>` so a prior-run snapshot link can move focus to the recorded snapshot's visual when no runbook step button exists for it
  - _Requirements: 4.3_

- [ ] 6. Add comparison styling in `src/styles.css`
  - Add additive rules reusing existing tokens: `.comparison-verdict` (verdict-transition line), `.comparison-identical` (muted message), `.comparison-diff` (added/removed step lists with `list-style: disc`)
  - No new responsive rule; the group reuses `proof-group`, which already collapses to a single column on mobile
  - _Requirements: 3.2, 8.4_

- [ ] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Extend Playwright integration tests in `tests/drill.spec.ts`
  - [ ] 8.1 Add tests for the Run comparison group rendering, changed-check Before/After links (Failed→Verified), and the "No modeled outcome changed" message on identical `missingPrintPath` runs
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.1, 5.3_
  - [ ] 8.2 Add tests for reset/scenario-switch clearing, scenario isolation, and draft-invariance (toggling `includeRestore` without rerun leaves the comparison unchanged)
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2_
  - [ ] 8.3 Add/extend keyboard-navigation tests for prior-run links across the runbook, service map, and Evidence panel
    - _Requirements: 4.4, 8.3_
  - Preserve all existing `drill.spec.ts` and `warehouse.test.ts` tests unchanged
  - _Requirements: 8.1, 8.2, 8.4_

- [ ] 9. Final validation gate
  - Run `npm run lint && npm run typecheck && npm test && npm run build`
  - Run `npm run test:browser` (Playwright desktop + mobile projects); confirm no horizontal scroll and no `pageerror`s
  - Confirm the comparison renders in the production build (the Playwright run executes `vite build` first); optionally run `npm run preview` manually in a terminal to eyeball two completed runs
  - _Requirements: 8.1, 8.2, 8.4_

- [ ] 10. Verify the PostFileSave simulator-tests hook
  - Trigger the hook with a reversible no-op edit to a matcher-matching file (`src/simulator.ts` or `src/scenario.ts`) using a file-editing tool so the PostFileSave event fires
  - Capture the hook's actual `npm test` output, then revert the no-op edit so the simulation engine is byte-identical afterward (the feature itself does not modify these files)
  - Report hook execution SEPARATELY from the validation-gate tests run directly in task 9
  - _Cross-cutting: tooling verification_

## Notes

- The simulator (`src/simulator.ts`) and scenario (`src/scenario.ts`) modules are not modified by this feature; the comparison is built entirely on the existing `DrillRun` model. The hook-verification task (10) edits a matching file only as a reversible trigger and reverts it.
- Property-test sub-tasks (1.2–1.5) are marked optional (`*`) per the workflow convention for property tests; each generates random recorded runs (choosing a scenario and a valid rollback-plan subsequence) and runs ≥100 iterations, tagged `Feature: compare-rollback-runs, Property N`. Implement them for full property-based coverage of `compareRuns`.
- Concrete example tests (1.6) and Playwright integration tests (8.1–8.3) are required (not optional) because they validate the specific acceptance criteria the feature must satisfy (verdict transition, added step, changed checks, identical message, scenario isolation, draft-invariance, keyboard navigation).
- Tasks 3–6 touch four distinct files and may be implemented in parallel; they converge on a shared prop contract defined in the design, verified by `tsc --noEmit` at the gate.
- Checkpoints run the currently-available automated suite (node tests + typecheck/build); the final gate (task 9) additionally runs the extended Playwright suite (desktop + mobile).
- Do not modify `.kiro/specs/verified-service-recovery/`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["1.5"] },
    { "id": 5, "tasks": ["1.6"] },
    { "id": 6, "tasks": ["2"] },
    { "id": 7, "tasks": ["3", "4", "5", "6"] },
    { "id": 8, "tasks": ["7"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2"] },
    { "id": 11, "tasks": ["8.3"] },
    { "id": 12, "tasks": ["9"] },
    { "id": 13, "tasks": ["10"] }
  ]
}
```
