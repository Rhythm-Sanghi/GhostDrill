import { Activity } from 'lucide-react'
import type { CheckId } from './scenario'
import { checkNames, type DrillRun, type Snapshot, type Verdict } from './simulator'
import type { ResolvedRunComparison, RunRef } from './comparison'

const resultLabels = {
  healthy: { text: 'Healthy', tone: 'good' },
  unhealthy: { text: 'Unhealthy', tone: 'bad' },
  unknown: { text: 'Unknown', tone: 'warning' },
}
const verdictTones: Record<Verdict, string> = { Verified: 'good', Failed: 'bad', Unknown: 'warning' }

type CheckResult = Snapshot['checks'][CheckId]

export function Evidence({ snapshot, requiredChecks, run, runLabel, comparison, selectedRunRef, onSelectSnapshot }: {
  snapshot: Snapshot
  requiredChecks: readonly CheckId[]
  run: DrillRun | null
  runLabel: string
  comparison: ResolvedRunComparison | null
  selectedRunRef: RunRef
  onSelectSnapshot: (id: string, runRef: RunRef) => void
}) {
  const firstFailure = run?.firstFailure
  const showSnapshot = !run || selectedRunRef === 'prior' || snapshot.id !== run.finalSnapshot.id
  const outageObserved = run && firstFailure
    && run.snapshots.indexOf(firstFailure) <= run.snapshots.indexOf(snapshot)

  function renderResult(id: CheckId, phaseLabel: string, result: CheckResult, runRef: RunRef) {
    const { tone, text } = resultLabels[result.status]
    const responsible = id === 'label-printing' && result.status === 'unhealthy'
      && (phaseLabel === 'Rollback' || phaseLabel === 'Before' || phaseLabel === 'After')
    return (
      <div className="proof-result" role="group" aria-label={phaseLabel}>
        <div className="proof-status"><span>{phaseLabel}</span><strong className={tone}>{text}</strong></div>
        <p>{result.reason}</p>
        {'stepId' in result && (
          <button type="button" className="step-link" onClick={() => onSelectSnapshot(result.stepId, runRef)}
            aria-label={responsible ? undefined : `View ${phaseLabel} step for ${checkNames[id]}`}>
            {responsible ? 'Inspect responsible step' : 'View step'}
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
                {renderResult(id, snapshot.phase, snapshot.checks[id], selectedRunRef)}
              </article>
            ))}
          </section>
        )}
        {outageObserved && <p className="first-outage">First outage <strong>{firstFailure.phase} · {firstFailure.title}</strong></p>}
        {run && (
          <section className="proof-group" aria-label="Rollback proof">
            <h3 className="eyebrow">Rollback proof</h3>
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
          <section className="proof-group" aria-label="Run comparison">
            <h3 className="eyebrow">Run comparison</h3>
            <p className="comparison-verdict">
              Verdict{' '}
              <strong className={verdictTones[comparison.priorVerdict]}>{comparison.priorVerdict}</strong>
              {' \u2192 '}
              <strong className={verdictTones[comparison.currentVerdict]}>{comparison.currentVerdict}</strong>
            </p>
            {comparison.identical && <p className="comparison-identical">No modeled outcome changed between runs.</p>}
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
            {comparison.changedChecks.map(({ id, before, after }) => (
              <article className="proof-check" aria-label={checkNames[id]} key={id}>
                <h4>{checkNames[id]}</h4>
                {renderResult(id, 'Before', before, 'prior')}
                {renderResult(id, 'After', after, 'current')}
              </article>
            ))}
          </section>
        )}
      </div>
    </section>
  )
}
