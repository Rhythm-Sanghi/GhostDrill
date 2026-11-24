import { getCheck, type DrillRun } from './simulator.ts'

export function describeFinalService(run: DrillRun) {
  const dispatch = run.finalSnapshot.state.kind === 'dispatch'
  const status = getCheck(run.finalSnapshot, dispatch ? 'dispatch-queue' : 'label-printing').status
  if (status === 'healthy' && run.verdict === 'Verified') {
    return { description: 'Service recovered', tone: 'good' }
  }

  if (dispatch) {
    return status === 'healthy'
      ? { description: 'Dispatch queue reopened', tone: 'good' }
      : { description: 'Dispatch queue still paused', tone: 'bad' }
  }

  return {
    healthy: { description: 'Printing works after rollback', tone: 'good' },
    unhealthy: { description: 'Service still down', tone: 'bad' },
    unknown: { description: 'Printing unconfirmed', tone: 'warning' },
  }[status]
}

export function verificationNotes(run: DrillRun) {
  if (run.verdict === 'Failed') return [`Failed in ${run.failedPhases.join(' and ')}`]
  if (run.verdict === 'Verified') return []
  if (!run.comparisons.length) return ['No required checks are configured.']

  const notes = new Set<string>()
  for (const { baseline, rollback } of run.comparisons) {
    if (baseline.status === 'unknown') notes.add(`Baseline · ${baseline.reason}`)
    if (rollback.status === 'unknown') notes.add(`Rollback · ${rollback.reason}`)
  }
  return [...notes]
}
