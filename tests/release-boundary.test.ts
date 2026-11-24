import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitRelease } from '../src/releaseBoundary.ts'

test('a lost-acknowledgement retry with the same key reuses the original receipt and leaves effects unchanged', () => {
  const first = commitRelease([], 'deploy 1.2.3', 'release-xyz')
  assert.equal(first.kind, 'committed')
  assert.equal(first.receipt, 'RELEASE-1')
  assert.deepEqual(first.effects, [{ key: 'release-xyz', payload: 'deploy 1.2.3', receipt: 'RELEASE-1' }])

  const retry = commitRelease(first.effects, 'deploy 1.2.3', 'release-xyz')
  assert.equal(retry.kind, 'reused')
  assert.equal(retry.receipt, 'RELEASE-1')
  assert.equal(retry.effects, first.effects)
})

test('the same key with a different payload reports a conflict and leaves effects unchanged', () => {
  const first = commitRelease([], 'deploy 1.2.3', 'release-xyz')
  const conflict = commitRelease(first.effects, 'deploy 1.2.4', 'release-xyz')
  assert.equal(conflict.kind, 'conflict')
  assert.equal(conflict.receipt, undefined)
  assert.equal(conflict.effects, first.effects)
  assert.equal(first.effects.length, 1)
})

test('an undefined key commits every time with a monotonically increasing receipt', () => {
  const first = commitRelease([], 'deploy 1.2.3')
  assert.equal(first.kind, 'committed')
  assert.equal(first.receipt, 'RELEASE-1')

  const second = commitRelease(first.effects, 'deploy 1.2.4')
  assert.equal(second.kind, 'committed')
  assert.equal(second.receipt, 'RELEASE-2')
  assert.deepEqual(second.effects, [
    { key: undefined, payload: 'deploy 1.2.3', receipt: 'RELEASE-1' },
    { key: undefined, payload: 'deploy 1.2.4', receipt: 'RELEASE-2' },
  ])
  assert.equal(first.effects.length, 1)
})
