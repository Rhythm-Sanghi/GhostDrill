export const actions = {
  'restore-printing': 'Restore printing',
  'release-batch': 'Release held batch',
  'record-receipt': 'Record release receipt',
  'verify-recovery': 'Inspect simulated shipping state (optional)',
  'restore-routing': 'Restore routing',
  'save-progress': 'Save routing checkpoint',
  'verify-routing': 'Verify restored routing',
} as const

export const shippingVerdictScope = 'The verdict evaluates the selected requirements. The optional inspection only records simulated state.'

export const requirements = {
  'at-most-once': 'Release the batch at most once',
  'recover-once': 'Recover service and release exactly once',
  'receipt-evidence': 'Record the downstream release receipt',
  'recover-routing': 'Recover routing service',
  'verify-routing': 'Execute the required routing verification',
} as const

export const boundaryLabels = {
  'before-effect': 'Before the downstream release',
  'after-commit': 'After the release commits, before acknowledgement',
  'after-ack': 'After acknowledgement, before recording the receipt',
  'after-checkpoint': 'After the receipt-recording step',
  'routing-checkpoint': 'After saving the routing checkpoint',
} as const

export const observationLabels = {
  standard: 'Receipts available',
  'receipt-unavailable': 'Receipt evidence unavailable',
  'changed-payload': 'Different payload on retry',
} as const

export const restartLabels = {
  checkpoint: 'Resume from saved checkpoint',
  beginning: 'Start from first action',
} as const

export type ActionId = keyof typeof actions
export type RequirementId = keyof typeof requirements
export type Boundary = keyof typeof boundaryLabels
export type Observation = keyof typeof observationLabels
export type RestartPolicy = keyof typeof restartLabels
export type ScenarioId = 'shipping-release' | 'routing-verification'

interface RestartFixture {
  title: string
  description: string
  actions: readonly ActionId[]
  requirements: readonly RequirementId[]
  boundaries: readonly Boundary[]
  observations: readonly Observation[]
}

export const restartFixtures = {
  'shipping-release': {
    title: 'Shipping batch restart',
    description: 'Restore label printing and release the held batch BATCH-1042.',
    actions: ['restore-printing', 'release-batch', 'record-receipt', 'verify-recovery'],
    requirements: ['at-most-once', 'recover-once', 'receipt-evidence'],
    boundaries: ['before-effect', 'after-commit', 'after-ack', 'after-checkpoint'],
    observations: ['standard', 'receipt-unavailable', 'changed-payload'],
  },
  'routing-verification': {
    title: 'Routing verification restart',
    description: 'Restore routing and check whether the saved progress skips a verification.',
    actions: ['restore-routing', 'save-progress', 'verify-routing'],
    requirements: ['recover-routing', 'verify-routing'],
    boundaries: ['routing-checkpoint'],
    observations: ['standard'],
  },
} as const satisfies Record<ScenarioId, RestartFixture>

export interface RestartRevision {
  actions: readonly ActionId[]
  requirements: readonly RequirementId[]
  releasePolicy: 'repeat' | 'stable-key'
  boundaries: readonly Boundary[]
  observations: readonly Observation[]
  restartPolicies: readonly RestartPolicy[]
  limit: number
}

export const maxCases = 25
export const batchId = 'BATCH-1042'

export function defaultRevision(scenario: ScenarioId): RestartRevision {
  const fixture = restartFixtures[scenario]
  return {
    actions: fixture.actions,
    requirements: fixture.requirements,
    releasePolicy: 'repeat',
    boundaries: fixture.boundaries,
    observations: ['standard'],
    restartPolicies: ['checkpoint', 'beginning'],
    limit: maxCases,
  }
}

export const caseOrder = {
  boundaries: Object.keys(boundaryLabels) as Boundary[],
  observations: Object.keys(observationLabels) as Observation[],
  restartPolicies: Object.keys(restartLabels) as RestartPolicy[],
}
