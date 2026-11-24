# Dispatch prerequisite requirements

## 1. Scope

This rule evaluates the `connector-before-reopen` acceptance requirement for the **Dispatch Queue Rollback** and **Dispatch Acceptance Review** fixtures. It checks that the shipping connector was ready before every attempt to reopen the dispatch queue. The check reads recorded snapshots only. It does not read the run's final state, and it makes no network calls.

## 2. Per-attempt evidence

For every snapshot whose `actionType` is `reopen-dispatch`, Ghost Drill shall emit one `AcceptanceEvidence` finding that:

- reads the dispatch connector state from the **immediately preceding snapshot**, not the final snapshot;
- links to the exact executed attempt by setting `stepId` to that snapshot's `id`;
- sets `stepNumber` to the attempt's **1-based rollback step number**, its position among the executed rollback step identifiers.

The finding status shall be:

- **pass** when the preceding snapshot's connector was ready;
- **violation** when the preceding snapshot's connector was offline;
- **missing** when no connector state was recorded before the attempt.

## 3. No attempts

When no `reopen-dispatch` snapshot exists, Ghost Drill shall return a single **missing** finding that explains why no prerequisite could be evaluated, with no `stepId` or `stepNumber`.

## 4. Independence from the run verdict

A run may report **Verified** even when an early reopen attempt fails the prerequisite, because the verdict compares baseline and final required checks while the prerequisite judges each attempt at the point it executed. A retry attempt, using the same `reopen-dispatch` action type and its own snapshot `id`, shall be evaluated independently and may pass after a `restore-connector` step.

## 5. Test contract

The test shall exercise the **Dispatch Acceptance Review** fixture with its rollback plan in order: reopen, restore connector, retry reopen. The run verdict shall be **Verified**, the first prerequisite finding shall be a **violation** linked to `reopen-dispatch` at rollback step 1, and the retry finding shall be a **pass** linked to `retry-reopen-dispatch` at rollback step 3.
