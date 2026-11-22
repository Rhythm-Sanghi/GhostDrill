import { baseline, changeSteps, type Endpoint, type Phase, type RunbookStep, type WarehouseState } from './scenario.ts'

export interface LabelPrintEvidence {
  status: 'pass' | 'fail'
  endpoint: Endpoint
  reachability: WarehouseState['printPaths'][Endpoint]
  endpointStepId: string
  dependencyStepId: string
  responsibleStepId: string
}

export interface Snapshot {
  id: string
  phase: Phase
  title: string
  description: string
  state: WarehouseState
  check: LabelPrintEvidence
}

interface StateSources {
  queueEndpoint: string
  printPaths: Readonly<Record<Endpoint, string>>
}

const baselineSources: StateSources = {
  queueEndpoint: 'baseline',
  printPaths: { primary: 'baseline', backup: 'baseline' },
}

function checkLabelPrinting(state: WarehouseState, sources: StateSources): LabelPrintEvidence {
  const endpoint = state.queueEndpoint
  const reachability = state.printPaths[endpoint]
  const endpointStepId = sources.queueEndpoint
  const dependencyStepId = sources.printPaths[endpoint]
  return {
    status: reachability === 'reachable' ? 'pass' : 'fail',
    endpoint,
    reachability,
    endpointStepId,
    dependencyStepId,
    responsibleStepId: reachability === 'unreachable' && dependencyStepId !== 'baseline'
      ? dependencyStepId
      : endpointStepId,
  }
}

export function createBaselineSnapshot(): Snapshot {
  const state = { ...baseline, printPaths: { ...baseline.printPaths } }
  return {
    id: 'baseline',
    phase: 'Baseline',
    title: 'Capture starting state',
    description: 'Check label printing before maintenance.',
    state,
    check: checkLabelPrinting(state, baselineSources),
  }
}

export function runWarehouse(rollbackPlan: readonly RunbookStep[]) {
  const startingSnapshot = createBaselineSnapshot()
  const snapshots = [startingSnapshot]
  let state = startingSnapshot.state
  let sources = baselineSources

  function execute(step: RunbookStep, phase: Exclude<Phase, 'Baseline'>) {
    const { action } = step
    switch (action.type) {
      case 'set-queue-endpoint':
        state = { ...state, queueEndpoint: action.endpoint }
        sources = { ...sources, queueEndpoint: step.id }
        break
      case 'set-print-path':
        state = { ...state, printPaths: { ...state.printPaths, [action.endpoint]: action.reachability } }
        sources = { ...sources, printPaths: { ...sources.printPaths, [action.endpoint]: step.id } }
        break
    }
    snapshots.push({
      id: step.id, phase, title: step.title, description: step.description,
      state, check: checkLabelPrinting(state, sources),
    })
  }

  changeSteps.forEach((step) => execute(step, 'Change'))
  rollbackPlan.forEach((step) => execute(step, 'Rollback'))

  return {
    snapshots,
    firstFailure: snapshots.find((snapshot) => snapshot.check.status === 'fail'),
    finalSnapshot: snapshots[snapshots.length - 1],
    completedRollbackSteps: rollbackPlan.length,
  }
}

export type WarehouseRun = ReturnType<typeof runWarehouse>
