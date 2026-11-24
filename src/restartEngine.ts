import { commitRelease, type ReleaseEffect } from './releaseBoundary.ts'
import {
  actions, batchId, boundaryLabels, caseOrder, type ActionId, type Boundary, type Observation,
  type RequirementId, type RestartPolicy, type RestartRevision, type ScenarioId,
} from './restartModel.ts'

export type FindingStatus = 'Pass' | 'Violation' | 'Needs evidence'
type Response = 'Not requested' | 'Received' | 'Lost' | 'Unavailable' | 'Conflict'

export type RestartCase =
  | { id: 'uninterrupted'; observation: 'standard' }
  | { id: string; boundary: Boundary; observation: Observation; restart: RestartPolicy }

interface TraceEvent {
  number: number
  attempt: 'Original attempt' | 'Resumed attempt'
  title: string
  detail: string
  action: ActionId | null
  nextAction: ActionId | null
  releases: number
  receipt?: string
  response: Response
}

interface Finding {
  id: RequirementId
  status: FindingStatus
  reason: string
  event?: number
}

export function enumerateCases(revision: RestartRevision): RestartCase[] {
  const cases: RestartCase[] = [{ id: 'uninterrupted', observation: 'standard' }]
  for (const boundary of caseOrder.boundaries.filter((id) => revision.boundaries.includes(id))) {
    for (const observation of caseOrder.observations.filter((id) => revision.observations.includes(id))) {
      for (const restart of caseOrder.restartPolicies.filter((id) => revision.restartPolicies.includes(id))) {
        cases.push({ id: `${boundary}/${observation}/${restart}`, boundary, observation, restart })
      }
    }
  }
  return cases
}

export function executeRestart(scenario: ScenarioId, revision: RestartRevision, testCase: RestartCase) {
  let effects: readonly ReleaseEffect[] = []
  let serviceRecovered = false
  const durable = { next: 0, receipt: undefined as string | undefined, routingVerified: false }
  let volatile = { receipt: undefined as string | undefined, response: 'Not requested' as Response }
  let cursor = 0
  let resumed = false
  let duplicateEvent: number | undefined
  let conflictEvent: number | undefined
  let verificationEvent: number | undefined
  const trace: TraceEvent[] = []

  function record(title: string, detail: string, action: ActionId | null) {
    trace.push({
      number: trace.length + 1,
      attempt: resumed ? 'Resumed attempt' : 'Original attempt',
      title, detail, action,
      nextAction: revision.actions[durable.next] ?? null,
      releases: effects.length, receipt: durable.receipt, response: volatile.response,
    })
    return trace.length
  }

  function interrupt(boundary: Boundary, action: ActionId) {
    if (resumed || !('boundary' in testCase) || testCase.boundary !== boundary) return false
    if (boundary === 'after-commit' && volatile.response === 'Not requested') {
      volatile.response = 'Lost'
      record('Acknowledgement lost', 'The process stopped before it could receive the downstream response.', action)
    }
    record('Interruption', boundaryLabels[boundary], action)
    volatile = { receipt: undefined, response: 'Not requested' }
    const next = testCase.restart === 'checkpoint' ? durable.next : 0
    const resumeAt = revision.actions[next]
    cursor = next
    resumed = true
    record('Restart', `${testCase.restart === 'checkpoint' ? 'The saved checkpoint points to' : 'The operator chose to start from'} ${resumeAt ? actions[resumeAt] : 'the end of the runbook'}. Downstream effects and saved receipts survived.`, resumeAt ?? null)
    const verificationIndex = revision.actions.indexOf('verify-routing')
    if (boundary === 'routing-checkpoint' && !durable.routingVerified && verificationIndex >= 0 && next > verificationIndex) {
      verificationEvent = record('Required verification skipped', 'The saved restart location is past the routing verification action.', 'verify-routing')
    }
    return true
  }

  while (cursor < revision.actions.length) {
    const action = revision.actions[cursor]
    switch (action) {
      case 'restore-printing':
        serviceRecovered = true
        record('Printing restored', 'The simulated label print path is available.', action)
        durable.next = Math.max(durable.next, cursor + 1)
        record('Checkpoint saved', 'Resume after the printing restoration.', action)
        break
      case 'release-batch': {
        volatile = { receipt: undefined, response: 'Not requested' }
        record('Release attempted', `The runbook requests release of ${batchId}.`, action)
        if (interrupt('before-effect', action)) continue
        const payload = resumed && testCase.observation === 'changed-payload' ? `${batchId}/changed` : batchId
        const result = commitRelease(effects, payload, revision.releasePolicy === 'stable-key' ? batchId : undefined)
        effects = result.effects
        if (result.kind === 'conflict') {
          volatile.response = 'Conflict'
          conflictEvent = record('Payload conflict', 'The downstream system rejected a different payload for the same batch key.', action)
          break
        }
        const event = result.kind === 'committed'
          ? record(effects.length > 1 ? 'Duplicate release committed' : 'Release committed',
            `The downstream system committed ${result.receipt} for ${batchId}.`, action)
          : record('Original receipt reused', `The downstream system recognized ${batchId} and returned ${result.receipt} without committing another release.`, action)
        if (result.kind === 'committed' && effects.length > 1) duplicateEvent ??= event
        if (interrupt('after-commit', action)) continue
        if (testCase.observation === 'receipt-unavailable') {
          volatile.response = 'Unavailable'
          record('Receipt evidence unavailable', 'The release response cannot be observed in this case.', action)
          break
        }
        volatile = { receipt: result.receipt, response: 'Received' }
        record('Acknowledgement received', `${result.receipt} is available in volatile memory.`, action)
        if (interrupt('after-ack', action)) continue
        break
      }
      case 'record-receipt':
        if (volatile.receipt) {
          durable.receipt = volatile.receipt
          record('Receipt recorded', `${durable.receipt} is now durable.`, action)
          durable.next = Math.max(durable.next, cursor + 1)
          record('Checkpoint saved', 'Resume after the receipt-recording step.', action)
        } else {
          record('Receipt unavailable', 'There is no acknowledgement to record. The checkpoint stays unchanged.', action)
        }
        if (interrupt('after-checkpoint', action)) continue
        break
      case 'verify-recovery':
        record('Shipping recovery checked', `Printing is ${serviceRecovered ? 'available' : 'down'}; downstream records show ${effects.length} committed releases.`, action)
        break
      case 'restore-routing':
        serviceRecovered = true
        record('Routing restored', 'The simulated route is reachable.', action)
        break
      case 'save-progress':
        durable.next = revision.actions.length
        record('Checkpoint saved', durable.routingVerified
          ? 'The runbook saved completion after verification.'
          : 'The runbook saved completion before the required verification executed.', action)
        if (interrupt('routing-checkpoint', action)) continue
        break
      case 'verify-routing':
        durable.routingVerified = serviceRecovered
        verificationEvent = record('Routing verification executed', serviceRecovered ? 'The restored route was observed.' : 'Routing remains down.', action)
        break
    }
    cursor++
  }

  const end = record('Execution ended', `${effects.length} downstream releases. Service ${serviceRecovered ? 'recovered' : 'down'}.`, null)
  const boundaryReached = !('boundary' in testCase) || resumed
  function evaluate(id: RequirementId): Finding {
    switch (id) {
      case 'at-most-once':
        return duplicateEvent
          ? { id, status: 'Violation', reason: `${batchId} was released more than once.`, event: duplicateEvent }
          : { id, status: 'Pass', reason: 'The downstream system committed at most one release.' }
      case 'recover-once':
        return serviceRecovered && effects.length === 1
          ? { id, status: 'Pass', reason: 'Printing recovered and the batch was released exactly once.' }
          : { id, status: 'Violation', reason: `Printing ${serviceRecovered ? 'recovered' : 'stayed down'} with ${effects.length} committed releases; recovery requires exactly one.`, event: duplicateEvent ?? end }
      case 'receipt-evidence':
        if (conflictEvent) return { id, status: 'Violation', reason: 'The retry payload did not match the original release.', event: conflictEvent }
        return durable.receipt
          ? { id, status: 'Pass', reason: `${durable.receipt} was recorded durably.` }
          : { id, status: 'Needs evidence', reason: 'No downstream release receipt was recorded durably.' }
      case 'recover-routing':
        return serviceRecovered
          ? { id, status: 'Pass', reason: 'Routing recovered.' }
          : { id, status: 'Violation', reason: 'Routing stayed down.', event: end }
      case 'verify-routing':
        return durable.routingVerified
          ? { id, status: 'Pass', reason: 'The restored route was verified.' }
          : { id, status: 'Violation', reason: 'The required verification did not establish restored routing.',
            event: verificationEvent ?? end }
    }
  }
  const findings = revision.requirements.map(evaluate)
  const violations = findings.filter(({ status }) => status === 'Violation')
  const status: FindingStatus = violations.length ? 'Violation'
    : !boundaryReached || !findings.length || findings.some(({ status }) => status === 'Needs evidence') ? 'Needs evidence' : 'Pass'
  const firstFailure = violations.reduce<Finding | undefined>((first, item) => !first || (item.event ?? end) < (first.event ?? end) ? item : first, undefined)
  return { scenario, testCase, trace, findings, status, firstFailure, boundaryReached, serviceRecovered, releases: effects.length }
}

export function exploreRestart(scenario: ScenarioId, revision: RestartRevision) {
  const cases = enumerateCases(revision)
  const results = cases.slice(0, revision.limit).map((testCase) => executeRestart(scenario, revision, testCase))
  const counts = { Pass: 0, Violation: 0, 'Needs evidence': 0 }
  for (const { status } of results) counts[status]++
  const complete = results.length === cases.length
  const outcome: 'Violation' | 'Inconclusive' | 'Pass' = counts.Violation > 0 ? 'Violation'
    : !complete || counts['Needs evidence'] > 0 ? 'Inconclusive' : 'Pass'
  return {
    results, counts, total: cases.length, complete,
    counterexample: results.find(({ status }) => status === 'Violation'),
    outcome,
  }
}

export type Exploration = ReturnType<typeof exploreRestart>
export type CaseResult = Exploration['results'][number]
