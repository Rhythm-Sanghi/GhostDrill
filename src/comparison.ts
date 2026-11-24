import type { CheckId } from './scenario.ts'
import type { CheckResult, DrillRun, Verdict } from './simulator.ts'

/** Which recorded run a selection or changed-check result belongs to. */
export type RunRef = 'current' | 'prior'

const phases = { baseline: 'Baseline', rollback: 'Rollback' } as const

interface ChangedPhase {
  phase: (typeof phases)[keyof typeof phases]
  before: CheckResult
  after: CheckResult
}

export interface ChangedCheck {
  id: CheckId
  phases: ChangedPhase[]
}

export interface RunComparison {
  priorVerdict: Verdict
  currentVerdict: Verdict
  addedStepIds: string[]
  removedStepIds: string[]
  reorderedSteps: { before: readonly string[]; after: readonly string[] } | null
  changedChecks: ChangedCheck[]
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
  reorderedSteps: { before: ResolvedStepDiff[]; after: ResolvedStepDiff[] } | null
  changedChecks: ChangedCheck[]
  identical: boolean
}

/** Diff two recorded runs of the same scenario into a run comparison. Pure. */
export function compareRuns(prev: DrillRun, current: DrillRun): RunComparison {
  if (prev.scenarioId !== current.scenarioId) throw new Error('Run comparison requires the same scenario.')

  const before = prev.executedRollbackStepIds
  const after = current.executedRollbackStepIds
  const addedStepIds = after.filter((id) => !before.includes(id))
  const removedStepIds = before.filter((id) => !after.includes(id))
  const sharedBefore = before.filter((id) => after.includes(id))
  const sharedAfter = after.filter((id) => before.includes(id))
  const reorderedSteps = sharedBefore.some((id, index) => id !== sharedAfter[index]) ? { before, after } : null

  const changedChecks: ChangedCheck[] = []
  for (const cmp of current.comparisons) {
    const prevCmp = prev.comparisons.find((check) => check.id === cmp.id)
    if (!prevCmp) continue
    const changed: ChangedPhase[] = []
    for (const key of ['baseline', 'rollback'] as const) {
      const before = prevCmp[key]
      const after = cmp[key]
      if (before.status !== after.status || before.reason !== after.reason) {
        changed.push({ phase: phases[key], before, after })
      }
    }
    if (changed.length) changedChecks.push({ id: cmp.id, phases: changed })
  }

  const identical =
    addedStepIds.length === 0 &&
    removedStepIds.length === 0 &&
    !reorderedSteps &&
    changedChecks.length === 0 &&
    prev.verdict === current.verdict

  return {
    priorVerdict: prev.verdict,
    currentVerdict: current.verdict,
    addedStepIds,
    removedStepIds,
    reorderedSteps,
    changedChecks,
    identical,
  }
}

/** Resolve step-diff ids to titled entries using a scenario-derived lookup. Pure. */
export function resolveComparisonTitles(
  base: RunComparison,
  titleFor: (id: string, run: RunRef) => string,
): ResolvedRunComparison {
  const resolve = (ids: readonly string[], run: RunRef) => ids.map((id) => ({ id, title: titleFor(id, run) }))
  const { reorderedSteps } = base
  return {
    priorVerdict: base.priorVerdict,
    currentVerdict: base.currentVerdict,
    addedSteps: resolve(base.addedStepIds, 'current'),
    removedSteps: resolve(base.removedStepIds, 'prior'),
    reorderedSteps: reorderedSteps && {
      before: resolve(reorderedSteps.before, 'prior'),
      after: resolve(reorderedSteps.after, 'current'),
    },
    changedChecks: base.changedChecks,
    identical: base.identical,
  }
}
