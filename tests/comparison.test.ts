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
  assert.ok(printing && queue)
  assert.equal(printing.before.status, "unhealthy")
  assert.equal((printing.before as { stepId: string }).stepId, "switch-queue")
  assert.equal(printing.after.status, "healthy")
  assert.equal((printing.after as { stepId: string }).stepId, "restore-queue")
  assert.equal(queue.before.status, "unhealthy")
  assert.equal((queue.before as { stepId: string }).stepId, "switch-queue")
  assert.equal(queue.after.status, "healthy")
  assert.equal((queue.after as { stepId: string }).stepId, "restore-queue")
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
  const result = compareRuns(run, run)
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
    baseline: { queueEndpoint: "primary", printPaths: { primary, backup } },
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

test("Feature: compare-rollback-runs, Property 3: changed checks pair prior rollback with current rollback", () => {
  const rand = mulberry32(20260424)
  for (let i = 0; i < iterations; i++) {
    const { prev, current } = generateRunPair(rand)
    const result = compareRuns(prev, current)
    const reference: ChangedCheck[] = []
    for (const cmp of current.comparisons) {
      const prevCmp = prev.comparisons.find((check) => check.id === cmp.id)
      if (!prevCmp) continue
      if (cmp.baseline.status !== prevCmp.baseline.status || cmp.rollback.status !== prevCmp.rollback.status) {
        reference.push({ id: cmp.id, before: prevCmp.rollback, after: cmp.rollback })
      }
    }
    assert.deepEqual(result.changedChecks, reference, `changed checks run ${i}`)
    for (const changed of result.changedChecks) {
      const prevCmp = prev.comparisons.find((check) => check.id === changed.id)
      const curCmp = current.comparisons.find((check) => check.id === changed.id)
      assert.ok(prevCmp && curCmp)
      assert.deepEqual(changed.before, prevCmp.rollback, `before run ${i} check ${changed.id}`)
      assert.deepEqual(changed.after, curCmp.rollback, `after run ${i} check ${changed.id}`)
    }
  }
})

test("Feature: compare-rollback-runs, Property 4: identical detection and self-comparison idempotence", () => {
  const rand = mulberry32(20260425)
  for (let i = 0; i < iterations; i++) {
    const { prev, current } = generateRunPair(rand)
    const result = compareRuns(prev, current)
    const expectedIdentical =
      result.addedStepIds.length === 0 && result.removedStepIds.length === 0 && result.changedChecks.length === 0
    assert.equal(result.identical, expectedIdentical, `identical run ${i}`)
    assert.equal(compareRuns(prev, prev).identical, true, `prev self run ${i}`)
    assert.equal(compareRuns(current, current).identical, true, `current self run ${i}`)
  }
})
