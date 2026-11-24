import { Activity } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CheckId, Phase } from './scenario'
import { checkNames, checkStatusLabels, evidenceSource, getCheck, type CheckResult, type DrillRun, type Snapshot, type Verdict } from './simulator'
import type { ResolvedRunComparison, RunRef } from './comparison'

const resultTones = { healthy: 'good', unhealthy: 'bad', unknown: 'warning' }
const verdictTones: Record<Verdict, string> = { Verified: 'good', Failed: 'bad', Unknown: 'warning' }

export function Evidence({ snapshot, requiredChecks, runs, runLabels, comparison, selectedRunRef, onSelectSnapshot, reportAction, assumptionChange }: {
  snapshot: Snapshot
  requiredChecks: readonly CheckId[]
  runs: Record<RunRef, DrillRun | null>
  runLabels: Record<RunRef, string>
  comparison: ResolvedRunComparison | null
  selectedRunRef: RunRef
  onSelectSnapshot: (id: string, runRef: RunRef, fromComparison: boolean) => void
  reportAction: ReactNode
  assumptionChange?: { previous: string; latest: string }
}) {
  const run = runs[selectedRunRef]
  const runLabel = runLabels[selectedRunRef]
  const firstFailure = run?.firstFailure
  const showSnapshot = !run || selectedRunRef === 'prior' || snapshot.id !== run.finalSnapshot.id
  const outageObserved = run && firstFailure
    && run.snapshots.indexOf(firstFailure) <= run.snapshots.indexOf(snapshot)

  function renderResult(id: CheckId, phase: Phase, result: CheckResult, runRef: RunRef, side?: 'Before' | 'After') {
    const { status } = result
    const label = side ? `${side} · ${phase}` : phase
    const actionLabel = result.status === 'unhealthy' && phase === 'Rollback'
      && (id === 'label-printing' || id === 'dispatch-queue') ? 'Inspect responsible step' : 'View step'
    const source = evidenceSource(runs[runRef], result)
    return (
      <div className="proof-result" role="group" aria-label={label}>
        <div className="proof-status"><span>{label}</span><strong className={resultTones[status]}>{checkStatusLabels[status]}</strong></div>
        <p>{result.reason}</p>
        {source && (
          <button type="button" className="step-link" onClick={() => onSelectSnapshot(source.id, runRef, Boolean(side))}
            aria-label={`${actionLabel} for ${checkNames[id]} · ${label} · ${runLabels[runRef]}`}>
            {actionLabel}
          </button>
        )}
      </div>
    )
  }

  return (
    <section className="panel evidence" aria-labelledby="evidence-heading">
      <header className="panel-header"><h2 id="evidence-heading"><Activity size={17} /> Evidence</h2></header>
      <div className="evidence-body">
        {showSnapshot && (
          <section className="proof-group" aria-label="Selected snapshot" aria-live="polite">
            <h3 className="eyebrow">Selected snapshot</h3>
            {run && <p className="proof-run-label">{runLabel}</p>}
            {requiredChecks.map((id) => (
              <article className="proof-check" aria-label={checkNames[id]} key={id}>
                <h4>{checkNames[id]}</h4>
                {renderResult(id, snapshot.phase, getCheck(snapshot, id), selectedRunRef)}
              </article>
            ))}
          </section>
        )}
        {outageObserved && <p className="first-outage">First outage <strong>{firstFailure.phase} · {firstFailure.title}</strong></p>}
        {run && (
          <section className="proof-group" aria-labelledby="rollback-proof-heading">
            <h3 className="eyebrow" id="rollback-proof-heading" tabIndex={-1}>Rollback proof</h3>
            <p className="proof-run-label">{runLabel}</p>
            {run.comparisons.length === 0 && <p>No required checks are configured.</p>}
            {run.comparisons.map(({ id, baseline, rollback }) => (
              <article className="proof-check" aria-label={checkNames[id]} key={id}>
                <h4>{checkNames[id]}</h4>
                {renderResult(id, 'Baseline', baseline, selectedRunRef)}
                {renderResult(id, 'Rollback', rollback, selectedRunRef)}
              </article>
            ))}
          </section>
        )}
        {comparison && (
          <section className="proof-group" aria-labelledby="run-comparison-heading">
            <h3 className="eyebrow" id="run-comparison-heading" tabIndex={-1}>Run comparison</h3>
            <p className="comparison-verdict">
              Verdict{' '}
              <strong className={verdictTones[comparison.priorVerdict]}>{comparison.priorVerdict}</strong>
              {' \u2192 '}
              <strong className={verdictTones[comparison.currentVerdict]}>{comparison.currentVerdict}</strong>
            </p>
            {reportAction}
            {assumptionChange && (
              <div className="comparison-diff comparison-order">
                <h4 className="eyebrow">Assumption changed</h4>
                <p>Previous run · {assumptionChange.previous}</p>
                <p>Latest run · {assumptionChange.latest}</p>
              </div>
            )}
            {comparison.priorVerdict === comparison.currentVerdict &&
              <p className="comparison-note">The final verdict stayed {comparison.currentVerdict}.</p>}
            {!comparison.changedChecks.length &&
              <p className="comparison-note">Required check results stayed the same in Baseline and Rollback.</p>}
            {comparison.addedSteps.length > 0 && (
              <div className="comparison-diff">
                <span className="eyebrow">Added steps</span>
                <ul>{comparison.addedSteps.map((step) => <li key={step.id}>{step.title}</li>)}</ul>
              </div>
            )}
            {comparison.removedSteps.length > 0 && (
              <div className="comparison-diff">
                <span className="eyebrow">Removed steps</span>
                <ul>{comparison.removedSteps.map((step) => <li key={step.id}>{step.title}</li>)}</ul>
              </div>
            )}
            {comparison.reorderedSteps && (
              <div className="comparison-diff comparison-order">
                <h4 className="eyebrow">Rollback order changed</h4>
                <div><span>Previous order</span>
                  <ol>{comparison.reorderedSteps.before.map((step) => <li key={step.id}>{step.title}</li>)}</ol>
                </div>
                <div><span>Latest order</span>
                  <ol>{comparison.reorderedSteps.after.map((step) => <li key={step.id}>{step.title}</li>)}</ol>
                </div>
              </div>
            )}
            {comparison.changedChecks.map(({ id, phases }) => (
              <article className="proof-check" aria-label={checkNames[id]} key={id}>
                <h4>{checkNames[id]}</h4>
                {phases.map(({ phase, before, after }) => (
                  <div className="comparison-phase" key={phase}>
                    {renderResult(id, phase, before, 'prior', 'Before')}
                    {renderResult(id, phase, after, 'current', 'After')}
                  </div>
                ))}
              </article>
            ))}
          </section>
        )}
      </div>
    </section>
  )
}
