import assert from 'node:assert/strict'
import { test } from 'node:test'
import { executeRestart, exploreRestart, type RestartCase } from '../src/restartEngine.ts'
import { defaultRevision, type Boundary, type Observation } from '../src/restartModel.ts'
import {
  buildRestartReplay, compareRestart, evaluateRestartReplay, readRestartReplay, restartMarkdown, revisionFingerprint,
} from '../src/restartReplay.ts'

const original = defaultRevision('shipping-release')
const repaired = { ...original, releasePolicy: 'stable-key' as const }

function interrupted(boundary: Boundary, observation: Observation = 'standard'): RestartCase {
  return { id: `${boundary}/${observation}/checkpoint`, boundary, observation, restart: 'checkpoint' }
}

test('the shipping plan runs cleanly before any interruption or after a saved receipt', () => {
  const clean = executeRestart('shipping-release', original, { id: 'uninterrupted', observation: 'standard' })
  const before = executeRestart('shipping-release', original, interrupted('before-effect'))
  const saved = executeRestart('shipping-release', original, interrupted('after-checkpoint'))
  for (const run of [clean, before, saved]) assert.deepEqual([run.status, run.releases, run.serviceRecovered], ['Pass', 1, true])
  const restart = saved.trace.find(({ title }) => title === 'Restart')
  assert.equal(restart?.receipt, 'RELEASE-1')
  assert.match(restart?.detail ?? '', /Verify shipping recovery/)
})

test('an interrupted committed release survives and a retry with a stable key reuses its receipt', () => {
  const broken = executeRestart('shipping-release', original, interrupted('after-commit'))
  const fixed = executeRestart('shipping-release', repaired, interrupted('after-commit'))
  assert.equal(broken.status, 'Violation')
  assert.equal(broken.trace.find(({ title }) => title === 'Restart')?.releases, 1)
  assert.equal(broken.trace[broken.firstFailure!.event! - 1].title, 'Duplicate release committed')
  assert.equal(fixed.status, 'Pass')
  assert.equal(fixed.releases, 1)
  assert(fixed.trace.some(({ title }) => title === 'Acknowledgement lost'))
  assert(fixed.trace.some(({ title, detail }) => title === 'Original receipt reused' && detail.includes('RELEASE-1')))
  assert.equal(fixed.trace.at(-1)?.receipt, 'RELEASE-1')
})

test('conflict, no release, missing evidence, and incomplete search have distinct results', () => {
  const conflict = executeRestart('shipping-release', repaired, interrupted('after-commit', 'changed-payload'))
  assert.deepEqual([conflict.status, conflict.releases], ['Violation', 1])
  assert.equal(conflict.trace[conflict.firstFailure!.event! - 1].title, 'Payload conflict')
  const absent = exploreRestart('shipping-release', { ...original, actions: ['restore-printing', 'verify-recovery'] })
  assert.equal(absent.results[0].findings.find(({ id }) => id === 'at-most-once')?.status, 'Pass')
  assert.equal(absent.results[0].findings.find(({ id }) => id === 'recover-once')?.status, 'Violation')
  const unavailable = executeRestart('shipping-release', repaired, interrupted('after-commit', 'receipt-unavailable'))
  assert.deepEqual([unavailable.status, unavailable.releases], ['Needs evidence', 1])
  const both = executeRestart('shipping-release', original, interrupted('after-commit', 'receipt-unavailable'))
  assert.equal(both.status, 'Violation')
  assert(both.findings.some(({ status }) => status === 'Needs evidence'))
  const partial = exploreRestart('shipping-release', { ...repaired, limit: 1 })
  assert.deepEqual([partial.outcome, partial.complete, partial.results.length, partial.total], ['Inconclusive', false, 1, 9])
})

test('same-case comparison counts confirmed repairs and keeps dropped cases visible', () => {
  const before = exploreRestart('shipping-release', original)
  const after = exploreRestart('shipping-release', repaired)
  assert.equal(before.counterexample?.testCase.id, 'after-commit/standard/checkpoint')
  assert.deepEqual(before.results.map(({ testCase }) => testCase.id), after.results.map(({ testCase }) => testCase.id))
  assert.deepEqual([before.counts.Pass, before.counts.Violation, after.counts.Pass], [4, 5, 9])
  assert.deepEqual(compareRestart(original, repaired, before, after), {
    changed: [], matched: 9, notRepeated: 0, newCases: 0, fixed: 5, remaining: 0, introduced: 0, inconclusive: 0,
  })
  const reduced = { ...repaired, limit: 2 }
  const difference = compareRestart(original, reduced, before, exploreRestart('shipping-release', reduced))
  assert.deepEqual([difference.changed, difference.notRepeated, difference.fixed], [['limit'], 7, 0])
})

test('the same restart engine finds a skipped required verification and an order repair', () => {
  const routing = defaultRevision('routing-verification')
  const revised = { ...routing, actions: ['restore-routing', 'verify-routing', 'save-progress'] as const }
  const before = exploreRestart('routing-verification', routing)
  const after = exploreRestart('routing-verification', revised)
  const failure = before.counterexample!
  assert.equal(failure.serviceRecovered, true)
  assert.equal(failure.trace[failure.firstFailure!.event! - 1].title, 'Required verification skipped')
  assert.deepEqual([before.counts.Violation, after.counts.Pass], [1, 3])
})

test('v3 replay rebuilds evidence and retains a disposition for its original fingerprint', () => {
  const scenario = 'shipping-release'
  const review = { fingerprint: revisionFingerprint(scenario, original), disposition: 'Request changes' as const, note: 'Check the duplicate.' }
  const packet = { scenario, original, revised: repaired, review } as const
  const file = buildRestartReplay(packet)
  const imported = readRestartReplay(file.json)
  assert.deepEqual(imported, packet)
  assert.deepEqual(evaluateRestartReplay(imported), evaluateRestartReplay(packet))
  const report = restartMarkdown(imported, evaluateRestartReplay(imported))
  assert.match(report, /Duplicate release committed/)
  assert.match(report, /5 fixed/)
  assert.match(report, /Earlier revision/)
  assert.notEqual(review.fingerprint, revisionFingerprint(scenario, { ...original, limit: 2 }))
  const untrusted = JSON.parse(file.json)
  untrusted.findings = { outcome: 'Pass' }
  assert.equal(evaluateRestartReplay(readRestartReplay(JSON.stringify(untrusted))).before.outcome, 'Violation')
  for (const edit of [
    { formatVersion: 4 },
    { modelVersion: 2 },
    { scenario: 'unsupported' },
    { original: { ...original, actions: ['release-batch', 'release-batch'] } },
    { original: { ...original, requirements: ['verify-routing'] } },
    { original: { ...original, limit: 26 } },
    { review: { ...review, fingerprint: 'invalid' } },
  ]) assert.throws(() => readRestartReplay(JSON.stringify({ ...untrusted, ...edit })))
  assert.throws(() => readRestartReplay(' '.repeat(16 * 1024 + 1)), /16 KB/)
})
