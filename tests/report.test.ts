import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRehearsalReport } from '../src/report.ts'
import { createRollbackPlan, dispatchQueue, missingPrintPath, warehouseOutage } from '../src/scenario.ts'
import { runDrill } from '../src/simulator.ts'

test('the warehouse report records the failed run, endpoint repair, and phase evidence', () => {
  const first = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, false))
  const repaired = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, true))
  const previous = { number: 1, run: first }
  const initial = buildRehearsalReport(warehouseOutage.title, previous)
  const { filename, markdown } = buildRehearsalReport(warehouseOutage.title, { number: 2, run: repaired }, previous)

  assert.match(initial.markdown, /Verification verdict\*\* — Failed/)
  assert.match(initial.markdown, /Failed in Rollback/)
  assert.doesNotMatch(initial.markdown, /Run comparison|Restore label queue endpoint/)
  assert.equal(filename, 'ghost-drill-warehouse-outage-rehearsal-run-02.md')
  assert.match(markdown, /Scenario\*\* — Warehouse Label Outage/)
  assert.match(markdown, /uses synthetic data\. Its verdict applies only to the modeled checks\./)
  assert.match(markdown, /Runbook execution\*\* — Rollback completed/)
  assert.match(markdown, /Previous completed run\*\* — Run 01 · Failed/)
  assert.match(markdown, /Verdict transition\*\* — Failed → Verified/)
  assert.match(markdown, /Added — Restore label queue endpoint/)
  assert.match(markdown, /Baseline — \*\*Healthy\*\*\. Primary gateway can reach the print service\. Recorded source step — Capture starting state\./)
  assert.match(markdown, /Label printing · Rollback\n\n- Before — \*\*Unhealthy\*\*\. Backup gateway cannot reach the print service\. Recorded source step — Switch queue to backup\./)
  assert.match(markdown, /After — \*\*Healthy\*\*\. Primary gateway can reach the print service\. Recorded source step — Restore label queue endpoint\./)
  assert.match(markdown, /#### Queue endpoint/)
  assert.doesNotMatch(markdown, /https?:|blob:|\]\(/)
})

test('the dispatch report preserves both orders and the first reopen prerequisite', () => {
  const first = runDrill(dispatchQueue, dispatchQueue.rollbackSteps)
  const second = runDrill(dispatchQueue, [...dispatchQueue.rollbackSteps].reverse())
  const { markdown } = buildRehearsalReport(dispatchQueue.title, { number: 2, run: second }, { number: 1, run: first })
  assert.match(markdown, /Previous rollback order · Run 01\n\n1\. Reopen dispatch queue\n2\. Restore shipping connector/)
  assert.match(markdown, /Latest rollback order · Run 02\n\n1\. Restore shipping connector\n2\. Reopen dispatch queue/)
  assert.match(markdown, /No rollback actions were added or removed/)
  assert.match(markdown, /Before — \*\*Unhealthy\*\*\. The queue stayed paused because the shipping connector was not ready when reopening was attempted\. Recorded source step — Reopen dispatch queue\./)
})

test('the unknown report names the missing observation and has no source for that evidence', () => {
  const run = runDrill(missingPrintPath, missingPrintPath.rollbackSteps)
  const { markdown } = buildRehearsalReport(missingPrintPath.title, { number: 2, run }, { number: 1, run })
  assert.match(markdown, /Verification verdict\*\* — Unknown/)
  assert.match(markdown, /Verdict transition\*\* — Unknown → Unknown/)
  const printing = markdown.split('\n').find((line) => line.includes('Rollback — **Unknown**'))
  assert.equal(printing, '- Rollback — **Unknown**. Missing observation: reachability from the primary gateway to the print service.')
  assert.doesNotMatch(markdown, /Verified|Service recovered|approved/i)
})

test('removed actions are named and an unavailable source step is omitted', () => {
  const first = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, true))
  const second = runDrill(warehouseOutage, createRollbackPlan(warehouseOutage, false))
  const withoutSource = { ...second, snapshots: second.snapshots.filter(({ id }) => id !== 'switch-queue') }
  const { markdown } = buildRehearsalReport(warehouseOutage.title, { number: 2, run: withoutSource }, { number: 1, run: first })
  assert.match(markdown, /Removed — Restore label queue endpoint/)
  assert.match(markdown, /After — \*\*Unhealthy\*\*\. Backup gateway cannot reach the print service\.\n/)
  assert.doesNotMatch(markdown, /Recorded source step — Switch queue to backup/)
})
