import { endpoints, type CheckId, type DrillScenario, type Endpoint, type Phase, type RunbookStep, type WarehouseState } from './scenario.ts'

type CheckResult =
  | { status: 'healthy' | 'unhealthy'; reason: string; stepId: string }
  | { status: 'unknown'; reason: string }

export const checkNames: Readonly<Record<CheckId, string>> = {
  'label-printing': 'Label printing',
  'queue-endpoint': 'Queue endpoint',
}

export interface Snapshot {
  id: string
  phase: Phase
  title: string
  description: string
  state: WarehouseState
  checks: Readonly<Record<CheckId, CheckResult>>
}

export interface CheckComparison {
  id: CheckId
  baseline: CheckResult
  rollback: CheckResult
}

export type Verdict = 'Verified' | 'Failed' | 'Unknown'

interface ObservationSource {
  stepId: string
  sequence: number
}

interface StateSources {
  queueEndpoint: ObservationSource
  printPaths: Readonly<Record<Endpoint, ObservationSource>>
}

const baselineSource: ObservationSource = { stepId: 'baseline', sequence: 0 }
const baselineSources: StateSources = {
  queueEndpoint: baselineSource,
  printPaths: { primary: baselineSource, backup: baselineSource },
}

function checkLabelPrinting(state: WarehouseState, sources: StateSources): CheckResult {
  const endpoint = state.queueEndpoint
  const gateway = endpoints[endpoint].name
  const reachability = state.printPaths[endpoint]
  if (reachability === 'unobserved') {
    return { status: 'unknown', reason: `Missing observation: reachability from the ${gateway.toLowerCase()} to the print service.` }
  }
  const pathSource = sources.printPaths[endpoint]
  const queueSource = sources.queueEndpoint
  const latestSource = pathSource.sequence > queueSource.sequence ? pathSource : queueSource
  return reachability === 'reachable'
    ? { status: 'healthy', reason: `${gateway} can reach the print service.`, stepId: latestSource.stepId }
    : { status: 'unhealthy', reason: `${gateway} cannot reach the print service.`, stepId: latestSource.stepId }
}

function evaluateChecks(state: WarehouseState, sources: StateSources): Snapshot['checks'] {
  const { queueEndpoint } = state
  return {
    'label-printing': checkLabelPrinting(state, sources),
    'queue-endpoint': {
      status: queueEndpoint === 'primary' ? 'healthy' : 'unhealthy',
      reason: queueEndpoint === 'primary'
        ? 'The queue targets gw-primary.'
        : 'The queue targets gw-backup and requires gw-primary.',
      stepId: sources.queueEndpoint.stepId,
    },
  }
}

function verdictFor(comparisons: readonly CheckComparison[]): Verdict {
  if (comparisons.some(({ baseline, rollback }) => baseline.status === 'unhealthy' || rollback.status === 'unhealthy')) {
    return 'Failed'
  }
  if (comparisons.length && comparisons.every(({ baseline, rollback }) => baseline.status === 'healthy' && rollback.status === 'healthy')) {
    return 'Verified'
  }
  return 'Unknown'
}

export function createBaselineSnapshot(scenario: DrillScenario): Snapshot {
  const state = { ...scenario.baseline, printPaths: { ...scenario.baseline.printPaths } }
  return {
    id: 'baseline',
    phase: 'Baseline',
    title: 'Capture starting state',
    description: 'Capture service observations before maintenance.',
    state,
    checks: evaluateChecks(state, baselineSources),
  }
}

export function runDrill(scenario: DrillScenario, rollbackPlan: readonly RunbookStep[]) {
  const baseline = createBaselineSnapshot(scenario)
  const snapshots = [baseline]
  let state = baseline.state
  let sources = baselineSources

  function execute(step: RunbookStep, phase: Exclude<Phase, 'Baseline'>) {
    const { action } = step
    const source = { stepId: step.id, sequence: snapshots.length }
    switch (action.type) {
      case 'set-queue-endpoint':
        state = { ...state, queueEndpoint: action.endpoint }
        sources = { ...sources, queueEndpoint: source }
        break
      case 'set-print-path':
        state = { ...state, printPaths: { ...state.printPaths, [action.endpoint]: action.reachability } }
        sources = { ...sources, printPaths: { ...sources.printPaths, [action.endpoint]: source } }
        break
    }
    snapshots.push({
      id: step.id, phase, title: step.title, description: step.description,
      state, checks: evaluateChecks(state, sources),
    })
  }

  scenario.changeSteps.forEach((step) => execute(step, 'Change'))
  rollbackPlan.forEach((step) => execute(step, 'Rollback'))

  const finalSnapshot = snapshots[snapshots.length - 1]
  const comparisons = scenario.requiredChecks.map((id): CheckComparison => ({
    id, baseline: baseline.checks[id], rollback: finalSnapshot.checks[id],
  }))
  const failedPhases = (['Baseline', 'Rollback'] as const).filter((phase) => comparisons.some((check) =>
    check[phase === 'Baseline' ? 'baseline' : 'rollback'].status === 'unhealthy'))

  return {
    snapshots,
    firstFailure: snapshots.find((snapshot) => snapshot.checks['label-printing'].status === 'unhealthy'),
    finalSnapshot,
    comparisons,
    verdict: verdictFor(comparisons),
    failedPhases,
    executedRollbackStepIds: rollbackPlan.map(({ id }) => id),
  }
}

export type DrillRun = ReturnType<typeof runDrill>
