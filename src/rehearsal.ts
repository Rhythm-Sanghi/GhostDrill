import { createRollbackPlan, missingPrintPath, type DrillScenario, type Reachability, type RunbookStep } from './scenario.ts'
import { getCheck, runDrill, type DrillRun } from './simulator.ts'

export type ScenarioAssumption = Reachability | 'restored' | 'offline'
export type RecordedDrill = DrillRun & { assumption: ScenarioAssumption }

export interface CompletedRun {
  number: number
  run: RecordedDrill
}

export function assumptionOptions(scenario: DrillScenario): readonly ScenarioAssumption[] {
  return scenario.baseline.kind === 'dispatch'
    ? ['restored', 'offline']
    : ['reachable', 'unreachable', 'unobserved']
}

export function defaultAssumption(scenario: DrillScenario): ScenarioAssumption {
  if (scenario.baseline.kind === 'dispatch') return 'restored'
  return scenario.id === missingPrintPath.id ? 'unobserved' : 'reachable'
}

export const assumptionLabels: Record<ScenarioAssumption, string> = {
  reachable: 'Primary print path is reachable after restoration',
  unreachable: 'Primary print path stays unreachable after restoration',
  unobserved: 'Primary print path is unobserved after restoration',
  restored: 'Shipping connector comes back after restoration',
  offline: 'Shipping connector stays offline after restoration',
}

export function restorationStep(scenario: DrillScenario) {
  return scenario.rollbackSteps.find(({ action }) => action.type === 'set-print-path' || action.type === 'restore-connector')
}

export function recordDrill(scenario: DrillScenario, plan: readonly RunbookStep[], assumption: ScenarioAssumption): RecordedDrill {
  const affectedStep = restorationStep(scenario)?.id
  const appliedPlan = plan.map((step): RunbookStep => {
    if (step.id !== affectedStep) return step
    const { action } = step
    if (action.type === 'restore-connector' && (assumption === 'restored' || assumption === 'offline')) {
      return { ...step, action: { ...action, ready: assumption === 'restored' } }
    }
    if (action.type === 'set-print-path' && assumption !== 'restored' && assumption !== 'offline') {
      return { ...step, action: { ...action, reachability: assumption } }
    }
    throw new Error('This observation does not apply to the scenario.')
  })
  return { ...runDrill(scenario, appliedPlan), assumption }
}

export function recordedPlan(scenario: DrillScenario, run: RecordedDrill): RunbookStep[] {
  const supported = createRollbackPlan(scenario, true)
  return run.executedRollbackStepIds.map((id) => {
    const step = supported.find((entry) => entry.id === id)
    if (!step) throw new Error('The recorded action is unavailable in this simulator.')
    return step
  })
}

export function replayContingencies(scenario: DrillScenario, run: RecordedDrill, assumptions: readonly ScenarioAssumption[]) {
  const plan = recordedPlan(scenario, run)
  const action = restorationStep(scenario)
  return assumptions.map((assumption) => {
    const alternate = recordDrill(scenario, plan, assumption)
    const affectedStep = alternate.snapshots.find(({ id }) => id === action?.id)
    return {
      assumption,
      verdict: alternate.verdict,
      title: affectedStep?.title,
      evidence: getCheck(alternate.finalSnapshot, scenario.serviceCheck).reason,
    }
  })
}

export type ContingencyResult = ReturnType<typeof replayContingencies>[number]
