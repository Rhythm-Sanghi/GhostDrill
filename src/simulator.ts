import { endpoints, type CheckId, type DrillScenario, type Endpoint, type Phase, type RunbookStep, type ServiceState, type WarehouseState } from './scenario.ts'

export type CheckResult =
  | { status: 'healthy' | 'unhealthy'; reason: string; stepId: string }
  | { status: 'unknown'; reason: string }

export const checkStatusLabels = { healthy: 'Healthy', unhealthy: 'Unhealthy', unknown: 'Unknown' } as const

export const checkNames: Readonly<Record<CheckId, string>> = {
  'label-printing': 'Label printing',
  'queue-endpoint': 'Queue endpoint',
  'dispatch-queue': 'Dispatch queue',
  'shipping-connector': 'Shipping connector',
}

export interface Snapshot {
  id: string
  phase: Phase
  title: string
  description: string
  state: ServiceState
  checks: Readonly<Partial<Record<CheckId, CheckResult>>>
}

export function getCheck(snapshot: Snapshot, id: CheckId): CheckResult {
  const result = snapshot.checks[id]
  if (!result) throw new Error(`Check ${id} is missing from snapshot ${snapshot.id}.`)
  return result
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
  dispatchQueue: ObservationSource
  shippingConnector: ObservationSource
}

const baselineSource: ObservationSource = { stepId: 'baseline', sequence: 0 }
const baselineSources: StateSources = {
  queueEndpoint: baselineSource,
  printPaths: { primary: baselineSource, backup: baselineSource },
  dispatchQueue: baselineSource,
  shippingConnector: baselineSource,
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

function evaluateChecks(state: ServiceState, sources: StateSources): Snapshot['checks'] {
  if (state.kind === 'dispatch') {
    const queueReasons = {
      open: 'The dispatch queue is open.',
      paused: 'The dispatch queue was paused for maintenance.',
      blocked: 'The queue stayed paused because the shipping connector was not ready when reopening was attempted.',
    }
    return {
      'dispatch-queue': {
        status: state.queue === 'open' ? 'healthy' : 'unhealthy',
        reason: queueReasons[state.queue],
        stepId: sources.dispatchQueue.stepId,
      },
      'shipping-connector': {
        status: state.connectorReady ? 'healthy' : 'unhealthy',
        reason: state.connectorReady ? 'The shipping connector is ready.' : 'The shipping connector is offline.',
        stepId: sources.shippingConnector.stepId,
      },
    }
  }
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
  const { baseline } = scenario
  const state = baseline.kind === 'warehouse'
    ? { ...baseline, printPaths: { ...baseline.printPaths } }
    : { ...baseline }
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
        if (state.kind !== 'warehouse') throw new Error('Queue endpoint changes require the warehouse.')
        state = { ...state, queueEndpoint: action.endpoint }
        sources = { ...sources, queueEndpoint: source }
        break
      case 'set-print-path':
        if (state.kind !== 'warehouse') throw new Error('Print path changes require the warehouse.')
        state = { ...state, printPaths: { ...state.printPaths, [action.endpoint]: action.reachability } }
        sources = { ...sources, printPaths: { ...sources.printPaths, [action.endpoint]: source } }
        break
      case 'pause-dispatch':
        if (state.kind !== 'dispatch') throw new Error('Pausing dispatch requires the dispatch queue.')
        state = { ...state, queue: 'paused', connectorReady: false }
        sources = { ...sources, dispatchQueue: source, shippingConnector: source }
        break
      case 'reopen-dispatch':
        if (state.kind !== 'dispatch') throw new Error('Reopening dispatch requires the dispatch queue.')
        state = { ...state, queue: state.connectorReady ? 'open' : 'blocked' }
        sources = { ...sources, dispatchQueue: source }
        break
      case 'restore-connector':
        if (state.kind !== 'dispatch') throw new Error('Restoring the connector requires the dispatch queue.')
        state = { ...state, connectorReady: action.ready ?? true }
        sources = { ...sources, shippingConnector: source }
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
    id, baseline: getCheck(baseline, id), rollback: getCheck(finalSnapshot, id),
  }))
  const failedPhases = (['Baseline', 'Rollback'] as const).filter((phase) => comparisons.some((check) =>
    check[phase === 'Baseline' ? 'baseline' : 'rollback'].status === 'unhealthy'))

  return {
    scenarioId: scenario.id,
    snapshots,
    firstFailure: snapshots.find((snapshot) => getCheck(snapshot, scenario.serviceCheck).status === 'unhealthy'),
    finalSnapshot,
    comparisons,
    verdict: verdictFor(comparisons),
    failedPhases,
    executedRollbackStepIds: rollbackPlan.map(({ id }) => id),
  }
}

export type DrillRun = ReturnType<typeof runDrill>

export function findRecordedStep(run: DrillRun | null, id: string) {
  return run?.snapshots.find((snapshot) => snapshot.id === id)
}

export function evidenceSource(run: DrillRun | null, result: CheckResult) {
  return 'stepId' in result ? findRecordedStep(run, result.stepId) : undefined
}
