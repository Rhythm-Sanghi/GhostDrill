import { evaluateDispatchPrerequisite } from './dispatchPrerequisite.ts'
import type { DrillScenario } from './scenario.ts'
import { getCheck, type DrillRun } from './simulator.ts'

export interface AcceptanceEvidence {
  status: 'pass' | 'violation' | 'missing'
  observed: string
  reason: string
  stepId?: string
  stepNumber?: number
}

type ServiceKind = DrillScenario['baseline']['kind']

const rules = {
  'final-printing': {
    name: 'Labels print after rollback',
    kind: 'warehouse',
    evaluate: (run: DrillRun) => [finalCheck(run, 'label-printing')],
  },
  'primary-endpoint': {
    name: 'Queue targets the primary gateway',
    kind: 'warehouse',
    evaluate: (run: DrillRun) => [finalCheck(run, 'queue-endpoint')],
  },
  'primary-path-observed': {
    name: 'Restored primary print path was observed',
    kind: 'warehouse',
    evaluate: (run: DrillRun): AcceptanceEvidence[] => {
      const restore = [...run.snapshots].reverse().find((snapshot) => snapshot.phase === 'Rollback' && snapshot.actionType === 'set-print-path')
      if (!restore || restore.state.kind !== 'warehouse') {
        return [{ status: 'missing', observed: 'No print path restoration was executed.', reason: 'A post-restoration reachability observation is required.' }]
      }
      const path = restore.state.printPaths.primary
      return [{
        status: path === 'unobserved' ? 'missing' : 'pass',
        observed: `Primary print path · ${path}`,
        reason: path === 'unobserved' ? 'Missing observation of reachability from the primary gateway to the print service.'
          : 'A reachability result was recorded after the primary path restoration.',
        stepId: path === 'unobserved' ? undefined : restore.id,
      }]
    },
  },
  'connector-before-reopen': {
    name: 'Connector ready before every reopen attempt',
    kind: 'dispatch',
    evaluate: evaluateDispatchPrerequisite,
  },
} satisfies Record<string, { name: string; kind: ServiceKind; evaluate: (run: DrillRun) => AcceptanceEvidence[] }>

export type AcceptanceRuleId = keyof typeof rules
export type AcceptanceResult = 'Meets requirements' | 'Violation' | 'Needs evidence' | 'Unevaluated'

const ruleIds = Object.keys(rules) as AcceptanceRuleId[]
const finalStatuses = { healthy: 'pass', unhealthy: 'violation', unknown: 'missing' } as const

function finalCheck(run: DrillRun, id: 'label-printing' | 'queue-endpoint'): AcceptanceEvidence {
  const check = getCheck(run.finalSnapshot, id)
  return {
    status: finalStatuses[check.status],
    observed: id === 'label-printing' ? `Label printing · ${check.status}` : `Queue endpoint · ${check.status}`,
    reason: check.reason,
    stepId: 'stepId' in check ? check.stepId : undefined,
  }
}

export const acceptanceEvidenceLabels = { pass: 'Pass', violation: 'Violation', missing: 'Needs evidence' } as const

export function acceptanceRules(scenario: DrillScenario) {
  return ruleIds.filter((id) => rules[id].kind === scenario.baseline.kind)
}

export function requirementName(id: AcceptanceRuleId) {
  return rules[id].name
}

export function sameRequirements(before: readonly AcceptanceRuleId[] | null, after: readonly AcceptanceRuleId[] | null) {
  if (!before || !after) return before === after
  return before.length === after.length && before.every((id) => after.includes(id))
}

export function evaluateAcceptance(run: DrillRun, selected: readonly AcceptanceRuleId[]) {
  const checks = selected.map((id) => ({ id, evidence: rules[id].evaluate(run) }))
  const evidence = checks.flatMap((check) => check.evidence)
  const result: Exclude<AcceptanceResult, 'Unevaluated'> = evidence.some((finding) => finding.status === 'violation')
    ? 'Violation'
    : evidence.length > 0 && evidence.every((finding) => finding.status === 'pass')
      ? 'Meets requirements'
      : 'Needs evidence'
  return { result, checks }
}

export type AcceptanceReview = ReturnType<typeof evaluateAcceptance>

export function compareAcceptance(before: AcceptanceReview | null, after: AcceptanceReview | null) {
  const previous = before?.checks.map(({ id }) => id) ?? null
  const latest = after?.checks.map(({ id }) => id) ?? null
  const describe = (ids: readonly AcceptanceRuleId[] | null) =>
    ids ? ids.map(requirementName).join(', ') || 'None selected' : 'Unevaluated'
  return {
    before: before?.result ?? 'Unevaluated',
    after: after?.result ?? 'Unevaluated',
    selectionChange: sameRequirements(previous, latest) ? undefined : { previous: describe(previous), latest: describe(latest) },
  }
}
