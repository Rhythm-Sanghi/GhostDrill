import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dispatchQueue, dispatchReview } from '../src/scenario.ts'
import { getCheck, runDrill } from '../src/simulator.ts'
import { evaluateDispatchPrerequisite } from '../src/dispatchPrerequisite.ts'

test('a retry reopen passes after a restore while the first attempt fails and the run stays Verified', () => {
  const run = runDrill(dispatchReview, dispatchReview.rollbackSteps)

  // The run recovers overall: the final queue and connector are both healthy.
  assert.equal(run.verdict, 'Verified')
  assert.equal(getCheck(run.finalSnapshot, 'dispatch-queue').status, 'healthy')
  assert.equal(getCheck(run.finalSnapshot, 'shipping-connector').status, 'healthy')

  // The final connector is ready, so judging by final state would pass every attempt.
  // The prerequisite must instead judge each attempt by the state that preceded it.
  const findings = evaluateDispatchPrerequisite(run)
  assert.equal(findings.length, 2)

  const [first, retry] = findings
  assert.equal(first.status, 'violation')
  assert.equal(first.stepId, 'reopen-dispatch')
  assert.equal(first.stepNumber, 1)
  assert.ok(first.reason.includes('offline'), 'the first attempt explains the connector was offline')

  assert.equal(retry.status, 'pass')
  assert.equal(retry.stepId, 'retry-reopen-dispatch')
  assert.equal(retry.stepNumber, 3)
  assert.ok(retry.reason.includes('ready'), 'the retry explains the connector was ready')
})

test('reopening before the connector is restored fails the single prerequisite', () => {
  const run = runDrill(dispatchQueue, dispatchQueue.rollbackSteps)
  assert.equal(run.verdict, 'Failed')

  const findings = evaluateDispatchPrerequisite(run)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].status, 'violation')
  assert.equal(findings[0].stepId, 'reopen-dispatch')
  assert.equal(findings[0].stepNumber, 1)
})

test('restoring the connector before reopening passes the prerequisite at its rollback step', () => {
  const run = runDrill(dispatchQueue, [...dispatchQueue.rollbackSteps].reverse())
  assert.equal(run.verdict, 'Verified')

  const findings = evaluateDispatchPrerequisite(run)
  assert.equal(findings.length, 1)
  const [reopen] = findings
  assert.equal(reopen.status, 'pass')
  assert.equal(reopen.stepId, 'reopen-dispatch')
  assert.equal(reopen.stepNumber, 2)
})

test('a rollback with no reopen attempts reports a missing prerequisite', () => {
  const restoreConnector = dispatchQueue.rollbackSteps.find((step) => step.action.type === 'restore-connector')
  assert.ok(restoreConnector, 'the dispatch fixture restores the connector')
  const run = runDrill(dispatchQueue, [restoreConnector])

  assert.deepEqual(evaluateDispatchPrerequisite(run), [{
    status: 'missing',
    observed: 'No reopen-dispatch attempts were recorded.',
    reason: 'A connector-ready reopen attempt is required to evaluate the dispatch prerequisite.',
  }])
})
