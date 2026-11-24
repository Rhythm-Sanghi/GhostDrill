/** A committed release effect with a deterministic receipt. */
export type ReleaseEffect = { key?: string; payload: string; receipt: string }

/** The outcome of attempting to commit a release effect. */
export type ReleaseResult = {
  effects: readonly ReleaseEffect[]
  receipt?: string
  kind: 'committed' | 'reused' | 'conflict'
}

/**
 * Commit a release effect immutably, deduplicating by an optional idempotency key.
 * Pure and deterministic: the same inputs produce the same outputs, with no network calls.
 */
export function commitRelease(
  effects: readonly ReleaseEffect[],
  payload: string,
  key?: string,
): ReleaseResult {
  if (key !== undefined) {
    const existing = effects.find((effect) => effect.key === key)
    if (existing) {
      if (existing.payload === payload) return { effects, receipt: existing.receipt, kind: 'reused' }
      return { effects, kind: 'conflict' }
    }
  }
  const receipt = `RELEASE-${effects.length + 1}`
  return { effects: [...effects, { key, payload, receipt }], receipt, kind: 'committed' }
}
