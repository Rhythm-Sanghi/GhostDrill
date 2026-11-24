import assert from "node:assert/strict"
import { test } from "node:test"
import {
  createRollbackPlan,
  missingPrintPath,
  type DrillScenario,
  type Reachability,
  warehouseOutage,
} from "../src/scenario.ts"
import { runDrill, type DrillRun } from "../src/simulator.ts"
import { compareRuns, resolveComparisonTitles, type ChangedCheck } from "../src/comparison.ts"

test("warehouse outage Failed to Verified surfaces the added step and both changed checks", () => {
  const prev = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, false))
  const current = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, true))
  assert.equal(prev.verdict, "Failed")
  assert.equal(current.verdict, "Verified")

  const result = compareRuns(prev, current)
  assert.equal(result.priorVerdict, "Failed")
  assert.equal(result.currentVerdict, "Verified")
  assert.deepEqual(result.addedStepIds, ["restore-queue"])
  assert.deepEqual(result.removedStepIds, [])

  const printing = result.changedChecks.find((check) => check.id === "label-printing")
  const queue = result.changedChecks.find((check) => check.id === "queue-endpoint")
  for (const check of [printing, queue]) {
    assert.ok(check)
    assert.deepEqual(check.phases.map(({ phase, before, after }) => ({
      phase, before: before.status, after: after.status,
      beforeStep: 'stepId' in before && before.stepId,
      afterStep: 'stepId' in after && after.stepId,
    })), [{
      phase: 'Rollback', before: 'unhealthy', after: 'healthy',
      beforeStep: 'switch-queue', afterStep: 'restore-queue',
    }])
  }
  assert.equal(result.identical, false)

  const resolved = resolveComparisonTitles(result, (id) =>
    id === "restore-queue" ? "Restore label queue endpoint" : id,
  )
  assert.deepEqual(resolved.addedSteps, [{ id: "restore-queue", title: "Restore label queue endpoint" }])
  assert.deepEqual(resolved.removedSteps, [])
  assert.equal(resolved.priorVerdict, "Failed")
  assert.equal(resolved.currentVerdict, "Verified")
})

test("two identical missing-print-path runs compare as identical with Unknown preserved", () => {
  const run = runDrill(missingPrintPath, createRollbackPlan(missingPrintPath, false))
  const result = compareRuns(run, runDrill(missingPrintPath, missingPrintPath.rollbackSteps))
  assert.equal(result.priorVerdict, "Unknown")
  assert.equal(result.currentVerdict, "Unknown")
  assert.deepEqual(result.addedStepIds, [])
  assert.deepEqual(result.removedStepIds, [])
  assert.deepEqual(result.changedChecks, [])
  assert.equal(result.identical, true)
})

// Deterministic PRNG so property failures are reproducible.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const reachabilities: Reachability[] = ["reachable", "unreachable", "unobserved"]

function generateRunPair(rand: () => number): { scenario: DrillScenario; prev: DrillRun; current: DrillRun } {
  const base = rand() < 0.5 ? warehouseOutage : missingPrintPath
  const primary = reachabilities[Math.floor(rand() * 3)]
  const backup = reachabilities[Math.floor(rand() * 3)]
  const scenario: DrillScenario = {
    ...base,
    baseline: { ...base.baseline, printPaths: { primary, backup } },
  }
  const prev = runDrill(scenario, createRollbackPlan(scenario, rand() < 0.5))
  const current = runDrill(scenario, createRollbackPlan(scenario, rand() < 0.5))
  return { scenario, prev, current }
}

const iterations = 200

test("Feature: compare-rollback-runs, Property 1: verdict passthrough preserves Unknown", () => {
  const rand = mulberry32(20260422)
  for (let i = 0; i < iterations; i++) {
    const { prev, current } = generateRunPair(rand)
    const result = compareRuns(prev, current)
    assert.equal(result.priorVerdict, prev.verdict, `prior verdict run ${i}`)
    assert.equal(result.currentVerdict, current.verdict, `current verdict run ${i}`)
    if (prev.verdict === "Unknown") assert.equal(result.priorVerdict, "Unknown")
    if (current.verdict === "Unknown") assert.equal(result.currentVerdict, "Unknown")
  }
})

test("Feature: compare-rollback-runs, Property 2: rollback step diff is the symmetric set difference", () => {
  const rand = mulberry32(20260423)
  for (let i = 0; i < iterations; i++) {
    const { prev, current } = generateRunPair(rand)
    const result = compareRuns(prev, current)
    const added = current.executedRollbackStepIds.filter((id) => !prev.executedRollbackStepIds.includes(id))
    const removed = prev.executedRollbackStepIds.filter((id) => !current.executedRollbackStepIds.includes(id))
    assert.deepEqual(result.addedStepIds, added, `added run ${i}`)
    assert.deepEqual(result.removedStepIds, removed, `removed run ${i}`)
  }
})

test("Feature: compare-rollback-runs, Property 3: changed checks pair the same phase by stable check ID", () => {
  const rand = mulberry32(20260424)
  for (let i = 0; i < iterations; i++) {
    const { prev, current } = generateRunPair(rand)
    const reversed = [...current.comparisons].reverse()
    const result = compareRuns(prev, { ...current, comparisons: reversed })
    const reference: ChangedCheck[] = []
    for (const cmp of reversed) {
      const prevCmp = prev.comparisons.find((check) => check.id === cmp.id)
      if (!prevCmp) continue
      if (cmp.rollback.status !== prevCmp.rollback.status || cmp.rollback.reason !== prevCmp.rollback.reason) {
        reference.push({ id: cmp.id, phases: [{ phase: 'Rollback', before: prevCmp.rollback, after: cmp.rollback }] })
      }
    }
    assert.deepEqual(result.changedChecks, reference, `changed checks run ${i}`)
  }
})

test("Feature: compare-rollback-runs, Property 4: identical detection and self-comparison idempotence", () => {
  const rand = mulberry32(20260425)
  for (let i = 0; i < iterations; i++) {
    const { prev, current } = generateRunPair(rand)
    const result = compareRuns(prev, current)
    const expectedIdentical =
      result.addedStepIds.length === 0 && result.removedStepIds.length === 0
      && !result.reorderedSteps && result.changedChecks.length === 0 && prev.verdict === current.verdict
    assert.equal(result.identical, expectedIdentical, `identical run ${i}`)
    assert.equal(compareRuns(prev, prev).identical, true, `prev self run ${i}`)
    assert.equal(compareRuns(current, current).identical, true, `current self run ${i}`)
  }
})

test('a genuine reorder is recorded even with the same verdict and check results', () => {
  const [restoreGateway] = warehouseOutage.rollbackSteps
  const [, restoreEndpoint] = missingPrintPath.rollbackSteps
  const before = runDrill(warehouseOutage, [restoreGateway, restoreEndpoint])
  const after = runDrill(warehouseOutage, [restoreEndpoint, restoreGateway])
  const result = compareRuns(before, after)
  assert.deepEqual(result.reorderedSteps, {
    before: ['restore-primary', 'restore-queue'],
    after: ['restore-queue', 'restore-primary'],
  })
  assert.deepEqual(result.changedChecks, [])
  assert.equal(result.priorVerdict, 'Verified')
  assert.equal(result.currentVerdict, 'Verified')
  assert.equal(result.identical, false)
})

test('insertion and deletion preserve the relative order of shared steps', () => {
  const [restoreGateway] = warehouseOutage.rollbackSteps
  const [, restoreEndpoint] = missingPrintPath.rollbackSteps
  const middle = { ...restoreGateway, id: 'observe-primary' }
  const before = runDrill(warehouseOutage, [restoreGateway, restoreEndpoint])
  const after = runDrill(warehouseOutage, [restoreGateway, middle, restoreEndpoint])
  assert.deepEqual(compareRuns(before, after).addedStepIds, ['observe-primary'])
  assert.deepEqual(compareRuns(after, before).removedStepIds, ['observe-primary'])
  assert.equal(compareRuns(before, after).reorderedSteps, null)
  assert.equal(compareRuns(after, before).reorderedSteps, null)
})

test('a Baseline-only change pairs Baseline evidence and preserves the missing observation', () => {
  const scenario = {
    ...warehouseOutage,
    baseline: { ...warehouseOutage.baseline, printPaths: { primary: 'unobserved' as const, backup: 'unreachable' as const } },
  }
  const plan = createRollbackPlan(scenario, true)
  const before = runDrill(scenario, plan)
  const after = runDrill(warehouseOutage, plan)
  const result = compareRuns(before, after)
  assert.deepEqual(result.changedChecks, [{
    id: 'label-printing',
    phases: [{
      phase: 'Baseline',
      before: {
        status: 'unknown',
        reason: 'Missing observation: reachability from the primary gateway to the print service.',
      },
      after: { status: 'healthy', reason: 'Primary gateway can reach the print service.', stepId: 'baseline' },
    }],
  }])
  assert.equal(result.priorVerdict, 'Unknown')
  assert.equal(result.currentVerdict, 'Verified')
})

test('a check can change in both phases', () => {
  const scenario = {
    ...warehouseOutage,
    baseline: { ...warehouseOutage.baseline, printPaths: { primary: 'unreachable' as const, backup: 'unreachable' as const } },
  }
  const before = runDrill(scenario, scenario.rollbackSteps)
  const after = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, true))
  const printing = compareRuns(before, after).changedChecks.find(({ id }) => id === 'label-printing')
  assert.deepEqual(printing?.phases.map(({ phase }) => phase), ['Baseline', 'Rollback'])
})
