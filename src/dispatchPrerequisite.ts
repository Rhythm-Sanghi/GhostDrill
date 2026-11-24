import type { AcceptanceEvidence } from './acceptance.ts'
import type { DrillRun } from './simulator.ts'

const REOPEN_ACTION = 'reopen-dispatch'

export function evaluateDispatchPrerequisite(run: DrillRun): AcceptanceEvidence[] {
  const findings: AcceptanceEvidence[] = []

  for (let index = 0; index < run.snapshots.length; index++) {
    const attempt = run.snapshots[index]
    if (attempt.actionType !== REOPEN_ACTION) continue

    const preceding = index > 0 ? run.snapshots[index - 1] : undefined
    const rollbackStepNumber = run.executedRollbackStepIds.indexOf(attempt.id) + 1
    const stepNumber = rollbackStepNumber > 0 ? rollbackStepNumber : undefined

    if (!preceding || preceding.state.kind !== 'dispatch') {
      findings.push({
        status: 'missing',
        observed: 'Shipping connector · State unobserved',
        reason: 'The connector state before this reopen was not recorded, so the prerequisite cannot be evaluated.',
        stepId: attempt.id,
        stepNumber,
      })
      continue
    }

    if (preceding.state.connectorReady) {
      findings.push({
        status: 'pass',
        observed: 'Shipping connector · Ready',
        reason: 'The connector was ready immediately before this reopen attempt.',
        stepId: attempt.id,
        stepNumber,
      })
    } else {
      findings.push({
        status: 'violation',
        observed: 'Shipping connector · Offline',
        reason: 'The connector was offline immediately before this reopen attempt, so the queue stayed paused.',
        stepId: attempt.id,
        stepNumber,
      })
    }
  }

  if (findings.length === 0) {
    return [{
      status: 'missing',
      observed: 'No reopen-dispatch attempts were recorded.',
      reason: 'A connector-ready reopen attempt is required to evaluate the dispatch prerequisite.',
    }]
  }

  return findings
}
