# Restart-release requirements

## 1. Scope

This feature models a release commit boundary for the browser-only Ghost Drill simulator. It records release effects locally, with no network calls, and deduplicates commits by an optional idempotency key so a lost acknowledgement can be retried safely. The function is pure and deterministic: the same inputs always produce the same outputs.

## 2. Release effect and receipt

A `ReleaseEffect` is a committed record with an optional `key`, a `payload`, and a deterministic `receipt` of the form `RELEASE-N`, where `N` is the 1-based position of the effect in the committed list (`effects.length + 1`). The commit function SHALL NOT mutate the input effect list.

## 3. Commit outcomes

`commitRelease(effects, payload, key?)` SHALL return one of three outcomes:

1. **committed** — WHEN no effect with the given key exists, or the key is undefined, THE function SHALL append a new effect immutably and return the new effect list with the new `RELEASE-N` receipt.
2. **reused** — WHEN an effect with the same defined key and the same payload already exists, THE function SHALL return that effect's original receipt and the unchanged effect list.
3. **conflict** — WHEN an effect with the same defined key already exists but its payload differs, THE function SHALL return `conflict` with no receipt and the unchanged effect list.

## 4. Undefined key

WHEN the key is undefined, THE function SHALL commit a new effect on every call, regardless of prior effects, so a non-idempotent release is always recorded.

## 5. Test contract

The tests SHALL exercise:

- a lost-acknowledgement retry that reuses the original receipt and leaves the effect list unchanged;
- the same key with a different payload reporting a conflict and leaving the effect list unchanged;
- an undefined key that commits every time with a monotonically increasing `RELEASE-N` receipt and without mutating prior effects.
