import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRollbackPlan, dispatchQueue, missingPrintPath, warehouseOutage } from '../src/scenario.ts'
import { recordDrill, recordedPlan, replayContingencies } from '../src/rehearsal.ts'
import { buildReplayFile, readReplayFile, replayByteLimit } from '../src/replay.ts'
import { buildRehearsalReport } from '../src/report.ts'

const prior = { number: 1, run: recordDrill(warehouseOutage, warehouseOutage.rollbackSteps, 'reachable') }
const fixedPlan = createRollbackPlan(warehouseOutage, true)
const latest = { number: 2, run: recordDrill(warehouseOutage, fixedPlan, 'reachable') }

test('replay rebuilds both ordered plans, verdicts, snapshots and contingency evidence', () => {
  const file = buildReplayFile(warehouseOutage, latest, prior, ['unreachable', 'unobserved'])
  const replay = readReplayFile(file.json)
  assert.deepEqual(replay.previous, prior)
  assert.deepEqual(replay.latest, latest)
  const cases = replayContingencies(replay.scenario, replay.latest.run, replay.contingencies)
  assert.deepEqual(cases.map(({ verdict, evidence }) => [verdict, evidence]), [
    ['Failed', 'Primary gateway cannot reach the print service.'],
    ['Unknown', 'Missing observation: reachability from the primary gateway to the print service.'],
  ])
  const report = buildRehearsalReport(warehouseOutage.title, latest, prior, cases)
  assert.match(report.markdown, /Original Run 02 verdict — \*\*Verified\*\*/)
  assert.match(report.markdown, /\*\*Failed\*\* — Primary print path stays unreachable/)
  assert.match(report.markdown, /\*\*Unknown\*\* — Primary print path is unobserved/)
})

test('import ignores advisory verdict claims and derives the original failed result', () => {
  const value = JSON.parse(buildReplayFile(warehouseOutage, prior, undefined, []).json)
  value.latest.verdict = 'Verified'
  assert.equal(readReplayFile(JSON.stringify(value)).latest.run.verdict, 'Failed')
})

test('versions, scenario, bounded input, IDs, actions and contingency values are validated', () => {
  const original = buildReplayFile(warehouseOutage, latest, prior, ['unreachable', 'unobserved']).json
  const version = JSON.parse(original)
  version.formatVersion = 3
  assert.throws(() => readReplayFile(JSON.stringify(version)), /version is unsupported/)
  const simulator = JSON.parse(original)
  simulator.simulatorVersion = 2
  assert.throws(() => readReplayFile(JSON.stringify(simulator)), /version is unsupported/)
  const scenario = JSON.parse(original)
  scenario.scenario = 'unknown'
  assert.throws(() => readReplayFile(JSON.stringify(scenario)), /unsupported scenario/)
  const action = JSON.parse(original)
  action.latest.steps[0].action = 'pause-dispatch'
  assert.throws(() => readReplayFile(JSON.stringify(action)), /does not match/)
  const step = JSON.parse(original)
  step.latest.steps[0].id = 'invalid'
  assert.throws(() => readReplayFile(JSON.stringify(step)), /unknown or duplicate step ID/)
  const duplicateStep = JSON.parse(original)
  duplicateStep.latest.steps[1] = duplicateStep.latest.steps[0]
  assert.throws(() => readReplayFile(JSON.stringify(duplicateStep)), /unknown or duplicate step ID/)
  const duplicateRun = JSON.parse(original)
  duplicateRun.previous.number = 2
  assert.throws(() => readReplayFile(JSON.stringify(duplicateRun)), /out-of-order run IDs/)
  const assumption = JSON.parse(original)
  assumption.latest.assumption = 'offline'
  assert.throws(() => readReplayFile(JSON.stringify(assumption)), /unsupported scenario assumption/)
  const contingency = JSON.parse(original)
  contingency.contingencies = ['unreachable', 'unreachable']
  assert.throws(() => readReplayFile(JSON.stringify(contingency)), /duplicate contingency/)
  assert.throws(() => readReplayFile('{'), /not readable JSON/)
  assert.throws(() => readReplayFile(' '.repeat(replayByteLimit + 1)), /16 KB limit/)
})

test('identical warehouse plans produce all three verdicts and names the assumption change', () => {
  const failed = recordDrill(warehouseOutage, fixedPlan, 'unreachable')
  const unknown = recordDrill(warehouseOutage, fixedPlan, 'unobserved')
  assert.deepEqual([latest.run.verdict, failed.verdict, unknown.verdict], ['Verified', 'Failed', 'Unknown'])
  assert.deepEqual(failed.executedRollbackStepIds, latest.run.executedRollbackStepIds)
  assert.deepEqual(unknown.executedRollbackStepIds, latest.run.executedRollbackStepIds)
  const report = buildRehearsalReport(warehouseOutage.title, { number: 3, run: failed }, latest)
  assert.match(report.markdown, /Assumption changed.*reachable after restoration → Primary print path stays unreachable/)
  const file = buildReplayFile(warehouseOutage, { number: 3, run: failed }, latest, [])
  const replay = readReplayFile(file.json)
  assert.equal(replay.previous?.run.verdict, 'Verified')
  assert.deepEqual(replay.latest.run, failed)
})

test('dispatch reorder depends on a restored connector and the missing-evidence preset replays Unknown', () => {
  const before = recordDrill(dispatchQueue, dispatchQueue.rollbackSteps, 'restored')
  const after = recordDrill(dispatchQueue, [...dispatchQueue.rollbackSteps].reverse(), 'restored')
  const offline = recordDrill(dispatchQueue, recordedPlan(dispatchQueue, after), 'offline')
  const missing = recordDrill(missingPrintPath, missingPrintPath.rollbackSteps, 'unobserved')
  assert.deepEqual([before.verdict, after.verdict, offline.verdict, missing.verdict], ['Failed', 'Verified', 'Failed', 'Unknown'])
  assert.match(offline.comparisons[0].rollback.reason, /connector was not ready/)
  const replay = buildReplayFile(dispatchQueue, { number: 2, run: after }, { number: 1, run: before }, ['offline'])
  assert.deepEqual(readReplayFile(replay.json).latest.run, after)
})
