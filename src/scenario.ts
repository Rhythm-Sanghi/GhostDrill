export type Endpoint = 'primary' | 'backup'
export type Reachability = 'reachable' | 'unreachable' | 'unobserved'
export type Phase = 'Baseline' | 'Change' | 'Rollback'
export type CheckId = 'label-printing' | 'queue-endpoint' | 'dispatch-queue' | 'shipping-connector'

export interface WarehouseState {
  readonly kind: 'warehouse'
  readonly queueEndpoint: Endpoint
  readonly printPaths: Readonly<Record<Endpoint, Reachability>>
}

export interface DispatchState {
  readonly kind: 'dispatch'
  readonly queue: 'open' | 'paused' | 'blocked'
  readonly connectorReady: boolean
}

export type ServiceState = WarehouseState | DispatchState

type Action =
  | { type: 'set-queue-endpoint'; endpoint: Endpoint }
  | { type: 'set-print-path'; endpoint: Endpoint; reachability: Reachability }
  | { type: 'pause-dispatch' }
  | { type: 'reopen-dispatch' }
  | { type: 'restore-connector'; ready?: boolean }

export interface RunbookStep {
  id: string
  title: string
  description: string
  action: Action
}

export const endpoints = {
  primary: { name: 'Primary gateway', address: 'gw-primary' },
  backup: { name: 'Backup gateway', address: 'gw-backup' },
} satisfies Record<Endpoint, { name: string; address: string }>

const baseline: WarehouseState = {
  kind: 'warehouse',
  queueEndpoint: 'primary',
  printPaths: { primary: 'reachable', backup: 'unreachable' },
}

const changeSteps: readonly RunbookStep[] = [
  {
    id: 'switch-queue',
    title: 'Switch queue to backup',
    description: 'Point the label queue at gw-backup.',
    action: { type: 'set-queue-endpoint', endpoint: 'backup' },
  },
  {
    id: 'isolate-primary',
    title: 'Take primary offline',
    description: 'Isolate the primary gateway for maintenance.',
    action: { type: 'set-print-path', endpoint: 'primary', reachability: 'unreachable' },
  },
]

const originalRollback: readonly RunbookStep[] = [
  {
    id: 'restore-primary',
    title: 'Restore primary gateway',
    description: 'Bring the primary print path back online.',
    action: { type: 'set-print-path', endpoint: 'primary', reachability: 'reachable' },
  },
]

export const restoreQueue: RunbookStep = {
  id: 'restore-queue',
  title: 'Restore label queue endpoint',
  description: 'Point the label queue back at gw-primary.',
  action: { type: 'set-queue-endpoint', endpoint: 'primary' },
}

export interface DrillScenario<State extends ServiceState = ServiceState> {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly launchLabel: string
  readonly baseline: State
  readonly changeSteps: readonly RunbookStep[]
  readonly rollbackSteps: readonly RunbookStep[]
  readonly requiredChecks: readonly CheckId[]
  readonly rollbackEditor: 'endpoint' | 'order' | 'none'
  readonly serviceCheck: CheckId
  readonly startingState: string
  readonly scope: string
}

export const warehouseOutage: DrillScenario<WarehouseState> = {
  id: 'warehouse-outage',
  title: 'Warehouse Label Outage',
  description: 'Rehearse a gateway change and see whether rollback brings shipping label printing back.',
  launchLabel: 'Try the warehouse drill',
  baseline,
  changeSteps,
  rollbackSteps: originalRollback,
  requiredChecks: ['label-printing', 'queue-endpoint'],
  rollbackEditor: 'endpoint',
  serviceCheck: 'label-printing',
  startingState: 'Queue points to the primary gateway',
  scope: 'Checks the queue endpoint and its active path to the print service.',
}

export const missingPrintPath: DrillScenario<WarehouseState> = {
  ...warehouseOutage,
  id: 'missing-print-path',
  title: 'Missing Print Path Evidence',
  description: 'Run a complete rollback with no reachability observation for the restored primary print path.',
  launchLabel: 'Try the missing evidence drill',
  rollbackSteps: [
    {
      id: 'restore-primary-unobserved',
      title: 'Restore primary gateway',
      description: 'Restore the primary gateway without a print-path observation.',
      action: { type: 'set-print-path', endpoint: 'primary', reachability: 'unobserved' },
    },
    restoreQueue,
  ],
  rollbackEditor: 'none',
}

export const dispatchQueue: DrillScenario<DispatchState> = {
  id: 'dispatch-queue',
  title: 'Dispatch Queue Rollback',
  description: 'Reopen a paused dispatch queue after maintenance. The queue needs its shipping connector to be ready first.',
  launchLabel: 'Try the dispatch drill',
  baseline: { kind: 'dispatch', queue: 'open', connectorReady: true },
  changeSteps: [{
    id: 'pause-dispatch',
    title: 'Pause dispatch for maintenance',
    description: 'Pause the queue and take the shipping connector offline.',
    action: { type: 'pause-dispatch' },
  }],
  rollbackSteps: [
    {
      id: 'reopen-dispatch',
      title: 'Reopen dispatch queue',
      description: 'Attempt to reopen the queue using the shipping connector.',
      action: { type: 'reopen-dispatch' },
    },
    {
      id: 'restore-connector',
      title: 'Restore shipping connector',
      description: 'Bring the connector back online.',
      action: { type: 'restore-connector' },
    },
  ],
  requiredChecks: ['dispatch-queue', 'shipping-connector'],
  rollbackEditor: 'order',
  serviceCheck: 'dispatch-queue',
  startingState: 'Dispatch queue open and connector ready',
  scope: 'Checks the dispatch queue and its shipping connector.',
}

export const dispatchReview: DrillScenario<DispatchState> = {
  ...dispatchQueue,
  id: 'dispatch-review',
  title: 'Dispatch Acceptance Review',
  description: 'Review a rollback that restores dispatch after an early reopen attempt.',
  launchLabel: 'Try the dispatch review',
  rollbackSteps: [
    ...dispatchQueue.rollbackSteps,
    {
      id: 'retry-reopen-dispatch',
      title: 'Retry reopening dispatch queue',
      description: 'Try reopening again after the connector restoration.',
      action: { type: 'reopen-dispatch' },
    },
  ],
}

export const scenarios = [warehouseOutage, missingPrintPath, dispatchQueue, dispatchReview] as const

export function createRollbackPlan(scenario: DrillScenario, includeRestore: boolean): readonly RunbookStep[] {
  return includeRestore && scenario.rollbackEditor === 'endpoint'
    ? [...scenario.rollbackSteps, restoreQueue]
    : scenario.rollbackSteps
}
