import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRollbackPlan, missingPrintPath, warehouseOutage, type DrillScenario } from '../src/scenario.ts'
import { createBaselineSnapshot, getCheck, runDrill, type Snapshot } from '../src/simulator.ts'
import { describeFinalService, verificationNotes } from '../src/outcome.ts'

function warehouseState(snapshot: Snapshot) {
  assert.equal(snapshot.state.kind, 'warehouse')
  return snapshot.state
}

test('baseline prints through the required primary gateway', () => {
  const baseline = createBaselineSnapshot(warehouseOutage)
  assert.equal(warehouseState(baseline).queueEndpoint, 'primary')
  assert.equal(getCheck(baseline, 'label-printing').status, 'healthy')
  assert.equal(getCheck(baseline, 'queue-endpoint').status, 'healthy')
})

test('the supplied rollback completes but fails verification with evidence for the endpoint switch', () => {
  const run = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, false))
  assert.deepEqual(run.executedRollbackStepIds, ['restore-primary'])
  assert.equal(warehouseState(run.finalSnapshot).printPaths.primary, 'reachable')
  assert.equal(warehouseState(run.finalSnapshot).queueEndpoint, 'backup')
  assert.equal(run.verdict, 'Failed')
  assert.deepEqual(run.failedPhases, ['Rollback'])
  assert.equal(run.firstFailure?.id, 'switch-queue')
  for (const { baseline, rollback } of run.comparisons) {
    assert.equal(baseline.status, 'healthy')
    assert.equal(rollback.status, 'unhealthy')
    assert.ok('stepId' in rollback)
    assert.equal(rollback.stepId, 'switch-queue')
  }
})

test('a revised plan verifies recovery from baseline and keeps earlier snapshots intact', () => {
  const run = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, true))
  assert.deepEqual(run.snapshots[0], createBaselineSnapshot(warehouseOutage))
  assert.equal(run.finalSnapshot.id, 'restore-queue')
  assert.equal(warehouseState(run.finalSnapshot).queueEndpoint, 'primary')
  assert.equal(run.verdict, 'Verified')
  assert.deepEqual(run.failedPhases, [])
  assert.deepEqual(run.snapshots.map((snapshot) => getCheck(snapshot, 'label-printing').status), [
    'healthy', 'unhealthy', 'unhealthy', 'unhealthy', 'healthy',
  ])
  assert.equal(warehouseState(run.snapshots[2]).printPaths.primary, 'unreachable')
  assert.equal(warehouseState(run.snapshots[3]).printPaths.primary, 'reachable')
})

test('a confirmed unhealthy baseline fails even when rollback is healthy', () => {
  const scenario: DrillScenario = {
    ...warehouseOutage,
    baseline: { ...warehouseOutage.baseline, printPaths: { primary: 'unreachable', backup: 'unreachable' } },
  }
  const run = runDrill(scenario, createRollbackPlan(scenario, true))
  assert.equal(getCheck(run.finalSnapshot, 'label-printing').status, 'healthy')
  assert.equal(run.verdict, 'Failed')
  assert.deepEqual(run.failedPhases, ['Baseline'])
  assert.equal(describeFinalService(run).description, 'Printing works after rollback')
  assert.deepEqual(verificationNotes(run), ['Failed in Baseline'])
  assert.deepEqual(runDrill(scenario, createRollbackPlan(scenario, false)).failedPhases, ['Baseline', 'Rollback'])
})

test('a confirmed baseline failure takes precedence over an unknown rollback result', () => {
  const scenario: DrillScenario = {
    ...missingPrintPath,
    baseline: { ...missingPrintPath.baseline, printPaths: { primary: 'unreachable', backup: 'unreachable' } },
  }
  const run = runDrill(scenario, createRollbackPlan(scenario, false))
  assert.equal(getCheck(run.finalSnapshot, 'label-printing').status, 'unknown')
  assert.equal(run.verdict, 'Failed')
  assert.deepEqual(run.failedPhases, ['Baseline'])
})

test('a confirmed rollback failure takes precedence over an unknown baseline result', () => {
  const scenario: DrillScenario = {
    ...warehouseOutage,
    baseline: { ...warehouseOutage.baseline, printPaths: { primary: 'unobserved', backup: 'unreachable' } },
  }
  const run = runDrill(scenario, createRollbackPlan(scenario, false))
  assert.equal(getCheck(run.snapshots[0], 'label-printing').status, 'unknown')
  assert.equal(run.verdict, 'Failed')
  assert.deepEqual(run.failedPhases, ['Rollback'])
})

test('missing rollback evidence alone yields repeatable Unknown with no step attribution', () => {
  const run = runDrill(missingPrintPath, createRollbackPlan(missingPrintPath, false))
  assert.deepEqual(run.executedRollbackStepIds, ['restore-primary-unobserved', 'restore-queue'])
  assert.equal(run.verdict, 'Unknown')
  assert.deepEqual(run.failedPhases, [])
  assert.equal(getCheck(run.finalSnapshot, 'queue-endpoint').status, 'healthy')
  const result = getCheck(run.finalSnapshot, 'label-printing')
  assert.equal(result.status, 'unknown')
  assert.match(result.reason, /reachability from the primary gateway to the print service/)
  assert.ok(!('stepId' in result))
  assert.deepEqual(runDrill(missingPrintPath, createRollbackPlan(missingPrintPath, false)), run)
})

test('missing baseline evidence alone still yields Unknown after a healthy rollback', () => {
  const scenario: DrillScenario = {
    ...warehouseOutage,
    baseline: { ...warehouseOutage.baseline, printPaths: { primary: 'unobserved', backup: 'unreachable' } },
  }
  const run = runDrill(scenario, createRollbackPlan(scenario, true))
  assert.equal(getCheck(run.snapshots[0], 'label-printing').status, 'unknown')
  assert.equal(getCheck(run.finalSnapshot, 'label-printing').status, 'healthy')
  assert.equal(run.verdict, 'Unknown')
  assert.equal(describeFinalService(run).description, 'Printing works after rollback')
  assert.match(verificationNotes(run)[0], /^Baseline .*Missing observation/)
})

test('an empty required set never verifies a healthy rollback', () => {
  const scenario = { ...warehouseOutage, requiredChecks: [] }
  const run = runDrill(scenario, createRollbackPlan(scenario, true))
  assert.equal(getCheck(run.finalSnapshot, 'label-printing').status, 'healthy')
  assert.deepEqual(run.comparisons, [])
  assert.equal(run.verdict, 'Unknown')
})

test('a fresh warehouse run after recovery restores the original failure', () => {
  const corrected = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, true))
  const reset = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, false))
  assert.deepEqual(reset.snapshots, corrected.snapshots.slice(0, -1))
  assert.equal(reset.verdict, 'Failed')
})
