# Design Document

## Overview

GhostDrill lets an operator rehearse a warehouse gateway change and its rollback, then inspect whether the rollback restored label printing. After editing the rollback plan and rerunning, the operator needs to see how the edit changed the outcome. This feature adds a compact **run comparison** to the existing Evidence panel that surfaces the verdict transition, rollback steps added or removed between the two most recent completed runs, and the checks whose results changed — each changed check linking to the recorded snapshot of the correct run.

The comparison is computed by a new pure function `compareRuns(prev, current)` over the existing `DrillRun` model. The two most recent completed runs are retained in `App.tsx` state (`previousRun` alongside the existing `run`). The Evidence panel renders the comparison group below the existing rollback proof, reusing the existing before/after proof styling. Scenario switching and reset clear the retained runs, and draft rollback edits leave recorded runs and the comparison untouched until a rerun completes.

The design reuses the existing data model (`DrillRun`, `Snapshot`, `CheckComparison`, `CheckResult`, `Verdict`) without changes to the simulator, and confines all new rendering to the single Evidence panel.

## Architecture

The change spans four files plus one new module, with no modification to the simulation engine:

- **`src/comparison.ts` (new)** — the pure comparison core: `compareRuns(prev, current)` and supporting types. No React, no side effects.
- **`src/App.tsx`** — retain the previous run in state, compute the resolved comparison, generalize snapshot selection to be run-qualified, and wire reset/scenario-switch to clear retained runs.
- **`src/Evidence.tsx`** — render the comparison group below the rollback proof; make the result jump links run-aware so a changed-check "Before" link selects a prior-run snapshot and an "After" link selects a current-run snapshot.
- **`src/ServiceMap.tsx`** — add a focus target (`id` + `tabIndex={-1}`) so a prior-run snapshot link can move focus to the recorded snapshot's visual when no runbook step button exists for it.
- **`src/styles.css`** — minimal additive rules for the verdict-transition line and the added/removed step lists. The comparison group reuses `proof-group`, `proof-check`, `proof-result`, `proof-status`, and `step-link`, so it inherits the existing mobile single-column collapse.

No new panel, grid column, or top-level component is introduced. The existing rollback proof, selected-snapshot evidence, runbook timeline, and ServiceMap are preserved.

## Components and Interfaces

### `src/comparison.ts` (new module)

A pure, deterministic module with no imports beyond the `DrillRun`, `Verdict`, `CheckId`, and `CheckResult` types from `./simulator` and `./scenario`. It exposes the comparison logic that the rest of the app consumes.

Responsibilities:
- `compareRuns(prev, current)` — diff two recorded runs into a `RunComparison` (verdict transition, added/removed rollback step ids, changed checks with before/after results, and an `identical` flag).
- `resolveComparisonTitles(base, titleFor)` — map the step-id diffs to titled entries using a scenario-derived title lookup, producing the `ResolvedRunComparison` the UI renders.
- Shared types: `RunRef`, `RunComparison`, `ChangedCheck`, `ResolvedRunComparison`, `ResolvedStepDiff`.

### `src/App.tsx` (state + wiring)

State additions:
- `previousRun: DrillRun | null` — the run recorded immediately before `run`. Null until a second drill completes.
- `selectedRef: { run: RunRef; id: string }` — replaces the existing `selectedId: string` so selection can target a snapshot in either retained run. Defaults to `{ run: 'current', id: 'baseline' }`.

Derived:
- `comparison: ResolvedRunComparison | null` — computed via `useMemo` from `previousRun` and `run` (null when fewer than two runs are recorded). Titles are resolved from the active scenario's rollback step universe.

Behavior changes:
- `executeDrill()` sets `previousRun` to the current `run` (capturing the old run before overwrite), then runs the drill, sets `run`, and points `selectedRef` at the new run's final snapshot. On the first execution `run` is `null`, so `previousRun` stays `null` (fewer than two runs → no comparison).
- `clearRun()` resets `previousRun` to `null` and `selectedRef` to the baseline. It is called by both `reset()` and `selectScenario()`, so reset and scenario switching both clear retained runs and the comparison.
- `selectSnapshot(id, runRef)` generalizes the existing `jumpToStep(id)`: it sets `selectedRef` and moves focus — to the runbook step button for current-run links (existing behavior) and to the ServiceMap panel for prior-run links.
- The runbook timeline continues to operate on the current run only; `aria-current` becomes `selectedRef.run === 'current' && selectedRef.id === step.id`.

### `src/Evidence.tsx` (rendering)

Prop changes:
- Replaces `jumpToStep: (id: string) => void` with `onSelectSnapshot: (id: string, runRef: RunRef) => void`.
- Adds `comparison: ResolvedRunComparison | null`.
- Adds `selectedRunRef: RunRef` — the run that the `snapshot` prop belongs to, so the selected-snapshot section's "View step" links target the correct run.

Render changes:
- `renderResult(id, phaseLabel, result, runRef)` gains a `runRef` argument; its "View step" / "Inspect responsible step" button calls `onSelectSnapshot(result.stepId, runRef)`. The "responsible step" wording applies to any rollback-phase result that is `unhealthy` (`phaseLabel` of `Rollback`, `Before`, or `After`).
- A new "Run comparison" `proof-group` is appended to `evidence-body` after the existing rollback-proof section, rendered only when `comparison` is non-null.

### `src/ServiceMap.tsx` (focus target)

Add `id="service-map"` and `tabIndex={-1}` to the panel `<section>` so a prior-run snapshot link can move focus to the recorded snapshot's visual. This is the only change; the ServiceMap already renders any `Snapshot` it receives, including one resolved from `previousRun`.

### `src/styles.css` (additive)

Add two small rules: `.comparison-verdict` (the verdict-transition line) and `.comparison-diff` (the added/removed step lists). Both reuse existing color tokens (`--muted`, the `good`/`bad`/`warning` tone classes already used by `proof-status`). The comparison group itself uses `proof-group`, which already collapses to a single column on mobile, satisfying the compact-layout requirement with no new responsive rule.

## Data Models

All existing types are reused unchanged. New types live in `src/comparison.ts`.

```ts
// Reused from src/simulator.ts (unchanged):
//   Snapshot { id, phase, title, description, state, checks }
//   CheckComparison { id, baseline: CheckResult, rollback: CheckResult }
//   DrillRun { snapshots, firstFailure, finalSnapshot, comparisons, verdict, failedPhases, executedRollbackStepIds }
//   Verdict = 'Verified' | 'Failed' | 'Unknown'
// Reused from src/scenario.ts (unchanged):
//   CheckId, RunbookStep, DrillScenario, restoreQueue

/** Which recorded run a selection or a changed-check result belongs to. */
export type RunRef = 'current' | 'prior'

/** A required check whose result differs between the two runs. */
export interface ChangedCheck {
  id: CheckId
  /** Rollback result of the prior run. */
  before: CheckResult
  /** Rollback result of the most recent run. */
  after: CheckResult
}

/** Pure diff of two recorded runs (step ids only; titles resolved later). */
export interface RunComparison {
  priorVerdict: Verdict
  currentVerdict: Verdict
  addedStepIds: string[]
  removedStepIds: string[]
  changedChecks: ChangedCheck[]
  /** True iff there are no added steps, no removed steps, and no changed checks. */
  identical: boolean
}

/** A titled rollback step diff entry. */
export interface ResolvedStepDiff {
  id: string
  title: string
}

/** The comparison as rendered by the UI, with step diffs titled. */
export interface ResolvedRunComparison {
  priorVerdict: Verdict
  currentVerdict: Verdict
  addedSteps: ResolvedStepDiff[]
  removedSteps: ResolvedStepDiff[]
  changedChecks: ChangedCheck[]
  identical: boolean
}
```

## Interfaces / Function Signatures

### `src/comparison.ts`

```ts
import type { CheckId, CheckResult } from './simulator'
import type { DrillRun, Verdict } from './simulator'

/** Diff two recorded runs. Pure: deterministic, no side effects, no React. */
export function compareRuns(prev: DrillRun, current: DrillRun): RunComparison {
  const addedStepIds = current.executedRollbackStepIds.filter(
    (id) => !prev.executedRollbackStepIds.includes(id),
  )
  const removedStepIds = prev.executedRollbackStepIds.filter(
    (id) => !current.executedRollbackStepIds.includes(id),
  )

  const changedChecks: ChangedCheck[] = []
  for (const cmp of current.comparisons) {
    const prevCmp = prev.comparisons.find((c) => c.id === cmp.id)
    if (!prevCmp) continue
    const baselineChanged = cmp.baseline.status !== prevCmp.baseline.status
    const rollbackChanged = cmp.rollback.status !== prevCmp.rollback.status
    if (baselineChanged || rollbackChanged) {
      changedChecks.push({ id: cmp.id, before: prevCmp.rollback, after: cmp.rollback })
    }
  }

  const identical =
    addedStepIds.length === 0 &&
    removedStepIds.length === 0 &&
    changedChecks.length === 0

  return {
    priorVerdict: prev.verdict,
    currentVerdict: current.verdict,
    addedStepIds,
    removedStepIds,
    changedChecks,
    identical,
  }
}

/** Resolve step-diff ids to titled entries using a scenario-derived lookup. Pure. */
export function resolveComparisonTitles(
  base: RunComparison,
  titleFor: (id: string) => string,
): ResolvedRunComparison {
  return {
    priorVerdict: base.priorVerdict,
    currentVerdict: base.currentVerdict,
    addedSteps: base.addedStepIds.map((id) => ({ id, title: titleFor(id) })),
    removedSteps: base.removedStepIds.map((id) => ({ id, title: titleFor(id) })),
    changedChecks: base.changedChecks,
    identical: base.identical,
  }
}
```

Notes:
- `compareRuns` iterates `current.comparisons` (built from the scenario's `requiredChecks`); both runs share the same scenario, so the check sets match. A check is "changed" when its baseline **or** rollback status differs. Because both runs use the same `scenario.baseline`, the baseline status is invariant across same-scenario runs, so in practice a changed check is one whose **rollback** status differs. The baseline comparison is retained to honor the glossary definition and to remain correct if baselines ever diverge.
- The "before" result is the prior run's rollback result; the "after" result is the current run's rollback result, matching the requirement that before/after come from the prior/most-recent run respectively.

### `src/App.tsx` (state and handlers)

```ts
import { useMemo, useState } from 'react'
import { compareRuns, resolveComparisonTitles, type ResolvedRunComparison, type RunRef } from './comparison'
import { restoreQueue, type RunbookStep } from './scenario'

// New state:
const [previousRun, setPreviousRun] = useState<DrillRun | null>(null)
const [selectedRef, setSelectedRef] = useState<{ run: RunRef; id: string }>({
  run: 'current',
  id: 'baseline',
})

// Scenario-derived title lookup for rollback step diffs.
function rollbackStepTitle(scenario: DrillScenario): (id: string) => string {
  const universe: readonly RunbookStep[] = [...scenario.rollbackSteps, restoreQueue]
  return (id) => universe.find((s) => s.id === id)?.title ?? id
}

// Resolved comparison, gated on two recorded runs.
const comparison: ResolvedRunComparison | null = useMemo(() => {
  if (!previousRun || !run) return null
  return resolveComparisonTitles(compareRuns(previousRun, run), rollbackStepTitle(scenario))
}, [previousRun, run, scenario])

// Selection resolves against the run indicated by selectedRef.
const activeRun = selectedRef.run === 'prior' ? previousRun : run
const selected = activeRun?.snapshots.find(({ id }) => id === selectedRef.id) ?? initialSnapshot

function executeDrill() {
  setPreviousRun(run) // retain the just-completed run as prior (null on first run)
  const nextRun = runDrill(scenario, plan)
  setRun(nextRun)
  setSelectedRef({ run: 'current', id: nextRun.finalSnapshot.id })
  setRunCount((count) => count + 1)
}

function clearRun() {
  setIncludeRestore(false)
  setRun(null)
  setPreviousRun(null)
  setSelectedRef({ run: 'current', id: initialSnapshot.id })
  setRunCount(0)
}

// Generalized selection: current-run links focus the runbook step (existing
// behavior); prior-run links focus the ServiceMap, where the recorded snapshot
// renders, since the responsible step may not have a button in the current plan.
function selectSnapshot(id: string, runRef: RunRef = 'current') {
  setSelectedRef({ run: runRef, id })
  if (runRef === 'current') {
    document.getElementById(`step-${id}`)?.focus()
  } else {
    document.getElementById('service-map')?.focus()
  }
}
```

The runbook timeline uses `selectedRef.run === 'current' && selectedRef.id === step.id` for `aria-current`, and its `onClick` sets `setSelectedRef({ run: 'current', id: step.id })`. The `jumpToStep` prop passed to `Evidence` is replaced by `onSelectSnapshot={selectSnapshot}`; the existing keyboard focus for current-run links is unchanged.

### `src/Evidence.tsx` (render signatures)

```ts
import { verdictTones } from './verdictTones' // or define locally; see below
import type { CheckId } from './scenario'
import { checkNames, type DrillRun, type Snapshot } from './simulator'
import type { ResolvedRunComparison, RunRef } from './comparison'

export function Evidence({
  snapshot,
  requiredChecks,
  run,
  comparison,
  selectedRunRef,
  onSelectSnapshot,
}: {
  snapshot: Snapshot
  requiredChecks: readonly CheckId[]
  run: DrillRun | null
  comparison: ResolvedRunComparison | null
  selectedRunRef: RunRef
  onSelectSnapshot: (id: string, runRef: RunRef) => void
}) {
  // renderResult gains a runRef so its jump link targets the correct run.
  function renderResult(id: CheckId, phaseLabel: string, result: CheckResult, runRef: RunRef) {
    const { tone, text } = resultLabels[result.status]
    const responsible =
      (phaseLabel === 'Rollback' || phaseLabel === 'Before' || phaseLabel === 'After') &&
      result.status === 'unhealthy'
    return (
      <div className="proof-result" role="group" aria-label={phaseLabel}>
        <div className="proof-status">
          <span>{phaseLabel}</span>
          <strong className={tone}>{text}</strong>
        </div>
        <p>{result.reason}</p>
        {'stepId' in result && (
          <button type="button" className="step-link"
            onClick={() => onSelectSnapshot(result.stepId, runRef)}
            aria-label={responsible ? undefined : `View ${phaseLabel} step for ${checkNames[id]}`}>
            {responsible ? 'Inspect responsible step' : 'View step'}
          </button>
        )}
      </div>
    )
  }
  // ... existing sections pass runRef: rollback-proof uses 'current';
  //     selected-snapshot section uses selectedRunRef; comparison uses 'prior'/'current'.
}
```

`verdictTones` mirrors the existing `const verdictTones = { Verified: 'good', Failed: 'bad', Unknown: 'warning' }` already defined in `App.tsx`. To avoid duplication it may be exported from a tiny shared constant; the lowest-risk option is to define the same small literal locally in `Evidence.tsx`. Either is acceptable; the design prefers a single shared definition to keep the two verdict displays consistent.

## State Shape (App)

| State | Type | Initial | Set by | Reset by |
|---|---|---|---|---|
| `scenario` | `DrillScenario` | `warehouseOutage` | `selectScenario` | — |
| `includeRestore` | `boolean` | `false` | plan editor, `clearRun` | `clearRun` |
| `run` | `DrillRun \| null` | `null` | `executeDrill` | `clearRun` |
| `previousRun` | `DrillRun \| null` | `null` | `executeDrill` (old `run`) | `clearRun` |
| `selectedRef` | `{ run: RunRef; id: string }` | `{ run:'current', id:'baseline' }` | `executeDrill`, `selectSnapshot`, runbook click | `clearRun` |
| `runCount` | `number` | `0` | `executeDrill` | `clearRun` |

Derived (not state): `plan`, `initialSnapshot`, `selected`, `comparison`.

Retention invariant: at most two runs are retained. On each `executeDrill`, `previousRun` becomes the prior `run` and `run` becomes the new run, so the oldest is dropped. `previousRun` is `null` until the second completed run, so the comparison is `null` (Requirement 1.3).

## Render Structure (Comparison Group)

The comparison group is appended to `evidence-body` after the existing rollback-proof section. It reuses `proof-group` so it inherits spacing and the mobile single-column collapse. The verdict-transition line and the added/removed step lists use the new minor CSS classes; the changed checks reuse `proof-check` + `proof-result` exactly as the rollback proof does.

```tsx
{comparison && (
  <section className="proof-group" aria-label="Run comparison">
    <h3 className="eyebrow">Run comparison</h3>

    <p className="comparison-verdict">
      Verdict{' '}
      <strong className={verdictTones[comparison.priorVerdict]}>
        {comparison.priorVerdict}
      </strong>
      {' \u2192 '}
      <strong className={verdictTones[comparison.currentVerdict]}>
        {comparison.currentVerdict}
      </strong>
    </p>

    {comparison.identical && (
      <p className="comparison-identical">No modeled outcome changed between runs.</p>
    )}

    {comparison.addedSteps.length > 0 && (
      <div className="comparison-diff">
        <span className="eyebrow">Added steps</span>
        <ul>
          {comparison.addedSteps.map((s) => (
            <li key={s.id}>{s.title}</li>
          ))}
        </ul>
      </div>
    )}

    {comparison.removedSteps.length > 0 && (
      <div className="comparison-diff">
        <span className="eyebrow">Removed steps</span>
        <ul>
          {comparison.removedSteps.map((s) => (
            <li key={s.id}>{s.title}</li>
          ))}
        </ul>
      </div>
    )}

    {comparison.changedChecks.map(({ id, before, after }) => (
      <article className="proof-check" aria-label={checkNames[id]} key={id}>
        <h4>{checkNames[id]}</h4>
        {renderResult(id, 'Before', before, 'prior')}
        {renderResult(id, 'After', after, 'current')}
      </article>
    ))}
  </section>
)}
```

CSS additions (additive, reusing existing tokens):

```css
.comparison-verdict { font-size: .875rem; }
.comparison-identical { color: var(--muted); font-size: .8125rem; }
.comparison-diff { font-size: .8125rem; }
.comparison-diff ul { list-style: disc; padding-left: 1.2em; margin: 4px 0 0; }
```

`proof-group + .proof-group { margin-top: 16px; }` already exists, so the new group is spaced from the rollback proof without a new rule.

## Error Handling

- **Fewer than two runs.** `comparison` is `null` until `previousRun` and `run` both exist, so the group does not render after a single run (Requirement 1.3) or after reset/scenario-switch (Requirements 6.1, 6.2).
- **Missing Print Path (`canEditRollback: false`).** The rollback plan is fixed, so two consecutive runs are byte-identical: no added/removed steps, no changed checks, `identical === true`. The group renders the verdict transition (`Unknown \u2192 Unknown`) and the "No modeled outcome changed" message, and the Unknown verdict is shown unchanged (Requirements 5.2, 5.3).
- **Unknown preserved.** Verdicts are passed through verbatim; an `Unknown` verdict is displayed as `Unknown` in the transition and never coerced to Verified/Failed (Requirement 5.2).
- **Prior-run link whose step was removed from the current plan.** A changed check's "Before" result can carry a `stepId` that exists only in the prior run (e.g. `restore-queue` when the most recent run dropped the restore step). `step-${id}` then has no button in the current timeline, so `selectSnapshot` focuses the ServiceMap panel instead. The snapshot still renders in the ServiceMap and the Evidence selected-snapshot section (Requirement 4.3).
- **Common-step id collision.** Both runs share step ids for baseline and change steps (and for rollback steps present in both plans). Because selection is run-qualified (`selectedRef.run`), a "Before" link always resolves to the prior run's snapshot even when the same id exists in the current run.
- **Selected-snapshot links while viewing a prior run.** The selected-snapshot section renders the `snapshot` it receives; when that snapshot is from the prior run, its "View step" links use `selectedRunRef` (`'prior'`), so they stay within the prior run rather than jumping to the current run's version of the same step.
- **Draft edits.** `includeRestore` toggles update `plan` and the `pending` flag but do not touch `previousRun`, `run`, or `comparison`; the comparison updates only on the next `executeDrill` (Requirement 7.1, 7.2).
- **Scenario isolation.** `selectScenario` calls `clearRun`, which nulls `previousRun` and `run`, so runs and evidence from different scenarios never mix and the comparison is recomputed only from the active scenario's runs (Requirements 6.1, 6.3).
- **No required checks configured.** If a scenario had `requiredChecks: []`, `comparisons` is empty, so `changedChecks` is empty; `identical` depends only on step diffs. This matches the existing "empty required set" behavior already covered by `warehouse.test.ts`.

## Correctness Properties

The pure core `compareRuns` is the property-based testing target. The UI/interaction requirements (retention, rendering, linking, isolation, draft-invariance, regressions) are covered by integration and example tests listed in the Testing Strategy. The properties below use universal quantification over recorded runs of a single active scenario. A recorded run is any `DrillRun` produced by `runDrill(scenario, rollbackPlan)` for the active scenario and a valid rollback plan.

### Property 1: Verdict passthrough preserves Unknown

*For any* two recorded runs `prev` and `current` of the active scenario, `compareRuns(prev, current).priorVerdict === prev.verdict` and `compareRuns(prev, current).currentVerdict === current.verdict`. In particular, when either run's verdict is `Unknown`, the corresponding comparison verdict is `Unknown` and is never coerced to `Verified` or `Failed`.

**Validates: Requirements 2.2, 5.2**

### Property 2: Rollback step diff is the symmetric set difference

*For any* two recorded runs `prev` and `current` of the active scenario, `compareRuns(prev, current).addedStepIds` is exactly the set of ids in `current.executedRollbackStepIds` but not in `prev.executedRollbackStepIds`, and `removedStepIds` is exactly the set of ids in `prev.executedRollbackStepIds` but not in `current.executedRollbackStepIds`.

**Validates: Requirements 2.3, 2.4**

### Property 3: Changed checks pair prior rollback with current rollback

*For any* two recorded runs `prev` and `current` of the active scenario, a required check appears in `compareRuns(prev, current).changedChecks` if and only if its baseline status or rollback status differs between the two runs; for each such check, `before` equals `prev`'s rollback `CheckResult` and `after` equals `current`'s rollback `CheckResult`.

**Validates: Requirements 2.5**

### Property 4: Identical detection and self-comparison idempotence

*For any* two recorded runs `prev` and `current` of the active scenario, `compareRuns(prev, current).identical` is `true` if and only if there are no added steps, no removed steps, and no changed checks. Consequently, *for any* recorded run `r`, `compareRuns(r, r).identical === true` (comparing a run to itself yields no added steps, no removed steps, and no changed checks).

**Validates: Requirements 5.1, 5.3**

Requirement 2.1 (compute the comparison on rerun) is validated collectively by Properties 1–4: together they assert that `compareRuns` produces a complete and correct diff for any two recorded runs.

## Testing Strategy

### Property-based tests (`tests/comparison.test.ts`)

A property test harness generates random recorded runs by choosing a scenario (`warehouseOutage` or `missingPrintPath`) and a random valid rollback plan (a subsequence of the scenario's rollback step universe, optionally including `restoreQueue` when `canEditRollback`), then calling `runDrill(scenario, plan)` to obtain a `DrillRun`. Each property runs for a minimum of 100 iterations and is tagged `Feature: compare-rollback-runs, Property N: <text>`.

- Property 1 — verdict passthrough (incl. Unknown).
- Property 2 — added/removed step set difference.
- Property 3 — changed-check correctness (before = prior rollback, after = current rollback).
- Property 4 — `identical` iff no diffs; `compareRuns(r, r).identical === true`.

The reference implementations for Properties 2–4 are simple independent diffs computed directly from `executedRollbackStepIds` and `comparisons`, serving as the model against which `compareRuns` is checked (model-based testing).

### Unit / example tests

- `compareRuns` with the concrete `warehouseOutage` runs from `warehouse.test.ts` (includeRestore false vs. true) asserts the exact added step (`restore-queue`), the verdict transition (`Failed \u2192 Verified`), and the two changed checks with their before/after statuses and step ids.
- `compareRuns` on two identical `missingPrintPath` runs asserts `identical === true`, `Unknown \u2192 Unknown`, and empty step/check diffs (Requirement 5.3).

### Integration tests (Playwright / `tests/drill.spec.ts` extension)

- After two executions, the "Run comparison" group renders below the rollback proof inside the Evidence panel and reuses `proof-group`/`proof-result` classes (Requirements 3.1, 3.2, 3.3).
- Activating a changed-check "After" link selects the current run's recorded snapshot and focuses its runbook step; activating a "Before" link selects the prior run's snapshot and focuses the ServiceMap when the step has no current-plan button (Requirements 4.1–4.4).
- The "No modeled outcome changed" message renders for identical `missingPrintPath` runs (Requirement 5.1, 5.3).
- Reset and scenario switching clear retained runs and the comparison (Requirements 6.1, 6.2); switching scenarios never mixes runs (Requirement 6.3).
- Toggling `includeRestore` without rerunning leaves the comparison unchanged; the comparison updates only after a rerun (Requirements 7.1, 7.2).
- The existing warehouse and missing-evidence flows, timeline replay, keyboard navigation, and mobile single-column layout remain intact (Requirement 8); the existing `warehouse.test.ts` and `drill.spec.ts` continue to pass unchanged.
