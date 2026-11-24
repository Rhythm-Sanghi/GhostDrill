import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dispatchQueue } from '../src/scenario.ts'
import { getCheck, runDrill } from '../src/simulator.ts'

test('restoring the connector after a failed reopen leaves the dispatch queue paused', () => {
  const run = runDrill(dispatchQueue, dispatchQueue.rollbackSteps)
  assert.deepEqual(run.executedRollbackStepIds, ['reopen-dispatch', 'restore-connector'])
  assert.equal(run.verdict, 'Failed')
  assert.deepEqual(run.failedPhases, ['Rollback'])
  assert.equal(getCheck(run.finalSnapshot, 'shipping-connector').status, 'healthy')
  assert.deepEqual(getCheck(run.finalSnapshot, 'dispatch-queue'), {
    status: 'unhealthy',
    reason: 'The queue stayed paused because the shipping connector was not ready when reopening was attempted.',
    stepId: 'reopen-dispatch',
  })
  const attempt = run.snapshots.find(({ id }) => id === 'reopen-dispatch')
  assert.ok(attempt)
  assert.equal(getCheck(attempt, 'shipping-connector').status, 'unhealthy')
})

test('reopening after restoring the connector verifies recovery and preserves the original plan', () => {
  const original = runDrill(dispatchQueue, dispatchQueue.rollbackSteps)
  const reordered = runDrill(dispatchQueue, [...dispatchQueue.rollbackSteps].reverse())
  assert.deepEqual(reordered.snapshots[0], original.snapshots[0])
  assert.deepEqual(reordered.executedRollbackStepIds, ['restore-connector', 'reopen-dispatch'])
  assert.equal(reordered.verdict, 'Verified')
  assert.equal(getCheck(reordered.finalSnapshot, 'dispatch-queue').status, 'healthy')
  assert.deepEqual(runDrill(dispatchQueue, dispatchQueue.rollbackSteps), original)
})
