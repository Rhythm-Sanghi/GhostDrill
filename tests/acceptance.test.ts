import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptanceRules, compareAcceptance, evaluateAcceptance } from '../src/acceptance.ts'
import { recordDrill } from '../src/rehearsal.ts'
import { buildReplayFile, nextRunNumber, readReplayFile, sampleReviewJson } from '../src/replay.ts'
import { buildRehearsalReport } from '../src/report.ts'
import { createRollbackPlan, dispatchQueue, dispatchReview, missingPrintPath, warehouseOutage } from '../src/scenario.ts'

test('the sample stays Verified after correcting the order but acceptance changes from Violation to Meets requirements', () => {
  const sample = readReplayFile(sampleReviewJson)
  const before = sample.latest.run
  const [reopen, restore, retry] = dispatchReview.rollbackSteps
  const after = recordDrill(dispatchReview, [restore, reopen, retry], 'restored', acceptanceRules(dispatchReview))
  assert.deepEqual([before.verdict, after.verdict], ['Verified', 'Verified'])
  assert.deepEqual(compareAcceptance(before.acceptance, after.acceptance), {
    before: 'Violation', after: 'Meets requirements', selectionChange: undefined,
  })
  assert.deepEqual(before.acceptance?.checks[0].evidence.map(({ stepId, stepNumber, status }) => [stepId, stepNumber, status]), [
    ['reopen-dispatch', 1, 'violation'], ['retry-reopen-dispatch', 3, 'pass'],
  ])
  const latest = { number: 2, run: after }
  assert.deepEqual(readReplayFile(buildReplayFile(dispatchReview, latest, sample.latest, []).json).latest, latest)
  const report = buildRehearsalReport(dispatchReview.title, latest, sample.latest).markdown
  assert.match(report, /Verified → Verified/)
  assert.match(report, /Violation → Meets requirements/)
  assert.match(report, /Step 1 · Reopen dispatch queue/)
  assert.match(report, /Step 3 · Retry reopening dispatch queue/)
})

test('observed unreachable and unobserved are distinct, and a violation outranks missing evidence', () => {
  const required = acceptanceRules(warehouseOutage)
  const fixed = createRollbackPlan(warehouseOutage, true)
  const unreachable = recordDrill(warehouseOutage, fixed, 'unreachable', required)
  const unobserved = recordDrill(warehouseOutage, fixed, 'unobserved', required)
  assert.deepEqual([unreachable.verdict, unreachable.acceptance?.result, unobserved.verdict, unobserved.acceptance?.result],
    ['Failed', 'Violation', 'Unknown', 'Needs evidence'])
  assert.deepEqual([unreachable.acceptance?.checks[2].evidence[0].status, unobserved.acceptance?.checks[2].evidence[0].status],
    ['pass', 'missing'])
  const both = recordDrill(warehouseOutage, warehouseOutage.rollbackSteps, 'unobserved', required)
  assert.equal(both.acceptance?.result, 'Violation')
  assert.deepEqual(both.acceptance?.checks.map(({ evidence }) => evidence[0].status), ['violation', 'violation', 'missing'])
})

test('no selected requirements and a required action without attempts both need evidence', () => {
  const restored = recordDrill(dispatchQueue, [dispatchQueue.rollbackSteps[1]], 'restored', acceptanceRules(dispatchQueue))
  assert.equal(restored.acceptance?.result, 'Needs evidence')
  assert.match(restored.acceptance?.checks[0].evidence[0].observed ?? '', /no .*reopen/i)
  assert.equal(evaluateAcceptance(restored, []).result, 'Needs evidence')
})

test('version 1 plans still import unevaluated for all original templates', () => {
  for (const [scenario, assumption, verdict] of [
    [warehouseOutage, 'reachable', 'Failed'],
    [dispatchQueue, 'restored', 'Failed'],
    [missingPrintPath, 'unobserved', 'Unknown'],
  ] as const) {
    const file = {
      format: 'ghost-drill-replay', formatVersion: 1, simulatorVersion: 1,
      scenario: scenario.id, contingencies: [],
      latest: { number: 1, assumption, steps: scenario.rollbackSteps.map(({ id, action }) => ({ id, action: action.type })) },
    }
    const replay = readReplayFile(JSON.stringify(file))
    assert.equal(replay.latest.run.verdict, verdict)
    assert.equal(replay.latest.run.acceptance, null)
  }
})

test('replays reject missing, duplicate and unknown selections and ignore asserted verdicts', () => {
  const sample = JSON.parse(sampleReviewJson)
  sample.latest.verdict = 'Failed'
  sample.latest.acceptanceResult = 'Meets requirements'
  const rebuilt = readReplayFile(JSON.stringify(sample)).latest.run
  assert.equal(rebuilt.verdict, 'Verified')
  assert.equal(rebuilt.acceptance?.result, 'Violation')
  for (const checks of [undefined, ['connector-before-reopen', 'connector-before-reopen'], ['final-printing']]) {
    sample.latest.acceptanceChecks = checks
    assert.throws(() => readReplayFile(JSON.stringify(sample)), /acceptance check/)
  }
})

test('the largest safe run IDs can rerun and export again without overflow', () => {
  const sample = JSON.parse(sampleReviewJson)
  for (const number of [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]) {
    sample.latest.number = number
    const original = readReplayFile(JSON.stringify(sample)).latest
    const next = nextRunNumber(original.number)
    assert.equal(next, number === Number.MAX_SAFE_INTEGER ? 2 : Number.MAX_SAFE_INTEGER)
    const file = buildReplayFile(dispatchReview, { number: next, run: original.run }, { number: next - 1, run: original.run }, [])
    const replay = readReplayFile(file.json)
    assert.equal(replay.latest.number, next)
    assert.equal(replay.previous?.number, next - 1)
  }
  sample.latest.number = Number.MAX_SAFE_INTEGER + 1
  assert.throws(() => readReplayFile(JSON.stringify(sample)), /invalid completed run ID/)
})
