import type { CheckId } from './scenario.ts'
import type { DrillRun, Snapshot, Verdict } from './simulator.ts'

/** Which recorded run a selection or changed-check result belongs to. */
export type RunRef = 'current' | 'prior'

type CheckResult = Snapshot['checks'][CheckId]

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

/** Diff two recorded runs of the same scenario into a run comparison. Pure. */
export function compareRuns(prev: DrillRun, current: DrillRun): RunComparison {
  const addedStepIds = current.executedRollbackStepIds.filter(
    (id) => !prev.executedRollbackStepIds.includes(id),
  )
  const removedStepIds = prev.executedRollbackStepIds.filter(
    (id) => !current.executedRollbackStepIds.includes(id),
  )

  const changedChecks: ChangedCheck[] = []
  for (const cmp of current.comparisons) {
    const prevCmp = prev.comparisons.find((check) => check.id === cmp.id)
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
