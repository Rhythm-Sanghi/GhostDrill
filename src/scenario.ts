export type Endpoint = 'primary' | 'backup'
export type Reachability = 'reachable' | 'unreachable' | 'unobserved'
export type Phase = 'Baseline' | 'Change' | 'Rollback'
export type CheckId = 'label-printing' | 'queue-endpoint'

export interface WarehouseState {
  readonly queueEndpoint: Endpoint
  readonly printPaths: Readonly<Record<Endpoint, Reachability>>
}

type Action =
  | { type: 'set-queue-endpoint'; endpoint: Endpoint }
  | { type: 'set-print-path'; endpoint: Endpoint; reachability: Reachability }

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

export interface DrillScenario {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly launchLabel: string
  readonly baseline: WarehouseState
  readonly changeSteps: readonly RunbookStep[]
  readonly rollbackSteps: readonly RunbookStep[]
  readonly requiredChecks: readonly CheckId[]
  readonly canEditRollback: boolean
}

export const warehouseOutage: DrillScenario = {
  id: 'warehouse-outage',
  title: 'Warehouse Label Outage',
  description: 'Rehearse a gateway change and see whether rollback brings shipping label printing back.',
  launchLabel: 'Try the warehouse drill',
  baseline,
  changeSteps,
  rollbackSteps: originalRollback,
  requiredChecks: ['label-printing', 'queue-endpoint'],
  canEditRollback: true,
}

export const missingPrintPath: DrillScenario = {
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
  canEditRollback: false,
}

export const scenarios = [warehouseOutage, missingPrintPath] as const

export function createRollbackPlan(scenario: DrillScenario, includeRestore: boolean): readonly RunbookStep[] {
  return includeRestore && scenario.canEditRollback
    ? [...scenario.rollbackSteps, restoreQueue]
    : scenario.rollbackSteps
}
