import { acceptanceEvidenceLabels, requirementName, type AcceptanceEvidence, type AcceptanceResult, type AcceptanceRuleId } from './acceptance'
import type { RecordedDrill } from './rehearsal'
import { findRecordedStep } from './simulator'

export const acceptanceTones: Record<AcceptanceResult, string> = {
  'Meets requirements': 'good', Violation: 'bad', 'Needs evidence': 'warning', Unevaluated: 'neutral',
}
const evidenceTones = { pass: 'good', violation: 'bad', missing: 'warning' }

export function AcceptanceChecks({ run, runLabel, onInspect, onBackToComparison }: {
  run: RecordedDrill
  runLabel: string
  onInspect: (id: AcceptanceRuleId, finding: AcceptanceEvidence) => void
  onBackToComparison?: () => void
}) {
  return (
    <section className="proof-group" aria-labelledby="acceptance-heading">
      <h3 className="eyebrow" id="acceptance-heading" tabIndex={-1}>Acceptance checks</h3>
      <p className="proof-run-label">{runLabel} · {run.acceptance?.result ?? 'Unevaluated'}</p>
      {onBackToComparison && <button type="button" className="step-link" onClick={onBackToComparison}>Back to comparison</button>}
      <p className="acceptance-scope">Results apply to this simulated run and its selected requirements.</p>
      {!run.acceptance && <p className="acceptance-scope">This replay has no recorded acceptance evaluation. Rerun to evaluate your selection.</p>}
      {run.acceptance?.checks.length === 0 && <p className="acceptance-scope">No requirements were selected for this run.</p>}
      {run.acceptance?.checks.map(({ id, evidence }) => (
        <article className="proof-check" key={id} aria-label={requirementName(id)}>
          <h4>{requirementName(id)}</h4>
          {evidence.map((finding, index) => {
            const source = finding.stepId && findRecordedStep(run, finding.stepId)
            const attempt = finding.stepNumber ? `Step ${finding.stepNumber} · ` : ''
            return (
              <div className="proof-result" key={finding.stepId ?? index}>
                <strong className={evidenceTones[finding.status]}>{acceptanceEvidenceLabels[finding.status]}</strong>
                <p>{finding.observed}</p>
                <p>{finding.reason}</p>
                {source && <button className="step-link" type="button" onClick={() => onInspect(id, finding)}
                  aria-label={`Inspect ${attempt}${source.title} · ${requirementName(id)} · ${runLabel}`}>
                  {attempt}{source.title}
                </button>}
              </div>
            )
          })}
        </article>
      ))}
    </section>
  )
}
