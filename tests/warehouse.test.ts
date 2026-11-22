import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRollbackPlan } from '../src/scenario.ts'
import { createBaselineSnapshot, runWarehouse } from '../src/simulator.ts'

test('baseline prints through the primary gateway', () => {
  const baseline = createBaselineSnapshot()
  assert.equal(baseline.state.queueEndpoint, 'primary')
  assert.equal(baseline.check.status, 'pass')
})

test('the supplied rollback completes while printing stays down', () => {
  const run = runWarehouse(createRollbackPlan(false))
  assert.equal(run.completedRollbackSteps, 1)
  assert.equal(run.finalSnapshot.state.printPaths.primary, 'reachable')
  assert.equal(run.finalSnapshot.state.queueEndpoint, 'backup')
  assert.equal(run.finalSnapshot.check.status, 'fail')
  assert.equal(run.finalSnapshot.check.reachability, 'unreachable')
  assert.equal(run.firstFailure?.id, 'switch-queue')
  assert.equal(run.finalSnapshot.check.responsibleStepId, 'switch-queue')
})

test('a revised plan runs from baseline and recovers printing without changing earlier snapshots', () => {
  const run = runWarehouse(createRollbackPlan(true))
  assert.deepEqual(run.snapshots[0], createBaselineSnapshot())
  assert.equal(run.completedRollbackSteps, 2)
  assert.equal(run.finalSnapshot.id, 'restore-queue')
  assert.equal(run.finalSnapshot.state.queueEndpoint, 'primary')
  assert.equal(run.finalSnapshot.check.status, 'pass')
  assert.deepEqual(run.snapshots.map(({ check }) => check.status), ['pass', 'fail', 'fail', 'fail', 'pass'])
  assert.equal(run.snapshots[2].state.printPaths.primary, 'unreachable')
  assert.equal(run.snapshots[3].state.printPaths.primary, 'reachable')
})

test('loading the starting fixture after recovery restores the original failure on the next run', () => {
  const corrected = runWarehouse(createRollbackPlan(true))
  const reset = runWarehouse(createRollbackPlan(false))
  assert.deepEqual(reset.snapshots, corrected.snapshots.slice(0, -1))
  assert.equal(reset.finalSnapshot.check.status, 'fail')
})
