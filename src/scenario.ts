export type Endpoint = 'primary' | 'backup'
export type Reachability = 'reachable' | 'unreachable'
export type Phase = 'Baseline' | 'Change' | 'Rollback'

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

export const baseline: WarehouseState = {
  queueEndpoint: 'primary',
  printPaths: { primary: 'reachable', backup: 'unreachable' },
}

export const changeSteps: readonly RunbookStep[] = [
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

export const originalRollback: readonly RunbookStep[] = [
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

export function createRollbackPlan(includeRestore: boolean): readonly RunbookStep[] {
  return includeRestore ? [...originalRollback, restoreQueue] : [...originalRollback]
}
